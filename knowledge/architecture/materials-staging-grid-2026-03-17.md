# Materials Staging Grid — Architecture Blueprint
**Date:** 2026-03-17
**Project:** study
**Task:** Step 1 — Architecture for MaterialsScreen staging area redesign
**Assigned By:** CEO (via execution plan)
**Status:** Blueprint — ready for implementation

---

## Overview

Architecture specification for redesigning the MaterialsScreen staging area from a narrow vertical file list into a centered, grouped-grid intake zone. This blueprint defines state management, component structure, animation sequences, and styling for the inline classification workflow.

**Key Pattern:** Reuse the `grouped-grid-with-expand` pattern from the committed materials grid (implemented 2026-03-11), adapted for the staging workflow with inline classification controls.

---

## 1. State Management

### New State Variables

The following state variables are added to `MaterialsScreen.jsx`:

```javascript
// Staging-specific state (add to existing state block)
const [stagedCollapsedGroups, setStagedCollapsedGroups] = React.useState(new Set());
const [expandedStaged, setExpandedStaged] = React.useState(null); // Already exists, repurpose
const [classifyingFile, setClassifyingFile] = React.useState(null); // For animation timing
```

#### `stagedCollapsedGroups`
- **Type:** `Set<string>`
- **Purpose:** Tracks which classification groups in the staging grid are collapsed
- **Behavior:** Same as `collapsedGroups` for committed materials, but **independent state** — staging grid collapse state does not affect committed materials grid
- **Initial value:** Empty Set — all groups start expanded (including "Unclassified")
- **Exception:** "Unclassified" group is always expanded and cannot be collapsed (no toggle control rendered)

#### `expandedStaged`
- **Type:** `string | null` (file UUID)
- **Purpose:** Which staged file card is expanded in-place (for reclassification)
- **Already exists** in current code (line 36) but unused — repurpose for this feature
- **Behavior:**
  - `null` → all staged cards in compact view
  - `file.uuid` → that file's card expands to full-width with classification buttons visible
  - Only one card can be expanded at a time

#### `classifyingFile`
- **Type:** `string | null` (file UUID)
- **Purpose:** Tracks which file is currently animating out after classification
- **Lifecycle:**
  1. User clicks classification button → `classifyingFile` set to `file.uuid`
  2. CSS transition runs (150ms fade-out)
  3. After timeout, `classify(idx, newClassification)` called (updates `files` state)
  4. `classifyingFile` reset to `null`
  5. React re-renders with file in new group → CSS `fadeIn` animation

---

## 2. Unclassified Card Component Structure

### Compact Unclassified Card

**Dimensions:** Taller than standard compact cards (72px) to accommodate classification buttons. Estimated **~140px** min-height.

**Layout:**
```
┌─────────────────────────────────────┐
│ [?]                           [×]   │  ← badge + remove button
│                                     │
│ filename.pdf                        │  ← title, 1-line truncation
│                                     │
│ [Tb] [Sl] [Lc] [As]                │  ← classification buttons row 1
│ [Nt] [Sy] [Rf]                      │  ← classification buttons row 2
└─────────────────────────────────────┘
```

**JSX Structure:**
```jsx
<div style={{
  background: classifyingFile === file.uuid ? "transparent" : T.sf,
  border: `1px solid ${T.bd}`,
  borderRadius: 10,
  padding: 12,
  minHeight: 140,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  opacity: classifyingFile === file.uuid ? 0 : 1,
  transform: classifyingFile === file.uuid ? "scale(0.95)" : "scale(1)",
  transition: "opacity 150ms, transform 150ms",
  cursor: "default",
}}>
  {/* Top row: badge + remove button */}
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div style={{
      background: T.txM,
      color: T.bg,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 4,
      lineHeight: "14px",
    }}>?</div>
    <button onClick={() => removeF(idx)} style={{
      background: "transparent",
      border: "none",
      color: T.txM,
      fontSize: 16,
      cursor: "pointer",
      padding: 4,
    }}>×</button>
  </div>

  {/* Title */}
  <div style={{
    fontSize: 13,
    fontWeight: 500,
    color: T.tx,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }}>{file.name}</div>

  {/* Classification buttons */}
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
    {["textbook", "slides", "lecture", "assignment", "notes", "syllabus", "reference"].map(cls => (
      <button
        key={cls}
        onClick={() => handleClassify(idx, cls)}
        style={{
          background: "transparent",
          border: `1px solid ${T.bd}`,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 10,
          fontWeight: 600,
          color: T.txD,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.target.style.borderColor = T.ac;
          e.target.style.color = T.ac;
          e.target.style.background = T.acS;
        }}
        onMouseLeave={(e) => {
          e.target.style.borderColor = T.bd;
          e.target.style.color = T.txD;
          e.target.style.background = "transparent";
        }}
      >
        {CLS_ABBR[cls] || cls.slice(0, 2).toUpperCase()}
      </button>
    ))}
  </div>
</div>
```

**Key Styling Details:**
- **Badge:** "?" character, `background: T.txM`, `color: T.bg`
- **Classification buttons:** `background: transparent`, `border: 1px solid T.bd`, hover → `borderColor: T.ac`, `color: T.ac`, `background: T.acS`
- **Animation hook:** `opacity` and `transform` controlled by `classifyingFile === file.uuid`

---

## 3. Classified Staged Card (Compact)

**Dimensions:** Standard compact card height (~72px), matching committed materials cards

**Layout:**
```
┌─────────────────────────────────────┐
│ [Tb]                          [×]   │  ← badge + remove button
│                                     │
│ filename.pdf                        │  ← title, 2-line clamp
└─────────────────────────────────────┘
```

**JSX Structure:**
```jsx
<div
  onClick={() => setExpandedStaged(file.uuid)}
  style={{
    background: T.sf,
    border: `1px solid ${T.bd}`,
    borderRadius: 10,
    padding: 12,
    minHeight: 72,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "pointer",
    transition: "all 0.15s",
    animation: "fadeIn 0.3s",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = T.acB;
    e.currentTarget.style.background = T.sfH;
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = T.bd;
    e.currentTarget.style.background = T.sf;
  }}
>
  {/* Top row: badge + remove button */}
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div style={{
      background: T.acS,
      color: T.ac,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 4,
      lineHeight: "14px",
    }}>{CLS_ABBR[file.classification]}</div>
    <button
      onClick={(e) => {
        e.stopPropagation();
        removeF(idx);
      }}
      style={{
        background: "transparent",
        border: "none",
        color: T.txM,
        fontSize: 16,
        cursor: "pointer",
        padding: 4,
      }}
    >×</button>
  </div>

  {/* Title with 2-line clamp */}
  <div style={{
    fontSize: 13,
    fontWeight: 500,
    color: T.tx,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  }}>{file.name}</div>
</div>
```

**Key Differences from Unclassified:**
- **Clickable** — opens expanded view for reclassification
- **Shorter** — 72px vs 140px
- **Badge:** Shows `CLS_ABBR[file.classification]` with accent colors (`T.acS` bg, `T.ac` text)
- **Hover state:** `borderColor: T.acB`, `background: T.sfH`
- **CSS animation:** `animation: "fadeIn 0.3s"` on mount (when file moves into group)

---

## 4. Expanded Staged Card (Reclassification View)

**Trigger:** Click on a classified compact card

**Layout:** Full-width card spanning all 3 columns via `gridColumn: "1 / -1"`

**JSX Structure:**
```jsx
<div style={{
  gridColumn: "1 / -1",
  background: T.sf,
  border: `1px solid ${T.bd}`,
  borderRadius: 10,
  padding: 16,
  animation: "fadeIn 0.2s",
}}>
  {/* Header row: title + close button */}
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{file.name}</div>
    <button
      onClick={() => setExpandedStaged(null)}
      style={{
        background: "transparent",
        border: "none",
        color: T.txM,
        fontSize: 18,
        cursor: "pointer",
        padding: 4,
      }}
    >×</button>
  </div>

  {/* Classification buttons */}
  <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>Reclassify:</div>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {["textbook", "slides", "lecture", "assignment", "notes", "syllabus", "reference"].map(cls => (
      <button
        key={cls}
        onClick={() => {
          handleClassify(idx, cls);
          setExpandedStaged(null);
        }}
        style={{
          background: file.classification === cls ? T.acS : "transparent",
          border: `1px solid ${file.classification === cls ? T.ac : T.bd}`,
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 600,
          color: file.classification === cls ? T.ac : T.txD,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          if (file.classification !== cls) {
            e.target.style.borderColor = T.ac;
            e.target.style.color = T.ac;
            e.target.style.background = T.acS;
          }
        }}
        onMouseLeave={(e) => {
          if (file.classification !== cls) {
            e.target.style.borderColor = T.bd;
            e.target.style.color = T.txD;
            e.target.style.background = "transparent";
          }
        }}
      >
        {CLS_LABELS[cls]}
      </button>
    ))}
  </div>
</div>
```

**Key Details:**
- Uses full classification labels (`CLS_LABELS`) instead of abbreviations
- Current classification is highlighted (accent border/bg)
- Clicking any button reclassifies and closes the expanded view
- Close button (×) collapses back to compact view

---

## 5. Classification Animation Sequence

### Interaction Flow

**User clicks classification button on unclassified card:**

1. **Immediate:** `setClassifyingFile(file.uuid)`
2. **CSS transition (150ms):** Card fades out (`opacity: 0`) and scales down (`transform: scale(0.95)`)
3. **After 150ms timeout:** Call `classify(idx, newClassification)` to update `files` state
4. **Immediate:** `setClassifyingFile(null)`
5. **React re-render:** File object now has `classification` property set
6. **Grouping logic:** File moves from `unclassifiedFiles` array to `stagedByClass[newClassification]` array
7. **CSS animation:** Card appears in new group with `@keyframes fadeIn` (0.3s)

### Implementation Handler

```javascript
const handleClassify = (fileIdx, classification) => {
  const file = files[fileIdx];
  setClassifyingFile(file.uuid);

  setTimeout(() => {
    classify(fileIdx, classification); // Updates files state
    setClassifyingFile(null);
  }, 150);
};
```

**Why the timeout?**
- Allows CSS transition to complete before React re-renders the DOM structure
- Without it, the card would instantly disappear (no fade-out animation)
- 150ms matches the `transition: "opacity 150ms, transform 150ms"` duration

### Reclassification Animation

**User expands a classified card and picks a different classification:**

1. Card is already expanded (`expandedStaged === file.uuid`)
2. User clicks new classification button
3. `handleClassify` called → same animation sequence as initial classification
4. `setExpandedStaged(null)` called to close expanded view
5. Card fades out from current group, appears in new group

**Note:** Reclassification within the same group just collapses the card (no group move).

---

## 6. "Add to Course" Button Visibility Logic

### Derived State

```javascript
const allClassified = files.length > 0 && files.every(f => f.classification);
```

**Render condition:**
```jsx
{allClassified && (
  <button
    onClick={addMats}
    style={{
      width: "100%",
      background: T.ac,
      color: "#0F1115",
      border: "none",
      borderRadius: 10,
      padding: "12px 16px",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      marginTop: 16,
      marginBottom: 16,
      animation: "fadeIn 0.3s",
    }}
  >
    Add to Course
  </button>
)}
```

**Visibility rules:**
- **Hidden when:** `files.length === 0` (no staged files) OR any file has `!file.classification`
- **Shown when:** `files.length > 0` AND `files.every(f => f.classification)` (all files classified)
- **Animation:** `fadeIn` when button appears (after last file gets classified)

**Position:** Between upload zone and staged files grid, full-width within staging container

---

## 7. Staging Container Component Structure

### Outer Container

**Purpose:** Visual boundary that lifts the staging area above the page surface

**Styling:**
```javascript
const stagingContainerStyle = {
  maxWidth: 900,
  margin: "0 auto",
  background: T.sf,
  border: `1px solid ${T.bd}`,
  borderRadius: 16,
  padding: 24,
  marginBottom: 32,
};
```

**Contents (in order):**
1. Upload zone (drag/drop + folder import) — 280px, centered
2. Staged files list (if any unprocessed uploads pending — **deprecated after this redesign**)
3. "Add to Course" button (if `allClassified`)
4. Staged files grid (if `files.length > 0`)

### Upload Zone Centering

**Current code:** Upload zone is likely full-width or left-aligned

**New requirement:** 280px wide, centered

**Implementation:**
```javascript
const uploadZoneStyle = {
  width: 280,
  margin: "0 auto 16px auto", // Centers within staging container
  // ... existing drag/drop styles
};
```

### Staged Files Grid

**When rendered:** `files.length > 0`

**Layout:**
```
┌────────────── Staging Container (900px, T.sf bg, bordered) ──────────────┐
│                                                                            │
│                         [Upload Zone — 280px]                              │
│                                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │                     [Add to Course]                              │   │  ← Only if allClassified
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│   Unclassified (3)                                                         │  ← Always expanded
│   ┌───────────┐ ┌───────────┐ ┌───────────┐                              │
│   │ [?]   [×] │ │ [?]   [×] │ │ [?]   [×] │                              │
│   │           │ │           │ │           │                              │
│   │ file.pdf  │ │ doc.pdf   │ │ text.pdf  │                              │
│   │           │ │           │ │           │                              │
│   │ [Tb][Sl]  │ │ [Tb][Sl]  │ │ [Tb][Sl]  │  ← Classification buttons  │
│   │ [Lc][As]  │ │ [Lc][As]  │ │ [Lc][As]  │                              │
│   │ [Nt][Sy]  │ │ [Nt][Sy]  │ │ [Nt][Sy]  │                              │
│   │ [Rf]      │ │ [Rf]      │ │ [Rf]      │                              │
│   └───────────┘ └───────────┘ └───────────┘                              │
│                                                                            │
│   ▼ Textbooks (2)                                                          │  ← Collapsible group
│   ┌───────────┐ ┌───────────┐                                            │
│   │ [Tb]  [×] │ │ [Tb]  [×] │                                            │
│   │           │ │           │                                            │
│   │ book.pdf  │ │ ch1.pdf   │                                            │
│   └───────────┘ └───────────┘                                            │
│                                                                            │
│   ▶ Lecture Slides (1)                                                     │  ← Collapsed group
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Grid CSS:**
```javascript
const stagedGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  marginTop: 16,
};
```

---

## 8. Group Headers (Staging Grid)

### "Unclassified" Group Header

**Special behavior:** Always expanded, no collapse toggle

**JSX:**
```jsx
<div style={{
  gridColumn: "1 / -1",
  fontSize: 11,
  fontWeight: 700,
  color: T.txD,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 8,
  marginTop: 8,
}}>
  Unclassified ({unclassifiedFiles.length})
</div>
```

**No click handler, no triangle icon**

### Classification Group Headers

**Standard collapsible pattern** (same as committed materials grid)

**JSX:**
```jsx
<div
  onClick={() => {
    const newSet = new Set(stagedCollapsedGroups);
    if (newSet.has(cls)) newSet.delete(cls);
    else newSet.add(cls);
    setStagedCollapsedGroups(newSet);
  }}
  style={{
    gridColumn: "1 / -1",
    fontSize: 11,
    fontWeight: 700,
    color: T.txD,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 8,
    marginTop: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  }}
>
  <span>{stagedCollapsedGroups.has(cls) ? "▶" : "▼"}</span>
  <span>{CLS_LABELS[cls]} ({stagedByClass[cls].length})</span>
</div>
```

**Group ordering:**
1. "Unclassified" (always first, pinned)
2. Then `CLS_ORDER` groups that have staged files: textbook, slides, lecture, assignment, notes, syllabus, reference

---

## 9. Constants and Dependencies

### Classification Constants (Already Exist in MaterialsScreen.jsx)

```javascript
const CLS_ORDER = ["textbook", "slides", "lecture", "assignment", "notes", "syllabus", "reference"];
const CLS_LABELS = {
  textbook: "Textbooks",
  slides: "Lecture Slides",
  lecture: "Lectures",
  assignment: "Assignments",
  notes: "Notes",
  syllabus: "Syllabi",
  reference: "References",
  other: "Other"
};
const CLS_ABBR = {
  textbook: "Tb",
  assignment: "As",
  notes: "Nt",
  lecture: "Lc",
  slides: "Sl",
  syllabus: "Sy",
  reference: "Rf"
};
```

**Location in current code:** MaterialsScreen.jsx lines 60-62

**Recommendation:** These constants are duplicated in multiple places. Consider exporting `CLS_ABBR` from `classify.js` for consistency (currently only `CLS` array is exported).

### Context Dependencies

**From `useStudy()`:**
- `files` — staging array
- `setFiles` — update staging array
- `classify(idx, classification)` — updates `files[idx].classification`
- `removeF(idx)` — removes file from staging
- `addMats()` — commits staged files to course

**No changes to context required** — all existing handlers work with the new UI structure.

---

## 10. Staging Grouping Logic (Implementation Reference)

### Current Code (MaterialsScreen.jsx lines 92-100)

```javascript
var unclassifiedFiles = files.filter(f => !f.classification);
var stagedByClass = {};
for (var _sf of files) {
  if (!_sf.classification) continue;
  if (!stagedByClass[_sf.classification]) stagedByClass[_sf.classification] = [];
  stagedByClass[_sf.classification].push(_sf);
}
var stagedGroupOrder = CLS_ORDER.filter(c => stagedByClass[c]?.length > 0);
```

**This logic is already implemented** and correct for the new design. No changes needed.

**Rendering order:**
1. Render "Unclassified" group header + cards (if `unclassifiedFiles.length > 0`)
2. Render each group in `stagedGroupOrder` with collapsible header + cards (if not collapsed)

---

## 11. Empty State Behavior

### No Files Staged

**Render:**
- Staging container (with `T.sf` background, border)
- Upload zone only (centered, 280px)
- No grid, no "Add to Course" button

**Preserved:** Existing empty state messaging (if any) within upload zone

### All Files Classified

**Render:**
- Staging container
- Upload zone (for adding more files)
- "Add to Course" button (full-width, prominent, with `fadeIn` animation)
- Staged files grid with only classification groups (no "Unclassified" group)

### Mixed State (Some Unclassified)

**Render:**
- Staging container
- Upload zone
- No "Add to Course" button
- Staged files grid with "Unclassified" group at top + classification groups below

---

## 12. Responsive Considerations (Future)

**Current design:** Fixed 3-column grid at 900px container width

**Cards per row:** 3 cards × ~290px each = ~870px (with 10px gaps)

**Narrow window behavior:** If container < 900px, cards may become too narrow for readability

**Not in scope for this redesign**, but flagged for future:
- Media query or `minmax(200px, 1fr)` for responsive columns
- 2-column grid on tablets, 1-column on mobile

---

## 13. Integration Checklist

**Before implementation:**
- [ ] Verify `CLS_ABBR` availability (currently defined locally in MaterialsScreen.jsx lines 60-62)
- [ ] Verify `classify(idx, classification)` handler signature in StudyContext
- [ ] Verify `files` state structure includes `uuid` field for keying

**After implementation:**
- [ ] Test classification animation timing (150ms fade-out feels smooth)
- [ ] Test reclassification flow (expand → pick → collapse → move)
- [ ] Test "Add to Course" button appearance (all files classified)
- [ ] Test group collapse state (staging and committed materials have independent collapse state)
- [ ] Verify no visual jump when last unclassified file gets classified (smooth transition)

---

## 14. Open Questions / Decisions Needed

None — all CEO decisions locked in per execution plan:
- Upload zone width: **280px, centered** ✅
- Inline classification model: **Option (a), buttons on card face** ✅

---

## 15. Summary: What's New vs. What's Reused

### New Components/Logic
1. **Unclassified card** with inline classification buttons (140px height)
2. **Classified compact staged card** (72px height, clickable for reclassification)
3. **Expanded staged card** with reclassification controls
4. **Classification animation handler** (`handleClassify` with timeout)
5. **"Add to Course" button** with `allClassified` visibility logic
6. **Staging container** with lifted background (`T.sf`) and border
7. **Separate collapse state** (`stagedCollapsedGroups`) for staging grid

### Reused from Existing Materials Grid
1. **3-column CSS grid** layout (`gridTemplateColumns: "repeat(3, 1fr)"`, `gap: 10`)
2. **Group headers** with collapse toggle (▶/▼)
3. **`CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR`** constants
4. **Badge styling** (type indicator top-left)
5. **Hover states** (`borderColor: T.acB`, `background: T.sfH`)
6. **Expand-in-place pattern** (`gridColumn: "1 / -1"`)
7. **`@keyframes fadeIn`** animation from theme.jsx

### Preserved from Current Staging Area
1. **Upload zone** (drag/drop, folder import) — only change is centering
2. **`files` state array** — no structure changes
3. **`classify()` handler** — existing context method
4. **`removeF()` handler** — existing context method
5. **`addMats()` handler** — existing context method

---

## 16. Implementation Roadmap (For Next Steps)

**Step 2 (Implementation):** Implement the staging grid in MaterialsScreen.jsx based on this blueprint

**Sequence:**
1. Add new state variables (`stagedCollapsedGroups`, repurpose `expandedStaged`, add `classifyingFile`)
2. Refactor staging container styling (add `T.sf` background, border, padding)
3. Center upload zone (280px width, `margin: "0 auto"`)
4. Implement `handleClassify` with animation timing
5. Render "Add to Course" button with `allClassified` logic
6. Replace staged file list with grouped grid
7. Implement unclassified card component
8. Implement classified compact card component
9. Implement expanded reclassification card component
10. Implement group headers (unclassified + collapsible classification groups)
11. Test animation sequences and collapse state

**Estimated LOC change:** ~200-300 lines added/modified in MaterialsScreen.jsx

---

**End of Architecture Blueprint**
