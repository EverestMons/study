# Chunk Metadata Enrichment — Component Architecture Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Migration Impact:** None. `structural_metadata` is a JSON TEXT column. New fields are additive — old DB rows with missing fields work via `|| 0` / `|| []` defaults in consumers. No schema migration needed.

**Diagnostic reference:** `knowledge/research/chunk-metadata-diagnostic-2026-03-22.md`

---

## Updated Metadata Schema

After all 4 changes, the full metadata object shape is:

```js
{
  // Existing fields (unchanged)
  bold_term_count: number,       // count of unique bold terms
  bold_terms: string[],          // deduplicated bold term texts
  definition_count: number,      // count of definition patterns
  definitions: string[],         // definition term texts
  example_count: number,         // worked example pattern matches
  code_block_count: number,      // triple-backtick pairs
  table_count: number,           // markdown table count
  image_count: number,           // markdown image count
  images: object[],              // image position/alt/src (DOM walk only)
  equation_indicators: number,   // math Unicode character count

  // Changed field
  list_count: number,            // KEPT for backward compat — now equals ordered_list_count + unordered_list_count

  // New fields
  blockquote_count: number,      // count of blockquote blocks
  subsection_count: number,      // count of sub-headings in the chunk content
  subsections: string[],         // sub-heading text strings
  ordered_list_count: number,    // count of ordered list blocks
  unordered_list_count: number,  // count of unordered list blocks
}
```

---

## Change 1 — Add `blockquote_count`

### DOM walk path (`htmlToMarkdown.js` — `htmlToMarkdown()` function)

Add `blockquote_count: 0` to the initial metadata object (line 59-71):

```js
const metadata = {
  bold_term_count: 0,
  // ... existing fields ...
  equation_indicators: 0,
  blockquote_count: 0,    // NEW
};
```

In the `case 'blockquote':` block (line 263-267), add the increment:

```js
case 'blockquote': {
  metadata.blockquote_count++;    // NEW — add this line
  const text = childText().trim();
  if (!text) return '';
  return '\n> ' + text.replace(/\n/g, '\n> ') + '\n\n';
}
```

### Regex path (`htmlToMarkdown.js` — `computeSectionMetadata()`)

Add `blockquote_count: 0` to the initial `meta` object (line 435-439).

Add detection logic after the existing regex scans. A blockquote block starts when a line beginning with `> ` is preceded by a non-blockquote line or is the first line. Use line scanning:

```js
// Count blockquote blocks
let _inBq = false;
meta.blockquote_count = 0;
for (const _line of markdown.split('\n')) {
  if (_line.startsWith('> ')) {
    if (!_inBq) { meta.blockquote_count++; _inBq = true; }
  } else {
    _inBq = false;
  }
}
```

### `mergeSectionMetadata` (epubParser.js) and `mergeMetadata` (chunker.js)

Both merge functions must sum `blockquote_count`:

```js
combined.blockquote_count = (a.blockquote_count || 0) + (b.blockquote_count || 0);
// (same for mergeSectionMetadata in epubParser.js)
```

---

## Change 2 — Add `subsection_count` + `subsections[]`

### Design decision: what counts as a "subsection"

`computeSectionMetadata()` does not receive the chunk's own heading level. Since the function is called on section content that has already been split at the chunk's heading level, any headings remaining in the content are by definition deeper (subsection) headings.

**Heuristic:** Count all markdown headings found in the content. Skip the first heading if it appears within the first 3 characters (position 0-2), because in the EPUB/DOCX path the section's own heading is included at the start of the content. In the PDF path, the section's own heading is stored separately and not in the content, so there's nothing to skip.

### DOM walk path (`htmlToMarkdown.js` — `htmlToMarkdown()` function)

Not modified. The DOM walk produces section-level metadata for the whole HTML file, before section splitting occurs. Subsection tracking is only meaningful at the per-chunk level, which is handled by `computeSectionMetadata()` after splitting.

### Regex path (`htmlToMarkdown.js` — `computeSectionMetadata()`)

Add `subsection_count: 0` and `subsections: []` to the initial `meta` object.

Add detection logic:

```js
// Count subsection headings
const _headingRe = /^(#{1,6})\s+(.+)$/gm;
let _hm;
const _allHeadings = [];
while ((_hm = _headingRe.exec(markdown))) {
  _allHeadings.push({ text: _hm[2].trim(), pos: _hm.index });
}
// Skip the first heading if it's the section's own heading (at the start of content)
const _subsections = _allHeadings.length > 0 && _allHeadings[0].pos < 3
  ? _allHeadings.slice(1)
  : _allHeadings;
meta.subsection_count = _subsections.length;
meta.subsections = _subsections.map(h => h.text);
```

### Merge functions

```js
combined.subsection_count = (a.subsection_count || 0) + (b.subsection_count || 0);
combined.subsections = [...(a.subsections || []), ...(b.subsections || [])];
```

---

## Change 3 — Fix `list_count` to actual count + split `ol`/`ul`

### DOM walk path (`htmlToMarkdown.js` — `htmlToMarkdown()` function)

Add `ordered_list_count: 0` and `unordered_list_count: 0` to the initial metadata object.

Modify the `case 'ul':` block to increment `unordered_list_count` instead of `list_count`:

```js
case 'ul': {
  metadata.unordered_list_count++;   // CHANGED from metadata.list_count++
  metadata.list_count++;             // KEEP for backward compat
  listDepth++;
  const result = '\n' + childText();
  listDepth--;
  return result + '\n';
}
```

Modify the `case 'ol':` block similarly:

```js
case 'ol': {
  metadata.ordered_list_count++;     // CHANGED from metadata.list_count++
  metadata.list_count++;             // KEEP for backward compat
  listDepth++;
  olCounters.push(0);
  const result = '\n' + childText();
  olCounters.pop();
  listDepth--;
  return result + '\n';
}
```

### Regex path (`htmlToMarkdown.js` — `computeSectionMetadata()`)

Replace the existing binary list detection:

```js
// OLD:
const listStarts = markdown.match(/^(?:- |\d+\. )/gm) || [];
meta.list_count = listStarts.length > 0 ? 1 : 0;
```

With actual list block counting:

```js
// Count list blocks by scanning lines for list-start transitions
let _inOl = false, _inUl = false;
meta.ordered_list_count = 0;
meta.unordered_list_count = 0;
for (const _line of markdown.split('\n')) {
  const _trimmed = _line.trimStart();
  if (/^\d+\.\s/.test(_trimmed)) {
    if (!_inOl) { meta.ordered_list_count++; _inOl = true; }
    _inUl = false;
  } else if (/^[-*]\s/.test(_trimmed)) {
    if (!_inUl) { meta.unordered_list_count++; _inUl = true; }
    _inOl = false;
  } else if (_trimmed !== '') {
    _inOl = false;
    _inUl = false;
  }
  // Blank lines don't reset list state (lists can have blank lines between items)
}
meta.list_count = meta.ordered_list_count + meta.unordered_list_count;
```

### Merge functions

```js
combined.ordered_list_count = (a.ordered_list_count || 0) + (b.ordered_list_count || 0);
combined.unordered_list_count = (a.unordered_list_count || 0) + (b.unordered_list_count || 0);
// list_count remains as sum: handled by existing merge
```

---

## Change 4 — Fix metadata inflation on oversized section splits

### Import (`chunker.js`)

Add at the top of `chunker.js`:

```js
import { computeSectionMetadata } from './htmlToMarkdown.js';
```

### `splitLargeSections` — sub-heading path (line 145-159)

Current code spreads `...sec` which includes parent metadata. After creating the sub-section, recompute metadata:

```js
// Current (line 146-158):
for (let i = 0; i < subSplits.length; i++) {
  const subContent = subSplits[i].trim();
  if (!subContent) continue;
  const subHeading = subContent.match(/^#{1,6}\s+(.+)$/m)?.[1] || sec.heading;
  result.push({
    ...sec,
    heading: subHeading,
    heading_level: Math.min((sec.heading_level || 2) + 1, 6),
    section_path: sec.section_path + '.' + (i + 1),
    content: subContent,
    char_count: subContent.length,
    structural_metadata: computeSectionMetadata(subContent),  // CHANGED: recompute instead of inheriting
  });
}
```

### `splitLargeSections` — paragraph fallback path (line 164-174)

Same fix:

```js
// Current (line 167-174):
for (let i = 0; i < paragraphSplits.length; i++) {
  const part = paragraphSplits[i].trim();
  if (!part) continue;
  result.push({
    ...sec,
    heading: sec.heading + (paragraphSplits.length > 1 ? ' (part ' + (i + 1) + ')' : ''),
    section_path: sec.section_path + (paragraphSplits.length > 1 ? '.' + (i + 1) : ''),
    content: part,
    char_count: part.length,
    structural_metadata: computeSectionMetadata(part),  // CHANGED: recompute instead of inheriting
  });
}
```

---

## Extraction.js Changes

### `aggregateMetadata()` — handle new fields

Add to the aggregation loop (after existing field handling):

```js
// After existing fields (line 112-119):
let blockquoteCount = 0;
let subsectionCount = 0;
const subsections = [];
let orderedListCount = 0;
let unorderedListCount = 0;

// Inside the for loop:
blockquoteCount += meta.blockquote_count || 0;
subsectionCount += meta.subsection_count || 0;
for (const sub of (meta.subsections || [])) subsections.push(sub);
orderedListCount += meta.ordered_list_count || 0;
unorderedListCount += meta.unordered_list_count || 0;

// In the return object:
return {
  // ... existing fields ...
  blockquoteCount,
  subsectionCount,
  subsections,
  orderedListCount,
  unorderedListCount,
};
```

All new fields default to `0` / `[]` via `|| 0` / `|| []`, ensuring old metadata without these fields doesn't crash.

### `buildChapterProfile()` — optional content signal

Add a `structured` signal to `contentSignals`:

```js
structured: (meta.subsectionCount || 0) > 2,
```

This indicates the chapter has rich internal structure (many subsection headings), which helps the LLM understand the content density.

### LLM prompt — inject new data

In the prompt template (around line 302-307), add after existing structural analysis lines:

```js
// After "- Code blocks: ..." line:
+ `- Blockquotes: ${(profile.contentSignals?.blockquoteCount || meta.blockquoteCount || 0) > 0 ? meta.blockquoteCount : 'none'}\n`
+ `- Internal structure: ${meta.subsectionCount > 0 ? meta.subsectionCount + ' subsections' : 'flat (no sub-headings)'}\n`
```

Keep it minimal — the LLM doesn't need the full subsection list in the prompt (it can see the headings in the content). The count is sufficient to signal "this is a well-structured section" vs "this is a flat text block."

---

## How to Verify (Acceptance Criteria)

### AC-1: `blockquote_count` in DOM walk
- [ ] `htmlToMarkdown('<p>text</p><blockquote>quote1</blockquote><blockquote>quote2</blockquote>')` returns `metadata.blockquote_count === 2`

### AC-2: `blockquote_count` in regex path
- [ ] `computeSectionMetadata('text\n\n> quote 1\n> continued\n\nnormal\n\n> quote 2\n')` returns `blockquote_count === 2`

### AC-3: `subsection_count` + `subsections[]`
- [ ] `computeSectionMetadata('## Main\n\nText\n\n### Sub1\n\nContent\n\n### Sub2\n\nMore')` returns `subsection_count === 2`, `subsections === ["Sub1", "Sub2"]` (the `## Main` heading at position 0 is skipped as the section's own heading)

### AC-4: `ordered_list_count` + `unordered_list_count` in DOM walk
- [ ] `htmlToMarkdown('<ul><li>a</li></ul><ol><li>1</li></ol><ul><li>b</li></ul>')` returns `metadata.ordered_list_count === 1`, `metadata.unordered_list_count === 2`, `metadata.list_count === 3`

### AC-5: List counting in regex path
- [ ] `computeSectionMetadata('- a\n- b\n\ntext\n\n1. x\n2. y\n\nmore\n\n- c\n')` returns `unordered_list_count === 2`, `ordered_list_count === 1`, `list_count === 3`

### AC-6: Metadata inflation fix
- [ ] A section with 10 bold terms split into 2 parts produces sub-sections where each part's `bold_term_count` reflects only the bold terms in that part's content (not 10 for both)

### AC-7: Backward compatibility
- [ ] `aggregateMetadata([{ structural_metadata: '{"bold_term_count":5}' }])` does not crash — missing new fields default to 0/empty

### AC-8: LLM prompt
- [ ] Extraction prompt includes blockquote and subsection lines when metadata has non-zero values
- [ ] Extraction prompt handles null/missing metadata gracefully

### AC-9: Build
- [ ] `npx vite build --mode development` passes

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Produced a component architecture blueprint for 4 metadata enrichment changes: blockquote counting, subsection tracking, list count split/fix, and oversized section metadata inflation fix. Includes exact code locations, implementation logic, updated schema, extraction.js consumer changes, and 9 acceptance criteria.

### Files Deposited
- `study/knowledge/architecture/chunk-metadata-enrichment-blueprint-2026-03-22.md` — full blueprint with 4 changes + extraction.js updates + acceptance criteria

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Subsection detection skips first heading if at position < 3 (section's own heading in EPUB/DOCX path)
- `list_count` kept for backward compatibility as sum of ordered + unordered
- Subsection heading texts included in `subsections[]` but NOT injected into LLM prompt (count only — LLM sees the headings in content)
- Blank lines in list scanning don't reset list state (lists can have inter-item blank lines)

### Flags for CEO
- None

### Flags for Next Step
- DEV modifies 3 files: htmlToMarkdown.js, chunker.js, extraction.js. Parser files (epub/docx/pdf) are NOT modified — they call computeSectionMetadata and pick up changes automatically. The merge functions in epubParser.js (mergeSectionMetadata) and chunker.js (mergeMetadata) both need updating for new fields.
