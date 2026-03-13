# Facet Binding Quality Scoring — Phase 3

**Date:** 2026-03-12
**Files:** `src/lib/extraction.js`, `src/lib/skills.js`, `src/lib/db.js`

## Purpose

Activates the previously-scaffolded `quality_rank` column on `chunk_facet_bindings` with a deterministic composite scoring algorithm. This enables the context builder to retrieve the single best teaching chunk for each facet without relying on static extraction-order ranking.

## Scoring Formula

Composite score 0–100, higher = better. Rank 1 = highest score.

| Factor | Weight | Scoring |
|---|---|---|
| Binding type | 0–40 pts | `teaches`=40, `prerequisite_for`=20, `references`=10 |
| Confidence | 0–30 pts | `confidence * 30` |
| Content range | 0–15 pts | Has paragraphs: `15 - min(numParagraphs, 10)` (focused content scores higher). No range: 0 |
| Material class | 0–15 pts | textbook=15, lecture=12, notes=9, slides=6, reference/assignment=3, other=0 |

Ties broken by `extracted_at` ascending (earlier extraction = higher rank).

## Functions Added

### `extraction.js`

- **`computeBindingScore(binding)`** — Pure function. Takes a binding row (with `classification` from materials JOIN) and returns numeric score 0–100.
- **`rankBindingsForFacet(facetId)`** — Queries all bindings for a facet (joined with materials for classification), scores them, sorts, assigns rank 1..N, and persists via `ChunkFacetBindings.updateQualityRanks()`.
- **`rankBindingsForFacets(facetIds)`** — Batch wrapper. Loops over `rankBindingsForFacet()` for each facet ID.

### `skills.js` — Pipeline Integration

Ranking is called in both post-extraction call sites (retry path and first-extraction path), in this order:

```
preMergeDuplicateFacets → rankBindingsForFacets → generateFacetConceptLinks
```

Ranking runs after pre-merge because merge may create or relocate bindings. It runs before concept links because ranking doesn't depend on links.

### `db.js` — Query Enhancement

`ChunkFacetBindings.getByFacetRanked()` now JOINs the `materials` table to include `material_classification` in results, enabling downstream consumers (context builder) to use classification data without a separate query.

## Ordering Guarantees

Given the formula weights:
- A `teaches` binding from a textbook at 0.9 confidence with 3 focused paragraphs scores: 40 + 27 + 12 + 15 = **94**
- A `references` binding from slides at 0.5 confidence with no range scores: 10 + 15 + 0 + 6 = **31**
- Higher confidence always outranks lower confidence within the same binding type and material class
- Re-ranking after enrichment (new material upload) correctly integrates new bindings
