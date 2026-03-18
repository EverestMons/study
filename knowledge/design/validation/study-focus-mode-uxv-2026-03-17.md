# UX Validation: Study Session Focus Mode

**Date**: 2026-03-17
**Validator**: Study UX Validator (code-level trace)
**Feature**: Distraction-free study session UI + previous-screen return navigation
**Files reviewed**:
- `src/screens/StudyScreen.jsx` (139 lines)
- `src/components/study/SessionSummary.jsx` (194 lines)
- `src/StudyContext.jsx` (1,515 lines)
- `src/screens/MaterialsScreen.jsx` (726 lines)
- `src/screens/CurriculumScreen.jsx` (503 lines)
- `src/ScreenRouter.jsx` (87 lines)
- `src/lib/theme.jsx` (101 lines)
- `knowledge/architecture/study-focus-mode-2026-03-17.md`
- `knowledge/development/study-focus-mode-2026-03-17.md`
- `knowledge/qa/study-focus-mode-qa-2026-03-17.md`

---

## Summary Table

| # | Criterion | Rating | Key Finding |
|---|-----------|--------|-------------|
| 1 | Focus vs Trapped | **Acceptable** | Exit button is visible but subtle; no keyboard shortcut; no confirmation dialog prevents accidental exit |
| 2 | Transition In | **Acceptable** | TopBarButtons disappear instantly on first message; fadeIn on ScreenRouter helps; no explicit mode indicator |
| 3 | Transition Out | **Smooth** | Journal save is async-awaited before summary; summary provides rich closure; Done navigates cleanly |
| 4 | Return Context | **Fully Lost** | CurriculumScreen and MaterialsScreen use local useState; all expansion state resets on re-mount |
| 5 | Learning Science | **Supports Focus** | Minimal chrome removes distractions; timer is low-key; break reminder aids metacognition; aligns with flow research |

**Overall UX Verdict**: **Ship with notes**

---

## Detailed Analysis

### 1. Focus vs Trapped

**Goal**: The user should feel focused, not imprisoned. They must always be able to exit without hunting for the button.

#### What is visible during an active session?

When `inSession = true` (defined at `StudyScreen.jsx` line 41 as `msgs.length > 0 || booting`), the top bar renders exactly:

1. **"Exit Session" button** (line 78-82) -- positioned at the far left.
2. **Session timer** (lines 90-93) -- visible only when `msgs.length > 0 && sessionElapsed > 0`, positioned center-left with `marginLeft: 12`.
3. **A flex spacer** (line 95) -- pushes the now-absent TopBarButtons area empty.

Everything else is hidden:
- `TopBarButtons` (View Profile, Notifications, Settings) -- gated by `{!inSession && <TopBarButtons />}` at line 97.
- The `< Back` button -- replaced by the exit button via the ternary at line 78.

**Exit button styling** (line 80):
```js
background: "none", border: "1px solid " + T.bd, color: T.txD, fontSize: 13,
padding: "6px 14px", borderRadius: 8, fontWeight: 500
```
This is a ghost-style button with a subtle border and dimmed text color (`T.txD`). It has a hover effect (`rgba(255,255,255,0.04)` background on mouseEnter). The label reads exactly **"Exit Session"** -- clear, unambiguous, and action-oriented.

**Positioning**: Top-left of the screen. This is the standard position for "back" or "escape" actions in the app. Every other screen places its `< Back` button in this same location, so users build muscle memory for the top-left escape hatch.

**Could a user feel trapped?**
- The exit button is present but visually recessive. In a dark theme, a border-only button with `T.txD` color (a dim gray) could be overlooked, especially during intense focus. However, the button is in the same position as the pre-session `< Back` button, leveraging spatial consistency.
- There is **no keyboard shortcut** (Escape key or otherwise). The architecture doc explicitly notes at line 426: "Keyboard shortcuts: None exist for navigation currently. No changes needed." This is a minor gap -- learners accustomed to pressing Escape to "get out" of a focused view will find nothing happens.
- There is **no confirmation dialog** when clicking "Exit Session" during an active session. The flow immediately saves the journal and either shows the summary (if `msgs.length > 1`) or navigates away. This is good for not feeling trapped, but could risk accidental session termination if the button is clicked inadvertently.

**Rating: Acceptable**

The exit path is clear and consistently positioned. The button label is unambiguous. However, the visual subtlety of the ghost button plus the absence of a keyboard shortcut means discoverability is not ideal. The lack of a confirmation dialog cuts both ways -- it prevents feeling trapped but risks accidental exit.

---

### 2. Transition In

**Goal**: The shift from browsing mode to focus mode should feel intentional and smooth, not jarring.

#### Trace: CurriculumScreen to StudyScreen

1. User is on `CurriculumScreen` (screen = `"curriculum"`).
2. User clicks "Study Weakest" or "Study This Skill" (lines 257, 383 of CurriculumScreen).
3. These call `bootWithFocus({ type: "skill", skill: ... })`.
4. `bootWithFocus` (`StudyContext.jsx` line 1038-1041): Sets `previousScreen("curriculum")`, then `setScreen("study")`. Sets `booting = true`.
5. ScreenRouter re-renders. `key={screen}` changes from `"curriculum"` to `"study"` (ScreenRouter line 81).
6. The `key` change causes React to unmount `CurriculumScreen` and mount `StudyScreen`.
7. The fadeIn animation fires: `animation: "fadeIn 0.25s ease"` defined as `from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}` (theme.jsx line 31).
8. `StudyScreen` mounts. `inSession` is `true` because `booting` is `true` (line 41). So TopBarButtons are hidden immediately.

**Is the TopBarButtons disappearance abrupt?**
Yes, it is a binary swap. One frame shows CurriculumScreen with its TopBarButtons; the next frame shows StudyScreen in focus mode (only exit button). However, the fadeIn animation smooths this by starting at `opacity: 0` and sliding up 6px. The full content including the stripped-down top bar fades in together over 250ms. This is enough to soften the transition visually.

**Is there a "mode change" indicator?**
No. There is no banner, toast, color change, or label that says "Focus Mode" or "You're now in a study session." The user's only cue is:
- The visual change: TopBarButtons disappear, exit button appears.
- The chat interface fills the screen.
- If `booting` resolves quickly, the first AI message appears.

The absence of an explicit mode indicator is a deliberate design choice (per the architecture doc), favoring minimal chrome. However, first-time users may not realize the UI has intentionally changed rather than being a loading state.

**Rating: Acceptable**

The fadeIn animation prevents a hard visual cut. The transition is quick and purposeful. However, the lack of any mode indicator means the user must infer from context that they are now in focus mode. For repeat users this is fine; for first-time users it could cause a moment of confusion.

---

### 3. Transition Out

**Goal**: Exiting should feel clean, provide closure, and return the user to their previous context without delay.

#### Trace: Clicking "Exit Session" during a meaningful session

1. User clicks "Exit Session" (line 79 of StudyScreen).
2. `handleExitSession` fires (lines 43-61).
3. **Branch A** (`msgs.length > 1 && sessionStartTime.current` is true for meaningful sessions):
   a. `generateSessionEntry(...)` computes entry synchronously (line 45).
   b. Skill changes are computed synchronously (lines 47-51).
   c. `await saveSessionToJournal()` -- this is the only async operation. It writes to SQLite. This is a local DB write (not a network call), so latency is typically 1-10ms. The `await` ensures data integrity before showing the summary.
   d. `setAsgnWork(null)` clears assignment work after capturing it (line 53-54).
   e. `setSessionSummary({...})` triggers the overlay (line 55).
4. `SessionSummary` renders as a full-screen overlay at `position: absolute, inset: 0, zIndex: 100` (SessionSummary.jsx line 41).

**Does `saveSessionToJournal()` cause visible delay?**
Unlikely. The function (`StudyContext.jsx` line 355-364) performs a single SQLite insert and optionally calls `Assignments.recordSkillRatings`. These are local database operations. On a modern machine, this completes well under 50ms. The user would not perceive a delay between clicking "Exit Session" and seeing the summary overlay.

**Does the summary provide useful closure?**
Yes. The SessionSummary displays:
- **Duration** in minutes (line 48-49) -- answers "how long was I studying?"
- **Message count** (line 52) -- quantifies engagement
- **Skills Mastered** section with checkmarks, names, level changes, and facet counts (lines 64-88) -- the highest-value feedback for a learner
- **Skills Practiced** (non-mastered) with rating and strength percentage (lines 91-106) -- shows progress even without mastery
- **Facets Assessed** with collapsible list and ratings (lines 109-129) -- granular progress visibility
- **Topics Covered** as tag pills (lines 132-141) -- reinforces what was studied
- **Breakthroughs** in italicized quotes (lines 144-151) -- positive reinforcement
- **What's Next** suggestion (lines 154-163) -- forward momentum

This is a comprehensive session debrief that supports metacognitive reflection.

**After "Done" on summary, is navigation smooth?**

5. User clicks "Done" (SessionSummary.jsx line 182-186).
6. `clearSessionState()` fires -- resets all 18+ state variables and refs (StudyContext.jsx lines 374-392).
7. `safeScreen` computed: `(previousScreen && previousScreen !== "study") ? previousScreen : "courseHome"` (line 184).
8. `setScreen(safeScreen)` navigates away.
9. React batch-processes `clearSessionState` + `setScreen` together.
10. ScreenRouter remounts the target screen with `key={screen}`, triggering the fadeIn animation.

The navigation is a single React render cycle. No perceptible delay.

**Rating: Smooth**

The exit flow is well-sequenced: save first, then show summary, then navigate on user action. The summary provides excellent closure. The only async operation is a fast local DB write. The "Done" button navigation is instantaneous.

---

### 4. Return Context

**Goal**: When the user returns to their previous screen, they should find it in the same state they left it.

#### CurriculumScreen state analysis

`CurriculumScreen.jsx` uses **local `useState`** for all UI state:
- `expandedAsgn` (line 51) -- which assignment is expanded
- `expandedQuestion` (line 52) -- which question is expanded
- `expandedSkill` (line 53) -- which skill is expanded
- `chunkCache` (line 54) -- lazy-loaded chunk data
- `loadingChunks` (line 55) -- loading indicator
- `confirmSubmitId` (line 56) -- inline confirm state
- `decomposing` (line 57) -- decompose loading state

When the user navigates to the study screen, `ScreenRouter.jsx` unmounts `CurriculumScreen` (because `key={screen}` changes from `"curriculum"` to `"study"` at line 81). All local state is destroyed.

When the user returns (screen changes back to `"curriculum"`), `CurriculumScreen` remounts fresh:
- `expandedAsgn = null` -- no assignment expanded
- `expandedQuestion = null` -- no question expanded
- `expandedSkill = null` -- no skill expanded
- `chunkCache = {}` -- all chunk data lost, must reload on next expand
- `useEffect` at line 59 calls `loadData()` -- curriculum data is refetched from SQLite

**Impact**: If the user had drilled into Assignment > Question 3 > Skill "Binary Trees" before entering the study session, they return to CurriculumScreen with everything collapsed. They must re-expand to find their place. The data itself is not lost (it is in SQLite), but the UI navigation state is gone.

**Mitigating factor**: The `loadData()` call re-enriches all assignments with fresh readiness scores and mastery data. So the readiness percentages will reflect any progress made during the study session. The user sees updated numbers, which provides a sense of progress even though the expansion state is lost.

#### MaterialsScreen state analysis

`MaterialsScreen.jsx` also uses **local `useState`** for expansion state:
- `expandedCard` (line 33) -- which material card is expanded
- `collapsedGroups` (line 34) -- which classification groups are collapsed (initialized to all collapsed)
- `expandedStaged` (line 35) -- which staged file is expanded
- `materialFilter` (line 32) -- active tab filter

All of this resets on remount. If the user had expanded a material card, navigated to study, and returned, the card would be collapsed again and all groups would reinitialize to collapsed.

#### Other return screens

- **CourseHomepage**: No expandable state. Mode cards are always visible. Return is seamless.
- **ProfileScreen**: Uses local `useState` for expanded sections but is largely a dashboard view. Return context loss is minor.
- **ScheduleScreen**: Uses local `useState` for expanded weeks. Context is lost but the schedule is a simple list that is easy to re-navigate.

**Rating: Fully Lost**

All expansion and drill-down state on CurriculumScreen and MaterialsScreen is local `useState`, which is destroyed on unmount and reset on remount. The data is preserved in SQLite and refetched, but the user's navigational position within the screen is lost. This is the most significant UX gap in the focus mode implementation.

---

### 5. Learning Science

**Goal**: Does the focus mode design align with research on sustained attention, flow states, and effective learning?

#### Distraction removal

The core premise -- removing navigation chrome during active study -- directly supports sustained attention. Research on the "flow state" (Csikszentmihalyi, 1990) identifies uninterrupted concentration as a prerequisite. Every navigation option (Profile, Notifications, Settings) is a potential interruption vector. Removing these during active study eliminates:
- **Decision fatigue**: No "should I check my profile?" moments.
- **Context switching**: No accidental navigation away from the session.
- **Visual clutter**: The top bar becomes minimal, directing attention to the conversation.

The `inSession` gate (`msgs.length > 0 || booting`) is well-calibrated. It activates focus mode only when meaningful interaction has begun, not during the pre-session picker phase where browsing behavior is expected.

#### Timer visibility

The session timer (lines 90-93 of StudyScreen) displays elapsed time in a subdued style:
```js
fontSize: 11, color: T.txM, fontWeight: 400, marginLeft: 12
```

This is very small (11px), dimmed (`T.txM`), and lightweight (fontWeight 400). It is purely informational -- no countdown, no flashing, no color changes at thresholds. This avoids **time pressure anxiety** which research shows can impair working memory and problem-solving (Beilock, 2008).

The timer only appears when `sessionElapsed > 0` (i.e., at least 1 minute has passed), avoiding the "0m" display during the first minute.

**Would "Studying: [skill name]" help?**
Potentially. The current focus mode shows no indication of _what_ is being studied. During a long session or after a context switch (e.g., checking the break reminder), the user might lose track of the specific skill or topic. A subtle label like "Studying: Binary Search Trees" in the top bar would provide ambient context without adding clutter. This is not currently implemented.

#### Break reminder

The break reminder banner (StudyScreen.jsx lines 118-126) appears at 25 minutes and is dismissible. This aligns with the Pomodoro Technique and research on attention cycling (Ariga & Lleras, 2011). It is gated by `sessionElapsed >= 25 && !breakDismissed && msgs.length > 0`, so it only appears during active study and can be permanently dismissed for the session. The amber color (`T.am`) differentiates it from the study content without being alarming.

This banner is preserved in focus mode as noted in the architecture doc (line 421): "Break reminder banner: Remains visible during focus mode. It is contextual to studying, not a distraction." This is the correct decision -- it is a metacognitive aid, not a navigation distraction.

#### Flow state alignment

The focus mode design aligns with the three conditions for flow (Csikszentmihalyi):
1. **Clear goals**: The conversation with the AI tutor provides moment-to-moment goals.
2. **Immediate feedback**: The AI responds to each message. The session timer provides temporal awareness.
3. **Balance between challenge and skill**: This is handled by the AI tutoring system, not the UI. But the UI does not interfere with it.

The minimal chrome (exit button + timer only) supports the **paradox of control** aspect of flow -- the user feels they _can_ exit (the button is always visible) but are not prompted to do so. This is psychologically distinct from actually removing the exit option (which would create anxiety).

**Rating: Supports Focus**

The focus mode design is well-aligned with learning science research. The distraction removal is complete without being oppressive. The timer is informational without creating pressure. The break reminder adds metacognitive value. The one gap is the absence of ambient context about the current study topic.

---

## Recommendations

### P0 (Must fix before ship)

None. The implementation is functionally correct and safe. All entry points capture `previousScreen`, all exit paths navigate correctly, and the focus enforcement is solid.

### P1 (Should fix soon after ship)

| # | Recommendation | Rationale | Affected Files |
|---|----------------|-----------|----------------|
| P1-1 | **Persist CurriculumScreen expansion state** across navigations | When returning from a study session, the user loses their drill-down position (expanded assignment, question, skill). This forces re-navigation every time they study a skill and return. Consider lifting `expandedAsgn` to `StudyContext` or using a `useRef` that survives unmount via a parent-level cache. | `CurriculumScreen.jsx`, `StudyContext.jsx` |
| P1-2 | **Add Escape key handler** to exit focus mode | Keyboard users and power users expect Escape to exit focused views. Add a `useEffect` with `keydown` listener for Escape that triggers `handleExitSession` (or shows a confirmation dialog first). | `StudyScreen.jsx` |
| P1-3 | **Add defensive guard** for `active.name` on line 55 of StudyScreen | If `active` becomes null during a session (e.g., course deletion race condition), `active.name` throws. Change to `active?.name \|\| "Course"`. The QA report identified this as a theoretical risk. | `StudyScreen.jsx` line 55 |

### P2 (Nice to have)

| # | Recommendation | Rationale | Affected Files |
|---|----------------|-----------|----------------|
| P2-1 | **Show "Studying: [skill name]"** in the focus mode top bar | Provides ambient context about the current study topic. Use `focusContext?.skill?.name` when available. Render as a small, dimmed label next to the timer. | `StudyScreen.jsx` |
| P2-2 | **Add exit confirmation dialog** for sessions longer than 5 minutes | Prevents accidental session termination when the exit button is clicked inadvertently. A simple "End session? Your progress is saved." with "End" / "Continue" buttons. Only trigger for sessions with `msgs.length > 3` and `sessionElapsed >= 5`. | `StudyScreen.jsx` |
| P2-3 | **Animate the TopBarButtons transition** | Currently, TopBarButtons appear/disappear instantly based on `inSession`. A crossfade or slide-out animation would soften the visual change when the first message arrives. Consider wrapping in a `<div>` with `opacity` and `transition` driven by `inSession`. | `StudyScreen.jsx` |
| P2-4 | **Persist MaterialsScreen expanded card state** | Similar to P1-1 but lower priority since the user rarely navigates from materials to study and back to the same expanded card. | `MaterialsScreen.jsx`, `StudyContext.jsx` |

---

## Overall UX Verdict: Ship with notes

The Study Session Focus Mode is well-implemented and achieves its core goals:

1. **Distraction removal works correctly.** The TopBarButtons are hidden when `inSession` is true, and only the exit button and timer remain visible. The gate condition (`msgs.length > 0 || booting`) is well-calibrated to catch the transition window.

2. **Return navigation works for all entry points.** The `previousScreen` state is captured at every entry path (enterStudy, bootWithFocus, MaterialsScreen direct calls), and the `safeScreen` guard prevents circular navigation or null targets.

3. **The exit flow is clean and informative.** The SessionSummary provides excellent closure with duration, skills mastered, skills practiced, facets assessed, topics covered, breakthroughs, and next-step suggestions.

4. **The design aligns with learning science.** Minimal chrome supports flow states, the timer avoids pressure, and the break reminder aids metacognition.

The primary gap is **return context loss** (criterion 4). When a user studies a specific skill from CurriculumScreen and returns, they must re-navigate to find their place because all expansion state is local and destroyed on unmount. This is the most impactful UX issue and should be addressed as a P1 follow-up.

The feature is safe to ship in its current state. The P1 items should be prioritized in the next iteration.
