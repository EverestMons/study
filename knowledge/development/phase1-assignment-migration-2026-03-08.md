# Phase 1 — Assignment Table Migration (003) — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer Agent
**Blueprint:** `knowledge/architecture/assignment-table-migration-2026-03-08.md`
**Spec:** `docs/planning/assignment-scheduler-spec.md` (Phase 1)
**Build:** `npm run build` passes (82 modules, 913.90 kB main chunk)

---

## Summary

Migrated assignment storage from JSON blobs in the `settings` table to normalized relational tables (`assignments`, `assignment_questions`, `assignment_question_skills`). Covers Steps 1.2–1.6 of Phase 1.

---

## Step 1.2 — Migration SQL

### `src-tauri/migrations/003_assignments.sql` (NEW)
- 3 tables: `assignments` (10 cols), `assignment_questions` (6 cols), `assignment_question_skills` (3 cols)
- 8 indexes for query patterns (course lookup, due date range, status filter, placeholder matching, question ordering, skill joins)
- All FKs with ON DELETE CASCADE
- Validated: full SQL syntax tested on temp DB with migrations 001+002+003 applied

### `src-tauri/src/lib.rs`
- Added `Migration { version: 3, description: "assignment_tables", ... }` entry
- `cargo check` passed

---

## Step 1.3 — Assignments DB Module

### `src/lib/db.js`

**`normalizeAssignmentTitle()` (exported helper)**
- Strips prefixes: homework, hw, assignment, asgn, problem set, pset, lab, project, quiz, exam
- Strips punctuation, non-alphanumeric, collapses whitespace
- Returns stable normalized string for placeholder matching

**`Assignments` module (13 methods)**

| Method | Type | Description |
|---|---|---|
| `getByCourse(courseId)` | Read | Returns assignments with `questionCount` via LEFT JOIN |
| `getById(id)` | Read | Full assignment with questions and resolved skill mappings (3 queries) |
| `create({...})` | Write | UUID generation, title normalization, `withTransaction` |
| `updateDueDate(id, dueDate)` | Write | Sets `due_date` + `updated_at` |
| `updateStatus(id, status)` | Write | Sets `status` + `updated_at` |
| `linkMaterial(id, materialId)` | Write | Links material, sets `source = 'decomposition'` |
| `delete(id)` | Write | CASCADE handles children |
| `getUpcoming(dayRange)` | Read | Cross-course, next N days with course name |
| `getByDateRange(start, end)` | Read | Raw rows for arbitrary epoch range |
| `getOverdue()` | Read | `due_date < now() AND status = 'active'` |
| `getQuestions(assignmentId)` | Read | Questions with resolved skill names/concept_keys |
| `saveQuestions(assignmentId, courseId, questions)` | Write | Delete-and-reinsert via `withTransaction` with skill resolution |
| `getPlaceholders(courseId)` | Read | `source = 'syllabus' AND material_id IS NULL` |
| `findPlaceholderMatch(courseId, title)` | Read | 3-tier matching: exact > startsWith > reverse startsWith |

**`resolveSkillId()` (internal)**
- Resolution order: exact `id` > `concept_key` > case-insensitive `name`
- Handles v1 (`"skill-chunk-3"`) and v2 (concept key) formats

**`resetAll` updated** — added 3 new tables at top of delete order

---

## Step 1.4 — Blob Data Migration

### `src/lib/migrate.js`
- Added `parseDueDate()` helper for epoch conversion
- Added `migrateAssignmentBlobs(courses)` export:
  - For each course: reads v1 blob from settings, creates `Assignments` rows + saves questions
  - Skips if assignments already exist (idempotent)
  - Deletes blob after successful migration
  - Returns `{ migrated, skipped, errors }`

### `src/StudyContext.jsx`
- Added `migrateAssignmentBlobs` import from migrate.js
- Wired into init effect (after `setCourses`, before `getApiKey`), non-fatal try/catch

---

## Step 1.5 — Update Call Sites

### `src/lib/skills.js`
1. **Import**: Added `Assignments` to db.js import
2. **`scanForDueDate(text)`** (new helper): Regex scanner for due dates in raw assignment text. Patterns: `due/deadline/submit by` + `Month DD, YYYY` or `MM/DD/YYYY` formats. Returns epoch seconds or null.
3. **`decomposeAssignments()` rewritten**:
   - Scans raw material text for due dates as fallback
   - Removed both `DB.saveAsgn()` calls
   - Uses `Assignments.findPlaceholderMatch()` to link to existing syllabus placeholders
   - Uses `Assignments.create()` + `Assignments.saveQuestions()` per assignment
   - Due date resolution priority: LLM response > scanned from text > null
   - Skill list uses `s.conceptKey || s.id` for v2 compatibility

### `src/StudyContext.jsx`
1. **Import**: Added `Assignments` to db.js import
2. **`loadAssignmentsCompat(courseId)`** (new module-level helper): Loads assignments from DB and maps to the shape all consumers expect:
   - `q.questionRef` > `q.id` (string like "q1", not integer DB ID)
   - `q.requiredSkills: [{subSkillId, name, conceptKey}]` > `[conceptKey string]` (for `.join(", ")` in buildContext/buildFocusedContext)
   - `a.dueDate` epoch > formatted string ("Mar 13, 2026") for LLM context display
3. **3 call sites replaced**: `DB.getAsgn(active.id)` > `loadAssignmentsCompat(active.id)` at:
   - `selectMode("assignment")` initial load (~line 552)
   - Retry decomposition path (~line 560)
   - `bootWithFocus` chat context path (~line 745)

---

## Step 1.6 — Remove Dead V1 Code

### `src/lib/db.js`
- Removed `saveAsgn` and `getAsgn` methods from V1_COMPAT section
- Replaced with comment: `// saveAsgn, getAsgn removed — assignments now use Assignments module + 003 tables`

### `src/lib/migrate.js`
- Replaced `DB.getAsgn(course.id)` with inline settings table read (direct `SELECT` + `JSON.parse`)
- Migration no longer depends on the removed V1 methods

### Verification
- `grep -r "saveAsgn\|getAsgn" src/` returns only the comment in db.js — zero live references
- `npm run build` passes (82 modules, no new warnings)

---

## Design Decisions

1. **`loadAssignmentsCompat` as module-level function** — doesn't depend on React state, placed between imports and context creation for clean separation.
2. **conceptKey preferred in skill mapping** — `s.conceptKey || s.name || String(s.subSkillId)` ensures stable, descriptive skill references that resolve correctly via `resolveSkillId`.
3. **Date formatting in compat layer** — epoch > locale string conversion happens once at load time. Downstream consumers (buildContext, buildFocusedContext) display it directly in LLM prompts.
4. **Placeholder linking in decomposition** — `findPlaceholderMatch` runs before `create`. If a high-confidence match exists, the existing placeholder is updated (due date) rather than creating a duplicate.
5. **Inline blob read in migration** — after removing `DB.getAsgn`, the migration reads the settings table directly. This is a one-time migration path that will be removed once all users have migrated.
