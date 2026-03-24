# study — Tutor Facet-Grounded Teaching Phase 1 (Facet Assessment in All Modes)
**Date:** 2026-03-24 | **Tier:** Small | **Execution:** Step 1 (SA) → Step 2 (DEV) → Step 3 (QA) → Step 4 (UXV)

## How to Run This Plan

Paste the following into Claude Code:

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/executable-tutor-phase1-facet-assessment-2026-03-24.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — STUDY SYSTEMS ANALYST (facet assessment coverage audit + blueprint)

---

> You are the Study Systems Analyst. Read specialist file at `study/agents/STUDY_SYSTEMS_ANALYST.md` and domain glossary if present. Read the roadmap at `study/knowledge/decisions/roadmap-tutor-facet-grounded-teaching-2026-03-24.md`. Read `study/src/lib/study.js` — specifically: (1) `buildFacetAssessmentBlock()` — what it produces and when it's called; (2) `buildFocusedContext()` — which focus types call `buildFacetAssessmentBlock()` and which don't; (3) `buildContext()` — whether it calls `buildFacetAssessmentBlock()`; (4) `buildSystemPrompt()` — confirm the FACET-LEVEL ASSESSMENT section is present; (5) `parseSkillUpdates()` — confirm facet sub-line parsing is implemented; (6) `applySkillUpdates()` — confirm per-facet routing path exists when `u.facets` is populated. Audit: which of the 5 study modes (assignment, skills, exam, recap, explore) currently receive the facet assessment block in their context? Which do not? The facet block is currently called from `buildFocusedContext` for assignment (via `asgnFacetBlock`) and skill (via `skillFacetBlock`) focus types. Check whether recap and explore modes use `buildFocusedContext` or `buildContext` — if they use `buildContext`, confirm `buildFacetAssessmentBlock` is absent from that path. Blueprint: (1) specify which skills should be passed to `buildFacetAssessmentBlock()` in `buildContext()` — recommend using the `relevantSkillIds` array already computed in that function (skills matching recent message keywords); (2) specify placement of the facet block in the context string — after the skill tree section, before the source material section, same pattern as `buildFocusedContext`; (3) confirm no changes needed to `parseSkillUpdates`, `applySkillUpdates`, or `buildSystemPrompt` — these already handle facet-level assessment correctly; (4) confirm no schema changes needed — this is a context builder change only; (5) specify how the `buildContext` change should handle the case where `relevantSkillIds` is empty (skip the facet block entirely, same as existing fallback). Deposit: `study/knowledge/architecture/tutor-phase1-blueprint-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — STUDY DEVELOPER (facet assessment in all modes)

---

> You are the Study Developer. Before starting, read `study/knowledge/architecture/tutor-phase1-blueprint-2026-03-24.md` and check Output Receipt status. If not Complete, stop and report. Read specialist file at `study/agents/STUDY_DEVELOPER.md`. Implement per blueprint exactly. The change is targeted to `buildContext()` in `study/src/lib/study.js`. After the SKILL TREE section is built and before the LOADED SOURCE MATERIAL section, add a facet assessment block using the same pattern as `buildFocusedContext`: call `buildFacetAssessmentBlock(relevantSkillIds, allSkills)` where `allSkills = Array.isArray(skills) ? skills : []` and `relevantSkillIds` is the array already computed in `buildContext` (skills matching recent message keywords). If `relevantSkillIds` is empty, skip the block. Append the result to `ctx` if non-empty. This is an additive change — no existing logic changes, no existing calls removed. No schema changes. No migration needed. Verify the change builds cleanly: `npm run build` or `npx vite build --mode development` in the study directory (use the dev build — acorn does not support JSX in production build checks). Commit: `"feat: tutor facet assessment block added to general context builder (recap + explore modes)"`. Deposit: `study/knowledge/development/tutor-phase1-dev-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 3 — STUDY SECURITY & TESTING ANALYST (phase 1 QA)

---

> You are the Study Security & Testing Analyst. Before starting, read `study/knowledge/development/tutor-phase1-dev-2026-03-24.md` and check Output Receipt status. If not Complete, stop and report. Read specialist file at `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`. Verify: (1) `buildContext()` in `study.js` now calls `buildFacetAssessmentBlock(relevantSkillIds, allSkills)` and appends the result between the skill tree and source material sections; (2) the call is conditional — skipped when `relevantSkillIds` is empty; (3) `buildFocusedContext()` is unchanged — its existing facet block calls are still present for assignment and skill modes; (4) `parseSkillUpdates()` and `applySkillUpdates()` are unchanged; (5) `buildSystemPrompt()` FACET-LEVEL ASSESSMENT section is unchanged; (6) build passes cleanly — run `npx vite build --mode development` and confirm no errors. Also verify the change is additive: search for any removed or modified function signatures in study.js — there should be none. Update `study/PROJECT_STATUS.md` — add milestone: "Tutor Phase 1 (2026-03-24): Facet assessment block added to general context builder — all 5 study modes now expose facets to the AI for per-facet FSRS routing during tutoring." Move plan to Done: `mv study/knowledge/decisions/executable-tutor-phase1-facet-assessment-2026-03-24.md study/knowledge/decisions/Done/`. Commit: `"chore: status update + move tutor-phase1 plan to Done"`. Deposit: `study/knowledge/qa/tutor-phase1-qa-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 4 — STUDY UX VALIDATOR (phase 1 UXV)

---

> You are the Study UX Validator. Before starting, read `study/knowledge/qa/tutor-phase1-qa-2026-03-24.md` and check Output Receipt status. If not Complete, stop and report. Read specialist file at `study/agents/STUDY_UX_VALIDATOR.md`. Validate two UX concerns: (1) COGNITIVE OVERHEAD — the facet assessment block adds content to the AI's context in recap and explore modes. Verify the block is capped at MAX_SKILLS=3 in `buildFacetAssessmentBlock()` — confirm this limit is still in place. This cap prevents token bloat and keeps the AI's assessment focused. (2) ASSESSMENT CONTINUITY — the system prompt's FACET-LEVEL ASSESSMENT instruction is already present for all modes via `buildSystemPrompt()`. Confirm the facet block's output format (FACETS FOR skill_name: / facet-key: name [mastery: X%]) matches exactly what the system prompt instructs the AI to look for. Any mismatch would cause the AI to ignore the facet context. Flag any format discrepancy as a blocking issue. Deposit: `study/knowledge/design/validation/tutor-phase1-uxv-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
