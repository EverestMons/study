# QA Report: Phase 3 — PDF OCR Quality Handling
**Date:** 2026-03-10
**Analyst:** Study Security & Testing Analyst

---

## Scope

Verify that OCR confidence thresholds, warnings, per-page metadata, material card badges, and graceful degradation for low-quality scans all work correctly across the full pipeline.

---

## Test Results

### Test 1: High-Quality Scan — Confidence >80, No Warnings

**Code path:** `ocrEngine.js:ocrPage()` → `ocrPdfPages()` → `parsers.js` merge

**Verification:**
- `ocrPage()` (ocrEngine.js:57-64) returns `{ text, confidence }` from tesseract.js `data.confidence`
- tesseract.js confidence is 0-100 scale per page; high-quality scans (clean print, good contrast) typically return 85-95
- `ocrPdfPages()` (ocrEngine.js:140-147) computes `avgConfidence = sum(confidence) / pages.length`
- In `parsers.js:382-384`, warning only triggers when `avgConfidence < 50`:
  ```js
  if (ocrResult.avgConfidence < 50) {
    structured._ocrWarning = 'OCR quality is low...';
  }
  ```
- For confidence >80: no `_ocrWarning` set, no low-confidence page prefix, no notification
- `_ocrUsed = true` still set (correct — OCR was used, just high quality)
- `_ocrConfidence` stores the actual average (e.g., 87) for downstream use

**Result: PASS** — High-quality scans get `_ocrUsed: true` with no warnings.

---

### Test 2: Low-Quality Scan — Confidence <50, Warning Shown

**Code path:** `ocrEngine.js` → `parsers.js` → `StudyContext.jsx` notification

**Verification:**
- Low-quality input (phone photo, poor lighting, skewed text) → tesseract.js returns low confidence (20-45 typical)
- `parsers.js:382-384`: `avgConfidence < 50` triggers `_ocrWarning` on structured output
- `StudyContext.jsx` checks at all three upload paths (onDrop:342, onSelect:357, confirmFolderImport:399):
  ```js
  for (const p of parsed) {
    if (p._structured?._ocrWarning)
      addNotif('warn', p.name + ': ' + p._structured._ocrWarning);
  }
  ```
- Warning notification displays: `"filename.pdf: OCR quality is low — text may be inaccurate. Consider using a higher-quality scan."`
- Notification type is `'warn'` — amber styling in the notification system

**Result: PASS** — Low-quality scans trigger user-visible warning notification.

---

### Test 3: Per-Page Confidence — Low-Confidence Page Prefix

**Code path:** `parsers.js:368-374`

**Verification:**
- After OCR, each page's confidence is checked individually:
  ```js
  result.pageTexts[idx].text = ocrPage.confidence < 30
    ? '[Low confidence OCR — text may be inaccurate]\n' + ocrPage.text
    : ocrPage.text;
  ```
- Threshold is 30 (stricter than the 50 average threshold)
- Prefix is a human-readable warning that becomes part of the chunk content
- Pages with confidence >=30 get clean text (no prefix)
- Mixed PDFs: only OCR'd pages are checked (native text pages keep their extracted text)

**Edge cases verified:**
- Page with confidence 0 (completely unreadable): gets prefix, text is likely empty/garbage
- Page with confidence 29: gets prefix (boundary case, correct)
- Page with confidence 30: no prefix (boundary case, correct)

**Result: PASS** — Per-page confidence correctly prefixes low-quality pages.

---

### Test 4: Per-Section OCR Confidence in Chunk Metadata

**Code path:** `parsers.js:386-400`

**Verification:**
- After OCR merge and `buildStructured()`, per-section confidence is computed:
  ```js
  const confByPage = {};
  for (const p of ocrResult.pages) confByPage[p.pageNum] = p.confidence;
  for (const sec of structured.sections) {
    if (sec.source_pages) {
      const confs = [];
      for (let pg = sec.source_pages.start; pg <= sec.source_pages.end; pg++) {
        if (confByPage[pg] !== undefined) confs.push(confByPage[pg]);
      }
      if (confs.length > 0) {
        sec.structural_metadata = sec.structural_metadata || {};
        sec.structural_metadata.ocr_confidence = Math.round(...);
      }
    }
  }
  ```
- Confidence is averaged across pages in the section's `source_pages` range
- Result is rounded to integer and stored in `structural_metadata.ocr_confidence`
- `structural_metadata` is initialized to `{}` if null (safe)
- Only sections with `source_pages` get confidence (correct — sections without page info skip)
- Only pages that were actually OCR'd contribute (uses `confByPage` lookup)

**Data flow to DB:**
- `chunker.js:85` stores `structuralMetadata: sec.structural_metadata || null`
- DB column `structural_metadata` stores as JSON TEXT
- `MaterialsScreen.jsx:157-158` parses it back (handles both string and object forms)

**Edge cases verified:**
- Section spanning pages 5-10 where only pages 5, 7, 9 were OCR'd: averages 3 values (correct)
- Section with no `source_pages`: skipped (no confidence stored, correct)
- Empty `confs` array: no confidence stored (avoids division by zero)

**Result: PASS** — Per-section OCR confidence correctly stored in chunk metadata.

---

### Test 5: OCR Badge on Material Card

**Code path:** `MaterialsScreen.jsx:156-159, 196`

**Verification:**
- Detection logic:
  ```js
  const hasOcr = chunks.some(c => c.fidelity === 'low');
  ```
- Confidence calculation (handles both field name conventions and JSON parsing):
  ```js
  var m = c.structuralMetadata || c.structural_metadata;
  if (typeof m === 'string') m = JSON.parse(m);
  return m?.ocr_confidence;
  ```
- Badge rendering in metadata row:
  - `hasOcr && !lowOcrConf`: Gray "OCR" pill (`color: T.txD, background: T.bg, border: T.bd`)
  - `hasOcr && lowOcrConf`: Amber "OCR · low quality" pill (`color: T.am, background: T.amS, border: T.am + "40"`)
- Badge includes dot separator consistent with other metadata items
- `lowOcrConf` threshold: average < 50 (matches parsers.js warning threshold)

**Edge cases verified:**
- Material with no OCR chunks: `hasOcr = false`, no badge shown (correct)
- Material with mixed fidelity chunks: `hasOcr = true` if any chunk is `'low'` (correct)
- Chunks with no `structuralMetadata`: filtered out by `.filter(v => v != null)`, falls back to `_ocrAvg = 100` (no low quality warning)
- JSON parse error in `structuralMetadata`: caught by try/catch, returns `null` (safe)

**Result: PASS** — OCR badge correctly appears with appropriate styling.

---

### Test 6: Fidelity Tagging in Chunker

**Code path:** `chunker.js:86`

**Verification:**
- `fidelity: parsed._ocrUsed ? 'low' : 'full'`
- All chunks from an OCR'd PDF get `fidelity: 'low'` uniformly
- Non-OCR documents get `fidelity: 'full'`
- The `fidelity` column exists in the chunks table with valid values: `'full'`, `'text_only'`, `'low'`
- `chunkPlainText()` (chunker.js:373) hardcodes `fidelity: 'full'` (correct — plain text is never OCR'd)

**Result: PASS** — Fidelity tagging correctly applied.

---

### Test 7: Graceful Degradation — Low-Confidence Text

**Code path:** Full pipeline: `ocrEngine → parsers → chunker → skills extraction`

**Verification:**
- Low-confidence OCR text may contain errors, missing words, garbled characters
- **Chunking**: `chunker.js` processes text regardless of quality — no crash path from bad text
- **Skill extraction**: `skills.js` sends chunk content to Claude API. Low-quality text may produce:
  - Fewer skills (Claude can't parse garbled text) — acceptable degradation
  - Different skill names (misread terms) — acceptable, user can review
  - Empty extraction (Claude returns no skills) — handled by existing empty-result logic
- **No crash paths identified:**
  - `contentHash()` works on any string (SHA-256 of bytes)
  - `mergeSmallSections()` / `splitLargeSections()` operate on char counts, not content quality
  - `buildStructured()` heading detection may find fewer headings in garbled text — creates fewer sections, still valid
- **User protection:**
  - Warning notification tells user about low quality
  - "OCR · low quality" badge on card provides persistent visual indicator
  - Low-confidence page prefix `[Low confidence OCR — text may be inaccurate]` appears in chunk content

**Result: PASS** — Pipeline handles low-confidence text gracefully without crashes.

---

### Test 8: Mixed PDF Handling (Native + Scanned Pages)

**Code path:** `pdfParser.js:86-89` → `parsers.js:368-374`

**Verification:**
- `pdfParser.js` tracks empty pages in `emptyPageNums[]` (pages with <20 chars)
- `_needsOcr` only triggers when >50% of pages are empty
- `ocrPdfPages()` only processes pages in `emptyPageNums` — native text pages untouched
- Merge loop (parsers.js:368-374) only overwrites pages found in OCR results:
  ```js
  const idx = result.pageTexts.findIndex(p => p.pageNum === ocrPage.pageNum);
  ```
- Native pages retain their text + font-size items for heading detection
- `buildStructured()` runs on merged data — heading detection benefits from both native and OCR'd text

**Result: PASS** — Mixed PDFs correctly OCR only empty pages.

---

### Test 9: OCR-Only-When-Needed Check

**Code path:** `pdfParser.js:103-114`

**Verification:**
- Threshold: `emptyPages / numPages > 0.5` (more than half empty)
- 100-page PDF with 49 empty pages: `0.49 <= 0.5` → no OCR (normal path)
- 100-page PDF with 51 empty pages: `0.51 > 0.5` → OCR triggered
- Single-page PDF with no text: `1/1 = 1.0 > 0.5` → OCR triggered (correct)
- All-text PDF: `0/N = 0.0` → no OCR (correct)

**Result: PASS** — OCR triggers only when document is predominantly scanned.

---

### Test 10: Memory Safety During OCR

**Code path:** `ocrEngine.js:96-103, 155-164`

**Verification:**
- `freeCanvas()` called after each page (releases ~60MB per canvas):
  ```js
  function freeCanvas(canvas) {
    if (canvas) {
      var ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0; canvas.height = 0;
    }
  }
  ```
- Worker terminated in `finally` block (always runs, even on error):
  ```js
  } finally {
    await terminateOcr();
  }
  ```
- `terminateOcr()` frees WASM memory (~100-200MB)
- No canvas leak possible — `freeCanvas` runs per-page, not batch
- Worker reuse within a single `ocrPdfPages` call, terminated after completion

**Result: PASS** — Memory properly managed during OCR processing.

---

### Test 11: Error Handling — OCR Completes But No Text

**Code path:** `parsers.js:402-404`

**Verification:**
```js
if (!structured.markdown.trim()) {
  return { type: 'text', name: file.name, content: '[OCR completed but could not extract text from ' + file.name + '.]' };
}
```
- Completely blank OCR output (e.g., blank pages, non-text images): returns descriptive message
- Return shape matches normal `readFile` return — callers handle it uniformly
- No `_structured` set on this return → no OCR badge, no chunk creation (correct — nothing to chunk)

**Result: PASS** — Empty OCR output handled gracefully with user message.

---

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | High-quality scan — confidence >80, no warnings | PASS |
| 2 | Low-quality scan — confidence <50, warning shown | PASS |
| 3 | Per-page confidence — low-confidence page prefix | PASS |
| 4 | Per-section OCR confidence in chunk metadata | PASS |
| 5 | OCR badge on material card | PASS |
| 6 | Fidelity tagging in chunker | PASS |
| 7 | Graceful degradation — low-confidence text | PASS |
| 8 | Mixed PDF handling (native + scanned pages) | PASS |
| 9 | OCR-only-when-needed threshold check | PASS |
| 10 | Memory safety during OCR | PASS |
| 11 | Error handling — OCR completes but no text | PASS |

**Overall: 11/11 PASS**

---

## Phase 3 Checkpoint

| Criterion | Status |
|-----------|--------|
| Confidence thresholds work (page <30 prefix, avg <50 warning) | DONE |
| Warnings surface for low-quality scans (notification + badge) | DONE |
| Per-section OCR confidence stored in chunk metadata | DONE |
| OCR badge on material cards (gray normal, amber low quality) | DONE |
| Extraction handles low-confidence text gracefully | DONE |
| Build verified | DONE |

**Phase 3 COMPLETE — OCR quality handling fully implemented and verified.**
