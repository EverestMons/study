// ============================================================
// pdfParser.js — PDF → Structured Markdown Parser
//
// Extracts text from PDFs via pdfjs-dist (Mozilla pdf.js).
// Detects headings via font size analysis, falls back to
// page-based sections when no headings are found.
//
// Depends on: pdfjs-dist, htmlToMarkdown.js
// ============================================================

import { inferSectionPath, computeSectionMetadata } from './htmlToMarkdown.js';

// Lazy-load pdfjs-dist — only when first PDF is uploaded.
// Avoids crashing the app at startup if the WebView environment
// has issues with the library's eager initialization.
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const [lib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  pdfjsLib = lib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  return pdfjsLib;
}

const MAX_PAGES = 5000;
const PAGES_PER_FALLBACK_SECTION = 5;
const MAX_HEADING_CHARS = 200;

/**
 * Parse a PDF file into structured output.
 *
 * @param {ArrayBuffer} buf - Raw PDF file bytes
 * @param {string} filename - Original filename
 * @returns {Promise<object>} Structured output matching shared contract
 */
export async function parsePdf(buf, filename) {
  const pdfjs = await loadPdfjs();

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    if (e.name === 'PasswordException' || /password/i.test(e.message)) {
      return makeError(filename, 'This PDF is password-protected. Please remove the password and re-upload.');
    }
    return makeError(filename, 'Could not open PDF: ' + e.message);
  }

  const numPages = Math.min(doc.numPages, MAX_PAGES);

  // --- 1. Extract text items from all pages ---
  const pageTexts = []; // [{items: [{str, fontSize, x, y}], text: string}]
  const fontSizeChars = {}; // fontSize → total char count
  const emptyPageNums = [];
  let emptyPages = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    // Use streamTextContent + reader instead of getTextContent() because
    // pdfjs v5's getTextContent uses `for await...of ReadableStream` internally,
    // which WebKit (Tauri's WebView) doesn't support.
    const content = { items: [], styles: Object.create(null) };
    const reader = page.streamTextContent().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }

    const items = [];
    for (const item of content.items) {
      if (!item.str && !item.hasEOL) continue;
      const fontSize = Math.round(item.transform?.[0] || item.height || 0);
      const x = Math.round(item.transform?.[4] || 0);
      const y = Math.round(item.transform?.[5] || 0);
      items.push({ str: item.str || '', fontSize, x, y, hasEOL: item.hasEOL });
    }

    // Reconstruct page text (reading order: top to bottom, left to right)
    const pageText = reconstructPageText(items);

    if (pageText.trim().length < 20) {
      emptyPages++;
      emptyPageNums.push(i);
    }

    // Count chars per font size
    for (const item of items) {
      if (item.str.trim().length === 0) continue;
      const fs = item.fontSize;
      if (fs > 0) {
        fontSizeChars[fs] = (fontSizeChars[fs] || 0) + item.str.length;
      }
    }

    pageTexts.push({ items, text: pageText, pageNum: i });
  }

  // --- 2. Check for scanned/image-based PDF ---
  if (numPages > 0 && emptyPages / numPages > 0.5) {
    return {
      _needsOcr: true,
      doc,
      emptyPageNums,
      pageTexts,
      fontSizeChars,
      numPages,
      filename,
    };
  }

  const structured = await buildStructured(pageTexts, fontSizeChars, numPages, filename, doc);
  structured._pdfDoc = doc; // Stash for image extraction pipeline
  return structured;
}


// ============================================================
// Build structured output from extracted page data
// ============================================================

/**
 * Build structured output from page texts and font data.
 * Extracted from parsePdf so callers can re-use after merging OCR text.
 *
 * @param {Array} pageTexts - [{items, text, pageNum}, ...]
 * @param {object} fontSizeChars - fontSize → char count map
 * @param {number} numPages - Total page count
 * @param {string} filename - Original filename
 * @param {object} doc - pdfjs document (for metadata/outline)
 * @returns {Promise<object>} Structured output
 */
export async function buildStructured(pageTexts, fontSizeChars, numPages, filename, doc) {
  const allText = pageTexts.map(p => p.text).join('\n\n');
  if (!allText.trim()) {
    return makeError(filename, 'Could not extract any text from this PDF.');
  }

  // --- Font size analysis → heading detection ---
  const bodySize = detectBodyFontSize(fontSizeChars);
  const headingSizes = detectHeadingSizes(fontSizeChars, bodySize);

  // --- Build sections from heading detection ---
  let sections = buildSectionsFromHeadings(pageTexts, headingSizes, bodySize);

  // --- Fallback to page-based sections if no headings detected ---
  if (sections.length <= 1 && numPages > PAGES_PER_FALLBACK_SECTION) {
    sections = buildPageBasedSections(pageTexts);
  }

  // If still no sections (very short PDF), wrap everything as one section
  if (sections.length === 0) {
    sections.push({
      heading: null,
      heading_level: 0,
      section_path: '1',
      content: allText,
      char_count: allText.length,
      structural_metadata: computeSectionMetadata(allText),
      source_pages: { start: 1, end: numPages },
    });
  }

  // --- Build full markdown ---
  const markdown = sections.map(s => {
    if (s.heading) {
      return '#'.repeat(s.heading_level) + ' ' + s.heading + '\n\n' + s.content;
    }
    return s.content;
  }).join('\n\n');

  // --- Extract metadata and outline ---
  let title = null;
  let author = null;
  let tocEntries = [];

  try {
    const meta = await doc.getMetadata();
    title = meta?.info?.Title || null;
    author = meta?.info?.Author || null;
  } catch { /* metadata unavailable */ }

  try {
    const outline = await doc.getOutline();
    if (outline) {
      tocEntries = flattenOutline(outline, 1);
    }
  } catch { /* outline unavailable */ }

  return {
    type: 'structured',
    name: filename,
    source_format: 'pdf',
    markdown,
    sections,
    images: [],
    metadata: {
      title,
      author,
      toc_entries: tocEntries,
      total_chars: markdown.length,
      section_count: sections.length,
      image_count: 0,
    },
  };
}


// ============================================================
// Text reconstruction — reading order from raw text items
// ============================================================

function reconstructPageText(items) {
  if (items.length === 0) return '';

  // Group items into lines by Y coordinate (within tolerance)
  const lines = [];
  let currentLine = [];
  let currentY = null;
  const Y_TOLERANCE = 3;

  // Sort by Y descending (top of page first), then X ascending
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > Y_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > Y_TOLERANCE) {
      if (currentLine.length > 0) lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Build text from lines
  const textLines = [];
  for (const line of lines) {
    // Sort by X within line
    line.sort((a, b) => a.x - b.x);
    let lineText = '';
    for (let i = 0; i < line.length; i++) {
      const item = line[i];
      // Add space between items if there's a gap
      if (i > 0 && item.x - (line[i - 1].x + line[i - 1].str.length * 3) > 5) {
        if (!lineText.endsWith(' ') && !item.str.startsWith(' ')) {
          lineText += ' ';
        }
      }
      lineText += item.str;
    }
    textLines.push(lineText.trimEnd());
  }

  return textLines.join('\n');
}


// ============================================================
// Font size analysis
// ============================================================

function detectBodyFontSize(fontSizeChars) {
  let maxChars = 0;
  let bodySize = 0;
  for (const [size, count] of Object.entries(fontSizeChars)) {
    if (count > maxChars) {
      maxChars = count;
      bodySize = Number(size);
    }
  }
  return bodySize;
}

function detectHeadingSizes(fontSizeChars, bodySize) {
  // Heading sizes = anything at least 0.5pt larger than body, sorted descending
  const candidates = Object.entries(fontSizeChars)
    .filter(([size]) => Number(size) >= bodySize + 0.5)
    .sort(([a], [b]) => Number(b) - Number(a));

  // Assign H1–H4 to the top 4 heading sizes
  const headingSizes = {};
  const maxLevels = Math.min(candidates.length, 4);
  for (let i = 0; i < maxLevels; i++) {
    headingSizes[Number(candidates[i][0])] = i + 1; // H1, H2, H3, H4
  }
  return headingSizes;
}


// ============================================================
// Section building from heading detection
// ============================================================

function buildSectionsFromHeadings(pageTexts, headingSizes, bodySize) {
  if (Object.keys(headingSizes).length === 0) return [];

  const sections = [];
  let currentHeading = null;
  let currentLevel = 0;
  let currentContent = [];
  let currentStartPage = 1;

  function flush(endPage) {
    const content = currentContent.join('\n').trim();
    if (!content && !currentHeading) return;
    sections.push({
      heading: currentHeading,
      heading_level: currentLevel,
      section_path: inferSectionPath(currentHeading, sections.length),
      content: content || '',
      char_count: content.length,
      structural_metadata: computeSectionMetadata(content),
      source_pages: { start: currentStartPage, end: endPage },
    });
  }

  for (const page of pageTexts) {
    // Identify heading lines on this page
    const lineGroups = groupItemsIntoLines(page.items);

    for (const line of lineGroups) {
      const dominantSize = getDominantFontSize(line.items);
      const lineText = line.text.trim();

      if (
        dominantSize > 0 &&
        headingSizes[dominantSize] &&
        lineText.length > 0 &&
        lineText.length < MAX_HEADING_CHARS
      ) {
        // This line is a heading
        flush(page.pageNum);
        currentHeading = lineText;
        currentLevel = headingSizes[dominantSize];
        currentContent = [];
        currentStartPage = page.pageNum;
      } else if (lineText) {
        currentContent.push(lineText);
      }
    }
  }

  // Flush last section
  const lastPage = pageTexts[pageTexts.length - 1]?.pageNum || 1;
  flush(lastPage);

  return sections;
}

function groupItemsIntoLines(items) {
  if (items.length === 0) return [];

  const Y_TOLERANCE = 3;
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > Y_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  let currentLine = { items: [], y: null };

  for (const item of sorted) {
    if (currentLine.y === null || Math.abs(item.y - currentLine.y) > Y_TOLERANCE) {
      if (currentLine.items.length > 0) {
        currentLine.text = currentLine.items.map(i => i.str).join('').trim();
        lines.push(currentLine);
      }
      currentLine = { items: [item], y: item.y };
    } else {
      currentLine.items.push(item);
    }
  }

  if (currentLine.items.length > 0) {
    currentLine.text = currentLine.items.map(i => i.str).join('').trim();
    lines.push(currentLine);
  }

  return lines;
}

function getDominantFontSize(items) {
  const sizeChars = {};
  for (const item of items) {
    if (item.str.trim().length === 0) continue;
    const fs = item.fontSize;
    if (fs > 0) {
      sizeChars[fs] = (sizeChars[fs] || 0) + item.str.length;
    }
  }
  let maxChars = 0;
  let dominant = 0;
  for (const [size, count] of Object.entries(sizeChars)) {
    if (count > maxChars) {
      maxChars = count;
      dominant = Number(size);
    }
  }
  return dominant;
}


// ============================================================
// Page-based fallback sections
// ============================================================

function buildPageBasedSections(pageTexts) {
  const sections = [];

  for (let i = 0; i < pageTexts.length; i += PAGES_PER_FALLBACK_SECTION) {
    const chunk = pageTexts.slice(i, i + PAGES_PER_FALLBACK_SECTION);
    const startPage = chunk[0].pageNum;
    const endPage = chunk[chunk.length - 1].pageNum;
    const content = chunk.map(p => p.text).join('\n\n').trim();

    if (!content) continue;

    const heading = 'Pages ' + startPage + '–' + endPage;
    sections.push({
      heading,
      heading_level: 2,
      section_path: inferSectionPath(heading, sections.length),
      content,
      char_count: content.length,
      structural_metadata: computeSectionMetadata(content),
      source_pages: { start: startPage, end: endPage },
    });
  }

  return sections;
}


// ============================================================
// Outline (TOC) flattening
// ============================================================

function flattenOutline(outline, level) {
  const entries = [];
  for (const item of outline) {
    if (item.title) {
      entries.push({
        title: item.title.trim(),
        level,
        section_path: inferSectionPath(item.title.trim(), entries.length),
      });
    }
    if (item.items && item.items.length > 0) {
      entries.push(...flattenOutline(item.items, level + 1));
    }
  }
  return entries;
}


// ============================================================
// Error helper
// ============================================================

function makeError(filename, message) {
  return {
    type: 'structured',
    name: filename,
    source_format: 'pdf',
    markdown: '',
    sections: [],
    images: [],
    metadata: { title: null, author: null, toc_entries: [], total_chars: 0, section_count: 0, image_count: 0 },
    _errorMessage: message,
  };
}
