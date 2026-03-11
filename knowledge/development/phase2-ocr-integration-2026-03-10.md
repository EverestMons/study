# Development Log: Phase 2 — PDF OCR Integration + Progress UI
**Date:** 2026-03-10
**Developer:** Study Developer

---

## What Was Done

### Step 2.2 — Modify PDF Parser for OCR

#### pdfParser.js (~45 lines changed)

1. **Track empty page numbers** — Added `emptyPageNums[]` array. In the page loop, pages with `<20 chars` push their 1-indexed page number to the array.

2. **`_needsOcr` marker** — Replaced `makeError()` for scanned PDFs with a data object:
   ```js
   return {
     _needsOcr: true,
     doc,            // pdfjs document — needed by ocrEngine for page rendering
     emptyPageNums,  // which pages to OCR
     pageTexts,      // partially filled — OCR text merged in later
     fontSizeChars,  // for heading detection after merge
     numPages,
     filename,
   };
   ```

3. **Extracted `buildStructured()`** — Steps 3-7 of `parsePdf` (font analysis → heading detection → sections → metadata → return) moved to a new exported async function. `parsePdf` now calls `buildStructured()` for the normal (non-scanned) path.

4. **Exports:** `parsePdf` (unchanged signature), `buildStructured` (new).

#### parsers.js (~25 lines changed)

1. **`readFile` accepts `options = {}`** — Backwards-compatible second parameter.

2. **OCR-aware PDF handler** — After `parsePdf()` returns, checks for `_needsOcr`:
   - Lazy-imports `ocrEngine.js`
   - Calls `ocrPdfPages(result.doc, result.emptyPageNums, { onProgress, languages })`
   - Progress callback: `'OCR processing page X (N/M)...'`
   - Merges OCR'd text into `result.pageTexts` (replaces empty page text, clears items)
   - Calls `buildStructured()` on merged data
   - Tags `structured._ocrUsed = true` and `structured._ocrConfidence`
   - Returns normal `{ type: 'text', content, _structured }` — callers see no difference

3. **Error handling:** If OCR completes but no text extracted, returns descriptive error message.

### Step 2.3 — Progress + Fidelity Tagging

#### StudyContext.jsx (~3 lines changed)

All three `readFile` call sites updated to pass progress callback:

| Location | Handler | Change |
|----------|---------|--------|
| Line 341 | `onDrop` | `fl.map(readFile)` → `fl.map(f => readFile(f, { onProgress: msg => setStatus(msg) }))` |
| Line 355 | `onSelect` | Same pattern |
| Line 396 | `confirmFolderImport` | `browserFiles.map(readFile)` → same pattern |

Progress messages from OCR appear in the existing status area used for extraction progress.

#### chunker.js (~1 line changed)

Fidelity tagging: `fidelity: 'full'` → `fidelity: parsed._ocrUsed ? 'low' : 'full'`

When `_structured._ocrUsed` is true on the parsed output, all chunks from that material are tagged with `fidelity: 'low'` in the database. The `fidelity` column already exists in the chunks table with valid values: `'full'`, `'text_only'`, `'low'`.

---

## Data Flow

```
User uploads scanned PDF
  → StudyContext: onDrop/onSelect/confirmFolderImport
    → readFile(file, { onProgress: msg => setStatus(msg) })
      → parsePdf(buf, filename)
        → extract text, detect >50% empty pages
        → return { _needsOcr: true, doc, emptyPageNums, pageTexts, ... }
      → readFile detects _needsOcr
        → import('./ocrEngine.js')
        → ocrPdfPages(doc, emptyPageNums, { onProgress, languages })
          → status: "OCR processing page 3 (1/47)..."
          → tesseract.js WASM worker processes each page
          → returns { pages: [{pageNum, text, confidence}], avgConfidence }
        → merge OCR text into pageTexts
        → buildStructured(pageTexts, fontSizeChars, numPages, filename, doc)
          → heading detection + section building on merged text
          → returns structured output with _ocrUsed + _ocrConfidence
      → return { type: 'text', content: markdown, _structured: structured }
  → storeAsChunks(courseId, file)
    → chunkDocument(file._structured, ...)
      → fidelity: parsed._ocrUsed ? 'low' : 'full'
    → Chunks.createBatch(chunks) → DB with fidelity='low'
  → normal extraction pipeline continues
```

---

## Files Changed

| File | Action | ~Lines |
|------|--------|--------|
| `src/lib/pdfParser.js` | `emptyPageNums` tracking, `_needsOcr` marker, `buildStructured()` export | 45 |
| `src/lib/parsers.js` | `options` param, OCR-aware PDF handler with auto-OCR | 25 |
| `src/StudyContext.jsx` | Pass `onProgress` to `readFile` at 3 call sites | 3 |
| `src/lib/chunker.js` | Fidelity tagging from `_ocrUsed` flag | 1 |

**Total: ~74 lines across 4 files**

---

## Build

`npm run build` — PASS. Bundle structure:
- `ocrEngine-*.js` (1.71 kB) — separate chunk, lazy-loaded only when scanned PDF detected
- `pdfParser-*.js` (5.10 kB) — separate chunk, lazy-loaded on first PDF upload
- No new warnings

---

## Design Decisions

1. **Auto-OCR in parsers.js, not StudyContext** — OCR orchestration happens transparently inside `readFile()`. Callers don't need to know about `_needsOcr` — they get the same return shape whether the PDF was native or scanned. This keeps StudyContext simple (no OCR state management).

2. **`buildStructured` as reusable export** — Extracted from `parsePdf` so it can be called after OCR text merging. Avoids re-parsing the PDF from scratch.

3. **Mixed PDF handling** — OCR only runs on empty pages. Native text pages keep their extracted text + font-size items. Heading detection runs on the merged result, so native pages contribute font-size-based heading detection.

4. **Fidelity tagging in chunker** — Single point of truth. Reads `parsed._ocrUsed` flag, sets `fidelity: 'low'` on all chunks. The DB column already supports this value.

5. **Progress via options callback** — `readFile(file, { onProgress })` threads through to `ocrPdfPages`. Status messages appear in the same area used for extraction progress. No new UI components needed.

---

## Phase 2 Checkpoint

| Criterion | Status |
|-----------|--------|
| `parsePdf` returns `_needsOcr` for scanned PDFs | DONE |
| `buildStructured` exported for post-OCR use | DONE |
| `readFile` auto-triggers OCR with progress | DONE |
| OCR text merged into pageTexts | DONE |
| Heading detection runs on merged text | DONE |
| Fidelity tagged as 'low' for OCR'd content | DONE |
| Progress shown: "OCR processing page X (N/M)..." | DONE |
| Build passes | DONE |

**Phase 2 COMPLETE — scanned PDFs now auto-OCR instead of returning an error.**
