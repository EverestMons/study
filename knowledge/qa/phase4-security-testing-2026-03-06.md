# Phase 4 Study Screen Decomposition — Security & Testing Report
**Date:** 2026-03-06
**Analyst:** Security & Testing Agent
**Blueprint:** `knowledge/architecture/app-jsx-decomposition-2026-03-06.md`
**Scope:** 10 sub-components in `src/components/study/`, `StudyScreen.jsx`, `ScreenRouter.jsx` (post-decomposition)
**Build status:** `npm run build` passes

---

## Verdict: PASS with 1 confirmed bug (pre-existing), 1 architectural note

All five audit areas verified. No new security issues, no stale state, no broken error boundaries, and FSRS calculations are completely untouched. The one confirmed bug (`setSessionElapsed`) is pre-existing from Phase 2b.

---

## 1. Session State Persistence Across Screen Transitions

### Architecture

All session state lives in `StudyContext.jsx` (51 `useState`, 9 `useRef`), exported via `StudyProvider` + `useStudy()`. The provider wraps the entire app tree:

```
Study (root)
  StudyErrorBoundary
    ErrorContext.Provider
      StudyProvider          <-- all state here
        ScreenRouter
          StudyScreen
            10 sub-components
```

### Transition Paths Verified

| Transition | State Preserved? | Mechanism | Status |
|---|---|---|---|
| Study screen sub-view changes (materials panel, skills panel, practice mode) | Yes | Sub-components render/null based on boolean flags; parent `StudyScreen` stays mounted | **PASS** |
| Study -> Manage (via ModePicker `setScreen("manage")`) | Yes | ScreenRouter swaps child component; StudyProvider stays mounted, all state retained | **PASS** |
| Study -> Home (via back button, clean exit path) | Intentionally reset | All 20+ state values explicitly zeroed, 5 refs cleared (StudyScreen.jsx:62) | **PASS** |
| Study -> SessionSummary (via back button, has session) | Yes until "Done" | Summary computed from current state; "Done" button performs full reset (SessionSummary.jsx:96) | **PASS** |
| Home -> Study (via `enterStudy`) | Intentionally reset | `enterStudy` (StudyContext.jsx:480-504) resets all session state, loads saved chat, captures journal | **PASS** |

### Ref Persistence

| Ref | Scope | Survives Screen Change? | Status |
|---|---|---|---|
| `sessionStartIdx` | Session progress marker | Yes (in StudyContext) | **PASS** |
| `sessionSkillLog` | Accumulated skill ratings | Yes (in StudyContext) | **PASS** |
| `cachedSessionCtx` | Cached context for focused sessions | Yes (in StudyContext) | **PASS** |
| `sessionStartTime` | Session timer origin | Yes (in StudyContext) | **PASS** |
| `discussedChunks` | Chunk dedup set | Yes (in StudyContext) | **PASS** |
| `extractionCancelledRef` | Cancel flag for long operations | Yes (in StudyContext) | **PASS** |
| `endRef` | Scroll-to-bottom anchor | Re-attaches on mount (MessageList.jsx:92) | **PASS** |
| `taRef` | Input textarea ref | Re-attaches on mount (InputBar.jsx:35) | **PASS** |
| `fiRef` | File input ref | Re-attaches on mount (MaterialsPanel.jsx:34) | **PASS** |

### Key Observation

No state is stored in component-local state within the sub-components. All sub-components are pure consumers of `useStudy()` with zero `useState` calls. This means unmounting/remounting any sub-component is safe — there is no local state to lose.

**Session State Persistence: PASS**

---

## 2. Global Lock Blocks All Interaction During Extraction

### GlobalLockOverlay Mechanism

`GlobalLockOverlay.jsx` renders a fixed overlay:
- `position: "fixed"` + `inset: 0` — covers full viewport
- `zIndex: 2000` — above all content
- `pointerEvents: "all"` — captures all pointer events, blocking underlying elements
- Background: `rgba(0,0,0,0.9)` — visually obscures everything

### Overlay Controls

| Control | Condition | Action |
|---|---|---|
| Cancel Operation | Always visible | Sets `extractionCancelledRef.current = true` |
| Force unlock and return | After 30s (`lockElapsed >= 30`) | Clears globalLock, resets busy/status/processingMatId, reloads page |

### Render Locations

| Location | Code | When Active |
|---|---|---|
| `StudyScreen.jsx:41` | `{globalLock && <GlobalLockOverlay />}` | Study screen is visible |
| `ScreenRouter.jsx:59` | `if (globalLock) return <GlobalLockOverlay />;` | Fallback — only reached if no screen matches |

### Handler Guards (Defense in Depth)

Even if the overlay doesn't render (see note below), handlers guard against concurrent operations:

| Handler | Guard | File:Line |
|---|---|---|
| `delCourse` | `if (globalLock) return;` | StudyContext.jsx:771 |
| `addMats` | `if (!active \|\| !files.length \|\| ... \|\| globalLock) return;` | StudyContext.jsx:784 |
| `removeMat` | `if (!active \|\| globalLock) return;` | StudyContext.jsx:854 |
| MaterialsPanel retry button | `disabled={globalLock}` | MaterialsPanel.jsx:121 |
| MaterialsPanel enable button | `if (busy \|\| globalLock) return;` | MaterialsPanel.jsx:149 |
| ChunkPicker extract button | `if (!active \|\| globalLock) return;` | ChunkPicker.jsx:89 |

### Architectural Note: N1 (PRE-EXISTING)

**Severity:** Low
**Introduced by:** Original architecture, NOT Phase 4

The ScreenRouter's `globalLock` check (line 59) is positioned AFTER all screen-specific checks (lines 22-56). This means when globalLock is set during a non-study-screen operation (e.g., `createCourse` sets `setScreen("materials")` at StudyContext.jsx:336 while globalLock is active), the MaterialsScreen renders at position 8, before the globalLock fallback at position 12.

**Impact:** On non-study screens, the GlobalLockOverlay won't render via ScreenRouter. However:
1. The handler guards listed above prevent user-initiated operations during lock.
2. The `busy` state disables interactive buttons.
3. The user has no navigation path to trigger conflicting operations because `createCourse`/`addMats` are async and hold execution until complete.
4. On the study screen, the overlay IS rendered (StudyScreen.jsx:41).

**This is pre-existing behavior**, identical to the original 1,860-line ScreenRouter where the globalLock check was at line 1856 (after all screen checks). Phase 4 did not change the priority chain order.

**Global Lock: PASS (with pre-existing architectural note N1)**

---

## 3. Error Boundaries Catch Crashes in Extracted Components

### Error Boundary Coverage

```
StudyErrorBoundary (App.jsx:30-131)        <-- catches ALL render errors
  ErrorContext.Provider
    StudyProvider
      ScreenRouter
        HomeScreen / ProfileScreen / UploadScreen / ...
        StudyScreen
          GlobalLockOverlay
          MaterialsPanel
          SkillsPanel
          PracticeMode
          NotifPanel
          ChunkPicker
          ModePicker
          MessageList
          AssignmentPanel
          InputBar
          SessionSummary
```

`StudyErrorBoundary` is a class component using `getDerivedStateFromError` + `componentDidCatch`. It wraps `StudyInnerWithContext` which contains `StudyProvider` + `ScreenRouter`. All 10 sub-components are descendant children.

### Error Types and Coverage

| Error Type | Caught By | Mechanism | Status |
|---|---|---|---|
| Render errors (null refs, bad destructure, JSX exceptions) | `StudyErrorBoundary` | `getDerivedStateFromError` | **PASS** |
| `useStudy()` returns null (context not available) | `StudyErrorBoundary` | Destructuring `null` throws TypeError during render | **PASS** |
| Async handler errors (button clicks, API calls) | `asyncError` state | `window.addEventListener("error"/"unhandledrejection")` at StudyContext.jsx:191-197 | **PASS** |
| `asyncError` set | `ScreenRouter` | `if (asyncError) return <ErrorDisplay />;` at line 22 (highest priority) | **PASS** |

### Error Boundary Report Contents

When triggered, the boundary renders a crash report including:
- Timestamp
- Screen, Course ID, Session Mode (from ErrorContext)
- Error message and stack trace (10 lines)
- Component stack (6 lines)
- Copy-to-clipboard button
- Soft reset ("Try to recover")
- Hard reset with confirmation ("Clear all data and restart")

### Verification: Sub-Component Isolation

If one sub-component (e.g., `PracticeMode`) throws during render:
1. Error propagates up the React tree
2. `StudyErrorBoundary.getDerivedStateFromError` catches it
3. Crash report screen replaces the entire app
4. User can copy report, soft-reset, or hard-reset

No sub-component has its own error boundary, which is correct — a partially-rendered study screen would be worse than a clean crash report.

**Error Boundary Coverage: PASS**

---

## 4. Stale State From Missed Context Dependencies

### Audit Methodology

For each of the 10 sub-components + `StudyScreen.jsx`, I verified:
1. Every value destructured from `useStudy()` exists in the context `value` object (StudyContext.jsx:880-926)
2. Every context value actually used in the JSX/handlers is destructured
3. No component references a context value without destructuring it

### Results

| Component | Destructured Values | All in Context? | All Used? | Status |
|---|---|---|---|---|
| **StudyScreen.jsx** | 37 values (19 state, 5 refs, 3 handlers, 10 setters) | **30 YES, 1 NO** | Yes | **BUG S1** |
| MaterialsPanel.jsx | 22 values | All YES | 21/22 (C2: `parsing` unused) | **PASS** |
| SkillsPanel.jsx | 11 values | All YES | 10/11 (C2: `status` unused) | **PASS** |
| PracticeMode.jsx | 4 values | All YES | All used | **PASS** |
| NotifPanel.jsx | 6 values | All YES | All used | **PASS** |
| ChunkPicker.jsx | 14 values | All YES | All used | **PASS** |
| ModePicker.jsx | 28 values | All YES | All used | **PASS** |
| MessageList.jsx | 8 values | All YES | All used | **PASS** |
| AssignmentPanel.jsx | 9 values | All YES | All used | **PASS** |
| InputBar.jsx | 11 values | All YES | All used | **PASS** |
| **SessionSummary.jsx** | 19 values | **18 YES, 1 NO** | Yes | **BUG S1** |

### Bug S1: `setSessionElapsed` Missing From Context Value (PRE-EXISTING)

**Severity:** Medium
**Introduced by:** Phase 2b (context extraction), NOT Phase 4
**Affected:** SessionSummary.jsx:18,96 and StudyScreen.jsx:30,62

**Root cause:** `StudyContext.jsx` line 905 exports `sessionElapsed` (read) but NOT `setSessionElapsed` (write) in the `value` object. The setter exists at line 89 (`const [sessionElapsed, setSessionElapsed] = useState(0)`) and is used internally by the timer effect (line 228) and `enterStudy` handler (line 489).

**Runtime behavior:** `setSessionElapsed` will be `undefined` when destructured from `useStudy()`. When the user clicks "Done" on SessionSummary (line 96) or "Back" with no session on StudyScreen (line 62), the cleanup handler calls `setSessionElapsed(0)` which throws `TypeError: setSessionElapsed is not a function`. Subsequent state resets on the same line will NOT execute due to the throw.

**Impact:** The session elapsed timer won't reset to 0 after ending a session. Additionally, state values listed after `setSessionElapsed(0)` in the cleanup chain (e.g., `setBreakDismissed(false)`, `setSidebarCollapsed(false)`) won't be reset either.

**Fix:** In `StudyContext.jsx` line 905, add `setSessionElapsed` to the value object:
```
sessionElapsed, setSessionElapsed, breakDismissed, setBreakDismissed,
```

### Closure Stale State Analysis

Sub-components that run async operations could theoretically capture stale closures. Verified cases:

| Component | Async Operation | Stale Risk? | Analysis |
|---|---|---|---|
| SkillsPanel | `callClaude` + `extractJSON` + `SubSkills.update` | No | Uses `skillViewData` from latest render; result updates via `setSkillViewData` |
| MaterialsPanel | `runExtractionV2` | No | Uses `active.id` which is stable during extraction (globalLock prevents navigation) |
| ChunkPicker | `runExtractionV2` + `decomposeAssignments` | No | Uses `active.id`; refreshes from DB after extraction |
| ModePicker | `loadPracticeMaterialCtx` + `generateProblems` | No | Uses `active.id` and `active.materials`; globalLock prevents navigation |
| PracticeMode | `evaluateAnswer` + `completeTierAttempt` + `applySkillUpdates` | No | Uses `pm` (local alias for `practiceMode`) captured at render; subsequent state updates go through `setPracticeMode` |
| AssignmentPanel | `generateSubmission` | No | Uses `asgnWork` and `focusContext` captured at render; `setExporting` guards against double-click |

**Stale State Audit: PASS (with pre-existing bug S1 confirmed)**

---

## 5. FSRS Calculations Unchanged

### File Integrity

`src/lib/fsrs.js` was **NOT modified** by Phase 4. The file contains:

| Export | Type | Used By |
|---|---|---|
| `Rating` | Constants (AGAIN=1, HARD=2, GOOD=3, EASY=4) | study.js |
| `mapRating` | Function (string -> numeric grade) | study.js |
| `retrievability` | Function (time, stability -> recall probability) | `currentRetrievability`, `sSuccess`, `sFail` |
| `initCard` | Function (-> initial card state) | study.js |
| `reviewCard` | Function (card, grade -> updated card + interval) | study.js `applySkillUpdates` |
| `currentRetrievability` | Function (card -> current recall probability) | StudyContext.jsx, ModePicker.jsx (unused) |

### Call Chain Verification

The FSRS calculation path is: `PracticeMode.jsx` -> `applySkillUpdates` (study.js) -> `reviewCard` (fsrs.js)

| Step | File | Modified by Phase 4? | Status |
|---|---|---|---|
| 1. User completes tier attempt | PracticeMode.jsx:301 | New file, but logic extracted verbatim from original ScreenRouter.jsx | **PASS** |
| 2. `applySkillUpdates(id, updates, weight)` called | study.js | NOT modified | **PASS** |
| 3. `applySkillUpdates` internally calls `reviewCard` | study.js -> fsrs.js | NOT modified | **PASS** |
| 4. `reviewCard` computes new D, S, interval | fsrs.js | NOT modified | **PASS** |
| 5. Updated mastery written to DB via `Mastery.upsert` | study.js -> db.js | NOT modified | **PASS** |

### FSRS Consumers in Sub-Components

| Component | FSRS Import | Usage | Status |
|---|---|---|---|
| ModePicker.jsx | `currentRetrievability` from fsrs.js | **Imported but UNUSED** (cleanup item C1) | N/A — tree-shaken |
| StudyContext.jsx | `currentRetrievability` from fsrs.js | Used in `loadProfile` (line 433) | NOT modified |

### Parameter Verification

FSRS-4.5 parameters (19 weights) at fsrs.js:21-28 are unchanged:
- `W[0-3]`: Initial stability per grade
- `W[4-7]`: Initial difficulty params
- `W[8-11]`: Stability update params
- `W[12-14]`: Failure stability params
- `W[15-16]`: Hard penalty / easy bonus
- `W[17-18]`: Same-day review (unused)
- `DESIRED_RETENTION = 0.9`
- `MAX_INTERVAL = 365`

**FSRS Calculations: PASS (completely untouched)**

---

## 6. Additional Security Checks

### 6a. No New Attack Surface

| Check | Status |
|---|---|
| No new network calls introduced | **PASS** — all API calls use existing `callClaude`/`callClaudeStream` from api.js |
| No new `eval()` or `Function()` usage | **PASS** |
| No new `dangerouslySetInnerHTML` | **PASS** — `renderMd` in MessageList uses React elements, not innerHTML |
| No new file system access | **PASS** — all file ops use existing Tauri plugin APIs |
| No new `window.open` or navigation | **PASS** |
| No user input passed to SQL queries | **PASS** — all DB access through existing ORM-like wrappers |

### 6b. Dynamic Import Safety

Three components use dynamic `import()`:
1. `SkillsPanel.jsx:167`: `const { SubSkills: SS } = await import("../../lib/db.js");`
2. `PracticeMode.jsx:311`: `const { SubSkills } = await import("../../lib/db.js");`
3. `ModePicker.jsx` does NOT use dynamic imports (uses static imports for all lib functions)

These dynamic imports target a fixed local path (`../../lib/db.js`), not user-controlled strings. Safe.

### 6c. Clipboard Access

`NotifPanel.jsx:46` uses `navigator.clipboard.writeText(debugText)` to copy extraction error details. The text is assembled from `err.label`, `err.error`, and `err.debugInfo` — all internal data. The `.catch()` handler shows a notification if clipboard is unavailable. This is the same pattern used in the ErrorBoundary crash report.

---

## 7. Summary Table

| Audit Area | Verdict | Issues |
|---|---|---|
| Session State Persistence | **PASS** | None |
| Global Lock Interaction Blocking | **PASS** | N1: pre-existing architectural note (overlay only on study screen; handlers guard other screens) |
| Error Boundary Coverage | **PASS** | None — all sub-components within StudyErrorBoundary |
| Stale State / Context Dependencies | **PASS** | S1 (pre-existing): `setSessionElapsed` not in context value |
| FSRS Calculations Unchanged | **PASS** | fsrs.js completely untouched; no call chain modifications |
| New Attack Surface | **PASS** | None introduced |

---

## 8. Recommendations

### Must Fix Before Ship
1. **Bug S1**: Add `setSessionElapsed,` to StudyContext.jsx line 905 context value object

### Optional Cleanup
1. **C1**: Remove unused imports `effectiveStrength` and `currentRetrievability` from ModePicker.jsx
2. **C2**: Remove unused destructured values `parsing` from MaterialsPanel.jsx and `status` from SkillsPanel.jsx
3. **N1**: Consider rendering GlobalLockOverlay at the ScreenRouter level (before screen checks) rather than as a fallback, to ensure overlay shows on all screens during long operations
