# Background Extraction — Development Log
**Date:** 2026-03-17
**Blueprint:** `knowledge/architecture/background-extraction-2026-03-17.md`
**Build:** Verified clean (`npm run build` — 0 errors)

---

## Files Modified

### `src/StudyContext.jsx`
- **Added `bgExtraction` state** (line 117): `useState(null)` — tracks background extraction progress
- **Added `runBackgroundExtraction(courseId, extractable)`** — fire-and-forget function that:
  - Iterates materials sequentially
  - Checks `extractionCancelledRef` between materials (cancellation now functional)
  - Updates per-material status via `setBgExtraction` functional updater
  - Handles `needsUserDecision` (dupPrompt) as a blocking `await` within the loop
  - Wraps each material in individual try/catch (error resilience — one failure doesn't skip remaining)
  - Refreshes courses and skill counts on completion
  - Auto-clears `bgExtraction` after 3s delay
- **Refactored `createCourse`**: Phase 1 (blocking, keeps `globalLock`) → Phase 2 (fire-and-forget via `runBackgroundExtraction`)
  - Removed `setBusy(true/false)` — chat stays available during extraction
  - Phase 1 ends with `setGlobalLock(null); setScreen("materials")`
  - Phase 2 fires without `await`
- **Refactored `addMats`**: Same Phase 1/Phase 2 split
  - Added `bgExtraction` guard to prevent concurrent extraction
  - Removed `setBusy(true/false)`
- **Refactored `retryAllFailed`**: Uses `bgExtraction` + `runBackgroundExtraction` instead of `globalLock`
  - Removed `setBusy(true/false)` and `setGlobalLock`
- **Cleaned `removeMat`**: Removed `setBusy` (material removal doesn't block chat)
- **Context value**: Added `bgExtraction, setBgExtraction` to exported value + useMemo deps

### `src/components/GlobalLockOverlay.jsx`
- **Removed all `dupPrompt` rendering** (60+ lines)
- Kept only: spinner + status + cancel + force-unlock
- Now purely a "please wait" overlay for Phase 1 operations

### `src/components/DupPromptModal.jsx` (NEW)
- Standalone modal for near-duplicate decision
- Extracted from GlobalLockOverlay — identical UI but independent of `globalLock`
- `position: fixed; zIndex: 2000` — appears over screen content
- Resolves promise via `dupPrompt.resolve("skip"|"extract")`

### `src/components/ExtractionProgress.jsx` (NEW)
- Fixed-bottom banner: `position: fixed; bottom: 16px; left: 50%`
- Shows: material name, progress count (N/M), progress bar, status text, cancel button
- Click anywhere → `setScreen("materials")` for full detail
- Cancel button → `extractionCancelledRef.current = true`
- Auto-hides when all materials are done (via bgExtraction state)

### `src/ScreenRouter.jsx`
- **Imports**: Added `DupPromptModal`, `ExtractionProgress`
- **Destructuring**: Added `bgExtraction, dupPrompt`
- **Renders**: `DupPromptModal` when `dupPrompt && !globalLock`, `ExtractionProgress` when `bgExtraction && screen !== "materials"`
- **Kept** `if (globalLock) return <GlobalLockOverlay />` early return — Phase 1 still blocks UI

### `src/screens/MaterialsScreen.jsx`
- **Removed** `GlobalLockOverlay` import + inline render (`{globalLock && <GlobalLockOverlay />}`)
- **Removed** `busy, setBusy, globalLock, setGlobalLock` from destructuring
- **Added** `bgExtraction, setBgExtraction` to destructuring
- **Retry button**: Uses `bgExtraction` pattern — sets `bgExtraction` state, no `globalLock`, no `setBusy`
  - Still calls `Chunks.resetForRetry()` before extraction (unique to single-material retry)
  - Disabled when `bgExtraction || processingMatId`
  - Clears `bgExtraction` via `setTimeout(() => setBgExtraction(null), 2000)` in finally
- **Retry All button**: Disabled on `bgExtraction || processingMatId` instead of `globalLock`

## Files NOT Modified (per constraints)
- `src/lib/extraction.js`
- `src/lib/skills.js`
- `src/lib/db.js`

## Key Design Decisions
1. `busy` is now chat-only — never set during extraction
2. `extractionCancelledRef` checked between materials in the for-loop (previously unchecked — cancellation was non-functional)
3. Per-material error isolation: failure on material N doesn't skip material N+1
4. `dupPrompt` renders in ScreenRouter (not MaterialsScreen) so it appears regardless of which screen the user is on
5. `ExtractionProgress` hidden on MaterialsScreen to avoid duplicate progress UI
