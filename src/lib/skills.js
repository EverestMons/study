import { Materials, Chunks, SubSkills, SkillPrerequisites, Mastery, Assignments, ChunkFingerprints, Facets } from './db.js';
import { computeMinHash, findNearDuplicates } from './minhash.js';
import { callClaude, extractJSON, isApiError } from './api.js';
import { chunkDocument } from './chunker.js';

// --- Character budget per chunk (~25k tokens ~ 100k chars) ---
export const CHUNK_CHAR_LIMIT = 40000; // ~10k tokens, safe for rate limits

// --- Split text into chunks at paragraph boundaries ---
export const splitTextChunks = (text, limit) => {
  const pieces = [];
  var remaining = text;
  while (remaining.length > limit) {
    var cutRegion = remaining.substring(0, limit);
    var breakIdx = cutRegion.lastIndexOf("\n\n");
    if (breakIdx < limit * 0.5) breakIdx = cutRegion.lastIndexOf("\n");
    if (breakIdx < limit * 0.5) {
      var sentenceMatch = cutRegion.match(/.*[.!?]\s/s);
      breakIdx = sentenceMatch ? sentenceMatch[0].length : -1;
    }
    if (breakIdx < limit * 0.3) breakIdx = limit;
    pieces.push(remaining.substring(0, breakIdx).trimEnd());
    remaining = remaining.substring(breakIdx).trimStart();
  }
  if (remaining.length > 0) pieces.push(remaining);
  return pieces;
};

// --- Compute and store MinHash fingerprints for near-dedup ---
// Two calling conventions:
//   computeAndStoreFingerprints(materialId)         — loads content from DB
//   computeAndStoreFingerprints(materialId, chunks)  — uses provided [{id, content}]
export const computeAndStoreFingerprints = async (materialId, chunks) => {
  // If no chunks provided, load from DB (V1 path — content already flushed)
  if (!chunks) {
    chunks = await Chunks.getByMaterial(materialId);
  }
  const items = [];
  for (const ch of chunks) {
    const content = ch.content || '';
    if (!content) continue;
    const result = computeMinHash(content);
    if (!result) continue; // too short or empty
    items.push({ chunkId: ch.id, minhashSig: result.signature, shingleCount: result.shingleCount });
  }
  if (items.length > 0) {
    await ChunkFingerprints.createBatch(items);
  }
  return items.length;
};

// --- Store parsed file as chunked material ---
// Returns material metadata object with chunks array.
//
// Two paths:
//   1. v2 structured (EPUB, DOCX with _structured) → chunkDocument → Chunks.createBatch
//      Content is stored directly in chunks table. No _pendingDocs.
//   2. v1 fallback (TXT, PPTX, CSV, etc.) → simple chunk creation with _pendingDocs
//      Requires caller to flush via Chunks.updateContent after saveCoursesNested.

export const storeAsChunks = async (courseId, file, docIdPrefix) => {
  // --- V2 path: file has structured parser output ---
  if (file._structured) {
    // Create material record in v2 table
    const matId = await Materials.create({
      courseId,
      label: file.name,
      classification: file.classification || null,
      fileType: file.type || file._structured.source_format || null,
      originalFilename: file.name,
    });

    // Run v2 chunker on structured output
    const chunks = await chunkDocument(file._structured, {
      materialId: matId,
      courseId,
      classification: file.classification || 'other',
    });

    // Batch insert to v2 chunks table (content included — no _pendingDocs needed)
    const chunkIds = await Chunks.createBatch(chunks);

    // Compute and store MinHash fingerprints for near-dedup detection
    const fpChunks = chunks.map((ch, i) => ({ id: chunkIds[i], content: ch.content }));
    try { await computeAndStoreFingerprints(matId, fpChunks); } catch (e) { console.warn('[MinHash] Fingerprint storage failed:', e); }

    // Build v1-compat metadata shape for App.jsx
    const mat = {
      id: matId,
      name: file.name,
      classification: file.classification,
      type: file.type || file._structured.source_format,
      chunks: chunks.map((ch, i) => ({
        id: chunkIds[i],
        label: ch.label,
        charCount: ch.charCount,
        status: 'pending', // Auto-queued for extraction
      })),
    };
    mat.totalChars = mat.chunks.reduce((s, c) => s + c.charCount, 0);
    return mat;
  }

  // --- V1 fallback path: plain text, images, etc. ---
  const mat = {
    id: docIdPrefix,
    name: file.name,
    classification: file.classification,
    type: file.type,
    chunks: []
  };
  mat._pendingDocs = [];

  if (file.classification === "textbook" && file.chapters) {
    for (let i = 0; i < file.chapters.length; i++) {
      const ch = file.chapters[i];
      const chunkId = docIdPrefix + "-ch-" + i;
      const content = ch.content || "";
      mat._pendingDocs.push({ chunkId, doc: { content: content } });
      mat.chunks.push({
        id: chunkId,
        label: ch.title || "Chapter " + (i + 1),
        charCount: content.length,
        status: "pending"
      });
    }
    mat.totalChars = file.totalChars || mat.chunks.reduce((s, c) => s + c.charCount, 0);
  } else if (file.content) {
    const chunkId = docIdPrefix + "-c0";
    mat._pendingDocs.push({ chunkId, doc: { content: file.content } });
    mat.chunks.push({
      id: chunkId,
      label: file.name,
      charCount: file.content.length,
      status: "pending"
    });
    mat.charCount = file.content.length;
  }
  return mat;
};

// --- Load all chunk content for a material ---
// Returns { content, chunks } where content is the full text and chunks is array of {id, label, content}
export const getMatContent = async (courseId, mat) => {
  if (mat.chunks && mat.chunks.length > 0) {
    // Try v2 path first: read directly from chunks table
    const dbChunks = await Chunks.getByMaterial(mat.id);
    if (dbChunks.length > 0 && dbChunks[0].content) {
      // v2 chunks have content stored inline.
      // v1 chunks may have JSON-wrapped content — detect and unwrap.
      const allChunks = dbChunks.map(ch => {
        let text = ch.content || '';
        // Unwrap v1 JSON-encoded content: {"content":"..."}
        if (text.startsWith('{')) {
          try { const parsed = JSON.parse(text); if (parsed.content) text = parsed.content; } catch { /* ignored */ }
        }
        return {
          id: ch.id,
          label: ch.label,
          content: text,
          charCount: ch.char_count || text.length,
          status: ch.status || 'pending',
        };
      });
      const fullText = allChunks.map(ch => ch.content).join('\n').trim();
      return { content: fullText, chunks: allChunks };
    }

    // v1 fallback: content stored separately via Chunks.updateContent
    const allChunks = [];
    let fullText = "";
    for (const ch of mat.chunks) {
      const raw = await Chunks.getContent(ch.id);
      let text = raw || '';
      if (text.startsWith('{')) {
        try { const parsed = JSON.parse(text); if (parsed.content) text = parsed.content; } catch { /* ignored */ }
      }
      allChunks.push({ id: ch.id, label: ch.label, content: text, charCount: text.length, status: ch.status });
      fullText += text + "\n";
    }
    return { content: fullText.trim(), chunks: allChunks };
  }
  // Legacy: flat doc storage
  const raw = await Chunks.getContent(mat.id);
  if (!raw) return { content: "", chunks: [] };
  let doc;
  try { doc = JSON.parse(raw); } catch { return { content: raw, chunks: [{ id: mat.id, label: mat.name, content: raw, charCount: raw.length, status: "pending" }] }; }
  if (doc.chapters) {
    const legacyChunks = doc.chapters.map((ch, i) => ({
      id: mat.id + "-legacy-" + i, label: ch.title || "Chapter " + (i + 1),
      content: ch.content, charCount: ch.content?.length || 0, status: "pending"
    }));
    return { content: doc.chapters.map(ch => ch.content).join("\n"), chunks: legacyChunks };
  }
  return { content: doc.content || raw, chunks: [{ id: mat.id, label: mat.name, content: doc.content || raw, charCount: (doc.content || raw).length, status: "pending" }] };
};

// --- Document Verification ---
export const verifyDocument = async (courseId, mat) => {
  const loaded = await getMatContent(courseId, mat);
  if (!loaded.content && !loaded.chunks.length) return {
    status: "error",
    summary: "Document \"" + mat.name + "\" not found in storage. Try removing and re-uploading.",
    keyItems: [], issues: ["Document not in storage"], questions: []
  };

  if (loaded.content.length < 10) return {
    status: "error",
    summary: "\"" + mat.name + "\" appears empty (" + loaded.content.length + " characters).",
    keyItems: [], issues: ["No meaningful content"], questions: []
  };

  // eslint-disable-next-line no-control-regex
  var garbledRatio = (loaded.content.match(/[\x00-\x08\x0E-\x1F\uFFFD]/g) || []).length / Math.max(loaded.content.length, 1);
  if (garbledRatio > 0.05) return {
    status: "error",
    summary: "\"" + mat.name + "\" contains garbled/binary content. Please re-upload as .txt, .docx, or .epub.",
    keyItems: [], issues: ["Binary/garbled content"], questions: []
  };

  let contentPreview = "";
  if (loaded.chunks.length > 1) {
    contentPreview = mat.classification.toUpperCase() + ": " + mat.name + " (" + loaded.chunks.length + " chunks)\n\n";
    for (const ch of loaded.chunks) {
      contentPreview += "--- " + ch.label + " (" + ch.charCount.toLocaleString() + " chars) ---\n" + ch.content.substring(0, 300) + "...\n\n";
    }
  } else {
    contentPreview = mat.classification.toUpperCase() + ": " + mat.name + "\nContent length: " + loaded.content.length.toLocaleString() + " characters\n\n" + loaded.content.substring(0, 8000);
    if (loaded.content.length > 8000) contentPreview += "\n\n[... truncated, " + (loaded.content.length - 8000).toLocaleString() + " more characters ...]";
  }

  const verifyPrompt = "You are verifying a document uploaded by a student. Read it carefully and produce a verification report.\n\nDOCUMENT:\n" + contentPreview + "\n\nIMPORTANT CONTEXT:\n- Spreadsheet files (.xlsx, .csv) will appear as tab-separated values. This is normal and expected -- not garbled.\n- Subtitle files (.srt, .vtt) will appear as plain text with timestamps stripped. This is normal.\n- Documents with dates as numbers like 46035 have already been converted where possible.\n- Focus on whether the ACADEMIC CONTENT is present and readable, not formatting aesthetics.\n\nRespond with ONLY a JSON object:\n{\n  \"status\": \"verified\" or \"partial\" or \"error\",\n  \"summary\": \"2-3 sentence summary -- be specific about topics, dates, names, structure\",\n  \"keyItems\": [\"key items: assignments, dates, topics, terms\"],\n  \"issues\": [\"actual problems: missing content, unreadable sections, binary garbage\"],\n  \"questions\": [\"clarifying questions about genuinely ambiguous content\"]\n}\n\nRules:\n- verified = content is present and readable enough to teach from\n- partial = most content readable but some sections genuinely missing or corrupted\n- error = content is fundamentally unreadable or empty\n- Tab-separated data from spreadsheets is NOT an issue\n- Be specific in the summary\n- Don't flag formatting differences as issues";

  const result = await callClaude(verifyPrompt, [{ role: "user", content: "Verify this document extraction." }], 8192, true);
  if (isApiError(result)) {
    console.warn("[verifyDocumentExtraction] API error:", result);
  }
  const parsed = extractJSON(result);
  if (parsed) return parsed;
  // API failed or returned unparseable response — don't falsely mark as verified
  return { status: "partial", summary: "Verification could not complete (API response was not parseable). Content may still be valid.", keyItems: [], issues: ["Automated verification failed"], questions: [] };
};

// --- Due Date Scanner ---
function scanForDueDate(text) {
  if (!text) return null;
  const patterns = [
    /(?:due|deadline|submit(?:ted)?\s*(?:by|before))[:\s]+(\w+\s+\d{1,2},?\s*\d{4})/i,
    /(?:due|deadline|submit(?:ted)?\s*(?:by|before))[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    }
  }
  return null;
}

// --- Assignment Decomposition ---
export const decomposeAssignments = async (courseId, materialsMeta, skills, onStatus) => {
  let asgnContent = "";
  const scannedDueDates = {};
  for (const mat of materialsMeta) {
    if (mat.classification !== "assignment") continue;
    const loaded = await getMatContent(courseId, mat);
    if (loaded.content) {
      asgnContent += "\n--- ASSIGNMENT: " + mat.name + " ---\n" + loaded.content + "\n";
      const dd = scanForDueDate(loaded.content);
      if (dd) scannedDueDates[mat.name.toLowerCase()] = dd;
    }
  }

  if (!asgnContent.trim()) return [];

  onStatus("Decomposing assignments into skill requirements...");

  // Load facets for this course — if available, use facet-level mapping
  let courseFacets = [];
  try { courseFacets = await Facets.getByCourse(courseId); } catch { /* table may not exist */ }

  const useFacets = courseFacets.length > 0;
  let referenceList;
  let asgnPrompt;

  if (useFacets) {
    // Build a skill name lookup for context in the facet list
    const skillNameMap = {};
    if (Array.isArray(skills)) for (const s of skills) skillNameMap[s.id] = s.name;

    referenceList = courseFacets.map(f => {
      const parentName = skillNameMap[f.skill_id] || "";
      return (f.concept_key || String(f.id)) + ": " + f.name + (parentName ? " [under: " + parentName + "]" : "");
    }).join("\n");

    asgnPrompt = "You are a curriculum analyst. Read the assignments below and break each question/task into the specific knowledge facets required to complete it.\n\nASSIGNMENTS:\n" + asgnContent + "\n\nAVAILABLE FACETS (atomic learning units):\n" + referenceList + "\n\nRespond with ONLY a JSON array. Each assignment object:\n{\n  \"id\": \"asgn-1\",\n  \"title\": \"Assignment name\",\n  \"dueDate\": \"date if found, null otherwise\",\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"description\": \"Brief description of what the question asks\",\n      \"requiredFacets\": [\"<exact ID from AVAILABLE FACETS list>\"],\n      \"difficulty\": \"foundational|intermediate|advanced\"\n    }\n  ]\n}\n\nRules:\n- Map each question to facets from AVAILABLE FACETS using their EXACT IDs as shown above (the part before the colon).\n- Do NOT invent new IDs. Use only the IDs from the AVAILABLE FACETS list.\n- If a question requires knowledge not covered by any available facet, omit it from requiredFacets rather than inventing a new ID.\n- Prefer fine-grained facet mapping: if a question involves 3 distinct concepts, list all 3 facet IDs.\n- Difficulty reflects how deep the understanding needs to be.\n- Be thorough -- every question should have at least one required facet.";
  } else {
    referenceList = Array.isArray(skills)
      ? skills.map(s => (s.conceptKey || s.id) + ": " + s.name).join("\n")
      : "Skills not yet structured";

    asgnPrompt = "You are a curriculum analyst. Read the assignments below and break each question/task into the skills required to complete it.\n\nASSIGNMENTS:\n" + asgnContent + "\n\nAVAILABLE SKILLS:\n" + referenceList + "\n\nRespond with ONLY a JSON array. Each assignment object:\n{\n  \"id\": \"asgn-1\",\n  \"title\": \"Assignment name\",\n  \"dueDate\": \"date if found, null otherwise\",\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"description\": \"Brief description of what the question asks\",\n      \"requiredSkills\": [\"<exact ID from AVAILABLE SKILLS list>\"],\n      \"difficulty\": \"foundational|intermediate|advanced\"\n    }\n  ]\n}\n\nRules:\n- Map each question to skills from AVAILABLE SKILLS using their EXACT IDs as shown above (the part before the colon).\n- Do NOT invent new IDs like skill-1 or skill-2. Use only the IDs from the AVAILABLE SKILLS list.\n- If a question requires knowledge not covered by any available skill, omit it from requiredSkills rather than inventing a new ID.\n- Difficulty reflects how deep the understanding needs to be.\n- Be thorough -- every question should have at least one required skill.";
  }

  const result = await callClaude(asgnPrompt, [{ role: "user", content: useFacets ? "Decompose all assignments into facet requirements." : "Decompose all assignments into skill requirements." }], 16384, true);
  if (isApiError(result)) {
    console.warn("[decomposeAssignments] API error:", result);
    return;
  }
  const asgn = extractJSON(result);

  if (asgn && Array.isArray(asgn)) {
    for (const a of asgn) {
      // Resolve due date: LLM response > scanned from raw text
      let dueDate = null;
      if (a.dueDate) {
        const d = new Date(a.dueDate);
        if (!isNaN(d.getTime())) dueDate = Math.floor(d.getTime() / 1000);
      }
      if (!dueDate) {
        const titleLower = (a.title || '').toLowerCase();
        for (const [matName, dd] of Object.entries(scannedDueDates)) {
          if (matName.includes(titleLower) || titleLower.includes(matName.substring(0, 15))) {
            dueDate = dd;
            break;
          }
        }
      }

      // Link to syllabus placeholder if one matches
      let assignmentId;
      try {
        const match = await Assignments.findPlaceholderMatch(courseId, a.title);
        if (match?.match) {
          assignmentId = match.match.id;
          if (dueDate) await Assignments.updateDueDate(assignmentId, dueDate);
        }
      } catch { /* placeholder matching is best-effort */ }

      if (!assignmentId) {
        assignmentId = await Assignments.create({
          courseId,
          title: a.title || 'Untitled Assignment',
          dueDate,
          source: 'decomposition',
        });
      }

      if (Array.isArray(a.questions) && a.questions.length > 0) {
        // Normalize: LLM may return requiredFacets or requiredSkills depending on prompt mode
        const normalizedQs = a.questions.map(q => ({
          ...q,
          requiredFacets: q.requiredFacets || null,
          requiredSkills: q.requiredSkills || null,
        }));
        await Assignments.saveQuestions(assignmentId, courseId, normalizedQs, { useFacets, courseFacets });
      }
    }
    return asgn;
  }
  return [];
};

// ============================================================
// V2 Skill Loading & Extraction Integration
// ============================================================

import { extractCourse, enrichFromMaterial, extractChaptersOnly, groupChunksByChapter } from './extraction.js';

/**
 * Load skills from v2 tables with resolved prerequisites and mastery.
 * Returns array matching the shape the UI expects.
 *
 * @param {string} courseId
 * @returns {Promise<Array>} Enriched skill objects
 */
export const loadSkillsV2 = async (courseId) => {
  const skills = await SubSkills.getByCourse(courseId);
  if (!skills.length) return [];

  // Batch load prerequisites
  const prereqMap = new Map();
  for (const s of skills) {
    const prereqs = await SkillPrerequisites.getForSkill(s.id);
    prereqMap.set(s.id, prereqs);
  }

  // Batch load mastery
  const masteryRows = await Mastery.getBySkills(skills.map(s => s.id));
  const masteryMap = new Map(masteryRows.map(m => [m.sub_skill_id, m]));

  // Transform to UI shape
  return skills.map(s => {
    const prereqs = prereqMap.get(s.id) || [];
    const mastery = masteryMap.get(s.id);
    const criteria = typeof s.mastery_criteria === 'string'
      ? JSON.parse(s.mastery_criteria || '[]') : (s.mastery_criteria || []);
    const evidence = typeof s.evidence === 'string'
      ? JSON.parse(s.evidence || '{}') : (s.evidence || {});
    const fitness = typeof s.fitness === 'string'
      ? JSON.parse(s.fitness || '{}') : (s.fitness || {});

    return {
      // Identity
      id: s.id,
      conceptKey: s.concept_key,
      uuid: s.uuid,
      name: s.name,
      description: s.description,

      // Classification
      category: s.category,
      skillType: s.skill_type,
      bloomsLevel: s.blooms_level,

      // Rich content
      masteryCriteria: criteria,
      evidence,
      fitness,

      // Graph
      prerequisites: prereqs.map(p => ({
        id: p.prerequisite_id,
        name: p.name,
        conceptKey: p.concept_key,
        source: p.source,
      })),

      // Mastery (FSRS)
      mastery: mastery ? {
        difficulty: mastery.difficulty,
        stability: mastery.stability,
        retrievability: mastery.retrievability,
        reps: mastery.reps,
        lapses: mastery.lapses,
        lastReviewAt: mastery.last_review_at,
        nextReviewAt: mastery.next_review_at,
        totalMasteryPoints: mastery.total_mastery_points,
        lastRating: mastery.last_rating || null,
      } : null,

      // Metadata
      extractionModel: s.extraction_model,
      schemaVersion: s.schema_version,
      createdAt: s.created_at,
      parentSkillId: s.parent_skill_id,

      // V1 compat fields (for code that still expects them)
      sources: (evidence.anchorTerms || []).slice(0, 3),
    };
  });
};

/**
 * Run v2 extraction pipeline.
 * Two paths:
 * - No existing skills for this course → extractCourse (full extraction)
 * - Existing skills for this course → enrichFromMaterial (merge by concept key)
 */
/**
 * Determine which chapters are already fully processed (all chunks extracted or failed).
 * Used to build skipChapters set for first-extraction retry.
 */
function getAlreadyExtractedChapters(chunks) {
  const groups = groupChunksByChapter(chunks);
  const skip = new Set();
  for (const g of groups) {
    if (g.chunks.every(c => c.status === 'extracted' || c.status === 'failed')) {
      skip.add(g.chapter);
    }
  }
  return skip;
}

export const runExtractionV2 = async (courseId, materialId, callbacks, { skipNearDedupCheck = false } = {}) => {
  const { onStatus, onNotif, onChapterComplete } = callbacks;

  try {
    // --- Content dedup: skip if this material's chunks are already extracted ---
    const newChunks = await Chunks.getByMaterial(materialId);
    if (newChunks.length > 0) {
      const hashChecks = await Promise.all(
        newChunks
          .filter(c => c.content_hash)
          .map(c => Chunks.findByHash(c.content_hash))
      );
      // For each hash, check if it already exists in a DIFFERENT material for this course
      const allDuplicates = hashChecks.every(matches =>
        matches.some(m => m.course_id === courseId && m.material_id !== materialId)
      );
      if (allDuplicates && hashChecks.length > 0) {
        onNotif('warn', 'Material Already Active \u2014 this content has already been extracted for this course.');
        return { success: true, totalSkills: 0, skipped: true, issues: [] };
      }
    }

    // --- Near-dedup check (MinHash) ---
    if (!skipNearDedupCheck) {
      try {
        const newFingerprints = await ChunkFingerprints.getByMaterial(materialId);
        if (newFingerprints.length > 0) {
          const courseFingerprints = await ChunkFingerprints.getByCourse(courseId);
          const existingFps = courseFingerprints.filter(fp =>
            !newFingerprints.some(nf => nf.chunk_id === fp.chunk_id)
          );

          if (existingFps.length > 0) {
            const dupMatches = findNearDuplicates(newFingerprints, existingFps, 0.7);
            const dupChunkIds = new Set(dupMatches.map(m => m.newChunkId));

            if (dupChunkIds.size === newFingerprints.length) {
              // Resolve existing chunk IDs → material names for UI
              const existingChunkIds = [...new Set(dupMatches.map(m => m.existingChunkId))];
              const chunkToMat = {};
              for (const cid of existingChunkIds) {
                const ch = await Chunks.getById(cid);
                if (ch) chunkToMat[cid] = ch.material_id;
              }
              const matIds = [...new Set(Object.values(chunkToMat))];
              const matNames = {};
              for (const mid of matIds) {
                const mat = await Materials.getById(mid);
                if (mat) matNames[mid] = mat.label || mat.name || mid;
              }

              // Group matches by existing material
              const byMat = {};
              for (const m of dupMatches) {
                const mid = chunkToMat[m.existingChunkId] || 'unknown';
                if (!byMat[mid]) byMat[mid] = { sims: [], chunks: new Set() };
                byMat[mid].sims.push(m.similarity);
                byMat[mid].chunks.add(m.newChunkId);
              }

              const dupSummary = {
                materials: Object.entries(byMat).map(([mid, data]) => ({
                  materialId: mid,
                  materialName: matNames[mid] || 'Unknown material',
                  matchingChunks: data.chunks.size,
                  totalNewChunks: newFingerprints.length,
                  avgSimilarity: Math.round((data.sims.reduce((a, b) => a + b, 0) / data.sims.length) * 100),
                })),
                totalMatching: dupChunkIds.size,
                totalNew: newFingerprints.length,
              };

              return {
                success: false,
                totalSkills: 0,
                needsUserDecision: true,
                nearDuplicates: dupMatches,
                dupSummary,
                issues: [],
              };
            }
          }
        }
      } catch (e) {
        console.warn('[MinHash] Near-dedup check failed, proceeding with extraction:', e);
      }
    }

    // Filter to only unfinished chunks
    const unfinishedChunks = newChunks.filter(c => c.status === 'pending' || c.status === 'error');

    if (unfinishedChunks.length === 0) {
      onNotif('info', 'All sections already processed.');
      return { success: true, totalSkills: 0, skipped: true, issues: [] };
    }

    const existingV2 = await SubSkills.getByCourse(courseId);

    let result;

    if (existingV2.length > 0) {
      // --- Course has skills: chapter-level extraction on ONLY unfinished chunks ---
      // Uses identity matching against existing skills (merge by conceptKey).
      onStatus('Retrying unfinished sections...');
      const chapterGroups = groupChunksByChapter(unfinishedChunks);
      result = await extractChaptersOnly(courseId, materialId, chapterGroups, existingV2, {
        onProgress: onStatus,
        onChapterComplete: (chapter, count) => {
          onNotif('skill', `Chapter ${chapter}: ${count} skills`);
          onChapterComplete?.(chapter, count);
        },
      });
      if (result.issues?.length > 0) {
        const errors = result.issues.filter(i => i.type.includes('fail') || i.type.includes('error'));
        for (const e of errors) {
          onNotif('error', `Extraction issue: ${e.type}${e.error ? ' - ' + e.error : ''}`);
        }
      }
      if (result.totalSkills > 0) {
        onNotif('success', `Retry: ${result.totalSkills} skills from ${result.chapters?.length || 0} chapters.`);
      } else {
        onNotif('warn', 'Retry completed but no new skills extracted.');
      }
      // --- Concept link generation (non-blocking) ---
      if (result.createdSkillIds?.length > 0) {
        try {
          const { generateConceptLinks, generateFacetConceptLinks } = await import('./conceptLinks.js');
          const clResult = await generateConceptLinks(courseId, result.createdSkillIds);
          if (clResult.linksCreated > 0) console.log(`[ConceptLinks] ${clResult.linksCreated} skill links created`);
          if (result.createdFacetIds?.length > 0) {
            const { preMergeDuplicateFacets, rankBindingsForFacets } = await import('./extraction.js');
            const mergeResult = await preMergeDuplicateFacets(result.createdFacetIds);
            if (mergeResult.merged > 0) console.log(`[PreMerge] ${mergeResult.merged} duplicate facets merged`);
            const rankResult = await rankBindingsForFacets(result.createdFacetIds);
            if (rankResult.totalRanked > 0) console.log(`[QualityRank] ${rankResult.totalRanked} bindings ranked across ${rankResult.facetsProcessed} facets`);
            const fclResult = await generateFacetConceptLinks(courseId, result.createdFacetIds);
            if (fclResult.linksCreated > 0) console.log(`[FacetConceptLinks] ${fclResult.linksCreated} facet links created`);
          }
        } catch (e) { console.warn('[ConceptLinks] Generation failed (non-critical):', e); }
      }
      return { success: result.totalSkills > 0, totalSkills: result.totalSkills, issues: result.issues || [] };

    } else {
      // --- First extraction for this course (or retry with no existing skills) ---
      onStatus('Running full skill extraction...');
      const skipChapters = getAlreadyExtractedChapters(newChunks);
      result = await extractCourse(courseId, materialId, {
        onProgress: onStatus,
        skipChapters,
        onChapterComplete: (chapter, count) => {
          onNotif('skill', `Chapter ${chapter}: ${count} skills extracted`);
          onChapterComplete?.(chapter, count);
        },
      });
      if (result.issues?.length > 0) {
        const errors = result.issues.filter(i => i.type.includes('fail') || i.type.includes('error'));
        for (const e of errors) {
          onNotif('error', `Extraction issue: ${e.type}${e.error ? ' - ' + e.error : ''}`);
        }
      }
      if (result.totalSkills > 0) {
        onNotif('success', `Extracted ${result.totalSkills} skills from ${result.chapters?.length || 0} chapters.`);
      } else {
        onNotif('error', 'No skills extracted. Check material content and try again.');
      }
      // --- Concept link generation (non-blocking) ---
      if (result.createdSkillIds?.length > 0) {
        try {
          const { generateConceptLinks, generateFacetConceptLinks } = await import('./conceptLinks.js');
          const clResult = await generateConceptLinks(courseId, result.createdSkillIds);
          if (clResult.linksCreated > 0) console.log(`[ConceptLinks] ${clResult.linksCreated} skill links created`);
          if (result.createdFacetIds?.length > 0) {
            const { preMergeDuplicateFacets, rankBindingsForFacets } = await import('./extraction.js');
            const mergeResult = await preMergeDuplicateFacets(result.createdFacetIds);
            if (mergeResult.merged > 0) console.log(`[PreMerge] ${mergeResult.merged} duplicate facets merged`);
            const rankResult = await rankBindingsForFacets(result.createdFacetIds);
            if (rankResult.totalRanked > 0) console.log(`[QualityRank] ${rankResult.totalRanked} bindings ranked across ${rankResult.facetsProcessed} facets`);
            const fclResult = await generateFacetConceptLinks(courseId, result.createdFacetIds);
            if (fclResult.linksCreated > 0) console.log(`[FacetConceptLinks] ${fclResult.linksCreated} facet links created`);
          }
        } catch (e) { console.warn('[ConceptLinks] Generation failed (non-critical):', e); }
      }
      return { success: result.totalSkills > 0, totalSkills: result.totalSkills, issues: result.issues || [] };
    }
  } catch (e) {
    console.error('V2 extraction failed:', e);
    onNotif('error', 'Extraction failed: ' + e.message);
    return { success: false, totalSkills: 0, issues: [{ type: 'exception', error: e.message }] };
  }
};
