# UX Validation: Assignment Practice Fix (bootWithFocus Navigation)

**Date:** 2026-03-17
**Validator:** Study UX Validator
**Scope:** End-to-end UX assessment of the CurriculumScreen-to-StudyScreen transition via `bootWithFocus`
**Files reviewed:**
- `src/StudyContext.jsx` (1,515 lines) -- `bootWithFocus` at line 1038, `enterStudy` at line 827
- `src/screens/CurriculumScreen.jsx` (503 lines) -- all four handlers + UI buttons
- `src/screens/StudyScreen.jsx` (139 lines) -- session rendering, exit behavior, booting state
- `src/components/study/SessionSummary.jsx` (193 lines) -- session end navigation
- `src/components/study/MessageList.jsx` (179 lines) -- booting/loading indicator, books animation
- `src/components/study/InputBar.jsx` (127 lines) -- context indicators, skill notifications
- `src/ScreenRouter.jsx` (87 lines) -- screen routing and transitions
- `src/lib/study.js` -- `buildFocusedContext` (skill branch, lines 1372-1432), `buildDeadlineContext` (line 55)

---

## Summary Table

| # | Criterion | Rating | Key Finding |
|---|-----------|--------|-------------|
| 1 | Transition smoothness | **Acceptable** | Immediate navigation with loading indicator; brief books animation visible during async context build; no blank flash |
| 2 | Return path | **Good** | `previousScreen` correctly captures "curriculum"; exit button always visible; session summary "Done" returns correctly; one minor discoverability gap |
| 3 | Context continuity | **Adequate** | Skill context is rich (facets, prerequisites, source material, deadline intelligence); but assignment identity is not surfaced in the UI or the user-facing message during skill-focus sessions |

**Overall UX Verdict: Ship with notes**

---

## 1. Transition Smoothness

### Click path trace

**User action:** CurriculumScreen > expand assignment > expand question > expand skill > click "Study This Skill"

**Code path:**
1. Button click at `CurriculumScreen.jsx:383` triggers `handleStudySkill(sk)` (line 156).
2. `handleStudySkill` resolves full skill via `skills.find()` (line 157) and calls `bootWithFocus({ type: "skill", skill: fullSkill || sk })` (line 158).
3. `bootWithFocus` at `StudyContext.jsx:1038-1122`:
   - Line 1039: `if (!active) return;` -- guard.
   - Line 1040: `if (screen !== "study") setPreviousScreen(screen);` -- saves "curriculum" for back navigation.
   - Line 1041: `setScreen("study");` -- **fires synchronously before any async work**.
   - Line 1042: `setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");` -- sets loading state.

**Visual sequence after click:**
1. React batches the state updates from line 1040-1042 into a single render cycle.
2. `ScreenRouter.jsx:76` renders `<StudyScreen />` because `screen === "study" && active` is now true.
3. `ScreenRouter.jsx:81` wraps the content in `<div key={screen} style={{ animation: "fadeIn 0.25s ease" }}>` -- a 250ms fade-in animation softens the transition.
4. `StudyScreen.jsx:41`: `const inSession = msgs.length > 0 || booting;` evaluates to `true` (because `booting` is `true`).
5. `StudyScreen.jsx:78-82`: The top bar renders "Exit Session" button (not "< Back") because `inSession` is true.
6. `MessageList.jsx:156`: The books loader condition evaluates:
   ```
   booting && status && !(msgs.length > 0 && ...) && !processingMatId
   ```
   At this moment: `booting=true`, `status="Loading..."`, `msgs=[]`, `processingMatId=null`. All conditions met -- the books SVG animation renders with the status text "Loading...".

**Does `setScreen("study")` happen immediately?** Yes. It fires synchronously at line 1041, before any `await`. React state updates are batched but the next render cycle will pick up `screen="study"` along with `booting=true` and `status="Loading..."` simultaneously. There is no intermediate render where the screen has changed but loading indicators are missing.

**Is there a blank flash?** No. The state updates on lines 1040-1042 are batched by React 18 automatic batching. The first render of StudyScreen will already have `booting=true` and `status="Loading..."`, so the books loader is visible from the very first frame of the study screen.

**Books animation visibility:** The books loader (MessageList.jsx:157-174) displays:
- An SVG with 6 animated book rectangles on a shelf
- Animated via CSS keyframes (`bookSlide1-4`, `shelfPulse`)
- Status text in uppercase accent color (e.g., "Loading...")
- Conditionally: a "Stop extraction" button if the status mentions "extract" (not applicable for boot)

The animation is lightweight (SVG-only, no heavy DOM), visually engaging, and provides clear feedback that something is happening.

**Async duration:** The `bootWithFocus` async phase (lines 1053-1116) performs:
- `loadSkillsV2(active.id)` -- SQLite query, typically <100ms
- `JournalEntries.getByCourse(active.id)` -- SQLite query, typically <50ms
- `buildFocusedContext(...)` -- multiple SQLite queries (facets, chunks, deadlines, cross-skill context), typically 200-500ms
- `callClaudeStream(...)` -- API call to Claude, typically 1-4 seconds

The books animation is visible for approximately 1-5 seconds depending on API latency. During streaming, the animation disappears because `msgs` is set with an assistant message at line 1109 (content starts empty, then fills via streaming). The condition on line 156 of MessageList.jsx (`!(msgs.length > 0 && msgs[msgs.length-1].role === "assistant" && msgs[msgs.length-1].content !== undefined)`) becomes false once streaming begins, so the books animation gives way to the dot-pulse streaming indicator (line 48-51 of MessageList.jsx: three animated dots).

**Transition from books to streaming:** When `setMsgs` fires at line 1109 of `bootWithFocus`, the books animation is replaced by the three-dot pulse indicator inside the assistant message bubble, which then fills with streaming text. This is a smooth visual handoff.

**Rating: Acceptable**

The transition is not "smooth" in the sense of a polished animation between screens, but it is perfectly functional with no blank flashes, clear loading feedback, and a natural visual progression: CurriculumScreen -> 250ms fadeIn -> books animation -> streaming dots -> streamed response text. The 250ms `fadeIn` animation from ScreenRouter provides a subtle entry that prevents the screen change from feeling jarring.

The only micro-gap: between the button click and the first paint of StudyScreen, there is one React render cycle (~16ms). During this single frame, CurriculumScreen is still visible. This is imperceptible to users.

---

## 2. Return Path

### During session: Exit button

**StudyScreen.jsx:78-82:**
```jsx
{inSession ? (
  <button onClick={handleExitSession} ...>Exit Session</button>
) : (
  <button onClick={handleBackToOrigin} ...>&lt; Back</button>
)}
```

When `booting=true` or `msgs.length > 0`, `inSession` is `true` (line 41), so the "Exit Session" button is always visible from the moment the study screen renders after a `bootWithFocus` call. This button is styled with a visible border (`border: "1px solid " + T.bd`) and a text label, making it more prominent than a simple back arrow.

### handleExitSession behavior (StudyScreen.jsx:43-62)

When the user clicks "Exit Session":
- **If session has content** (msgs.length > 1 and sessionStartTime is set): generates a session summary, saves journal, and shows SessionSummary overlay. Does NOT immediately navigate away -- the user sees a summary screen first.
- **If session is empty** (e.g., user exits during boot or after only one message): saves journal, calls `clearSessionState()`, then navigates to `previousScreen || "courseHome"`.

The empty-session path (line 57-61) correctly uses the safe screen pattern:
```javascript
const safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome";
```

This ensures the user never gets stuck in a loop returning to the study screen.

### Does `previousScreen` correctly capture "curriculum"?

Yes. At `StudyContext.jsx:1040`:
```javascript
if (screen !== "study") setPreviousScreen(screen);
```

When called from CurriculumScreen, `screen` is `"curriculum"`, so `previousScreen` is set to `"curriculum"`. The `screen !== "study"` guard prevents overwriting `previousScreen` when `bootWithFocus` is called from within StudyScreen (e.g., from SkillPicker). This is well-designed.

### SessionSummary "Done" button (SessionSummary.jsx:182-189)

```jsx
<button onClick={function() {
  clearSessionState();
  var safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome";
  setScreen(safeScreen);
}} ...>Done</button>
```

- Calls `clearSessionState()` which resets all session state (msgs, focusContext, pickerData, etc.).
- Uses the same `safeScreen` pattern to navigate back.
- Since `previousScreen` was set to `"curriculum"` by `bootWithFocus`, clicking "Done" returns the user to CurriculumScreen.

**Verified: "Done" returns to CurriculumScreen correctly.**

### Discoverability assessment

The "Exit Session" button is:
- Positioned in the top-left corner (standard back/exit position)
- Always visible during a session (not hidden behind a sidebar or menu)
- Styled with a border and label text, making it distinguishable from decorative elements

However, during the booting phase (while books animation is playing), the top bar shows "Exit Session" but the rest of the screen is mostly empty except for the loading animation. A user who is impatient or confused might not immediately realize they can click "Exit Session" to abort. The button label "Exit Session" is appropriate once messages are flowing, but during boot it could be slightly confusing since the session hasn't really "started" yet from the user's perspective.

The pre-session "< Back" button (line 84-87) is never visible during a `bootWithFocus` flow because `inSession` is `true` immediately (booting starts right away). This is correct behavior -- the user entered a session path and should exit via session exit, not a generic back button.

### Additional return path: handleBackToOrigin (line 64-70)

This function is only reachable when `inSession` is false (no messages and not booting), which happens in the mode picker pre-session state. It is not relevant to the `bootWithFocus` flow from CurriculumScreen, but it correctly uses the same `safeScreen` pattern.

**Rating: Good**

The return path works correctly at every stage: during boot, during session, and at session summary. The `previousScreen` capture is well-designed with the `screen !== "study"` guard. The "Done" button returns to the correct origin screen. One minor gap: the "Exit Session" label during the booting phase (when no actual session content exists yet) could be slightly misleading, but it is functionally correct and discoverable.

---

## 3. Context Continuity

### What the AI receives for a skill-focus session from CurriculumScreen

When the user clicks "Study This Skill" from within an assignment's question's skill list, the following context is built:

**Focus object passed to bootWithFocus:**
```javascript
{ type: "skill", skill: fullSkill || sk }
```

Note: `type: "skill"`, not `type: "assignment"`. This means `buildFocusedContext` enters the skill branch (study.js:1372), NOT the assignment branch (study.js:1290).

**What the skill branch includes (study.js:1372-1432):**
1. `FOCUS SKILL:` header with concept key, name, strength %, last rating
2. Skill description
3. Mastery criteria (if any)
4. Prerequisites and their current strength
5. Facet assessment block (via `buildFacetAssessmentBlock`)
6. Source material (via facet bindings or keyword fallback)
7. Deadline context (via `buildDeadlineContext` -- line 1424) -- **this DOES include assignment awareness**: it queries all active assignments and their required skills, so the AI sees which assignments need this skill and when they are due
8. Cross-skill connections (via `buildCrossSkillContext`)
9. Domain proficiency context

**What the skill branch does NOT include:**
- The specific assignment title the user was viewing when they clicked "Study This Skill"
- The specific question context the skill was under
- Other skills required by the same question

**User message (StudyContext.jsx:1098):**
```javascript
userMsg = "I want to work on: " + focus.skill.name;
```

The message only references the skill name, not the assignment. The AI does not know the user clicked from within "Assignment 3, Question 2" specifically.

**Mode hint (StudyContext.jsx:1099):**
```
MODE: SKILL MASTERY. The student chose this specific skill to strengthen.
You have the skill details and source material loaded.
Start by asking a diagnostic question to find where their understanding breaks down.
```

The mode hint says "SKILL MASTERY" -- it frames the session as a standalone skill drill rather than assignment preparation.

### Deadline context as indirect assignment link

The `buildDeadlineContext` function (study.js:55-77) does provide indirect assignment awareness. It generates output like:
```
UPCOMING DEADLINES:
  Assignment 3 - Due in 5 days - Readiness: 45% - Weakest: [skill-a, skill-b, skill-c]
```

So the AI *can* see that the focused skill is needed for an upcoming assignment. However, this is presented as background context, not as the primary frame. The AI may or may not connect the dots and mention "this skill is needed for your upcoming Assignment 3."

### InputBar context indicator

**InputBar.jsx:17:** `if (msgs.length === 0 || practiceMode) return null;` -- InputBar is hidden until messages exist.

**InputBar.jsx:31-54:** The only context indicator in InputBar is the transient `currentSkillNotif` -- a floating notification that appears briefly when skill ratings are parsed from Claude's response. This shows the skill name and rating (e.g., "Recursion -- good") for 2.3 seconds then fades out.

There is no persistent context label in InputBar showing what skill or assignment is being studied. The `focusContext` state is set (`setFocusContext(focus)` at line 1042 of StudyContext.jsx) but is not rendered anywhere in the InputBar UI. The only visible indication of what is being studied comes from the initial user message "I want to work on: [skill name]" in the chat history.

### Does the session feel connected to the assignment?

From the user's perspective:
1. They are on CurriculumScreen, looking at "Assignment 3: Linear Algebra Problem Set"
2. They expand Question 2, see "Matrix Decomposition" at 25% strength, and click "Study This Skill"
3. The screen transitions to StudyScreen
4. The first message says "I want to work on: Matrix Decomposition"
5. The AI starts with a diagnostic question about matrix decomposition

The assignment context ("Assignment 3", "Question 2") is not visible anywhere on the study screen. The session feels like a standalone skill drill. The user must remember mentally which assignment they were preparing for. If they exit and return to CurriculumScreen, they see the curriculum again and can re-orient, but during the session the assignment connection is lost visually.

However, the AI does have deadline context and may organically reference the assignment. The quality of this depends on Claude's behavior -- it is possible but not guaranteed.

### Comparison with the assignment-focus path

When `focus.type === "assignment"` (used by AssignmentPicker from within StudyScreen), `buildFocusedContext` enters the assignment branch (study.js:1290-1371) which includes:
- `CURRENT ASSIGNMENT: [title] (Due: [date])`
- All questions with descriptions and required skills
- Required skills with strength percentages
- Source material specific to the assignment

This provides much richer assignment context. But the CurriculumScreen handlers (handleStudySkill, handleStudyWeakest, handleStudyQuestion, handleStartReview) all use `{ type: "skill" }`, not `{ type: "assignment" }`. This is a deliberate design choice -- the curriculum screen routes through skill-focused study, not assignment-focused study. The tradeoff is: the AI gets deep skill context (facets, prerequisites, mastery criteria) at the cost of losing the assignment frame.

**Rating: Adequate**

The context given to the AI is technically rich -- the skill's description, mastery criteria, prerequisites, facet assessment, source material, deadline awareness, and cross-skill connections all provide substantive context for meaningful teaching. The AI has enough to run an effective skill mastery session. However, the session lacks visible assignment framing: the user sees no UI indicator of which assignment prompted this study, and the AI's initial message does not reference the assignment. The `buildDeadlineContext` call provides an indirect link (the AI can see the skill is needed for an upcoming assignment), but this is background context that may or may not be surfaced in the conversation.

---

## Recommendations

### P2: Add assignment context to the focus object for curriculum-sourced skill study

**Current:** `bootWithFocus({ type: "skill", skill: fullSkill || sk })`
**Suggested:** `bootWithFocus({ type: "skill", skill: fullSkill || sk, sourceAssignment: asgn.title })`

Then in `bootWithFocus`, when constructing the user message (line 1098), include:
```javascript
userMsg = "I want to work on: " + focus.skill.name + (focus.sourceAssignment ? " (for " + focus.sourceAssignment + ")" : "");
```

This is low-effort and would frame the session correctly for both the AI and the user. The AI would know the student is studying this skill specifically for assignment preparation, and the chat history would show the assignment connection.

**Effort:** ~5 lines of code across 2 files.
**Risk:** None -- additive only, no existing behavior changes.

### P2: Add a persistent context label to the study screen

During a focused session, display a small context badge below the top bar showing what is being studied. For example:

```
Studying: Matrix Decomposition   |   For: Assignment 3
```

This could read from `focusContext` which is already set in state. Currently `focusContext` is only consumed by `sendMessage` (for context rebuilding) but never rendered in the UI.

**Effort:** ~15 lines in StudyScreen.jsx or InputBar.jsx.
**Risk:** Low -- purely additive UI element.

### P2: Consider "Exit Session" vs "Cancel" label during boot

During the booting phase (before any messages have appeared), the "Exit Session" button could be labeled "Cancel" instead, since no session content exists yet. This is a minor label improvement.

```javascript
{inSession ? (
  <button onClick={handleExitSession}>
    {booting && msgs.length === 0 ? "Cancel" : "Exit Session"}
  </button>
) : ...}
```

**Effort:** ~3 lines in StudyScreen.jsx.
**Risk:** None.

---

## Overall UX Verdict: Ship with notes

The fix is functionally correct and the UX is workable. The transition is smooth with clear loading feedback (books animation, streaming dots). The return path is robust at every stage with proper `previousScreen` capture and safe fallbacks. Context continuity is technically adequate -- the AI receives rich skill-level context including indirect assignment awareness via deadline context -- though it lacks explicit assignment framing in the UI and initial message.

The P2 recommendations above are quality-of-life improvements that would strengthen the assignment-to-study connection but are not blockers. The current implementation delivers the core value: users can click a skill on the curriculum screen, immediately see a loading state on the study screen, and begin a focused skill mastery session with a diagnostic question from Claude. This is a significant improvement over the pre-fix state where the click did nothing visible.
