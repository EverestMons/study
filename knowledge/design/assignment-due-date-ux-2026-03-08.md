# Assignment Due Dates & Picker — UX Design Direction
**Date:** 2026-03-08
**Designer:** Study UX Designer
**Context:** Phase 3 of Assignment Scheduler spec
**Handoff:** DEV

---

## 1. Date Picker Affordance

### Current State
Due dates display as static blue text ("Mar 15, 2026") at the top-right of each assignment card in the picker. No editing is possible. Placeholder assignments from syllabus parsing may have estimated due dates; decomposed assignments have none.

### Proposed Interaction

**Placement:** Same position as the current date display — top-right of the card header row, next to the expand/collapse arrow.

**Affordance:** The due date area becomes a clickable target. On hover, a subtle edit indicator appears (pencil icon via Unicode `✎` or underline treatment). Clicking opens a native `<input type="date">` inline.

```
┌─────────────────────────────────────────────────┐
│  Homework 3                    Oct 11 ✎    v    │
│  3 questions | 5 skills needed | readiness: 62% │
└─────────────────────────────────────────────────┘
```

**States:**
| State | Display | Color | Interaction |
|---|---|---|---|
| Has due date | "Oct 11" or "in 2 days" | Urgency color (see §3) | Click → date input, hover → edit hint |
| No due date | "No due date" | `T.txM` (#64748B) | Click → date input |
| Editing | Native date picker | — | Change fires `Assignments.updateDueDate()` |

**Implementation:** Use a hidden `<input type="date">` positioned behind the display text. On click, `inputRef.current.showPicker()` opens the native calendar. On `onChange`, call `Assignments.updateDueDate(id, epoch)` and update picker state.

**Why native date input:** Cross-platform (WebKit renders macOS system picker), zero dependency cost, accessible, keyboard-navigable. Avoids a custom date picker component (over-engineering for a single use).

**Empty state treatment:**
- "No due date" shown in muted text (`T.txM`)
- Same click-to-edit behavior as dates
- After setting a date, text updates immediately (optimistic UI)

---

## 2. Assignment Picker Sort Order

### Current State
Assignments are displayed in DB insertion order (unsorted). No priority signaling.

### Proposed: Soonest-First with Sections

Sort assignments into three groups, each sorted by due date ascending within the group:

```
── UPCOMING ──────────────────────────────
  Homework 3              in 2 days  ▸
  Lab Report 2            Oct 15     ▸

── LATER ─────────────────────────────────
  Final Project           Dec 1      ▸

── NO DUE DATE ───────────────────────────
  Homework 5                         ▸
```

**Sort logic:**
1. **Overdue + < 7 days:** Top group. Sorted by due date ascending (most urgent first).
2. **> 7 days:** Middle group. Sorted by due date ascending.
3. **No due date (`null`):** Bottom group. Sorted by title alphabetically.

**Section headers:** Lightweight divider labels in `T.txM`, uppercase, small font (11px), `letterSpacing: 0.05em`. Only shown if the group is non-empty. No headers if all assignments are in one group.

**Data requirement:** `loadAssignmentsCompat` currently converts `dueDate` epoch to a formatted string and discards the epoch. The sort and urgency logic needs the raw epoch. Add `dueDateEpoch` (the raw integer) alongside the existing formatted `dueDate` string.

---

## 3. Urgency Color Scheme

### Thresholds and Colors

**CEO ESCALATION:** The color values and exact thresholds below are a starting proposal. Final aesthetic choices should be approved by the CEO.

| Condition | Due date color | Card border accent | Background tint |
|---|---|---|---|
| **Overdue** (past due) | `T.rd` (#F87171) | `rgba(248,113,113,0.3)` | `rgba(248,113,113,0.06)` |
| **< 48 hours** | `T.rd` (#F87171) | `rgba(248,113,113,0.2)` | none |
| **< 7 days** | `T.am` (#FBBF24) | none | none |
| **> 7 days** | `T.ac` (#6C9CFC) | none | none |
| **No due date** | `T.txM` (#64748B) | none | none |

**Rationale:**
- Re-uses existing theme tokens (`T.rd`, `T.am`, `T.ac`, `T.txM`) — no new colors
- Red for urgent is universal; amber for "coming soon" matches the existing skill strength amber
- Overdue gets the strongest visual treatment (tinted background + border accent) — it's the only state that demands action
- < 48h gets red text + subtle border accent without background tint — urgent but not yet overdue
- >= 7d uses the existing accent blue — informational, no urgency
- No due date is the most muted — it's not time-sensitive

**Overdue card treatment (expanded view):**
```
┌ rgba(248,113,113,0.3) border ────────────────────┐
│ rgba(248,113,113,0.06) background                 │
│  Homework 2           overdue by 3 days       v   │
│  3 questions | 5 skills needed | readiness: 45%   │
└───────────────────────────────────────────────────┘
```

### Helper Function

```javascript
function getUrgencyLevel(dueDateEpoch) {
  if (!dueDateEpoch) return 'none';
  const now = Math.floor(Date.now() / 1000);
  const diff = dueDateEpoch - now;
  if (diff < 0) return 'overdue';
  if (diff < 48 * 3600) return 'urgent';    // < 48h
  if (diff < 7 * 86400) return 'soon';      // < 7d
  return 'normal';                           // > 7d
}
```

---

## 4. Due Date Display Format

### Recommendation: Smart Hybrid

Use **relative** when the date is close (within 14 days or overdue), **absolute** when far out. This gives users the most actionable information at each range.

| Time to due date | Format | Example |
|---|---|---|
| Overdue > 1 day | "overdue by N days" | "overdue by 3 days" |
| Overdue < 1 day | "overdue" | "overdue" |
| < 24 hours | "due today" | "due today" |
| 1 day | "tomorrow" | "tomorrow" |
| 2–14 days | "in N days" | "in 5 days" |
| > 14 days, same year | "Mon DD" | "Oct 11" |
| > 14 days, different year | "Mon DD, YYYY" | "Jan 15, 2027" |

**Rationale:**
- Within 14 days, relative time ("in 5 days") creates urgency and is immediately actionable
- Beyond 14 days, absolute dates ("Oct 11") are easier to reference against a calendar
- "overdue by N days" is intentionally blunt — it should feel uncomfortable
- "due today" and "tomorrow" are special-cased because they're the most common urgent states

### Formatter Function

```javascript
function formatDueDate(dueDateEpoch) {
  if (!dueDateEpoch) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = dueDateEpoch - now;
  const days = Math.floor(Math.abs(diff) / 86400);

  if (diff < 0) {
    if (days === 0) return 'overdue';
    return 'overdue by ' + days + (days === 1 ? ' day' : ' days');
  }
  if (days === 0) return 'due today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return 'in ' + days + ' days';

  const d = new Date(dueDateEpoch * 1000);
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() === thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
```

---

## 5. Data Flow Changes Required

### `loadAssignmentsCompat` (StudyContext.jsx)
Currently discards the raw epoch when formatting:
```javascript
// CURRENT:
if (a.dueDate) {
  a.dueDate = new Date(a.dueDate * 1000).toLocaleDateString(...);
}

// PROPOSED: keep epoch for sort + urgency
a.dueDateEpoch = a.dueDate || null;  // raw epoch (integer or null)
if (a.dueDate) {
  a.dueDate = formatDueDate(a.dueDate);  // smart hybrid string
}
```

### `selectMode("assignment")` (StudyContext.jsx)
Add sort before `setPickerData`:
```javascript
enriched.sort((a, b) => {
  if (a.dueDateEpoch && b.dueDateEpoch) return a.dueDateEpoch - b.dueDateEpoch;
  if (a.dueDateEpoch) return -1;  // dated before undated
  if (b.dueDateEpoch) return 1;
  return (a.title || '').localeCompare(b.title || '');
});
```

### `ModePicker.jsx` — Assignment Card
- Replace static `T.ac` color on due date with urgency-based color
- Add urgency-based card border/background tint for overdue
- Add hidden `<input type="date">` with click handler
- Use `formatDueDate(a.dueDateEpoch)` for display
- On date change: `Assignments.updateDueDate(id, newEpoch)` + local state update

---

## 6. Scope for DEV

| Item | File(s) | Complexity |
|---|---|---|
| Add `dueDateEpoch` to `loadAssignmentsCompat` | StudyContext.jsx | Low |
| Add `formatDueDate` + `getUrgencyLevel` helpers | syllabusParser.js or new util | Low |
| Sort assignments in `selectMode` | StudyContext.jsx | Low |
| Urgency colors on due date text | ModePicker.jsx | Low |
| Overdue card tint (border + background) | ModePicker.jsx | Low |
| Date picker input (native) | ModePicker.jsx | Medium |
| Date change → DB update + state refresh | ModePicker.jsx + StudyContext.jsx | Medium |

**Estimated total:** ~80–100 lines of changes across 2–3 files.

---

## 7. CEO Decision Points

The following aesthetic decisions are escalated for CEO review:

1. **Urgency color thresholds:** Are <48h (red), <7d (amber), >7d (blue) the right breakpoints? Or should the "red zone" extend to <72h?
2. **Overdue card treatment:** Background tint + border accent, or just text color change? How prominent should overdue feel?
3. **Section headers in picker:** Show "UPCOMING / LATER / NO DUE DATE" labels, or just sort without visual sections?
4. **Edit affordance visibility:** Pencil icon on hover only, always visible, or different indicator?
