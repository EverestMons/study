# study — Materials UX Fixes Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-materials-ux-fixes-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a UI/code investigation task. **Task:** Investigate 3 materials UX issues. **Issue 1 — Reclassify uploaded materials:** The user wants to change a material's classification type after upload (e.g., accidentally classified a textbook as "notes"). Find: (a) Where is `classification` stored? Is it on the `materials` table in the DB? (b) Is there an existing `Materials.updateClassification(materialId, newType)` method in db.js? If not, what would the SQL be? (c) In MaterialsScreen.jsx, where is the expanded material detail rendered (`renderExpandedDetail` or equivalent)? Does it currently show the classification? Is there a place to add a reclassify control (e.g., dropdown or buttons)? (d) Does changing classification have any downstream effects? Does it affect extraction prompts, chunking split levels, or skill bindings? Check `classify.js`, `chunker.js`, and `extraction.js` for `classification` reads. **Issue 2 — Extraction progress visibility:** The CEO reports that the extraction progress box only appears at the bottom of the screen when clicking notifications, not inline on MaterialsScreen. Find: (a) Where is extraction progress displayed? Search for `ExtractionProgress` or any progress component. Is it rendered in ScreenRouter, a modal, or inline on MaterialsScreen? (b) What state drives extraction progress display? (`processingMatId`, `bgExtraction`, `status`?) (c) Where is the progress component currently mounted in the component tree? Why does it only show when clicking notifications? (d) What would need to change to show extraction progress inline on MaterialsScreen — either always visible when extraction is running, or as a prominent section at the top of the materials list? **Issue 3 — Duplicate material handling:** The CEO wants a popup/modal saying "Material already uploaded" instead of a notification when a duplicate is detected. Find: (a) Where is duplicate detection currently happening? Search for `content_hash`, `contentHash`, or `duplicate` in the upload flow. (b) What currently happens when a duplicate is detected — notification, silent skip, error? (c) Where in the flow (which function, which file) does the duplicate check occur? (d) What information is available at the duplicate detection point — just the filename, or also the existing material's name/course? **Report:** per-issue findings with exact file/line references, existing methods, and what needs to change. **Deposit:** `study/knowledge/research/materials-ux-fixes-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: materials UX fixes diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-materials-ux-fixes-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
