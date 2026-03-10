# Extraction Retry Rework — Architecture Blueprint
**Date:** 2026-03-08
**Project:** study
**Assigned By:** CEO
**Status:** Draft

---

## Overview

The material extraction retry system has several bugs that cause silent failures, misleading UI states, and an inability to recover from partial extraction failures. This blueprint defines a rework of three layers: the extraction pipeline (chunk-level retry), the state display (percentage-based progress), and error handling (terminal failure detection).

## Confirmed Bugs

### B1. Phantom retry — enrichment path silently exits

**Root cause:** When the user hits "Retry Extraction" on a material, `runExtractionV2` checks if the course already has skills (`SubSkills.getByCourse`). If yes, it takes the enrichment path (`enrichFromMaterial`), not the full extraction path. The enrichment path:

1. Makes ONE LLM call with ALL chunk content concatenated — regardless of chunk status
2. If the LLM returns unparseable JSON → returns early with `{ enriched: 0, newSkills: 0, issues: [{ type: 'enrichment_parse_failed' }] }` — **chunks are NOT updated** (the `updateStatusBatch` call is after the early return)
3. If the LLM returns an API error string → returns early — **chunks are NOT updated**
4. The retry button handler receives `{ success: true, totalSkills: 0 }` (enrichment treats 0 results as success) → shows a brief "Extraction complete. " notification → clears globalLock/processingMatId
5. `getMaterialState()` recalculates: chunks still have `pending` status → returns "analyzing" → card shows loading animation indefinitely

### B2. getMaterialState shows "analyzing" animation when nothing is running

**Root cause:** The state function has no concept of "stale." If chunks are `pending` and `processingMatId` is null (no extraction running), the card still shows "Analyzing content..." with the loading animation. The user sees activity where there is none.

The specific logic:
```js
if (pending > 0) return (sc && sc.count > 0) ? "extracting" : "analyzing";
```
This returns "analyzing" any time there are pending chunks, regardless of whether an extraction is actually in progress.

### B3. enrichFromMaterial marks ALL chunks as extracted on success

**Root cause:** Line 1072-1073 of extraction.js:
```js
await Chunks.updateStatusBatch(chunks.map(c => c.id), 'extracted');
```
This runs after successful enrichment and marks every chunk in the material as "extracted" — even chunks that were already extracted, and even chunks whose content contributed nothing to the enrichment result. This makes it impossible to distinguish which chunks were genuinely processed.

### B4. Retry re-runs full material, not failed chunks only

**Root cause:** The "Retry Extraction" button calls `runExtractionV2` with just `(courseId, materialId)`. This function loads ALL chunks for the material and either runs full extraction or enrichment. There's no filtering for only failed/pending chunks. The `extractCourse` function has a `skipChapters` parameter but it's never wired to the retry flow.

### B5. No terminal failure state

**Root cause:** `failCount` on chunks tracks retry attempts, and `getMaterialState` treats `failCount >= 2` as permanent failure. But `enrichFromMaterial` never increments `failCount` — it either marks chunks as extracted or leaves them untouched. Only `extractCourse` increments fail count (via `updateStatusBatch('error')`). So materials that go through the enrichment path can retry infinitely with no progress.

## Design Decisions

### D1. Chunk status is the source of truth for progress
A material's extraction state is derived entirely from its chunks' statuses. No separate "material extraction state" is stored. The chunk statuses are: `pending` (not yet attempted), `extracted` (success), `error` (failed, retriable), `failed` (permanently failed after max retries).

### D2. Retry only processes unfinished chunks
"Retry Extraction" filters to chunks with `status = 'pending'` or `status = 'error'`, groups them by chapter, and passes the chapter groups through the extraction pipeline. Already-extracted chunks are skipped entirely.

### D3. Material card shows extraction percentage
Instead of vague "Analyzing..." animation, the card shows: "12/15 sections extracted (80%)". The percentage is `extracted / total`. Failed chunks show separately: "3 sections failed."

### D4. Stale detection replaces infinite animation
`getMaterialState()` gains a new state: `"incomplete"`. This fires when chunks are pending/errored AND no extraction is actively running (`processingMatId !== mat.id`). The card shows "Extraction incomplete — X/Y sections" with a prominent Retry button, not a loading animation.

### D5. Terminal failure after 3 attempts per chunk
Chunk `failCount` is incremented on every failed extraction attempt (including enrichment failures). After `failCount >= 3`, chunk status becomes `"failed"` (permanent). A material with all chunks either `extracted` or `failed` is considered done — the animation stops, and the card shows the final percentage.

### D6. enrichFromMaterial respects chunk status
The enrichment path is modified to only process chunks that are `pending` or `error` — not re-send already-extracted chunk content. On failure, it marks affected chunks with incremented `failCount` instead of silently returning.

## Implementation Spec

### Component 1: getMaterialState rework

**File:** `src/StudyContext.jsx`

Replace the current `getMaterialState` with logic that accounts for active processing:

```
getMaterialState(mat):
  chunks = mat.chunks || []
  if chunks.length === 0 → "reading"

  extracted = count where status === "extracted"
  failed = count where status === "failed" (permanent, failCount >= 3)  
  errored = count where status === "error" (retriable)
  pending = count where status === "pending"
  total = chunks.length
  sc = materialSkillCounts[mat.id]

  // Everything done (success or permanent failure)
  if (pending === 0 && errored === 0):
    if (extracted > 0 && sc?.count > 0) → "ready"
    if (failed === total) → "critical_error" 
    if (extracted > 0 && failed > 0) → "partial" [NEW STATE]
    → "ready" // extracted but no skills yet — possible for very short docs

  // Active processing
  if (processingMatId === mat.id):
    if (sc?.count > 0) → "extracting"
    → "analyzing"

  // Not processing but has unfinished chunks → stale
  if (pending > 0 || errored > 0):
    → "incomplete" [NEW STATE]
```

New states:
- `"incomplete"` — chunks remain pending/errored, no extraction running. Shows retry prompt, no animation.
- `"partial"` — some chunks extracted, some permanently failed. Shows percentage + failure count, no animation.

### Component 2: MaterialsScreen UI updates

**File:** `src/screens/MaterialsScreen.jsx`

Add badge configs for new states:
```js
incomplete: { bg: T.amS, color: T.am, label: "Extraction incomplete", icon: "⚠" },
partial: { bg: T.amS, color: T.am, label: "Partially extracted", icon: "⚠" },
```

For `incomplete` and `partial` states, the card body shows:
- Extraction percentage bar (not animated shimmer)
- "X/Y sections extracted" text
- If failed > 0: "Z sections permanently failed"
- Prominent "Retry Failed Sections" button (for incomplete) or "Retry X sections" (for partial)
- "Remove material" option with note: "If retry doesn't work, you may need to remove and re-upload"

### Component 3: runExtractionV2 rework — chunk-level retry

**File:** `src/lib/skills.js`

The current function has two paths: full extraction (first material) and enrichment (subsequent materials). The rework changes the retry behavior:

```
runExtractionV2(courseId, materialId, callbacks):
  chunks = Chunks.getByMaterial(materialId)
  
  // Content dedup check (keep existing — skip materials already extracted elsewhere)
  ...existing dedup logic...

  // NEW: Filter to only unfinished chunks
  unfinishedChunks = chunks.filter(c => c.status === "pending" || c.status === "error")
  
  if (unfinishedChunks.length === 0):
    // All chunks already extracted or permanently failed — nothing to do
    onNotif("info", "All sections already processed.")
    return { success: true, totalSkills: 0, skipped: true }

  existingV2 = SubSkills.getByCourse(courseId)

  if (existingV2.length > 0):
    // Course has skills — use chapter-level extraction on ONLY unfinished chunks
    // Group unfinished chunks by chapter
    chapterGroups = groupChunksByChapter(unfinishedChunks)
    // Use extractCourse logic but scoped to these chapter groups
    result = extractChaptersOnly(courseId, materialId, chapterGroups, existingV2, callbacks)
  else:
    // First extraction — use full extractCourse but only on unfinished chunks
    result = extractCourse(courseId, materialId, { 
      ...callbacks, 
      skipChapters: getAlreadyExtractedChapters(chunks) 
    })
  
  return result
```

The key change: instead of choosing between `extractCourse` (full) and `enrichFromMaterial` (single LLM call for all content), the retry path always uses chapter-level extraction scoped to unfinished chunks. This means:
- Each chapter gets its own LLM call with retry logic (3 attempts)
- Failed chapters get `failCount` incremented on their chunks
- Successful chapters get chunks marked `extracted`
- Progress is granular, not all-or-nothing

### Component 4: extractChaptersOnly — new function

**File:** `src/lib/extraction.js`

New function that runs the extraction loop on a provided set of chapter groups, using the existing `extractChapter` function for each. This is essentially the inner loop of `extractCourse` but:
- Takes pre-filtered chapter groups (only unfinished chunks)
- Uses the existing parent skill from the course's existing sub-skills (no CIP detection needed)
- Handles identity matching against existing skills (merge by conceptKey)
- Marks chunks as `extracted` on success, increments `failCount` on failure

This replaces `enrichFromMaterial` for the retry use case. `enrichFromMaterial` is kept for the initial "add material to existing course" flow where you want the single-call enrichment, but it gets the failure handling fixes from Component 5.

### Component 5: enrichFromMaterial failure handling fixes

**File:** `src/lib/extraction.js`

Fixes to the existing `enrichFromMaterial` function (used for initial "add material" flow, not retry):

1. **Filter chunks:** Only send content from chunks with `status !== 'extracted'` in the LLM call. Already-extracted chunks don't need re-enrichment.
2. **On API error:** Increment `failCount` on all unfinished chunks via `Chunks.updateStatus(id, 'error')`. Currently leaves them as `pending`.
3. **On parse failure:** Same — increment `failCount`. Currently returns early without touching chunks.
4. **On success with 0 results:** Mark chunks as `extracted` (the enrichment found nothing new, but the LLM successfully processed the content — that's a success, not a failure).
5. **Remove blanket updateStatusBatch at end:** Replace with targeted updates — only mark chunks that were actually sent to the LLM.

### Component 6: Chunk failCount enforcement

**File:** `src/lib/db.js` (Chunks module)

Add a helper that increments failCount and sets status:
```js
async markFailed(id) {
  const db = await getDb();
  await db.execute(
    `UPDATE chunks SET 
      fail_count = fail_count + 1,
      status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END,
      updated_at = ?
    WHERE id = ?`,
    [now(), id]
  );
}

async markFailedBatch(ids) {
  return withTransaction(async (db) => {
    for (const id of ids) {
      await db.execute(
        `UPDATE chunks SET 
          fail_count = fail_count + 1,
          status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END,
          updated_at = ?
        WHERE id = ?`,
        [now(), id]
      );
    }
  });
}
```

The existing `failCount >= 2` threshold for "permanent" in `getMaterialState` changes to `failCount >= 3` (3 attempts total before permanent failure). This gives the user: initial attempt + 2 retries.

## Files Changed

| File | Change | New/Modified |
|------|--------|-------------|
| `src/StudyContext.jsx` | Rework `getMaterialState` — add `incomplete` and `partial` states, pass `processingMatId` into state logic | Modified |
| `src/screens/MaterialsScreen.jsx` | Add UI for new states, percentage display, chunk-level retry button text | Modified |
| `src/lib/skills.js` | Rework `runExtractionV2` — filter to unfinished chunks, use chapter-level extraction for retry | Modified |
| `src/lib/extraction.js` | Add `extractChaptersOnly`, fix `enrichFromMaterial` failure handling | Modified |
| `src/lib/db.js` | Add `Chunks.markFailed` and `Chunks.markFailedBatch` helpers | Modified |

## What This Does NOT Change

- `extractCourse` — the initial full-extraction function is unchanged (it already handles per-chapter failures correctly)
- `extractChapter` — the per-chapter LLM call with 3-attempt retry is unchanged
- `storeAsChunks` — file parsing and chunk creation is unchanged
- FSRS algorithm — completely untouched
- Schema — no migration needed. `chunks.status` and `chunks.fail_count` columns already exist
- CIP taxonomy seeding — independent, already implemented

## Risks

1. **`extractChaptersOnly` duplicates logic from `extractCourse`:** The inner extraction loop is similar. Mitigate by extracting the shared loop into a helper, or by having `extractChaptersOnly` call `extractCourse` with the right `skipChapters` set.
2. **Identity matching during retry:** When retrying failed chapters on a course that already has skills, new extractions need to be matched against existing conceptKeys to avoid duplicates. The `matchExtractedSkills` function exists for this purpose.
3. **State change notification:** After extraction completes, `getMaterialState` needs to reflect the new chunk statuses. The existing `DB.getCourses()` refresh at the end of the retry handler should handle this, but verify chunk statuses are included in the returned data.

## Open Questions

None — all CEO decisions made in planning conversation.


### B6. "Reading" state persists indefinitely when chunk storage fails

**Root cause:** `getMaterialState` returns `"reading"` when `chunks.length === 0`. This is correct during the initial 2-5 second window when `storeAsChunks` is actively parsing and writing. But if chunk storage fails silently (parser error, DB write failure), the material record exists with zero chunks permanently. The card shows "Reading and parsing document..." with a shimmer animation forever. "Retry Extraction" does nothing because `runExtractionV2` loads zero chunks and exits silently via the `no_chunks` issue path.

**Fix:** The `"reading"` state should only display while an upload/parsing operation is actively running (during `createCourse` or `addMats` with `globalLock` active). If `chunks.length === 0` and no upload is in progress, show a new state: `"upload_failed"` — "No content found. Remove and re-upload this material."

Add to `getMaterialState`:
```
if (chunks.length === 0):
  if (globalLock or processingMatId === mat.id) → "reading"  // genuinely parsing
  → "upload_failed"  // stuck — chunks never saved
```

Add badge:
```js
upload_failed: { bg: "rgba(248,113,113,0.1)", color: T.rd, label: "Upload failed", icon: "⚠" }
```

Card body for `upload_failed`: "No content was extracted from this file. Try removing it and uploading again." + Remove button only (no retry — there's nothing to retry without chunks).
