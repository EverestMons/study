# UX Design Direction: Materials Staging Area Redesign
**Date:** 2026-03-13
**Project:** study
**Status:** Direction — pending CEO approval

---

## Overview

Redesign the MaterialsScreen staging area (upload + pending files) from its current narrow left-aligned vertical list into a centered, visually distinct intake step using the same grouped-grid pattern as the existing materials dashboard. Classification moves from per-card button rows to inline card interaction. The "Add to Course" button appears above the staged grid only once all files are classified.

---

## Design Principles Applied
- **Consistency** — staging grid reuses the same 3-column grouped-grid-with-expand pattern as the committed materials grid below
- **Progressive disclosure** — unclassified files surface classification controls; classified files show compact card state
- **Clear mode separation** — the staging area reads as a focused intake step, distinct from the operational materials dashboard
- **Spatial centering** — staging area spans the full 900px container width, centered, not left-aligned at 280px

---

## 1. Staging Area Layout

### Container
The staging area is a single container that holds the upload zone and the pending files grid. It spans the full 900px max-width (matching the materials dashboard below) and is centered.

### Pending Files Grid
Once files are staged, they render in the same grouped-grid pattern as committed materials:

- **3-column CSS grid**: `gridTemplateColumns: "repeat(3, 1fr)"`, `gap: 10`
- **Grouped by classification**: files that have been classified appear under their classification group header (e.g., "Textbooks (2)"). Collapsible with ▶/▼ toggle, matching the existing materials grid.
- **Unclassified group**: files without a classification appear in an **"Unclassified"** group pinned at the top of the grid, above all classification groups. This group is always expanded and cannot be collapsed — it represents work the user needs to complete.
- **Group ordering**: Unclassified → then `CLS_ORDER` (textbook, slides, lecture, assignment, notes, syllabus, reference)
- **Compact cards**: same 72px min-height card pattern. Type badge top-left (shows `CLS_ABBR` if classified, or "?" badge in `T.txM` if unclassified). No status dot (staging files have no processing status). Title with 2-line clamp. Remove button (× icon, top-right, `T.txM`, appears on hover).

### Empty state
When no files are staged, only the upload zone is shown. The grid appears as soon as one or more files are added.

---

## 2. Inline Classification Interaction

**Recommended approach: (a) Classify buttons directly on the card face**

Rationale: the classification set is small (7 options) and this is a one-time action per file. A dropdown/popover adds an extra click. Expanding the card is overkill for a single interaction. Direct buttons on the card keep the user in flow.

### Unclassified card layout
Unclassified cards are taller than compact cards to accommodate the classification buttons:

```
┌─────────────────────────┐
│ [?]              [×]    │  ← "?" badge (T.txM bg), remove button
│                         │
│ filename.pdf            │  ← title, 1-line truncation
│                         │
│ [Tb] [Sl] [Lc] [As]    │  ← classification buttons, row 1
│ [Nt] [Sy] [Rf]         │  ← classification buttons, row 2
└─────────────────────────┘
```

- Classification buttons: small pills using `CLS_ABBR` labels (Tb, Sl, Lc, As, Nt, Sy, Rf). Styled as `background: transparent`, `border: 1px solid T.bd`, `borderRadius: 6`, `padding: "3px 8px"`, `fontSize: 10`, `color: T.txD`. On hover: `borderColor: T.ac`, `color: T.ac`, `background: T.acS`.
- On click: file gets classified, card animates into the appropriate classification group below.

### Transition animation
When a file is classified:
1. Card fades out from the Unclassified group (`opacity: 0`, `transform: scale(0.95)`, 150ms)
2. If the target classification group doesn't exist yet, it appears with `fadeIn` animation
3. Card appears in the target group with `fadeIn` animation (the existing `@keyframes fadeIn`)

This is achieved by re-keying/re-rendering — React will naturally handle the DOM move. The CSS transitions on opacity/transform handle the visual smoothness.

### Reclassification
Classified compact cards show the `CLS_ABBR` badge. Clicking a classified card **expands it in-place** (same `gridColumn: "1 / -1"` pattern) to show the full classification button set, allowing reclassification. A "Done" or click-away collapses it back.

---

## 3. "Add to Course" Button

### Visibility
**Option B (CEO-selected):** The button appears only once all files in the staging area have a classification assigned. When any file is unclassified, the button is not rendered.

### Position
Above the staged files grid, below the upload zone. Layout:

```
┌──────────────────── 900px container ────────────────────┐
│                                                          │
│   [Upload zone — centered, see §6]                       │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │  [Add to Course]  ← full-width, prominent        │   │
│   └──────────────────────────────────────────────────┘   │
│                                                          │
│   Unclassified (3)                                       │
│   ┌────┐ ┌────┐ ┌────┐                                  │
│   │    │ │    │ │    │                                    │
│   └────┘ └────┘ └────┘                                   │
│                                                          │
│   Textbooks (2)                                          │
│   ┌────┐ ┌────┐                                          │
│   │    │ │    │                                           │
│   └────┘ └────┘                                          │
└──────────────────────────────────────────────────────────┘
```

### Visual treatment
- Full-width within the staging container
- `background: T.ac`, `color: "#0F1115"` (dark text on accent), `borderRadius: 10`, `padding: "12px 16px"`, `fontSize: 14`, `fontWeight: 700`
- Appears with `fadeIn` animation when the last file gets classified
- Label: **"Add to Course"** (replaces the current "Add Materials")

---

## 4. Visual Distinction: Staging vs. Management

The staging area should feel like a focused intake step — a visually bounded zone that the user "completes" before materials appear in the dashboard below.

### Treatment
- **Container background**: `background: T.sf` (one step lighter than page `T.bg`). This lifts the staging area above the page surface.
- **Border**: `border: "1px solid " + T.bd`, `borderRadius: 16`
- **Internal padding**: `padding: 24`
- **Bottom margin**: `marginBottom: 32` to create clear separation from the "Course Materials" section below

### Section separator
Between the staging container and the materials dashboard:
- `32px` vertical gap (the staging container's `marginBottom`)
- The existing "Course Materials (N)" uppercase label serves as the dashboard header — no additional divider needed

### When no files are staged
The staging container still renders (with just the upload zone inside), maintaining the visual boundary. This is the resting state.

### When staging is complete
After clicking "Add to Course", the staged files are committed. The staging container returns to its resting state (upload zone only). The committed materials appear in the dashboard below after processing.

---

## 5. Centering

The staging container spans the full `maxWidth: 900` container width and is centered via the existing `margin: "0 auto"` on the parent.

The upload zone within the staging container is **centered** within it (not left-aligned at 280px):
- `margin: "0 auto"` on the upload zone div
- This centers the drop zone and "Import from Folder" button

The pending files grid is full-width within the staging container (3 columns fill the space).

---

## 6. Upload Zone Width

**Recommendation: Keep at 280px, centered.**

Rationale:
- The upload zone is a click/drop target. A full-width target feels imprecise — users expect a contained, visually "droppable" area.
- 280px provides a comfortable hit target without overwhelming the staging area when no files are pending.
- The "Import from Folder" button sits below it at the same width, keeping the upload controls as a tidy centered unit.
- Once files are staged, the 3-column grid expands to fill the width — the upload zone remains compact above as a secondary action.

If the CEO prefers a wider upload zone (e.g., matching 2 columns of the grid, ~590px), that works within the design system. Escalating as an option.

---

## Token Usage Summary

All visual treatments use existing tokens only:

| Element | Tokens |
|---|---|
| Staging container bg | `T.sf` |
| Staging container border | `T.bd` |
| Unclassified badge | `T.txM` on `T.bg` |
| Classify button default | `T.txD` text, `T.bd` border |
| Classify button hover | `T.ac` text, `T.ac` border, `T.acS` bg |
| Classified card badge | `T.ac` text, `T.acS` bg |
| "Add to Course" button | `T.ac` bg, `#0F1115` text |
| Remove button | `T.txM`, visible on hover |

No new tokens required.

---

## Assumptions
- Users typically stage 1-10 files at a time
- Auto-classification (`autoClassify` in `classify.js`) will pre-classify most files, so the Unclassified group is usually small or empty
- The staging area and materials dashboard are on the same scrollable page (no tab separation)
- The `files` state array in StudyContext is the staging data source; `active.materials` is the committed data source (no change to data model)
