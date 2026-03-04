import { DB, Materials, Chunks, SubSkills, SkillPrerequisites, Mastery } from './db.js';
import { callClaude, extractJSON } from './api.js';
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

// --- Store parsed file as chunked material ---
// Returns material metadata object with chunks array.
//
// Two paths:
//   1. v2 structured (EPUB, DOCX with _structured) → chunkDocument → Chunks.createBatch
//      Content is stored directly in chunks table. No _pendingDocs.
//   2. v1 fallback (TXT, PPTX, CSV, etc.) → simple chunk creation with _pendingDocs
//      Requires caller to flush via DB.saveDoc after saveCourses.

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
        status: 'skipped', // Not yet activated for extraction
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
        status: "skipped"
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
      status: "skipped"
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
      // v1 chunks may have JSON-wrapped content from DB.saveDoc — detect and unwrap.
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

    // v1 fallback: content stored separately via DB.saveDoc / DB.getDoc
    const allChunks = [];
    let fullText = "";
    for (const ch of mat.chunks) {
      const doc = await DB.getDoc(courseId, ch.id);
      const text = doc?.content || "";
      allChunks.push({ id: ch.id, label: ch.label, content: text, charCount: text.length, status: ch.status });
      fullText += text + "\n";
    }
    return { content: fullText.trim(), chunks: allChunks };
  }
  // Legacy: flat doc storage
  const doc = await DB.getDoc(courseId, mat.id);
  if (!doc) return { content: "", chunks: [] };
  if (doc.chapters) {
    const legacyChunks = doc.chapters.map((ch, i) => ({
      id: mat.id + "-legacy-" + i, label: ch.title || "Chapter " + (i + 1),
      content: ch.content, charCount: ch.content?.length || 0, status: "pending"
    }));
    return { content: doc.chapters.map(ch => ch.content).join("\n"), chunks: legacyChunks };
  }
  return { content: doc.content || "", chunks: [{ id: mat.id, label: mat.name, content: doc.content || "", charCount: (doc.content || "").length, status: "pending" }] };
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
  const parsed = extractJSON(result);
  if (parsed) return parsed;
  // API failed or returned unparseable response — don't falsely mark as verified
  return { status: "partial", summary: "Verification could not complete (API response was not parseable). Content may still be valid.", keyItems: [], issues: ["Automated verification failed"], questions: [] };
};

// --- Assignment Decomposition ---
export const decomposeAssignments = async (courseId, materialsMeta, skills, onStatus) => {
  let asgnContent = "";
  for (const mat of materialsMeta) {
    if (mat.classification !== "assignment") continue;
    const loaded = await getMatContent(courseId, mat);
    if (loaded.content) asgnContent += "\n--- ASSIGNMENT: " + mat.name + " ---\n" + loaded.content + "\n";
  }

  if (!asgnContent.trim()) {
    await DB.saveAsgn(courseId, []);
    return [];
  }

  onStatus("Decomposing assignments into skill requirements...");

  const skillList = Array.isArray(skills)
    ? skills.map(s => s.id + ": " + s.name).join("\n")
    : "Skills not yet structured";

  const asgnPrompt = "You are a curriculum analyst. Read the assignments below and break each question/task into the skills required to complete it.\n\nASSIGNMENTS:\n" + asgnContent + "\n\nAVAILABLE SKILLS:\n" + skillList + "\n\nRespond with ONLY a JSON array. Each assignment object:\n{\n  \"id\": \"asgn-1\",\n  \"title\": \"Assignment name\",\n  \"dueDate\": \"date if found, null otherwise\",\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"description\": \"Brief description of what the question asks\",\n      \"requiredSkills\": [\"skill-1\", \"skill-3\"],\n      \"difficulty\": \"foundational|intermediate|advanced\"\n    }\n  ]\n}\n\nRules:\n- Map each question to skills from AVAILABLE SKILLS using their IDs.\n- If a question requires a skill not in the list, use a descriptive name.\n- Difficulty reflects how deep the understanding needs to be.\n- Be thorough -- every question should have at least one required skill.";

  const result = await callClaude(asgnPrompt, [{ role: "user", content: "Decompose all assignments into skill requirements." }], 16384, true);
  const asgn = extractJSON(result);

  if (asgn && Array.isArray(asgn)) {
    await DB.saveAsgn(courseId, asgn);
    return asgn;
  }
  // Parse failed — return empty array instead of raw string
  await DB.saveAsgn(courseId, []);
  return [];
};

// ============================================================
// V2 Skill Loading & Extraction Integration
// ============================================================

import { extractCourse, enrichFromMaterial, reExtractCourse } from './extraction.js';

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
export const wasPreviouslyExtracted = async (materialId) => {
  const chunks = await Chunks.getByMaterial(materialId);
  return chunks.some(c => c.status === 'extracted');
};

/**
 * Run v2 extraction pipeline.
 * Determines which path: full extraction, enrichment, or re-extraction.
 *
 * - First v2 extraction for this course → extractCourse
 * - Same material re-uploaded/re-extracted → reExtractCourse (identity matching)
 * - Different material, existing skills → enrichFromMaterial
 */
export const runExtractionV2 = async (courseId, materialId, callbacks) => {
  const { onStatus, onNotif, onChapterComplete } = callbacks;

  try {
    const existingV2 = await SubSkills.getByCourse(courseId);
    const previouslyExtracted = await wasPreviouslyExtracted(materialId);

    let result;

    if (existingV2.length > 0 && previouslyExtracted) {
      // --- Re-extraction: same material, identity matching ---
      onStatus('Re-extracting with identity matching...');
      result = await reExtractCourse(courseId, materialId, {
        onProgress: onStatus,
        onChapterComplete: (chapter, count) => {
          onNotif('skill', `Chapter ${chapter}: ${count} skills re-extracted`);
          onChapterComplete?.(chapter, count);
        },
      });
      const totalSkills = (result.matched || 0) + (result.created || 0);
      if (result.unmatchedExisting?.length > 0) {
        onNotif('warn', `${result.unmatchedExisting.length} existing skill(s) not found in re-extraction. Review in Skills view.`);
      }
      onNotif('success', `Re-extraction: ${result.matched || 0} updated, ${result.created || 0} new.`);
      return { success: true, totalSkills, issues: result.issues || [], unmatchedExisting: result.unmatchedExisting };

    } else if (existingV2.length > 0) {
      // --- Enrichment: different material, existing skills ---
      onStatus('Enriching existing skills with new material...');
      result = await enrichFromMaterial(courseId, materialId, {
        onProgress: onStatus,
      });
      const totalSkills = result.totalSkills ?? ((result.enriched || 0) + (result.newSkills || 0));
      if (result.issues?.length > 0) {
        const errors = result.issues.filter(i => i.type.includes('fail') || i.type.includes('error'));
        for (const e of errors) {
          onNotif('error', `Extraction issue: ${e.type}${e.error ? ' - ' + e.error : ''}`);
        }
      }
      onNotif('success', `Enrichment: ${result.enriched || 0} enriched, ${result.newSkills || 0} new.`);
      return { success: true, totalSkills, issues: result.issues || [] };

    } else {
      // --- First extraction ---
      onStatus('Running full skill extraction...');
      result = await extractCourse(courseId, materialId, {
        onProgress: onStatus,
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
      return { success: result.totalSkills > 0, totalSkills: result.totalSkills, issues: result.issues || [] };
    }
  } catch (e) {
    console.error('V2 extraction failed:', e);
    onNotif('error', 'Extraction failed: ' + e.message);
    return { success: false, totalSkills: 0, issues: [{ type: 'exception', error: e.message }] };
  }
};
