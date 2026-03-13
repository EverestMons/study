# Phase 2: Facet Extraction Pipeline Changes
**Date:** 2026-03-12
**Phase:** 2 — Extraction Pipeline Integration
**Status:** Complete
**Depends on:** Phase 1 (Migration 005)

---

## Overview

Phase 2 integrates the facet architecture into the extraction pipeline. Skills now produce facets as sub-units with direct chunk ID bindings, typed binding classification, paragraph-level content ranges, and cross-domain concept links. This replaces the old heading-label fuzzy matching with deterministic chunk ID resolution.

## Accuracy Improvements Implemented

| # | Improvement | Description |
|---|---|---|
| 1 | Direct chunk ID references | LLM receives chunk IDs in prompt, outputs exact IDs (no fuzzy matching) |
| 2 | Binding type classification | `teaches` / `references` / `prerequisite_for` per facet-chunk binding |
| 5 | Deterministic pre-merge | Auto-merge duplicate facets by `concept_key` before LLM comparison |
| 6 | Paragraph-level content range | `[P#]` markers in prompt, `{paragraphs: [3,4,5]}` in bindings |

## Files Changed

### `src/lib/extraction.js` (major rewrite)

#### New Helper Functions

| Function | Purpose |
|---|---|
| `buildChunkIndex(chunks)` | Creates chunk index for LLM: ID, label, preview (200 chars), paragraph count |
| `formatChapterContentWithIds(chunks)` | Formats chunks with `[CHUNK id="..." label="..."]` markers and `[P#]` paragraph numbering |
| `resolveChunkBindingsDirect(skills, chapterGroup, facetKeyToId)` | Replaces `resolveChunkBindings()` — reads chunk IDs directly from LLM output, validates against valid set, falls back to heading-label at 0.6 confidence |
| `preMergeDuplicateFacets(newFacetIds)` | Merges duplicates by `concept_key`: union criteria, move bindings, archive duplicate |

#### Modified Functions

| Function | Changes |
|---|---|
| `buildInitialExtractionPrompt()` | New param `chapterGroup`; includes chunk index in system prompt; requests faceted output schema with `facets[]` → `sourceChunks[]` (chunkId, bindingType, paragraphs, confidence) |
| `buildEnrichmentPrompt()` | New params `existingFacets`, `chunkIndex`; includes existing facets per skill; requests facet-level updates |
| `postProcessChapterSkills()` | Added checks 8-11: auto-generate facet if missing, conceptKey uniqueness, criteria wrapping, criteria minimum warning |
| `extractChapter()` | Uses `formatChapterContentWithIds()`; max tokens 8192 → 12288 |
| `extractCourse()` | Creates facets → facet_mastery → chunk_facet_bindings in transaction; backward-compat skill bindings; returns `createdFacetIds` |
| `enrichFromMaterial()` | Loads existing facets; facet-level enrichment (new criteria, new bindings, new facets under existing skills); returns `createdFacetIds` |
| `extractChaptersOnly()` | Creates facets for new skills; uses `resolveChunkBindingsDirect`; returns `createdFacetIds` |
| `reExtractCourse()` | Creates/loads facets; clears old facet bindings per chapter; rebuilds with `resolveChunkBindingsDirect`; returns `createdFacetIds` and `createdSkillIds` |

### `src/lib/conceptLinks.js` (rewritten)

| Export | Description |
|---|---|
| `generateConceptLinks(courseId, newSkillIds)` | **Unchanged** — skill-level concept links within same `parent_skill_id` (backward compat) |
| `generateFacetConceptLinks(courseId, newFacetIds)` | **New** — cross-domain facet comparison. Batches existing facets (60 per batch) to fit prompt. Uses `FacetConceptLinks.createBatch()` |

#### Key Differences: Skill Links vs Facet Links

| Aspect | Skill Links (old) | Facet Links (new) |
|---|---|---|
| Scope | Within same `parent_skill_id` | Cross-domain (all course facets) |
| Granularity | Entire skill | Atomic facet |
| Prompt info | concept_key, name, description, category, criteria | concept_key, name, description, skill_type, blooms_level, criteria |
| Batch size | N/A (per parent group) | 60 existing facets per batch |
| Max pairs | 30 | 40 |
| DB table | `concept_links` | `facet_concept_links` |

### `src/lib/skills.js` (call site updates)

Both concept link call sites (retry extraction and first extraction) now:
1. Run `generateConceptLinks()` (backward compat skill-level)
2. If `result.createdFacetIds` exists, run `preMergeDuplicateFacets()` first
3. Then run `generateFacetConceptLinks()` for cross-domain facet links
4. All wrapped in try/catch — non-blocking, non-critical

## LLM Output Schema

### Initial Extraction

```json
{
  "cipCode": "11.0701",
  "parentDisplayName": "Computer Science",
  "skills": [{
    "name": "Binary Search",
    "conceptKey": "algorithms/binary-search",
    "category": "Algorithms",
    "skillType": "procedural",
    "bloomsLevel": "apply",
    "description": "...",
    "prerequisites": ["data-structures/sorted-arrays"],
    "facets": [{
      "name": "Binary search correctness proof",
      "conceptKey": "algorithms/binary-search/correctness-proof",
      "skillType": "conceptual",
      "bloomsLevel": "analyze",
      "description": "...",
      "masteryCriteria": ["Can state loop invariant", "Can prove termination"],
      "sourceChunks": [{
        "chunkId": "abc123",
        "bindingType": "teaches",
        "paragraphs": [3, 4, 5],
        "confidence": 1.0
      }]
    }]
  }]
}
```

### Enrichment

```json
{
  "enrichments": [{
    "conceptKey": "algorithms/binary-search",
    "newCriteria": [{ "facetConceptKey": "algorithms/binary-search/correctness-proof", "criteria": ["..."] }],
    "newChunkBindings": [{ "facetConceptKey": "...", "chunkId": "...", "bindingType": "teaches", "paragraphs": [1,2], "confidence": 0.9 }],
    "newFacets": [{ "name": "...", "conceptKey": "...", ... }]
  }],
  "newSkills": [{ ... same as initial extraction ... }]
}
```

## Chunk Formatting in Prompt

```
=== CHUNK INDEX ===
ID: abc123 | Label: "Chapter 3 - Sorting" | Preview: "This chapter covers..." | Paragraphs: 12
ID: def456 | Label: "Chapter 3 - Searching" | Preview: "Binary search is..." | Paragraphs: 8

=== MATERIAL CONTENT ===
[CHUNK id="abc123" label="Chapter 3 - Sorting"]
[P1] This chapter covers the fundamental sorting algorithms...
[P2] Bubble sort works by repeatedly stepping through the list...
---
[CHUNK id="def456" label="Chapter 3 - Searching"]
[P1] Binary search is an efficient algorithm for finding...
```

## Binding Resolution: Before vs After

### Before (heading-label fuzzy matching)
1. LLM outputs `sourceHeading: "Chapter 3 - Sorting"`
2. Code fuzzy-matches heading against chunk labels
3. ~15-30% fallback to "bind ALL chapter chunks at 0.5"
4. No paragraph-level granularity
5. No binding type classification

### After (direct chunk ID resolution)
1. LLM outputs `chunkId: "abc123", bindingType: "teaches", paragraphs: [3,4,5]`
2. Code validates chunk ID exists in chapter's valid set
3. Invalid IDs fall back to heading-label match at 0.6 confidence
4. Unbound facets stay unbound (no "bind to ALL" fallback)
5. Full binding type + content range annotation

## Pre-Merge Flow

1. After extraction saves facets to DB, `preMergeDuplicateFacets(newFacetIds)` runs
2. For each new facet with a `concept_key`, checks if an older facet shares the key
3. If duplicate found:
   - Union `mastery_criteria` (deduplicated by text)
   - Move `chunk_facet_bindings` from new → existing
   - Archive the duplicate facet
4. This runs BEFORE `generateFacetConceptLinks()` to reduce comparison set

## Backward Compatibility

- `chunk_skill_bindings` still created alongside `chunk_facet_bindings`
- `sub_skills.mastery_criteria` aggregated from facet criteria
- `concept_links` (skill-level) still generated
- `generateConceptLinks()` function unchanged
- All existing UI consuming skill-level data continues to work

## Token Budget

| Component | Before | After |
|---|---|---|
| Extraction max_tokens | 8192 | 12288 |
| Chunk formatting | Bulk `---` joined | `[CHUNK id][P#]` markers |
| Output schema | skills[] flat | skills[] → facets[] → sourceChunks[] |
| Enrichment prompt | Skill-level | Facet-level with existing facets listed |
| Concept links | Per parent group | Batched 60 existing facets |
