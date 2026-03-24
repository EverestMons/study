# study — Tutor Phase 2 Diagnostic: Session Exchange Logging Schema Audit
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Finding 1: All Migration Files

| # | File | Purpose |
|---|------|---------|
| 001 | `001_v2_schema.sql` | Full v2 schema: settings, parent_skills, aliases, courses, schedule, assessments, materials, chunks, chunk_media, chunk_fingerprints, sub_skills, chunk_skill_bindings, sub_skill_mastery, concept_links, **sessions**, session_skills, session_events, messages, journal_entries, practice_sets |
| 002 | `002_skill_extraction_v2.sql` | sub_skills: concept_key, category, blooms_level, mastery_criteria, evidence, fitness, extraction_model, schema_version, merged_from, is_archived, uuid. courses: is_archived. chunk_skill_bindings: recreated with nullable extraction_context. skill_prerequisites table. sub_skill_mastery: recreated with RESTRICT FK |
| 003 | `003_assignments.sql` | assignments, assignment_questions, assignment_question_skills tables |
| 004 | `004_last_rating.sql` | `ALTER TABLE sub_skill_mastery ADD COLUMN last_rating TEXT` |
| 005 | `005_facets.sql` | facets, facet_mastery, chunk_facet_bindings (with `teaching_effectiveness` column), facet_concept_links, assignment_question_facets |
| 006 | `006_assignment_activation.sql` | `ALTER TABLE assignments ADD COLUMN study_active INTEGER` |
| 007 | `007_material_images.sql` | material_images table |
| 008 | `008_skill_courses.sql` | skill_courses junction table + `ALTER TABLE sub_skills ADD COLUMN unified_into` |
| 009 | `009_chunk_relationships.sql` | chunk_similarities table + chunk_prerequisites table |

**Next available migration number: 010**

---

## Finding 2: SessionExchanges Module

**Does not exist.** Searched `db.js` for "SessionExchanges" — no matches. This module needs to be created for Phase 2.

---

## Finding 3: FacetMastery Module Pattern (db.js:2429-2510)

### `FacetMastery.get(facetId)` — single row lookup
```javascript
async get(facetId) {
  const db = await getDb();
  const rows = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [facetId]);
  return rows[0] || null;
}
```

### `FacetMastery.getByFacets(facetIds)` — batch lookup with IN clause
```javascript
async getByFacets(facetIds) {
  if (facetIds.length === 0) return [];
  const db = await getDb();
  const ph = facetIds.map(() => '?').join(',');
  return db.select(`SELECT * FROM facet_mastery WHERE facet_id IN (${ph})`, facetIds);
}
```

### `FacetMastery.upsert(facetId, {...})` — INSERT ON CONFLICT DO UPDATE
```javascript
async upsert(facetId, { difficulty, stability, retrievability, reps, lapses,
                        lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating = null }) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO facet_mastery (facet_id, difficulty, stability, retrievability, reps, lapses,
       last_review_at, next_review_at, last_rating, total_mastery_points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(facet_id) DO UPDATE SET
       difficulty = excluded.difficulty,
       stability = excluded.stability,
       ...
       updated_at = excluded.updated_at`,
    [facetId, difficulty, stability, retrievability, reps, lapses,
     lastReviewAt, nextReviewAt, lastRating, totalMasteryPoints, now()]
  );
}
```

### Pattern summary for new modules:
- All modules are plain objects with async methods
- Use `await getDb()` at the start of every method
- `db.select()` for reads, `db.execute()` for writes
- Batch lookups use dynamic placeholder strings: `facetIds.map(() => '?').join(',')`
- Upserts use `INSERT ... ON CONFLICT DO UPDATE SET`
- `now()` helper for timestamps (returns Unix epoch seconds)
- `uuid()` helper for ID generation

---

## Finding 4: Sessions Table Schema (from 001_v2_schema.sql:283-297)

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,        -- UUID
    course_id  TEXT NOT NULL,
    intent     TEXT NOT NULL,           -- study mode intent
    scope      TEXT,                    -- JSON scope data
    status     TEXT NOT NULL DEFAULT 'active',  -- active | completed
    started_at INTEGER NOT NULL,        -- Unix epoch
    ended_at   INTEGER,                -- Unix epoch, NULL while active
    summary    TEXT,                    -- session summary text
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
```

**Indexes:** course_id, status, intent

**Related tables:**
- `session_skills` — skill set per session (sub_skill_id, is_target, pre_mastery, post_mastery)
- `session_events` — mastery events (sub_skill_id, event_type, score, intent_weight, context)
- `messages` — chat messages (role, content, input_mode, metadata)

### Sessions module in db.js (line 2066):
- `getByCourse(courseId)` — all sessions for a course
- `countByCourse(courseId)` — count for student profile context
- `getById(id)` — single session
- `getActive(courseId)` — most recent active session
- `create({ courseId, intent, scope })` — creates with UUID + `now()` timestamp
- `end(id, { status, summary })` — sets ended_at + status + summary

---

## Finding 5: Chunk ID Tracking During Context Building

### In `study.js` — internal to context builders, not returned

`loadFacetBasedContent()` (line 1045) tracks chunk IDs internally:
- Line 1096: `var loadedChunkIds = new Set(primary.map(c => c.chunkId))` — used only to deduplicate cross-domain chunks
- **Not returned** to the caller. The function returns a string (`ctx`), not chunk metadata.

`loadChunksForBindings()` (line 820) produces chunk results with `chunkId` field (line 857), but these are consumed by `loadFacetBasedContent()` and discarded after formatting into the context string.

### In `StudyContext.jsx` — `discussedChunks` ref

- Line 155: `const discussedChunks = useRef(new Set())`
- Passed to `buildContext()` as `excludeChunkIds` parameter (line 1263)
- Used in `buildContext()` at line 1316: `if (excludeChunkIds && excludeChunkIds.has(ch.id)) return false` — filters out already-discussed chunks from keyword-matched multi-chunk docs
- **Never populated.** No `.add()` calls found on `discussedChunks.current` anywhere in the codebase. The Set is always empty. This is dead infrastructure — likely planned for a "don't repeat chunks" feature that was never wired up.
- Cleared on session reset (lines 415, 913)

### In `buildFocusedContext()` — no chunk tracking at all

The focused context builders (assignment, skill, exam) load chunks via `loadFacetBasedContent()` or direct `getMatContent()` calls but do not track or return which chunk IDs were loaded.

### Gap: No mechanism currently tracks which chunk IDs are in context during a session exchange.

For Phase 2's `chunk_ids_used` column, the chunk IDs would need to be captured from:
1. `loadFacetBasedContent()` — would need to return chunk IDs alongside the context string
2. `loadChunksForBindings()` — already produces `chunkId` per result, but results are consumed internally
3. The keyword-matched chunks in `buildContext()` (lines 1308-1317) — tracked locally but not returned

**Recommendation:** Modify `loadFacetBasedContent()` to return `{ ctx, chunkIds }` instead of just `ctx`, or add a collector parameter. This is a prerequisite for Phase 2 that the roadmap didn't call out explicitly.

---

## Finding 6: Migration 009 Already Exists

`009_chunk_relationships.sql` creates:
1. `chunk_similarities` — MinHash similarity pairs (chunk_a_id, chunk_b_id, similarity)
2. `chunk_prerequisites` — chunk ordering (chunk_id, prerequisite_chunk_id, source)

**Phase 2's `session_exchanges` table will need migration 010.**

---

## Summary of Phase 2 Prerequisites

| Item | Status |
|------|--------|
| Migration number | 010 (009 is taken) |
| `SessionExchanges` module in db.js | Does not exist — needs creation |
| Sessions table for FK reference | Exists (001), has `id TEXT PRIMARY KEY` |
| Facets table for FK reference | Exists (005), has `id INTEGER PRIMARY KEY` |
| DB module pattern to follow | FacetMastery (upsert, get, getByFacets) |
| Chunk ID tracking in context | **Gap** — not currently returned from context builders. `loadFacetBasedContent()` returns string only. `discussedChunks` ref is dead (never populated). Phase 2 needs this wired up before `chunk_ids_used` can be populated. |
