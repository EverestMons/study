# Assignment Table Migration (003) — Architecture Blueprint
**Date:** 2026-03-08
**Author:** Study Systems Analyst
**Spec:** `docs/planning/assignment-scheduler-spec.md` — Phase 1
**Status:** Ready for development

---

## Overview

Migrate assignments from JSON blobs in the `settings` table (`v1_course_data:{courseId}:asgn`) to three relational tables: `assignments`, `assignment_questions`, `assignment_question_skills`. Add an `Assignments` DB module with full CRUD + schedule queries. Update 3 call sites across 2 files. Migrate existing blob data on boot.

**This is additive only.** No existing tables are modified. The `settings` table blobs are deleted after successful migration.

---

## 1. SQL Schema: `003_assignments.sql`

```sql
-- ============================================================
-- Migration 003: Assignment Tables
-- Depends on: 001_v2_schema.sql, 002_skill_extraction_v2.sql
-- Date: March 2026
-- Spec: docs/planning/assignment-scheduler-spec.md — Phase 1
-- ============================================================

-- ============================================================
-- Assignments — decomposed from uploaded assignment materials
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
    id          TEXT PRIMARY KEY,                -- UUID
    course_id   TEXT NOT NULL,
    material_id TEXT,                            -- links to uploaded assignment material (NULL for manual/syllabus placeholders)
    title       TEXT NOT NULL,
    title_normalized TEXT,                       -- lowercase, prefix-stripped, for placeholder matching
    due_date    INTEGER,                         -- Unix epoch seconds, NULL if unknown
    status      TEXT NOT NULL DEFAULT 'active',  -- active | submitted | graded
    source      TEXT NOT NULL DEFAULT 'decomposition', -- decomposition | syllabus | manual
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_material ON assignments(material_id);
CREATE INDEX IF NOT EXISTS idx_assignments_title_norm ON assignments(course_id, title_normalized);

-- ============================================================
-- Assignment Questions — individual items within an assignment
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id   TEXT NOT NULL,
    question_ref    TEXT NOT NULL,               -- "q1", "q2a" — matches LLM decomposition IDs
    description     TEXT,
    difficulty      TEXT,                        -- foundational | intermediate | advanced
    ordering        INTEGER,                    -- display order
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aq_assignment ON assignment_questions(assignment_id);

-- ============================================================
-- Assignment Question Skills — maps questions to required sub_skills
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_question_skills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id     INTEGER NOT NULL,
    sub_skill_id    INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aqs_question ON assignment_question_skills(question_id);
CREATE INDEX IF NOT EXISTS idx_aqs_skill ON assignment_question_skills(sub_skill_id);
```

### Schema notes

- **`title_normalized`** — pre-computed by `normalizeAssignmentTitle()` on insert/update. Enables fast placeholder matching without runtime normalization. Indexed as `(course_id, title_normalized)` for scoped lookups.
- **`sub_skill_id INTEGER`** — FK targets `sub_skills(id)` which is `INTEGER PRIMARY KEY AUTOINCREMENT` (confirmed in 001 schema, line 204). Type matches.
- **`material_id TEXT`** — FK targets `materials(id)` which is `TEXT PRIMARY KEY` (confirmed in 001 schema, line 108). `ON DELETE SET NULL` so deleting a material doesn't cascade-delete the assignment (preserves schedule data).
- **No `courses` table changes** — `courses.id` is `TEXT PRIMARY KEY` (001 schema, line 55). FK matches.
- **Status values** — `active` (default, in progress), `submitted` (student exported/submitted), `graded` (student marked as graded). Enforced in application layer, not SQL CHECK — keeps migration simple and allows future additions.

### Registration in `lib.rs`

```rust
Migration {
    version: 3,
    description: "assignment_tables",
    sql: include_str!("../migrations/003_assignments.sql"),
    kind: MigrationKind::Up,
},
```

Added to the `migrations` vec after the version 2 entry. `tauri_plugin_sql` handles idempotent application via its internal `_sqlx_migrations` table.

---

## 2. `normalizeAssignmentTitle()` Specification

Normalizes assignment titles for placeholder matching. Used when:
1. Creating assignments (stored in `title_normalized` column)
2. Matching uploaded assignments to syllabus placeholders

### Rules (applied in order)

```
Input: "Homework 4: Sorting Algorithms"

1. Lowercase
   → "homework 4: sorting algorithms"

2. Strip common prefixes (case-insensitive, greedy)
   Prefixes: "homework", "hw", "assignment", "asgn", "problem set", "pset", "lab", "project", "quiz", "exam"
   → "4: sorting algorithms"

3. Strip leading punctuation and whitespace
   → "4: sorting algorithms"

4. Strip trailing punctuation and whitespace
   → "4: sorting algorithms"  (no change here)

5. Collapse internal whitespace to single space
   → "4: sorting algorithms"

6. Remove all non-alphanumeric except spaces
   → "4 sorting algorithms"

7. Trim
   → "4 sorting algorithms"
```

### Match examples

| Syllabus title | Upload title | Normalized | Match? |
|---|---|---|---|
| "HW 4" | "Homework 4: Sorting" | `"4"` vs `"4 sorting"` | No (exact), Yes (startsWith) |
| "Homework 4" | "HW 4" | `"4"` vs `"4"` | Yes (exact) |
| "Assignment 3" | "Asgn 3" | `"3"` vs `"3"` | Yes (exact) |
| "Lab 2: Circuits" | "Lab Report 2" | `"2 circuits"` vs `"report 2"` | No |
| "Problem Set 5" | "PSet 5" | `"5"` vs `"5"` | Yes (exact) |
| "HW 4" | "Homework 4: Sorting Algorithms" | `"4"` vs `"4 sorting algorithms"` | Yes (startsWith) |

### Matching algorithm

```javascript
function findPlaceholderMatch(courseId, normalizedTitle) {
  // 1. Query: SELECT * FROM assignments WHERE course_id = ? AND source = 'syllabus' AND material_id IS NULL
  // 2. Exact match: placeholder.title_normalized === normalizedTitle → HIGH confidence, auto-match
  // 3. Starts-with: normalizedTitle.startsWith(placeholder.title_normalized) → HIGH confidence (upload has more detail than syllabus)
  // 4. Starts-with (reverse): placeholder.title_normalized.startsWith(normalizedTitle) → MEDIUM confidence
  // 5. Multiple matches → AMBIGUOUS, return all candidates for student picker
  // 6. No match → return null (create new assignment)
}
```

**Confidence levels:**
- **HIGH** (auto-match): Exactly one match at step 2 or 3. Proceed without student input.
- **AMBIGUOUS** (student picks): Multiple matches at any step. Present picker: "This looks like it could be HW 3 or HW 4 — which one?"
- **NONE**: No match. Create new assignment record.

### Location

Exported from `db.js` as a standalone utility function, co-located with the `Assignments` module since both the DB module and `skills.js` need it.

---

## 3. `Assignments` DB Module API

All methods are `async`. All return shapes are plain objects (no class instances).

```javascript
export const Assignments = {

  // === Core CRUD ===

  /**
   * Get all assignments for a course, with question counts.
   * @param {string} courseId
   * @returns {Promise<Array<{
   *   id: string, courseId: string, materialId: string|null,
   *   title: string, titleNormalized: string,
   *   dueDate: number|null, status: string, source: string,
   *   createdAt: number, updatedAt: number|null,
   *   questionCount: number
   * }>>}
   *
   * SQL: SELECT a.*, COUNT(aq.id) AS question_count
   *      FROM assignments a
   *      LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
   *      WHERE a.course_id = ?
   *      GROUP BY a.id
   *      ORDER BY a.due_date ASC NULLS LAST, a.created_at ASC
   */
  async getByCourse(courseId) { ... },

  /**
   * Get a single assignment by ID, with full questions and skill mappings.
   * @param {string} id
   * @returns {Promise<{
   *   id: string, courseId: string, materialId: string|null,
   *   title: string, dueDate: number|null, status: string, source: string,
   *   questions: Array<{
   *     id: number, questionRef: string, description: string,
   *     difficulty: string, ordering: number,
   *     requiredSkills: Array<{ subSkillId: number, name: string, conceptKey: string }>
   *   }>
   * } | null>}
   *
   * SQL (3 queries):
   *   1. SELECT * FROM assignments WHERE id = ?
   *   2. SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY ordering
   *   3. SELECT aqs.sub_skill_id, ss.name, ss.concept_key
   *      FROM assignment_question_skills aqs
   *      JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
   *      WHERE aqs.question_id IN (?)
   */
  async getById(id) { ... },

  /**
   * Create a new assignment. Generates UUID and normalizes title.
   * @param {{ courseId: string, materialId?: string, title: string, dueDate?: number, source?: string }}
   * @returns {Promise<string>} — the new assignment ID
   *
   * SQL: INSERT INTO assignments (id, course_id, material_id, title, title_normalized, due_date, status, source, created_at)
   *      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
   */
  async create({ courseId, materialId, title, dueDate, source }) { ... },

  /**
   * Update due date on an assignment.
   * @param {string} id
   * @param {number|null} dueDate — Unix epoch seconds, or null to clear
   * @returns {Promise<void>}
   *
   * SQL: UPDATE assignments SET due_date = ?, updated_at = ? WHERE id = ?
   */
  async updateDueDate(id, dueDate) { ... },

  /**
   * Update assignment status.
   * @param {string} id
   * @param {string} status — 'active' | 'submitted' | 'graded'
   * @returns {Promise<void>}
   *
   * SQL: UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?
   */
  async updateStatus(id, status) { ... },

  /**
   * Link a material to an existing (placeholder) assignment.
   * @param {string} id — assignment ID
   * @param {string} materialId — material ID to link
   * @returns {Promise<void>}
   *
   * SQL: UPDATE assignments SET material_id = ?, source = 'decomposition', updated_at = ? WHERE id = ?
   */
  async linkMaterial(id, materialId) { ... },

  /**
   * Delete an assignment and cascade to questions + skill mappings.
   * @param {string} id
   * @returns {Promise<void>}
   *
   * SQL: DELETE FROM assignments WHERE id = ?
   * (CASCADE handles questions and skill mappings)
   */
  async delete(id) { ... },

  // === Schedule Queries ===

  /**
   * Get all assignments due within the next N days, across all courses.
   * Includes course name for display.
   * @param {number} dayRange — default 14
   * @returns {Promise<Array<{ ...assignment, courseName: string, questionCount: number }>>}
   *
   * SQL: SELECT a.*, c.name AS course_name, COUNT(aq.id) AS question_count
   *      FROM assignments a
   *      JOIN courses c ON c.id = a.course_id
   *      LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
   *      WHERE a.due_date BETWEEN ? AND ?
   *        AND a.status = 'active'
   *      GROUP BY a.id
   *      ORDER BY a.due_date ASC
   */
  async getUpcoming(dayRange = 14) { ... },

  /**
   * Get all assignments with due_date in [startEpoch, endEpoch].
   * @param {number} startEpoch
   * @param {number} endEpoch
   * @returns {Promise<Array<assignment>>}
   *
   * SQL: SELECT * FROM assignments WHERE due_date BETWEEN ? AND ? ORDER BY due_date ASC
   */
  async getByDateRange(startEpoch, endEpoch) { ... },

  /**
   * Get overdue assignments (due_date < now, status = 'active').
   * @returns {Promise<Array<{ ...assignment, courseName: string }>>}
   *
   * SQL: SELECT a.*, c.name AS course_name
   *      FROM assignments a
   *      JOIN courses c ON c.id = a.course_id
   *      WHERE a.due_date < ? AND a.status = 'active' AND a.due_date IS NOT NULL
   *      ORDER BY a.due_date ASC
   */
  async getOverdue() { ... },

  // === Questions ===

  /**
   * Get all questions for an assignment, with skill mappings resolved to names.
   * @param {string} assignmentId
   * @returns {Promise<Array<{
   *   id: number, questionRef: string, description: string,
   *   difficulty: string, ordering: number,
   *   requiredSkills: Array<{ subSkillId: number, name: string, conceptKey: string }>
   * }>>}
   */
  async getQuestions(assignmentId) { ... },

  /**
   * Bulk save questions for an assignment. Deletes existing, inserts new.
   * Also resolves skill IDs and creates assignment_question_skills rows.
   *
   * @param {string} assignmentId
   * @param {string} courseId — needed for skill ID resolution
   * @param {Array<{ id: string, description: string, requiredSkills: string[], difficulty: string }>} questions
   *   — `id` is the question_ref ("q1"), `requiredSkills` are v1 skill IDs or concept keys
   * @returns {Promise<void>}
   *
   * SQL:
   *   1. DELETE FROM assignment_questions WHERE assignment_id = ?
   *   2. For each question:
   *      INSERT INTO assignment_questions (assignment_id, question_ref, description, difficulty, ordering) VALUES (?, ?, ?, ?, ?)
   *   3. For each requiredSkill on each question:
   *      Look up sub_skills by v1 ID match (conceptKey or name) within course
   *      INSERT INTO assignment_question_skills (question_id, sub_skill_id) VALUES (?, ?)
   */
  async saveQuestions(assignmentId, courseId, questions) { ... },

  // === Placeholder Matching ===

  /**
   * Find unlinked syllabus placeholders for a course.
   * @param {string} courseId
   * @returns {Promise<Array<assignment>>} — where source='syllabus' AND material_id IS NULL
   */
  async getPlaceholders(courseId) { ... },

  /**
   * Find a placeholder match for a given title.
   * Returns { match: assignment, confidence: 'high'|'ambiguous' } or null.
   * @param {string} courseId
   * @param {string} title — raw title from decomposition
   * @returns {Promise<{ match: assignment, confidence: string } | { matches: Array<assignment>, confidence: 'ambiguous' } | null>}
   */
  async findPlaceholderMatch(courseId, title) { ... },
};
```

### Skill ID resolution strategy in `saveQuestions`

The LLM decomposition produces `requiredSkills` as an array of strings — these are v1-style skill IDs (e.g., `"skill-chunk-3"`) or free-text names. Resolution to `sub_skills.id`:

1. Query `sub_skills` for the course: `SELECT id, name, concept_key FROM sub_skills WHERE source_course_id = ? AND is_archived = 0`
2. For each `requiredSkill` string, try matching:
   - Exact match on `id` (v1 compat: `skill.id === requiredSkill`) — handles migrated v1 IDs
   - Exact match on `concept_key` — handles v2 concept keys
   - Case-insensitive match on `name` — fallback for free-text
3. If no match found: **skip silently** (orphaned skill ID). Log to console. Do not create phantom skill rows.

This handles the mixed ID landscape: v1 courses have `"skill-chunk-N"` IDs, v2 courses have concept keys.

---

## 4. Data Migration: Blob-to-Table Conversion

### When it runs

On app boot, in the init effect in `StudyContext.jsx`, after `DB.getCourses()` succeeds and before `setReady(true)`. Runs once per course that has blob data.

### Flow

```
For each course in loaded courses:
  1. Read blob: settings WHERE key = 'v1_course_data:{courseId}:asgn'
  2. If null or empty array → skip (no blob data or already migrated)
  3. Parse JSON blob → Array<{ id, title, dueDate, questions }>
  4. For each assignment in the array:
     a. Assignments.create({ courseId, materialId: null, title, dueDate: parseDueDate(dueDate), source: 'decomposition' })
        - materialId is null because blobs don't store material references
        - parseDueDate: attempt to parse dueDate string → Unix epoch. If null or unparseable → null
     b. Assignments.saveQuestions(assignmentId, courseId, questions)
        - questions[].requiredSkills resolved to sub_skills via the strategy above
        - Orphaned skill IDs (no match in sub_skills) are silently skipped
  5. Delete blob: DELETE FROM settings WHERE key = 'v1_course_data:{courseId}:asgn'
  6. Log: "[Migration] Migrated {N} assignments for course {courseId}"
```

### Edge cases

| Case | Handling |
|---|---|
| Blob is `null` | Skip — no data to migrate |
| Blob is `[]` (empty array) | Delete the blob key, skip assignment creation |
| Blob has assignment with no questions | Create assignment row with 0 questions. Valid state (placeholder-like). |
| `dueDate` is a string like `"Oct 11"` | `parseDueDate` attempts `new Date(str)`. If `NaN` → store as `null`. Due dates from LLM decomposition are almost always null or unparseable. |
| `requiredSkills` references non-existent skill IDs | Skip the skill mapping. Log warning. Assignment + question still created. |
| Course has v1 skills (not yet migrated to v2) | Skill resolution will fail for all skills (no `sub_skills` rows). Questions are created with 0 skill mappings. Skill mappings will be populated when the course's skills are re-extracted or v1→v2 skill migration runs. |
| Duplicate blob migration (crash mid-migration, re-run) | `CREATE TABLE IF NOT EXISTS` + UUID primary keys make re-insertion safe. But to avoid duplicate assignments: check if any assignments already exist for the course before migrating. If `Assignments.getByCourse(courseId).length > 0`, skip migration for that course. |
| Migration fails partway | Each assignment is independent. If one fails, log error, continue to next. Blob is only deleted after all assignments in the blob are processed. |

### Location

New exported function in `migrate.js`:

```javascript
export async function migrateAssignmentBlobs(courses) {
  // courses: array from DB.getCourses()
  // Returns: { migrated: number, skipped: number, errors: Array }
}
```

Called from the init effect in `StudyContext.jsx`:

```javascript
// After setCourses(loaded), before setReady(true):
try {
  const migResult = await migrateAssignmentBlobs(loaded);
  if (migResult.migrated > 0) console.log(`[Migration] Migrated ${migResult.migrated} assignment blobs`);
} catch (e) {
  console.error("Assignment blob migration failed:", e);
  // Non-fatal — app continues. Blobs still readable via old API.
}
```

---

## 5. Call Site Migration Map

### Current state: 5 references to `saveAsgn`/`getAsgn` across 2 files

#### File: `src/lib/skills.js` — `decomposeAssignments()`

| Line | Current | After |
|---|---|---|
| 224 | `await DB.saveAsgn(courseId, [])` | `// No-op — empty decomposition, don't create assignments` |
| 237 | `await DB.saveAsgn(courseId, asgn)` | See below — create + saveQuestions per assignment |
| 240 | `await DB.saveAsgn(courseId, [])` | `// No-op — parse failed, don't overwrite` |

**New `decomposeAssignments` flow (post-migration):**

```javascript
// After LLM returns asgn array:
if (asgn && Array.isArray(asgn)) {
  const results = [];
  for (const a of asgn) {
    // Try to match to existing placeholder
    const match = await Assignments.findPlaceholderMatch(courseId, a.title);
    let assignmentId;

    if (match?.confidence === 'high') {
      // Link to existing placeholder
      assignmentId = match.match.id;
      // materialId linking happens at call site (skills.js doesn't know material_id)
    } else {
      // Create new assignment
      assignmentId = await Assignments.create({
        courseId,
        title: a.title,
        dueDate: parseDueDate(a.dueDate),
        source: 'decomposition',
      });
    }

    // Save questions with skill resolution
    await Assignments.saveQuestions(assignmentId, courseId, a.questions || []);

    // Load the full assignment for return
    const full = await Assignments.getById(assignmentId);
    results.push(full);
  }
  return results;
}
return [];
```

**Return shape change:** Currently returns the raw LLM array. After: returns an array of `Assignments.getById()` results (richer, with resolved skill names). The shape is compatible — both have `id`, `title`, `dueDate`, `questions[]` with `id`, `description`, `requiredSkills`, `difficulty`.

#### File: `src/StudyContext.jsx`

| Line | Current | After | Context |
|---|---|---|---|
| ~528 | `const asgn = await DB.getAsgn(active.id)` | `const asgn = await Assignments.getByCourse(active.id)` | Assignment picker init in `selectMode("assignment")` |
| ~536 | `var freshAsgn = await DB.getAsgn(active.id)` | `var freshAsgn = await Assignments.getByCourse(active.id)` | After inline decomposition |
| ~721 | `const asgn = await DB.getAsgn(active.id) \|\| []` | `const asgn = await Assignments.getByCourse(active.id)` | Chat context building |

**Return shape compatibility:**

| Field | Blob (old) | `getByCourse` (new) | Compatible? |
|---|---|---|---|
| `id` | `"asgn-1"` (LLM-generated) | UUID | Yes — used as key, not matched elsewhere |
| `title` | string | string | Yes |
| `dueDate` | string or null | number (epoch) or null | **Breaking** — consumers that display dates need update |
| `questions` | inline array | not included in `getByCourse` | **Breaking** — see below |

**The `questions` field:** `getByCourse` returns `questionCount` but not full questions. Call sites that need questions must call `Assignments.getById(id)` or `Assignments.getQuestions(id)`. This affects:

1. **Assignment picker** (StudyContext ~528): Currently receives `asgn` array with inline questions, then enriches them. After: `getByCourse` returns the list, then `getById(selectedId)` loads questions when the user picks one.
2. **Chat context** (StudyContext ~721): Passes `asgn` to `buildContext()` which iterates questions. After: load full assignments with questions: `Promise.all(asgn.map(a => Assignments.getById(a.id)))`.

### `dueDate` format change

Old: string (`"Oct 11"` or `null`) — always null in practice, displayed as-is
New: integer (Unix epoch seconds) or `null`

Consumers already handle null. The assignment picker in `ModePicker.jsx` line ~200 renders `a.dueDate` — this needs a format helper: `dueDate ? new Date(dueDate * 1000).toLocaleDateString() : null`.

---

## 6. Migration Impact Assessment

### Tables created (new)
- `assignments` — 10 columns, 5 indexes
- `assignment_questions` — 6 columns, 1 index
- `assignment_question_skills` — 3 columns, 2 indexes

### Tables modified
- **None.** This migration is purely additive.

### Tables read (for data migration)
- `settings` — read + delete blob keys after migration
- `sub_skills` — read for skill ID resolution in `saveQuestions`

### Files modified

| File | Change | Risk |
|---|---|---|
| `src-tauri/migrations/003_assignments.sql` | **New file** — schema | None (additive DDL) |
| `src-tauri/src/lib.rs` | Add Migration version 3 to vec | Low (pattern matches existing 001/002) |
| `src/lib/db.js` | Add `Assignments` module + `normalizeAssignmentTitle` | Low (new exports, no existing code modified) |
| `src/lib/migrate.js` | Add `migrateAssignmentBlobs` | Low (new export, no existing code modified) |
| `src/lib/skills.js` | Rewrite `decomposeAssignments` internals | **Medium** — core decomposition flow changes |
| `src/StudyContext.jsx` | Replace 3x `DB.getAsgn` calls, add migration call | **Medium** — touches init + assignment mode |
| `src/components/study/ModePicker.jsx` | `dueDate` display format (epoch → locale string) | Low — cosmetic |

### What does NOT change
- `src/lib/fsrs.js` — untouched per CEO directive
- `src/lib/study.js` — `buildContext` and `buildFocusedContext` receive the same shape (handled by call site transformation)
- `src/components/study/AssignmentPanel.jsx` — receives `asgnWork` from state, shape unchanged
- Existing migration files (001, 002) — untouched

---

## 7. Escalation

**Confirm migration 003 numbering:** The spec states "Migration 003 — Data migration (v1→v2)" in `PROJECT_STATUS.md` refers to a *skill* data migration that was planned but never executed. The spec (`assignment-scheduler-spec.md`) explicitly names this "Migration 003" for assignment tables. The CEO approved migration 003 for assignment tables in the spec. The planned v1→v2 skill data migration already runs in `migrate.js` as application-level code (not a SQL migration file), so migration number 003 is available.

**Recommendation:** Proceed with 003 for assignments. The v1→v2 skill migration is JS-level code in `migrate.js`, not a numbered SQL migration, so there's no conflict.

---

## 8. Open Design Decisions (within SA authority)

1. **`title_normalized` stored vs computed** — Stored (indexed column) rather than computed at query time. Costs ~20 bytes per row, saves full-table-scan on every placeholder match. Correct tradeoff for schedule queries.

2. **Skill resolution fallback order** — `id` → `concept_key` → `name` (case-insensitive). This handles both v1 migrated data and fresh v2 extractions. No third-party fuzzy matching — exact/prefix only.

3. **`saveQuestions` is delete-and-reinsert** — Simpler than upsert, and questions are always bulk-replaced during decomposition. CASCADE handles `assignment_question_skills` cleanup automatically.

4. **Blob migration in init effect** — Runs once on boot, gated by "blob exists + no assignments exist for course". Non-fatal on failure. Alternative was a standalone migration screen, but the data volume is tiny (typically 0-5 assignments per course) and the operation is fast.
