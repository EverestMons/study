# Architecture: PDF OCR Integration (Phase 2)
**Date:** 2026-03-10
**Author:** Study Systems Analyst
**Handoff to:** Study Developer

---

## Overview

Wire `ocrPdfPages()` from `ocrEngine.js` into the PDF parsing pipeline so scanned PDFs get OCR'd automatically instead of returning an error. Three files change: `pdfParser.js`, `parsers.js`, and `chunker.js`.

---

## Current Flow (error on scanned PDF)

```
parsers.js readFile(file)
  → import('./pdfParser.js')
  → parsePdf(buf, filename)
    → extract text from all pages
    → count empty pages (<20 chars)
    → if >50% empty → return makeError("scanned/image-based PDF...")
    → else → heading detection → section building → return structured
  ← structured result (or error)
  → if structured._errorMessage → return { type: 'text', content: '[error msg]' }
  → else → return { type: 'text', content: structured.markdown, _structured: structured }
```

**Problem:** Scanned PDFs hit `makeError()` at pdfParser.js line 99. The user sees `"[This PDF appears to be scanned/image-based...]"` and the material is unusable.

---

## New Flow (auto-OCR on scanned PDF)

```
parsers.js readFile(file, options)
  → import('./pdfParser.js')
  → parsePdf(buf, filename)
    → extract text from all pages
    → count empty pages, track emptyPageNums[]
    → if >50% empty → return { _needsOcr: true, doc, emptyPageNums, pageTexts, fontSizeChars, numPages }
    → else → normal heading detection → return structured
  ← check _needsOcr flag
  → if _needsOcr:
    → import('./ocrEngine.js')
    → ocrPdfPages(doc, emptyPageNums, { onProgress, languages })
    → merge OCR'd text into pageTexts array
    → import('./pdfParser.js').buildStructured(pageTexts, fontSizeChars, numPages, filename, doc)
    → mark _ocrUsed + _ocrConfidence on structured result
    → return { type: 'text', content: structured.markdown, _structured: structured }
```

### Why split at parsers.js, not inside pdfParser.js?

1. **Progress callbacks** — `readFile` is the layer that connects to `options.onProgress` from StudyContext. pdfParser.js is a pure parser with no UI concerns.
2. **Lazy import isolation** — `ocrEngine.js` imports `tesseract.js` (~15MB WASM). Keeping the `import('./ocrEngine.js')` in parsers.js means pdfParser.js stays lightweight.
3. **Separation of concerns** — pdfParser.js handles text extraction + structure detection. OCR is a separate capability layered on top.

---

## File Changes

### 1. pdfParser.js (~20 lines changed)

#### A. Export `buildStructured` — extract steps 3-7 into a reusable function

Currently lines 105-170 of `parsePdf` (after the scanned PDF check) do:
- Font size analysis → heading detection
- Section building from headings
- Fallback to page-based sections
- Metadata + outline extraction
- Return structured result

Extract this into a new exported function:

```js
export function buildStructured(pageTexts, fontSizeChars, numPages, filename, doc) {
  // ... existing steps 3-7 (font analysis → heading detection → sections → metadata)
  // Returns the same { type: 'structured', name, source_format, markdown, sections, ... }
}
```

#### B. Track empty page numbers + return OCR marker

In the page loop (line 85), track which pages are empty:

```js
const emptyPageNums = [];

// Inside loop:
if (pageText.trim().length < 20) {
  emptyPages++;
  emptyPageNums.push(i); // i is 1-indexed page number
}
```

Replace the `makeError()` return (lines 99-103) with an OCR marker:

```js
if (numPages > 0 && emptyPages / numPages > 0.5) {
  return {
    _needsOcr: true,
    doc,          // pdfjs document — needed by ocrEngine for page rendering
    emptyPageNums,
    pageTexts,    // partially filled — OCR'd text will be merged in
    fontSizeChars,
    numPages,
    filename,
  };
}
```

#### C. Refactor parsePdf to use buildStructured

After the OCR check, call `buildStructured()` for the normal (non-scanned) path:

```js
return buildStructured(pageTexts, fontSizeChars, numPages, filename, doc);
```

#### D. parsePdf signature — unchanged

`parsePdf(buf, filename)` keeps its current signature. No options parameter needed — OCR orchestration happens in parsers.js.

---

### 2. parsers.js — readFile PDF handler (~25 lines changed)

#### A. Add options parameter to readFile

```js
readFile = async (file, options = {}) => {
```

This is backwards-compatible — all existing callers pass no options.

#### B. Replace PDF handler with OCR-aware flow

Current PDF handler (lines ~105-125):
```js
if (ext === 'pdf') {
  try {
    const { parsePdf } = await import('./pdfParser.js');
    const structured = await parsePdf(await file.arrayBuffer(), file.name);
    if (structured._errorMessage) {
      return { type: 'text', name: file.name, content: '[' + structured._errorMessage + ']' };
    }
    // ... return structured
  } catch (e) { ... }
}
```

New PDF handler:
```js
if (ext === 'pdf') {
  try {
    const { parsePdf, buildStructured } = await import('./pdfParser.js');
    const result = await parsePdf(await file.arrayBuffer(), file.name);

    // Check for scanned PDF needing OCR
    if (result._needsOcr) {
      if (options.onProgress) options.onProgress('Loading OCR engine...');
      const { ocrPdfPages } = await import('./ocrEngine.js');

      const ocrResult = await ocrPdfPages(result.doc, result.emptyPageNums, {
        onProgress: (i, total, pageNum) => {
          if (options.onProgress) options.onProgress('OCR processing page ' + pageNum + ' (' + (i + 1) + '/' + total + ')...');
        },
        languages: options.ocrLanguages || ['eng'],
      });

      // Merge OCR'd text into pageTexts
      for (const ocrPage of ocrResult.pages) {
        const idx = result.pageTexts.findIndex(p => p.pageNum === ocrPage.pageNum);
        if (idx !== -1) {
          result.pageTexts[idx].text = ocrPage.text;
          result.pageTexts[idx].items = []; // No font-size items for OCR'd text
        }
      }

      // Re-run heading detection + section building on merged text
      const structured = buildStructured(
        result.pageTexts, result.fontSizeChars, result.numPages, result.filename, result.doc
      );

      // Tag as OCR'd
      structured._ocrUsed = true;
      structured._ocrConfidence = ocrResult.avgConfidence;

      if (!structured.markdown.trim()) {
        return { type: 'text', name: file.name, content: '[OCR completed but no text could be extracted from ' + file.name + '.]' };
      }

      return {
        type: 'text',
        name: file.name,
        content: structured.markdown,
        _structured: structured,
      };
    }

    // Normal path (not scanned)
    if (result._errorMessage) {
      return { type: 'text', name: file.name, content: '[' + result._errorMessage + ']' };
    }

    if (!result.markdown.trim()) {
      return { type: 'text', name: file.name, content: '[Could not extract text from ' + file.name + '. Try copying text manually from a PDF reader.]' };
    }

    return {
      type: 'text',
      name: file.name,
      content: result.markdown,
      _structured: result,
    };
  } catch (e) {
    console.error('PDF parse failed:', e);
    return { type: 'text', name: file.name, content: '[PDF parse failed: ' + e.message + ']' };
  }
}
```

---

### 3. chunker.js — fidelity tagging (~3 lines changed)

#### A. Accept classification option and _ocrUsed flag

The `chunkDocument` function already sets `fidelity: 'full'` (line 44 of chunker.js). When `_ocrUsed` is true on the structured input, set `fidelity: 'low'` instead.

```js
async function chunkDocument(parsed, { materialId, courseId, classification }) {
  // ... existing code ...

  // In chunk object creation (Pass 3):
  const fidelity = parsed._ocrUsed ? 'low' : 'full';

  const chunks = sized.map((sec, i) => ({
    // ... existing fields ...
    fidelity: fidelity,  // was hardcoded 'full'
    // ...
  }));
}
```

The `fidelity` column already exists in the chunks table (confirmed in `Chunks.createBatch` SQL: `ch.fidelity || 'full'`). Valid values: `'full'`, `'text_only'`, `'low'`.

---

## Mixed PDF Handling

Some PDFs have a mix of native text and scanned pages. The current empty-page detection handles this naturally:

1. **Page loop** counts pages with `<20 chars` as empty and tracks their page numbers
2. **Threshold check:** Only triggers OCR if `>50%` of pages are empty
3. **OCR runs only on empty pages** — `emptyPageNums` array passed to `ocrPdfPages`
4. **Native text preserved** — Pages with extracted text keep their text + font-size items
5. **Merged pageTexts** — After OCR, the combined array has native text + OCR'd text
6. **Heading detection** runs on the merged result — native pages provide font-size-based heading detection; OCR pages get text-only section breaks

**Edge case:** If exactly 50% of pages are empty (e.g., 2 of 4), the `> 0.5` threshold means OCR is NOT triggered. This is correct — a 50/50 split likely means alternating content/blank pages, not a scanned PDF.

---

## Progress Display

Progress flows through the `options.onProgress` callback:

```
StudyContext → readFile(file, { onProgress: setStatus }) → parsers.js → ocrPdfPages → callback
```

Timeline for a 50-page scanned PDF:
```
t=0s    "Loading OCR engine..."              ← WASM + training data load
t=3s    "OCR processing page 1 (1/47)..."    ← first page
t=6s    "OCR processing page 2 (2/47)..."    ← ~3s per page
...
t=144s  "OCR processing page 47 (47/47)..."  ← last page
t=145s  (returns structured result)           ← section building is fast
```

### StudyContext Integration

In `createCourse` and `addMats` where `readFile` is called, pass the progress callback:

```js
// Current:
const parsed = await readFile(file);

// New:
const parsed = await readFile(file, {
  onProgress: (msg) => setStatus(msg),
  ocrLanguages: ['eng'], // future: from settings
});
```

This requires finding all `readFile` call sites in StudyContext.jsx and adding the options parameter.

---

## Data Flow Diagram

```
┌──────────────────┐     ┌─────────────┐     ┌───────────────┐
│  StudyContext.jsx │     │  parsers.js │     │  pdfParser.js │
│                  │     │  readFile() │     │  parsePdf()   │
│  readFile(file,  ├────►│             ├────►│               │
│   {onProgress})  │     │             │     │  extract text  │
│                  │     │             │     │  count empty   │
│                  │     │             │◄────┤  _needsOcr?   │
│                  │     │             │     └───────────────┘
│                  │     │  if _needsOcr:                     │
│                  │     │  ┌─────────────────┐               │
│  setStatus(msg) ◄├─────┤  │  ocrEngine.js   │               │
│                  │     │  │  ocrPdfPages()  │               │
│                  │     │  │  (tesseract.js) │               │
│                  │     │  └────────┬────────┘               │
│                  │     │           │ OCR'd text              │
│                  │     │  merge into pageTexts               │
│                  │     │  ┌─────────────────┐               │
│                  │     │  │  pdfParser.js   │               │
│                  │     │  │  buildStructured│               │
│                  │     │  └────────┬────────┘               │
│                  │     │           │ structured result       │
│                  │     │  tag _ocrUsed, _ocrConfidence       │
│                  │◄────┤  return result                      │
│                  │     └─────────────────────────────────────┘
│                  │
│  storeAsChunks() ├────► chunker.js
│                  │       fidelity: parsed._ocrUsed ? 'low' : 'full'
└──────────────────┘
```

---

## readFile Call Sites in StudyContext.jsx

These are the locations where `readFile` is called and need the `options` parameter added:

1. **`createCourse`** — when processing uploaded files during course creation
2. **`addMats`** — when adding materials to an existing course
3. **`confirmFolderImport`** — when importing files from a folder

Each site should pass `{ onProgress: (msg) => setStatus(msg) }`.

---

## Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/pdfParser.js` | Track `emptyPageNums`, return `_needsOcr` marker, extract `buildStructured()` | ~20 |
| `src/lib/parsers.js` | Add `options` param to `readFile`, OCR-aware PDF handler | ~25 |
| `src/lib/chunker.js` | Read `parsed._ocrUsed` → set `fidelity: 'low'` | ~3 |
| `src/StudyContext.jsx` | Pass `onProgress` to `readFile` calls | ~6 |

**Total: ~54 lines**

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `doc` object passed through `_needsOcr` return may be garbage collected | pdfjs-dist documents are reference-counted; keeping a reference prevents GC |
| `buildStructured` needs access to `doc` for metadata/outline | Pass `doc` as parameter — already extracted metadata in current code |
| OCR failure mid-document | `ocrPdfPages` has `finally` cleanup. parsers.js catch block handles errors gracefully |
| Progress callback causes React re-renders | `setStatus` is already debounce-safe — used throughout extraction pipeline |
| `readFile` options break existing callers | Default `options = {}` — fully backwards compatible |

---

## Verification Plan

1. `npm run build` — clean build
2. Upload a scanned PDF → OCR triggers automatically, progress shown
3. Upload a native text PDF → normal parsing, no OCR
4. Upload a mixed PDF (some scanned, some text) → OCR runs on empty pages only
5. Upload a scanned PDF → chunks created with `fidelity: 'low'`
6. Upload a native PDF → chunks created with `fidelity: 'full'`
7. Cancel during OCR → cleanup runs, no memory leak
