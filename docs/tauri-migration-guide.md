# Study: Tauri Migration Guide

## Overview

This document provides step-by-step instructions for migrating the Study app from the Claude artifact sandbox to a Tauri desktop application.

**Source:** `study.jsx` (5,207 lines)  
**Target:** Tauri app with React frontend + Rust backend + SQLite storage

---

## Current Architecture Analysis

### File Structure (study.jsx)

```
Lines 1-77      Error boundary component
Lines 78-180    DB layer (window.storage wrapper)
Lines 181-625   Document parsing (JSZip, EPUB, DOCX, readFile)
Lines 626-743   Claude API calls (callClaude, callClaudeStream)
Lines 744-785   JSON extraction utilities
Lines 786-927   Document verification and chunking
Lines 928-1107  Skill extraction (generateReferenceTaxonomy, extractChunkSkills, mergeExtractedSkills)
Lines 1108-1424 Skill tree management (extractSkillTree, validateSkillTree, mergeSkillTree)
Lines 1425-1457 Assignment decomposition
Lines 1458-1702 Context building (buildContext, buildFocusedContext)
Lines 1703-1930 Session/journal/strength calculations
Lines 1931-2104 Practice mode logic
Lines 2105-2241 Theme, CSS, utilities (renderMd, autoClassify)
Lines 2242-5207 StudyInner component (all UI + state)
```

### DB Methods Used (102 total calls)

| Method | Calls | Purpose |
|--------|-------|---------|
| `DB.getCourses` | 17 | Load course list |
| `DB.saveCourses` | 11 | Save course metadata (includes materials array) |
| `DB.getSkills` | 13 | Load skill tree for course |
| `DB.saveSkills` | 12 | Save skill tree |
| `DB.getProfile` | 5 | Load student progress |
| `DB.saveProfile` | 1 | Save student progress |
| `DB.getDoc` | 3 | Load chunk content |
| `DB.saveDoc` | 2 | Save parsed document chunk |
| `DB.getChat` | 1 | Load chat history |
| `DB.saveChat` | 4 | Save chat history |
| `DB.getJournal` | 4 | Load session journal |
| `DB.saveJournal` | 2 | Save session journal |
| `DB.getAsgn` | 2 | Load assignment decomposition |
| `DB.saveAsgn` | 3 | Save assignment decomposition |
| `DB.getRefTaxonomy` | 4 | Load reference taxonomy |
| `DB.saveRefTaxonomy` | 1 | Save reference taxonomy |
| `DB.getChunkSkills` | 2 | Load skills for one chunk (cache) |
| `DB.saveChunkSkills` | 1 | Save skills for one chunk (cache) |
| `DB.getValidation` | 0 | (unused in reads) |
| `DB.saveValidation` | 2 | Save validation report |
| `DB.getPractice` | 2 | Load practice set |
| `DB.savePractice` | 6 | Save practice set |
| `DB.deleteCourse` | 1 | Delete all course data |
| `DB.del` | 3 | Delete individual keys |
| `DB.get` | 1 | Raw key access |

### Storage Key Patterns

```
study-courses                      -> Course[] (all courses + material metadata)
study-doc:{courseId}:{chunkId}     -> { content: string }
study-cskills:{courseId}:{chunkId} -> Skill[] (per-chunk extraction cache)
study-skills:{courseId}            -> Skill[] (merged skill tree)
study-reftax:{courseId}            -> ReferenceTaxonomy
study-valid:{courseId}             -> ValidationReport
study-asgn:{courseId}              -> Assignment[]
study-profile:{courseId}           -> { skills: {[id]: SkillProgress}, sessions: number }
study-chat:{courseId}              -> Message[]
study-journal:{courseId}           -> JournalEntry[]
study-practice:{courseId}:{skillId} -> PracticeSet
```

### External Dependencies

1. **window.storage** - Claude artifact persistent storage API
2. **JSZip** (CDN loaded) - EPUB/DOCX parsing
3. **Anthropic API** - Claude calls via fetch

### React State (35 useState hooks)

Core:
- `courses`, `active`, `ready` - Course management
- `msgs`, `input`, `busy`, `booting` - Chat state
- `screen` - Navigation (home/create/study)

UI:
- `showManage`, `showSkills`, `showCourseManagement` - Modals
- `notifs`, `showNotifs`, `lastSeenNotif` - Notifications
- `expandedCats`, `pendingConfirm` - UI interactions

Session:
- `sessionMode`, `focusContext`, `pickerData` - Study session
- `asgnWork`, `practiceMode` - Active learning modes
- `chunkPicker` - Material activation UI

Creation:
- `files`, `cName`, `drag`, `parsing` - Course creation flow
- `status`, `processingMatId`, `extractionErrors` - Progress tracking

---

## Migration Strategy

### Phase 1: Project Scaffold

**Goal:** Get React app running in Tauri with no functionality changes.

1. Create Tauri project structure
2. Move `study.jsx` to `src/App.jsx` with minimal changes
3. Create mock DB layer that logs calls
4. Verify all screens render

**Files to create:**
```
study/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   └── main.rs          # Minimal Tauri setup
│   └── icons/
├── src/
│   ├── main.jsx             # React entry point
│   ├── App.jsx              # StudyInner component (from study.jsx)
│   ├── db.js                # DB layer (invoke wrapper)
│   ├── api.js               # Claude API calls
│   ├── parsing.js           # Document parsing
│   └── utils.js             # Helpers (renderMd, etc.)
├── index.html
├── package.json
└── vite.config.js
```

### Phase 2: SQLite Backend

**Goal:** Replace window.storage with SQLite via Tauri commands.

**Rust commands to implement:**
```rust
// Core CRUD
db_get_courses() -> Vec<Course>
db_save_courses(courses: Vec<Course>)
db_get_skills(course_id: String) -> Vec<Skill>
db_save_skills(course_id: String, skills: Vec<Skill>)
db_get_profile(course_id: String) -> Profile
db_save_profile(course_id: String, profile: Profile)
db_get_doc(course_id: String, chunk_id: String) -> Option<Document>
db_save_doc(course_id: String, chunk_id: String, doc: Document)
db_get_chat(course_id: String) -> Vec<Message>
db_save_chat(course_id: String, messages: Vec<Message>)
db_get_journal(course_id: String) -> Vec<JournalEntry>
db_save_journal(course_id: String, entries: Vec<JournalEntry>)
db_get_asgn(course_id: String) -> Vec<Assignment>
db_save_asgn(course_id: String, assignments: Vec<Assignment>)
db_get_ref_taxonomy(course_id: String) -> Option<RefTaxonomy>
db_save_ref_taxonomy(course_id: String, taxonomy: RefTaxonomy)
db_get_chunk_skills(course_id: String, chunk_id: String) -> Vec<Skill>
db_save_chunk_skills(course_id: String, chunk_id: String, skills: Vec<Skill>)
db_get_practice(course_id: String, skill_id: String) -> Option<PracticeSet>
db_save_practice(course_id: String, skill_id: String, set: PracticeSet)
db_delete_course(course_id: String, material_ids: Vec<String>)
```

**Frontend DB wrapper (`src/db.js`):**
```javascript
import { invoke } from "@tauri-apps/api/core";

export const DB = {
  async getCourses() {
    return await invoke("db_get_courses");
  },
  async saveCourses(courses) {
    await invoke("db_save_courses", { courses });
  },
  async getSkills(courseId) {
    return await invoke("db_get_skills", { courseId });
  },
  // ... same API shape as current DB object
};
```

### Phase 3: Native Document Parsing

**Goal:** Replace JSZip browser parsing with native Rust/Python parsing.

**Option A: Pure Rust (lighter, faster)**
- Use `zip` crate for EPUB/DOCX
- Use `lopdf` or `pdf-extract` for PDF
- Handles 90% of student uploads

**Option B: Python sidecar with Unstructured (more capable)**
- Handles scanned PDFs with OCR
- Better table extraction
- More file formats

**Recommended:** Start with Option A, add Python sidecar later if needed.

**Rust commands:**
```rust
parse_document(path: String) -> ParseResult
// Returns: { chunks: [{ label, content, charCount }], classification }
```

**Frontend change:**
```javascript
// Before (browser):
const parsed = await readFile(file);

// After (Tauri):
const filePath = await saveToTemp(file);
const parsed = await invoke("parse_document", { path: filePath });
```

### Phase 4: Polish

- Native file picker
- Drag-drop from Finder
- Menu bar integration
- Auto-updates
- Code signing

---

## Code Splitting Plan

The monolithic `study.jsx` should be split into modules:

### `src/db.js` - Database Layer
```javascript
// Lines 78-180 from study.jsx
// Replace window.storage with invoke calls
export const DB = { ... };
```

### `src/api.js` - Claude API
```javascript
// Lines 626-743 from study.jsx
// callClaude, callClaudeStream, extractJSON
export const callClaude = async (system, messages, maxTokens) => { ... };
export const callClaudeStream = async (system, messages, onChunk, maxTokens) => { ... };
export const extractJSON = (text) => { ... };
```

### `src/parsing.js` - Document Parsing
```javascript
// Lines 181-625, 786-927 from study.jsx
// Will be replaced with invoke("parse_document") calls
// Keep classification logic: autoClassify, verifyDocument
export const parseDocument = async (file) => { ... };
export const autoClassify = (file) => { ... };
```

### `src/skills.js` - Skill Extraction & Management
```javascript
// Lines 928-1424 from study.jsx
// generateReferenceTaxonomy, extractChunkSkills, mergeExtractedSkills
// extractSkillTree, validateSkillTree, mergeSkillTree, decomposeAssignments
export const extractSkillTree = async (...) => { ... };
```

### `src/context.js` - Context Building
```javascript
// Lines 1458-1702 from study.jsx
// buildContext, buildFocusedContext
export const buildContext = async (...) => { ... };
export const buildFocusedContext = async (...) => { ... };
```

### `src/learning.js` - Learning Science Logic
```javascript
// Lines 1703-2104 from study.jsx
// Strength calculations, spaced repetition, practice mode
export const effectiveStrength = (skillData) => { ... };
export const nextReviewDate = (skillData, threshold) => { ... };
export const applySkillUpdates = async (courseId, updates) => { ... };
```

### `src/utils.js` - Utilities
```javascript
// Lines 2105-2241 from study.jsx
// Theme (T), CSS, renderMd, autoClassify, etc.
export const T = { ... };
export const renderMd = (text) => { ... };
```

### `src/App.jsx` - Main Component
```javascript
// Lines 2242-5207 from study.jsx
// StudyInner component with all UI
// Import from other modules
import { DB } from './db';
import { callClaude, callClaudeStream } from './api';
import { extractSkillTree } from './skills';
// ...
```

---

## SQLite Schema

```sql
-- Courses (metadata only, no nested materials)
CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Materials
CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    classification TEXT NOT NULL,
    char_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Chunks (document sections)
CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    content TEXT,
    char_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'skipped',  -- skipped, extracted, pending, failed
    fail_count INTEGER DEFAULT 0,
    last_error TEXT
);

-- Chunk skills cache (per-chunk extraction results)
CREATE TABLE chunk_skills (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    skills_json TEXT NOT NULL  -- JSON array of skills
);

-- Skills (merged skill tree)
CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    prerequisites_json TEXT,  -- JSON array of skill IDs
    sources_json TEXT,        -- JSON array of source names
    flagged INTEGER DEFAULT 0,
    flag_reason TEXT
);

-- Reference taxonomy
CREATE TABLE ref_taxonomy (
    course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    taxonomy_json TEXT NOT NULL
);

-- Skill validation reports
CREATE TABLE validation_reports (
    course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    report_json TEXT NOT NULL
);

-- Assignments
CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT,
    questions_json TEXT  -- JSON array of question objects
);

-- Student profile (skill progress)
CREATE TABLE skill_progress (
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    ease REAL DEFAULT 2.5,
    last_practiced TEXT,
    entries_json TEXT,  -- JSON array of practice entries
    PRIMARY KEY (course_id, skill_id)
);

-- Profile metadata
CREATE TABLE profiles (
    course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    sessions INTEGER DEFAULT 0
);

-- Chat history
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Session journal
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    summary TEXT,
    topics_json TEXT,
    struggles_json TEXT,
    breakthroughs_json TEXT,
    skill_updates_json TEXT,
    created_at TEXT NOT NULL
);

-- Practice sets
CREATE TABLE practice_sets (
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    PRIMARY KEY (course_id, skill_id)
);

-- Indexes for common queries
CREATE INDEX idx_materials_course ON materials(course_id);
CREATE INDEX idx_chunks_material ON chunks(material_id);
CREATE INDEX idx_skills_course ON skills(course_id);
CREATE INDEX idx_chat_course ON chat_messages(course_id);
CREATE INDEX idx_journal_course ON journal_entries(course_id);
```

---

## Data Migration

If users have existing data in the artifact:

1. Export function in artifact version:
```javascript
const exportData = async () => {
  const courses = await DB.getCourses();
  const exportData = { courses: [] };
  
  for (const course of courses) {
    const courseData = {
      ...course,
      skills: await DB.getSkills(course.id),
      profile: await DB.getProfile(course.id),
      assignments: await DB.getAsgn(course.id),
      chat: await DB.getChat(course.id),
      journal: await DB.getJournal(course.id),
      documents: {}
    };
    
    for (const mat of course.materials || []) {
      for (const chunk of mat.chunks || []) {
        const doc = await DB.getDoc(course.id, chunk.id);
        if (doc) courseData.documents[chunk.id] = doc;
      }
    }
    
    exportData.courses.push(courseData);
  }
  
  return JSON.stringify(exportData);
};
```

2. Import function in Tauri version:
```rust
#[tauri::command]
async fn import_data(data: String) -> Result<(), String> {
    let export: ExportData = serde_json::from_str(&data)?;
    // Insert into SQLite tables
}
```

---

## Testing Checklist

### Phase 1 (Scaffold)
- [ ] App launches in Tauri window
- [ ] All screens render (home, create, study)
- [ ] Navigation works
- [ ] Theme/styling correct

### Phase 2 (SQLite)
- [ ] Create course
- [ ] Upload materials (with temp file workaround)
- [ ] View materials list
- [ ] Activate/deactivate sections
- [ ] View skill tree
- [ ] Start study session
- [ ] Chat works (Claude API)
- [ ] Skill updates persist
- [ ] Journal saves
- [ ] Practice mode works
- [ ] Delete course (cascades)

### Phase 3 (Native Parsing)
- [ ] EPUB parsing
- [ ] DOCX parsing
- [ ] TXT/MD parsing
- [ ] PDF parsing (new!)
- [ ] PPTX parsing
- [ ] XLSX parsing
- [ ] Classification detection
- [ ] Large file handling

---

## Risk Mitigation

### Risk: Large refactor introduces bugs
**Mitigation:** 
- Keep DB API shape identical
- Split into modules incrementally
- Test each module in isolation before integration

### Risk: SQLite schema doesn't match data model
**Mitigation:**
- Use JSON columns for nested/flexible data
- Keep schema close to current key-value patterns initially
- Optimize schema later

### Risk: Native parsing differs from browser parsing
**Mitigation:**
- Log both outputs during transition
- Keep browser parsing code available for comparison
- Test with real student uploads

### Risk: Tauri/Rust learning curve
**Mitigation:**
- Start with minimal Rust (just DB + parsing)
- Use serde_json for easy JS/Rust interop
- Claude can help with Rust code
