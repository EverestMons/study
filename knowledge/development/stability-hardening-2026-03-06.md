# Stability Hardening — Development Log
**Date:** 2026-03-06
**Developer:** Study Developer Agent
**Blueprint:** `knowledge/architecture/stability-hardening-2026-03-06.md`
**Build:** `npm run build` passes

---

## Summary

Fixed 5 stability issues (S1–S5) in StudyContext.jsx and main.jsx. No features, no schema changes. Targets white-screen crashes, data-loss race conditions, and DOM pollution from duplicate error handlers.

---

## Fixes Applied

### S1: `enterStudy` — unprotected await
**File:** `StudyContext.jsx` line 503
**Change:** Moved `await DB.saveChat(course.id, [])` inside the existing try/catch block. Previously sat outside, so a DB failure would propagate as an unhandled rejection and white-screen the app.

### S2: Init effect — `setReady(true)` outside try/catch
**File:** `StudyContext.jsx` lines 199–211
**Change:** Moved `setReady(true)` inside the try block (after successful init). Also call `setReady(true)` in the catch block after `setAsyncError`, so the error screen still renders. Auto-save effect (S5) now gates on `!asyncError` to prevent writing empty courses after a failed init.

### S3: Init effect — no StrictMode cancellation guard
**File:** `StudyContext.jsx` lines 199–215
**Change:** Added `let cancelled = false` with cleanup `return () => { cancelled = true }`. Each `setState` call in the async IIFE checks `if (cancelled) return` before proceeding. Prevents the StrictMode double-invoke race where the first invocation's stale results overwrite the second's.

### S4: Duplicate error listeners in main.jsx
**File:** `main.jsx`
**Change:** Removed `window.addEventListener("error")` and `window.addEventListener("unhandledrejection")` handlers that appended `<pre>` elements to the DOM. These duplicated the StudyContext error listeners (which set `asyncError` → ErrorDisplay component) and caused stacking orange overlays. The 3s mount-failure fallback in index.html remains as the pre-React safety net.

### S5: Auto-save can write empty courses
**File:** `StudyContext.jsx` line 217
**Change:** Added `coursesLoaded` ref (set to `true` only after init successfully loads courses). Auto-save guard changed from `ready && !globalLock` to `ready && !globalLock && !asyncError && coursesLoaded.current`. This prevents `DB.saveCourses([])` from firing before courses are loaded or after a failed init.

### C1 + C2: Already fixed
Unused imports in ModePicker.jsx and unused destructures in MaterialsPanel.jsx/SkillsPanel.jsx were fixed in the previous commit (`a8589c0`).

---

## Files Modified

| File | Changes |
|---|---|
| `src/StudyContext.jsx` | S1: enterStudy try/catch. S2: setReady placement. S3: cancelled guard + coursesLoaded ref. S5: auto-save guard. |
| `src/main.jsx` | S4: Removed error listeners (23 → 10 lines). |

---

## Testing Notes

- Build passes with no new warnings
- StrictMode double-invoke of init effect is now safe (cancelled guard prevents stale overwrites)
- Auto-save will not fire until courses are successfully loaded from DB
- enterStudy DB failure is now caught and logged, not white-screened
- Error handling coverage: StudyContext listeners → asyncError → ErrorDisplay (render errors caught by StudyErrorBoundary). Mount failures caught by index.html 3s timeout.
