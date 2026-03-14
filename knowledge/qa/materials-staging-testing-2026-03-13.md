# QA: Materials Staging Area Regression Test
**Date:** 2026-03-13
**Scope:** Static analysis of `src/screens/MaterialsScreen.jsx` staging area redesign
**Build:** `npx vite build --mode development` — passes (1.43s)

---

## Test Results

### 1. File Upload Flow
**Status:** PASS

| Check | Result |
|---|---|
| `onDrop` handler wired to drop zone | Line 363 — unchanged |
| `onSelect` handler wired to hidden input | Line 365 — unchanged |
| `fiRef` click triggers file picker | Line 363 — unchanged |
| `importFromFolder` button present | Line 368 — unchanged |
| File accept types unchanged | `.txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*` |
| Drag state visual feedback | `drag ? T.ac : T.bd` border, `drag ? T.acS : "transparent"` bg |
| Parsing state shown | `parsing ? "Parsing files..." : ...` (line 366) |
| Upload zone centered at 280px | `maxWidth: 280, margin: "0 auto"` (line 362) |
| Upload zone always visible | Staging container renders unconditionally (line 360) |

No regressions to upload functionality.

---

### 2. Classification
**Status:** PASS

| Check | Result |
|---|---|
| `classify(f.id, c.v)` called on button click | Line 404 — correct handler + args |
| All 7 CLS options rendered | `CLS.map(c => ...)` iterates full array (line 403) |
| CLS_ABBR labels correct | Tb, Sl, Lc, As, Nt, Sy, Rf — all 7 mapped (line 61) |
| Fallback for unknown classification | `CLS_ABBR[c.v] \|\| c.v.slice(0, 2)` (line 408) |
| Button hover states | `T.ac` border/text, `T.acS` bg on mouseEnter (lines 406-407) |
| Button hover reset | Restores `T.bd`, `T.txD`, transparent on mouseLeave |
| Reclassification: expand on click | `setExpandedStaged(f.id)` (line 454) |
| Reclassification: full labels shown | `c.l` used (line 446) vs `CLS_ABBR` on compact card |
| Reclassification: active highlighted | `T.acS` bg + `T.ac` border when `f.classification === c.v` (line 445) |
| Reclassification: collapses after change | `setExpandedStaged(null)` after `classify()` (line 444) |
| Remove button in expanded view | `removeF(f.id)` (line 437) |
| Close button in expanded view | `setExpandedStaged(null)` (line 438) |

No regressions to classification functionality.

---

### 3. Commit Button ("Add to Course")
**Status:** PASS

| Check | Result |
|---|---|
| Condition: all files classified | `files.every(f => f.classification)` (line 380) |
| Guard: only when files exist | Inside `files.length > 0 && (...)` (line 377) |
| Handler: `addMats` | Line 381 — unchanged |
| Label: "Add to Course" | Line 383 — matches design spec |
| Position: above staged grid | Renders before unclassified/classified groups |
| Animation: fadeIn | `animation: "fadeIn 0.2s ease"` (line 382) |
| Styling: accent bg, dark text | `background: T.ac, color: "#0F1115"` |
| Full-width within staging container | `width: "100%"` (line 382) |

Edge case: `files.every()` on empty array returns `true`, but the `files.length > 0` guard prevents rendering. No issue.

---

### 4. Grid Layout
**Status:** PASS

| Check | Result |
|---|---|
| Staging container: T.sf bg | `background: T.sf` (line 360) |
| Staging container: T.bd border | `border: "1px solid " + T.bd` (line 360) |
| Staging container: borderRadius 16 | `borderRadius: 16` (line 360) |
| Staging container: padding 24 | `padding: 24` (line 360) |
| Staging container: marginBottom 32 | `marginBottom: 32` (line 360) |
| Unclassified group: 3-column grid | `gridTemplateColumns: "repeat(3, 1fr)"` (line 394) |
| Classified groups: 3-column grid | `gridTemplateColumns: "repeat(3, 1fr)"` (line 425) |
| Unclassified pinned at top | Renders before `stagedGroupOrder.map()` |
| Group ordering: CLS_ORDER | `stagedGroupOrder = CLS_ORDER.filter(...)` (line 99) |
| Cards: T.bg background | Lines 396, 430, 455 — contrast against T.sf container |
| Expanded card spans full width | `gridColumn: "1 / -1"` (line 430) |
| Unclassified header: amber | `color: T.am` (line 391) |
| Classified headers: standard | `color: T.tx` (line 422) |
| Group counts shown | `({unclassifiedFiles.length})`, `({stagedByClass[cls].length})` |
| Compact card min-height | `minHeight: 72` (line 455) |
| 2-line title clamp | `WebkitLineClamp: 2, WebkitBoxOrient: "vertical"` (line 461) |
| Compact card hover | `T.acB` border, `T.sfH` bg (lines 456-457) |

---

### 5. Existing Materials Dashboard
**Status:** PASS

| Check | Result |
|---|---|
| "Course Materials (N)" header | Line 473 — unchanged |
| Status tab filters | Lines 474-493 — unchanged (All, Ready, Needs Attention, Failed) |
| Tab filter logic | Lines 38-56, 80-82 — unchanged |
| Grouped material grid | Lines 497-545 — unchanged |
| Collapsed groups init | Lines 72-78 — unchanged |
| Compact card rendering | Lines 526-539 — unchanged |
| Expanded card detail | Lines 518-523 → `renderExpandedDetail()` — unchanged |
| Retry All button | Lines 487-492 — unchanged |
| Chunk picker modal | Lines 548-632 — unchanged |
| Error log modal | Lines 634-669 — unchanged |
| FolderPickerModal | Lines 672-678 — unchanged |

No changes to any committed materials functionality.

---

### 6. State Leakage
**Status:** PASS

| Check | Result |
|---|---|
| `expandedStaged` is local state | `useState(null)` at line 35 — MaterialsScreen only |
| No new context dependencies | Same destructured values from `useStudy()` (lines 11-30) |
| No new context writes | No calls to context setters from staging area code |
| `expandedStaged` vs `expandedCard` isolation | Different state vars, different scopes (staged vs committed) |
| `collapsedGroups` not used for staging | Only used in committed materials grid (line 499) |
| `expandedStaged` stale ID safe | If file removed while expanded, card won't render — no crash |
| `files` array unchanged | Same source array from context, no local mutation |
| Staging computations are pure derivations | `unclassifiedFiles`, `stagedByClass`, `stagedGroupOrder` computed from `files` (lines 92-99) |

No cross-contamination between staging and dashboard state.

---

### 7. Build Verification
**Status:** PASS

```
npx vite build --mode development
✓ built in 1.43s
```

No warnings related to MaterialsScreen. Existing chunk-size advisory for pdf worker and main bundle is pre-existing.

---

## Issues Found

### None Critical (0)

### Advisory (2)

**1.** `var` declarations for loop variables (`_sf`, `_fm`, `_m`, `_st`, `_cls`) — function-scoped, not block-scoped. No functional issue since names are unique and don't shadow, but this is a pre-existing pattern throughout the file.
**Severity:** Advisory — no action needed, matches existing code style.

**2.** Unclassified card "?" badge uses `background: T.bg` (line 398) while the card itself uses `background: T.bg` — the badge relies on its `border: 1px solid T.bd` for visual distinction rather than background contrast. Functional but could be more visually prominent.
**Severity:** Advisory — visual polish, not a regression.

---

## Summary

| Category | Result |
|---|---|
| File upload flow | PASS |
| Classification | PASS |
| Commit button | PASS |
| Grid layout | PASS |
| Existing materials | PASS |
| State leakage | PASS |
| Build | PASS |
| **Overall** | **PASS — 0 critical, 0 minor, 2 advisory** |

All staging area changes are additive. No existing functionality was modified. The `files` state array, `classify`, `removeF`, `addMats`, `onDrop`, `onSelect`, and `importFromFolder` handlers are consumed identically to the pre-redesign code. The committed materials dashboard below the staging area is entirely untouched.
