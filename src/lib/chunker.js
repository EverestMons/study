// ============================================================
// chunker.js — Universal Document Chunker
//
// Takes structured parser output (from EPUB, DOCX, or future
// PDF parser) and produces chunks ready for DB insertion.
//
// Applies heading-level splitting per classification, handles
// oversized/undersized chunks, computes content hashes.
// ============================================================

// --- Target chunk sizes (chars) ---
const MIN_CHUNK = 2000;
const IDEAL_MAX = 15000;
const HARD_MAX = 20000;

// --- Split level by material classification ---
const SPLIT_LEVELS = {
  textbook: 2,          // Split at H2 (sections within chapters)
  assignment: 1,        // Split at top-level items
  syllabus: 99,         // Don't split — single chunk
  lecture_transcript: 2,
  notes: 2,
  slides: 99,           // Slides are already chunked per-slide
  other: 2,
};

/**
 * Hash a string using SHA-256 (Web Crypto API).
 * Returns hex string.
 */
async function contentHash(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Chunk a structured document into DB-ready chunks.
 *
 * @param {object} parsed - Structured output from parseEpub or parseDocx
 * @param {object} options
 * @param {string} options.materialId - Material record ID
 * @param {string} options.courseId - Course record ID
 * @param {string} options.classification - Material classification (textbook, assignment, etc.)
 * @returns {Promise<Array<object>>} Chunks ready for Chunks.createBatch()
 */
export async function chunkDocument(parsed, { materialId, courseId }) {
  // If the parser already split into sections, use those
  let sections = parsed.sections || [];

  // If no sections (plain text input), create a single section
  if (sections.length === 0 && parsed.markdown) {
    sections = [{
      heading: null,
      heading_level: 0,
      section_path: '1',
      content: parsed.markdown,
      char_count: parsed.markdown.length,
      structural_metadata: parsed.metadata || null,
      source_pages: null,
    }];
  }

  if (sections.length === 0) return [];

  // --- Pass 1: Merge undersized sections ---
  const merged = mergeSmallSections(sections);

  // --- Pass 2: Split oversized sections ---
  const sized = splitLargeSections(merged);

  // --- Pass 3: Build chunk objects with hashes (parallel) ---
  const hashes = await Promise.all(sized.map(s => contentHash(s.content)));
  const chunks = sized.map((sec, i) => ({
    materialId,
    courseId,
    label: sec.heading || 'Section ' + (i + 1),
    content: sec.content,
    contentHash: hashes[i],
    charCount: sec.content.length,
    sourceFormat: parsed.source_format || null,
    headingLevel: sec.heading_level || null,
    sectionPath: sec.section_path || String(i + 1),
    structuralMetadata: sec.structural_metadata || null,
    fidelity: 'full',
    pageStart: sec.source_pages?.start || null,
    pageEnd: sec.source_pages?.end || null,
    ordering: i,
  }));

  return chunks;
}

/**
 * Merge consecutive small sections (below MIN_CHUNK) into their neighbors.
 */
function mergeSmallSections(sections) {
  if (sections.length <= 1) return sections;

  const result = [];
  let buffer = null;

  for (const sec of sections) {
    if (!buffer) {
      buffer = { ...sec };
      continue;
    }

    // If buffer is small, try to merge with current section
    if (buffer.char_count < MIN_CHUNK) {
      buffer = mergeTwoSections(buffer, sec);
    } else if (sec.char_count < MIN_CHUNK) {
      // Current section is small — merge into buffer
      buffer = mergeTwoSections(buffer, sec);
    } else {
      // Both are adequate size — flush buffer, start new
      result.push(buffer);
      buffer = { ...sec };
    }
  }

  if (buffer) result.push(buffer);
  return result;
}

/**
 * Split sections that exceed HARD_MAX chars.
 */
function splitLargeSections(sections) {
  const result = [];

  for (const sec of sections) {
    if (sec.char_count <= HARD_MAX) {
      result.push(sec);
      continue;
    }

    // Try to split at sub-headings (H3+) first
    const subSplits = splitAtSubHeadings(sec.content);
    if (subSplits.length > 1) {
      // Check if sub-splits are reasonable sizes
      const allReasonable = subSplits.every(s => s.length <= HARD_MAX);
      if (allReasonable) {
        for (let i = 0; i < subSplits.length; i++) {
          const subContent = subSplits[i].trim();
          if (!subContent) continue;
          const subHeading = subContent.match(/^#{1,6}\s+(.+)$/m)?.[1] || sec.heading;
          result.push({
            ...sec,
            heading: subHeading,
            heading_level: Math.min((sec.heading_level || 2) + 1, 6),
            section_path: sec.section_path + '.' + (i + 1),
            content: subContent,
            char_count: subContent.length,
          });
        }
        continue;
      }
    }

    // Fallback: split at paragraph boundaries near IDEAL_MAX
    const paragraphSplits = splitAtParagraphs(sec.content, IDEAL_MAX);
    for (let i = 0; i < paragraphSplits.length; i++) {
      const part = paragraphSplits[i].trim();
      if (!part) continue;
      result.push({
        ...sec,
        heading: sec.heading + (paragraphSplits.length > 1 ? ' (part ' + (i + 1) + ')' : ''),
        section_path: sec.section_path + (paragraphSplits.length > 1 ? '.' + (i + 1) : ''),
        content: part,
        char_count: part.length,
      });
    }
  }

  return result;
}

/**
 * Split content string at H3+ heading boundaries.
 */
function splitAtSubHeadings(content) {
  const lines = content.split('\n');
  const parts = [];
  let current = [];

  for (const line of lines) {
    // H3 through H6
    if (/^#{3,6}\s+/.test(line) && current.length > 0) {
      parts.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) parts.push(current.join('\n'));
  return parts;
}

/**
 * Split content at paragraph boundaries, targeting a max size.
 */
function splitAtParagraphs(content, targetMax) {
  const paragraphs = content.split(/\n\n+/);
  const parts = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > targetMax && current.length > 0) {
      parts.push(current);
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  if (current) parts.push(current);
  return parts;
}

/**
 * Merge two sections into one.
 */
function mergeTwoSections(a, b) {
  const combined = a.content + '\n\n' + b.content;
  return {
    heading: a.heading || b.heading,
    heading_level: a.heading_level || b.heading_level,
    section_path: a.section_path,
    content: combined,
    char_count: combined.length,
    structural_metadata: mergeMetadata(a.structural_metadata, b.structural_metadata),
    source_pages: a.source_pages || b.source_pages,
  };
}

/**
 * Merge two metadata objects.
 */
function mergeMetadata(a, b) {
  if (!a) return b;
  if (!b) return a;

  return {
    bold_term_count: (a.bold_term_count || 0) + (b.bold_term_count || 0),
    bold_terms: [...new Set([...(a.bold_terms || []), ...(b.bold_terms || [])])],
    definition_count: (a.definition_count || 0) + (b.definition_count || 0),
    definitions: [...(a.definitions || []), ...(b.definitions || [])],
    example_count: (a.example_count || 0) + (b.example_count || 0),
    code_block_count: (a.code_block_count || 0) + (b.code_block_count || 0),
    table_count: (a.table_count || 0) + (b.table_count || 0),
    image_count: (a.image_count || 0) + (b.image_count || 0),
    images: [...(a.images || []), ...(b.images || [])],
    list_count: (a.list_count || 0) + (b.list_count || 0),
    equation_indicators: (a.equation_indicators || 0) + (b.equation_indicators || 0),
  };
}

/**
 * Chunk plain text (for TXT, SRT/VTT, CSV, and other non-structured formats).
 * Falls back to paragraph-based splitting.
 *
 * @param {string} text - Plain text content
 * @param {object} options - Same as chunkDocument options
 * @returns {Promise<Array<object>>}
 */
export async function chunkPlainText(text, { materialId, courseId, classification = 'other' }) {
  if (!text || !text.trim()) return [];

  // For small documents, single chunk
  if (text.length <= IDEAL_MAX) {
    const hash = await contentHash(text);
    return [{
      materialId, courseId,
      label: 'Full Document',
      content: text,
      contentHash: hash,
      charCount: text.length,
      sourceFormat: 'text',
      headingLevel: null,
      sectionPath: '1',
      structuralMetadata: null,
      fidelity: 'full',
      pageStart: null, pageEnd: null,
      ordering: 0,
    }];
  }

  // Try heading-based splitting for markdown-like text
  const hasHeadings = /^#{1,6}\s+/m.test(text);
  if (hasHeadings) {
    const fakeStructured = {
      source_format: 'text',
      markdown: text,
      sections: [],
    };
    // Use splitMarkdownSections from htmlToMarkdown
    const { splitMarkdownSections } = await import('./htmlToMarkdown.js');
    fakeStructured.sections = splitMarkdownSections(text, 2).map((s, i) => ({
      heading: s.heading,
      heading_level: s.heading_level,
      section_path: String(i + 1),
      content: s.content,
      char_count: s.char_count,
      structural_metadata: null,
      source_pages: null,
    }));

    if (fakeStructured.sections.length > 1) {
      return chunkDocument(fakeStructured, { materialId, courseId, classification });
    }
  }

  // Paragraph-based splitting
  const parts = splitAtParagraphs(text, IDEAL_MAX);
  const chunks = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const hash = await contentHash(part);
    chunks.push({
      materialId, courseId,
      label: 'Section ' + (i + 1),
      content: part,
      contentHash: hash,
      charCount: part.length,
      sourceFormat: 'text',
      headingLevel: null,
      sectionPath: String(i + 1),
      structuralMetadata: null,
      fidelity: 'full',
      pageStart: null, pageEnd: null,
      ordering: i,
    });
  }
  return chunks;
}
