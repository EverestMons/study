# Study Session Focus Mode

**Date**: 2026-03-17
**Status**: Blueprint
**Scope**: Distraction-free study session UI + previous-screen return navigation

---

## Problem

When a user is in an active study session, the `StudyScreen` top bar displays `< Back`, a session timer, and `<TopBarButtons />` (View Profile, Notifications, Settings). These navigation options pull the user out of learning flow. Additionally, the `< Back` button always navigates to `courseHome`, regardless of where the user entered the study session from.

## CEO Decisions (locked)

1. **Study session is distraction-free**: During an active session, only an exit button is visible -- no View Profile, Notifications, Settings, or other navigation.
2. **Exit returns to previous screen**: The exit button saves session progress, then returns the user to whatever screen they were on before entering the study session.

---

## Current State Analysis

### StudyScreen top bar (`src/screens/StudyScreen.jsx`)

The top bar renders three elements in a row:
1. `< Back` button (left) -- complex branching logic
2. Session timer (center-left, only when `msgs.length > 0 && sessionElapsed > 0`)
3. `<TopBarButtons />` (right) -- View Profile, Notifications, Settings

The `< Back` button has three branches:
- **Branch A** (`sessionMode || pickerData || chunkPicker || practiceMode`): Clears picker/mode state, navigates to `courseHome`.
- **Branch B** (`msgs.length > 1 && sessionStartTime.current`): Saves journal, builds session summary, shows `<SessionSummary />` overlay (does NOT navigate yet).
- **Branch C** (fallback): Saves journal, clears all state, navigates to `courseHome`.

### SessionSummary (`src/components/study/SessionSummary.jsx`)

Full-screen overlay (`position: absolute, inset: 0, zIndex: 100`). The "Done" button at the bottom clears all session state and navigates to `courseHome` via `setScreen("courseHome")`.

### Entry points to study screen

There are **three categories** of entry points, identified by searching for `setScreen("study")` and `enterStudy()` / `bootWithFocus()`:

#### Category 1: `enterStudy(course, initialMode)` -- Full entry with mode picker
**Location**: `src/StudyContext.jsx` line 730
**Calls `setScreen("study")`**: Yes (line 731)
**Callers**:
| Caller | File | Line | Source Screen |
|--------|------|------|---------------|
| Assignment mode card | `CourseHomepage.jsx` | 113 | `courseHome` |
| Exam prep mode card | `CourseHomepage.jsx` | 119 | `courseHome` |
| Skills mode card | `CourseHomepage.jsx` | 125 | `courseHome` |
| Schedule "Start Assignment" | `ScheduleScreen.jsx` | 348 | `schedule` |
| Schedule "Go to Course" | `ScheduleScreen.jsx` | 412 | `schedule` |
| Profile "Start Review" (due skills) | `ProfileScreen.jsx` | 207 | `profile` |
| Profile sub-skill "Practice" | `ProfileScreen.jsx` | 399 | `profile` |

#### Category 2: `bootWithFocus(focus)` -- Direct session boot (no picker)
**Location**: `src/StudyContext.jsx` line 940
**Calls `setScreen("study")`**: NO -- this is a known gap being fixed in a separate step. The user is expected to already be on the study screen OR the caller is responsible.
**Callers**:
| Caller | File | Line | Source Screen |
|--------|------|------|---------------|
| CurriculumScreen `handleStudyWeakest` | `CurriculumScreen.jsx` | 132 | `curriculum` |
| CurriculumScreen `handleStudyQuestion` | `CurriculumScreen.jsx` | 140 | `curriculum` |
| CurriculumScreen `handleStartReview` | `CurriculumScreen.jsx` | 147 | `curriculum` |
| CurriculumScreen `handleStudySkill` | `CurriculumScreen.jsx` | 158 | `curriculum` |
| SkillPicker "Start Review" | `SkillPicker.jsx` | 186 | `study` (already there) |
| SkillPicker skill "Learn" | `SkillPicker.jsx` | 239 | `study` (already there) |
| ExamScopePicker "Begin Prep" | `ExamScopePicker.jsx` | 58 | `study` (already there) |
| AssignmentPicker "Start Assignment" | `AssignmentPicker.jsx` | 171 | `study` (already there) |

#### Category 3: Direct `setScreen("study")` (no enterStudy)
| Caller | File | Line | Source Screen |
|--------|------|------|---------------|
| MaterialsScreen "Study Available Skills" | `MaterialsScreen.jsx` | 248 | `materials` |
| MaterialsScreen "Start Studying" | `MaterialsScreen.jsx` | 278 | `materials` |

These set `sessionMode` and `focusContext` inline, then call `setScreen("study")` directly without going through `enterStudy`.

### State variables (from `src/StudyContext.jsx` lines 64-139)

Key session state: `screen`, `active`, `msgs`, `sessionMode`, `focusContext`, `pickerData`, `chunkPicker`, `asgnWork`, `practiceMode`, `sessionSummary`, `sessionElapsed`, `breakDismissed`, `sidebarCollapsed`, `booting`.

Refs: `sessionStartIdx`, `sessionSkillLog`, `sessionMasteryEvents`, `sessionFacetUpdates`, `sessionMasteredSkills`, `cachedSessionCtx`, `sessionStartTime`, `discussedChunks`, `chatSessionId`.

**No `previousScreen` state exists today.**

---

## Architecture Design

### 1. New state: `previousScreen`

Add to `StudyContext.jsx` near line 64 (with the other screen state):

```js
const [previousScreen, setPreviousScreen] = useState("courseHome");
```

Default is `"courseHome"` -- this serves as the fallback for edge cases (app refresh, direct navigation).

**Expose** in the context value: `previousScreen, setPreviousScreen`.

### 2. Capture `previousScreen` at every entry point

#### Rule: Set `previousScreen` to `screen` (current value) immediately BEFORE `setScreen("study")`.

##### In `enterStudy()` (StudyContext.jsx line 730-731)

Current:
```js
const enterStudy = async (course, initialMode) => {
    setActive(course); setScreen("study");
```

Change to:
```js
const enterStudy = async (course, initialMode) => {
    setPreviousScreen(screen);
    setActive(course); setScreen("study");
```

This captures the current `screen` value at the moment of entry. Since `enterStudy` is called from `courseHome`, `schedule`, `profile`, etc., this correctly captures whichever screen the user was on.

##### In `bootWithFocus()` (StudyContext.jsx line 940-942)

`bootWithFocus` does not currently call `setScreen("study")`. When the fix to add `setScreen("study")` lands (referenced in the orchestration plan), that line must also set `previousScreen`:

```js
const bootWithFocus = async (focus) => {
    if (!active) return;
    if (screen !== "study") {
      setPreviousScreen(screen);
      setScreen("study");
    }
    // ...rest of function
```

The `screen !== "study"` guard is critical: `bootWithFocus` is called from SkillPicker, AssignmentPicker, and ExamScopePicker -- all of which render INSIDE StudyScreen. In those cases, the user is already on the study screen, so `previousScreen` was already captured when `enterStudy` ran. We must NOT overwrite it with `"study"`.

##### In MaterialsScreen direct `setScreen("study")` calls (lines 248, 278)

These bypass `enterStudy` entirely. They must be updated to set `previousScreen` before navigating:

```js
// Line 248
onClick={() => {
  setPreviousScreen(screen);  // captures "materials"
  setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study");
}}

// Line 278
onClick={() => {
  setPreviousScreen(screen);  // captures "materials"
  setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study");
}}
```

##### ProfileScreen `enterStudy` + `bootWithFocus` combo (lines 207, 399)

These call `await enterStudy(course)` which already captures `previousScreen`. Then they call `setSessionMode("practice")` and `setPracticeMode(...)` inline. Since `enterStudy` already ran and captured `screen` as `"profile"`, no additional changes needed for these callers. The `previousScreen` will correctly be `"profile"`.

### 3. Focus mode: stripped-down StudyScreen top bar

#### When focus mode applies

Focus mode activates when the user has an active session with messages: `msgs.length > 0`.

Before a session starts (mode picker, initial state), the full `TopBarButtons` remain visible since the user is in a selection/browsing state, not in learning flow.

#### New top bar layout

Replace the current top bar in `StudyScreen.jsx` with conditional rendering:

```jsx
{/* Top bar */}
<div style={{
  borderBottom: "1px solid " + T.bd,
  padding: "12px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0
}}>
  {/* Left: Back or Exit Session */}
  {msgs.length > 0 ? (
    <button onClick={handleExitSession} style={exitBtnStyle}>
      Exit Session
    </button>
  ) : (
    <button onClick={handleBackToOrigin} style={backBtnStyle}>
      &lt; Back
    </button>
  )}

  {/* Center: Session timer (focus mode only) */}
  {msgs.length > 0 && sessionElapsed > 0 && (
    <span style={{ fontSize: 11, color: T.txM, fontWeight: 400, marginLeft: 12 }}>
      {sessionElapsed < 60
        ? sessionElapsed + "m"
        : Math.floor(sessionElapsed / 60) + "h" + (sessionElapsed % 60 > 0 ? " " + (sessionElapsed % 60) + "m" : "")}
    </span>
  )}

  <div style={{ flex: 1 }} />

  {/* Right: TopBarButtons only in pre-session state */}
  {msgs.length === 0 && <TopBarButtons />}
</div>
```

#### Visual design for "Exit Session" button

The exit button should be clearly visible but not visually dominant -- a subtle, low-contrast style consistent with the app's dark theme. It should not look like a primary action; the primary action is studying.

```js
const exitBtnStyle = {
  background: "none",
  border: "1px solid " + T.bd,
  color: T.txD,
  cursor: "pointer",
  fontSize: 13,
  padding: "6px 14px",
  borderRadius: 8,
  transition: "all 0.15s ease",
  fontWeight: 500
};
```

### 4. Exit flow: `handleExitSession`

The exit flow replaces the current `< Back` button's Branch B and Branch C logic. It runs a sequence: save data, show summary (if applicable), then navigate.

```jsx
const handleExitSession = async () => {
  if (msgs.length > 1 && sessionStartTime.current) {
    // Active session with meaningful content -> save + show summary
    const entry = generateSessionEntry(
      msgs, sessionStartIdx.current,
      sessionSkillLog.current,
      sessionMasteryEvents.current,
      sessionFacetUpdates.current
    );
    const duration = Math.floor((Date.now() - sessionStartTime.current) / 60000);
    const allSkills = cachedSessionCtx.current?.skills || [];
    const skillChanges = sessionSkillLog.current.map(u => {
      const sk = allSkills.find(s => s.id === u.skillId || s.conceptKey === u.skillId);
      return { ...u, name: sk?.name || u.skillId, strength: sk ? effectiveStrength(sk) : 0 };
    });
    await saveSessionToJournal();
    var capturedAsgnWork = asgnWork;
    setAsgnWork(null);
    setSessionSummary({
      entry, skillChanges, duration,
      courseName: active.name,
      asgnWork: capturedAsgnWork,
      masteryEvents: sessionMasteryEvents.current.slice(),
      facetsAssessed: sessionFacetUpdates.current.slice()
    });
    // SessionSummary overlay takes over -- navigation happens on "Done"
  } else {
    // Minimal session (no meaningful messages) -> save + navigate directly
    await saveSessionToJournal();
    clearSessionState();
    setScreen(previousScreen || "courseHome");
  }
};
```

#### Pre-session back button: `handleBackToOrigin`

When in pre-session state (picker visible, no messages yet), the back button returns to `previousScreen` without saving anything:

```jsx
const handleBackToOrigin = () => {
  setSessionMode(null);
  setPickerData(null);
  setChunkPicker(null);
  setPracticeMode(null);
  setFocusContext(null);
  setCodeMode(false);
  setMsgs([]);
  setInput("");
  setScreen(previousScreen || "courseHome");
};
```

### 5. SessionSummary "Done" button update

The `SessionSummary` "Done" button currently hardcodes `setScreen("courseHome")`. Change it to navigate to `previousScreen`:

```jsx
// In SessionSummary.jsx
const { previousScreen, /* ... existing destructured values */ } = useStudy();

// Done button onClick:
onClick={function() {
  setSessionSummary(null);
  setScreen(previousScreen || "courseHome");  // <-- changed from "courseHome"
  setMsgs([]); setInput(""); setCodeMode(false);
  setSessionMode(null); setFocusContext(null);
  setPickerData(null); setChunkPicker(null);
  setAsgnWork(null); setPracticeMode(null);
  setShowSkills(false); setSkillViewData(null);
  sessionStartIdx.current = 0;
  sessionSkillLog.current = [];
  sessionMasteryEvents.current = [];
  sessionFacetUpdates.current = [];
  sessionMasteredSkills.current = new Set();
  cachedSessionCtx.current = null;
  sessionStartTime.current = null;
  discussedChunks.current = new Set();
  setSessionElapsed(0);
  setBreakDismissed(false);
  setSidebarCollapsed(false);
}}
```

### 6. Session state cleanup helper

The reset logic is duplicated across `handleExitSession`, `handleBackToOrigin`, and `SessionSummary`. Extract it:

```js
// In StudyContext.jsx, after saveSessionToJournal
const clearSessionState = useCallback(() => {
  setMsgs([]); setInput(""); setCodeMode(false);
  setSessionMode(null); setFocusContext(null);
  setPickerData(null); setChunkPicker(null);
  setAsgnWork(null); setPracticeMode(null);
  setShowSkills(false); setSkillViewData(null);
  sessionStartIdx.current = 0;
  sessionSkillLog.current = [];
  sessionMasteryEvents.current = [];
  sessionFacetUpdates.current = [];
  sessionMasteredSkills.current = new Set();
  cachedSessionCtx.current = null;
  sessionStartTime.current = null;
  discussedChunks.current = new Set();
  setSessionSummary(null);
  setSessionElapsed(0);
  setBreakDismissed(false);
  setSidebarCollapsed(false);
}, []);
```

Expose `clearSessionState` in the context value. Use it in StudyScreen, SessionSummary, and enterStudy.

---

## Edge Cases

### Refresh during session

On app refresh, all React state resets. `previousScreen` defaults to `"courseHome"`. This is the correct fallback -- the user lands on the home screen after refresh, and if they re-enter study, `previousScreen` captures their new entry point.

**No persistence needed**: `previousScreen` is ephemeral. Persisting it to SQLite adds complexity without benefit because the entire session state (messages, timers, etc.) is also lost on refresh.

### Screen requiring `active` but `active` cleared

When the exit flow calls `setScreen(previousScreen)`, the `ScreenRouter` checks `active` for screens like `curriculum`, `materials`, `schedule`, etc. Since `active` is NOT cleared during exit (it remains set to the current course), this is safe. The `active` state is only cleared when the user explicitly navigates to the home screen or selects a different course.

However, if `active` were somehow null and `previousScreen` is `"curriculum"`, `ScreenRouter` would render null (line 71: `else if (screen === "curriculum" && active)`). To guard against this:

```js
// In exit navigation
const safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome";
setScreen(safeScreen);
```

This also guards against the impossible-but-defensive case where `previousScreen` is `"study"` (circular).

### ProfileScreen entry with `enterStudy` + inline `bootWithFocus`

ProfileScreen calls `await enterStudy(course)` which sets `previousScreen = "profile"`. Then it sets up practice mode inline. On exit, the user returns to `profile`. This is correct behavior -- the user was viewing their profile, drilled into practice, and returns to their profile.

However, `enterStudy` sets `setActive(course)` which may change the active course. If the user was on ProfileScreen (which is course-agnostic), returning to `profile` still works because ProfileScreen does not require `active`.

### `bootWithFocus` called from CurriculumScreen

CurriculumScreen calls `bootWithFocus` directly (not through `enterStudy`). The user is on screen `"curriculum"`. With the proposed fix, `bootWithFocus` will detect `screen !== "study"`, set `previousScreen = "curriculum"`, then `setScreen("study")`. On exit, the user returns to `curriculum`. Correct.

### `bootWithFocus` called from within StudyScreen (pickers)

SkillPicker, AssignmentPicker, ExamScopePicker all call `bootWithFocus` while the user is already on the study screen. The `screen !== "study"` guard prevents overwriting `previousScreen`. The original entry point's screen is preserved. Correct.

### MaterialsScreen direct navigation

MaterialsScreen bypasses `enterStudy`. With the proposed fix, `setPreviousScreen(screen)` captures `"materials"`. On exit, the user returns to `materials`. Correct.

---

## File Change Summary

| File | Change | Lines |
|------|--------|-------|
| `src/StudyContext.jsx` | Add `previousScreen` / `setPreviousScreen` state | ~64 |
| `src/StudyContext.jsx` | Add `clearSessionState` helper | ~336 (after saveSessionToJournal) |
| `src/StudyContext.jsx` | `enterStudy`: capture `previousScreen` before `setScreen` | ~731 |
| `src/StudyContext.jsx` | `bootWithFocus`: guard + capture `previousScreen` + `setScreen("study")` | ~940-942 |
| `src/StudyContext.jsx` | Expose `previousScreen`, `setPreviousScreen`, `clearSessionState` in context value | ~1416+ |
| `src/screens/StudyScreen.jsx` | Conditional top bar: focus mode (exit only) vs pre-session (back + TopBarButtons) | ~top bar section |
| `src/screens/StudyScreen.jsx` | Replace `< Back` onClick with `handleExitSession` / `handleBackToOrigin` | ~top bar section |
| `src/components/study/SessionSummary.jsx` | "Done" button: `setScreen(previousScreen \|\| "courseHome")` | ~Done button |
| `src/screens/MaterialsScreen.jsx` | Add `setPreviousScreen(screen)` before `setScreen("study")` at lines 248, 278 | ~248, 278 |

---

## Implementation Order

1. **Add `previousScreen` state + `clearSessionState` helper** to `StudyContext.jsx`. Expose in context value.
2. **Capture `previousScreen`** in `enterStudy()`, `bootWithFocus()`, and MaterialsScreen direct calls.
3. **Rewrite StudyScreen top bar** with conditional focus mode rendering.
4. **Update SessionSummary "Done"** to navigate to `previousScreen`.
5. **Test each entry point** (CourseHomepage, CurriculumScreen, ScheduleScreen, ProfileScreen, MaterialsScreen) to verify correct return navigation.
6. **Test focus mode** by entering a session and confirming only the exit button and timer are visible.

---

## What NOT to change

- **Session timer**: Remains visible during focus mode. It provides useful awareness without being a distraction or navigation path.
- **Break reminder banner**: Remains visible during focus mode. It is contextual to studying, not a distraction.
- **MaterialsPanel / SkillsPanel / NotifPanel**: These are slide-out panels triggered by the AI conversation, not by top bar navigation. They remain as-is.
- **PracticeMode**: Occupies the full study area when active. Its own internal navigation (next problem, complete tier) is not affected by focus mode.
- **InputBar**: Remains at the bottom. Not affected.
- **Keyboard shortcuts**: None exist for navigation currently. No changes needed.
