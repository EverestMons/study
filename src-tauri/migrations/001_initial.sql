-- Study App SQLite Schema v1

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created INTEGER NOT NULL,
    updated INTEGER
);

-- Materials within a course
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    label TEXT NOT NULL,
    classification TEXT,
    file_type TEXT,
    active INTEGER DEFAULT 1,
    created INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Chunks (sections of materials)
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    label TEXT,
    content TEXT,
    char_count INTEGER,
    status TEXT DEFAULT 'pending',
    error_info TEXT,
    fail_count INTEGER DEFAULT 0,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Skills extracted from chunks
CREATE TABLE IF NOT EXISTS chunk_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    skill_data TEXT NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Course-level data (skills tree, taxonomy, validation, assignments)
CREATE TABLE IF NOT EXISTS course_data (
    course_id TEXT NOT NULL,
    data_type TEXT NOT NULL,
    data TEXT NOT NULL,
    updated INTEGER,
    PRIMARY KEY (course_id, data_type),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Student profiles/progress
CREATE TABLE IF NOT EXISTS profiles (
    course_id TEXT PRIMARY KEY,
    skills TEXT NOT NULL DEFAULT '{}',
    sessions INTEGER DEFAULT 0,
    updated INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Journal entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    entry_data TEXT NOT NULL,
    created INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Practice sets
CREATE TABLE IF NOT EXISTS practice_sets (
    course_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated INTEGER,
    PRIMARY KEY (course_id, skill_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_material ON chunks(material_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course ON chunks(course_id);
CREATE INDEX IF NOT EXISTS idx_chunk_skills_course ON chunk_skills(course_id);
CREATE INDEX IF NOT EXISTS idx_messages_course ON messages(course_id);
CREATE INDEX IF NOT EXISTS idx_journal_course ON journal_entries(course_id);
