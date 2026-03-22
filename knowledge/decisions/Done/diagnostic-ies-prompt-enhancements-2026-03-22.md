# study — IES Prompt Enhancement Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-ies-prompt-enhancements-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a code investigation task. **Task:** Investigate the current system prompt and teaching strategy pipeline so we can add two IES Practice Guide enhancements: pre-questions (Rec 5a) and concreteness fading (Rec 4). Read `study/docs/planning/ies-implementation-spec.md` sections 1.2 (Pre-Questions) and 1.3 (Concreteness Fading) for the spec. Then investigate: (1) Read `src/lib/study.js` — find `buildSystemPrompt()`. What sections does it contain? What teaching instructions already exist? List each section/block name and its approximate line range. (2) Find all `buildFocusedContext` branches (assignment, skill, recap, exam, explore). For each: what context gets injected, and does any branch already include teaching strategy instructions (not just data context)? (3) Is there already a `FACET-LEVEL ASSESSMENT` or `ASSESSMENT PROTOCOL` section in the system prompt? If so, where does it live and what does it say? The pre-questions and concreteness fading instructions need to coexist with assessment protocol without conflicting. (4) Does the system prompt currently say anything about how to start a teaching interaction (first message when a student selects a skill to study)? Or is the first message behavior implicit? (5) The IES spec says pre-questions are a prompt-only change — "before teaching, ask a diagnostic question to activate prior knowledge." Where exactly in the system prompt should this instruction be added so the AI consistently asks a pre-question before launching into teaching? (6) The IES spec says concreteness fading is a prompt-only change — "start with concrete examples, fade toward abstract principles." Where should this go? **Report:** the exact line ranges for each system prompt section, which sections are teaching-strategy-relevant, and your recommendation for where the two new instructions should be inserted (exact insertion points, not vague "somewhere in the prompt"). Do not make any changes. **Deposit:** `study/knowledge/research/ies-prompt-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: IES prompt enhancement diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-ies-prompt-enhancements-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
