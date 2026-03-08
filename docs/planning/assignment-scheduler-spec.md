# Assignment Scheduler — Design Spec

**Date:** March 8, 2026
**Status:** Design phase — no code written yet
**Context:** Adding deadline awareness to Study — syllabus parsing, proper assignment storage, schedule UI, and deadline-driven study prioritization
**Depends on:** `skill-architecture-redesign.md` (schema, session intent system), migration 001 + 002

---

## Problem Statement

Study has no concept of time. A student uploads assignments and course materials, extracts skills, and practices — but the app never asks "what's due soon?" or suggests prioritizing based on deadlines. The session intent system routes students to different study modes, but it can't factor in urgency because:

1. **Due dates don't exist.** The assignment decomposition prompt asks the LLM to extract `dueDate`, but assignment documents rarely contain dates. The field is always null.
2. **No syllabus parsing.** The `course_schedule` table exists (migration 001) with week-by-week structure, but nothing populates it. Syllabi are classified correctly on upload but treated as inert documents.
3. **Assignments live in a JSON blob.** The V1 compat layer stores decomposed assignments as `v1_course_data:{courseId}:asgn` in the settings table. This can't be queried across courses or by date range.
4. **No schedule UI.** There's no screen showing upcoming deadlines across courses.

### What this means for the student

The student has to remember what's due when, mentally prioritize, and choose the right study mode themselves. The app that's supposed to make studying purposeful doesn't know what's urgent.

---

## Design Goals

1. **Assignments become first-class entities** with proper relational storage, due dates, and status tracking
2. **Syllabi automatically populate the course schedule** when uploaded, giving the app a timeline of the semester
3. **Students can set and update due dates** on any assignment material — either from syllabus parsing, LLM extraction, or manual entry4. **The app surfaces what's due soon** in a dedicated schedule view and as contextual nudges in the session picker
5. **The AI tutor becomes deadline-aware** — system prompts include deadline context, study suggestions factor in urgency

---

## Architecture Overview

```
Syllabus Upload → syllabusParser.js → course_schedule + course_assessments + course metadata
                                      ↓
                                      Create placeholder assignments (source='syllabus')
                                      with title + due_date but no material_id
                                      ↓
                                      Create exam entries in course_schedule with
                                      coverage scope (e.g. "covers weeks 1-6")

Assignment Upload → decomposeAssignments() → match to existing placeholder (by title)
                                              OR create new assignment record
                                              ↓
                                              Link material_id, populate questions + skill mappings
                                              ↓
                                              Student can edit due_date at any time

HomeScreen ← per-course info bars: "due this week: 2, due next week: 1"
          ← per-course exam info: "Midterm in 9 days — readiness 51%"
          → tap info bar → full assignment/exam schedule view

ModePicker ← deadline nudges: "HW 5 due in 2 days — readiness 34%"

AI Context Builder ← deadline proximity → weighted study suggestions
```
---

## Phase 1 — Assignment Table Migration (003)

### Why migrate now

Assignments are currently stored as a JSON blob in `settings` (`v1_course_data:{courseId}:asgn`). This was acceptable for the V1 compat layer, but this feature needs:

- Cross-course deadline queries (`SELECT * FROM assignments WHERE due_date BETWEEN ? AND ?`)
- Individual assignment status tracking (active → submitted → graded)
- Proper foreign keys to materials and sub_skills
- A clean foundation for multi-user (add `user_id` later without rewriting storage)

The blast radius is bounded: `saveAsgn`/`getAsgn` are called in 5 places across 2 files (`skills.js` and `StudyContext.jsx`).

### Schema: `003_assignments.sql`

```sql
-- ============================================================
-- Assignments — decomposed from uploaded assignment materials
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
    id          TEXT PRIMARY KEY,              -- UUID
    course_id   TEXT NOT NULL,
    material_id TEXT,                          -- links to uploaded assignment material (nullable: manual entries)
    title       TEXT NOT NULL,
    due_date    INTEGER,                       -- Unix epoch, NULL if unknown
    status      TEXT NOT NULL DEFAULT 'active', -- active, submitted, graded
    source      TEXT NOT NULL DEFAULT 'decomposition', -- decomposition, syllabus, manual    created_at  INTEGER NOT NULL,
    updated_at  INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_material ON assignments(material_id);

-- ============================================================
-- Assignment Questions — individual items within an assignment
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id   TEXT NOT NULL,
    question_ref    TEXT NOT NULL,             -- "q1", "q2a", matches LLM decomposition IDs
    description     TEXT,
    difficulty      TEXT,                      -- foundational, intermediate, advanced
    ordering        INTEGER,                   -- display order
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

### DB module additions (`db.js`)

```javascript
export const Assignments = {
  // Core CRUD
  async getByCourse(courseId) { ... },
  async getById(id) { ... },
  async create({ courseId, materialId, title, dueDate, source }) { ... },
  async updateDueDate(id, dueDate) { ... },
  async updateStatus(id, status) { ... },
  async delete(id) { ... },

  // Schedule queries
  async getUpcoming(dayRange = 14) { ... },          // cross-course, next N days
  async getByDateRange(startEpoch, endEpoch) { ... }, // arbitrary range
  async getOverdue() { ... },                         // due_date < now, status = 'active'
  // Questions
  async getQuestions(assignmentId) { ... },
  async saveQuestions(assignmentId, questions) { ... }, // bulk upsert
  async getQuestionSkills(questionId) { ... },
};
```

### Migration path for existing data

On app boot (in `migrate.js`):
1. Check if `assignments` table exists
2. If yes and settings blobs still exist: read each blob, insert into new tables, delete blob
3. If no blobs exist: skip (already migrated or fresh install)

This is the same expand-and-contract pattern used for migrations 001-002.

### Call site updates

| File | Current | After |
|---|---|---|
| `skills.js` — `decomposeAssignments()` | `DB.saveAsgn(courseId, asgnArray)` | `Assignments.create()` + `Assignments.saveQuestions()` per assignment |
| `StudyContext.jsx` — `selectMode("assignment")` | `DB.getAsgn(active.id)` | `Assignments.getByCourse(active.id)` |
| `StudyContext.jsx` — `bootWithFocus()` | `DB.getAsgn(active.id)` | `Assignments.getByCourse(active.id)` |

The assignment picker in ModePicker already expects `{ id, title, dueDate, questions: [{ id, description, requiredSkills, difficulty }] }` — the shape stays the same, just the source changes from blob to relational queries.

---

## Phase 2 — Syllabus Parsing Pipeline

### Approach: LLM-first, deterministic validation
The spec (`skill-architecture-redesign.md`) designed syllabus parsing as deterministic-first with LLM filling gaps. For syllabi specifically, this is inverted: **LLM handles parsing, deterministic code validates the output.**

**Rationale:** Syllabi are small documents (2-8 pages) with wildly inconsistent formatting — tables, paragraphs, PDFs, DOCXs. The format variation is the hard problem, and LLMs handle it well. Regex handles well-structured tables but fails on freeform syllabi. The cost of one LLM call per syllabus upload is trivial.

Deterministic parsing is still correct for chapter structure and assignment decomposition (large, repeated, structurally consistent). But syllabi are one-off, small, and format-diverse.

### Module: `src/lib/syllabusParser.js`

```javascript
/**
 * parseSyllabus(courseId, materialText)
 *
 * Sends syllabus text to Claude with structured JSON output schema.
 * Validates output deterministically. Writes to course_schedule,
 * course_assessments, and backfills course metadata.
 *
 * Returns: { success, schedule, grading, metadata, confidence, issues }
 */
```

### LLM prompt output schema

```json
{
  "metadata": {
    "courseNumber": "CS 301",
    "instructor": "Dr. Smith",
    "semester": "Fall 2026",
    "credits": 3,
    "description": "Catalog description if present"  },
  "schedule": [
    {
      "weekNumber": 1,
      "dates": "Aug 26 - Aug 30",
      "startDate": "2026-08-26",
      "endDate": "2026-08-30",
      "topics": ["Course overview", "Introduction to algorithms"],
      "readings": ["Chapter 1"],
      "assignmentsDue": [],
      "exams": []
    },
    {
      "weekNumber": 7,
      "dates": "Oct 7 - Oct 11",
      "startDate": "2026-10-07",
      "endDate": "2026-10-11",
      "topics": ["Dynamic programming"],
      "readings": ["Chapter 6"],
      "assignmentsDue": ["HW 4"],
      "exams": ["Midterm — covers weeks 1-6"]
    }
  ],
  "exams": [
    {
      "name": "Midterm",
      "weekNumber": 7,
      "date": "2026-10-11",
      "coversWeeks": [1, 2, 3, 4, 5, 6],
      "coversTopics": ["Intro to algorithms", "Sorting", "Trees", "Graphs", "Hashing", "Heaps"]    }
  ],
  "grading": [
    { "category": "Homework", "weight": 30, "count": 8 },
    { "category": "Midterm", "weight": 25, "count": 1 },
    { "category": "Final Exam", "weight": 30, "count": 1 },
    { "category": "Participation", "weight": 15, "count": null }
  ]
}
```

### Deterministic post-validation

After LLM returns structured JSON:

1. **Date validation** — parsed dates are sequential, within a plausible semester range, ISO 8601 parseable
2. **Week number continuity** — no gaps (week 1, 2, 3... not 1, 3, 7)
3. **Grading weights sum** — should total ~100% (flag if >105% or <90%)
4. **Assignment name extraction** — pull assignment names from `assignmentsDue` arrays for later cross-reference
5. **Confidence scoring:**
   - `high` — dates parsed, weeks sequential, grading sums to 100%
   - `medium` — some dates missing or ambiguous, grading weights approximate
   - `low` — minimal structure extracted, many nulls

### Auto-trigger on upload

When a material classified as `"syllabus"` finishes parsing (text content available):

1. Run `parseSyllabus(courseId, materialText)`
2. Write results to `course_schedule` via `CourseSchedule.clearForCourse()` + `CourseSchedule.insert()` per week
3. Write grading to `course_assessments`
4. Backfill `courses` row: `course_number`, `instructor`, `semester`, `credits`, `description`5. Set `courses.syllabus_parsed = 1`
6. Add notification: "Syllabus processed — {N} weeks, {M} assignments found"

### Placeholder assignments from syllabus

When syllabus parsing finds assignments in the schedule, it creates **placeholder assignment records** immediately — even before the student uploads the actual assignment material.

For each `assignmentsDue` entry found in the schedule (e.g., "HW 4" in week 7 with `endDate: "2026-10-11"`):

1. Create an assignment record: `{ title: "HW 4", due_date: 1728604800, source: "syllabus", material_id: null, status: "active" }`
2. No questions or skill mappings — those come when the material is uploaded

**Why placeholders matter:**
- The schedule view shows "HW 4 due Thursday — no materials uploaded yet" — catches missing uploads
- If the syllabus says 8 homeworks exist and the student has uploaded 5, that gap is visible
- When the student later uploads "homework-4.docx", the app matches it to the placeholder and links the material

### Assignment upload matching

When a material classified as `"assignment"` is uploaded and decomposed:

1. **Scan assignment content for due date** — before matching, look for date patterns in the assignment text itself (e.g., "Due: October 11, 2026", "Submit by Friday 10/11"). This is a lightweight regex pass, not an LLM call. If found, store as a candidate due date.
2. **Match to syllabus placeholder by title** — normalize the title from the decomposition output (lowercase, strip "homework"/"hw"/"assignment"/"asgn" prefixes, compare remaining tokens). Professors typically use consistent naming between the syllabus and the actual assignment document, so the syllabus title is the primary match key.
3. Check existing assignments for this course with `source = 'syllabus'` and `material_id IS NULL`
4. If a match is found: update the placeholder — set `material_id`, populate questions and skill mappings, set `source = 'decomposition'`. If a due date was extracted from the assignment text (step 1), use it (more specific than the syllabus week end date). Otherwise keep the syllabus-parsed date.
5. If no match: create a new assignment record with the text-extracted due date if available (student uploaded something not in the syllabus, or syllabus wasn't parsed)
6. If match is ambiguous: let the student manually associate via a picker ("This looks like it could be HW 3 or HW 4 — which one?")
### Exam entries from syllabus

When syllabus parsing finds exam entries (e.g., `"Midterm — covers weeks 1-6"` in week 7):

- Store in `course_schedule.exams` as already designed
- Parse the coverage scope: "covers weeks 1-6" → week_numbers 1-6
- This maps to `course_schedule` rows for those weeks, which have `topics` and `readings`
- The exam prep picker can auto-select materials that align with those weeks/topics
- Student can adjust scope in the picker (add/remove materials), but the default is pre-populated

**Exam scope resolution chain:**
1. Syllabus says "Midterm covers weeks 1-6"
2. Weeks 1-6 in `course_schedule` list topics: ["Intro to algorithms", "Sorting", "Trees", ...]
3. Those topics map to uploaded materials via readings references and skill extraction sources
4. Exam prep auto-selects those materials → student sees accurate readiness % based on skills from those materials

---

## Phase 3 — Due Dates on Assignments + Edit Affordance

### Where due dates come from (priority order)

1. **Syllabus parsing** — cross-referenced from `course_schedule.assignments_due` entries with dates
2. **LLM extraction** — the decomposition prompt already asks for `dueDate` from assignment text (rarely succeeds, but costs nothing)
3. **Manual entry** — student sets or updates via material card date picker

### UI: Date picker on assignment materials

On material cards with `classification === "assignment"`:

- Show current due date if set (or "No due date")- Tap to open a date picker
- Selecting a date calls `Assignments.updateDueDate(assignmentId, epoch)`
- Clearing the date sets `due_date = null`

This same affordance works for initial entry and for updating when a professor changes a deadline.

### Assignment picker integration

The assignment picker in ModePicker already renders `a.dueDate` — it's just always null. Once assignments have real due dates:

- Show date in assignment card header (already has the UI slot)
- Sort assignments by due date (soonest first) instead of arbitrary order
- Color-code urgency: red if due within 48h, yellow within 7 days

---

## Phase 4 — Schedule UI

### HomeScreen: Per-course info bars

The HomeScreen (course picker) gets an info bar under each course card showing deadline summary:

```
┌─────────────────────────────────────────────┐
│  CS 301 — Algorithms                        │
│  Due this week: 2  ·  Due next week: 1      │
│  Midterm in 9 days — readiness 51%          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  PHYS 201 — Thermodynamics                  ││  ⚠ HW 4 past due  ·  Due this week: 1      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  ENG 102 — Technical Writing                │
│  No upcoming deadlines                      │
└─────────────────────────────────────────────┘
```

**Data per course:**
- Count of assignments due this week / next week (from `Assignments.getByCourse()` filtered by date)
- Next exam with days remaining and readiness % (from `course_schedule.exams`)
- Overdue flag for past-due assignments with `status = 'active'`
- Placeholder warnings: "2 assignments not yet uploaded" (placeholder assignments with no material)

### Full schedule view (drill-down)

Tapping "Due this week: 2" (or a dedicated "View all deadlines" link) opens a cross-course schedule view:

```
ALL DEADLINES
─────────────────────────────────

This Week
  [●] HW 5 — CS 301          Due Tue    Readiness: 67%
  [●] Lab 3 — PHYS 201       Due Thu    Readiness: 42%

Next Week
  [○] Midterm — CS 301        Oct 11     Readiness: 51%
  [○] HW 6 — CS 301          Oct 13     —

Later
  [○] Final Project — CS 301  Dec 5      —
Not Yet Uploaded
  [?] HW 7 — CS 301          Due Oct 20  No materials
  [?] Lab 4 — PHYS 201       Due Oct 24  No materials

Past Due
  [!] HW 4 — PHYS 201        Was Sep 30  Not submitted
```

**Key addition: "Not Yet Uploaded" section** — shows placeholder assignments (from syllabus parsing) that have a due date but no linked material. This is the "nothing is being missed" signal.

### Data sources

- **Assignments** — `Assignments.getUpcoming(30)` for next 30 days + `Assignments.getOverdue()`
- **Placeholders** — assignments where `material_id IS NULL` (from syllabus parsing, not yet uploaded)
- **Exams** — `CourseSchedule.getByCourse()` filtered for entries with non-empty `exams` arrays
- **Readiness** — for each assignment with questions, compute average skill mastery across its `assignment_question_skills`. For placeholders (no questions yet), readiness is "—"

### Interactions

- Tap an assignment → navigate to that course, open assignment mode for that specific assignment
- Tap an exam → expanded view showing: overall readiness %, full skill breakdown sorted weakest-first, each skill with mastery %. "Start exam prep" button auto-selects materials from exam scope (see Phase 2 — exam scope resolution). Student can see exactly which skills need work before starting.
- Tap a placeholder → navigate to that course's upload screen with a prompt to upload the material

---

## Phase 5 — Deadline-Aware Intelligence

### ModePicker nudges

When the student enters a course and sees the mode picker, if any assignments are due within 7 days:
```
┌─────────────────────────────────────────────┐
│  ⚡ HW 5 due in 2 days — readiness 34%      │
│     [Start working on it]                   │
└─────────────────────────────────────────────┘

  Work on an assignment
  Recap last session
  Skill work
  ...
```

This is a contextual banner above the mode buttons, not a forced redirect. The student can dismiss it.

### AI context builder integration

In `study.js` — `buildContext()` and `buildFocusedContext()`:

Add a `DEADLINE CONTEXT` section to the system prompt when relevant:

```
DEADLINE CONTEXT:
- "HW 5" is due in 2 days (Oct 9). Student readiness: 34%.
  Weakest required skills: Binary Search Trees (12%), Graph Traversal (28%).
- Midterm covering weeks 1-6 is in 9 days (Oct 16).

Prioritize teaching toward the nearest deadline. If the student is in assignment
mode for HW 5, focus on the weakest required skills first.
```

### FSRS review prioritization

When building practice sets or suggesting review:
- Skills required by upcoming assignments (due within 14 days) get a priority boost
- The boost scales inversely with time remaining: skills for something due tomorrow rank higher than skills for something due in 10 days
- This doesn't change FSRS intervals — it changes which skills are *surfaced* for review when the student chooses "Skill work" or "Recap"

### Session intent auto-suggestion

When a student opens a course and:
- Has an assignment due within 3 days
- Readiness for that assignment is below 50%

The mode picker can pre-highlight "Work on an assignment" and show the specific assignment as the suggested starting point. Still a suggestion, not a forced path.

---

## Implementation Sequence

| Phase | What | Estimated scope | Dependencies |
|---|---|---|---|
| 1 | Assignment table migration (003) | New migration, DB module, update 5 call sites | None |
| 2 | Syllabus parsing pipeline | New `syllabusParser.js`, auto-trigger on upload, write to existing tables | Phase 1 (for cross-referencing due dates) |
| 3 | Due dates on assignments | Date picker on material cards, decomposition prompt update, assignment picker sort | Phase 1 |
| 4 | Schedule UI | New component, HomeScreen integration | Phases 1-3 |
| 5 | Deadline-aware intelligence | ModePicker nudges, context builder, FSRS priority, auto-suggest | Phases 1-4 |

Phases 2 and 3 can run in parallel after Phase 1 completes.

---

## Files Changed (Expected)

### New files
- `src-tauri/migrations/003_assignments.sql`
- `src/lib/syllabusParser.js`
- `src/components/ScheduleView.jsx` — full cross-course deadline drill-down
### Modified files
- `src/lib/db.js` — add `Assignments` module, update migration runner
- `src/lib/skills.js` — refactor `decomposeAssignments()` to use new tables + placeholder matching
- `src/lib/study.js` — add deadline context to `buildContext()` and `buildFocusedContext()`
- `src/lib/migrate.js` — add 003 migration + blob-to-table data migration
- `src/StudyContext.jsx` — replace `DB.getAsgn()` calls, load schedule data, deadline state, exam scope resolution
- `src/components/study/ModePicker.jsx` — deadline nudge banner, assignment sort by due date, exam scope auto-select
- `src/screens/HomeScreen.jsx` — per-course info bars (deadline counts, exam proximity, overdue warnings, placeholder alerts)
- `src/screens/MaterialsScreen.jsx` — date picker on assignment material cards
- `src/screens/UploadScreen.jsx` — placeholder matching on assignment upload

### Not changed
- `src/lib/fsrs.js` — FSRS algorithm untouched per CEO standing directive
- `src-tauri/migrations/001_v2_schema.sql` — existing schema not modified
- `src-tauri/migrations/002_skill_extraction_v2.sql` — existing schema not modified

---

## Resolved Design Decisions

1. **Schedule view location** — Per-course info bars integrated directly into HomeScreen course cards (deadline counts, next exam, overdue warnings). Tapping drills into a full cross-course schedule view. No separate screen — the info lives where the student already looks.

2. **Exam tracking and scope** — Exams live in `course_schedule.exams` (no separate table). Exam entries from syllabus parsing include coverage info ("covers weeks 1-6") which maps to `course_schedule` rows with topics and readings. The exam prep picker auto-selects materials aligned with covered weeks. Student can adjust scope in the picker. Readiness % computed from skills in those materials.

3. **Re-parsing syllabi** — Professors don't typically reissue syllabi. Date changes are communicated verbally or via email/LMS. The manual due date edit affordance on assignment materials handles this. If a student does upload a new syllabus, it overwrites the schedule with a notification.

4. **Assignment-material linking** — Syllabus parsing creates **placeholder assignments** (`source = 'syllabus'`, `material_id = null`) for every assignment found in the schedule. These appear in the schedule view as "HW 3 due Thursday — no materials uploaded." When the student uploads the actual assignment file, the app matches by title and links the material. If no match, student can manually associate. Placeholders surface gaps: "the syllabus says 8 homeworks exist, you've uploaded 5."
---

## Open Questions (Remaining)

1. **Ambiguous assignment matching** — when a student uploads "homework4.docx" and there are placeholders for both "HW 4" and "Assignment 4", how aggressive should the auto-match be? Current plan: auto-match on high confidence (single match after normalization), prompt the student on ambiguous matches. Worth testing with real syllabi to calibrate.

2. **Exam readiness computation** — HomeScreen info bars show **average readiness** across all skills in the exam scope as a single headline number (e.g., "Midterm in 9 days — readiness 51%"). When the student taps into the exam detail view, they see the **full skill breakdown**: each required skill with its individual mastery %, sorted weakest-first, so they know exactly where to focus. This matches the existing pattern in the assignment picker (overall readiness in the card header, per-skill breakdown in the expanded view).

---

## What This Does NOT Change

- FSRS algorithm parameters — untouched per CEO directive
- Session intent modes — same 5 modes, just smarter about which one to suggest
- Skill extraction pipeline — unchanged
- Assignment decomposition LLM prompt — only addition is stronger `dueDate` extraction language
- Core tutoring philosophy — teach to derive, never give answers
- Local-first architecture — all data stays on device