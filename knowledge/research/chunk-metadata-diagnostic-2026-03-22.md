# Chunk Metadata Enrichment Diagnostic
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## Q1: What does `computeSectionMetadata()` compute?

**Location:** `src/lib/htmlToMarkdown.js:434-469`

`computeSectionMetadata(markdown)` takes a markdown string and returns a metadata object by regex-scanning the content. It is used as a fallback when metadata wasn't tracked during initial HTML-to-markdown conversion (e.g., when sections are re-split after chapter merging).

| Field | Type | What it counts |
|---|---|---|
| `bold_term_count` | number | Unique bold terms (`**term**`) under 80 chars |
| `bold_terms` | string[] | Deduplicated list of those bold terms |
| `definition_count` | number | Patterns matching `**Term**: Definition` or `**Term** — Definition` (bold followed by colon/dash + capital letter) |
| `definitions` | string[] | The term portion of each detected definition |
| `example_count` | number | Lines matching `^example \d` or `^worked example \d` (case-insensitive) |
| `code_block_count` | number | Count of triple-backtick pairs (` ``` `) divided by 2 |
| `table_count` | number | Markdown table separator rows (`| ---`) |
| `image_count` | number | Markdown image syntax (`![alt](src)`) |
| `images` | array | Always empty `[]` (not populated from markdown scanning) |
| `list_count` | number | 0 or 1 — binary flag for whether any list markers (`- ` or `N. `) exist |
| `equation_indicators` | number | Count of mathematical Unicode characters (∑, ∫, π, etc.) |

**Notable:** `list_count` only counts 0 or 1 (binary "has lists" flag), not the actual number of lists. The `images` array is always empty because `computeSectionMetadata` scans markdown text (where images are already `![]()`), but never populates the array — only `image_count` is set.

---

## Q2: EPUB parser → `computeSectionMetadata()` → DB flow

**Location:** `src/lib/epubParser.js:11, 160-195`

**Data flow:**

1. Each spine HTML file is parsed by `htmlToMarkdown(html)` → returns `{ markdown, metadata }`. This `metadata` is the **real-time tracking** version (tracks during DOM walk — more accurate than regex).
2. Merged chapters use `mergeSectionMetadata(sections.map(s => s.metadata))` to combine metadata across merged sections.
3. After chapter merging, chapters are split at H2 boundaries via `splitMarkdownSections()`:
   - **Single-section chapters** (no H2 splits): use the chapter's `chapter.metadata` (the real-time tracked version) → stored as `structural_metadata`.
   - **Multi-section chapters** (split at H2): each sub-section gets `computeSectionMetadata(sec.content)` (the regex fallback) → stored as `structural_metadata`.
4. The `structural_metadata` flows into `parsed.sections[].structural_metadata`.
5. Chunker (`chunker.js:85`) passes it through: `structuralMetadata: sec.structural_metadata || null`.
6. DB (`db.js:1215`): `JSON.stringify(structuralMetadata)` → stored as TEXT column.

**Verdict:** EPUB produces metadata via two paths. The `htmlToMarkdown` DOM-walk path is more accurate (tracks `<dfn>`, `<pre>`, `<blockquote>` tags directly). The `computeSectionMetadata` regex path is a lossy fallback (can't detect `<dfn>`, counts lists as binary, etc.).

---

## Q3: DOCX parser structural metadata

**Location:** `src/lib/docxParser.js:11, 44, 56-63, 269-402`

**Yes, DOCX produces structural metadata via two paths:**

1. **`parseBody()` (line 269):** Builds a document-level metadata object during XML parsing. Tracks: `bold_terms`, `definition_count`, `example_count`, `code_block_count`, `table_count`, `image_count`, `list_count`, `equation_indicators`. This metadata is created by directly inspecting DOCX XML elements (bold runs, tables, images, etc.).
2. **Section splitting (line 56-63):** After splitting at H2 boundaries, each section gets `computeSectionMetadata(sec.content)` — the regex fallback. If no sections are split (single section), the document-level `metadata` from `parseBody()` is used directly (line 74).

**Verdict:** DOCX produces metadata. Like EPUB, multi-section documents use the regex fallback for per-section metadata.

---

## Q4: PDF parser structural metadata

**Location:** `src/lib/pdfParser.js:11, 157-166, 314-322, 427-435`

**Yes, PDF produces structural metadata — but only via `computeSectionMetadata()` (the regex fallback).**

- `buildSectionsFromHeadings()` (line 314-322): Each section calls `computeSectionMetadata(content)`.
- `buildPageBasedSections()` (line 427-435): Same — each section calls `computeSectionMetadata(content)`.
- Single-document fallback (line 157-166): `computeSectionMetadata(allText)`.

PDF has no DOM-level HTML to walk, so the regex fallback is the **only** metadata source. This means PDF metadata is inherently less accurate than EPUB metadata (no `<dfn>` detection, binary list counting, no blockquote detection).

**Verdict:** PDF produces metadata, but quality is limited to what regex can detect from plain text converted to markdown-like format.

---

## Q5: Chunker `structuralMetadata` field

**Location:** `src/lib/chunker.js:85`

```js
structuralMetadata: sec.structural_metadata || null,
```

The chunker **passes through** whatever `structural_metadata` the parser section provides. It does NOT compute its own metadata. If the parser section has metadata, it's passed through. If not (e.g., plain text via `chunkPlainText`), it's `null`.

**Special cases:**
- `chunkPlainText()` (line 357-427): Always sets `structuralMetadata: null` — no metadata for plain text files.
- `mergeSmallSections()` calls `mergeMetadata(a, b)` (line 330-347) which correctly sums numeric fields and deduplicates arrays when two sections are merged.
- `splitLargeSections()` does NOT recompute metadata for split sub-sections — they inherit the parent's metadata object (via spread). This means an oversized section split into 3 parts will have each part claiming the full section's metadata counts (inflated).

---

## Q6: DB storage of `structural_metadata`

**Location:** `src/lib/db.js:1206-1217, 1225-1237, 1339-1345`

The `chunks` table has a `structural_metadata` column (TEXT type, nullable). Data is stored as:

```js
structuralMetadata ? JSON.stringify(structuralMetadata) : null
```

A real stored chunk's metadata looks like:

```json
{
  "bold_term_count": 12,
  "bold_terms": ["derivative", "limit", "continuous", ...],
  "definition_count": 3,
  "definitions": ["derivative", "differentiable", "tangent line"],
  "example_count": 2,
  "code_block_count": 0,
  "table_count": 1,
  "image_count": 4,
  "images": [],
  "list_count": 1,
  "equation_indicators": 15
}
```

When read back (`Chunks.getByMaterial`, line 1339-1345), it's returned as a raw string. Consumers must `JSON.parse()` it (and all current consumers do handle both string and object forms).

---

## Q7: Downstream consumption of `structural_metadata`

### Consumer 1: `extraction.js` — Skill extraction pipeline

**Primary consumer.** `aggregateMetadata()` (line 97-132) reads structural_metadata from all chunks in a chapter group, sums counts, and collects term/definition lists. This feeds into:

- **`estimateSkillRange()`** (line 138-143): Uses `definitionCount` to estimate expected skill count for the LLM.
- **`buildChapterProfile()`** (line 203-237): Derives `contentSignals` (procedural, conceptual, quantitative, referenceHeavy, codeHeavy) from metadata counts. Builds candidate skill list from `boldTerms` and `definitions`.
- **LLM prompt** (line 281-307): Injects structural analysis into the extraction prompt:
  - Bold terms list
  - Definitions list
  - Worked examples detected (yes/none)
  - Equation/math content level (heavy/moderate/light/none)
  - Tables (many/few)
  - Code blocks (yes/few)

### Consumer 2: `MaterialsScreen.jsx` — OCR confidence display

**Minor consumer.** Line 147: Reads `ocr_confidence` from structural_metadata to compute average OCR quality for display. This field is injected by `parsers.js` (line 400-401) during OCR processing, not by the standard metadata pipeline.

### Consumer 3: No others

`study.js` and `skills.js` do NOT read structural_metadata. The context builders in `study.js` use chunk content directly, not metadata.

---

## Q8: Spec vs. Implementation — Field Coverage

The chunk boundary spec (§EPUB-specific, step 4) envisions counting these structural elements:

| Field | Spec envisions | Currently implemented | Where | Gap |
|---|---|---|---|---|
| **Bold terms** (`<strong>`/`<b>`) | Yes — candidate skill concepts | **Yes** — counted and listed | `htmlToMarkdown` (DOM walk) + `computeSectionMetadata` (regex) | None |
| **Definitions** (`<dfn>`) | Yes — formal definitions | **Partial** — `<dfn>` tracked in DOM walk only; regex detects `**Term**: Def` patterns | `htmlToMarkdown` DOM walk tracks `<dfn>` directly; `computeSectionMetadata` regex only detects bold+colon patterns | `computeSectionMetadata` (used for EPUB multi-section and all PDF/DOCX sections) misses `<dfn>` tags |
| **Code blocks** (`<code>`/`<pre>`) | Yes | **Yes** — `<pre>` counted in DOM walk; triple-backtick pairs counted in regex | Both paths | None |
| **Blockquotes** (`<blockquote>`) | Yes — quoted material | **No** — not counted in either path | Neither `htmlToMarkdown` metadata nor `computeSectionMetadata` track blockquote count | **Missing field** — `blockquote_count` not in metadata schema |
| **Figures/images** (`<figure>`/`<img>`) | Yes — with position and caption | **Partial** — `image_count` tracked; `images` array populated in DOM walk only | `htmlToMarkdown` DOM walk populates `images[]` with position/alt/src; `computeSectionMetadata` only counts markdown `![]()`  | `images[]` always empty in regex path |
| **Tables** (`<table>`) | Yes | **Yes** — counted in both paths | DOM walk: `<table>` tag; Regex: `| ---` separator lines | None |
| **Ordered lists** (`<ol>`) | Yes — potential assignment items | **Partial** — counted as generic `list_count` | DOM walk: `<ol>` increments `list_count`; Regex: binary 0/1 flag | No distinction between `<ol>` and `<ul>`; regex is binary not count |
| **Unordered lists** (`<ul>`) | Yes — step sequences | **Partial** — same as ordered lists | Same as above | Same gap — merged into single `list_count` |
| **Equations** | Not explicitly listed in step 4 | **Yes** — `equation_indicators` counts math Unicode chars | Both paths (regex only) | N/A — not in spec but useful |
| **Examples** | Not explicitly listed in step 4 | **Yes** — `example_count` via regex pattern matching | Both paths (regex only) | N/A — not in spec but useful |
| **Subsection count** | Yes (spec example shows `subsection_count: 2, subsections: [...]`) | **No** — not tracked | Neither path | **Missing fields** — `subsection_count` and `subsections[]` |

---

## Summary: Parser Metadata Production

| Parser | Produces metadata? | Source | Quality |
|---|---|---|---|
| **EPUB** (`epubParser.js`) | **Yes** | `htmlToMarkdown` DOM walk (high fidelity) for single-section chapters; `computeSectionMetadata` regex (lower fidelity) for multi-section chapters | **Best** — has access to semantic HTML |
| **DOCX** (`docxParser.js`) | **Yes** | `parseBody` XML walk (good) for single-section; `computeSectionMetadata` regex (lower) for multi-section | **Good** — direct XML inspection |
| **PDF** (`pdfParser.js`) | **Yes** | `computeSectionMetadata` regex only (all sections) | **Lowest** — no semantic markup, only plain text patterns |
| **PPTX/Excel** (`parsers.js`) | **No** | Always `structural_metadata: null` | **None** |
| **Plain text** (`chunker.js`) | **No** | `chunkPlainText` sets `structuralMetadata: null` | **None** |

---

## Downstream Consumption Summary

| Consumer | What it reads | Impact |
|---|---|---|
| `extraction.js` — `aggregateMetadata()` | All fields | Feeds LLM prompt structural analysis + skill count estimation + content signal classification |
| `extraction.js` — `buildChapterProfile()` | Aggregated counts | Derives contentSignals (procedural/conceptual/quantitative/referenceHeavy/codeHeavy) |
| `extraction.js` — LLM prompt | Bold terms, definitions, examples, equations, tables, code | Directly injected as "STRUCTURAL ANALYSIS" section in extraction prompt |
| `MaterialsScreen.jsx` | `ocr_confidence` only | OCR quality display (not part of standard metadata pipeline) |

---

## Key Gaps Identified

1. **Missing field: `blockquote_count`** — spec envisions it, neither path tracks it
2. **Missing fields: `subsection_count` + `subsections[]`** — spec example shows them, not implemented
3. **`list_count` is binary (0/1) in regex path** — should be actual count; also no `ol` vs `ul` distinction
4. **`images[]` always empty in regex path** — only populated during DOM walk
5. **`computeSectionMetadata` can't detect `<dfn>`** — regex fallback misses semantic HTML definitions
6. **Oversized section splitting inflates metadata** — split parts inherit parent's full counts
7. **PPTX and plain text produce no metadata** — null for all fields
8. **PDF metadata is lowest quality** — only regex patterns on reconstructed text

---

## Output Receipt
**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Investigated the chunk structural metadata pipeline across all 5 parsers (EPUB, DOCX, PDF, PPTX, plain text), the chunker, DB storage, and all downstream consumers. Produced a detailed diagnostic with field-level coverage table comparing spec vs. implementation, parser metadata production quality matrix, and 8 identified gaps.

### Files Deposited
- `study/knowledge/research/chunk-metadata-diagnostic-2026-03-22.md` — full diagnostic report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- Classified gaps by severity: blockquote_count and subsection tracking are the most impactful missing fields for extraction quality
- Identified that the regex fallback path (`computeSectionMetadata`) is a significant fidelity bottleneck

### Flags for CEO
- None

### Flags for Next Step
- If enrichment work follows, prioritize: (1) add `blockquote_count` to metadata schema and both paths, (2) add `subsection_count`/`subsections[]`, (3) fix `list_count` to be actual count not binary, (4) fix metadata inflation on oversized section splits
