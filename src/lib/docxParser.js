// ============================================================
// docxParser.js — DOCX → Structured Markdown Parser v2
//
// Parses DOCX via JSZip + direct XML walking. No mammoth
// dependency. Extracts headings, bold/italic, tables, lists,
// images, and produces structured output matching EPUB parser.
//
// Depends on: JSZip (loaded dynamically), htmlToMarkdown.js
// ============================================================

import { splitMarkdownSections, inferSectionPath, computeSectionMetadata } from './htmlToMarkdown.js';
import { safeLoadZip } from './jszip-loader.js';

// --- XML entity decoder ---
function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/**
 * Parse a DOCX file into structured output.
 *
 * @param {ArrayBuffer} buf - Raw DOCX file bytes
 * @param {string} filename - Original filename
 * @returns {Promise<object>} Structured output matching shared contract
 */
export async function parseDocx(buf, filename) {
  const zip = await safeLoadZip(buf);

  // --- 1. Parse styles → heading level map ---
  const styleMap = await parseStyles(zip);

  // --- 2. Parse relationships → image ID map ---
  const rels = await parseRelationships(zip);

  // --- 3. Parse document body ---
  const docXml = await zip.file('word/document.xml')?.async('text');
  if (!docXml) {
    return makeEmptyResult(filename);
  }

  // --- 4. Walk body elements, build markdown + metadata ---
  const { markdown, metadata, imageRefs } = parseBody(docXml, styleMap);

  if (!markdown.trim()) {
    return makeEmptyResult(filename);
  }

  // --- 5. Extract images ---
  const images = await extractImages(zip, rels, imageRefs);

  // --- 6. Split into sections ---
  const rawSections = splitMarkdownSections(markdown, 2);

  const sections = rawSections.map((sec, i) => ({
    heading: sec.heading,
    heading_level: sec.heading_level,
    section_path: inferSectionPath(sec.heading, i),
    content: sec.content,
    char_count: sec.char_count,
    structural_metadata: computeSectionMetadata(sec.content),
    source_pages: null,
  }));

  // If no sections were split (no H2s found), use whole doc as one section
  if (sections.length === 0) {
    sections.push({
      heading: null,
      heading_level: 0,
      section_path: '1',
      content: markdown,
      char_count: markdown.length,
      structural_metadata: metadata,
      source_pages: null,
    });
  }

  // --- 7. Parse document metadata ---
  const docMeta = await parseDocumentMetadata(zip);

  return {
    type: 'structured',
    name: filename,
    source_format: 'docx',
    markdown,
    sections,
    images,
    metadata: {
      title: docMeta.title,
      author: docMeta.author,
      toc_entries: [], // DOCX TOC extraction is complex; defer
      total_chars: markdown.length,
      section_count: sections.length,
      image_count: images.length,
    },
  };
}


// ============================================================
// Style parsing
// ============================================================

async function parseStyles(zip) {
  const stylesXml = await zip.file('word/styles.xml')?.async('text');
  if (!stylesXml) return {};

  const map = {};

  // Parse each <w:style> block
  const styleRegex = /<w:style\s[^>]*?w:styleId="([^"]*)"[^>]*>([\s\S]*?)<\/w:style>/gi;
  let m;
  while ((m = styleRegex.exec(stylesXml))) {
    const id = m[1];
    const inner = m[2];
    const nameMatch = inner.match(/<w:name\s+w:val="([^"]*)"/i);
    const basedOnMatch = inner.match(/<w:basedOn\s+w:val="([^"]*)"/i);

    map[id] = {
      name: nameMatch ? nameMatch[1] : id,
      basedOn: basedOnMatch ? basedOnMatch[1] : null,
    };
  }

  return map;
}

function getHeadingLevel(styleId, styleMap) {
  if (!styleId || !styleMap[styleId]) return null;

  const name = styleMap[styleId].name.toLowerCase();

  // Standard: "Heading 1" through "Heading 9"
  const hMatch = name.match(/^heading\s*(\d)$/);
  if (hMatch) return parseInt(hMatch[1]);

  // Title = H1, Subtitle = H2
  if (/^title$/i.test(name)) return 1;
  if (/^subtitle$/i.test(name)) return 2;

  // French/German/Spanish variants
  if (/^(titre|überschrift|título)\s*(\d)/i.test(name)) {
    const num = name.match(/(\d)/);
    if (num) return parseInt(num[1]);
  }

  // Walk basedOn chain (max depth 5 to prevent cycles)
  const basedOn = styleMap[styleId].basedOn;
  if (basedOn && basedOn !== styleId) {
    return getHeadingLevel(basedOn, styleMap);
  }

  return null;
}


// ============================================================
// Relationship parsing
// ============================================================

async function parseRelationships(zip) {
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('text');
  if (!relsXml) return {};

  const map = {};
  const relRegex = /<Relationship\s+[^>]*?Id="([^"]*)"[^>]*?Target="([^"]*)"[^>]*?Type="([^"]*)"[^>]*?\/?>/gi;
  let m;
  while ((m = relRegex.exec(relsXml))) {
    map[m[1]] = { target: m[2], type: m[3] };
  }
  return map;
}


// ============================================================
// Stack-based XML element extractor — handles nested elements
// ============================================================

const MAX_XML_DEPTH = 100;
const MAX_XML_ELEMENTS = 50000;

/**
 * Extract top-level child elements of a given tag name from XML.
 * Uses depth-tracking to correctly handle nested elements of the same type.
 */
function extractElements(xml, tagName) {
  const results = [];
  const openPrefix = '<' + tagName;
  const closeTag = '</' + tagName + '>';
  let pos = 0;

  while (pos < xml.length && results.length < MAX_XML_ELEMENTS) {
    const openIdx = xml.indexOf(openPrefix, pos);
    if (openIdx === -1) break;

    // Verify it's actually this tag (not a prefix like <w:pPr>)
    const afterTag = openIdx + openPrefix.length;
    const ch = xml[afterTag];
    if (ch !== ' ' && ch !== '>' && ch !== '/') {
      pos = afterTag;
      continue;
    }

    // Find end of opening tag
    const gt = xml.indexOf('>', openIdx);
    if (gt === -1) break;

    // Self-closing?
    if (xml[gt - 1] === '/') {
      pos = gt + 1;
      continue;
    }

    const attrs = xml.substring(afterTag, gt).trim();

    // Find matching close tag with depth tracking
    let depth = 1;
    let searchPos = gt + 1;
    let closeIdx = -1;
    let depthLimit = MAX_XML_DEPTH;

    while (searchPos < xml.length && depth > 0 && depthLimit > 0) {
      const nextLt = xml.indexOf('<', searchPos);
      if (nextLt === -1) break;

      if (xml.startsWith(closeTag, nextLt)) {
        depth--;
        if (depth === 0) {
          closeIdx = nextLt;
          break;
        }
        searchPos = nextLt + closeTag.length;
      } else if (xml.startsWith(openPrefix, nextLt)) {
        const c = xml[nextLt + openPrefix.length];
        if (c === ' ' || c === '>' || c === '/') {
          const innerGt = xml.indexOf('>', nextLt);
          if (innerGt !== -1 && xml[innerGt - 1] !== '/') {
            depth++;
            depthLimit--;
          }
          searchPos = (innerGt !== -1 ? innerGt : nextLt) + 1;
        } else {
          searchPos = nextLt + 1;
        }
      } else {
        searchPos = nextLt + 1;
      }
    }

    if (closeIdx !== -1) {
      const inner = xml.substring(gt + 1, closeIdx);
      results.push({ attrs, inner });
      pos = closeIdx + closeTag.length;
    } else {
      // Unclosed tag — skip past opening tag
      pos = gt + 1;
    }
  }

  return results;
}


// ============================================================
// Body parsing — the core conversion
// ============================================================

function parseBody(docXml, styleMap) {
  const metadata = {
    bold_term_count: 0, bold_terms: [], definition_count: 0, definitions: [],
    example_count: 0, code_block_count: 0, table_count: 0, image_count: 0,
    images: [], list_count: 0, equation_indicators: 0,
  };
  const boldTermSet = new Set();
  const imageRefs = [];
  const mdParts = [];
  let paraIndex = 0;

  // Extract body content
  const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) return { markdown: '', metadata, imageRefs };
  const bodyXml = bodyMatch[1];

  // Walk top-level elements in document order using sequential scan
  // We need to find <w:p>, <w:tbl>, <w:sdt> in order of appearance
  const tagNames = ['w:p', 'w:tbl', 'w:sdt'];
  const allElements = [];

  for (const tag of tagNames) {
    const openPrefix = '<' + tag;
    const closeTag = '</' + tag + '>';
    let pos = 0;

    while (pos < bodyXml.length && allElements.length < MAX_XML_ELEMENTS) {
      const openIdx = bodyXml.indexOf(openPrefix, pos);
      if (openIdx === -1) break;

      const afterTag = openIdx + openPrefix.length;
      const ch = bodyXml[afterTag];
      if (ch !== ' ' && ch !== '>' && ch !== '/') {
        pos = afterTag;
        continue;
      }

      const gt = bodyXml.indexOf('>', openIdx);
      if (gt === -1) break;

      if (bodyXml[gt - 1] === '/') {
        pos = gt + 1;
        continue;
      }

      // Find matching close with depth tracking
      let depth = 1;
      let searchPos = gt + 1;
      let closeIdx = -1;
      let depthLimit = MAX_XML_DEPTH;

      while (searchPos < bodyXml.length && depth > 0 && depthLimit > 0) {
        const nextLt = bodyXml.indexOf('<', searchPos);
        if (nextLt === -1) break;

        if (bodyXml.startsWith(closeTag, nextLt)) {
          depth--;
          if (depth === 0) { closeIdx = nextLt; break; }
          searchPos = nextLt + closeTag.length;
        } else if (bodyXml.startsWith(openPrefix, nextLt)) {
          const c = bodyXml[nextLt + openPrefix.length];
          if (c === ' ' || c === '>' || c === '/') {
            const innerGt = bodyXml.indexOf('>', nextLt);
            if (innerGt !== -1 && bodyXml[innerGt - 1] !== '/') {
              depth++;
              depthLimit--;
            }
            searchPos = (innerGt !== -1 ? innerGt : nextLt) + 1;
          } else {
            searchPos = nextLt + 1;
          }
        } else {
          searchPos = nextLt + 1;
        }
      }

      if (closeIdx !== -1) {
        const inner = bodyXml.substring(gt + 1, closeIdx);
        const type = tag.split(':')[1]; // 'p', 'tbl', 'sdt'
        allElements.push({ type, inner, startPos: openIdx });
        pos = closeIdx + closeTag.length;
      } else {
        pos = gt + 1;
      }
    }
  }

  // Sort by document order (position in the XML)
  allElements.sort((a, b) => a.startPos - b.startPos);

  for (const elem of allElements) {
    if (elem.type === 'p') {
      const result = parseParagraph(elem.inner, styleMap, paraIndex);
      if (result.text || result.imageRef) {
        mdParts.push(result.markdown);
        paraIndex++;

        for (const term of result.boldTerms) {
          boldTermSet.add(term);
        }
        if (result.imageRef) {
          imageRefs.push({ ref: result.imageRef, position: 'after_para_' + paraIndex, altText: result.imageAltText || '' });
          metadata.image_count++;
        }
        if (result.isCode) metadata.code_block_count++;
        if (result.hasEquation) metadata.equation_indicators++;
      }
    } else if (elem.type === 'tbl') {
      const tableMd = parseTable(elem.inner, styleMap);
      if (tableMd) {
        mdParts.push(tableMd);
        metadata.table_count++;
      }
    }
    // <w:sdt> — skip for now (TOC wrappers)
  }

  metadata.bold_terms = [...boldTermSet];
  metadata.bold_term_count = metadata.bold_terms.length;

  const markdown = mdParts.join('');
  const listBlocks = markdown.match(/(?:^(?:- |\d+\. ).+\n)+/gm) || [];
  metadata.list_count = listBlocks.length;

  const defMatches = markdown.match(/\*\*[^*]+\*\*\s*[:—–-]\s*[A-Z]/g) || [];
  metadata.definition_count = defMatches.length;
  for (const d of defMatches) {
    const term = d.match(/\*\*([^*]+)\*\*/)?.[1];
    if (term) metadata.definitions.push(term);
  }

  metadata.example_count = (markdown.match(/^(?:example|worked example)\s+\d/gim) || []).length;

  return { markdown, metadata, imageRefs };
}

function parseParagraph(xml, styleMap) {
  const result = {
    text: '', markdown: '', boldTerms: [], imageRef: null,
    isCode: false, hasEquation: false,
  };

  // Style / heading level
  const styleMatch = xml.match(/<w:pStyle\s+w:val="([^"]*)"/);
  const styleId = styleMatch ? styleMatch[1] : null;
  const headingLevel = getHeadingLevel(styleId, styleMap);

  // List detection
  const numIdMatch = xml.match(/<w:numId\s+w:val="(\d+)"/);
  const ilvlMatch = xml.match(/<w:ilvl\s+w:val="(\d+)"/);
  const isListItem = numIdMatch && numIdMatch[1] !== '0';
  const listLevel = ilvlMatch ? parseInt(ilvlMatch[1]) : 0;

  // Image detection
  const embedMatch = xml.match(/r:embed="([^"]*)"/);
  if (embedMatch && (/<w:drawing>/.test(xml) || /<w:pict>/.test(xml))) {
    result.imageRef = embedMatch[1];
    // Extract alt text from docPr element
    const descrMatch = xml.match(/<wp:docPr[^>]*?\sdescr="([^"]*)"/);
    if (descrMatch) {
      result.imageAltText = decodeXmlEntities(descrMatch[1]);
    }
  }

  // Equation detection (OMML)
  if (/<m:oMath/.test(xml)) {
    result.hasEquation = true;
  }

  // Extract runs
  const runs = [];
  const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let rm;
  while ((rm = runRegex.exec(xml))) {
    const runXml = rm[1];

    // Get all text nodes (may have multiple <w:t> per run, plus <w:tab>, <w:br>)
    let text = '';
    const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tm;
    while ((tm = textRegex.exec(runXml))) {
      text += decodeXmlEntities(tm[1]);
    }

    // Handle tabs and breaks
    if (/<w:tab\s*\/>/.test(runXml)) text += '\t';
    if (/<w:br\s*\/>/.test(runXml)) text += '\n';

    if (!text) continue;

    // Formatting
    const isBold = /<w:b\s*\/?>/.test(runXml) && !/<w:b\s+w:val="(false|0)"/.test(runXml);
    const isItalic = /<w:i\s*\/?>/.test(runXml) && !/<w:i\s+w:val="(false|0)"/.test(runXml);
    const isCode = /<w:rFonts[^>]*w:ascii="(Consolas|Courier New|Monaco|Menlo|Lucida Console)/i.test(runXml);

    runs.push({ text, bold: isBold, italic: isItalic, code: isCode });
  }

  // Build inline markdown from runs
  let inline = '';
  let currentBold = false;
  let currentItalic = false;
  let currentCode = false;
  let boldBuffer = '';

  for (const run of runs) {
    // Close previous formatting if changed
    if (currentCode && !run.code) { inline += '`'; currentCode = false; }
    if (currentBold && !run.bold) {
      inline += '**';
      if (boldBuffer.trim().length > 0 && boldBuffer.trim().length < 80) {
        result.boldTerms.push(boldBuffer.trim());
      }
      boldBuffer = '';
      currentBold = false;
    }
    if (currentItalic && !run.italic) { inline += '*'; currentItalic = false; }

    // Open new formatting
    if (run.code && !currentCode) { inline += '`'; currentCode = true; }
    if (run.bold && !currentBold) { inline += '**'; currentBold = true; }
    if (run.italic && !currentItalic && !run.bold) { inline += '*'; currentItalic = true; }

    inline += run.text;
    if (run.bold) boldBuffer += run.text;
  }

  // Close any open formatting
  if (currentCode) inline += '`';
  if (currentBold) {
    inline += '**';
    if (boldBuffer.trim().length > 0 && boldBuffer.trim().length < 80) {
      result.boldTerms.push(boldBuffer.trim());
    }
  }
  if (currentItalic) inline += '*';

  const text = inline.trim();
  if (!text && !result.imageRef) return result;
  result.text = text;

  // Build paragraph markdown
  if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
    result.markdown = '\n\n' + '#'.repeat(headingLevel) + ' ' + text + '\n\n';
  } else if (isListItem) {
    const indent = '  '.repeat(listLevel);
    result.markdown = indent + '- ' + text + '\n';
  } else if (result.imageRef) {
    result.markdown = text ? text + '\n\n![image](embedded)\n\n' : '![image](embedded)\n\n';
    result.isCode = false;
  } else {
    result.markdown = text + '\n\n';
  }

  return result;
}

function parseTable(tableXml, styleMap) {
  const rows = [];
  const trElements = extractElements(tableXml, 'w:tr');

  for (const tr of trElements) {
    const cells = [];
    const tcElements = extractElements(tr.inner, 'w:tc');

    for (const tc of tcElements) {
      const cellText = [];
      const pElements = extractElements(tc.inner, 'w:p');
      for (const p of pElements) {
        const result = parseParagraph(p.inner, styleMap, 0);
        if (result.text) cellText.push(result.text);
      }
      cells.push(cellText.join(' '));
    }

    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return '';

  // Normalize column count
  const colCount = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });

  // Build markdown table
  const lines = [];
  lines.push('| ' + normalized[0].join(' | ') + ' |');
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < normalized.length; i++) {
    lines.push('| ' + normalized[i].join(' | ') + ' |');
  }
  return '\n' + lines.join('\n') + '\n\n';
}


// ============================================================
// Image extraction
// ============================================================

async function extractImages(zip, rels, imageRefs) {
  const images = [];

  for (const ref of imageRefs) {
    const rel = rels[ref.ref];
    if (!rel) continue;

    const target = rel.target;
    // Resolve relative path from word/ directory
    const path = target.startsWith('/') ? target.substring(1) :
                 target.startsWith('word/') ? target : 'word/' + target;

    const file = zip.file(path);
    if (!file) continue;

    try {
      const data = await file.async('arraybuffer');
      const ext = path.split('.').pop().toLowerCase();
      const mediaTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', emf: 'image/emf', wmf: 'image/wmf' };

      images.push({
        id: 'img-' + (images.length + 1),
        filename: path.split('/').pop(),
        data,
        media_type: mediaTypes[ext] || 'image/png',
        size_bytes: data.byteLength,
        width: null,
        height: null,
        section_index: -1, // Would need to map back to sections
        position: ref.position,
        alt_text: ref.altText || '',
        caption: null,
      });
    } catch { /* Skip unreadable images */ }
  }

  return images;
}


// ============================================================
// Document metadata
// ============================================================

async function parseDocumentMetadata(zip) {
  const coreXml = await zip.file('docProps/core.xml')?.async('text');
  if (!coreXml) return { title: null, author: null };

  const title = coreXml.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1]?.trim() || null;
  const author = coreXml.match(/<dc:creator>([^<]+)<\/dc:creator>/)?.[1]?.trim() || null;

  return { title, author };
}


// ============================================================
// Helpers
// ============================================================

function makeEmptyResult(filename) {
  return {
    type: 'structured', name: filename, source_format: 'docx',
    markdown: '', sections: [], images: [],
    metadata: { title: null, author: null, toc_entries: [], total_chars: 0, section_count: 0, image_count: 0 },
  };
}

// computeSectionMetadata imported from htmlToMarkdown.js
