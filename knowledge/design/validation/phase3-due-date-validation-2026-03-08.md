# Phase 3 — Due Date UX Validation Report
**Date:** 2026-03-08
**Validator:** Study UX Validator
**Design spec:** `knowledge/design/assignment-due-date-ux-2026-03-08.md`
**Implementation:** ModePicker.jsx (assignment picker), StudyContext.jsx (formatDueDate, sort)

---

## Verdict: APPROVED with 2 recommendations

The implementation faithfully follows the design spec. Sort order, urgency colors, and date formatting all work as designed. Two discoverability gaps are flagged for future improvement — neither blocks ship.

---

## 1. Date Picker Discoverability

### Question: Does a student know they can set a due date?

**Assessment: Weak — functional but not self-evident**

The date area has:
- `cursor: pointer` on hover
- `title="Click to set due date"` tooltip (appears after ~1s hover delay)
- Click triggers native date picker via `showPicker()`

What it lacks:
- **No visual edit affordance.** The design spec proposed a pencil icon (`✎`) or underline on hover (spec section 1, "Affordance"). The implementation omits both. The date text looks identical in rest and hover states — no visual change signals interactivity.
- **No cursor differentiation from the card.** The entire card header row is `cursor: pointer` (for expand/collapse). The date area is also `cursor: pointer`. A student clicking anywhere on the header row gets the same cursor, so the date area doesn't stand out as a separate click target.
- **Tooltip delay.** The `title` attribute tooltip only appears after the OS-level hover delay (typically 0.5–1.5s). Students scanning quickly won't see it.

**Real-world scenario:** A student opens the assignment picker, sees "No due date" in gray text, and reads it as a passive label — not an interactive element. They would need to accidentally click it or hover for >1s to discover the picker. Students with existing due dates (e.g., "in 5 days") are even less likely to try clicking what looks like static informational text.

**Severity:** Low — students who received dates from syllabus parsing don't need to manually set dates. Manual date setting is a power-user correction flow, not a primary path. But it should still be findable.

**Recommendation R1:** Add a hover underline or subtle color shift on the date text to signal clickability. Minimal change:
```javascript
onMouseEnter={e => e.currentTarget.querySelector('span').style.textDecoration = 'underline'}
onMouseLeave={e => e.currentTarget.querySelector('span').style.textDecoration = 'none'}
```
This is 2 lines and makes the date feel interactive without adding visual clutter at rest.

---

## 2. Assignment Sort Order

### Question: Does soonest-first make sense without explanation?

**Assessment: Strong — intuitive and self-reinforcing**

The sort order (soonest-first, nulls last) is the most natural mental model for "what do I need to work on?" It matches:
- Email clients (oldest unread first)
- Task managers (due soonest first)
- Calendar views (chronological)

Supporting signals that reinforce the order without explanation:
- **Urgency colors create a visual gradient.** Red (overdue) at top, amber (soon) in middle, blue (normal) lower, gray (no date) at bottom. A student scanning top-to-bottom naturally reads urgency decreasing.
- **Relative date labels add context.** "overdue by 3 days" → "tomorrow" → "in 5 days" → "Oct 11" → "No due date" reads as a descending urgency narrative.
- **Overdue card treatment.** The red-tinted background and border on overdue cards creates a strong visual anchor at the top. Students immediately understand "these are the ones I need to worry about."

**One gap:** The subheading says "Study will focus on teaching what you need for the one you choose" — this is mode-descriptive, not sort-descriptive. It doesn't explain why the list is ordered this way. However, the ordering is conventional enough that no explanation is needed. Adding "Sorted by due date" would be over-explaining.

**Assessment: No changes needed.**

---

## 3. Urgency Color System

### Question: Can a student distinguish "urgent" from "upcoming" at a glance?

**Assessment: Strong — clear three-tier visual hierarchy**

The color system uses three visually distinct tiers against the dark background (`T.bg: #0F1115`):

| Level | Color | Hex | Contrast | Reads as |
|---|---|---|---|---|
| Overdue / Urgent | Red | #F87171 | High vs dark bg | "Danger / act now" |
| Soon (<7d) | Amber | #FBBF24 | High vs dark bg | "Attention / coming up" |
| Normal (>7d) | Blue | #6C9CFC | Medium vs dark bg | "Informational / fine for now" |
| None | Muted gray | #64748B | Low vs dark bg | "Not time-sensitive" |

**Why this works:**
- **Red vs amber** is the most culturally universal urgency distinction (traffic lights, warning systems, notifications). Students don't need to learn this.
- **Blue for normal** is correctly neutral — it doesn't trigger urgency but is still visible. Blue is the app's accent color, so "normal" dates feel native to the UI rather than like a warning that hasn't fired yet.
- **Gray for none** correctly recedes. It communicates "this doesn't have a date" without competing with dated assignments for attention.
- **Overdue gets the strongest treatment** — not just red text but red background tint + red border. This is the correct hierarchy: overdue cards demand more attention than "urgent but not yet due" cards. A student scanning the list will see overdue cards as visually distinct blocks, not just differently-colored text.

**One subtlety:** Overdue and urgent (<48h) share the same text color (`T.rd`). They're distinguished by the card treatment (overdue gets background tint + border, urgent does not). At a glance, a student might not immediately distinguish "overdue by 1 day" from "due tomorrow" by color alone — but the text labels handle this clearly ("overdue by 1 day" vs "tomorrow").

**Assessment: No changes needed.**

---

## 4. Null State

### Question: Does "No due date" communicate that the student can add one?

**Assessment: Adequate but passive**

Current treatment:
- Text: `"No due date"` in `T.txM` (#64748B, muted gray)
- Same click-to-edit behavior as dated assignments
- Same tooltip: `title="Click to set due date"`

**What works:**
- The phrasing "No due date" correctly describes the state — it's factual and not confusing. A student won't misread it as "this assignment has no deadline" in a way that feels contradictory.
- The muted gray color correctly signals "this is less important than dated assignments."
- Placement is consistent with where dates appear on other cards, so students who have interacted with dated cards will recognize the position.

**What's weak:**
- "No due date" reads as a status label, not an action prompt. Compare:
  - `"No due date"` — passive description (current)
  - `"Set due date"` — action prompt (more discoverable)
  - `"No due date — click to set"` — hybrid (most explicit but verbose)
- The muted gray reinforces passivity. Ironically, the design choice to make undated assignments visually recede also makes the edit affordance recede.

**Same root issue as section 1** — no visual cue that the text is interactive. The tooltip helps but requires a hover dwell.

**Recommendation R2:** Change the null-state label from `"No due date"` to `"Add due date"` to frame it as an action rather than a status. This is a 1-word change (`"Add"` → active verb) and shifts the mental model from "this has no date" to "I can set a date here."

---

## Spec Compliance Check

| Design Spec Item | Implemented | Match |
|---|---|---|
| Date picker placement (top-right, next to expand arrow) | Yes — `gap: 8` between date and `▴`/`▾` | Exact |
| Hidden `<input type="date">` behind display text | Yes — `opacity: 0, width: 0, height: 0` | Exact |
| `showPicker()` on click | Yes — `e.currentTarget.querySelector('input')?.showPicker()` | Exact |
| Urgency color thresholds (<48h, <7d, >7d) | Yes — `getUrgencyLevel` matches spec | Exact |
| Overdue card treatment (red bg + border) | Yes — `rgba(248,113,113,0.06)` bg, `0.3` border | Exact |
| Smart hybrid date format (relative + absolute) | Yes — `formatDueDate` in StudyContext.jsx | Exact |
| Soonest-first sort, nulls last | Yes — both code paths | Exact |
| End-of-day epoch (`T23:59:59`) | Yes — line 220 | Exact |
| Optimistic state update on date change | Yes — `setPickerData` updater | Exact |
| Hover edit indicator (pencil `✎` or underline) | **No** — omitted | Gap (see R1) |
| "No due date" display in `T.txM` | Yes | Exact |
| Section headers (UPCOMING / LATER / NO DUE DATE) | No — CEO approved defaults without headers | Correct per CEO |

---

## Summary

| Area | Rating | Action |
|---|---|---|
| Date picker discoverability | Adequate | R1: Add hover underline |
| Sort order | Strong | None |
| Urgency colors | Strong | None |
| Null state clarity | Adequate | R2: "Add due date" label |

**R1** and **R2** are both low-effort improvements (2 lines and 1 word respectively) that can be batched into a polish pass or addressed in a future sprint. Neither blocks the Phase 3 checkpoint.
