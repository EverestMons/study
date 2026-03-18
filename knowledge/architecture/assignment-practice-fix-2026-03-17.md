# Fix: bootWithFocus Does Not Navigate to Study Screen

**Date:** 2026-03-17
**Status:** Diagnosed, ready to implement
**Files:** `src/StudyContext.jsx` (line 940-1022), `src/screens/CurriculumScreen.jsx`

---

## Root Cause

`bootWithFocus()` (StudyContext.jsx:940-1022) does not call `setScreen("study")`. When invoked from CurriculumScreen, the user remains on the curriculum view while the entire boot process runs invisibly in the background -- loading skills, building context, constructing the system prompt, and streaming a Claude response into `msgs` state that no visible component is rendering.

### Why it works from within StudyScreen

`bootWithFocus` is also called by SkillPicker, AssignmentPicker, and ExamScopePicker -- all rendered inside StudyScreen.jsx. In that context, `screen` is already `"study"`, so no navigation is needed. The function was written for that internal use case and was never updated when CurriculumScreen started calling it directly.

### Working path (enterStudy)

```
CourseHomepage -> enterStudy(active, "assignment")
  -> setScreen("study")        // NAVIGATES IMMEDIATELY (line 731)
  -> clears session state
  -> creates new chat session
  -> optionally calls selectMode()
```

The user lands on StudyScreen, sees the mode picker (AssignmentPicker/SkillPicker/ExamScopePicker), picks a target, and THEN `bootWithFocus` is called from within StudyScreen.

### Broken path (bootWithFocus from CurriculumScreen)

```
CurriculumScreen -> handleStudySkill(sk) -> bootWithFocus({ type: "skill", skill })
  -> setFocusContext(focus)     // sets context
  -> setBooting(true)           // sets loading state
  -> loads skills, journal, context
  -> calls callClaudeStream()   // streams AI response
  -> setMsgs(...)               // populates messages
  -> setBooting(false)
  // NEVER calls setScreen("study") -- user stays on CurriculumScreen
```

### Secondary issue: no session creation

`enterStudy` creates a new chat session (`Sessions.create`) and archives the old one. `bootWithFocus` assumes `chatSessionId.current` is already valid. When called from CurriculumScreen after the user entered via `enterStudy`, the session exists. But this is fragile -- if `bootWithFocus` is ever called without a prior `enterStudy`, messages would be appended to a stale or nonexistent session.

---

## Affected Call Sites in CurriculumScreen

All four handlers call `bootWithFocus` without navigating:

| Handler | Line | Focus Type |
|---|---|---|
| `handleStudySkill(sk)` | 156-159 | `{ type: "skill" }` |
| `handleStudyWeakest(assignment)` | 126-133 | `{ type: "skill" }` |
| `handleStudyQuestion(question)` | 135-141 | `{ type: "skill" }` |
| `handleStartReview()` | 143-148 | `{ type: "skill" }` |

All four produce the same bug: the Claude response streams into invisible state while the user stares at the unchanged curriculum screen.

---

## Fix Design

### Option A: Add `setScreen("study")` inside `bootWithFocus` (RECOMMENDED)

Add a single line at the top of `bootWithFocus`, immediately after the early return guard:

```javascript
// --- Boot with focused context ---
const bootWithFocus = async (focus) => {
  if (!active) return;
  setScreen("study");  // <-- ADD THIS LINE
  setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
  // ... rest unchanged
```

**Why this is the right location:**

1. `setScreen("study")` fires synchronously before any async work, so the user sees the study screen immediately with the loading indicator (`booting=true`, `status="Loading..."`).
2. The existing internal callers (SkillPicker, AssignmentPicker, ExamScopePicker) are already on `screen === "study"`, so setting it again is a harmless no-op.
3. All three focus types (skill, assignment, exam) go through this single code path, so the fix covers all variants.
4. No new session creation logic is needed because `bootWithFocus` is always called after `enterStudy` has already set up `chatSessionId.current`. The session lifecycle remains unchanged.

### Why NOT Option B: Fix in CurriculumScreen handlers

Adding `setScreen("study")` before each `bootWithFocus()` call in CurriculumScreen would fix the immediate bug, but:
- It's fragile -- any future caller would need to remember the same pattern
- `bootWithFocus` would remain a function that silently assumes it's on the study screen
- Four separate call sites need the same fix vs. one line in the function itself

---

## Verification: Existing Entry Points Are Unaffected

| Entry Point | Current Flow | Impact of Fix |
|---|---|---|
| **CourseHomepage** | `enterStudy()` -> `setScreen("study")` -> user picks mode -> `bootWithFocus()` | `setScreen("study")` called twice (once in `enterStudy`, once in `bootWithFocus`). Harmless -- React deduplicates identical state updates within the same render. |
| **SkillPicker** (inside StudyScreen) | Already on study screen -> `bootWithFocus()` | `setScreen("study")` sets same value. No-op. |
| **AssignmentPicker** (inside StudyScreen) | Already on study screen -> `bootWithFocus()` | Same -- no-op. |
| **ExamScopePicker** (inside StudyScreen) | Already on study screen -> `bootWithFocus()` | Same -- no-op. |
| **MaterialsScreen** | Calls `setScreen("study")` directly, never calls `bootWithFocus` | Completely unaffected. |
| **ProfileScreen** | Calls `enterStudy(course)`, never calls `bootWithFocus` | Completely unaffected. |
| **ScheduleScreen** | Calls `enterStudy(active)`, never calls `bootWithFocus` | Completely unaffected. |

**Conclusion:** No existing entry point is affected. The added `setScreen("study")` is either a no-op (already on study screen) or correctly redundant (enterStudy already set it).

---

## What the User Sees After the Fix

1. User is on CurriculumScreen, expands assignment -> question -> skill
2. Clicks "Study This Skill"
3. Screen immediately transitions to StudyScreen (the `setScreen("study")` fires synchronously)
4. StudyScreen renders with `booting=true` -- MessageList shows the loading indicator (`status="Loading..."`)
5. Claude streams in the first diagnostic question
6. User sees the response appear in real-time and can begin the skill mastery session

---

## Implementation Checklist

- [ ] Add `setScreen("study");` as the first effective line in `bootWithFocus` (after the `if (!active) return` guard), at approximately line 942 of `src/StudyContext.jsx`
- [ ] Verify all three focus types work from CurriculumScreen: skill (handleStudySkill), assignment weakest (handleStudyWeakest), question (handleStudyQuestion), review (handleStartReview)
- [ ] Verify existing entry points still work: CourseHomepage mode selection, SkillPicker/AssignmentPicker/ExamScopePicker within StudyScreen
- [ ] Verify session journal capture still works (the session should already exist from the prior `enterStudy` call)
