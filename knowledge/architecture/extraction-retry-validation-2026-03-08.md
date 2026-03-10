# Extraction Retry Rework — Architecture Validation
**Date:** 2026-03-08
**Role:** Study Systems Analyst
**Blueprint:** `knowledge/architecture/extraction-retry-rework-2026-03-08.md`

---

## Bug Confirmation

All 5 bugs confirmed against current code. Trace details below.

### B1. Phantom retry — CONFIRMED

Traced end-to-end:
1. "Retry Extraction" button → `runExtractionV2(courseId, matId, callbacks)` (MaterialsScreen.jsx:166)
2. `existingV2.length > 0` → true → `enrichFromMaterial(courseId, materialId, ...)` (skills.js:426)
3. `enrichFromMaterial` loads ALL chunks (extraction.js:962), sends ALL content to LLM (line 971)
4. **API error path** (line 986-988): returns `{ enriched: 0, newSkills: 0, issues: [...] }` — chunks NOT updated
5. **Parse failure path** (line 991-993): same — returns early, chunks NOT updated
6. `runExtractionV2` receives result → `onNotif('success', 'Enrichment: 0 enriched, 0 new.')` (line 436)
7. Retry handler → `setProcessingMatId(null)` → `getMaterialState` recalculates: chunks still `pending` → returns `"analyzing"` → loading animation loops indefinitely

**Root cause**: `enrichFromMaterial` has two early-return paths (API error, parse failure) that exit WITHOUT updating chunk status.

### B2. Stale "analyzing" animation — CONFIRMED

`getMaterialState` (StudyContext.jsx:145):
```js
if (pending > 0) return (sc && sc.count > 0) ? "extracting" : "analyzing";
```
No `processingMatId` check. When `processingMatId === null` (no extraction running) and chunks are `pending`, returns `"analyzing"`. MaterialsScreen (line 91) treats this as `isProcessing = true` → shows shimmer animation bar + "Analyzing content..." text.

The retry button DOES appear (gated by `!processingMatId` at line 159), creating a contradictory UI: loading animation + retry button simultaneously visible. User sees activity where there is none.

### B3. Blanket extracted status — CONFIRMED

`enrichFromMaterial` line 1072-1073:
```js
await Chunks.updateStatusBatch(chunks.map(c => c.id), 'extracted');
```
`chunks` = ALL chunks for the material (loaded at line 962). This marks every chunk as `extracted` regardless of whether it was already extracted, whether its content was actually sent to the LLM, or whether the LLM's response actually referenced it.

### B4. Retry re-processes entire material — CONFIRMED

`runExtractionV2` passes the full `materialId` to `enrichFromMaterial`. `enrichFromMaterial` loads ALL chunks (line 962) and concatenates ALL content (line 971). There is no filtering by chunk status. The `extractCourse` path has `skipChapters` but it's for user-deselected chapters, not status-based filtering. Neither path is wired to retry only failed/pending chunks.

### B5. No terminal failure in enrichment path — CONFIRMED

`enrichFromMaterial` never increments `failCount`:
- API error (line 987): returns early, no chunk update
- Parse failure (line 992): returns early, no chunk update
- Success (line 1073): marks ALL chunks as `extracted`
- No error path calls `updateStatus(id, 'error')` or increments `fail_count`

Compare with `extractCourse` (line 826): `Chunks.updateStatusBatch(group.chunkIds, 'error')` — this DOES increment `fail_count` via the SQL `CASE WHEN ? = 'error' THEN fail_count + 1` (db.js:800). But this path is never reached for retry when skills already exist.

---

## Escalated Questions — Analysis

### Q1: extractChaptersOnly vs. modifying extractCourse

**Verdict: extractChaptersOnly is the right approach.**

`extractCourse` fundamentally assumes it's creating ALL skills for a course from scratch:
- It assigns `parentSkillId` based on first-chapter CIP detection (line 821)
- It creates ALL sub-skills as new (line 850, no identity matching)
- It marks chunks as `error` on failure but never does identity merging

The retry-with-existing-skills case needs:
- No CIP detection (parent skill already exists)
- Identity matching against existing skills (`matchExtractedSkills`)
- Only process unfinished chunks
- Create only genuinely new skills, enrich matched ones

These requirements are closer to `reExtractCourse` than `extractCourse`, but `reExtractCourse` is destructive — it clears old bindings and rebuilds everything. For retry, we need additive behavior.

Modifying `extractCourse` to handle all three cases (fresh extraction, retry-with-skills, re-extraction) would overload it with conditionals. A focused `extractChaptersOnly` function reusing `extractChapter` for LLM calls + `matchExtractedSkills` for identity matching is cleaner.

**However**, see Amendment A4 below about save-logic duplication.

### Q2: matchExtractedSkills identity handling for retried chunks

**Verdict: Correctly handles the case. No amendment needed.**

Scenario: Chapter 1 succeeded (skills A, B, C created). Chapter 2 failed. On retry, only chapter 2 is re-extracted. LLM returns skills D, E (genuinely new) and B (overlaps with chapter 1's skill B).

`matchExtractedSkills` behavior:
1. `existing` = `SubSkills.getByCourse(courseId)` → includes A, B, C
2. Extracted B matches existing B via exact `conceptKey` match → goes to `matched` array
3. Extracted D, E have no match → go to `newSkills` array
4. `matchedExistingIds` set prevents double-matching

For matched skills: `updateFromReextraction` enriches criteria/evidence (additive merge). For new skills: `create()` inserts them. Chunk bindings are created for the new chunks → existing or new skill IDs.

**One minor edge case**: If retry extracts TWO skills that should both map to the same existing skill, the first matches, the second goes to `newSkills` (because `matchedExistingIds` prevents the second match). This creates a duplicate. Acceptable — the identity matching in `reExtractCourse` would catch it on a full re-extraction.

### Q3: DB.getCourses() compat shim and failCount

**Verdict: NOT A BLOCKER. failCount IS included.**

`DB.getCourses()` (db.js:1555-1557):
```sql
SELECT id, label, char_count as charCount, status, error_info as errorInfo, fail_count as failCount
FROM chunks WHERE material_id = ? ORDER BY ordering
```

The query explicitly selects `fail_count as failCount`. The alias matches what `getMaterialState` accesses (`c.failCount`). The `errorInfo` is also included and JSON-parsed (line 1559-1561).

**Data flow verified**:
1. `markFailedBatch` updates `fail_count` and `status` in DB ✅
2. Retry handler calls `DB.getCourses()` after extraction completes ✅
3. `DB.getCourses()` returns chunks with updated `failCount` and `status` ✅
4. `setCourses(refreshed); setActive(uc)` triggers re-render ✅
5. `getMaterialState` reads new chunk statuses → correct state returned ✅

**Race condition check**: Auto-save effect (StudyContext.jsx:271) is gated by `!globalLock`. During extraction, `globalLock` is set (MaterialsScreen.jsx:163). After extraction, `DB.getCourses()` refreshes state BEFORE `setGlobalLock(null)`. The auto-save then fires with the correct (DB-fresh) data. No data loss.

---

## Implementation Spec Validation

### Component 1: getMaterialState rework — APPROVED

The pseudocode correctly handles:
- Active processing via `processingMatId` check
- Stale detection: pending/errored + not processing → `"incomplete"`
- Partial success: extracted + failed → `"partial"`
- Terminal failure: all chunks failed → `"critical_error"`
- Ready: all extracted + skills exist → `"ready"`

The status priority ordering (done-states → active processing → stale fallback) is correct and eliminates the B2 bug.

### Component 2: MaterialsScreen UI — APPROVED

Badge configs and card body changes for `"incomplete"` and `"partial"` states are straightforward. The percentage bar and "X/Y sections extracted" text are derived from chunk status counts already available.

### Component 3: runExtractionV2 rework — APPROVED WITH AMENDMENTS

**Amendment A2**: The blueprint references `getAlreadyExtractedChapters(chunks)` for the first-extraction retry case. This function doesn't exist. It should return a `Set` of chapter numbers whose chunks are ALL `status === 'extracted'`. Straightforward to implement:
```js
function getAlreadyExtractedChapters(chunks) {
  const groups = groupChunksByChapter(chunks);
  const skip = new Set();
  for (const g of groups) {
    if (g.chunks.every(c => c.status === 'extracted' || c.status === 'failed')) {
      skip.add(g.chapter);
    }
  }
  return skip;
}
```
Note: include `'failed'` chunks in the skip check — permanently failed chapters shouldn't be re-attempted either.

**Amendment A3**: The content dedup check (lines 398-413) runs on `newChunks` (ALL chunks) before the unfinished filter. This is correct — dedup is about content identity, not extraction status. No change needed.

### Component 4: extractChaptersOnly — APPROVED WITH AMENDMENTS

**Amendment A4 (code duplication)**: The save-to-DB logic (skill creation, binding resolution, prerequisite wiring, chunk status updates) is now duplicated across `extractCourse`, `reExtractCourse`, and `extractChaptersOnly`. **Strongly recommend** extracting a shared helper:

```js
async function saveChapterExtractionResults(courseId, parentSkillId, chapterGroup, extractedSkills, conceptKeyToId, options = {}) {
  // 1. Create/update skills (identity matching if options.existingSkills provided)
  // 2. Resolve chunk bindings
  // 3. Save within-chapter prerequisites
  // 4. Mark chunks as extracted
}
```

This is not blocking — the per-function code is straightforward and correctness is easier to verify without the abstraction. But three copies of the same save logic means three places for bugs to diverge. File for near-term cleanup.

**Amendment A5 (parent skill resolution)**: Blueprint says "Uses the existing parent skill from the course's existing sub-skills." Implementation should be:
```js
const parentSkillId = existingV2[0]?.parent_skill_id || null;
```
This is fragile if a course has skills from multiple parent skills (unlikely but possible with custom CIP entries). Use the most common parent_skill_id:
```js
const parentCounts = {};
for (const s of existingV2) {
  parentCounts[s.parent_skill_id] = (parentCounts[s.parent_skill_id] || 0) + 1;
}
const parentSkillId = Object.entries(parentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
```
Not blocking — `existingV2[0].parent_skill_id` is correct for >99% of cases.

**Amendment A6 (isFirstChapter flag)**: `extractChaptersOnly` must pass `isFirstChapter = false` for ALL chapter groups. The CIP list injection (~4,300 tokens) only occurs when `isFirstChapter = true` (extraction.js:291). Since the course already has a parent skill, CIP detection is unnecessary. Wasting 4,300 tokens per retry LLM call would be a meaningful cost increase.

### Component 5: enrichFromMaterial fixes — APPROVED

All 5 fixes are correct:

| Fix | Root Cause Addressed | Implementation |
|-----|---------------------|----------------|
| Filter chunks | B3, B4 — sends already-extracted content | `chunks.filter(c => c.status !== 'extracted' && c.status !== 'failed')` |
| API error → mark failed | B1, B5 — early return without chunk update | `markFailedBatch(unfinishedChunkIds)` |
| Parse failure → mark failed | B1, B5 — early return without chunk update | `markFailedBatch(unfinishedChunkIds)` |
| Success with 0 results → extracted | B1 — "0 results" treated as failure | `updateStatusBatch(unfinishedChunkIds, 'extracted')` |
| Targeted updates only | B3 — blanket updateStatusBatch | Only update chunks that were actually sent |

### Component 6: Chunks.markFailed/markFailedBatch — APPROVED WITH AMENDMENT

The SQL is correct:
```sql
fail_count = fail_count + 1,
status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END
```
This atomically increments fail_count and transitions to terminal `'failed'` status at the threshold.

**Amendment A7 (consistency)**: The existing `Chunks.updateStatusBatch` with `status='error'` ALSO increments `fail_count`:
```sql
fail_count = CASE WHEN ? = 'error' THEN fail_count + 1 ELSE fail_count END
```
But it does NOT check the threshold for terminal status transition. After this rework, there will be two ways to increment `fail_count`:
1. `markFailedBatch` — increments + checks threshold → correct
2. `updateStatusBatch(ids, 'error')` — increments but no threshold check → incorrect

**Recommendation**: After implementing `markFailedBatch`, replace ALL `updateStatusBatch(ids, 'error')` calls with `markFailedBatch(ids)`. Specifically:
- `extractCourse` line 826: `await Chunks.updateStatusBatch(group.chunkIds, 'error')` → `await Chunks.markFailedBatch(group.chunkIds)`
- `extractCourse` line 893: same pattern in the catch block
- Any new error paths in `extractChaptersOnly` or `enrichFromMaterial`

This ensures consistent terminal-state transition across ALL code paths. Without this, chunks that fail via `extractCourse` never reach terminal `'failed'` status — they stay as `'error'` with incrementing `fail_count` but no status transition.

**This is important enough to be a required change, not optional.**

---

## Summary

| Component | Verdict | Amendments |
|-----------|---------|------------|
| Bug B1-B5 | All CONFIRMED | — |
| Q1: extractChaptersOnly approach | APPROVED | Right approach, not extractCourse modification |
| Q2: matchExtractedSkills identity | APPROVED | Handles correctly, minor edge case acceptable |
| Q3: DB.getCourses() failCount | NOT A BLOCKER | failCount included in compat shim query |
| C1: getMaterialState rework | APPROVED | — |
| C2: MaterialsScreen UI | APPROVED | — |
| C3: runExtractionV2 rework | APPROVED | A2: implement getAlreadyExtractedChapters, A3: dedup check OK |
| C4: extractChaptersOnly | APPROVED | A4: save-logic duplication (file for cleanup), A5: parent skill resolution (non-blocking), A6: isFirstChapter=false always |
| C5: enrichFromMaterial fixes | APPROVED | — |
| C6: markFailed/markFailedBatch | APPROVED | A7: replace ALL updateStatusBatch('error') calls with markFailedBatch (**required**) |

**Overall Verdict: APPROVED WITH AMENDMENTS A2-A7**

Required amendments (must implement):
- **A7**: Replace `updateStatusBatch(ids, 'error')` with `markFailedBatch(ids)` in `extractCourse` (2 call sites) to ensure terminal-state transitions work across all code paths

Recommended amendments (should implement):
- **A2**: Implement `getAlreadyExtractedChapters()` helper (referenced but not defined in blueprint)
- **A6**: Pass `isFirstChapter = false` for all chapters in `extractChaptersOnly` (saves ~4,300 tokens per LLM call)

Non-blocking amendments (defer OK):
- **A3**: Dedup check position validated, no change needed
- **A4**: Save-logic deduplication across 3 functions (maintainability, not correctness)
- **A5**: Multi-parent-skill resolution edge case (<1% of courses)
