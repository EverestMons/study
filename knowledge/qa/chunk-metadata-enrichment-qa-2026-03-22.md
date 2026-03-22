# Chunk Metadata Enrichment — QA Report
**Date:** 2026-03-22 | **Agent:** Study Security & Testing Analyst | **Step:** 3

**Blueprint reference:** `knowledge/architecture/chunk-metadata-enrichment-blueprint-2026-03-22.md`

---

## Area 1: `computeSectionMetadata` Output — PASS

Verified `computeSectionMetadata()` in `htmlToMarkdown.js:440-511`.

**New field initialization** (line 441-446):
- `ordered_list_count: 0`, `unordered_list_count: 0`, `blockquote_count: 0`, `subsection_count: 0`, `subsections: []` — all present.

**Blockquote detection** (lines 477-481): Scans each line for `> ` prefix. Uses `_inBq` flag to count blocks (not individual lines). Two separated blockquote blocks → `blockquote_count: 2`. CORRECT.

**List detection** (lines 460-483): Scans lines for `\d+\.\s` (ordered) and `[-*]\s` (unordered) with transition-based block counting via `_inOl`/`_inUl` flags. Non-empty non-list lines reset state. Blank lines don't reset (correct for lists with inter-item gaps). `list_count` computed as sum of ordered + unordered (line 483). CORRECT.

**Subsection detection** (lines 486-496): Regex `/^#{1,6}\s+(.+)$/gm` collects all headings with positions. First heading at `pos < 3` is skipped (section's own heading in EPUB/DOCX path). Remaining headings counted as subsections with text extracted. CORRECT.

**AC-2 (blockquote regex):** `computeSectionMetadata('text\n\n> quote 1\n> continued\n\nnormal\n\n> quote 2\n')` → Two `> ` blocks separated by non-blockquote line → `blockquote_count: 2`. PASS.

**AC-3 (subsections):** `computeSectionMetadata('## Main\n\nText\n\n### Sub1\n\nContent\n\n### Sub2\n\nMore')` → `## Main` at pos 0 (< 3) skipped, `### Sub1` and `### Sub2` counted → `subsection_count: 2`, `subsections: ["Sub1", "Sub2"]`. PASS.

**AC-5 (list counting regex):** `computeSectionMetadata('- a\n- b\n\ntext\n\n1. x\n2. y\n\nmore\n\n- c\n')` → UL block 1 (`- a`, `- b`), text resets, OL block 1 (`1. x`, `2. y`), text resets, UL block 2 (`- c`) → `unordered_list_count: 2`, `ordered_list_count: 1`, `list_count: 3`. PASS.

---

## Area 2: Backward Compatibility — PASS

Verified `aggregateMetadata()` in `extraction.js:97-147`.

All new field accesses use `|| 0` / `|| []` defaults:
- `meta.blockquote_count || 0` (line 125)
- `meta.subsection_count || 0` (line 126)
- `meta.subsections || []` (line 127)
- `meta.ordered_list_count || 0` (line 128)
- `meta.unordered_list_count || 0` (line 129)

**AC-7:** Old metadata `{ "bold_term_count": 5 }` parsed → all new fields undefined → `|| 0` yields 0, `|| []` yields `[]`. No crash. PASS.

Also verified merge functions:
- `chunker.js:mergeMetadata()` (lines 334-356): All new fields with `|| 0` / `|| []` guards. PASS.
- `epubParser.js:mergeSectionMetadata()` (lines 442-485): Init includes all new fields, loop accumulates with `|| 0` / `|| []` guards. PASS.

---

## Area 3: Split Inflation Fix — PASS

Verified `splitLargeSections()` in `chunker.js:132-182`.

**Import** (line 11): `import { computeSectionMetadata } from './htmlToMarkdown.js';` — present.

**Sub-heading split path** (line 158): `structural_metadata: computeSectionMetadata(subContent)` — recomputes from sub-content, does NOT inherit parent `...sec` metadata. PASS.

**Paragraph fallback path** (line 176): `structural_metadata: computeSectionMetadata(part)` — same fix applied. PASS.

**AC-6:** A section with 10 bold terms split into 2 parts: `computeSectionMetadata(subContent)` will regex-scan only the sub-content, producing a `bold_term_count` reflecting only bold terms in that part. The parent's count of 10 is NOT inherited. PASS.

---

## Area 4: LLM Prompt Injection — PASS

Verified `buildInitialExtractionPrompt()` in `extraction.js:288-325`.

**Blockquote line** (line 324):
```js
- Blockquotes: ${(chapterGroup.aggregateMetadata?.blockquoteCount || 0) > 0 ? chapterGroup.aggregateMetadata.blockquoteCount : 'none'}
```
- Optional chaining `?.` handles null `aggregateMetadata`.
- `|| 0` handles missing `blockquoteCount` field.
- Shows count when > 0, 'none' otherwise. PASS.

**Subsection line** (line 325):
```js
- Internal structure: ${(chapterGroup.aggregateMetadata?.subsectionCount || 0) > 0 ? chapterGroup.aggregateMetadata.subsectionCount + ' subsections' : 'flat (no sub-headings)'}
```
- Same null safety pattern. Shows count + label when > 0, 'flat' otherwise. PASS.

**Content signal** in `buildChapterProfile()` (line 227):
```js
structured: (meta.subsectionCount || 0) > 2,
```
- `|| 0` handles missing field. Signals true when > 2 subsections. PASS.

**AC-8:** Prompt renders correctly with new fields present (shows counts) and with null/missing metadata (shows 'none' / 'flat'). PASS.

---

## Area 5: Build Verification — PASS

**AC-9:** `npx vite build --mode development` — 184 modules transformed, built in 1.83s. No errors. PASS.

---

## DOM Walk Verification (Additional)

Also verified DOM walk path in `htmlToMarkdown.js`:

**Metadata init** (lines 59-74): Includes `ordered_list_count: 0`, `unordered_list_count: 0`, `blockquote_count: 0`.

**Blockquote handler** (line 268-273): `metadata.blockquote_count++` on `case 'blockquote'`. PASS.

**UL handler** (lines 200-207): `metadata.list_count++` AND `metadata.unordered_list_count++`. PASS.

**OL handler** (lines 209-217): `metadata.list_count++` AND `metadata.ordered_list_count++`. PASS.

**AC-1 (blockquote DOM):** Two `<blockquote>` elements → `blockquote_count: 2`. PASS.

**AC-4 (list DOM):** `<ul>` + `<ol>` + `<ul>` → `unordered_list_count: 2`, `ordered_list_count: 1`, `list_count: 3`. PASS.

---

## Summary

| Area | Status | ACs Covered |
|------|--------|-------------|
| computeSectionMetadata output | PASS | AC-1, AC-2, AC-3, AC-4, AC-5 |
| Backward compatibility | PASS | AC-7 |
| Split inflation fix | PASS | AC-6 |
| LLM prompt injection | PASS | AC-8 |
| Build verification | PASS | AC-9 |

**Result: 5/5 areas PASS, 9/9 acceptance criteria PASS.**

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** 3
**Status:** Complete

### What Was Done
Verified all 4 metadata enrichment changes across 4 modified files (`htmlToMarkdown.js`, `chunker.js`, `epubParser.js`, `extraction.js`). All 9 acceptance criteria from the blueprint pass. Build verified.

### Files Deposited
- `study/knowledge/qa/chunk-metadata-enrichment-qa-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (QA only)
