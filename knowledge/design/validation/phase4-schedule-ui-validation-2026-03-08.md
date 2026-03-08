# Phase 4 — Schedule UI — UX Validation Report
**Date:** 2026-03-08
**Validator:** Study UX Validator
**Input:** ScheduleScreen.jsx (289 lines), HomeScreen.jsx info bars (lines 96–130), design direction from Step 4.1
**Design:** `knowledge/design/schedule-ui-2026-03-08.md`

---

## Verdict: APPROVED

All 5 validation areas pass. 2 minor recommendations for future polish.

---

## 1. HomeScreen Info Bars — Urgency Communication

**Question:** Do they communicate urgency without overwhelming? Is the info scannable?

**Assessment: PASS**

The info bar renders as a compact third line below the materials count, using colored inline signals separated by middle dots:

```
3 overdue · 2 due this week · Exam in 5 days
 [red]       [amber]           [amber or blue]
```

**What works well:**
- **Color coding is immediate** — red for overdue, amber for soon/upcoming, blue for distant exams. The student's eye is drawn to red without needing to read the text.
- **Signal count is capped at 3** (overdue + due this week + next exam) — never overflows or wraps to multiple lines for typical data.
- **Zero-signal suppression** — if no urgency signals, the info bar row is not rendered at all. No clutter on courses with no upcoming deadlines.
- **Click target is the entire info bar row** — `e.stopPropagation()` correctly separates info bar click (schedule) from card body click (enterStudy). Hover underline provides a discoverability hint.
- **Scannable at a glance** — the student can scan 4-5 course cards in under 2 seconds and spot which courses have red (overdue) signals.

**One concern (accepted):** The info bar font is 12px (2px smaller than the materials line at 13px). This is intentional — secondary urgency data should feel lighter than primary metadata — but on high-DPI displays, 12px may be at the legibility threshold. Acceptable for v1.

---

## 2. ScheduleView — Findability & Section Clarity

**Question:** Can a student find what's due this week in <3 seconds? Is the "Not Yet Uploaded" section noticeable?

**Assessment: PASS**

**<3 second test:**
1. Student lands on ScheduleScreen → header reads "Schedule" + course name (0.5s orientation)
2. Section headers are ALL-CAPS, colored, 11px, with uppercase letter-spacing — visually distinct from card content
3. "THIS WEEK" section is the second group (after PAST DUE, if any) — the student's eye naturally scans top-down
4. Within seconds: identify section header, scan 1-3 cards, read due dates

Result: **Yes**, a student can locate "this week" items within 3 seconds. The temporal section ordering (PAST DUE → THIS WEEK → NEXT WEEK → LATER → NOT YET UPLOADED) follows natural priority.

**"Not Yet Uploaded" section:**
- Placed last, which is correct — it's lower priority than time-sensitive items
- Uses dashed card borders — visually distinct from solid-bordered assignment/exam cards
- Cards show "Placeholder — upload materials to decompose" as the subtitle
- Expanded placeholder shows: "Upload assignment materials to get question breakdown and readiness tracking."
- No action button on placeholders (correct — nothing actionable without materials)

**What works well:**
- Empty sections are suppressed — no "THIS WEEK (0)" clutter
- Section colors match urgency semantics (red → amber → blue → gray → gray)
- Cards within each section are sorted by due date ascending — nearest deadline first

---

## 3. Exam Drill-Down — Skill Breakdown Usefulness

**Question:** Is the skill breakdown useful? Can a student identify their weakest area?

**Assessment: PASS**

**Expanded exam card shows:**
1. **Overall Readiness bar** — horizontal progress bar with percentage, colored green/amber/muted
2. **"Weakest Skills" list** — sorted weakest-first (ascending by strength)
3. Each skill row: colored dot (red <40%, amber 40-60%, green >60%) + name + percentage
4. Weak skills (<40%) get a red-tinted background row — draws the eye immediately
5. If >10 skills: shows top 10 + "Show all N skills" expand button

**Weakest area identification:**
- The weakest skill is literally the first item in the list (sorted ascending)
- Red background tint on weak skills makes them pop visually
- The student can answer "what should I study?" within 2 seconds of expanding an exam card

**What works well:**
- Star prefix on exam cards distinguishes them from assignments without a separate section
- "Covers weeks 3–8" subtitle provides scope context
- "Start Exam Prep" button uses accent color when readiness >= 40%, muted when below — visual nudge toward preparation

---

## 4. Navigation — Route Clarity

**Question:** Is it obvious how to get to the schedule view? Is back navigation clear?

**Assessment: PASS**

**Entry points:**
1. **HomeScreen info bar click** — `setActive(c); setScreen("schedule")`. The hover underline on info bar text signals clickability.
2. No other entry point exists (acceptable for v1 — the info bar is the natural discovery path)

**Back navigation:**
- Top bar has "< Back" button (left-aligned) — returns to `setScreen("home")`
- Consistent with other screens (MaterialsScreen, SkillsScreen use the same pattern)
- Settings button on the right side of the top bar — also consistent

**What works well:**
- Navigation is simple: Home → Schedule → Home (one level deep)
- Action buttons ("Start Assignment" / "Start Exam Prep") use `enterStudy(active)` which takes the student to the study mode picker — a familiar flow
- No confusing deep navigation chains

**One concern (accepted):** There's no way to reach the schedule screen if a course has no urgency signals (no overdue items, no upcoming assignments, no exams). The info bar simply isn't rendered. A student who wants to browse their full schedule proactively has no entry point. Acceptable for v1 — the schedule screen's value proposition is urgency-driven. If students need proactive browsing, a "Schedule" button could be added to the course management screen later.

---

## 5. Empty States — Guidance Quality

**Question:** Do they guide the student toward uploading a syllabus?

**Assessment: PASS**

**Empty schedule (no items at all):**
```
  ┌──────────────────────────────┐
  │      No schedule yet         │
  │                              │
  │  Upload a syllabus to        │
  │  automatically extract your  │
  │  weekly schedule, exam dates, │
  │  and assignments.            │
  │                              │
  │     [Go to Course]           │
  └──────────────────────────────┘
```

- Clear message explaining what a syllabus provides (schedule, exams, assignments)
- Action button "Go to Course" calls `enterStudy(active)` — takes the student to the study screen where they can upload materials
- Centered layout, proper spacing, standard card styling

**Loading state:**
- "Loading schedule..." text shown while `items === null` — prevents flash of empty state during data fetch

**What works well:**
- The empty state explicitly mentions "syllabus" — the specific material type that generates schedule data
- The action button has a clear destination (study screen) rather than a vague "Get Started"

---

## Recommendations (Non-Blocking)

### R1: Schedule Entry Without Urgency Signals
**Priority:** Low
**Location:** HomeScreen.jsx or ManageScreen.jsx
**Issue:** If a course has no overdue/upcoming items and no exams, the info bar isn't rendered and there's no way to reach the schedule screen. Students who want to proactively check their schedule can't.
**Suggestion:** Add a subtle "Schedule" link in the course management screen, or always render a minimal info bar (e.g., "View schedule" in muted text).

### R2: Readiness Threshold Inconsistency in Skill Dots
**Priority:** Very Low
**Location:** ScheduleScreen.jsx:194 vs ScheduleScreen.jsx:34
**Issue:** The `readinessColor` function (line 34) uses thresholds 0.6/0.3, but the skill dot color in `renderCard` (line 194) uses 0.6/0.4. The thresholds should be consistent.
**Suggestion:** Align skill dot thresholds to match `readinessColor` (0.6/0.3) or document the intentional divergence.
