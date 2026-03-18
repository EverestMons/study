# Dev Log: Assignment Practice Fix (bootWithFocus Navigation)

**Date:** 2026-03-17
**File changed:** `src/StudyContext.jsx` (line 1001)
**Change type:** 1-line bug fix

---

## Root Cause

`bootWithFocus()` (StudyContext.jsx, line 999) did not call `setScreen("study")`. When invoked from CurriculumScreen (via handleStudySkill, handleStudyWeakest, handleStudyQuestion, or handleStartReview), the user remained on the curriculum view while the entire boot process ran invisibly in the background -- loading skills, building context, constructing the system prompt, and streaming a Claude response into `msgs` state that no visible component was rendering.

The function was originally written for use within StudyScreen sub-components (SkillPicker, AssignmentPicker, ExamScopePicker), where `screen` is already `"study"`. When CurriculumScreen started calling it directly, the missing navigation was never added.

The other study entry point, `enterStudy()` (line 789), correctly calls `setScreen("study")` on line 790 and was not affected.

---

## Fix

Added `setScreen("study");` as the first effective line in `bootWithFocus`, immediately after the `if (!active) return;` guard:

```javascript
// --- Boot with focused context ---
const bootWithFocus = async (focus) => {
  if (!active) return;
  setScreen("study");  // <-- ADDED: navigate to study screen before async work
  setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
  // ... rest unchanged
```

This fires synchronously before any async work, so the user sees the StudyScreen loading indicator immediately.

---

## Callers Verified

### CurriculumScreen (the broken path -- now fixed)
| Handler | Line | Focus Type |
|---|---|---|
| `handleStudyWeakest(assignment)` | 132 | `{ type: "skill" }` |
| `handleStudyQuestion(question)` | 140 | `{ type: "skill" }` |
| `handleStartReview()` | 147 | `{ type: "skill" }` |
| `handleStudySkill(sk)` | 158 | `{ type: "skill" }` |

All four now correctly navigate to the study screen before boot begins.

### StudyScreen sub-components (already on study screen -- no-op)
| Component | Line | Focus Type |
|---|---|---|
| `SkillPicker.jsx` | 186, 239 | `{ type: "skill" }` |
| `AssignmentPicker.jsx` | 171 | `{ type: "assignment" }` |
| `ExamScopePicker.jsx` | 58 | `{ type: "exam" }` |

React deduplicates identical state updates, so `setScreen("study")` when already on the study screen is a harmless no-op.

### Other entry points (unaffected)
- `enterStudy()` -- has its own `setScreen("study")` at line 790. Calling it twice (once in enterStudy, once in bootWithFocus) is harmless.
- `MaterialsScreen`, `ProfileScreen`, `ScheduleScreen` -- call `enterStudy` or `setScreen` directly, never call `bootWithFocus`.

---

## Build Status

`npm run build` completed successfully with no errors. Only pre-existing warnings about chunk sizes and dynamic imports (not related to this change).

---

## What the User Sees After the Fix

1. User is on CurriculumScreen, expands assignment, question, or skill
2. Clicks "Study This Skill" (or any of the four action buttons)
3. Screen immediately transitions to StudyScreen (`setScreen("study")` fires synchronously)
4. StudyScreen renders with `booting=true` -- MessageList shows the loading indicator
5. Claude streams in the first diagnostic question
6. User sees the response appear in real-time and can begin the session
