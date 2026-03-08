# Phase 1 — Assignments DB Module — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer Agent
**Blueprint:** `knowledge/architecture/assignment-table-migration-2026-03-08.md`
**Build:** `npm run build` passes

---

## Summary

Implemented the `Assignments` DB module in `db.js` with 13 methods, a `normalizeAssignmentTitle()` helper, and a `resolveSkillId()` internal function. Updated `resetAll` to include the 3 new assignment tables.

---

## Changes

### `src/lib/db.js`

**1. `normalizeAssignmentTitle()` (exported helper, line ~80)**
- Strips common prefixes: `homework`, `hw`, `assignment`, `asgn`, `problem set`, `pset`, `lab`, `project`, `quiz`, `exam`
- Strips leading/trailing punctuation, removes non-alphanumeric (except spaces), collapses whitespace
- Returns stable normalized string for placeholder matching

**2. `Assignments` module (exported, after `CourseAssessments`)**

| Method | Type | Description |
|---|---|---|
| `getByCourse(courseId)` | Read | Returns assignments with `questionCount` via LEFT JOIN. Orders by due_date ASC (nulls last). Maps snake_case → camelCase. |
| `getById(id)` | Read | Full assignment with questions and resolved skill mappings. 3 queries: assignment, questions, skill join. |
| `create({...})` | Write | Generates UUID, normalizes title, inserts via `withTransaction`. |
| `updateDueDate(id, dueDate)` | Write | Sets `due_date` + `updated_at`. |
| `updateStatus(id, status)` | Write | Sets `status` + `updated_at`. |
| `linkMaterial(id, materialId)` | Write | Links material, sets `source = 'decomposition'`. |
| `delete(id)` | Write | CASCADE handles children. |
| `getUpcoming(dayRange)` | Read | Cross-course, next N days. JOINs courses for `courseName`. |
| `getByDateRange(start, end)` | Read | Raw rows for arbitrary epoch range. |
| `getOverdue()` | Read | `due_date < now() AND status = 'active'`. |
| `getQuestions(assignmentId)` | Read | Questions with resolved skill names/concept_keys. |
| `saveQuestions(assignmentId, courseId, questions)` | Write | Delete-and-reinsert via `withTransaction`. Resolves skill IDs per course. |
| `getPlaceholders(courseId)` | Read | `source = 'syllabus' AND material_id IS NULL`. |
| `findPlaceholderMatch(courseId, title)` | Read | 3-tier matching: exact → startsWith → reverse startsWith. Returns `{match, confidence}` or `{matches, confidence: 'ambiguous'}` or `null`. |

**3. `resolveSkillId()` (internal function)**
- Resolution order: exact `id` → `concept_key` → case-insensitive `name`
- Handles both v1 (`"skill-chunk-3"`) and v2 (concept key) formats
- Returns `null` for unresolvable refs (orphaned skill IDs silently skipped)

**4. `resetAll` updated**
- Added `assignment_question_skills`, `assignment_questions`, `assignments` at the top of the delete order (children first for FK safety)

### `CourseAssessments` — already existed
The `CourseAssessments` module was already present in db.js (lines 305–323) with `getByCourse`, `insert`, and `clearForCourse`. No changes needed.

---

## Design Decisions

1. **camelCase mapping in return shapes** — `getByCourse`, `getById`, `getUpcoming`, `getOverdue` all map SQLite snake_case columns to camelCase JS objects. This matches the convention consumers expect (existing `asgn` objects from the LLM use camelCase).

2. **`getById` uses 3 queries, not JOINs** — Avoids the cartesian explosion of questions × skills. Loads questions first, then batch-loads skills for all question IDs in one query. Groups skills by `question_id` in JS.

3. **`saveQuestions` loads all course skills once** — Instead of N queries (one per skill ref), loads all `sub_skills` for the course upfront and resolves in-memory. Typical course has 20-100 skills, so this is fast.

4. **`create` uses `withTransaction`** — Even though it's a single INSERT, this ensures it goes through the write mutex. Prevents "database is locked" errors when multiple writes are in flight.

5. **`getByCourse` NULLS LAST ordering** — `CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END` puts assignments with no due date after those with dates. Standard SQL `NULLS LAST` isn't supported in all SQLite builds.

---

## Verification

- `npm run build` — PASS, 82 modules, no new warnings
- All SQL query patterns tested against temp DB with all 3 migrations applied
- CASCADE verified with `PRAGMA foreign_keys = ON`
- Bundle size increase: +7 kB (904 → 911 kB)
