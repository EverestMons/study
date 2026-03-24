# Cross-Course Skill Unification — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Migration Impact:** New migration 008 (additive). Adds `skill_courses` junction table and `unified_into` column to `sub_skills` via ALTER TABLE ADD COLUMN. No existing tables modified destructively. Old DB rows work fine — `unified_into` defaults to NULL (meaning "not absorbed").

**Roadmap reference:** `knowledge/decisions/roadmap-cross-course-unification-2026-03-22.md`

---

## Updated Schema

### Migration 008: `src-tauri/migrations/008_skill_courses.sql`

```sql
-- Migration 008: Cross-Course Skill Unification
-- Adds skill_courses junction table for many-to-many skill↔course mapping
-- and unified_into column on sub_skills for merge tracking.

-- 1. Junction table: skills ↔ courses (many-to-many)
CREATE TABLE IF NOT EXISTS skill_courses (
    skill_id  INTEGER NOT NULL REFERENCES sub_skills(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(skill_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_courses_skill ON skill_courses(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_courses_course ON skill_courses(course_id);

-- 2. Soft-delete tracking for absorbed skills
-- When a skill is absorbed into another via unification, this points to the survivor.
-- NULL means the skill is independent (not absorbed).
ALTER TABLE sub_skills ADD COLUMN unified_into INTEGER REFERENCES sub_skills(id);
```

**Column notes:**
- `unified_into` is nullable, no default (SQLite default is NULL for ALTER TABLE ADD COLUMN)
- The FK reference is self-referential (`sub_skills.id`). SQLite enforces this when `PRAGMA foreign_keys = ON`.
- No ON DELETE clause — if the survivor skill is deleted, the FK violation will block it (desired: survivors should never be deleted while absorbed skills reference them)

---

## DB Module Additions (`db.js`)

### `SkillCourses` module

```js
export const SkillCourses = {
  async add(skillId, courseId) {
    const db = await getDb();
    await db.execute(
      'INSERT OR IGNORE INTO skill_courses (skill_id, course_id) VALUES (?, ?)',
      [skillId, courseId]
    );
  },

  async getBySkill(skillId) {
    const db = await getDb();
    return db.select(
      `SELECT sc.*, c.name AS course_name, c.course_number
       FROM skill_courses sc
       JOIN courses c ON sc.course_id = c.id
       WHERE sc.skill_id = ?`,
      [skillId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select('SELECT * FROM skill_courses WHERE course_id = ?', [courseId]);
  },

  async remove(skillId, courseId) {
    const db = await getDb();
    await db.execute(
      'DELETE FROM skill_courses WHERE skill_id = ? AND course_id = ?',
      [skillId, courseId]
    );
  },
};
```

### Backfill function

```js
export async function backfillSkillCourses() {
  const db = await getDb();
  const flag = await db.select(
    "SELECT value FROM settings WHERE key = 'skill_courses_backfilled'"
  );
  if (flag.length > 0 && flag[0].value === '1') return;

  const skills = await db.select(
    'SELECT id, source_course_id FROM sub_skills WHERE source_course_id IS NOT NULL'
  );
  for (const s of skills) {
    await db.execute(
      'INSERT OR IGNORE INTO skill_courses (skill_id, course_id) VALUES (?, ?)',
      [s.id, s.source_course_id]
    );
  }
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('skill_courses_backfilled', '1')"
  );
}
```

**Wiring:** Call `backfillSkillCourses()` from `initApp()` in `StudyContext.jsx` after migrations run and before CIP seed. It's idempotent via the settings flag.

---

## Merge Engine — `src/lib/unification.js`

### Architecture constraints

The codebase uses `withTransaction` as a **serialization queue** (not SQL BEGIN/COMMIT — tauri-plugin-sql's connection pool breaks manual transactions). Each SQL statement auto-commits. The merge engine must:
1. Use `withTransaction` to prevent concurrent writes
2. Design operations to be **idempotent** — if interrupted, re-running produces the correct result
3. Set `unified_into` last as a "done" marker — if the process fails before this, `detectAndUnify` will re-detect and re-process the pair

### Function 1: `unifySkills(survivorId, absorbedId)`

**Signature:** `async function unifySkills(survivorId, absorbedId) → { merged: boolean, facetsMerged: number, facetsTransferred: number, bindingsRepointed: number }`

**Steps (all within `withTransaction`):**

#### Step 1: Validate
```js
const survivor = await db.select('SELECT * FROM sub_skills WHERE id = ?', [survivorId]);
const absorbed = await db.select('SELECT * FROM sub_skills WHERE id = ?', [absorbedId]);
if (!survivor[0] || !absorbed[0]) return { merged: false, ... };
if (absorbed[0].unified_into != null) return { merged: false, ... }; // already absorbed
if (survivor[0].unified_into != null) return { merged: false, ... }; // survivor was itself absorbed
```

#### Step 2: Re-point `chunk_skill_bindings`
```sql
-- Move bindings from absorbed to survivor (skip duplicates)
UPDATE OR IGNORE chunk_skill_bindings
SET sub_skill_id = ?, updated_at = ?
WHERE sub_skill_id = ?;

-- Delete any remaining (were duplicates that couldn't be updated)
DELETE FROM chunk_skill_bindings WHERE sub_skill_id = ?;
```
Parameters: `[survivorId, now, absorbedId]`, then `[absorbedId]`

#### Step 3: Merge facets
Load facets for both skills:
```sql
SELECT * FROM facets WHERE skill_id = ? AND is_archived = 0
```

**Matching strategy:** Match by `concept_key` (both non-null and equal). If concept_key is null or no match found, the facet is "unique" and transferred.

**For matched facets** (same `concept_key`):

a. **Optimistic FSRS merge** on `facet_mastery`:
```js
// Load both mastery records
const sMastery = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [survivorFacetId]);
const aMastery = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [absorbedFacetId]);
```

If both have mastery records, merge into survivor's facet mastery:
```js
const merged = {
  stability:          Math.max(s.stability, a.stability),
  difficulty:         Math.min(s.difficulty, a.difficulty),
  retrievability:     Math.max(s.retrievability, a.retrievability),
  reps:               Math.max(s.reps, a.reps),
  lapses:             Math.min(s.lapses, a.lapses),
  lastReviewAt:       Math.max(s.last_review_at || 0, a.last_review_at || 0) || null,
  nextReviewAt:       Math.max(s.next_review_at || 0, a.next_review_at || 0) || null,
  totalMasteryPoints: Math.max(s.total_mastery_points, a.total_mastery_points),
  lastRating:         (s.last_review_at || 0) >= (a.last_review_at || 0) ? s.last_rating : a.last_rating,
};
```
If only absorbed has mastery, copy it to survivor's facet (via `FacetMastery.upsert`).
If only survivor has mastery, no change needed.

b. **Re-point `chunk_facet_bindings`** from absorbed facet to survivor facet:
```sql
UPDATE OR IGNORE chunk_facet_bindings SET facet_id = ? WHERE facet_id = ?;
DELETE FROM chunk_facet_bindings WHERE facet_id = ?;  -- remaining duplicates
```

c. **Re-point `assignment_question_facets`:**
```sql
UPDATE OR IGNORE assignment_question_facets SET facet_id = ? WHERE facet_id = ?;
DELETE FROM assignment_question_facets WHERE facet_id = ?;
```

d. **Re-point `facet_concept_links`** from absorbed facet to survivor facet:
For each link involving the absorbed facet:
- If other end is the survivor facet → DELETE (self-referential after merge)
- Otherwise, compute new (a, b) pair maintaining `CHECK (facet_a_id < facet_b_id)`:
```sql
-- Delete self-referential links
DELETE FROM facet_concept_links
WHERE (facet_a_id = ? AND facet_b_id = ?) OR (facet_a_id = ? AND facet_b_id = ?);
```
Then for remaining links:
```js
// Get all links involving absorbed facet
const links = await db.select(
  'SELECT * FROM facet_concept_links WHERE facet_a_id = ? OR facet_b_id = ?',
  [absorbedFacetId, absorbedFacetId]
);
for (const link of links) {
  const otherId = link.facet_a_id === absorbedFacetId ? link.facet_b_id : link.facet_a_id;
  const [newA, newB] = survivorFacetId < otherId
    ? [survivorFacetId, otherId] : [otherId, survivorFacetId];
  await db.execute(
    `INSERT OR IGNORE INTO facet_concept_links
       (facet_a_id, facet_b_id, similarity_score, link_type, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newA, newB, link.similarity_score, link.link_type, link.reason, link.created_at]
  );
}
// Delete all old links for absorbed facet
await db.execute(
  'DELETE FROM facet_concept_links WHERE facet_a_id = ? OR facet_b_id = ?',
  [absorbedFacetId, absorbedFacetId]
);
```

e. **Delete absorbed facet's mastery** and **archive the facet:**
```sql
DELETE FROM facet_mastery WHERE facet_id = ?;  -- absorbedFacetId
UPDATE facets SET is_archived = 1, updated_at = ? WHERE id = ?;  -- absorbedFacetId
```

**For unique facets** (no concept_key match):
Transfer to survivor skill:
```sql
UPDATE facets SET skill_id = ?, updated_at = ? WHERE id = ?;
```
All bindings, mastery, and concept links follow automatically (FKs are on facet_id, not skill_id).

#### Step 4: Re-point `assignment_question_skills`
```sql
UPDATE OR IGNORE assignment_question_skills SET sub_skill_id = ? WHERE sub_skill_id = ?;
DELETE FROM assignment_question_skills WHERE sub_skill_id = ?;
```

#### Step 5: Inherit concept links
Same pattern as facet_concept_links but for skill-level `concept_links`:

a. Delete the same_concept link between survivor and absorbed:
```sql
DELETE FROM concept_links
WHERE (sub_skill_a_id = ? AND sub_skill_b_id = ?) OR (sub_skill_a_id = ? AND sub_skill_b_id = ?);
```
(Using both orderings to be safe, though CHECK constraint means only one ordering exists.)

b. Transfer remaining absorbed links to survivor:
```js
const links = await db.select(
  'SELECT * FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?',
  [absorbedId, absorbedId]
);
for (const link of links) {
  const otherId = link.sub_skill_a_id === absorbedId ? link.sub_skill_b_id : link.sub_skill_a_id;
  if (otherId === survivorId) continue; // already deleted above
  const [newA, newB] = survivorId < otherId ? [survivorId, otherId] : [otherId, survivorId];
  await db.execute(
    `INSERT OR IGNORE INTO concept_links
       (sub_skill_a_id, sub_skill_b_id, similarity_score, link_type, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [newA, newB, link.similarity_score, link.link_type, link.created_at]
  );
}
await db.execute(
  'DELETE FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?',
  [absorbedId, absorbedId]
);
```

#### Step 6: Create `skill_courses` entries
```sql
-- Ensure survivor has entries for both courses
INSERT OR IGNORE INTO skill_courses (skill_id, course_id)
SELECT ?, source_course_id FROM sub_skills WHERE id = ? AND source_course_id IS NOT NULL;
INSERT OR IGNORE INTO skill_courses (skill_id, course_id)
SELECT ?, source_course_id FROM sub_skills WHERE id = ? AND source_course_id IS NOT NULL;
```
Parameters: `[survivorId, survivorId]`, then `[survivorId, absorbedId]`

#### Step 7: Set `unified_into` (done marker)
```sql
UPDATE sub_skills SET unified_into = ?, updated_at = ? WHERE id = ?;
```
Parameters: `[survivorId, now, absorbedId]`

---

### Function 2: `detectAndUnify()`

**Signature:** `async function detectAndUnify() → { pairsDetected: number, pairsUnified: number, errors: Array }`

**Logic:**

```sql
-- Find same_concept pairs across different courses where neither skill is absorbed
SELECT cl.*, sa.source_course_id AS course_a, sb.source_course_id AS course_b
FROM concept_links cl
JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
WHERE cl.link_type = 'same_concept'
  AND cl.similarity_score >= 0.9
  AND sa.source_course_id IS NOT NULL
  AND sb.source_course_id IS NOT NULL
  AND sa.source_course_id != sb.source_course_id
  AND sa.unified_into IS NULL
  AND sb.unified_into IS NULL
  AND sa.is_archived = 0
  AND sb.is_archived = 0
```

**Survivor determination:** The skill with more FSRS reviews (measured by facet_mastery record count) wins. If tied, lower ID wins (stable, deterministic).

```sql
-- For each skill, count facet mastery records with reps > 0
SELECT COUNT(*) as review_count
FROM facets f
JOIN facet_mastery fm ON f.id = fm.facet_id
WHERE f.skill_id = ? AND f.is_archived = 0 AND fm.reps > 0
```

The skill with the higher `review_count` becomes the survivor.

**For each pair:**
```js
try {
  const result = await unifySkills(survivorId, absorbedId);
  if (result.merged) stats.pairsUnified++;
} catch (e) {
  stats.errors.push({ survivorId, absorbedId, error: e.message });
}
```

---

## Optimistic FSRS Merge Formula

When two facets with the same `concept_key` are merged:

| Field | Formula | Rationale |
|-------|---------|-----------|
| `stability` | `MAX(s1, s2)` | Higher stability = longer retention. Student proved they can remember. |
| `difficulty` | `MIN(d1, d2)` | Lower difficulty = student found it easier in at least one context. Optimistic. |
| `retrievability` | `MAX(r1, r2)` | Better current recall wins. |
| `reps` | `MAX(r1, r2)` | More practice experience. |
| `lapses` | `MIN(l1, l2)` | Optimistic — fewer forgetting events. |
| `last_review_at` | `MAX(t1, t2)` | Most recent review. |
| `next_review_at` | `MAX(t1, t2)` | Later next review (reflects higher stability). |
| `total_mastery_points` | `MAX(p1, p2)` | Optimistic mastery level. |
| `last_rating` | From the one with later `last_review_at` | Most recent quality signal. |

If only one facet has a mastery record, that record is used in full (no merge needed — just upsert onto the survivor's facet).

---

## Concept Link Dedup Logic

When inheriting links from absorbed to survivor:

1. **Delete self-referential links:** Any link between survivor and absorbed becomes meaningless after merge. Delete it.
2. **Transfer with dedup:** For each remaining absorbed link to skill X:
   - Compute new pair `(MIN(survivorId, X), MAX(survivorId, X))` to satisfy the `CHECK (a < b)` constraint
   - `INSERT OR IGNORE` — if survivor already has a link to X of the same type, the existing link is kept (UNIQUE index prevents duplicates)
3. **Clean up:** Delete all remaining links referencing absorbed skill/facet.

This is O(n) where n = number of links on the absorbed skill. The `INSERT OR IGNORE` + `DELETE` pattern is idempotent.

---

## `unified_into` Usage in Queries

All queries that list sub_skills for display or computation must add a filter:

```sql
-- Existing pattern:
WHERE is_archived = 0

-- New pattern (Step 5 will add this):
WHERE is_archived = 0 AND unified_into IS NULL
```

**Affected locations in `db.js`:**
- `SubSkills.getByParent()` — line 1474
- `SubSkills.getAllActive()` — line 1481
- `SubSkills.getByCourse()` — line 1487
- `SubSkills.findByConceptKey()` — line 1574
- `SubSkills.getAllConceptKeys()` — line 1582
- `FacetMastery.getAll(courseId)` — line 2352 (joins sub_skills)
- `FacetMastery.getDueForReview()` — line 2373 (joins sub_skills)
- `Facets.getByCourse()` — line 2240 (joins sub_skills)

**NOT modified** (intentional):
- `SubSkills.getById()` — should still return absorbed skills (needed for debugging, merge verification)
- Direct facet queries (`Facets.getBySkill`, `Facets.getById`) — facets on absorbed skills are archived or transferred, not the skill-level filter's job

---

## Extraction.js Consumer Changes

None needed in this step. The extraction pipeline creates new skills from scratch (it doesn't query existing unified skills). The `detectAndUnify` hook added in Step 4 runs after extraction completes.

---

## How to Verify (Acceptance Criteria)

### AC-1: Migration 008 applies
- [ ] `PRAGMA table_info(skill_courses)` shows 2 columns: `skill_id` (INTEGER), `course_id` (TEXT)
- [ ] `PRAGMA table_info(sub_skills)` includes `unified_into` column (INTEGER, nullable)

### AC-2: Backfill populates junction table
- [ ] After `backfillSkillCourses()`, `SELECT COUNT(*) FROM skill_courses` equals `SELECT COUNT(*) FROM sub_skills WHERE source_course_id IS NOT NULL`
- [ ] Running backfill twice doesn't create duplicates (idempotent via settings flag)

### AC-3: `unifySkills` re-points bindings
- [ ] Given skills A and B with chunk_skill_bindings, after `unifySkills(A, B)`:
  - All bindings that referenced B now reference A
  - No bindings reference B
  - No duplicate bindings on A (UPDATE OR IGNORE + DELETE handles this)

### AC-4: `unifySkills` merges matched facets
- [ ] Given survivor facet F1 (concept_key="chain_rule") and absorbed facet F2 (concept_key="chain_rule"):
  - F1's mastery has `stability = MAX(F1.stability, F2.stability)` and `difficulty = MIN(F1.difficulty, F2.difficulty)`
  - F2's chunk_facet_bindings re-pointed to F1
  - F2 is archived (`is_archived = 1`)
  - F2's mastery is deleted

### AC-5: `unifySkills` transfers unique facets
- [ ] Absorbed facets without a concept_key match on the survivor are transferred: `skill_id` updated to survivor's ID
- [ ] Their mastery, bindings, and concept links remain intact (FKs on facet_id, not skill_id)

### AC-6: `unifySkills` inherits concept links
- [ ] The same_concept link between survivor and absorbed is deleted
- [ ] Absorbed's links to other skills are transferred to survivor (with CHECK constraint maintained)
- [ ] No duplicate links on survivor (INSERT OR IGNORE handles this)

### AC-7: `unifySkills` creates skill_courses entries
- [ ] After merge, `skill_courses` has entries for survivor + both courses

### AC-8: `unifySkills` sets unified_into
- [ ] `absorbed.unified_into = survivorId` after merge
- [ ] Re-running `unifySkills` on the same pair is a no-op (absorbed already has unified_into set)

### AC-9: `detectAndUnify` finds cross-course pairs
- [ ] Finds same_concept links where source_course_id differs and neither skill has unified_into
- [ ] Correctly determines survivor (more facet_mastery reviews)
- [ ] Runs without errors on DB with 0 cross-course same_concept links (returns `pairsDetected: 0`)

### AC-10: Build
- [ ] `npx vite build --mode development` passes

### AC-11: Idempotency
- [ ] Running `detectAndUnify()` twice on the same data produces the same result
- [ ] The second run detects 0 pairs (all absorbed skills have unified_into set)

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Produced a comprehensive blueprint for cross-course skill unification: migration 008 schema, SkillCourses DB module, backfill function, merge engine design (unifySkills + detectAndUnify), optimistic FSRS merge formula, concept link dedup logic, unified_into filter locations, and 11 acceptance criteria.

### Files Deposited
- `study/knowledge/architecture/cross-course-unification-blueprint-2026-03-22.md` — this blueprint

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Survivor determined by facet_mastery review count (more FSRS reviews = better calibrated). Ties broken by lower skill ID.
- FSRS merge is optimistic: MAX stability, MIN difficulty, MAX retrievability, MAX reps, MIN lapses.
- Concept link transfer uses INSERT OR IGNORE + DELETE pattern (idempotent, handles CHECK constraint).
- `withTransaction` serialization queue used instead of SQL BEGIN/COMMIT (per existing codebase pattern — tauri-plugin-sql connection pool prevents manual transactions).
- `unified_into` set last as "done" marker for crash safety — incomplete merges are re-detected.
- `SubSkills.getById()` intentionally NOT filtered by `unified_into IS NULL` — absorbed skills should remain accessible for debugging.

### Flags for CEO
- None

### Flags for Next Step
- DEV creates 3 new files: `src-tauri/migrations/008_skill_courses.sql`, `src/lib/unification.js`. Modifies 1 existing file: `src/lib/db.js` (adds SkillCourses module + backfillSkillCourses function + wiring into app init). Does NOT add `unified_into IS NULL` filters yet — that's Step 5. Does NOT modify parser files, extraction.js, or FSRS.
- The `withTransaction` pattern means all merge operations auto-commit per statement. The idempotent design + `unified_into` done-marker ensures crash safety without true SQL transactions.
