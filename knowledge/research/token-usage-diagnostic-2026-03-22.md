# Token Usage Diagnostic — Extraction + Chunking Pipeline

**Agent:** Study Developer
**Step:** 1
**Date:** 2026-03-22

---

## 1. All `callClaude` and `callClaudeStream` Call Sites

### Complete Inventory (13 call sites)

| # | File | Line | Function | Purpose | Model | Category | Max Output Tokens |
|---|------|------|----------|---------|-------|----------|-------------------|
| 1 | `StudyContext.jsx` | 1212 | `bootSession` | Boot a tutoring session (streaming) | **Sonnet** | Teaching/Tutoring | 16384 |
| 2 | `StudyContext.jsx` | 1270 | `sendMessage` | Continue a tutoring conversation (streaming) | **Sonnet** | Teaching/Tutoring | 16384 |
| 3 | `extraction.js` | 916 | `extractChapter` | Extract skills + facets from one chapter | **Haiku** | Extraction Pipeline | 12288 |
| 4 | `extraction.js` | 1271 | `enrichFromMaterial` | Enrich existing skills with new material | **Haiku** | Extraction Pipeline | 12288 |
| 5 | `extraction.js` | 851 | `wireCrossChapterPrereqs` | Wire cross-chapter prerequisite links | **Haiku** | Extraction Pipeline | 4096 |
| 6 | `skills.js` | 254 | `verifyDocument` | Verify a document extraction quality | **Haiku** | Utility | 8192 |
| 7 | `skills.js` | 326 | `decomposeAssignments` | Decompose assignments into skill/facet requirements | **Haiku** | Utility | 16384 |
| 8 | `conceptLinks.js` | 122 | `generateConceptLinks` | Identify skill-level concept relationships | **Haiku** | Extraction Pipeline | 4096 |
| 9 | `conceptLinks.js` | 205 | `generateFacetConceptLinks` | Identify facet-level concept relationships | **Haiku** | Extraction Pipeline | 4096 |
| 10 | `syllabusParser.js` | 191 | `parseSyllabus` | Extract structured schedule from syllabus | **Haiku** | Utility | 16384 |
| 11 | `study.js` | 1843 | `generateProblems` | Generate 5 practice problems for a skill | **Sonnet** | Teaching/Tutoring | 8192 |
| 12 | `study.js` | 1898 | `evaluateAnswer` | Evaluate a student's practice answer | **Sonnet** | Teaching/Tutoring | 1024 |
| 13 | `SkillsPanel.jsx` | 192 | (inline) flag handler | Re-examine a flagged skill | **Sonnet** | Utility | 4096 |

### Category Summary

| Category | Call Sites | Model(s) |
|----------|-----------|----------|
| Extraction Pipeline | 5 (#3, #4, #5, #8, #9) | All Haiku |
| Teaching/Tutoring | 4 (#1, #2, #11, #12) | All Sonnet |
| Utility | 4 (#6, #7, #10, #13) | 3 Haiku, 1 Sonnet |

---

## 2. Extraction Pipeline Token Flow

### 2a. Initial Chapter Extraction (`extractChapter` — call #3)

**System prompt components:**

| Component | Est. Tokens | Sent Every Chapter? |
|-----------|-------------|---------------------|
| Instructions & rules | ~800 | Yes |
| Section headings list | ~50-200 | Yes |
| Chunk index (ID + label + 200-char preview per chunk) | ~100-500 | Yes |
| Structural analysis (bold terms, definitions, signals) | ~100-400 | Yes |
| Skill schema + output format | ~500 | Yes |
| **CIP taxonomy list** | **~4,300** | **FIRST CHAPTER ONLY** |
| **Total system prompt (first chapter)** | **~5,700-6,700** | — |
| **Total system prompt (subsequent chapters)** | **~1,400-2,400** | — |

**User message (chapter content):**

| Component | Est. Tokens | Notes |
|-----------|-------------|-------|
| Chapter content with [CHUNK id=...] markers and [P#] numbering | **2,000-20,000** | Depends on chapter size. CHAPTER_SIZE_LIMIT = 80,000 chars (~20,000 tokens) |

**CIP taxonomy finding:** The CIP list is ONLY sent on the first chapter (`isFirstChapter === true`). Subsequent chapters do NOT include it. This is already optimized. The `cipData.js` file is 85KB but the formatted "code + name" list sent to the LLM is ~4,300 tokens.

**Per-chapter total: ~3,500–22,000 input tokens + ~2,000-10,000 output tokens**

### 2b. Enrichment (`enrichFromMaterial` — call #4)

**System prompt components:**

| Component | Est. Tokens | Notes |
|-----------|-------------|-------|
| Existing skills + facets summary | ~500-3,000 | Scales with existing skill count |
| Chunk index | ~100-500 | |
| Instructions + schema | ~700 | |
| **Total system prompt** | **~1,300-4,200** | |

**User message:** Full chapter content (~2,000-20,000 tokens)

**Per-call total: ~3,300–24,000 input + ~3,000-10,000 output**

### 2c. Cross-Chapter Prerequisite Wiring (call #5)

**System prompt:** Skill names + conceptKeys only (no chapter content). ~200-600 tokens.
**User message:** "Wire the prerequisites." — 4 tokens.
**Output:** JSON array of prereq links. ~200-1,000 tokens.

**This is very cheap: ~250-650 input + ~200-1,000 output. Called once per material.**

### 2d. Full Extraction Cost Model (per material)

For a textbook with **N chapters**, ~10 chunks per chapter:

| Phase | Calls | Input/Call | Output/Call | Total Input | Total Output |
|-------|-------|-----------|-------------|-------------|--------------|
| Chapter extraction (first) | 1 | ~10,000 | ~5,000 | 10,000 | 5,000 |
| Chapter extraction (rest) | N-1 | ~8,000 | ~5,000 | 8,000*(N-1) | 5,000*(N-1) |
| Cross-chapter wiring | 1 | ~500 | ~500 | 500 | 500 |
| Concept links (skill-level) | 1-3 | ~1,500 | ~1,000 | 1,500-4,500 | 1,000-3,000 |
| Concept links (facet-level) | 1-5 | ~2,000 | ~1,000 | 2,000-10,000 | 1,000-5,000 |
| **Total (10-chapter book)** | **~15-20** | | | **~86,000-97,000** | **~52,000-63,500** |

All extraction calls use **Haiku** — this is already cost-efficient.

---

## 3. Concept Link Generation

### Skill-level (`generateConceptLinks` — call #8)

- **Grouping:** One API call per **parent skill group** (not per skill pair). New skills are compared against existing skills within the same parent.
- **Prompt size:** ~1,500-3,000 tokens (skill IDs + names + descriptions + categories + criteria summaries).
- **Output:** Max ~4,096 tokens, typically ~500-1,500 (JSON array of pairs, max 30).
- **Model:** Haiku.
- **Frequency:** Called once after extraction completes, only if there are both new and existing skills.

### Facet-level (`generateFacetConceptLinks` — call #9)

- **Batching:** Existing facets are batched in groups of 60 (`FACET_BATCH_SIZE = 60`). ALL new facets are sent in each batch against a batch of existing facets.
- **Calls per extraction:** `ceil(existingFacetCount / 60)` batches.
- **Prompt size:** ~2,000-4,000 tokens per batch (facet IDs + names + descriptions + criteria + blooms level).
- **Output:** Max ~4,096 tokens per batch, typically ~500-2,000.
- **Model:** Haiku.
- **Potential waste:** If there are 200 existing facets and 30 new facets, this makes 4 calls — each sending ALL 30 new facets. The new facet list is repeated in every batch.

---

## 4. Chunking Pipeline

**Confirmed: ZERO API calls.** The entire chunking pipeline is purely deterministic:

- `chunker.js` — heading-level splitting, paragraph merging, size splitting, content hashing (Web Crypto SHA-256)
- `epubParser.js` — no `callClaude` imports or calls
- `docxParser.js` — no `callClaude` imports or calls
- `pdfParser.js` — no `callClaude` imports or calls
- `htmlToMarkdown.js` — deterministic HTML-to-Markdown conversion + structural metadata extraction

---

## 5. Syllabus Parsing (`parseSyllabus` — call #10)

- **System prompt:** `SYLLABUS_SYSTEM_PROMPT` — ~750 tokens (static schema + instructions).
- **User message:** Full syllabus text. Typically 2,000-15,000 tokens.
- **Output:** Max 16,384 tokens. Typically 1,000-4,000 (structured JSON with schedule, exams, grading).
- **Model:** Haiku.
- **Calls per syllabus:** **1 call only.**
- **Frequency:** Once per course (when syllabus material is uploaded).

---

## 6. Assignment Decomposition (`decomposeAssignments` — call #7)

- **System prompt:** Includes all assignment content + full skill/facet reference list.
  - Assignment content: variable, ~500-10,000 tokens.
  - Facet reference list: `concept_key: name [under: parentName]` per facet. For a course with 100 facets, ~2,000-3,000 tokens. For 300 facets, ~6,000-9,000 tokens.
  - Instructions + schema: ~400 tokens.
- **Total system prompt: ~1,400-19,400 tokens.**
- **User message:** "Decompose all assignments into facet requirements." — ~10 tokens.
- **Output:** Max 16,384 tokens. Typically 2,000-8,000.
- **Model:** Haiku.
- **Calls per extraction:** 1 (called once after all materials are processed, if any assignment materials exist).

**Potential waste:** The full facet list scales linearly. At 300+ facets, this prompt gets expensive. Could benefit from pre-filtering facets by relevance to assignment topics.

---

## 7. Token Waste Opportunities — Ranked by Savings

### RANK 1 — Practice Problem Generation (call #11): Sonnet where Haiku suffices

| Factor | Detail |
|--------|--------|
| **Current model** | **Sonnet** (expensive) |
| **Suggested model** | **Haiku** (3-5x cheaper) |
| **Input tokens** | ~1,000-9,500 (prompt + up to 8,000 chars material context) |
| **Output tokens** | ~3,000-6,000 (5 problems with worked examples) |
| **Frequency** | Every practice tier attempt (potentially 5-30x per study session) |
| **Est. savings** | **60-80% cost reduction on practice mode.** Haiku can generate structured JSON problems at this difficulty. |

### RANK 2 — Practice Answer Evaluation (call #12): Sonnet where Haiku suffices

| Factor | Detail |
|--------|--------|
| **Current model** | **Sonnet** |
| **Suggested model** | **Haiku** |
| **Input tokens** | ~200-500 (problem + answer + rubric) |
| **Output tokens** | ~50-150 (pass/fail + 2-3 sentence feedback) |
| **Frequency** | Every answered problem (5 per attempt, potentially 25-150 per session) |
| **Est. savings** | **60-80% per evaluation.** This is a simple classification task — Haiku handles it well. |

### RANK 3 — Skill Flag Re-examination (call #13): Sonnet where Haiku suffices

| Factor | Detail |
|--------|--------|
| **Current model** | **Sonnet** |
| **Suggested model** | **Haiku** |
| **Input tokens** | ~500-2,000 (flagged skill JSON + nearby skills context) |
| **Output tokens** | ~200-800 |
| **Frequency** | On-demand (rare), but still unnecessary Sonnet usage |
| **Est. savings** | **60-80% per flag.** Structured JSON correction is well within Haiku capability. |

### RANK 4 — Facet Concept Links: Redundant new-facet repetition

| Factor | Detail |
|--------|--------|
| **Issue** | ALL new facets are included in EVERY batch, even though only existing facets are batched |
| **Current behavior** | For 30 new + 200 existing facets: 4 calls, each with all 30 new facets (~600-1,200 tokens repeated per batch) |
| **Fix** | Batch new facets too, or skip batches where no relationships are plausible (e.g., unrelated domains) |
| **Est. savings** | ~2,000-5,000 tokens per extraction for large courses |

### RANK 5 — Document Verification (call #6): Content truncation is conservative

| Factor | Detail |
|--------|--------|
| **Issue** | Sends 8,000 chars of content + chunk previews. For multi-chunk materials, sends 300-char previews of all chunks. |
| **Current behavior** | ~2,000-4,000 input tokens per verification |
| **Fix** | For multi-chunk materials, a 150-char preview would suffice — the model only checks readability, not deep content. |
| **Est. savings** | ~500-1,500 tokens per verification |

### RANK 6 — Extraction prompt structural metadata section

| Factor | Detail |
|--------|--------|
| **Issue** | Structural analysis section (bold terms, definitions, equation indicators, etc.) is sent to the LLM in the extraction prompt, but the LLM already sees the full chapter content with [P#] numbering. |
| **Question** | Does the LLM actually use this metadata, or does it re-discover it from the content? |
| **Risk** | Removing it could reduce extraction quality if the LLM uses it to prioritize which terms to extract. |
| **Est. savings** | ~100-400 tokens per chapter (low individual impact, but compounds across chapters). Investigate before removing. |

### RANK 7 — Assignment decomposition facet list scaling

| Factor | Detail |
|--------|--------|
| **Issue** | Full facet list grows linearly with course size. At 300+ facets, ~6,000-9,000 tokens. |
| **Fix** | Pre-filter facets: extract topic keywords from assignment text, then only include facets whose names/categories match. |
| **Est. savings** | Could cut facet list by 50-80% for large courses |

### NOT WASTE — Items that are already optimized

| Item | Status |
|------|--------|
| CIP taxonomy list | Only sent on first chapter — already optimized |
| Cross-chapter wiring | Sends only names/keys, not content — very cheap |
| Extraction model choice | All extraction uses Haiku — already cost-efficient |
| Chunking pipeline | Zero API calls — purely deterministic |
| Tutoring calls (boot + message) | Sonnet is appropriate here — quality matters for teaching |

---

## 8. Summary Table

| Call Site | File:Line | Model | Est. Input Tokens | Est. Output Tokens | Frequency | Waste Assessment |
|-----------|-----------|-------|-------------------|-------------------|-----------|------------------|
| Boot session | StudyContext:1212 | Sonnet | 2,000-8,000 | 100-500 | 1/session | OK — quality matters |
| Send message | StudyContext:1270 | Sonnet | 3,000-12,000 | 200-2,000 | 1-50/session | OK — quality matters |
| Extract chapter | extraction:916 | Haiku | 3,500-22,000 | 2,000-10,000 | 1/chapter | OK |
| Enrich material | extraction:1271 | Haiku | 3,300-24,000 | 3,000-10,000 | 1/material | OK |
| Cross-chapter prereqs | extraction:851 | Haiku | 250-650 | 200-1,000 | 1/material | OK — very cheap |
| Verify document | skills:254 | Haiku | 2,000-4,000 | 500-2,000 | 1/material | Minor — could truncate previews |
| Decompose assignments | skills:326 | Haiku | 1,400-19,400 | 2,000-8,000 | 1/extraction | Waste at scale — filter facet list |
| Concept links (skill) | conceptLinks:122 | Haiku | 1,500-3,000 | 500-1,500 | 1-3/extraction | OK |
| Concept links (facet) | conceptLinks:205 | Haiku | 2,000-4,000 | 500-2,000 | 1-5/extraction | Minor — new facets repeated |
| Parse syllabus | syllabusParser:191 | Haiku | 2,750-15,750 | 1,000-4,000 | 1/course | OK |
| Generate problems | study:1843 | **Sonnet** | 1,000-9,500 | 3,000-6,000 | **5-30/session** | **HIGH — switch to Haiku** |
| Evaluate answer | study:1898 | **Sonnet** | 200-500 | 50-150 | **25-150/session** | **HIGH — switch to Haiku** |
| Flag re-examine | SkillsPanel:192 | **Sonnet** | 500-2,000 | 200-800 | Rare | **Medium — switch to Haiku** |

---

## Output Receipt

**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Comprehensive token usage audit of all 13 Claude API call sites across the codebase. Traced the full extraction pipeline, concept link generation, chunking (no API calls), syllabus parsing, assignment decomposition, and tutoring calls. Identified and ranked 7 token waste opportunities.

### Files Deposited
- `study/knowledge/research/token-usage-diagnostic-2026-03-22.md` — full diagnostic report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- Categorized calls as extraction/teaching/utility based on purpose
- Ranked waste opportunities by estimated savings potential
- Confirmed CIP taxonomy is already first-chapter-only (not a waste item)
- Confirmed chunking pipeline has zero API calls

### Flags for CEO
- **Top 3 savings opportunities are all model downgrades** (Sonnet → Haiku) for practice mode + skill flagging. These could save 60-80% on practice mode costs with minimal quality impact. CEO should decide acceptable quality tradeoff.
- Facet list scaling in assignment decomposition could become problematic at 300+ facets per course.

### Flags for Next Step
- None (diagnostic plan complete — single step)
