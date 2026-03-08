# Phase 5 — Deadline Intelligence — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer
**Build:** `npm run build` passes (84 modules, 944.50 kB main chunk)

---

## Summary

Phase 5 adds deadline-aware intelligence to three layers: the ModePicker UI (nudge banner + auto-suggestion + skill badges), the AI prompt pipeline (`buildDeadlineContext()`), and the skill/exam picker logic (priority boost + exam auto-scope). No new source files created — all changes are additions to existing files.

**Files modified:** 3
- `src/components/study/ModePicker.jsx` — 411 → 666 lines (+255)
- `src/lib/study.js` — 940 → 1,041 lines (+101)
- `src/StudyContext.jsx` — 1,007 → 1,114 lines (+107)

**Total delta:** ~463 lines added

---

## Step 5.3 — ModePicker Deadline Nudge

### Changes to `ModePicker.jsx`

**New imports:**
- `useState, useEffect` from React
- `Assignments, CourseSchedule` from db.js
- `effectiveStrength, nextReviewDate` from study.js

**New helper:** `formatNudgeDate(epoch)` (lines 21-33)
- Relative format for ≤14 days ("due today", "tomorrow", "in N days", "overdue by N days")
- Absolute format for >14 days (month + day, with year if different)
- Near-duplicate of `formatDueDate` in StudyContext.jsx (QA item M4)

**Nudge state:** 3 new `useState` variables (lines 57-59)
- `nudgeItem` — most urgent deadline candidate (or null)
- `suggestedMode` — which mode button to accent ("assignment" / "exam" / "skills")
- `nudgeDismissed` — component-local dismiss flag (resets on remount)

**Nudge computation `useEffect`:** (lines 61-167)
- Loads assignments + exams for active course
- Filters: completed excluded, placeholders excluded
- For each assignment: resolves required skills, computes avg `effectiveStrength`
- Assignment threshold: overdue OR (≤3 days AND readiness <60%)
- Exam threshold: overdue OR (≤7 days AND all-skill avg <60%)
- Builds enriched assignment object (with mapped questions) for `bootWithFocus`
- Sorts candidates: overdue first, then by due date ascending
- Sets top candidate as `nudgeItem`, matching mode as `suggestedMode`
- Fallback: if no deadline candidates, checks FSRS `nextReviewDate` → suggests "skills"

**`modeBtn()` helper:** (lines 169-179)
- Returns `bg`, `border`, `titleColor`, `hoverBg`, `hoverBorder` per mode
- Suggested mode gets accent tint (`T.acS`, `T.acB`, `T.ac`)
- Default (no suggestion): "assignment" gets accent treatment

**Nudge banner render:** (lines 217-247)
- Urgency-colored card: red (<2 days / overdue), amber (2-3 days)
- Single line: title (truncated 30ch) — due label — readiness %
- "Work on it" / "Start prep" action button → `bootWithFocus` or `selectMode("exam")`
- "Dismiss" text button → `setNudgeDismissed(true)`

**Mode buttons:** All 5 buttons updated to use `modeBtn()` output for dynamic accent styling.

---

## Step 5.4 — Deadline Context in AI Prompts

### Changes to `study.js`

**New import:** `Assignments, CourseSchedule` from db.js

**New export:** `buildDeadlineContext(courseId, skills)` (lines 53-135)
- Loads assignments + schedule for course
- Filters: completed excluded, placeholders excluded
- Per assignment: resolves required skills via 3-tier ID matching (id → conceptKey → name)
- Computes readiness (avg `effectiveStrength`), identifies 3 weakest skills
- Extracts exams from schedule JSON, uses all-skill avg for exam readiness
- Sorts by due date ascending (nulls last), takes nearest 3
- Returns formatted text block: `UPCOMING DEADLINES:\n1. Title (due in N days)\n   Readiness: NN%\n   Weakest skills:\n     - id: Name [NN%]`
- Returns `""` if no items

**Insertion points (5 calls):**

| Context builder | Location | Focus type |
|---|---|---|
| `buildContext()` | line 370 | General chat |
| `buildFocusedContext()` — assignment | line 516 | Assignment focus |
| `buildFocusedContext()` — skill | line 576 | Skill focus |
| `buildFocusedContext()` — recap | line 592 | Recap focus |
| `buildFocusedContext()` — exam | line 657 | Exam focus |

Explore focus intentionally skipped (free-form mode, no deadline pressure).

---

## Step 5.5 — Skill Picker Priority + Exam Auto-Scope

### Changes to `StudyContext.jsx`

**New import:** `CourseSchedule` from db.js

**Skill picker deadline map** (inside `selectMode("skills")`, lines 646-701):
- Loads upcoming assignments: not completed, not placeholders, not overdue, ≤14 days
- Builds `deadlineSkillMap`: skill ID → `{ title, daysUntil }` (nearest deadline wins)
- Attaches `deadlineTitle` / `deadlineDays` to enriched skill items during `.map()`
- Modified sort comparator with ±10% strength band:
  - Outside band: pure strength ascending (weakest first)
  - Within band: deadline skills promoted above non-deadline skills
  - Within band, both have deadlines: sooner deadline first
- `deadlineTitle`/`deadlineDays` are render-time decorations — never stored in DB, never passed to FSRS

**Exam auto-scope** (inside `selectMode("exam")`, lines 702-747):
- Finds nearest future exam with `coversWeeks` from `CourseSchedule`
- Collects readings from covered weeks (schedule rows where `week` is in exam's `coversWeeks`)
- Fuzzy matches readings against material names: bidirectional containment, case-insensitive
- Pre-populates `preSelected` Set with matching material IDs
- Fallback: if no exam found or matching fails, `preSelected = new Set()` (empty, manual selection)
- Try/catch ensures auto-scope failure never breaks the exam picker

**Deadline badge rendering** (ModePicker.jsx line 620):
- Appended to existing skill metadata line: `| Needed for [title] (Nd)`
- Color: amber (`T.am`) when <7 days, accent (`T.ac`) when 7-14 days
- Only rendered when `s.deadlineTitle` is truthy

---

## Build Verification

All 3 implementation steps verified with `npm run build`:

| Step | Modules | Bundle size | Status |
|---|---|---|---|
| 5.3 (nudge) | 84 | 940.27 kB | PASS |
| 5.4 (context) | 84 | 942.63 kB | PASS |
| 5.5 (priority + scope) | 84 | 944.50 kB | PASS |

No new warnings. Module count stable at 84 (no new files created).

---

## FSRS Integrity

The FSRS algorithm (`fsrs.js`) was NOT modified. All deadline intelligence operates as a presentation overlay:
- **Sort-time only:** `deadlineTitle`/`deadlineDays` attached during `.map()`, used in `.sort()` comparator, never stored
- **Display-time only:** Badge text rendered inline, urgency colors applied to cards
- **Context-time only:** `buildDeadlineContext` provides facts to AI, no behavioral instructions
- No FSRS fields (stability, difficulty, lastReviewAt, nextReviewAt, reps, lapses) are read, modified, or influenced by deadline data
