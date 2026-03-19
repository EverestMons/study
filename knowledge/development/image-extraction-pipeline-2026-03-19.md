# Development: Image Extraction Pipeline
**Date:** 2026-03-19
**Status:** Complete
**Step:** 4 — Image Extraction Pipeline for PDF, PPTX, DOCX

---

## Changes Made

### 1. `src/lib/imageExtractor.js` (NEW — ~300 lines)
The image extraction orchestrator. Extracts visual content from uploaded materials at upload time and stores as image files + `material_images` DB records.

**Exported:**
- `extractAndStoreImages(courseId, mat, file, options)` — main entry point, dispatches by format

**Internal functions:**
- `renderAndStorePdfPages(doc, materialId, courseId, imageType, onStatus)` — shared PDF/PPTX renderer. Renders each page to canvas at 1.5x scale (capped at 1600px), converts to PNG, writes via imageStore, batch-inserts DB rows
- `extractPptxImages(buffer, materialId, courseId, onStatus)` — writes PPTX to temp file, runs `soffice --headless --convert-to pdf`, loads resulting PDF, delegates to `renderAndStorePdfPages` with `imageType='slide'`
- `extractDocxImages(images, materialId, courseId)` — writes embedded images from `_structured.images` array, skips EMF/WMF formats, keeps original format (JPEG stays JPEG)
- `detectLibreOffice()` — tries `soffice-mac` then `soffice` shell scopes via `Command.create`. Caches result. Returns null if not available (graceful degradation)
- `linkImagesToChunks(materialId)` — post-extraction linking. Matches images to chunks by `page_start`/`page_end` (PDF) or `Slide N` label pattern (PPTX)
- `renderPageToCanvas(doc, pageNum)` — renders PDF page at IMAGE_SCALE (1.5), uses OffscreenCanvas if available, caps at MAX_DIMENSION (1600px)
- `canvasToPng(canvas)` — converts canvas to PNG Uint8Array via `convertToBlob`/`toBlob`
- `freeCanvas(canvas)` — releases pixel buffer by setting width/height to 0

**Design decisions:**
- Lazy imports for `@tauri-apps/plugin-shell` and `@tauri-apps/plugin-fs` — PPTX extraction gracefully degrades if shell plugin isn't available
- All format extractors never throw — failures are caught and logged, returning `imageCount: 0`
- Heavy references (`_pdfDoc`, `_originalBuffer`, image `data` buffers) are deleted after extraction to free memory
- Shell scope names: `soffice-mac` (explicit macOS path) and `soffice` (PATH-based)

### 2. `src/lib/pdfParser.js` (MODIFIED)
- Stash `doc` reference on structured output: `structured._pdfDoc = doc` after `buildStructured()` returns
- Changed from `return buildStructured(...)` to `const structured = await buildStructured(...); structured._pdfDoc = doc; return structured;`
- This keeps the pdfjs document alive for image extraction without modifying `buildStructured`'s contract

### 3. `src/lib/parsers.js` (MODIFIED)
- **PDF OCR path (line ~384):** Added `structured._pdfDoc = result.doc` after OCR merging, before return
- **PPTX path (line ~100):** Added `_originalBuffer: buf` to the `_structured` object so LibreOffice can convert the raw PPTX bytes

### 4. `src/lib/docxParser.js` (MODIFIED)
- **Alt text extraction:** In `parseParagraph()`, when an `r:embed` image is detected, now also extracts alt text from `<wp:docPr descr="...">` attribute via regex
- `result.imageAltText` populated from `decodeXmlEntities(descrMatch[1])`
- **Propagation:** `imageRefs.push()` now includes `altText: result.imageAltText || ''`
- **In `extractImages()`:** Changed `alt_text: ''` to `alt_text: ref.altText || ''`

### 5. `src/StudyContext.jsx` (MODIFIED)
- **Import:** Added `MaterialImages` to the db.js import
- **createCourse (line ~603):** After `storeAsChunks`, before `mats.push(mat)`: lazy-imports `extractAndStoreImages`, calls with `{ onStatus: setStatus }`, wrapped in try/catch. Skips deduplicated materials.
- **addMats (line ~1314):** Same pattern — extract images after storing, before pushing to newMeta
- **removeMat (line ~1401):** Before chunk/material deletion, calls `MaterialImages.deleteByMaterial(docId)` + `deleteImageDir(docId)` for cleanup
- **delCourse (line ~1286):** Before `Courses.delete`, calls `MaterialImages.deleteByCourse(id)` + `deleteCourseImages(materialIds)` for bulk cleanup

### 6. `src-tauri/capabilities/default.json` (MODIFIED)
- Added `"shell:allow-execute"` permission for LibreOffice invocation
- Expanded `fs:allow-write-file` to include `$APPDATA/tmp/**` (PPTX temp files)
- Expanded `fs:allow-mkdir` to include `$APPDATA/tmp/**`
- Expanded `fs:allow-exists` to include `$APPDATA/tmp/**`
- Expanded `fs:allow-remove` to include `$APPDATA/tmp/**`

### 7. `src-tauri/tauri.conf.json` (MODIFIED)
- Added `plugins.shell.scope` with two entries:
  - `soffice`: PATH-based `soffice` command (Linux/Homebrew)
  - `soffice-mac`: Explicit `/Applications/LibreOffice.app/Contents/MacOS/soffice` path

### 8. `package.json` (MODIFIED via npm install)
- Added `@tauri-apps/plugin-shell` dependency — required for `Command.create` API

## Build Verification
- Vite build: PASS (built in ~1.8s, no errors)
- Cargo check: PASS (compiled in ~3s, no errors)

## Notes
- PPTX image extraction requires LibreOffice installed. If not found, extraction silently skips — text extraction is unaffected.
- The `_pdfDoc` reference prevents GC of the pdfjs document between text parsing and image extraction. It's explicitly deleted after extraction.
- Canvas memory is managed carefully: `freeCanvas()` sets dimensions to 0 after each page render (~30-60MB freed per page at 1.5x scale).
- DOCX alt text extraction uses the `wp:docPr descr` attribute — a standard OOXML location for image descriptions.
- Chunk linking uses a dual strategy: `page_start`/`page_end` columns for PDF, and `Slide N` label pattern matching for PPTX.
- The `extractAndStoreImages` function is lazy-imported in StudyContext to match the existing pattern of keeping heavy modules out of the initial bundle.
