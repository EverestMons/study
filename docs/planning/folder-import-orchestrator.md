# Folder Import — Orchestrator Plan

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Standard feature development. Requires two new Tauri plugins.

---

## CEO Decisions (Resolved)

1. **Approach:** One-shot folder import with file selection UI — not a background watcher.
2. **Flow:** User clicks "Import from Folder" → native OS folder picker → app reads folder → file selection UI with checkboxes → selected files feed into existing upload pipeline.

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **UXD** | Study UX Designer | Design & Experience |
| **UXV** | Study UX Validator | Design & Experience — Validation |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

3 phases, executed sequentially:
- **Phase 1:** Tauri plugin setup + folder reading backend
- **Phase 2:** File picker UI + integration with upload pipeline
- **Phase 3:** Polish — filtering, sorting, and smart classification

---

## Context for All Agents

### Current Upload Flow

Files enter the app through two browser-based mechanisms:
1. **Drag-and-drop** — `onDrop` in StudyContext reads `e.dataTransfer.files`
2. **File input** — `onSelect` reads `e.target.files` from `<input type="file">`

Both pass browser `File` objects to `readFile()` in parsers.js, which dispatches by extension (PDF, EPUB, DOCX, PPTX, XLSX, CSV, SRT/VTT, images, plain text).

### Current Tauri Plugins

`plugin-http` (Anthropic API), `plugin-sql` (SQLite). No filesystem or dialog plugins.

### Supported Extensions

PDF, EPUB, DOCX, PPTX, XLSX/XLS/XLSM, CSV, SRT, VTT, TXT, MD, PNG, JPG/JPEG, GIF, WEBP

---

## Phase 1 — Tauri Plugin Setup + Folder Reading

### Step 1.1 · SA · Folder Import Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/folder-import-YYYY-MM-DD.md`

Design the folder import system:

**New Tauri plugin dependencies:**
- `@tauri-apps/plugin-dialog` (JS) + `tauri-plugin-dialog` (Rust) — native folder picker
- `@tauri-apps/plugin-fs` (JS) + `tauri-plugin-fs` (Rust) — `readDir()`, `readFile()` for filesystem access

**Capabilities additions** (`src-tauri/capabilities/default.json`):
- `dialog:default`, `dialog:allow-open`
- `fs:allow-read-dir` with `{ "path": "**" }` (user explicitly picks the folder)
- `fs:allow-read-file` with `{ "path": "**" }`
- `fs:allow-stat` (for file size metadata)

**Folder reading flow:**
1. `open({ directory: true })` → folder path
2. `readDir(path)` → file entries (name, isFile, isDirectory)
3. Filter to supported extensions
4. Read file metadata (name, size, ext) — NOT content yet
5. Return to UI for selection

**File reading flow (after selection):**
- `readFile(path)` → `Uint8Array` → `new File([bytes], name, { type: mime })` → existing `readFile()` in parsers.js
- No changes to parsing pipeline needed

**Key decisions:**
- Read content only for selected files (not whole folder)
- Recursive depth: 1 level of subdirectories
- Construct browser `File` objects from Tauri `readFile` bytes so existing parsers work unchanged

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 1.2 · DEV · Install Tauri Plugins

**Agent:** Study Developer

**JS:** `npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`
**Rust** (`Cargo.toml`): `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"`
**Rust** (`lib.rs`): `.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init())`
**Capabilities** (`default.json`): Add dialog + fs permissions per blueprint

**Verify:** `npm run tauri dev` builds and starts with no errors.

### Step 1.3 · DEV · Implement Folder Reading Helper

**Agent:** Study Developer
**Create:** `src/lib/folderImport.js`

- `pickFolder()` — opens native dialog, returns path or null
- `scanFolder(path, { maxDepth = 1 })` — reads dir, filters supported extensions, returns `{ files: [{ name, path, ext, size, subfolder }], unsupported: [{ name, ext }] }`
- `readSelectedFiles(filePaths)` — reads bytes via plugin-fs, constructs `File` objects
- `SUPPORTED_EXTENSIONS` set, `MIME_MAP` object

**Lines created:** ~100
**Files created:** 1

**Output:** `knowledge/development/phase1-tauri-plugins-YYYY-MM-DD.md`

### Phase 1 Checkpoint

- [ ] Plugins installed, capabilities configured
- [ ] `pickFolder()` opens native dialog
- [ ] `scanFolder()` reads directory with filtering
- [ ] `readSelectedFiles()` produces `File` objects parseable by existing pipeline
- [ ] Build verified

---

## Phase 2 — File Picker UI + Pipeline Integration

### Step 2.1 · UXD · File Picker Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/folder-import-ux-YYYY-MM-DD.md`

**Entry point:** "Import from Folder" button on UploadScreen + "Add Materials" flow

**Picker modal (after folder selected):**
- Header: folder name, supported/total file counts
- File list: checkbox, type icon/badge, filename, size. Grouped by subfolder if applicable.
- "Select All" / "Deselect All"
- Unsupported files: grayed out, no checkbox, tooltip
- Classification preview: auto-classified, editable dropdown per file
- Footer: "Import X files" + "Cancel"
- Empty/no-supported-files states

**Escalate to CEO:** Modal styling, badge colors
**Handoff → DEV:** Design in `knowledge/design/`

### Step 2.2 · DEV · Implement File Picker Component

**Agent:** Study Developer
**Create:** `src/components/FolderImportPicker.jsx`

Checkbox file list, subfolder grouping, classification dropdowns, import/cancel actions.

**Lines created:** ~150-200

### Step 2.3 · DEV · Wire Into Upload Flow

**Agent:** Study Developer
**Files:** `src/StudyContext.jsx`, `src/screens/UploadScreen.jsx`

- `folderImportData` state + `importFromFolder()` + `confirmFolderImport()`
- Button on UploadScreen, also on "Add Materials" flow
- Selected files feed into existing `setFiles()` → `readFile()` → classification → staging

**Lines changed:** ~60-80

**Output:** `knowledge/development/phase2-folder-import-YYYY-MM-DD.md`

### Step 2.4 · QA · Folder Import Testing

**Agent:** Study Security & Testing Analyst

Test: folder picker, scanning, file reading, pipeline integration, near-dedup interaction, edge cases (empty folder, 50+ files, unicode paths, uppercase extensions, permission denied), performance.

**Output:** `knowledge/qa/folder-import-testing-YYYY-MM-DD.md`

### Step 2.5 · UXV · File Picker Validation

**Agent:** Study UX Validator

Validate: button discoverability, file list clarity, unsupported treatment, subfolder grouping, classification preview, import progress.

**Output:** `knowledge/design/validation/folder-import-validation-YYYY-MM-DD.md`

### Phase 2 Checkpoint

- [ ] UXD + DEV + QA + UXV deposited
- [ ] End-to-end: pick folder → select files → import → extraction → skills
- [ ] Build verified

---

## Phase 3 — Polish

### Step 3.1 · DEV · Filtering, Sorting, Search

**Agent:** Study Developer

Add to picker: filter by type, sort by name/size/type, filename search, persist last folder path in settings.

**Lines changed:** ~40

### Step 3.2 · DEV · Smart Classification from Folder Structure

**Agent:** Study Developer

Auto-classify based on subfolder names:
- "Assignments"/"HW" → assignment
- "Readings"/"Textbook" → textbook
- "Lectures"/"Slides" → lecture
- "Syllabus" → syllabus
- Filename hints: "syllabus" → syllabus, "hw"/"assignment" → assignment

**Lines changed:** ~30

### Step 3.3 · QA · Polish Testing

**Agent:** Study Security & Testing Analyst

Test: filtering, sorting, search, persisted path, subfolder classification.

**Output:** `knowledge/qa/folder-import-polish-testing-YYYY-MM-DD.md`

### Phase 3 Checkpoint

- [ ] All polish features work
- [ ] Build verified

---

## Final PM Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Add "Folder import" to "What Is Working"
- Update "File system watcher" → "Replaced with one-shot folder import"
- Note new plugins: `plugin-dialog`, `plugin-fs`
- Update codebase summary

---

## Estimated Scope

| Phase | Steps | New Files | Lines Changed | Risk |
|---|---|---|---|---|
| 1 (Plugins) | 1.1–1.3 | 1 (folderImport.js) | ~100 + config | Medium |
| 2 (UI) | 2.1–2.5 | 1 (FolderImportPicker.jsx) | ~250 | Medium |
| 3 (Polish) | 3.1–3.3 | 0 | ~70 | Low |

**Total:** ~420 lines, 2 new files, 2 new Tauri plugins.

---

## Knowledge Artifacts

| Phase | Agent | Artifact | Location |
|---|---|---|---|
| 1 | SA | Blueprint | `knowledge/architecture/folder-import-YYYY-MM-DD.md` |
| 1 | DEV | Plugin setup log | `knowledge/development/phase1-tauri-plugins-YYYY-MM-DD.md` |
| 2 | UXD | Picker design | `knowledge/design/folder-import-ux-YYYY-MM-DD.md` |
| 2 | DEV | Phase 2 log | `knowledge/development/phase2-folder-import-YYYY-MM-DD.md` |
| 2 | QA | Import test report | `knowledge/qa/folder-import-testing-YYYY-MM-DD.md` |
| 2 | UXV | Picker validation | `knowledge/design/validation/folder-import-validation-YYYY-MM-DD.md` |
| 3 | QA | Polish test report | `knowledge/qa/folder-import-polish-testing-YYYY-MM-DD.md` |

---

## Agent Involvement

| Phase | SA | DEV | UXD | UXV | QA | PM |
|---|---|---|---|---|---|---|
| 1 — Plugins | Blueprint | Install + implement | — | — | — | — |
| 2 — UI | — | Component + wiring | Picker design | Validate | Full pipeline | — |
| 3 — Polish | — | Filter + classify | — | — | Polish test | — |
| Final | — | — | — | — | — | Status |
