# study — Tutor Phase 3 Blueprint: Chunk Teaching Effectiveness Feedback
**Date:** 2026-03-24 | **Agent:** Study Systems Analyst | **Output Receipt:** Complete

---

## Overview

Two changes: (1) db.js methods to write/read `teaching_effectiveness` + ordering update, (2) study.js function to compute and apply effectiveness deltas at session end, wired from StudyContext.jsx.

No migration needed — `teaching_effectiveness REAL` column already exists on `chunk_facet_bindings` (migration 005). Currently NULL for all rows, never written.

---

## Change 1 — db.js ChunkFacetBindings Additions + Ordering Update

### 1a. `updateEffectiveness(chunkId, facetId, delta)` — NEW method

```javascript
async updateEffectiveness(chunkId, facetId, delta) {
  const db = await getDb();
  await db.execute(
    `UPDATE chunk_facet_bindings SET teaching_effectiveness = COALESCE(teaching_effectiveness, 0) + ?, updated_at = ? WHERE chunk_id = ? AND facet_id = ?`,
    [delta, now(), chunkId, facetId]
  );
  // Cap to [-1.0, 1.0]
  await db.execute(
    `UPDATE chunk_facet_bindings SET teaching_effectiveness = MAX(-1.0, MIN(1.0, teaching_effectiveness)) WHERE chunk_id = ? AND facet_id = ?`,
    [chunkId, facetId]
  );
},
```

**COALESCE pattern:** Handles the NULL→0 bootstrap for all existing rows. First UPDATE adds delta to current value (or 0 if NULL). Second UPDATE clamps to [-1.0, 1.0].

**Delta values:**
| Rating | Delta |
|---|---|
| easy | +0.1 |
| good | +0.05 |
| hard | -0.05 |
| struggled | -0.1 |

**Mastery delta threshold for positive deltas:** Only apply positive delta (easy/good) when `mastery_after - mastery_before > 0.05`. This prevents rewarding chunks when mastery didn't actually improve despite a good/easy rating (e.g., already-mastered facet). Negative deltas (hard/struggled) always apply — regression is always informative.

### 1b. `getEffectivenessByFacet(facetId)` — NEW method

```javascript
async getEffectivenessByFacet(facetId) {
  const db = await getDb();
  return db.select(
    `SELECT chunk_id, teaching_effectiveness FROM chunk_facet_bindings WHERE facet_id = ? AND teaching_effectiveness IS NOT NULL ORDER BY teaching_effectiveness DESC`,
    [facetId]
  );
},
```

Filters out NULL rows — only returns bindings that have accumulated effectiveness data.

### 1c. `getByFacetRanked()` — ORDER BY update

Current ORDER BY (line 2574-2577):
```sql
ORDER BY
  CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
  cfb.quality_rank,
  cfb.confidence DESC
```

New ORDER BY:
```sql
ORDER BY
  CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
  cfb.quality_rank,
  CASE WHEN cfb.teaching_effectiveness IS NULL THEN 1 ELSE 0 END,
  cfb.teaching_effectiveness DESC,
  cfb.confidence DESC
```

**NULLS LAST pattern:** SQLite doesn't support `NULLS LAST` syntax directly. The `CASE WHEN ... IS NULL THEN 1 ELSE 0 END` idiom sorts NULLs after non-NULL values. This preserves existing ordering for all current bindings (all currently NULL, so they sort together and fall back to confidence DESC) while promoting high-effectiveness chunks once data accumulates.

**Safety guarantee:** Since all existing rows have `teaching_effectiveness = NULL`, the CASE expression evaluates to 1 for all, making them sort identically within the same quality_rank — existing ordering preserved. As effectiveness data accumulates, non-NULL rows (CASE=0) sort before NULL rows (CASE=1), with higher effectiveness first.

---

## Change 2 — study.js `updateChunkEffectiveness(sessionId)` + Session End Wiring

### 2a. New function in study.js

```javascript
export const updateChunkEffectiveness = async (sessionId) => {
  if (!sessionId) return;
  var exchanges;
  try { exchanges = await SessionExchanges.getBySession(sessionId); } catch { return; }
  if (!exchanges || !exchanges.length) return;

  var DELTA_MAP = { easy: 0.1, good: 0.05, hard: -0.05, struggled: -0.1 };

  for (var ex of exchanges) {
    var delta = DELTA_MAP[ex.rating];
    if (delta == null) continue; // unknown rating

    // Positive delta requires mastery improvement > 0.05
    if (delta > 0 && (ex.mastery_after - ex.mastery_before) <= 0.05) continue;

    // Parse chunk_ids_used (JSON array string or null)
    var chunkIds;
    try { chunkIds = ex.chunk_ids_used ? JSON.parse(ex.chunk_ids_used) : []; } catch { continue; }
    if (!Array.isArray(chunkIds) || !chunkIds.length) continue;

    for (var cid of chunkIds) {
      try {
        await ChunkFacetBindings.updateEffectiveness(cid, ex.facet_id, delta);
      } catch { /* binding may not exist for this chunk+facet pair — skip */ }
    }
  }
};
```

**Location:** After `loadPracticeMaterialCtx` export (end of study.js utility functions, before the final exports block). Import `SessionExchanges` and `ChunkFacetBindings` are already imported in study.js.

**Error isolation:** Each chunk update wrapped in try/catch. A missing binding row (chunk_id + facet_id combination not in chunk_facet_bindings) will simply affect 0 rows — the UPDATE WHERE clause handles this gracefully. The outer try/catch on `getBySession` handles the table not existing yet.

### 2b. Session end wiring in StudyContext.jsx

**Key finding:** `chatSessionId` is a private ref in StudyContext — NOT exposed through the context value to StudyScreen. Therefore `updateChunkEffectiveness` CANNOT be called from StudyScreen's `handleExitSession`. It must be called from within StudyContext.jsx where `chatSessionId.current` is accessible.

**Best insertion point:** Inside `saveSessionToJournal` (line 383-392), which:
- Has access to `chatSessionId.current`
- Is called from StudyScreen's `handleExitSession` (lines 58, 63)
- Is called from `beforeunload` and `visibilitychange` handlers (lines 395-396)
- Is the single convergence point for all session end paths

**Modification to `saveSessionToJournal`:**

```javascript
const saveSessionToJournal = useCallback(async () => {
  if (!active || msgs.length <= sessionStartIdx.current + 1) return;
  try {
    const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
    if (!entry) return;
    await JournalEntries.create({ sessionId: chatSessionId.current, courseId: active.id, intent: 'v1_compat', entryData: entry });
    // Phase 3: update chunk teaching effectiveness from session exchanges
    try { await updateChunkEffectiveness(chatSessionId.current); } catch { /* non-critical */ }
    sessionStartIdx.current = msgs.length;
    sessionSkillLog.current = [];
  } catch (e) { console.error("Journal save failed:", e); }
}, [active, msgs]);
```

**Insert the `updateChunkEffectiveness` call after the journal entry is created but before resetting session state.** Wrapped in its own try/catch so a failure doesn't block journal saving.

**Import:** Add `updateChunkEffectiveness` to the existing study.js import in StudyContext.jsx (line 18).

### Alternative considered: separate useEffect on session end

Rejected. `saveSessionToJournal` is already the canonical session-end hook used by all exit paths. Adding a separate mechanism would create a second session-end trigger that could fall out of sync. The single-point modification is safer.

### Course-enter flow (line 927)

The `enterStudy` handler also calls `generateSessionEntry` for stale sessions (line 927) and then `Sessions.end(oldSid)` (line 932). This stale session capture should NOT call `updateChunkEffectiveness` — the stale session's exchanges were from a different session lifetime and effectiveness feedback should only apply to actively completed sessions.

---

## What Does NOT Change

- No migration needed — `teaching_effectiveness` column already exists
- `collectFacetBindings()` — no changes (inherits new ordering from `getByFacetRanked`)
- `loadFacetBasedContent()` — no changes (ordering improvement propagates automatically)
- `create()` / `createBatch()` on ChunkFacetBindings — no changes (new bindings start with NULL effectiveness, correctly sorted last)
- PracticeMode — no changes (doesn't use `chatSessionId`, doesn't log session exchanges)
- `applySkillUpdates()` — no changes
- `parseSkillUpdates()` — no changes
