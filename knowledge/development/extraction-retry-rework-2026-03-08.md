# Extraction Retry Rework — Development Log
**Date:** 2026-03-08
**Role:** Study Developer
**Blueprint:** `knowledge/architecture/extraction-retry-rework-2026-03-08.md`
**Validation:** `knowledge/architecture/extraction-retry-validation-2026-03-08.md`
**Build:** `npm run build` PASS (1.30s) — all 3 phase checkpoints passed

---

## Summary

Implemented the extraction retry rework addressing 5 confirmed bugs (B1–B5) across 3 phases:

- **Phase A** — DB layer (`markFailed`/`markFailedBatch`) + `getMaterialState` rework
- **Phase B** — Extraction pipeline (`enrichFromMaterial` fixes, `extractChaptersOnly`, `runExtractionV2` rework)
- **Phase C** — MaterialsScreen UI (new states, percentage display, chunk-level messaging)

All amendments from the Systems Analyst validation were applied: A2 (getAlreadyExtractedChapters), A6 (isFirstChapter=false), A7 (replace updateStatusBatch('error') with markFailedBatch).

---

## Files Modified

| File | Before | After | Delta | Changes |
|------|--------|-------|-------|---------|
| `src/lib/db.js` | 1819 | 1846 | +27 | Added `Chunks.markFailed` and `Chunks.markFailedBatch` |
| `src/lib/extraction.js` | 1351 | 1535 | +184 | Fixed `enrichFromMaterial`, added `extractChaptersOnly`, A7 in `extractCourse` |
| `src/lib/skills.js` | 468 | 497 | +29 | Reworked `runExtractionV2`, added `getAlreadyExtractedChapters` |
| `src/StudyContext.jsx` | 1122 | 1133 | +11 | Reworked `getMaterialState` — added `incomplete` and `partial` states |
| `src/screens/MaterialsScreen.jsx` | 556 | 562 | +6 | New badges, incomplete/partial card body, cleaned up error states |

**Total delta:** +257 lines across 5 files.

---

## Phase A — DB Layer + State Logic

### 1. `Chunks.markFailed` / `Chunks.markFailedBatch` (db.js:822–847)

Two new methods on the Chunks module:

```js
async markFailed(id) — single chunk
async markFailedBatch(ids) — batch within transaction
```

Both execute:
```sql
UPDATE chunks SET
  fail_count = fail_count + 1,
  status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END,
  updated_at = ?
WHERE id = ?
```

Atomic increment + terminal transition at threshold (3 attempts = permanent failure).

**A7 applied:** Replaced `Chunks.updateStatusBatch(group.chunkIds, 'error')` in `extractCourse` with `Chunks.markFailedBatch(group.chunkIds)` at 2 call sites (line 826 and 893 in the original). This ensures consistent terminal-state transitions across ALL error paths — not just the new ones.

### 2. `getMaterialState` rework (StudyContext.jsx:138–165)

Complete rewrite with 3-tier priority:

1. **Done states** (pending=0 && errored=0):
   - `extracted > 0 && skills > 0` → `"ready"`
   - `failed === total` → `"critical_error"`
   - `extracted > 0 && failed > 0` → `"partial"` (NEW)
   - Fallback → `"ready"` (extracted, no skills yet)

2. **Active processing** (`processingMatId === mat.id`):
   - Skills exist → `"extracting"`
   - No skills → `"analyzing"`

3. **Stale fallback** (pending/errored but not processing):
   - → `"incomplete"` (NEW)

**Bugs fixed:**
- B2: No more infinite "analyzing" animation when nothing is running. If `processingMatId !== mat.id` and chunks are pending/errored, returns `"incomplete"` instead of `"analyzing"`.
- `"error"` state (>25% failed) removed — the new `"incomplete"` and `"partial"` states handle these cases with better granularity.

---

## Phase B — Extraction Pipeline

### 3. `enrichFromMaterial` fixes (extraction.js:947–1093)

Five targeted fixes to the existing enrichment function:

| Fix | Bug | What changed |
|-----|-----|-------------|
| Filter chunks | B3, B4 | `allChunks.filter(c => c.status !== 'extracted' && c.status !== 'failed')` — only send unfinished content |
| API error → markFailedBatch | B1, B5 | Early return path now calls `Chunks.markFailedBatch(unfinishedChunkIds)` before returning |
| Parse failure → markFailedBatch | B1, B5 | Same — parse failure early return now marks chunks |
| Targeted updateStatusBatch | B3 | Only marks `unfinishedChunkIds` as extracted, not ALL chunks |
| Bindings scoped | B3 | Chunk-skill bindings only created for chunks that were actually sent |

### 4. `extractChaptersOnly` — new function (extraction.js:1095–1248)

New retry-path function. Takes pre-filtered chapter groups (only unfinished chunks) and runs chapter-level extraction with identity matching against existing skills.

Key design decisions:
- **isFirstChapter = false always (A6):** CIP detection unnecessary for retry — parent skill already exists. Saves ~4,300 tokens per LLM call.
- **Parent skill resolution (A5):** Uses most-common `parent_skill_id` from existing skills (handles edge case of multiple parent skills).
- **Identity matching:** Uses `matchExtractedSkills` — matched skills get `updateFromReextraction` (additive merge), genuinely new skills get `SubSkills.create`.
- **Error handling:** Failed chapters get `Chunks.markFailedBatch` (increments fail_count, transitions to terminal).
- **Within-chapter prerequisites:** Resolved using `SkillPrerequisites.createBatch` within the transaction.
- **Cross-chapter prerequisites:** Wired after the main transaction via `wireCrossChapterPrereqs`.

### 5. `runExtractionV2` rework (skills.js:393–497)

Fundamental change: retry now filters to unfinished chunks and routes through chapter-level extraction.

**Before:**
```
existingV2.length > 0 → enrichFromMaterial (single LLM call, all content)
else → extractCourse (full extraction)
```

**After:**
```
unfinishedChunks.length === 0 → "All sections already processed"
existingV2.length > 0 → extractChaptersOnly (chapter-level, only unfinished chunks)
else → extractCourse (full, with skipChapters from getAlreadyExtractedChapters)
```

**`getAlreadyExtractedChapters` (A2):** New helper that groups all chunks by chapter and returns a `Set` of chapter numbers where ALL chunks are `extracted` or `failed`. Used to build `skipChapters` for first-extraction retry path. Includes `failed` in the skip check — permanently failed chapters shouldn't be re-attempted.

---

## Phase C — UI Updates

### 6. MaterialsScreen.jsx UI (562 lines, +6)

**Badge configs added:**
```js
incomplete: { bg: T.amS, color: T.am, label: "Extraction incomplete", icon: "⚠" }
partial:    { bg: T.amS, color: T.am, label: "Partially extracted",   icon: "⚠" }
```

**State categories updated:**
- `isProcessing` = reading/analyzing/extracting (active animation)
- `isReady` = ready (study button)
- `isIncomplete` = incomplete/partial (retry prompt, percentage)
- `isError` = critical_error only (terminal failure)

**Old `error` state removed:** Was `failed > 25% of chunks`. Now handled by `incomplete` (retriable) and `partial` (mixed extracted + permanently failed).

**Incomplete/Partial card body:**
- Static progress bar (not animated shimmer)
- "X/Y sections extracted (Z%)" text
- Permanently failed count (if any)
- Unfinished section count needing retry
- "Retry (N sections)" button
- "Study Available Skills" button (if skills exist)
- Remove button

**Processing card body cleaned up:**
- Removed `!processingMatId` fallback retry button — now dead code because `getMaterialState` returns `"incomplete"` when processingMatId is null and chunks are pending
- Processing section now only renders during active extraction

**Error card body simplified:**
- Only handles `critical_error` (all chunks permanently failed)
- Single message: "couldn't be processed after multiple attempts"
- "View Details" button → error log modal
- Remove button

**Card border updated:**
- Processing → accent border
- Incomplete/partial → amber border (40% opacity)
- Critical error → red border (40% opacity)
- Ready/other → default border

---

## State Machine Summary

```
Chunk statuses: pending → extracted (success)
                       → error (retriable, fail_count < 3)
                       → failed (terminal, fail_count >= 3)

Material states (derived from chunk statuses):
  reading       — no chunks yet (file being parsed)
  analyzing     — processing active, no skills yet
  extracting    — processing active, skills exist
  incomplete    — unfinished chunks, NOT processing  [NEW]
  partial       — mix of extracted + permanently failed [NEW]
  ready         — all done, skills exist
  critical_error — all chunks permanently failed
```

---

## What Was NOT Changed

- `extractCourse` — unchanged except A7 (markFailedBatch replaces updateStatusBatch('error'))
- `extractChapter` — per-chapter LLM call with retry, unchanged
- `enrichFromMaterial` for initial "add material" flow — still used, but now with failure handling fixes
- `reExtractCourse` — full re-extraction, unchanged
- `storeAsChunks` — chunk creation, unchanged
- FSRS algorithm — unchanged
- Schema — no migration needed (chunks.status and chunks.fail_count already exist)
- `matchExtractedSkills` — identity matching, unchanged
