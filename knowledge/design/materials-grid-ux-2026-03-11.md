# UX Design Direction: Materials Grid Redesign
**Date:** 2026-03-11
**Project:** study
**Status:** Implemented

---

## Overview
Redesign of the materials management screen from a vertical list of full-detail cards to a compact grouped grid with expand-in-place detail.

## Design Principles Applied
- **Progressive disclosure** — show only what's needed to identify and scan; detail on demand
- **Spatial grouping** — materials organized by type for faster scanning when managing many files
- **Consistent status language** — colored dots on compact cards use the same color vocabulary as full badges

## Design Direction

### Before
- Full-width vertical stack of cards
- Every material shows all detail (stats, skills, actions) regardless of whether user needs it
- Long scroll for courses with many materials
- No grouping — all materials in one flat list

### After
- 3-column grid of compact cards grouped by material type
- Each card shows: type badge, title (2 lines), status dot
- Click to expand in-place — full detail slides open, spanning all columns
- Collapsible group headers reduce visual noise further
- Status filter tabs preserved above grid

### Interaction model
1. **Scan** — user sees grouped grid, identifies material by type + name + status color
2. **Drill in** — click card to expand, see full stats/skills/actions
3. **Act** — start studying, retry extraction, remove, etc.
4. **Collapse** — click × to close detail, return to grid

## CEO Decisions Made
- Grouped with collapsible sections (not flat grid, not just badges)
- Expand in-place (not modal, not page replacement)
- Keep status filter tabs above grid

## Assumptions
- 3 columns is appropriate for the 900px container width
- Users will typically have 3-15 materials per course
- The compact card provides enough info to identify materials without expansion
