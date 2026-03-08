# Phase 4 — Schedule UI — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer Agent
**Design:** `knowledge/design/schedule-ui-2026-03-08.md`
**Build:** `npm run build` passes (84 modules, 935.26 kB main chunk)

---

## Summary

Added ScheduleScreen (new screen) with temporal sections and expandable cards, HomeScreen per-course info bars with urgency signals, and schedule route in ScreenRouter. ~300 lines of new code across 3 files.

---

## Changes

### `src/screens/ScheduleScreen.jsx` (CREATED, ~220 lines)

**New screen** at `screen === "schedule"` — shows all assignments and exams for the active course grouped by temporal urgency.

**Helpers (module-level):**
- `formatDueDate(epoch)` — same hybrid formatter as StudyContext (relative when close, absolute when far)
- `getUrgencyLevel(epoch)` — same 4-tier urgency as ModePicker
- `URGENCY_COLORS` — overdue/urgent red, soon amber, normal blue, none gray
- `readinessColor(v)` — green/amber/muted thresholds

**Data loading (`loadData`):**
1. `Assignments.getByCourse(active.id)` — raw assignment rows
2. `Assignments.getQuestions(a.id)` per assignment — for skill mapping + readiness
3. `CourseSchedule.getByCourse(active.id)` — weekly schedule with exam JSON
4. `loadSkillsV2(active.id)` — for `effectiveStrength` calculation
5. Enrichment: required skills extracted from question mappings, avg strength computed
6. Exam extraction: parse `exams` JSON from each schedule row, use all course skills for readiness
7. Items grouped into sections: PAST DUE, THIS WEEK, NEXT WEEK, LATER, NOT YET UPLOADED

**Section logic:**
- Placeholders (`source === 'syllabus' && !materialId`) → NOT YET UPLOADED (skip time sections)
- No due date → LATER
- Past due → PAST DUE, <7d → THIS WEEK, 7–14d → NEXT WEEK, >14d → LATER
- Empty sections hidden (no empty headers)
- Each section sorted by due date ascending

**Card rendering (`renderCard`):**
- Unified card for assignments, exams, and placeholders
- Collapsed: title (★ prefix for exams), due date (urgency colored), readiness %
- Overdue: red-tinted background + border (same treatment as ModePicker)
- Placeholders: dashed border, "—" instead of readiness, subtitle explains state
- Expanded assignments: required skills sorted weakest-first, "Start Assignment" button
- Expanded exams: overall readiness bar + "Weakest Skills" list (top 10, expandable), "Start Exam Prep" button
- Action buttons: `enterStudy(active)` — navigates to study screen mode picker

**Empty state:** "No schedule yet" with "Go to Course" button when no items exist.

### `src/screens/HomeScreen.jsx` (MODIFIED, 94 → 138 lines)

**New imports:** `useState`, `useEffect`, `Assignments`, `CourseSchedule`, `setActive`

**Schedule summary loading (`useEffect`):**
- On courses change, loads assignment + schedule data per course
- Computes: `overdueCount`, `dueThisWeek`, `nextExam` (soonest future exam with `daysUntil`)
- Stores in `summaries` state keyed by course ID
- Only stores entry if at least one signal is positive

**Info bar rendering:**
- Third line in course card, below materials line
- Shows up to 3 colored signals: overdue (red), due this week (amber), exam proximity (amber <7d, blue >7d)
- Signals separated by ` · ` middle dot
- Click on info bar: `e.stopPropagation(); setActive(c); setScreen("schedule")` — navigates to schedule screen
- Hover underline on info bar for clickability hint
- No info bar rendered if zero signals

**`formatExamProximity(days)`:** "Exam today" / "Exam tomorrow" / "Exam in N days"

### `src/ScreenRouter.jsx` (MODIFIED, 63 → 67 lines)

- Added `import ScheduleScreen from "./screens/ScheduleScreen.jsx"`
- Added route: `if (screen === "schedule" && active) return <ScheduleScreen />`
- Placed before notifications route, after skills route

---

## Design Decisions

1. **`formatDueDate`/`getUrgencyLevel` duplicated** — same functions exist in StudyContext.jsx and ModePicker.jsx. Extracting to a shared utility is a cleanup task (see Phase 3 QA item M2). For now, co-located in ScheduleScreen to avoid touching existing files.
2. **Exam readiness = all course skills** — v1 simplification. Topic-based filtering (matching `coversTopics` against skill names) would be more accurate but requires fuzzy matching. Deferred.
3. **Action buttons navigate to study screen** — `enterStudy(active)` opens the study screen with mode picker. The user then picks their mode. Auto-selecting a specific assignment from the schedule would require cross-screen state threading — deferred to a future polish pass.
4. **Info bar click navigates to schedule** — `setActive(c); setScreen("schedule")` is simpler than `enterStudy(c)` which initializes a full study session. The schedule screen only needs `active` for data queries.
5. **No separate exam section** — exams sort into the same time-based sections as assignments (PAST DUE, THIS WEEK, etc.), distinguished by ★ prefix. This avoids a separate "Exams" section that might only have 1-2 items.
