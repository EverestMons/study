# study — Tutor Phase 3 Diagnostic: Prerequisite Audit
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Finding 1: `chunk_facet_bindings` Table Definition

**Source:** `src-tauri/migrations/005_facets.sql` (lines 61-75)

```sql
CREATE TABLE IF NOT EXISTS chunk_facet_bindings (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id               TEXT NOT NULL,
    facet_id               INTEGER NOT NULL,
    extraction_context     TEXT,
    confidence             REAL,
    binding_type           TEXT DEFAULT 'teaches',
    quality_rank           INTEGER DEFAULT 0,
    content_range          TEXT,
    teaching_effectiveness REAL,
    extracted_at           INTEGER NOT NULL,
    updated_at             INTEGER,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);
```

**`teaching_effectiveness` column:**
- Type: `REAL`
- Default: `NULL` (no DEFAULT clause specified)
- No constraints beyond the implicit nullable REAL
- No index on this column
- Composite index exists: `idx_cfb_quality ON chunk_facet_bindings(facet_id, quality_rank)` — does NOT include `teaching_effectiveness`

**Key observation:** `teaching_effectiveness` is defined in the schema but never written to by any db.js method. Both `create()` and `createBatch()` omit it from their INSERT statements — it will always be NULL for all existing rows.

---

## Finding 2: `ChunkFacetBindings` Module — Full Methods

**Source:** `src/lib/db.js` (lines 2554-2643)

### Methods:

1. **`getByFacet(facetId, { type, minConfidence })`** (line 2555)
   - `SELECT * FROM chunk_facet_bindings WHERE facet_id = ?`
   - Optional type + minConfidence filters
   - `ORDER BY quality_rank`
   - Returns all columns via `SELECT *`

2. **`getByFacetRanked(facetId)`** (line 2565)
   - JOIN query: `chunk_facet_bindings cfb JOIN chunks c JOIN materials m`
   - Selects: `cfb.*, c.label AS chunk_label, c.char_count, m.classification AS material_classification`
   - **Ordering:**
     ```sql
     ORDER BY
       CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
       cfb.quality_rank,
       cfb.confidence DESC
     ```
   - `teaching_effectiveness` is NOT used in ordering — it's available via `cfb.*` but never participates in sort logic

3. **`getByChunk(chunkId)`** (line 2582)
   - Returns bindings for a chunk with facet name/key/skill_id joined

4. **`create({ chunkId, facetId, extractionContext, confidence, bindingType, qualityRank, contentRange })`** (line 2593)
   - INSERT — does NOT include `teaching_effectiveness` in column list
   - Column will always be NULL

5. **`createBatch(bindings, { externalTransaction })`** (line 2606)
   - Batch INSERT — same column list as `create()`, no `teaching_effectiveness`

6. **`deleteByFacetIds(facetIds, { externalTransaction })`** (line 2623)
   - Bulk delete by facet IDs

7. **`updateQualityRanks(facetId, rankings)`** (line 2634)
   - Updates `quality_rank` for specific bindings
   - Does NOT update `teaching_effectiveness`

**No method writes `teaching_effectiveness`.** The column exists in schema only. Zero population path.

---

## Finding 3: `collectFacetBindings()` and `loadFacetBasedContent()` — Post-Phase 2

**Source:** `src/lib/study.js`

### `collectFacetBindings(facetIds, { mode })` (line 900-925)

- Calls `ChunkFacetBindings.getByFacetRanked(fid)` per facet
- **Ordering is inherited from `getByFacetRanked()`**: binding_type priority → quality_rank → confidence DESC
- **No re-sorting** happens in `collectFacetBindings` — bindings are appended in db query order per facet
- **Type filtering**:
  - `teaches` — always included
  - `prerequisite_for` — included only when facet retrievability < 0.5
  - `references` — included only in exam mode
- `teaching_effectiveness` is NOT used anywhere in the filtering or ordering logic

### `loadFacetBasedContent(facetIds, { mode, charLimit, includeCrossDomain })` (line 1063-1127)

**(a) Return statement** (line 1126):
```javascript
return { ctx, chunkIds: allChunkIds };
```
Confirmed: returns `{ ctx, chunkIds }` as modified in Phase 2.

Three early returns (lines 1064, 1067, 1070):
```javascript
return { ctx: '', chunkIds: [] };
```

**(b) Sort/order logic:**
- Ordering is entirely determined by `getByFacetRanked()` SQL query — binding_type priority → `quality_rank` → `confidence DESC`
- `teaching_effectiveness` is not used in any ordering, filtering, or ranking decision
- `quality_rank` is the primary sort key (after binding_type); `teaching_effectiveness` is a dead column

**(c) Call sites** — all 4 destructure `{ ctx, chunkIds }` correctly:

| Call Site | Location | Destructuring |
|---|---|---|
| `buildContext()` | line 1302 | `facetResult.ctx` + `facetResult.chunkIds` pushed to `collectedChunkIds` |
| `buildFocusedContext()` assignment branch | line 1529 | `asgnFacetResult.ctx` + `asgnFacetResult.chunkIds` pushed to `collectedChunkIds` |
| `buildFocusedContext()` skill branch | line 1588 | `skillFacetResult.ctx` + `skillFacetResult.chunkIds` pushed to `collectedChunkIds` |
| `loadPracticeMaterialCtx()` | line 2108 | `facetResult.ctx` only (chunkIds not needed for practice context) |

No call sites use the return value as a raw string. All are destructured.

---

## Finding 4: `SessionExchanges` Module — `getBySession()` Detail

**Source:** `src/lib/db.js` (lines 2135-2156)

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

**`getBySession()` returns `SELECT *`**, which maps to the migration 010 schema columns:
- `id` (TEXT PK)
- `session_id` (TEXT NOT NULL)
- `facet_id` (INTEGER NOT NULL)
- `practice_tier` (INTEGER, nullable)
- `chunk_ids_used` (TEXT, nullable — JSON array string)
- `mastery_before` (REAL)
- `mastery_after` (REAL)
- `rating` (TEXT NOT NULL)
- `exchange_timestamp` (INTEGER NOT NULL)

**Confirmed:** All requested columns present — session_id, facet_id, chunk_ids_used, mastery_before, mastery_after, rating.

---

## Summary of Key Findings

| Item | Status | Notes |
|---|---|---|
| `teaching_effectiveness` column | Schema-only, never populated | REAL, nullable, no default. Zero write paths in db.js. Never used in ordering or filtering. |
| `quality_rank` ordering | Active, primary sort key | Used in `getByFacetRanked()` and `getByFacet()` ORDER BY clauses |
| `loadFacetBasedContent()` return type | `{ ctx, chunkIds }` confirmed | Phase 2 change verified at all 4 call sites |
| `SessionExchanges.getBySession()` | Returns all columns via SELECT * | Matches migration 010 schema: session_id, facet_id, chunk_ids_used, mastery_before, mastery_after, rating |
| `collectFacetBindings()` sort logic | Inherited from SQL query | No JS-level re-sorting. Order = binding_type priority → quality_rank → confidence DESC |
