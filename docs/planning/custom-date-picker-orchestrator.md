# Custom Date Picker — Orchestrator Plan

**Date:** 2026-03-09
**Spec Reference:** Inline — no separate spec (small, self-contained component)
**Project:** study
**Status:** Ready for execution
**Trigger:** Native macOS date picker (bright white, unstyled) clashes with the dark app theme. Need a custom calendar component that matches the existing design system.

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **UXD** | Study UX Designer | Design & Experience |
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **UXV** | Study UX Validator | Design & Experience — Validation |

---

## Scope

A single shared React component (`DatePicker.jsx`) that replaces all native `<input type="date">` usage across the app. Dark-themed, matches existing design tokens, renders as a popover anchored to the trigger element.

**Consumers:**
- `ScheduleScreen.jsx` — date pills on assignment cards (just added)
- `ModePicker.jsx` — date display on assignment picker cards (Phase 3)
- `MaterialsScreen.jsx` — potential future use on material cards

**Not in scope:** Time picker, date range selection, recurring dates. Just single-date selection with month navigation.

---

## Phase 1 · UXD · Design Direction

**Agent:** Study UX Designer
**Output:** `knowledge/design/custom-date-picker-ux-2026-03-09.md`

Design direction for a dark-themed calendar popover:

### Visual Design
- **Color palette:** Use existing theme tokens exclusively
  - Background: `T.sf` (#1A1D24) for the calendar body
  - Border: `T.bd` (#2A2F3A)
  - Day text: `T.tx` (#E8EAF0) for current month, `T.txM` (#64748B) for adjacent months
  - Today indicator: `T.ac` (#6C9CFC) ring or subtle background
  - Selected day: `T.ac` (#6C9CFC) filled background, dark text
  - Hover: `T.sfH` (#22262F) background on days
  - Month/year header: `T.tx` with `T.txD` for navigation arrows
  - Day-of-week headers (Su Mo Tu...): `T.txD` (#8B95A5)

### Layout
- 7-column grid for days, compact but readable
- Month/year header with left/right navigation arrows
- Day-of-week header row
- 6 rows of day cells (to handle months that span 6 weeks)
- Font: DM Sans (matches app), 13px for days, 14px for month header
- Cell size: ~32x32px, enough for touch targets without being oversized
- Overall width: ~260px (7 × ~36px + padding)
- Border-radius: 12px (matches card radius used throughout)
- Box shadow: subtle dark shadow for popover depth

### Positioning
- Renders as a fixed-position popover anchored below the trigger element
- If trigger is near bottom of viewport, popover renders above instead
- Horizontal: aligned to the right edge of the trigger (dates are right-aligned in cards)
- Small gap (4-8px) between trigger and popover

### Interaction
- Click trigger → popover appears with current month visible (or selected date's month)
- Click a day → selects it, fires `onChange(epoch)`, popover closes
- Click outside popover → closes without selection
- Left/right arrows in header → navigate months
- "Clear" link at bottom → fires `onChange(null)`, popover closes
- No keyboard navigation required for v1 (nice-to-have for later)

### States
| State | Visual |
|---|---|
| No date selected | Today highlighted with ring, no fill |
| Date selected | Selected day has `T.ac` fill, white text |
| Hover | `T.sfH` background on hovered day |
| Adjacent month days | `T.txM` text, still clickable (navigates month) |
| Today (not selected) | `T.ac` ring outline, no fill |

### Transition
- Popover fades in: `opacity 0→1, translateY 4px→0` over 150ms
- Matches existing `fadeIn` animation in theme

**Escalate to CEO:** Overall aesthetic feel — does the calendar feel native to the app?

---

## Phase 2 · SA · Component Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/custom-date-picker-2026-03-09.md`

### Component Interface

```jsx
<DatePicker
  value={epochSeconds | null}         // currently selected date (Unix epoch) or null
  onChange={(epochSeconds | null) => void}  // called on selection or clear
  anchorRef={React.RefObject}         // ref to the trigger element for positioning
  onClose={() => void}                // called when popover should close
/>
```

### File Location
`src/components/DatePicker.jsx` — shared component, not screen-specific or study-specific

### Internal State
- `viewMonth` / `viewYear` — the currently displayed month (initialized from `value` or today)
- `position` — computed { top, left } from `anchorRef` bounding rect
- Click-outside listener (useEffect with document.addEventListener)

### Positioning Logic
```
const rect = anchorRef.current.getBoundingClientRect();
const spaceBelow = window.innerHeight - rect.bottom;
const popoverHeight = ~280px;

if (spaceBelow >= popoverHeight + 8) {
  // Render below
  top = rect.bottom + 4;
} else {
  // Render above
  top = rect.top - popoverHeight - 4;
}
// Align right edge of popover with right edge of trigger
right = window.innerWidth - rect.right;
```

### Render via Portal
Use `ReactDOM.createPortal(popover, document.body)` so the popover isn't clipped by `overflow: hidden` on parent containers. Position with `position: fixed`.

### Day Grid Generation
```
function getDaysInMonth(year, month) → number
function getFirstDayOfWeek(year, month) → 0-6 (Sunday=0)
// Generate 42 cells (6 rows × 7 cols)
// Fill leading days from previous month, trailing from next month
```

### Integration Pattern (for consumers)
Each consumer manages its own `showPicker` boolean state and an `anchorRef`:

```jsx
const [showPicker, setShowPicker] = useState(false);
const dateRef = useRef(null);

<span ref={dateRef} onClick={() => setShowPicker(true)}>
  {formattedDate || "Set date"}
</span>

{showPicker && (
  <DatePicker
    value={item.dueDateEpoch}
    onChange={(epoch) => { updateDate(epoch); setShowPicker(false); }}
    anchorRef={dateRef}
    onClose={() => setShowPicker(false)}
  />
)}
```

### No External Dependencies
Pure React + inline styles using theme tokens. No date libraries needed — just `new Date()` and basic arithmetic for month/day computation.

---
## Phase 3 · DEV · Implementation

**Agent:** Study Developer
**Input:** Design direction (Phase 1) + Architecture (Phase 2)
**Output:** `knowledge/development/custom-date-picker-2026-03-09.md`

### Step 3.1 · Build DatePicker.jsx

**Create:** `src/components/DatePicker.jsx`

Implement the calendar component per SA architecture:
- Month grid with navigation (prev/next month arrows)
- Day cells: current month in `T.tx`, adjacent months in `T.txM`
- Today: `T.ac` ring outline
- Selected: `T.ac` filled, dark text
- Hover: `T.sfH` background
- "Clear" link at bottom when a date is selected
- Portal rendering via `ReactDOM.createPortal`
- Click-outside-to-close via `useEffect` document listener
- Positioning logic from SA spec (below trigger, flip above if near viewport bottom)
- Fade-in animation matching existing `fadeIn` keyframes

**Estimated size:** ~150-180 lines

### Step 3.2 · Integrate into ScheduleScreen.jsx

**File:** `src/screens/ScheduleScreen.jsx`

Replace the current inline `<input type="date">` implementation in `renderCard` with:
1. Add `useState` for `pickerOpenId` (which card's picker is open, or null)
2. Add `useRef` per card date element (or a single ref that updates on click)
3. On date pill click: set `pickerOpenId` to the item's ID, capture ref
4. Render `<DatePicker>` when `pickerOpenId` matches
5. On `onChange`: call `Assignments.updateDueDate()`, update local state, close picker
6. On `onClose`: clear `pickerOpenId`

Remove the hidden `<input type="date">` and `showPicker()` call.

### Step 3.3 · Integrate into ModePicker.jsx

**File:** `src/components/study/ModePicker.jsx`

Same pattern as Step 3.2 — replace the hidden `<input type="date">` (around line 415) with the new `<DatePicker>` component.

The existing date pill styling and urgency colors stay the same. Only the picker mechanism changes from native input to custom component.

### Step 3.4 · Verify Build

- `npm run build` passes with no new warnings
- Both ScheduleScreen and ModePicker render the custom picker on date click
- Date selection persists to DB and updates UI optimistically

---

## Phase 4 · QA · Testing

**Agent:** Study Security & Testing Analyst
**Output:** `knowledge/qa/custom-date-picker-testing-2026-03-09.md`

Test scope:
- **Date selection:** Click a day → correct epoch stored. Verify day boundaries (start of day, end of day, timezone handling).
- **Month navigation:** Prev/next arrows work. January ← goes to December of previous year. December → goes to January of next year.
- **Today highlighting:** Today's date has ring indicator. Correct even after midnight rollover.
- **Selected state:** Previously selected date shows filled when picker reopens.
- **Clear:** "Clear" link sets date to null, UI updates to "Set date" / "No due date".
- **Click outside:** Clicking outside the popover closes it without changing the date.
- **Viewport positioning:** Trigger near bottom of screen → popover renders above. Trigger near top → popover renders below.
- **Portal isolation:** Popover not clipped by any parent `overflow: hidden`.
- **Multiple consumers:** Open picker in ScheduleScreen, close, open in ModePicker — no state leakage.
- **Edge cases:** Feb 29 in leap years. Months with 28/30/31 days render correct grid. Year 2026-2030 range.
- **No regression:** Existing date display, urgency colors, and sort order unaffected.

---

## Phase 5 · UXV · Validation

**Agent:** Study UX Validator
**Output:** `knowledge/design/validation/custom-date-picker-validation-2026-03-09.md`

Validate:
- **Visual fit:** Does the calendar feel native to the app? Does it match the dark theme without looking out of place?
- **Discoverability:** Is it obvious that the date pill is clickable? Does the hover state communicate interactivity?
- **Positioning:** Does the popover feel anchored to the trigger? Is the gap appropriate? Does the flip behavior feel natural?
- **Speed:** Does the popover appear instantly? Any lag on month navigation?
- **Clarity:** Can the student distinguish today vs selected vs adjacent month days at a glance?
- **"Set date" affordance:** For assignments with no date, is "Set date" clear enough as an invitation to click?
- **Clear action:** Is the "Clear" link discoverable? Does removing a date feel safe (not destructive)?

**Escalate to CEO:** Overall aesthetic assessment — does this feel like a premium, native component?

---

## Execution Summary

| Phase | Agent | Output | Dependencies |
|---|---|---|---|
| 1 | UXD | Design direction | None |
| 2 | SA | Component architecture | Phase 1 |
| 3 | DEV | Implementation (3 steps) | Phases 1-2 |
| 4 | QA | Testing report | Phase 3 |
| 5 | UXV | Validation report | Phase 3 |

**Estimated total:** ~180 lines new code (DatePicker.jsx) + ~30 lines changed per consumer (ScheduleScreen, ModePicker). No new dependencies.

**Files created:**
- `src/components/DatePicker.jsx`

**Files modified:**
- `src/screens/ScheduleScreen.jsx` — replace hidden input with DatePicker
- `src/components/study/ModePicker.jsx` — replace hidden input with DatePicker

**Files NOT changed:**
- `src/lib/db.js` — `Assignments.updateDueDate()` already exists
- `src/lib/theme.jsx` — all tokens already defined
- `src/lib/fsrs.js` — untouched
