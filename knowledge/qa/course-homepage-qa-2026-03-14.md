# Course Homepage + ModePicker Elimination — QA Report

**Date:** 2026-03-14
**Agent:** Study Security & Testing Analyst
**Step:** 4 of 4 (Full Feature Verification)
**Build:** 179 modules, 1.81s (`npx vite build --mode development`)

---

## Test Results

### Course Homepage (Tests 1-4)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Click course from home → lands on CourseHomepage | PASS | `HomeScreen.jsx:58` — `setActive(c); setScreen("courseHome")`. `ScreenRouter.jsx:64` — `screen === "courseHome" && active` → `<CourseHomepage />` |
| 2 | 6 cards visible in 3x2 grid, no scrolling | PASS | `CourseHomepage.jsx:169-171` — `gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)"`. 6 cards defined in `cards` array (lines 108-145). Outer container `overflow: "hidden"` (line 159) |
| 3 | Cards show contextual subtitles with live data | PASS | `CourseHomepage.jsx:13-106` — `useEffect` loads `Assignments.getByCourse`, `loadSkillsV2`, `CourseSchedule.getByCourse`, `Assignments.getCurriculumSummary` in parallel. Subtitle patterns match blueprint: active/overdue, exam days/readiness, skills/due, curriculum active/skills, materials/sections, week/total |
| 4 | Back button returns to home | PASS | `CourseHomepage.jsx:152` — `setScreen("home")` |

### Card Routing (Tests 5-10)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 5 | Assignment Work → study screen with assignment picker | PASS | `CourseHomepage.jsx:113` — `enterStudy(active, "assignment")`. `StudyContext.jsx:708-742` — `enterStudy` resets state, calls `selectMode("assignment")`. `StudyScreen.jsx:88-93` — renders `<AssignmentPicker />` when `sessionMode === "assignment"` |
| 6 | Exam Review → study screen with exam scope picker | PASS | `CourseHomepage.jsx:119` — `enterStudy(active, "exam")`. `StudyScreen.jsx:92` — renders `<ExamScopePicker />` when `sessionMode === "exam"` |
| 7 | Skill Development → study screen with skill picker | PASS | `CourseHomepage.jsx:125` — `enterStudy(active, "skills")`. `StudyScreen.jsx:91` — renders `<SkillPicker />` when `sessionMode === "skills"` |
| 8 | Curriculum → CurriculumScreen | PASS | `CourseHomepage.jsx:131` — `setScreen("curriculum")`. `ScreenRouter.jsx:71` — routes correctly |
| 9 | Materials → MaterialsScreen | PASS | `CourseHomepage.jsx:137` — `setScreen("materials")`. `ScreenRouter.jsx:68` — routes correctly |
| 10 | Schedule → ScheduleScreen | PASS | `CourseHomepage.jsx:143` — `setScreen("schedule")`. `ScreenRouter.jsx:70` — routes correctly |

### ModePicker Elimination (Tests 11-14)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 11 | ModePicker.jsx no longer exists | PASS | `grep ModePicker src/` — 0 matches. File deleted per dev log |
| 12 | No "select a mode" intermediate screen | PASS | `grep "select a mode" src/` — 0 matches. Study screen renders sub-pickers directly from `sessionMode` |
| 13 | Sub-pickers work identically to before | PASS | Code review: `AssignmentPicker.jsx` preserves urgency colors, readiness %, skill breakdown, date picker, practice buttons. `SkillPicker.jsx` preserves strength %, learn/practice, extraction trigger. `ExamScopePicker.jsx` preserves material checklist with auto-selection. All consume `useStudy()` directly |
| 14 | Deadline nudge handled per blueprint | PASS | Blueprint Section 2 specified: "Eliminate as a standalone banner. Surface urgency via card subtitles." `CourseHomepage.jsx:112,118,124` — urgency signals on card subtitles (red for overdue assignments, amber/red for exam proximity, amber for skills due). No standalone nudge banner |

### Mode Removal (Tests 15-18)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 15 | No recap or explore references in source | PASS | `grep -i '\brecap\b' src/` — 0 matches. `grep -i '\bexplore\b' src/` — 0 matches. `grep '"recap"\|"explore"' src/` — 0 matches |
| 16 | System prompt documents 3 modes only | PASS | `StudyContext.jsx:966-982` — `bootWithFocus` only has branches for `assignment`, `skill`, `exam`. MODE hints: "ASSIGNMENT WORK", "SKILL MASTERY", "EXAM PREPARATION" |
| 17 | Intent weights: only assignment, exam, skills | PASS | `StudyContext.jsx:1041` — `{ assignment: 1.0, exam: 0.8, skills: 1.0 }` |
| 18 | buildFocusedContext: only assignment, skill, exam | PASS | `study.js` `focus.type` branches: line 1290 "assignment", line 1372 "skill", line 1434 "exam". No other branches |

### App-Level Notifications (Tests 19-24)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 19 | "Notifications" text button visible on HomeScreen | PASS | `HomeScreen.jsx:27` — `<TopBarButtons />`. `TopBarButtons.jsx:15` — renders `Notifications` text button (no bell icon, no SVG) |
| 20 | "Notifications" text button visible on CourseHomepage | PASS | `CourseHomepage.jsx:156` — `<TopBarButtons />` |
| 21 | "Notifications" text button visible on StudyScreen | PASS | `StudyScreen.jsx:75` — `<TopBarButtons />` |
| 22 | Unread count shows as "(N)" suffix | PASS | `TopBarButtons.jsx:7,15` — `unread = notifs.filter(n => n.time.getTime() > lastSeenNotif).length`. Renders `({unread})` with `color: T.rd` when `unread > 0` |
| 23 | Click notifications → shows notifications | PASS | `TopBarButtons.jsx:11` — `setScreen("notifs"); setLastSeenNotif(Date.now())`. `ScreenRouter.jsx:72` — `screen === "notifs"` → `<NotifsScreen />` (no `active` guard) |
| 24 | Notifications are app-level | PASS | `NotifsScreen.jsx` — no `active.name` in header, no course scoping. `ScreenRouter.jsx:72` — no `&& active` guard. Back goes to `"home"` (line 17) |

### Session Integrity (Tests 25-28)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 25 | Assignment flow end-to-end | PASS | CourseHomepage card → `enterStudy(active, "assignment")` → `selectMode("assignment")` → `AssignmentPicker` renders → user picks → `bootWithFocus({ type: "assignment", assignment: a })` → `focusContext` set → `setAsgnWork` → messages + InputBar appear. `buildFocusedContext` assignment branch (study.js:1290) intact. Back button saves journal + shows SessionSummary |
| 26 | Skills flow end-to-end | PASS | CourseHomepage → `enterStudy(active, "skills")` → `selectMode("skills")` → `SkillPicker` renders → user picks → `bootWithFocus({ type: "skill", skill: s })`. Both Learn and Practice paths preserved identically from original ModePicker |
| 27 | Exam flow end-to-end | PASS | CourseHomepage → `enterStudy(active, "exam")` → `selectMode("exam")` → `ExamScopePicker` renders → material selection → `bootWithFocus({ type: "exam", materials: selected })`. Auto-selection from schedule preserved |
| 28 | FSRS integrity unaffected | PASS | `fsrs.js` — 0 changes (`git diff` returns empty). `applySkillUpdates` in StudyContext unchanged. `effectiveStrength` in study.js unchanged. Only change to study.js: removed recap/explore branches and 'explore' from `loadFacetBasedContent` condition |

### Regression (Tests 29-32)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 29 | All screens accessible from CourseHomepage | PASS | 6 cards: Assignment Work/Exam Review/Skill Development → StudyScreen (via `enterStudy`), Curriculum/Materials/Schedule → direct `setScreen`. All routes verified in ScreenRouter |
| 30 | ProfileScreen accessible from app home | PASS | `HomeScreen.jsx:38` — `setScreen("profile")`. `ScreenRouter.jsx:65` — `screen === "profile"` routes to `<ProfileScreen />` |
| 31 | Build passes | PASS | `npx vite build --mode development` — 179 modules, 1.81s. No errors. Only pre-existing chunk size + dynamic import advisories |
| 32 | No console errors | PASS (static) | No `console.error` calls added in new code. Existing error logging preserved. All imports resolve (verified via build). No missing dependencies |

---

## Findings

### Finding 1: SessionSummary "Done" navigates to "home" instead of "courseHome"

**Severity:** 🟡 Minor

**Location:** `src/components/study/SessionSummary.jsx:191`

**Description:** After completing a study session, the "Done" button in SessionSummary calls `setScreen("home")`, navigating the user to the app-level HomeScreen. With the new CourseHomepage architecture, this should be `setScreen("courseHome")` to maintain course context — consistent with the StudyScreen back button (branches 1 and 3 now go to "courseHome").

**Impact:** User completes a session summary and is sent back to the course list instead of staying within their active course. They must re-click the course to return to CourseHomepage. Not data-affecting, but breaks the navigation flow established by the rest of the restructure.

**Fix:** Change `setScreen("home")` to `setScreen("courseHome")` on line 191 of `SessionSummary.jsx`.

---

### Finding 2: NotifsScreen has redundant Notifications button

**Severity:** 🔵 Advisory

**Location:** `src/screens/NotifsScreen.jsx:20`

**Description:** The blueprint (Section 6) specified that NotifsScreen should NOT have the Notifications button ("NotifsScreen | No (already on this screen)"). However, the implementation places `<TopBarButtons />` on NotifsScreen, which includes the Notifications button. Clicking it while already on NotifsScreen is a benign no-op (resets `lastSeenNotif`, stays on same screen), but it's redundant.

**Impact:** Cosmetic only. No functional issue.

**Non-fix rationale:** Extracting NotifsScreen from the TopBarButtons pattern would add complexity (conditional rendering or a prop) for minimal benefit. Acceptable to leave as-is.

---

### Finding 3: No loading indicator during picker data fetch

**Severity:** 🔵 Advisory

**Location:** `src/screens/StudyScreen.jsx:88-94`

**Description:** When a CourseHomepage card is clicked, `enterStudy(active, mode)` fires, which calls `selectMode(mode)` at line 741. `selectMode` is async — it loads skills, assignments, schedule data, etc. During this loading period, `sessionMode` is set but `pickerData` is still null. The sub-pickers all return `null` when `pickerData` is null, so the user sees a blank study screen until data loads.

**Impact:** Brief flash of empty content before picker appears. Duration depends on DB query speed (typically <500ms locally). This is pre-existing behavior from the original ModePicker and not a regression.

**Non-fix rationale:** Not a regression. Adding a loading spinner would require changes to the picker rendering condition in StudyScreen.

---

## Summary

| Category | Pass | Fail | Findings |
|----------|------|------|----------|
| Course Homepage (1-4) | 4 | 0 | — |
| Card Routing (5-10) | 6 | 0 | — |
| ModePicker Elimination (11-14) | 4 | 0 | — |
| Mode Removal (15-18) | 4 | 0 | — |
| App-Level Notifications (19-24) | 6 | 0 | — |
| Session Integrity (25-28) | 4 | 0 | — |
| Regression (29-32) | 4 | 0 | — |
| **Total** | **32** | **0** | **1 Minor, 2 Advisory** |

**Migration Safety:** N/A — no schema changes, no migrations.

**Verdict:** All 32 tests pass. 1 minor finding (SessionSummary navigation) recommended for fix. 2 advisory findings acceptable to defer.

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** Step 4
**Status:** Complete

### What Was Done
Full QA verification of Course Homepage restructure, ModePicker elimination, recap/explore removal, and app-level notifications across 32 test scenarios. All tests pass. One minor finding identified (SessionSummary "Done" button navigates to "home" instead of "courseHome"). Two advisory findings documented (redundant notifications button on NotifsScreen, no loading indicator during picker fetch).

### Files Deposited
- `study/knowledge/qa/course-homepage-qa-2026-03-14.md` — This QA report

### Files Created or Modified (Code)
- None (QA step — no code changes)

### Decisions Made
- Classified SessionSummary navigation as 🟡 Minor (not 🔴 Critical) because it's a UX inconsistency, not data loss or functional breakage
- Classified NotifsScreen redundant button as 🔵 Advisory — acceptable to leave as-is given complexity tradeoff
- Classified picker loading indicator as 🔵 Advisory — pre-existing behavior, not a regression

### Flags for CEO
- **SessionSummary fix recommended** — `setScreen("home")` → `setScreen("courseHome")` on line 191 of SessionSummary.jsx. Single-line change. Without this fix, users are dropped to the app home after every session summary instead of returning to their active course.

### Flags for Next Step
- Fix Finding 1 before release (1-line change in SessionSummary.jsx)
- All other findings are deferrable
