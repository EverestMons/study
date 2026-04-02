# Study — Error Boundary Context Fix
**Date:** 2026-04-01 | **Tier:** Small | **Execution:** Step 1 (DEV) → Step 2 (QA)

## How to Run This Plan

Paste the bootstrap prompt into Claude Code. The agent reads the full plan file and executes Step 1 ONLY. After completing Step 1, the agent STOPS and waits for CEO confirmation ("ok") before proceeding to Step 2. This continues step by step until the plan is complete. The agent must never skip steps, auto-chain to the next step, or move the plan to Done without completing all steps including QA.

---
---

## STEP 1 — DEV

---

> **FIRST — before doing anything else, claim this plan:** `import shutil; shutil.move("study/knowledge/decisions/executable-error-boundary-context-2026-04-01.md", "study/knowledge/decisions/in-progress-executable-error-boundary-context-2026-04-01.md")`. Skip specialist file and glossary reads — this is a component tree ordering fix. **Problem:** `StudyErrorBoundary` in `App.jsx` sits above `ErrorContext.Provider` in the component tree, so when a crash occurs the error boundary always reads the default context value `{ screen: "unknown" }` instead of the actual screen/course/session state. Crash reports show "Screen: unknown, Course ID: none" regardless of where the crash happened. **Fix:** Move `StudyErrorBoundary` below `ErrorContext.Provider` in the `App.jsx` component tree so the boundary can read the real error context when catching errors. Verify the provider hierarchy — `ErrorContext.Provider` must wrap `StudyErrorBoundary`, which wraps the rest of the app content. Check that this doesn't break any other context dependencies (the error boundary shouldn't need any other providers that are currently below it). Commit with message: `fix: move error boundary below ErrorContext provider for accurate crash reports`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.
>
> **STOP. Do NOT proceed to Step 2. Do NOT move the plan to Done. Wait for CEO confirmation before continuing.**

---
---

## STEP 2 — QA

---

> Before starting, read the Step 1 Output Receipt. If Step 1 status is not Complete, stop and report the issue to the CEO before proceeding. Skip specialist file and glossary reads — this is a verification task. **FIRST — Deliverable Verification.** Read the Step 1 Output Receipt "Files Created or Modified (Code)" list. For EVERY listed file: verify it exists on disk and contains the described change. Specifically: (1) read `App.jsx` and confirm `ErrorContext.Provider` wraps `StudyErrorBoundary` (not the other way around), (2) confirm no other provider ordering was disrupted — `StudyErrorBoundary` should still wrap all route/content components. Produce a verification table: `| Deliverable | Expected | Status (✅/❌) | Evidence |`. **Test regression:** Run the test suite and report results. **Final:** Update PROJECT_STATUS.md — add a completed item: "Fixed error boundary context ordering — StudyErrorBoundary now sits below ErrorContext.Provider so crash reports capture actual screen/course/session state instead of defaults." Then move this plan to Done: `import shutil; shutil.move("study/knowledge/decisions/in-progress-executable-error-boundary-context-2026-04-01.md", "study/knowledge/decisions/Done/executable-error-boundary-context-2026-04-01.md")`. Commit: `chore: status update + move error-boundary-context plan to Done`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.
