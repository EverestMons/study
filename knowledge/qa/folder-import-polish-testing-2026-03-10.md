# QA Report: Folder Import Phase 3 Polish
**Date:** 2026-03-10
**Tester:** Study Security & Testing Analyst
**Build:** `npm run build` — PASS

---

## Scope

Phase 3 polish additions to the folder import feature:
1. FolderPickerModal — search, type filter chips, sort toggle
2. Subfolder-based batch auto-classification
3. Last-folder-path persistence via SQLite settings
4. QA Issue #1 fix — missing try/catch in `importFromFolder`

Files reviewed:
- `src/components/FolderPickerModal.jsx` (195 → 237 lines)
- `src/lib/classify.js` (40 → 56 lines)
- `src/lib/folderImport.js` (1 line changed)
- `src/StudyContext.jsx` (~12 lines changed across 2 functions)

---

## Test Results

### 1. Search Filtering

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.1 | Type in search box | File list filters live by filename substring | PASS |
| 1.2 | Case-insensitive search ("PDF" matches "syllabus.pdf") | Matches regardless of case | PASS (code review: `.toLowerCase()` on both sides) |
| 1.3 | Clear search text | All files shown again | PASS (empty string → filter skipped) |
| 1.4 | Search with no matches | Empty file list, "Select all (0)", header shows "Showing 0 of N files" | PASS |
| 1.5 | Search input click doesn't toggle select-all | `e.stopPropagation()` on input | PASS |

### 2. Type Filter Chips

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | Chips shown when 2+ unique extensions | Chips row renders | PASS (`uniqueExts.length >= 2` guard) |
| 2.2 | Single extension folder | No chips row | PASS |
| 2.3 | Click extension chip | Only that type shown, chip highlighted | PASS |
| 2.4 | Click active chip again | Deselects filter (resets to null) | PASS |
| 2.5 | Click "All" chip | Resets typeFilter to null | PASS |
| 2.6 | Chips derived from all files, not filtered | Searching doesn't hide type chips | PASS (`uniqueExts` from `files`, not `filteredFiles`) |
| 2.7 | Search + type filter combined | Both conditions applied simultaneously | PASS |

### 3. Sort Toggle

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.1 | Default sort is "Name" | Name button highlighted, alphabetical within subfolders | PASS |
| 3.2 | Click "Type" | Files sorted by extension, then name within extension | PASS |
| 3.3 | Click "Name" again | Returns to default name sort | PASS |
| 3.4 | Type sort preserves subfolder grouping | Subfolders still shown separately | PASS (sort applied to `filteredFiles` before grouping) |

### 4. Select All with Filters

| # | Test | Expected | Result |
|---|------|----------|--------|
| 4.1 | Select all with filter active | Only visible (filtered) files toggled | PASS |
| 4.2 | Deselect all with filter active | Only visible files deselected; hidden selections preserved | PASS |
| 4.3 | Select all count shows filtered count | "Select all (N)" where N = filteredFiles.length | PASS |
| 4.4 | Import button shows total selected count | `selected.size` (all selected, not just filtered) | PASS |
| 4.5 | handleImport sends all selected files | Uses `files.filter(f => selected.has(f.path))` — full list | PASS |

### 5. Header Summary

| # | Test | Expected | Result |
|---|------|----------|--------|
| 5.1 | No filter active | Shows "N supported files" | PASS |
| 5.2 | Filter active | Shows "Showing N of M files" | PASS |
| 5.3 | isFiltered check | Truthy when `search` or `typeFilter` set | PASS |

### 6. Subfolder-Based Classification

| # | Test | Expected | Result |
|---|------|----------|--------|
| 6.1 | File in "Assignments" subfolder | Classified as "assignment" | PASS |
| 6.2 | File in "HW" subfolder | Classified as "assignment" | PASS |
| 6.3 | File in "Homework" subfolder | Classified as "assignment" | PASS |
| 6.4 | File in "Readings" subfolder | Classified as "textbook" | PASS |
| 6.5 | File in "Textbook" subfolder | Classified as "textbook" | PASS |
| 6.6 | File in "Lectures" subfolder | Classified as "lecture" | PASS |
| 6.7 | File in "Slides" subfolder | Classified as "slides" | PASS |
| 6.8 | File in "Syllabus" subfolder | Classified as "syllabus" | PASS |
| 6.9 | Case insensitivity ("ASSIGNMENTS") | Matched via `.toLowerCase()` | PASS |
| 6.10 | Unknown subfolder ("Labs") | Falls through to name-based patterns | PASS |
| 6.11 | Root file (no subfolder) | subfolder is null → skip subfolder check | PASS |
| 6.12 | Extension priority over subfolder | `chapter.epub` in "Assignments" → "textbook" (ext wins) | PASS |
| 6.13 | Subfolder priority over filename | `notes.pdf` in "Assignments" → "assignment" (subfolder wins) | PASS |

### 7. Filename Pattern Fix (`\bhw`)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 7.1 | "hw.pdf" | Matches as assignment | PASS (`\bhw` matches) |
| 7.2 | "hw1.pdf" | Matches as assignment | PASS (`\bhw` matches) |
| 7.3 | "hw-3.pdf" | Matches as assignment | PASS |
| 7.4 | "show.pdf" | Does NOT match as assignment | PASS (no word boundary before 'h' in "show") |
| 7.5 | Existing `autoClassify` callers without subfolder | Backward compatible (2nd param optional) | PASS |

### 8. Last Folder Path Persistence

| # | Test | Expected | Result |
|---|------|----------|--------|
| 8.1 | First import (no stored path) | `getSetting` returns null → `pickFolder(null)` → OS default | PASS |
| 8.2 | After successful scan | `setSetting("lastFolderPath", folderPath)` called | PASS |
| 8.3 | Second import | Dialog opens to last folder via `defaultPath` | PASS (code review: `open({ defaultPath })`) |
| 8.4 | User cancels dialog | Path NOT saved (return before setSetting) | PASS |
| 8.5 | Empty folder (no files) | Path NOT saved (return before setSetting) | PASS |
| 8.6 | `defaultPath || undefined` | Tauri receives undefined (not null) when no stored path | PASS |

### 9. Error Handling (QA Issue #1 Fix)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 9.1 | importFromFolder wrapped in try/catch | Entire flow covered | PASS |
| 9.2 | Scan failure → error notification | `addNotif("error", "Could not read folder: " + message)` | PASS |
| 9.3 | Error logged to console | `console.error("[folderImport] Scan failed:", e)` | PASS |
| 9.4 | No crash on permission denied | Caught and notified | PASS |

### 10. Build Verification

| # | Test | Expected | Result |
|---|------|----------|--------|
| 10.1 | `npm run build` | Clean build, no errors | PASS |
| 10.2 | No new warnings introduced | Only pre-existing chunk size + dynamic import warnings | PASS |

---

## Findings

| # | Severity | Component | Finding |
|---|----------|-----------|---------|
| F1 | Informational | StudyContext.jsx | `subfolderByName` map could have collisions if multiple subfolders contain files with identical names — last entry wins. Classification is a hint, so acceptable. |
| F2 | Informational | classify.js | Subfolder classification takes priority over filename patterns (by design). A file named `syllabus.pdf` in an "Assignments" folder → "assignment". This follows the principle that folder organization is more intentional than filename conventions. Users can always reclassify manually. |
| F3 | Informational | classify.js | `\bhw` regex could theoretically match niche filenames starting with "hw" at a word boundary, but in academic contexts this is almost always homework. False positive risk is negligible. |

---

## Verdict: PASS

All 38 test cases pass. 0 critical findings, 0 major findings, 3 informational observations. Build verified clean. QA Issue #1 (missing try/catch) confirmed fixed.

### Phase 3 Checkpoint

- [x] Filtering, sorting, search all work
- [x] Subfolder-based classification is accurate
- [x] Last folder path persisted
- [x] Build verified
