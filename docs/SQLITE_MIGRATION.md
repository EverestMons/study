# SQLite Migration Plan for Study App

## Overview

Migrate from localStorage (key-value JSON blobs) to SQLite for:
- Unlimited storage (localStorage ~5-10MB limit)
- Proper indexing and queries
- Better performance with large datasets
- Portable data (lives in app data directory)

## Current Storage Schema (localStorage)

```
study-courses                    -> [{id, name, created, materials: [...]}]
study-doc:{cid}:{chunkId}        -> {content: string, ...}
study-cskills:{cid}:{chunkId}    -> [{skill objects}]
study-skills:{cid}               -> {merged skill tree}
study-reftax:{cid}               -> {reference taxonomy}
study-valid:{cid}                -> {validation data}
study-asgn:{cid}                 -> {assignment decomposition}
study-profile:{cid}              -> {skills: {}, sessions: number}
study-chat:{cid}                 -> [{role, content, ...}]
study-journal:{cid}              -> [{session entries}]
study-practice:{cid}:{skillId}   -> {practice set data}
```

## Proposed SQLite Schema

```sql
-- Core tables
CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created INTEGER NOT NULL,
    updated INTEGER
);

CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    classification TEXT,
    file_type TEXT,
    active INTEGER DEFAULT 1,
    created INTEGER NOT NULL
);

CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    label TEXT,
    content TEXT,  -- The actual document content
    char_count INTEGER,
    status TEXT DEFAULT 'pending',  -- pending, extracted, skipped, error
    error_info TEXT,  -- JSON blob for error details
    fail_count INTEGER DEFAULT 0
);

CREATE TABLE chunk_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    skill_data TEXT NOT NULL  -- JSON blob of extracted skills
);

-- Merged/computed data (still JSON blobs, but indexed by course)
CREATE TABLE course_data (
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,  -- 'skills', 'reftax', 'validation', 'assignment'
    data TEXT NOT NULL,  -- JSON blob
    updated INTEGER,
    PRIMARY KEY (course_id, data_type)
);

-- Student progress
CREATE TABLE profiles (
    course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    skills TEXT NOT NULL DEFAULT '{}',  -- JSON: {skillId: {points, ...}}
    sessions INTEGER DEFAULT 0,
    updated INTEGER
);

-- Chat history
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    metadata TEXT,  -- JSON for extra fields
    created INTEGER NOT NULL
);

CREATE INDEX idx_messages_course ON messages(course_id);

-- Session journal
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    entry_data TEXT NOT NULL,  -- JSON blob
    created INTEGER NOT NULL
);

CREATE INDEX idx_journal_course ON journal_entries(course_id);

-- Practice sets
CREATE TABLE practice_sets (
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    data TEXT NOT NULL,  -- JSON blob of practice set
    updated INTEGER,
    PRIMARY KEY (course_id, skill_id)
);

-- Indexes for common queries
CREATE INDEX idx_materials_course ON materials(course_id);
CREATE INDEX idx_chunks_material ON chunks(material_id);
CREATE INDEX idx_chunks_course ON chunks(course_id);
CREATE INDEX idx_chunk_skills_course ON chunk_skills(course_id);
```

## Implementation Steps

### Phase 1: Rust Backend (src-tauri)

1. **Add dependencies to Cargo.toml:**
```toml
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

2. **Update lib.rs:**
```rust
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:study.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

3. **Create migrations folder:**
   - `src-tauri/migrations/001_initial.sql` with schema above

4. **Update capabilities/default.json:**
```json
{
  "permissions": [
    "core:default",
    "shell:allow-open",
    "http:default",
    "sql:allow-load",
    "sql:allow-execute", 
    "sql:allow-select"
  ]
}
```

### Phase 2: Frontend DB Layer

Replace the `DB` object with Tauri SQL calls:

```javascript
import Database from '@tauri-apps/plugin-sql';

let db = null;

const initDB = async () => {
  if (!db) {
    db = await Database.load('sqlite:study.db');
  }
  return db;
};

const DB = {
  // Courses
  async getCourses() {
    const db = await initDB();
    const rows = await db.select('SELECT * FROM courses ORDER BY created DESC');
    // Also fetch materials for each course
    for (const course of rows) {
      course.materials = await db.select(
        'SELECT * FROM materials WHERE course_id = ?', 
        [course.id]
      );
      // Fetch chunks for each material
      for (const mat of course.materials) {
        mat.chunks = await db.select(
          'SELECT id, label, char_count, status, error_info, fail_count FROM chunks WHERE material_id = ?',
          [mat.id]
        );
      }
    }
    return rows;
  },

  async saveCourse(course) {
    const db = await initDB();
    await db.execute(
      'INSERT OR REPLACE INTO courses (id, name, created, updated) VALUES (?, ?, ?, ?)',
      [course.id, course.name, course.created, Date.now()]
    );
  },

  // Documents/Chunks
  async saveDoc(cid, chunkId, doc) {
    const db = await initDB();
    await db.execute(
      'UPDATE chunks SET content = ? WHERE id = ? AND course_id = ?',
      [doc.content || JSON.stringify(doc), chunkId, cid]
    );
  },

  async getDoc(cid, chunkId) {
    const db = await initDB();
    const rows = await db.select(
      'SELECT content FROM chunks WHERE id = ? AND course_id = ?',
      [chunkId, cid]
    );
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].content);
    } catch {
      return { content: rows[0].content };
    }
  },

  // Skills (course-level merged)
  async saveSkills(cid, skills) {
    const db = await initDB();
    await db.execute(
      `INSERT OR REPLACE INTO course_data (course_id, data_type, data, updated) 
       VALUES (?, 'skills', ?, ?)`,
      [cid, JSON.stringify(skills), Date.now()]
    );
  },

  async getSkills(cid) {
    const db = await initDB();
    const rows = await db.select(
      `SELECT data FROM course_data WHERE course_id = ? AND data_type = 'skills'`,
      [cid]
    );
    return rows.length > 0 ? JSON.parse(rows[0].data) : null;
  },

  // Chat messages
  async saveChat(cid, messages) {
    const db = await initDB();
    // Clear existing and insert all (simple approach)
    await db.execute('DELETE FROM messages WHERE course_id = ?', [cid]);
    for (const msg of messages) {
      await db.execute(
        'INSERT INTO messages (course_id, role, content, metadata, created) VALUES (?, ?, ?, ?, ?)',
        [cid, msg.role, msg.content, JSON.stringify(msg.metadata || {}), Date.now()]
      );
    }
  },

  async getChat(cid) {
    const db = await initDB();
    const rows = await db.select(
      'SELECT role, content, metadata FROM messages WHERE course_id = ? ORDER BY id',
      [cid]
    );
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      ...JSON.parse(r.metadata || '{}')
    }));
  },

  // ... similar pattern for other methods
};
```

### Phase 3: Migration Script

For existing users, create a one-time migration from localStorage to SQLite:

```javascript
const migrateFromLocalStorage = async () => {
  const migrated = localStorage.getItem('study-sqlite-migrated');
  if (migrated) return;

  const db = await initDB();
  
  // Migrate courses
  const coursesJson = localStorage.getItem('study-courses');
  if (coursesJson) {
    const courses = JSON.parse(coursesJson);
    for (const course of courses) {
      await DB.saveCourse(course);
      // Migrate materials and chunks...
      // Migrate related data...
    }
  }

  localStorage.setItem('study-sqlite-migrated', Date.now().toString());
};
```

## Rollout Strategy

1. **Dev branch**: Implement SQLite alongside localStorage
2. **Feature flag**: Allow toggling between backends for testing
3. **Migration**: Auto-migrate on first launch with SQLite enabled
4. **Cleanup**: Remove localStorage code after stable release

## Benefits After Migration

- **No size limits**: Can store full textbooks, lecture transcripts
- **Faster queries**: Index lookups instead of loading everything
- **Atomic transactions**: No partial writes on crash
- **Better debugging**: Can inspect DB with SQLite tools
- **Export/backup**: Single file to backup all data

## Estimated Effort

- Phase 1 (Rust setup): 1-2 hours
- Phase 2 (Frontend rewrite): 3-4 hours
- Phase 3 (Migration): 1-2 hours
- Testing: 2-3 hours

**Total: ~8-12 hours**

## Alternative: Keep Hybrid

Could also keep localStorage for small/fast data (settings, UI state) and only use SQLite for large content (documents, chat history). This reduces migration complexity but adds maintenance burden.
