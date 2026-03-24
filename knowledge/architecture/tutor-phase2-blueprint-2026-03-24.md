# study — Tutor Phase 2 Blueprint: Session Exchange Logging
**Date:** 2026-03-24 | **Agent:** Study Systems Analyst | **Output Receipt:** Complete

---

## 1. Migration 010: `session_exchanges` table

**File:** `src-tauri/migrations/010_session_exchanges.sql`

```sql
CREATE TABLE IF NOT EXISTS session_exchanges (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL,
    facet_id            INTEGER NOT NULL,
    practice_tier       INTEGER,
    chunk_ids_used      TEXT,
    mastery_before      REAL,
    mastery_after       REAL,
    rating              TEXT NOT NULL,
    exchange_timestamp  INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_se_session ON session_exchanges(session_id);
CREATE INDEX IF NOT EXISTS idx_se_facet ON session_exchanges(facet_id);
CREATE INDEX IF NOT EXISTS idx_se_timestamp ON session_exchanges(exchange_timestamp);
```

**Column semantics:**
- `id` — UUID via `uuid()`, matches existing convention
- `session_id` — FK to `sessions(id)`, CASCADE on delete
- `facet_id` — FK to `facets(id)`, CASCADE on delete
- `practice_tier` — 1-6 from TIERS array, NULL during tutoring (tutor sessions don't have fixed tiers)
- `chunk_ids_used` — JSON array string e.g. `'["chunk-abc","chunk-def"]'`, NULL if no chunks in context
- `mastery_before` — FSRS retrievability 0.0-1.0 before this exchange, 0.0 for first interaction
- `mastery_after` — FSRS retrievability 0.0-1.0 after the update
- `rating` — struggled/hard/good/easy
- `exchange_timestamp` — Unix epoch seconds via `now()`

---

## 2. db.js `SessionExchanges` Module

Add after the existing `Sessions` module (~line 2110). Pattern matches `FacetMastery`.

```javascript
export const SessionExchanges = {
  async log({ sessionId, facetId, practiceTier, chunkIdsUsed, masteryBefore, masteryAfter, rating }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO session_exchanges (id, session_id, facet_id, practice_tier, chunk_ids_used,
         mastery_before, mastery_after, rating, exchange_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionId, facetId, practiceTier || null, chunkIdsUsed || null,
       masteryBefore, masteryAfter, rating, now()]
    );
    return id;
  },

  async getBySession(sessionId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM session_exchanges WHERE session_id = ? ORDER BY exchange_timestamp ASC',
      [sessionId]
    );
  },
};
```

**Export:** Add `SessionExchanges` to the existing exports at the bottom of db.js.

---

## 3. `loadFacetBasedContent()` API Change

### Current signature and return (study.js:1045)
```javascript
const loadFacetBasedContent = async (facetIds, { mode, charLimit, includeCrossDomain } = {}) => {
  // ...
  return ctx;  // string
};
```

### New return type: `{ ctx, chunkIds }`

Collect chunk IDs from the `primary` array and cross-domain chunks:
```javascript
// After primary chunks are loaded (line 1051):
var allChunkIds = primary.map(c => c.chunkId);

// After cross-domain filtering (inside the includeCrossDomain block, line 1098):
for (var xc of crossFiltered) {
  allChunkIds.push(xc.chunkId);
}

// Replace return ctx; with:
return { ctx, chunkIds: allChunkIds };
```

**Early returns** must also return the new shape:
- Line 1046: `return '';` → `return { ctx: '', chunkIds: [] };`
- Line 1049: `return '';` → `return { ctx: '', chunkIds: [] };`
- Line 1052: `return '';` → `return { ctx: '', chunkIds: [] };`

### Call site updates (5 total)

| # | Location | Current code | New code | Needs chunkIds? |
|---|----------|-------------|----------|-----------------|
| 1 | `buildContext()` study.js:1281 | `var facetCtx = await loadFacetBasedContent(...);`<br>`if (facetCtx) ctx += facetCtx;` | `var facetResult = await loadFacetBasedContent(...);`<br>`if (facetResult.ctx) ctx += facetResult.ctx;` | No (general context) |
| 2 | `buildFocusedContext()` assignment branch study.js:1504 | `asgnFacetContent = await loadFacetBasedContent(...);` | `var asgnFacetResult = await loadFacetBasedContent(...);`<br>`asgnFacetContent = asgnFacetResult.ctx;` | No (context builder) |
| 3 | `buildFocusedContext()` skill branch study.js:1561 | `skillFacetContent = await loadFacetBasedContent(...);` | `var skillFacetResult = await loadFacetBasedContent(...);`<br>`skillFacetContent = skillFacetResult.ctx;` | No (context builder) |
| 4 | `loadPracticeMaterialCtx()` study.js:2078 | `var facetCtx = await loadFacetBasedContent(...);`<br>`if (facetCtx) return facetCtx;` | `var facetResult = await loadFacetBasedContent(...);`<br>`if (facetResult.ctx) return facetResult.ctx;` | No (practice mode) |
| 5 | None in StudyContext.jsx | `loadFacetBasedContent` is not called directly from StudyContext — it's called internally by `buildContext()` and `buildFocusedContext()` | N/A | N/A |

**Key insight:** `loadFacetBasedContent` is never called directly from StudyContext.jsx. It's called from context builders (`buildContext`, `buildFocusedContext`, `loadPracticeMaterialCtx`) which are all internal to study.js. The chunk IDs need to be surfaced up through the context builders to reach the `sendMessage` handler.

### Context builder return type changes

To propagate chunk IDs to the caller, `buildContext()` and `buildFocusedContext()` must also return `{ ctx, chunkIds }`:

**`buildContext()` (study.js:1169):**
- Collect chunk IDs from the `loadFacetBasedContent` call at line 1281
- Also collect from keyword-matched chunks loaded in lines 1308-1317
- Return `{ ctx, chunkIds: collectedChunkIds }` instead of `return ctx;`
- Current return: line 1331 `return ctx;` → `return { ctx, chunkIds: collectedChunkIds };`

**`buildFocusedContext()` (study.js:1427):**
- Collect from assignment facet content (line 1504) and skill facet content (line 1561)
- Also collect from exam mode's direct chunk loading (lines 1638-1653)
- Return `{ ctx, chunkIds: collectedChunkIds }` instead of `return ctx;`
- Current return: line 1697 `return ctx;` → `return { ctx, chunkIds: collectedChunkIds };`

### StudyContext.jsx call site updates for context builders

| # | Location | Current code | New code |
|---|----------|-------------|----------|
| 1 | `bootWithFocus` line 1159 | `const ctx = await buildFocusedContext(...);` | `const ctxResult = await buildFocusedContext(...);`<br>`const ctx = ctxResult.ctx;`<br>Store `ctxResult.chunkIds` in `cachedSessionCtx.current` |
| 2 | `sendMessage` focus rebuild line 1260 | `ctx = await buildFocusedContext(...);` | `var ctxResult = await buildFocusedContext(...);`<br>`ctx = ctxResult.ctx;`<br>Capture `ctxResult.chunkIds` |
| 3 | `sendMessage` general line 1263 | `ctx = await buildContext(...);` | `var ctxResult = await buildContext(...);`<br>`ctx = ctxResult.ctx;`<br>Capture `ctxResult.chunkIds` |
| 4 | `sendMessage` context refresh line 1340 | `var updatedCtx = await buildFocusedContext(...);` | `var updatedCtxResult = await buildFocusedContext(...);`<br>`var updatedCtx = updatedCtxResult.ctx;` |

The `chunkIds` captured in cases 1-3 should be stored in a local variable accessible when `applySkillUpdates` is called at line 1279.

---

## 4. `applySkillUpdates()` Logging Hook

### New parameters

```javascript
export const applySkillUpdates = async (courseId, updates, intentWeight, sessionMasteredSkills, sessionId = null, chunkIds = []) => {
```

Two new optional trailing parameters:
- `sessionId` — from `chatSessionId.current` in StudyContext. If null, skip logging (backward compat for PracticeMode and any other callers).
- `chunkIds` — array of chunk ID strings from context building.

### Logging insertion point

In the per-facet routing path (line 317-417), **after** the `FacetMastery.upsert()` call at line 394-404:

```javascript
// After FacetMastery.upsert (line 404):

// Log exchange if session tracking is active
if (sessionId) {
  var masteryBefore = fuExisting
    ? currentRetrievability({ stability: fuExisting.stability, lastReviewAt: fuExisting.last_review_at })
    : 0;
  await SessionExchanges.log({
    sessionId,
    facetId: targetFacet.id,
    practiceTier: null,
    chunkIdsUsed: chunkIds.length > 0 ? JSON.stringify(chunkIds) : null,
    masteryBefore,
    masteryAfter: fuResult.retrievability,
    rating: fu.rating,
  });
}
```

**`masteryBefore` computation:** `fuExisting` (line 327) is the facet mastery row loaded BEFORE the update. If it exists, compute retrievability from its stability + last_review_at using `currentRetrievability()`. If null (first interaction), use 0.

**`masteryAfter`:** `fuResult.retrievability` (line 397) is the post-update retrievability from the FSRS review.

**`practiceTier`:** Set to `null` during tutoring. The roadmap specified `strengthToTier(effectiveStrength(skillRow))` but this represents the student's current tier level, not a practice mode tier. Since this is the tutor path (not PracticeMode), `null` is correct. Practice mode exchanges are a separate concern (PracticeMode calls `applySkillUpdates` with `source: 'practice'` and doesn't use per-facet routing).

### What does NOT change
- Uniform distribution fallback (lines 440-540) — no logging here
- Skill-level mastery update path — no logging here
- PracticeMode's call to `applySkillUpdates` (PracticeMode.jsx:321) — doesn't pass `sessionId` or `chunkIds`, so logging is skipped (backward compat)

### Import needed in study.js
```javascript
// Add SessionExchanges to the existing import from db.js
import { ..., SessionExchanges } from './db.js';
```

### StudyContext.jsx `sendMessage` handler changes

At line 1279:
```javascript
// Current:
var newMasteryEvents = await applySkillUpdates(active.id, updates, intentWeight, sessionMasteredSkills.current) || [];

// New:
var newMasteryEvents = await applySkillUpdates(active.id, updates, intentWeight, sessionMasteredSkills.current, chatSessionId.current, contextChunkIds) || [];
```

Where `contextChunkIds` is captured from the context builder return value earlier in the function.

---

## 5. Data Flow Summary

```
sendMessage()
  ├─ buildContext() / buildFocusedContext()
  │    └─ loadFacetBasedContent() → { ctx, chunkIds }
  │    └─ returns { ctx, chunkIds }
  ├─ ctx → buildSystemPrompt() → callClaudeStream()
  ├─ chunkIds → stored as contextChunkIds
  └─ parseSkillUpdates(response)
       └─ applySkillUpdates(courseId, updates, weight, mastered, sessionId, chunkIds)
            └─ per-facet routing path:
                 ├─ FacetMastery.upsert()
                 └─ SessionExchanges.log({ sessionId, facetId, ..., chunkIds })
```

---

## 6. Verification Checklist (for Step 3 QA)

1. Migration 010 exists with correct schema, FKs, and indexes
2. `SessionExchanges.log()` and `.getBySession()` exported from db.js
3. `loadFacetBasedContent()` returns `{ ctx, chunkIds }` including early returns
4. All 4 call sites of `loadFacetBasedContent` destructure correctly
5. `buildContext()` and `buildFocusedContext()` return `{ ctx, chunkIds }`
6. All StudyContext.jsx call sites destructure context builder returns
7. `applySkillUpdates()` accepts `sessionId` and `chunkIds` parameters
8. Per-facet routing path calls `SessionExchanges.log()` after `FacetMastery.upsert()`
9. Uniform distribution + skill-level paths unchanged
10. PracticeMode call unchanged (backward compat — no sessionId passed)
11. Build passes: `npx vite build --mode development`
