// ============================================================
// htmlToMarkdown.js — HTML → Structured Markdown converter
//
// Converts EPUB HTML content to markdown while tracking
// structural metadata (bold terms, definitions, tables,
// images, code blocks, lists, equation indicators).
//
// Used by EPUB parser v2. DOCX parser builds markdown
// directly from XML but uses the same metadata shape.
// ============================================================

// Equation indicator patterns — characters/symbols suggesting math
const EQUATION_CHARS = /[∑∏∫∂√∞±≠≈≤≥∈∉⊂⊃∪∩∀∃∴∵ℝℤℕℚℂΔΣΩαβγδθλμπσφω→←⇒⇔]/;
const EQUATION_PATTERNS = /(\b[a-z]\s*=\s*[^,]{2,}|\bf\s*\(\s*x\s*\)|\blim\b|\b(?:sin|cos|tan|log|ln|exp)\b|\bd[xy]\/d[xy]\b)/i;

/**
 * Convert an HTML table element to markdown table syntax.
 */
function convertTable(tableEl) {
  const rows = [];
  const trEls = tableEl.querySelectorAll('tr');

  for (const tr of trEls) {
    const cells = [];
    for (const cell of tr.querySelectorAll('td, th')) {
      // Get text content, collapse whitespace
      const text = cell.textContent.replace(/\s+/g, ' ').trim();
      cells.push(text);
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
  return lines.join('\n');
}

/**
 * Convert HTML string to structured markdown with metadata.
 *
 * @param {string} html - Raw HTML content
 * @returns {{ markdown: string, metadata: object }}
 */
export function htmlToMarkdown(html) {
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
    ordered_list_count: 0,
    unordered_list_count: 0,
    equation_indicators: 0,
    blockquote_count: 0,
  };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return { markdown: '', metadata };

  let paraIndex = 0;
  let listDepth = 0;
  let preDepth = 0;
  let olCounters = []; // Stack of ordered list counters

  /**
   * Recursively walk DOM nodes and produce markdown.
   */
  function walk(node) {
    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || '';
      // Collapse whitespace within inline context (not inside <pre>)
      if (preDepth === 0) {
        text = text.replace(/\s+/g, ' ');
      }
      // Check for equation indicator characters
      if (EQUATION_CHARS.test(text)) {
        const matches = text.match(new RegExp(EQUATION_CHARS.source, 'g'));
        if (matches) metadata.equation_indicators += matches.length;
      }
      if (EQUATION_PATTERNS.test(text)) {
        metadata.equation_indicators++;
      }
      return text;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const childText = () => Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      // === Headings ===
      case 'h1': return '\n\n# ' + childText().trim() + '\n\n';
      case 'h2': return '\n\n## ' + childText().trim() + '\n\n';
      case 'h3': return '\n\n### ' + childText().trim() + '\n\n';
      case 'h4': return '\n\n#### ' + childText().trim() + '\n\n';
      case 'h5': return '\n\n##### ' + childText().trim() + '\n\n';
      case 'h6': return '\n\n###### ' + childText().trim() + '\n\n';

      // === Paragraphs ===
      case 'p': {
        paraIndex++;
        const text = childText().trim();
        if (!text) return '';
        // Detect example patterns
        if (/^example\s+\d/i.test(text) || /^worked\s+example/i.test(text)) {
          metadata.example_count++;
        }
        return text + '\n\n';
      }

      // === Inline formatting ===
      case 'strong':
      case 'b': {
        const text = childText().trim();
        if (!text) return '';
        if (text.length > 0 && text.length < 120) {
          metadata.bold_term_count++;
          if (text.length < 80) metadata.bold_terms.push(text);
        }
        // Detect definition patterns: "Bold term: definition..."
        // or "Bold term. Definition sentence."
        return '**' + text + '**';
      }

      case 'em':
      case 'i': {
        const text = childText().trim();
        if (!text) return '';
        return '*' + text + '*';
      }

      case 'u': {
        // Underline — no markdown equivalent, treat as emphasis
        const text = childText().trim();
        return text ? '*' + text + '*' : '';
      }

      // === Definitions ===
      case 'dfn': {
        const text = childText().trim();
        if (!text) return '';
        metadata.definition_count++;
        metadata.definitions.push(text);
        metadata.bold_term_count++;
        metadata.bold_terms.push(text);
        return '**' + text + '**';
      }

      // Definition lists
      case 'dl':
        return '\n' + childText() + '\n';
      case 'dt': {
        const text = childText().trim();
        metadata.bold_term_count++;
        metadata.bold_terms.push(text);
        return '\n**' + text + '**\n';
      }
      case 'dd':
        return ': ' + childText().trim() + '\n\n';

      // === Code ===
      case 'code': {
        const text = childText();
        // If inside <pre>, don't add backticks (pre handler wraps it)
        if (node.parentElement?.tagName.toLowerCase() === 'pre') return text;
        return '`' + text.trim() + '`';
      }

      case 'pre': {
        metadata.code_block_count++;
        preDepth++;
        const text = node.textContent || '';
        preDepth--;
        return '\n```\n' + text.trim() + '\n```\n\n';
      }

      // === Lists ===
      case 'ul': {
        metadata.list_count++;
        metadata.unordered_list_count++;
        listDepth++;
        const result = '\n' + childText();
        listDepth--;
        return result + '\n';
      }

      case 'ol': {
        metadata.list_count++;
        metadata.ordered_list_count++;
        listDepth++;
        olCounters.push(0);
        const result = '\n' + childText();
        olCounters.pop();
        listDepth--;
        return result + '\n';
      }

      case 'li': {
        const indent = '  '.repeat(Math.max(0, listDepth - 1));
        const parentTag = node.parentElement?.tagName.toLowerCase();
        let prefix;
        if (parentTag === 'ol') {
          const counter = olCounters.length > 0 ? olCounters[olCounters.length - 1] : 0;
          olCounters[olCounters.length - 1] = counter + 1;
          prefix = (counter + 1) + '. ';
        } else {
          prefix = '- ';
        }
        return indent + prefix + childText().trim() + '\n';
      }

      // === Tables ===
      case 'table': {
        metadata.table_count++;
        return '\n' + convertTable(node) + '\n\n';
      }
      // Skip table internals — convertTable handles them
      case 'thead': case 'tbody': case 'tfoot': case 'tr': case 'td': case 'th':
      case 'colgroup': case 'col':
        return '';

      // === Images ===
      case 'img': {
        metadata.image_count++;
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        metadata.images.push({
          position: 'after_para_' + paraIndex,
          alt,
          src,
        });
        return '\n![' + (alt || 'figure') + '](' + src + ')\n\n';
      }

      case 'figure': {
        return '\n' + childText();
      }

      case 'figcaption': {
        const text = childText().trim();
        // Detect "Figure X.Y:" pattern as caption
        return text ? '*' + text + '*\n\n' : '';
      }

      // === Block quotes ===
      case 'blockquote': {
        metadata.blockquote_count++;
        const text = childText().trim();
        if (!text) return '';
        return '\n> ' + text.replace(/\n/g, '\n> ') + '\n\n';
      }

      // === Line breaks ===
      case 'br':
        return '\n';

      case 'hr':
        return '\n---\n\n';

      // === Math ===
      case 'math':
      case 'mml:math': {
        metadata.equation_indicators++;
        // Extract text content as a basic representation
        const text = node.textContent?.trim() || '';
        return text ? '[MATH: ' + text + ']' : '[EQUATION]';
      }

      case 'sup': {
        const text = childText().trim();
        if (/^\d+$/.test(text)) metadata.equation_indicators++;
        // Use unicode superscript for single digits
        const superMap = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
        if (text.length === 1 && superMap[text]) return superMap[text];
        return '^(' + text + ')';
      }

      case 'sub': {
        const text = childText().trim();
        const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        if (text.length === 1 && subMap[text]) return subMap[text];
        return '_(' + text + ')';
      }

      // === Structural pass-through ===
      case 'div': case 'span': case 'section': case 'article':
      case 'main': case 'aside': case 'details': case 'summary':
      case 'mark': case 'abbr': case 'time': case 'cite':
      case 'small': case 'big': case 'center':
        return childText();

      // === Links ===
      case 'a': {
        const text = childText().trim();
        const href = node.getAttribute('href') || '';
        // Internal EPUB links — just output text
        if (!href || href.startsWith('#') || href.startsWith('..')) return text;
        // External links — markdown link syntax
        return '[' + text + '](' + href + ')';
      }

      // === Skip non-content ===
      case 'script': case 'style': case 'nav': case 'header': case 'footer':
      case 'meta': case 'link': case 'head': case 'title':
        return '';

      // === Default: recurse into children ===
      default:
        return childText();
    }
  }

  // Walk the body and build markdown
  let markdown = walk(body);

  // Post-process: clean up excessive whitespace
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')    // Collapse 3+ newlines to 2
    .replace(/^\s+/, '')            // Trim leading whitespace
    .replace(/\s+$/, '\n');         // Trim trailing, ensure final newline

  // Detect definition patterns in the full text
  // "**Term**: definition" or "**Term** — definition"
  const defPatterns = markdown.match(/\*\*([^*]+)\*\*\s*[:—–-]\s*[A-Z]/g);
  if (defPatterns) {
    // Don't double-count definitions already found via <dfn>
    const additional = defPatterns.length - metadata.definition_count;
    if (additional > 0) {
      metadata.definition_count += additional;
      for (const match of defPatterns) {
        const term = match.match(/\*\*([^*]+)\*\*/)?.[1];
        if (term && !metadata.definitions.includes(term)) {
          metadata.definitions.push(term);
        }
      }
    }
  }

  // Deduplicate bold_terms (common in EPUBs with repeated styling)
  metadata.bold_terms = [...new Set(metadata.bold_terms)];
  metadata.bold_term_count = metadata.bold_terms.length;

  return { markdown, metadata };
}

/**
 * Split markdown text into sections at heading boundaries.
 *
 * @param {string} markdown - Full markdown text
 * @param {number} splitLevel - Heading level to split at (e.g., 2 for ##)
 * @returns {Array<{ heading, heading_level, content, char_count }>}
 */
export function splitMarkdownSections(markdown, splitLevel = 2) {
  const lines = markdown.split('\n');
  const sections = [];
  let currentSection = null;
  let currentLines = [];

  // Regex to detect markdown headings
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headingRegex);

    if (match) {
      const level = match[1].length;
      const headingText = match[2].trim();

      if (level <= splitLevel) {
        // This heading starts a new section
        // Flush previous section
        if (currentSection || currentLines.length > 0) {
          const content = currentLines.join('\n').trim();
          if (content) {
            sections.push({
              heading: currentSection?.heading || null,
              heading_level: currentSection?.level || 0,
              content,
              char_count: content.length,
            });
          }
        }
        currentSection = { heading: headingText, level };
        currentLines = [line];
      } else {
        // Sub-heading — stays in current section
        currentLines.push(line);
      }
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({
        heading: currentSection?.heading || null,
        heading_level: currentSection?.level || 0,
        content,
        char_count: content.length,
      });
    }
  }

  return sections;
}

/**
 * Compute structural metadata from a markdown string.
 * Used when sections are re-split after chapter merging or
 * when metadata wasn't tracked during initial parsing.
 *
 * @param {string} markdown - Markdown content
 * @returns {object} Structural metadata matching the shared contract shape
 */
export function computeSectionMetadata(markdown) {
  const meta = {
    bold_term_count: 0, bold_terms: [], definition_count: 0, definitions: [],
    example_count: 0, code_block_count: 0, table_count: 0, image_count: 0,
    images: [], list_count: 0, ordered_list_count: 0, unordered_list_count: 0,
    equation_indicators: 0, blockquote_count: 0, subsection_count: 0, subsections: [],
  };

  const boldMatches = markdown.match(/\*\*([^*]+)\*\*/g) || [];
  for (const b of boldMatches) {
    const term = b.replace(/\*\*/g, '').trim();
    if (term.length > 0 && term.length < 80) meta.bold_terms.push(term);
  }
  meta.bold_terms = [...new Set(meta.bold_terms)];
  meta.bold_term_count = meta.bold_terms.length;

  meta.code_block_count = Math.floor((markdown.match(/```/g) || []).length / 2);
  meta.table_count = (markdown.match(/^\|\s*---/gm) || []).length;
  meta.image_count = (markdown.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;

  // Count list blocks by scanning lines for list-start transitions
  var _inOl = false, _inUl = false;
  var _inBq = false;
  for (const _line of markdown.split('\n')) {
    const _trimmed = _line.trimStart();
    // List detection
    if (/^\d+\.\s/.test(_trimmed)) {
      if (!_inOl) { meta.ordered_list_count++; _inOl = true; }
      _inUl = false;
    } else if (/^[-*]\s/.test(_trimmed)) {
      if (!_inUl) { meta.unordered_list_count++; _inUl = true; }
      _inOl = false;
    } else if (_trimmed !== '') {
      _inOl = false;
      _inUl = false;
    }
    // Blockquote detection
    if (_line.startsWith('> ')) {
      if (!_inBq) { meta.blockquote_count++; _inBq = true; }
    } else {
      _inBq = false;
    }
  }
  meta.list_count = meta.ordered_list_count + meta.unordered_list_count;

  // Subsection headings
  const _headingRe = /^#{1,6}\s+(.+)$/gm;
  var _hm;
  const _allHeadings = [];
  while ((_hm = _headingRe.exec(markdown))) {
    _allHeadings.push({ text: _hm[1].trim(), pos: _hm.index });
  }
  // Skip the first heading if it's the section's own heading (at the start of content)
  const _subsections = _allHeadings.length > 0 && _allHeadings[0].pos < 3
    ? _allHeadings.slice(1) : _allHeadings;
  meta.subsection_count = _subsections.length;
  meta.subsections = _subsections.map(h => h.text);

  const defMatches = markdown.match(/\*\*[^*]+\*\*\s*[:—–-]\s*[A-Z]/g) || [];
  meta.definition_count = defMatches.length;
  for (const d of defMatches) {
    const term = d.match(/\*\*([^*]+)\*\*/)?.[1];
    if (term) meta.definitions.push(term);
  }

  meta.example_count = (markdown.match(/^(?:example|worked example)\s+\d/gim) || []).length;

  const eqChars = markdown.match(/[∑∏∫∂√∞±≠≈≤≥∈∉⊂⊃∪∩∀∃∴∵ℝℤℕℚℂΔΣΩαβγδθλμπσφω→←⇒⇔]/g) || [];
  meta.equation_indicators = eqChars.length;

  return meta;
}

/**
 * Infer section_path from heading text.
 * Tries to extract numbered section identifiers like "5.1", "5.1.1", "Chapter 5".
 *
 * @param {string} heading - Heading text
 * @param {number} index - Section index (fallback)
 * @returns {string} Dot-notation section path
 */
export function inferSectionPath(heading, index) {
  if (!heading) return String(index + 1);

  // "5.1.1 Something" → "5.1.1"
  const dotted = heading.match(/^(\d+(?:\.\d+)*)/);
  if (dotted) return dotted[1];

  // "Chapter 5" → "5"
  const chapter = heading.match(/^chapter\s+(\d+)/i);
  if (chapter) return chapter[1];

  // "Section 3.2" → "3.2"
  const section = heading.match(/^section\s+(\d+(?:\.\d+)*)/i);
  if (section) return section[1];

  // "Part III" → Roman numeral handling
  const part = heading.match(/^part\s+(I{1,3}|IV|V|VI{0,3}|IX|X)/i);
  if (part) {
    const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    return 'P' + (roman[part[1].toUpperCase()] || part[1]);
  }

  return String(index + 1);
}
