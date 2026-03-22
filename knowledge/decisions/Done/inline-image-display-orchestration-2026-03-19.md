# study — Inline Image Display (Tutor Visual Content)
## Execution Plan
**Date:** 2026-03-19
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** AI tutor can display images from course materials inline in the chat — slides, PDF pages, textbook figures, DOCX diagrams

---

## Feature Summary

The AI tutor currently references source material by text content only. When it says "look at slide 31" or "refer to Figure 2.3," the student can't see the visual. This feature adds an image extraction pipeline at upload time, a `material_images` catalog in the database, image-aware AI context so the tutor knows what visuals are available, a tag-based emit/parse system so the AI can request image display, and inline image rendering in the chat UI.

Scope covers all material types: PPTX slides (via LibreOffice CLI → PDF → page rendering), PDF pages and embedded figures (via pdfjs-dist), and DOCX embedded images (via ZIP extraction). Images are pre-rendered at upload time and stored as PNG files on the filesystem (`$APPDATA/images/{material_id}/`), with metadata in a new `material_images` SQLite table (migration 007).

## CEO Decisions (Locked In)

1. **Pre-render at upload time** — images extracted and stored alongside chunks during the upload/parsing pipeline, not on-demand during tutoring sessions
2. **Separate `material_images` table** — image catalog with page/slide number, caption/alt text, file path; not embedded in chunk rows
3. **LibreOffice CLI** for PPTX → PDF conversion — slide rendering fidelity requires it; user must have LibreOffice installed
4. **Filesystem storage** for image files — PNG files in `$APPDATA/images/{material_id}/`, DB stores relative path references; keeps SQLite lean
5. **All material types** — slides, PDFs, and DOCX documents; not limited to PPTX
## What Already Exists

*(SA agent should verify these during Step 1 — this is the Planner's understanding from specialist files and project status)*

- **PPTX parser** (`src/lib/parsers.js`): Extracts text from slide XML via regex. Returns `_structured` with per-slide sections. No image extraction.
- **PDF parser** (`src/lib/pdfParser.js`): Uses pdfjs-dist for text extraction. Heading detection via font size analysis. No page-to-image rendering in the parsing pipeline (but OCR engine already does this).
- **OCR engine** (`src/lib/ocrEngine.js`): Renders PDF pages to canvas at 2x scale via pdfjs-dist — this exact pattern works for image capture. Proven in production.
- **DOCX parser** (`src/lib/docxParser.js`): Uses mammoth for text. Does not extract embedded images.
- **Upload pipeline** (`StudyContext.jsx`): `createCourse` and `addMats` handlers drive parsing → chunking → extraction. Image extraction hooks would go here.
- **MessageList.jsx**: Renders chat messages — text, markdown (via `renderMd`), code blocks, skill pills, mastery cards. No image rendering.
- **`buildFocusedContext`** (`src/lib/study.js`): Loads chunk text content for AI context. No awareness of images.
- **System prompt** (`buildSystemPrompt` in `study.js`): Includes SKILL STRENGTH TRACKING and FACET-LEVEL ASSESSMENT sections. No image display instructions.
- **Tauri capabilities** (`src-tauri/capabilities/default.json`): `shell:allow-open`, `fs:allow-read-file` (all paths), `fs:allow-copy-file` (`$APPDATA/*`). Needs `fs:allow-write-file` for image storage and shell command scope for LibreOffice.
- **DB migrations**: Currently at 006. New table = migration 007.
- **Tauri shell plugin**: Initialized in `lib.rs`. JS-side `Command` API available for CLI execution.
## Execution Steps

---

### Step 1 — Architecture: Image Extraction Pipeline + Display System Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SYSTEMS_ANALYST.md`
- This execution plan (CEO decisions, What Already Exists)
- `src/lib/parsers.js` (current PPTX/PDF/DOCX parsing — understand return shapes)
- `src/lib/ocrEngine.js` (canvas rendering pattern — reusable for image capture)
- `src/lib/pdfParser.js` (pdfjs-dist usage patterns)
- `src/lib/docxParser.js` (mammoth usage, understand what's extractable)
- `src/lib/study.js` — `buildFocusedContext` (context builder injection points), `buildSystemPrompt` (prompt injection point)
- `src/lib/db.js` (existing table/module patterns for the new `material_images` table)
- `src/components/study/MessageList.jsx` (current rendering — understand insertion points)
- `src/StudyContext.jsx` — `createCourse`, `addMats` (upload pipeline hooks)
- `src-tauri/capabilities/default.json` (current permissions — what needs to be added)
- `src-tauri/src/lib.rs` (migration pattern, shell plugin init)
- `src-tauri/migrations/006_assignment_activation.sql` (latest migration — pattern reference)
**Task:**

Design the complete architecture for image extraction, storage, AI context integration, and chat display:

1. **Migration 007 schema** — `material_images` table design:
   - Fields: id, material_id, course_id, image_type (slide/page/figure/embedded), page_or_slide_number, caption (OCR or alt text), file_path (relative to $APPDATA/images/), width, height, chunk_id (nullable FK — which chunk does this image relate to?), created_at
   - Indexes: material_id, course_id, chunk_id
   - `MaterialImages` DB module: CRUD methods, getByMaterial, getByChunk, getByMaterialAndPage, deleteByMaterial (with filesystem cleanup)

2. **Image extraction architecture per format:**
   - **PPTX**: LibreOffice CLI detection + PPTX → PDF conversion → pdfjs-dist page rendering → PNG files. Define the command, temp file handling, error path when LibreOffice not installed (graceful degradation — text extraction still works, images just missing). Define how slide numbers map between PPTX sections and rendered pages.
   - **PDF**: pdfjs-dist `getPage()` → `render()` → canvas → PNG. Determine rendering scale (balance quality vs storage). Determine which pages to render (all? only pages referenced by chunks? configurable?). How to detect and extract embedded figures separately from full-page renders.
   - **DOCX**: ZIP-based image extraction from `word/media/` folder. How to map extracted images to their location in the document (relationship IDs in document.xml). Alt text extraction.
   - For all: filesystem layout (`$APPDATA/images/{material_id}/{type}_{number}.png`), naming convention, cleanup on material deletion.

3. **Upload pipeline integration** — where in `createCourse`/`addMats` does image extraction hook in? After text parsing but before skill extraction? Parallel with chunking? Define the sequencing and error isolation (image extraction failure must not block text pipeline).

4. **AI context integration** — how `buildFocusedContext` exposes available images:
   - Format for the image catalog block in context (e.g., `AVAILABLE VISUALS:\n  slide_3 (img_id: 42) — "Algorithm 2: Evaluating infix expressions"\n  page_15 (img_id: 87) — "Figure 2.3: Binary tree traversal"`)
   - Token budget for image catalog (~100-200 tokens)
   - Which images to include (only those from chunks already in context? all from the material?)
5. **AI emit/parse protocol** — tag format for the AI to request image display:
   - Define the tag: e.g., `[SHOW_IMAGE]img_id[/SHOW_IMAGE]`
   - System prompt additions for the IMAGE DISPLAY section
   - `parseImageTags` function design (similar to `parseSkillUpdates`)
   - Rules for the AI: when to show images (when referencing visual content, when teaching from slides), when not to (don't spam images, don't show images the student just uploaded)

6. **MessageList rendering** — how images appear in chat:
   - Image component design (container with image, caption, slide/page number label, click-to-expand?)
   - How `renderMd` or a new parser detects image tags in assistant messages and replaces them with image components
   - Image loading from filesystem path (Tauri `convertFileSrc` for asset protocol? Or base64 inline?)

7. **Tauri capability additions** — `fs:allow-write-file` scope for `$APPDATA/images/**`, shell command scope for LibreOffice soffice binary.

8. **LibreOffice detection** — how to detect if LibreOffice is installed, where the `soffice` binary lives on macOS (and eventually Windows/Linux), what to show the user if it's not found.

**Constraints:**
- Image extraction failure must NEVER block text extraction — graceful degradation
- No existing parser return shapes should break — image extraction is additive
- No schema changes to existing tables
- Storage must be manageable — define max image dimensions and compression
- Migration 007 is additive only (consistent with expand-and-contract)

**Output deposit:** `study/knowledge/architecture/inline-image-display-2026-03-19.md`
**Depends on:** None (first step)
---

### Step 2 — UX Design: Image Display in Chat + Image Availability Indicators
**Agent:** Study UX Designer
**Specialist file:** `study/agents/STUDY_UX_DESIGNER.md`
**Reads:**
- `study/agents/STUDY_UX_DESIGNER.md`
- This execution plan
- Step 1 deposit: `study/knowledge/architecture/inline-image-display-2026-03-19.md`
- `src/components/study/MessageList.jsx` (current chat rendering for integration context)
- `src/screens/MaterialsScreen.jsx` (material cards — for image availability indicator)

**Task:**

Design the UX for image display in the tutor chat and image availability indicators in the materials UI:

1. **Inline image in chat:** When the AI shows an image, how does it appear in the message flow? Options: embedded in the message text at the tag location, or as a separate block below the message. Size constraints (max width relative to message column). Caption placement. Border/frame treatment matching the app's dark theme. Should the image be expandable (click to see full-res in a lightbox)?

2. **Image caption/label:** What information shows alongside the image? Slide number, page number, figure label, material name? How is this styled relative to the image?

3. **Multiple images in one message:** If the AI shows 2-3 images in a single response, how are they laid out? Inline sequentially? Grid? This shouldn't overwhelm the chat flow.

4. **Materials screen indicator:** How does the user know which materials have images available? Badge on material cards ("12 slides", "8 figures")? This helps set expectations — if slides have no images, the user knows LibreOffice wasn't found or extraction failed.

5. **LibreOffice missing state:** If PPTX slides are uploaded but LibreOffice isn't installed, what does the user see? Where is the message surfaced (upload notification? material card badge? settings?)

6. **Loading state:** Images may take a moment to load from disk. What does the placeholder look like? Shimmer? Skeleton with dimensions?

**Constraints:**
- Images must not dominate the chat — the conversation is primary, images are supplementary
- Dark theme compatibility (transparent backgrounds may not work — define fallback bg)
- Aesthetic decisions (exact colors, border radius, shadow) escalated to CEO
- Must be accessible — alt text on images from caption field

**Output deposit:** `study/knowledge/design/inline-image-ux-2026-03-19.md`
**Depends on:** Step 1 (needs architecture to understand image data shape)
---

### Step 3 — Development: Migration 007 + MaterialImages DB Module + Filesystem Storage Layer
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: `study/knowledge/architecture/inline-image-display-2026-03-19.md`
- `src-tauri/migrations/006_assignment_activation.sql` (migration pattern)
- `src-tauri/src/lib.rs` (add migration 007)
- `src/lib/db.js` (add MaterialImages module following existing patterns)
- `src-tauri/capabilities/default.json` (add fs:allow-write-file + shell scope)

**Task:**

1. Create `src-tauri/migrations/007_material_images.sql` — schema per SA blueprint
2. Add migration 007 to `lib.rs` migration vec
3. Add `MaterialImages` DB module to `db.js` — all CRUD methods per SA blueprint
4. Add filesystem helper module `src/lib/imageStore.js`:
   - `getImageDir(materialId)` — returns `$APPDATA/images/{material_id}/`
   - `ensureImageDir(materialId)` — creates dir if not exists
   - `saveImage(materialId, filename, pngData)` — writes PNG to disk
   - `deleteImageDir(materialId)` — removes dir and all contents (for material deletion cleanup)
   - `getImageUrl(relativePath)` — converts relative path to Tauri asset URL
5. Update `src-tauri/capabilities/default.json` — add `fs:allow-write-file` for `$APPDATA/images/**`, add `fs:allow-mkdir` for `$APPDATA/images/**`, add `fs:allow-remove` for `$APPDATA/images/**`
6. Verify build passes

**Constraints:**
- Migration 007 is additive only — no existing table modifications
- `MaterialImages` module follows existing db.js patterns exactly (same style, same error handling)
- `imageStore.js` uses `@tauri-apps/plugin-fs` APIs (already a dependency)

**Output deposit:** `study/knowledge/development/image-storage-layer-2026-03-19.md`
**Depends on:** Step 1
---

### Step 4 — Development: Image Extraction Pipeline (All Formats)
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: architecture blueprint
- Step 3 deposit: storage layer dev log (MaterialImages API, imageStore API)
- `src/lib/parsers.js` (PPTX, PDF, DOCX parser functions — add image extraction alongside text)
- `src/lib/ocrEngine.js` (canvas rendering pattern to reuse)
- `src/lib/pdfParser.js` (pdfjs-dist usage)
- `src/StudyContext.jsx` — `createCourse`, `addMats` (hook image extraction into upload pipeline)

**Task:**

1. Create `src/lib/imageExtractor.js` — the image extraction orchestrator:
   - `extractImagesFromPdf(file, materialId, courseId)` — pdfjs-dist page rendering → canvas → PNG → save via imageStore → insert MaterialImages rows
   - `extractImagesFromPptx(file, materialId, courseId)` — LibreOffice detection → PPTX → PDF temp file → delegate to PDF extractor for page images
   - `extractImagesFromDocx(file, materialId, courseId)` — ZIP open → extract `word/media/*` images → save via imageStore → parse document.xml relationships for alt text → insert MaterialImages rows
   - `detectLibreOffice()` — check if `soffice` binary exists on the system; return path or null
   - All functions return `{ success: boolean, imageCount: number, error?: string }` — never throw

2. Hook into upload pipeline in `StudyContext.jsx`:
   - After text parsing succeeds, call the appropriate `extractImagesFrom*` function
   - Image extraction is fire-and-don't-block — errors logged but don't prevent text extraction or skill extraction from proceeding
   - Progress callback for UI status updates ("Extracting images...")

3. Add Tauri shell command scope for LibreOffice:
   - Configure `soffice` as an allowed shell command in Tauri capabilities
   - JS-side: use `@tauri-apps/plugin-shell` `Command` API to invoke LibreOffice

4. Wire material deletion to image cleanup — when a material is deleted, call `deleteImageDir(materialId)` and `MaterialImages.deleteByMaterial(materialId)`

5. Verify build passes

**Constraints:**
- Image extraction MUST NOT block or break text parsing — completely isolated error paths
- LibreOffice not installed = PPTX images silently skipped (text extraction still works)
- Canvas memory management — free canvas after each page render (same pattern as ocrEngine.js)
- Define reasonable limits: max image dimensions (per SA blueprint), max images per material

**Output deposit:** `study/knowledge/development/image-extraction-pipeline-2026-03-19.md`
**Depends on:** Steps 1, 3
---

### Step 5 — Development: AI Context Integration + Emit/Parse Protocol
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: architecture blueprint (context integration + emit/parse sections)
- Step 4 deposit: extraction pipeline dev log
- `src/lib/study.js` — `buildFocusedContext` (all 5 focus type branches), `buildSystemPrompt`
- `src/lib/study.js` — `parseSkillUpdates` (pattern for `parseImageTags`)

**Task:**

1. Add `buildImageCatalog(materialIds, chunkIds)` to `study.js`:
   - Query `MaterialImages` for images associated with the active materials/chunks
   - Format as structured text block: image ID, type, page/slide number, caption
   - Token budget cap per SA blueprint
   - Returns empty string if no images exist (backward compat)

2. Inject image catalog into `buildFocusedContext`:
   - All focus types that load source material should also load the image catalog
   - Insert after SOURCE MATERIAL section: `AVAILABLE VISUALS:\n...`

3. Add IMAGE DISPLAY section to `buildSystemPrompt`:
   - Instructions for when/how to emit `[SHOW_IMAGE]` tags
   - Rules: show images when referencing visual content, don't show images the student already has open, don't spam, include a brief verbal description alongside the image so the student understands what they're looking at

4. Add `parseImageTags(content)` function:
   - Extract `[SHOW_IMAGE]img_id[/SHOW_IMAGE]` tags from assistant messages
   - Return array of `{ imageId, position }` objects
   - Strip tags from displayed text content (image component renders separately)

5. Verify build passes

**Constraints:**
- Backward compatible — sessions without images must work identically to current behavior
- Image catalog must not blow up token budget — cap defined by SA
- `parseImageTags` must not interfere with `parseSkillUpdates` — they operate on different tag patterns

**Output deposit:** `study/knowledge/development/image-context-protocol-2026-03-19.md`
**Depends on:** Steps 1, 4
---

### Step 6 — Development: Chat Image Rendering (MessageList Enhancement)
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: architecture blueprint (rendering section)
- Step 2 deposit: UX design (layout, sizing, interactions)
- Step 5 deposit: context protocol dev log (parseImageTags API)
- `src/components/study/MessageList.jsx` (current rendering — add image components)
- `src/lib/theme.jsx` (theme constants for styling)

**Task:**

1. Add `InlineChatImage` component (either in MessageList or as a separate small component):
   - Loads image from filesystem path via Tauri asset protocol (`convertFileSrc`)
   - Displays caption, slide/page number label
   - Sizing and layout per UX design spec
   - Loading placeholder while image loads from disk
   - Click-to-expand behavior (if specified by UX design)
   - Error state if image file is missing (graceful — show placeholder with "Image not available")

2. Integrate `parseImageTags` into MessageList rendering:
   - For assistant messages, parse image tags
   - Replace tag positions with `InlineChatImage` components
   - Images render inline in the message flow at the position the AI placed them

3. Add image count indicator to material cards on MaterialsScreen (if specified by UX design):
   - Query `MaterialImages.countByMaterial(materialId)`
   - Display badge on material cards

4. Verify build passes

**Constraints:**
- Images must not break the chat scroll behavior
- Dark theme compatible — define image container background
- Must handle missing image files gracefully (material re-uploaded, images not yet extracted)
- Aesthetic decisions per CEO preferences (border radius, shadow, etc. — follow UX design spec, flag specifics to CEO)

**Output deposit:** `study/knowledge/development/image-chat-rendering-2026-03-19.md`
**Depends on:** Steps 1, 2, 5
---

### Step 7 — QA: Full Feature Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
- Step 1 deposit: architecture blueprint
- Steps 3-6 deposits: all development logs
- All modified and new source files

**Task:**

Test the following scenarios:

**Storage Layer (Step 3):**
1. Migration 007 applies cleanly on fresh DB
2. Migration 007 applies cleanly on existing DB with data
3. MaterialImages CRUD operations work correctly
4. imageStore creates/reads/deletes image directories correctly
5. Tauri FS permissions allow writes to `$APPDATA/images/`

**Extraction Pipeline (Step 4):**
6. PDF upload: page images extracted and stored correctly
7. PPTX upload with LibreOffice installed: slides rendered as images correctly
8. PPTX upload WITHOUT LibreOffice: text extraction works, images gracefully skipped, user informed
9. DOCX upload with embedded images: images extracted correctly
10. DOCX upload with no images: no crash, no empty image records
11. Material with 50+ pages: extraction completes without memory issues, reasonable time
12. Corrupt/unusual files: extraction fails gracefully, text pipeline unaffected
13. Material deletion: image directory and DB records cleaned up
**AI Context + Protocol (Step 5):**
14. Image catalog appears in AI context for materials with images
15. Image catalog absent for materials without images (no empty section)
16. Token budget: image catalog stays within defined limits
17. `parseImageTags` correctly extracts image IDs from various message formats
18. `parseImageTags` doesn't interfere with `parseSkillUpdates`

**Chat Rendering (Step 6):**
19. Image renders inline in assistant message at correct position
20. Image loads from filesystem path via Tauri asset protocol
21. Missing image file shows graceful fallback, not broken image
22. Multiple images in one message render correctly
23. Chat scroll behavior not broken by image insertion
24. Material card image count badge shows correct numbers

**Integration:**
25. Full flow: upload PPTX → images extracted → start tutoring session → AI references slide → image appears in chat
26. Full flow: upload PDF textbook → page images extracted → AI references Figure 2.3 → image appears
27. Session with no-image materials: behaves identically to current system
28. Build verification: `npx vite build --mode development`

**Constraints:**
- Test on actual PPTX and PDF files with real content
- Verify memory usage during extraction of large documents
- Verify no regressions in existing tutoring flow

**Output deposit:** `study/knowledge/qa/inline-image-qa-2026-03-19.md`
**Depends on:** Steps 3, 4, 5, 6
---

### Step 8 — UX Validation: Image Display Experience
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/agents/STUDY_UX_VALIDATOR.md`
- Step 2 deposit: UX design spec
- Step 7 deposit: QA report
- Running app with the feature live

**Task:**

Validate against the UX design spec:

1. **Image relevance:** Does the AI show images at appropriate moments? Is it helping or cluttering?
2. **Image sizing:** Are images appropriately sized in the chat flow? Not too large (dominating), not too small (useless)?
3. **Caption clarity:** Do captions help the student understand what they're looking at?
4. **Chat flow:** Does the conversation still feel like a conversation with visual aids, not an image gallery?
5. **Degraded state:** When images aren't available (LibreOffice missing, extraction failed), is the experience clear and not confusing?
6. **Learning science alignment:** Do inline visuals support the tutoring interaction? Does showing the exact slide/figure the AI is discussing improve comprehension? Any risk of the student passively viewing instead of actively engaging?

**Output deposit:** `study/knowledge/design/validation/inline-image-uxv-2026-03-19.md`
**Depends on:** Steps 2, 7
---

## Dependency Chain

```
Step 1 (SA: Architecture Blueprint)
  ├── Step 2 (UXD: Image Display Design)          ── parallel with Step 3
  ├── Step 3 (DEV: Storage Layer + Migration)      ── parallel with Step 2
  │     └── Step 4 (DEV: Extraction Pipeline)
  │           └── Step 5 (DEV: AI Context + Protocol)
  │                 └── Step 6 (DEV: Chat Rendering)   ── also depends on Step 2
  │                       └── Step 7 (QA: Full Verification)
  │                             └── Step 8 (UXV: Validation)
```

**Parallel lanes:**
- Steps 2 and 3 can execute in parallel after Step 1
- Steps 4-6 are sequential (each builds on the previous)
- Steps 7 and 8 are sequential (QA before UXV)

## How to Execute in Claude Code

Each step runs as a separate Claude Code session. Assemble the prompt from each step's fields:

1. Copy the **Agent** identity line and specialist file path
2. Copy the **Reads** list — these are the files the agent must read before starting
3. Copy the **Task** section — this is the agent's assignment
4. Copy the **Constraints** section
5. Add: "When complete, write your output to `[output deposit path]` and include an Output Receipt at the bottom."

The agent reads its own agent file first, then the listed reads, then executes the task.
## Knowledge Base Deposits (Expected)

| Step | File | Location |
|------|------|----------|
| 1 | Architecture blueprint | `study/knowledge/architecture/inline-image-display-2026-03-19.md` |
| 2 | UX design spec | `study/knowledge/design/inline-image-ux-2026-03-19.md` |
| 3 | Storage layer dev log | `study/knowledge/development/image-storage-layer-2026-03-19.md` |
| 4 | Extraction pipeline dev log | `study/knowledge/development/image-extraction-pipeline-2026-03-19.md` |
| 5 | Context protocol dev log | `study/knowledge/development/image-context-protocol-2026-03-19.md` |
| 6 | Chat rendering dev log | `study/knowledge/development/image-chat-rendering-2026-03-19.md` |
| 7 | QA report | `study/knowledge/qa/inline-image-qa-2026-03-19.md` |
| 8 | UX validation | `study/knowledge/design/validation/inline-image-uxv-2026-03-19.md` |

## Open Questions for CEO During Execution

1. **Rendering scale for PDF page images** — SA will recommend a scale factor (balancing quality vs storage). CEO may want to see sample output at different scales before locking in.
2. **Max images per material** — should there be a cap? A 200-slide deck produces 200 images. SA will recommend.
3. **Click-to-expand behavior** — UXD will propose options. CEO decides whether images in chat should be expandable to full-res.
4. **LibreOffice install guidance** — what should the app tell users who don't have LibreOffice? Just a note, or a link to download? CEO decides tone/approach.
5. **Image extraction for existing materials** — should there be a "Re-extract images" button for materials uploaded before this feature? Or only new uploads get images?


---

## Agent Review Amendments (Post-Review)

The following amendments were identified by cross-referencing each step against the executing agent's specialist file. These are additions to the plan, not replacements.

### Step 1 (SA) — Amendments

**Additional reads:**
- `docs/skill-architecture-redesign.md` — SA agent file mandates reading this before any schema work. Must confirm `material_images` table is consistent with the existing schema philosophy.

**Additional task items:**
- **9. Chunk-to-image mapping strategy** — define how `chunk_id` FK gets populated on `material_images` rows. Options: page number overlap with chunk `source_pages` field, slide number matching chunk section path, or a post-extraction binding pass. This is non-trivial and the DEV needs a clear algorithm.
- **10. Tauri command vs JS shell** — evaluate whether LibreOffice execution should go through a Rust-side Tauri command wrapper (for better security sandboxing and process management) or if the JS-side `@tauri-apps/plugin-shell` `Command` API is sufficient. Make a recommendation with rationale.
- **11. Temp file strategy** — define where PPTX→PDF conversion temp files are stored (`$APPDATA/tmp/`, system temp, or working directory), how they're cleaned up (immediate after conversion, on-error cleanup), and filesystem permission implications.
- **12. Canvas availability confirmation** — confirm that `OffscreenCanvas` or `<canvas>` element creation works in the Tauri WebView for image rendering (the OCR engine already does this, but SA should explicitly confirm for the image extraction context).

### Step 2 (UXD) — Amendments

**Clarified read purpose:**
- `src/components/study/MessageList.jsx` — read specifically for **visual pattern consistency** with existing skill pills, mastery cards, and facet progress UI. The image display should feel like it belongs in the same design language.

**Additional task item:**
- **7. First-time user with no LibreOffice** — design the messaging for a brand-new user who uploads PPTX as their first material and doesn't have LibreOffice. Where does this message appear, what does it say, and how does it guide the user to install LibreOffice or convert to PDF?

### Steps 3-6 (DEV) — Amendments

**Step 3 additional constraint:**
- Note all new dependencies (if any) in the development log — per developer agent file requirement.

**Step 4 additional constraints:**
- Temp file cleanup must be defined per SA blueprint (Step 1, item 11).
- If `OffscreenCanvas` is not available, fall back to DOM `<canvas>` element creation (create, render, extract, remove) — same pattern as ocrEngine.js.

### Step 7 (QA) — Amendments

**Additional test scenarios:**

**Security (critical — per QA agent file's Tauri security mandate):**
29. Shell command scope: verify that ONLY `soffice` is executable via the Tauri shell plugin — no arbitrary command execution possible
30. Image path traversal: verify that `file_path` values in `material_images` DB are sanitized and cannot reference files outside `$APPDATA/images/`
31. Malformed PPTX/DOCX XML: verify that relationship IDs or media paths from malformed files cannot inject dangerous file paths

**Edge cases:**
32. Disk full during image extraction: verify text parsing pipeline completes successfully, image extraction fails gracefully
33. Very large PDF (200+ pages): verify memory doesn't spike uncontrollably, extraction handles pagination
34. PPTX with no visual content (text-only slides): verify LibreOffice conversion still produces usable images, or gracefully indicates "no visual content"

**Migration Safety (mandatory per QA agent file):**
- Migration Safety field must be included in QA report

### Step 8 (UXV) — Amendments

**Additional validation area:**
- **7. First-time user LibreOffice state** — simulate being a new student uploading PPTX without LibreOffice installed. Is the messaging clear, actionable, and not alarming? Does the student understand they're not losing anything (text extraction still works)?
- Must include **Learning Science Risk** field in output (per agent file)


---

## Prompt Feedback Amendment (Added 2026-03-19)

Every step prompt in this plan must include the following section at the end, before the Output Receipt:

```
After your output receipt, include a brief "Prompt Feedback" section:
- Were any reads unnecessary? Which files could have been skipped?
- Was the prompt over-scoped or under-scoped?
- What would have made this prompt more efficient?
```

This applies to all 8 steps. The Planner will record key takeaways in `study/knowledge/research/agent-prompt-feedback.md` after execution.
