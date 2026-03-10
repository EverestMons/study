// ============================================================
// extraction.js — Skill Extraction Pipeline v2
//
// Three-tier pipeline: Deterministic pre-processing → LLM extraction → 
// Deterministic post-processing. See docs/skill-extraction-v2-spec.md.
// ============================================================

import { callClaude, extractJSON } from './api.js';
import {
  Chunks, SubSkills, ChunkSkillBindings, SkillPrerequisites,
  ParentSkills, Materials, withTransaction
} from './db.js';
import { CIP_TAXONOMY } from './cipData.js';

// ============================================================
// Constants
// ============================================================

const CHAPTER_SIZE_LIMIT = 80000; // chars — split if exceeded
const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 10000]; // ms — exponential backoff

// ============================================================
// Step 0: Chapter Grouping
// ============================================================

/**
 * Group chunks by chapter using section_path.
 * All chunks whose section_path starts with the same top-level number
 * belong to the same chapter group.
 *
 * @param {Array} chunks - DB chunk rows (must have sectionPath, label, content, structuralMetadata, id, charCount)
 * @returns {Array<object>} Chapter groups with aggregated metadata
 */
export function groupChunksByChapter(chunks) {
  const chapterMap = new Map();

  for (const chunk of chunks) {
    const sp = chunk.section_path || chunk.sectionPath || '1';
    // Top-level: everything before the first dot
    const chapter = sp.split('.')[0];

    if (!chapterMap.has(chapter)) {
      chapterMap.set(chapter, {
        chapter,
        chunkIds: [],
        chunks: [],
        sectionHeadings: [],
        totalChars: 0,
      });
    }

    const group = chapterMap.get(chapter);
    group.chunkIds.push(chunk.id);
    group.chunks.push(chunk);
    group.totalChars += chunk.char_count || chunk.charCount || 0;

    // Build heading from label + section path
    const heading = chunk.label || `Section ${sp}`;
    if (!group.sectionHeadings.includes(heading)) {
      group.sectionHeadings.push(heading);
    }
  }

  // Aggregate structural metadata per chapter
  const groups = [];
  for (const [, group] of chapterMap) {
    const agg = aggregateMetadata(group.chunks);
    const estimatedRange = estimateSkillRange(group.sectionHeadings.length, agg);

    groups.push({
      chapter: group.chapter,
      chunkIds: group.chunkIds,
      chunks: group.chunks,
      chunkCount: group.chunks.length,
      totalChars: group.totalChars,
      sectionHeadings: group.sectionHeadings,
      aggregateMetadata: agg,
      estimatedSkillRange: estimatedRange,
    });
  }

  // Sort by chapter number (numeric where possible)
  groups.sort((a, b) => {
    const an = parseInt(a.chapter), bn = parseInt(b.chapter);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.chapter.localeCompare(b.chapter);
  });

  return groups;
}

/**
 * Aggregate structural metadata across all chunks in a chapter.
 */
function aggregateMetadata(chunks) {
  const boldTerms = new Set();
  const definitions = [];
  let definitionCount = 0;
  let exampleCount = 0;
  let equationIndicators = 0;
  let tableCount = 0;
  let imageCount = 0;
  let codeBlockCount = 0;

  for (const chunk of chunks) {
    const meta = typeof chunk.structural_metadata === 'string'
      ? JSON.parse(chunk.structural_metadata || '{}')
      : (chunk.structural_metadata || chunk.structuralMetadata || {});

    for (const term of (meta.bold_terms || [])) boldTerms.add(term);
    for (const def of (meta.definitions || [])) definitions.push(def);
    definitionCount += meta.definition_count || 0;
    exampleCount += meta.example_count || 0;
    equationIndicators += meta.equation_indicators || 0;
    tableCount += meta.table_count || 0;
    imageCount += meta.image_count || 0;
    codeBlockCount += meta.code_block_count || 0;
  }

  return {
    boldTerms: [...boldTerms],
    definitions,
    definitionCount: definitionCount || definitions.length,
    exampleCount,
    equationIndicators,
    tableCount,
    imageCount,
    codeBlockCount,
  };
}

/**
 * Estimate skill count range from structural signals.
 * See spec Section 4 Step 0 for formula.
 */
function estimateSkillRange(headingCount, metadata) {
  const base = Math.max(headingCount, Math.ceil((metadata.definitionCount || 0) / 2));
  const floor = Math.max(3, Math.ceil(base * 0.7));
  const ceiling = Math.min(15, Math.max(base * 2, floor + 2));
  return [floor, Math.max(ceiling, floor + 1)];
}

/**
 * Split oversized chapter groups at the highest-level section boundary.
 * Returns the original group if under the limit, or multiple sub-groups.
 */
export function splitOversizedChapters(groups) {
  const result = [];
  for (const group of groups) {
    if (group.totalChars <= CHAPTER_SIZE_LIMIT) {
      result.push(group);
      continue;
    }

    // Find the split point: largest gap in heading_level
    const chunks = group.chunks;
    let bestSplitIdx = Math.floor(chunks.length / 2); // fallback: middle
    let lowestLevel = Infinity;

    for (let i = 1; i < chunks.length; i++) {
      const level = chunks[i].heading_level || chunks[i].headingLevel || 99;
      if (level < lowestLevel) {
        lowestLevel = level;
        bestSplitIdx = i;
      }
    }

    // Split into two sub-groups
    const left = chunks.slice(0, bestSplitIdx);
    const right = chunks.slice(bestSplitIdx);

    for (const [suffix, subChunks] of [['a', left], ['b', right]]) {
      if (subChunks.length === 0) continue;
      const agg = aggregateMetadata(subChunks);
      const headings = subChunks
        .map(c => c.label || `Section ${c.section_path || c.sectionPath}`)
        .filter((h, i, a) => a.indexOf(h) === i);
      result.push({
        chapter: group.chapter + suffix,
        chunkIds: subChunks.map(c => c.id),
        chunks: subChunks,
        chunkCount: subChunks.length,
        totalChars: subChunks.reduce((s, c) => s + (c.char_count || c.charCount || 0), 0),
        sectionHeadings: headings,
        aggregateMetadata: agg,
        estimatedSkillRange: estimateSkillRange(headings.length, agg),
      });
    }
  }
  return result;
}

// ============================================================
// Step 1: Deterministic Pre-Processing
// ============================================================

/**
 * Build a chapter profile from structural signals.
 * This constrains the LLM extraction call.
 */
export function buildChapterProfile(chapterGroup) {
  const { sectionHeadings, aggregateMetadata: meta } = chapterGroup;

  const contentSignals = {
    procedural: (meta.equationIndicators || 0) > 5 || (meta.exampleCount || 0) > 0,
    conceptual: (meta.definitionCount || 0) > 2 && (meta.equationIndicators || 0) < 3,
    quantitative: (meta.equationIndicators || 0) > 10,
    referenceHeavy: (meta.tableCount || 0) > 3,
    codeHeavy: (meta.codeBlockCount || 0) > 2,
  };

  // Build candidate skill list from structural elements
  const candidates = [];

  for (const term of (meta.boldTerms || [])) {
    candidates.push({ term, source: 'bold_term', confidence: 'medium' });
  }

  for (const def of (meta.definitions || [])) {
    const term = def.split(':')[0].trim();
    const existing = candidates.find(c => c.term.toLowerCase() === term.toLowerCase());
    if (existing) {
      existing.confidence = 'high';
      existing.definition = def;
    } else {
      candidates.push({ term, source: 'definition', confidence: 'high', definition: def });
    }
  }

  return {
    contentSignals,
    candidates,
    estimatedSkillRange: chapterGroup.estimatedSkillRange,
    sectionHeadings,
  };
}

// ============================================================
// Step 2: LLM Extraction Prompts
// ============================================================

/**
 * Build the system prompt for initial extraction.
 */
function buildInitialExtractionPrompt(profile, isFirstChapter) {
  const { sectionHeadings, estimatedSkillRange, candidates } = profile;
  const [min, max] = estimatedSkillRange;

  const boldTermList = candidates
    .filter(c => c.source === 'bold_term' || c.confidence === 'high')
    .map(c => c.term)
    .slice(0, 50); // cap to avoid prompt bloat

  const defList = candidates
    .filter(c => c.definition)
    .map(c => c.definition.substring(0, 80))
    .slice(0, 30);

  const eqLevel = (profile.contentSignals?.quantitative) ? 'heavy'
    : (profile.contentSignals?.procedural) ? 'moderate'
    : (candidates.some(c => c.definition)) ? 'light' : 'none';

  let prompt = `You are a curriculum analyst extracting skills from a textbook chapter.

CHAPTER STRUCTURE:
- Sections: ${sectionHeadings.length}
${sectionHeadings.map(h => `  - ${h}`).join('\n')}

STRUCTURAL ANALYSIS (from document parsing):
- Bold terms identified (${boldTermList.length}): ${boldTermList.join(', ')}
- Definitions found (${defList.length}): ${defList.map(d => `"${d}"`).join('; ')}
- Worked examples detected: ${profile.contentSignals?.procedural ? 'yes' : 'none detected'}
- Equation/math content: ${eqLevel}
- Tables: ${profile.contentSignals?.referenceHeavy ? 'many' : 'few/none'}
- Code blocks: ${profile.contentSignals?.codeHeavy ? 'yes' : 'few/none'}

TARGET: Extract ${min}-${max} skills from this chapter.

INSTRUCTIONS:
1. Each bold term is a candidate concept. Confirm it as a skill, merge it with related terms, or reject it (not a standalone learnable concept).
2. Each definition anchors at least one skill.
3. Every skill must pass these tests:
   - DIAGNOSTIC TEST: Can you ask ONE question to check if a student knows this? If not, it's too vague.
   - PRACTICE TEST: Can you generate 5 different problems at varying difficulty? If not, it's too narrow.
   - DECAY TEST: Can a student forget THIS skill independently of other skills? If not, merge it.
4. Classify each skill:
   - skillType: procedural (has steps/calculations) | conceptual (understanding/explanation) | recall (definitions/facts) | synthesis (combining multiple concepts)
   - bloomsLevel: remember | understand | apply | analyze | evaluate | create`;

  if (isFirstChapter) {
    const cipList = CIP_TAXONOMY.map(e => e.code + ' ' + e.name).join('\n');
    prompt += `

FOR THE FIRST CHAPTER ONLY, also determine the academic classification.
Pick the CIP code from this list that BEST matches the subject:

${cipList}

If nothing fits, use cipCode: "custom" and provide your own name.

RESPOND WITH ONLY a JSON object:
{
  "cipCode": "XX.XX",
  "parentDisplayName": "Display Name",
  "subSkills": [ ...array of skills... ]
}`;
  } else {
    prompt += `

RESPOND WITH ONLY a JSON array of skills.`;
  }

  prompt += `

Skill schema:
[{
  "name": "Skill Name",
  "conceptKey": "category/kebab-skill-name",
  "description": "One sentence describing what the student can do",
  "masteryCriteria": [
    "Testable statement 1",
    "Testable statement 2"
  ],
  "category": "Chapter Topic",
  "skillType": "procedural",
  "bloomsLevel": "apply",
  "prerequisites": ["concept-key-of-prereq"],
  "evidence": {
    "anchorTerms": ["term1", "term2"],
    "definitionsFound": ["definition text..."],
    "examplesInSource": 2,
    "equationPresence": true,
    "figureReferences": ["Figure 3.15"]
  },
  "sourceChunkLabels": ["Section heading that contains this skill"]
}]

RULES:
- Prerequisites reference concept keys of OTHER skills in this chapter (cross-chapter wired later).
- conceptKey format: kebab-case "{category}/{skill-name}". Must be deterministic — same content should always produce the same key.
- masteryCriteria: 2-4 testable statements per skill.
- DO NOT extract skills for front matter, table of contents, or index entries.
- DO NOT create skills for individual vocabulary words unless they represent a distinct learnable concept.`;

  return prompt;
}

/**
 * Build the system prompt for incremental enrichment.
 */
function buildEnrichmentPrompt(existingSkills, materialLabel) {
  const skillsSummary = existingSkills.map(s => {
    const criteria = typeof s.mastery_criteria === 'string'
      ? JSON.parse(s.mastery_criteria || '[]') : (s.mastery_criteria || []);
    const evidence = typeof s.evidence === 'string'
      ? JSON.parse(s.evidence || '{}') : (s.evidence || {});
    return `  - ${s.concept_key}: "${s.name}" [${s.category || 'uncategorized'}]
    criteria: ${criteria.map(c => typeof c === 'string' ? c : c.text).join('; ')}
    anchors: ${(evidence.anchorTerms || []).join(', ')}`;
  }).join('\n');

  return `You are a curriculum analyst. A student has uploaded new material for a course that already has extracted skills.

EXISTING SKILLS (${existingSkills.length} total):
${skillsSummary}

NEW MATERIAL — ${materialLabel}:

YOUR JOB:
1. For each concept in the new material, check if it matches an existing skill.
   Match by CONCEPT, not by exact wording. "K-map reduction" and "Karnaugh Map Simplification" are the same concept.
2. For MATCHING concepts:
   - Return the existing skill's conceptKey
   - Add any NEW mastery criteria the new material reveals
   - Add any new anchor terms or definitions
   - Do NOT duplicate existing criteria
3. For GENUINELY NEW concepts (not covered by any existing skill):
   - Create a new skill with full schema
4. Apply the same quality tests: diagnostic, practice, decay.
5. For each NEW skill, include a cipCode and parentDisplayName.

RESPOND WITH ONLY a JSON object:
{
  "enrichments": [
    {
      "existingConceptKey": "category/skill-name",
      "newCriteria": ["New testable statement"],
      "newAnchorTerms": ["new term"],
      "newDefinitions": [],
      "sourceLabel": "${materialLabel}"
    }
  ],
  "newSkills": [
    {
      "name": "...", "conceptKey": "...", "description": "...",
      "masteryCriteria": ["..."], "category": "...",
      "skillType": "...", "bloomsLevel": "...",
      "prerequisites": [], "evidence": {...},
      "sourceChunkLabels": ["..."],
      "cipCode": "XX.XX", "parentDisplayName": "..."
    }
  ],
  "unmatchedExisting": ["concept-keys not covered in new material"]
}`;
}

/**
 * Build the cross-chapter prerequisite wiring prompt.
 */
function buildCrossChapterPrompt(skillsByChapter) {
  const listing = skillsByChapter.map(({ chapter, skills }) => {
    const lines = skills.map(s => `  - ${s.name} (${s.conceptKey})`).join('\n');
    return `Chapter ${chapter}:\n${lines}`;
  }).join('\n');

  return `Wire prerequisite links ACROSS chapters. Within-chapter prerequisites are already set.

SKILLS BY CHAPTER:
${listing}

For each skill, list which skills from EARLIER chapters are direct prerequisites.
Only add links where a student genuinely needs the earlier skill to learn the later one.
Do not add transitive links (if A→B→C, don't add A→C).

RESPOND WITH ONLY a JSON array:
[
  { "skill": "concept-key", "crossPrereqs": ["concept-key-of-prereq"] }
]

Only include skills that HAVE cross-chapter prerequisites.`;
}

// ============================================================
// Step 3: Post-Processing
// ============================================================

/**
 * Post-process skills from a single chapter extraction.
 * All checks are deterministic — no LLM calls.
 *
 * @param {Array} skills - Raw skills from LLM
 * @param {object} chapterProfile - From buildChapterProfile
 * @param {string} materialLabel - Source document label for criteria wrapping
 * @returns {{ skills: Array, issues: Array }}
 */
export function postProcessChapterSkills(skills, chapterProfile, materialLabel) {
  const issues = [];
  if (!Array.isArray(skills) || skills.length === 0) {
    return { skills: [], issues: [{ type: 'empty_extraction' }] };
  }

  // 1. Wrap masteryCriteria into storage format
  for (const s of skills) {
    if (Array.isArray(s.masteryCriteria)) {
      s.masteryCriteria = s.masteryCriteria.map(text =>
        typeof text === 'string'
          ? { text, source: materialLabel, addedAt: new Date().toISOString() }
          : text // already wrapped
      );
    } else {
      s.masteryCriteria = [];
      issues.push({ type: 'missing_criteria', skill: s.conceptKey || s.name });
    }
  }

  // 2. Circular dependency detection (simple: flag cycles, don't auto-fix)
  const keySet = new Set(skills.map(s => s.conceptKey));
  for (const s of skills) {
    if (!s.prerequisites) { s.prerequisites = []; continue; }
    // Remove self-references
    s.prerequisites = s.prerequisites.filter(p => p !== s.conceptKey);
    // Remove references to non-existent skills (within this chapter)
    const validPrereqs = s.prerequisites.filter(p => keySet.has(p));
    const invalid = s.prerequisites.filter(p => !keySet.has(p));
    if (invalid.length > 0) {
      issues.push({ type: 'unresolved_prereqs', skill: s.conceptKey, invalid });
    }
    s.prerequisites = validPrereqs;
  }

  // Simple cycle detection via DFS
  const visited = new Set();
  const inStack = new Set();
  function hasCycle(key) {
    if (inStack.has(key)) return true;
    if (visited.has(key)) return false;
    visited.add(key);
    inStack.add(key);
    const skill = skills.find(s => s.conceptKey === key);
    if (skill) {
      for (const p of (skill.prerequisites || [])) {
        if (hasCycle(p)) return true;
      }
    }
    inStack.delete(key);
    return false;
  }
  for (const s of skills) {
    visited.clear();
    inStack.clear();
    if (hasCycle(s.conceptKey)) {
      issues.push({ type: 'circular_dep', skill: s.conceptKey });
      // Break cycle: remove last prerequisite
      s.prerequisites.pop();
    }
  }

  // 3. Duplicate name check
  const nameMap = new Map();
  for (const s of skills) {
    const lower = s.name.toLowerCase();
    if (nameMap.has(lower)) {
      issues.push({
        type: 'exact_dupe',
        kept: nameMap.get(lower).conceptKey,
        removed: s.conceptKey,
      });
      s._remove = true; // mark for removal
    } else {
      nameMap.set(lower, s);
    }
  }
  // Filter out exact duplicates
  const deduped = skills.filter(s => !s._remove);

  // 4. Prerequisite count cap
  for (const s of deduped) {
    if ((s.prerequisites || []).length > 8) {
      issues.push({ type: 'too_many_prereqs', skill: s.conceptKey, count: s.prerequisites.length });
    }
  }

  // 5. Skill count sanity
  const [min, max] = chapterProfile.estimatedSkillRange;
  if (deduped.length < min * 0.5) {
    issues.push({ type: 'too_few_skills', expected: [min, max], got: deduped.length });
  }
  if (deduped.length > max * 2) {
    issues.push({ type: 'too_many_skills', expected: [min, max], got: deduped.length });
  }

  // 6. Empty evidence check
  for (const s of deduped) {
    if (!s.evidence?.anchorTerms?.length && !s.evidence?.definitionsFound?.length) {
      issues.push({ type: 'no_evidence', skill: s.conceptKey });
    }
  }

  // 7. MasteryCriteria minimum
  for (const s of deduped) {
    if (!s.masteryCriteria || s.masteryCriteria.length < 2) {
      issues.push({ type: 'insufficient_criteria', skill: s.conceptKey, count: s.masteryCriteria?.length || 0 });
    }
  }

  return { skills: deduped, issues };
}

/**
 * Resolve sourceChunkLabels to chunk IDs for binding.
 * Falls back to binding to ALL chapter chunks if unresolved.
 *
 * @param {Array} skills - Post-processed skills with sourceChunkLabels
 * @param {object} chapterGroup - Chapter group with sectionHeadings and chunkIds
 * @returns {Array<{ subSkillId, chunkId, extractionContext, confidence }>}
 */
export function resolveChunkBindings(skills, chapterGroup, skillIdMap) {
  const bindings = [];
  const { chunkIds, chunks } = chapterGroup;

  // Build heading → chunkId lookup
  const headingToChunks = new Map();
  for (const chunk of chunks) {
    const heading = chunk.label || `Section ${chunk.section_path || chunk.sectionPath}`;
    if (!headingToChunks.has(heading)) headingToChunks.set(heading, []);
    headingToChunks.get(heading).push(chunk.id);
  }

  for (const skill of skills) {
    const subSkillId = skillIdMap.get(skill.conceptKey);
    if (!subSkillId) continue;

    const labels = skill.sourceChunkLabels || [];
    let resolved = false;

    for (const label of labels) {
      // Try exact match
      if (headingToChunks.has(label)) {
        for (const cid of headingToChunks.get(label)) {
          bindings.push({ chunkId: cid, subSkillId, extractionContext: label, confidence: 1.0 });
        }
        resolved = true;
        continue;
      }
      // Try substring match
      for (const [heading, cids] of headingToChunks) {
        if (heading.toLowerCase().includes(label.toLowerCase()) ||
            label.toLowerCase().includes(heading.toLowerCase())) {
          for (const cid of cids) {
            bindings.push({ chunkId: cid, subSkillId, extractionContext: heading, confidence: 0.9 });
          }
          resolved = true;
          break;
        }
      }
    }

    // Fallback: bind to ALL chunks in the chapter
    if (!resolved) {
      for (const cid of chunkIds) {
        bindings.push({ chunkId: cid, subSkillId, extractionContext: null, confidence: 0.5 });
      }
    }
  }

  return bindings;
}

// ============================================================
// Step 4: Cross-Chapter Prerequisite Wiring
// ============================================================

/**
 * Wire cross-chapter prerequisites via a single Haiku call.
 *
 * @param {Array<{ chapter, skills }>} skillsByChapter - All skills organized by chapter
 * @param {Map<string, number>} conceptKeyToId - Maps concept keys to sub_skill IDs
 * @returns {Promise<{ links: Array, issues: Array }>}
 */
async function wireCrossChapterPrereqs(skillsByChapter, conceptKeyToId) {
  const issues = [];

  // Only worth doing if we have 2+ chapters
  if (skillsByChapter.length < 2) return { links: [], issues };

  const prompt = buildCrossChapterPrompt(skillsByChapter);

  // This call only sends skill names/keys, not full chapter content — very cheap
  const response = await callClaude(prompt, [{ role: 'user', content: 'Wire the prerequisites.' }], 4096, true);
  const parsed = extractJSON(response);

  if (!Array.isArray(parsed)) {
    issues.push({ type: 'cross_chapter_parse_fail', response: response.substring(0, 200) });
    return { links: [], issues };
  }

  const links = [];
  for (const entry of parsed) {
    const skillId = conceptKeyToId.get(entry.skill);
    if (!skillId) {
      issues.push({ type: 'cross_chapter_unresolved_skill', key: entry.skill });
      continue;
    }
    for (const prereqKey of (entry.crossPrereqs || [])) {
      const prereqId = conceptKeyToId.get(prereqKey);
      if (!prereqId) {
        issues.push({ type: 'cross_chapter_unresolved_prereq', skill: entry.skill, prereq: prereqKey });
        continue;
      }
      if (skillId === prereqId) continue; // self-reference
      links.push({ subSkillId: skillId, prerequisiteId: prereqId, source: 'cross_chapter' });
    }
  }

  return { links, issues };
}

// ============================================================
// Chapter Extraction Orchestrator
// ============================================================

/**
 * Extract skills from a single chapter group.
 * Handles LLM call + JSON parsing + post-processing.
 *
 * @param {object} chapterGroup - From groupChunksByChapter
 * @param {boolean} isFirstChapter - Whether to include CIP code request
 * @param {string} materialLabel - For mastery criteria source tagging
 * @param {object} [options]
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{ skills, cipCode?, parentDisplayName?, issues }>}
 */
async function extractChapter(chapterGroup, isFirstChapter, materialLabel, options = {}) {
  const profile = buildChapterProfile(chapterGroup);
  const systemPrompt = buildInitialExtractionPrompt(profile, isFirstChapter);

  // Build chapter content from chunks
  const chapterContent = chapterGroup.chunks
    .map(c => c.content || '')
    .join('\n\n---\n\n');

  let response = null;

  // Retry loop
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        options.onProgress?.(`Chapter ${chapterGroup.chapter}: retry ${attempt}/${MAX_RETRIES}...`);
      }

      response = await callClaude(
        systemPrompt,
        [{ role: 'user', content: `CHAPTER CONTENT:\n\n${chapterContent}` }],
        8192,
        true // useHaiku
      );

      // Check for API error strings
      if (typeof response === 'string' && response.startsWith('Error:')) {
        throw new Error(response);
      }

      break; // success
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        return {
          skills: [],
          issues: [{ type: 'extraction_failed', chapter: chapterGroup.chapter, error: e.message }],
        };
      }
    }
  }

  // Parse JSON from response
  const parsed = extractJSON(response);
  if (!parsed) {
    return {
      skills: [],
      issues: [{ type: 'json_parse_failed', chapter: chapterGroup.chapter, response: response?.substring(0, 300) }],
    };
  }

  // Handle first-chapter wrapper { cipCode, parentDisplayName, subSkills }
  let rawSkills, cipCode, parentDisplayName;
  if (isFirstChapter && parsed.cipCode) {
    cipCode = parsed.cipCode;
    parentDisplayName = parsed.parentDisplayName;
    rawSkills = parsed.subSkills || [];
  } else if (Array.isArray(parsed)) {
    rawSkills = parsed;
  } else if (parsed.subSkills) {
    // LLM might wrap even non-first chapters
    cipCode = parsed.cipCode;
    parentDisplayName = parsed.parentDisplayName;
    rawSkills = parsed.subSkills;
  } else {
    return {
      skills: [],
      issues: [{ type: 'unexpected_format', chapter: chapterGroup.chapter }],
    };
  }

  // Post-process
  const { skills, issues } = postProcessChapterSkills(rawSkills, profile, materialLabel);

  return { skills, cipCode, parentDisplayName, issues };
}

// ============================================================
// Full Course Extraction Orchestrator
// ============================================================

/**
 * Run the full extraction pipeline for a course material.
 *
 * @param {string} courseId
 * @param {string} materialId
 * @param {object} options
 * @param {function} [options.onProgress] - (message: string) => void
 * @param {function} [options.onChapterComplete] - (chapterNum: string, skillCount: number) => void
 * @param {Set<string>} [options.skipChapters] - Chapter numbers to skip (user deselected)
 * @returns {Promise<{ totalSkills, chapters, issues, cipCode, parentDisplayName }>}
 */
export async function extractCourse(courseId, materialId, options = {}) {
  const { onProgress, onChapterComplete, skipChapters = new Set() } = options;
  const allIssues = [];

  // --- Load chunks ---
  onProgress?.('Loading chunks...');
  const chunks = await Chunks.getByMaterial(materialId);
  if (chunks.length === 0) {
    return { totalSkills: 0, chapters: [], issues: [{ type: 'no_chunks' }] };
  }

  // Get material label for source tagging
  const material = await Materials.getById(materialId);
  const materialLabel = material?.label || 'Unknown Material';

  // --- Step 0: Group by chapter ---
  onProgress?.('Grouping chunks by chapter...');
  let chapterGroups = groupChunksByChapter(chunks);
  chapterGroups = splitOversizedChapters(chapterGroups);

  // Filter out skipped chapters
  chapterGroups = chapterGroups.filter(g => !skipChapters.has(g.chapter));

  onProgress?.(`Found ${chapterGroups.length} chapters to extract.`);

  // --- Steps 1-3: Extract each chapter ---
  let cipCode = null;
  let parentDisplayName = null;
  let parentSkillId = null;
  const allSkillsByChapter = [];
  const conceptKeyToId = new Map();
  let totalSkills = 0;

  for (let i = 0; i < chapterGroups.length; i++) {
    const group = chapterGroups[i];
    const isFirst = (i === 0);
    onProgress?.(`Extracting chapter ${group.chapter} (${i + 1}/${chapterGroups.length})...`);

    const result = await extractChapter(group, isFirst, materialLabel, options);
    allIssues.push(...result.issues);

    if (isFirst && result.cipCode) {
      cipCode = result.cipCode;
      parentDisplayName = result.parentDisplayName || cipCode;
      // Create or find parent skill
      parentSkillId = await ParentSkills.findOrCreateByCip(cipCode, parentDisplayName);
    }

    if (result.skills.length === 0) {
      // Mark chunks as failed (increments fail_count, transitions to terminal at threshold)
      await Chunks.markFailedBatch(group.chunkIds);
      onChapterComplete?.(group.chapter, 0);
      continue;
    }

    // --- Save to DB in a single transaction ---
    try {
      await withTransaction(async () => {
        // Prepare skill records
        const skillRecords = result.skills.map(s => ({
          parentSkillId: parentSkillId,
          name: s.name,
          description: s.description || null,
          skillType: s.skillType || null,
          sourceCourseId: courseId,
          conceptKey: s.conceptKey,
          category: s.category || null,
          bloomsLevel: s.bloomsLevel || null,
          masteryCriteria: s.masteryCriteria,
          evidence: s.evidence || {},
          extractionModel: 'claude-haiku-4-5',
          schemaVersion: 2,
        }));

        const skillIds = await SubSkills.createBatch(skillRecords, { externalTransaction: true });

        // Map conceptKey → id for binding resolution and cross-chapter wiring
        const skillIdMap = new Map();
        for (let j = 0; j < result.skills.length; j++) {
          const key = result.skills[j].conceptKey;
          skillIdMap.set(key, skillIds[j]);
          conceptKeyToId.set(key, skillIds[j]);
        }

        // Resolve chunk bindings
        const bindings = resolveChunkBindings(result.skills, group, skillIdMap);
        await ChunkSkillBindings.createBatch(bindings, { externalTransaction: true });

        // Save within-chapter prerequisites
        const prereqLinks = [];
        for (const s of result.skills) {
          const skillId = skillIdMap.get(s.conceptKey);
          for (const prereqKey of (s.prerequisites || [])) {
            const prereqId = skillIdMap.get(prereqKey);
            if (prereqId && prereqId !== skillId) {
              prereqLinks.push({ subSkillId: skillId, prerequisiteId: prereqId, source: 'within_chapter' });
            }
          }
        }
        if (prereqLinks.length > 0) {
          await SkillPrerequisites.createBatch(prereqLinks, { externalTransaction: true });
        }

        // Mark chunks as extracted
        await Chunks.updateStatusBatch(group.chunkIds, 'extracted', { externalTransaction: true });
      });

      totalSkills += result.skills.length;
      allSkillsByChapter.push({
        chapter: group.chapter,
        skills: result.skills,
        chunks: group.chunks,
      });

      onChapterComplete?.(group.chapter, result.skills.length);
    } catch (e) {
      allIssues.push({ type: 'save_failed', chapter: group.chapter, error: e.message });
      await Chunks.markFailedBatch(group.chunkIds);
      onChapterComplete?.(group.chapter, 0);
    }

    // Rate limiting: 2-second delay between chapters
    if (i < chapterGroups.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // --- Step 4: Cross-chapter prerequisite wiring ---
  if (allSkillsByChapter.length >= 2) {
    onProgress?.('Wiring cross-chapter prerequisites...');
    try {
      const { links, issues: wireIssues } = await wireCrossChapterPrereqs(
        allSkillsByChapter, conceptKeyToId
      );
      allIssues.push(...wireIssues);

      if (links.length > 0) {
        await SkillPrerequisites.createBatch(links);
      }
      onProgress?.(`Wired ${links.length} cross-chapter prerequisite links.`);
    } catch (e) {
      allIssues.push({ type: 'cross_chapter_wiring_failed', error: e.message });
      // Non-critical — skills work without cross-chapter prereqs
    }
  }

  onProgress?.(`Extraction complete: ${totalSkills} skills from ${allSkillsByChapter.length} chapters.`);

  return {
    totalSkills,
    chapters: allSkillsByChapter.map(c => ({ chapter: c.chapter, skillCount: c.skills.length })),
    issues: allIssues,
    cipCode,
    parentDisplayName,
    createdSkillIds: [...conceptKeyToId.values()],
  };
}

// ============================================================
// Incremental Enrichment
// ============================================================

/**
 * Enrich existing skills with new material.
 * Used for upload #2+ (lecture transcripts, supplementary material).
 *
 * @param {string} courseId
 * @param {string} materialId
 * @param {object} options
 * @param {function} [options.onProgress]
 * @returns {Promise<{ enriched, newSkills, issues }>}
 */
export async function enrichFromMaterial(courseId, materialId, options = {}) {
  const { onProgress } = options;
  const allIssues = [];

  // Load existing skills scoped to THIS course only.
  // Using getAllConceptKeys() was wrong — it matched against skills from other
  // courses, causing enrichment to update the wrong course's skills.
  const existingSkills = await SubSkills.getByCourse(courseId);
  if (existingSkills.length === 0) {
    // No existing skills in this course — run full extraction instead
    onProgress?.('No existing skills found for this course. Running full extraction.');
    return extractCourse(courseId, materialId, options);
  }

  // Load new material chunks — only unfinished ones
  const allChunks = await Chunks.getByMaterial(materialId);
  if (allChunks.length === 0) {
    return { enriched: 0, newSkills: 0, issues: [{ type: 'no_chunks' }] };
  }

  const chunks = allChunks.filter(c => c.status !== 'extracted' && c.status !== 'failed');
  if (chunks.length === 0) {
    return { enriched: 0, newSkills: 0, issues: [{ type: 'all_chunks_done' }] };
  }

  const unfinishedChunkIds = chunks.map(c => c.id);

  const material = await Materials.getById(materialId);
  const materialLabel = material?.label || 'Unknown Material';

  // Build content from unfinished chunks only
  const content = chunks.map(c => c.content || '').join('\n\n---\n\n');

  // Build enrichment prompt
  const systemPrompt = buildEnrichmentPrompt(existingSkills, materialLabel);

  onProgress?.(`Enriching from ${materialLabel} (${chunks.length} chunks)...`);

  // LLM call
  const response = await callClaude(
    systemPrompt,
    [{ role: 'user', content: `NEW MATERIAL CONTENT:\n\n${content}` }],
    8192,
    true // useHaiku
  );

  if (typeof response === 'string' && response.startsWith('Error:')) {
    // Mark unfinished chunks as failed (increments fail_count, transitions to terminal at threshold)
    await Chunks.markFailedBatch(unfinishedChunkIds);
    return { enriched: 0, newSkills: 0, issues: [{ type: 'enrichment_api_error', error: response }] };
  }

  const parsed = extractJSON(response);
  if (!parsed || (!parsed.enrichments && !parsed.newSkills)) {
    // Mark unfinished chunks as failed
    await Chunks.markFailedBatch(unfinishedChunkIds);
    return { enriched: 0, newSkills: 0, issues: [{ type: 'enrichment_parse_failed' }] };
  }

  let enrichedCount = 0;
  let newSkillCount = 0;
  const createdSkillIds = [];

  // Process enrichments
  for (const e of (parsed.enrichments || [])) {
    const existing = await SubSkills.findByConceptKey(e.existingConceptKey);
    if (!existing) {
      allIssues.push({ type: 'enrichment_unresolved', key: e.existingConceptKey });
      continue;
    }

    // Update skill with new criteria/evidence
    await SubSkills.updateFromReextraction(existing.id, {
      description: existing.description, // keep existing
      masteryCriteria: e.newCriteria || [],
      evidence: { anchorTerms: e.newAnchorTerms || [], definitionsFound: e.newDefinitions || [] },
      materialLabel: e.sourceLabel || materialLabel,
    });

    // Bind to the chunks we actually sent
    const bindings = chunks.map(c => ({
      chunkId: c.id,
      subSkillId: existing.id,
      extractionContext: null,
      confidence: 0.8,
    }));
    await ChunkSkillBindings.createBatch(bindings);

    enrichedCount++;
  }

  // Process new skills
  for (const ns of (parsed.newSkills || [])) {
    // Wrap criteria
    const wrappedCriteria = (ns.masteryCriteria || []).map(text =>
      typeof text === 'string'
        ? { text, source: materialLabel, addedAt: new Date().toISOString() }
        : text
    );

    // Find or create parent skill
    const parentId = ns.cipCode
      ? await ParentSkills.findOrCreateByCip(ns.cipCode, ns.parentDisplayName || ns.cipCode)
      : (existingSkills[0]?.parent_skill_id || null);

    if (!parentId) {
      allIssues.push({ type: 'new_skill_no_parent', skill: ns.conceptKey });
      continue;
    }

    const skillId = await SubSkills.create({
      parentSkillId: parentId,
      name: ns.name,
      description: ns.description,
      skillType: ns.skillType,
      sourceCourseId: courseId,
      conceptKey: ns.conceptKey,
      category: ns.category,
      bloomsLevel: ns.bloomsLevel,
      masteryCriteria: wrappedCriteria,
      evidence: ns.evidence || {},
      extractionModel: 'claude-haiku-4-5',
      schemaVersion: 2,
    });

    // Bind to the chunks we actually sent
    const bindings = chunks.map(c => ({
      chunkId: c.id,
      subSkillId: skillId,
      extractionContext: null,
      confidence: 0.8,
    }));
    await ChunkSkillBindings.createBatch(bindings);

    createdSkillIds.push(skillId);
    newSkillCount++;
  }

  // Mark only the chunks we actually sent as extracted
  await Chunks.updateStatusBatch(unfinishedChunkIds, 'extracted');

  onProgress?.(`Enrichment complete: ${enrichedCount} enriched, ${newSkillCount} new skills.`);

  return {
    enriched: enrichedCount,
    newSkills: newSkillCount,
    issues: allIssues,
    createdSkillIds,
  };
}

// ============================================================
// Chapter-Level Retry Extraction
// ============================================================

/**
 * Run extraction on a subset of chapter groups for retry.
 * Uses identity matching against existing skills — matched skills are
 * enriched, genuinely new skills are created.
 *
 * @param {string} courseId
 * @param {string} materialId
 * @param {Array} chapterGroups - Pre-filtered chapter groups (only unfinished chunks)
 * @param {Array} existingSkills - Existing SubSkills for this course
 * @param {object} callbacks
 * @returns {Promise<{ totalSkills, chapters, issues }>}
 */
export async function extractChaptersOnly(courseId, materialId, chapterGroups, existingSkills, callbacks = {}) {
  const { onProgress, onChapterComplete } = callbacks;
  const allIssues = [];

  const material = await Materials.getById(materialId);
  const materialLabel = material?.label || 'Unknown Material';

  // Resolve parent skill from existing skills
  const parentCounts = {};
  for (const s of existingSkills) {
    if (s.parent_skill_id) {
      parentCounts[s.parent_skill_id] = (parentCounts[s.parent_skill_id] || 0) + 1;
    }
  }
  const parentSkillId = Object.entries(parentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Split oversized chapters
  chapterGroups = splitOversizedChapters(chapterGroups);

  onProgress?.(`Retrying ${chapterGroups.length} chapter(s)...`);

  const allExtractedSkills = [];
  const allSkillsByChapter = [];

  for (let i = 0; i < chapterGroups.length; i++) {
    const group = chapterGroups[i];
    onProgress?.(`Extracting chapter ${group.chapter} (${i + 1}/${chapterGroups.length})...`);

    // A6: isFirstChapter = false always — CIP detection unnecessary for retry
    const result = await extractChapter(group, false, materialLabel, { onProgress });
    allIssues.push(...result.issues);

    if (result.skills.length === 0) {
      // Mark chunks as failed (increments fail_count, transitions to terminal at threshold)
      await Chunks.markFailedBatch(group.chunkIds);
      onChapterComplete?.(group.chapter, 0);
      continue;
    }

    allExtractedSkills.push(...result.skills);
    allSkillsByChapter.push({ chapter: group.chapter, skills: result.skills, chunks: group.chunks, chunkIds: group.chunkIds });
    onChapterComplete?.(group.chapter, result.skills.length);

    // Rate limiting
    if (i < chapterGroups.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (allExtractedSkills.length === 0) {
    return { totalSkills: 0, chapters: [], issues: allIssues };
  }

  // Identity matching against existing skills
  onProgress?.('Matching skills against existing...');
  const { matched, newSkills } = matchExtractedSkills(allExtractedSkills, existingSkills);
  onProgress?.(`${matched.length} matched, ${newSkills.length} new.`);

  const conceptKeyToId = new Map();
  const createdSkillIds = [];
  let totalSkills = 0;

  try {
    await withTransaction(async () => {
      // 1. Update matched skills (enrich with new criteria/evidence)
      for (const m of matched) {
        await SubSkills.updateFromReextraction(m.existingId, {
          description: m.extracted.description,
          masteryCriteria: (m.extracted.masteryCriteria || []).map(c => typeof c === 'string' ? c : c.text),
          evidence: m.extracted.evidence || {},
          bloomsLevel: m.extracted.bloomsLevel,
          skillType: m.extracted.skillType,
          materialLabel,
        });
        conceptKeyToId.set(m.extracted.conceptKey, m.existingId);
      }

      // 2. Create new skills
      for (const ns of newSkills) {
        const skillId = await SubSkills.create({
          parentSkillId,
          name: ns.name,
          description: ns.description,
          skillType: ns.skillType,
          sourceCourseId: courseId,
          conceptKey: ns.conceptKey,
          category: ns.category,
          bloomsLevel: ns.bloomsLevel,
          masteryCriteria: ns.masteryCriteria,
          evidence: ns.evidence || {},
          extractionModel: 'claude-haiku-4-5',
          schemaVersion: 2,
        });
        createdSkillIds.push(skillId);
        conceptKeyToId.set(ns.conceptKey, skillId);
      }

      // 3. Resolve chunk bindings + prerequisites per chapter
      for (const chGroup of allSkillsByChapter) {
        const skillIdMap = new Map();
        for (const s of chGroup.skills) {
          const id = conceptKeyToId.get(s.conceptKey);
          if (id) skillIdMap.set(s.conceptKey, id);
        }

        const bindings = resolveChunkBindings(chGroup.skills, chGroup, skillIdMap);
        await ChunkSkillBindings.createBatch(bindings, { externalTransaction: true });

        // Within-chapter prerequisites
        const prereqLinks = [];
        for (const s of chGroup.skills) {
          const skillId = skillIdMap.get(s.conceptKey);
          if (!skillId) continue;
          for (const prereqKey of (s.prerequisites || [])) {
            const prereqId = conceptKeyToId.get(prereqKey);
            if (prereqId && prereqId !== skillId) {
              prereqLinks.push({ subSkillId: skillId, prerequisiteId: prereqId, source: 'within_chapter' });
            }
          }
        }
        if (prereqLinks.length > 0) {
          await SkillPrerequisites.createBatch(prereqLinks, { externalTransaction: true });
        }

        // Mark chunks as extracted
        await Chunks.updateStatusBatch(chGroup.chunkIds, 'extracted', { externalTransaction: true });
      }
    });

    totalSkills = matched.length + newSkills.length;
  } catch (e) {
    allIssues.push({ type: 'retry_save_failed', error: e.message });
    return { totalSkills: 0, chapters: [], issues: allIssues };
  }

  // Cross-chapter prerequisite wiring
  if (allSkillsByChapter.length >= 2) {
    onProgress?.('Wiring cross-chapter prerequisites...');
    try {
      const { links, issues: wireIssues } = await wireCrossChapterPrereqs(
        allSkillsByChapter, conceptKeyToId
      );
      allIssues.push(...wireIssues);
      if (links.length > 0) {
        await SkillPrerequisites.createBatch(links);
      }
    } catch (e) {
      allIssues.push({ type: 'cross_chapter_wiring_failed', error: e.message });
    }
  }

  onProgress?.(`Retry complete: ${totalSkills} skills (${matched.length} updated, ${newSkills.length} new).`);

  return {
    totalSkills,
    chapters: allSkillsByChapter.map(c => ({ chapter: c.chapter, skillCount: c.skills.length })),
    issues: allIssues,
    createdSkillIds,
  };
}

// ============================================================
// Identity Matching (deterministic)
// ============================================================

/**
 * Match newly extracted skills against existing skills by conceptKey.
 * Returns { matched, unmatched, newSkills }.
 *
 * @param {Array} extracted - Post-processed skills from LLM
 * @param {Array} existing - Existing skills from SubSkills.getByCourse
 * @returns {{ matched: Array<{ extracted, existingId }>, unmatched: Array, newSkills: Array }}
 */
export function matchExtractedSkills(extracted, existing) {
  // Build lookup maps
  const existingByKey = new Map();
  const existingByNormalizedName = new Map();
  for (const s of existing) {
    if (s.concept_key) existingByKey.set(s.concept_key, s);
    const norm = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    existingByNormalizedName.set(norm, s);
  }

  const matched = [];
  const newSkills = [];
  const matchedExistingIds = new Set();

  for (const ext of extracted) {
    // 1. Exact conceptKey match
    const exactMatch = existingByKey.get(ext.conceptKey);
    if (exactMatch) {
      matched.push({ extracted: ext, existingId: exactMatch.id, matchType: 'exact' });
      matchedExistingIds.add(exactMatch.id);
      continue;
    }

    // 2. Category + normalized name prefix match
    //    e.g. "logic-gates/half-adder" vs "logic-gates/half-adder-design"
    const extParts = (ext.conceptKey || '').split('/');
    const extCategory = extParts[0] || '';
    const extName = extParts.slice(1).join('/');
    let fuzzyMatch = null;
    for (const [key, s] of existingByKey) {
      const parts = key.split('/');
      const sCat = parts[0] || '';
      const sName = parts.slice(1).join('/');
      // Same category + one is a prefix of the other
      if (sCat === extCategory && (sName.startsWith(extName) || extName.startsWith(sName))) {
        if (!matchedExistingIds.has(s.id)) {
          fuzzyMatch = s;
          break;
        }
      }
    }
    if (fuzzyMatch) {
      matched.push({ extracted: ext, existingId: fuzzyMatch.id, matchType: 'fuzzy_key' });
      matchedExistingIds.add(fuzzyMatch.id);
      continue;
    }

    // 3. Normalized name match (last resort)
    const extNorm = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameMatch = existingByNormalizedName.get(extNorm);
    if (nameMatch && !matchedExistingIds.has(nameMatch.id)) {
      matched.push({ extracted: ext, existingId: nameMatch.id, matchType: 'name' });
      matchedExistingIds.add(nameMatch.id);
      continue;
    }

    // No match — new skill
    newSkills.push(ext);
  }

  // Existing skills not matched by any extraction
  const unmatched = existing.filter(s => !matchedExistingIds.has(s.id));

  return { matched, unmatched, newSkills };
}

// ============================================================
// Re-extraction Orchestrator
// ============================================================

/**
 * Re-extract skills from a material, preserving identity and mastery.
 *
 * @param {string} courseId
 * @param {string} materialId
 * @param {object} options
 * @param {function} [options.onProgress]
 * @param {function} [options.onChapterComplete]
 * @returns {Promise<{ matched, created, unmatchedExisting, issues }>}
 */
export async function reExtractCourse(courseId, materialId, options = {}) {
  const { onProgress, onChapterComplete } = options;
  const allIssues = [];

  // --- Load existing skills for this course ---
  onProgress?.('Loading existing skills...');
  const existingSkills = await SubSkills.getByCourse(courseId);
  if (existingSkills.length === 0) {
    // No existing skills — just run normal extraction
    onProgress?.('No existing skills found. Running full extraction.');
    return extractCourse(courseId, materialId, options);
  }

  // --- Load chunks ---
  onProgress?.('Loading chunks...');
  const chunks = await Chunks.getByMaterial(materialId);
  if (chunks.length === 0) {
    return { matched: 0, created: 0, unmatchedExisting: [], issues: [{ type: 'no_chunks' }] };
  }

  const material = await Materials.getById(materialId);
  const materialLabel = material?.label || 'Unknown Material';

  // --- Step 0: Group by chapter ---
  onProgress?.('Grouping chunks by chapter...');
  let chapterGroups = groupChunksByChapter(chunks);
  chapterGroups = splitOversizedChapters(chapterGroups);
  onProgress?.(`Found ${chapterGroups.length} chapters to re-extract.`);

  // --- Steps 1-3: Extract each chapter (same as extractCourse) ---
  let parentSkillId = existingSkills[0]?.parent_skill_id || null;
  const allExtractedSkills = [];
  const allSkillsByChapter = [];

  for (let i = 0; i < chapterGroups.length; i++) {
    const group = chapterGroups[i];
    onProgress?.(`Re-extracting chapter ${group.chapter} (${i + 1}/${chapterGroups.length})...`);

    const result = await extractChapter(group, i === 0, materialLabel, options);
    allIssues.push(...result.issues);

    // If first chapter returns CIP, update parent if needed
    if (i === 0 && result.cipCode) {
      parentSkillId = await ParentSkills.findOrCreateByCip(result.cipCode, result.parentDisplayName || result.cipCode);
    }

    allExtractedSkills.push(...result.skills);
    allSkillsByChapter.push({ chapter: group.chapter, skills: result.skills, chunks: group.chunks });
    onChapterComplete?.(group.chapter, result.skills.length);

    // Rate limiting
    if (i < chapterGroups.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (allExtractedSkills.length === 0) {
    return { matched: 0, created: 0, unmatchedExisting: existingSkills.map(s => s.concept_key), issues: allIssues };
  }

  // --- Identity matching ---
  onProgress?.('Matching skills against existing...');
  const { matched, unmatched, newSkills } = matchExtractedSkills(allExtractedSkills, existingSkills);
  onProgress?.(`${matched.length} matched, ${newSkills.length} new, ${unmatched.length} unmatched existing.`);

  // --- Save in single transaction ---
  const conceptKeyToId = new Map();

  try {
    await withTransaction(async () => {
      // 1. Update matched skills
      for (const m of matched) {
        await SubSkills.updateFromReextraction(m.existingId, {
          description: m.extracted.description,
          masteryCriteria: (m.extracted.masteryCriteria || []).map(c => typeof c === 'string' ? c : c.text),
          evidence: m.extracted.evidence || {},
          bloomsLevel: m.extracted.bloomsLevel,
          skillType: m.extracted.skillType,
          materialLabel,
        });
        conceptKeyToId.set(m.extracted.conceptKey, m.existingId);
      }

      // 2. Create new skills
      for (const ns of newSkills) {
        const skillId = await SubSkills.create({
          parentSkillId,
          name: ns.name,
          description: ns.description,
          skillType: ns.skillType,
          sourceCourseId: courseId,
          conceptKey: ns.conceptKey,
          category: ns.category,
          bloomsLevel: ns.bloomsLevel,
          masteryCriteria: ns.masteryCriteria,
          evidence: ns.evidence || {},
          extractionModel: 'claude-haiku-4-5',
          schemaVersion: 2,
        });
        conceptKeyToId.set(ns.conceptKey, skillId);
      }

      // 3. Clear old bindings for these chunks and rebuild
      const allChunkIds = chapterGroups.flatMap(g => g.chunkIds);
      await ChunkSkillBindings.deleteByChunkIds(allChunkIds, { externalTransaction: true });

      for (const chGroup of allSkillsByChapter) {
        const chapterSkills = chGroup.skills;
        const skillIdMap = new Map();
        for (const s of chapterSkills) {
          const id = conceptKeyToId.get(s.conceptKey);
          if (id) skillIdMap.set(s.conceptKey, id);
        }
        const bindings = resolveChunkBindings(chapterSkills, chGroup, skillIdMap);
        await ChunkSkillBindings.createBatch(bindings, { externalTransaction: true });
      }

      // 4. Clear and rebuild prerequisites for ALL matched + new skills
      const allAffectedIds = [...conceptKeyToId.values()];
      for (const id of allAffectedIds) {
        await SkillPrerequisites.deleteForSkill(id);
      }

      // Within-chapter prereqs
      const prereqLinks = [];
      for (const chGroup of allSkillsByChapter) {
        for (const s of chGroup.skills) {
          const skillId = conceptKeyToId.get(s.conceptKey);
          if (!skillId) continue;
          for (const prereqKey of (s.prerequisites || [])) {
            const prereqId = conceptKeyToId.get(prereqKey);
            if (prereqId && prereqId !== skillId) {
              prereqLinks.push({ subSkillId: skillId, prerequisiteId: prereqId, source: 'within_chapter' });
            }
          }
        }
      }
      if (prereqLinks.length > 0) {
        await SkillPrerequisites.createBatch(prereqLinks, { externalTransaction: true });
      }

      // Mark chunks as extracted
      const allChunkIds2 = chapterGroups.flatMap(g => g.chunkIds);
      await Chunks.updateStatusBatch(allChunkIds2, 'extracted', { externalTransaction: true });
    });
  } catch (e) {
    allIssues.push({ type: 're_extraction_save_failed', error: e.message });
    return { matched: 0, created: 0, unmatchedExisting: [], issues: allIssues };
  }

  // --- Step 4: Cross-chapter prerequisite wiring ---
  if (allSkillsByChapter.length >= 2) {
    onProgress?.('Wiring cross-chapter prerequisites...');
    try {
      const { links, issues: wireIssues } = await wireCrossChapterPrereqs(
        allSkillsByChapter, conceptKeyToId
      );
      allIssues.push(...wireIssues);
      if (links.length > 0) {
        await SkillPrerequisites.createBatch(links);
      }
    } catch (e) {
      allIssues.push({ type: 'cross_chapter_wiring_failed', error: e.message });
    }
  }

  onProgress?.(`Re-extraction complete: ${matched.length} updated, ${newSkills.length} new, ${unmatched.length} unmatched.`);

  return {
    matched: matched.length,
    created: newSkills.length,
    unmatchedExisting: unmatched.map(s => ({ id: s.id, conceptKey: s.concept_key, name: s.name })),
    issues: allIssues,
  };
}
