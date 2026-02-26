import { DB } from './db.js';
import { callClaude, extractJSON } from './api.js';

// --- Character budget per chunk (~25k tokens ~ 100k chars) ---
export const CHUNK_CHAR_LIMIT = 40000; // ~10k tokens, safe for rate limits

// --- Split text into chunks at paragraph boundaries ---
export const splitTextChunks = (text, limit) => {
  const pieces = [];
  var remaining = text;
  while (remaining.length > limit) {
    // Find the last double-newline (paragraph break) before the limit
    var cutRegion = remaining.substring(0, limit);
    var breakIdx = cutRegion.lastIndexOf("\n\n");
    // Fallback: single newline
    if (breakIdx < limit * 0.5) breakIdx = cutRegion.lastIndexOf("\n");
    // Fallback: last sentence boundary (. or ? or !)
    if (breakIdx < limit * 0.5) {
      var sentenceMatch = cutRegion.match(/.*[.!?]\s/s);
      breakIdx = sentenceMatch ? sentenceMatch[0].length : -1;
    }
    // Last resort: hard cut at limit
    if (breakIdx < limit * 0.3) breakIdx = limit;
    pieces.push(remaining.substring(0, breakIdx).trimEnd());
    remaining = remaining.substring(breakIdx).trimStart();
  }
  if (remaining.length > 0) pieces.push(remaining);
  return pieces;
};

// --- Store parsed file as chunked material ---
// Returns material metadata object with chunks array
export const storeAsChunks = async (courseId, file, docIdPrefix) => {
  const mat = {
    id: docIdPrefix,
    name: file.name,
    classification: file.classification,
    type: file.type,
    chunks: []
  };

  if (file.classification === "textbook" && file.chapters) {
    // Each chapter = one chunk. Never split a chapter.
    for (let i = 0; i < file.chapters.length; i++) {
      var ch = file.chapters[i];
      var chunkId = docIdPrefix + "-ch-" + i;
      var content = ch.content || "";
      var saved = await DB.saveDoc(courseId, chunkId, { content: content });
      mat.chunks.push({
        id: chunkId,
        label: ch.title || "Chapter " + (i + 1),
        charCount: content.length,
        status: saved ? "skipped" : "failed"  // Inactive by default
      });
      if (!saved) console.error("storeAsChunks: failed to save chunk", chunkId);
    }
    mat.totalChars = file.totalChars || mat.chunks.reduce((s, c) => s + c.charCount, 0);
  } else if (file.content) {
    // Non-textbook: always one chunk per file
    var chunkId = docIdPrefix + "-c0";
    var saved = await DB.saveDoc(courseId, chunkId, { content: file.content });
    mat.chunks.push({
      id: chunkId,
      label: file.name,
      charCount: file.content.length,
      status: saved ? "skipped" : "failed"  // Inactive by default
    });
    if (!saved) console.error("storeAsChunks: failed to save chunk", chunkId);
    mat.charCount = file.content.length;
  }
  return mat;
};

// --- Load all chunk content for a material ---
// Returns { content, chunks } where content is the full text and chunks is array of {id, label, content}
export const getMatContent = async (courseId, mat) => {
  if (mat.chunks && mat.chunks.length > 0) {
    var allChunks = [];
    var fullText = "";
    for (const ch of mat.chunks) {
      var doc = await DB.getDoc(courseId, ch.id);
      var text = doc?.content || "";
      allChunks.push({ id: ch.id, label: ch.label, content: text, charCount: text.length, status: ch.status });
      fullText += text + "\n";
    }
    return { content: fullText.trim(), chunks: allChunks };
  }
  // Legacy: flat doc storage
  var doc = await DB.getDoc(courseId, mat.id);
  if (!doc) return { content: "", chunks: [] };
  if (doc.chapters) {
    var allChunks = doc.chapters.map((ch, i) => ({
      id: mat.id + "-legacy-" + i, label: ch.title || "Chapter " + (i + 1),
      content: ch.content, charCount: ch.content?.length || 0, status: "pending"
    }));
    return { content: doc.chapters.map(ch => ch.content).join("\n"), chunks: allChunks };
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
  const verification = parsed || { status: "verified", summary: result.substring(0, 300), keyItems: [], issues: [], questions: [] };
  return verification;
};

// --- Reference Taxonomy Generation ---
// Generates a canonical skill taxonomy for the course subject, grounded in syllabus if available.
// Returns { subject, level, taxonomy: [...], confidence, syllabusUsed }
export const generateReferenceTaxonomy = async (courseId, courseName, materialsMeta, onStatus) => {
  onStatus("Building reference taxonomy...");

  // 1. Check for syllabus among materials
  var syllabusContent = "";
  var syllabusMat = materialsMeta.find(m => m.classification === "syllabus");
  if (syllabusMat) {
    var loaded = await getMatContent(courseId, syllabusMat);
    syllabusContent = loaded.content || "";
    // Cap syllabus at 50k chars -- syllabi are short, but be safe
    if (syllabusContent.length > 50000) syllabusContent = syllabusContent.substring(0, 50000);
  }

  // 2. Gather material structure overview (titles/chapters, not full content)
  var materialOutline = "";
  for (const mat of materialsMeta) {
    if (mat.classification === "syllabus") continue; // already captured
    materialOutline += "\n- " + mat.name + " (" + mat.classification + ")";
    if (mat.chunks && mat.chunks.length > 1) {
      for (const ch of mat.chunks) {
        materialOutline += "\n    - " + ch.label + " (" + (ch.charCount || 0).toLocaleString() + " chars)";
      }
    }
  }

  // 3. Build prompt
  var prompt;
  if (syllabusContent) {
    onStatus("Analyzing syllabus for reference taxonomy...");
    prompt = "You are an expert curriculum designer. A student has uploaded materials for a course. I need you to build a REFERENCE TAXONOMY -- the canonical set of skills, topics, and prerequisite relationships for this course.\n\nCOURSE NAME: " + courseName + "\n\nSYLLABUS:\n" + syllabusContent + "\n\nOTHER MATERIALS UPLOADED:\n" + materialOutline + "\n\nYour job:\n1. IDENTIFY the academic subject, level (intro/intermediate/advanced), and any specific focus areas from the syllabus.\n2. Extract the TOPIC SEQUENCE from the syllabus -- what is taught in what order.\n3. Generate a REFERENCE SKILL TAXONOMY: the standard set of skills a student should master in this course, based on the syllabus structure and your knowledge of how this subject is canonically taught.\n4. Wire PREREQUISITE RELATIONSHIPS between skills based on standard pedagogical order for this subject. Use your knowledge of the discipline -- don't just follow the syllabus week order blindly if the standard prerequisite chain differs.\n5. Flag any topics in the syllabus that are UNUSUAL for this level (taught in a non-standard order, or not typically part of this course).\n6. Rate your CONFIDENCE (0-100) in this taxonomy. High confidence = well-known subject with clear standard curriculum. Low confidence = interdisciplinary, niche, or non-standard course.\n\nRespond with ONLY a JSON object:\n{\n  \"subject\": \"e.g. Organic Chemistry\",\n  \"level\": \"intro|intermediate|advanced\",\n  \"focus\": \"any specific focus areas or specialization\",\n  \"confidence\": 85,\n  \"flags\": [\"any unusual topics or ordering noted\"],\n  \"taxonomy\": [\n    {\n      \"refId\": \"ref-1\",\n      \"name\": \"Skill/topic name\",\n      \"description\": \"What mastery of this skill means\",\n      \"prerequisites\": [\"ref-id\", ...],\n      \"category\": \"broad topic grouping\",\n      \"syllabusWeek\": \"week number or section from syllabus, if identifiable\",\n      \"standardOrder\": 1\n    }\n  ]\n}\n\nRules:\n- Be THOROUGH. Cover every topic the syllabus mentions.\n- Be GRANULAR. Break broad topics into specific skills (e.g. not just 'Derivatives' but 'Power Rule', 'Chain Rule', 'Product Rule').\n- Prerequisite wiring should reflect the DISCIPLINE's standard dependency chain, not just the order listed in the syllabus.\n- standardOrder is the typical teaching sequence in this discipline (1 = taught first).";
  } else {
    onStatus("Generating reference taxonomy from course structure...");
    prompt = "You are an expert curriculum designer. A student has uploaded materials for a course but did NOT upload a syllabus. I need you to build a REFERENCE TAXONOMY -- the canonical set of skills, topics, and prerequisite relationships for this course.\n\nCOURSE NAME: " + courseName + "\n\nMATERIALS UPLOADED:\n" + materialOutline + "\n\nYour job:\n1. IDENTIFY the academic subject, level (intro/intermediate/advanced), and likely scope based on the course name and material titles.\n2. Generate a REFERENCE SKILL TAXONOMY: the standard set of skills a student would need to master in this type of course, based on your knowledge of how this subject is canonically taught.\n3. Wire PREREQUISITE RELATIONSHIPS between skills based on the standard pedagogical order for this discipline.\n4. Rate your CONFIDENCE (0-100) in this taxonomy. High = clear well-known subject. Low = ambiguous course name, unusual material mix, or interdisciplinary.\n\nRespond with ONLY a JSON object:\n{\n  \"subject\": \"e.g. Organic Chemistry\",\n  \"level\": \"intro|intermediate|advanced\",\n  \"focus\": \"best guess at specific focus areas\",\n  \"confidence\": 70,\n  \"flags\": [\"any uncertainties about the course scope\"],\n  \"taxonomy\": [\n    {\n      \"refId\": \"ref-1\",\n      \"name\": \"Skill/topic name\",\n      \"description\": \"What mastery of this skill means\",\n      \"prerequisites\": [\"ref-id\", ...],\n      \"category\": \"broad topic grouping\",\n      \"standardOrder\": 1\n    }\n  ]\n}\n\nRules:\n- Be THOROUGH but don't over-generate. Cover the standard curriculum for this subject at the identified level.\n- Be GRANULAR. Break broad topics into specific teachable skills.\n- Prerequisite wiring should reflect the DISCIPLINE's standard dependency chain.\n- If the course name or materials are ambiguous, generate for the most likely interpretation and flag the uncertainty.\n- standardOrder is the typical teaching sequence (1 = taught first).";
  }

  var result = await callClaude(prompt, [{ role: "user", content: "Generate the reference taxonomy for this course." }], 16384, true);
  var parsed = extractJSON(result);

  if (!parsed || !parsed.taxonomy) {
    console.error("Reference taxonomy generation failed:", result.substring(0, 500));
    onStatus("Reference taxonomy generation failed -- extraction will proceed without reference.");
    return null;
  }

  onStatus("Reference taxonomy: " + parsed.taxonomy.length + " canonical skills for " + (parsed.subject || courseName) + " (confidence: " + (parsed.confidence || "?") + "%)");

  // Store for future use
  await DB.saveRefTaxonomy(courseId, parsed);
  return parsed;
};

// --- Helper: Update chunk status in course metadata ---
export const updateChunkStatus = async (courseId, chunkId, newStatus, errorInfo = null) => {
  const allCourses = await DB.getCourses();
  const updatedCourses = allCourses.map(c => {
    if (c.id !== courseId) return c;
    return {
      ...c,
      materials: (c.materials || []).map(mat => {
        if (!mat.chunks) return mat;
        return {
          ...mat,
          chunks: mat.chunks.map(ch => {
            if (ch.id === chunkId) {
              const updated = { ...ch, status: newStatus };
              if (newStatus === "failed") {
                updated.failCount = (ch.failCount || 0) + 1;
                if (errorInfo) updated.lastError = errorInfo;
              }
              return updated;
            }
            return ch;
          })
        };
      })
    };
  });
  await DB.saveCourses(updatedCourses);
};

// --- Extract skills from a single chunk ---
const extractChunkSkills = async (courseId, chunk, existingSkills, refTax, onStatus) => {
  const { chunkId, label, content } = chunk;

  // Build context of what's already been extracted
  var existingContext = "";
  if (existingSkills && existingSkills.length > 0) {
    var skillList = existingSkills.slice(-50).map(function(s) {
      return "- " + s.name + (s.description ? ": " + s.description.substring(0, 60) : "");
    }).join("\n");
    existingContext = "\n\nALREADY EXTRACTED SKILLS (from other sections):\n" + skillList + "\n\nDo NOT re-extract these. Focus on NEW concepts not covered above.\n";
  }

  // Build reference taxonomy section
  var refSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    refSection = "\n\nREFERENCE TAXONOMY (" + (refTax.subject || "unknown") + "):\n" +
      JSON.stringify(refTax.taxonomy.slice(0, 30).map(function(t) { return { refId: t.refId, name: t.name, category: t.category }; }), null, 1) +
      "\n\nMatch skills to reference where they align (set refMatch: true, refId).\n";
  }

  var skillPrompt = "You are a curriculum analyst extracting skills from course materials.\n\nSECTION: " + label + "\n\nCONTENT:\n" + content + existingContext + refSection + "\n\nRespond with ONLY a JSON array of skills found in THIS section. Each skill:\n{\n  \"id\": \"skill-" + chunkId.replace(/[^a-zA-Z0-9]/g, "-") + "-1\",\n  \"name\": \"Short skill name\",\n  \"description\": \"1-2 sentence description\",\n  \"prerequisites\": [],\n  \"sources\": [\"" + label + "\"],\n  \"category\": \"topic grouping\"" + (refTax ? ",\n  \"refMatch\": true/false,\n  \"refId\": \"ref-X or null\"" : "") + "\n}\n\nRules:\n- Extract EVERY discrete concept from this section\n- Use IDs starting with skill-" + chunkId.replace(/[^a-zA-Z0-9]/g, "-") + "-\n- If NO new skills (all already covered), return []\n- Be thorough but don't duplicate existing skills";

  try {
    var result = await callClaude(skillPrompt, [{ role: "user", content: "Extract skills from this section." }], 16384, true);
    var parsed = extractJSON(result);

    if (parsed && Array.isArray(parsed)) {
      await DB.saveChunkSkills(courseId, chunkId, parsed);
      return { success: true, skills: parsed };
    } else {
      console.error("Chunk " + chunkId + " parse failed:", result.substring(0, 300));
      return {
        success: false,
        skills: [],
        error: "Failed to parse response",
        debugInfo: {
          chunkId: chunkId,
          label: label,
          contentLength: content.length,
          responsePreview: result ? result.substring(0, 500) : "(empty response)",
          parseAttempt: "extractJSON returned: " + (parsed === null ? "null" : typeof parsed)
        }
      };
    }
  } catch (e) {
    console.error("Chunk " + chunkId + " API error:", e.message);
    return {
      success: false,
      skills: [],
      error: e.message,
      debugInfo: {
        chunkId: chunkId,
        label: label,
        contentLength: content.length,
        errorType: e.name || "Unknown",
        errorMessage: e.message,
        stack: e.stack ? e.stack.split("\n").slice(0, 3).join("\n") : "(no stack)"
      }
    };
  }
};

// --- Merge and deduplicate skills from all chunks ---
const mergeExtractedSkills = async (courseId, allSkills, refTax, onStatus) => {
  // Small skill sets: just renumber, no API call needed
  if (allSkills.length <= 20) {
    var renumbered = allSkills.map(function(s, i) { return { ...s, id: "skill-" + (i + 1) }; });
    await DB.saveSkills(courseId, renumbered);
    return renumbered;
  }

  var mergeRefSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    mergeRefSection = "\n\nREFERENCE TAXONOMY:\n" +
      JSON.stringify(refTax.taxonomy.map(function(t) { return { refId: t.refId, name: t.name, prerequisites: t.prerequisites }; }), null, 1) +
      "\n\nSkills with same refId should be merged. Use reference prerequisite chains.\n";
  }

  var mergePrompt = "You are a curriculum analyst. Merge these skills into one clean skill tree.\n\nRAW SKILLS:\n" + JSON.stringify(allSkills, null, 1) + mergeRefSection + "\n\nYour job:\n1. DEDUPLICATE: Merge skills describing same concept (keep best description, combine sources)\n2. RENUMBER: Assign sequential IDs (skill-1, skill-2, etc.)\n3. FIX PREREQUISITES: Update references to new IDs, add cross-section links\n4. KEEP SOURCES: Preserve all source references\n5. DO NOT DROP: If similar but distinct, keep both\n\nRespond with ONLY the final merged JSON array.";

  try {
    onStatus("Merging " + allSkills.length + " skills...");
    var result = await callClaude(mergePrompt, [{ role: "user", content: "Merge the skill tree." }], 16384, true);
    var merged = extractJSON(result);

    if (merged && Array.isArray(merged)) {
      await DB.saveSkills(courseId, merged);
      return merged;
    }
  } catch (e) {
    console.error("Merge failed:", e.message);
  }

  // Fallback: save unmerged with sequential IDs
  onStatus("Merge failed, saving unmerged...");
  var fallback = allSkills.map(function(s, i) { return { ...s, id: "skill-" + (i + 1) }; });
  await DB.saveSkills(courseId, fallback);
  return fallback;
};

// --- Main extraction: processes chunks one at a time with immediate save ---
export const extractSkillTree = async (courseId, materialsMeta, onStatus, retryOnly, onSkillNotif, cancelRef, onError, onMatProgress) => {
  // 1. Gather chunks to process
  var chunksToProcess = [];
  for (var mi = 0; mi < materialsMeta.length; mi++) {
    var mat = materialsMeta[mi];
    var matClass = mat.classification || "material";
    if (!mat.chunks || !mat.chunks.length) {
      var loaded = await getMatContent(courseId, mat);
      for (var ci = 0; ci < loaded.chunks.length; ci++) {
        var ch = loaded.chunks[ci];
        if (!ch.content || ch.content.length < 10) continue;
        if (ch.status === "skipped") continue;
        if (retryOnly && ch.status === "extracted") continue;

        if (ch.content.length > CHUNK_CHAR_LIMIT) {
          var parts = splitTextChunks(ch.content, CHUNK_CHAR_LIMIT);
          for (var pi = 0; pi < parts.length; pi++) {
            chunksToProcess.push({
              chunkId: ch.id + "-p" + pi,
              matId: mat.id,
              matClass: matClass,
              label: (loaded.chunks.length > 1 ? mat.name + " > " : "") + ch.label + " (part " + (pi + 1) + ")",
              content: parts[pi],
              originalChunkId: ch.id
            });
          }
        } else {
          chunksToProcess.push({
            chunkId: ch.id,
            matId: mat.id,
            matClass: matClass,
            label: (loaded.chunks.length > 1 ? mat.name + " > " : "") + ch.label,
            content: ch.content
          });
        }
      }
    } else {
      for (var cj = 0; cj < mat.chunks.length; cj++) {
        var chk = mat.chunks[cj];
        if (chk.status === "skipped") continue;
        if (retryOnly && chk.status === "extracted") continue;

        var doc = await DB.getDoc(courseId, chk.id);
        var text = doc?.content || "";
        if (text.length < 10) continue;

        if (text.length > CHUNK_CHAR_LIMIT) {
          var pts = splitTextChunks(text, CHUNK_CHAR_LIMIT);
          for (var pj = 0; pj < pts.length; pj++) {
            chunksToProcess.push({
              chunkId: chk.id + "-p" + pj,
              matId: mat.id,
              matClass: matClass,
              label: (mat.chunks.length > 1 ? mat.name + " > " : "") + chk.label + " (part " + (pj + 1) + ")",
              content: pts[pj],
              originalChunkId: chk.id
            });
          }
        } else {
          chunksToProcess.push({
            chunkId: chk.id,
            matId: mat.id,
            matClass: matClass,
            label: (mat.chunks.length > 1 ? mat.name + " > " : "") + chk.label,
            content: text
          });
        }
      }
    }
  }

  if (!chunksToProcess.length) {
    if (retryOnly) {
      onStatus("No failed chunks to retry.");
      return await DB.getSkills(courseId) || [];
    }
    onStatus("No processable chunks found.");
    // Don't wipe existing skills — just return what we have
    return await DB.getSkills(courseId) || [];
  }

  // 2. Load reference taxonomy
  var refTax = await DB.getRefTaxonomy(courseId);

  // 3. Gather already-extracted skills (for context on retry)
  var existingSkills = [];
  if (retryOnly) {
    for (var mk = 0; mk < materialsMeta.length; mk++) {
      var matk = materialsMeta[mk];
      if (!matk.chunks) continue;
      for (var ck = 0; ck < matk.chunks.length; ck++) {
        if (matk.chunks[ck].status === "extracted") {
          var cs = await DB.getChunkSkills(courseId, matk.chunks[ck].id);
          if (Array.isArray(cs)) existingSkills.push(...cs);
        }
      }
    }
  }

  // 4. Process each chunk one at a time
  var succeededChunkIds = new Set();
  var failedChunkIds = new Set();
  var allExtractedSkills = existingSkills.slice(); // Start with existing
  var wasCancelled = false;

  onStatus("Processing " + chunksToProcess.length + " section" + (chunksToProcess.length !== 1 ? "s" : "") + "...");

  for (var i = 0; i < chunksToProcess.length; i++) {
    // Check for cancellation before each chunk
    if (cancelRef && cancelRef.current) {
      wasCancelled = true;
      onStatus("Extraction cancelled. " + succeededChunkIds.size + " section(s) completed.");
      if (onSkillNotif) onSkillNotif("warn", "Extraction stopped. Progress saved.");
      if (onMatProgress) onMatProgress(null); // Clear processing indicator
      break;
    }

    var chunk = chunksToProcess[i];

    // Track which material is being processed
    if (onMatProgress) onMatProgress(chunk.matId);

    onStatus("Extracting (" + (i + 1) + "/" + chunksToProcess.length + "): " + chunk.label);

    // Rate limit: wait 3 seconds between API calls to stay under 30k tokens/minute
    // Each chunk can be ~10-15k tokens, so 3 seconds gives ~20 tokens/min headroom
    if (i > 0) {
      onStatus("Rate limit pause... (" + (i + 1) + "/" + chunksToProcess.length + ")");
      await new Promise(r => setTimeout(r, 3000));
    }

    var result;
    try {
      result = await extractChunkSkills(courseId, chunk, allExtractedSkills, refTax, onStatus);
    } catch (e) {
      console.error("extractChunkSkills threw:", e);
      // Check if it's a rate limit error
      if (e.message && e.message.includes("rate limit")) {
        onStatus("Rate limited - waiting 60 seconds...");
        await new Promise(r => setTimeout(r, 60000));
        // Retry once
        try {
          result = await extractChunkSkills(courseId, chunk, allExtractedSkills, refTax, onStatus);
        } catch (e2) {
          result = { success: false, skills: [], error: e2.message };
        }
      } else {
        result = { success: false, skills: [], error: e.message };
      }
    }
    var trackId = chunk.originalChunkId || chunk.chunkId;

    if (result.success) {
      succeededChunkIds.add(trackId);
      allExtractedSkills.push(...result.skills);

      // Notify about extracted skills (truncate long labels)
      if (onSkillNotif && result.skills.length > 0) {
        var shortLabel = chunk.label.length > 25 ? chunk.label.substring(0, 25) + "..." : chunk.label;
        var classLabel = chunk.matClass ? "[" + chunk.matClass + "] " : "";
        for (var si = 0; si < Math.min(result.skills.length, 3); si++) {
          onSkillNotif("skill", "Added: " + result.skills[si].name);
        }
        if (result.skills.length > 3) {
          onSkillNotif("skill", "...+" + (result.skills.length - 3) + " more from " + classLabel + shortLabel);
        }
      }

      // Update status immediately
      await updateChunkStatus(courseId, trackId, "extracted");

      // Auto-save skills after each successful chunk (crash protection)
      try {
        await DB.saveSkills(courseId, allExtractedSkills);
      } catch (saveErr) {
        console.warn("Auto-save skills failed:", saveErr);
      }
    } else {
      failedChunkIds.add(trackId);

      // Store error info with the chunk
      var errorInfo = {
        error: result.error || "Unknown error",
        debugInfo: result.debugInfo || null,
        time: new Date().toISOString()
      };
      await updateChunkStatus(courseId, trackId, "failed", errorInfo);

      // Truncate label for notification
      var shortLabel = chunk.label.length > 25 ? chunk.label.substring(0, 25) + "..." : chunk.label;
      var classLabel = chunk.matClass ? "[" + chunk.matClass + "] " : "";
      if (onSkillNotif) {
        onSkillNotif("error", "Failed: " + classLabel + shortLabel);
      }

      // Store detailed error for debugging
      if (onError && result.debugInfo) {
        onError({
          label: chunk.label,
          error: result.error,
          debugInfo: result.debugInfo,
          time: new Date()
        });
      }
    }
  }

  // 5. Check results
  var failedCount = failedChunkIds.size;

  // Clear processing indicator
  if (onMatProgress) onMatProgress(null);

  if (allExtractedSkills.length === 0) {
    onStatus("No skills extracted." + (failedCount > 0 ? " " + failedCount + " section(s) failed." : ""));
    await DB.saveSkills(courseId, []);
    return [];
  }

  // 6. Run merge/dedup pass
  var mergedSkills = await mergeExtractedSkills(courseId, allExtractedSkills, refTax, onStatus);

  onStatus("Complete: " + mergedSkills.length + " skills." + (failedCount > 0 ? " " + failedCount + " section(s) failed -- retry available." : ""));

  return mergedSkills;
};

// --- Skill Tree Validation Pass ---
// Reviews extracted skills against reference taxonomy for accuracy.
// Can auto-fix prerequisite wiring, flag issues, and correct descriptions.
// Returns { skills (corrected), report }
export const validateSkillTree = async (courseId, skills, onStatus) => {
  if (!Array.isArray(skills) || skills.length === 0) {
    return { skills: [], report: { status: "empty", issues: [], fixes: [] } };
  }

  onStatus("Validating skill tree (" + skills.length + " skills)...");

  var refTax = await DB.getRefTaxonomy(courseId);

  // Build the validation prompt
  var refSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    refSection = "\n\nREFERENCE TAXONOMY (" + (refTax.subject || "unknown") + ", " + (refTax.level || "unknown level") + ", confidence: " + (refTax.confidence || "?") + "%):\n" + JSON.stringify(refTax.taxonomy.map(t => ({ refId: t.refId, name: t.name, description: t.description, prerequisites: t.prerequisites, category: t.category, standardOrder: t.standardOrder })), null, 1);
  }

  var prompt = "You are a curriculum quality reviewer. You have been given an extracted skill tree from a student's course materials. Your job is to VALIDATE and CORRECT it.\n\nEXTRACTED SKILL TREE:\n" + JSON.stringify(skills, null, 1) + refSection + "\n\nPerform these checks:\n\n1. PREREQUISITE LOGIC: For each skill, verify its prerequisites make sense. A prerequisite must be something the student needs to know BEFORE learning this skill. Flag and fix:\n   - Circular dependencies (A requires B, B requires A)\n   - Missing prerequisites (skill requires knowledge not listed as a prerequisite)\n   - Unnecessary prerequisites (listed prerequisite isn't actually needed)\n   - Wrong direction (A listed as prereq of B, but B should be prereq of A)\n" + (refSection ? "   - Compare against reference taxonomy prerequisite chains. Reference chains reflect the discipline's standard -- prefer them over the extracted version when they conflict.\n" : "") + "\n2. DESCRIPTION ACCURACY: Each skill description should clearly state what mastery means. Flag vague descriptions like 'understand X' or 'know about Y' -- replace with specific, testable criteria.\n\n3. DUPLICATES: Flag any skills that appear to describe the same concept under different names. Merge them (keep the better name and description, combine sources).\n\n4. ORPHANED SKILLS: Flag skills with no prerequisites AND no other skill depends on them, unless they are genuinely foundational (first things taught) or standalone topics.\n\n5. COVERAGE GAPS: " + (refSection ? "Compare against the reference taxonomy. Flag any reference skills that should be present but are missing from the extracted tree." : "Based on the skill categories present, flag any obvious gaps where a prerequisite concept is implied but not explicitly listed as a skill.") + "\n\n6. CATEGORY CONSISTENCY: Ensure skills in the same category are genuinely related. Flag miscategorized skills.\n\nRespond with ONLY a JSON object:\n{\n  \"correctedSkills\": [ ... the full skill array with all fixes applied ... ],\n  \"report\": {\n    \"totalChecked\": 45,\n    \"prerequisiteFixes\": [\n      { \"skillId\": \"skill-5\", \"issue\": \"description of what was wrong\", \"fix\": \"what was changed\" }\n    ],\n    \"descriptionFixes\": [\n      { \"skillId\": \"skill-12\", \"before\": \"old description\", \"after\": \"new description\" }\n    ],\n    \"mergedDuplicates\": [\n      { \"kept\": \"skill-3\", \"removed\": \"skill-17\", \"reason\": \"both describe the same concept\" }\n    ],\n    \"coverageGaps\": [\n      { \"missingTopic\": \"topic name\", \"reason\": \"why it should be present\" }\n    ],\n    \"warnings\": [\n      \"any other observations about the skill tree quality\"\n    ]\n  }\n}\n\nRules:\n- The correctedSkills array must be complete -- include ALL skills (fixed and unfixed).\n- Preserve all existing fields (id, name, sources, category, refMatch, refId, etc.).\n- When merging duplicates, keep one ID and remove the other. Update any prerequisites that referenced the removed ID.\n- For coverage gaps, do NOT add new skills -- just report what's missing. The student may have intentionally excluded those topics.\n- Be conservative with fixes. Only change things that are clearly wrong, not merely stylistic preferences.";

  try {
    var result = await callClaude(prompt, [{ role: "user", content: "Validate and correct this skill tree." }], 16384, true);
    var parsed = extractJSON(result);

    if (parsed && parsed.correctedSkills && Array.isArray(parsed.correctedSkills)) {
      var report = parsed.report || {};
      var fixCount = (report.prerequisiteFixes?.length || 0) + (report.descriptionFixes?.length || 0) + (report.mergedDuplicates?.length || 0);
      var gapCount = report.coverageGaps?.length || 0;

      onStatus("Validation complete: " + fixCount + " fix" + (fixCount !== 1 ? "es" : "") + " applied" + (gapCount > 0 ? ", " + gapCount + " coverage gap" + (gapCount !== 1 ? "s" : "") + " noted" : "") + ".");

      // Save corrected skills and report
      await DB.saveSkills(courseId, parsed.correctedSkills);
      await DB.saveValidation(courseId, report);

      return { skills: parsed.correctedSkills, report: report };
    }

    // Parse failed -- keep original skills, log issue
    console.error("Validation parse failed:", result.substring(0, 500));
    onStatus("Validation response couldn't be parsed -- keeping original skills.");
    await DB.saveValidation(courseId, { status: "parse_failed", raw: result.substring(0, 500) });
    return { skills: skills, report: { status: "parse_failed" } };

  } catch (e) {
    console.error("Validation call failed:", e);
    onStatus("Validation failed -- keeping original skills.");
    return { skills: skills, report: { status: "error", message: e.message } };
  }
};

// --- Incremental Skill Merge (for adding new materials) ---
export const mergeSkillTree = async (courseId, existingSkills, newMaterialsMeta, onStatus) => {
  if (!Array.isArray(existingSkills) || existingSkills.length === 0) {
    // No existing tree -- fall back to full extraction with all materials
    const allMats = await DB.get("study-courses");
    const course = Array.isArray(allMats) ? allMats.find(c => c.id === courseId) : null;
    return extractSkillTree(courseId, course?.materials || newMaterialsMeta, onStatus);
  }

  // Build content from ONLY the new materials
  let newContent = "";
  for (const mat of newMaterialsMeta) {
    const loaded = await getMatContent(courseId, mat);
    if (!loaded.content) continue;
    for (const ch of loaded.chunks) {
      newContent += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
    }
  }

  if (!newContent.trim()) return existingSkills;

  // Find the highest existing skill number to avoid ID collisions
  let maxId = 0;
  for (const s of existingSkills) {
    const num = parseInt(s.id.replace(/\D/g, ""), 10);
    if (num > maxId) maxId = num;
  }

  const existingList = existingSkills.map(s => s.id + ": " + s.name + " -- " + s.description).join("\n");

  onStatus("Analyzing new materials against existing skills...");

  const mergePrompt = "You are a curriculum analyst. A student has added new materials to their course. You need to figure out how these new materials relate to the EXISTING skill tree.\n\nEXISTING SKILLS (DO NOT change these IDs or names):\n" + existingList + "\n\nNEW MATERIALS:\n" + newContent + "\n\nYour job:\n1. Check if the new materials teach concepts already covered by existing skills. If so, add the new document as a source for that skill.\n2. If the new materials introduce concepts NOT covered by any existing skill, create NEW skills for them.\n3. New skill IDs must start from skill-" + (maxId + 1) + " to avoid collisions.\n4. New skills can list existing skills as prerequisites if appropriate.\n\nRespond with ONLY a JSON object:\n{\n  \"updatedSources\": [\n    { \"skillId\": \"skill-3\", \"addSources\": [\"new document name\"] }\n  ],\n  \"newSkills\": [\n    {\n      \"id\": \"skill-" + (maxId + 1) + "\",\n      \"name\": \"Short skill name\",\n      \"description\": \"1-2 sentence description\",\n      \"prerequisites\": [\"skill-id\", ...],\n      \"sources\": [\"new document name\"],\n      \"category\": \"broad topic grouping\"\n    }\n  ]\n}\n\nRules:\n- NEVER rename or re-ID existing skills. Student progress is tied to those IDs.\n- Only create new skills for genuinely new concepts.\n- If the new material just provides more depth on an existing skill, update its sources -- don't create a duplicate.\n- Be conservative: fewer new skills is better than duplicates.";

  const result = await callClaude(mergePrompt, [{ role: "user", content: "Merge new materials into the existing skill tree." }], 16384, true);
  const parsed = extractJSON(result);

  if (parsed && typeof parsed === "object") {
    // Apply source updates to existing skills
    const merged = existingSkills.map(s => {
      const update = parsed.updatedSources?.find(u => u.skillId === s.id);
      if (update && update.addSources) {
        const currentSources = s.sources || [];
        return { ...s, sources: [...currentSources, ...update.addSources.filter(src => !currentSources.includes(src))] };
      }
      return s;
    });

    // Add new skills
    if (parsed.newSkills && Array.isArray(parsed.newSkills)) {
      for (const ns of parsed.newSkills) {
        // Verify no ID collision
        if (!merged.find(s => s.id === ns.id)) {
          merged.push(ns);
        }
      }
    }

    await DB.saveSkills(courseId, merged);
    return merged;
  }

  // Fallback: if merge parse failed, don't destroy existing tree
  console.error("Skill merge parse failed, keeping existing tree");
  return existingSkills;
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
  await DB.saveAsgn(courseId, result);
  return result;
};
