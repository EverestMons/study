# Phase 5 — Deadline Intelligence — UX Validation Report
**Date:** 2026-03-08
**Validator:** Study UX Validator
**Scope:** Nudge banner, skill picker badges, exam auto-scope, auto-suggestion, learning science risk
**Input:** Implemented UI (Steps 5.3–5.5), design direction (Step 5.1)

---

## Verdict: APPROVED

No blocking issues. 2 non-blocking recommendations documented.

---

## 1. Nudge Banner — Helpful or Annoying?

### Assessment: Helpful, not annoying

**What works:**
- **Single-item focus** — only the most urgent deadline is shown, not a list. This prevents overwhelm. A student opening the app sees one actionable prompt, not a wall of warnings (ModePicker.jsx:161 — `candidates[0]` only).
- **Subtle visual treatment** — low-opacity background tints (`rgba(248,113,113,0.08)` red, `rgba(245,158,11,0.06)` amber) with matching border. The banner is visible but doesn't dominate the screen. It sits between the subtitle and the mode buttons — natural reading flow.
- **Information density is right** — title (truncated at 30ch), due label ("due in 2 days"), readiness percentage. Three data points, one line. No paragraph of text, no icons, no animations.
- **Dual-threshold filtering** — the banner only appears when both time pressure AND low readiness exist (line 91: `daysUntil <= 3 && avg < 0.6`). A student who is 70% ready for tomorrow's assignment won't see a nudge. This prevents "crying wolf" — the banner only appears when it has a real reason to.
- **Overdue exception** — overdue items always show regardless of readiness (line 88-91: `isOverdue` checked first). This is correct — an overdue assignment at 90% readiness still warrants awareness.

**Dismiss behavior:**
- One-click dismiss via "Dismiss" text button — lightweight, no confirmation dialog.
- `useState(false)` — resets on remount (next `enterStudy`). This means the nudge reappears next session, which is correct: if the deadline hasn't been addressed, the student should see it again.
- No "don't show again" persistence — appropriate for deadline-critical information.
- The dismiss button is visually quiet (`color: T.txM`, 12px, no border) — it reads as "available if you want it" rather than competing with the action button.

**Pressure calibration:**
- The banner uses color coding (red for <2 days/overdue, amber for 2-3 days) that creates appropriate urgency without alarm. No exclamation marks, no "WARNING", no shake animations.
- The readiness percentage provides agency — "30% ready" tells the student where they stand, not "you're going to fail." This frames the situation as improvable, not threatening.
- The action button ("Work on it" / "Start prep") is worded as an invitation, not a command.

### Pressure vs. Stress: PASS
The banner creates **awareness** rather than **anxiety**. Key design choices:
- Informational framing (percentage, days) over emotional framing (no "urgent!", no red alert icons)
- Single item, not a list of overdue items
- Easily dismissible
- Color accent is the most intense element, and it's still a low-opacity tint, not a solid block

---

## 2. Skill Picker — Urgency Badges

### Assessment: Helpful, not distracting

**What works:**
- **Inline metadata placement** — the badge appends to the existing metadata line (line 620: `" | Needed for " + s.deadlineTitle + " (" + s.deadlineDays + "d)"`). It follows the same visual pattern as "Last: Good | 3d ago" — students are already reading this line for context.
- **Conditional rendering** — only skills with a deadline within 14 days get a badge (StudyContext.jsx:656). Most skills in the picker won't have badges, so the ones that do naturally draw attention without creating visual noise.
- **Color semantics** — amber (`T.am`) for <7 days, accent (`T.ac`) for 7-14 days. This matches the urgency color system used elsewhere in the app (assignment cards, nudge banner).
- **Sort-time boost is subtle** — within a ±10% strength band, deadline skills sort higher (StudyContext.jsx:692-697). A skill at 15% with a deadline sorts above a skill at 15% without one — but a skill at 55% with a deadline does NOT sort above a skill at 15% without one. The weakest-first principle is preserved for meaningful strength differences.

**Interaction with existing logic:**
The skill picker description still says "Sorted by weakest first" (line 597). After the Phase 5 sort change, this is *mostly* true — the ±10% band only promotes deadline skills when they're already similarly weak to their neighbors. No user-visible lie.

**Badge does NOT:**
- Change the skill's displayed strength percentage
- Modify FSRS scheduling data
- Alter practice tier assignment
- Affect the "REVIEW DUE" badge (line 612) — both can appear on the same skill

### Distraction risk: LOW
The badge is text-only (no icons, no background highlight on the card), uses the existing font size (11px), and follows the established metadata pattern. A student who doesn't care about deadlines can ignore it — it doesn't demand action.

---

## 3. Exam Auto-Scope

### Assessment: Obvious and trustworthy

**What works:**
- **Visual pre-selection** — auto-scoped materials appear with a filled checkbox and accent background (`T.acS` + `T.acB` border) (lines 527-537). This is the same visual treatment as manually selected materials — no new UI pattern to learn.
- **Full deselection control** — clicking a pre-selected material immediately deselects it (lines 530-533). The toggle is instant, no confirmation. Students retain full control.
- **Count feedback** — the "Start exam prep (N selected)" button updates in real-time (line 561). Students can verify the selection count before committing.
- **Fuzzy matching is conservative** — bidirectional containment (`emName.includes(reading) || reading.includes(emName)`) after lowercasing (StudyContext.jsx:738). This catches "Chapter 1" ↔ "Chapter 1 - Introduction to Economics" but won't false-positive on unrelated materials.

**Trust signals:**
- The pre-selection happens silently — no "We auto-selected these for you!" banner. The materials are simply checked when the picker opens. This avoids drawing attention to the automation and instead lets students focus on whether the selection is correct.
- If auto-selection fails (no exam found, no `coversWeeks`, no matching readings), the picker opens empty — manual selection as usual (StudyContext.jsx:746). No error message, no "we couldn't find your exam" — just the normal experience.

**Trust risk: LOW**
Auto-selection that can be easily overridden is low-risk. The worst case is a false-positive match (an unrelated material gets pre-selected), which the student simply unchecks. No data is lost, no irreversible action is taken.

---

## 4. Auto-Suggestion — Suggestion or Command?

### Assessment: Suggestion, not command

**What works:**
- **Visual differentiation is subtle** — the suggested mode button gets `T.acS` background (light accent tint) and `T.ac` title color instead of `T.sf` background and `T.tx` color (lines 170-178). The difference is a slight color shift, not a dramatic contrast.
- **No label annotation** — there's no "Recommended" badge or arrow pointing at the suggested button. The accent tint is the only signal. Students who aren't looking for it may not even notice.
- **All buttons remain clickable** — no button is disabled, dimmed, or moved. The layout is identical regardless of which mode is suggested. The student's mental model of "5 equal options" is preserved.
- **Default fallback** — when no deadline nudge exists, the "assignment" mode gets the accent treatment (line 171: `!suggestedMode && mode === "assignment"`). This provides a default entry point without implying deadline urgency.

**Command risk: LOW**
The accent tint communicates "good starting point" rather than "you must click this." Key evidence:
- The button text and description are unchanged — no "Start here" or "Recommended" overlay
- The visual weight difference is approximately 10-15% — noticeable but not dominant
- Students who habitually click the same mode (e.g., always "Skill work") will continue doing so without friction

**Spaced repetition fallback:**
When no deadline candidates exist but FSRS reviews are due, `suggestedMode` is set to "skills" (line 149) but no nudge banner appears. This is a pure visual hint — the skill work button gets a subtle accent. This is the lightest possible touch for "you have reviews due" and avoids creating a notification-fatigue pattern.

---

## 5. Learning Science Risk — Cramming vs. Spacing

### Assessment: SAFE — No FSRS undermining

**Critical verification:**

| Risk | Mitigation | Verdict |
|---|---|---|
| Deadline urgency causes students to cram instead of spacing | The nudge banner does NOT disable or override FSRS scheduling. Clicking "Work on it" enters the normal assignment focus mode, which includes FSRS-aware practice tiers. The student studies the right way for the assignment, they're just doing it sooner. | SAFE |
| Priority boost breaks FSRS intervals | The skill picker sort is display-only. `deadlineTitle` and `deadlineDays` are attached during `.map()` in the sort phase (StudyContext.jsx:686-687) and never flow into `DB.savePractice`, `Mastery.update`, or any FSRS function. The FSRS algorithm runs identically regardless of deadline data. | SAFE |
| `buildDeadlineContext` causes the AI to push cramming strategies | The deadline context block provides facts (title, due date, readiness %, weakest skills) but no behavioral instruction. The system prompt's existing pedagogy (Socratic questioning, scaffolded hints, spaced practice) governs AI behavior. The AI knows what's due but still teaches the same way. | SAFE |
| Readiness percentage creates false confidence or panic | The percentage is computed from FSRS `effectiveStrength()` — the same metric used throughout the app for skill cards, assignment readiness, and practice tier placement. Students are already calibrated to this number. No new metric, no new scale. | SAFE |
| Students ignore non-deadline skills | The ±10% band ensures that a significantly weaker non-deadline skill still sorts above a moderately weak deadline skill (StudyContext.jsx:699 — strength difference dominates outside band). The existing "weakest first" principle governs 90%+ of the sort order. | SAFE |

**Design principle confirmation:**
The deadline intelligence layer operates as a **presentation overlay** on top of the existing FSRS-driven learning engine. It influences what students see first (sort order, visual nudge) but never what happens when they study (practice tiers, interval scheduling, difficulty updates). This separation is the correct architecture — it lets the app be deadline-aware without compromising the spacing algorithm that makes learning stick.

**One nuance worth noting:**
A student who exclusively follows the nudge banner might study only deadline-relevant skills and neglect non-deadline skills whose FSRS reviews are due. The spaced repetition fallback (line 148-149: highlight "Skill work" when reviews are due) partially addresses this, but only when no deadline nudge is active. This is acceptable — a student with an assignment due tomorrow has a real-world constraint that reasonably overrides the optimal spacing schedule for unrelated skills. The FSRS reviews will still be there after the deadline passes.

---

## Non-Blocking Recommendations

### R1: Consider "N reviews due" count on Skills button when deadline nudge is active
**Severity:** Enhancement
**Rationale:** When a deadline nudge is showing, the spaced repetition fallback (highlight Skills button) is suppressed because `suggestedMode` is already set to the deadline's mode. Students with overdue FSRS reviews won't see the accent on Skills. A small count badge ("3 reviews due") on the Skills button — independent of the mode accent system — would preserve FSRS visibility alongside deadline awareness.
**Impact if skipped:** Low — FSRS reviews don't expire, they just become slightly less optimal the longer they're delayed. Students who regularly use skill work will see their "REVIEW DUE" badges in the skill picker.

### R2: `formatNudgeDate` is the 3rd copy of date formatting logic
**Severity:** Maintenance
**Rationale:** `formatNudgeDate` (ModePicker.jsx:21-33) duplicates `formatDueDate` (StudyContext.jsx:24-36) and a similar formatter in ScheduleScreen.jsx:8-20. This is also noted in QA report item M4 and previous phase QA items. A shared `src/lib/dates.js` utility would prevent drift.
**Impact if skipped:** Low — all three implementations are stable and produce identical output. Risk increases only if formatting requirements change.
