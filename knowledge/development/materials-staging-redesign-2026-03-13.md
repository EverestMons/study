# Materials Staging Area Redesign — Development Receipt
**Date:** 2026-03-13
**Developer:** Study Developer
**File Modified:** `src/screens/MaterialsScreen.jsx`
**Build Verified:** `npx vite build --mode development` — passes

---

## Changes Made

### 1. New State Variable
- `expandedStaged` — tracks which classified staged file is expanded for reclassification

### 2. Staged File Grouping Computation
Added computed variables before the render:
- `unclassifiedFiles` — files without a classification
- `stagedByClass` — files grouped by classification value
- `stagedGroupOrder` — ordered list of classification keys with staged files

### 3. Staging Area Container
Replaced the old `maxWidth: 280` left-aligned upload area with a full-width staging container:
- `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 16`, `padding: 24`
- `marginBottom: 32` — visual separation from the materials dashboard below
- Upload zone centered at 280px within (`margin: "0 auto"`)

### 4. Upload Zone
- Same drop zone and "Import from Folder" button, now centered within the staging container
- No changes to `onDrop`, `onSelect`, `fiRef`, `importFromFolder`, or file accept types

### 5. "Add to Course" Button
- Renamed from "Add Materials" to "Add to Course"
- Positioned above the staged files grid (was below)
- Appears with `fadeIn` animation only when all files are classified
- Same condition: `files.every(f => f.classification)`
- Same handler: `addMats`

### 6. Unclassified Group
- Renders at the top of the staged files grid when unclassified files exist
- Header: "Unclassified (N)" in `T.am` (amber) color
- 3-column grid matching the materials dashboard pattern
- Each card shows:
  - "?" badge (top-left) in `T.txM`
  - Remove button (top-right)
  - Filename (single-line truncation)
  - Inline classification buttons using `CLS_ABBR` labels (Tb, Sl, Lc, etc.)
  - Button hover: `T.ac` border/text with `T.acS` background

### 7. Classified Staging Groups
- Files grouped by `CLS_ORDER`, each with group header showing label + count
- 3-column grid with compact cards:
  - `T.bg` background (contrast against `T.sf` staging container)
  - Type badge using `CLS_ABBR`
  - Title with 2-line clamp
  - Hover: `T.acB` border, `T.sfH` background
- Click to expand for reclassification:
  - Card spans `gridColumn: "1 / -1"`
  - Shows full classification labels (not abbreviations)
  - Active classification highlighted with `T.acS`/`T.ac`
  - "Remove" and close buttons
  - Selecting a different classification reclassifies and collapses

### 8. Preserved Functionality
All existing handlers preserved without modification:
- `onDrop`, `onSelect`, `classify`, `removeF`, `addMats`, `importFromFolder`
- `files` state array structure unchanged
- No changes to StudyContext.jsx or any other file
- Materials dashboard grid below staging area unchanged
