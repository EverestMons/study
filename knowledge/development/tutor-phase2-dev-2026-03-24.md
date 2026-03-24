# study — Tutor Phase 2 Dev Log: Session Exchange Logging
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Change Summary

4 files modified, 1 file created. Migration 010 adds `session_exchanges` table. `SessionExchanges` db module provides `log()` and `getBySession()`. `loadFacetBasedContent()` now returns `{ ctx, chunkIds }` — propagated through `buildContext()` and `buildFocusedContext()` to StudyContext.jsx. Per-facet exchange logging in `applySkillUpdates()` records mastery_before/after per facet with chunk context.

## Changes

### 1. Migration 010 — `src-tauri/migrations/010_session_exchanges.sql` (NEW)
- `session_exchanges` table: id, session_id, facet_id, practice_tier, chunk_ids_used, mastery_before, mastery_after, rating, exchange_timestamp
- FKs: session_id → sessions(id) CASCADE, facet_id → facets(id) CASCADE
- Indexes: session_id, facet_id, exchange_timestamp

### 2. db.js — `SessionExchanges` module
- `log({ sessionId, facetId, practiceTier, chunkIdsUsed, masteryBefore, masteryAfter, rating })` — INSERT with uuid() + now()
- `getBySession(sessionId)` — SELECT ORDER BY exchange_timestamp ASC
- Inserted after Sessions module (~line 2131)

### 3. study.js — `loadFacetBasedContent()` API change
- Returns `{ ctx, chunkIds }` instead of string
- 3 early returns updated: `return ''` → `return { ctx: '', chunkIds: [] }`
- Collects chunk IDs from `primary` array and cross-domain chunks
- **4 call sites updated:**
  - `buildContext()` line 1283: destructures `facetResult.ctx` + collects `facetResult.chunkIds`
  - `buildFocusedContext()` assignment branch line 1512: destructures `asgnFacetResult`
  - `buildFocusedContext()` skill branch line 1572: destructures `skillFacetResult`
  - `loadPracticeMaterialCtx()` line 2090: destructures `facetResult.ctx`

### 4. study.js — Context builder return type changes
- `buildContext()` now returns `{ ctx, chunkIds: collectedChunkIds }` — collects from facet content + keyword-matched chunks
- `buildFocusedContext()` now returns `{ ctx, chunkIds: collectedChunkIds }` — collects from assignment/skill facet content + exam chunks

### 5. study.js — `applySkillUpdates()` logging hook
- New optional parameters: `sessionId = null`, `chunkIds = []`
- After `FacetMastery.upsert()` in per-facet routing path: calls `SessionExchanges.log()` with masteryBefore (from `fuExisting` via `currentRetrievability()`) and masteryAfter (from `fuResult.retrievability`)
- `practiceTier` set to null during tutoring
- Wrapped in try/catch for backward compat (table may not exist)
- Uniform distribution fallback: unchanged, no logging
- PracticeMode call: unchanged, no sessionId passed

### 6. StudyContext.jsx — Context builder destructuring + applySkillUpdates params
- `bootWithFocus`: destructures `ctxResult = await buildFocusedContext(...)`, stores `chunkIds` in `cachedSessionCtx.current`
- `sendMessage` cache hit: reads `contextChunkIds` from `cachedSessionCtx.current.chunkIds`
- `sendMessage` focus rebuild: destructures `focusResult`, captures `contextChunkIds`
- `sendMessage` general build: destructures `generalResult`, captures `contextChunkIds`
- `sendMessage` context refresh: destructures `updatedCtxResult`, stores `chunkIds` in cache
- `applySkillUpdates` call: passes `chatSessionId.current` and `contextChunkIds`
- Added `SessionExchanges` import: not needed — `SessionExchanges` is called from study.js, not StudyContext

## What Did NOT Change
- Uniform distribution fallback in `applySkillUpdates()` — no logging
- Skill-level mastery update path — no logging
- PracticeMode's `applySkillUpdates()` call (PracticeMode.jsx:321) — no sessionId, no chunkIds
- `parseSkillUpdates()` — unchanged
- `buildSystemPrompt()` — unchanged
- `loadPracticeMaterialCtx()` return type — still returns string (only needs ctx for practice problems)

## Build Verification
```
npx vite build --mode development
✓ built in 2.21s
```
No errors.

## Commit
```
febf064 feat: tutor phase 2 — session_exchanges table, SessionExchanges module, loadFacetBasedContent returns chunkIds, per-facet exchange logging
4 files changed, 108 insertions(+), 22 deletions(-)
```
