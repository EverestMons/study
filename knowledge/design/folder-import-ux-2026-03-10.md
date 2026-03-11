# Folder Import — UX Design

**Date:** 2026-03-10
**Status:** Design
**Phase:** 2 of Folder Import
**Blueprint:** `knowledge/architecture/folder-import-2026-03-10.md`

---

## 1. Entry Points

### 1a. UploadScreen — new course creation

Below the existing drag-and-drop zone, add a divider line and folder import button:

```
+--------------------------------------------------+
|                                                    |
|         Drag & drop or click to browse             |
|         Best: .txt .md | Good: .docx .epub         |
|                                                    |
+--------------------------------------------------+

                     — or —

       [ Import from Folder ]
```

**Button style:**
- Same width as the drop zone (`width: "100%"`)
- Secondary appearance: `background: transparent`, `border: 1px solid T.bd`, `color: T.txD`
- Hover: `borderColor: T.ac`, `color: T.ac`, `background: T.acS`
- Font: 14px, fontWeight 500
- Padding: `14px 24px`, borderRadius: 10
- The "— or —" divider: `fontSize: 12, color: T.txM, textAlign: center, margin: "16px 0"`

**Why below, not beside:** The drop zone is full-width and prominent — it's the primary import method. The folder button is a secondary entry point for power users who have organized course folders. Placing it below with a divider keeps the visual hierarchy clear.

### 1b. MaterialsScreen / MaterialsPanel — existing course

Below the existing drag-and-drop zone (line 56-60 in MaterialsScreen), add the same "Import from Folder" button:

```
+------------------------------------------+
|    + Drop or click to add materials       |
+------------------------------------------+

     [ Import from Folder ]
```

Smaller padding (`10px 16px`) to match the compact layout of these panels. Same hover behavior.

---

## 2. Folder Picker Modal

After the user clicks "Import from Folder" and selects a folder via the native OS dialog, a modal overlay appears showing the folder contents.

### 2a. Overall structure

```
+================================================================+
|                                                                  |
|  (dimmed backdrop, rgba(0,0,0,0.6))                              |
|                                                                  |
|    +------------------------------------------------------+      |
|    |  HEADER                                               |      |
|    |------------------------------------------------------|      |
|    |  TOOLBAR                                              |      |
|    |------------------------------------------------------|      |
|    |                                                        |      |
|    |  FILE LIST (scrollable)                                |      |
|    |                                                        |      |
|    |------------------------------------------------------|      |
|    |  FOOTER                                               |      |
|    +------------------------------------------------------+      |
|                                                                  |
+================================================================+
```

**Modal container:**
- `position: fixed`, `inset: 0`, `zIndex: 9999`
- Backdrop: `background: rgba(0,0,0,0.6)`, click-to-dismiss (same as SettingsModal)
- Content: `maxWidth: 640, maxHeight: "80vh"`, centered vertically and horizontally
- `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 16`
- `display: flex, flexDirection: column` — header/toolbar fixed, file list scrolls, footer fixed

### 2b. Header

```
+------------------------------------------------------+
|  Import from Folder                              [x]  |
|  ~/Documents/MATH 201/                                |
|  12 supported files . 3 unsupported skipped           |
+------------------------------------------------------+
```

- **Title:** "Import from Folder" — `fontSize: 18, fontWeight: 700, color: T.tx`
- **Close button:** top-right `x`, `color: T.txM`, hover `T.tx`
- **Path:** folder path truncated to last 3 segments — `fontSize: 12, color: T.txD`
- **Summary line:** `fontSize: 12, color: T.txD`
  - "N supported files" in normal text
  - If unsupported files exist: " . N unsupported skipped" appended
  - If `.doc` files exist: " . N .doc files — save as .docx to import" in `color: T.am`
- **Padding:** `20px 24px`, `borderBottom: 1px solid T.bd`

### 2c. Toolbar

```
[x] Select all (12)            [textbook v] Auto-classify
```

- **Select all checkbox:** toggle all supported files. Label shows count.
  - Checked: all files selected. Unchecked: none selected. Indeterminate: some selected.
  - Checkbox: 16x16, `border: 2px solid T.bd`, `borderRadius: 4`
  - Checked fill: `T.ac`, checkmark: white
- **Auto-classify dropdown** (right side): applies `autoClassify()` from classify.js to all selected files. Default: "Auto" (auto-detected). User can override per-file.
  - This is informational — classification happens after import when files enter the upload queue. No dropdown needed here. Instead, show a note: "Files will be auto-classified after import."
- **Padding:** `12px 24px`, `borderBottom: 1px solid T.bd`, `background: T.bg`

**Simplified toolbar:** Just the select-all checkbox and count. Classification happens in the existing flow after import — no need to duplicate it here.

```
[x] Select all (12)
```

### 2d. File list

Scrollable area, `flex: 1, overflowY: auto, padding: "0"`.

#### Root files (no subfolder)

```
[x]  [PDF]  lecture-3-derivatives.pdf
[x]  [TXT]  syllabus.txt
[x]  [DOCX] homework-2.docx
```

#### Subfolder groups

```
▼ Week 1                                      3 files
  [x]  [PDF]  chapter-1-intro.pdf
  [x]  [EPUB] textbook-excerpt.epub
  [x]  [PPTX] slides-intro.pptx

▼ Week 2                                      2 files
  [x]  [PDF]  chapter-2-limits.pdf
  [x]  [DOCX] problem-set-1.docx

▶ Assignments                                 4 files
  (collapsed — click to expand)
```

**File row layout:**
- `padding: "10px 24px"`, `borderBottom: "1px solid " + T.bd` (very subtle)
- Hover: `background: T.sfH`
- **Checkbox:** left-aligned, 16x16, same style as select-all
- **Extension badge:** `fontSize: 10, fontWeight: 600, textTransform: uppercase, padding: "2px 6px", borderRadius: 4, marginLeft: 12, marginRight: 10`
  - Width fixed at 42px to align filenames
  - Color by file category:
    - Documents (pdf, epub, docx, txt, md): `background: "rgba(108,156,252,0.15)", color: T.ac` (blue)
    - Slides (pptx): `background: "rgba(251,191,36,0.15)", color: T.am` (amber)
    - Data (xlsx, xls, xlsm, csv): `background: "rgba(52,211,153,0.15)", color: T.gn` (green)
    - Media (srt, vtt): `background: "rgba(139,149,165,0.15)", color: T.txD` (gray)
    - Images (png, jpg, jpeg, gif, webp): `background: "rgba(139,149,165,0.15)", color: T.txD` (gray)
- **Filename:** `fontSize: 13, color: T.tx`, truncated with ellipsis if too long

**Subfolder header row:**
- `padding: "10px 24px"`, `background: T.bg`, `borderBottom: "1px solid " + T.bd`
- **Chevron:** `▼` (expanded) / `▶` (collapsed) — `fontSize: 10, color: T.txD, marginRight: 8`
- **Folder name:** `fontSize: 13, fontWeight: 600, color: T.txD`
- **File count:** right-aligned, `fontSize: 11, color: T.txM`
- Click toggles expand/collapse of the subfolder's files
- **Default state:** all subfolders expanded (user sees everything immediately)

#### Unsupported files

Not shown in the file list. The header summary shows "N unsupported skipped." If the user needs details, they already know what's in their folder. Showing grayed-out rows would add visual noise without enabling any action.

**Exception:** `.doc` files get a special callout in the header (amber text) because there's a clear remediation path: "save as .docx."

### 2e. Footer

```
+------------------------------------------------------+
|          [Cancel]              [Import 8 Files]       |
+------------------------------------------------------+
```

- **Padding:** `16px 24px`, `borderTop: 1px solid T.bd`
- **Cancel button:** `background: transparent, border: 1px solid T.bd, color: T.txD, borderRadius: 8, padding: "10px 20px", fontSize: 13`
- **Import button:** `background: T.ac, border: none, color: "#0F1115", fontWeight: 600, borderRadius: 8, padding: "10px 24px", fontSize: 13`
  - Label updates dynamically: "Import N Files" where N = selected count
  - Disabled state (0 selected): `background: T.sf, color: T.txM, cursor: default`
- **Layout:** `display: flex, justifyContent: space-between, alignItems: center`

---

## 3. After Import Flow

When the user clicks "Import N Files":

1. Modal closes immediately
2. `readSelectedFiles()` reads file bytes from disk (with progress)
3. Files enter the same pipeline as drag-and-drop: `readFile()` → auto-classify → show in upload queue
4. The existing classification cards appear (one at a time for unclassified files)
5. User confirms classifications, names the course (UploadScreen) or clicks "Add Materials" (MaterialsScreen)

**Progress during file reading:** The existing `parsing` state + "Parsing files..." text in the drop zone handles this. No new progress UI needed — the same indicator that shows during drag-and-drop parsing shows during folder import parsing.

**Batch size:** If the user selects 50+ files, `readSelectedFiles` reads them sequentially. Each file is ~1-50ms for I/O, then `readFile()` parsing runs. The `parsing` state keeps the UI showing "Parsing files..." until all are done. No pagination or batching needed — the existing pipeline handles it.

---

## 4. Edge Cases

### 4a. Empty folder

Modal shows:
```
+------------------------------------------------------+
|  Import from Folder                              [x]  |
|  ~/Documents/empty-folder/                            |
|  No supported files found                             |
|------------------------------------------------------|
|                                                        |
|     No files with supported types in this folder.      |
|     Supported: PDF, DOCX, EPUB, PPTX, TXT, and more.  |
|                                                        |
|------------------------------------------------------|
|                                           [Close]     |
+------------------------------------------------------+
```

- Empty state text: `fontSize: 14, color: T.txD, textAlign: center, padding: "40px 24px"`
- "Supported: ..." line: `fontSize: 12, color: T.txM`
- Footer shows only "Close" button (no import)

### 4b. Only unsupported files

Same as empty, but with detail:
```
No supported files found.
12 files skipped (.mp4, .py, .html, .zip)
```

List the unique unsupported extensions found.

### 4c. Very large folder (100+ files)

No pagination. The modal file list scrolls natively. At 100 files × ~40px per row = 4000px scroll area — manageable in a `maxHeight: "80vh"` modal. The select-all checkbox makes bulk selection easy.

If performance becomes an issue (500+ files), future optimization: virtual scroll via `overflow-anchor`. Not needed for v1.

### 4d. Permission denied

If `scanFolder` throws on `readDir`:
- Show error in modal: "Could not read folder: permission denied. Try selecting a different folder."
- `color: T.rd`
- Footer shows only "Close"

If individual subfolder `readDir` fails:
- Skip silently (already handled in `scanFolder` with per-subfolder try/catch)
- No user-visible error for individual subfolder failures

### 4e. User cancels OS dialog

`pickFolder()` returns `null`. No modal shown. No state change. Silent no-op.

### 4f. Duplicate files

Files already in the upload queue or in the active course's materials are caught by `filterDuplicates()` in StudyContext after import. The folder picker modal doesn't check for duplicates — it shows all supported files. Duplicates are reported as "Skipped duplicate: X" notifications after import, consistent with drag-and-drop behavior.

---

## 5. Component Structure

**New component:** `src/components/FolderPickerModal.jsx`

| Prop | Type | Description |
|------|------|-------------|
| `folderData` | `{ folderName, files, unsupported }` | Output of `scanFolder()` |
| `onImport` | `(selectedFiles) => void` | Called with array of selected file metadata |
| `onClose` | `() => void` | Closes modal |

**Internal state:**
- `selected` — `Set<string>` of file paths (toggled by checkboxes)
- `collapsed` — `Set<string>` of subfolder names (toggled by clicking headers)

**Initialization:** All supported files selected by default. All subfolders expanded.

**Size estimate:** ~120 lines (modal shell + header + toolbar + file list + footer + empty states).

---

## 6. CEO Escalations

### E1: Modal vs inline design

**Recommendation:** Modal overlay.

**Reasoning:** The folder picker result is a transient selection step. It doesn't replace the upload screen — it feeds into it. An inline design would require restructuring the UploadScreen layout and managing back navigation. A modal is simpler to implement, matches the existing SettingsModal pattern, and cleanly separates the "select files from folder" step from the "classify and upload" step.

**Default if no response:** Modal.

### E2: File type badge colors

**Recommendation:** Category-based, using existing theme colors.

| Category | Extensions | Color | Rationale |
|----------|-----------|-------|-----------|
| Documents | pdf, epub, docx, txt, md | `T.ac` (blue) | Primary content — most important |
| Slides | pptx | `T.am` (amber) | Distinct from documents, moderate importance |
| Data | xlsx, xls, xlsm, csv | `T.gn` (green) | Data-oriented, separate category |
| Media | srt, vtt | `T.txD` (gray) | Secondary content |
| Images | png, jpg, jpeg, gif, webp | `T.txD` (gray) | Secondary content |

Three colors from the existing palette (blue, amber, green) plus gray for secondary types. No new colors introduced.

**Default if no response:** Category-based as described.

---

## 7. Visual Reference

### Complete modal (happy path, ~15 files, 2 subfolders):

```
+------------------------------------------------------+
|  Import from Folder                              [x]  |
|  ~/Documents/MATH 201/                                |
|  12 supported files . 3 unsupported skipped           |
|------------------------------------------------------|
|  [x] Select all (12)                                  |
|------------------------------------------------------|
|  [x]  [PDF]   syllabus.pdf                            |
|  [x]  [TXT]   course-outline.txt                      |
|------------------------------------------------------|
|  ▼ Lectures                                  4 files  |
|    [x]  [PDF]   lecture-01-intro.pdf                   |
|    [x]  [PDF]   lecture-02-limits.pdf                  |
|    [x]  [PPTX]  slides-01.pptx                        |
|    [x]  [VTT]   lecture-01-transcript.vtt              |
|------------------------------------------------------|
|  ▼ Readings                                  3 files  |
|    [x]  [PDF]   chapter-1.pdf                          |
|    [x]  [EPUB]  textbook.epub                          |
|    [x]  [DOCX]  supplemental-reading.docx              |
|------------------------------------------------------|
|  ▼ Assignments                               3 files  |
|    [x]  [PDF]   homework-1.pdf                         |
|    [x]  [DOCX]  problem-set-2.docx                     |
|    [x]  [XLSX]  data-set.xlsx                           |
|------------------------------------------------------|
|  [Cancel]                          [Import 12 Files]  |
+------------------------------------------------------+
```
