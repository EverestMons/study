# Phase 1 Dev Log: Folder Import Backend

**Date:** 2026-03-10
**Blueprint:** `knowledge/architecture/folder-import-2026-03-10.md`

---

## Changes

### Step 1.2 — Tauri Plugin Installation (4 files modified)

| File | Change |
|------|--------|
| `package.json` | Added `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` |
| `src-tauri/Cargo.toml` | Added `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"` |
| `src-tauri/src/lib.rs` | Registered `.plugin(tauri_plugin_dialog::init())` and `.plugin(tauri_plugin_fs::init())` |
| `src-tauri/capabilities/default.json` | Added `dialog:default`, `dialog:allow-open`, `fs:allow-read-dir`, `fs:allow-read-file` with `**` path |

Resolved: `tauri-plugin-dialog v2.6.0`, `tauri-plugin-fs v2.4.5`.

### Step 1.3 — Folder Reading Helper (1 new file, 109 lines)

**New file:** `src/lib/folderImport.js`

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `SUPPORTED_EXTENSIONS` | `Set<string>` | 17 importable extensions (pdf, epub, docx, pptx, xlsx, xls, xlsm, csv, txt, md, srt, vtt, png, jpg, jpeg, gif, webp) |
| `MIME_MAP` | `Object` | Extension → MIME type mapping for `File` constructor |
| `pickFolder()` | `async () => string\|null` | Opens native OS folder dialog via `@tauri-apps/plugin-dialog`. Returns path or null if cancelled. |
| `scanFolder(path, opts)` | `async (string, { maxDepth? }) => result` | Reads folder + subfolders (depth 1), filters to supported extensions, returns `{ folderName, files, unsupported }` |
| `readSelectedFiles(files, onProgress)` | `async (array, fn) => File[]` | Reads file bytes via `@tauri-apps/plugin-fs`, constructs browser `File` objects with correct MIME types |

**Key design decisions:**
- **Depth 1 recursion** — root + immediate subdirectories. Hidden folders (`.git`, `.DS_Store` parent) skipped via `!name.startsWith('.')`.
- **Unsupported tracking** — returns `unsupported[]` alongside `files[]` so the UI can show "N files skipped (.doc, .mp4, etc.)".
- **Sort order** — root files first, then files grouped by subfolder name alphabetically, sorted by filename within each group.
- **Error isolation** — per-subfolder and per-file try/catch. A permission error on one subfolder doesn't block the rest.
- **Progress callback** — `onProgress(index, total, fileName)` for UI feedback during bulk reads.
- **No content reading in scan** — `scanFolder` returns metadata only. `readSelectedFiles` reads bytes only for user-selected files.

## Phase 1 Checkpoint

- [x] Tauri plugins installed and registered (dialog + fs)
- [x] Capabilities config updated (dialog:default, dialog:allow-open, fs:allow-read-dir, fs:allow-read-file)
- [x] `pickFolder()` opens native folder dialog
- [x] `scanFolder()` reads directory contents with supported-file filtering
- [x] `readSelectedFiles()` produces `File` objects parseable by existing `readFile()` pipeline
- [x] Vite build verified — clean (1.34s)
- [x] Tauri dev build verified — 523 crates compiled, app boots, no runtime errors
