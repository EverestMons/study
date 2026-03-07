# Stability Hardening — Testing Report
**Date:** 2026-03-06
**Analyst:** Security & Testing Agent
**Blueprint:** `knowledge/architecture/stability-hardening-2026-03-06.md`
**Dev Log:** `knowledge/development/stability-hardening-2026-03-06.md`

---

## Methodology

Static analysis of all five fixes against the codebase. Each fix is verified by tracing the control flow through the modified code and confirming the failure mode described in the blueprint is eliminated.

---

## S1: `enterStudy` — unprotected await

**Blueprint claim:** `await DB.saveChat(course.id, [])` sat outside try/catch. DB failure → unhandled rejection → white screen.

**Verification (PASS):**
- `StudyContext.jsx:503–514` — `await DB.saveChat(course.id, [])` is now on line 513, inside the try block that starts at line 503.
- The catch at line 514 logs `"Journal capture on enter:"` and swallows the error — non-fatal.
- All five DB calls in `enterStudy` (`getChat`, `getJournal`, `saveJournal`, `saveChat`) are now inside the same try/catch.
- **Failure mode eliminated:** A DB failure during course entry is caught and logged. The user enters the study screen with an empty chat instead of seeing a white screen.

**Edge case checked:** If `DB.getChat` fails (line 504), the entire block is skipped including `saveChat`. This is correct — we shouldn't clear a chat we failed to read.

---

## S2: Init effect — `setReady(true)` placement

**Blueprint claim:** `setReady(true)` ran unconditionally after try/catch, allowing auto-save to fire against empty `courses` before data loaded.

**Verification (PASS):**
- `StudyContext.jsx:200–222` — Init effect rewritten.
- **Happy path (try block, line 213):** `setReady(true)` runs only after `setCourses(loaded)` (line 206), `coursesLoaded.current = true` (line 207), and API key load (lines 208–212). Courses are populated before ready flips.
- **Error path (catch block, line 218):** `setAsyncError` fires first (line 217), then `setReady(true)` (line 218). This allows the error screen to render (ScreenRouter checks `asyncError` before `!ready`). Auto-save is gated on `!asyncError` (S5), so it won't fire.
- **Failure mode eliminated:** `ready` is never true while `courses` is still `[]` (happy path), and on failure the error state blocks auto-save.

---

## S3: Init effect — StrictMode cancellation guard

**Blueprint claim:** No cancellation pattern. StrictMode double-invoke causes two async IIFEs to race; first invocation's stale results can overwrite second's.

**Verification (PASS):**
- `StudyContext.jsx:201` — `let cancelled = false;` declared at top of effect.
- `StudyContext.jsx:221` — Cleanup returns `() => { cancelled = true; }`.
- **Cancellation checks at every async boundary:**
  - Line 205: `if (cancelled) return;` after `await DB.getCourses()`
  - Line 209: `if (cancelled) return;` after `await getApiKey()`
  - Line 216: `if (cancelled) return;` in catch block after `console.error`
- **StrictMode behavior:** First invocation fires, React unmounts + remounts, cleanup sets `cancelled = true` for first invocation, second invocation starts fresh with its own `cancelled = false`. When first invocation's awaits resolve, it hits `if (cancelled) return` and bails. Only second invocation's results persist.
- **Failure mode eliminated:** No stale overwrites from the first invocation.

**Note:** The `coursesLoaded.current = true` on line 207 is set before the cancellation check on line 209. This is safe because `coursesLoaded` is a ref (shared across invocations), and the second invocation will also set it to `true` after loading. If the first invocation sets it prematurely, the second invocation overwrites `courses` state with its own loaded data anyway. The ref can't cause a false positive because auto-save also requires `ready` (which hasn't been set yet at line 207).

---

## S4: Duplicate error listeners in main.jsx

**Blueprint claim:** main.jsx had `window.addEventListener("error")` and `window.addEventListener("unhandledrejection")` handlers that appended `<pre>` elements to the DOM, duplicating StudyContext's error listeners and causing stacking orange overlays.

**Verification (PASS):**
- `main.jsx` is now 9 lines: React import, ReactDOM import, App import, `createRoot().render()`. No error listeners.
- **StudyContext.jsx:192–197** retains the definitive error listeners that feed `asyncError` state → `ErrorDisplay` component via ScreenRouter.
- **index.html** 3s mount fallback remains as pre-React safety net (not verified here — out of scope, but confirmed in previous Phase 4 QA).
- **Error handling coverage is complete:**
  1. Module-level import failures → index.html 3s timeout (pre-React)
  2. Render errors → `StudyErrorBoundary` in App.jsx (React)
  3. Async errors (unhandled rejections, window errors) → StudyContext listeners → `asyncError` → `ErrorDisplay` (React)
- **Failure mode eliminated:** No DOM-appending error handlers remain. Multiple sequential errors produce a single `ErrorDisplay`, not stacking `<pre>` elements.

---

## S5: Auto-save can write empty courses

**Blueprint claim:** Auto-save fires when `courses` changes and `ready` is true. Due to S2/S3 race conditions, `ready` could be true while `courses` is still `[]`, causing `DB.saveCourses([])` to wipe real data.

**Verification (PASS):**
- `StudyContext.jsx:224` — Auto-save guard:
  ```
  if (ready && !globalLock && !asyncError && coursesLoaded.current)
  ```
- **Four conditions must all be true:**
  1. `ready` — app finished initializing
  2. `!globalLock` — no long operation in progress
  3. `!asyncError` — no error state (blocks save after failed init, per S2 catch)
  4. `coursesLoaded.current` — ref set to `true` only on line 207, after `setCourses(loaded)` succeeds
- **`coursesLoaded` ref (line 86):** Initialized as `useRef(false)`. Only set to `true` inside the try block after `DB.getCourses()` succeeds and `setCourses(loaded)` is called. Never set in the catch block.
- **Dependency array:** `[courses, ready, globalLock, asyncError]` — includes `asyncError` so the effect re-evaluates when error state changes.
- **Failure mode eliminated:** Auto-save cannot fire before courses are loaded from DB, and cannot fire after a failed init.

**Edge case checked:** If user deletes all courses (legitimate `courses.length === 0`), `coursesLoaded.current` is still `true` from init, so the save proceeds correctly. The blueprint suggested `courses.length > 0` as an alternative guard, but the `coursesLoaded` ref approach is better because it doesn't block saving an intentionally empty array.

---

## C1 + C2: Cleanup items

**Status:** Already fixed in commit `a8589c0` (pre-hardening). Confirmed not re-introduced:
- `ModePicker.jsx` — no `effectiveStrength` import, no `currentRetrievability` import
- `MaterialsPanel.jsx` — no `parsing` in useStudy destructure
- `SkillsPanel.jsx` — no `status` in useStudy destructure (only `setStatus`)

---

## Summary

| Fix | Status | Failure Mode |
|-----|--------|-------------|
| S1 | **PASS** | DB failure in enterStudy caught, non-fatal |
| S2 | **PASS** | setReady gated on successful init; error path blocks auto-save |
| S3 | **PASS** | Cancellation guard at every async boundary |
| S4 | **PASS** | No duplicate listeners; single error display path |
| S5 | **PASS** | coursesLoaded ref prevents premature auto-save |
| C1 | **PASS** | Previously fixed |
| C2 | **PASS** | Previously fixed |

**All 5 stability fixes verified. No regressions found. No new issues identified.**

---

## Runtime Test Recommendations

These are manual tests for the developer to run in `npm run tauri:dev`:

1. **S1 runtime:** Open DevTools → Console. Enter a course. Confirm no errors logged. To test failure path: temporarily add `throw new Error("test")` before `DB.getChat` in enterStudy, enter a course, confirm "Journal capture on enter:" logged but no white screen.
2. **S2 runtime:** Temporarily make `DB.getCourses()` throw. Confirm ErrorDisplay renders with "Failed to initialize database" message. Check that no `saveCourses` calls appear in console.
3. **S3 runtime:** In dev mode (StrictMode enabled), watch console during app boot. Confirm no "Can't perform a React state update on an unmounted component" warnings.
4. **S4 runtime:** Trigger an error (e.g., disconnect network mid-API call). Confirm only ErrorDisplay appears — no orange `<pre>` elements in DOM. Trigger multiple errors — confirm no stacking.
5. **S5 runtime:** Add `console.log("auto-save", courses.length)` to auto-save effect. Boot app, confirm first auto-save log shows `courses.length > 0` (never 0).
