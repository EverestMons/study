# Facet Extraction Spec
**Date:** 2026-03-12
**Phase:** 0 — Facet Architecture
**Status:** Complete
**Depends on:** extraction-granularity-audit-2026-03-12.md

---

## 1. Overview

This spec defines how the extraction pipeline (extraction.js) must change to produce **facets** instead of flat mastery criteria, and how chunk bindings must change from heading-label fuzzy matching to **direct chunk ID references** with typed, quality-ranked, content-range-annotated bindings.

### Changes at a Glance

| Component | Current | After |
|---|---|---|
| LLM output schema | `subSkills[].masteryCriteria[]` (strings) | `subSkills[].facets[]` (objects with chunk bindings) |
| Chunk identification | Heading labels → fuzzy match | Chunk IDs in prompt → direct ID output |
| Binding creation | Post-hoc `resolveChunkBindings()` | Inline in LLM output per facet |
| Binding type | None (all treated equally) | `teaches` / `references` / `prerequisite_for` |
| Quality ranking | None | Per-facet ranking across multiple chunks |
| Content range | None (whole chunk loaded) | Paragraph-level annotation |

---

## 2. Chunk Prompt Formatting

### Current (extraction.js:693-695)

```javascript
const chapterContent = chapterGroup.chunks
    .map(c => c.content || '')
    .join('\n\n---\n\n');
```

Chunk boundaries are invisible to the LLM. No IDs, no labels, just `---` dividers.

### Proposed

```javascript
const chapterContent = chapterGroup.chunks
    .map(c => {
        const header = `[CHUNK id="${c.id}" label="${c.label || 'Section ' + (c.section_path || c.sectionPath)}"]`;
        const footer = `[/CHUNK]`;
        // Number paragraphs for content_range annotation
        const paragraphs = (c.content || '').split(/\n{2,}/);
        const numbered = paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
        return `${header}\n${numbered}\n${footer}`;
    })
    .join('\n\n');
```

**Token cost**: ~50 extra tokens per chunk for markers + paragraph numbers. For a 10-chunk chapter, ~500 tokens — well within the 8192 max response budget.

### Example Output

```
[CHUNK id="c_abc123" label="3.2 Binary Search Trees"]
[P1] A binary search tree (BST) is a rooted binary tree where each node stores a key...

[P2] The BST property states that for any node N, all keys in the left subtree are less than N's key...

[P3] Insertion into a BST begins at the root. Compare the new key with the current node...

[P4] Deletion from a BST has three cases depending on the number of children...

[P5] Searching a BST follows the same comparison path as insertion...
[/CHUNK]

[CHUNK id="c_def456" label="3.3 Tree Traversals"]
[P1] In-order traversal visits the left subtree, then the node, then the right subtree...
...
[/CHUNK]
```

---

## 3. Extraction Prompt Revision

### Current Prompt Structure (extraction.js:246-347)

The system prompt contains:
- Chapter structure (headings, bold terms, definitions, counts)
- Target skill count range
- Quality tests (diagnostic, practice, decay)
- Skill schema with `masteryCriteria` and `sourceChunkLabels`

### Revised System Prompt

Replace the skill schema section (extraction.js:316-344) with:

```
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
    "figureReferences": ["Figure 3.15"]
  },
  "facets": [
    {
      "name": "Facet Name",
      "conceptKey": "category/facet-kebab-name",
      "description": "What the student can specifically do",
      "skillType": "procedural",
      "bloomsLevel": "apply",
      "masteryCriteria": [
        "Specific testable statement about this facet"
      ],
      "evidence": {
        "anchorTerms": ["specific term"],
        "definitionsFound": ["specific definition"]
      },
      "chunkBindings": [
        {
          "chunkId": "c_abc123",
          "bindingType": "teaches",
          "paragraphs": [3, 4],
          "qualityNote": "Primary explanation with worked example"
        }
      ]
    }
  ]
}]
```

### New Rules Section

Replace the existing rules (extraction.js:339-344) with:

```
RULES:
- Prerequisites reference concept keys of OTHER skills in this chapter (cross-chapter wired later).
- conceptKey format: kebab-case "{category}/{skill-name}". Must be deterministic.
- Each skill MUST have 2-6 facets. Each facet is an independently-testable, independently-forgettable capability.
- Facet quality tests (apply to EACH facet, not just the skill):
  - DIAGNOSTIC: Can you ask ONE question to check if a student knows THIS FACET specifically?
  - PRACTICE: Can you generate 3+ different problems testing THIS FACET at varying difficulty?
  - DECAY: Can a student forget THIS FACET while retaining other facets of the same skill?
  If a candidate facet fails the DECAY test, merge it into a neighboring facet.
- masteryCriteria on facets: 1-3 testable statements per facet.
- chunkBindings: Use exact chunk IDs from the [CHUNK id="..."] markers.
  - bindingType: "teaches" (chunk explains/demonstrates this facet), "references" (chunk mentions it), "prerequisite_for" (chunk teaches prerequisite knowledge)
  - paragraphs: Array of paragraph numbers [P1], [P2], etc. that are relevant
  - qualityNote: Brief reason why this chunk is useful for this facet
- A facet may bind to ZERO chunks if the concept is implied but not explicitly taught (rare).
- A facet may bind to MULTIPLE chunks if the concept spans sections.
- DO NOT extract skills/facets for front matter, table of contents, or index entries.
- DO NOT create facets for individual vocabulary words unless they represent a distinct learnable concept.
```

### Revised Skill Count Target

Current: "Extract 3-15 skills per chapter" (extraction.js:278)

Revised: Keep the same skill count target (3-15 per chapter), but add:
```
TARGET: Extract ${min}-${max} skills from this chapter, with 2-6 facets per skill.
Total facets should be ${min * 2}-${max * 4} for the chapter.
```

---

## 4. Enrichment Prompt Revision

### Current (extraction.js:352-406)

Enrichment compares new material against existing skills by concept key and returns `{enrichments, newSkills, unmatchedExisting}`.

### Revised

The enrichment prompt must also receive chunk ID markers and produce facet-level output:

```
{
  "enrichments": [
    {
      "existingConceptKey": "category/skill-name",
      "facetUpdates": [
        {
          "existingFacetConceptKey": "category/facet-name",
          "newCriteria": ["New testable statement"],
          "newAnchorTerms": ["new term"],
          "newChunkBindings": [
            {
              "chunkId": "c_xyz789",
              "bindingType": "teaches",
              "paragraphs": [2, 3],
              "qualityNote": "Alternative explanation with different examples"
            }
          ]
        }
      ],
      "newFacets": [
        {
          "name": "New Facet Name",
          "conceptKey": "category/new-facet",
          "description": "...",
          "masteryCriteria": ["..."],
          "chunkBindings": [{ ... }]
        }
      ]
    }
  ],
  "newSkills": [
    { ...full skill schema with facets and chunk bindings... }
  ],
  "unmatchedExisting": ["concept-keys not covered in new material"]
}
```

### Existing Facet Context

When calling enrichment, the prompt must include existing facets for each skill so the LLM can match against them:

```javascript
const skillsSummary = existingSkills.map(s => {
    const facets = existingFacets.filter(f => f.skill_id === s.id);
    const facetLines = facets.map(f =>
        `    - [${f.id}] ${f.concept_key}: "${f.name}" criteria: ${parseCriteria(f)}`
    ).join('\n');
    return `  - ${s.concept_key}: "${s.name}" [${s.category}]
${facetLines}`;
}).join('\n');
```

---

## 5. Post-Processing Changes

### Current Post-Processing (extraction.js:434-558)

Seven deterministic checks on skills. No facet-level checks exist.

### New Facet Post-Processing

Add after existing skill-level checks:

#### Check 8: Facet Count Validation
```javascript
for (const skill of deduped) {
    if (!skill.facets || skill.facets.length === 0) {
        // Auto-generate a single facet from the skill's mastery criteria
        // This handles LLM format errors gracefully
        skill.facets = [{
            name: skill.name,
            conceptKey: skill.conceptKey + '/core',
            description: skill.description,
            skillType: skill.skillType,
            bloomsLevel: skill.bloomsLevel,
            masteryCriteria: skill.masteryCriteria || [],
            evidence: skill.evidence || {},
            chunkBindings: [],
        }];
        issues.push({ type: 'auto_facet_created', skill: skill.conceptKey });
    }
    if (skill.facets.length > 8) {
        issues.push({ type: 'excessive_facets', skill: skill.conceptKey, count: skill.facets.length });
    }
}
```

#### Check 9: Facet Concept Key Uniqueness
```javascript
const allFacetKeys = new Set();
for (const skill of deduped) {
    for (const facet of skill.facets) {
        if (allFacetKeys.has(facet.conceptKey)) {
            issues.push({ type: 'duplicate_facet_key', facet: facet.conceptKey });
            // Deduplicate by appending counter
            let counter = 2;
            while (allFacetKeys.has(facet.conceptKey + '-' + counter)) counter++;
            facet.conceptKey = facet.conceptKey + '-' + counter;
        }
        allFacetKeys.add(facet.conceptKey);
    }
}
```

#### Check 10: Chunk Binding Validation
```javascript
const validChunkIds = new Set(chapterGroup.chunkIds);
const validBindingTypes = new Set(['teaches', 'references', 'prerequisite_for']);

for (const skill of deduped) {
    for (const facet of skill.facets) {
        facet.chunkBindings = (facet.chunkBindings || []).filter(b => {
            if (!validChunkIds.has(b.chunkId)) {
                issues.push({ type: 'invalid_chunk_id', facet: facet.conceptKey, chunkId: b.chunkId });
                return false;
            }
            if (!validBindingTypes.has(b.bindingType)) {
                b.bindingType = 'teaches'; // default
            }
            return true;
        });
    }
}
```

#### Check 11: Facet Mastery Criteria Minimum
```javascript
for (const skill of deduped) {
    for (const facet of skill.facets) {
        if (!facet.masteryCriteria || facet.masteryCriteria.length < 1) {
            issues.push({ type: 'facet_no_criteria', facet: facet.conceptKey });
        }
    }
}
```

---

## 6. Binding Resolution Replacement

### Current: `resolveChunkBindings()` (extraction.js:560-618)

Fuzzy heading-label matching with 3-tier fallback. **This function is replaced entirely.**

### New: `extractChunkBindingsFromFacets()`

```javascript
export function extractChunkBindingsFromFacets(skills, chapterGroup) {
    const bindings = [];
    const validChunkIds = new Set(chapterGroup.chunkIds);

    // Build chunk paragraph count map for content_range validation
    const chunkParagraphCounts = new Map();
    for (const chunk of chapterGroup.chunks) {
        const pCount = (chunk.content || '').split(/\n{2,}/).length;
        chunkParagraphCounts.set(chunk.id, pCount);
    }

    for (const skill of skills) {
        for (const facet of (skill.facets || [])) {
            // Assign quality rank within this facet's bindings
            // "teaches" bindings ranked first, then by order in LLM output
            const teachBindings = (facet.chunkBindings || [])
                .filter(b => b.bindingType === 'teaches' && validChunkIds.has(b.chunkId));
            const otherBindings = (facet.chunkBindings || [])
                .filter(b => b.bindingType !== 'teaches' && validChunkIds.has(b.chunkId));

            let rank = 1;
            for (const b of teachBindings) {
                const maxP = chunkParagraphCounts.get(b.chunkId) || 999;
                bindings.push({
                    chunkId: b.chunkId,
                    facetConceptKey: facet.conceptKey,
                    extractionContext: b.qualityNote || null,
                    confidence: 1.0,  // Direct ID reference = max confidence
                    bindingType: 'teaches',
                    qualityRank: rank++,
                    contentRange: b.paragraphs
                        ? JSON.stringify({ paragraphs: b.paragraphs.filter(p => p <= maxP) })
                        : null,
                });
            }

            for (const b of otherBindings) {
                const maxP = chunkParagraphCounts.get(b.chunkId) || 999;
                bindings.push({
                    chunkId: b.chunkId,
                    facetConceptKey: facet.conceptKey,
                    extractionContext: b.qualityNote || null,
                    confidence: 0.9,
                    bindingType: b.bindingType || 'references',
                    qualityRank: 0,  // Non-teaches don't get quality ranking
                    contentRange: b.paragraphs
                        ? JSON.stringify({ paragraphs: b.paragraphs.filter(p => p <= maxP) })
                        : null,
                });
            }
        }
    }

    return bindings;
}
```

### Fallback Strategy

**No more "bind to all chapter chunks" fallback.** If a facet has zero valid bindings after post-processing:
- The facet is still created (it's a valid concept)
- It has no chunk bindings (binding count = 0)
- The context builder will fall back to skill-level keyword matching for unbound facets
- An issue is logged: `{ type: 'unbound_facet', facet: conceptKey }`

This is **strictly better** than the current approach where a skill with no heading match gets bound to every chunk in the chapter at 0.5 confidence.

---

## 7. Deterministic Pre-Merge for Concept Links

### Problem

When the same concept is extracted from textbook, slides, and lecture notes, it produces 3 separate skills (or now, 3 sets of facets). The concept link LLM call catches some duplicates but misses others.

### Solution: Pre-Merge by concept_key

Before calling `generateConceptLinks()`, add a deterministic merge step:

```javascript
export function preMergeDuplicateFacets(facets) {
    const byConceptKey = new Map();
    const mergeActions = [];

    for (const facet of facets) {
        if (!facet.concept_key) continue;
        if (byConceptKey.has(facet.concept_key)) {
            const existing = byConceptKey.get(facet.concept_key);
            mergeActions.push({
                keepId: existing.id,
                mergeId: facet.id,
                conceptKey: facet.concept_key,
                reason: 'identical_concept_key',
            });
        } else {
            byConceptKey.set(facet.concept_key, facet);
        }
    }

    return mergeActions;
}
```

The merge operation:
1. Union mastery_criteria (dedup by text)
2. Union chunk_facet_bindings (all bindings point to kept facet)
3. Re-rank quality across merged binding set
4. Set `merged_from` on kept facet
5. Archive merged facet (`is_archived = 1`)

### When to Run

After extraction completes (post-Phase 1 save), before concept link generation. This reduces the number of facets the concept link LLM needs to compare.

---

## 8. Quality Ranking Algorithm

### Initial Ranking (During Extraction)

Quality rank is assigned by LLM output order within `teaches` bindings:
- First `teaches` binding → rank 1
- Second `teaches` binding → rank 2
- Non-`teaches` bindings → rank 0 (unranked)

### Re-Ranking on Enrichment

When a new material adds bindings to an existing facet:

```javascript
export async function reRankBindings(facetId) {
    const bindings = await ChunkFacetBindings.getByFacet(facetId);
    const teaches = bindings
        .filter(b => b.binding_type === 'teaches')
        .sort((a, b) => {
            // Prefer higher confidence, then newer (from enrichment)
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            return b.extracted_at - a.extracted_at;
        });

    for (let i = 0; i < teaches.length; i++) {
        await ChunkFacetBindings.updateRank(teaches[i].id, i + 1);
    }
}
```

### Future: Learning-Outcome Feedback

The `teaching_effectiveness` column (REAL, initially null) is reserved for Phase N. When the tutoring system detects:
- Student answered correctly after being shown chunk → effectiveness += 0.1
- Student answered incorrectly after being shown chunk → effectiveness -= 0.05

This signal will eventually feed into quality ranking, promoting effective chunks and demoting ineffective ones.

---

## 9. Content Range Format

### Schema

```json
{
    "paragraphs": [3, 4, 5]
}
```

Paragraph numbers correspond to `[P1]`, `[P2]`, etc. markers in the prompt. The context builder maps these back to actual text ranges by splitting chunk content on `\n{2,}`.

### Context Builder Usage

```javascript
function loadFacetContent(chunk, contentRange) {
    if (!contentRange) return chunk.content; // Full chunk if no range

    const range = JSON.parse(contentRange);
    if (range.paragraphs) {
        const paragraphs = chunk.content.split(/\n{2,}/);
        return range.paragraphs
            .filter(p => p > 0 && p <= paragraphs.length)
            .map(p => paragraphs[p - 1])
            .join('\n\n');
    }

    return chunk.content; // Fallback to full chunk
}
```

### Token Savings Estimate

For a 12,000-char chunk where only paragraphs 3-5 are relevant (~3,000 chars):
- **Current**: 12,000 chars loaded → ~3,000 tokens
- **After**: 3,000 chars loaded → ~750 tokens
- **Saving**: 75% per irrelevant-heavy chunk

---

## 10. Migration Path: Existing Skills → Facets

### One-Time Migration (migration 005)

For existing `sub_skills` with `mastery_criteria`, auto-generate facets:

```sql
-- For each sub_skill, create one facet per mastery criterion (simple case)
-- Or one facet per skill (if mastery criteria are too intertwined to separate)
```

The migration strategy depends on a heuristic:
- If mastery_criteria count ≤ 2: Create ONE facet with all criteria
- If mastery_criteria count 3-4: Create ONE facet per criterion
- If mastery_criteria count > 4: Group related criteria into 2-3 facets (requires LLM — batch offline)

**Recommendation for Phase 1**: Use the simple rule (one facet per criterion, or one facet per skill if ≤2 criteria). This is lossless and deterministic. LLM-based refinement can happen later.

### Binding Migration

Existing `chunk_skill_bindings` are migrated to `chunk_facet_bindings`:
- If skill has ONE auto-generated facet: Copy all bindings with facet ID
- If skill has MULTIPLE auto-generated facets: Copy all bindings to ALL facets (conservative — same as current behavior)
- binding_type defaults to 'teaches'
- quality_rank defaults to 0 (unranked)
- content_range defaults to null (full chunk)

---

## 11. Revised Extraction Data Flow

### Before
```
Chunks → groupByChapter → buildProfile → LLM(systemPrompt, chapterContent)
  → extractJSON → postProcess → saveSkills → resolveChunkBindings → saveBindings
  → wireCrossChapterPrereqs → generateConceptLinks
```

### After
```
Chunks → groupByChapter → buildProfile → formatChunksWithIDs
  → LLM(revisedSystemPrompt, markedChapterContent)
  → extractJSON → postProcessSkills → postProcessFacets → validateBindings
  → saveSkills → saveFacets → extractChunkBindingsFromFacets → saveBindings
  → createFacetMasteryRecords
  → wireCrossChapterPrereqs → preMergeDuplicateFacets → generateFacetConceptLinks
```

### New Steps (bold = new)

| Step | Function | File | Notes |
|---|---|---|---|
| 0a | `formatChunksWithIDs` | extraction.js | Wraps chunks with `[CHUNK]` markers and `[P#]` paragraph numbering |
| 2 (revised) | `buildInitialExtractionPrompt` | extraction.js | Revised schema with `facets[]` and `chunkBindings[]` |
| 3a | `postProcessFacets` | extraction.js | Checks 8-11: count, uniqueness, binding validation, criteria minimum |
| 3b | `validateBindings` | extraction.js | Validates chunk IDs, binding types, paragraph ranges |
| 4a | `saveFacets` | db.js | New `Facets.createBatch()` |
| 4b | `extractChunkBindingsFromFacets` | extraction.js | Replaces `resolveChunkBindings()` |
| 4c | `createFacetMasteryRecords` | db.js | New `FacetMastery.createBatch()` with FSRS defaults |
| 5a | `preMergeDuplicateFacets` | extraction.js | Deterministic dedup by concept_key |
| 5b | `generateFacetConceptLinks` | conceptLinks.js | Compare facets instead of skills |

---

## 12. Token Budget Analysis

### Current Token Usage Per Chapter

| Component | Tokens (est.) |
|---|---|
| System prompt | ~800 |
| Chapter content (user message) | 2,000-6,000 |
| Response (skills JSON) | 1,500-3,000 |
| **Total** | **4,300-9,800** |

### Revised Token Usage Per Chapter

| Component | Tokens (est.) | Delta |
|---|---|---|
| System prompt (revised, longer schema) | ~1,200 | +400 |
| Chapter content with [CHUNK]/[P#] markers | 2,200-6,500 | +200-500 |
| Response (skills + facets + bindings JSON) | 3,000-6,000 | +1,500-3,000 |
| **Total** | **6,400-13,700** | **+2,100-3,900** |

### Mitigation

- Response max tokens: Increase from 8192 to 12288 for extraction calls
- Use `callClaude(systemPrompt, messages, 12288, true)` (still Haiku = cheap)
- Haiku cost: ~$0.001 per 1K input, ~$0.005 per 1K output
- Per-chapter cost increase: ~$0.02 → $0.04 (2× but still trivial)

---

## 13. File Change Summary

| File | Changes |
|---|---|
| `extraction.js` | Revised prompts, new post-processing checks, `formatChunksWithIDs()`, `extractChunkBindingsFromFacets()`, remove `resolveChunkBindings()` |
| `db.js` | New `Facets`, `FacetMastery`, `ChunkFacetBindings`, `FacetConceptLinks`, `AssignmentQuestionFacets` DB objects |
| `conceptLinks.js` | Facet-level comparison, pre-merge step |
| `study.js` | Context builder rework: traverse facet → binding graph with content_range |
| `005_facets.sql` | New migration: 5 new tables + migration of existing data |
| `fsrs.js` | Update to operate on facet_mastery instead of sub_skill_mastery |
| `StudyContext.jsx` | Update skill loading to include facets, update FSRS hooks |
| `components/study/*.jsx` | Display facets in skill panels, practice mode targets facets |
