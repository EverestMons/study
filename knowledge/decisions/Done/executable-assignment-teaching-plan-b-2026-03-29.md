# study — Assignment Teaching Flow: Answer Submission Assessment
**Date:** 2026-03-29 | **Tier:** Medium | **Execution:** Step 1 (DEV) → Step 2 (QA)
**Depends on:** `executable-assignment-teaching-plan-a-2026-03-29.md` must be complete before running this plan.

## How to Run This Plan

Paste this into Claude Code:
```
Read the plan at study/knowledge/decisions/executable-assignment-teaching-plan-b-2026-03-29.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — DEV

---

> You are the Study Developer. Read your specialist file and domain glossary first. Read the blueprint at `study/knowledge/architecture/assignment-teaching-flow-blueprint-2026-03-29.md` — specifically Change 2 (Answer Submission Assessment Flow). Verify Plan A is complete by checking that `UNLOCK_MASTERY_THRESHOLD` exists in StudyContext.jsx — if not, stop and report. **Four changes:**

> **Change 1 — Question state migration (StudyContext.jsx).** In `bootWithFocus()` (~line 1194), replace the question initialization to use `status: "locked"` instead of separate `unlocked: false` and `done: false` booleans. Blueprint specifies the exact new shape. Then search StudyContext.jsx for every reference to `q.done` and `q.unlocked` and migrate: `q.done` → `q.status === "accepted"`, `q.unlocked` → `q.status !== "locked"` (or more specific status checks as appropriate). Also update `buildFocusedContext()` in study.js — the assignment branch (~line 1456) reads `focus.unlocked` to build the STUDENT VIEW section. Update it to read `status` field instead: `"locked"` → `[LOCKED]`, `"unlocked"` or `"submitted"` → `[UNLOCKED]`, `"accepted"` → `[DONE]`. Update the unlock gate from Plan A to set `status: "unlocked"` instead of `unlocked: true`. **Audit every consumer of `asgnWork.questions` in StudyContext.jsx, study.js, and AssignmentPanel.jsx before making changes — do not miss any reference.**
>
> **Change 2 — `parseAnswerResult()` (study.js).** Add `parseAnswerResult(response)` following the exact pattern of `parseQuestionUnlock()`. Regex: `/\[ANSWER_ACCEPTED\]\s*([\w-]+)\s*\[\/ANSWER_ACCEPTED\]/`. Export it.
>
> **Change 3 — Answer assessment handling (StudyContext.jsx).** After the existing `parseQuestionUnlock` handling, add `parseAnswerResult` handling per the blueprint: if `[ANSWER_ACCEPTED]` found, set the question's `status` to `"accepted"`. If no acceptance and a question is in `"submitted"` status, transition it back to `"unlocked"` for revision. Import `parseAnswerResult` from study.js. Also add `sendMessage(overrideContent)` — add an optional parameter to `sendMessage` so AssignmentPanel can pass formatted answer text directly without touching the input state. When `overrideContent` is provided, use it instead of reading from the input ref. Verify this doesn't break existing callers (all existing callers pass no arguments).
>
> **Change 4 — AssignmentPanel.jsx 4-state UI.** Replace the current 3-state rendering with the blueprint's 4 states: (a) **Locked** (`status === "locked"`) — unchanged, faded card, "Locked -- building skills". (b) **Unlocked** (`status === "unlocked"`) — active card, textarea, "Submit for Review" button (enabled only when answer has content). Replace the old "Mark done" button. (c) **Submitted** (`status === "submitted"`) — active card, answer text displayed read-only, "Reviewing..." indicator. (d) **Accepted** (`status === "accepted"`) — collapsed green card, "Accepted" badge, answer preview (replaces old "Done" state). The submit handler: set `status: "submitted"` in `asgnWork`, then call `sendMessage('[ANSWER_SUBMISSION q="' + q.id + '"]\n' + q.answer.trim() + '\n[/ANSWER_SUBMISSION]')` using the new overrideContent parameter. AssignmentPanel needs `sendMessage` passed as a prop or accessed from context — check how existing components access it and follow the same pattern.
>
> **Prompt additions (StudyContext.jsx modeHint).** In `bootWithFocus()` modeHint, after the existing FLOW steps, add the ANSWER ASSESSMENT section and ANSWER REVISION PROTOCOL from the blueprint (Change 2 → system prompt additions, and Change 3 → Addition 3). These are the instructions that tell the AI how to handle `[ANSWER_SUBMISSION]` and when to emit `[ANSWER_ACCEPTED]`.
>
> Run `npm run build`. Commit: "feat: answer submission assessment flow with 4-state question lifecycle". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — QA

---

> You are the Study Security & Testing Analyst. Skip specialist file and glossary reads — this is a code verification task. Before starting, read the blueprint at `study/knowledge/architecture/assignment-teaching-flow-blueprint-2026-03-29.md` (Change 2 specifically) and the DEV's output receipt from Step 1. **Verify 10 areas:** (1) `bootWithFocus()` initializes questions with `status: "locked"` — no `done` or `unlocked` booleans remain. (2) All references to `q.done` in StudyContext.jsx, study.js, and AssignmentPanel.jsx are migrated to `q.status === "accepted"`. (3) All references to `q.unlocked` are migrated to appropriate status checks. (4) `buildFocusedContext()` assignment branch uses `status` field for STUDENT VIEW section. (5) `parseAnswerResult()` exists in study.js with correct regex, is exported, and is imported in StudyContext.jsx. (6) Answer assessment handling in StudyContext: `[ANSWER_ACCEPTED]` → `status: "accepted"`, no acceptance + submitted question → `status: "unlocked"`. (7) `sendMessage(overrideContent)` optional parameter works — existing callers (no args) still function. (8) AssignmentPanel renders 4 distinct states (locked/unlocked/submitted/accepted) with correct visual treatments. (9) Submit handler sets `status: "submitted"` AND calls `sendMessage` with formatted `[ANSWER_SUBMISSION]` message. (10) Build passes: `npm run build` with no errors. Also check the DOCX export path — it may reference `q.done` and need migration. **Final:** Update PROJECT_STATUS.md — add: "Answer submission assessment: 4-state question lifecycle (locked → unlocked → submitted → accepted); AI assesses student answers before marking complete; revision loop for incorrect answers; FSRS updates via SKILL_UPDATE during answer review." Then move this plan to Done: `mv study/knowledge/decisions/executable-assignment-teaching-plan-b-2026-03-29.md study/knowledge/decisions/Done/`. Commit: "chore: status update + move assignment teaching plan B to Done". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
