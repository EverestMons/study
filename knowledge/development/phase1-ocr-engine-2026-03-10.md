# Development Log: Phase 1 — OCR Engine Setup
**Date:** 2026-03-10
**Developer:** Study Developer

---

## What Was Done

### 1. Installed tesseract.js v7

```
npm install tesseract.js@7
```

- Installed: `tesseract.js@7.0.0`
- Added 13 packages (WASM runtime, worker scripts, training data loader)
- No peer dependency conflicts

### 2. Created `src/lib/ocrEngine.js` (~130 lines)

New module providing OCR capability for scanned PDFs.

#### Exports

| Function | Purpose |
|----------|---------|
| `ocrPdfPages(doc, pageNumbers, options)` | Main entry point — renders PDF pages to canvas, runs OCR, returns per-page text + confidence |
| `terminateOcr()` | Cleanup worker and free WASM memory |

#### Internal Functions

| Function | Purpose |
|----------|---------|
| `initOcrWorker(langs)` | Lazy-init tesseract.js worker via v7 `createWorker(langs)` API. Reuses if languages match. Main-thread fallback if Worker creation fails. |
| `ocrPage(canvas)` | OCR a single canvas, returns `{ text, confidence }` |
| `renderPageToCanvas(doc, pageNum)` | Renders a PDF page at 2x scale via pdfjs-dist. Uses OffscreenCanvas where available, falls back to HTMLCanvasElement. |
| `freeCanvas(canvas)` | Releases pixel buffer by setting dimensions to 0 |

#### Design Patterns

- **Single worker reuse**: One `createWorker` call per document, reused across all pages. Avoids re-downloading ~15MB training data per page.
- **Lazy import**: `await import('tesseract.js')` inside `initOcrWorker` — no load cost until first OCR request.
- **Canvas cleanup per page**: `freeCanvas()` after each page prevents 60MB/page memory accumulation.
- **Worker termination in `finally`**: `ocrPdfPages` always terminates the worker after completion (or on error) to free ~100-200MB WASM memory.
- **Main-thread fallback**: If Web Worker creation fails in Tauri WebView, tries `{ workerBlobURL: false }`.
- **OffscreenCanvas preference**: Uses `OffscreenCanvas` when available (better for workers/memory), falls back to `document.createElement('canvas')`.
- **v7 unified API**: `createWorker('eng')` handles language loading + initialization in a single call. No separate `loadLanguage`/`initialize` steps.
- **tessdata_fast**: v7 defaults to fast training data from CDN — correct choice for printed academic text.

#### Usage (called from parsePdf in Phase 2)

```js
const { ocrPdfPages } = await import('./ocrEngine.js');
const result = await ocrPdfPages(doc, emptyPageNums, {
  onProgress: (i, total, pageNum) => setStatus(`OCR: page ${pageNum} (${i+1}/${total})...`),
  languages: ['eng'],
});
// result.pages = [{ pageNum, text, confidence }, ...]
// result.avgConfidence = number (0-100)
```

---

## Files

| File | Action | Lines |
|------|--------|-------|
| `src/lib/ocrEngine.js` | Created | 130 |
| `package.json` | Modified (new dependency) | +1 |
| `package-lock.json` | Modified (lock file) | auto |

## Build

`npm run build` — PASS. `ocrEngine.js` is not yet imported by any module (lazy-loaded in Phase 2), so it doesn't appear in the bundle yet. This is by design — tree-shaking excludes unreferenced modules.

## Next: Phase 2

Wire `ocrPdfPages` into `parsePdf()` — replace the `makeError()` return for scanned PDFs with OCR processing, merge OCR'd text into the normal section-building flow, add progress callbacks.
