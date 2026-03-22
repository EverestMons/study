# Materials Staging Area — Component Architecture Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Migration Impact:** None. This is a pure frontend rendering change within `MaterialsScreen.jsx`. No schema changes, no new migrations, no StudyContext changes.

---

## Current State Assessment

The current `MaterialsScreen.jsx` (747 lines) already implements the staging area redesign described in the UXD spec (`materials-staging-ux-2026-03-13.md`). The blueprint below documents the implemented architecture for the DEV step to verify and the QA step to test against.

---

## 1. JSX Skeleton — Staging Container

The staging container is a single `<div>` that wraps the upload zone, "Add to Course" button, and staged files grid. It lives inside the 900px centered content area, above the "Course Materials" section.

```jsx
{/* Staging area */}
<div style={{
  background: T.sf,
  border: "1px solid " + T.bd,
  borderRadius: 16,
  padding: 24,
  marginBottom: 32
}}>
  {/* Upload zone — centered, 280px max */}
  <div style={{ maxWidth: 280, margin: "0 auto" }}>
    {/* Drop zone div (onDragOver, onDragLeave, onDrop, onClick) */}
    {/* Hidden file input (fiRef) */}
    {/* "Import from Folder" button */}
  </div>

  {/* Staged files — only when files.length > 0 */}
  {files.length > 0 && (
    <div style={{ marginTop: 20 }}>
      {/* "Add to Course" button — conditional, above grid */}
      {/* Unclassified group — pinned top, always expanded */}
      {/* Classified groups — ordered by CLS_ORDER, collapsible */}
    </div>
  )}
</div>
```

**Key nesting:** `900px container` → `staging wrapper (T.sf, border, rounded-16)` → `upload zone (280px, centered)` + `staged files section` → `"Add to Course" button` + `Unclassified group` + `classification groups`.

---

## 2. Grouping Logic — Staged Files Partitioning

The `files` state array (from StudyContext) is partitioned into Unclassified + classification groups using `CLS_ORDER`. This is actual JS logic:

```js
// Already defined at component scope:
var CLS_ORDER = ["textbook", "slides", "lecture", "assignment", "notes", "syllabus", "reference"];
var CLS_LABELS = { textbook: "Textbooks", slides: "Lecture Slides", lecture: "Lectures",
  assignment: "Assignments", notes: "Notes", syllabus: "Syllabi", reference: "References", other: "Other" };
var CLS_ABBR = { textbook: "Tb", assignment: "As", notes: "Nt", lecture: "Lc",
  slides: "Sl", syllabus: "Sy", reference: "Rf" };

// Partition staged files
var unclassifiedFiles = files.filter(f => !f.classification);
var stagedByClass = {};
for (var _sf of files) {
  if (!_sf.classification) continue;
  if (!stagedByClass[_sf.classification]) stagedByClass[_sf.classification] = [];
  stagedByClass[_sf.classification].push(_sf);
}
var stagedGroupOrder = CLS_ORDER.filter(c => stagedByClass[c]?.length > 0);
```

**Data flow:** `files` → split into `unclassifiedFiles` (no classification) and `stagedByClass` (keyed by classification value). `stagedGroupOrder` is the ordered array of classification keys that have at least one file, filtered through `CLS_ORDER` to maintain canonical ordering.

---

## 3. Unclassified Card Component

Unclassified cards are rendered inline (not a separate component) within the Unclassified group grid. They are **taller than 72px** to accommodate the classification buttons.

### Props/data per card
- `f` — file object from `unclassifiedFiles` (has `f.id`, `f.name`)
- `idx` — index in the parent `files` array: `files.findIndex(file => file.id === f.id)`
- `isClassifying` — boolean: `classifyingFile === f.id` (drives fade-out animation)

### Dimensions
- No explicit height set — card grows to fit content (badge row + title + 2 rows of buttons)
- Typically renders ~120px tall (vs 72px for compact classified cards)

### Layout structure
```
┌─────────────────────────┐
│ [?] badge        [×] rm │  ← top row: "?" badge (T.txM bg), remove button
│                         │
│ filename.pdf            │  ← title, 1-line truncation (whiteSpace: nowrap)
│                         │
│ [Tb] [Sl] [Lc] [As]    │  ← classify buttons (from CLS array)
│ [Nt] [Sy] [Rf]         │  ← buttons wrap naturally via flexWrap: "wrap"
└─────────────────────────┘
```

### Button layout
Classification buttons render from `CLS.map(c => ...)` — 7 buttons using `CLS_ABBR` labels. Layout is `display: "flex", gap: 6, flexWrap: "wrap"`, which naturally produces 2 rows (~4+3) at the card width within a 3-column grid.

### Button styling
- Default: `background: "transparent"`, `border: "1px solid " + T.bd`, `borderRadius: 6`, `padding: "3px 8px"`, `fontSize: 10`, `fontWeight: 600`, `color: T.txD`
- Hover: `borderColor: T.ac`, `color: T.ac`, `background: T.acS` (via onMouseEnter/onMouseLeave)

### Click handler signature
```js
onClick={() => handleClassify(f.id, c.v)
```
Where `handleClassify` is:
```js
const handleClassify = (fileId, classification) => {
  setClassifyingFile(fileId);       // triggers fade-out
  setTimeout(() => {
    classify(fileId, classification); // calls StudyContext handler
    setClassifyingFile(null);        // reset
  }, 150);                           // matches CSS transition duration
};
```

### Card container styles
```js
{
  background: T.bg,
  borderRadius: 8,
  padding: "8px 10px",
  border: "1px solid " + T.am + "40",  // amber tint border for attention
  display: "flex",
  flexDirection: "column",
  gap: 6,
  opacity: isClassifying ? 0 : 1,
  transform: isClassifying ? "scale(0.95)" : "scale(1)",
  transition: "opacity 150ms, transform 150ms"
}
```

---

## 4. Classified Compact Card

Classified cards match the same visual pattern as committed material cards: ~72px implied height, compact layout.

### Layout
```
┌─────────────────────────┐
│ [Tb] badge       [×] rm │  ← CLS_ABBR badge (T.ac on T.acS), remove button
│                         │
│ filename.pdf            │  ← title, 2-line clamp (-webkit-box)
│ (second line...)        │
└─────────────────────────┘
```

### Styling
- `background: T.sf`, `borderRadius: 8`, `padding: "8px 10px"`, `border: "1px solid " + T.bd`
- Hover: `borderColor: T.acB`, `background: T.sfH`
- Title: 2-line clamp via `display: "-webkit-box"`, `WebkitLineClamp: 2`, `WebkitBoxOrient: "vertical"`
- No status dot (staging files have no processing status)
- Remove button: `×`, `color: T.txM`, always visible (not hover-only for staging cards)

### Click behavior
Clicking a classified card expands it for reclassification:
```js
onClick={() => setExpandedStaged(f.id)
```

---

## 5. Expand-to-Reclassify (Classified Cards)

When `expandedStaged === f.id`, the classified card renders as an expanded row spanning the full grid width (`gridColumn: "1 / -1"`).

### Expanded layout
```
┌──────────────────────────────────────────────────────┐
│ filename.pdf                                   [×]   │
│ Reclassify:                                          │
│ [Syllabus / Schedule] [Lecture Transcript] [...]     │
└──────────────────────────────────────────────────────┘
```

- Full classification labels (from `CLS` — `c.l`), not abbreviations
- Active classification highlighted: `background: T.acS`, `border: "1px solid " + T.ac`, `color: T.ac`
- Click reclassifies and collapses: `onClick={() => { handleClassify(f.id, c.v); setExpandedStaged(null); }`
- Close button collapses without change: `onClick={() => setExpandedStaged(null)`
- Container: `gridColumn: "1 / -1"`, `background: T.sf`, `borderRadius: 8`, `padding: "10px 12px"`, `border: "1px solid " + T.bd`, `animation: "fadeIn 0.2s ease"`

---

## 6. Classification Transition Mechanism

**Mechanism: CSS transition + setTimeout + React re-render.**

When user clicks a classify button on an unclassified card:

1. `handleClassify(fileId, classification)` is called
2. `setClassifyingFile(fileId)` — triggers CSS transition on the card: `opacity: 0`, `transform: scale(0.95)` over 150ms
3. After 150ms `setTimeout`, `classify(fileId, classification)` is called (StudyContext handler updates `files` state)
4. `setClassifyingFile(null)` resets the animation state
5. React re-renders: file now has `f.classification` set, so it no longer appears in `unclassifiedFiles` and instead appears in `stagedByClass[classification]`
6. The new classified card appears with `animation: "fadeIn 0.3s"` (existing `@keyframes fadeIn`)

**No layout animation library needed.** The transition is: fade-out old position (CSS transition 150ms) → re-render (React moves DOM) → fade-in new position (CSS keyframe animation). The 150ms delay ensures the fade-out completes before the DOM move.

---

## 7. "Add to Course" Button Visibility Logic

### Exact conditional expression
```js
files.every(f => f.classification)
```

This evaluates to `true` only when:
- `files.length > 0` (the outer `files.length > 0` check gates the entire staged section)
- AND every file in `files` has a truthy `classification` property

The button is **not rendered** (not hidden — completely absent from DOM) when any file lacks a classification.

### Button rendering
```jsx
{files.every(f => f.classification) && (
  <button onClick={addMats}
    style={{
      width: "100%",
      padding: "12px 16px",
      borderRadius: 10,
      border: "none",
      background: T.ac,
      color: "#0F1115",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      marginBottom: 16,
      animation: "fadeIn 0.2s ease"
    }}>
    Add to Course
  </button>
)}
```

### Position
Above the staged files grid, below the upload zone. Within the `marginTop: 20` staged files wrapper.

---

## 8. State Variables Audit

| Variable | Source | Used | Status |
|---|---|---|---|
| `expandedStaged` | `useState(null)` | Yes — expand-to-reclassify for classified staging cards | **Active** |
| `stagedCollapsedGroups` | `useState(new Set())` | Yes — collapsible classified staging group headers | **Active** |
| `classifyingFile` | `useState(null)` | Yes — drives 150ms fade-out animation on classify | **Active** |

All three state variables are actively used. No dead state.

### Variables NOT needed (confirmed absent)
- No `stagedFiles` separate state — derived from `files` via filter
- No animation library state — pure CSS transitions + setTimeout

---

## How to Verify (Acceptance Criteria)

### AC-1: Staging container
- [ ] Staging area renders with `background: T.sf`, `border: "1px solid " + T.bd`, `borderRadius: 16`, `padding: 24`, `marginBottom: 32`
- [ ] Staging container is visible even with 0 files (shows upload zone only)

### AC-2: Upload zone
- [ ] Upload zone is centered within staging container (`maxWidth: 280`, `margin: "0 auto"`)
- [ ] Drag-and-drop works (onDrop handler)
- [ ] Click-to-browse works (fiRef input)
- [ ] "Import from Folder" button renders below upload zone at same width

### AC-3: File grouping
- [ ] Unclassified files appear in "Unclassified" group pinned at top
- [ ] Unclassified group is always expanded (no collapse toggle)
- [ ] Classified files appear under correct classification group
- [ ] Classification groups ordered by CLS_ORDER
- [ ] Groups are collapsible via ▶/▼ toggle

### AC-4: Unclassified cards
- [ ] Show "?" badge in `T.txM` background
- [ ] Show filename with 1-line truncation
- [ ] Show 7 classify buttons using CLS_ABBR labels
- [ ] Buttons have hover state (T.ac border/color, T.acS background)
- [ ] Click calls handleClassify with correct file ID and classification

### AC-5: Classified cards
- [ ] Show CLS_ABBR badge in `T.ac` on `T.acS`
- [ ] Show filename with 2-line clamp
- [ ] Click expands for reclassification (gridColumn: "1 / -1")
- [ ] Reclassify buttons show full labels with active classification highlighted
- [ ] Remove button (×) works

### AC-6: Classification transition
- [ ] Card fades out (opacity 0, scale 0.95) over 150ms
- [ ] After fade, card moves to correct classification group
- [ ] Card appears in new group with fadeIn animation

### AC-7: "Add to Course" button
- [ ] Hidden when any file is unclassified
- [ ] Visible when all files are classified
- [ ] Calls addMats() on click
- [ ] Label is "Add to Course"
- [ ] Appears with fadeIn animation
- [ ] Full-width, `T.ac` background, `#0F1115` text

### AC-8: Committed materials unaffected
- [ ] "Course Materials" section below staging area is unchanged
- [ ] Tab filters, expanded cards, retry, remove, status dots all functional

### AC-9: Build
- [ ] `npx vite build --mode development` passes

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Produced a component architecture blueprint documenting the MaterialsScreen staging area design. The current implementation already matches the UXD spec — the blueprint formalizes the JSX skeleton, grouping logic, card components, transition mechanism, button visibility, and state variables for the DEV and QA steps to verify against.

### Files Deposited
- `study/knowledge/architecture/materials-staging-blueprint-2026-03-22.md` — component architecture blueprint with 9 acceptance criteria groups

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Confirmed all 3 local state variables (`expandedStaged`, `stagedCollapsedGroups`, `classifyingFile`) are active and needed
- Confirmed CSS transition + setTimeout + React re-render is the correct transition mechanism (no animation library)
- Confirmed the existing implementation matches the UXD spec

### Flags for CEO
- None

### Flags for Next Step
- The current `MaterialsScreen.jsx` already implements the staging area redesign per the UXD spec. The DEV step should verify the implementation matches this blueprint and make any adjustments if discrepancies are found, rather than implementing from scratch.
