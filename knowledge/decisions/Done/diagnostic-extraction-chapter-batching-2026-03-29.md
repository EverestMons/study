# study — Extraction Chapter Batching Diagnostic
**Date:** 2026-03-29 | **Type:** Diagnostic

---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a code-tracing task. **Investigate how `extractChapter()` in `extraction.js` batches chunks for API calls.** (1) Read `extractChapter()` in extraction.js — how does it build the prompt sent to the API? Does it concatenate ALL chunks for a chapter into a single prompt? Is there any size/token limit check before calling the API? (2) What is the maximum prompt size that can result? Show the prompt construction: which parts are static template, which are chunk content, and how chunk content is formatted (raw text? with metadata?). (3) Read `formatChapterContentWithIds()` — this likely formats chunk content for the prompt. How much overhead does it add per chunk? (4) Check `buildInitialExtractionPrompt()` — what's the system prompt size? (5) For a textbook with 50+ page chapters, estimate the token count that would result from concatenating all chapter chunks. The API limit is 200K tokens. (6) Identify the right fix point: should `extractChapter()` split large chapter groups into sub-batches with a token budget, or should the chunker produce smaller chunks? Consider that chunks are already created — the fix needs to work for existing data on retry, not just future uploads. **Deposit findings** to `knowledge/research/extraction-chapter-batching-diagnostic-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/research/extraction-chapter-batching-diagnostic-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
