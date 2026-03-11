# Folder Import — Architecture Blueprint

**Date:** 2026-03-10
**Status:** Blueprint
**Phase:** 1 of Folder Import

---

## 1. Problem

Students store course materials in folders on disk — a semester's worth of PDFs, lecture slides, readings, and notes organized by week or topic. Currently the app only accepts files through browser-native mechanisms:

- **Drag-and-drop** — `onDrop` handler reads `e.dataTransfer.files` (browser `File` objects)
- **File input** — `onSelect` handler reads `e.target.files` from `<input type="file">`

Both are single-file-at-a-time interactions (the user can multi-select, but must manually navigate into each subfolder). There's no way to point at a course folder and import everything relevant in one action.

## 2. Solution

Add a "Import from folder" button that:
1. Opens a native OS folder picker (Tauri dialog plugin)
2. Reads the folder contents recursively (Tauri filesystem plugin)
3. Filters to supported file extensions
4. Shows a file selection UI with checkboxes (Phase 2)
5. Reads selected files and feeds them into the existing `readFile()` → `onDrop`-equivalent pipeline

**Zero changes to the parsing pipeline.** Files from disk are converted to browser `File` objects before entering `readFile()` in `parsers.js`.

---

## 3. New Tauri Plugin Dependencies

### 3a. Rust (src-tauri/Cargo.toml)

Add two new dependencies to `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

### 3b. JavaScript (package.json)

Add two new dependencies to `"dependencies"`:

```json
"@tauri-apps/plugin-dialog": "^2.2.0",
"@tauri-apps/plugin-fs": "^2.2.0"
```

### 3c. Plugin Registration (src-tauri/src/lib.rs)

Add to the `tauri::Builder::default()` chain, after existing plugins:

```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_fs::init())
```

### 3d. Capabilities Config (src-tauri/capabilities/default.json)

Add to the `"permissions"` array:

```json
"dialog:default",
"dialog:allow-open",
{
  "identifier": "fs:allow-read-dir",
  "allow": [{ "path": "**" }]
},
{
  "identifier": "fs:allow-read-file",
  "allow": [{ "path": "**" }]
}
```

**Security note:** `**` allows reading from any user-selected directory. This is acceptable because:
- The user explicitly selects the folder via the OS dialog — the app never silently scans
- Only `read` permissions are granted — no write/delete
- Same trust model as the existing `<input type="file">` element

---

## 4. New File: `src/lib/folderImport.js` (~80 lines)

**Dependencies:** `@tauri-apps/plugin-dialog` (open), `@tauri-apps/plugin-fs` (readDir, readFile)

**Exports:**
- `pickFolder()` — opens native folder dialog, returns file metadata list
- `readFolderFiles(filePaths)` — reads selected files, returns browser `File` objects

### 4a. `pickFolder()`

```js
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile as tauriReadFile } from '@tauri-apps/plugin-fs';

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'epub', 'docx', 'pptx', 'xlsx', 'xls', 'xlsm',
  'csv', 'txt', 'md', 'srt', 'vtt',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
]);

const MIME_MAP = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  srt: 'text/plain',
  vtt: 'text/vtt',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
```

**Flow:**
1. `await open({ directory: true, title: "Select course folder" })` → returns folder path string or `null` (cancelled)
2. If cancelled, return `null`
3. `await readDir(folderPath)` → returns `DirEntry[]` with `{ name, isDirectory, isFile }`
4. For each entry that `isDirectory`: recurse one level deep with `readDir(folderPath + '/' + entry.name)` — tag results with `subfolder: entry.name`
5. Filter all entries to `isFile` + supported extension (case-insensitive)
6. Return array of `{ name, path, ext, subfolder, size }` — metadata only, no file content

**Return type:**
```js
{
  folderName: string,        // basename of selected folder
  files: Array<{
    name: string,            // "lecture-3.pdf"
    path: string,            // full absolute path for tauriReadFile
    ext: string,             // "pdf"
    subfolder: string|null,  // "Week 1" or null for root files
  }>
}
```

**Recursion depth:** Cap at 1 level. Course folders typically have structure like `Week 1/`, `Assignments/`, `Readings/`. Deeper nesting is unusual and risks pulling in unrelated files. Files at depth 0 (root) and depth 1 (one subfolder) are included. Deeper files are silently skipped.

**Note on file size:** Tauri's `readDir` does not return file sizes in the `DirEntry`. Size information is not available without reading the file. The file selection UI (Phase 2) will show file names and extensions but not sizes. This is acceptable — size validation happens later in `readFile()` via `MAX_FILE_SIZE` (100 MB).

### 4b. `readFolderFiles(files)`

Takes the array of selected file metadata (from the picker UI) and converts to browser `File` objects.

```js
export const readFolderFiles = async (files, onProgress) => {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i, files.length, files[i].name);
    const data = await tauriReadFile(files[i].path);  // → Uint8Array
    const ext = files[i].ext;
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const file = new File([data], files[i].name, { type: mime });
    results.push(file);
  }
  return results;
};
```

**Key design:** The result is an array of standard browser `File` objects. These go directly into the same `readFile()` pipeline that `onDrop` and `onSelect` use. No parser changes needed.

**Progress callback:** `onProgress(index, total, fileName)` lets the UI show "Reading file 3 of 47: lecture-notes.pdf" during the read phase. File I/O is fast (~1ms per file for small files, ~50ms for large PDFs), but 50+ files can take a noticeable moment.

### 4c. Unsupported file handling

Files with unsupported extensions (`.doc`, `.mp4`, `.py`, `.html`, `.zip`, etc.) are filtered out in `pickFolder()` and never shown in the selection UI. The user sees only importable files.

Special case: `.doc` files (legacy Word binary) are included in the supported extensions set? **No.** `.doc` is currently handled by `readFile()` with a "save as .docx" message. Including `.doc` in the folder import would just create a batch of error messages. Better to exclude it and show a separate note: "N .doc files found — save as .docx to import."

---

## 5. Integration Points

### 5a. UploadScreen.jsx — "Import from folder" button

Add a secondary button below the drop zone:

```
[Drag & drop or click to browse]

  — or —

[Import from folder]
```

Clicking triggers `pickFolder()`. If a folder is selected, the file selection UI appears (Phase 2 — this blueprint covers the backend; the UI is Phase 2 scope).

### 5b. StudyContext.jsx — new handler: `onFolderImport`

New handler that takes an array of browser `File` objects (output of `readFolderFiles`) and processes them through the same pipeline as `onDrop`:

```js
const onFolderImport = useCallback(async (browserFiles) => {
  setParsing(true);
  const parsed = await Promise.all(browserFiles.map(readFile));
  const unique = filterDuplicates(parsed);
  if (unique.length) setFiles(p => [...p, ...unique.map(f => ({
    ...f,
    classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
    parseOk: !parseFailed(f.content),
    id: Date.now() + "-" + Math.random()
  }))]);
  setParsing(false);
}, [files, active]);
```

This is nearly identical to `onDrop` but takes browser `File[]` instead of a drop event. The `filterDuplicates` check prevents re-importing files that are already in the upload queue or in the active course's materials.

Exposed via `useStudy()` context value alongside `onDrop` and `onSelect`.

### 5c. MaterialsScreen.jsx / MaterialsPanel.jsx — "Import from folder" for existing courses

The existing "Add Materials" button (`addMats`) triggers a file input dialog. A folder import button can be added alongside it, using the same `pickFolder()` → selection UI → `readFolderFiles()` → `onFolderImport()` flow. Same integration pattern as UploadScreen.

---

## 6. Data Flow Diagram

```
User clicks "Import from folder"
    │
    ▼
pickFolder()                          ← @tauri-apps/plugin-dialog
    │  open({ directory: true })
    │  readDir(folder) + readDir(subfolders)
    │  Filter supported extensions
    │
    ▼
File Selection UI (Phase 2)           ← checkboxes, select all, subfolder grouping
    │  User selects files
    │
    ▼
readFolderFiles(selectedFiles)        ← @tauri-apps/plugin-fs
    │  tauriReadFile(path) → Uint8Array
    │  new File([data], name, { type })
    │
    ▼
onFolderImport(browserFiles)          ← StudyContext.jsx
    │  readFile() from parsers.js     ← EXISTING — no changes
    │  filterDuplicates()             ← EXISTING — no changes
    │  autoClassify()                 ← EXISTING — no changes
    │  setFiles(...)                  ← EXISTING — into upload queue
    │
    ▼
Normal upload flow continues          ← classification → createCourse/addMats
```

---

## 7. Edge Cases

| Case | Behavior |
|------|----------|
| Empty folder | `pickFolder()` returns `{ files: [] }`. UI shows "No supported files found." |
| Folder with only unsupported files | Same as empty — filtered list is empty. Show count: "12 files found, 0 supported." |
| Folder with `.doc` files | Excluded from supported list. Show note: "N .doc files skipped — save as .docx to import." |
| Very large folder (500+ files) | `readDir` is fast (~5ms). Only metadata returned. File reading happens after selection, limited to what the user picks. |
| Deeply nested folders | Only root + 1 level deep. `Week 1/Readings/Chapter 3/notes.pdf` at depth 3 is not included. |
| Symlinks | `readDir` follows symlinks. If a symlink points outside the folder, `readFile` may fail — caught by try/catch per file. |
| Permission denied | `readDir` or `readFile` throws — caught by try/catch, user notified. |
| User cancels dialog | `open()` returns `null`. No action taken. |
| Duplicate file names across subfolders | Both shown in selection UI. `filterDuplicates` in StudyContext catches duplicates against existing materials by name. |
| Same folder imported twice | `filterDuplicates` catches all names already in the upload queue or active course. User sees "Skipped duplicate: X" notifications. |

---

## 8. Performance

| Operation | Cost | Notes |
|-----------|------|-------|
| `open()` dialog | ~0ms (OS native) | Blocks until user selects or cancels |
| `readDir(folder)` | ~5ms for 100 entries | Metadata only |
| `readDir(subfolder)` x N | ~5ms x N | N = number of subdirectories |
| Extension filtering | ~0.1ms | Set lookup per entry |
| `tauriReadFile(path)` per file | ~1-50ms | Depends on file size |
| `new File([data])` construction | ~0.1ms | Just wraps the Uint8Array |
| `readFile()` parsing per file | 1-2000ms | PDF parsing is the bottleneck |

**Worst case:** 50 files selected, 10 PDFs = ~10s parsing time. This matches the current drag-and-drop experience (same parsing pipeline). The progress callback keeps the UI responsive.

---

## 9. Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog` and `tauri-plugin-fs` | +2 |
| `package.json` | Add `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` | +2 |
| `src-tauri/src/lib.rs` | Register dialog and fs plugins | +2 |
| `src-tauri/capabilities/default.json` | Add dialog + fs permissions | +10 |
| `src/lib/folderImport.js` | **NEW** — `pickFolder()`, `readFolderFiles()` | ~80 |
| `src/StudyContext.jsx` | Add `onFolderImport` handler, expose in context | ~15 |

Phase 2 (UI) files not included here — UploadScreen, MaterialsScreen, MaterialsPanel changes are Phase 2 scope.

---

## 10. Migration Impact

- **Two new Tauri plugins** added at both Rust and JS layers
- **Capabilities expanded** — dialog + filesystem read permissions
- **No database changes** — no migrations needed
- **No parser changes** — `readFile()` in parsers.js unchanged
- **Rust recompilation required** — new plugin crates trigger cargo build (~30-60s first time)
- **npm install required** — new JS packages

---

## 11. Verification

1. `npm install` — new packages resolve
2. `npm run build` — clean, no missing imports
3. `npm run tauri:dev` — Rust compiles with new plugins, app boots
4. Grep for `pickFolder` — appears in folderImport.js (definition) + UploadScreen (call site, Phase 2)
5. Grep for `readFolderFiles` — appears in folderImport.js (definition) + caller (Phase 2)
6. Grep for `onFolderImport` — appears in StudyContext (definition) + UploadScreen (call site, Phase 2)
7. Grep for `tauri_plugin_dialog` — appears in Cargo.toml + lib.rs
8. Grep for `tauri_plugin_fs` — appears in Cargo.toml + lib.rs
9. Static trace: button click → `pickFolder()` → dialog → `readDir` → filter → UI → `readFolderFiles()` → `File` objects → `onFolderImport()` → `readFile()` → upload queue
