# Phase 3 — Due Dates on Assignments + Edit Affordance — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer Agent
**Design:** `knowledge/design/assignment-due-date-ux-2026-03-08.md`
**Build:** `npm run build` passes (83 modules, 923.46 kB main chunk)

---

## Summary

Added urgency-aware due date display, soonest-first sort order, native date picker editing, and overdue card treatment to the assignment picker. ~85 lines of changes across 2 files.

---

## Changes

### `src/StudyContext.jsx` (MODIFIED)

**`formatDueDate(dueDateEpoch)`** (new module-level helper, ~12 lines)
- Smart hybrid format: relative when close, absolute when far
- Overdue: "overdue" / "overdue by N days"
- Imminent: "due today" / "tomorrow" / "in N days" (up to 14d)
- Far: "Oct 11" (same year) / "Oct 11, 2027" (different year)

**`loadAssignmentsCompat`** updated:
- Now preserves `a.dueDateEpoch` (raw integer epoch) alongside formatted `a.dueDate`
- Uses `formatDueDate()` instead of `toLocaleDateString` for display string

**`selectMode("assignment")`** — sort added to both code paths:
- Sort by `dueDateEpoch` ascending (soonest first)
- `null` due dates pushed to bottom
- Undated assignments sorted alphabetically by title
- Applied to both the direct-load path (line ~619) and the decomposition-retry path (line ~596)

### `src/components/study/ModePicker.jsx` (MODIFIED)

**New imports:** `Assignments` from db.js

**`getUrgencyLevel(dueDateEpoch)`** (new module-level helper):
- Returns `'overdue'` | `'urgent'` (<48h) | `'soon'` (<7d) | `'normal'` (>7d) | `'none'` (null)

**`URGENCY_COLORS`** map:
- `overdue`/`urgent` → `T.rd` (#F87171)
- `soon` → `T.am` (#FBBF24)
- `normal` → `T.ac` (#6C9CFC)
- `none` → `T.txM` (#64748B)

**Assignment card changes:**
1. **Due date color** — dynamic based on urgency level instead of static `T.ac`
2. **Overdue card treatment** — red-tinted background (`rgba(248,113,113,0.06)`), red border (`rgba(248,113,113,0.3)`), red hover
3. **"No due date" display** — shown in muted text (`T.txM`) when `dueDate` is null
4. **Date picker** — hidden `<input type="date">` behind due date text. Click opens native calendar via `showPicker()`. On change: `Assignments.updateDueDate(id, epoch)` + optimistic local state update with re-formatted display string
5. **Expand/collapse arrows** — upgraded from `^`/`v` ASCII to `▴`/`▾` Unicode triangles
6. **Card key** — changed from index `i` to `a.id || i` for stable React keys

---

## Design Decisions

1. **`formatDueDate` in StudyContext.jsx** — co-located with `loadAssignmentsCompat` which is the only consumer. Avoids adding a cross-module dependency from ModePicker to syllabusParser.
2. **`getUrgencyLevel` in ModePicker.jsx** — only used for visual treatment in the picker UI. No reason to export it.
3. **Optimistic date update** — date picker `onChange` updates both DB and local pickerData state immediately. No full re-fetch needed since only the due date changed.
4. **Native date input** — `<input type="date">` with `showPicker()` API. Zero dependency, cross-platform (WebKit system picker on macOS). Hidden behind display text with `opacity: 0, width: 0, height: 0`.
5. **No section headers** — CEO approved defaults without explicit section dividers. Sort alone provides sufficient visual grouping (overdue cards have red treatment, creating a natural visual break).
6. **Due date set to end of day** — `new Date(val + 'T23:59:59')` ensures the assignment isn't marked overdue on the due date itself.
