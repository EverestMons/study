# Study: Tauri Desktop Architecture

## Why Tauri

The artifact sandbox limits document parsing to what runs in a browser. DOCX, EPUB, and XLSX work through JSZip hacks. PDF doesn't work at all. Scanned documents, complex tables, and non-standard formats fail silently or produce garbage.

Tauri gives us native file system access, sidecar processes, and the ability to bundle real parsing tools. Smaller binaries than Electron. Rust backend integrates well with whisper.cpp for future transcription.

---

## Trigger Points for Migration

Move to Tauri when any of these become the primary bottleneck:

- PDF parsing is needed (most common student upload format)
- Offline-first reliability matters (exam prep without internet)
- Local Whisper transcription integration
- File system watching (auto-import from Downloads)
- The artifact sandbox is the thing we're working around more than working in

---

## Architecture Overview

```
+-------------------+     +------------------+     +------------------+
|   Tauri Frontend  |     |   Rust Backend   |     | Python Sidecar   |
|   (React/study.jsx|<--->|   (Commands API)  |<--->| (Unstructured)   |
|    runs in WebView)|     |   File I/O       |     | Document parsing |
+-------------------+     |   SQLite          |     | OCR (optional)   |
                          |   State mgmt      |     +------------------+
                          +------------------+
                                  |
                          +------------------+
                          |   whisper.cpp    |
                          |   (future)       |
                          +------------------+
```

---

## Document Parsing: Unstructured

### Why Unstructured over alternatives

| Tool | Strengths | Weaknesses for Study |
|------|-----------|---------------------|
| Pandoc | Single binary, no deps, fast | No OCR, no scanned PDFs, weak table extraction |
| Apache Tika | Handles everything | Java dependency, heavy runtime |
| PyMuPDF | Excellent PDF parsing | PDF only |
| **Unstructured** | **All formats, OCR, LLM-optimized output** | **Python dependency** |

Unstructured wins because:
- Purpose-built for "documents -> clean text for LLMs" (exactly our use case)
- Handles PDF (including scanned with OCR), DOCX, PPTX, EPUB, HTML, RTF, TXT, CSV, XLSX, images
- Outputs structured elements (Title, NarrativeText, ListItem, Table) not just raw text
- Open source (Apache 2.0)
- Active development, large community

### Installation

```bash
# Full install for all document types
pip install "unstructured[all-docs]"

# Or selective (lighter):
pip install "unstructured[pdf,docx,pptx,epub,xlsx]"

# System dependencies (macOS):
brew install libmagic poppler tesseract

# System dependencies (Ubuntu):
apt-get install libmagic-dev poppler-utils tesseract-ocr
```

### Integration Pattern: Python Sidecar

Tauri supports sidecar processes -- bundled executables that run alongside the app. We bundle a small Python script that wraps Unstructured and communicates with the Rust backend via stdin/stdout JSON.

**Sidecar: parse_document.py**
```python
import sys
import json
from unstructured.partition.auto import partition

def parse_file(file_path):
    """Parse any document type and return clean text elements."""
    elements = partition(filename=file_path)

    result = {
        "success": True,
        "elements": [],
        "metadata": {
            "file_type": elements[0].metadata.filetype if elements else "unknown",
            "total_elements": len(elements)
        }
    }

    for el in elements:
        result["elements"].append({
            "type": el.category,        # Title, NarrativeText, ListItem, Table, etc.
            "text": str(el),
            "metadata": {
                "page_number": getattr(el.metadata, "page_number", None),
                "section": getattr(el.metadata, "section", None),
            }
        })

    return result

if __name__ == "__main__":
    request = json.loads(sys.stdin.readline())
    try:
        result = parse_file(request["path"])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
```

**Rust side (Tauri command):**
```rust
#[tauri::command]
async fn parse_document(path: String) -> Result<ParseResult, String> {
    let sidecar = app.shell()
        .sidecar("parse_document")
        .map_err(|e| e.to_string())?;

    let request = serde_json::json!({ "path": path });

    let (mut rx, child) = sidecar
        .args(&[])
        .spawn()
        .map_err(|e| e.to_string())?;

    // Send request via stdin
    child.write(format!("{}\n", request).as_bytes())
        .map_err(|e| e.to_string())?;

    // Read response from stdout
    let output = rx.recv().await
        .ok_or("No response from parser")?;

    serde_json::from_str(&output.payload)
        .map_err(|e| e.to_string())
}
```

**Frontend call (from React):**
```javascript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("parse_document", { path: filePath });
// result.elements = [{ type: "Title", text: "Chapter 1" }, ...]
```

### Element Types -> Study Classifications

Unstructured outputs typed elements. Map them to Study's needs:

```javascript
const elementsToContent = (elements) => {
    // Group by page for textbooks
    // Combine NarrativeText blocks into paragraphs
    // Preserve Table elements as structured data
    // Use Title elements as section headers

    return elements
        .filter(el => el.text.trim().length > 0)
        .map(el => {
            if (el.type === "Table") return "\n[TABLE]\n" + el.text + "\n[/TABLE]\n";
            if (el.type === "Title") return "\n## " + el.text + "\n";
            return el.text;
        })
        .join("\n");
};
```

### OCR for Scanned Documents

Unstructured uses Tesseract for OCR when it detects image-based PDFs. This is automatic with the `[pdf]` extra installed and Tesseract available on the system.

For lecture slides that are image-heavy:
```python
elements = partition(
    filename="lecture-slides.pdf",
    strategy="hi_res",           # Use layout detection model
    infer_table_structure=True,  # Reconstruct tables from images
)
```

The `hi_res` strategy is slower but handles:
- Scanned PDFs (professor's handwritten notes scanned to PDF)
- Slides exported as PDF (layout-aware extraction)
- Mixed documents (some pages text, some scanned)

---

## Storage: SQLite (replaces localStorage)

The artifact prototype uses `window.storage` (localStorage wrapper). Tauri should use SQLite for:
- No size limits (localStorage caps at 5-10MB per origin)
- Proper transactions
- Full-text search on document content
- Better performance with large course libraries

### Schema

```sql
-- Courses
CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Materials (metadata only)
CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id),
    name TEXT NOT NULL,
    classification TEXT NOT NULL,  -- syllabus, textbook, assignment, lecture, notes, reference
    file_type TEXT,
    file_path TEXT,                -- original file path for re-parsing
    char_count INTEGER,
    parse_status TEXT,             -- ok, partial, failed
    created_at TEXT NOT NULL
);

-- Document content (parsed text, separate for performance)
CREATE TABLE documents (
    material_id TEXT PRIMARY KEY REFERENCES materials(id),
    content TEXT,                  -- full parsed text
    chapters TEXT,                 -- JSON array for textbooks
    elements TEXT                  -- raw Unstructured elements (JSON) for re-processing
);

-- Skills
CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    prerequisites TEXT,           -- JSON array of skill IDs
    sources TEXT                  -- JSON array of source document names
);

-- Student profile per skill
CREATE TABLE skill_progress (
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    strength REAL DEFAULT 0,      -- 0.0 to 1.0
    ease REAL DEFAULT 2.5,        -- Anki-style ease factor
    last_practiced TEXT,           -- ISO timestamp
    points INTEGER DEFAULT 0,     -- cumulative (backward compat)
    PRIMARY KEY (course_id, skill_id)
);

-- Skill history (individual practice events)
CREATE TABLE skill_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    rating TEXT NOT NULL,          -- struggled, hard, good, easy
    reason TEXT,
    practiced_at TEXT NOT NULL
);

-- Assignments
CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id),
    title TEXT NOT NULL,
    due_date TEXT,
    questions TEXT                 -- JSON array of question objects
);

-- Session journal
CREATE TABLE journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    summary TEXT,
    topics TEXT,                   -- JSON array
    struggles TEXT,                -- JSON array
    breakthroughs TEXT,            -- JSON array
    skill_updates TEXT,            -- JSON array
    session_at TEXT NOT NULL
);

-- Chat history
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    role TEXT NOT NULL,            -- user, assistant
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Full-text search on document content
CREATE VIRTUAL TABLE documents_fts USING fts5(content, material_id);
```

### Migration Path

The DB module currently uses key-value storage. The Tauri version wraps SQLite with the same async interface so the React layer doesn't change:

```javascript
// Same API, different backend
const DB = {
    async getCourses() { return await invoke("db_get_courses"); },
    async saveDoc(cid, did, d) { return await invoke("db_save_doc", { cid, did, doc: d }); },
    async getSkills(cid) { return await invoke("db_get_skills", { cid }); },
    // ... same shape as current DB object
};
```

---

## Whisper Integration (Future)

Tauri can bundle whisper.cpp as a sidecar for local transcription:

```
Student records lecture -> whisper.cpp transcribes ->
output saved as .txt -> auto-classified as "lecture" ->
mergeSkillTree picks up new content
```

This replaces the current Buzz workflow with a built-in solution.

---

## Migration Checklist

### Phase 1: Scaffold
- [ ] Create Tauri project with React frontend
- [ ] Copy study.jsx into frontend (minimal changes)
- [ ] Implement SQLite DB module with same API shape
- [ ] Replace `window.storage` calls with `invoke` calls
- [ ] Verify all screens render correctly

### Phase 2: Parsing
- [ ] Bundle Unstructured Python sidecar
- [ ] Replace browser-based readFile with native parsing
- [ ] Add PDF support
- [ ] Add OCR support for scanned documents
- [ ] Test with real student uploads (DOCX, PDF, EPUB, XLSX, PPTX)

### Phase 3: Features
- [ ] File system watcher for auto-import
- [ ] Local Whisper transcription
- [ ] Offline mode (cached Claude responses for review)
- [ ] Export study progress (PDF report cards)

### Phase 4: Polish
- [ ] Native file picker (drag-and-drop from Finder/Explorer)
- [ ] System tray for background transcription
- [ ] Auto-updates via Tauri updater
- [ ] Code signing for macOS/Windows

---

## Dependencies Summary

| Component | Purpose | License |
|-----------|---------|---------|
| Tauri | App framework | MIT |
| React | Frontend UI | MIT |
| Unstructured | Document parsing | Apache 2.0 |
| SQLite | Local database | Public domain |
| whisper.cpp | Transcription (future) | MIT |
| Tesseract | OCR (via Unstructured) | Apache 2.0 |

All open source. No proprietary dependencies.
