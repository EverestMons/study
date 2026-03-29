# study — Extraction Sub-Batching Fix
**Date:** 2026-03-29 | **Tier:** Medium | **Execution:** Step 1 (DEV) → Step 2 (QA)

## How to Run This Plan

Paste this into Claude Code:
```
Read the plan at study/knowledge/decisions/executable-extraction-sub-batching-2026-03-29.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a targeted implementation task. Read the diagnostic at `study/knowledge/research/extraction-chapter-batching-diagnostic-2026-03-29.md` for full context. **Two changes to `src/lib/extraction.js`:**

> **Change 1 — Sub-batch large chapter groups.** In `extractChapter()` (line ~899), before the API call, measure the total character count of `formatChapterContentWithIds(chapterGroup.chunks)`. If it exceeds 30,000 chars, split `chapterGroup.chunks` into sub-batches where each sub-batch stays under 30,000 chars of formatted content. Process each sub-batch through the same `buildInitialExtractionPrompt` + `callClaude` flow independently. Merge the results: concatenate the skill/facet arrays from each sub-batch response. Dedup merged skills by `conceptKey` — if two sub-batches produce the same skill, keep the one with more facets. The `splitOversizedChapters()` function (line ~836) already has a splitting pattern — reference it but don't modify it. The new sub-batching is a second layer inside `extractChapter()` that handles finer-grained splits. Keep the existing `splitOversizedChapters` as the coarse gate. **Implementation approach:** Extract the current API-call logic in `extractChapter()` into a helper `extractChapterBatch(chapterGroup, profile, isFirstChapter)` that handles a single batch. Then have `extractChapter()` measure total size, split if needed, call the helper per batch, and merge. Each sub-batch should get a note in its system prompt: "This is part N of M for this chapter. Focus on skills present in these specific sections." so the LLM knows it's seeing a partial chapter.
>
> **Change 2 — Dynamic output token budget.** In `extractChapter()` (line ~919), replace the hardcoded `12288` max_tokens with a dynamic calculation: `Math.min(16384, Math.max(8192, Math.ceil(chunkCount * 400)))` where `chunkCount` is the number of chunks in the current batch. This scales output budget with input complexity while capping at 16K tokens. Apply this per sub-batch call, not per chapter.
>
> Run `npm run build` to verify no syntax errors. Commit with message: "feat: extraction sub-batching for large chapters + dynamic output tokens". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — QA

---

> You are the Study Security & Testing Analyst. Skip specialist file and glossary reads — this is a code verification task. Before starting, read `study/knowledge/research/extraction-chapter-batching-diagnostic-2026-03-29.md` for context, then read the DEV's output receipt from Step 1. **Verify 6 areas:** (1) `extractChapter()` measures formatted content size and splits into sub-batches when over 30,000 chars — confirm the threshold and splitting logic. (2) Sub-batches each get their own `buildInitialExtractionPrompt` + `callClaude` call — confirm no shared mutable state between batches. (3) Result merging: skills from multiple sub-batches are concatenated and deduped by `conceptKey` — confirm dedup keeps the richer entry (more facets). (4) Dynamic output tokens: confirm `max_tokens` scales with chunk count per batch, capped at 16384, floor at 8192. (5) Existing `splitOversizedChapters()` is unchanged — confirm via `git diff`. (6) Build passes: run `npm run build` and confirm no errors. **Final:** Update PROJECT_STATUS.md — add a completed milestone entry: "Extraction sub-batching: large chapters now split into ≤30K-char sub-batches for API calls; dynamic output token budget scales with input complexity." Then move this plan to Done: `mv study/knowledge/decisions/executable-extraction-sub-batching-2026-03-29.md study/knowledge/decisions/Done/`. Commit: "chore: status update + move extraction sub-batching plan to Done". Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
