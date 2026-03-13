# Assignment Curriculum Dashboard — QA Report
**Date:** 2026-03-12
**Project:** study
**Orchestrator:** `docs/planning/assignment-activation-orchestrator-final.md`
**Phases Tested:** 1-4

---

## Phase 1: Schema + DB Methods

| # | Test | Result |
|---|---|---|
| 1 | Migration 006 applies cleanly (study_active column added) | PASS |
| 2 | Partial index created on (course_id, study_active) WHERE study_active = 1 | PASS |
| 3 | Existing assignments default to study_active = 0 | PASS |
| 4 | `setStudyActive` toggles flag correctly | PASS |
| 5 | `bulkSetStudyActive` batch toggle within transaction | PASS |
| 6 | `getCurriculum` returns nested assignment→question→skill structure | PASS |
| 7 | `getCurriculum` empty result when no active assignments | PASS |
| 8 | `getChunksForSkill` returns chunks ordered by confidence | PASS |
| 9 | `getCompletedSkills` returns skills from submitted/graded assignments | PASS |
| 10 | `getReviewDueSkills` filters by next_review_at ≤ now | PASS |
| 11 | `getCurriculumSummary` returns correct counts | PASS |
| 12 | `markSubmitted` atomically sets status + study_active | PASS |

## Phase 2: Activation UI (ScheduleScreen)

| # | Test | Result |
|---|---|---|
| 13 | Activation toggle visible on assignment cards | PASS |
| 14 | Toggle persists to database (study_active column) | PASS |
| 15 | Active state shows accent border/highlight | PASS |
| 16 | Inactive state dimmed | PASS |
| 17 | Completed state shows checkmark | PASS |
| 18 | Summary bar shows active count, skill count, readiness % | PASS |
| 19 | "Mark as Submitted" confirmation dialog works | PASS |
| 20 | Submitted assignment auto-deactivates (study_active → 0) | PASS |

## Phase 3: CurriculumScreen

| # | Test | Result |
|---|---|---|
| 21 | CurriculumScreen renders when active assignments exist | PASS |
| 22 | Assignment cards show due date, urgency, readiness % | PASS |
| 23 | Question sections collapsible, show skill count + readiness | PASS |
| 24 | Skill rows show name, parent badge, mastery bar, readiness % | PASS |
| 25 | Expanded skill shows chunk bindings with material name + type badge | PASS |
| 26 | Gap detection: amber warning on zero-chunk skills | PASS |
| 27 | Untested skills show "New" instead of "0%" | PASS |
| 28 | "Ready to submit" banner at readiness ≥ 0.6 | PASS |
| 29 | "Highly prepared" banner at readiness ≥ 0.8 | PASS |
| 30 | "Study This Skill" launches study session via bootWithFocus | PASS |
| 31 | "Study Weakest" selects lowest-readiness facet | PASS |
| 32 | "Study [Question]" sequences through question's facets | PASS |
| 33 | "Decompose Now" triggers decomposeAssignments inline | PASS |
| 34 | No-materials state shows prompt + "Go to Materials" | PASS |
| 35 | Review section shows completed assignments + due count | PASS |
| 36 | "Start Review" action launches FSRS review session | PASS |
| 37 | "You're current!" state when no active + no reviews due | PASS |
| 38 | Lazy chunk loading with cache (no re-query on re-expand) | PASS |
| 39 | Curriculum re-queries on return from study session | PASS |
| 40 | "Mark as Submitted" inline confirmation works from dashboard | PASS |

## Phase 4: Integration & Polish

| # | Test | Result |
|---|---|---|
| 41 | HomeScreen shows curriculum summary on course cards | PASS |
| 42 | Summary row tappable — navigates to CurriculumScreen | PASS |
| 43 | State machine: no materials → routes to Materials | PASS |
| 44 | State machine: no assignments → routes to Materials | PASS |
| 45 | State machine: none active → routes to Schedule | PASS |
| 46 | State machine: active assignments → routes to Curriculum | PASS |
| 47 | State machine: reviews due → routes to Curriculum | PASS |
| 48 | State machine: all current → routes to Curriculum | PASS |
| 49 | Nudge labels color-coded correctly (amber/green/muted) | PASS |
| 50 | `getCurriculumSummary` parallelized with schedule queries | PASS |

## Regression Testing

| # | Flow | Result |
|---|---|---|
| 51 | Material upload + auto-extraction | PASS |
| 52 | Assignment decomposition | PASS |
| 53 | Chat / tutoring (all 5 modes) | PASS |
| 54 | Practice mode | PASS |
| 55 | Profile view (character sheet) | PASS |
| 56 | Schedule screen (without activation) | PASS |
| 57 | Folder import | PASS |
| 58 | Settings + API key | PASS |

## Summary

- **Total tests:** 58
- **Pass:** 58
- **Fail:** 0
- **Critical findings:** 0
- **Build verified:** Yes
- **No regressions** — all existing features work unchanged when no assignments are activated
