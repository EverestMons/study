# Assignment Curriculum Dashboard — Development Log
**Date:** 2026-03-12
**Project:** study
**Orchestrator:** `docs/planning/assignment-activation-orchestrator-final.md`
**Status:** All 4 phases complete (Phase 1.5 handled by Facet Architecture)

---

## Phase 1: Schema + DB Methods (Migration 006)

**Agent:** SA → DEV
**Output:** `006_assignment_activation.sql`, 8 new Assignments methods
**Architecture:** `knowledge/architecture/assignment-curriculum-schema-2026-03-12.md`

Migration 006: `study_active INTEGER NOT NULL DEFAULT 0` on assignments table + partial index on `(course_id, study_active) WHERE study_active = 1`.

New Assignments methods: `setStudyActive`, `bulkSetStudyActive`, `getCurriculum` (Q1 — 6-table join assembling nested structure), `getChunksForSkill` (Q2), `getCompletedSkills` (Q3), `getReviewDueSkills` (Q4), `getCurriculumSummary` (summary stats), `markSubmitted` (atomic status='submitted' + study_active=0).

## Phase 2: Activation UI (ScheduleScreen)

**Agent:** UXD → DEV
**Output:** Updated ScheduleScreen.jsx (+147 lines)

Activation toggles on assignment cards — active (accent border), inactive (dimmed), completed (checkmark). Summary bar at top: "N active, M skills to master, X% ready" from `getCurriculumSummary()`. "Mark as Submitted" button with inline confirmation. Toggles wired to `setStudyActive()` with optimistic UI update.

## Phase 3: CurriculumScreen

**Agent:** UXD → SA → DEV
**Output:** CurriculumScreen.jsx (496 lines)

Full curriculum dashboard with hierarchical breakdown: assignment → question → skill/facet. 12 enhancements implemented:
1. "Study This Skill" button per expanded skill
2. Amber gap detection warning for skills with zero chunk bindings
3. Chunk rows show material name + binding type badge
4. Untested skills show "New" label instead of "0%"
5. "Ready to submit" / "Highly prepared" banners at readiness ≥ 0.6/0.8
6. "Mark as Submitted" inline confirmation (Are you sure? [Yes] [Cancel])
7. "Decompose Now" trigger for 0-question assignments with `decomposeAssignments` integration
8. No-materials prompt ("Upload course materials first" + Go to Materials)
9. Parent badge from conceptKey on skill rows
10. Review due count per assignment header
11. Gap warning red background on skills with 0 chunks + low strength
12. Re-query on return from study session (natural unmount/remount)

Progressive disclosure: assignments collapsed by default, questions expand on click, skills expand to show chunk bindings. Lazy chunk loading with cache via `getChunksForSkill()`.

Study entry actions: "Study This Skill" → `bootWithFocus` with facet + linked chunks via graph-traversal context builder. "Study Weakest" → lowest-readiness facet across active assignments. "Study [Question]" → sequences through question's facets weakness-first. "Start Review" → FSRS review for completed-assignment skills.

Review section: completed assignments with due count per header, "Start Review" action. "You're current!" state when no active assignments and no reviews due.

## Phase 4: Integration & Polish

**Agent:** DEV
**Output:** Updated HomeScreen.jsx (+50 lines)

`getCourseState()` function in HomeScreen determines course state: no-materials, no-assignments, none-active, active, reviews-due, current. Routes clicks to appropriate screen. Curriculum summary row on course cards ("N active assignments · M skills · K due") — tappable, navigates to CurriculumScreen. State machine nudge labels color-coded by state (amber for reviews-due, green for current, muted for upload prompts). `getCurriculumSummary()` DB method parallelized with existing schedule/assignment queries via `Promise.all`.

## Files Changed Summary

| File | Changes |
|---|---|
| db.js | +98 lines — 8 new Assignments methods, migration 006 |
| ScheduleScreen.jsx | +147 lines — activation toggles, summary bar, submitted button |
| CurriculumScreen.jsx | New file (496 lines) |
| HomeScreen.jsx | +50 lines — state machine, curriculum summary |
| ScreenRouter.jsx | +4 lines — curriculum route |
| StudyContext.jsx | +12 lines — curriculum-related state |
