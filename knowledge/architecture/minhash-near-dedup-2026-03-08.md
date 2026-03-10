# MinHash Near-Duplicate Detection — Architecture Blueprint

**Date:** 2026-03-08
**Phase:** Concept Links & MinHash Near-Dedup (Phase 1)
**Status:** Implemented

## Overview

Detects near-duplicate materials within a course using MinHash fingerprinting. Prevents redundant Claude API calls when users upload slightly different versions of the same document (e.g., lecture notes v1 vs v2, syllabus revisions). Complements the existing SHA-256 exact-hash dedup in `runExtractionV2`.

## Algorithm Specification

### Module: `src/lib/minhash.js` (zero internal dependencies)

**Shingling:**
- 5-word sliding window over normalized text (lowercase, punctuation-stripped, whitespace-collapsed)
- Guard: text < 50 chars returns `null`; 0 shingles returns `null`

**Base hash:** FNV-1a 32-bit on each shingle string

**MinHash signature:**
- 128 hash functions of form: `h_i(x) = (a_i * x + b_i) mod p`
- Prime `p = 2^31 - 1` (Mersenne prime)
- Coefficients `a_i`, `b_i` generated deterministically via seeded LCG (seed=42)
- LCG: `next = (1664525 * prev + 1013904223) mod 2^32`
- `a` values forced odd (coprime to p)

**Similarity:** Count matching positions / 128 = estimated Jaccard index

**Storage:** `Uint32Array(128)` → 512 bytes as BLOB

### Exports

| Function | Signature | Description |
|----------|-----------|-------------|
| `computeMinHash` | `(text, numHashes=128) → {signature: Uint32Array, shingleCount} \| null` | Compute MinHash signature |
| `estimateJaccard` | `(sigA, sigB) → number` | Estimate Jaccard similarity [0,1] |
| `findNearDuplicates` | `(newFps, existingFps, threshold=0.7) → [{newChunkId, existingChunkId, similarity}]` | Batch compare, return matches above threshold |
| `normalize` | `(text) → string` | Lowercase, strip punctuation, collapse whitespace |
| `shingle` | `(text, k=5) → Set<string>` | Generate k-word sliding window shingles |
| `hashFamily` | `(numHashes=128, seed=42) → [{a, b}]` | Deterministic coefficient generation (seeded LCG) |
| `SIGNATURE_SIZE` | `128` | Constant for documentation |

## DB Schema

Table `chunk_fingerprints` (already in `001_v2_schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS chunk_fingerprints (
    chunk_id      TEXT PRIMARY KEY,
    minhash_sig   BLOB NOT NULL,       -- 512 bytes (Uint32Array of 128)
    shingle_count INTEGER,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
```

### DB Module: `ChunkFingerprints` in `src/lib/db.js`

| Method | Description |
|--------|-------------|
| `create(chunkId, minhashSig, shingleCount)` | INSERT single fingerprint |
| `createBatch(items)` | Batch INSERT inside `withTransaction` |
| `getByCourse(courseId)` | JOIN chunks->materials, returns with reconverted Uint32Array |
| `getByMaterial(materialId)` | Same filtered by material |
| `delete(chunkId)` | Explicit delete (CASCADE handles most cases) |

Already in `resetAll()` FK-ordered delete list.

## Integration Points

### A: Fingerprint at chunk creation

**Helper:** `computeAndStoreFingerprints(materialId, chunks)` in `skills.js`
- Exported for use by both V1 and V2 paths

**V2 structured path** (EPUB/DOCX/PDF):
- In `storeAsChunks`, after `Chunks.createBatch(chunks)`, immediately fingerprints
- Content is available inline — no deferred storage

**V1 fallback path** (TXT/PPTX/XLSX):
- In `StudyContext.jsx`, after the `_pendingDocs` flush loop
- Both `createCourse` and `addMats` flows
- Content extracted from `pd.doc` before flush completes

### B: Near-dedup check at extraction time

In `runExtractionV2`, after the existing exact-hash dedup block:

```
Flow:
1. Exact-hash check (SHA-256) — catches identical content
2. NEW: MinHash check — catches near-duplicate content
3. Filter to unfinished chunks
4. Run extraction
```

**Logic:**
1. Load fingerprints for the new material
2. Load all course fingerprints, exclude the new material's own
3. For each new fingerprint, check if any existing fp has Jaccard >= 0.7
4. If ALL new chunks are near-duplicates → skip extraction with warn notification

**Failure mode:** Non-blocking. If MinHash check fails, extraction proceeds normally.

## Sequence Diagram

```
Upload → storeAsChunks
           ├─ V2: Chunks.createBatch → computeAndStoreFingerprints
           └─ V1: _pendingDocs → flush → computeAndStoreFingerprints

Extract → runExtractionV2
           ├─ SHA-256 exact-hash check
           ├─ MinHash near-dedup check (NEW)
           │    ├─ Load material fingerprints
           │    ├─ Load course fingerprints (exclude self)
           │    ├─ Compare each new fp against existing
           │    └─ All near-dup? → skip with warn
           └─ Proceed to extraction
```

## Edge Cases

| Case | Handling |
|------|----------|
| Text < 50 chars | `computeFingerprint` returns `null`, chunk skipped |
| 0 shingles | Returns `null` |
| BLOB endianness | `Uint8Array` view for storage/retrieval, platform-consistent |
| Partial near-dup | Only skip if ALL new chunks are near-duplicates |
| No fingerprints yet | Near-dedup check skipped (no existing fps to compare) |
| MinHash check fails | Caught, logged, extraction proceeds normally |
| `resetAll` | `chunk_fingerprints` in FK-ordered delete list |
| Chunk deletion | FK `ON DELETE CASCADE` handles cleanup |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/minhash.js` | **NEW** — pure algorithm module (~130 lines) |
| `src/lib/db.js` | Added `ChunkFingerprints` module (~65 lines) |
| `src/lib/skills.js` | Added imports, `computeAndStoreFingerprints` helper, V2 path fingerprinting, near-dedup check in `runExtractionV2` |
| `src/StudyContext.jsx` | Added import, V1 path fingerprinting after `_pendingDocs` flush in `createCourse` and `addMats` |

## Dependency Graph Addition

```
minhash.js                   (no internal deps — pure algorithm)
db.js                        (ChunkFingerprints added)
skills.js  → minhash.js, db.js  (computeAndStoreFingerprints, near-dedup check)
StudyContext.jsx → skills.js     (computeAndStoreFingerprints)
```
