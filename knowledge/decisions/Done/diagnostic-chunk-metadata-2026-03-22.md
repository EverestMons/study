# study — Chunk Metadata Enrichment Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-chunk-metadata-2026-03-22.md`. Execute Step 1, then stop and wait for user confirmation.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` and the domain glossary at `study/knowledge/research/domain-glossary.md` first. Skip the glossary if it doesn't exist — this is a code investigation task. **Task:** Investigate the current state of structural metadata across the parsing and chunking pipeline. I need to understand what metadata is produced today vs. what the chunk boundary spec (`study/docs/planning/chunk-boundary-spec.md`) envisions. **Investigate these specific questions:** (1) In `src/lib/htmlToMarkdown.js`, what does `computeSectionMetadata()` actually compute? List every field it produces and what each field counts. (2) In `src/lib/epubParser.js`, does the EPUB parser call `computeSectionMetadata()` and pass the results through to chunks? Trace the data flow from `computeSectionMetadata()` through to what gets stored in the DB. (3) In `src/lib/docxParser.js`, does the DOCX parser produce any structural metadata? Does it call `computeSectionMetadata()` or equivalent? (4) In `src/lib/pdfParser.js`, does the PDF parser produce any structural metadata? (5) In `src/lib/chunker.js`, what does the `structuralMetadata` field contain when chunks are created? Is it populated from parser output or always null? (6) In `src/lib/db.js`, how is `structural_metadata` stored in the chunks table? Is it a TEXT column holding JSON? What does a real stored chunk's metadata look like? (7) Does anything downstream currently *use* structural_metadata? Check `study.js` context builders, `skills.js` extraction pipeline, and any other consumers. (8) The chunk boundary spec (§EPUB-specific, step 4) envisions counting: bold terms, definitions (`<dfn>`), code blocks (`<code>`/`<pre>`), blockquotes, figures/images, tables, ordered/unordered lists. How many of these does `computeSectionMetadata()` already handle? What's missing? **Report your findings as a table:** `| Field | Spec envisions | Currently implemented | Where | Gap |`. Also report: which parsers produce metadata, which don't, and what the downstream consumption looks like. Do not fix anything — just investigate and report. **Deposit:** `study/knowledge/research/chunk-metadata-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: chunk metadata enrichment diagnostic"`. **Final:** Move this plan to Done: `mv study/knowledge/decisions/diagnostic-chunk-metadata-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
