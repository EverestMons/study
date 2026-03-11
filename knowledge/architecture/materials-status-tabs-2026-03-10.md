# Architecture: Materials Status Filter Tabs
**Date:** 2026-03-10
**Author:** Study Systems Analyst
**Handoff to:** Study Developer

---

## Overview

Add horizontal filter tabs above the materials list on MaterialsScreen. Tabs let users quickly find materials that need attention (failed extraction, incomplete processing) without scrolling through everything.

---

## Tab Definitions

| Tab Label | Key | Filter Logic | Badge |
|-----------|-----|-------------|-------|
| All | `"all"` | No filter — show every material | `materials.length` |
| Ready | `"ready"` | `matState === "ready"` | count |
| Needs Attention | `"attention"` | `matState === "incomplete" \|\| matState === "partial"` | count |
| Failed | `"failed"` | `matState === "critical_error"` | count |

### Processing materials ("reading", "analyzing", "extracting")

These are actively being processed. They appear in the **All** tab only. They are NOT bucketed into Ready, Attention, or Failed — they haven't reached a terminal state yet.

### Tab visibility

- **All** tab: always shown
- **Ready / Attention / Failed**: only shown when their count > 0 (hide empty tabs to avoid clutter)
- Exception: if the selected tab's count drops to 0 (e.g., user retries the last "attention" material), auto-reset to "all"

---

## State Design

```
Component-local state (not in StudyContext — resets on unmount):

const [materialFilter, setMaterialFilter] = React.useState("all");
```

This keeps MaterialsScreen self-contained. No context state added.

---

## Computation (once per render)

Insert between the "Course Materials" header and the `active.materials.map(...)` render loop:

```js
// Bucket materials by state
var tabCounts = { all: 0, ready: 0, attention: 0, failed: 0 };
var matStates = new Map(); // mat.id → matState (cache to avoid double-calling getMaterialState)

for (var mat of active.materials) {
  var st = getMaterialState(mat);
  matStates.set(mat.id, st);
  tabCounts.all++;
  if (st === "ready") tabCounts.ready++;
  else if (st === "incomplete" || st === "partial") tabCounts.attention++;
  else if (st === "critical_error") tabCounts.failed++;
  // "reading", "analyzing", "extracting" → All tab only
}

// Filter materials for selected tab
var filteredMats = active.materials.filter(mat => {
  if (materialFilter === "all") return true;
  var st = matStates.get(mat.id);
  if (materialFilter === "ready") return st === "ready";
  if (materialFilter === "attention") return st === "incomplete" || st === "partial";
  if (materialFilter === "failed") return st === "critical_error";
  return true;
});

// Auto-reset if selected tab is now empty
if (materialFilter !== "all" && filteredMats.length === 0) {
  // Don't call setMaterialFilter during render — use effect or just show "all" inline
  // Simpler: treat as "all" for this render, reset in next tick
  filteredMats = active.materials;
}
```

**Important:** The `getMaterialState` result is cached in `matStates` Map so each material is evaluated exactly once per render. The `.map()` render loop below uses `matStates.get(mat.id)` instead of calling `getMaterialState(mat)` again.

---

## Tab Row UI

Insert between the "Course Materials (N)" header and the materials list.

```
[All (12)] [Ready (8)] [Needs Attention (3)] [Failed (1)]
```

### Styling

- Row: `display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap"`
- Each tab: pill shape, `fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid " + T.bd, cursor: "pointer", transition: "all 0.15s"`
- Active tab: `background: T.acS, borderColor: T.ac, color: T.ac`
- Inactive tab: `background: "transparent", color: T.txD`
- Badge (count): inline after label, separated by space
- "Attention" tab with count > 0: amber tint — `color: T.am, borderColor: T.am` when active
- "Failed" tab with count > 0: red tint — `color: "#ef4444", borderColor: "#ef4444"` when active

### Tab definition array (compact)

```js
var TABS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "attention", label: "Needs Attention" },
  { key: "failed", label: "Failed" },
];
```

---

## Render Loop Update

Replace:
```js
{active.materials.map(mat => {
  const matState = getMaterialState(mat);
```

With:
```js
{filteredMats.map(mat => {
  const matState = matStates.get(mat.id);
```

This uses the cached state from the bucketing pass. Zero additional `getMaterialState` calls.

---

## Auto-Reset Logic

If the user is on a filtered tab and the count drops to 0 (e.g., they retry the last failed material and it succeeds), the tab should reset to "all". Two approaches:

**Option A (simple):** Check at render time — if `tabCounts[materialFilter] === 0 && materialFilter !== "all"`, just render as if "all" is selected. Use `useEffect` to actually reset the state:

```js
React.useEffect(() => {
  if (materialFilter !== "all" && tabCounts[materialFilter] === 0) {
    setMaterialFilter("all");
  }
});
```

**Recommended: Option A.** The effect fires after the render that detected the empty tab, resetting state for the next render. The current render already shows all materials as a fallback.

---

## Impact

| Area | Impact |
|------|--------|
| MaterialsScreen.jsx | ~25 lines added (state, computation, tab row, render loop update) |
| StudyContext.jsx | None — component-local state |
| getMaterialState | No changes — called same as before, just cached |
| Other screens | None |

---

## Edge Cases

1. **No materials yet** (empty course): Tab row hidden entirely (guard: `active.materials.length > 0`)
2. **All materials processing**: All in "reading"/"analyzing"/"extracting" → only "All" tab has count > 0, others hidden
3. **Single material**: Tab row still useful if it's in "attention" or "failed" state, but could feel noisy. Show tabs only when `materials.length >= 2` (optional — DEV discretion)
4. **Material state changes during render**: `matStates` Map is computed fresh each render from current chunk statuses. No stale data.
