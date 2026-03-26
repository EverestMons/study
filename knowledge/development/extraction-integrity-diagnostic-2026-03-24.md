# Extraction Pipeline Integrity Diagnostic — 2026-03-24

## Purpose
Verify that recent changes (tutor phases 1-4, chunk relationships, token optimization) did not degrade the material extraction pipeline.

---

## (1) extraction.js Integrity

**Status: INTACT**

File header and main exports confirmed present:
```
// extraction.js — Skill Extraction Pipeline v2
// Three-tier pipeline: Deterministic pre-processing → LLM extraction →
// Deterministic post-processing.
```

Imports: `api.js` (callClaude, extractJSON, isApiError), `db.js` (Chunks, SubSkills, ChunkSkillBindings, etc.), `cipData.js`.

First export: `groupChunksByChapter(chunks)` — intact, correct signature.

**`loadFacetBasedContent` references in extraction.js: NONE (confirmed)**. extraction.js is independent of study.js context building — no cross-contamination.

**Last modified**: extraction.js has only 3 commits in its history:
```
86ee3ca feat: hook skill unification into extraction pipeline
743d60f feat: chunk metadata enrichment — blockquote, subsection, list count, split fix
ba4b5f2 fix: MaterialsScreen black screen, phantom slide guardrails, proactive assignment decomposition
```
None of these are from the last 2 days. **extraction.js was not touched.**

---

## (2) loadFacetBasedContent API Change — All Call Sites

Phase 2 changed the return type from `string` to `{ ctx, chunkIds }`. All 5 call sites confirmed properly destructured:

### Call site 1 — `loadFacetBasedContent` definition (study.js:1063)
```js
const loadFacetBasedContent = async (facetIds, { mode = 'standard', charLimit = 24000, ... } = {}) => {
  if (!facetIds.length) return { ctx: '', chunkIds: [] };
```
Returns `{ ctx, chunkIds }` — correct.

### Call site 2 — buildContext, skill facets (study.js:1302)
```js
var facetResult = await loadFacetBasedContent(facetedSkillFacetIds, { mode: 'standard', charLimit: 16000 });
if (facetResult.ctx) ctx += facetResult.ctx;
collectedChunkIds.push(...facetResult.chunkIds);
```
Destructures `.ctx` and `.chunkIds` — correct.

### Call site 3 — buildFocusedContext, assignment facets (study.js:1529)
```js
var asgnFacetResult = await loadFacetBasedContent(asgnFacetIds, { mode: 'standard' });
asgnFacetContent = asgnFacetResult.ctx;
collectedChunkIds.push(...asgnFacetResult.chunkIds);
```
Destructures `.ctx` and `.chunkIds` — correct.

### Call site 4 — buildFocusedContext, skill facets (study.js:1588)
```js
var skillFacetResult = await loadFacetBasedContent(skillFacetIds, { mode: 'standard' });
skillFacetContent = skillFacetResult.ctx;
collectedChunkIds.push(...skillFacetResult.chunkIds);
```
Destructures `.ctx` and `.chunkIds` — correct.

### Call site 5 — loadPracticeMaterialCtx (study.js:2108)
```js
var facetResult = await loadFacetBasedContent(pracFacetIds, { mode: 'standard', charLimit: 12000, includeCrossDomain: false });
if (facetResult.ctx) return facetResult.ctx;
```
Destructures `.ctx` — correct. (Does not use `.chunkIds` — this is the practice material loader which returns a string to the caller, not the context builder.)

### Consumer layer — StudyContext.jsx (3 call sites of buildContext/buildFocusedContext)
All properly destructure the intermediate `{ ctx, chunkIds }`:
- Line 1161: `const ctxResult = await buildFocusedContext(...)` → `const ctx = ctxResult.ctx` + `chunkIds: ctxResult.chunkIds`
- Line 1265: `var focusResult = await buildFocusedContext(...)` → `ctx = focusResult.ctx` + `contextChunkIds = focusResult.chunkIds`
- Line 1270: `var generalResult = await buildContext(...)` → `ctx = generalResult.ctx` + `contextChunkIds = generalResult.chunkIds`
- Line 1349: `var updatedCtxResult = await buildFocusedContext(...)` → `var updatedCtx = updatedCtxResult.ctx`

**No call site assigns the return value directly to a string variable. All are safe.**

---

## (3) chunker.js and extraction.js — Modification History

### chunker.js
```
743d60f feat: chunk metadata enrichment — blockquote, subsection, list count, split fix
```
**Single commit ever. Not modified in the last 2 days.**

### extraction.js
```
86ee3ca feat: hook skill unification into extraction pipeline
743d60f feat: chunk metadata enrichment — blockquote, subsection, list count, split fix
ba4b5f2 fix: MaterialsScreen black screen, phantom slide guardrails, proactive assignment decomposition
```
**3 commits total. None from the last 2 days.**

---

## (4) ChunkFacetBindings Write Path

### updateEffectiveness() — Phase 3 addition (db.js:2636-2646)
```js
async updateEffectiveness(chunkId, facetId, delta) {
  const db = await getDb();
  await db.execute(
    `UPDATE chunk_facet_bindings SET teaching_effectiveness = COALESCE(teaching_effectiveness, 0) + ?, updated_at = ? WHERE chunk_id = ? AND facet_id = ?`,
    [delta, now(), chunkId, facetId]
  );
  await db.execute(
    `UPDATE chunk_facet_bindings SET teaching_effectiveness = MAX(-1.0, MIN(1.0, teaching_effectiveness)) WHERE chunk_id = ? AND facet_id = ?`,
    [chunkId, facetId]
  );
},
```

**Analysis:**
- Uses `COALESCE(teaching_effectiveness, 0) + ?` — safe for NULL values (treats NULL as 0 before adding delta)
- Clamps to [-1.0, 1.0] range in a second statement
- **UPDATE only** — does not INSERT, does not DELETE
- **Does NOT interfere with `create()` or `createBatch()`** — those INSERT with no `teaching_effectiveness` column (defaults to NULL), while `updateEffectiveness` only UPDATEs existing rows
- Separate `getEffectivenessByFacet()` method (db.js:2648-2654) for read access

### create() (db.js:2595-2606) — Confirmed unchanged
```sql
INSERT INTO chunk_facet_bindings (chunk_id, facet_id, extraction_context, confidence,
   binding_type, quality_rank, content_range, extracted_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```
Does NOT include `teaching_effectiveness` — column defaults to NULL. No conflict.

### createBatch() (db.js:2608-2623) — Confirmed unchanged
Same INSERT statement as `create()`. No `teaching_effectiveness` column. No conflict.

### getByFacetRanked() ORDER BY (db.js:2565-2581)
```sql
SELECT cfb.*, c.label AS chunk_label, c.char_count,
       m.classification AS material_classification
FROM chunk_facet_bindings cfb
JOIN chunks c ON cfb.chunk_id = c.id
JOIN materials m ON c.material_id = m.id
WHERE cfb.facet_id = ?
ORDER BY
  CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
  cfb.quality_rank,
  CASE WHEN cfb.teaching_effectiveness IS NULL THEN 1 ELSE 0 END,
  cfb.teaching_effectiveness DESC,
  cfb.confidence DESC
```

**ORDER BY confirmed:**
1. `binding_type` priority (teaches=0, prerequisite_for=1, else=2) — correct
2. `quality_rank` ASC — correct
3. `CASE WHEN teaching_effectiveness IS NULL THEN 1 ELSE 0 END` — SQLite NULLS LAST idiom — correct
4. `teaching_effectiveness DESC` — higher effectiveness first — correct
5. `confidence DESC` — tiebreaker — correct

---

## Verdict

**All four areas PASS. No degradation detected.**

| Area | Status | Notes |
|------|--------|-------|
| extraction.js integrity | INTACT | Not modified in last 2 days, no study.js coupling |
| loadFacetBasedContent API | SAFE | All 5 call sites + 4 consumer sites properly destructure `{ ctx, chunkIds }` |
| chunker.js / extraction.js history | UNCHANGED | No commits in the 2-day window |
| ChunkFacetBindings write path | SAFE | updateEffectiveness uses COALESCE + UPDATE only, does not interfere with create/createBatch. getByFacetRanked ORDER BY correct with NULLS LAST idiom |
