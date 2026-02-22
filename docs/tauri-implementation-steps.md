# Tauri Migration: Step-by-Step Implementation

## Prerequisites

### 1. Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Choose option 1 (default installation)
# Restart terminal or run:
source $HOME/.cargo/env
```

### 2. Verify installations
```bash
rustc --version   # Should show 1.70+
cargo --version   # Should show 1.70+
node --version    # Should show 18+
npm --version     # Should show 9+
```

### 3. Install Tauri CLI
```bash
cargo install tauri-cli
```

---

## Phase 1: Project Scaffold

### Step 1.1: Initialize Vite + React project

```bash
cd /Users/marklehn/Desktop/GitHub/study
npm create vite@latest study-app -- --template react
cd study-app
npm install
```

### Step 1.2: Initialize Tauri

```bash
cd study-app
cargo tauri init
```

Answer the prompts:
- App name: `Study`
- Window title: `Study`
- Web assets path: `../dist`
- Dev server URL: `http://localhost:5173`
- Dev command: `npm run dev`
- Build command: `npm run build`

### Step 1.3: Install Tauri dependencies

```bash
npm install @tauri-apps/api
```

### Step 1.4: Update package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

### Step 1.5: Copy study.jsx and split into modules

Create these files from study.jsx:

**src/theme.js** (extract lines 2105-2132)
```javascript
export const T = {
  bg: "#0F1115",
  sf: "#1A1D24",
  bd: "#2A2F3A",
  ac: "#6C9CFC",
  acS: "rgba(108,156,252,0.12)",
  acB: "rgba(108,156,252,0.3)",
  tx: "#E8EAF0",
  txM: "#9CA3AF",
  txD: "#6B7280",
  gn: "#4ADE80",
  rd: "#F87171",
};
```

**src/db.js** (extract and adapt lines 78-180)
```javascript
// Temporary mock that matches current API
// Will be replaced with invoke() calls in Phase 2

const storage = {};

export const DB = {
  async get(k) {
    console.log('[DB.get]', k);
    return storage[k] || null;
  },
  async set(k, v) {
    console.log('[DB.set]', k);
    storage[k] = v;
    return true;
  },
  async del(k) {
    console.log('[DB.del]', k);
    delete storage[k];
    return true;
  },

  async getCourses() { return (await this.get("study-courses")) || []; },
  async saveCourses(c) { await this.set("study-courses", c); },

  async saveDoc(cid, did, d) { return await this.set("study-doc:" + cid + ":" + did, d); },
  async getDoc(cid, did) { return await this.get("study-doc:" + cid + ":" + did); },

  async saveChunkSkills(cid, chunkId, s) { await this.set("study-cskills:" + cid + ":" + chunkId, s); },
  async getChunkSkills(cid, chunkId) { return await this.get("study-cskills:" + cid + ":" + chunkId); },

  async saveSkills(cid, s) { await this.set("study-skills:" + cid, s); },
  async getSkills(cid) { return await this.get("study-skills:" + cid); },

  async saveRefTaxonomy(cid, t) { await this.set("study-reftax:" + cid, t); },
  async getRefTaxonomy(cid) { return await this.get("study-reftax:" + cid); },

  async saveValidation(cid, v) { await this.set("study-valid:" + cid, v); },
  async getValidation(cid) { return await this.get("study-valid:" + cid); },

  async saveAsgn(cid, a) { await this.set("study-asgn:" + cid, a); },
  async getAsgn(cid) { return await this.get("study-asgn:" + cid); },

  async saveProfile(cid, p) { await this.set("study-profile:" + cid, p); },
  async getProfile(cid) {
    return (await this.get("study-profile:" + cid)) || { skills: {}, sessions: 0 };
  },

  async saveChat(cid, m) { await this.set("study-chat:" + cid, m); },
  async getChat(cid) { return (await this.get("study-chat:" + cid)) || []; },

  async saveJournal(cid, j) { await this.set("study-journal:" + cid, j); },
  async getJournal(cid) { return (await this.get("study-journal:" + cid)) || []; },

  async deleteCourse(cid, materials = []) {
    for (const mat of materials) {
      if (mat.chunks) {
        for (const ch of mat.chunks) {
          await this.del("study-doc:" + cid + ":" + ch.id);
          await this.del("study-cskills:" + cid + ":" + ch.id);
        }
      }
      await this.del("study-doc:" + cid + ":" + mat.id);
    }
    await this.del("study-skills:" + cid);
    await this.del("study-reftax:" + cid);
    await this.del("study-valid:" + cid);
    await this.del("study-asgn:" + cid);
    await this.del("study-profile:" + cid);
    await this.del("study-chat:" + cid);
    await this.del("study-journal:" + cid);
  },

  async savePractice(cid, skillId, data) { await this.set("study-practice:" + cid + ":" + skillId, data); },
  async getPractice(cid, skillId) { return await this.get("study-practice:" + cid + ":" + skillId); },
};
```

**src/api.js** (extract lines 626-743)
```javascript
export const callClaude = async (system, messages, maxTokens) => {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 8192,
        system,
        messages,
      }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error("API " + r.status + ": " + errBody.substring(0, 200));
    }
    const d = await r.json();
    if (d.stop_reason === "max_tokens") {
      console.warn("Response truncated due to max_tokens limit");
    }
    return d.content?.[0]?.text || "";
  } catch (e) {
    console.error("Claude API:", e);
    return "Error: " + e.message;
  }
};

export const callClaudeStream = async (system, messages, onChunk, maxTokens) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    console.log("Starting API stream request...");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 16384,
        system,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!r.ok) {
      const errBody = await r.text();
      throw new Error("API " + r.status + ": " + errBody.substring(0, 200));
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    let stopReason = null;
    let chunkCount = 0;

    while (true) {
      const readPromise = reader.read();
      const chunkTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stream stalled")), 60000)
      );

      let result;
      try {
        result = await Promise.race([readPromise, chunkTimeout]);
      } catch (e) {
        console.warn("Stream timeout after", chunkCount, "chunks");
        if (full.length > 0) {
          return full + "\n\n[Response interrupted - please continue if needed]";
        }
        return "Error: " + e.message;
      }

      const { done, value } = result;
      if (done) {
        console.log("Stream ended. Chunks:", chunkCount, "Length:", full.length);
        break;
      }
      chunkCount++;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.substring(6).trim();
        if (data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            full += evt.delta.text;
            onChunk(full);
          }
          if (evt.type === "message_delta" && evt.delta?.stop_reason) {
            stopReason = evt.delta.stop_reason;
          }
          if (evt.type === "error") {
            throw new Error(evt.error?.message || "Stream error");
          }
        } catch (parseErr) {
          // Skip non-JSON
        }
      }
    }

    if (stopReason === "max_tokens") {
      return full + "\n\n[Response truncated due to length limit]";
    }
    return full || "No response.";
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      return "Error: Request timed out.";
    }
    console.error("Stream API:", e);
    return "Error: " + e.message;
  }
};

export const extractJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch {}
  const m1 = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1)
    try {
      return JSON.parse(m1[1].trim());
    } catch {}
  const m2 = text.match(/\[[\s\S]*\]/);
  if (m2)
    try {
      return JSON.parse(m2[0]);
    } catch {}
  const m3 = text.match(/\{[\s\S]*\}/);
  if (m3)
    try {
      return JSON.parse(m3[0]);
    } catch {}
  return null;
};
```

### Step 1.6: Update App.jsx

Create `src/App.jsx` with imports from modules:

```javascript
import React, { useState, useEffect, useRef, useCallback, Component } from "react";
import { DB } from "./db";
import { callClaude, callClaudeStream, extractJSON } from "./api";
import { T } from "./theme";

// [Paste rest of study.jsx starting from ErrorBoundary, but:]
// - Remove the DB object definition (now imported)
// - Remove callClaude/callClaudeStream/extractJSON (now imported)
// - Remove T definition (now imported)
// - Keep everything else as-is for now
```

### Step 1.7: Test scaffold

```bash
npm run tauri:dev
```

Verify:
- [ ] Window opens
- [ ] Home screen renders
- [ ] Can navigate to create screen
- [ ] Console shows DB mock calls

---

## Phase 2: SQLite Backend

### Step 2.1: Add Rust dependencies

Edit `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
```

### Step 2.2: Create database module

Create `src-tauri/src/db.rs`:

```rust
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            data_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS documents (
            course_id TEXT NOT NULL,
            chunk_id TEXT NOT NULL,
            content TEXT,
            PRIMARY KEY (course_id, chunk_id)
        );
        
        CREATE TABLE IF NOT EXISTS skills (
            course_id TEXT PRIMARY KEY,
            skills_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS chunk_skills (
            course_id TEXT NOT NULL,
            chunk_id TEXT NOT NULL,
            skills_json TEXT NOT NULL,
            PRIMARY KEY (course_id, chunk_id)
        );
        
        CREATE TABLE IF NOT EXISTS ref_taxonomy (
            course_id TEXT PRIMARY KEY,
            taxonomy_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS validation (
            course_id TEXT PRIMARY KEY,
            report_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS assignments (
            course_id TEXT PRIMARY KEY,
            asgn_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS profiles (
            course_id TEXT PRIMARY KEY,
            profile_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS chat (
            course_id TEXT PRIMARY KEY,
            messages_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS journal (
            course_id TEXT PRIMARY KEY,
            entries_json TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS practice (
            course_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            data_json TEXT NOT NULL,
            PRIMARY KEY (course_id, skill_id)
        );
    "#)?;
    Ok(())
}

// ========== Course Commands ==========

#[tauri::command]
pub fn db_get_courses(state: State<DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT data_json FROM courses")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([], |row| {
            let json: String = row.get(0)?;
            Ok(serde_json::from_str(&json).unwrap_or(serde_json::Value::Null))
        })
        .map_err(|e| e.to_string())?;
    
    let mut courses = Vec::new();
    for row in rows {
        if let Ok(course) = row {
            courses.push(course);
        }
    }
    Ok(courses)
}

#[tauri::command]
pub fn db_save_courses(state: State<DbState>, courses: Vec<serde_json::Value>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    // Delete all and reinsert (simple approach)
    conn.execute("DELETE FROM courses", []).map_err(|e| e.to_string())?;
    
    for course in courses {
        let id = course["id"].as_str().unwrap_or("");
        let name = course["name"].as_str().unwrap_or("");
        let created = course["created"].as_str().unwrap_or("");
        let json = serde_json::to_string(&course).map_err(|e| e.to_string())?;
        
        conn.execute(
            "INSERT INTO courses (id, name, created_at, data_json) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, created, json],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ========== Document Commands ==========

#[tauri::command]
pub fn db_get_doc(state: State<DbState>, course_id: String, chunk_id: String) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result: Result<String, _> = conn.query_row(
        "SELECT content FROM documents WHERE course_id = ?1 AND chunk_id = ?2",
        params![course_id, chunk_id],
        |row| row.get(0),
    );
    
    match result {
        Ok(content) => Ok(Some(serde_json::json!({ "content": content }))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_save_doc(state: State<DbState>, course_id: String, chunk_id: String, doc: serde_json::Value) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let content = doc["content"].as_str().unwrap_or("");
    
    conn.execute(
        "INSERT OR REPLACE INTO documents (course_id, chunk_id, content) VALUES (?1, ?2, ?3)",
        params![course_id, chunk_id, content],
    ).map_err(|e| e.to_string())?;
    
    Ok(true)
}

// ========== Skills Commands ==========

#[tauri::command]
pub fn db_get_skills(state: State<DbState>, course_id: String) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result: Result<String, _> = conn.query_row(
        "SELECT skills_json FROM skills WHERE course_id = ?1",
        params![course_id],
        |row| row.get(0),
    );
    
    match result {
        Ok(json) => Ok(serde_json::from_str(&json).ok()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_save_skills(state: State<DbState>, course_id: String, skills: serde_json::Value) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&skills).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO skills (course_id, skills_json) VALUES (?1, ?2)",
        params![course_id, json],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// [Similar pattern for all other tables...]
// db_get_chunk_skills, db_save_chunk_skills
// db_get_ref_taxonomy, db_save_ref_taxonomy
// db_get_validation, db_save_validation
// db_get_asgn, db_save_asgn
// db_get_profile, db_save_profile
// db_get_chat, db_save_chat
// db_get_journal, db_save_journal
// db_get_practice, db_save_practice
// db_delete_course
```

### Step 2.3: Register commands in main.rs

```rust
mod db;

use db::{DbState, init_db};
use rusqlite::Connection;
use std::sync::Mutex;

fn main() {
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("study")
        .join("study.db");
    
    std::fs::create_dir_all(db_path.parent().unwrap()).ok();
    
    let conn = Connection::open(&db_path).expect("Failed to open database");
    init_db(&conn).expect("Failed to initialize database");
    
    tauri::Builder::default()
        .manage(DbState(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![
            db::db_get_courses,
            db::db_save_courses,
            db::db_get_doc,
            db::db_save_doc,
            db::db_get_skills,
            db::db_save_skills,
            // ... all other commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 2.4: Update frontend DB layer

Replace `src/db.js` with invoke calls:

```javascript
import { invoke } from "@tauri-apps/api/core";

export const DB = {
  async getCourses() {
    try {
      return await invoke("db_get_courses");
    } catch (e) {
      console.error("db_get_courses error:", e);
      return [];
    }
  },
  
  async saveCourses(courses) {
    try {
      await invoke("db_save_courses", { courses });
    } catch (e) {
      console.error("db_save_courses error:", e);
    }
  },
  
  async getDoc(courseId, chunkId) {
    try {
      return await invoke("db_get_doc", { courseId, chunkId });
    } catch (e) {
      console.error("db_get_doc error:", e);
      return null;
    }
  },
  
  async saveDoc(courseId, chunkId, doc) {
    try {
      return await invoke("db_save_doc", { courseId, chunkId, doc });
    } catch (e) {
      console.error("db_save_doc error:", e);
      return false;
    }
  },
  
  // ... continue for all methods
};
```

### Step 2.5: Test SQLite

```bash
npm run tauri:dev
```

Verify:
- [ ] Create a course
- [ ] Close and reopen app
- [ ] Course persists
- [ ] Check ~/Library/Application Support/study/study.db exists

---

## Phase 3: Native Document Parsing

### Step 3.1: Add parsing dependencies

Edit `src-tauri/Cargo.toml`:

```toml
[dependencies]
# ... existing deps ...
zip = "0.6"           # For EPUB/DOCX
quick-xml = "0.31"    # For XML in DOCX
html2text = "0.6"     # For HTML in EPUB
```

### Step 3.2: Create parsing module

Create `src-tauri/src/parsing.rs`:

```rust
use std::io::Read;
use zip::ZipArchive;

#[derive(serde::Serialize)]
pub struct ParsedDocument {
    pub chunks: Vec<Chunk>,
    pub classification: String,
}

#[derive(serde::Serialize)]
pub struct Chunk {
    pub id: String,
    pub label: String,
    pub content: String,
    pub char_count: usize,
}

#[tauri::command]
pub fn parse_document(path: String) -> Result<ParsedDocument, String> {
    let extension = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    match extension.as_str() {
        "epub" => parse_epub(&path),
        "docx" => parse_docx(&path),
        "txt" | "md" => parse_text(&path),
        "pdf" => parse_pdf(&path),
        _ => Err(format!("Unsupported file type: {}", extension)),
    }
}

fn parse_epub(path: &str) -> Result<ParsedDocument, String> {
    // Implementation using zip crate
    // Extract chapters from EPUB structure
    todo!()
}

fn parse_docx(path: &str) -> Result<ParsedDocument, String> {
    // Implementation using zip + quick-xml
    // Extract text from word/document.xml
    todo!()
}

fn parse_text(path: &str) -> Result<ParsedDocument, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(ParsedDocument {
        chunks: vec![Chunk {
            id: "chunk-0".to_string(),
            label: std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("document")
                .to_string(),
            char_count: content.len(),
            content,
        }],
        classification: "notes".to_string(),
    })
}

fn parse_pdf(path: &str) -> Result<ParsedDocument, String> {
    // Use pdf-extract or call external tool
    todo!()
}
```

### Step 3.3: Update frontend to use native parsing

In `src/parsing.js`:

```javascript
import { invoke } from "@tauri-apps/api/core";
import { writeBinaryFile, BaseDirectory } from "@tauri-apps/api/fs";
import { join, tempDir } from "@tauri-apps/api/path";

export const parseDocument = async (file) => {
  // Save file to temp directory
  const tempPath = await tempDir();
  const filePath = await join(tempPath, file.name);
  
  const buffer = await file.arrayBuffer();
  await writeBinaryFile(filePath, new Uint8Array(buffer));
  
  // Call native parser
  const result = await invoke("parse_document", { path: filePath });
  
  return result;
};
```

---

## Verification Checklist

After each phase, verify these work:

### Phase 1
- [ ] `npm run tauri:dev` starts app
- [ ] All screens render correctly
- [ ] Console shows mock DB calls
- [ ] No React errors

### Phase 2  
- [ ] Course creation works
- [ ] Data persists after restart
- [ ] SQLite file exists at expected path
- [ ] All CRUD operations work

### Phase 3
- [ ] EPUB files parse correctly
- [ ] DOCX files parse correctly
- [ ] TXT/MD files parse correctly
- [ ] PDF files parse (new feature!)
- [ ] Classifications detected correctly

---

## Rollback Plan

If something breaks:

1. **Phase 1 issues:** Just use original study.jsx in artifact
2. **Phase 2 issues:** Revert to in-memory mock DB
3. **Phase 3 issues:** Keep browser-based parsing, disable native

Keep the artifact version working until Phase 2 is stable.
