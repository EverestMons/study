# Study — Bugfix Batch (Black Screen, Phantom Slides, Assignment Decomposition)
**Date:** 2026-03-21 | **Tier:** Small + Medium + Medium | **Execution:** Step 1A (DEV) ∥ Step 1B (DEV) ∥ Step 1C (DEV) → Step 2 (QA)

## How to Run This Plan

Paste this into Claude Code:

Read the executable plan at `study/knowledge/decisions/executable-study-bugfix-batch-2026-03-21.md`. Execute Steps 1A, 1B, and 1C — these are independent and can run in parallel or sequentially. After all three are complete, execute Step 2 (QA). Stop after each step and wait for user confirmation before proceeding.

---
---

## STEP 1A — DEV (Black Screen Fix)

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a UI fix. **Black screen bug:** The diagnostic found that `MaterialsScreen.jsx:298` sets `focusContext` to `{ type: "skill", skill: null }` without calling `bootWithFocus()` or `selectMode()`. This puts `StudyScreen` into limbo — the `!focusContext` guard hides the `SkillPicker`, but no session boots, so every sub-component's null guard trips and the screen is empty/black. **Fix:** Match `CourseHomepage`'s behavior — call `selectMode("skills")` so the `SkillPicker` renders and the user can choose what to study. **Verify:** Run `npm run dev`, navigate to a material, click "start studying", confirm the `SkillPicker` appears instead of a black screen. **Commit:** `"fix: MaterialsScreen study launch — call selectMode to show SkillPicker"`. Next is Step 1B (DEV) — phantom slide guardrails. Stop here and wait for user confirmation before proceeding.

---
---

## STEP 1B — DEV (Phantom Slide Guardrails)

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a prompt text fix across two files. **Phantom slide references:** The diagnostic found a three-layer gap causing the AI to say "as shown on this slide" when no slide image exists. The PPTX parser (`parsers.js:20-105`) extracts only `<a:t>` text nodes — all diagrams, images, charts, and shapes are discarded. But nothing tells the LLM that visuals are missing. **Fix two files:** **(1) `extraction.js` — `buildInitialExtractionPrompt()` around line 272:** In the RULES section at the end of the prompt string, add a rule: `"- Source material may have contained diagrams, images, charts, or visual elements that were stripped during text extraction. Do NOT reference visuals that are not present in the text content. Never say 'as shown in the figure/slide/diagram' or similar phrases unless the visual is explicitly described in the text. Instead, describe the concept verbally using only the information available in the text."` Also in the `evidence` schema, add a note next to `figureReferences`: `"(only include if the figure content is described in text — do not reference stripped visuals)"`. **(2) `study.js` — find the study session system prompt (around line 1635):** Add a guardrail: `"The source material may have originally contained slides, diagrams, or figures that are not available to you. Never reference visuals you cannot display — do not say 'as shown on this slide' or 'refer to the diagram'. Describe all concepts using words only."` **Constraints:** Do not change any logic, only prompt text strings. Do not modify the `[SHOW_IMAGE]` tag mechanism — that's working correctly. **Verify:** Read both modified prompts to confirm the guardrail text is present and doesn't break the surrounding prompt structure. **Commit:** `"fix: add phantom visual reference guardrails to extraction and study prompts"`. Next is Step 1C (DEV) — assignment decomposition. Stop here and wait for user confirmation before proceeding.

---
---

## STEP 1C — DEV (Assignment Decomposition on Material Addition)

---

> You are the Study Developer. Read your specialist file and domain glossary first. **Assignment decomposition gap:** The diagnostic confirmed two compounding bugs. **Gap 1:** `addMats` (`StudyContext.jsx:1309-1415`) never calls `decomposeAssignments` after `runBackgroundExtraction` completes. New assignment materials are stored and chunks marked "extracted" but no assignment rows with questions/skill-mappings are ever created. **Gap 2:** The `selectMode("assignment")` fallback (`StudyContext.jsx:886`) has an all-or-nothing guard: `if (!Array.isArray(asgn) || asgn.length === 0)` — meaning it only decomposes when ZERO assignments exist, silently ignoring new materials when old assignments are present. **Fix both gaps:** **(Gap 1 — proactive decomposition):** In `addMats`, after `runBackgroundExtraction` completes for the new materials (around line 1410), check if any of the newly added materials are assignment-classified. If yes, call `decomposeAssignments` with the full `active.materials` list (same pattern as `ChunkPicker.jsx:132`). This requires skills to exist — verify `runBackgroundExtraction` has completed and skills are available before calling. If skills aren't ready yet, this is the same timing issue the existing reactive paths face — acceptable for now. **(Gap 2 — safety net):** Change the `selectMode("assignment")` guard at line 886 from "decompose only if zero assignments" to "decompose if any assignment-classified materials lack corresponding assignment rows." Check: for each material with classification "assignment", does at least one assignment row reference it? If not, run `decomposeAssignments`. **Constraints:** Do not change the `decomposeAssignments` function itself — only add new call sites. Do not change the `Assignments.getByCourse` query — the diagnostic confirmed it's clean. Preserve the existing CurriculumScreen manual decompose button and ChunkPicker re-extract paths — they still serve a purpose. Also check: is there a parallel implementation of `decomposeAssignments` (cached/non-cached, batch/single)? If yes, apply the fix to both. **Verify:** Run `npm run dev`. Create a course with one assignment material, verify it decomposes. Then add a second assignment material, verify it also decomposes without requiring manual intervention. Check that the assignment picker shows both. **Commit:** `"fix: proactive assignment decomposition on material addition + incremental fallback"`. Next is Step 2 (QA). Stop here and wait for user confirmation before proceeding.

---
---

## STEP 2 — QA

---

> You are the Study Security & Testing Analyst. Read your specialist file first. **QA three fixes from Steps 1A-1C.** Verify each dimension independently: **(1A — Black screen fix):** Open `MaterialsScreen.jsx`, confirm the "start studying" action now calls `selectMode("skills")` or equivalent. Trace the code path: does clicking "start studying" from a material now reach `SkillPicker`? Check that no other MaterialsScreen navigation paths were broken. **(2B — Phantom slide guardrails):** Read `extraction.js` `buildInitialExtractionPrompt()` and confirm the RULES section now includes a guardrail against referencing stripped visuals. Read `study.js` study session system prompt and confirm a matching guardrail exists. Verify the `[SHOW_IMAGE]` mechanism was NOT modified. Verify prompt strings are syntactically valid (no unclosed quotes, no broken template literals). **(1C — Assignment decomposition):** Read `StudyContext.jsx` `addMats` function and confirm `decomposeAssignments` is now called after `runBackgroundExtraction` completes for assignment-classified materials. Read the `selectMode("assignment")` guard and confirm it now checks for undecomposed materials rather than only checking for zero assignments. Verify the existing decomposition paths (CurriculumScreen button, ChunkPicker re-extract) still work — no references to them were removed or broken. **Deposit:** `study/knowledge/qa/bugfix-batch-qa-2026-03-21.md`. **Final:** Move this plan to Done: `mv study/knowledge/decisions/executable-study-bugfix-batch-2026-03-21.md study/knowledge/decisions/Done/`. Commit: `"chore: move bugfix batch plan to Done"`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Plan complete — all steps executed.
