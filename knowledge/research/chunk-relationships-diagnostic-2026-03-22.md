# Chunk Relationships Diagnostic
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## 1. Chunk Table Schema

**Table:** `chunks` (001_v2_schema.sql, lines 130-153)

| Column | Type | Relationship role |
|--------|------|-------------------|
| `id` | TEXT PK | UUID |
| `material_id` | TEXT FK → materials | Parent material |
| `course_id` | TEXT FK → courses | Parent course |
| `label` | TEXT | Display name |
| `content` | TEXT | Full body text |
| `content_hash` | TEXT | Dedup hash (upload-time only) |
| `char_count` | INTEGER | Length |
| `source_format` | TEXT | Original format |
| `heading_level` | INTEGER | HTML heading level 1-6 |
| `section_path` | TEXT | Hierarchical path (e.g., "Chapter 2 > Section 2.1") |
| `structural_metadata` | TEXT | JSON blob |
| `fidelity` | TEXT | Content preservation level |
| `page_start` | INTEGER | PDF/DOCX start page |
| `page_end` | INTEGER | PDF/DOCX end page |
| `ordering` | INTEGER | Sequence position within material |
| `status` | TEXT | pending/ready/error/failed |
| `error_info` | TEXT | JSON error details |
| `fail_count` | INTEGER | Retry counter |
| `created_at` | INTEGER | Unix epoch |
| `updated_at` | INTEGER | Last modified |

**No direct chunk-to-chunk columns** — no parent_id, prev_id, next_id, or sibling references.

**Indexes:** `idx_chunks_material`, `idx_chunks_course`, `idx_chunks_hash`, `idx_chunks_section`.

---

## 2. Chunk-to-Chunk Relationships in the DB

### Direct relationships: NONE

No table or FK directly links one chunk to another.

### Indirect relationships via binding tables:

| Table | Path | Notes |
|-------|------|-------|
| `chunk_facet_bindings` | chunk → facet | Typed: teaches, prerequisite_for, references. Has quality_rank, confidence |
| `chunk_skill_bindings` | chunk → sub_skill | Legacy fallback. Simple confidence binding |
| `facet_concept_links` | facet ↔ facet | Cross-domain. Types: same_concept, prerequisite, related |
| `concept_links` | skill ↔ skill | Within parent group. Same types |

**Transitive path:** Chunk A → facet P → (facet_concept_link) → facet Q → Chunk B. This is actively used by `loadCrossDomainChunks()` in study.js to find related material across different documents.

### Dedup tables (no stored relationships):

| Table | Contents | Creates links? |
|-------|----------|----------------|
| `chunk_fingerprints` | MinHash signatures (BLOB) per chunk | No — signatures stored, but comparison results are ephemeral |

---

## 3. How Chunks Know Their Neighbors

### Ordering within a material

All multi-chunk queries use `ORDER BY ordering`:
- `Chunks.getByMaterial(materialId)` — `SELECT * FROM chunks WHERE material_id = ? ORDER BY ordering`
- `Chunks.getByCourse(courseId)` — `SELECT * FROM chunks WHERE course_id = ? ORDER BY ordering`
- `Chunks.getActiveByCourse(courseId)` — same, joins active materials

### No explicit neighbor awareness

- No code fetches "chunk N-1" or "chunk N+1" relative to a given chunk
- No predecessor/successor tracking
- The tutor **cannot** say "let's look at what comes before this section" — it has no awareness of adjacent chunks

### Context assembly is flat

When chunks are assembled for the AI tutor, they appear as:
```
--- [chunk.label] ---
[chunk.content]
--- [next chunk.label] ---
[chunk.content]
```
No ordering metadata, no section hierarchy, no "this follows that" markers.

### Exam mode is the exception

In exam focus mode, chunks are loaded via `getMatContent()` which calls `Chunks.getByMaterial()` — this returns chunks in `ordering` sequence. So exam prep **implicitly** preserves document order, but the tutor doesn't know this.

---

## 4. MinHash Dedup — Does It Create Relationships?

**No.** MinHash comparison is ephemeral.

- `computeMinHash(text)` → returns `{ signature: Uint32Array, shingleCount }` (128 hash functions, 5-word shingles)
- `findNearDuplicates(newFingerprints, existingFingerprints, threshold=0.7)` → returns array of `{ newChunkId, existingChunkId, similarity }`
- These comparison results are **used at extraction time to skip duplicates** then discarded
- Only the signatures themselves are persisted in `chunk_fingerprints` for future comparisons
- No `duplicate_pairs` table, no similarity records stored

---

## 5. Section Path Hierarchy

### Encoded but unused

- `section_path` stores hierarchical paths like `"Chapter 2 > Section 2.1 > Subsection 2.1.1"`
- Set during chunk creation in `Chunks.create({ sectionPath })`
- Has a database index: `idx_chunks_section`
- **Zero usage** in study.js, context building, or any display code
- Not exposed to the AI tutor
- Not used for navigation or chunk selection

### Implicit hierarchy exists

Chunks from the same material with section paths like:
- `"Chapter 5 > Section 5.1"`
- `"Chapter 5 > Section 5.2"`
- `"Chapter 5 > Section 5.3"`

...are siblings under Chapter 5. This hierarchy is **stored but never queried or traversed.**

---

## 6. Cross-Material Chunk Relationships

### Active mechanism: Facet concept link transitivity

`loadCrossDomainChunks(facetIds)` (study.js:899-960):
1. Takes current study facet IDs
2. Queries `facet_concept_links` for linked facets
3. Loads chunks bound to linked facets via `ChunkFacetBindings.getByFacet()`
4. Returns chunks from different materials covering the same concepts

**Path:** Chunk A (textbook) → facet P → `facet_concept_links(same_concept)` → facet Q → Chunk B (lecture notes)

This is the **only cross-material chunk relationship** that exists. It works and is actively used in context building.

### No content-based cross-material links

- `content_hash` is for upload-time dedup only — not used to link similar chunks
- MinHash similarity results are discarded after extraction
- No table stores "chunk X from material A is similar to chunk Y from material B"

---

## 7. What's Missing

| Relationship type | Status | Impact |
|---|---|---|
| **(a) Sibling ordering** (next/previous within material) | **Implicit via `ordering`** but never exposed to tutor | Tutor cannot reference adjacent sections. No "see previous section" capability |
| **(b) Hierarchical parent-child** (chapter → section → subsection) | **Stored in `section_path`** but never parsed or traversed | No tree navigation. Cannot ask "show me all subsections of Chapter 5" |
| **(c) Cross-material similarity** (same topic, different docs) | **Exists via facet concept links** | Working. Only mechanism for cross-material chunk discovery |
| **(d) Prerequisite ordering** (chunk A before chunk B) | **Missing entirely** | No way to know "you should read Section 2.3 before Section 4.1". Skill prerequisites exist but don't map to chunk ordering |
| **(e) Supplementary relationships** (example/exercise for concept) | **Partially via binding_type** | `chunk_facet_bindings.binding_type` distinguishes "teaches" from "prerequisite_for" but no "example_of" or "exercise_for" type |

### Genuinely missing capabilities:

1. **Chunk sequence awareness for tutor** — the tutor receives chunks as a flat bag. Adding `ordering` metadata to context would let it say "in the next section..." or "as we saw earlier..."
2. **Section path traversal** — the indexed `section_path` column is dead weight. Parsing it into a tree would enable chapter-level navigation
3. **Persistent cross-chunk similarity** — MinHash comparisons are thrown away. Storing high-similarity pairs would enable "related sections" features without re-computing
4. **Chunk-level prerequisite ordering** — skills have prerequisites, but chunks don't. A chunk teaching "integration by parts" should reference the chunk teaching "basic integration" as a prerequisite

---

## Output Receipt

**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Investigated the complete chunk data model: schema (20 columns, no direct chunk-to-chunk FKs), 5 chunk-related tables, all DB queries (15+ methods), context building pipeline (3 focus modes), MinHash dedup flow, section_path usage, and cross-material linking via facet concept links.

### Files Deposited
- `study/knowledge/research/chunk-relationships-diagnostic-2026-03-22.md`

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- Classified `section_path` as "stored but unused" — indexed column with zero query usage
- Classified MinHash similarity as "ephemeral" — only signatures persisted, comparison results discarded
- Identified facet concept link transitivity as the sole cross-material chunk relationship mechanism

### Flags for CEO
- `section_path` column + index exists but is completely unused — potential for hierarchy navigation if parsed
- MinHash similarity results are discarded — storing them would enable "related sections" at zero additional API cost
- Chunk ordering metadata not exposed to tutor — simple addition could improve tutoring quality ("as the previous section explained...")
- No chunk-level prerequisite ordering exists (only skill-level)

### Flags for Next Step
- None (single-step diagnostic)
