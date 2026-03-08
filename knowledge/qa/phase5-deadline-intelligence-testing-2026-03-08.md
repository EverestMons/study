# Phase 5 — Deadline Intelligence — QA Testing Report
**Date:** 2026-03-08
**Tester:** Study Security & Testing Analyst
**Scope:** ModePicker nudge banner, `buildDeadlineContext()`, skill picker priority, exam auto-scope, FSRS integrity
**Build:** `npm run build` passes (84 modules, 944.50 kB main chunk)

---

## Verdict: PASS

No critical or high-severity findings. 4 minor items documented.

---

## Test Results

### 1. Nudge Accuracy (8 scenarios)

| # | Scenario | Expected | Code Path | Result |
|---|---|---|---|---|
| 1.1 | Assignment due in 2 days, readiness 30% | Banner shows: title, "due in 2 days", "30% ready" | ModePicker.jsx:91 (`daysUntil <= 3 && avg < 0.6`) | PASS |
| 1.2 | Assignment due in 2 days, readiness 70% | No banner (readiness >= 60%) | ModePicker.jsx:91 — `avg < 0.6` fails | PASS |
| 1.3 | Assignment due in 5 days, readiness 20% | No banner (>3 days for assignments) | ModePicker.jsx:91 — `daysUntil <= 3` fails | PASS |
| 1.4 | Assignment overdue, readiness 90% | Banner shows (overdue always triggers regardless of readiness) | ModePicker.jsx:88-91 — `isOverdue` is first condition | PASS |
| 1.5 | Exam due in 5 days, readiness 40% | Banner shows (exam threshold is 7 days) | ModePicker.jsx:128 (`examDays <= 7 && allSkillAvg < 0.6`) | PASS |
| 1.6 | Exam due in 10 days, readiness 40% | No banner (>7 days for exams) | ModePicker.jsx:128 — `examDays <= 7` fails | PASS |
| 1.7 | Multiple: HW 5 overdue + HW 6 due in 2 days | Banner shows HW 5 (overdue beats upcoming) | ModePicker.jsx:154-158 — overdue sorts first | PASS |
| 1.8 | No assignments, no exams | No banner, no mode highlight | ModePicker.jsx:144 — `candidates.length === 0` | PASS |

**Dismiss behavior:**
- `setNudgeDismissed(true)` hides banner (line 240)
- State is component-local `useState(false)` — resets on remount (next `enterStudy`)
- Not persisted to DB — correct per design (nudge should reappear next session)

**Completed assignment filtering:**
- `a.status === "completed"` skipped (line 73) — correct
- Placeholder assignments (`source === "syllabus" && !a.materialId`) skipped (line 74) — correct

**Spaced repetition fallback:**
- When no deadline candidates exist, checks `nextReviewDate(s) <= today` (line 148)
- Sets `suggestedMode("skills")` but no nudge banner — correct per design

### 2. AI Context — `buildDeadlineContext()` (5 scenarios)

| # | Scenario | Expected | Code Path | Result |
|---|---|---|---|---|
| 2.1 | 2 assignments + 1 exam, all with dates | Context shows all 3, sorted by date ascending | study.js:99-105 | PASS |
| 2.2 | 5 assignments due | Only nearest 3 shown (token budget) | study.js:105 — `items.slice(0, 3)` | PASS |
| 2.3 | No assignments, no exams | Returns `""` — no UPCOMING DEADLINES block | study.js:107 | PASS |
| 2.4 | Assignment with no questions/skills | Shows "Readiness: 0%" + "(no skills mapped yet)" | study.js:75-77 — `skillList.length === 0` → avg=0, weakest=[] | PASS |
| 2.5 | All assignments completed | Returns `""` (all filtered out) | study.js:63 | PASS |

**Insertion point verification:**

| Call site | Location | Focus type | Verified |
|---|---|---|---|
| `buildContext()` | study.js:370 | General chat | Between assignments section and student profile — correct |
| `buildFocusedContext()` — assignment | study.js:516 | Assignment focus | After source material, before skill focus block — correct |
| `buildFocusedContext()` — skill | study.js:576 | Skill focus | After source material, before recap block — correct |
| `buildFocusedContext()` — recap | study.js:592 | Recap focus | After skills list, before exam block — correct |
| `buildFocusedContext()` — exam | study.js:657 | Exam focus | After source material, before explore block — correct |
| `buildFocusedContext()` — explore | N/A | Explore focus | **Skipped** — correct per blueprint (explore is free-form) |

**Stale data prevention:**
- `buildDeadlineContext` is called at session boot time (inside `buildContext`/`buildFocusedContext`)
- Uses `Date.now()` at call time for freshness — no caching
- Completed assignments filtered (`status === "completed"`)
- Placeholders filtered (`source === "syllabus" && !materialId`)

### 3. Skill Prioritization (5 scenarios)

| # | Scenario | Expected | Code Path | Result |
|---|---|---|---|---|
| 3.1 | Skill A (15%) needed for HW 5 (2d), Skill B (15%) no deadline | A sorts before B | StudyContext.jsx:692-697 — `aHas && !bHas → -1` within ±10% band | PASS |
| 3.2 | Skill A (15%) needed for HW 5, Skill B (55%) needed for HW 6 | A sorts first (strength difference > 10%) | StudyContext.jsx:690-699 — `Math.abs(0.15-0.55) = 0.40 > 0.10`, falls through to `strengthDiff` | PASS |
| 3.3 | Two deadline skills at 20% and 22%, HW 5 (2d) and HW 6 (5d) | HW 5 skill first (sooner deadline within band) | StudyContext.jsx:697 — `a.deadlineDays - b.deadlineDays` | PASS |
| 3.4 | Skill with no deadline at 10% vs skill with deadline at 60% | 10% skill first (strength difference dominates) | StudyContext.jsx:699 — `strengthDiff = -0.50`, outside ±10% | PASS |
| 3.5 | No assignments due within 14 days | All `deadlineTitle` = null, sort is pure `strength ascending` | StudyContext.jsx:656 — `skDaysUntil > 14` skips all | PASS |

**Badge rendering:**
- Badge text: `| Needed for [title] ([N]d)` appended to metadata line (ModePicker.jsx:621)
- Color: `T.am` when `deadlineDays < 7`, `T.ac` otherwise — correct
- Only rendered when `s.deadlineTitle` is truthy — no badge for non-deadline skills

**Deadline skill map filters:**
- Completed assignments excluded (StudyContext.jsx:652)
- Placeholder assignments excluded (StudyContext.jsx:653)
- Overdue assignments excluded (StudyContext.jsx:654 — `sa.dueDate < skNow`) — correct, overdue is handled by nudge not badge
- >14 day deadlines excluded (StudyContext.jsx:656) — badge only for reasonably upcoming work
- Error in deadline map computation is caught and logged, doesn't break skill picker (StudyContext.jsx:667)

### 4. Exam Auto-Scope (5 scenarios)

| # | Scenario | Expected | Code Path | Result |
|---|---|---|---|---|
| 4.1 | Exam covers weeks 1-6, readings match 3 materials | 3 materials pre-selected | StudyContext.jsx:734-743 — fuzzy matching | PASS |
| 4.2 | No exams in schedule | `preSelected` stays empty → manual selection | StudyContext.jsx:713-724 — `nearestExam` stays null | PASS |
| 4.3 | Exam exists but no `coversWeeks` | `preSelected` stays empty (no scope to match) | StudyContext.jsx:717 — `!eex.coversWeeks?.length` → skip | PASS |
| 4.4 | Exam has `coversWeeks` but no readings in schedule rows | `readingSet` empty → no matching → manual selection | StudyContext.jsx:734 — `readingSet.size > 0` fails | PASS |
| 4.5 | Pre-selected materials can be deselected | Student unchecks → `selectedMats.delete(mat.id)` | ModePicker.jsx:530-533 (existing toggle handler) | PASS |

**Fallback behavior:**
- Auto-selection failure caught in try/catch (StudyContext.jsx:746) — falls back to `preSelected = new Set()` (empty)
- Past exams excluded (StudyContext.jsx:719 — `eEpoch <= examNow`)
- Nearest future exam chosen when multiple exist (StudyContext.jsx:720)

**Fuzzy matching logic:**
- `emName.includes(reading) || reading.includes(emName)` (StudyContext.jsx:738)
- Bidirectional containment — handles "Chapter 1" matching "Chapter 1 - Intro" and vice versa
- All comparisons lowercased — case-insensitive

### 5. FSRS Integrity (Critical Verification)

| # | Check | Expected | Verified | Result |
|---|---|---|---|---|
| 5.1 | `fsrs.js` file unchanged | No modifications to FSRS algorithm | No edits to `src/lib/fsrs.js` in this phase — file not in git diff | PASS |
| 5.2 | `currentRetrievability()` unchanged | Returns `retrievability(elapsed, stability)` — pure math, no deadline influence | fsrs.js:195-206 — reads `.stability` and `.lastReviewAt` only | PASS |
| 5.3 | `reviewCard()` unchanged | FSRS card update (difficulty, stability, state transitions) not touched | Not modified — no imports of deadline data in fsrs.js | PASS |
| 5.4 | `effectiveStrength()` unchanged | Calls `currentRetrievability(m)` — no deadline parameter | study.js:31-37 — same implementation as before | PASS |
| 5.5 | Skill picker sort is display-only | `deadlineTitle`/`deadlineDays` are render-time decorations, not stored in DB | StudyContext.jsx:686-687 — attached during `.map()`, never passed to `DB.savePractice` or `Mastery.update` | PASS |
| 5.6 | Practice mode unaffected | `createPracticeSet`, `generateProblems`, `evaluateAnswer` don't read deadline fields | No changes to practice functions in study.js | PASS |

**Critical confirmation:** The FSRS algorithm (difficulty, stability, retrievability decay, interval scheduling) is **completely untouched**. The "priority boost" is purely a sort-time comparator adjustment in the skill picker's `.sort()` call and a display-time badge in the skill card render. No FSRS fields (stability, difficulty, lastReviewAt, nextReviewAt, reps, lapses) are read, modified, or influenced by deadline data.

---

## Minor Items

### M1: Nudge banner "Work on it" enriches assignment inline
**Severity:** Minor
**Location:** ModePicker.jsx:93-108
**Issue:** The nudge computation builds an enriched assignment object (with mapped questions) inside the useEffect, duplicating the mapping logic from `loadAssignmentsCompat` in StudyContext.jsx:40-54. The two mapping implementations are nearly identical but could drift.
**Risk:** Low — both use the same field names and mapping patterns.
**Recommendation:** Extract shared question-mapping logic to a utility if a third call site appears.

### M2: `buildDeadlineContext` includes past-due items without limit
**Severity:** Minor
**Location:** study.js:62-77
**Issue:** `buildDeadlineContext` does not filter out overdue assignments. An assignment overdue by 90 days would still appear in the "nearest 3 deadlines" context sent to the LLM, potentially consuming a slot that should show an upcoming deadline.
**Recommendation:** Consider filtering assignments overdue by more than 14 days, or sorting upcoming items before overdue items in the context output.

### M3: Deadline skill map excludes overdue assignments
**Severity:** Minor
**Location:** StudyContext.jsx:654
**Issue:** The skill picker deadline map skips assignments where `sa.dueDate < skNow` (overdue). This means a skill needed for an overdue assignment won't get a deadline badge. This is arguably correct behavior (the badge says "Needed for... (Nd)" which doesn't make sense for past-due items), but a student with an overdue assignment might benefit from seeing which skills it requires.
**Recommendation:** Acceptable as-is. If overdue badges are wanted, use a different label format (e.g., "Needed for HW 5 (overdue)").

### M4: `formatNudgeDate` duplicated
**Severity:** Minor
**Location:** ModePicker.jsx:21-33
**Issue:** `formatNudgeDate` is a near-exact copy of `formatDueDate` in StudyContext.jsx:24-36, which is also duplicated in ScheduleScreen.jsx:8-20. This is now the 3rd copy.
**Recommendation:** Extract to `src/lib/dates.js` shared utility (same recommendation as Phase 4 QA item M2 and Phase 3 QA item M2).
