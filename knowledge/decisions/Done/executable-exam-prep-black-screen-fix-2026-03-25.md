# study — Exam Prep Black Screen Fix
**Date:** 2026-03-25 | **Tier:** Small | **Execution:** Step 1 (DEV)

## How to Run

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/executable-exam-prep-black-screen-fix-2026-03-25.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation.
```

---
---

## STEP 1 — STUDY DEVELOPER (bootWithFocus black screen fix)

---

> You are the Study Developer. Skip specialist file reads. Read `study/knowledge/development/exam-prep-black-screen-diagnostic-2026-03-25.md` — root cause and fix vectors are fully specified in Sections 6 and 7. Apply two targeted fixes to `src/StudyContext.jsx` in the `bootWithFocus` function: **(1) Clear focusContext on failure** — in the `catch (err)` block, add `setFocusContext(null)` before `setBooting(false)` so the picker reappears instead of leaving a dead screen. **(2) Visible error state** — add `setPickerData({ error: true, message: "Failed to start session: " + err.message })` in the same catch block so the picker can render an inline error. Check `ExamScopePicker.jsx` — if it does not already handle `pickerData.error`, add a minimal error render at the top: `if (pickerData?.error) return <div className="picker-error"><p>{pickerData.message}</p><button onClick={() => setPickerData(null)}>Try Again</button></div>`. Also scan all `return;` statements inside `bootWithFocus` that fire AFTER `setFocusContext(focus)` has already been called — add `setFocusContext(null)` before each one so no early return leaves a dead screen. Run `npx vite build --mode development` — confirm clean build. Commit: `"fix: bootWithFocus clears focusContext on failure — prevents black screen on exam prep error"`. Deposit: `study/knowledge/development/exam-prep-black-screen-fix-2026-03-25.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
