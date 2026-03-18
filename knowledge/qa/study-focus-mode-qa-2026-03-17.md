# Study Session Focus Mode -- QA Report

**Date**: 2026-03-17
**Analyst**: Static code-level trace
**Scope**: Focus mode rendering, previousScreen tracking, exit navigation, edge cases
**Files reviewed**:
- `src/StudyContext.jsx` (1,515 lines)
- `src/screens/StudyScreen.jsx` (139 lines)
- `src/components/study/SessionSummary.jsx` (194 lines)
- `src/screens/MaterialsScreen.jsx` (726 lines)
- `src/screens/CurriculumScreen.jsx` (503 lines)
- `src/ScreenRouter.jsx` (87 lines)

---

## Summary Table

| # | Test Case | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | Focus enforcement (in-session) | **PASS** | TopBarButtons gated by `!inSession`; exit button shown when `inSession` |
| 2 | Pre-session state | **PASS** | TopBarButtons shown, exit hidden when `!inSession` |
| 3 | previousScreen -- from CourseHomepage | **PASS** | `enterStudy` captures `screen` before `setScreen("study")` |
| 4 | previousScreen -- from CurriculumScreen | **PASS** | `bootWithFocus` guard `screen !== "study"` captures `"curriculum"` |
| 5 | previousScreen -- from MaterialsScreen | **PASS** | Both direct `setScreen("study")` calls preceded by `setPreviousScreen(screen)` |
| 6 | Exit saves data | **PASS** | `saveSessionToJournal()` called in both branches of `handleExitSession` |
| 7 | Session summary preserved | **PASS** | `setSessionSummary(...)` called before navigation; "Done" defers nav |
| 8 | Edge case -- refresh | **PASS** | Default `"courseHome"` is safe; `active` is also reset so ScreenRouter shows HomeScreen |
| 9 | Edge case -- no active course | **PASS** with concern | `bootWithFocus` returns early if `!active`; exit navigates to `safeScreen` which may render null if `active` is null |
| 10 | Regression -- enterStudy + practice mode | **PASS** | `enterStudy` unchanged functionally; `initialMode` path preserved |

---

## Detailed Traces

### Test 1: Focus Enforcement (In-Session)

**Goal**: During active study session, TopBarButtons are NOT rendered. Only exit button visible.

**Trace**:
1. `StudyScreen.jsx` line 41: `const inSession = msgs.length > 0 || booting;`
2. When session is active, `msgs.length > 0` is true (messages populated by `bootWithFocus` at `StudyContext.jsx` line 1109: `setMsgs([...])`) or `booting` is true (set to true at line 1042).
3. Line 78-82: `{inSession ? (<button onClick={handleExitSession} ...>Exit Session</button>) : (...)}` -- exit button is rendered.
4. Line 97: `{!inSession && <TopBarButtons />}` -- TopBarButtons hidden because `inSession` is true.
5. Session timer at line 90-93: `{msgs.length > 0 && sessionElapsed > 0 && (...)}` -- timer visible during active session.

**Verdict**: **PASS**

**Notes**: The `booting` flag is a good addition to the gate. Without it, there would be a brief window after `bootWithFocus` sets `booting = true` but before the first message arrives where TopBarButtons would flash visible. The `|| booting` catches this transition state.

---

### Test 2: Pre-Session State

**Goal**: Before session starts, TopBarButtons ARE visible and exit button is NOT shown.

**Trace**:
1. When `enterStudy` runs (`StudyContext.jsx` line 827-863), it resets: `setMsgs([])` (line 830), and `booting` is not set (only `bootWithFocus` sets `booting`).
2. So `inSession = msgs.length > 0 || booting` evaluates to `false || false = false`.
3. `StudyScreen.jsx` line 83-87: The else branch renders `< Back` button (pre-session back).
4. Line 97: `{!inSession && <TopBarButtons />}` renders TopBarButtons because `inSession` is false.

**Verdict**: **PASS**

**Notes**: The mode picker (SkillPicker, AssignmentPicker, ExamScopePicker) is shown at lines 110-115 gated by `sessionMode && !focusContext && !booting && msgs.length <= 1`. During this pre-session phase, the user sees the picker and TopBarButtons, which is correct.

---

### Test 3: previousScreen Tracking -- From CourseHomepage

**Goal**: `enterStudy` captures current `screen` before navigating to study.

**Trace**:
1. User is on CourseHomepage. `screen` state = `"courseHome"`.
2. CourseHomepage calls `enterStudy(course, initialMode)` (referenced in architecture doc as `CourseHomepage.jsx` lines 113/119/125).
3. `StudyContext.jsx` line 827-829:
   ```js
   const enterStudy = async (course, initialMode) => {
     setPreviousScreen(screen);  // screen = "courseHome" at this point
     setActive(course); setScreen("study");
   ```
4. `setPreviousScreen("courseHome")` is called BEFORE `setScreen("study")`.
5. On exit, `handleExitSession` (StudyScreen.jsx line 59): `const safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome"` evaluates to `"courseHome"`.
6. `setScreen("courseHome")` returns user to CourseHomepage.

**Verdict**: **PASS**

**Notes**: The `screen` value read inside `enterStudy` is the closure value at call time. Since React state updates are batched, `screen` still holds `"courseHome"` when `setPreviousScreen(screen)` executes. This is correct.

---

### Test 4: previousScreen Tracking -- From CurriculumScreen

**Goal**: "Study This Skill" from CurriculumScreen correctly captures `"curriculum"`.

**Trace**:
1. User is on CurriculumScreen. `screen` state = `"curriculum"`.
2. `CurriculumScreen.jsx` line 156-158: `handleStudySkill(sk)` calls `bootWithFocus({ type: "skill", skill: fullSkill || sk })`.
3. Same path for `handleStudyWeakest` (line 132), `handleStudyQuestion` (line 140), `handleStartReview` (line 147).
4. `StudyContext.jsx` line 1038-1041:
   ```js
   const bootWithFocus = async (focus) => {
     if (!active) return;
     if (screen !== "study") setPreviousScreen(screen);  // screen = "curriculum"
     setScreen("study");
   ```
5. `screen !== "study"` is `"curriculum" !== "study"` = true, so `setPreviousScreen("curriculum")` is called.
6. `setScreen("study")` navigates to StudyScreen.
7. On exit, `previousScreen` is `"curriculum"`, and the safe screen check passes (`"curriculum" !== "study"`).
8. `setScreen("curriculum")` returns user to CurriculumScreen.

**Verdict**: **PASS**

**Notes**: The guard `if (screen !== "study")` is critical. When `bootWithFocus` is called from SkillPicker/AssignmentPicker/ExamScopePicker (which render inside StudyScreen), `screen` is already `"study"`, so `previousScreen` is NOT overwritten. The original entry screen is preserved. This is correct behavior.

---

### Test 5: previousScreen Tracking -- From MaterialsScreen

**Goal**: "Study Available Skills" and "Start Studying" buttons capture `"materials"`.

**Trace**:
1. User is on MaterialsScreen. `screen` state = `"materials"`.
2. MaterialsScreen destructures `screen, setPreviousScreen` at line 24: `screen, setScreen, setPreviousScreen`.

**Path A -- "Study Available Skills" (incomplete material)**:
3. `MaterialsScreen.jsx` line 253:
   ```js
   onClick={() => { setPreviousScreen(screen); setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study"); }}
   ```
4. `setPreviousScreen("materials")` is called before `setScreen("study")`.

**Path B -- "Start Studying" (ready material)**:
5. `MaterialsScreen.jsx` line 283:
   ```js
   onClick={() => { setPreviousScreen(screen); setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study"); }}
   ```
6. Same pattern. `setPreviousScreen("materials")` before `setScreen("study")`.

7. On exit, `previousScreen = "materials"`, safe screen check passes, user returns to MaterialsScreen.

**Verdict**: **PASS**

**Notes**: Both call sites follow the exact same pattern. The `screen` value at call time is `"materials"` because MaterialsScreen is the active screen. These calls bypass `enterStudy` and `bootWithFocus` entirely (Category 3 in the architecture doc), so having the inline `setPreviousScreen` is essential.

---

### Test 6: Exit Saves Data

**Goal**: `saveSessionToJournal()` is called before navigating away.

**Trace**:
1. `StudyScreen.jsx` line 43-61, `handleExitSession`:

**Branch A -- meaningful session** (`msgs.length > 1 && sessionStartTime.current`):
2. Line 45: `generateSessionEntry(...)` creates the entry object.
3. Line 52: `await saveSessionToJournal();` -- journal saved.
4. Lines 53-55: `asgnWork` captured, `setSessionSummary(...)` shows overlay. Navigation deferred.

**Branch B -- minimal session** (`else` branch):
5. Line 57: `await saveSessionToJournal();` -- journal saved.
6. Line 58: `clearSessionState();` -- state cleared.
7. Line 59-60: Navigate to `safeScreen`.

**Verdict**: **PASS**

**Notes**: `saveSessionToJournal` (`StudyContext.jsx` line 355-364) has an early-return guard: `if (!active || msgs.length <= sessionStartIdx.current + 1) return;`. This means if there are no meaningful messages to save, it gracefully returns without error. Both branches call `await saveSessionToJournal()` before any navigation, ensuring data integrity.

---

### Test 7: Session Summary Preserved

**Goal**: Session summary appears before final navigation.

**Trace**:
1. In `handleExitSession` Branch A (line 55):
   ```js
   setSessionSummary({ entry, skillChanges, duration, courseName: active.name, asgnWork: capturedAsgnWork, masteryEvents: ..., facetsAssessed: ... });
   ```
2. This triggers `SessionSummary.jsx` to render (it's always mounted at `StudyScreen.jsx` line 135, but returns null when `sessionSummary` is falsy -- line 18: `if (!sessionSummary) return null`).
3. SessionSummary renders as a full-screen overlay (`position: "absolute", inset: 0, zIndex: 100` -- line 41).
4. The "Done" button (line 182-186):
   ```js
   onClick={function() {
     clearSessionState();
     var safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome";
     setScreen(safeScreen);
   }}
   ```
5. `clearSessionState()` clears all session state including `setSessionSummary(null)` (StudyContext.jsx line 388).
6. Navigation happens AFTER the summary is cleared.

**Verdict**: **PASS**

**Notes**: The sequence is: (1) exit clicked -> journal saved -> summary displayed, (2) user reviews summary, (3) "Done" clicked -> state cleared -> navigate. The user always sees the summary before navigation. One observation: `clearSessionState` sets `setSessionSummary(null)` which means the overlay dismisses at the same time as navigation occurs. Since both happen in the same React batch, this is fine -- the user navigates away immediately.

---

### Test 8: Edge Case -- App Refresh

**Goal**: After refresh, `previousScreen` defaults to `"courseHome"` which is safe.

**Trace**:
1. `StudyContext.jsx` line 65: `const [previousScreen, setPreviousScreen] = useState("courseHome");`
2. After app refresh, ALL React state resets to initial values:
   - `screen` = `"home"` (line 64)
   - `previousScreen` = `"courseHome"` (line 65)
   - `active` = `null` (line 67)
   - `msgs` = `[]` (line 83)
3. Since `screen = "home"`, the user lands on HomeScreen.
4. `active = null`, so even if `previousScreen` is `"courseHome"`, `ScreenRouter.jsx` line 67 checks: `screen === "courseHome" && active`. If the user somehow ended up navigating to `previousScreen`, `active` would need to be set.

**But this is a non-issue**: After refresh, the user starts fresh on HomeScreen. They must select a course (which sets `active`) before entering any study session. When they enter study, `setPreviousScreen(screen)` captures their actual entry screen, overwriting the default.

**The default `"courseHome"` is never actually used after refresh** because:
- The user must navigate to a course first (setting `active`), then enter study (capturing the real `previousScreen`).
- The only way the default would be used is if some code directly navigated to `previousScreen` without the user having entered study -- which doesn't happen.

**Verdict**: **PASS**

**Notes**: The default is a safe fallback. Even if it were somehow used, `ScreenRouter` would check `screen === "courseHome" && active` (line 67). If `active` is null, `content` remains null and the user sees a blank screen. However, as analyzed above, this scenario cannot occur through normal app flow.

---

### Test 9: Edge Case -- No Active Course (`active` is null)

**Goal**: Exit button click when `active` is null does not crash.

**Trace**:
1. `active` could theoretically be null if the course was deleted during a session (via `delCourse` at `StudyContext.jsx` line 1248-1258, which calls `setActive(null)` if the deleted course matches active).
2. `handleExitSession` (StudyScreen.jsx line 43-61):
   - Branch A check: `msgs.length > 1 && sessionStartTime.current` -- this could be true.
   - Line 45: `generateSessionEntry(msgs, ...)` -- does not require `active`.
   - Line 47: `cachedSessionCtx.current?.skills || []` -- safe with optional chaining.
   - Line 52: `await saveSessionToJournal()` -- `StudyContext.jsx` line 356: `if (!active || ...) return;` -- early return when `active` is null. No crash.
   - Line 55: `active.name` -- **THIS IS A PROBLEM**. If `active` is null, `active.name` throws `TypeError: Cannot read property 'name' of null`.
3. However, reaching StudyScreen with `active === null` is actually prevented:
   - `ScreenRouter.jsx` line 76: `else if (screen === "study" && active) content = <StudyScreen />;`
   - If `active` is null and `screen` is `"study"`, `content` is null. StudyScreen is never rendered.
   - When `delCourse` sets `active = null`, it also sets `screen = "home"` (line 1254). So the user is navigated away before StudyScreen can re-render with null active.
4. But there's a race condition window: `setActive(null)` and `setScreen("home")` are batched together, so React processes both before re-rendering. StudyScreen would not see `active = null` because it would unmount.

**Branch B** (else path):
5. `saveSessionToJournal()` early-returns if `!active`.
6. `clearSessionState()` does not reference `active`.
7. `setScreen(safeScreen)` -- works fine regardless of `active`.

**Verdict**: **PASS** with concern

**Notes**: The architecture protects against this via ScreenRouter's guard (`screen === "study" && active`). If `active` becomes null, StudyScreen is not rendered. However, the `active.name` reference on line 55 of `StudyScreen.jsx` is technically unguarded. In practice, the ScreenRouter guard prevents this path from executing, but a defensive `active?.name || "Course"` would be more robust.

---

### Test 10: Regression -- enterStudy from CourseHomepage + Practice Mode

**Goal**: `enterStudy` still works from CourseHomepage mode picker. Practice mode entry unaffected.

**Trace**:
1. `enterStudy` (`StudyContext.jsx` line 827-863) now has one new line at 828:
   ```js
   setPreviousScreen(screen);
   ```
2. The rest of the function is identical to the pre-focus-mode implementation:
   - Line 829: `setActive(course); setScreen("study");`
   - Line 830: Clears all session state.
   - Lines 843-858: Journal capture, session creation.
   - Lines 860-862: `if (initialMode) selectMode(initialMode);` -- mode selection preserved.
3. CourseHomepage passes `initialMode` (e.g., `"assignment"`, `"skills"`, `"exam"`), which triggers `selectMode` to load picker data. This path is unaffected by the `setPreviousScreen` addition.

**Practice mode** (ProfileScreen):
4. ProfileScreen calls `await enterStudy(course)` which sets `previousScreen = "profile"`, then sets up practice mode inline (`setPracticeMode(...)`, `setSessionMode("practice")`).
5. `enterStudy` clears `setPracticeMode(null)` at line 830, but ProfileScreen sets it again inline after `enterStudy` returns. This is an existing pattern (not introduced by focus mode).

**Verdict**: **PASS**

**Notes**: The only change to `enterStudy` is the addition of `setPreviousScreen(screen)` at line 828. This is a pure addition that does not modify any existing behavior. The function signature, parameters, return behavior, and all existing state mutations remain identical.

---

## Additional Observations

### Observation A: `clearSessionState` Consolidation

`clearSessionState` (`StudyContext.jsx` lines 374-392) correctly consolidates the session reset logic. It is used in:
- `handleExitSession` Branch B (StudyScreen.jsx line 58)
- SessionSummary "Done" button (SessionSummary.jsx line 183)

However, `handleBackToOrigin` (StudyScreen.jsx lines 64-70) does NOT use `clearSessionState`. Instead, it manually clears a subset of state:
```js
setSessionMode(null); setPickerData(null); setChunkPicker(null);
setPracticeMode(null); setFocusContext(null); setCodeMode(false);
setMsgs([]); setInput("");
```

This is intentional and correct: `handleBackToOrigin` is the pre-session back button. It clears picker state but does not need to reset session refs (sessionStartIdx, sessionSkillLog, etc.) because no session was active. The lighter cleanup is appropriate.

### Observation B: `setScreen("study")` Unconditional in `bootWithFocus`

At `StudyContext.jsx` line 1041, `setScreen("study")` is called unconditionally (outside the `screen !== "study"` guard):
```js
if (screen !== "study") setPreviousScreen(screen);
setScreen("study");
```

When the user is already on the study screen (e.g., from SkillPicker), this `setScreen("study")` is a no-op (setting state to its current value). React skips re-render for identical values. This is harmless but slightly wasteful. The architecture doc suggested wrapping both lines in the guard, but the implementation chose to keep `setScreen("study")` unconditional for safety (ensures study screen is always active after `bootWithFocus`). This is a reasonable defensive choice.

### Observation C: Safe Screen Guard Consistency

The `safeScreen` pattern appears in three places:
1. `handleExitSession` (StudyScreen.jsx line 59): `(previousScreen && previousScreen !== "study") ? previousScreen : "courseHome"`
2. `handleBackToOrigin` (StudyScreen.jsx line 68): Same pattern.
3. SessionSummary "Done" (SessionSummary.jsx line 184): Same pattern.

All three are consistent, guarding against:
- `previousScreen` being falsy (falls back to `"courseHome"`)
- `previousScreen` being `"study"` (prevents circular navigation)

### Observation D: Missing `chatSessionId` Reset

`clearSessionState` resets all session state but does NOT reset `chatSessionId.current`. This is correct because `chatSessionId` is set during `enterStudy` (line 858) and should persist until the next `enterStudy` call. Clearing it during exit would cause issues if `saveSessionToJournal` is called after `clearSessionState` (e.g., by the `beforeunload` handler at line 367-372).
