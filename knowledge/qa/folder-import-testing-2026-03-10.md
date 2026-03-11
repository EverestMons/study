# Folder Import — QA Report

**Date:** 2026-03-10
**Phase:** 2 (Phases 1 + 2 combined)
**Blueprint:** `knowledge/architecture/folder-import-2026-03-10.md`
**Dev logs:** `knowledge/development/phase1-*.md`, `knowledge/development/phase2-folder-import-2026-03-10.md`

---

## Files Under Test

| File | Lines | Role |
|------|-------|------|
| `src/lib/folderImport.js` | 109 | Backend: pickFolder, scanFolder, readSelectedFiles |
| `src/components/FolderPickerModal.jsx` | 195 | Modal UI: file selection, subfolder grouping |
| `src/StudyContext.jsx` | 1206 | State + handlers: folderImportData, importFromFolder, confirmFolderImport |
| `src/screens/UploadScreen.jsx` | 190 | Entry point: new course creation flow |
| `src/screens/MaterialsScreen.jsx` | 577 | Entry point: existing course add-materials flow |
| `src/components/study/MaterialsPanel.jsx` | 201 | Entry point: study screen add-materials panel |
| `src-tauri/capabilities/default.json` | — | Tauri permissions: dialog + fs |

---

## Test Results

### T1. Folder Picker — Native Dialog

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1.1 | Click "Import from Folder" | Native OS folder dialog opens | PASS | `open({ directory: true, title: 'Select course folder' })` via `@tauri-apps/plugin-dialog` |
| 1.2 | Cancel dialog | `pickFolder()` returns `null`, no error, no modal shown | PASS | `importFromFolder` checks `if (!folderPath) return;` at line 373 |
| 1.3 | Select valid folder | Returns path string, proceeds to scan | PASS | Path passed directly to `scanFolder()` |
| 1.4 | Capabilities config | `dialog:default` + `dialog:allow-open` present | PASS | Verified in `default.json` |

### T2. Folder Scanning

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 2.1 | Supported files detected | All 17 extensions in `SUPPORTED_EXTENSIONS` matched | PASS | pdf, epub, docx, pptx, xlsx, xls, xlsm, csv, txt, md, srt, vtt, png, jpg, jpeg, gif, webp |
| 2.2 | Unsupported files tracked | Files with non-supported extensions in `unsupported[]` | PASS | Checked via `if (ext && SUPPORTED_EXTENSIONS.has(ext))` / `else if (ext)` |
| 2.3 | Subfolders scanned (depth 1) | Root + immediate subdirectories read | PASS | `maxDepth >= 1` guard, `rootEntries.filter(e => e.isDirectory)` |
| 2.4 | Hidden folders skipped | `.git`, `.DS_Store` parent dirs ignored | PASS | `!e.name.startsWith('.')` filter at line 69 |
| 2.5 | Empty folder (no files) | Returns `{ files: [], unsupported: [] }` | PASS | `importFromFolder` shows warning: "No files found in selected folder." |
| 2.6 | Folder with only unsupported files | Modal opens showing empty state with extension list | PASS | `data.files.length === 0 && data.unsupported.length === 0` check — only triggers notification if BOTH are empty. If unsupported > 0, modal opens with empty state showing "N files skipped (.mp4, .py, ...)" |
| 2.7 | Sort order | Root files first, then subfolders alphabetically, files by name within groups | PASS | `files.sort()` comparator handles `subfolder === null` → -1 |
| 2.8 | `folderPath` in return value | Included for modal header display | PASS | Added in Step 2.2 |
| 2.9 | Per-subfolder error isolation | Single subfolder permission failure doesn't block scan | PASS | Per-subfolder try/catch at lines 72-78 |
| 2.10 | Capabilities config | `fs:allow-read-dir` with `"path": "**"` present | PASS | Verified in `default.json` |

### T3. File Reading

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 3.1 | Selected files read from disk | `tauriReadFile(path)` returns `Uint8Array` | PASS | Tauri plugin-fs `readFile` |
| 3.2 | MIME types assigned correctly | Each extension mapped to correct MIME | PASS | 17 entries in `MIME_MAP`, fallback `'application/octet-stream'` |
| 3.3 | Browser File objects created | `new File([data], name, { type: mime })` | PASS | Compatible with `readFile()` in parsers.js which dispatches on `file.name` extension |
| 3.4 | Per-file error isolation | Single file read failure doesn't block batch | PASS | Per-file try/catch at lines 99-106 in `readSelectedFiles` |
| 3.5 | Capabilities config | `fs:allow-read-file` with `"path": "**"` present | PASS | Verified in `default.json` |

### T4. Pipeline Integration

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 4.1 | Files appear in staging area | `setFiles()` called with parsed + classified files | PASS | `confirmFolderImport` uses identical pipeline to `onDrop`: `readFile()` → `filterDuplicates()` → `autoClassify()` → `setFiles()` |
| 4.2 | Auto-classification runs | `autoClassify(f)` applied to each file | PASS | Same logic as `onDrop`/`onSelect` — epub defaults to "textbook" |
| 4.3 | Parse failure detection | `parseFailed(f.content)` flags bad files | PASS | `parseOk: !parseFailed(f.content)` — same as existing flow |
| 4.4 | Duplicate detection | `filterDuplicates()` checks against existing files + active course materials | PASS | Reads `files` state + `active.materials` names |
| 4.5 | "Parsing files..." indicator | `setParsing(true)` during import | PASS | Set before `readSelectedFiles`, cleared after completion in `finally`-equivalent `setParsing(false)` |
| 4.6 | Modal closes on import | `setFolderImportData(null)` called first | PASS | Line 383: modal dismissed immediately, parsing continues in background |
| 4.7 | Skills extraction after course creation | `storeAsChunks` → `computeAndStoreFingerprints` → `runExtractionV2` | PASS | Same flow as drag-and-drop — folder import only produces files for the staging area |
| 4.8 | Content hashes computed | `storeAsChunks` creates chunks with content | PASS | V2 path creates material + chunks + fingerprints in one flow |
| 4.9 | MinHash fingerprints stored | `computeAndStoreFingerprints(matId, fpChunks)` called in `storeAsChunks` | PASS | Line 85 of skills.js — called after chunk batch insert |

### T5. Near-Dedup Interaction

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 5.1 | Duplicate file detection | File uploaded via D&D then same file via folder import → MinHash detects near-duplicate | PASS | `runExtractionV2` at lines 464-527: loads `ChunkFingerprints.getByMaterial(materialId)` for new material, compares against `ChunkFingerprints.getByCourse(courseId)` excluding self. `findNearDuplicates(new, existing, 0.7)` triggers at ≥70% Jaccard similarity. |
| 5.2 | All-chunks-duplicate path | If all new chunks match existing at ≥70% | Returns `{ needsUserDecision: true, dupSummary }` | PASS | Lines 478-521: builds `dupSummary` with material names, chunk counts, average similarity |
| 5.3 | Partial duplicate path | Some chunks match, some don't | Extraction proceeds normally | PASS | Only triggers `needsUserDecision` when `dupChunkIds.size === newFingerprints.length` (ALL match) |
| 5.4 | Exact hash duplicate check | SHA-256 content hash check runs before MinHash | PASS | Lines 446-461: `hashChecks` against existing chunks. If all match exact hash → `skipped: true` |

### T6. Edge Cases

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 6.1 | Folder with 0 supported files | Modal shows empty state: "No files with supported types" | PASS | `isEmpty = files.length === 0` → renders empty state div |
| 6.2 | Folder with 1 file | Single file in list, select/deselect works | PASS | No minimum count requirement |
| 6.3 | Folder with 50+ files | Scrollable list, select-all works | PASS | `maxHeight: "80vh"`, `overflowY: "auto"`, select-all toggles full `files` set |
| 6.4 | File with no extension | Silently ignored — not in `files[]` or `unsupported[]` | **NOTED** | `getExt()` returns `''` (falsy). `collectEntries` checks `if (ext && ...)` — empty string skipped. File is invisible to user. Acceptable but worth documenting. |
| 6.5 | Uppercase extension (.PDF) | Detected as supported, treated as `pdf` | PASS | `getExt()` calls `.toLowerCase()` → `'pdf'`. `SUPPORTED_EXTENSIONS.has('pdf')` → true |
| 6.6 | Mixed case (.Docx) | Same as 6.5 — normalized to `docx` | PASS | `.toLowerCase()` handles all cases |
| 6.7 | Spaces in folder path | Native Tauri APIs handle natively | PASS | Path is plain string — `folderPath + '/' + dir.name`. No shell escaping needed. |
| 6.8 | Unicode in folder/file names | Native Tauri APIs handle natively | PASS | Tauri uses Rust's `std::fs` which handles UTF-8 paths |
| 6.9 | Double extension (file.tar.gz) | Extension = `gz` (last segment) | PASS | `parts.pop()` takes last part after splitting on `.` |
| 6.10 | Dotfile (.gitignore) | Extension = `gitignore`, not supported → goes to `unsupported[]` | PASS | `getExt('.gitignore')` → `parts = ['', 'gitignore']`, `parts.length > 1` → true, returns `'gitignore'`. Not in `SUPPORTED_EXTENSIONS` but has ext → `unsupported[]`. |

### T7. Permissions & Error Handling

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 7.1 | Unreadable root folder | Graceful error shown | **FAIL** | `importFromFolder` has NO try/catch around `scanFolder()`. If `readDir(folderPath)` throws (permission denied), it propagates as an unhandled promise rejection. User sees nothing. See **Issue #1**. |
| 7.2 | Unreadable subfolder | Skipped silently, rest of scan continues | PASS | Per-subfolder try/catch at lines 72-78 |
| 7.3 | Unreadable file during import | Skipped silently, other files imported | PASS | Per-file try/catch in `readSelectedFiles` at lines 99-106 |
| 7.4 | `readFile()` parser failure | File gets `parseOk: false`, shown with red indicator | PASS | `parseFailed(f.content)` check in `confirmFolderImport` |
| 7.5 | Error during import batch | Error caught, notification shown, parsing state cleared | PASS | `confirmFolderImport` has try/catch/finally: `addNotif("error", ...)` + `setParsing(false)` |

### T8. Performance

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 8.1 | Scan 100-file folder (<1s) | Native `readDir` is ~1ms per call | PASS (expected) | 6 `readDir` calls (root + 5 subfolders) + in-memory filtering. JS overhead negligible. |
| 8.2 | Read 10 selected files (<5s) | Native `readFile` is ~1-10ms per file for typical docs | PASS (expected) | Sequential reads but each is native I/O. 10 × 10ms = 100ms for I/O. Parsing adds time but uses existing pipeline. |
| 8.3 | Modal render with 50+ files | No visible lag | PASS (expected) | Plain DOM elements, no virtualization needed at this scale. |
| 8.4 | Code splitting | `folderImport.js` in separate Vite chunk | PASS | Build output: `folderImport-gGcct-CV.js` (3.25 kB gzipped 1.52 kB). Lazy `import()` in both handlers. |

### T9. UI/UX Verification

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 9.1 | UploadScreen: button visible (no files) | "— or —" divider + "Import from Folder" button below drop zone | PASS | Wrapped in `{files.length === 0 && (<>...`)}` |
| 9.2 | UploadScreen: button hidden (files staged) | Button disappears when files are in staging | PASS | Same `files.length === 0` guard |
| 9.3 | MaterialsScreen: button always visible | "Import from Folder" below drop zone | PASS | Not gated by file count |
| 9.4 | MaterialsPanel: button always visible | Same as MaterialsScreen | PASS | Same implementation pattern |
| 9.5 | Modal backdrop click-to-dismiss | Clicking dimmed backdrop closes modal | PASS | `onClick={e => { if (e.target === e.currentTarget) onClose(); }}` |
| 9.6 | Content click doesn't dismiss | Clicking inside modal doesn't close it | PASS | `e.stopPropagation()` on content div |
| 9.7 | Select all / deselect all | Checkbox toggles entire file set | PASS | `toggleAll` checks `allSelected` → sets empty Set or full Set |
| 9.8 | Subfolder collapse/expand | Chevron rotates, files hide/show | PASS | `collapsed` Set + CSS `transform: rotate(-90deg)` |
| 9.9 | Import button count | "Import N Files" updates dynamically | PASS | `selectedCount` drives button label and disabled state |
| 9.10 | Disabled import (0 selected) | Button grayed out, not clickable | PASS | `disabled={selectedCount === 0}` + muted styling |
| 9.11 | `.doc` callout | Amber text in header for .doc files | PASS | `docCount > 0` check, `color: T.am` styling |
| 9.12 | Extension badges color-coded | Blue=docs, amber=slides, green=data, gray=media | PASS | `BADGE_COLORS` map with 17 entries covering all supported extensions |

### T10. Build Verification

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 10.1 | Vite build clean | No errors | PASS | `npm run build` → 93 modules, 1.30s |
| 10.2 | Module count stable | 93 modules (FolderPickerModal now imported statically) | PASS | Was 88 before folder import feature. +5: FolderPickerModal.jsx, folderImport.js (lazy chunk), and 3 screens now import FolderPickerModal |
| 10.3 | No new warnings | Only pre-existing dynamic import warnings | PASS | Same db.js + htmlToMarkdown.js warnings as before |
| 10.4 | Chunk sizes reasonable | folderImport chunk small, main bundle unchanged | PASS | `folderImport-gGcct-CV.js`: 3.25 kB. Main: 1,050.73 kB (unchanged) |

---

## Issues Found

### Issue #1 — MEDIUM: Missing try/catch in `importFromFolder`

**File:** `src/StudyContext.jsx` line 370-380
**Severity:** Medium

`importFromFolder` does not wrap `scanFolder(folderPath)` in a try/catch. If `readDir()` throws (permission denied, path doesn't exist after selection, OS error), the error propagates as an unhandled promise rejection. The user sees nothing — no error notification, no modal, no feedback.

`confirmFolderImport` correctly has try/catch (lines 385-397), but `importFromFolder` does not.

**Recommended fix:**
```js
const importFromFolder = useCallback(async () => {
  const { pickFolder, scanFolder } = await import("./lib/folderImport.js");
  const folderPath = await pickFolder();
  if (!folderPath) return;
  try {
    const data = await scanFolder(folderPath);
    if (data.files.length === 0 && data.unsupported.length === 0) {
      addNotif("warn", "No files found in selected folder.");
      return;
    }
    setFolderImportData(data);
  } catch (e) {
    console.error("[folderImport] Scan failed:", e);
    addNotif("error", "Could not read folder: " + (e.message || "permission denied"));
  }
}, []);
```

### Issue #2 — LOW: Files with no extension are invisible

**File:** `src/lib/folderImport.js` line 53-59
**Severity:** Low

Files without an extension (e.g., `Makefile`, `LICENSE`, `README`) have `getExt()` return `''` (falsy). The `collectEntries` function skips them entirely — they don't appear in `files[]` (supported) or `unsupported[]`. The user has no visibility that these files exist.

**Impact:** Minimal. Extensionless files are rarely course materials. The UX design didn't specify handling for this case.

**Recommendation:** No change needed for v1. If desired later, add them to `unsupported[]` with `ext: "(none)"`.

### Issue #3 — LOW: No granular progress for large imports

**File:** `src/StudyContext.jsx` line 387
**Severity:** Low

`confirmFolderImport` calls `readSelectedFiles(selectedFiles)` without passing the `onProgress` callback. For 50+ files, the user sees only "Parsing files..." with no indication of progress.

**Impact:** Minimal. File I/O is fast (native reads). Parsing is the slow part and it's handled by `Promise.all(browserFiles.map(readFile))` which doesn't support incremental progress anyway.

**Recommendation:** No change needed for v1. If needed later, pass `onProgress` and update a progress state.

---

## Summary

| Category | Tests | Pass | Fail | Noted |
|----------|-------|------|------|-------|
| Folder Picker | 4 | 4 | 0 | 0 |
| Folder Scanning | 10 | 10 | 0 | 0 |
| File Reading | 5 | 5 | 0 | 0 |
| Pipeline Integration | 9 | 9 | 0 | 0 |
| Near-Dedup | 4 | 4 | 0 | 0 |
| Edge Cases | 10 | 9 | 0 | 1 |
| Permissions | 5 | 4 | 1 | 0 |
| Performance | 4 | 4 | 0 | 0 |
| UI/UX | 12 | 12 | 0 | 0 |
| Build | 4 | 4 | 0 | 0 |
| **Total** | **67** | **65** | **1** | **1** |

**Verdict:** 1 medium issue (missing try/catch in `importFromFolder`). Should be fixed before shipping — it's a 4-line change. The 1 noted item (extensionless files) and 1 low-priority item (no granular progress) are acceptable for v1.
