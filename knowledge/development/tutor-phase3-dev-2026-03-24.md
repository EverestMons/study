# study — Tutor Phase 3 Dev Log: Chunk Teaching Effectiveness Feedback
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Change Summary

3 files modified. `ChunkFacetBindings` gains `updateEffectiveness()` and `getEffectivenessByFacet()` methods. `getByFacetRanked()` ORDER BY updated to include `teaching_effectiveness DESC` with NULLS LAST idiom. New `updateChunkEffectiveness(sessionId)` function in study.js reads session exchanges and applies deltas. Wired into `saveSessionToJournal` in StudyContext.jsx.

## Changes

### 1. db.js — `ChunkFacetBindings` additions (lines ~2634-2653)

**`updateEffectiveness(chunkId, facetId, delta)`:**
- COALESCE(teaching_effectiveness, 0) + delta — handles NULL→0 bootstrap
- Second UPDATE caps to [-1.0, 1.0] via MAX/MIN
- Uses now() for updated_at

**`getEffectivenessByFacet(facetId)`:**
- SELECT chunk_id, teaching_effectiveness WHERE facet_id = ? AND teaching_effectiveness IS NOT NULL
- ORDER BY teaching_effectiveness DESC

### 2. db.js — `getByFacetRanked()` ORDER BY change (line 2574-2578)

Before:
```
binding_type priority → quality_rank → confidence DESC
```

After:
```
binding_type priority → quality_rank → CASE WHEN cfb.teaching_effectiveness IS NULL THEN 1 ELSE 0 END → teaching_effectiveness DESC → confidence DESC
```

SQLite NULLS LAST idiom: `CASE WHEN IS NULL THEN 1 ELSE 0 END` sorts NULL rows after non-NULL rows.

### 3. study.js — `updateChunkEffectiveness(sessionId)` (line ~2132)

- Reads `SessionExchanges.getBySession(sessionId)`
- Delta map: easy=+0.1, good=+0.05, hard=-0.05, struggled=-0.1
- Positive delta gated by mastery improvement > 0.05 threshold
- Parses `chunk_ids_used` JSON with null/empty handling
- Calls `ChunkFacetBindings.updateEffectiveness(cid, facetId, delta)` per chunk
- Each chunk update wrapped in try/catch for error isolation

### 4. StudyContext.jsx — Session end wiring (line 389)

- Import: Added `updateChunkEffectiveness` to study.js import (line 22)
- In `saveSessionToJournal`: Added `try { await updateChunkEffectiveness(chatSessionId.current); } catch { /* non-critical */ }` after journal entry creation, before session state reset

## What Did NOT Change

- No migration — `teaching_effectiveness` column already exists in migration 005
- `collectFacetBindings()` — unchanged (inherits new ordering from getByFacetRanked)
- `loadFacetBasedContent()` — unchanged (ordering improvement propagates automatically)
- `create()` / `createBatch()` — unchanged (new bindings start with NULL effectiveness)
- PracticeMode — unchanged
- `applySkillUpdates()` — unchanged
- `enterStudy` stale session capture (line 927) — NOT wired (effectiveness feedback only for active sessions)

## Build Verification
```
npx vite build --mode development
✓ built in 1.94s
```
No errors.

## Commit
```
a26a8d7 feat: tutor phase 3 — chunk teaching effectiveness feedback loop, updateChunkEffectiveness(), getByFacetRanked ordering update
3 files changed, 53 insertions(+), 1 deletion(-)
```
