# Architecture: Inline Image Display System
**Date:** 2026-03-19
**Status:** Blueprint
**Feature:** AI tutor displays images from course materials inline in the chat

---

## 1. Migration 007 — `material_images` Table

### Schema

```sql
-- Migration 007: Material Images catalog
CREATE TABLE IF NOT EXISTS material_images (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    image_type TEXT NOT NULL,          -- 'slide' | 'page' | 'figure' | 'embedded'
    page_or_slide_number INTEGER,      -- 1-indexed; NULL for embedded DOCX images without page context
    caption TEXT,                       -- Alt text, OCR-derived label, or slide title
    file_path TEXT NOT NULL,           -- Relative to $APPDATA/images/, e.g. "mat-abc123/slide_001.png"
    width INTEGER,                     -- Pixel width of stored PNG
    height INTEGER,                    -- Pixel height of stored PNG
    chunk_id TEXT,                     -- FK to chunks table — which chunk does this image relate to?
    file_size_bytes INTEGER,           -- Size of PNG on disk
    created_at INTEGER NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

CREATE INDEX IF NOT EXISTS idx_material_images_material
    ON material_images(material_id);
CREATE INDEX IF NOT EXISTS idx_material_images_course
    ON material_images(course_id);
CREATE INDEX IF NOT EXISTS idx_material_images_chunk
    ON material_images(chunk_id);
```

### `MaterialImages` DB Module (`src/lib/db.js`)

```js
export const MaterialImages = {
  async getByMaterial(materialId) { ... },        // All images for a material, ordered by page_or_slide_number
  async getByChunk(chunkId) { ... },              // Images linked to a specific chunk
  async getByCourse(courseId) { ... },             // All images for a course
  async getByMaterialAndPage(materialId, pageNum) { ... }, // Single image by material + page
  async getById(id) { ... },
  async create({ materialId, courseId, imageType, pageOrSlideNumber, caption, filePath, width, height, chunkId, fileSizeBytes }) { ... },
  async createBatch(images) { ... },              // Bulk insert for efficiency during extraction
  async deleteByMaterial(materialId) { ... },     // Called during material removal — DB rows only
  async deleteByCourse(courseId) { ... },          // Called during course deletion — DB rows only
  async getCountByMaterial(materialId) { ... },   // Quick count for UI badges
};
```

**Filesystem cleanup** is handled separately (not in the DB module) because it requires Tauri FS APIs. The caller (StudyContext `removeMat` / `delCourse`) is responsible for:
1. Calling `MaterialImages.deleteByMaterial(id)` to remove DB rows
2. Calling the filesystem cleanup function to remove `$APPDATA/images/{material_id}/` directory

---

## 2. Image Extraction Architecture Per Format

### 2.1 PDF — Page Rendering

**Approach:** Reuse the proven `renderPageToCanvas` pattern from `ocrEngine.js`.

**Pipeline:**
1. During PDF parsing, after `parsePdf()` returns the structured output, render each page to canvas
2. Use `renderPageToCanvas(doc, pageNum)` from ocrEngine.js (export it or extract to shared util)
3. Convert canvas to PNG blob via `canvas.toBlob('image/png')` (or `canvas.convertToBlob()` for OffscreenCanvas)
4. Write PNG to filesystem via Tauri FS `writeFile`

**Rendering scale:** `1.5` (not 2.0 like OCR). This gives ~225 DPI — sufficient for chat display, keeps file sizes manageable (~100-300KB per page vs ~400-800KB at 2x).

**Which pages to render:** ALL pages. The cost is acceptable at upload time and avoids re-opening the PDF document later. A 50-page PDF at 1.5x scale ≈ 10-25MB total storage — well within reason.

**Key detail:** The PDF `doc` object from pdfjs-dist is available during parsing. We must extract images BEFORE the doc is garbage collected. The doc is returned in the `_needsOcr` path and used in `buildStructured` — we need to thread it through to the image extraction step as well.

**Chunk mapping:** Each page-rendered image maps to the chunk whose `source_pages` range includes that page number. A single query after extraction links images to chunks.

```
New file: src/lib/imageExtractor.js

export async function extractPdfImages(doc, numPages, materialId, courseId, options = {}) {
  // options: { scale: 1.5, onProgress, appDataDir }
  // Returns: Array<{ pageNum, filePath, width, height, fileSizeBytes }>
}
```

### 2.2 PPTX — LibreOffice CLI → PDF → Page Rendering

**Pipeline:**
1. Detect LibreOffice installation (see Section 8)
2. Write the PPTX to a temp file via Tauri FS (the upload pipeline has the `ArrayBuffer`)
3. Run `soffice --headless --convert-to pdf --outdir <tempDir> <pptxPath>` via Tauri shell `Command`
4. Load the resulting PDF with pdfjs-dist
5. Render each page using the same PDF pipeline (Section 2.1)
6. Clean up temp files

**Slide number mapping:** PPTX slide N maps to PDF page N (1:1 correspondence). The `parsePptx` function in `parsers.js` already extracts `slideFiles` sorted by number. The image extraction preserves this ordering.

**Error path — LibreOffice not installed:**
- Image extraction silently skips. Text extraction proceeds normally (it uses JSZip, not LibreOffice).
- A one-time notification is shown: "Install LibreOffice for slide image previews. Text extraction works without it."
- The `material_images` table simply has no rows for this material.
- A `settings` key `libreoffice_warned` prevents repeated warnings.

**Timeout:** 60 seconds for the CLI conversion. If it hangs, kill the process and treat as "LibreOffice not available."

### 2.3 DOCX — ZIP-Based Image Extraction

**Approach:** The existing `docxParser.js` already extracts images! The `extractImages()` function returns an array of `{ id, filename, data (ArrayBuffer), media_type, size_bytes, width, height, position, alt_text }`. This is 90% of what we need.

**Pipeline:**
1. During DOCX parsing, `parseDocx()` already calls `extractImages(zip, rels, imageRefs)`
2. The returned `images` array contains raw `ArrayBuffer` data for each embedded image
3. Convert non-PNG images to PNG (or keep as-is if already PNG/JPEG — browser can render both)
4. Write to filesystem via Tauri FS
5. For EMF/WMF (Windows metafiles): skip — these are vector formats that don't render in browsers. Log a warning.

**Chunk mapping:** Each DOCX image has a `position` field (`after_para_N`). We map this to the section that contains that paragraph index. The `sections` array from `splitMarkdownSections` gives us the boundary.

**Alt text extraction enhancement:** Currently `alt_text` is always `''`. We can extract it from the `<wp:docPr>` element's `descr` attribute in the drawing XML:
```xml
<wp:docPr id="1" name="Picture 1" descr="Diagram of binary tree traversal"/>
```
This is a small enhancement to `parseParagraph()` — extract `descr` when an `r:embed` is found.

**Decision: Keep original format for DOCX images.** JPEG images stay as JPEG (smaller). PNG stays as PNG. No re-encoding needed — the browser handles both. Only store file extension in the `file_path`.

### 2.4 Filesystem Layout

```
$APPDATA/
  images/
    {material_id}/
      slide_001.png       -- PPTX slides (rendered from PDF)
      slide_002.png
      page_001.png        -- PDF pages
      page_002.png
      embedded_001.png    -- DOCX embedded images (or .jpg)
      embedded_002.jpg
```

**Naming convention:** `{image_type}_{zero-padded-3-digit-number}.{ext}`

**Max dimensions:** Cap rendered images at **1600px** on the longest side. For PDF/PPTX rendering, choose the scale factor that produces ≈1600px width. For DOCX embedded images, if either dimension exceeds 1600px, scale down proportionally using a canvas resize before writing.

**Compression:** PNG files are written at default compression. No additional optimization — the files are local-only and storage is cheap. Average expected size:
- PDF page at 1.5x: 100-400KB
- PPTX slide at 1.5x: 50-200KB (less complex than typical PDFs)
- DOCX embedded: varies, typically 10-500KB

**Cleanup on material deletion:** Delete the entire `$APPDATA/images/{material_id}/` directory.

---

## 3. Upload Pipeline Integration

### Sequencing

Image extraction runs **after text parsing completes but before Phase 2 (skill extraction)**. It is part of Phase 1 (blocking) because:
- It needs the parsed document objects (PDF `doc`, DOCX `zip`) which are available during parsing
- It's I/O-bound (rendering + writing), not API-call-bound, so it's fast (~2-10 seconds for typical materials)
- Having images in the DB before skill extraction allows future skill-image linking

### Integration Points

**In `createCourse` (StudyContext.jsx line ~596-603):**
```
After: const mat = await storeAsChunks(courseId, f, ...)
Before: mats.push(mat)
Insert: await extractAndStoreImages(courseId, mat, f, { onStatus: setStatus })
```

**In `addMats` (StudyContext.jsx line ~1306-1314):**
Same pattern — after `storeAsChunks`, before `newMeta.push(mat)`.

### Error Isolation

Image extraction is wrapped in try/catch. Failure logs a warning and continues:
```js
try {
  await extractAndStoreImages(courseId, mat, f, { onStatus: setStatus });
} catch (e) {
  console.warn('[ImageExtract] Failed for', f.name, e);
  // Do NOT block — text pipeline continues
}
```

### The `extractAndStoreImages` Orchestrator

```
New function in: src/lib/imageExtractor.js

export async function extractAndStoreImages(courseId, mat, file, options = {}) {
  // 1. Determine format from file extension or mat.source_format
  // 2. Dispatch to format-specific extractor
  // 3. Write images to filesystem
  // 4. Insert MaterialImages rows into DB
  // 5. Link images to chunks (by page number matching)
  // Returns: { count: number, errors: string[] }
}
```

**Passing document objects:** The key challenge is that `parsePdf` creates a `doc` object (pdfjs document) and `parseDocx` creates a `zip` + `images` array — but these are consumed during `readFile()` in `parsers.js` and not currently returned to the caller.

**Solution:** Extend the `_structured` output to carry image-extraction-ready data:
- **PDF:** Stash `doc` reference on `_structured._pdfDoc` (it's a JS object, not serialized). The garbage collector won't collect it while the reference exists.
- **PPTX:** Stash the original `ArrayBuffer` on `_structured._originalBuffer` for LibreOffice conversion.
- **DOCX:** The `images` array is already on `_structured.images` with `data: ArrayBuffer`. Already available.

The `extractAndStoreImages` function reads these from `file._structured` or `mat._structured`.

---

## 4. AI Context Integration

### Image Catalog in `buildFocusedContext`

After the SOURCE MATERIAL section, append an AVAILABLE VISUALS block:

```
AVAILABLE VISUALS:
  img_42: slide 3 — "Algorithm 2: Evaluating infix expressions" (Lecture-5-Stacks.pptx)
  img_87: page 15 — "Figure 2.3: Binary tree traversal" (Textbook-Ch2.pdf)
  img_91: embedded 2 — "UML class diagram" (Project-Spec.docx)
```

### Which Images to Include

**Only images from materials/chunks already loaded in context.** This ensures the AI only references visuals the student has context for. Implementation:

1. After loading source material chunks in `buildFocusedContext`, collect the `chunk_id`s that were included
2. Query `MaterialImages.getByChunkIds(chunkIds)` — new batch method
3. Also include images from the material if no chunk mapping exists (DOCX images without clear chunk links)
4. Cap at **20 images** in the catalog to keep token budget ~150-200 tokens

### Token Budget

Each image catalog line ≈ 10-15 tokens. 20 images ≈ 200-300 tokens. Acceptable overhead — the source material section is typically 2,000-10,000 tokens.

### New DB Method

```js
// In MaterialImages module:
async getByChunkIds(chunkIds) {
  // Batched query: SELECT * FROM material_images WHERE chunk_id IN (?, ?, ...) ORDER BY page_or_slide_number
}
```

### Integration Location in `study.js`

At the end of each `focus.type` branch in `buildFocusedContext`, after the SOURCE MATERIAL section, before deadline context:

```js
// Load available visuals for context
var contextChunkIds = [...collectedChunkIds]; // gathered during source material loading
var images = await MaterialImages.getByChunkIds(contextChunkIds);
if (images.length > 0) {
  ctx += "\nAVAILABLE VISUALS:\n";
  for (var img of images.slice(0, 20)) {
    ctx += "  img_" + img.id.substring(0, 8) + ": " + img.image_type + " " + (img.page_or_slide_number || "?")
        + (img.caption ? " — \"" + img.caption + "\"" : "") + "\n";
  }
  ctx += "\n";
}
```

**Image ID in context:** Use a short prefix of the UUID (`img.id.substring(0, 8)`) to keep tokens low while remaining unique enough. The parse function will match on prefix.

---

## 5. AI Emit/Parse Protocol

### Tag Format

```
[SHOW_IMAGE]img_abc12345[/SHOW_IMAGE]
```

Mirrors the existing `[SKILL_UPDATE]...[/SKILL_UPDATE]` and `[UNLOCK_QUESTION]...[/UNLOCK_QUESTION]` patterns.

### System Prompt Addition

Append after the FACET-LEVEL ASSESSMENT section in `buildSystemPrompt`:

```
---

IMAGE DISPLAY:

When you reference a visual from the course materials — a slide, diagram, figure, or page — and the AVAILABLE VISUALS section lists a matching image, display it inline:

[SHOW_IMAGE]img_id[/SHOW_IMAGE]

Rules:
- Only use image IDs from the AVAILABLE VISUALS section in your context. Never invent IDs.
- Show an image when it would help the student understand what you're teaching: "Look at this diagram:" [SHOW_IMAGE]img_abc12345[/SHOW_IMAGE]
- Show the image BEFORE or AFTER your reference to it, not buried mid-sentence.
- Do NOT show images the student just uploaded or asked about — they already have those.
- Do NOT spam images. One or two per response when relevant. Skip if the visual doesn't add teaching value.
- If no matching visual exists in AVAILABLE VISUALS, describe it verbally instead. Never say "I can't show you the image."
```

### Parser Function

```js
// In src/lib/study.js, alongside parseSkillUpdates and parseQuestionUnlock:

export const parseImageTags = (response) => {
  const tags = [];
  const regex = /\[SHOW_IMAGE\]\s*(img_[a-f0-9]+)\s*\[\/SHOW_IMAGE\]/g;
  let m;
  while ((m = regex.exec(response)) !== null) {
    tags.push(m[1]); // e.g. "img_abc12345"
  }
  return tags; // Array of image ID prefixes
};
```

### Streaming-Safe Tag Stripping in `renderMd`

Add to the existing tag-stripping regexes in `renderMd` (`theme.jsx` line 59-64):

```js
.replace(/\[SHOW_IMAGE\][\s\S]*?\[\/SHOW_IMAGE\]/g, "")  // Complete tags
.replace(/\[SHOW_IMAGE\][\s\S]*$/g, "")                    // Partial tags during streaming
.replace(/\[SHOW_IM[\s\S]*$/g, "")                          // Partial tag prefix during streaming
```

Images are rendered separately (not inline in the markdown text) — see Section 6.

---

## 6. MessageList Rendering

### Image Display in Chat

Images are rendered as standalone blocks within assistant messages, similar to how skill pills and mastery cards are rendered below the message content.

### Implementation Approach

In `MessageList.jsx`, after `renderMd(m.content)` for assistant messages:

1. Call `parseImageTags(m.content)` to get image ID prefixes
2. Look up full image records from a ref/cache (preloaded when session starts)
3. Render `<InlineChatImage>` components for each

### `InlineChatImage` Component

```jsx
// Inline in MessageList.jsx or extracted to src/components/study/InlineChatImage.jsx

function InlineChatImage({ image }) {
  // image: { id, filePath, caption, imageType, pageOrSlideNumber, width, height }
  const [expanded, setExpanded] = useState(false);
  const src = convertFileSrc(image.absolutePath); // Tauri asset protocol

  return (
    <div style={{
      margin: "12px 0",
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid " + T.bd,
      background: T.sf,
      cursor: "pointer",
      maxWidth: 480,
    }} onClick={() => setExpanded(!expanded)}>
      <img
        src={src}
        alt={image.caption || ""}
        style={{
          width: "100%",
          maxHeight: expanded ? "none" : 320,
          objectFit: expanded ? "contain" : "cover",
          display: "block",
        }}
        loading="lazy"
      />
      {/* Caption bar */}
      <div style={{
        padding: "6px 10px",
        fontSize: 11,
        color: T.txD,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>{image.imageType} {image.pageOrSlideNumber}</span>
        {image.caption && <span style={{ color: T.txM }}>{image.caption}</span>}
      </div>
    </div>
  );
}
```

### Loading Images from Filesystem

**Tauri `convertFileSrc`** converts a filesystem path to a `tauri://localhost/` URL that the WebView can load. This is the standard Tauri approach for loading local files into `<img>` tags.

```js
import { convertFileSrc } from '@tauri-apps/api/core';

// Usage:
const src = convertFileSrc(appDataDir + '/images/' + image.filePath);
```

This requires the `fs:allow-read-file` permission (already granted for all paths) and the asset protocol scope.

**Alternative considered:** Base64 inline. Rejected — adds ~33% size overhead, bloats the React state, and forces all images into memory at once. `convertFileSrc` streams from disk.

### Image Record Cache

When a study session boots (`bootWithFocus` in StudyContext), pre-load image records for the active course:

```js
const courseImages = await MaterialImages.getByCourse(courseId);
// Store in a ref: imagesByIdPrefix = Map<string, ImageRecord>
// Key: img.id.substring(0, 8), Value: full image record with absolute path
```

This map is consulted by `MessageList` when parsing image tags from assistant messages.

---

## 7. Tauri Capability Additions

### `src-tauri/capabilities/default.json`

Add these permissions:

```json
{
  "identifier": "fs:allow-write-file",
  "allow": [{ "path": "$APPDATA/images/**" }]
},
{
  "identifier": "fs:allow-mkdir",
  "allow": [{ "path": "$APPDATA/images/**" }]
},
{
  "identifier": "fs:allow-remove",
  "allow": [
    { "path": "$APPDATA/study.db.backup.*" },
    { "path": "$APPDATA/images/**" }
  ]
}
```

The existing `fs:allow-read-file` with `{ "path": "**" }` already covers reading images.

### Shell Command Scope for LibreOffice

For the Tauri shell plugin to execute `soffice`, we need a shell scope. However, the current setup uses `tauri_plugin_shell::init()` without custom scopes, and the JS-side `Command` API requires either:
- A pre-defined command scope in `capabilities/default.json`, OR
- Using `Command.create('soffice', args)` with a corresponding scope entry

**Approach:** Use `Command.create` with a scoped shell command:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "soffice",
      "cmd": "soffice",
      "args": true
    }
  ]
}
```

**Alternative for macOS:** If `soffice` isn't on PATH, the full path is typically `/Applications/LibreOffice.app/Contents/MacOS/soffice`. We may need to try multiple paths. This is handled in the detection logic (Section 8).

---

## 8. LibreOffice Detection

### Detection Strategy

```js
// In src/lib/imageExtractor.js

async function detectLibreOffice() {
  // macOS paths (in priority order):
  const macPaths = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
  ];

  // Try 'which soffice' first (works if on PATH)
  try {
    const result = await Command.create('which', ['soffice']).execute();
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}

  // Try known paths
  for (const p of macPaths) {
    try {
      const result = await Command.create('test', ['-x', p]).execute();
      if (result.code === 0) return p;
    } catch {}
  }

  return null; // Not found
}
```

### User Notification When Not Found

On first encounter (per install), show a non-blocking notification:
```
"Slide image previews require LibreOffice (free). Install from libreoffice.org. Text extraction works without it."
```

Cache the detection result in a settings key:
- `libreoffice_path`: cached path (re-detect if the cached path stops working)
- `libreoffice_warned`: `"1"` if user was already notified

### Platform Notes

- **macOS:** `/Applications/LibreOffice.app/Contents/MacOS/soffice`
- **Windows (future):** `C:\Program Files\LibreOffice\program\soffice.exe`
- **Linux (future):** `/usr/bin/soffice` or `/usr/lib/libreoffice/program/soffice`

Only macOS is implemented for v1. Windows/Linux paths are documented for future expansion.

---

## 9. New File: `src/lib/imageExtractor.js`

### Module Structure

```js
// src/lib/imageExtractor.js — Image extraction pipeline for all material types
//
// Extracts visual content (slides, PDF pages, DOCX figures) at upload time
// and stores as PNG files + material_images DB records.
//
// Depends on: db.js (MaterialImages), Tauri FS + shell plugins, pdfjs-dist (lazy)

import { MaterialImages } from './db.js';

const IMAGE_SCALE = 1.5;          // Rendering scale for PDF/PPTX pages
const MAX_DIMENSION = 1600;        // Max px on longest side
const SOFFICE_TIMEOUT_MS = 60000;  // LibreOffice conversion timeout

// --- Main orchestrator ---
export async function extractAndStoreImages(courseId, mat, file, options = {}) { ... }

// --- Format-specific extractors ---
async function extractPdfImages(doc, numPages, materialId, courseId, baseDir) { ... }
async function extractPptxImages(buffer, materialId, courseId, baseDir) { ... }
async function extractDocxImages(structuredImages, materialId, courseId, baseDir) { ... }

// --- LibreOffice detection ---
async function detectLibreOffice() { ... }
let _cachedSofficePath = undefined; // undefined = not checked, null = not found, string = path

// --- Image writing utility ---
async function writeImageFile(canvas_or_buffer, filePath, maxDim) { ... }

// --- Chunk linking ---
async function linkImagesToChunks(materialId, courseId) { ... }

// --- Filesystem cleanup ---
export async function cleanupMaterialImages(materialId, appDataDir) { ... }
export async function cleanupCourseImages(courseId, appDataDir) { ... }
```

---

## 10. Chunk-Image Linking Strategy

### PDF
Each page-rendered image has a `page_or_slide_number`. Chunks from PDF parsing have `source_pages: { start, end }`. After image extraction, run:

```sql
UPDATE material_images SET chunk_id = (
  SELECT c.id FROM chunks c
  WHERE c.material_id = material_images.material_id
    AND json_extract(c.source_pages, '$.start') <= material_images.page_or_slide_number
    AND json_extract(c.source_pages, '$.end') >= material_images.page_or_slide_number
  LIMIT 1
)
WHERE material_id = ? AND chunk_id IS NULL;
```

Actually, `source_pages` is stored in the `structural_metadata` column or as part of the chunk label. Need to check the chunks table schema. **Simpler approach:** Do the linking in JavaScript after both chunks and images are created — iterate images, find the chunk whose page range includes the image's page number.

### PPTX
Slide N maps to page N. Each PPTX chunk (from `_structured.sections`) corresponds to a slide number extracted from the section heading ("Slide N"). Same linking logic as PDF.

### DOCX
Images have `position: "after_para_N"`. Map paragraph index to section index (the sections from `splitMarkdownSections` can be indexed by cumulative paragraph count). This is approximate but sufficient.

---

## 11. Constraints Verification

| Constraint | Satisfied? |
|---|---|
| Image extraction failure never blocks text extraction | Yes — try/catch wrapper in pipeline, extraction runs after text parsing |
| No existing parser return shapes break | Yes — `_structured` gains new optional fields (`_pdfDoc`, `_originalBuffer`), existing fields unchanged |
| No schema changes to existing tables | Yes — only new `material_images` table |
| Storage manageable | Yes — 1600px max, 1.5x scale, ~100-400KB per image |
| Migration 007 is additive only | Yes — CREATE TABLE + CREATE INDEX only |

---

## 12. Implementation Order

1. **Migration 007 + MaterialImages DB module** — schema foundation
2. **Tauri capabilities** — fs:write, fs:mkdir, fs:remove for images dir, shell scope for soffice
3. **lib.rs** — add Migration { version: 7 } entry
4. **imageExtractor.js** — core extraction logic for PDF, PPTX, DOCX
5. **parsers.js** — stash `_pdfDoc` and `_originalBuffer` on `_structured`; enhance DOCX alt text
6. **StudyContext.jsx** — hook `extractAndStoreImages` into `createCourse` and `addMats`; cleanup in `removeMat`/`delCourse`
7. **study.js** — `buildFocusedContext` image catalog; `parseImageTags` function; `renderMd` tag stripping
8. **buildSystemPrompt** — IMAGE DISPLAY section
9. **MessageList.jsx** — `InlineChatImage` component + image tag parsing + `convertFileSrc` rendering
10. **StudyContext.jsx** — image record cache in `bootWithFocus` for MessageList lookup

---

## 13. Open Questions for Implementation

1. **PDF doc lifecycle:** Verify that stashing `doc` on `_structured._pdfDoc` prevents GC and the doc remains usable after `readFile` returns. If pdfjs-dist has internal cleanup, may need to clone or delay cleanup.

2. **OffscreenCanvas toBlob:** The OCR engine uses `OffscreenCanvas` when available. `OffscreenCanvas.convertToBlob()` returns a `Blob` — verify this works in Tauri's WebView (WebKit). Fallback: use regular `HTMLCanvasElement` + `canvas.toBlob()`.

3. **Asset protocol scope:** `convertFileSrc` may require an explicit `asset:` protocol scope in Tauri v2. Need to verify if `fs:allow-read-file` is sufficient or if additional `asset-protocol-scope` config is needed in `tauri.conf.json`.

4. **Shell scope syntax:** Tauri v2's shell plugin scope syntax for `Command.create` may differ from v1. Verify against current `@tauri-apps/plugin-shell` version used in the project.
