# study — Exam Prep Black Screen Diagnostic
**Date:** 2026-03-25 | **Type:** Diagnostic

## How to Run

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/diagnostic-exam-prep-black-screen-2026-03-25.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — STUDY DEVELOPER (exam prep black screen audit)

---

> You are the Study Developer. Skip specialist file reads — this is a targeted UI bug diagnostic. The "Start Exam Prep" button leads to a black screen. (1) Read `study/src/screens/CourseHomepage.jsx` — find the "Start Exam Prep" button and show the full onClick handler and any navigation call it makes. (2) Read `study/src/StudyContext.jsx` — find the `enterStudy` function and show how it handles an exam intent: what state it sets, what it requires (e.g. selected materials), and what happens if required data is missing or empty. Also show the `navigate` or screen transition call that follows. (3) Read `study/src/screens/StudyScreen.jsx` — show the full component, specifically: (a) any conditional render at the top that could produce a blank screen if props/state are missing; (b) how it handles the `exam` focus type; (c) whether it has an ErrorBoundary or try/catch wrapping. (4) Search `study/src/StudyContext.jsx` for `ExamScopePicker` — show how exam scope selection feeds into `enterStudy`, and whether `enterStudy` can be called before scope is selected. Report all findings. Do not change anything. Deposit: `study/knowledge/development/exam-prep-black-screen-diagnostic-2026-03-25.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — CONSOLIDATION

---

> You are the Study Developer. Skip specialist file reads. Confirm `study/knowledge/development/exam-prep-black-screen-diagnostic-2026-03-25.md` exists. Move this plan to Done: `mv study/knowledge/decisions/diagnostic-exam-prep-black-screen-2026-03-25.md study/knowledge/decisions/Done/`. Commit: `"docs: exam prep black screen diagnostic complete"`.

---
