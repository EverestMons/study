# Phase 4 — Schedule UI Testing Report
**Date:** 2026-03-08
**Analyst:** Study Security & Testing Analyst
**Implementation:** `src/screens/ScheduleScreen.jsx`, `src/screens/HomeScreen.jsx`, `src/ScreenRouter.jsx`
**Build:** `npm run build` passes (84 modules, 935.26 kB main chunk)

---

## Verdict: PASS

No critical or high-severity issues. 4 minor items (non-blocking).

---

## Test Scenarios

### T1: HomeScreen Info Bar — Overdue Count Accuracy
**Flow:** Course has assignments with past due dates → info bar shows correct count
**Trace:**
1. `Assignments.getByCourse(c.id)` returns rows with `dueDate` (epoch int) and `status` (HomeScreen:22)
2. Filter: `a.dueDate && a.dueDate < now && a.status !== "completed"` (HomeScreen:25)
3. Only active (non-completed) assignments with past-due dates are counted
**Test cases:**
| Scenario | Expected | Result |
|---|---|---|
| 2 overdue (active), 1 overdue (completed) | "2 overdue" (red) | PASS — completed excluded |
| 0 overdue, 3 due this week | No overdue signal, "3 due this week" (amber) | PASS — zero hides signal |
| 1 overdue, 0 due this week | "1 overdue" only | PASS |
| All assignments have null dueDate | No info bar rendered | PASS — filter returns 0 for both counts |
**Result:** PASS

### T2: HomeScreen Info Bar — Due This Week Accuracy
**Flow:** Course has assignments due within 7 days → info bar shows correct count
**Trace:**
1. Filter: `a.dueDate && a.dueDate >= now && a.dueDate < now + 7 * 86400` (HomeScreen:26)
2. Only future (non-overdue) assignments within 7-day window counted
**Edge cases:**
| Scenario | Expected | Result |
|---|---|---|
| Due in exactly 7 days (168h) | NOT counted (exclusive upper bound `<`) | PASS |
| Due in 6d 23h 59m | Counted (within window) | PASS |
| Due in 1 second | Counted (still future, `>= now`) | PASS |
| Overdue by 1 second | NOT counted (caught by overdue filter, not this one) | PASS |
**Note:** Assignments exactly at `now` epoch are counted as "due this week" (not overdue). This is correct — `dueDate >= now` and `dueDate < now` are mutually exclusive.
**Result:** PASS

### T3: HomeScreen Info Bar — Exam Proximity
**Flow:** Course schedule has future exams → info bar shows soonest exam
**Trace:**
1. `CourseSchedule.getByCourse(c.id)` returns schedule rows (HomeScreen:23)
2. `JSON.parse(week.exams || "[]")` — each week's exam JSON parsed (HomeScreen:30)
3. For each exam: parse date, skip if `isNaN(epoch) || epoch <= now` (HomeScreen:34)
4. Track soonest: `if (!nextExam || epoch < nextExam.epoch)` (HomeScreen:36)
5. Display: `formatExamProximity(days)` — "Exam today"/"Exam tomorrow"/"Exam in N days" (HomeScreen:54–57)
6. Color: amber if <7 days, blue if >=7 days (HomeScreen:105)
**Test cases:**
| Scenario | Expected | Result |
|---|---|---|
| Exam tomorrow | "Exam tomorrow" (amber) | PASS |
| Exam in 10 days | "Exam in 10 days" (blue) | PASS |
| Exam today (epoch = now + 1s) | "Exam today" (amber) — `daysUntil = 0` | PASS |
| Past exam (epoch < now) | Skipped — `epoch <= now` guard | PASS |
| Exam with no date | Skipped — `if (!exam.date) continue` | PASS |
| Multiple exams — soonest wins | Correct — `epoch < nextExam.epoch` comparison | PASS |
| Malformed exams JSON | Caught by inner try/catch, skipped silently | PASS |
**Result:** PASS

### T4: HomeScreen Info Bar — No Signals
**Flow:** Course with no schedule data or all dates in distant future (>7d, no overdue)
**Trace:**
1. `overdueCount = 0`, `dueThisWeek = 0`, `nextExam = null` (or distant exam)
2. Condition: `if (overdueCount || dueThisWeek || nextExam)` → false (HomeScreen:42)
3. No entry in `summaries` for this course
4. `summary = summaries[c.id]` → undefined → `signals` stays empty (HomeScreen:100–101)
5. `{signals.length > 0 && ...}` → false → no info bar row rendered (HomeScreen:118)
**Result:** PASS — card stays in original 2-line format

### T5: HomeScreen Info Bar → Schedule Navigation
**Flow:** Click info bar → navigates to schedule screen for that course
**Trace:**
1. Info bar `onClick`: `e.stopPropagation(); setActive(c); setScreen("schedule")` (HomeScreen:119)
2. `stopPropagation` prevents parent card's `onClick={() => enterStudy(c)}` from firing
3. `setActive(c)` sets `active` to the course object (includes materials array)
4. `setScreen("schedule")` triggers ScreenRouter re-render
5. ScreenRouter: `if (screen === "schedule" && active) return <ScheduleScreen />` (ScreenRouter:57)
6. ScheduleScreen mounts with `active` set → `loadData()` runs
**Result:** PASS

### T6: ScheduleScreen — Data Loading
**Flow:** ScheduleScreen mounts → loads all data → renders sections
**Trace:**
1. `useEffect(() => { if (active) loadData(); }, [])` fires once on mount (ScheduleScreen:46)
2. `Assignments.getByCourse(active.id)` — SQL: `SELECT a.*, COUNT(aq.id) AS question_count FROM assignments ...` (db.js:354–371)
3. Returns camelCase rows: `{ id, courseId, materialId, title, dueDate, status, source, questionCount }`
4. For each assignment: `Assignments.getQuestions(a.id)` — returns questions with `requiredSkills`
5. Skill mapping: 3-tier resolution (id → conceptKey → case-insensitive name) (ScheduleScreen:62–65)
6. `effectiveStrength(skill)` → `currentRetrievability(mastery)` (fsrs.js:195) — FSRS decay formula
7. `avgStrength = sum / count` (ScheduleScreen:67)
8. Exams extracted from schedule rows: `JSON.parse(week.exams || "[]")` (ScheduleScreen:81)
9. `setItems(all)` triggers re-render with section grouping
**Result:** PASS

### T7: ScheduleScreen — Section Grouping
**Flow:** Items grouped into 5 temporal sections based on due date
**Trace (ScheduleScreen:107–130):**
1. Placeholders → NOT YET UPLOADED (regardless of due date) (line 110)
2. No due date → LATER (line 111)
3. `diff < 0` → PAST DUE (line 113)
4. `diff < 7 * 86400` → THIS WEEK (line 114)
5. `diff < 14 * 86400` → NEXT WEEK (line 115)
6. Otherwise → LATER (line 116)
7. Each section sorted by `dueDateEpoch` ascending, nulls last, alphabetical tiebreak (lines 118–123)
8. Empty sections filtered out: only pushed to `sections[]` if `.length > 0` (lines 125–129)
**Test cases:**
| Scenario | Expected Section | Result |
|---|---|---|
| Assignment due yesterday | PAST DUE (red header) | PASS |
| Assignment due in 3 days | THIS WEEK (amber header) | PASS |
| Assignment due in 10 days | NEXT WEEK (blue header) | PASS |
| Assignment due in 30 days | LATER (muted header) | PASS |
| Placeholder due in 3 days | NOT YET UPLOADED (not THIS WEEK) | PASS |
| Assignment with null dueDate | LATER | PASS |
| Exam due tomorrow | THIS WEEK | PASS |
| All sections empty | Empty state shown ("No schedule yet") | PASS |
**Result:** PASS

### T8: ScheduleScreen — Assignment Readiness Accuracy
**Flow:** Assignment readiness % matches average skill mastery
**Trace:**
1. Questions loaded: `Assignments.getQuestions(a.id)` (ScheduleScreen:57)
2. Required skills extracted: `s.conceptKey || s.name || String(s.subSkillId)` (ScheduleScreen:60)
3. Unique skill IDs via `Set` (ScheduleScreen:58)
4. Each skill matched: `sk.find(x => x.id === sid || x.conceptKey === sid)` or name fallback (ScheduleScreen:63–64)
5. Strength: `effectiveStrength(s)` — FSRS retrievability (0–1 float) (ScheduleScreen:65)
6. Average: `sum / count` (ScheduleScreen:67)
7. Display: `Math.round(it.avgStrength * 100) + "%"` (ScheduleScreen:158)
**Edge cases:**
| Scenario | Expected | Result |
|---|---|---|
| Assignment with 0 questions | `avgStrength = 0` → "0%" | PASS |
| All skills at 80% | avgStrength = 0.8 → "80%" (green) | PASS |
| Skill not found in course | `effectiveStrength(undefined) → 0` — treated as unknown | PASS |
| Mixed: 3 skills at 90%, 1 at 10% | avg = 70% → "70%" (green) | PASS |
**Result:** PASS

### T9: ScheduleScreen — Exam Readiness & Scope
**Flow:** Exam readiness uses all course skills; scope displayed from coversWeeks
**Trace:**
1. Exam `skillList`: all course skills mapped with `effectiveStrength` (ScheduleScreen:92)
2. `avgStrength`: precomputed `allSkillAvg` (mean of all skill strengths) (ScheduleScreen:77–78, 93)
3. `coversWeeks` displayed: `"Covers weeks " + min + "–" + max` when non-empty (ScheduleScreen:164)
4. When `coversWeeks` is empty: scope line omitted, only skill count shown (ScheduleScreen:164–165)
**Test cases:**
| Scenario | Expected | Result |
|---|---|---|
| Exam with `coversWeeks: [1,2,3,4,5,6]` | "Covers weeks 1–6 · N skills" | PASS |
| Exam with empty `coversWeeks: []` | "N skills" (no covers line) | PASS |
| Exam with `coversTopics` but no `coversWeeks` | Topics stored but not displayed in subtitle (v1) | PASS — data preserved |
| Course with 0 skills | `allSkillAvg = 0` → "0%", no skills in expanded view | PASS |
| Course with 50 skills | Shows top 10 + "Show all 50 skills" expand button | PASS |
**Result:** PASS

### T10: ScheduleScreen — Empty States
**Flow:** No assignments and no exams → empty state message
**Trace:**
1. `loadData()` completes: `all = []` (no assignments, no exam entries in schedule)
2. `setItems([])` → `items.length === 0` → true
3. Empty state renders: "No schedule yet" + "Upload a syllabus..." + "Go to Course" button (ScheduleScreen:260–271)
4. "Go to Course" button: `enterStudy(active)` → navigates to study screen (ScheduleScreen:266)
**Result:** PASS

### T11: ScheduleScreen — Card Expand/Collapse
**Flow:** Click card → expands, click again → collapses
**Trace:**
1. Click: `setExpanded(isExp ? null : key)` (ScheduleScreen:148)
2. `key = it.id || idx` — DB id for assignments, synthetic `"exam-W-I"` for exams (ScheduleScreen:133)
3. `isExp = expanded === key` controls expanded view rendering (ScheduleScreen:134, 171)
4. Expanding resets `showAllExamSkills` to false (ScheduleScreen:148)
5. Only one card expanded at a time (single `expanded` state)
**Result:** PASS

### T12: ScheduleScreen — Navigation: Action Buttons
**Flow:** Click "Start Assignment"/"Start Exam Prep" → navigates to study screen
**Trace:**
1. Button `onClick`: `enterStudy(active)` (ScheduleScreen:224)
2. `enterStudy` sets `screen = "study"`, clears session state, initializes chat (StudyContext:551–558)
3. StudyScreen renders → ModePicker shows (no sessionMode/pickerData)
4. User selects mode from ModePicker
**Test cases:**
| Button | Expected Navigation | Result |
|---|---|---|
| "Start Assignment" (readiness >= 40%) | → Study screen mode picker | PASS |
| "Start Anyway (low readiness)" (readiness < 40%) | → Study screen mode picker | PASS |
| "Start Exam Prep" | → Study screen mode picker | PASS |
**Note:** Buttons navigate to the mode picker, not directly to a specific mode. See M3.
**Result:** PASS

### T13: ScheduleScreen — Back Navigation
**Flow:** Click "< Back" → returns to HomeScreen
**Trace:**
1. Button `onClick`: `setScreen("home")` (ScheduleScreen:240)
2. ScreenRouter: `if (screen === "home") return <HomeScreen />` (ScreenRouter:39)
3. `active` is NOT cleared — stays set from previous navigation. This is consistent with StudyScreen back behavior.
4. HomeScreen renders fresh with `courses` from context.
**Result:** PASS

### T14: ScheduleScreen — Placeholder Card Treatment
**Flow:** Syllabus-sourced assignment without materials → dashed border, no readiness, placeholder subtitle
**Trace:**
1. Type check: `a.source === "syllabus" && !a.materialId` → `type: "placeholder"` (ScheduleScreen:69)
2. Card: `borderStyle: isPlaceholder ? "dashed" : "solid"` (ScheduleScreen:147)
3. Readiness: `{isPlaceholder && <span>—</span>}` instead of percentage (ScheduleScreen:159)
4. Subtitle: `"Placeholder — upload materials to decompose"` (ScheduleScreen:167)
5. Expanded: text-only message, NO action button (ScheduleScreen:216–220, 223 guard `!isPlaceholder`)
6. Section: always NOT YET UPLOADED, regardless of due date (ScheduleScreen:110)
**Result:** PASS

### T15: Placeholder With Past Due Date
**Flow:** Placeholder assignment has a due date that's already past
**Trace:**
1. `it.type === "placeholder"` → goes to `notUploaded` section (ScheduleScreen:110 — `continue` skips time check)
2. `dueDateEpoch` is still set → `getUrgencyLevel` returns `"overdue"` → red urgency color on date text
3. `isOverdue` is true → card gets red background tint + red border (ScheduleScreen:140–141)
4. But card is still in NOT YET UPLOADED section, not PAST DUE
**Assessment:** The overdue visual treatment (red date, red tint) correctly signals urgency within the NOT YET UPLOADED section. The student sees "overdue by N days" in red on a dashed-border placeholder card — clearly communicating "this is late AND you haven't uploaded materials." Correct behavior.
**Result:** PASS

### T16: Course With 0 Assignments
**Flow:** Course exists with materials but no assignments → schedule shows exams only or empty state
**Trace:**
1. `Assignments.getByCourse(active.id)` returns `[]`
2. `CourseSchedule.getByCourse(active.id)` may return schedule rows
3. If schedule has exams → exams appear in appropriate sections
4. If no exams either → `items.length === 0` → empty state
**Result:** PASS

### T17: Course With Many Assignments (Layout Overflow)
**Flow:** Course has 20+ assignments → vertical scroll, no layout break
**Trace:**
1. Schedule view has `overflowY: "auto"` on the content container (ScheduleScreen:251)
2. Cards stack in `flexDirection: "column"` with `gap: 8` (ScheduleScreen:278)
3. Max width constrained: `maxWidth: 640, margin: "0 auto"` (ScheduleScreen:252)
4. Long titles handled: `overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"` (ScheduleScreen:153)
5. No fixed-height containers that would clip content
**Result:** PASS — scrollable layout handles any number of items

### T18: Exam With No Coverage Info
**Flow:** Exam extracted from schedule has no `coversWeeks` or `coversTopics`
**Trace:**
1. `coversWeeks: exam.coversWeeks || []` → empty array (ScheduleScreen:90)
2. `coversTopics: exam.coversTopics || []` → empty array (ScheduleScreen:90)
3. Subtitle: `it.coversWeeks?.length` is falsy → scope text skipped → only shows skill count (ScheduleScreen:164)
4. Expanded view: skills still shown (all course skills), readiness bar still shown
**Result:** PASS

### T19: Exam Deduplication
**Flow:** Same exam mentioned in multiple schedule weeks (e.g., "Midterm" in week 6 and week 7)
**Trace:**
1. Each schedule row parsed independently → exam appears once per row it's in
2. IDs: `"exam-6-0"` and `"exam-7-0"` → distinct React keys
3. Both appear in the section list with potentially the same title and date
**Assessment:** Duplicate exams will appear. The syllabus parser's enrichment step (syllabusParser.js:224–236) matches by name substring, so the same exam detail could match in multiple weeks. This is a known limitation (SA blueprint §9).
**Severity:** Minor — cosmetic duplication. Real syllabi rarely have the same exam listed in multiple weeks (typically only the week it occurs in).
**Result:** See M1 below

### T20: HomeScreen Summary — Cancellation Guard
**Flow:** User navigates away from HomeScreen before summary loading completes
**Trace:**
1. `var cancelled = false` before async IIFE (HomeScreen:17)
2. Cleanup: `return () => { cancelled = true }` (HomeScreen:51)
3. After async loop: `if (!cancelled) setSummaries(result)` (HomeScreen:49)
4. If component unmounted during load → `cancelled = true` → `setSummaries` not called → no React "setState on unmounted component" warning
**Result:** PASS

---

## Minor Issues

### M1: Exam deduplication not handled
**Severity:** Minor (cosmetic, non-blocking)
**Location:** ScheduleScreen.jsx:79–97
**Issue:** If the same exam is mentioned in multiple schedule weeks (e.g., "Midterm" in both week 6 and week 7), it appears as separate cards with the same title and date but different synthetic IDs (`exam-6-0`, `exam-7-0`).
**Impact:** Cosmetic — duplicated exam cards. Unlikely in practice since syllabus parsers typically mention an exam only in its week.
**Fix:** Deduplicate exams by `name + date` composite key after extraction loop.

### M2: `showAllExamSkills` is global, not per-card
**Severity:** Minor (UX, non-blocking)
**Location:** ScheduleScreen.jsx:44, 144
**Issue:** `showAllExamSkills` is a single boolean. If a user expands exam A and clicks "Show all skills", then collapses A and expands exam B, exam B will also show all skills (the flag persists). However, `setShowAllExamSkills(false)` on expand (line 148) partially mitigates this — it resets when any card is expanded.
**Impact:** Very low — the reset on expand means the flag only carries over if the user doesn't collapse the current card first. Since only one card can be expanded at a time, this scenario doesn't occur in practice.
**Fix:** None needed — existing reset logic handles it.

### M3: Action buttons navigate to mode picker, not directly to assignment/exam
**Severity:** Minor (UX, non-blocking)
**Location:** ScheduleScreen.jsx:224
**Issue:** "Start Assignment" and "Start Exam Prep" buttons call `enterStudy(active)` which lands the user on the study screen mode picker. The user must then click the appropriate mode button ("Work on an assignment" or "Prepare for exam") before selecting the specific item.
**Impact:** Extra clicks. The schedule screen already shows the same skill breakdown and readiness data that the mode picker shows, so the user is seeing the same information twice.
**Fix:** Call `selectMode("assignment")` or `selectMode("exam")` after `enterStudy` to skip the mode picker. Requires careful async sequencing since `enterStudy` resets `pickerData` and `selectMode` sets it.

### M4: HomeScreen info bar `dueThisWeek` includes assignments due today
**Severity:** Minor (semantic, non-blocking)
**Location:** HomeScreen.jsx:26
**Issue:** The filter `a.dueDate >= now` means an assignment due in 1 second counts as "due this week." This is technically correct (it IS due this week), but the user might expect "due this week" to exclude "due right now." However, `formatDueDate` shows "due today" for these, so the semantic mapping is correct — the info bar says "1 due this week" and the schedule screen shows "due today."
**Impact:** None — behavior is correct, just a labeling nuance.
**Fix:** None needed.

---

## Security Review

| Check | Status |
|---|---|
| SQL injection via schedule queries | SAFE — all queries use parameterized `?` bindings |
| XSS via exam/assignment titles | SAFE — all text rendered via React JSX (auto-escaped) |
| JSON.parse on untrusted data | SAFE — wrapped in try/catch, malformed data skipped silently |
| Race condition on concurrent navigation | SAFE — HomeScreen has cancellation guard; ScheduleScreen loads once on mount |
| State leaks between courses | SAFE — ScheduleScreen loads fresh data for `active.id` on mount |

---

## Checklist

- [x] HomeScreen info bar overdue count matches actual overdue assignments (completed excluded)
- [x] HomeScreen info bar due-this-week count accurate (7-day window, future only)
- [x] HomeScreen info bar exam proximity shows soonest future exam
- [x] HomeScreen info bar not rendered when zero signals
- [x] HomeScreen info bar click navigates to schedule screen (stopPropagation works)
- [x] ScheduleScreen loads assignments, questions, schedule, and skills
- [x] Readiness % computed correctly (avg effectiveStrength across required skills)
- [x] Exam readiness uses all course skills (v1 simplification)
- [x] Section grouping correct for all time ranges (past due, <7d, 7–14d, >14d, placeholders)
- [x] Empty sections hidden (no empty headers)
- [x] Sort within sections: due date ascending, nulls last, alphabetical tiebreak
- [x] Placeholder cards: dashed border, no readiness %, explanatory subtitle, no action button
- [x] Overdue cards: red tint background + border (consistent with ModePicker)
- [x] Exam cards: ★ prefix, readiness bar, weakest skills (top 10 + expand), "Start Exam Prep" button
- [x] Expand/collapse works correctly (single expanded card at a time)
- [x] Back navigation returns to HomeScreen
- [x] Empty state shown when no items
- [x] Long title ellipsis prevents layout overflow
- [x] Scrollable container handles 20+ items
- [x] Cancellation guard prevents stale setState on HomeScreen unmount
- [x] No SQL injection, XSS, or state leak vulnerabilities
