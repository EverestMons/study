// ============================================================
// epubParser.js — EPUB → Structured Markdown Parser v2
//
// Converts EPUB files to structured output with markdown
// sections, heading hierarchy, image extraction, and
// structural metadata for skill extraction.
//
// Depends on: JSZip (loaded dynamically), htmlToMarkdown.js
// ============================================================

import { htmlToMarkdown, splitMarkdownSections, inferSectionPath, computeSectionMetadata } from './htmlToMarkdown.js';
import { safeLoadZip } from './jszip-loader.js';

// --- MIME type mapping for images ---
const IMAGE_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/webp': 'webp',
};

// --- Front/back matter detection ---
const FRONT_MATTER = /^(front\s*matter|title\s*page|half\s*title|copyright|dedication|epigraph|table\s*of\s*contents|contents|foreword|preface|acknowledgment|acknowledgement|about\s*the\s*author|cover|halftitle|also\s*by)/i;
const BACK_MATTER = /^(index|glossary|bibliography|references|further\s*reading|endnotes|notes|colophon|back\s*cover|afterword)/i;

/**
 * Parse an EPUB file into structured output.
 *
 * @param {ArrayBuffer} buf - Raw EPUB file bytes
 * @param {string} filename - Original filename
 * @returns {Promise<object>} Structured output matching shared contract
 */
export async function parseEpub(buf, filename) {
  const zip = await safeLoadZip(buf);

  // --- 1. Read container.xml to find OPF path ---
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  const opfPath = containerXml?.match(/full-path="([^"]+\.opf)"/)?.[1];
  if (!opfPath) throw new Error('No OPF file found in EPUB');

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // --- 2. Parse OPF: manifest + spine ---
  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) throw new Error('Cannot read OPF file');

  const manifest = {};
  const spineIds = [];
  let docTitle = null;
  let docAuthor = null;

  // Parse manifest items (handles attribute order variations)
  const itemRegex = /<item\s+([^>]+?)\/?>/gi;
  let m;
  while ((m = itemRegex.exec(opfXml))) {
    const attrs = m[1];
    const id = attrs.match(/id="([^"]*)"/)?.[1];
    const href = attrs.match(/href="([^"]*)"/)?.[1];
    const type = attrs.match(/media-type="([^"]*)"/)?.[1];
    const props = attrs.match(/properties="([^"]*)"/)?.[1] || '';
    if (id && href) manifest[id] = { href, type, properties: props };
  }

  // Parse spine
  const spineRegex = /<itemref\s+idref="([^"]*)"/gi;
  while ((m = spineRegex.exec(opfXml))) spineIds.push(m[1]);

  // Parse metadata
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  if (titleMatch) docTitle = titleMatch[1].trim();
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  if (authorMatch) docAuthor = authorMatch[1].trim();

  // --- 3. Parse navigation document (TOC) ---
  const tocEntries = await parseEpubNav(zip, opfDir, manifest);

  // --- 4. Process spine HTML files ---
  const rawSections = []; // Before chapter merging
  const allImages = [];

  const processHtmlFile = async (path, fallbackTitle) => {
    const f = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!f) return;

    const html = await f.async('text');
    const { markdown, metadata } = htmlToMarkdown(html);

    if (markdown.length < 20) return;

    // Extract title from markdown headings
    let title = null;
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    const h2Match = markdown.match(/^##\s+(.+)$/m);
    title = h1Match?.[1]?.trim() || h2Match?.[1]?.trim() || null;

    // If no heading found, try first non-empty line if short
    if (!title) {
      const firstLine = markdown.split('\n').find(l => l.trim().length > 2)?.trim();
      if (firstLine && firstLine.length < 120) title = firstLine;
    }

    // Extract images referenced in this HTML file
    for (const img of metadata.images) {
      if (!img.src) continue;
      // Resolve relative image path against the HTML file's directory
      const htmlDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/') + 1) : '';
      const imgPath = resolveRelativePath(htmlDir, img.src);

      const imgFile = zip.file(imgPath);
      if (imgFile) {
        try {
          const data = await imgFile.async('arraybuffer');
          const mediaType = guessMediaType(imgPath);
          allImages.push({
            id: 'img-' + (allImages.length + 1),
            filename: imgPath.split('/').pop(),
            data,
            media_type: mediaType,
            size_bytes: data.byteLength,
            width: null,  // Would need image decoding to get dimensions
            height: null,
            section_index: rawSections.length, // Will be remapped after merging
            position: img.position,
            alt_text: img.alt || '',
            caption: null, // Filled from figcaption if detected
          });
        } catch { /* Skip unreadable images */ }
      }
    }

    rawSections.push({
      title: title || fallbackTitle,
      markdown,
      metadata,
      charCount: markdown.length,
    });
  };

  // Process in spine order
  if (spineIds.length > 0) {
    for (const id of spineIds) {
      const item = manifest[id];
      if (item?.type?.includes('html')) {
        await processHtmlFile(opfDir + item.href, 'Section ' + (rawSections.length + 1));
      }
    }
  } else {
    // No spine — process all HTML files
    const htmlFiles = Object.keys(zip.files)
      .filter(f => /\.(x?html?)$/i.test(f) && !f.includes('META-INF'))
      .sort();
    for (const p of htmlFiles) {
      await processHtmlFile(p, 'Section ' + (rawSections.length + 1));
    }
  }

  if (rawSections.length === 0) {
    return { type: 'structured', name: filename, source_format: 'epub', markdown: '', sections: [], images: [], metadata: { title: docTitle, author: docAuthor, toc_entries: tocEntries, total_chars: 0, section_count: 0, image_count: 0 } };
  }

  // --- 5. Smart chapter merging (carried from v1, adapted for structured output) ---
  const merged = mergeChapters(rawSections);

  // --- 6. Split merged chapters into sections at heading boundaries ---
  const sections = [];
  for (const chapter of merged) {
    const split = splitMarkdownSections(chapter.markdown, 2);

    if (split.length === 0) continue;

    if (split.length === 1) {
      // Single section — use chapter-level info
      sections.push({
        heading: chapter.title,
        heading_level: 1,
        section_path: inferSectionPath(chapter.title, sections.length),
        content: chapter.markdown,
        char_count: chapter.markdown.length,
        structural_metadata: chapter.metadata,
        source_pages: null,
      });
    } else {
      // Multiple sections from this chapter
      for (let i = 0; i < split.length; i++) {
        const sec = split[i];
        sections.push({
          heading: sec.heading || chapter.title,
          heading_level: sec.heading_level || 1,
          section_path: inferSectionPath(sec.heading, sections.length),
          content: sec.content,
          char_count: sec.char_count,
          structural_metadata: computeSectionMetadata(sec.content),
          source_pages: null,
        });
      }
    }
  }

  // --- 7. Build full markdown ---
  const fullMarkdown = sections.map(s => s.content).join('\n\n');

  return {
    type: 'structured',
    name: filename,
    source_format: 'epub',
    markdown: fullMarkdown,
    sections,
    images: allImages,
    metadata: {
      title: docTitle,
      author: docAuthor,
      toc_entries: tocEntries,
      total_chars: fullMarkdown.length,
      section_count: sections.length,
      image_count: allImages.length,
    },
  };
}


// ============================================================
// Chapter merging — adapted from v1
// ============================================================

function getChapterNum(title) {
  if (!title) return null;
  const t = title.trim();
  const m1 = t.match(/^chapter\s+(\d+)/i);
  if (m1) return parseInt(m1[1]);
  const m2 = t.match(/^(\d+)\.\d+/);
  if (m2) return parseInt(m2[1]);
  const m3 = t.match(/^(\d{1,3})\s+[A-Z]/);
  if (m3 && parseInt(m3[1]) < 200) return parseInt(m3[1]);
  return null;
}

function mergeChapters(sections) {
  if (sections.length <= 1) return sections;

  const merged = [];
  const frontMatter = [];
  const backMatter = [];
  let currentGroup = null;

  const flushGroup = () => {
    if (!currentGroup) return;
    const combinedMd = currentGroup.sections.map(s => s.markdown).join('\n\n');
    const combinedMeta = mergeSectionMetadata(currentGroup.sections.map(s => s.metadata));

    let label = currentGroup.sections[0].title || 'Chapter ' + currentGroup.num;
    if (currentGroup.sections.length > 1 && /^\d+\.\d+/.test(label)) {
      const chapterHeading = currentGroup.sections.find(s =>
        /^chapter\s+\d+/i.test(s.title || '') || /^\d+\s+[A-Z]/.test(s.title || '')
      );
      label = chapterHeading ? chapterHeading.title :
        'Chapter ' + currentGroup.num + ' (' + currentGroup.sections.length + ' sections)';
    }

    merged.push({
      title: label,
      markdown: combinedMd,
      metadata: combinedMeta,
      charCount: combinedMd.length,
      mergedFrom: currentGroup.sections.length,
    });
    currentGroup = null;
  };

  for (const sec of sections) {
    const title = sec.title || '';

    if (FRONT_MATTER.test(title)) { frontMatter.push(sec); continue; }
    if (BACK_MATTER.test(title)) { backMatter.push(sec); continue; }

    const num = getChapterNum(title);

    if (num !== null) {
      if (currentGroup && currentGroup.num === num) {
        currentGroup.sections.push(sec);
      } else {
        flushGroup();
        currentGroup = { num, title, sections: [sec] };
      }
    } else {
      if (currentGroup && !/^appendix/i.test(title)) {
        currentGroup.sections.push(sec);
      } else {
        flushGroup();
        merged.push({
          title,
          markdown: sec.markdown,
          metadata: sec.metadata,
          charCount: sec.charCount,
          mergedFrom: 1,
        });
      }
    }
  }
  flushGroup();

  // Prepend front matter
  if (frontMatter.length > 0) {
    const fmMd = frontMatter.map(s => s.markdown).join('\n\n');
    merged.unshift({
      title: 'Front Matter',
      markdown: fmMd,
      metadata: mergeSectionMetadata(frontMatter.map(s => s.metadata)),
      charCount: fmMd.length,
      mergedFrom: frontMatter.length,
    });
  }

  // Append back matter
  if (backMatter.length > 0) {
    const bmMd = backMatter.map(s => s.markdown).join('\n\n');
    merged.push({
      title: 'Back Matter',
      markdown: bmMd,
      metadata: mergeSectionMetadata(backMatter.map(s => s.metadata)),
      charCount: bmMd.length,
      mergedFrom: backMatter.length,
    });
  }

  return merged;
}


// ============================================================
// Navigation / TOC parsing
// ============================================================

async function parseEpubNav(zip, opfDir, manifest) {
  // Try EPUB 3 nav document first
  const navItem = Object.values(manifest).find(
    m => m.type?.includes('html') && m.properties?.includes('nav')
  );

  if (navItem) {
    const navHtml = await zip.file(opfDir + navItem.href)?.async('text');
    if (navHtml) {
      const entries = parseNavXhtml(navHtml);
      if (entries.length > 0) return entries;
    }
  }

  // Fall back to EPUB 2 toc.ncx
  const ncxItem = Object.values(manifest).find(
    m => m.type === 'application/x-dtbncx+xml'
  );

  if (ncxItem) {
    const ncxXml = await zip.file(opfDir + ncxItem.href)?.async('text');
    if (ncxXml) return parseNcx(ncxXml);
  }

  return [];
}

function parseNavXhtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // EPUB 3 spec: nav element with epub:type="toc"
  const nav = doc.querySelector('nav[epub\\:type="toc"]') ||
              doc.querySelector('nav#toc') ||
              doc.querySelector('nav');
  if (!nav) return [];

  const entries = [];
  function walkList(ol, level) {
    if (!ol) return;
    for (const li of ol.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const a = li.querySelector(':scope > a');
      if (a) {
        const title = a.textContent.trim();
        entries.push({
          title,
          level,
          section_path: inferSectionPath(title, entries.length),
        });
      }
      // Recurse into nested ol
      const nestedOl = li.querySelector(':scope > ol');
      if (nestedOl) walkList(nestedOl, level + 1);
    }
  }

  const rootOl = nav.querySelector('ol');
  walkList(rootOl, 1);
  return entries;
}

function parseNcx(xml) {
  const entries = [];
  // navPoint elements with navLabel/text and content/@src
  let match;

  // Simple flat extraction — depth detection is unreliable with regex on nested XML
  const labelRegex = /<navLabel>\s*<text>([^<]+)<\/text>/gi;
  while ((match = labelRegex.exec(xml))) {
    const title = match[1].trim();
    if (title) {
      entries.push({
        title,
        level: 1, // Flat — no reliable depth from regex
        section_path: inferSectionPath(title, entries.length),
      });
    }
  }

  return entries;
}


// ============================================================
// Helpers
// ============================================================

/**
 * Resolve a relative path against a base directory.
 * "../images/fig1.png" relative to "OEBPS/text/" → "OEBPS/images/fig1.png"
 */
function resolveRelativePath(baseDir, relativePath) {
  if (relativePath.startsWith('/')) return relativePath.substring(1);

  const parts = (baseDir + relativePath).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

function guessMediaType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
  return map[ext] || 'image/png';
}

/**
 * Merge metadata from multiple sections into one combined object.
 */
function mergeSectionMetadata(metadataArray) {
  const combined = {
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
    subsection_count: 0,
    subsections: [],
  };

  for (const m of metadataArray) {
    if (!m) continue;
    combined.bold_terms.push(...(m.bold_terms || []));
    combined.definitions.push(...(m.definitions || []));
    combined.images.push(...(m.images || []));
    combined.subsections.push(...(m.subsections || []));
    combined.example_count += m.example_count || 0;
    combined.code_block_count += m.code_block_count || 0;
    combined.table_count += m.table_count || 0;
    combined.image_count += m.image_count || 0;
    combined.list_count += m.list_count || 0;
    combined.ordered_list_count += m.ordered_list_count || 0;
    combined.unordered_list_count += m.unordered_list_count || 0;
    combined.equation_indicators += m.equation_indicators || 0;
    combined.definition_count += m.definition_count || 0;
    combined.blockquote_count += m.blockquote_count || 0;
    combined.subsection_count += m.subsection_count || 0;
  }

  combined.bold_terms = [...new Set(combined.bold_terms)];
  combined.bold_term_count = combined.bold_terms.length;

  return combined;
}

// computeSectionMetadata imported from htmlToMarkdown.js
