# study — Assignment Teaching Flow: Prompt Hardening + Unlock Gate
**Date:** 2026-03-29 | **Tier:** Medium | **Execution:** Step 1 (DEV) → Step 2 (QA)

## How to Run This Plan

Paste this into Claude Code:
```
Read the plan at study/knowledge/decisions/executable-assignment-teaching-plan-a-2026-03-29.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — DEV

---

> You are the Study Developer. Read your specialist file and domain glossary first. Read the blueprint at `study/knowledge/architecture/assignment-teaching-flow-blueprint-2026-03-29.md` for full design. **Two changes:**

> **Change 1 — Prompt hardening (study.js + StudyContext.jsx).** In `study.js:buildSystemPrompt()`, append the ESCALATION RESISTANCE block from the blueprint to THE ANSWER DOCTRINE section, after the "When overwhelmed: shrink the problem" line. Exact text is in the blueprint Change 3 → Addition 1. In `StudyContext.jsx:bootWithFocus()` modeHint (line ~1201), replace FLOW step 4 with the blueprint's strengthened version (Change 3 → Addition 2). These are string insertions into existing prompt text — match the existing escaped-string format (`\n` for newlines). **Change 2 — Data-driven unlock gate (StudyContext.jsx).** Follow the blueprint Change 1 exactly: (a) Add `const UNLOCK_MASTERY_THRESHOLD = 0.6` near the top of StudyContext. (b) Add `const unlockRejectionRef = useRef(null)` alongside the other refs. (c) Import `computeFacetReadiness` from `./lib/study.js` (it's already exported). (d) Replace the current `parseQuestionUnlock` handling block (~line 1372-1383) with the blueprint's gated version that calls `computeFacetReadiness()` on the question's `requiredSkills`, checks each against the threshold, and either honors the unlock or stores a rejection message in `unlockRejectionRef`. The function containing this code must be `async` to `await computeFacetReadiness()` — verify the parent function is already async or make it so. (e) In `sendMessage()`, before the API call, check `unlockRejectionRef.current` and inject it as a `[SYSTEM NOTE]` user-role message into the chat messages array, then clear the ref. (f) Default for skills with no facet data: reject unlock (conservative). **Both changes are in the blueprint with exact code — reference it as a checklist.** Run `npm run build` to verify. Commit: "feat: assignment prompt hardening + data-driven unlock gate (60% threshold)". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — QA

---

> You are the Study Security & Testing Analyst. Skip specialist file and glossary reads — this is a code verification task. Before starting, read the blueprint at `study/knowledge/architecture/assignment-teaching-flow-blueprint-2026-03-29.md` and the DEV's output receipt from Step 1. **Verify 8 areas:** (1) THE ANSWER DOCTRINE in `buildSystemPrompt()` now contains the ESCALATION RESISTANCE block — confirm exact text matches blueprint. (2) modeHint FLOW step 4 in `bootWithFocus()` is replaced with the strengthened version — confirm exact text. (3) `UNLOCK_MASTERY_THRESHOLD` is defined as `0.6` and used in the gate logic. (4) `unlockRejectionRef` is declared as a `useRef(null)`. (5) The unlock gate calls `computeFacetReadiness()` with resolved skill IDs from `requiredSkills`, checks each result against threshold, and blocks unlock if any skill is below 60% or has no mastery data. (6) Rejection message is stored in `unlockRejectionRef.current` with the skill name and current percentage. (7) `sendMessage()` checks `unlockRejectionRef.current` before the API call, injects it as a `[SYSTEM NOTE]` message, and clears the ref. (8) Build passes: `npm run build` with no errors. Confirm via `git diff` that `parseQuestionUnlock()` in study.js is unchanged — the gate is in StudyContext, not in the parser. **Final:** Update PROJECT_STATUS.md — add: "Assignment prompt hardening: ESCALATION RESISTANCE doctrine added; data-driven unlock gate requires 60% facet retrievability on all required skills before honoring AI unlock." Then move this plan to Done: `mv study/knowledge/decisions/executable-assignment-teaching-plan-a-2026-03-29.md study/knowledge/decisions/Done/`. Commit: "chore: status update + move assignment teaching plan A to Done". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
