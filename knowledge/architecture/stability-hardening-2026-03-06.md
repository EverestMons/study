# Stability Hardening — Architecture Notes
**Date:** 2026-03-06
**Project:** study
**Assigned By:** CEO
**Status:** Draft

---

## Overview

The study app experiences white screen crashes, primarily in dev mode but with several real bugs that would survive into a release build. This document catalogs the confirmed issues and defines the fixes. This is a stability pass — no features, no schema changes.

## Issue Catalog

### S1. `enterStudy` — unprotected await
**File:** `StudyContext.jsx` line 504
**Severity:** Medium — crash risk
**Description:** `await DB.saveChat(course.id, [])` sits outside the try/catch block. If the DB call fails, the error propagates as an unhandled rejection, triggering the async error handler and potentially white-screening.
**Fix:** Move inside the existing try/catch, or wrap in its own try/catch with a non-fatal `console.error`.

### S2. Init effect — `setReady(true)` outside try/catch
**File:** `StudyContext.jsx` line 211
**Severity:** High — data risk
**Description:** If DB init fails, the catch block sets `asyncError` but then `setReady(true)` runs unconditionally. This allows the auto-save effect to fire against an empty `courses` array, potentially overwriting real data with `[]`.
**Fix:** Move `setReady(true)` inside the try block (after successful init) and add `setReady(true)` in the catch block ONLY after `setAsyncError`. Better: add a `finally` that sets ready, but gate auto-save on `!asyncError` in addition to `ready`.

### S3. Init effect — no StrictMode cancellation guard
**File:** `StudyContext.jsx` lines 199-212
**Severity:** Medium — race condition in dev mode
**Description:** React StrictMode double-invokes the init effect. The IIFE has no cancellation pattern (`let cancelled = false; return () => { cancelled = true }`). Both invocations race. The second may resolve before the first, and the first then overwrites with stale data.
**Fix:** Add a `cancelled` flag in the cleanup function. Check `if (cancelled) return` before each `setState` call in the IIFE.

### S4. Duplicate error listeners in main.jsx + StudyContext
**File:** `main.jsx` lines 6-18, `StudyContext.jsx` lines 191-197
**Severity:** Low — DOM pollution, confusing UX
**Description:** Two separate error handling systems: main.jsx appends `<pre>` elements to the DOM, StudyContext sets `asyncError` state which renders the ErrorDisplay component. Both fire on every error. The main.jsx listeners never clean up, so after multiple errors the DOM accumulates stacking orange overlays behind the ErrorDisplay.
**Fix:** Remove the main.jsx error listeners. The StudyContext listeners + ErrorDisplay + the 3-second mount fallback in index.html provide complete coverage. The main.jsx listeners were a dev-time safety net that's now redundant.

### S5. Auto-save can write empty courses
**File:** `StudyContext.jsx` line 213
**Severity:** High — data loss risk
**Description:** Auto-save fires when `courses` changes and `ready` is true. Due to S2 and S3, `ready` can be true while `courses` is still `[]`. The 500ms debounce helps but doesn't eliminate the window where `DB.saveCourses([])` wipes real data.
**Fix:** Add guard: `if (ready && !globalLock && !asyncError && courses.length > 0)`. Also consider: don't auto-save if `courses` haven't been loaded yet (add a `coursesLoaded` ref that's set to true only after the init effect successfully loads courses).

### C1. Unused imports in ModePicker.jsx (carried from decomposition)
**File:** `src/components/study/ModePicker.jsx`
**Severity:** None — tree-shaken in production
**Fix:** Remove `effectiveStrength` and `currentRetrievability` from imports.

### C2. Unused destructured values (carried from decomposition)
**Files:** `MaterialsPanel.jsx` (`parsing`), `SkillsPanel.jsx` (`status`)
**Severity:** None
**Fix:** Remove from destructure.

---

## Migration Impact
None. No database tables, queries, or schema are affected.

## Assumptions
- The app will continue running in dev mode during active development
- A release build (`npx tauri build`) will be used for daily studying
- StrictMode stays enabled in dev (it catches real bugs, removing it hides problems)

## Open Questions / Flags
- None — all fixes are within developer authority (error handling improvements, no architectural changes)
