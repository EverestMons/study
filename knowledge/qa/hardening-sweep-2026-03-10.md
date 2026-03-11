# QA Report: Full Regression — Hardening Sweep
**Date:** 2026-03-10
**Analyst:** Study Security & Testing Analyst

---

## Test Results: 8/8 PASS

### 1. Upload Flow
**PASS**

| Component | Evidence |
|-----------|----------|
| Drag-and-drop | UploadScreen.jsx: `onDrop` handler wired to drop zone |
| File input | UploadScreen.jsx: `onSelect` handler on file input |
| Course name | UploadScreen.jsx: text input + "Create Course" button |
| File parsing | StudyContext.jsx: `onDrop`/`onSelect` call `readFile` from parsers.js |
| Folder import | StudyContext.jsx: `importFromFolder` → `pickFolder` + `scanFolder` |
| Folder modal | FolderPickerModal.jsx: file list, checkboxes, "Import X Files" button |
| Confirm import | StudyContext.jsx: `confirmFolderImport` reads selected files via `readFile` |

---

### 2. Study Flow
**PASS**

| Component | Evidence |
|-----------|----------|
| Study screen layout | StudyScreen.jsx: renders MessageList, InputBar, sidebar panels |
| Send message | StudyContext.jsx: `sendMessage` → `callClaudeStream` → processes response |
| Skill updates | StudyContext.jsx: `parseSkillUpdates(response)` → `applySkillUpdates` |
| Boot session | StudyContext.jsx: `bootWithFocus` → `buildFocusedContext` → `callClaudeStream` |
| Session creation | StudyContext.jsx: `enterStudy` → `Sessions.create` |

---

### 3. Profile
**PASS**

| Component | Evidence |
|-----------|----------|
| Profile screen | ProfileScreen.jsx: renders parent skills, sub-skill cards, mastery indicators |
| Bulk loading | StudyContext.jsx: `loadProfile` uses 4 bulk queries (P2 optimization intact) |
| Hash map grouping | `subsByParent`, `masteryBySkill`, `prereqsBySkill` built with `||=` pattern |

---

### 4. Materials
**PASS**

| Component | Evidence |
|-----------|----------|
| Status tabs | MaterialsScreen.jsx: "All", "Ready", "Needs Attention", "Failed" tabs |
| Tab counts | MaterialsScreen.jsx: computed from materials array |
| Retry all | MaterialsScreen.jsx: `retryAllFailed` button + StudyContext.jsx handler |
| Per-material retry | MaterialsScreen.jsx: "Retry (N sections)" button per material |

---

### 5. OCR
**PASS**

| Component | Evidence |
|-----------|----------|
| Scanned PDF detection | parsers.js: checks `result._needsOcr` for empty pages |
| Auto-OCR | parsers.js: dynamically imports `ocrEngine.js`, calls `ocrPdfPages` |
| Language support | parsers.js: passes `options.ocrLanguages` (default `['eng']`) |
| OCR engine | ocrEngine.js: `initOcrWorker(langs)` with tesseract.js v7 `createWorker` |

---

### 6. Practice Mode
**PASS**

| Component | Evidence |
|-----------|----------|
| Skill selection | PracticeMode.jsx: skill name, tier info, problem counter |
| Problem generation | study.js: `generateProblems` → `callClaude` with `isApiError` check |
| Answer evaluation | study.js: `evaluateAnswer` → `callClaude` with `isApiError` check + fallback |

---

### 7. Settings
**PASS**

| Component | Evidence |
|-----------|----------|
| API key input | SettingsModal.jsx: password input + `testApiKey` verification on save |
| OCR languages | SettingsModal.jsx: `OCR_LANGS` (10 languages), toggle pills, `setSetting` persistence |

---

### 8. Build
**PASS**

| Check | Evidence |
|-------|----------|
| Build script | package.json: `"build": "vite build"` |
| Release build | `npm run build` → `✓ built in 1.35s`, no errors |
| Console errors | No import failures, no missing modules |

---

## Hardening Changes Verified Intact

| Hardening | Status |
|-----------|--------|
| CSP in tauri.conf.json | Active — all directives present |
| Prompt injection defense | Active — CONTENT SAFETY directive in buildSystemPrompt |
| isApiError at all 9 call sites | Active — all imported and checking |
| Context value memoization (P1) | Active — useMemo with 29 deps |
| Batch profile queries (P2) | Active — 4 bulk queries + hash maps |
| loadCoursesNested dedup (P3) | Active — sentinel + .finally() |
| extractJSON repair cap (P4) | Active — 50KB + 100 object limits |
| Database backup on reset | Active — backupDatabase() before DELETEs |
| Stream truncation markers | Active — 3 paths with visible markers |

## Summary

All 8 major flows verified intact at the code level. No broken wiring detected after the security, performance, and stability hardening pass. All hardening measures confirmed active and correctly integrated.
