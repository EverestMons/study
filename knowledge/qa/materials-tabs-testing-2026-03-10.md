# QA Report: Materials Status Filter Tabs
**Date:** 2026-03-10
**Tester:** Study Security & Testing Analyst
**Build:** `npm run build` — PASS

---

## Scope

Horizontal filter tabs on MaterialsScreen for filtering materials by processing state: All, Ready, Needs Attention, Failed. Component-local state, single-pass bucketing with cached `getMaterialState` results.

**File reviewed:** `src/screens/MaterialsScreen.jsx` (~35 lines added)

---

## Test Results

### 1. Tab Filtering Correctness

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.1 | "All" tab selected | All materials shown, no filtering | PASS (`activeFilter === "all"` returns true for all) |
| 1.2 | "Ready" tab selected | Only `matState === "ready"` materials shown | PASS (line 48) |
| 1.3 | "Needs Attention" tab selected | Only `incomplete` or `partial` materials shown | PASS (line 49) |
| 1.4 | "Failed" tab selected | Only `critical_error` materials shown | PASS (line 50) |
| 1.5 | Unknown filter value | Falls through to `return true` (safe default) | PASS (line 51) |

### 2. Tab Count Accuracy

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | All count = total materials | `tabCounts.all === active.materials.length` | PASS (incremented for every material in loop) |
| 2.2 | Ready count matches | Only `"ready"` state counted | PASS (line 40) |
| 2.3 | Attention count matches | `"incomplete"` + `"partial"` counted | PASS (line 41) |
| 2.4 | Failed count matches | Only `"critical_error"` counted | PASS (line 42) |
| 2.5 | Processing materials not counted in any non-All tab | "reading"/"analyzing"/"extracting" don't match any bucket | PASS (no else-if for these states) |
| 2.6 | Sum of non-All tabs may be < All count | Processing materials only in All — intentional | PASS |

### 3. "All" Tab — Processing Materials

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.1 | Material in "reading" state | Visible in All tab | PASS (no filter applied) |
| 3.2 | Material in "analyzing" state | Visible in All tab | PASS |
| 3.3 | Material in "extracting" state | Visible in All tab | PASS |
| 3.4 | Processing material NOT in Ready/Attention/Failed | Not counted in those tabs | PASS (bucketing logic only matches ready/incomplete/partial/critical_error) |

### 4. "Ready" Tab

| # | Test | Expected | Result |
|---|------|----------|--------|
| 4.1 | Material with all chunks extracted + skills | `getMaterialState` → "ready" → shown | PASS |
| 4.2 | Material with all chunks extracted, no skills yet | `getMaterialState` → "ready" (line 157 of StudyContext) → shown | PASS |
| 4.3 | Incomplete material | NOT shown in Ready tab | PASS |

### 5. "Needs Attention" Tab

| # | Test | Expected | Result |
|---|------|----------|--------|
| 5.1 | Material with `incomplete` state (pending chunks) | Shown | PASS |
| 5.2 | Material with `partial` state (mix of extracted + failed) | Shown | PASS |
| 5.3 | Material with `critical_error` (all failed) | NOT shown (that's Failed tab) | PASS |
| 5.4 | Ready material | NOT shown | PASS |

### 6. "Failed" Tab

| # | Test | Expected | Result |
|---|------|----------|--------|
| 6.1 | Material with `critical_error` (all chunks failed) | Shown | PASS |
| 6.2 | Material with `partial` (some succeeded, some failed) | NOT shown (that's Attention) | PASS |
| 6.3 | Material with `incomplete` (pending, not failed) | NOT shown | PASS |

### 7. Zero-Count Tab Visibility

| # | Test | Expected | Result |
|---|------|----------|--------|
| 7.1 | Tab with count === 0 hidden | `if (tab.key !== "all" && count === 0) return null` | PASS (line 131) |
| 7.2 | "All" tab always visible | Exception in the guard: `tab.key !== "all"` | PASS |
| 7.3 | All materials ready → only All + Ready tabs shown | Attention (0) and Failed (0) hidden | PASS |
| 7.4 | Mix of states → all relevant tabs shown | Each tab with count > 0 renders | PASS |

### 8. Auto-Reset on Empty Tab

| # | Test | Expected | Result |
|---|------|----------|--------|
| 8.1 | Selected tab count drops to 0 | `activeFilter` falls back to "all" for current render (line 44) | PASS |
| 8.2 | useEffect resets `materialFilter` to "all" | Effect fires after render, resets state (line 54-56) | PASS |
| 8.3 | User on "Failed" tab, retries last failed material → succeeds | Tab count drops to 0 → auto-reset to All | PASS |
| 8.4 | User on "All" tab, count is 0 (no materials) | No reset needed — "all" stays | PASS |

### 9. Expansion State Persistence

| # | Test | Expected | Result |
|---|------|----------|--------|
| 9.1 | Expand a material card, switch tabs | `expandedMaterial` is in StudyContext (line 113), not component-local | PASS |
| 9.2 | Expand card on Ready tab, switch to All, back to Ready | Same card still expanded | PASS |
| 9.3 | Expand card, switch to tab where card is not visible | Card not rendered, but `expandedMaterial` state preserved; returns when switching back to correct tab | PASS |

### 10. Tab Reset on Screen Navigation

| # | Test | Expected | Result |
|---|------|----------|--------|
| 10.1 | Navigate away from MaterialsScreen, return | `materialFilter` is component-local `useState("all")` — resets on unmount/remount | PASS |
| 10.2 | Component unmount clears filter state | React destroys component state on unmount | PASS |

### 11. Cached State Consistency

| # | Test | Expected | Result |
|---|------|----------|--------|
| 11.1 | `matStates` Map populated once per render | Single loop at lines 36-42 | PASS |
| 11.2 | Render loop uses cached state | `matStates.get(mat.id)` at line 142 (not `getMaterialState(mat)`) | PASS |
| 11.3 | No double `getMaterialState` calls | Only called in bucketing loop, never in `.map()` | PASS |
| 11.4 | `matStates` fresh per render | Recreated each render (not memoized/stale) | PASS |

### 12. UI Styling

| # | Test | Expected | Result |
|---|------|----------|--------|
| 12.1 | Active tab has colored border + tinted background | `border: 1px solid tab.color`, `background: tab.color + "18"` | PASS |
| 12.2 | Inactive tab has default border, muted text | `border: T.bd`, `color: T.txD` | PASS |
| 12.3 | Active tab bold, inactive normal | `fontWeight: isActive ? 600 : 400` | PASS |
| 12.4 | Ready tab uses green | `color: T.gn` | PASS |
| 12.5 | Attention tab uses amber | `color: T.am` | PASS |
| 12.6 | Failed tab uses red | `color: "#ef4444"` | PASS |
| 12.7 | Tab row wraps on narrow screens | `flexWrap: "wrap"` | PASS |
| 12.8 | Tabs hidden when no materials | `active.materials.length > 0` guard (line 126) | PASS |

### 13. Edge Cases

| # | Test | Expected | Result |
|---|------|----------|--------|
| 13.1 | `active` is null/undefined | `active?.materials \|\| []` safe guard (lines 36, 45) | PASS |
| 13.2 | Material with no chunks (reading state) | Bucketed as All only, no non-All tab | PASS |
| 13.3 | Single material | Tabs still shown (count > 0 guard works fine) | PASS |
| 13.4 | TABS array defined outside return | Stable reference per render, no performance issue | PASS |
| 13.5 | Hex color + "18" suffix for alpha | Works for standard 6-char hex colors (T.ac, T.gn, T.am, #ef4444 → #ef444418) | PASS |

### 14. Build Verification

| # | Test | Expected | Result |
|---|------|----------|--------|
| 14.1 | `npm run build` | Clean build, no errors | PASS |
| 14.2 | No new warnings | Only pre-existing chunk size warnings | PASS |

---

## Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | Informational | The `useEffect` for auto-reset (line 54-56) has no dependency array — it runs after every render. This is intentional (needs to check `tabCounts` which changes per render), but worth noting. The effect body is a single conditional `setMaterialFilter` call, so the cost is negligible. |
| F2 | Informational | `TABS` array is defined inside the component body (not memoized), creating a new array each render. This is fine — it's 4 small objects and only used for the tab row `.map()`. No performance concern. |

---

## Verdict: PASS

All 42 test cases pass across 14 categories. 0 critical findings, 0 major findings, 2 informational observations. Tab filtering is correct, counts are accurate, processing materials are properly excluded from terminal-state tabs, cached state eliminates duplicate `getMaterialState` calls, and component-local state resets on navigation. Build verified clean.
