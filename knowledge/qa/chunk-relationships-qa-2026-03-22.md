# Chunk Relationships — QA Report
**Date:** 2026-03-22 | **Agent:** Study Security & Testing Analyst | **Step:** 5

---

## Area 1 — Migration 009 Schema
**PASS**

- `chunk_similarities`: chunk_a_id TEXT NOT NULL, chunk_b_id TEXT NOT NULL, similarity REAL NOT NULL, created_at INTEGER NOT NULL, UNIQUE(chunk_a_id, chunk_b_id), FKs ON DELETE CASCADE
- `chunk_prerequisites`: chunk_id TEXT NOT NULL, prerequisite_chunk_id TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(chunk_id, prerequisite_chunk_id), FKs ON DELETE CASCADE
- All 4 indexes present: idx_chunk_sim_a, idx_chunk_sim_b, idx_chunk_prereq_chunk, idx_chunk_prereq_prereq

## Area 2 — MinHash Persistence
**PASS**

- `ChunkSimilarities` imported in skills.js
- Second `findNearDuplicates()` call at 0.5 threshold after existing 0.7 dedup call
- Results stored via `ChunkSimilarities.createBatch()` with correct mapping
- Wrapped in try/catch — failure doesn't block extraction
- Existing 0.7 dedup logic completely unchanged (0.5 call is independent; all >= 0.7 pairs are a subset of >= 0.5)

## Area 3 — Section Path Parser
**PASS**

- `parseSectionPath(null)` → `{ parts: [], depth: 0, parent: null, isRoot: true }`
- `parseSectionPath("")` → same
- `parseSectionPath("Chapter 5")` → `{ parts: ["Chapter 5"], depth: 1, parent: null, isRoot: true }`
- `parseSectionPath("Chapter 5 > Section 5.1")` → `{ parts: ["Chapter 5", "Section 5.1"], depth: 2, parent: "Chapter 5", isRoot: false }`
- `parseSectionPath("Chapter 5 > Section 5.1 > Subsection 5.1.1")` → depth 3, parent "Chapter 5 > Section 5.1"

## Area 4 — Chunk Tree Builder
**PASS**

- `getChunkTree(materialId)` uses `Chunks.getMetadataByMaterial()`, parses section_path, builds nested tree
- `buildOutline(tree, maxTokens=200)` renders indented text with token-aware truncation

## Area 5 — Context Format
**PASS**

- Chunk headers: `--- label [3/12, Chapter 5 > Section 5.1] ---` (position + section_path)
- DOCUMENT STRUCTURE outline at top (single material: 200 tokens, multi-material: 80 tokens each)
- `loadChunksForBindings` returns `ordering`, `sectionPath`, `materialId` properties
- Total chunks counted from `Chunks.getMetadataByMaterial()` (actual total, not just loaded count)

## Area 6 — Prerequisite Inference
**PASS**

- `inferChunkPrerequisites(materialId, courseId)` with two methods:
  - Document order: chunks sharing parent skill, earlier ordering = prerequisite
  - Skill link: `facet_concept_links` with `link_type = 'prerequisite'`
- Stores via `ChunkPrerequisites.createBatch(records)` with INSERT OR IGNORE
- `ChunkPrerequisites`, `ChunkFacetBindings`, `FacetConceptLinks` all imported

## Area 7 — Context Prerequisite Annotation
**PASS**

- `loadFacetBasedContent`: queries `ChunkPrerequisites.getByChunk()`, annotates headers with `| builds on: [label]`
- Exam mode: same annotation present per chunk via inline try/catch

## Area 8 — Extraction Pipeline Unchanged
**PASS**

- `inferChunkPrerequisites` called in BOTH extraction branches (retry + first extraction)
- Both wrapped in try/catch with `console.warn` — failure never blocks extraction
- Existing extraction flow (dedup, skill extraction, concept links, unification) untouched

## Area 9 — Build Verification
**PASS**

- `npx vite build --mode development` succeeds (1.75s)

---

## DB Methods Verification
**PASS**

- `ChunkSimilarities`: createBatch (canonical ordering, withTransaction, INSERT OR IGNORE), getByChunk, getByCourse — all exported
- `ChunkPrerequisites`: create, createBatch (withTransaction), getByChunk (joins for prereq_label + prereq_section_path), getByMaterial — all exported

---

## Summary

| Area | Result |
|------|--------|
| 1. Migration 009 | PASS |
| 2. MinHash persistence | PASS |
| 3. Section path parser | PASS |
| 4. Chunk tree builder | PASS |
| 5. Context format | PASS |
| 6. Prerequisite inference | PASS |
| 7. Context prereq annotation | PASS |
| 8. Extraction pipeline | PASS |
| 9. Build verification | PASS |

**Overall: 9/9 PASS**
