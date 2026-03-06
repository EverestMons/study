// ============================================================
// parsers.js — File parsing for uploads
//
// Reads uploaded files and returns parsed content.
// EPUB and DOCX use v2 structured parsers internally,
// but output is flattened to v1 shape for App.jsx compat.
//
// The full v2 structured output is stashed on `_structured`
// so the upload pipeline can use it directly when ready.
// ============================================================

import { parseEpub } from './epubParser.js';
import { parseDocx } from './docxParser.js';
import { parsePdf } from './pdfParser.js';
import { safeLoadZip } from './jszip-loader.js';

// --- Safety limits ---
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// --- PPTX Parser ---
const parsePptx = async (buf, filename) => {
  const zip = await safeLoadZip(buf);
  const slides = [];

  const slideFiles = Object.keys(zip.files)
    .filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)[1]);
      const numB = parseInt(b.match(/slide(\d+)/)[1]);
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)?.async('text');
    if (!xml) continue;
    const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(t => t);
    if (texts.length > 0) {
      const slideNum = slideFile.match(/slide(\d+)/)[1];
      slides.push('--- Slide ' + slideNum + ' ---\n' + texts.join('\n'));
    }
  }

  // Speaker notes
  const noteFiles = Object.keys(zip.files)
    .filter(f => f.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/notesSlide(\d+)/)[1]);
      const numB = parseInt(b.match(/notesSlide(\d+)/)[1]);
      return numA - numB;
    });

  const notes = [];
  for (const noteFile of noteFiles) {
    const xml = await zip.file(noteFile)?.async('text');
    if (!xml) continue;
    const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(t => t && t.length > 2);
    if (texts.length > 0) {
      const noteNum = noteFile.match(/notesSlide(\d+)/)[1];
      notes.push('--- Notes for Slide ' + noteNum + ' ---\n' + texts.join('\n'));
    }
  }

  let content = slides.join('\n\n');
  if (notes.length > 0) {
    content += '\n\n=== SPEAKER NOTES ===\n\n' + notes.join('\n\n');
  }

  if (!content.trim()) {
    return { type: 'text', name: filename, content: '[PPTX had no extractable text]', parseOk: false };
  }

  // Build structured output for v2 chunking pipeline
  const sections = slides.map((slideText, i) => ({
    heading: 'Slide ' + (i + 1),
    heading_level: 2,
    section_path: String(i + 1),
    content: slideText,
    char_count: slideText.length,
    structural_metadata: null,
    source_pages: null,
  }));
  if (notes.length > 0) {
    const notesContent = notes.join('\n\n');
    sections.push({
      heading: 'Speaker Notes',
      heading_level: 1,
      section_path: String(sections.length + 1),
      content: notesContent,
      char_count: notesContent.length,
      structural_metadata: null,
      source_pages: null,
    });
  }

  return {
    type: 'text', name: filename, content,
    _structured: {
      type: 'structured', name: filename, source_format: 'pptx',
      markdown: content, sections, images: [],
      metadata: { title: null, author: null, toc_entries: [], total_chars: content.length, section_count: sections.length, image_count: 0 },
    },
  };
};

// --- XLSX Parser ---
const parseXlsx = async (buf, filename) => {
  const zip = await safeLoadZip(buf);
  let text = '';

  // Excel date converter
  const xlDate = (n) => {
    n = parseFloat(n);
    if (isNaN(n) || n < 1) return String(n);
    const d = new Date((n - 25569) * 86400000);
    const y = d.getUTCFullYear();
    if (y < 1950 || y > 2100) return String(n);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };

  // Column letter to index
  const colIdx = (ref) => {
    const letters = ref.replace(/[0-9]/g, '');
    let idx = 0;
    for (let i = 0; i < letters.length; i++) {
      idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return idx - 1;
  };

  // Shared strings
  const ssFile = zip.file('xl/sharedStrings.xml');
  const strings = [];
  if (ssFile) {
    const ssXml = await ssFile.async('text');
    const matches = ssXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    for (const match of matches) {
      strings.push(match.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    }
  }

  // Detect date columns from styles
  const dateStyleIds = new Set();
  const stylesFile = zip.file('xl/styles.xml');
  if (stylesFile) {
    const stylesXml = await stylesFile.async('text');
    const xfs = stylesXml.match(/<xf[^>]*>/g) || [];
    for (let xi = 0; xi < xfs.length; xi++) {
      const fmtMatch = xfs[xi].match(/numFmtId="(\d+)"/);
      if (fmtMatch) {
        const fmtId = parseInt(fmtMatch[1]);
        if ((fmtId >= 14 && fmtId <= 22) || fmtId === 30 || fmtId === 36) {
          dateStyleIds.add(xi);
        }
      }
    }
  }

  // Sheet names
  const wbFile = zip.file('xl/workbook.xml');
  const sheetNames = [];
  if (wbFile) {
    const wbXml = await wbFile.async('text');
    const nameMatches = wbXml.match(/name="([^"]+)"/g) || [];
    for (const nm of nameMatches) {
      sheetNames.push(nm.replace(/name="([^"]+)"/, '$1'));
    }
  }

  // Parse sheets
  const sheetFiles = Object.keys(zip.files)
    .filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort();

  const sheetSections = [];

  for (let si = 0; si < sheetFiles.length; si++) {
    const sheetXml = await zip.file(sheetFiles[si]).async('text');
    const sheetName = sheetNames[si] || 'Sheet' + (si + 1);
    let sheetText = '--- Sheet: ' + sheetName + ' ---\n';

    const rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    for (const row of rows) {
      const cellMatches = row.match(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g) || [];
      const rowVals = {};
      let maxCol = 0;

      for (const cellMatch of cellMatches) {
        const cm = cellMatch.match(/<c\s+r="([A-Z]+\d+)"([^>]*?)>([\s\S]*?)<\/c>/);
        if (!cm) continue;
        const ref = cm[1], attrs = cm[2], inner = cm[3];
        const col = colIdx(ref);
        if (col > maxCol) maxCol = col;
        const isShared = /t="s"/.test(attrs);
        const styleMatch = attrs.match(/s="(\d+)"/);
        const styleIdx = styleMatch ? parseInt(styleMatch[1]) : -1;
        const vMatch = inner.match(/<v>([^<]*)<\/v>/);
        if (vMatch) {
          const val = vMatch[1];
          if (isShared && strings[parseInt(val)] !== undefined) {
            rowVals[col] = strings[parseInt(val)];
          } else if (dateStyleIds.has(styleIdx)) {
            rowVals[col] = xlDate(val);
          } else {
            const numVal = parseFloat(val);
            if (!isNaN(numVal) && numVal > 40000 && numVal < 55000 && col <= 1) {
              rowVals[col] = xlDate(val);
            } else {
              rowVals[col] = val;
            }
          }
        }
      }

      const parts = [];
      for (let c = 0; c <= maxCol; c++) {
        parts.push(rowVals[c] || '');
      }
      const line = parts.join('\t').replace(/\t+$/, '');
      if (line.trim()) sheetText += line + '\n';
    }

    text += sheetText + '\n';
    sheetSections.push({
      heading: sheetName,
      heading_level: 2,
      section_path: String(si + 1),
      content: sheetText.trim(),
      char_count: sheetText.trim().length,
      structural_metadata: null,
      source_pages: null,
    });
  }

  const finalContent = text.trim() || '[Empty spreadsheet]';
  return {
    type: 'text', name: filename, content: finalContent,
    _structured: {
      type: 'structured', name: filename, source_format: 'xlsx',
      markdown: finalContent, sections: sheetSections, images: [],
      metadata: { title: null, author: null, toc_entries: [], total_chars: finalContent.length, section_count: sheetSections.length, image_count: 0 },
    },
  };
};

// ============================================================
// Main entry point — reads a File object, returns parsed result
// ============================================================

export const readFile = async (file) => {
  if (file.size > MAX_FILE_SIZE) {
    return {
      type: 'text', name: file.name,
      content: '[File too large: ' + Math.round(file.size / 1024 / 1024) + ' MB. Maximum: 100 MB.]'
    };
  }
  const ext = file.name.split('.').pop().toLowerCase();

  // --- EPUB: v2 structured parser ---
  if (ext === 'epub') {
    try {
      const structured = await parseEpub(await file.arrayBuffer(), file.name);

      // Flatten to v1 chapters shape for App.jsx compat
      const chapters = structured.sections.map((sec, i) => ({
        id: 'ch-' + (i + 1),
        title: sec.heading || 'Section ' + (i + 1),
        content: sec.content,
        charCount: sec.char_count,
      }));

      return {
        type: 'epub',
        name: file.name,
        chapters,
        totalChars: chapters.reduce((s, c) => s + c.charCount, 0),
        content: '[EPUB: ' + chapters.length + ' chapters]',
        _structured: structured, // v2 output for future pipeline
      };
    } catch (e) {
      console.error('EPUB v2 parse failed:', e);
      return { type: 'text', name: file.name, content: '[EPUB failed: ' + e.message + ']' };
    }
  }

  // --- DOCX: v2 structured parser ---
  if (ext === 'docx' || ext === 'doc') {
    try {
      const buf = await file.arrayBuffer();

      // .doc (legacy binary) can't be parsed by our DOCX parser
      if (ext === 'doc') {
        return {
          type: 'text', name: file.name,
          content: '[.doc format not supported. Please save as .docx in Word, then re-upload.]'
        };
      }

      const structured = await parseDocx(buf, file.name);

      if (!structured.markdown.trim()) {
        return {
          type: 'text', name: file.name,
          content: '[Could not extract text from ' + file.name + '. Try saving as .txt first.]'
        };
      }

      return {
        type: 'text',
        name: file.name,
        content: structured.markdown,
        _structured: structured, // v2 output for future pipeline
      };
    } catch (e) {
      console.error('DOCX v2 parse failed:', e);
      return { type: 'text', name: file.name, content: '[DOCX parse failed: ' + e.message + ']' };
    }
  }

  // --- PPTX ---
  if (ext === 'pptx') {
    try {
      return await parsePptx(await file.arrayBuffer(), file.name);
    } catch (e) {
      return { type: 'text', name: file.name, content: '[PPTX parse failed: ' + e.message + ']', parseOk: false };
    }
  }

  // --- Spreadsheets ---
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'csv') {
    if (ext === 'csv') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ type: 'text', name: file.name, content: reader.result });
        reader.readAsText(file);
      });
    }
    try {
      return await parseXlsx(await file.arrayBuffer(), file.name);
    } catch (e) {
      console.error('XLSX parse failed:', e);
      return { type: 'text', name: file.name, content: '[Spreadsheet parse failed: ' + e.message + '. Try exporting as .csv or .txt from Excel.]' };
    }
  }

  // --- PDF: v2 structured parser ---
  if (ext === 'pdf') {
    try {
      const structured = await parsePdf(await file.arrayBuffer(), file.name);

      if (structured._errorMessage) {
        return { type: 'text', name: file.name, content: '[' + structured._errorMessage + ']' };
      }

      if (!structured.markdown.trim()) {
        return {
          type: 'text', name: file.name,
          content: '[Could not extract text from ' + file.name + '. Try copying text manually from a PDF reader.]'
        };
      }

      return {
        type: 'text',
        name: file.name,
        content: structured.markdown,
        _structured: structured,
      };
    } catch (e) {
      console.error('PDF parse failed:', e);
      return { type: 'text', name: file.name, content: '[PDF parse failed: ' + e.message + ']' };
    }
  }

  // --- Subtitles (SRT/VTT) ---
  if (ext === 'srt' || ext === 'vtt') {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = reader.result;
        const cleaned = raw
          .replace(/^\d+\s*$/gm, '')
          .replace(/[\d:,.]+ --> [\d:,.]+/g, '')
          .replace(/WEBVTT.*$/m, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{2,}/g, '\n')
          .trim();
        resolve({ type: 'text', name: file.name, content: cleaned });
      };
      reader.readAsText(file);
    });
  }

  // --- Images ---
  if (file.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        type: 'image', name: file.name,
        content: '[Image: ' + file.name + ']',
        base64: reader.result.split(',')[1],
        mediaType: file.type
      });
      reader.readAsDataURL(file);
    });
  }

  // --- Plain text fallback ---
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ type: 'text', name: file.name, content: reader.result });
    reader.readAsText(file);
  });
};
