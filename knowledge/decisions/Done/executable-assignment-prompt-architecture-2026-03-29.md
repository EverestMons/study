# study — Assignment Prompt Architecture Fix
**Date:** 2026-03-29 | **Tier:** Medium | **Execution:** Step 1 (DEV) → Step 2 (QA)

## How to Run This Plan

Paste this into Claude Code:
```
Read the plan at study/knowledge/decisions/executable-assignment-prompt-architecture-2026-03-29.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — DEV

---

> You are the Study Developer. Read your specialist file and domain glossary first. Read the blueprint at `study/knowledge/architecture/assignment-prompt-architecture-blueprint-2026-03-29.md` for the full design. **Three changes to unify the prompt assembly so the AI always has both SKILL_UPDATE instructions and assignment FLOW in every message:**

> **Change 1 — Unified system prompt (study.js + StudyContext.jsx).** In `study.js:buildSystemPrompt()`, add a fourth parameter `modeHint = ""`. At the END of the return string (after the INPUT MODE CONTROL section, before the closing `";`), append: `+ (modeHint ? "\n\n---\n\nSESSION MODE INSTRUCTIONS:\n" + modeHint : "")`. In `StudyContext.jsx:bootWithFocus()` (line ~1221), replace the custom `bootSystem` string construction with: `const sysPrompt = buildSystemPrompt(active.name, ctx, journal, modeHint); const bootSystem = sysPrompt + studentContext + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";` This makes boot use `buildSystemPrompt()` as its base, so the AI gets ALL general instructions (SKILL_UPDATE, FACET ASSESSMENT, ASSESSMENT PROTOCOL, ANSWER DOCTRINE, ESCALATION RESISTANCE) plus the mode-specific FLOW. Import `buildSystemPrompt` from study.js if not already imported. In `StudyContext.jsx:sendMessage()` (line ~1295), change `buildSystemPrompt(active.name, ctx, journal)` to `buildSystemPrompt(active.name, ctx, journal, cachedSessionCtx.current?.modeHint || "")`.
>
> **Change 2 — Persist modeHint in session cache (StudyContext.jsx).** In `bootWithFocus()`, where `cachedSessionCtx.current` is set (line ~1174), add `modeHint` to the cache object: `cachedSessionCtx.current = { ctx, skills, journal, focus, chunkIds: ctxResult.chunkIds, modeHint: modeHint || "" }`. The spread operator in the cache refresh block inside `sendMessage()` (~line 1383) will automatically preserve `modeHint` — verify this is the case and that no subsequent assignment overwrites it.
>
> **Change 3 — Rewrite assignment FLOW with SKILL_UPDATE integration (StudyContext.jsx).** In the `modeHint` string for assignment mode (line ~1211), replace the FLOW section (from `"FLOW:\n1."` through the current step 5) with the blueprint's new FLOW text. The key additions: step 3 explicitly requires `[SKILL_UPDATE]` after every teaching exchange with the explanation "your [SKILL_UPDATE] ratings are the ONLY way the system tracks mastery... if you do not rate, the score stays at 0% and questions can NEVER be unlocked." Step 4 explains the 60% threshold and rejection handling. Keep the surrounding QUESTION VISIBILITY RULES, BAD vs GOOD example, ANSWER ASSESSMENT, and ANSWER REVISION PROTOCOL text unchanged. Also update ANSWER ASSESSMENT step 2 to add "(Same format as during teaching — this updates the student's mastery score.)" after the SKILL_UPDATE mention. **Use the exact FLOW text from the blueprint** — do not paraphrase or shorten it. The specificity is critical for AI compliance.
>
> Run `npm run build` to verify. Add temporary verification: `console.log("BOOT PROMPT INCLUDES SKILL_UPDATE:", bootSystem.includes("SKILL STRENGTH TRACKING")); console.log("BOOT PROMPT INCLUDES MODE:", bootSystem.includes("SESSION MODE INSTRUCTIONS"));` in `bootWithFocus()` after building `bootSystem`. Run `npm run tauri:dev`, start an assignment session, check the console output shows `true` for both. Remove the console.log lines after verification. Commit: "feat: unified prompt architecture — SKILL_UPDATE + assignment FLOW in every message". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — QA

---

> You are the Study Security & Testing Analyst. Skip specialist file and glossary reads — this is a code verification task. Before starting, read the blueprint at `study/knowledge/architecture/assignment-prompt-architecture-blueprint-2026-03-29.md` and the DEV's output receipt from Step 1. **Verify 10 areas:** (1) `buildSystemPrompt()` in study.js accepts 4 parameters with `modeHint = ""` default — confirm signature. (2) `modeHint` is appended at the END of the return string after INPUT MODE CONTROL, wrapped in "SESSION MODE INSTRUCTIONS:" — confirm placement. (3) `bootWithFocus()` now calls `buildSystemPrompt(active.name, ctx, journal, modeHint)` instead of building a custom string — confirm the old custom "You are Study..." construction is gone. (4) `bootSystem` still includes `studentContext` and the "Respond concisely..." suffix — confirm these weren't lost. (5) `sendMessage()` passes `cachedSessionCtx.current?.modeHint || ""` to `buildSystemPrompt()` — confirm. (6) `cachedSessionCtx.current` includes `modeHint` field — confirm it's set in `bootWithFocus()` and preserved through cache refresh spread. (7) The FLOW text in the assignment modeHint now includes "SKILL_UPDATE" in step 3, "60%" in step 4, and "REJECTED" in step 4 — grep the string for all three. (8) The FLOW has 6 steps (not 5) — confirm step count. (9) ANSWER ASSESSMENT step 2 includes "(Same format as during teaching — this updates the student's mastery score.)" — confirm. (10) Build passes: `npm run build` with no errors. Also verify non-assignment modes (skill, exam) still work — `modeHint` for those modes should also be passed through and appear in SESSION MODE INSTRUCTIONS. **Final:** Update PROJECT_STATUS.md — add: "Unified prompt architecture: boot and subsequent messages now use the same system prompt including both SKILL_UPDATE instructions and mode-specific FLOW. Assignment FLOW rewritten to explicitly require SKILL_UPDATE during teaching and explain the 60% mastery gate." Then move this plan to Done: `mv study/knowledge/decisions/executable-assignment-prompt-architecture-2026-03-29.md study/knowledge/decisions/Done/`. Commit: "chore: status update + move prompt architecture plan to Done". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
