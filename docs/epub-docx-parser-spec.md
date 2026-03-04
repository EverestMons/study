# EPUB and DOCX Parser Implementation Spec

## Overview

The v1 parsers extract plain text. The v2 parsers need to extract **structured markdown** — preserving headings, bold terms, definitions, tables, images, and lists — so the universal chunker (chunk-boundary-spec.md) can split at heading boundaries and the skill extractor gets rich structural metadata.

Both parsers run in the browser (JSZip-based, no server dependency). PDF parsing is handled by the Python sidecar (python-sidecar-spec.md). PPTX, XLSX, SRT/VTT, and TXT parsers are adequate as-is.

---

## Shared Output Contract

Both EPUB and DOCX parsers produce the same output shape, which feeds into `chunkDocument()`:

```javascript
{
  type: "structured",            // New type — v1 used "epub" or "text"
  name: "filename.epub",
  source_format: "epub",         // or "docx"
  
  // The full document as markdown (for single-chunk fallback)
  markdown: "# Chapter 1\n\n## Section 1.1\n\n...",
  
  // Pre-split sections with heading hierarchy (primary output)
  sections: [
    {
      heading: "1.1 The Limit Definition",
      heading_level: 2,           // 1-6
      section_path: "1.1",        // Dot-notation position
      content: "## 1.1 The Limit Definition\n\nThe derivative of...",
      char_count: 3400,
      structural_metadata: {
        bold_term_count: 5,
        bold_terms: ["derivative", "limit", "continuous", ...],
        definition_count: 2,
        definitions: ["The derivative of f at x is defined as...", ...],
        example_count: 1,
        code_block_count: 0,
        table_count: 0,
        image_count: 1,
        images: [{ position: "after_para_3", alt: "Graph of f(x)", src: "images/fig1.png" }],
        list_count: 0,
        equation_indicators: 3,   // Count of likely equations (inline math notation, special symbols)
      },
      source_pages: null,         // Not applicable for EPUB/DOCX
    },
    // ... more sections
  ],
  
  // Images extracted from the document (for chunk_media storage)
  images: [
    {
      id: "img-1",
      filename: "fig1.png",
      data: <ArrayBuffer>,        // Raw image bytes
      media_type: "image/png",
      size_bytes: 45000,
      width: 600,
      height: 400,
      section_index: 0,           // Which section this image belongs to
      position: "after_para_3",   // Position within that section
      alt_text: "Graph of f(x)",
      caption: "Figure 1.1: ...", // If detected
    },
  ],
  
  // Document-level metadata
  metadata: {
    title: "Calculus: Early Transcendentals",
    author: "James Stewart",
    toc_entries: [                 // From nav document or DOCX ToC
      { title: "Chapter 1: Functions", level: 1, section_path: "1" },
      { title: "1.1 Four Ways to Represent a Function", level: 2, section_path: "1.1" },
      // ...
    ],
    total_chars: 245000,
    section_count: 47,
    image_count: 23,
  }
}
```

---

## EPUB Parser v2

### What changes from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Text extraction | `stripHtml()` → plain text | HTML → structured markdown |
| Heading detection | First `<h1>`/`<h2>` for title only | All heading tags parsed, hierarchy tracked |
| Bold/emphasis | Stripped | Preserved as `**bold**` / `*italic*` in markdown, counted in metadata |
| Definitions | Lost | `<dfn>` tags detected, counted |
| Tables | Lost | Converted to markdown tables |
| Images | Lost | Extracted to ArrayBuffer, position recorded |
| Lists | Lost | Converted to markdown lists |
| Code blocks | Lost | `<pre>`/`<code>` → fenced code blocks |
| Chapter merging | Merge by chapter number | Kept, but now operates on structured sections |
| TOC/Nav | Ignored | Parsed for section_path validation |

### Implementation

#### Phase 1: HTML → Markdown Conversion

Replace `stripHtml()` with `htmlToMarkdown()` — a function that converts EPUB HTML content to markdown while tracking structural metadata.

```javascript
function htmlToMarkdown(html) {
  // Returns { markdown, metadata }
  // Uses DOM parsing (createElement + walking), not regex
  
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  const metadata = {
    bold_term_count: 0,
    bold_terms: [],
    definition_count: 0,
    definitions: [],
    example_count: 0,
    code_block_count: 0,
    table_count: 0,
    image_count: 0,
    images: [],
    list_count: 0,
    equation_indicators: 0,
  };
  
  let md = '';
  let paraIndex = 0;
  
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(walk).join('');
    
    switch (tag) {
      // Headings
      case 'h1': return '\n# ' + children().trim() + '\n\n';
      case 'h2': return '\n## ' + children().trim() + '\n\n';
      case 'h3': return '\n### ' + children().trim() + '\n\n';
      case 'h4': return '\n#### ' + children().trim() + '\n\n';
      case 'h5': return '\n##### ' + children().trim() + '\n\n';
      case 'h6': return '\n###### ' + children().trim() + '\n\n';
      
      // Paragraphs
      case 'p': {
        paraIndex++;
        return children().trim() + '\n\n';
      }
      
      // Emphasis
      case 'strong': case 'b': {
        const text = children().trim();
        if (text.length > 0 && text.length < 100) {
          metadata.bold_term_count++;
          metadata.bold_terms.push(text);
        }
        return '**' + text + '**';
      }
      case 'em': case 'i':
        return '*' + children().trim() + '*';
      
      // Definitions
      case 'dfn': {
        const text = children().trim();
        metadata.definition_count++;
        metadata.bold_term_count++;
        metadata.bold_terms.push(text);
        return '**' + text + '**';
      }
      
      // Code
      case 'code':
        return '`' + children().trim() + '`';
      case 'pre': {
        metadata.code_block_count++;
        return '\n```\n' + children().trim() + '\n```\n\n';
      }
      
      // Lists
      case 'ul': case 'ol': {
        metadata.list_count++;
        return '\n' + children() + '\n';
      }
      case 'li': {
        const parent = node.parentElement?.tagName.toLowerCase();
        const prefix = parent === 'ol' ? '1. ' : '- ';
        return prefix + children().trim() + '\n';
      }
      
      // Tables
      case 'table': {
        metadata.table_count++;
        return '\n' + convertTable(node) + '\n\n';
      }
      
      // Images
      case 'img': {
        metadata.image_count++;
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        metadata.images.push({
          position: 'after_para_' + paraIndex,
          alt: alt,
          src: src,
        });
        return '\n[IMAGE: ' + (alt || src || 'figure') + ']\n\n';
      }
      case 'figure': {
        // Process children (img + figcaption)
        return '\n' + children() + '\n';
      }
      case 'figcaption': {
        return '*' + children().trim() + '*\n\n';
      }
      
      // Block quotes
      case 'blockquote':
        return '\n> ' + children().trim().replace(/\n/g, '\n> ') + '\n\n';
      
      // Line breaks
      case 'br':
        return '\n';
      
      // Divs and spans — pass through
      case 'div': case 'span': case 'section': case 'article':
        return children();
      
      // Skip non-content elements
      case 'script': case 'style': case 'nav': case 'header': case 'footer':
        return '';
      
      // Math indicators
      case 'math': case 'mml:math': {
        metadata.equation_indicators++;
        return '[EQUATION]';
      }
      case 'sup': {
        const text = children().trim();
        // Superscripts in math context suggest equations
        if (/^\d+$/.test(text)) metadata.equation_indicators++;
        return '^' + text;
      }
      
      default:
        return children();
    }
  }
  
  md = walk(body);
  
  // Clean up excessive whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  
  // Detect bold terms that look like definitions
  // Pattern: **term** followed by "is", "refers to", "means", "defined as"
  const defPattern = /\*\*([^*]+)\*\*\s+(is|refers to|means|are|can be defined as|is defined as)/gi;
  let defMatch;
  while ((defMatch = defPattern.exec(md)) !== null) {
    // Extract the sentence containing the definition
    const start = Math.max(0, defMatch.index - 20);
    const end = md.indexOf('.', defMatch.index + defMatch[0].length);
    if (end > 0) {
      metadata.definitions.push(md.substring(start, end + 1).trim());
    }
  }
  
  return { markdown: md, metadata };
}
```

#### Phase 2: Section Splitting from Markdown

After `htmlToMarkdown()` produces markdown for each EPUB HTML file, and after chapter merging, split the merged content into sections at heading boundaries:

```javascript
function splitMarkdownSections(markdown, baseHeadingLevel = 2) {
  const lines = markdown.split('\n');
  const sections = [];
  let currentSection = null;
  let sectionCounters = {};  // Track numbering per level
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      
      if (level <= baseHeadingLevel) {
        // This is a split-point heading
        if (currentSection) {
          sections.push(finalizeSection(currentSection));
        }
        
        currentSection = {
          heading: title,
          heading_level: level,
          section_path: detectSectionPath(title) || generateSectionPath(level, sectionCounters),
          lines: [line],
          metadata: {
            bold_term_count: 0, bold_terms: [],
            definition_count: 0, definitions: [],
            example_count: 0, code_block_count: 0,
            table_count: 0, image_count: 0, images: [],
            list_count: 0, equation_indicators: 0,
          },
        };
      } else {
        // Sub-heading — stays in current section
        if (currentSection) {
          currentSection.lines.push(line);
        }
      }
    } else {
      if (currentSection) {
        currentSection.lines.push(line);
      } else {
        // Content before first heading — create preamble section
        if (!sections.length || sections[sections.length - 1].heading !== '__preamble__') {
          currentSection = {
            heading: '__preamble__',
            heading_level: null,
            section_path: '0',
            lines: [line],
            metadata: { /* ... */ },
          };
        }
      }
    }
  }
  
  if (currentSection) {
    sections.push(finalizeSection(currentSection));
  }
  
  return sections;
}

function detectSectionPath(title) {
  // "5.3 The Chain Rule" → "5.3"
  // "Chapter 5: Derivatives" → "5"
  // "Section 12.4.1" → "12.4.1"
  const m = title.match(/^(?:Chapter\s+|Section\s+)?(\d+(?:\.\d+)*)/i);
  return m ? m[1] : null;
}
```

#### Phase 3: EPUB Navigation Document

EPUB 3 includes `nav.xhtml`; EPUB 2 includes `toc.ncx`. Parse these for the authoritative table of contents:

```javascript
async function parseEpubNav(zip, opfDir, manifest) {
  // Try EPUB 3 nav.xhtml first
  const navItem = Object.values(manifest).find(
    m => m.type?.includes('html') && m.properties?.includes('nav')
  );
  
  if (navItem) {
    const navHtml = await zip.file(opfDir + navItem.href)?.async('text');
    if (navHtml) {
      return parseNavXhtml(navHtml);
    }
  }
  
  // Fall back to EPUB 2 toc.ncx
  const ncxItem = Object.values(manifest).find(
    m => m.type === 'application/x-dtbncx+xml'
  );
  
  if (ncxItem) {
    const ncxXml = await zip.file(opfDir + ncxItem.href)?.async('text');
    if (ncxXml) {
      return parseNcx(ncxXml);
    }
  }
  
  return [];
}

function parseNavXhtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nav = doc.querySelector('nav[epub\\:type="toc"], nav#toc, nav');
  if (!nav) return [];
  
  const entries = [];
  function walkList(ol, level) {
    if (!ol) return;
    for (const li of ol.querySelectorAll(':scope > li')) {
      const a = li.querySelector(':scope > a');
      if (a) {
        entries.push({
          title: a.textContent.trim(),
          href: a.getAttribute('href'),
          level: level,
        });
      }
      const subOl = li.querySelector(':scope > ol');
      if (subOl) walkList(subOl, level + 1);
    }
  }
  
  walkList(nav.querySelector('ol'), 1);
  return entries;
}
```

#### Phase 4: Image Extraction

Images in EPUB are files inside the zip archive, referenced by `<img src="...">` in HTML:

```javascript
async function extractEpubImages(zip, opfDir, manifest, sections) {
  const images = [];
  
  // Find all image entries in manifest
  const imageItems = Object.values(manifest).filter(
    m => m.type?.startsWith('image/')
  );
  
  for (const item of imageItems) {
    const path = opfDir + item.href;
    const file = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!file) continue;
    
    const data = await file.async('arraybuffer');
    const filename = item.href.split('/').pop();
    
    // Find which section references this image
    let sectionIndex = -1;
    let position = null;
    for (let i = 0; i < sections.length; i++) {
      for (const img of sections[i].structural_metadata.images || []) {
        if (img.src?.includes(filename) || img.src?.includes(item.href)) {
          sectionIndex = i;
          position = img.position;
          break;
        }
      }
      if (sectionIndex >= 0) break;
    }
    
    images.push({
      id: 'img-' + (images.length + 1),
      filename: filename,
      data: data,
      media_type: item.type,
      size_bytes: data.byteLength,
      section_index: sectionIndex,
      position: position,
      alt_text: '', // Filled from section metadata
    });
  }
  
  return images;
}
```

#### Phase 5: Updated parseEpub

The main function, assembling all phases:

```javascript
async function parseEpub(buf) {
  const Z = await loadJSZip();
  const zip = await Z.loadAsync(buf);
  
  // 1. Parse OPF manifest and spine (existing, unchanged)
  const { manifest, spineIds, opfDir } = await parseOpf(zip);
  
  // 2. Extract HTML files in spine order
  const rawSections = [];
  for (const id of spineIds) {
    const item = manifest[id];
    if (!item?.type?.includes('html')) continue;
    const path = opfDir + item.href;
    const file = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!file) continue;
    const html = await file.async('text');
    const { markdown, metadata } = htmlToMarkdown(html);
    if (markdown.length < 20) continue;
    
    // Detect title (same logic as v1, from heading or <title>)
    const title = detectTitle(html, markdown);
    
    rawSections.push({ title, markdown, metadata, href: item.href });
  }
  
  // 3. Chapter merging (existing logic, adapted for structured sections)
  const chapters = mergeChapters(rawSections);
  
  // 4. Within-chapter section splitting
  const allSections = [];
  for (const chapter of chapters) {
    const splits = splitMarkdownSections(chapter.markdown, 2);
    if (splits.length === 0) {
      // No sub-headings — the chapter itself is one section
      allSections.push({
        heading: chapter.title,
        heading_level: 1,
        section_path: detectSectionPath(chapter.title) || String(allSections.length + 1),
        content: chapter.markdown,
        char_count: chapter.markdown.length,
        structural_metadata: chapter.metadata,
      });
    } else {
      allSections.push(...splits);
    }
  }
  
  // 5. Parse TOC for validation
  const toc = await parseEpubNav(zip, opfDir, manifest);
  
  // 6. Extract images
  const images = await extractEpubImages(zip, opfDir, manifest, allSections);
  
  // 7. Assemble output
  return {
    type: 'structured',
    source_format: 'epub',
    markdown: allSections.map(s => s.content).join('\n\n'),
    sections: allSections,
    images: images,
    metadata: {
      title: detectDocumentTitle(rawSections, toc),
      author: '', // From OPF metadata if available
      toc_entries: toc,
      total_chars: allSections.reduce((s, sec) => s + sec.char_count, 0),
      section_count: allSections.length,
      image_count: images.length,
    },
  };
}
```

---

## DOCX Parser v2

### What changes from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Primary method | mammoth (dynamic import, unreliable) | JSZip + direct XML parsing (reliable, no external dep) |
| Fallback | Regex XML stripping | N/A — JSZip is the primary method |
| Heading detection | None | Paragraph style-based (`<w:pStyle>`) |
| Bold/emphasis | Lost | `<w:b>` / `<w:i>` run properties detected |
| Tables | Lost | `<w:tbl>` → markdown tables |
| Images | Lost | `<w:drawing>` → extracted from `word/media/` |
| Lists | Lost | `<w:numPr>` → markdown lists |
| Structure output | Plain text string | Same structured output as EPUB |

### Implementation

#### Understanding DOCX XML Structure

A DOCX file is a zip containing:
- `word/document.xml` — the main content
- `word/styles.xml` — style definitions (maps style IDs to names like "Heading 1")
- `word/numbering.xml` — list/numbering definitions
- `word/media/` — embedded images
- `word/_rels/document.xml.rels` — relationships (links images to their content references)

The document body is a sequence of `<w:p>` (paragraph) and `<w:tbl>` (table) elements. Each paragraph contains `<w:r>` (run) elements, each containing `<w:t>` (text) with optional `<w:rPr>` (run properties) for bold, italic, etc.

#### Phase 1: Style Map

```javascript
async function parseDocxStyles(zip) {
  const stylesXml = await zip.file('word/styles.xml')?.async('text');
  if (!stylesXml) return {};
  
  const styleMap = {};
  // Match <w:style> elements and extract ID, name, basedOn
  const styleRegex = /<w:style\s[^>]*w:styleId="([^"]*)"[^>]*>([\s\S]*?)<\/w:style>/gi;
  let m;
  while ((m = styleRegex.exec(stylesXml)) !== null) {
    const id = m[1];
    const inner = m[2];
    const nameMatch = inner.match(/<w:name\s+w:val="([^"]*)"/i);
    const basedOnMatch = inner.match(/<w:basedOn\s+w:val="([^"]*)"/i);
    
    styleMap[id] = {
      name: nameMatch ? nameMatch[1] : id,
      basedOn: basedOnMatch ? basedOnMatch[1] : null,
    };
  }
  
  return styleMap;
}

function getHeadingLevel(styleId, styleMap) {
  if (!styleId || !styleMap[styleId]) return null;
  
  const name = styleMap[styleId].name.toLowerCase();
  
  // Standard heading styles
  const headingMatch = name.match(/^heading\s*(\d)$/i);
  if (headingMatch) return parseInt(headingMatch[1]);
  
  // Common variants
  if (/^title$/i.test(name)) return 1;
  if (/^subtitle$/i.test(name)) return 2;
  
  // Check basedOn chain
  const basedOn = styleMap[styleId].basedOn;
  if (basedOn) return getHeadingLevel(basedOn, styleMap);
  
  return null;
}
```

#### Phase 2: Document Body Parsing

```javascript
async function parseDocxBody(zip, styleMap) {
  const docXml = await zip.file('word/document.xml')?.async('text');
  if (!docXml) return { elements: [], markdown: '' };
  
  const elements = [];  // { type: 'paragraph'|'table', ... }
  
  // Parse paragraphs
  // We walk the body content sequentially to preserve document order
  const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) return { elements: [], markdown: '' };
  
  const bodyContent = bodyMatch[1];
  
  // Match top-level elements: paragraphs and tables
  const elementRegex = /<w:(p|tbl)\b[^>]*>([\s\S]*?)<\/w:\1>/g;
  let em;
  while ((em = elementRegex.exec(bodyContent)) !== null) {
    const type = em[1];
    const inner = em[2];
    
    if (type === 'p') {
      elements.push(parseParagraph(inner, styleMap));
    } else if (type === 'tbl') {
      elements.push(parseTable(inner, styleMap));
    }
  }
  
  return elements;
}

function parseParagraph(xml, styleMap) {
  // Extract style
  const styleMatch = xml.match(/<w:pStyle\s+w:val="([^"]*)"/);
  const styleId = styleMatch ? styleMatch[1] : null;
  const headingLevel = getHeadingLevel(styleId, styleMap);
  
  // Extract numbering (lists)
  const numMatch = xml.match(/<w:numId\s+w:val="(\d+)"/);
  const ilvlMatch = xml.match(/<w:ilvl\s+w:val="(\d+)"/);
  const isListItem = numMatch !== null;
  const listLevel = ilvlMatch ? parseInt(ilvlMatch[1]) : 0;
  
  // Extract runs (text with formatting)
  const runs = [];
  const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let rm;
  while ((rm = runRegex.exec(xml)) !== null) {
    const runXml = rm[1];
    const textMatch = runXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (!textMatch) continue;
    
    const text = textMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    
    const isBold = /<w:b\s*\/?>/.test(runXml) || /<w:b\s+w:val="true"/.test(runXml);
    // Exclude b with val="false" (explicitly not bold)
    const isBoldFalse = /<w:b\s+w:val="(false|0)"/.test(runXml);
    const isItalic = /<w:i\s*\/?>/.test(runXml) || /<w:i\s+w:val="true"/.test(runXml);
    const isCode = /<w:rFonts[^>]*w:ascii="(Consolas|Courier|Monaco|Menlo|monospace)"/i.test(runXml);
    
    runs.push({
      text,
      bold: isBold && !isBoldFalse,
      italic: isItalic,
      code: isCode,
    });
  }
  
  // Check for images
  const hasImage = /<w:drawing>/.test(xml) || /<w:pict>/.test(xml);
  let imageRef = null;
  if (hasImage) {
    const embedMatch = xml.match(/r:embed="([^"]*)"/);
    imageRef = embedMatch ? embedMatch[1] : null;
  }
  
  // Build markdown
  let md = '';
  for (const run of runs) {
    let t = run.text;
    if (run.code) t = '`' + t + '`';
    if (run.bold && run.italic) t = '***' + t + '***';
    else if (run.bold) t = '**' + t + '**';
    else if (run.italic) t = '*' + t + '*';
    md += t;
  }
  
  // Apply heading prefix
  if (headingLevel) {
    md = '#'.repeat(headingLevel) + ' ' + md;
  }
  
  // Apply list prefix
  if (isListItem) {
    const indent = '  '.repeat(listLevel);
    md = indent + '- ' + md;
  }
  
  return {
    type: 'paragraph',
    markdown: md.trim(),
    heading_level: headingLevel,
    is_list_item: isListItem,
    list_level: listLevel,
    has_image: hasImage,
    image_ref: imageRef,
    bold_terms: runs.filter(r => r.bold && r.text.trim().length > 1 && r.text.trim().length < 100)
                     .map(r => r.text.trim()),
  };
}

function parseTable(xml, styleMap) {
  const rows = [];
  const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let rm;
  
  while ((rm = rowRegex.exec(xml)) !== null) {
    const cells = [];
    const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cm;
    
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      // Extract text from all paragraphs in the cell
      const cellText = [];
      const paraRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let pm;
      while ((pm = paraRegex.exec(cm[1])) !== null) {
        cellText.push(pm[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      }
      cells.push(cellText.join(' ').trim());
    }
    
    rows.push(cells);
  }
  
  // Convert to markdown table
  if (rows.length === 0) return { type: 'table', markdown: '', row_count: 0, col_count: 0 };
  
  const colCount = Math.max(...rows.map(r => r.length));
  const mdRows = rows.map(r => {
    const padded = Array.from({ length: colCount }, (_, i) => r[i] || '');
    return '| ' + padded.join(' | ') + ' |';
  });
  
  // Insert separator after first row (header)
  if (mdRows.length > 0) {
    const sep = '| ' + Array.from({ length: colCount }, () => '---').join(' | ') + ' |';
    mdRows.splice(1, 0, sep);
  }
  
  return {
    type: 'table',
    markdown: mdRows.join('\n'),
    row_count: rows.length,
    col_count: colCount,
  };
}
```

#### Phase 3: Image Extraction

```javascript
async function extractDocxImages(zip) {
  const rels = await zip.file('word/_rels/document.xml.rels')?.async('text');
  if (!rels) return { relMap: {}, images: [] };
  
  // Parse relationships to map rId → file path
  const relMap = {};
  const relRegex = /Id="([^"]*)"[^>]*Target="([^"]*)"/g;
  let m;
  while ((m = relRegex.exec(rels)) !== null) {
    relMap[m[1]] = m[2];
  }
  
  // Extract image files from word/media/
  const images = [];
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
  
  for (const path of mediaFiles) {
    const data = await zip.file(path).async('arraybuffer');
    const filename = path.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    const mediaType = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      emf: 'image/x-emf',
      wmf: 'image/x-wmf',
    }[ext] || 'image/unknown';
    
    // Find which rId points to this file
    const rId = Object.entries(relMap).find(
      ([_, target]) => target === 'media/' + filename
    )?.[0];
    
    images.push({
      id: 'img-' + (images.length + 1),
      filename,
      rId,
      data,
      media_type: mediaType,
      size_bytes: data.byteLength,
    });
  }
  
  return { relMap, images };
}
```

#### Phase 4: Assembly

```javascript
async function parseDocx(buf) {
  const Z = await loadJSZip();
  const zip = await Z.loadAsync(buf);
  
  // 1. Parse styles
  const styleMap = await parseDocxStyles(zip);
  
  // 2. Parse document body
  const elements = await parseDocxBody(zip, styleMap);
  
  // 3. Extract images
  const { relMap, images } = await extractDocxImages(zip);
  
  // 4. Build markdown and track structure
  const mdParts = [];
  const sections = [];
  let currentSection = null;
  let paraIndex = 0;
  
  for (const el of elements) {
    if (el.type === 'paragraph' && el.heading_level && el.heading_level <= 2) {
      // New section boundary
      if (currentSection) {
        sections.push(finalizeDocxSection(currentSection));
      }
      currentSection = {
        heading: el.markdown.replace(/^#+\s*/, ''),
        heading_level: el.heading_level,
        lines: [el.markdown],
        metadata: {
          bold_term_count: 0, bold_terms: [],
          definition_count: 0, definitions: [],
          example_count: 0, code_block_count: 0,
          table_count: 0, image_count: 0, images: [],
          list_count: 0, equation_indicators: 0,
        },
        paraIndex: paraIndex,
      };
    } else {
      if (!currentSection) {
        // Preamble
        currentSection = {
          heading: '__preamble__',
          heading_level: null,
          lines: [],
          metadata: { /* ... */ },
          paraIndex: 0,
        };
      }
      
      if (el.type === 'table') {
        currentSection.lines.push(el.markdown);
        currentSection.metadata.table_count++;
      } else {
        currentSection.lines.push(el.markdown);
        
        // Accumulate metadata
        if (el.bold_terms?.length) {
          currentSection.metadata.bold_term_count += el.bold_terms.length;
          currentSection.metadata.bold_terms.push(...el.bold_terms);
        }
        if (el.has_image) {
          currentSection.metadata.image_count++;
          currentSection.metadata.images.push({
            position: 'at_para_' + paraIndex,
            ref: el.image_ref,
          });
        }
        if (el.is_list_item && !el._prevWasList) {
          currentSection.metadata.list_count++;
        }
      }
    }
    
    if (el.type === 'paragraph') paraIndex++;
    mdParts.push(el.markdown);
  }
  
  if (currentSection) {
    sections.push(finalizeDocxSection(currentSection));
  }
  
  // 5. Link images to sections
  for (const img of images) {
    for (let i = 0; i < sections.length; i++) {
      const sectionImages = sections[i].structural_metadata.images || [];
      if (sectionImages.some(si => si.ref === img.rId)) {
        img.section_index = i;
        img.position = sectionImages.find(si => si.ref === img.rId)?.position;
        break;
      }
    }
  }
  
  // 6. Assemble output
  const fullMarkdown = mdParts.join('\n\n');
  
  return {
    type: 'structured',
    source_format: 'docx',
    markdown: fullMarkdown,
    sections: sections,
    images: images,
    metadata: {
      title: sections[0]?.heading_level === 1 ? sections[0].heading : '',
      author: '',
      toc_entries: sections.filter(s => s.heading !== '__preamble__').map(s => ({
        title: s.heading,
        level: s.heading_level,
        section_path: s.section_path,
      })),
      total_chars: fullMarkdown.length,
      section_count: sections.length,
      image_count: images.length,
    },
  };
}

function finalizeDocxSection(section) {
  const content = section.lines.join('\n\n');
  return {
    heading: section.heading,
    heading_level: section.heading_level,
    section_path: detectSectionPath(section.heading) || '',
    content: content,
    char_count: content.length,
    structural_metadata: section.metadata,
  };
}
```

---

## Integration with readFile

The `readFile` function updates to use v2 parsers:

```javascript
if (ext === "epub") {
  try {
    const result = await parseEpub(await file.arrayBuffer());
    result.name = file.name;
    resolve(result);
  } catch (e) {
    resolve({ type: "text", name: file.name, content: "[EPUB failed: " + e.message + "]" });
  }
  return;
}

if (ext === "docx") {
  try {
    const result = await parseDocx(await file.arrayBuffer());
    result.name = file.name;
    resolve(result);
  } catch (e) {
    resolve({ type: "text", name: file.name, content: "[DOCX failed: " + e.message + "]" });
  }
  return;
}
```

The `storeAsChunks` function updates to handle `type: "structured"`:

```javascript
if (file.type === "structured" && file.sections) {
  // Each section becomes a chunk
  for (let i = 0; i < file.sections.length; i++) {
    const sec = file.sections[i];
    const chunkId = docIdPrefix + "-s-" + i;
    mat._pendingDocs.push({ chunkId, doc: { content: sec.content } });
    mat.chunks.push({
      id: chunkId,
      label: sec.heading,
      charCount: sec.char_count,
      heading_level: sec.heading_level,
      section_path: sec.section_path,
      structural_metadata: sec.structural_metadata,
      status: "pending"
    });
  }
  
  // Store images in chunk_media
  if (file.images?.length) {
    mat._pendingImages = file.images;
  }
  
  mat.totalChars = file.metadata.total_chars;
}
```

---

## Fallback Handling

When parsing fails or produces poor results:

1. **DOCX with no heading styles:** Falls back to visual heuristics (bold + short paragraphs). If that fails too, the document becomes a single chunk — the universal chunker handles paragraph-boundary splitting.

2. **EPUB with broken spine:** Falls back to alphabetically-sorted HTML files (existing v1 behavior). Heading detection still works within each file.

3. **Password-protected DOCX:** JSZip will fail to extract. Catch the error, inform the user.

4. **Images that fail to extract:** Log the error, continue with text content. The chunk records `image_count` from the HTML/XML references even if extraction fails, so the AI knows images were present.

5. **.doc (legacy binary format):** Not supported by JSZip. The parser detects this and tells the user to save as .docx. This is unchanged from v1.

---

## What This Doesn't Cover

- **Equation rendering:** MathML in EPUB and OMML in DOCX are detected (counted as `equation_indicators`) but not converted to LaTeX or rendered. Future enhancement.
- **Complex table layouts:** Merged cells, nested tables, and multi-paragraph cells are handled at a basic level. Complex academic tables may lose structure.
- **Footnotes/endnotes:** Detected in DOCX XML but not yet extracted and linked to their reference points. Could be added as metadata.
- **Track changes / comments:** Ignored. Only the current document state is parsed.
