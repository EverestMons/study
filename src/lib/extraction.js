// ============================================================
// extraction.js — Skill Extraction Pipeline v2
//
// Three-tier pipeline: Deterministic pre-processing → LLM extraction → 
// Deterministic post-processing. See docs/skill-extraction-v2-spec.md.
// ============================================================

import { callClaude, extractJSON, isApiError } from './api.js';
import {
  Chunks, SubSkills, ChunkSkillBindings, SkillPrerequisites,
  ParentSkills, Materials, Facets, FacetMastery, ChunkFacetBindings,
  SkillCourses, withTransaction, getDb
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
  let blockquoteCount = 0;
  let subsectionCount = 0;
  const subsections = [];
  let orderedListCount = 0;
  let unorderedListCount = 0;

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
    blockquoteCount += meta.blockquote_count || 0;
    subsectionCount += meta.subsection_count || 0;
    for (const sub of (meta.subsections || [])) subsections.push(sub);
    orderedListCount += meta.ordered_list_count || 0;
    unorderedListCount += meta.unordered_list_count || 0;
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
    blockquoteCount,
    subsectionCount,
    subsections,
    orderedListCount,
    unorderedListCount,
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
    structured: (meta.subsectionCount || 0) > 2,
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
 * Build a chunk index for the LLM — gives it chunk IDs, labels, previews.
 */
function buildChunkIndex(chunks) {
  return chunks.map(c => {
    const label = c.label || `Section ${c.section_path || c.sectionPath || '?'}`;
    const preview = (c.content || '').substring(0, 200).replace(/\n+/g, ' ');
    const pCount = (c.content || '').split(/\n{2,}/).filter(p => p.trim()).length;
    return `  [${c.id}] "${label}" (${pCount} paragraphs) — ${preview}...`;
  }).join('\n');
}

/**
 * Format chapter content with [CHUNK] markers and [P#] paragraph numbering.
 */
function formatChapterContentWithIds(chunks) {
  return chunks.map(c => {
    const label = c.label || `Section ${c.section_path || c.sectionPath || '?'}`;
    const header = `[CHUNK id="${c.id}" label="${label}"]`;
    const paragraphs = (c.content || '').split(/\n{2,}/).filter(p => p.trim());
    const numbered = paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
    return `${header}\n${numbered}\n[/CHUNK]`;
  }).join('\n\n');
}

/**
 * Build the system prompt for initial extraction (faceted output).
 */
function buildInitialExtractionPrompt(profile, isFirstChapter, chapterGroup) {
  const { sectionHeadings, estimatedSkillRange, candidates } = profile;
  const [min, max] = estimatedSkillRange;

  const boldTermList = candidates
    .filter(c => c.source === 'bold_term' || c.confidence === 'high')
    .map(c => c.term)
    .slice(0, 50);

  const defList = candidates
    .filter(c => c.definition)
    .map(c => c.definition.substring(0, 80))
    .slice(0, 30);

  const eqLevel = (profile.contentSignals?.quantitative) ? 'heavy'
    : (profile.contentSignals?.procedural) ? 'moderate'
    : (candidates.some(c => c.definition)) ? 'light' : 'none';

  const chunkIndex = buildChunkIndex(chapterGroup.chunks);

  let prompt = `You are a curriculum analyst extracting skills with fine-grained facets from a textbook chapter.

CHAPTER STRUCTURE:
- Sections: ${sectionHeadings.length}
${sectionHeadings.map(h => `  - ${h}`).join('\n')}

CHUNK INDEX (use these exact IDs in your sourceChunks references):
${chunkIndex}

STRUCTURAL ANALYSIS (from document parsing):
- Bold terms identified (${boldTermList.length}): ${boldTermList.join(', ')}
- Definitions found (${defList.length}): ${defList.map(d => `"${d}"`).join('; ')}
- Worked examples detected: ${profile.contentSignals?.procedural ? 'yes' : 'none detected'}
- Equation/math content: ${eqLevel}
- Tables: ${profile.contentSignals?.referenceHeavy ? 'many' : 'few/none'}
- Code blocks: ${profile.contentSignals?.codeHeavy ? 'yes' : 'few/none'}
- Blockquotes: ${(chapterGroup.aggregateMetadata?.blockquoteCount || 0) > 0 ? chapterGroup.aggregateMetadata.blockquoteCount : 'none'}
- Internal structure: ${(chapterGroup.aggregateMetadata?.subsectionCount || 0) > 0 ? chapterGroup.aggregateMetadata.subsectionCount + ' subsections' : 'flat (no sub-headings)'}

TARGET: Extract ${min}-${max} skills, each with 2-6 facets.

INSTRUCTIONS:
1. Each bold term is a candidate concept. Confirm it as a skill, merge it with related terms, or reject it (not a standalone learnable concept).
2. Each definition anchors at least one skill.
3. Every SKILL must pass these tests:
   - DIAGNOSTIC TEST: Can you ask ONE question to check if a student knows this? If not, it's too vague.
   - PRACTICE TEST: Can you generate 5 different problems at varying difficulty? If not, it's too narrow.
   - DECAY TEST: Can a student forget THIS skill independently of other skills? If not, merge it.
4. Break each skill into 2-6 FACETS — independently-testable, independently-forgettable capabilities.
   Each FACET must also pass the decay test: can a student forget THIS FACET while retaining other facets of the same skill?
   If not, merge it into a neighboring facet.
5. For each facet, reference the exact chunk IDs and paragraph numbers where that facet is taught.`;

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
  "category": "Chapter Topic",
  "skillType": "procedural",
  "bloomsLevel": "apply",
  "prerequisites": ["concept-key-of-prereq"],
  "evidence": {
    "anchorTerms": ["term1", "term2"],
    "definitionsFound": ["definition text..."],
    "examplesInSource": 2,
    "equationPresence": true,
    "figureReferences": ["Figure 3.15 (only include if the figure content is described in text — do not reference stripped visuals)"]
  },
  "facets": [
    {
      "name": "Facet Name",
      "conceptKey": "category/facet-kebab-name",
      "description": "What the student can specifically do",
      "skillType": "procedural",
      "bloomsLevel": "apply",
      "masteryCriteria": ["Specific testable statement about this facet"],
      "evidence": { "anchorTerms": ["specific term"], "definitionsFound": ["specific definition"] },
      "sourceChunks": [
        {
          "chunkId": "exact-chunk-id-from-index",
          "bindingType": "teaches",
          "paragraphs": [3, 4, 5],
          "confidence": 0.95
        }
      ]
    }
  ]
}]

RULES:
- Prerequisites reference concept keys of OTHER skills in this chapter (cross-chapter wired later).
- conceptKey format: kebab-case "{category}/{skill-name}". Must be deterministic.
- Each skill MUST have 2-6 facets. Each facet is independently testable and independently forgettable.
- masteryCriteria on facets: 1-3 testable statements per facet.
- sourceChunks: Use EXACT chunk IDs from the CHUNK INDEX above.
  - bindingType: "teaches" (chunk explains/demonstrates this facet), "references" (chunk mentions it), "prerequisite_for" (chunk teaches prerequisite knowledge)
  - paragraphs: Array of paragraph numbers [P1]=1, [P2]=2, etc. that are most relevant to this facet
  - confidence: 0.0-1.0 how strongly this chunk teaches this facet
- A facet may have ZERO sourceChunks if the concept is implied but not explicitly taught (rare).
- A facet may reference MULTIPLE chunks if the concept spans sections.
- DO NOT extract skills/facets for front matter, table of contents, or index entries.
- DO NOT create facets for individual vocabulary words unless they represent a distinct learnable concept.
- Source material may have contained diagrams, images, charts, or visual elements that were stripped during text extraction. Do NOT reference visuals that are not present in the text content. Never say "as shown in the figure/slide/diagram" or similar phrases unless the visual is explicitly described in the text. Instead, describe the concept verbally using only the information available in the text.`;

  return prompt;
}

/**
 * Build the system prompt for incremental enrichment (facet-level).
 */
function buildEnrichmentPrompt(existingSkills, existingFacets, materialLabel, chunkIndex) {
  const facetsBySkill = new Map();
  for (const f of existingFacets) {
    if (!facetsBySkill.has(f.skill_id)) facetsBySkill.set(f.skill_id, []);
    facetsBySkill.get(f.skill_id).push(f);
  }

  const skillsSummary = existingSkills.map(s => {
    const facets = facetsBySkill.get(s.id) || [];
    const facetLines = facets.map(f => {
      const criteria = typeof f.mastery_criteria === 'string'
        ? JSON.parse(f.mastery_criteria || '[]') : (f.mastery_criteria || []);
      return `    - ${f.concept_key || '?'}: "${f.name}" criteria: ${criteria.map(c => typeof c === 'string' ? c : c.text).slice(0, 3).join('; ')}`;
    }).join('\n');
    return `  - ${s.concept_key}: "${s.name}" [${s.category || 'uncategorized'}]\n${facetLines}`;
  }).join('\n');

  return `You are a curriculum analyst. A student has uploaded new material for a course that already has extracted skills and facets.

EXISTING SKILLS AND FACETS (${existingSkills.length} skills, ${existingFacets.length} facets):
${skillsSummary}

CHUNK INDEX (use these exact IDs in sourceChunks references):
${chunkIndex}

NEW MATERIAL — ${materialLabel}:

YOUR JOB:
1. For each concept in the new material, check if it matches an existing skill/facet.
   Match by CONCEPT, not by exact wording.
2. For MATCHING skills:
   - Return the existing skill's conceptKey
   - For each existing facet that the new material covers, add new sourceChunks bindings
   - If the new material reveals a NEW facet under an existing skill, add it
3. For GENUINELY NEW concepts (not covered by any existing skill):
   - Create a new skill with full faceted schema
4. Apply the same quality tests: diagnostic, practice, decay.

RESPOND WITH ONLY a JSON object:
{
  "enrichments": [
    {
      "existingConceptKey": "category/skill-name",
      "facetUpdates": [
        {
          "existingFacetConceptKey": "category/facet-name",
          "newCriteria": ["New testable statement"],
          "newAnchorTerms": ["new term"],
          "sourceChunks": [
            { "chunkId": "exact-chunk-id", "bindingType": "teaches", "paragraphs": [2, 3], "confidence": 0.9 }
          ]
        }
      ],
      "newFacets": [
        {
          "name": "New Facet", "conceptKey": "category/new-facet",
          "description": "...", "skillType": "procedural", "bloomsLevel": "apply",
          "masteryCriteria": ["..."],
          "evidence": { "anchorTerms": [], "definitionsFound": [] },
          "sourceChunks": [
            { "chunkId": "exact-chunk-id", "bindingType": "teaches", "paragraphs": [1, 2], "confidence": 0.9 }
          ]
        }
      ]
    }
  ],
  "newSkills": [
    {
      "name": "...", "conceptKey": "...", "description": "...", "category": "...",
      "skillType": "...", "bloomsLevel": "...",
      "prerequisites": [],
      "evidence": { "anchorTerms": [], "definitionsFound": [] },
      "facets": [ { "name": "...", "conceptKey": "...", "description": "...", "skillType": "...", "bloomsLevel": "...", "masteryCriteria": ["..."], "evidence": {}, "sourceChunks": [{ "chunkId": "...", "bindingType": "teaches", "paragraphs": [1], "confidence": 0.9 }] } ],
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

  // 7. MasteryCriteria minimum (skill-level — for backward compat on sub_skills table)
  for (const s of deduped) {
    if (!s.masteryCriteria || s.masteryCriteria.length < 2) {
      issues.push({ type: 'insufficient_criteria', skill: s.conceptKey, count: s.masteryCriteria?.length || 0 });
    }
  }

  // 8. Facet auto-generation if missing
  for (const s of deduped) {
    if (!s.facets || s.facets.length === 0) {
      // LLM didn't produce facets — auto-generate a single facet from skill criteria
      s.facets = [{
        name: s.name,
        conceptKey: s.conceptKey ? s.conceptKey + '/core' : null,
        description: s.description,
        skillType: s.skillType,
        bloomsLevel: s.bloomsLevel,
        masteryCriteria: (s.masteryCriteria || []).map(c => typeof c === 'string' ? c : c.text),
        evidence: s.evidence || {},
        sourceChunks: [],
      }];
      issues.push({ type: 'auto_facet_created', skill: s.conceptKey });
    }
    if (s.facets.length > 8) {
      issues.push({ type: 'excessive_facets', skill: s.conceptKey, count: s.facets.length });
    }
  }

  // 9. Facet conceptKey uniqueness
  const allFacetKeys = new Set();
  for (const s of deduped) {
    for (const f of (s.facets || [])) {
      if (!f.conceptKey) continue;
      if (allFacetKeys.has(f.conceptKey)) {
        let counter = 2;
        while (allFacetKeys.has(f.conceptKey + '-' + counter)) counter++;
        issues.push({ type: 'duplicate_facet_key', facet: f.conceptKey });
        f.conceptKey = f.conceptKey + '-' + counter;
      }
      allFacetKeys.add(f.conceptKey);
    }
  }

  // 10. Facet mastery criteria wrapping
  for (const s of deduped) {
    for (const f of (s.facets || [])) {
      if (Array.isArray(f.masteryCriteria)) {
        f.masteryCriteria = f.masteryCriteria.map(text =>
          typeof text === 'string'
            ? { text, source: materialLabel, addedAt: new Date().toISOString() }
            : text
        );
      } else {
        f.masteryCriteria = [];
      }
    }
  }

  // 11. Facet criteria minimum
  for (const s of deduped) {
    for (const f of (s.facets || [])) {
      if (!f.masteryCriteria || f.masteryCriteria.length < 1) {
        issues.push({ type: 'facet_no_criteria', facet: f.conceptKey });
      }
    }
  }

  return { skills: deduped, issues };
}

/**
 * Resolve chunk bindings directly from LLM facet output.
 * Reads chunk IDs from facet.sourceChunks, validates against valid chunk set.
 * Falls back to heading-label matching at lower confidence for invalid IDs.
 *
 * @param {Array} skills - Post-processed skills with facets[].sourceChunks
 * @param {object} chapterGroup - Chapter group with chunks
 * @param {Map<string, number>} facetKeyToId - Maps facet conceptKey to facet DB ID
 * @returns {{ facetBindings: Array, skillBindings: Array, issues: Array }}
 */
export function resolveChunkBindingsDirect(skills, chapterGroup, facetKeyToId) {
  const facetBindings = [];
  const skillBindings = []; // backward-compat chunk_skill_bindings
  const issues = [];
  const validChunkIds = new Set(chapterGroup.chunkIds);

  // Build paragraph count map for validation
  const chunkParagraphCounts = new Map();
  for (const chunk of chapterGroup.chunks) {
    const pCount = (chunk.content || '').split(/\n{2,}/).filter(p => p.trim()).length;
    chunkParagraphCounts.set(chunk.id, pCount);
  }

  // Build heading → chunkId lookup for fallback
  const headingToChunks = new Map();
  for (const chunk of chapterGroup.chunks) {
    const heading = chunk.label || `Section ${chunk.section_path || chunk.sectionPath}`;
    if (!headingToChunks.has(heading)) headingToChunks.set(heading, []);
    headingToChunks.get(heading).push(chunk.id);
  }

  const validBindingTypes = new Set(['teaches', 'references', 'prerequisite_for']);

  for (const skill of skills) {
    // Track chunk IDs bound at the skill level for backward-compat bindings
    const skillChunkIds = new Set();

    for (const facet of (skill.facets || [])) {
      const facetId = facetKeyToId.get(facet.conceptKey);
      if (!facetId) continue;

      let teachRank = 1;
      const sourceChunks = facet.sourceChunks || [];

      for (const sc of sourceChunks) {
        const bindingType = validBindingTypes.has(sc.bindingType) ? sc.bindingType : 'teaches';

        if (validChunkIds.has(sc.chunkId)) {
          // Direct ID match — best case
          const maxP = chunkParagraphCounts.get(sc.chunkId) || 999;
          const validParagraphs = (sc.paragraphs || []).filter(p => p > 0 && p <= maxP);

          facetBindings.push({
            chunkId: sc.chunkId,
            facetId,
            extractionContext: null,
            confidence: sc.confidence || 1.0,
            bindingType,
            qualityRank: bindingType === 'teaches' ? teachRank++ : 0,
            contentRange: validParagraphs.length > 0
              ? JSON.stringify({ paragraphs: validParagraphs })
              : null,
          });
          skillChunkIds.add(sc.chunkId);
        } else {
          // Invalid chunk ID — try heading-label fallback
          issues.push({ type: 'invalid_chunk_id', facet: facet.conceptKey, chunkId: sc.chunkId });

          // Attempt to match by treating chunkId as a partial label
          let fallbackResolved = false;
          for (const [heading, cids] of headingToChunks) {
            if (heading.toLowerCase().includes((sc.chunkId || '').toLowerCase()) ||
                (sc.chunkId || '').toLowerCase().includes(heading.toLowerCase())) {
              for (const cid of cids) {
                facetBindings.push({
                  chunkId: cid,
                  facetId,
                  extractionContext: heading,
                  confidence: 0.6,
                  bindingType,
                  qualityRank: 0,
                  contentRange: null,
                });
                skillChunkIds.add(cid);
              }
              fallbackResolved = true;
              break;
            }
          }
          if (!fallbackResolved) {
            issues.push({ type: 'unresolvable_chunk_ref', facet: facet.conceptKey, chunkId: sc.chunkId });
          }
        }
      }

      // Log unbound facets (no sourceChunks at all)
      if (sourceChunks.length === 0) {
        issues.push({ type: 'unbound_facet', facet: facet.conceptKey });
      }
    }

    // Build backward-compat skill-level bindings from deduplicated chunk IDs
    for (const cid of skillChunkIds) {
      skillBindings.push({
        chunkId: cid,
        subSkillId: null, // filled in by caller
        extractionContext: null,
        confidence: 1.0,
      });
    }
  }

  return { facetBindings, skillBindings, issues };
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
  if (isApiError(response)) {
    issues.push({ type: 'cross_chapter_api_error', error: response });
    return { links: [], issues };
  }
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
  const systemPrompt = buildInitialExtractionPrompt(profile, isFirstChapter, chapterGroup);

  // Build chapter content with [CHUNK id="..."] markers and [P#] paragraph numbering
  const chapterContent = formatChapterContentWithIds(chapterGroup.chunks);

  let rawSkills, cipCode, parentDisplayName;

  // Retry loop — covers API errors, JSON parse failures, and unexpected format
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        options.onProgress?.(`Chapter ${chapterGroup.chapter}: retry ${attempt}/${MAX_RETRIES}...`);
      }

      const response = await callClaude(
        systemPrompt,
        [{ role: 'user', content: `CHAPTER CONTENT:\n\n${chapterContent}` }],
        12288, // Increased for faceted output
        true // useHaiku
      );

      if (isApiError(response)) {
        throw new Error(response);
      }

      // Parse JSON from response
      const parsed = extractJSON(response);
      if (!parsed) {
        throw new Error('json_parse_failed: ' + (response?.substring(0, 200) || 'empty'));
      }

      // Handle first-chapter wrapper { cipCode, parentDisplayName, subSkills }
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
        throw new Error('unexpected_format');
      }

      break; // success — parsed and validated
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        return {
          skills: [],
          issues: [{ type: 'extraction_failed', chapter: chapterGroup.chapter, error: e.message }],
        };
      }
    }
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
  const allFacetIds = [];

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
      await Chunks.markFailedBatch(group.chunkIds, { type: 'empty_extraction', chapter: group.chapter });
      onChapterComplete?.(group.chapter, 0);
      continue;
    }

    // --- Save to DB in a single transaction ---
    try {
      await withTransaction(async () => {
        // Prepare skill records — masteryCriteria aggregated from facets for backward compat
        const skillRecords = result.skills.map(s => {
          // Aggregate mastery criteria from all facets for the sub_skills.mastery_criteria column
          const allCriteria = (s.facets || []).flatMap(f => f.masteryCriteria || []);
          return {
            parentSkillId: parentSkillId,
            name: s.name,
            description: s.description || null,
            skillType: s.skillType || null,
            sourceCourseId: courseId,
            conceptKey: s.conceptKey,
            category: s.category || null,
            bloomsLevel: s.bloomsLevel || null,
            masteryCriteria: allCriteria.length > 0 ? allCriteria : (s.masteryCriteria || []),
            evidence: s.evidence || {},
            extractionModel: 'claude-haiku-4-5',
            schemaVersion: 2,
          };
        });

        const skillIds = await SubSkills.createBatch(skillRecords, { externalTransaction: true });

        // Track skill↔course in junction table
        for (const sid of skillIds) {
          await SkillCourses.add(sid, courseId);
        }

        // Map conceptKey → id for cross-chapter wiring
        const skillIdMap = new Map();
        for (let j = 0; j < result.skills.length; j++) {
          const key = result.skills[j].conceptKey;
          skillIdMap.set(key, skillIds[j]);
          conceptKeyToId.set(key, skillIds[j]);
        }

        // Create facets under each skill
        const facetKeyToId = new Map();
        for (let j = 0; j < result.skills.length; j++) {
          const skill = result.skills[j];
          const skillId = skillIds[j];
          const facetRecords = (skill.facets || []).map(f => ({
            skillId,
            name: f.name,
            description: f.description || null,
            conceptKey: f.conceptKey || null,
            skillType: f.skillType || skill.skillType || null,
            bloomsLevel: f.bloomsLevel || skill.bloomsLevel || null,
            masteryCriteria: f.masteryCriteria || [],
            evidence: f.evidence || {},
          }));
          if (facetRecords.length > 0) {
            const facetIds = await Facets.createBatch(facetRecords, { externalTransaction: true });
            for (let k = 0; k < facetIds.length; k++) {
              const fKey = skill.facets[k].conceptKey;
              if (fKey) facetKeyToId.set(fKey, facetIds[k]);
              allFacetIds.push(facetIds[k]);
            }
            // Create facet_mastery records with FSRS defaults
            for (const fid of facetIds) {
              await FacetMastery.upsert(fid, {
                difficulty: 0.3, stability: 1.0, retrievability: 1.0,
                reps: 0, lapses: 0, lastReviewAt: null, nextReviewAt: null,
                totalMasteryPoints: 0.0,
              });
            }
          }
        }

        // Resolve chunk bindings from facet sourceChunks (direct ID resolution)
        const { facetBindings, skillBindings: rawSkillBindings, issues: bindIssues } =
          resolveChunkBindingsDirect(result.skills, group, facetKeyToId);
        allIssues.push(...bindIssues);

        // Save facet-level bindings
        if (facetBindings.length > 0) {
          await ChunkFacetBindings.createBatch(facetBindings, { externalTransaction: true });
        }

        // Save backward-compat skill-level bindings
        const skillLevelBindings = [];
        const seenSkillChunks = new Set();
        for (const skill of result.skills) {
          const skillId = skillIdMap.get(skill.conceptKey);
          if (!skillId) continue;
          for (const f of (skill.facets || [])) {
            for (const sc of (f.sourceChunks || [])) {
              const key = `${skillId}:${sc.chunkId}`;
              if (!seenSkillChunks.has(key) && group.chunkIds.includes(sc.chunkId)) {
                seenSkillChunks.add(key);
                skillLevelBindings.push({
                  chunkId: sc.chunkId,
                  subSkillId: skillId,
                  extractionContext: null,
                  confidence: sc.confidence || 1.0,
                });
              }
            }
          }
        }
        if (skillLevelBindings.length > 0) {
          await ChunkSkillBindings.createBatch(skillLevelBindings, { externalTransaction: true });
        }

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
      await Chunks.markFailedBatch(group.chunkIds, { type: 'save_failed', chapter: group.chapter, error: e.message });
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

  // Count facets for reporting
  const totalFacets = allSkillsByChapter.reduce((sum, ch) =>
    sum + ch.skills.reduce((s2, sk) => s2 + (sk.facets?.length || 0), 0), 0);
  onProgress?.(`Total facets created: ${totalFacets}`);

  return {
    totalSkills,
    totalFacets,
    chapters: allSkillsByChapter.map(c => ({ chapter: c.chapter, skillCount: c.skills.length })),
    issues: allIssues,
    cipCode,
    parentDisplayName,
    createdSkillIds: [...conceptKeyToId.values()],
    createdFacetIds: allFacetIds,
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

  // Load existing skills and facets scoped to THIS course only.
  const existingSkills = await SubSkills.getByCourse(courseId);
  if (existingSkills.length === 0) {
    onProgress?.('No existing skills found for this course. Running full extraction.');
    return extractCourse(courseId, materialId, options);
  }
  const existingFacets = await Facets.getByCourse(courseId);

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

  // Build content with chunk ID markers
  const content = formatChapterContentWithIds(chunks);
  const chunkIndex = buildChunkIndex(chunks);

  // Build enrichment prompt with facets
  const systemPrompt = buildEnrichmentPrompt(existingSkills, existingFacets, materialLabel, chunkIndex);

  onProgress?.(`Enriching from ${materialLabel} (${chunks.length} chunks)...`);

  const response = await callClaude(
    systemPrompt,
    [{ role: 'user', content: `NEW MATERIAL CONTENT:\n\n${content}` }],
    12288,
    true
  );

  if (isApiError(response)) {
    await Chunks.markFailedBatch(unfinishedChunkIds, { type: 'enrichment_api_error', error: response });
    return { enriched: 0, newSkills: 0, issues: [{ type: 'enrichment_api_error', error: response }] };
  }

  const parsed = extractJSON(response);
  if (!parsed || (!parsed.enrichments && !parsed.newSkills)) {
    await Chunks.markFailedBatch(unfinishedChunkIds, { type: 'enrichment_parse_failed' });
    return { enriched: 0, newSkills: 0, issues: [{ type: 'enrichment_parse_failed' }] };
  }

  let enrichedCount = 0;
  let newSkillCount = 0;
  const createdSkillIds = [];
  const createdFacetIds = [];
  const validChunkIds = new Set(chunks.map(c => c.id));

  // Process enrichments (facet-level)
  for (const e of (parsed.enrichments || [])) {
    const existing = await SubSkills.findByConceptKey(e.existingConceptKey);
    if (!existing) {
      allIssues.push({ type: 'enrichment_unresolved', key: e.existingConceptKey });
      continue;
    }

    // Process facet updates
    for (const fu of (e.facetUpdates || [])) {
      const existingFacet = await Facets.findByConceptKey(fu.existingFacetConceptKey);
      if (!existingFacet) {
        allIssues.push({ type: 'facet_update_unresolved', key: fu.existingFacetConceptKey });
        continue;
      }

      // Add new criteria to existing facet
      if (fu.newCriteria?.length) {
        const oldCriteria = typeof existingFacet.mastery_criteria === 'string'
          ? JSON.parse(existingFacet.mastery_criteria || '[]') : (existingFacet.mastery_criteria || []);
        const oldTexts = new Set(oldCriteria.map(c => typeof c === 'string' ? c : c.text));
        const newWrapped = fu.newCriteria.filter(t => !oldTexts.has(t))
          .map(text => ({ text, source: materialLabel, addedAt: new Date().toISOString() }));
        if (newWrapped.length > 0) {
          await Facets.update(existingFacet.id, {
            mastery_criteria: [...oldCriteria, ...newWrapped],
          });
        }
      }

      // Add new chunk bindings for this facet
      for (const sc of (fu.sourceChunks || [])) {
        if (!validChunkIds.has(sc.chunkId)) continue;
        await ChunkFacetBindings.create({
          chunkId: sc.chunkId,
          facetId: existingFacet.id,
          extractionContext: null,
          confidence: sc.confidence || 0.9,
          bindingType: sc.bindingType || 'teaches',
          qualityRank: 0,
          contentRange: sc.paragraphs?.length
            ? JSON.stringify({ paragraphs: sc.paragraphs })
            : null,
        });
      }
    }

    // Process new facets under existing skill
    for (const nf of (e.newFacets || [])) {
      const wrappedCriteria = (nf.masteryCriteria || []).map(text =>
        typeof text === 'string'
          ? { text, source: materialLabel, addedAt: new Date().toISOString() }
          : text
      );
      const facetId = await Facets.create({
        skillId: existing.id,
        name: nf.name,
        description: nf.description,
        conceptKey: nf.conceptKey,
        skillType: nf.skillType || existing.skill_type,
        bloomsLevel: nf.bloomsLevel || existing.blooms_level,
        masteryCriteria: wrappedCriteria,
        evidence: nf.evidence || {},
      });
      createdFacetIds.push(facetId);
      await FacetMastery.upsert(facetId, {
        difficulty: 0.3, stability: 1.0, retrievability: 1.0,
        reps: 0, lapses: 0, lastReviewAt: null, nextReviewAt: null,
        totalMasteryPoints: 0.0,
      });

      // Create chunk bindings for new facet
      for (const sc of (nf.sourceChunks || [])) {
        if (!validChunkIds.has(sc.chunkId)) continue;
        await ChunkFacetBindings.create({
          chunkId: sc.chunkId,
          facetId,
          extractionContext: null,
          confidence: sc.confidence || 0.9,
          bindingType: sc.bindingType || 'teaches',
          qualityRank: 0,
          contentRange: sc.paragraphs?.length
            ? JSON.stringify({ paragraphs: sc.paragraphs })
            : null,
        });
      }
    }

    // Update skill-level criteria (aggregate from all facets)
    await SubSkills.updateFromReextraction(existing.id, {
      description: existing.description,
      masteryCriteria: (e.facetUpdates || []).flatMap(fu => fu.newCriteria || []),
      evidence: { anchorTerms: [], definitionsFound: [] },
      materialLabel,
    });

    enrichedCount++;
  }

  // Process new skills (full faceted schema)
  for (const ns of (parsed.newSkills || [])) {
    const allCriteria = (ns.facets || []).flatMap(f =>
      (f.masteryCriteria || []).map(text =>
        typeof text === 'string'
          ? { text, source: materialLabel, addedAt: new Date().toISOString() }
          : text
      )
    );

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
      masteryCriteria: allCriteria,
      evidence: ns.evidence || {},
      extractionModel: 'claude-haiku-4-5',
      schemaVersion: 2,
    });
    await SkillCourses.add(skillId, courseId);

    // Create facets
    for (const f of (ns.facets || [])) {
      const wrappedCriteria = (f.masteryCriteria || []).map(text =>
        typeof text === 'string'
          ? { text, source: materialLabel, addedAt: new Date().toISOString() }
          : text
      );
      const facetId = await Facets.create({
        skillId,
        name: f.name,
        description: f.description,
        conceptKey: f.conceptKey,
        skillType: f.skillType || ns.skillType,
        bloomsLevel: f.bloomsLevel || ns.bloomsLevel,
        masteryCriteria: wrappedCriteria,
        evidence: f.evidence || {},
      });
      createdFacetIds.push(facetId);
      await FacetMastery.upsert(facetId, {
        difficulty: 0.3, stability: 1.0, retrievability: 1.0,
        reps: 0, lapses: 0, lastReviewAt: null, nextReviewAt: null,
        totalMasteryPoints: 0.0,
      });

      for (const sc of (f.sourceChunks || [])) {
        if (!validChunkIds.has(sc.chunkId)) continue;
        await ChunkFacetBindings.create({
          chunkId: sc.chunkId,
          facetId,
          extractionContext: null,
          confidence: sc.confidence || 0.9,
          bindingType: sc.bindingType || 'teaches',
          qualityRank: 0,
          contentRange: sc.paragraphs?.length
            ? JSON.stringify({ paragraphs: sc.paragraphs })
            : null,
        });
      }
    }

    createdSkillIds.push(skillId);
    newSkillCount++;
  }

  await Chunks.updateStatusBatch(unfinishedChunkIds, 'extracted');

  onProgress?.(`Enrichment complete: ${enrichedCount} enriched, ${newSkillCount} new skills.`);

  return {
    enriched: enrichedCount,
    newSkills: newSkillCount,
    issues: allIssues,
    createdSkillIds,
    createdFacetIds,
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
      await Chunks.markFailedBatch(group.chunkIds, { type: 'empty_extraction', chapter: group.chapter });
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
  const createdFacetIds = [];
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

      // 2. Create new skills with facets
      for (const ns of newSkills) {
        const allCriteria = (ns.facets || []).flatMap(f => f.masteryCriteria || []);
        const skillId = await SubSkills.create({
          parentSkillId,
          name: ns.name,
          description: ns.description,
          skillType: ns.skillType,
          sourceCourseId: courseId,
          conceptKey: ns.conceptKey,
          category: ns.category,
          bloomsLevel: ns.bloomsLevel,
          masteryCriteria: allCriteria.length > 0 ? allCriteria : (ns.masteryCriteria || []),
          evidence: ns.evidence || {},
          extractionModel: 'claude-haiku-4-5',
          schemaVersion: 2,
        });
        await SkillCourses.add(skillId, courseId);
        createdSkillIds.push(skillId);
        conceptKeyToId.set(ns.conceptKey, skillId);

        // Create facets for new skills
        for (const f of (ns.facets || [])) {
          const facetId = await Facets.create({
            skillId,
            name: f.name, description: f.description,
            conceptKey: f.conceptKey,
            skillType: f.skillType || ns.skillType,
            bloomsLevel: f.bloomsLevel || ns.bloomsLevel,
            masteryCriteria: f.masteryCriteria || [],
            evidence: f.evidence || {},
          });
          createdFacetIds.push(facetId);
          await FacetMastery.upsert(facetId, {
            difficulty: 0.3, stability: 1.0, retrievability: 1.0,
            reps: 0, lapses: 0, lastReviewAt: null, nextReviewAt: null,
            totalMasteryPoints: 0.0,
          });
        }
      }

      // 3. Resolve chunk bindings + prerequisites per chapter
      for (const chGroup of allSkillsByChapter) {
        // Build facetKeyToId for this chapter's skills
        const facetKeyToId = new Map();
        for (const s of chGroup.skills) {
          const skillId = conceptKeyToId.get(s.conceptKey);
          if (!skillId) continue;
          const skillFacets = await Facets.getBySkill(skillId);
          for (const f of skillFacets) {
            if (f.concept_key) facetKeyToId.set(f.concept_key, f.id);
          }
        }

        // Resolve facet-level bindings
        const { facetBindings, issues: bindIssues } =
          resolveChunkBindingsDirect(chGroup.skills, chGroup, facetKeyToId);
        allIssues.push(...bindIssues);
        if (facetBindings.length > 0) {
          await ChunkFacetBindings.createBatch(facetBindings, { externalTransaction: true });
        }

        // Backward-compat skill-level bindings
        const seenSkillChunks = new Set();
        const skillLevelBindings = [];
        for (const s of chGroup.skills) {
          const skillId = conceptKeyToId.get(s.conceptKey);
          if (!skillId) continue;
          for (const f of (s.facets || [])) {
            for (const sc of (f.sourceChunks || [])) {
              const key = `${skillId}:${sc.chunkId}`;
              if (!seenSkillChunks.has(key) && chGroup.chunkIds.includes(sc.chunkId)) {
                seenSkillChunks.add(key);
                skillLevelBindings.push({ chunkId: sc.chunkId, subSkillId: skillId, extractionContext: null, confidence: sc.confidence || 1.0 });
              }
            }
          }
        }
        if (skillLevelBindings.length > 0) {
          await ChunkSkillBindings.createBatch(skillLevelBindings, { externalTransaction: true });
        }

        // Within-chapter prerequisites
        const prereqLinks = [];
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
    createdFacetIds,
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
  const reextractFacetIds = [];

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
        await SkillCourses.add(skillId, courseId);
        conceptKeyToId.set(ns.conceptKey, skillId);
      }

      // 3. Clear old bindings for these chunks and rebuild
      const allChunkIds = chapterGroups.flatMap(g => g.chunkIds);
      await ChunkSkillBindings.deleteByChunkIds(allChunkIds, { externalTransaction: true });

      for (const chGroup of allSkillsByChapter) {
        // Build facetKeyToId for this chapter
        const facetKeyToId = new Map();
        for (const s of chGroup.skills) {
          const skillId = conceptKeyToId.get(s.conceptKey);
          if (!skillId) continue;

          // Create facets for new skills; load existing facets for matched skills
          for (const f of (s.facets || [])) {
            const existingFacet = f.conceptKey ? await Facets.findByConceptKey(f.conceptKey) : null;
            if (existingFacet) {
              facetKeyToId.set(f.conceptKey, existingFacet.id);
            } else {
              const facetId = await Facets.create({
                skillId,
                name: f.name, description: f.description,
                conceptKey: f.conceptKey,
                skillType: f.skillType || s.skillType,
                bloomsLevel: f.bloomsLevel || s.bloomsLevel,
                masteryCriteria: f.masteryCriteria || [],
                evidence: f.evidence || {},
              });
              reextractFacetIds.push(facetId);
              await FacetMastery.upsert(facetId, {
                difficulty: 0.3, stability: 1.0, retrievability: 1.0,
                reps: 0, lapses: 0, lastReviewAt: null, nextReviewAt: null,
                totalMasteryPoints: 0.0,
              });
              if (f.conceptKey) facetKeyToId.set(f.conceptKey, facetId);
            }
          }
        }

        // Delete old facet bindings for these chunks
        // (facet bindings referencing chunks in this chapter)
        for (const cid of chGroup.chunkIds) {
          const oldBindings = await ChunkFacetBindings.getByChunk(cid);
          const facetIds = [...new Set(oldBindings.map(b => b.facet_id))];
          if (facetIds.length > 0) {
            await ChunkFacetBindings.deleteByFacetIds(facetIds, { externalTransaction: true });
          }
        }

        // Resolve new facet-level bindings
        const { facetBindings, issues: bindIssues } =
          resolveChunkBindingsDirect(chGroup.skills, chGroup, facetKeyToId);
        allIssues.push(...bindIssues);
        if (facetBindings.length > 0) {
          await ChunkFacetBindings.createBatch(facetBindings, { externalTransaction: true });
        }

        // Backward-compat skill-level bindings
        const seenSkillChunks = new Set();
        const skillLevelBindings = [];
        for (const s of chGroup.skills) {
          const skillId = conceptKeyToId.get(s.conceptKey);
          if (!skillId) continue;
          for (const f of (s.facets || [])) {
            for (const sc of (f.sourceChunks || [])) {
              const key = `${skillId}:${sc.chunkId}`;
              if (!seenSkillChunks.has(key) && chGroup.chunkIds.includes(sc.chunkId)) {
                seenSkillChunks.add(key);
                skillLevelBindings.push({ chunkId: sc.chunkId, subSkillId: skillId, extractionContext: null, confidence: sc.confidence || 1.0 });
              }
            }
          }
        }
        if (skillLevelBindings.length > 0) {
          await ChunkSkillBindings.createBatch(skillLevelBindings, { externalTransaction: true });
        }
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
    createdSkillIds: newSkills.map(ns => conceptKeyToId.get(ns.conceptKey)).filter(Boolean),
    createdFacetIds: reextractFacetIds,
  };
}

// ============================================================
// Deterministic Pre-Merge (accuracy improvement #5)
// ============================================================

/**
 * Merge duplicate facets by concept_key before running LLM concept link comparison.
 * Reduces the number of facets the concept link LLM needs to compare.
 *
 * @param {Array<number>} newFacetIds - IDs of newly created facets
 * @returns {Promise<{ merged: number, actions: Array }>}
 */
export async function preMergeDuplicateFacets(newFacetIds) {
  if (newFacetIds.length === 0) return { merged: 0, actions: [] };

  const actions = [];

  // Load all new facets
  const newFacets = [];
  for (const id of newFacetIds) {
    const f = await Facets.getById(id);
    if (f && !f.is_archived) newFacets.push(f);
  }

  // Check each new facet against existing facets with the same concept_key
  for (const newFacet of newFacets) {
    if (!newFacet.concept_key) continue;

    const existing = await Facets.findByConceptKey(newFacet.concept_key);
    if (!existing || existing.id === newFacet.id) continue;

    // Found a duplicate — merge new into existing
    // 1. Union mastery_criteria
    const existingCriteria = typeof existing.mastery_criteria === 'string'
      ? JSON.parse(existing.mastery_criteria || '[]') : (existing.mastery_criteria || []);
    const newCriteria = typeof newFacet.mastery_criteria === 'string'
      ? JSON.parse(newFacet.mastery_criteria || '[]') : (newFacet.mastery_criteria || []);
    const existingTexts = new Set(existingCriteria.map(c => typeof c === 'string' ? c : c.text));
    const addedCriteria = newCriteria.filter(c => {
      const text = typeof c === 'string' ? c : c.text;
      return !existingTexts.has(text);
    });
    if (addedCriteria.length > 0) {
      await Facets.update(existing.id, { mastery_criteria: [...existingCriteria, ...addedCriteria] });
    }

    // 2. Move chunk_facet_bindings from new to existing
    const newBindings = await ChunkFacetBindings.getByFacet(newFacet.id);
    for (const b of newBindings) {
      await ChunkFacetBindings.create({
        chunkId: b.chunk_id,
        facetId: existing.id,
        extractionContext: b.extraction_context,
        confidence: b.confidence,
        bindingType: b.binding_type || 'teaches',
        qualityRank: 0,
        contentRange: b.content_range,
      });
    }

    // 3. Archive the duplicate
    await Facets.archive(newFacet.id);

    actions.push({
      keptId: existing.id,
      mergedId: newFacet.id,
      conceptKey: newFacet.concept_key,
      reason: 'identical_concept_key',
    });
  }

  return { merged: actions.length, actions };
}

// ============================================================
// Binding Quality Scoring
// ============================================================

/** Material classification → score (0–15) */
const CLASS_SCORES = {
  textbook: 15, lecture: 12, notes: 9, slides: 6,
  reference: 3, assignment: 3,
};

/** Binding type → score (0–40) */
const TYPE_SCORES = { teaches: 40, prerequisite_for: 20, references: 10 };

/**
 * Compute composite quality score (0–100) for a single binding row.
 *
 * | Factor          | Weight | Scoring                                             |
 * |-----------------|--------|-----------------------------------------------------|
 * | Binding type    | 0–40   | teaches=40, prerequisite_for=20, references=10      |
 * | Confidence      | 0–30   | confidence * 30                                     |
 * | Content range   | 0–15   | Has paragraphs: 15 - min(numParagraphs, 10). Else 0 |
 * | Material class  | 0–15   | textbook=15 … other=0                               |
 */
function computeBindingScore(binding) {
  const typeScore = TYPE_SCORES[binding.binding_type] || 0;
  const confScore = (binding.confidence || 0) * 30;

  let rangeScore = 0;
  if (binding.content_range) {
    try {
      const range = typeof binding.content_range === 'string'
        ? JSON.parse(binding.content_range) : binding.content_range;
      const numP = Array.isArray(range.paragraphs) ? range.paragraphs.length : 0;
      if (numP > 0) rangeScore = 15 - Math.min(numP, 10);
    } catch { /* malformed — leave at 0 */ }
  }

  const classScore = CLASS_SCORES[binding.classification] || 0;

  return typeScore + confScore + rangeScore + classScore;
}

/**
 * Rank all bindings for a single facet by composite quality score.
 * Updates quality_rank in DB (1 = best).
 *
 * @param {number} facetId
 * @returns {Promise<{ ranked: number, topScore: number, topBindingId: number|null }>}
 */
export async function rankBindingsForFacet(facetId) {
  const db = await getDb();
  const bindings = await db.select(
    `SELECT cfb.*, m.classification
     FROM chunk_facet_bindings cfb
     JOIN chunks c ON cfb.chunk_id = c.id
     JOIN materials m ON c.material_id = m.id
     WHERE cfb.facet_id = ?`,
    [facetId]
  );

  if (bindings.length === 0) return { ranked: 0, topScore: 0, topBindingId: null };

  // Score each binding
  const scored = bindings.map(b => ({
    bindingId: b.id,
    score: computeBindingScore(b),
    extractedAt: b.extracted_at,
  }));

  // Sort: descending score, then ascending extracted_at (earlier = higher rank)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.extractedAt || '').localeCompare(b.extractedAt || '');
  });

  // Assign ranks 1, 2, 3, ...
  const rankings = scored.map((s, i) => ({
    bindingId: s.bindingId,
    qualityRank: i + 1,
  }));

  await ChunkFacetBindings.updateQualityRanks(facetId, rankings);

  return {
    ranked: rankings.length,
    topScore: scored[0].score,
    topBindingId: scored[0].bindingId,
  };
}

/**
 * Rank bindings for multiple facets. Simple loop wrapper.
 *
 * @param {Array<number>} facetIds
 * @returns {Promise<{ totalRanked: number, facetsProcessed: number }>}
 */
export async function rankBindingsForFacets(facetIds) {
  if (!facetIds || facetIds.length === 0) return { totalRanked: 0, facetsProcessed: 0 };

  let totalRanked = 0;
  let facetsProcessed = 0;

  for (const fid of facetIds) {
    const result = await rankBindingsForFacet(fid);
    totalRanked += result.ranked;
    if (result.ranked > 0) facetsProcessed++;
  }

  return { totalRanked, facetsProcessed };
}
