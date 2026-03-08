# Schedule UI — UX Design Direction
**Date:** 2026-03-08
**Designer:** Study UX Designer
**Context:** Phase 4 of Assignment Scheduler spec
**Handoff:** SA + DEV

---

## 1. HomeScreen Per-Course Info Bars

### Current State

Course cards show name, material count, and material type tags. No schedule or deadline information. A student with 3 courses has no way to see which course needs attention without clicking into each one.

```
┌──────────────────────────────────────────────────────┐
│  Organic Chemistry                           Delete  │
│  3 materials · Textbook, Syllabus, Assignment        │
└──────────────────────────────────────────────────────┘
```

### Proposed: Info Bar Below Material Line

Add a third line to the course card that surfaces the most urgent schedule signals. Only rendered when at least one signal exists (course has been syllabus-parsed or has assignments with due dates). If there is nothing to show, the card stays as-is — no empty info bar.

```
┌──────────────────────────────────────────────────────┐
│  Organic Chemistry                           Delete  │
│  3 materials · Textbook, Syllabus, Assignment        │
│  2 overdue  ·  1 due this week  ·  Exam in 5 days   │
└──────────────────────────────────────────────────────┘
```

**Data sources (per course):**
| Signal | Source | Display | Color |
|---|---|---|---|
| Overdue count | `Assignments.getByCourse` → filter `dueDate < now && status !== 'completed'` | `"N overdue"` | `T.rd` (#F87171) |
| Due this week | `Assignments.getByCourse` → filter `dueDate` within 7 days | `"N due this week"` | `T.am` (#FBBF24) |
| Next exam | `CourseSchedule.getByCourse` → scan `exams` JSON arrays for soonest future exam | `"Exam in N days"` or `"Exam tomorrow"` | `T.am` if <7d, `T.ac` if >7d |
| Placeholders without materials | `Assignments.getPlaceholders(courseId)` | `"N unmatched"` | `T.txM` (#64748B) |

**Rules:**
1. Show at most 3 signals (overdue > due this week > exam > unmatched — priority order, drop lowest)
2. Signals separated by ` · ` (middle dot, matching existing material type separator)
3. Each signal in its urgency color, inline within a single `fontSize: 12` row
4. If zero signals exist, the info bar row is not rendered at all — card stays 2-line
5. Overdue count of 0 is never shown. "Due this week" of 0 is never shown. Only positive counts appear.

**Styling:**
```
fontSize: 12, marginTop: 6
Each signal: colored span, separated by " · " in T.txM
```

**Info bar click behavior:** Clicking anywhere on the info bar row calls `e.stopPropagation()` and navigates to the schedule screen for that course (see §4 Navigation). The rest of the card still fires `enterStudy(c)` as before.

**Why not a separate button:** Adding a "View Schedule" button clutters the card and creates two competing click targets side by side. Making the info bar itself the navigation target is natural — the student sees "2 overdue" and clicks it to see details.

---

## 2. Schedule Screen (ScheduleView)

### Overview

A new screen (`screen === "schedule"`) scoped to the active course. Shows all assignments, exams, and placeholders grouped by temporal section, sorted soonest-first within each section.

**Data loading:** On mount, load:
- `Assignments.getByCourse(courseId)` — all assignments with due dates
- `CourseSchedule.getByCourse(courseId)` — weekly schedule (contains exam entries)
- Skills via `loadSkillsV2(courseId)` — for readiness calculation

### Section Layout

Sections are rendered top-to-bottom. Empty sections are hidden entirely (no empty headers).

```
< Back to [Course Name]                        Settings
─────────────────────────────────────────────────────────

  Schedule

  ── PAST DUE ────────────────────────────────── (red)
  │ Homework 2          overdue by 3 days    45% │
  │ Lab Report 1        overdue              62% │

  ── THIS WEEK ───────────────────────────────── (amber)
  │ Homework 3          tomorrow             78% │
  │ Quiz 2              in 3 days            55% │

  ── NEXT WEEK ───────────────────────────────── (blue)
  │ Lab Report 2        in 9 days            30% │

  ── LATER ───────────────────────────────────── (muted)
  │ Final Project        Dec 1               12% │
  │ ★ Final Exam         Dec 15              38% │

  ── NOT YET UPLOADED ────────────────────────── (muted)
  │ Homework 5          in 12 days            —  │
  │ Homework 6          Nov 20                —  │
```

**Section definitions:**

| Section | Filter | Header Color | Sort |
|---|---|---|---|
| PAST DUE | `dueDateEpoch < now` | `T.rd` | Epoch ascending (most overdue first) |
| THIS WEEK | `dueDateEpoch` within 7 days | `T.am` | Epoch ascending |
| NEXT WEEK | `dueDateEpoch` 7–14 days out | `T.ac` | Epoch ascending |
| LATER | `dueDateEpoch` > 14 days | `T.txM` | Epoch ascending |
| NOT YET UPLOADED | `source === 'syllabus' && !material_id` | `T.txM` | Epoch ascending |

**Section header styling:**
```
fontSize: 11, color: [section color], textTransform: "uppercase",
letterSpacing: "0.05em", fontWeight: 600, marginTop: 24, marginBottom: 8
```

### Item Card Design

Each item is a clickable row card. Two types: **assignment** and **exam**.

**Assignment card (collapsed):**
```
┌──────────────────────────────────────────────────────┐
│  Homework 3              tomorrow              78%   │
│  3 questions · 5 skills needed                   ▾   │
└──────────────────────────────────────────────────────┘
```

Layout:
- **Row 1:** Title (left, `fontSize: 14, fontWeight: 600, T.tx`) | Due date (center-right, `fontSize: 12`, urgency color) | Readiness % (right, `fontSize: 12`, readiness color)
- **Row 2:** Subtitle (`fontSize: 12, T.txD`) — question count, skill count | Expand arrow (`▾`/`▴`)
- Readiness color: `>= 60%` green (`T.gn`), `>= 30%` amber (`#F59E0B`), `< 30%` muted (`T.txM`)
- Overdue cards: same red-tint treatment as ModePicker (red bg `rgba(248,113,113,0.06)`, red border `rgba(248,113,113,0.3)`)

**Exam card (collapsed):**
```
┌──────────────────────────────────────────────────────┐
│  ★ Final Exam            Dec 15               38%   │
│  Covers weeks 1–14 · 42 skills                   ▾   │
└──────────────────────────────────────────────────────┘
```

- Star prefix (`★`) distinguishes exams from assignments visually
- Subtitle shows scope: "Covers weeks X–Y" (from `coversWeeks` in schedule data) and skill count
- Same readiness color logic as assignments

**Placeholder card:**
```
┌──────────────────────────────────────────────────────┐
│  Homework 5              in 12 days              —   │
│  Placeholder — upload materials to decompose     ▾   │
└──────────────────────────────────────────────────────┘
```

- Readiness shows `—` (dash) since no questions/skills exist yet
- Subtitle explains it's a placeholder
- Dashed border (`borderStyle: "dashed"`) to visually differentiate from real assignments
- Clicking expands but the expanded view only shows "Upload assignment materials to get question breakdown and readiness tracking" with no action button (navigation to upload is from the study screen)

**Card styling (all types):**
```
background: T.sf (or red tint if overdue)
border: 1px solid T.bd (or red border if overdue)
borderRadius: 12, padding: "14px 18px", cursor: "pointer"
transition: "all 0.15s"
hover: background T.sfH (or red hover if overdue)
```

### Assignment Expanded View

Clicking an assignment card expands it inline (same pattern as ModePicker):

```
┌──────────────────────────────────────────────────────┐
│  Homework 3              tomorrow              78%   │
│  3 questions · 5 skills needed                   ▴   │
├──────────────────────────────────────────────────────┤
│  REQUIRED SKILLS                                     │
│  ● Acid-Base Equilibria                    92%       │
│  ● Nucleophilic Substitution               71%       │
│  ● Stereochemistry                         45%  [P]  │
│  ● Reaction Mechanisms                     23%  [P]  │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │            Start Assignment                  │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

- Skills sorted weakest-first (same as ModePicker expanded view)
- Weak skills (`< 40%`) show `[Practice]` button (same as ModePicker)
- "Start Assignment" button boots into assignment mode with that assignment focused
- Same readiness color logic per skill (green/amber/red dot + percentage)

---

## 3. Exam Drill-Down

Exam expanded view is similar to assignment expanded view but with exam-specific data:

```
┌──────────────────────────────────────────────────────┐
│  ★ Final Exam            Dec 15               38%   │
│  Covers weeks 1–14 · 42 skills                   ▴   │
├──────────────────────────────────────────────────────┤
│  OVERALL READINESS                                   │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  38%          │
│                                                      │
│  WEAKEST SKILLS (showing 10 of 42)                   │
│  ● Reaction Mechanisms                     12%  [P]  │
│  ● Stereochemistry                         18%  [P]  │
│  ● Acid-Base Equilibria                    23%  [P]  │
│  ● Molecular Orbital Theory                31%  [P]  │
│  ● Thermodynamics                          35%  [P]  │
│  ● Spectroscopy (NMR)                      42%       │
│  ● Kinetics                                55%       │
│  ● Functional Groups                       67%       │
│  ● Bonding                                 78%       │
│  ● Nomenclature                            91%       │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │          Start Exam Prep                     │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

**Overall readiness bar:**
- Full-width progress bar (`height: 6, borderRadius: 3`)
- Bar color follows the same readiness thresholds: green (>=60%), amber (>=30%), red/muted (<30%)
- Background: `T.bd`
- Percentage label right-aligned, same color as bar

**Skill list:**
- All skills relevant to the exam scope, sorted weakest-first
- Show top 10 by default with "Show all N skills" expand link if more exist
- Same skill row design as assignment expanded view (dot + name + percentage + practice button for weak)
- "Weakest Skills" header includes count: `"WEAKEST SKILLS (showing 10 of 42)"`

**"Start Exam Prep" button:**
- Navigates to study screen and boots with `focusContext: { type: "exam_prep" }`
- Same button styling as "Start Assignment" — full-width, `T.ac` background when readiness >= 40%, subdued when < 40%

**Exam skill resolution:**
- Exams in `course_schedule` have `coversWeeks` and `coversTopics` from syllabus parsing
- To get exam skills: load all skills for the course, then filter by topics that match the exam scope
- If no scope data exists (no `coversWeeks`/`coversTopics`), include all course skills (conservative — show everything)

---

## 4. Navigation Pattern

### Flow

```
HomeScreen                  ScheduleView                  StudyScreen
┌──────────────┐            ┌───────────────────┐         ┌───────────────┐
│              │            │                   │         │               │
│ Course Card  │──click────→│  (enterStudy)     │         │  Mode Picker  │
│  [body]      │  body      │                   │         │               │
│              │            │                   │         │               │
│  info bar    │──click────→│  < Back            │──click─→│  (bootWith    │
│  "2 overdue" │  info bar  │  Past Due          │  item   │   Focus)     │
│              │            │  This Week         │         │               │
└──────────────┘            │  Later             │         └───────────────┘
                            │  Exams             │
                            │  Placeholders      │
                            └───────────────────┘
                                    │
                                    │──< Back──→ HomeScreen
```

**Entry points to ScheduleView:**
1. Click the info bar on a HomeScreen course card → `setActive(course); setScreen("schedule")`
2. (Future: could add a "Schedule" button in the study screen top bar)

**Exit from ScheduleView:**
- "< Back" button → `setScreen("home"); setActive(null)` (clears active course, returns to HomeScreen)

**From ScheduleView to StudyScreen:**
- Click "Start Assignment" → `enterStudy(active)` then `selectMode("assignment")` with that assignment pre-selected
- Click "Start Exam Prep" → `enterStudy(active)` then `selectMode("exam_prep")`

**Implementation:** Add `screen === "schedule"` to ScreenRouter.jsx. Requires a new `ScheduleScreen.jsx` in `src/screens/`.

### Back Navigation in ScheduleView

Top bar matches the existing pattern from StudyScreen:
```
< Back to [Course Name]                        Settings
```

"< Back" always returns to HomeScreen (since the schedule was entered from HomeScreen). The course name in the back button provides context.

---

## 5. Empty States

### HomeScreen Info Bar — No Schedule Data

If a course has `syllabus_parsed = 0` and no assignments with due dates:
- **No info bar rendered.** The card stays in its current 2-line format.
- This is the correct default — don't show "No schedule" on every card, just omit the row.

### HomeScreen Info Bar — All Caught Up

If a course has schedule data but nothing overdue, nothing due this week, and no imminent exams:
- **No info bar rendered.** Nothing urgent = nothing to show.
- The student only sees info bars on courses that need attention. This creates a natural "inbox zero" feel when everything is on track.

### ScheduleView — No Syllabus Parsed

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  No schedule yet                                     │
│                                                      │
│  Upload a syllabus to automatically extract your     │
│  weekly schedule, exam dates, and assignments.        │
│                                                      │
│  ┌────────────────────────────────────────────┐      │
│  │          Go to Materials                   │      │
│  └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

- Centered, `T.txD` text, `fontSize: 14`
- "Go to Materials" button navigates to `setScreen("manage")` (material management for the active course)
- `background: T.sf, border: 1px solid T.bd, borderRadius: 14, padding: 48px`

### ScheduleView — No Deadlines

If `syllabus_parsed = 1` but no assignments have due dates (all nulls):

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  No deadlines set                                    │
│                                                      │
│  Your assignments don't have due dates yet.          │
│  Set them in the assignment picker when you start    │
│  a study session.                                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Still show the NOT YET UPLOADED section if placeholders exist (those are useful even without dates)
- Only show this empty state if there are truly zero items to display in any section

### ScheduleView — No Exams

- The exam section simply doesn't render. No "No exams scheduled" message needed — the absence is self-evident when other sections exist.

---

## 6. Data Requirements

### New Data Needed on HomeScreen

Currently `courses` state (from `Courses.getAll()`) contains course metadata + `materials` array. It does **not** contain assignment or schedule data.

**Option A — Eager load on HomeScreen mount:** After loading courses, fetch schedule summaries for each course. This adds N+1 queries (1 per course) but the data is small.

**Option B — Precompute summary in context:** Add a `loadCourseSummaries()` function that fetches all course schedule signals in batch and stores them alongside courses.

**Recommendation: Option A** — simpler, and HomeScreen only renders on app launch and return-from-study. The N queries are lightweight (just counting rows with filters). Avoid premature optimization.

**Summary shape per course:**
```javascript
{
  overdueCount: number,      // assignments with dueDate < now
  dueThisWeekCount: number,  // assignments with dueDate within 7 days
  nextExam: {                // soonest future exam, or null
    name: string,
    daysUntil: number,
  } | null,
  placeholderCount: number,  // unmatched placeholders
}
```

### Exam Data Extraction

Exams live inside `CourseSchedule` rows as JSON in the `exams` column. Each schedule row (one per week) may have an `exams` array. To find all exams for a course:

```javascript
const schedule = await CourseSchedule.getByCourse(courseId);
const exams = [];
for (const week of schedule) {
  const weekExams = JSON.parse(week.exams || '[]');
  for (const exam of weekExams) {
    exams.push({
      name: exam.name || exam.title,
      date: exam.date,         // ISO string or null
      dateEpoch: parseISOToEpoch(exam.date),
      coversWeeks: exam.coversWeeks || week.coversWeeks,
      coversTopics: exam.coversTopics || [],
      weekNumber: week.weekNumber,
    });
  }
}
```

This extraction should happen in the ScheduleView data loading, not precomputed.

---

## 7. CEO Decision Points

The following aesthetic decisions are escalated for CEO review:

1. **Info bar density:** Show up to 3 signals per course card, or simplify to just 1 (the most urgent)? More signals = more information but busier cards.
2. **Schedule screen layout:** Cards in a single-column list (proposed), or a two-column layout for wider screens? Single column is simpler and matches the existing app aesthetic.
3. **Exam visual treatment:** Star prefix (`★`) for exams, or a different indicator (colored tag, icon, background tint)? Star is zero-dependency but may feel informal.
4. **Readiness bar in exam drill-down:** Full-width horizontal bar (proposed), or circular/radial gauge? Horizontal bar is consistent with the rest of the app (no circular gauges anywhere).
