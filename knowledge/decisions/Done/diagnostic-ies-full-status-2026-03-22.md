# study — IES Full Implementation Status Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-ies-full-status-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a code investigation task. **Task:** Audit the implementation status of all 7 IES Practice Guide recommendations against the live codebase. Read `study/docs/planning/ies-implementation-spec.md` for the full spec (7 recommendations, each with implementation details). The previous diagnostic (`study/knowledge/research/ies-prompt-diagnostic-2026-03-22.md`) found that Rec 4 (concreteness fading) and Rec 5a (pre-questions) are already implemented in the system prompt. Now check ALL remaining recommendations. For each IES recommendation, investigate: **Rec 1 — Spaced review surface:** Does the system prompt mention due/overdue reviews? Does the skill picker UI show visual indicators for due skills? Does `nextReviewDate()` get surfaced anywhere in the UI (not just computed)? Check `ModePicker.jsx`, `SkillsPanel.jsx`, and the system prompt's ASSESSMENT PROTOCOL section. **Rec 2 — Worked example interleaving:** Does the system prompt instruct the AI to alternate worked examples with problems? Check the TEACHING METHOD section. Does PracticeMode interleave examples with problems, or is it pure problem-solving? **Rec 3 — Graphics + verbal:** The spec recommends punting. Is there any image/diagram integration? Check the IMAGE DISPLAY section in the system prompt. **Rec 4 — Concreteness fading:** Already confirmed implemented. Just note it as done. **Rec 5a — Pre-questions:** Already confirmed implemented. Just note it as done. **Rec 5b — Quizzing for retrieval:** Practice Mode exists. Is it specifically using retrieval practice (testing recall without aids)? Check PracticeMode.jsx. **Rec 6a — Delayed judgment of learning:** Does the system prompt ask students to self-assess after a delay? Check the PRE-QUESTION PHASE section for returning skills. **Rec 6b — Gap identification:** Does the AI surface weak skills to students at session start? Check the boot prompt, the ASSESSMENT PROTOCOL, and the deadline nudge banner. **Rec 7 — Deep explanatory questions:** Does the system prompt use Bloom's taxonomy for questions? Check the DEEP QUESTIONS section. **Report as a table:** `| Rec | Description | Spec says | Actual status | Where implemented | Gap remaining |`. Be precise about what's implemented at the prompt level vs. the UI level vs. not at all. **Deposit:** `study/knowledge/research/ies-full-status-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: IES full implementation status audit"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-ies-full-status-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
