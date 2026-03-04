# Chunk Boundary Specification

## Overview

Chunks are the durable unit of content in Study. Every downstream system — skill extraction, context loading, deduplication, session assembly — operates on chunks. Where you split determines the quality of everything built on top.

**The core question:** What makes a good chunk for teaching?

**The answer:** A chunk should be a *coherent unit of instruction* — something a teacher could point to and say "read this, then we'll talk about it." Not a page (arbitrary), not a paragraph (too small to contain a concept), not a whole chapter (too large for focused context loading). A section: a heading plus the content that belongs under it.

---

## Design Principles

1. **Structural boundaries over character limits.** The document's own structure (headings, sections, chapters) determines where to split. Character limits are escape valves, not primary heuristics.

2. **One chunk = one teaching topic.** Ideal chunk contains one major concept or a small cluster of closely related concepts. A section titled "5.3 The Chain Rule" with 3 subsections (definition, proof sketch, worked examples) is one chunk. The subsections stay together because they all serve the same teaching goal.

3. **Chunks preserve hierarchy.** A chunk knows its position in the document structure (`section_path: "5.3"`) and its heading level. This enables the system to reconstruct the document outline, group chunks for context assembly, and navigate between related sections.

4. **No information loss.** Every character of the original document ends up in exactly one chunk. No gaps, no overlaps. If content falls between headings, it belongs to the chunk above it (or the first chunk if it precedes all headings).

5. **Format-specific heuristics, universal output.** Each document format has different structural signals (PDF has headings in bold/larger font, EPUB has HTML heading tags, DOCX has style names). The chunking logic is format-specific, but the output schema is universal (`chunks_v2`).

---

## Target Chunk Size

**Ideal range: 2,000–15,000 characters (~500–3,750 tokens)**

This range is chosen for teaching utility:
- **Below 2,000 chars:** Usually too small to contain a coherent concept. A single definition, a lone example. Not useful as a standalone teaching unit.
- **2,000–8,000 chars:** Sweet spot. A section with explanation, examples, and key terms. Fits in context with room for conversation.
- **8,000–15,000 chars:** Large sections. Acceptable when the content is truly one cohesive topic. Common in textbooks with dense mathematical derivations or extended worked examples.
- **Above 15,000 chars:** Should be split. Even if the heading structure doesn't subdivide it, the content is too large for effective context loading (would consume ~3,750+ tokens of the context window for a single section).

These are guidelines, not hard limits. A 1,800-char section stays as-is if it's structurally coherent. A 16,000-char section stays as-is if there's no natural split point. The character limits only trigger when the structural heuristics produce chunks outside this range.

---

## Splitting Strategy by Format

### Common: Heading-Based Splitting

The primary strategy for all formats. Detect headings, split at heading boundaries.

**What constitutes a heading:**
- PDF: Text with larger font size, bold weight, or both (detected by pymupdf4llm or similar). Lines preceded/followed by whitespace that match heading patterns (numbered sections, title case, ALL CAPS).
- EPUB: HTML `<h1>` through `<h6>` tags. Explicit and unambiguous.
- DOCX: Paragraph styles named "Heading 1" through "Heading 6" or similar (style-based detection). Fallback: bold paragraphs that are short and preceded by blank lines.
- TXT/Markdown: Lines starting with `#` (markdown headings), or ALL CAPS lines, or numbered section patterns like "5.3 " followed by title text.
- PPTX: Each slide is a natural chunk boundary (already implemented in v1).
- SRT/VTT: Subtitle files have no section structure — split by time segments (see special handling below).

**Heading hierarchy determines split level:**

The split level is the heading level at which content gets separated into different chunks. Content under deeper headings (higher numbers) stays merged into the parent chunk.

Default split levels by document classification:

| Classification | Split Level | Rationale |
|---------------|-------------|-----------|
| Textbook      | H2 (sections within chapters) | Chapters are too large; sections are the natural teaching unit. H3+ subsections stay with their parent H2. |
| Assignment    | Per-item (special handling) | Assignments split by question/item, not headings. |
| Syllabus      | No split (single chunk) | Syllabi are small and holistic. One chunk. |
| Lecture transcript | By topic shift (time-based) | No headings; split by detected topic boundaries or time segments. |
| Notes/other   | H2 or first available level | Best-effort heading detection. |

**Example: Textbook chapter**

```
Chapter 5: Derivatives                    ← H1 (chapter boundary, one level above split)
  5.1 Definition of the Derivative        ← H2 → CHUNK 1
    5.1.1 The Limit Definition            ← H3 (stays in Chunk 1)
    5.1.2 Notation                        ← H3 (stays in Chunk 1)
  5.2 Basic Differentiation Rules         ← H2 → CHUNK 2
    5.2.1 Power Rule                      ← H3 (stays in Chunk 2)
    5.2.2 Constant Rule                   ← H3 (stays in Chunk 2)
    5.2.3 Sum Rule                        ← H3 (stays in Chunk 2)
  5.3 Product and Quotient Rules          ← H2 → CHUNK 3
    Example 5.3.1                         ← (stays in Chunk 3)
    Example 5.3.2                         ← (stays in Chunk 3)
```

This produces 3 chunks from one chapter. Each chunk is section_path "5.1", "5.2", "5.3". Each contains all of its subsections and examples.

**Chunk metadata for this example:**

```javascript
// Chunk 1
{
  label: "5.1 Definition of the Derivative",
  heading_level: 2,
  section_path: "5.1",
  structural_metadata: {
    subsection_count: 2,
    subsections: ["5.1.1 The Limit Definition", "5.1.2 Notation"],
    bold_term_count: 5,
    definition_count: 2,
    example_count: 0,
    equation_count: 3
  },
  page_start: 142,
  page_end: 148
}
```

### PDF-Specific Chunking

**Parser: pymupdf4llm (Python sidecar)**

pymupdf4llm produces markdown from PDF pages with heading detection based on font size analysis. The sidecar returns markdown text with heading markers (`#`, `##`, etc.) based on detected font hierarchy.

**Chunking pipeline:**

1. **pymupdf4llm extracts full document as markdown** with heading markers. Also captures page boundaries, image locations, and table structures.
2. **Heading hierarchy normalization.** pymupdf4llm detects font sizes and maps them to heading levels. Sometimes this produces too many levels or inconsistent mapping. Normalize:
   - Find the most common "heading-like" font sizes (bold, larger than body)
   - Map the largest to H1, next to H2, etc.
   - If only one heading size is detected, treat all headings as H2 (section level)
3. **Split at H2 boundaries** (default for textbooks) or at the detected split level.
4. **Content between headings** belongs to the preceding chunk. Content before the first heading becomes a "preamble" chunk (heading_level: NULL, section_path: "0").
5. **Page numbers preserved** from pymupdf4llm's page boundary markers. Each chunk records page_start and page_end.

**Tables:** pymupdf4llm renders tables as markdown tables. Tables stay with their containing chunk — they're never split across chunk boundaries. If a table spans a heading boundary (rare but possible in poorly structured documents), it belongs to the chunk that contains its first row.

**Images:** pymupdf4llm can extract image references. The chunk's `structural_metadata` records image positions as `{"images": [{"page": 143, "position": "after paragraph 3"}]}`. The actual image data goes into `chunk_media` table.

**Scanned PDFs / OCR fallback:** If pymupdf4llm detects no text on a page, the page is flagged as potentially scanned. The system falls back to OCR (if available) or marks the chunk as `fidelity: 'low'` and alerts the user.

### EPUB-Specific Chunking

**Parser: JSZip + HTML parsing (existing, enhanced)**

EPUB provides the richest structural semantics. The current v1 parser already handles spine-ordered HTML extraction and chapter merging. The v2 enhancement adds heading-level splitting within chapters.

**Chunking pipeline:**

1. **Spine-ordered extraction** (existing): Read OPF manifest, follow spine order, extract each HTML file.
2. **Chapter merging** (existing): EPUB files that split subchapters into separate HTML files (e.g., "13.1.html", "13.2.html") get merged into parent chapters. Front/back matter grouped separately.
3. **Within-chapter splitting (NEW):** After chapter merging, each merged chapter is analyzed for internal heading structure.
   - Parse HTML heading tags (`<h1>` through `<h6>`) from the merged content
   - Determine the chapter-level heading (usually `<h1>` or `<h2>`)
   - Split at the next level down (if chapter uses `<h1>`, split at `<h2>`)
   - Subsections under the split level stay merged with their parent

4. **Semantic enrichment from HTML:**
   - `<strong>` / `<b>` → bold terms (candidate skill concepts)
   - `<dfn>` → formal definitions
   - `<code>` / `<pre>` → code examples
   - `<blockquote>` → quoted material
   - `<figure>` / `<img>` → images with captions
   - `<table>` → tabular data
   - `<ol>` / `<ul>` within specific contexts → potential assignment items or step sequences

   These are counted in `structural_metadata` and help the LLM skill validator understand what kind of content the chunk contains.

5. **EPUB navigation document (if present):** EPUBs often include a `nav.xhtml` or NCX file that provides a table of contents with hierarchical structure. If present, use it to validate heading detection and fill in section_path values. The TOC is authoritative over in-content heading detection when they conflict.

### DOCX-Specific Chunking

**Parser: JSZip + XML parsing (enhanced from v1)**

DOCX provides style-based structure — paragraph styles encode heading levels explicitly.

**Chunking pipeline:**

1. **Extract `word/document.xml`** from the DOCX zip. Also extract `word/styles.xml` to map style IDs to style names.
2. **Parse paragraph styles:** Each `<w:p>` (paragraph) element has a `<w:pStyle>` child. Map style values to heading levels:
   - "Heading1" / "heading 1" → H1
   - "Heading2" / "heading 2" → H2
   - etc.
   - Some documents use custom styles ("ChapterTitle", "SectionHead"). Detect these by checking if they inherit from built-in heading styles in `styles.xml`.
3. **Fallback heading detection:** If no heading styles are found, fall back to visual heuristics:
   - Paragraphs that are bold AND short (< 100 chars) AND preceded by blank lines → candidate headings
   - Paragraphs in ALL CAPS AND short → candidate headings
   - Numbered paragraphs matching section patterns ("5.3", "Chapter 5") → candidate headings
4. **Split at detected heading boundaries** using the same level-based strategy as other formats.
5. **Rich text preservation:** Unlike v1 (which strips to plain text), v2 preserves:
   - Bold/italic runs → candidate terms
   - Numbered/bulleted lists → structural elements
   - Tables → rendered as markdown tables
   - Image references → recorded in structural_metadata (actual images from `word/media/` stored in `chunk_media`)

### TXT / Markdown Chunking

**Parser: Pattern matching**

Plain text has no semantic structure metadata. Rely on formatting conventions.

**Heading detection priority:**
1. Markdown headings: lines starting with `#`, `##`, `###` etc.
2. Underlined headings: lines followed by `===` or `---` on the next line
3. ALL CAPS lines that are short (< 80 chars) and preceded by blank lines
4. Numbered section patterns: `5.3 ` followed by title text
5. Lines that are bold in markdown: `**Section Title**` as the only content on a line

**If no headings detected:** Fall back to paragraph-boundary splitting with target chunk size. Split at double-newline boundaries, respecting the 2,000–15,000 char target range.

### Lecture Transcripts (SRT/VTT)

**Parser: Existing timestamp stripper**

Lecture transcripts are continuous speech. The existing parser strips SRT/VTT formatting, leaving plain text. From there, standard chunking applies — if the resulting text has no detectable headings, it falls through to paragraph-boundary splitting at the target chunk size. Labels are generated from content (first 60 chars or timestamp range if preserved).

### PPTX Chunking

**Parser: JSZip + XML (existing)**

The existing parser concatenates slide text with speaker notes into a single text output. From there, standard heading detection and chunking applies. Slide numbers are preserved as structural metadata but don't determine chunk boundaries — the extracted text is classified and chunked like any other document.

---

## Oversized Chunk Handling

When a chunk exceeds 15,000 characters after structural splitting, it needs further subdivision.

**Strategy: Split at the next heading level down.**

If a 20,000-char H2 section contains H3 subsections → split at H3 boundaries. Each H3 subsection becomes its own chunk with `heading_level: 3` and `section_path: "5.1.1"`, "5.1.2"`, etc.

If no sub-headings exist (one massive unstructured section) → fall back to paragraph-boundary splitting:

1. Find double-newline boundaries within the content
2. Split into roughly equal segments targeting 8,000 chars each
3. Prefer splitting after paragraphs that end with a period (complete thoughts)
4. Mark these chunks with `heading_level: NULL` and `section_path: "5.1/part-1"`, `"5.1/part-2"` (sub-paths under the parent section)
5. Set `structural_metadata.split_reason: "oversized"` so downstream systems know this was an artificial split

**These artificially split chunks are treated as one unit for skill extraction.** The LLM receives all parts of an oversized section together, even though they're stored as separate chunks. This prevents the LLM from seeing an arbitrary fragment without its context.

---

## Undersized Chunk Handling

When a chunk is below 2,000 characters after structural splitting:

1. **If it has a sibling at the same heading level:** Merge with the next sibling. Update section_path to span both (e.g., "5.1-5.2").
2. **If it's the last section in a chapter:** Leave it as-is. Short final sections are common and often contain summaries or exercises — useful teaching content despite small size.
3. **If it's a preamble (before the first heading):** Merge with the first section. Set section_path to "0+5.1" or similar to indicate the merge.
4. **If it's a single definition or theorem:** Leave it as-is. Some chunks are genuinely small because they contain a single important concept. The `structural_metadata` will show `definition_count: 1` or `theorem_count: 1`, explaining why it's small.

**Never merge across chapter boundaries.** A short section at the end of Chapter 5 does not merge with the first section of Chapter 6.

---

## Content Normalization

Before hashing (for dedup) and before storage, content is normalized:

1. **Whitespace normalization:** Collapse multiple spaces to single space. Collapse 3+ newlines to 2 newlines. Trim leading/trailing whitespace.
2. **Unicode normalization:** NFC form. Replace common Unicode lookalikes with ASCII equivalents (smart quotes → straight quotes, em-dash → --, etc.).
3. **Heading marker normalization:** Ensure all headings use markdown format (`## Heading`) regardless of source format.
4. **Image placeholder normalization:** Replace extracted image data with `[IMAGE: <description or filename>]` placeholders in the text content. Actual image data stored separately in `chunk_media`.
5. **Table normalization:** Render tables as markdown tables. Ensure consistent column alignment.

**The hash is computed on the normalized text.** This means the same content extracted from PDF and EPUB will produce the same hash if the text content is identical (even though formatting metadata differs).

---

## Chunk ID Generation

Chunk IDs are UUIDs generated at creation time. They are stable — once a chunk exists, its ID never changes even if the content is re-normalized or metadata is updated.

**Dedup by hash:** If a new upload produces a chunk with the same `content_hash` as an existing chunk in the same course, the existing chunk is reused (no new row created). The new material gets a reference to the existing chunk via `material_id` linkage.

**Cross-course dedup:** Content hashes enable detecting when the same content appears in different courses (e.g., a student uploads the same textbook chapter for two courses). The chunks are stored once but linked to both courses.

---

## Assignment-Specific Chunking

Assignments are NOT chunked by heading. They're chunked by the assignment parser's item decomposition.

**One chunk per assignment item** (question, problem, exercise). The assignment parser has already identified item boundaries, so chunk splitting follows parser output:

```javascript
// From assignment parser output:
// items: [{ id: "q1", text: "...", type: "solve", ... }, ...]
// Each item becomes one chunk

{
  label: "Q1: Find the derivative of f(x) = x³ + 2x",
  heading_level: null,
  section_path: "q1",
  structural_metadata: {
    item_type: "solve",
    sub_parts: [],
    has_figure: false,
    external_reference: null
  }
}
```

Multi-part questions (Q3a, Q3b, Q3c) stay as one chunk with sub-parts recorded in structural_metadata. This matches how the AI handles assignments: it works through all parts of a question as one teaching unit.

**Exception:** If an assignment has a long preamble (shared context for multiple questions, like a case study), the preamble becomes its own chunk with `section_path: "context"` and each question references it.

---

## Implementation: The `chunkDocument` Function

```javascript
// Pseudocode for the universal chunking function
// Called after format-specific parsing produces structured content

function chunkDocument(parsedContent, classification, options = {}) {
  const {
    splitLevel = getSplitLevel(classification), // H2 for textbooks, etc.
    minChars = 2000,
    maxChars = 15000,
    targetChars = 8000
  } = options;

  // 1. If assignment, use item-based chunking
  if (classification === 'assignment') {
    return chunkByItems(parsedContent);
  }

  // 2. If syllabus, single chunk
  if (classification === 'syllabus') {
    return [makeChunk(parsedContent.fullText, {
      label: 'Syllabus',
      heading_level: null,
      section_path: '0'
    })];
  }

  // 3. Detect headings and build heading tree
  const headings = detectHeadings(parsedContent);
  if (headings.length === 0) {
    // No structure detected — fall back to paragraph splitting
    return splitByParagraphs(parsedContent.fullText, targetChars);
  }

  // 4. Split at the target heading level
  const sections = splitAtLevel(parsedContent, headings, splitLevel);

  // 5. Handle over/undersized chunks
  const adjusted = [];
  for (const section of sections) {
    if (section.charCount > maxChars) {
      // Try splitting at next heading level
      const subSections = splitAtLevel(section, section.headings, splitLevel + 1);
      if (subSections.length > 1) {
        adjusted.push(...subSections);
      } else {
        // No sub-headings — paragraph split
        adjusted.push(...splitByParagraphs(section.content, targetChars, section));
      }
    } else if (section.charCount < minChars && adjusted.length > 0) {
      // Try merging with previous (same heading level, same chapter)
      const prev = adjusted[adjusted.length - 1];
      if (prev.heading_level === section.heading_level && sameChapter(prev, section)) {
        prev.content += '\n\n' + section.content;
        prev.charCount += section.charCount;
        prev.section_path += '-' + section.section_path;
        // Update structural_metadata counts
      } else {
        adjusted.push(section); // Leave small but structurally distinct
      }
    } else {
      adjusted.push(section);
    }
  }

  // 6. Assign ordering, compute hashes
  return adjusted.map((chunk, i) => ({
    ...chunk,
    ordering: i,
    content_hash: sha256(normalize(chunk.content))
  }));
}
```

---

## Migration from v1 Chunks

v1 chunks are either whole chapters (from EPUB) or whole files (everything else). During migration:

1. **EPUB chapters that are within the 2,000–15,000 range:** Keep as-is. They're already reasonable chunks. Add `heading_level: 1`, `section_path` based on chapter number.
2. **EPUB chapters that are oversized:** Re-chunk using within-chapter heading detection. The original chapter content is preserved; new chunk rows are created from it.
3. **Single-file chunks (non-textbook):** If the file has heading structure, re-chunk at H2 boundaries. If not, keep as-is (the whole file is one chunk).
4. **Content hashes added retroactively** to enable dedup detection.

No content is lost. Old chunk IDs are kept in a mapping table so that existing `chunk_skill_bindings` from v1 can be re-pointed to the correct v2 chunks.
