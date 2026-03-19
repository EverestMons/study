# Development: Image Storage Layer
**Date:** 2026-03-19
**Status:** Complete
**Step:** 3 — Migration 007 + MaterialImages DB Module + Filesystem Storage Layer

---

## Changes Made

### 1. `src-tauri/migrations/007_material_images.sql` (NEW)
- `material_images` table with: id, material_id, course_id, image_type, page_or_slide_number, caption, file_path, width, height, chunk_id, file_size_bytes, created_at
- Foreign keys to materials, courses, chunks
- 3 indexes: material_id, course_id, chunk_id
- Additive only — no existing table modifications

### 2. `src-tauri/src/lib.rs`
- Added Migration { version: 7, description: "material_images" } to the migrations vec

### 3. `src/lib/db.js` — MaterialImages Module
Added between AssignmentQuestionFacets and the facet migration section. Methods:
- `getByMaterial(materialId)` — ordered by page_or_slide_number
- `getByChunk(chunkId)` — ordered by page_or_slide_number
- `getByChunkIds(chunkIds)` — batched IN query for context builder
- `getByCourse(courseId)` — ordered by material_id, page_or_slide_number
- `getByMaterialAndPage(materialId, pageNum)` — single lookup
- `getById(id)`
- `create({...})` — single insert with uuid()
- `createBatch(images)` — uses withTransaction, returns array of ids
- `updateChunkId(id, chunkId)` — for post-extraction chunk linking
- `deleteByMaterial(materialId)` — DB rows only
- `deleteByCourse(courseId)` — DB rows only
- `getCountByMaterial(materialId)` — for UI badges
- `getCountsByCourse(courseId)` — bulk counts grouped by material_id, returns `{ materialId: count }` map

Also added `material_images` to the `resetAll` table deletion list (before `chunks` to respect FK order).

### 4. `src/lib/imageStore.js` (NEW)
Filesystem helper module using `@tauri-apps/plugin-fs` and `@tauri-apps/api/path`. All Tauri imports are lazy (`await import(...)`) to match the existing pattern in db.js. Functions:
- `getImagesRoot()` — returns `$APPDATA/images/`
- `getImageDir(materialId)` — returns `$APPDATA/images/{materialId}/`
- `ensureImageDir(materialId)` — creates directory tree if needed, uses `exists()` + `mkdir()`
- `saveImage(materialId, filename, data)` — writes Uint8Array/ArrayBuffer to disk, returns `{ absolutePath, relativePath, size }`
- `deleteImageDir(materialId)` — removes directory recursively, safe if not exists
- `deleteCourseImages(materialIds)` — deletes image dirs for all materials in a course
- `getImageUrl(relativePath)` — converts to Tauri asset URL via `convertFileSrc`
- `getImageAbsolutePath(relativePath)` — resolves to absolute filesystem path

### 5. `src-tauri/capabilities/default.json`
Added permissions:
- `fs:allow-write-file` for `$APPDATA/images/**`
- `fs:allow-mkdir` for `$APPDATA/images/**`
- `fs:allow-exists` for `$APPDATA/images/**`
- `fs:allow-remove` expanded to include `$APPDATA/images/**` (merged with existing backup entry)

## Build Verification
- Vite build: PASS (built in ~66s, no errors)
- Cargo check: PASS (compiled in ~98s, no errors)

## Notes
- `imageStore.js` caches `appDataDir()` result to avoid repeated async calls
- All Tauri FS imports are lazy to avoid crashing at startup if the WebView has issues
- `createBatch` uses `withTransaction` for consistency with all other batch operations in db.js
- `getByChunkIds` uses dynamic placeholder construction for the IN clause
- The `fs:allow-exists` permission was added beyond what the architecture doc specified — needed by `ensureImageDir` to check directory existence before creating
