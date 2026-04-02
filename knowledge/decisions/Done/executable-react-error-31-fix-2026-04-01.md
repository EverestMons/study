# Study — React Error #31 Fix
**Date:** 2026-04-01 | **Tier:** Small | **Execution:** Step 1 (DEV) → Step 2 (QA)

## How to Run This Plan

Paste the bootstrap prompt into Claude Code. The agent reads the full plan file and executes Step 1 ONLY. After completing Step 1, the agent STOPS and waits for CEO confirmation ("ok") before proceeding to Step 2. This continues step by step until the plan is complete. The agent must never skip steps, auto-chain to the next step, or move the plan to Done without completing all steps including QA.

---
---

## STEP 1 — DEV

---

> **FIRST — before doing anything else, claim this plan:** `import shutil; shutil.move("study/knowledge/decisions/executable-react-error-31-fix-2026-04-01.md", "study/knowledge/decisions/in-progress-executable-react-error-31-fix-2026-04-01.md")`. Skip specialist file and glossary reads — this is a targeted two-line fix from diagnostic findings. **Fix A — InputBar.jsx:135:** The Send button's `onClick={sendMessage}` passes the SyntheticEvent as the first arg to `sendMessage`, which treats it as `overrideContent`. Change to `onClick={() => sendMessage()}` so no event leaks through. **Fix B — StudyContext.jsx `sendMessage` function (~line 1252):** Add a defensive type guard at the top of the function: `if (overrideContent && typeof overrideContent !== 'string') overrideContent = undefined;` — this prevents any future callers from accidentally passing non-string values into the message pipeline. **Verify:** After both changes, confirm that (1) `AssignmentPanel.jsx` still calls `sendMessage(string)` and would pass the guard, (2) the Enter key path in InputBar still calls `sendMessage()` with no args. Commit with message: `fix: prevent SyntheticEvent from leaking into sendMessage via onClick`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.
>
> **STOP. Do NOT proceed to Step 2. Do NOT move the plan to Done. Wait for CEO confirmation before continuing.**

---
---

## STEP 2 — QA

---

> Before starting, read `study/knowledge/research/react-error-31-diagnostic-2026-04-01.md` and the Step 1 Output Receipt. If Step 1 status is not Complete, stop and report the issue to the CEO before proceeding. Skip specialist file and glossary reads — this is a verification task. **FIRST — Deliverable Verification.** Read the Step 1 Output Receipt "Files Created or Modified (Code)" list. For EVERY listed file: verify it exists on disk and contains the described change. Specifically: (1) grep InputBar.jsx for the Send button's onClick — confirm it no longer passes the event directly to sendMessage (should be `onClick={() => sendMessage()}` or equivalent wrapper), (2) grep StudyContext.jsx sendMessage function for the type guard (`typeof overrideContent !== 'string'`), (3) confirm AssignmentPanel.jsx still calls sendMessage with a string argument and would pass the guard. Produce a verification table: `| Deliverable | Expected | Status (✅/❌) | Evidence |`. **Test regression:** Run the test suite and report results. **Final:** Update PROJECT_STATUS.md — add a completed item: "Fixed React Error #31 — Send button onClick was passing SyntheticEvent into sendMessage as overrideContent, causing crash when rendering message content. Added onClick wrapper in InputBar.jsx and defensive type guard in StudyContext.jsx." Then move this plan to Done: `import shutil; shutil.move("study/knowledge/decisions/in-progress-executable-react-error-31-fix-2026-04-01.md", "study/knowledge/decisions/Done/executable-react-error-31-fix-2026-04-01.md")`. Commit: `chore: status update + move react-error-31 plan to Done`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.
