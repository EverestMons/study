# Phase 5 — Deadline-Aware Intelligence — UX Design Direction
**Date:** 2026-03-08
**Designer:** Study UX Designer
**Implementation:** `src/components/study/ModePicker.jsx`, `src/StudyContext.jsx`
**Related:** `knowledge/design/schedule-ui-2026-03-08.md` (Phase 4)

---

## 1. ModePicker Deadline Nudge Banner

### Problem
When a student opens a course, the mode picker shows 5 equal-weight buttons. There's no signal that "HW 5 is due in 2 days and you're only 30% ready." The student has to already know what's urgent. The schedule screen surfaces this data, but the mode picker — where every session starts — doesn't.

### Design: Contextual nudge banner above mode buttons

```
┌─────────────────────────────────────────────────┐
│  ⚠  HW 5 — due in 2 days · 31% ready           │
│  [Work on it]                          [Dismiss] │
└─────────────────────────────────────────────────┘

  [ Work on an assignment ]
  [ Recap last session    ]
  [ Skill work            ]
  [ Prepare for exam      ]
  [ Explore a topic       ]
```

**Placement:** Between the subtitle ("Pick a direction...") and the mode buttons. Same horizontal width as buttons (`maxWidth: 640`).

**Visual treatment:**

| Urgency | Background | Border | Icon text | When |
|---|---|---|---|---|
| Overdue | `rgba(248,113,113,0.08)` | `rgba(248,113,113,0.3)` | `T.rd` | `dueDate < now` |
| Urgent (<48h) | `rgba(248,113,113,0.06)` | `rgba(248,113,113,0.2)` | `T.rd` | `dueDate < now + 48h` |
| Soon (<3 days) | `rgba(245,158,11,0.06)` | `rgba(245,158,11,0.2)` | `T.am` | `dueDate < now + 3d` |

Uses the same `URGENCY_COLORS` system from Phase 3/4. Consistent with overdue card treatment in the assignment picker.

**Content format:** `[icon] Title — due in N days · NN% ready`
- Icon: text-based warning marker (consistent with existing app — no emoji)
- Title: assignment/exam title, truncated with ellipsis if >30 chars
- Due info: same `formatDueDate` output (relative when close)
- Readiness: `Math.round(avgStrength * 100) + "%"`, colored via `readinessColor`

**Action button:** `[Work on it]` — calls `bootWithFocus({ type: "assignment", assignment })` directly, bypassing the assignment picker. For exams: `[Start prep]` → `selectMode("exam")`.

**Dismiss button:** `[Dismiss]` — hides the banner for this session. State: `nudgeDismissed` (component-local `useState(false)`). Resets on next `enterStudy`. Not persisted — the nudge should reappear next session.

### Multiple urgent items

**Rule: Show only the single most urgent item.** Priority order:
1. Overdue assignments (earliest overdue first)
2. Overdue exams
3. Soonest upcoming assignment within 3 days
4. Soonest upcoming exam within 7 days

**Rationale:** Stacking multiple banners creates visual noise and decision paralysis. One clear nudge is more actionable than a list. The student can see all deadlines in the schedule screen if they want the full picture.

**Threshold:** Nudge only appears when:
- Due within 3 days AND readiness < 60% (assignments)
- Due within 7 days AND readiness < 60% (exams — longer prep window)
- OR: overdue (any readiness)

If the closest deadline is >3 days away or readiness is >60%, no banner. The student is either on track or the deadline isn't imminent.

### Data loading

Nudge data is computed from the same `Assignments.getByCourse` + `CourseSchedule.getByCourse` + `loadSkillsV2` queries that the assignment picker uses. Load in a `useEffect` inside ModePicker (component-local, same pattern as HomeScreen info bars). Cache in local state — survives re-renders but not unmounts.

---

## 2. Skill Picker Urgency Badges

### Problem
The skill picker (mode = "skills") sorts weakest-first but has no deadline context. A student sees "Recursion — 15%" and "Sorting Algorithms — 22%" but doesn't know that Sorting Algorithms is needed for HW 5 due tomorrow while Recursion isn't needed for anything imminent.

### Design: Inline deadline tag on skills needed for upcoming work

```
  ┌────────────────────────────────────────────┐
  │  Sorting Algorithms            22%         │
  │  Not yet practiced  Needed for HW 5 (2d)   │
  └────────────────────────────────────────────┘
  ┌────────────────────────────────────────────┐
  │  Recursion                     15%         │
  │  Not yet practiced                          │
  └────────────────────────────────────────────┘
```

**Badge format:** `Needed for [title] ([N]d)` — appended to the existing second line (after "Last: Good | 3d ago" or "Not yet practiced").

**Badge style:**
- Font: 11px (matches existing metadata line)
- Color: `T.am` when due <7 days, `T.ac` when due >7 days
- No background pill — too noisy in a list of 20+ skills. Inline colored text is sufficient.
- Separated from existing metadata by ` | ` pipe (consistent with existing separators)

**Multiple assignments needing the same skill:** Show only the soonest one. `Needed for HW 5 (2d)` even if HW 7 also needs it.

### Sort order: Deadline-relevant skills promoted, not reordered

**Decision: Keep weakest-first sort, but promote deadline-relevant skills to the top of their strength tier.**

The existing sort is `strength ascending` (weakest first). Within the same strength range, deadline-relevant skills sort before non-deadline skills. This means:
- A 15% skill needed for HW 5 (due in 2d) sorts before a 15% skill with no deadline
- A 60% skill does NOT sort above a 15% skill just because it has a deadline

**Rationale:** Reordering the entire list by deadline would break the "weakest first" mental model that the subtitle promises. Promotion within strength bands preserves the model while surfacing urgency.

### Data source

The skill-to-assignment mapping is derived from `assignment_question_skills` table (same data `selectMode("assignment")` already loads). When building skill picker data, cross-reference each skill ID against all upcoming assignments' required skills. This adds one query (`Assignments.getByCourse`) to the skill picker flow.

---

## 3. Session Auto-Suggestion (Pre-Highlighted Mode)

### Problem
The 5 mode buttons are equally weighted. A student with HW 5 due tomorrow at 30% readiness sees the same neutral picker as a student with nothing due for 2 weeks. The app could nudge toward "Work on an assignment" when deadlines are tight.

### Design: Visual emphasis on the suggested mode button

```
  ┌─────────────────────────────────────────────┐
  │  ⚠  HW 5 — due in 2 days · 31% ready       │
  │  [Work on it]                      [Dismiss] │
  └─────────────────────────────────────────────┘

  [ Work on an assignment ]  ← accent background (T.acS + T.acB border)
  [ Recap last session    ]  ← normal (T.sf + T.bd)
  [ Skill work            ]  ← normal
  [ Prepare for exam      ]  ← normal
  [ Explore a topic       ]  ← normal
```

**Visual treatment of suggested mode:**
- Background: `T.acS` (accent subtle — same blue tint as already used for the "Work on an assignment" button)
- Border: `1px solid T.acB` (accent border)
- This is the **existing** style for the assignment button (line 51-52 of ModePicker). The change is that OTHER modes also get this treatment when they're the suggested one.

Wait — the "Work on an assignment" button *already* has `T.acS` background and `T.acB` border (lines 51-52). The other 4 buttons use `T.sf` + `T.bd`. So the assignment button already looks "suggested" by default.

**Revised approach:** The auto-suggestion changes which button gets the accent treatment.

| Scenario | Suggested mode | Accent button |
|---|---|---|
| Assignment due <3d, readiness <60% | assignment | "Work on an assignment" (already accent — no change) |
| Exam due <7d, readiness <60% | exam | "Prepare for exam" gets accent; assignment button becomes normal |
| Skills with REVIEW DUE tag | skills | "Skill work" gets accent; assignment button becomes normal |
| No urgency | none | Assignment stays accent (default — existing behavior) |

**Not forced:** The suggestion is purely visual emphasis. All 5 buttons remain fully clickable. No modal, no confirmation, no auto-redirect.

### Trigger thresholds

| Trigger | Condition | Suggested mode |
|---|---|---|
| Assignment deadline | Due in <3 days AND readiness <50% | `assignment` |
| Exam deadline | Due in <7 days AND readiness <50% | `exam` |
| Overdue assignment | Past due, not completed | `assignment` |
| Overdue exam | Past due | `exam` |
| Spaced repetition | Any skill with `reviewDate <= today` | `skills` |
| Default | None of the above | `assignment` (current default) |

Priority: overdue > deadline < 3d > exam < 7d > spaced repetition > default.

**Readiness threshold for suggestion: <50%** (stricter than nudge banner's <60%). The auto-suggestion should only fire when the student genuinely needs to study, not when they're mostly prepared.

### Interaction with nudge banner

The nudge banner and auto-suggestion work together but are independent:
- **Nudge banner** tells the student *what* is urgent (specific assignment/exam name + due date + readiness)
- **Auto-suggestion** tells the student *where to start* (which mode button to click)
- Both appear/disappear based on the same deadline data
- Dismissing the nudge banner does NOT un-highlight the suggested mode button
- The suggested mode button highlight has no dismiss — it's subtle enough to be persistent

---

## 4. Data Flow Summary

```
ModePicker mounts
    │
    ├── useEffect([active.id])
    │   ├── Assignments.getByCourse(active.id)
    │   ├── CourseSchedule.getByCourse(active.id)  (exams)
    │   ├── loadSkillsV2(active.id)
    │   │
    │   ├── Compute: enriched assignments with avgStrength
    │   ├── Compute: enriched exams with avgStrength
    │   ├── Find: most urgent item (overdue > <3d > <7d exam)
    │   │
    │   └── Set state:
    │       ├── nudgeItem: { type, title, dueDate, readiness, assignment/exam }
    │       └── suggestedMode: "assignment" | "exam" | "skills" | null
    │
    ├── Render nudge banner (if nudgeItem && !nudgeDismissed)
    ├── Render mode buttons (suggestedMode gets accent style)
    │
    └── nudgeDismissed: local useState(false), not persisted
```

**Performance:** Same 2+N query pattern as HomeScreen info bars. For a typical course (5-10 assignments, 1-2 exams), total load time <100ms. Runs once on mount, no polling.

---

## 5. Edge Cases

| Scenario | Behavior |
|---|---|
| No assignments or exams at all | No nudge, no suggestion, default accent on assignment button |
| All assignments completed | No nudge (completed assignments filtered out) |
| Assignment overdue but completed | No nudge (status = "completed" excluded) |
| Multiple overdue items | Show the most recently overdue (closest to now) |
| Exam with no date | Skip for nudge (can't determine urgency without date) |
| Placeholder assignments (source = "syllabus", no materialId) | Skip for nudge — can't be worked on yet |
| Readiness = 0% (no skills extracted) | Still show nudge — "0% ready" is actionable (student needs to extract skills or study) |
| Course has no skills at all | Show nudge with "0% ready" but no auto-suggestion for skills mode |

---

## CEO Escalation

### E1: Nudge Banner Visual Treatment

**RESOLVED — CEO approved default.** Subtle colored card with matching urgency tint (red for overdue, amber for soon). Same visual language as overdue assignment cards in the picker. Border-radius 12px, padding 14px 18px. No icon glyph — text-only with color coding.
