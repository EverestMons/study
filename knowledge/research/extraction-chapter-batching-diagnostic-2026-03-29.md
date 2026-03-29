# Extraction Chapter Batching — Diagnostic Findings
**Date:** 2026-03-29

---

## 1. How extractChapter() Builds the API Prompt

`extractChapter()` (extraction.js:899-963) does the following:

1. Calls `buildChapterProfile(chapterGroup)` — deterministic structural analysis
2. Calls `buildInitialExtractionPrompt(profile, isFirstChapter, chapterGroup)` — builds the system prompt
3. Calls `formatChapterContentWithIds(chapterGroup.chunks)` — formats ALL chunks as user content
4. Sends to `callClaude(systemPrompt, [{ role: 'user', content: chapterContent }], 12288, true)` — uses Haiku

**Yes, it concatenates ALL chunks for a chapter into a single prompt.** There is no per-call token limit check before calling the API. The only size gate is `splitOversizedChapters()`, which operates on character count.

---

## 2. Maximum Prompt Size and Prompt Construction

### System prompt structure (buildInitialExtractionPrompt, line 288-418)

Static template sections:
- Role instruction: ~50 chars
- `CHAPTER STRUCTURE`: section headings list — variable, ~20-50 chars per heading
- `CHUNK INDEX` (buildChunkIndex): per-chunk line with ID, label, paragraph count, 200-char preview — **~250-300 chars per chunk**
- `STRUCTURAL ANALYSIS`: bold terms, definitions, content signals — variable, typically 200-1,000 chars
- `TARGET`: skill count range — ~50 chars
- `INSTRUCTIONS` (lines 329-339): ~700 chars fixed
- CIP taxonomy (first chapter only): the full CIP_TAXONOMY list — potentially 2,000-5,000 chars
- Skill JSON schema (lines 366-416): ~2,500 chars fixed
- `RULES` block (lines 403-416): ~1,200 chars fixed

**Estimated system prompt size:** ~4,500-6,000 chars base + ~300 chars per chunk (from chunk index) + variable structural analysis. For a 20-chunk chapter: ~10,000-12,000 chars (~2,500-3,000 tokens).

### User message structure (formatChapterContentWithIds, line 275-283)

Per chunk:
```
[CHUNK id="uuid" label="Section Name"]
[P1] paragraph text...

[P2] paragraph text...
[/CHUNK]
```

Overhead per chunk: ~80-120 chars for markers (CHUNK tags + paragraph numbering). The bulk is raw chunk content.

**User message = "CHAPTER CONTENT:\n\n" + all formatted chunks.** No compression, no truncation.

---

## 3. formatChapterContentWithIds (line 275-283)

```js
function formatChapterContentWithIds(chunks) {
  return chunks.map(c => {
    const label = c.label || `Section ${c.section_path || c.sectionPath || '?'}`;
    const header = `[CHUNK id="${c.id}" label="${label}"]`;
    const paragraphs = (c.content || '').split(/\n{2,}/).filter(p => p.trim());
    const numbered = paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
    return `${header}\n${numbered}\n[/CHUNK]`;
  }).join('\n\n');
}
```

**Overhead per chunk:**
- Header: `[CHUNK id="<36-char-uuid>" label="<label>"]` — ~60-100 chars
- Per paragraph: `[P#] ` prefix — 4-6 chars each. For ~10 paragraphs per chunk: ~50 chars
- Footer: `[/CHUNK]` — 8 chars
- **Total overhead: ~120-160 chars per chunk** — negligible compared to content

---

## 4. buildInitialExtractionPrompt — System Prompt Size (line 288-418)

Measured from the template:
- Fixed instruction text: ~4,200 chars
- Chunk index (`buildChunkIndex`): ~250-300 chars per chunk (ID + label + paragraph count + 200-char preview)
- Bold terms list: variable, typically 100-500 chars
- Definition list: variable, typically 100-500 chars
- CIP taxonomy (first chapter only): ~3,000-5,000 chars
- JSON schema example: ~1,800 chars

**System prompt for a 20-chunk chapter: ~12,000-14,000 chars (~3,000-3,500 tokens)**
**System prompt for a 50-chunk chapter: ~20,000-22,000 chars (~5,000-5,500 tokens)**

---

## 5. Token Estimate for Large Chapters

### Assumptions for a 50+ page textbook chapter:
- Typical chunk: 2,000-5,000 chars (based on heading-level chunking)
- A 50-page chapter might produce 20-40 chunks
- Average 3,500 chars per chunk

### Calculations:

| Component | 20 chunks | 40 chunks | 60 chunks |
|---|---|---|---|
| System prompt | ~12,000 chars | ~17,000 chars | ~22,000 chars |
| User content (chunks) | ~73,000 chars | ~143,000 chars | ~213,000 chars |
| Formatting overhead | ~3,000 chars | ~6,000 chars | ~9,000 chars |
| **Total chars** | **~88,000** | **~166,000** | **~244,000** |
| **Estimated tokens** (÷4) | **~22,000** | **~41,500** | **~61,000** |

### The splitOversizedChapters gate:
- `CHAPTER_SIZE_LIMIT = 80,000 chars` (line 20)
- Only splits once (into 2 halves) — no recursive splitting
- After split, each half could still be ~40,000 chars
- **80,000 chars ≈ 20,000 tokens** — well within Haiku's 200K input limit

### But:
- The split is based on `totalChars` from `char_count` column, which may not include the formatting overhead
- The split only bisects — a chapter at 160,000 chars becomes two 80,000-char groups, each still at the limit
- For very large chapters (100+ pages in a single top-level section), the single bisect may not be enough

### Real-world risk:
- **Token count is not the bottleneck.** Even 60 chunks at ~61K tokens is within Haiku's 200K input limit.
- **The real risk is output quality**: cramming 40+ chunks into one prompt forces the LLM to track many concepts simultaneously, likely degrading extraction quality and increasing the chance of JSON parse failures.
- **The 12,288 max_tokens output cap** (line 919) is the binding constraint for large chapters — complex chapters may need more output tokens for the full faceted JSON response, leading to truncated responses and `max_tokens` stop reason.

---

## 6. Recommended Fix Point

### The problem is NOT token overflow — it's quality degradation and output truncation.

### Option A: Sub-batch large chapter groups in extractChapter() (RECOMMENDED)
- **Where:** Inside `extractChapter()` (or a new wrapper), after `splitOversizedChapters()`
- **What:** If a chapter group exceeds a token budget (e.g., 30,000 chars / ~7,500 tokens of content), split it into sub-batches and make multiple API calls, then merge results
- **Why this is the right fix point:**
  - Works for existing data on retry (chunks already exist in DB)
  - `splitOversizedChapters` already has the splitting logic pattern — this extends it
  - Keeps the chapter-level grouping semantic intact (skills are still per-chapter)
  - The merge step can deduplicate skills that span sub-batches using conceptKey matching
- **Trade-off:** More API calls per chapter, but better extraction quality per call. Cost is marginal (Haiku is cheap).

### Option B: Make splitOversizedChapters recursive
- Modify to recursively split until all groups are under a tighter limit (e.g., 30,000 chars)
- Simpler than Option A but loses the ability to merge cross-batch skills within a chapter
- Each sub-group gets treated as an independent "chapter" downstream

### Option C: Smaller chunks from the chunker
- **Not viable for the retry case** — existing chunks are already in the DB
- Would help future uploads but doesn't address the current data

### Option D: Increase output token budget dynamically
- Scale `max_tokens` based on chapter size: `Math.min(16384, 12288 + chunks.length * 100)`
- Addresses truncation but not quality degradation
- Should be done regardless as a complementary fix

### Recommendation: Option A + Option D
- Sub-batch in `extractChapter()` for quality
- Dynamic output token budget for truncation resilience
- Both work on existing data, both are localized changes
