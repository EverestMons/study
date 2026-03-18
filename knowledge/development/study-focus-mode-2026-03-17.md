# Study Session Focus Mode

**Date**: 2026-03-17
**Status**: Implemented
**Blueprint**: `knowledge/architecture/study-focus-mode-2026-03-17.md`

---

## Summary

Implemented distraction-free focus mode for active study sessions. During an active session, the top bar shows only an "Exit Session" button and the session timer. All navigation elements (View Profile, Notifications, Settings) are hidden. On exit, the user returns to whichever screen they entered the study session from, rather than always going to `courseHome`.

## Changes

### 1. `src/StudyContext.jsx`

**New state**: `previousScreen` (default: `"courseHome"`)
- Added `const [previousScreen, setPreviousScreen] = useState("courseHome");` after `screen` state declaration.
- Exposed `previousScreen` and `setPreviousScreen` in context value and dependency array.

**New helper**: `clearSessionState` (`useCallback`)
- Extracted the duplicated session reset logic (clearing msgs, input, codeMode, sessionMode, focusContext, pickerData, chunkPicker, asgnWork, practiceMode, skills panel, all session refs, summary, elapsed, break, sidebar) into a single reusable function.
- Exposed in context value.

**Entry point captures**:
- `enterStudy()`: Added `setPreviousScreen(screen)` before `setScreen("study")`. Captures the current screen (courseHome, schedule, profile, etc.) at the moment of entry.
- `bootWithFocus()`: Added `if (screen !== "study") setPreviousScreen(screen)` before `setScreen("study")`. The guard prevents overwriting `previousScreen` when `bootWithFocus` is called from within StudyScreen by internal pickers (SkillPicker, AssignmentPicker, ExamScopePicker).

### 2. `src/screens/MaterialsScreen.jsx`

- Added `screen`, `setPreviousScreen` to the `useStudy()` destructuring.
- Both direct `setScreen("study")` calls ("Study Available Skills" and "Start Studying" buttons) now call `setPreviousScreen(screen)` first, capturing `"materials"` as the return destination.

### 3. `src/screens/StudyScreen.jsx`

**Focus mode conditional**: `const inSession = msgs.length > 0 || booting;`

**Top bar**:
- When `inSession` is true: Shows only "Exit Session" button (subtle border style) + session timer. `TopBarButtons` hidden.
- When `inSession` is false: Shows `< Back` button + `TopBarButtons` (original pre-session layout).

**`handleExitSession`**:
- If meaningful session (msgs.length > 1 + sessionStartTime): saves journal, builds session summary, shows SessionSummary overlay (navigation deferred to "Done" button).
- If minimal session: saves journal, calls `clearSessionState()`, navigates to `previousScreen` (with `"study"` loop guard and `"courseHome"` fallback).

**`handleBackToOrigin`**:
- Pre-session back: clears picker/mode state, navigates to `previousScreen` (with same safety guard).

### 4. `src/components/study/SessionSummary.jsx`

- Simplified `useStudy()` destructuring to only what's needed: `msgs, setScreen, previousScreen, clearSessionState, exporting, setExporting, sessionSummary, setSessionSummary`.
- "Done" button now calls `clearSessionState()` (replacing ~15 lines of inline reset) then navigates to `previousScreen` (with `"study"` loop guard and `"courseHome"` fallback).

## Edge cases handled

| Scenario | Behavior |
|----------|----------|
| App refresh during session | `previousScreen` defaults to `"courseHome"` -- correct fallback |
| `bootWithFocus` from within StudyScreen (pickers) | `screen !== "study"` guard prevents overwriting -- original entry screen preserved |
| `previousScreen` is `"study"` (defensive) | `safeScreen` guard falls back to `"courseHome"` |
| Exit to screen requiring `active` (curriculum, materials, etc.) | `active` is NOT cleared during exit -- safe navigation |
| ProfileScreen combo entry (enterStudy + inline bootWithFocus) | `enterStudy` captures `"profile"` first -- correct |

## Entry point coverage

| Source screen | Entry path | `previousScreen` captured |
|---|---|---|
| courseHome | `enterStudy()` via CourseHomepage | `"courseHome"` |
| schedule | `enterStudy()` via ScheduleScreen | `"schedule"` |
| profile | `enterStudy()` via ProfileScreen | `"profile"` |
| curriculum | `bootWithFocus()` via CurriculumScreen | `"curriculum"` |
| materials | Direct `setScreen("study")` via MaterialsScreen | `"materials"` |
| study (pickers) | `bootWithFocus()` from SkillPicker/AssignmentPicker/ExamScopePicker | Guard prevents overwrite -- original screen preserved |

## Build verification

`npm run build` passes cleanly. No new warnings introduced.
