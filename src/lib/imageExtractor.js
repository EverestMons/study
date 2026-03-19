// ============================================================
// imageExtractor.js — Image extraction pipeline for all material types
//
// Extracts visual content (slides, PDF pages, DOCX figures) at upload
// time and stores as PNG files + material_images DB records.
//
// Depends on: db.js (MaterialImages, Chunks), imageStore.js,
//             pdfjs-dist (lazy), @tauri-apps/plugin-shell (lazy, optional)
// ============================================================

import { MaterialImages, Chunks } from './db.js';
import { saveImage } from './imageStore.js';

const IMAGE_SCALE = 1.5;        // ~225 DPI — sufficient for chat display
const MAX_DIMENSION = 1600;      // Max px on longest side
const SOFFICE_TIMEOUT_MS = 60000; // LibreOffice conversion timeout

let _sofficeName = undefined; // undefined=unchecked, null=not found, string=scope name

// ============================================================
// Canvas helpers
// ============================================================

/** Convert a canvas (HTMLCanvasElement or OffscreenCanvas) to PNG Uint8Array. */
async function canvasToPng(canvas) {
  let blob;
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/** Free canvas pixel buffer to release GPU/RAM (~30-60 MB per page at 1.5x). */
function freeCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

// ============================================================
// PDF page rendering (shared by PDF and PPTX pipelines)
// ============================================================

/**
 * Render a single PDF page to a canvas at IMAGE_SCALE, capping at MAX_DIMENSION.
 * @param {object} doc - pdfjs-dist document
 * @param {number} pageNum - 1-indexed page number
 * @returns {Promise<{ canvas, width: number, height: number }>}
 */
async function renderPageToCanvas(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const baseVp = page.getViewport({ scale: 1.0 });

  // Scale to ~225 DPI but cap at MAX_DIMENSION
  const maxSide = Math.max(baseVp.width, baseVp.height);
  const scale = Math.min(IMAGE_SCALE, MAX_DIMENSION / maxSide);
  const viewport = page.getViewport({ scale });

  const w = Math.round(viewport.width);
  const h = Math.round(viewport.height);

  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, width: w, height: h };
}

// ============================================================
// Main orchestrator
// ============================================================

/**
 * Extract images from a parsed file and store to filesystem + DB.
 * Called after storeAsChunks for each material during upload.
 *
 * @param {string} courseId
 * @param {object} mat — material record from storeAsChunks (has .id, .chunks)
 * @param {object} file — parsed file object (has ._structured)
 * @param {object} [options] — { onStatus: fn }
 * @returns {Promise<{ success: boolean, imageCount: number, error?: string }>}
 */
export async function extractAndStoreImages(courseId, mat, file, options = {}) {
  const structured = file._structured;
  if (!structured) return { success: true, imageCount: 0 };

  const format = structured.source_format;
  const materialId = mat.id;
  const { onStatus } = options;

  try {
    let imageCount = 0;

    if (format === 'pdf' && structured._pdfDoc) {
      if (onStatus) onStatus('Extracting page images: ' + file.name + '...');
      imageCount = await renderAndStorePdfPages(
        structured._pdfDoc, materialId, courseId, 'page', onStatus
      );
      // Release heavy reference
      delete structured._pdfDoc;

    } else if (format === 'pptx' && structured._originalBuffer) {
      if (onStatus) onStatus('Extracting slide images: ' + file.name + '...');
      imageCount = await extractPptxImages(
        structured._originalBuffer, materialId, courseId, onStatus
      );
      delete structured._originalBuffer;

    } else if (format === 'docx' && structured.images && structured.images.length > 0) {
      if (onStatus) onStatus('Extracting figures: ' + file.name + '...');
      imageCount = await extractDocxImages(
        structured.images, materialId, courseId
      );
      // Free image data buffers
      for (const img of structured.images) delete img.data;
    }

    // Link images to chunks by page/slide number
    if (imageCount > 0) {
      await linkImagesToChunks(materialId);
    }

    return { success: true, imageCount };
  } catch (e) {
    console.warn('[ImageExtract] Failed for', file.name, e);
    return { success: false, imageCount: 0, error: e.message };
  }
}

// ============================================================
// PDF extraction
// ============================================================

/**
 * Render all pages of a PDF document to PNG and store.
 * Shared by PDF (imageType='page') and PPTX-via-LibreOffice (imageType='slide').
 */
async function renderAndStorePdfPages(doc, materialId, courseId, imageType, onStatus) {
  const numPages = doc.numPages;
  const prefix = imageType === 'slide' ? 'slide' : 'page';
  const dbRows = [];

  for (let i = 1; i <= numPages; i++) {
    if (onStatus && (i === 1 || i % 5 === 0)) {
      onStatus('Rendering ' + prefix + ' ' + i + '/' + numPages + '...');
    }

    try {
      const { canvas, width, height } = await renderPageToCanvas(doc, i);
      const png = await canvasToPng(canvas);
      freeCanvas(canvas);

      const filename = prefix + '_' + String(i).padStart(3, '0') + '.png';
      const saved = await saveImage(materialId, filename, png);

      dbRows.push({
        materialId,
        courseId,
        imageType,
        pageOrSlideNumber: i,
        caption: null,
        filePath: saved.relativePath,
        width,
        height,
        chunkId: null,
        fileSizeBytes: saved.size,
      });
    } catch (e) {
      console.warn('[ImageExtract]', prefix, i, 'failed:', e);
    }
  }

  if (dbRows.length > 0) {
    await MaterialImages.createBatch(dbRows);
  }

  return dbRows.length;
}

// ============================================================
// PPTX extraction via LibreOffice → PDF → page rendering
// ============================================================

async function extractPptxImages(buffer, materialId, courseId, onStatus) {
  const sofficeName = await detectLibreOffice();
  if (!sofficeName) return 0;

  let writeFile, remove, exists, mkdir, readFile;
  try {
    ({ writeFile, remove, exists, mkdir, readFile } = await import('@tauri-apps/plugin-fs'));
  } catch {
    console.warn('[ImageExtract] Tauri FS plugin not available');
    return 0;
  }

  const { appDataDir } = await import('@tauri-apps/api/path');
  const { Command } = await import('@tauri-apps/plugin-shell');

  const baseDir = await appDataDir();
  const tmpDir = baseDir + 'tmp/';
  const pptxPath = tmpDir + materialId + '.pptx';
  const pdfPath = tmpDir + materialId + '.pdf';

  try {
    // Ensure tmp directory
    if (!(await exists(tmpDir))) {
      await mkdir(tmpDir, { recursive: true });
    }

    // Write PPTX to temp file
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    await writeFile(pptxPath, bytes);

    // Convert via LibreOffice
    if (onStatus) onStatus('Converting slides to images...');
    const cmd = Command.create(sofficeName, [
      '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, pptxPath
    ]);

    const child = await cmd.spawn();
    const result = await Promise.race([
      new Promise((resolve) => {
        var stdout = '', stderr = '';
        child.on('close', (data) => resolve({ code: data.code, stdout, stderr }));
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
      }),
      new Promise((_, reject) =>
        setTimeout(async () => {
          try { await child.kill(); } catch {}
          reject(new Error('LibreOffice conversion timeout'));
        }, SOFFICE_TIMEOUT_MS)
      ),
    ]);

    if (result.code !== 0) {
      console.warn('[ImageExtract] soffice failed:', result.stderr);
      return 0;
    }

    // Load resulting PDF with pdfjs-dist
    if (!(await exists(pdfPath))) {
      console.warn('[ImageExtract] PDF output not found at', pdfPath);
      return 0;
    }

    const pdfBytes = await readFile(pdfPath);

    // Lazy-load pdfjs
    const [lib, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = workerModule.default;

    const pdfDoc = await lib.getDocument({ data: pdfBytes }).promise;

    // Render slides using shared PDF renderer
    const count = await renderAndStorePdfPages(pdfDoc, materialId, courseId, 'slide', onStatus);
    pdfDoc.destroy();
    return count;

  } catch (e) {
    console.warn('[ImageExtract] PPTX extraction failed:', e);
    return 0;
  } finally {
    // Clean up temp files
    try { if (await exists(pptxPath)) await remove(pptxPath); } catch {}
    try { if (await exists(pdfPath)) await remove(pdfPath); } catch {}
  }
}

// ============================================================
// DOCX extraction — ZIP-based embedded images
// ============================================================

async function extractDocxImages(images, materialId, courseId) {
  const SKIP_TYPES = new Set(['image/emf', 'image/wmf', 'image/x-emf', 'image/x-wmf']);
  const dbRows = [];
  let idx = 0;

  for (const img of images) {
    if (SKIP_TYPES.has(img.media_type)) continue;

    idx++;
    const ext = img.media_type === 'image/jpeg' ? 'jpg'
              : img.media_type === 'image/gif' ? 'gif'
              : img.media_type === 'image/webp' ? 'webp'
              : img.media_type === 'image/svg+xml' ? 'svg'
              : 'png';
    const filename = 'embedded_' + String(idx).padStart(3, '0') + '.' + ext;

    try {
      const bytes = img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data);
      const saved = await saveImage(materialId, filename, bytes);

      dbRows.push({
        materialId,
        courseId,
        imageType: 'embedded',
        pageOrSlideNumber: null,
        caption: img.alt_text || null,
        filePath: saved.relativePath,
        width: img.width,
        height: img.height,
        chunkId: null,
        fileSizeBytes: saved.size,
      });
    } catch (e) {
      console.warn('[ImageExtract] DOCX image', idx, 'failed:', e);
    }
  }

  if (dbRows.length > 0) {
    await MaterialImages.createBatch(dbRows);
  }

  return dbRows.length;
}

// ============================================================
// LibreOffice detection
// ============================================================

/**
 * Detect LibreOffice availability. Returns the shell scope name to use
 * with Command.create, or null if not available.
 * Caches result to avoid repeated checks.
 */
async function detectLibreOffice() {
  if (_sofficeName !== undefined) return _sofficeName;

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    // Try macOS explicit path first (most reliable)
    try {
      const r = await Command.create('soffice-mac', ['--version']).execute();
      if (r.code === 0) { _sofficeName = 'soffice-mac'; return _sofficeName; }
    } catch {}

    // Try PATH-based soffice
    try {
      const r = await Command.create('soffice', ['--version']).execute();
      if (r.code === 0) { _sofficeName = 'soffice'; return _sofficeName; }
    } catch {}
  } catch (e) {
    console.warn('[ImageExtract] Shell plugin not available:', e);
  }

  _sofficeName = null;
  return null;
}

// ============================================================
// Chunk-image linking
// ============================================================

/**
 * Link images to chunks by matching page/slide numbers to chunk page ranges.
 * Called after image extraction completes.
 */
async function linkImagesToChunks(materialId) {
  const images = await MaterialImages.getByMaterial(materialId);
  const chunks = await Chunks.getByMaterial(materialId);

  if (!images.length || !chunks.length) return;

  for (const img of images) {
    const pageNum = img.page_or_slide_number;
    if (!pageNum) continue;

    let matchedChunkId = null;

    for (const chunk of chunks) {
      // PDF chunks have page_start / page_end
      if (chunk.page_start != null && chunk.page_end != null) {
        if (pageNum >= chunk.page_start && pageNum <= chunk.page_end) {
          matchedChunkId = chunk.id;
          break;
        }
      }

      // PPTX chunks have "Slide N" labels
      if (chunk.label) {
        const slideMatch = chunk.label.match(/^Slide\s+(\d+)/);
        if (slideMatch && parseInt(slideMatch[1]) === pageNum) {
          matchedChunkId = chunk.id;
          break;
        }
      }
    }

    if (matchedChunkId) {
      await MaterialImages.updateChunkId(img.id, matchedChunkId);
    }
  }
}
