# PDF OCR Support — Orchestrator Plan

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Standard feature development. New npm dependency required.

---

## CEO Decisions (Resolved)

1. **OCR library:** tesseract.js **v7** — released December 2025, 15-35% faster than v6 via new `relaxedsimd` WASM build. Well maintained, WebWorker-based.
2. **Language support:** Multi-language from the start. tesseract.js supports 100+ languages via per-language training data files (~2-15MB each, loaded from CDN on demand).
3. **Trigger:** Auto-OCR without asking. When a scanned PDF is detected, OCR starts immediately with a progress indicator. No user prompt — just do it.

---

## Research Findings

### Why tesseract.js v7, not v6 or Scribe.js

**tesseract.js v7 (December 2025)** uses a new `relaxedsimd` WASM build that reduces runtimes 15-35% over v6, with the highest gains on modern Intel processors. The API is nearly identical to v6 — main breaking change is dropping Node.js v14 (irrelevant for Tauri). Memory leak fixes from v6 carry forward.

**Scribe.js** was considered — it builds on tesseract.js with a custom OCR model (better accuracy) and native PDF support. However:
- Scribe.js's PDF text extraction is redundant — the app already handles text-native PDFs via pdfjs-dist
- Scribe.js is larger and slower for pure image OCR (our only use case)
- Same-origin requirement complicates packaging
- tesseract.js v7 is simpler and lighter for the "OCR only when needed" pattern

### Performance Expectations

**Per-page OCR time (browser WASM, v7):**
- Typical scanned textbook page at 2x scale: **1.5-4 seconds** (v7 improvement over v6's 2-5s range)
- Complex pages (diagrams, multi-column, poor scan quality): 4-8 seconds
- Simple pages (clean typed text): 1-2 seconds

**Document-level estimates (v7):**
- 10-page scanned chapter: ~20-40 seconds
- 50-page scanned PDF: ~2-3 minutes
- 100-page scanned textbook: ~4-6 minutes

**Memory:**
- Each Tesseract worker uses ~100-200MB RAM
- Single worker reused across all pages (never one-per-page)
- Peak memory for a 50-page document: ~300-500MB (canvas rendering + WASM)
- Worker terminates after OCR complete, memory freed

**First-time setup overhead:**
- WASM core download: ~5MB
- English training data: ~2MB (from CDN, cached after first download)
- Worker initialization: 2-5 seconds on first run
- Subsequent runs: <1 second (WASM + training data cached)

### Tauri WebView Compatibility Assessment

**Risk level: LOW for macOS.** Evidence:
- Tauri uses WKWebView (WebKit) on macOS. Web Workers + WASM are supported in Safari 16.4+ (macOS Ventura and newer)
- The app already runs pdfjs-dist WASM successfully in the same WebView — this is a strong compatibility indicator
- Known WebKit quirks exist (the app already works around one: `streamTextContent` instead of `for await...of ReadableStream` in pdfParser.js)
- WASM stability issues reported in Tauri discussions are specific to **Linux webkitgtk**, not macOS WebKit
- tesseract.js v7's `relaxedsimd` build requires WASM Relaxed SIMD support — available in Safari 16.4+ (macOS 13+)

**Fallback if Web Worker fails:** tesseract.js can run on the main thread without a Web Worker. Slower and blocks UI, but functional. The `ocrEngine.js` module should detect worker availability and fall back gracefully.

### Critical Implementation Patterns (from tesseract.js performance docs)

1. **ONE worker, reuse across all pages** — creating a worker per page wastes 2-5s of init time each and risks memory exhaustion
2. **Use `tessdata_fast` training data** — not `tessdata_best`. The accuracy difference is minimal for printed text, but `fast` is significantly quicker
3. **v7 simplified API** — `const worker = await createWorker('eng')` handles language loading and initialization in one call. No separate `loadLanguage`/`initialize` steps
4. **Render pages at 2x scale** — gives ~300 DPI equivalent, the sweet spot between accuracy and memory. Higher scales have diminishing returns
5. **Only request text output** — v6+ disables non-text outputs by default. Don't re-enable hocr/blocks unless needed (saves 0.25-0.5s per page)
6. **Periodically refresh workers for long sessions** — Tesseract workers "learn" over time, which can degrade accuracy for heterogeneous documents. For a single PDF, one worker is fine. If OCR'ing multiple PDFs in sequence, consider creating a fresh worker per document
7. **OffscreenCanvas where available** — use for page rendering to keep main thread responsive. Falls back to regular canvas if not supported

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

3 phases:
- **Phase 1:** OCR engine setup + PDF page rendering
- **Phase 2:** Integration with PDF parser + progress UI
- **Phase 3:** Quality handling — confidence thresholds, mixed PDFs, fallbacks

---

## Context for All Agents

### Current PDF Parser Behavior

**File:** `src/lib/pdfParser.js` (~350 lines)

Flow: `parsePdf(arrayBuffer, filename)` → pdfjs-dist loads document → extracts text items per page → font size analysis → heading detection → section building → structured output.

**Scanned PDF detection (line ~97):**
```javascript
if (numPages > 0 && emptyPages / numPages > 0.5) {
    return makeError(filename,
      'This PDF appears to be scanned/image-based — most pages have no extractable text. ' +
      'Try running it through an OCR tool first, then re-upload.');
}
```

This is where OCR would hook in — instead of returning an error, render pages to images and run OCR.

### pdfjs-dist Page Rendering

pdfjs-dist (already installed, v5.5.207) supports rendering pages to canvas:
```javascript
const page = await doc.getPage(pageNum);
const viewport = page.getViewport({ scale: 2.0 }); // 2x for OCR quality
const canvas = document.createElement('canvas');
canvas.width = viewport.width;
canvas.height = viewport.height;
const ctx = canvas.getContext('2d');
await page.render({ canvasContext: ctx, viewport }).promise;
// canvas now has the page as a raster image
```

This is the bridge between the PDF and the OCR engine — no new image loading library needed.

### Chunk Fidelity

The schema already has `fidelity` column on chunks: `'full' | 'text_only' | 'low'`. OCR'd content should be marked as `fidelity: 'low'` (scanned/OCR) so downstream consumers know the text quality may be lower.

---

## Phase 1 — OCR Engine Setup + Page Rendering

### Step 1.1 · SA · OCR Architecture Blueprint

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/pdf-ocr-YYYY-MM-DD.md`

Design the OCR integration:

**Dependency:**
- `tesseract.js` v7 — install via `npm install tesseract.js@7`
- Training data loaded from CDN (`tessdata_fast` variant for speed) on first use, cached after download
- **Tauri WebView compatibility:** Assessed as LOW risk (see Research Findings). pdfjs-dist WASM already works. Safari 16.4+ supports Web Workers + WASM + Relaxed SIMD. Include main-thread fallback in case Web Worker creation fails.

**Training data strategy:**
- Load from CDN (`https://tessdata.projectnaptha.com/`) on first use per language, cached after download
- Default language: English (`eng`)
- User can select additional languages in Settings (adds ~2-15MB per language)
- Common academic languages to support: English, Spanish, French, German, Chinese (simplified), Japanese, Korean, Arabic, Portuguese, Italian
- Store selected languages in settings table; load all selected language models on OCR init

**Page rendering pipeline:**
```
For each empty page in the PDF:
  1. page.getViewport({ scale: 2.0 })  // 2x resolution for OCR quality
  2. page.render() → canvas
  3. canvas.toBlob() or canvas context → ImageData
  4. tesseract.recognize(imageData) → text
  5. Combine OCR'd text with any native text from non-empty pages
```

**Scale factor:** 2.0x is standard for OCR (gives ~300 DPI equivalent for a typical PDF). Higher than 2.0 has diminishing accuracy returns but significantly increases memory usage and processing time.

**Worker management (critical for performance):**
- Create a SINGLE Tesseract worker, reuse across ALL pages of a document — never one-per-page
- v7 API: `const worker = await createWorker('eng')` handles language loading + init in one call
- Initialize lazily on first OCR request (not on app startup)
- Use `tessdata_fast` training data (not `tessdata_best`) — minimal accuracy difference for printed text, significantly faster
- Only request text output (v7 default) — don't enable hocr/blocks (saves 0.25-0.5s per page)
- Terminate worker after OCR complete to free ~100-200MB RAM
- If OCR'ing multiple PDFs in sequence, create a fresh worker per document (prevents "learning" degradation)

**Integration point:**
- New function: `ocrPdfPages(doc, emptyPageNums, options)` in a new file `src/lib/ocrEngine.js`
- Called from `parsePdf()` when scanned PDF detected, after user confirmation
- Returns array of `{ pageNum, text, confidence }` — merged into the main text flow

**Handoff → DEV**

### Step 1.2 · DEV · Install tesseract.js v7 + Create OCR Engine Module

**Agent:** Study Developer

**Install:** `npm install tesseract.js@7`

**Create:** `src/lib/ocrEngine.js`

Implement:
- `initOcrWorker(langs)` — lazy init via `createWorker(langs)` (v7 unified API, no separate loadLanguage/initialize). Detect Web Worker availability; fall back to main-thread if Worker creation fails in WebView.
- `ocrPage(canvas)` — OCR a single canvas via `worker.recognize(canvas)`, returns `{ text, confidence }`. Only text output (default in v7).
- `ocrPdfPages(pdfDoc, pageNumbers, { onProgress })` — renders pages to canvas at 2x scale via pdfjs `page.render()`, OCR's each sequentially with the same worker, returns combined results with per-page confidence.
- `terminateOcr()` — cleanup worker, free ~100-200MB RAM.

**Key implementation patterns:**
- ONE worker for all pages of a document — never one-per-page
- Use `OffscreenCanvas` where available (better for Web Workers), fall back to regular canvas
- Render at `scale: 2.0` (300 DPI equivalent) — sweet spot for accuracy vs memory
- Training data: `tessdata_fast` variant from CDN, cached after first download
- v7 uses `relaxedsimd` WASM build automatically when browser supports it (Safari 16.4+)

**Lines created:** ~130
**Files created:** 1 (`src/lib/ocrEngine.js`)

**Output:** `knowledge/development/phase1-ocr-engine-YYYY-MM-DD.md`

### Step 1.3 · QA · OCR Engine Verification

**Agent:** Study Security & Testing Analyst

Test:
- tesseract.js v7 loads and initializes in Tauri WebView (WebKit on macOS)
- `relaxedsimd` WASM build activates (check console for SIMD detection)
- Web Worker creation succeeds (no CSP or sandbox issues). If fails, verify main-thread fallback activates.
- Training data downloads from CDN (`tessdata_fast` variant)
- Training data cached after first download (second init is fast)
- Simple image OCR produces readable text with >80% confidence on clean typed text
- Worker reuse: OCR 3 pages sequentially with same worker — no init overhead between pages
- Worker terminates cleanly, memory freed (verify via dev tools)
- Performance: measure per-page time on a typical scanned textbook page — expect 1.5-4 seconds
- Memory: OCR'ing a 10-page document doesn't exceed 500MB peak
- Build passes with tesseract.js v7 bundled (Vite handles WASM correctly)

**Output:** `knowledge/qa/ocr-engine-testing-YYYY-MM-DD.md`

### Phase 1 Checkpoint

- [ ] tesseract.js installed
- [ ] ocrEngine.js created with lazy init + page rendering + OCR
- [ ] Verified working in Tauri WebView
- [ ] Build passes

---

## Phase 2 — PDF Parser Integration + Progress UI

### Step 2.1 · SA · Parser Integration Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/pdf-ocr-integration-YYYY-MM-DD.md`

Design how OCR integrates with the existing PDF parser flow:

**Modified parsePdf() flow:**
1. Load PDF, extract text from all pages (existing)
2. Count empty pages (existing)
3. If >50% empty: instead of returning error, return a special result: `{ _needsOcr: true, emptyPageNums: [...], doc, ... }`
4. The caller (parsers.js `readFile()`) checks for `_needsOcr` and either:
   - Auto-triggers OCR, or
   - Returns a marker that StudyContext can use to prompt the user

**Auto-OCR flow:**
- After file parsing, if `_needsOcr` is true, automatically trigger `ocrPdfPages()` with progress callback
- No user prompt — OCR starts immediately
- Progress shown in the same status area as extraction: "OCR processing page 3/47..."
- User can cancel via the existing extraction cancel mechanism if needed

**Progress display:**
- During OCR: "OCR processing page 3/47..." with a progress bar
- Show in the same status area used for extraction progress
- OCR is typically 2-5 seconds per page, so a 50-page scanned PDF = 2-4 minutes

**After OCR completes:**
- Merge OCR'd text into page text array
- Re-run heading detection + section building on the combined text
- Mark sections as `fidelity: 'low'` in chunk metadata
- Continue with normal chunking + extraction pipeline

**Mixed PDFs:** Some PDFs have a mix of native text pages and scanned pages. The current empty-page detection handles this — only pages with <20 chars of text are counted as empty. OCR only runs on the empty pages, native text pages keep their extracted text.

**Handoff → DEV**

### Step 2.2 · DEV · Modify PDF Parser for OCR

**Agent:** Study Developer
**Files:** `src/lib/pdfParser.js`, `src/lib/parsers.js`

**pdfParser.js changes:**
- Replace the scanned-PDF error return with a `_needsOcr` marker
- Add `parsePdfWithOcr(buf, filename, ocrResults)` — takes pre-computed OCR text per page, merges with native text, runs heading detection + section building
- Or: modify `parsePdf()` to accept an optional `ocrTexts` map and merge internally

**parsers.js changes:**
- In `readFile()` PDF handler: check for `_needsOcr` in result
- If present, return the result with the marker so the caller can prompt the user

**Lines changed:** ~40-50 in pdfParser.js, ~15 in parsers.js

### Step 2.3 · DEV · OCR Prompt + Progress in StudyContext

**Agent:** Study Developer
**Files:** `src/StudyContext.jsx`, potentially `src/screens/MaterialsScreen.jsx`

Wire the OCR prompt into the upload flow:
- After `readFile()` returns a `_needsOcr` result, show a prompt (similar to the near-dedup prompt)
- On "Run OCR": call `ocrPdfPages()` with the stored PDF doc and empty page numbers
- Pass progress callback to update status: "OCR page X/Y..."
- After OCR: call `parsePdfWithOcr()` with the OCR results to get the final structured output
- Feed the result back into the normal file staging → classification → extraction pipeline

**Lines changed:** ~50-60

**Output:** `knowledge/development/phase2-ocr-integration-YYYY-MM-DD.md`

### Step 2.4 · QA · End-to-End OCR Testing

**Agent:** Study Security & Testing Analyst

Test:
- Upload a scanned PDF → OCR prompt appears
- "Run OCR" → progress shows per page → text extracted → sections built → chunks created
- "Skip" → material marked with error message (current behavior preserved)
- Mixed PDF (some text, some scanned) → OCR only on empty pages, native text preserved
- OCR'd chunks have `fidelity: 'low'` in metadata
- Extracted text is reasonable quality for a typical scanned textbook page
- MinHash fingerprinting works on OCR'd chunks
- Skill extraction runs on OCR'd content
- Progress bar accurate (page count matches)
- Cancel during OCR: clean shutdown, no orphaned workers
- Large PDF (50+ pages): completes without crash, memory stays reasonable

**Output:** `knowledge/qa/pdf-ocr-integration-testing-YYYY-MM-DD.md`

### Phase 2 Checkpoint

- [ ] Scanned PDFs trigger OCR prompt instead of error
- [ ] OCR runs with page-by-page progress
- [ ] Text merged correctly with native text (mixed PDFs)
- [ ] Chunks marked low-fidelity
- [ ] Full pipeline works: upload → OCR → chunk → extract → skills
- [ ] Build verified

---

## Phase 3 — Quality Handling

### Step 3.1 · DEV · Confidence Thresholds + Warnings

**Agent:** Study Developer
**Files:** `src/lib/ocrEngine.js`, `src/lib/pdfParser.js`

Add quality handling:
- Tesseract returns a confidence score per page (0-100). Average across pages.
- If average confidence < 50: warn user "OCR quality is low — text may be inaccurate. Consider using a higher-quality scan."
- If a specific page has confidence < 30: mark that page's text as `[Low confidence OCR — text may be inaccurate]` prefix
- Store per-chunk OCR confidence in `structural_metadata` JSON

**Lines changed:** ~25

### Step 3.2 · DEV · Low-Fidelity Indicator in MaterialsScreen

**Agent:** Study Developer
**Files:** `src/screens/MaterialsScreen.jsx`

When a material has OCR'd chunks, show an indicator on the material card:
- Small badge: "OCR" or "Scanned" next to the type icon
- If low confidence: amber warning on the card

**Lines changed:** ~15

### Step 3.3 · QA · Quality Testing

**Agent:** Study Security & Testing Analyst

Test:
- High-quality scan → confidence >80, no warnings
- Low-quality scan (photo of textbook, poor lighting) → confidence <50, warning shown
- Per-page confidence stored in chunk metadata
- OCR badge appears on material card
- Extraction handles low-confidence text gracefully (may produce fewer skills, but doesn't crash)

**Output:** `knowledge/qa/pdf-ocr-quality-testing-YYYY-MM-DD.md`

### Phase 3 Checkpoint

- [ ] Confidence thresholds work
- [ ] Warnings surface for low-quality scans
- [ ] OCR badge on material cards
- [ ] Build verified

---

## Phase 4 — Multi-Language Support

### Step 4.1 · DEV · Language Selection in Settings

**Agent:** Study Developer
**Files:** `src/components/SettingsModal.jsx`, `src/lib/ocrEngine.js`

Add an "OCR Languages" section to SettingsModal:
- List of available languages with checkboxes (English enabled by default, cannot be disabled)
- Common academic languages: English, Spanish, French, German, Chinese (Simplified), Japanese, Korean, Arabic, Portuguese, Italian
- Selected languages stored in settings table as JSON array: `ocr_languages` key
- When OCR runs, load all selected language models: `worker.loadLanguage('eng+spa+fra')` (tesseract.js supports multi-language strings)
- First-time download indicator: "Downloading Spanish language data (4.2MB)..."

**Tauri HTTP capability update:** tesseract.js loads training data from `https://tessdata.projectnaptha.com/`. Update `src-tauri/capabilities/default.json` to allow this domain:
```json
{
  "identifier": "http:default",
  "allow": [
    { "url": "https://api.anthropic.com/**" },
    { "url": "https://tessdata.projectnaptha.com/**" }
  ]
}
```

**Lines changed:** ~50 in SettingsModal, ~15 in ocrEngine.js, config update

### Step 4.2 · QA · Multi-Language Testing

**Agent:** Study Security & Testing Analyst

Test:
- Language selection persists in settings
- English cannot be deselected
- Adding a language triggers download on next OCR run
- Multi-language OCR works (e.g., PDF with mixed English/Spanish text)
- Training data cached after first download (second OCR run doesn't re-download)
- HTTP capability allows tessdata CDN access

**Output:** `knowledge/qa/pdf-ocr-multilang-testing-YYYY-MM-DD.md`

### Phase 4 Checkpoint

- [ ] Language selection in Settings
- [ ] Multi-language OCR works
- [ ] Training data caching works
- [ ] HTTP capability updated
- [ ] Build verified

---

## Final PM Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "OCR support" from "Specified But Not Built" to "What Is Working"
- Note new dependency: `tesseract.js` v6
- Note: currently English only, CDN-loaded training data

---

## Estimated Scope

| Phase | Steps | New Files | Lines Changed | Risk |
|---|---|---|---|---|
| 1 (Engine) | 1.1–1.3 | 1 (ocrEngine.js) | ~120 | Medium (WebView compat) |
| 2 (Integration) | 2.1–2.4 | 0 | ~110 | Medium (mixed PDFs) |
| 3 (Quality) | 3.1–3.3 | 0 | ~40 | Low |
| 4 (Multi-lang) | 4.1–4.2 | 0 | ~65 + config | Low |

**Total:** ~345 lines, 1 new file, 1 new npm dependency (tesseract.js v7). HTTP capability update for tessdata CDN.

---

## Knowledge Artifacts Produced

| Phase | Agent | Artifact | Location |
|---|---|---|---|
| 1 | SA | OCR architecture | `knowledge/architecture/pdf-ocr-YYYY-MM-DD.md` |
| 1 | DEV | OCR engine dev log | `knowledge/development/phase1-ocr-engine-YYYY-MM-DD.md` |
| 1 | QA | Engine test report | `knowledge/qa/ocr-engine-testing-YYYY-MM-DD.md` |
| 2 | SA | Integration architecture | `knowledge/architecture/pdf-ocr-integration-YYYY-MM-DD.md` |
| 2 | DEV | Integration dev log | `knowledge/development/phase2-ocr-integration-YYYY-MM-DD.md` |
| 2 | QA | E2E test report | `knowledge/qa/pdf-ocr-integration-testing-YYYY-MM-DD.md` |
| 3 | QA | Quality test report | `knowledge/qa/pdf-ocr-quality-testing-YYYY-MM-DD.md` |
| 4 | QA | Multi-lang test report | `knowledge/qa/pdf-ocr-multilang-testing-YYYY-MM-DD.md` |

---

## Agent Involvement

| Phase | SA | DEV | QA | PM |
|---|---|---|---|---|
| 1 — Engine | Blueprint | Install + ocrEngine.js | WebView compat | — |
| 2 — Integration | Integration blueprint | Parser + UI wiring | E2E pipeline | — |
| 3 — Quality | — | Confidence + badges | Quality thresholds | — |
| 4 — Multi-lang | — | Settings UI + engine config | Language + caching | — |
| Final | — | — | — | Status update |

---

## All CEO Decisions Resolved

No outstanding decisions. Ready for execution.

**Key dependency:** `npm install tesseract.js@7` — v7 specifically, not v6.
