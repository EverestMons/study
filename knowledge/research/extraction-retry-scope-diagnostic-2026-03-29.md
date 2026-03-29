# Extraction Retry Scope — Diagnostic Findings
**Date:** 2026-03-29

---

## 1. Retry Button Handler (MaterialsScreen.jsx)

There are **two retry entry points**:

### Per-material retry (MaterialsScreen.jsx:266-284)
Inline `onClick` handler on the per-material "Retry" button. Steps:
1. Guards: bails if `bgExtraction` or `processingMatId` already set
2. Calls `Chunks.resetForRetry(mat.id)` — resets **only `'failed'` chunks** back to `'pending'` (fail_count=0, error_info=NULL)
3. Calls `runExtractionV2(active.id, mat.id, callbacks)` — the main extraction orchestrator from `skills.js`
4. On completion, refreshes courses and skill counts

### Retry All (StudyContext.jsx:1572-1590)
`retryAllFailed()` — filters `active.materials` to those with any chunk where `status === 'pending' || status === 'error'`, then calls `runBackgroundExtraction(active.id, retryable)` which iterates materials and calls `runExtractionV2` for each.

**Key difference:** Per-material retry calls `Chunks.resetForRetry` first (resets `'failed'` → `'pending'`). Retry All does NOT call `resetForRetry` — it only picks up materials that already have `'pending'` or `'error'` chunks.

---

## 2. runExtractionV2 (skills.js:581-765) — The Orchestrator

`runExtractionV2(courseId, materialId, callbacks, { skipNearDedupCheck })` is the central function both retry paths call. It:

1. **Content dedup check** (line 585-601): Checks if ALL chunks' content_hashes already exist in a different material for the same course. If so, skips entirely.
2. **Near-dedup check** (line 603-680): MinHash similarity check against existing course chunks. May return `needsUserDecision` for the caller to handle.
3. **Filters to unfinished chunks only** (line 682-688):
   ```js
   const unfinishedChunks = newChunks.filter(c => c.status === 'pending' || c.status === 'error');
   ```
   If no unfinished chunks, returns early with `'All sections already processed.'`

4. **Branches based on existing skills** (line 690-694):
   - **If course has existing skills** (line 694-744): Groups ONLY `unfinishedChunks` by chapter, calls `extractChaptersOnly()` with identity matching against existing skills
   - **If no existing skills** (line 746-765): Builds `skipChapters` set via `getAlreadyExtractedChapters(newChunks)` (skips chapters where ALL chunks are `'extracted'` or `'failed'`), then calls `extractCourse()` with `skipChapters`

**Answer:** `runExtractionV2` does NOT call both `extractSkills()` and `extractFacets()`. It calls either `extractChaptersOnly()` or `extractCourse()` from `extraction.js`. Both are facet-based extraction pipelines (the v2 system). The old `extractSkills()` is not involved in the retry path.

---

## 3. extractCourse (extraction.js:981-) and extractChaptersOnly (extraction.js:1502-)

### extractCourse
- Loads ALL chunks for the material (`Chunks.getByMaterial`)
- Groups by chapter, then filters out `skipChapters`
- Processes remaining chapter groups through `extractChapter()`
- **Does NOT check per-chunk status** — it relies on the caller to pass `skipChapters`

### extractChaptersOnly
- Receives pre-filtered `chapterGroups` from caller (already only unfinished chunks)
- Processes each group through `extractChapter()`
- **Does NOT check per-chunk status** — it trusts the caller's filtering

### reExtractCourse (extraction.js:1808-)
- Loads ALL chunks, groups ALL by chapter, extracts ALL
- **No chunk-status filtering at all** — this is a full re-extraction path
- Not used in the retry flow (used for intentional re-extraction)

**Answer:** Neither `extractCourse` nor `extractChaptersOnly` checks whether a chunk already has facet bindings before sending to the API. They extract everything they receive. The filtering responsibility is entirely in `runExtractionV2`.

---

## 4. extractSkills (skills.js) — Legacy path

`extractSkills` is the old v1 extraction function. The retry paths do NOT use it. They exclusively use the v2 facet pipeline (`extractCourse` / `extractChaptersOnly` from extraction.js).

---

## 5. Per-Chunk Extraction Status in DB

### Chunk `status` column (db.js)
The `chunks` table has:
- **`status`** — TEXT column with values: `'pending'`, `'extracted'`, `'error'`, `'failed'`
- **`fail_count`** — INTEGER, incremented on each error. When `fail_count + 1 >= 3`, status auto-escalates to `'failed'`
- **`error_info`** — JSON text with error details

### Status lifecycle:
- `'pending'` — initial state, or reset by `resetForRetry`
- `'extracted'` — successfully processed
- `'error'` — extraction failed but retryable (fail_count < 3)
- `'failed'` — permanently failed (fail_count >= 3)

### Chunks.resetForRetry (db.js:1302-1308)
```sql
UPDATE chunks SET fail_count = 0, status = 'pending', error_info = NULL, updated_at = ?
WHERE material_id = ? AND status = 'failed'
```
Only resets `'failed'` chunks. Does NOT touch `'error'` chunks (they're already retryable).

### How "already extracted" is determined:
There is **no dedicated `has_skills` or `extraction_status` column**. The `status` column IS the extraction status. `runExtractionV2` filters on:
```js
c.status === 'pending' || c.status === 'error'
```
Chunks with `status === 'extracted'` are skipped. There's no check for existing `chunk_facet_bindings` rows — it trusts the status column.

### getAlreadyExtractedChapters (skills.js:496-504)
Used only in the no-existing-skills branch. Skips entire chapters where EVERY chunk is `'extracted'` or `'failed'`. This is a chapter-level optimization — if even one chunk is `'pending'`/`'error'`, the whole chapter is re-sent.

---

## Summary: What Happens on Retry

| Step | Per-Material Retry | Retry All |
|---|---|---|
| Reset failed chunks | Yes (`resetForRetry` → `'failed'` → `'pending'`) | No |
| Filter materials | Single material | Materials with any `pending`/`error` chunk |
| Chunk filtering | `runExtractionV2` filters to `pending`/`error` | Same |
| Extraction function | `extractChaptersOnly` (if skills exist) or `extractCourse` (if none) | Same |
| Already-extracted chunks | Skipped (status check in `runExtractionV2`) | Skipped |
| Facet binding check | None — trusts `status` column | Same |

**Key finding:** Retry does NOT re-extract all chunks. It only re-extracts chunks with `status = 'pending'` or `status = 'error'`. The filtering happens in `runExtractionV2` (skills.js:682-683), not in the extraction functions themselves. The `status` column on the `chunks` table is the sole mechanism for tracking extraction state — there's no secondary check against `chunk_facet_bindings`.
