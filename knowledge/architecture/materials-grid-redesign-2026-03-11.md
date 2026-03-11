# Materials Grid Redesign — Architecture Blueprint
**Date:** 2026-03-11
**Project:** study
**Assigned By:** CEO
**Status:** Implemented

---

## Overview

Redesign of the MaterialsScreen from a vertical full-width card list to a grouped, compact grid with expand-in-place detail views. The goal is to reduce visual clutter when managing many materials, organize by type, and only show full detail on demand.

## Design Decisions

### Layout: 3-column grid with grouped sections
- Materials grouped by `classification` field (textbook, slides, lecture_transcript, assignment, notes, syllabus)
- Each group has a collapsible header with name and count
- Compact cards in a `grid-template-columns: repeat(3, 1fr)` layout
- Container widened from 640px to 900px to accommodate 3 columns

### Compact card anatomy
- **Top row:** Type badge (Tb, Sl, As, etc.) + status dot (color-coded, animated pulse for active processing)
- **Body:** Material name, 2-line clamp via `-webkit-line-clamp: 2`
- **Size:** ~72px min-height, padding 12px 14px
- Hover: border highlights to `T.acB`, background to `T.sfH`

### Status dot colors (replaces full badge on compact view)
| State | Color | Animated |
|---|---|---|
| ready | `T.gn` (green) | No |
| reading / analyzing / extracting | `T.ac` (blue) | Yes (pulse) |
| queued | `T.txM` (muted) | No |
| incomplete / partial | `T.am` (amber) | No |
| critical_error | `T.rd` (red) | No |

### Expand-in-place behavior
- Click compact card → `expandedCard` state set to `mat.id`
- Expanded card renders with `gridColumn: "1 / -1"` to span full width
- Contains the full detail view (identical to previous card bodies: header with badge, state-specific body, section list)
- Close button (×) in top-right resets `expandedCard` to null
- Only one card expanded at a time

### Grouping logic
- `CLS_ORDER` defines display order: textbook → slides → lecture_transcript → assignment → notes → syllabus
- Materials with unknown classification fall into "Other" at the end
- `collapsedGroups` state (Set) tracks which groups are collapsed
- Click group header toggles collapse — triangle indicator (▶ collapsed, ▼ expanded)

### State management (new)
| State | Type | Purpose |
|---|---|---|
| `expandedCard` | `string \| null` | Which material card is expanded |
| `collapsedGroups` | `Set<string>` | Which classification groups are collapsed |

### Preserved from previous design
- Status filter tabs (All, Ready, Needs Attention, Failed) — unchanged
- Upload area (drag-and-drop + folder import) — unchanged
- All modals (chunk picker, error log, folder picker) — unchanged
- Processing card body with Stop button — unchanged
- Queued card body — unchanged
- Section list expandable — unchanged

## Schema / Structure

```
MaterialsScreen
├── Top bar (back, settings)
├── Container (max-width: 900px)
│   ├── Title + course name
│   ├── Upload area (drag/drop + folder import + file list)
│   ├── Status filter tabs (All | Ready | Needs Attention | Failed)
│   └── Grouped grid
│       ├── Group: "Textbooks" (collapsible header)
│       │   └── 3-col grid
│       │       ├── CompactCard (or ExpandedDetail if selected)
│       │       ├── CompactCard
│       │       └── CompactCard
│       ├── Group: "Lecture Slides" (collapsible header)
│       │   └── 3-col grid
│       │       └── ...
│       └── ...
├── ChunkPickerModal
├── ErrorLogModal
└── FolderPickerModal
```

## Reuse Pattern

This grouped-grid-with-expand pattern can be applied to other list views in the app. The key components are:

1. **Grouping logic** — sort items into buckets by a classification field, define display order
2. **Collapsible group headers** — `collapsedGroups` Set state, triangle toggle
3. **Compact card** — small card with just enough info to identify the item + status indicator
4. **Expand-in-place** — `expandedCard` state, `gridColumn: "1 / -1"` for full-width expansion
5. **Status dot** — color-coded circle replacing full badge text on compact view

To reuse: extract the grouping logic and grid shell into a shared component, parameterize the compact card renderer and expanded detail renderer.

## Integration Points

- `getMaterialState()` from StudyContext — drives both status dot color and expanded card body
- `computeTrustSignals()` from StudyContext — provides stats for expanded detail
- `expandedMaterial` state (existing, for section list) coexists with new `expandedCard` state (for grid expand)

## Open Questions / Flags

- Grid responsiveness: currently fixed 3-col. On narrow windows, cards may get too small. Future: media query or `minmax(200px, 1fr)` for auto-responsive columns.
- When a material is actively processing, its compact card pulses — but the expanded card may be more useful to keep open. Consider auto-expanding the processing material.
