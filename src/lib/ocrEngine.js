// ============================================================
// ocrEngine.js — OCR for scanned/image-based PDFs
//
// Uses tesseract.js v7 (WASM-based Tesseract OCR).
// Renders PDF pages to canvas via pdfjs-dist, then runs OCR.
// Training data loaded from CDN on first use, cached after.
//
// Depends on: tesseract.js (npm), pdfjs-dist (already installed)
// ============================================================

const RENDER_SCALE = 2.0; // ~300 DPI for typical PDFs — sweet spot for OCR accuracy vs memory

let worker = null;
let workerLangs = null;

/**
 * Initialize OCR worker lazily. Reuses existing worker if languages match.
 * v7 API: createWorker(langs) handles language loading + init in one call.
 *
 * @param {string} langs - Tesseract language string, e.g. "eng" or "eng+fra"
 * @returns {Promise<object>} Tesseract worker
 */
async function initOcrWorker(langs) {
  if (worker && workerLangs === langs) return worker;

  // Terminate stale worker if languages changed
  if (worker) {
    try { await worker.terminate(); } catch {}
    worker = null;
    workerLangs = null;
  }

  const { createWorker } = await import('tesseract.js');

  try {
    worker = await createWorker(langs);
  } catch (e) {
    // Fallback: main-thread mode if Web Worker creation fails in WebView
    console.warn('[OCR] Worker creation failed, trying main thread:', e);
    try {
      worker = await createWorker(langs, { workerBlobURL: false });
    } catch (e2) {
      throw new Error('OCR engine failed to initialize: ' + (e2.message || e.message));
    }
  }

  workerLangs = langs;
  return worker;
}

/**
 * OCR a single canvas element.
 *
 * @param {HTMLCanvasElement} canvas - Rendered page canvas
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function ocrPage(canvas) {
  if (!worker) throw new Error('OCR worker not initialized');
  var { data } = await worker.recognize(canvas);
  return {
    text: data.text || '',
    confidence: data.confidence || 0,
  };
}

/**
 * Render a PDF page to a canvas at RENDER_SCALE.
 *
 * @param {object} doc - pdfjs-dist document
 * @param {number} pageNum - 1-indexed page number
 * @returns {Promise<HTMLCanvasElement>}
 */
async function renderPageToCanvas(doc, pageNum) {
  var page = await doc.getPage(pageNum);
  var viewport = page.getViewport({ scale: RENDER_SCALE });

  // Use OffscreenCanvas if available (better for workers / memory), else regular canvas
  var canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(viewport.width, viewport.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
  }

  var ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Free a canvas's pixel buffer to release memory.
 * At 2x scale, a US Letter page is ~3400x4400 = ~60MB per canvas.
 */
function freeCanvas(canvas) {
  if (canvas instanceof HTMLCanvasElement) {
    canvas.width = 0;
    canvas.height = 0;
  }
  // OffscreenCanvas doesn't support setting width=0 in all browsers,
  // but goes out of scope and gets GC'd
}

/**
 * OCR multiple PDF pages. Core function called from parsePdf().
 *
 * Creates a single worker, renders each page to canvas at 2x scale,
 * runs OCR sequentially, cleans up canvas per page, terminates worker
 * when done to free ~100-200MB WASM memory.
 *
 * @param {object} doc - pdfjs-dist document object (already loaded)
 * @param {number[]} pageNumbers - 1-indexed page numbers to OCR
 * @param {object} [options]
 * @param {function} [options.onProgress] - (pageIndex, totalPages, pageNum) => void
 * @param {string[]} [options.languages] - Language codes, default ['eng']
 * @returns {Promise<{pages: Array<{pageNum: number, text: string, confidence: number}>, avgConfidence: number}>}
 */
export async function ocrPdfPages(doc, pageNumbers, options = {}) {
  var { onProgress, onLangStatus, languages = ['eng'] } = options;
  var langStr = languages.join('+');

  if (onLangStatus && languages.length > 1) {
    onLangStatus('Loading language data for ' + languages.length + ' languages...');
  }
  await initOcrWorker(langStr);
  if (onLangStatus) onLangStatus(null);

  var results = [];

  try {
    for (var i = 0; i < pageNumbers.length; i++) {
      var pageNum = pageNumbers[i];
      if (onProgress) onProgress(i, pageNumbers.length, pageNum);

      var canvas = await renderPageToCanvas(doc, pageNum);
      var result = await ocrPage(canvas);
      freeCanvas(canvas);

      results.push({
        pageNum: pageNum,
        text: result.text,
        confidence: result.confidence,
      });
    }
  } finally {
    // Always terminate worker to free WASM memory (~100-200MB)
    await terminateOcr();
  }

  var avgConfidence = results.length > 0
    ? results.reduce(function (sum, r) { return sum + r.confidence; }, 0) / results.length
    : 0;

  return { pages: results, avgConfidence: avgConfidence };
}

/**
 * Terminate OCR worker and free WASM memory.
 * Safe to call multiple times or when no worker exists.
 */
export async function terminateOcr() {
  if (worker) {
    try { await worker.terminate(); } catch {}
    worker = null;
    workerLangs = null;
  }
}
