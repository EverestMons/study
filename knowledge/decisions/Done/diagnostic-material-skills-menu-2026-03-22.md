# study — Material Skills Menu Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-material-skills-menu-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a UI/code investigation task. **Task:** Investigate what happens when a user clicks "Start Studying" on a material, and what data exists to power a skill picker for that material. The CEO wants: when a user clicks "Start Studying" on a material card, a menu/modal appears showing the skills extracted from that material, and the user picks which skill to study. **Investigate:** (1) In `src/screens/MaterialsScreen.jsx`, find the "Start Studying" button or equivalent action on material cards (expanded detail view). What does it currently do? What handler does it call? Trace the full click path — does it call `enterStudy()`, `setScreen()`, or something else? What parameters does it pass? (2) In `src/StudyContext.jsx`, find the handler that receives the "start studying" action. What does it do with the material context? Does it already know which material the user clicked? Does it set a focus mode? (3) What data connects materials to skills? Find the query path: given a `material_id`, how do you get the sub_skills (and facets) extracted from that material? The chain is likely: `material_id → chunks (via material_id) → chunk_skill_bindings (via chunk_id) → sub_skills (via sub_skill_id)`. Confirm this chain and find the actual DB queries or module methods that exist. Is there a `SubSkills.getByMaterial(materialId)` or equivalent? If not, what joins are needed? (4) Does anything like a skill picker already exist in the app? Check `SkillsPanel.jsx`, `ModePicker.jsx`, or any modal that lets users pick skills. Could it be reused or extended? (5) After a user picks a skill, what's the expected flow? The existing `enterStudy()` or `selectMode("skills")` presumably takes a skill as input. What parameters does the skills mode expect? Trace: how does the existing skill picker in ModePicker work — what state does it set to start a skill-focused study session? **Report:** the current "Start Studying" click path with exact handlers and files, the material→skill data chain with existing queries, any reusable skill picker components, and the expected state changes to start a skill-focused session from a material context. **Deposit:** `study/knowledge/research/material-skills-menu-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: material skills menu diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-material-skills-menu-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
