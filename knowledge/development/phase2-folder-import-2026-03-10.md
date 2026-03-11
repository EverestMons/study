# Phase 2 Dev Log: Folder Import UI & Wiring

**Date:** 2026-03-10
**Blueprint:** `knowledge/architecture/folder-import-2026-03-10.md`
**UX Design:** `knowledge/design/folder-import-ux-2026-03-10.md`

---

## Changes

### Step 2.2 — FolderPickerModal Component (1 new file, 195 lines)

**New file:** `src/components/FolderPickerModal.jsx`

| Prop | Type | Description |
|------|------|-------------|
| `folderData` | `{ folderName, folderPath, files, unsupported }` | Output of `scanFolder()` |
| `onImport` | `(selectedFiles) => void` | Called with array of selected file metadata |
| `onClose` | `() => void` | Closes modal |

**Internal state:**
- `selected` — `Set<string>` of file paths (initialized with all files selected)
- `collapsed` — `Set<string>` of collapsed subfolder names

**Features:**
- Select all / individual file toggles
- Subfolder grouping with collapsible headers
- Color-coded extension badges (blue=docs, amber=slides, green=data, gray=media/images)
- Empty folder state with unsupported extension list
- `.doc` files callout (amber) with "save as .docx" hint
- Dynamic import count on footer button

### Step 2.3 — Upload Flow Wiring (4 files modified, ~65 lines added)

#### `src/StudyContext.jsx` (~35 lines added)

**New state:**
- `folderImportData` — `null` | `scanFolder()` output

**New handlers:**
- `importFromFolder()` — lazy imports `pickFolder` + `scanFolder` from `folderImport.js`, opens native dialog, scans folder, sets `folderImportData` state. Shows warning notification if folder is empty.
- `confirmFolderImport(selectedFiles)` — lazy imports `readSelectedFiles`, reads file bytes, runs through same `readFile()` → `filterDuplicates()` → `setFiles()` pipeline as `onDrop`/`onSelect`. Sets `parsing` state during operation.

Both handlers use `useCallback` with appropriate dependency arrays.

**Context exposure:** `importFromFolder`, `confirmFolderImport`, `folderImportData`, `setFolderImportData` added to provider value.

#### `src/screens/UploadScreen.jsx` (~15 lines added)

- Imports `FolderPickerModal`
- Destructures new context values
- Adds "— or —" divider + "Import from Folder" button below drop zone (visible only when no files staged)
- Renders `FolderPickerModal` when `folderImportData` is set

#### `src/screens/MaterialsScreen.jsx` (~15 lines added)

- Imports `FolderPickerModal`
- Destructures new context values
- Adds "Import from Folder" button below drop zone (compact 10px padding)
- Renders `FolderPickerModal` when `folderImportData` is set

#### `src/components/study/MaterialsPanel.jsx` (~15 lines added)

- Imports `FolderPickerModal`
- Destructures new context values
- Adds "Import from Folder" button below drop zone (compact 10px padding)
- Renders `FolderPickerModal` when `folderImportData` is set

### Code-splitting verification

Vite build output shows `folderImport-gGcct-CV.js` (3.25 kB) as a separate chunk — lazy `import()` in both handlers correctly code-splits. The `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` imports are isolated in this chunk.

## Key Design Decisions

1. **Lazy imports everywhere** — `importFromFolder` and `confirmFolderImport` both use `await import()` for `folderImport.js`. This ensures the dialog/fs plugins never load until the user actually clicks "Import from Folder", and the chunk is tree-shaken in non-Tauri environments.

2. **Same pipeline as drag-and-drop** — `confirmFolderImport` feeds files through the identical `readFile()` → `filterDuplicates()` → `autoClassify()` → `setFiles()` pipeline. No new classification or parsing logic.

3. **Single `folderImportData` state** — shared across UploadScreen, MaterialsScreen, and MaterialsPanel. Only one modal can be open at a time (they all read/write the same state).

4. **Button visibility** — On UploadScreen, the folder button only shows when no files are staged (consistent with the format guide). On MaterialsScreen/MaterialsPanel, the button is always visible below the drop zone.

## Phase 2 Checkpoint

- [x] FolderPickerModal component (select all, subfolder groups, badges, empty state)
- [x] `folderImportData` state in StudyContext
- [x] `importFromFolder()` handler (pickFolder → scanFolder → state)
- [x] `confirmFolderImport()` handler (readSelectedFiles → readFile → filterDuplicates → setFiles)
- [x] UploadScreen entry point ("— or —" divider + button + modal)
- [x] MaterialsScreen entry point (button + modal)
- [x] MaterialsPanel entry point (button + modal)
- [x] Context exposure (4 new values)
- [x] Code-splitting verified (folderImport chunk separate)
- [x] Vite build clean (1.34s, 93 modules)
