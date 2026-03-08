# Assignment Scheduler — Orchestrator Plan

**Date:** 2026-03-08
**Spec Reference:** `docs/planning/assignment-scheduler-spec.md`
**Project:** study
**Status:** Ready for execution

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **UXD** | Study UX Designer | Design & Experience |
| **UXV** | Study UX Validator | Design & Experience — Validation |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

5 phases, executed sequentially (Phases 2-3 can parallel after Phase 1).
Each phase follows the standard flow: **SA** → **DEV** → **QA** → **UXV** (where applicable).
**UXD** front-runs phases that introduce new UI.
**PM** updates PROJECT_STATUS.md after each phase.
---

## Phase 1 — Assignment Table Migration (003)

### Step 1.1 · SA · Architecture Blueprint

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/assignment-table-migration-2026-03-XX.md`

Design the migration 003 architecture:
- Final SQL schema for `assignments`, `assignment_questions`, `assignment_question_skills` tables with all indexes and foreign keys
- `Assignments` DB module API: full method signatures, return shapes, query patterns
- `normalizeAssignmentTitle()` specification — exact normalization rules for placeholder matching
- Data migration strategy: blob-to-table conversion flow, edge cases (orphaned skill IDs, empty blobs)
- Call site migration map: current `saveAsgn`/`getAsgn` → new `Assignments` methods, with exact locations and expected return shape changes
- Migration impact assessment: additive only (new tables), no existing tables modified

**Decisions within authority:** Schema design, API shape, query patterns
**Escalate:** Confirm migration 003 numbering is correct (CEO approved migration 003 for this purpose in spec)

**Handoff → DEV:** Blueprint file in `knowledge/architecture/`

### Step 1.2 · DEV · Write Migration SQL

**Agent:** Study Developer
**Input:** Architecture blueprint from Step 1.1**Output:** `src-tauri/migrations/003_assignments.sql`

Create the migration file exactly per the blueprint. Verify SQL syntax, foreign key references, and index names don't collide with existing migrations.

**Verify:** App starts cleanly with fresh DB. `PRAGMA table_info(assignments)` shows all columns.

### Step 1.3 · DEV · Implement Assignments DB Module

**Agent:** Study Developer
**Input:** API spec from Step 1.1 blueprint

**File:** `src/lib/db.js`

Implement the full `Assignments` module after the existing `CourseSchedule` section (~line 300). Also implement `CourseAssessments` module (table exists from migration 001, needs JS CRUD). Add `normalizeAssignmentTitle()` helper.

Follow existing code patterns: use `withTransaction` for writes, `uuid()` for IDs, `now()` for timestamps, `jsonParse()` for JSON fields.

**Output:** `knowledge/development/phase1-assignments-db-module-2026-03-XX.md`

### Step 1.4 · DEV · Blob Data Migration

**Agent:** Study Developer
**Input:** Migration strategy from Step 1.1 blueprint
**File:** `src/lib/migrate.js`

Add `migrateAssignmentBlobs()` function:
1. For each course, read `DB.getAsgn(courseId)`
2. If blob exists: create `Assignments` rows + `assignment_questions` + `assignment_question_skills`3. Verify skill IDs exist before inserting question-skill mappings
4. Delete blob key after confirmed migration

Wire into boot sequence (wherever `migrateV1ToV2` is called or in StudyContext init).

### Step 1.5 · DEV · Update Call Sites

**Agent:** Study Developer
**Input:** Call site map from Step 1.1 blueprint

Update 5 call sites across 2 files:

**`src/lib/skills.js` — `decomposeAssignments()`:**
- Replace `DB.saveAsgn(courseId, asgnArray)` with `Assignments.create()` + `Assignments.saveQuestions()` per assignment
- Add `scanForDueDate()` regex pass on raw assignment text before saving
- Add `Assignments.findPlaceholderMatch()` call to link to syllabus placeholders when they exist
- Remove both `DB.saveAsgn()` calls (success + empty paths)

**`src/StudyContext.jsx`:**
- `selectMode("assignment")` path (~line 528): `DB.getAsgn()` → `Assignments.getByCourse()`
- Retry decomposition path (~line 536): same replacement
- `bootWithFocus` context path (~line 721): same replacement

### Step 1.6 · DEV · Remove Dead V1 Code

**Agent:** Study Developer
**File:** `src/lib/db.js`

Remove `saveAsgn` and `getAsgn` from V1_COMPAT section. Verify: `grep -r "saveAsgn\|getAsgn" src/` returns zero.

**Output:** `knowledge/development/phase1-assignment-migration-2026-03-XX.md` (dev log covering Steps 1.2–1.6)
### Step 1.7 · QA · Migration & Regression Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed implementation from Steps 1.2–1.6

Test scope:
- **Migration correctness:** Fresh DB → 003 applies cleanly. Existing DB with blob data → migration converts correctly. Verify foreign key constraints work (delete course → cascade deletes assignments).
- **Blob data integrity:** Confirm all questions and skill mappings survive migration. Spot-check skill IDs resolve to real sub_skills.
- **Call site regression:** Assignment picker loads correctly. Assignment decomposition writes to new tables. Chat context builder reads assignment data. Practice-from-assignment flow works.
- **Edge cases:** Empty blob, blob with null dueDate, blob with deleted skill IDs, course with no assignments.

**Severity auto-classification:**
- Migration data loss → 🔴 Critical (HALT)
- Skill ID orphaning → 🟡 Minor
- Display issues in picker → 🟡 Minor

**Output:** `knowledge/qa/phase1-assignment-migration-testing-2026-03-XX.md`

### Step 1.8 · PM · Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "Assignment table migration" from "Specified But Not Built" to "What Is Working"
- Add migration 003 to the Skill Architecture Redesign Progress table
- Update Development department last activity date
- Note: `saveAsgn`/`getAsgn` V1 compat code removed
### Phase 1 Checkpoint

Before proceeding:
- [ ] SA blueprint deposited in `knowledge/architecture/`
- [ ] DEV implementation complete, dev log deposited
- [ ] QA testing report deposited — no 🔴 Critical findings
- [ ] PM status updated
- [ ] No regressions: assignment mode, practice, chat context all work

---

## Phase 2 — Syllabus Parsing Pipeline

### Step 2.1 · SA · Syllabus Parser Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/syllabus-parser-2026-03-XX.md`

Design the syllabus parsing architecture:
- `syllabusParser.js` module interface: `parseSyllabus()`, `validateSchedule()`, `scanForDueDate()`
- LLM prompt design: exact prompt text with JSON output schema (from spec)
- Deterministic validation rules: date sequential check, week continuity, grading sum, confidence scoring algorithm
- Data flow: syllabus text → LLM → validation → `course_schedule` writes → `course_assessments` writes → course metadata backfill → placeholder assignment creation
- Integration point: where in the upload pipeline the parser hooks in (after material text is available, parallel to skill extraction)
- Exam scope parsing: how `coversWeeks` maps to `course_schedule` rows- Error handling: what happens when LLM returns unparseable JSON, when dates are nonsensical, when syllabus has no schedule table

**Handoff → DEV:** Blueprint file in `knowledge/architecture/`

### Step 2.2 · DEV · Implement syllabusParser.js

**Agent:** Study Developer
**Input:** Architecture blueprint from Step 2.1

**Create:** `src/lib/syllabusParser.js`

Implement `parseSyllabus()`, `validateSchedule()`, `scanForDueDate()` per blueprint. Use existing `callClaude()` from `api.js` and `extractJSON()` from extraction helpers.

### Step 2.3 · DEV · Wire Upload Auto-Trigger + Placeholder Creation

**Agent:** Study Developer
**Input:** Integration point from Step 2.1 blueprint

In the material upload processing flow (StudyContext or wherever upload completion is handled):
- Add syllabus detection: `if (material.classification === "syllabus")`
- Call `parseSyllabus()` with concatenated chunk text
- Write to `course_schedule`, `course_assessments` via DB modules
- Backfill course metadata via `Courses.update()`
- Create placeholder `Assignments` for each `assignmentsDue` entry
- Set `courses.syllabus_parsed = 1`
- Fire notification

**Output:** `knowledge/development/phase2-syllabus-parsing-2026-03-XX.md`

### Step 2.4 · QA · Syllabus Parsing Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed implementation from Steps 2.2–2.3

Test scope:- **Happy path:** Upload a well-structured syllabus (PDF, DOCX). Verify schedule, assessments, metadata, and placeholders all populate correctly.
- **Malformed input:** Upload a syllabus with no dates, no schedule table, no grading breakdown. Verify graceful fallback with low confidence, no crash.
- **LLM failure:** Simulate unparseable LLM response. Verify app doesn't break, notification warns user.
- **Duplicate upload:** Upload same syllabus twice. Verify `clearForCourse` prevents duplicate schedule rows. Verify placeholder assignments aren't duplicated.
- **Placeholder integrity:** Verify placeholders have `source='syllabus'`, `material_id=NULL`, correct due dates from schedule weeks.
- **Course metadata:** Verify backfilled fields don't overwrite user-entered data (if any exists).

**Output:** `knowledge/qa/phase2-syllabus-parsing-testing-2026-03-XX.md`

### Step 2.5 · PM · Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Add syllabus parsing to "What Is Working"
- Note placeholder assignment system is live
- Update department activity dates

### Phase 2 Checkpoint

- [ ] SA blueprint deposited
- [ ] DEV implementation + dev log deposited
- [ ] QA testing report — no 🔴 Critical
- [ ] PM status updated
- [ ] Syllabus upload populates schedule, assessments, metadata, and placeholders

---

## Phase 3 — Due Dates on Assignments + Edit Affordance
### Step 3.1 · UXD · Date Picker & Assignment Picker Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/assignment-due-date-ux-2026-03-XX.md`

Design direction for:
- Date picker affordance on assignment material cards: placement, interaction pattern, empty state ("No due date"), visual treatment
- Assignment picker sort-by-due-date layout: how soonest-first ordering works with the existing expandable card design
- Urgency color scheme: exact thresholds and colors for <48h, <7d, >7d — must work within the existing dark theme
- Due date display format: relative ("in 2 days") vs absolute ("Oct 11") vs both

**Escalate to CEO:** Color choices and visual treatment (aesthetic decisions)
**Handoff → DEV:** Design direction in `knowledge/design/`

### Step 3.2 · DEV · Implement Date Picker on Material Cards

**Agent:** Study Developer
**Input:** UX design from Step 3.1
**File:** `src/screens/MaterialsScreen.jsx`

For material cards where `classification === 'assignment'`:
- Look up corresponding assignment record by `materialId`
- Show due date or "No due date"
- Add `<input type="date">` picker on click
- On change: `Assignments.updateDueDate(assignmentId, epoch)`
- On clear: `Assignments.updateDueDate(assignmentId, null)`

### Step 3.3 · DEV · Sort & Color-Code Assignment Picker
**Agent:** Study Developer
**Input:** UX design from Step 3.1
**File:** `src/components/study/ModePicker.jsx`

In the assignment picker (`pickerData.mode === "assignment"` branch):
- Sort `pickerData.items` by `dueDate` ascending, nulls last
- Apply urgency color to due date display per UXD thresholds

**Output:** `knowledge/development/phase3-due-dates-2026-03-XX.md`

### Step 3.4 · QA · Due Date Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- Set, change, clear due date on material card → persists across app restart
- Assignment picker sorts correctly with mixed dates and nulls
- Urgency colors render correctly at each threshold
- Date picker doesn't break on invalid inputs or timezone edge cases

**Output:** `knowledge/qa/phase3-due-date-testing-2026-03-XX.md`

### Step 3.5 · UXV · Date Picker Validation

**Agent:** Study UX Validator
**Input:** Implemented UI from Steps 3.2–3.3, design direction from Step 3.1

Validate:
- Date picker discoverable? Does a student know they can set a due date?
- Assignment sort order intuitive? Does soonest-first make sense without explanation?
- Urgency colors meaningful? Can a student distinguish "urgent" from "upcoming" at a glance?
- Null state clear? Does "No due date" communicate that the student can add one?
**Output:** `knowledge/design/validation/phase3-due-date-validation-2026-03-XX.md`

### Step 3.6 · PM · Status Update

**Agent:** Study Product Analyst
Update `PROJECT_STATUS.md`: add due date editing and assignment picker sorting to "What Is Working."

### Phase 3 Checkpoint

- [ ] UXD design direction deposited
- [ ] DEV implementation + dev log deposited
- [ ] QA testing report — no 🔴 Critical
- [ ] UXV validation report deposited
- [ ] PM status updated
- [ ] Due dates settable, editable, and visible in picker with urgency colors

---

## Phase 4 — Schedule UI

### Step 4.1 · UXD · Schedule View & HomeScreen Info Bar Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/schedule-ui-2026-03-XX.md`

Design direction for:
- **HomeScreen per-course info bars:** Layout within existing course cards. What info to show (due counts, exam proximity, overdue flags, placeholder warnings). How it integrates with the existing card design without making it cluttered.
- **Full schedule drill-down (ScheduleView):** Section layout (This Week, Next Week, Later, Not Yet Uploaded, Past Due). Item card design for assignments, exams, and placeholders. How readiness % is displayed per item.- **Exam drill-down:** Expanded view with overall readiness + skill breakdown sorted weakest-first. "Start exam prep" button placement.
- **Navigation pattern:** How the user gets from HomeScreen → ScheduleView → specific course/mode. Back navigation.
- **Empty states:** What shows when no syllabi parsed, no deadlines exist, no exams scheduled.

**Escalate to CEO:** Visual treatment, card styling, how info bars affect the HomeScreen aesthetic
**Handoff → SA + DEV:** Design direction in `knowledge/design/`

### Step 4.2 · SA · Schedule Data Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/schedule-ui-data-2026-03-XX.md`

Design the data flow for the schedule UI:
- What state `StudyContext` needs to hold for schedule data (cross-course assignments, exams, placeholders)
- When and how schedule data loads (boot? on-demand? cached?)
- How readiness % is computed for assignments (average mastery across question skills) and exams (average mastery across all skills from covered weeks)
- How exam scope resolution works: `course_schedule.exams` → `coversWeeks` → schedule rows → readings → material matching
- `ScheduleView` component data contract: what props/context it consumes
- `HomeScreen` info bar data: computation per course, where it happens (in context? in component?)

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 4.3 · DEV · Schedule Data Loading in StudyContext

**Agent:** Study Developer
**Input:** Architecture blueprint from Step 4.2
**File:** `src/StudyContext.jsx`
Add `scheduleData` state and loading logic per blueprint. Expose through context provider.

### Step 4.4 · DEV · HomeScreen Info Bars

**Agent:** Study Developer
**Input:** UX design from Step 4.1, data architecture from Step 4.2
**File:** `src/screens/HomeScreen.jsx`

Add per-course info bar below existing material count in each course card. Compute due counts, overdue flags, exam proximity, placeholder warnings from `scheduleData`.

### Step 4.5 · DEV · ScheduleView Component + Navigation

**Agent:** Study Developer
**Input:** UX design from Step 4.1, data architecture from Step 4.2

**Create:** `src/components/ScheduleView.jsx`
**Modify:** `src/screens/HomeScreen.jsx` (add "View all deadlines" link), `src/ScreenRouter.jsx` (add `screen === "schedule"` route)

Build the full cross-course schedule view with all 5 sections. Wire tap interactions to navigate to correct course + mode.

**Output:** `knowledge/development/phase4-schedule-ui-2026-03-XX.md`

### Step 4.6 · QA · Schedule UI Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- **Data accuracy:** Info bar counts match actual assignment data. Readiness % matches skill mastery. Exam scope maps to correct weeks.
- **Empty states:** No syllabi → no info bars (or "No upcoming deadlines"). No assignments → schedule view shows empty message.
- **Navigation:** Tap assignment → correct course + assignment mode. Tap exam → correct course + exam prep. Tap placeholder → upload screen. Back → HomeScreen.- **Edge cases:** Course with 0 assignments. Course with 20 assignments (layout overflow). Placeholder with past due date. Exam with no coverage info.

**Output:** `knowledge/qa/phase4-schedule-ui-testing-2026-03-XX.md`

### Step 4.7 · UXV · Schedule UI Validation

**Agent:** Study UX Validator
**Input:** Implemented UI from Steps 4.4–4.5, design direction from Step 4.1

Validate:
- HomeScreen info bars: Do they communicate urgency without overwhelming? Is the info scannable?
- ScheduleView: Can a student find what's due this week in <3 seconds? Is the "Not Yet Uploaded" section noticeable?
- Exam drill-down: Is the skill breakdown useful? Can a student identify their weakest area?
- Navigation: Is it obvious how to get to the schedule view? Is back navigation clear?
- Empty states: Do they guide the student toward uploading a syllabus?

**Output:** `knowledge/design/validation/phase4-schedule-ui-validation-2026-03-XX.md`

### Step 4.8 · PM · Status Update

**Agent:** Study Product Analyst
Update `PROJECT_STATUS.md`: add schedule UI, HomeScreen info bars, and ScheduleView to "What Is Working."

### Phase 4 Checkpoint

- [ ] UXD design direction deposited
- [ ] SA data architecture blueprint deposited
- [ ] DEV implementation + dev log deposited
- [ ] QA testing report — no 🔴 Critical
- [ ] UXV validation report deposited
- [ ] PM status updated
- [ ] HomeScreen shows per-course deadline info
- [ ] ScheduleView shows all 5 sections with working navigation
---

## Phase 5 — Deadline-Aware Intelligence

### Step 5.1 · UXD · Deadline Nudge & Auto-Suggestion Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/deadline-intelligence-ux-2026-03-XX.md`

Design direction for:
- **ModePicker deadline nudge banner:** Visual treatment, placement above mode buttons, dismissibility, urgency tiers. How it behaves when multiple assignments are due (show most urgent? stack?).
- **Skill picker urgency badges:** How "Needed for HW 5 (due in 3d)" displays alongside existing skill cards. Sorting: deadline-relevant skills to top vs integrated into existing weakest-first.
- **Session auto-suggestion:** How the pre-highlighted mode looks (not forced, just visually emphasized). When it triggers (threshold: <3 days + <50% readiness).

**Escalate to CEO:** Visual treatment of nudge banner (aesthetic)
**Handoff → SA + DEV:** Design direction in `knowledge/design/`

### Step 5.2 · SA · Deadline Intelligence Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/deadline-intelligence-2026-03-XX.md`

Design:
- `buildDeadlineContext()` function spec: inputs (courseId, assignments, skills), output (context string), computation logic (nearest 3 deadlines, weakest skills per deadline)
- Where `buildDeadlineContext()` is called in `buildContext()` and `buildFocusedContext()` — exact insertion point in the prompt
- FSRS priority boost: how deadline-relevant skills are identified, how the boost surfaces them without changing FSRS intervals
- Exam scope auto-selection: how `selectMode("exam")` pre-populates `pickerData.selectedMats` from `course_schedule.coversWeeks` → readings → material matching logic- ModePicker nudge data: what computation determines "most urgent assignment" for the banner

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 5.3 · DEV · ModePicker Deadline Nudge

**Agent:** Study Developer
**Input:** UX design from Step 5.1, architecture from Step 5.2
**File:** `src/components/study/ModePicker.jsx`

Add deadline nudge banner at top of main mode picker. Load upcoming assignments for active course from `scheduleData`, find most urgent, compute readiness, render banner per UXD design.

### Step 5.4 · DEV · Deadline Context in AI Prompts

**Agent:** Study Developer
**Input:** Architecture from Step 5.2
**File:** `src/lib/study.js`

Implement `buildDeadlineContext()` helper. Insert its output into `buildContext()` and `buildFocusedContext()` at the specified insertion point.

### Step 5.5 · DEV · Skill Picker Priority + Exam Auto-Scope

**Agent:** Study Developer
**Input:** Architecture from Step 5.2, UX design from Step 5.1

**File:** `src/components/study/ModePicker.jsx` — skill picker section
- Identify deadline-relevant skills, sort to top, add urgency badges

**File:** `src/StudyContext.jsx` — `selectMode("exam")` path
- Load exam coverage from `course_schedule`, match to materials, pre-populate `pickerData.selectedMats`

**Output:** `knowledge/development/phase5-deadline-intelligence-2026-03-XX.md`
### Step 5.6 · QA · Deadline Intelligence Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- **Nudge accuracy:** Banner shows correct assignment, days remaining, readiness. Disappears when no assignments due within 7 days. Correct behavior when multiple assignments are due.
- **AI context:** System prompt includes DEADLINE CONTEXT with correct data. Verify context doesn't include stale/wrong deadlines.
- **Skill prioritization:** Deadline-relevant skills appear at top of skill picker. Non-deadline skills still accessible. Priority doesn't corrupt FSRS mastery display.
- **Exam auto-scope:** Materials pre-selected match coverage weeks. Student can deselect. Works when no coverage info exists (falls back to manual selection).
- **FSRS integrity:** Confirm FSRS algorithm is untouched — priority boost is display-only, not modifying difficulty/stability/retrievability values.

**Output:** `knowledge/qa/phase5-deadline-intelligence-testing-2026-03-XX.md`

### Step 5.7 · UXV · Deadline Intelligence Validation

**Agent:** Study UX Validator
**Input:** Implemented UI from Steps 5.3–5.5, design direction from Step 5.1

Validate:
- Nudge banner: Helpful or annoying? Does dismissing it feel natural? Does it create pressure without being stressful?
- Skill picker: Are urgency badges helpful for deciding what to study? Or do they distract from the existing weakest-first logic?
- Exam auto-scope: Is it obvious the materials are pre-selected? Does the student trust the auto-selection?
- Auto-suggestion: Does the pre-highlighted mode feel like a suggestion or a command?
- **Learning science risk:** Does deadline urgency cause students to cram instead of spacing? Does the nudge undermine the FSRS review schedule?
**Output:** `knowledge/design/validation/phase5-deadline-intelligence-validation-2026-03-XX.md`

### Step 5.8 · PM · Final Status Update

**Agent:** Study Product Analyst

Final `PROJECT_STATUS.md` update:
- Add all Phase 5 features to "What Is Working"
- Remove assignment scheduler from "Specified But Not Built"
- Update all department last activity dates
- Add to Recent Development Activity table
- Update Codebase Summary (new files, updated LOC)

### Phase 5 Checkpoint

- [ ] UXD design direction deposited
- [ ] SA architecture blueprint deposited
- [ ] DEV implementation + dev log deposited
- [ ] QA testing report — no 🔴 Critical, FSRS integrity confirmed
- [ ] UXV validation report — learning science risk assessed
- [ ] PM final status updated
- [ ] Feature complete: deadlines visible, AI aware, skills prioritized, exams scoped

---

## Post-Execution Summary

### Knowledge Artifacts Created (by department)

| Department | Files |
|---|---|
| Architecture | `assignment-table-migration`, `syllabus-parser`, `schedule-ui-data`, `deadline-intelligence` |
| Development | `phase1-assignment-migration`, `phase2-syllabus-parsing`, `phase3-due-dates`, `phase4-schedule-ui`, `phase5-deadline-intelligence` |
| Design | `assignment-due-date-ux`, `schedule-ui`, `deadline-intelligence-ux` || Design Validation | `phase3-due-date-validation`, `phase4-schedule-ui-validation`, `phase5-deadline-intelligence-validation` |
| QA | `phase1-migration-testing`, `phase2-syllabus-testing`, `phase3-due-date-testing`, `phase4-schedule-ui-testing`, `phase5-deadline-intelligence-testing` |

### Agent Involvement Per Phase

| Phase | SA | DEV | UXD | UXV | QA | PM |
|---|---|---|---|---|---|---|
| 1 — Migration | Blueprint | Implement (5 steps) | — | — | Migration + regression | Status |
| 2 — Syllabus | Blueprint | Implement (2 steps) | — | — | Parsing failure modes | Status |
| 3 — Due Dates | — | Implement (2 steps) | Date picker + picker design | Validate picker UX | Date handling | Status |
| 4 — Schedule UI | Data architecture | Implement (3 steps) | HomeScreen + ScheduleView design | Validate schedule UX | Data accuracy + navigation | Status |
| 5 — Intelligence | Deadline context arch | Implement (3 steps) | Nudge + badge design | Validate nudge UX + learning science risk | FSRS integrity + accuracy | Final status |

### KNOWLEDGE_INDEX.md Update

**Agent:** Study Documentation Analyst (or PM)
After all phases: update `knowledge/KNOWLEDGE_INDEX.md` with all new files deposited during execution.