-- Study App SQLite Schema v2
-- Full redesign: intent-based sessions, two-tier skills (parent + sub),
-- chunk-anchored extraction, FSRS mastery tracking.
--
-- This replaces v1 entirely. See docs/v1-schema-archive.md for previous schema.
-- Date: March 1, 2026

PRAGMA foreign_keys = ON;

-- ============================================================
-- Settings (carried forward from v1)
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================
-- Parent Skills — CIP-seeded skill domains (the RPG character sheet)
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_skills (
    id          TEXT PRIMARY KEY,
    cip_code    TEXT,
    name        TEXT NOT NULL,
    description TEXT,
    embedding   BLOB,
    is_custom   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_parent_skills_cip ON parent_skills(cip_code);

-- ============================================================
-- Parent Skill Aliases — prevents fragmentation ("Calc" -> Calculus)
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_skill_aliases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_skill_id TEXT NOT NULL,
    alias           TEXT NOT NULL,
    FOREIGN KEY (parent_skill_id) REFERENCES parent_skills(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_unique ON parent_skill_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_alias_parent ON parent_skill_aliases(parent_skill_id);

-- ============================================================
-- Courses
-- ============================================================

CREATE TABLE IF NOT EXISTS courses (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    course_number   TEXT,
    instructor      TEXT,
    semester        TEXT,
    credits         INTEGER,
    description     TEXT,
    syllabus_parsed INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER
);

-- ============================================================
-- Course Schedule — week-by-week from syllabus parsing
-- ============================================================

CREATE TABLE IF NOT EXISTS course_schedule (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       TEXT NOT NULL,
    week_number     INTEGER,
    start_date      INTEGER,
    end_date        INTEGER,
    topics          TEXT NOT NULL,
    readings        TEXT,
    assignments_due TEXT,
    exams           TEXT,
    parser_confidence TEXT DEFAULT 'medium',
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_course ON course_schedule(course_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dates ON course_schedule(start_date, end_date);

-- ============================================================
-- Course Assessments — grading breakdown from syllabus
-- ============================================================

CREATE TABLE IF NOT EXISTS course_assessments (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id TEXT NOT NULL,
    category  TEXT NOT NULL,
    weight    REAL NOT NULL,
    count     INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assessments_course ON course_assessments(course_id);

-- ============================================================
-- Materials — uploaded files within a course
-- ============================================================

CREATE TABLE IF NOT EXISTS materials (
    id                TEXT PRIMARY KEY,
    course_id         TEXT NOT NULL,
    label             TEXT NOT NULL,
    classification    TEXT,
    file_type         TEXT,
    file_path         TEXT,
    original_filename TEXT,
    active            INTEGER DEFAULT 1,
    parser_output     TEXT,
    parser_confidence TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_classification ON materials(classification);

-- ============================================================
-- Chunks — full-fidelity content sections with structural metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS chunks (
    id                  TEXT PRIMARY KEY,
    material_id         TEXT NOT NULL,
    course_id           TEXT NOT NULL,
    label               TEXT,
    content             TEXT,
    content_hash        TEXT NOT NULL,
    char_count          INTEGER,
    source_format       TEXT,
    heading_level       INTEGER,
    section_path        TEXT,
    structural_metadata TEXT,
    fidelity            TEXT DEFAULT 'full',
    page_start          INTEGER,
    page_end            INTEGER,
    ordering            INTEGER,
    status              TEXT DEFAULT 'pending',
    error_info          TEXT,
    fail_count          INTEGER DEFAULT 0,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_material ON chunks(material_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course ON chunks(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(section_path);

-- ============================================================
-- Chunk Media — images/figures associated with chunks
-- ============================================================

CREATE TABLE IF NOT EXISTS chunk_media (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id         TEXT NOT NULL,
    media_hash       TEXT NOT NULL,
    media_type       TEXT NOT NULL,
    size_bytes       INTEGER NOT NULL,
    width            INTEGER,
    height           INTEGER,
    storage_type     TEXT NOT NULL,
    storage_source   TEXT NOT NULL DEFAULT 'native',
    inline_blob      BLOB,
    external_path    TEXT,
    caption          TEXT,
    alt_text         TEXT,
    position_context TEXT,
    page_number      INTEGER,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunk_media_chunk ON chunk_media(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_media_hash ON chunk_media(media_hash);

-- ============================================================
-- Chunk Fingerprints — MinHash signatures for near-duplicate detection
-- ============================================================

CREATE TABLE IF NOT EXISTS chunk_fingerprints (
    chunk_id      TEXT PRIMARY KEY,
    minhash_sig   BLOB NOT NULL,
    shingle_count INTEGER,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- ============================================================
-- Sub-Skills — granular skills extracted from chunks
-- ============================================================

CREATE TABLE IF NOT EXISTS sub_skills (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_skill_id  TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    skill_type       TEXT,
    embedding        BLOB,
    source_course_id TEXT,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (parent_skill_id) REFERENCES parent_skills(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_course_id) REFERENCES courses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_skills_parent ON sub_skills(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_sub_skills_course ON sub_skills(source_course_id);
CREATE INDEX IF NOT EXISTS idx_sub_skills_type ON sub_skills(skill_type);

-- ============================================================
-- Chunk-Skill Bindings — extraction event records
-- ============================================================

CREATE TABLE IF NOT EXISTS chunk_skill_bindings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id            TEXT NOT NULL,
    sub_skill_id        INTEGER NOT NULL,
    extraction_context  TEXT NOT NULL,
    confidence          REAL,
    extracted_at        INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bindings_chunk ON chunk_skill_bindings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_bindings_skill ON chunk_skill_bindings(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_bindings_context ON chunk_skill_bindings(extraction_context);

-- ============================================================
-- Sub-Skill Mastery — full FSRS state per sub-skill
-- ============================================================

CREATE TABLE IF NOT EXISTS sub_skill_mastery (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id         INTEGER NOT NULL UNIQUE,
    difficulty           REAL NOT NULL DEFAULT 0.3,
    stability            REAL NOT NULL DEFAULT 1.0,
    retrievability       REAL NOT NULL DEFAULT 1.0,
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    last_review_at       INTEGER,
    next_review_at       INTEGER,
    total_mastery_points REAL NOT NULL DEFAULT 0.0,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mastery_skill ON sub_skill_mastery(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON sub_skill_mastery(next_review_at);

-- ============================================================
-- Concept Links — cross-sub-skill similarity
-- ============================================================

CREATE TABLE IF NOT EXISTS concept_links (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_a_id   INTEGER NOT NULL,
    sub_skill_b_id   INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    link_type        TEXT NOT NULL,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_a_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_b_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_a_id < sub_skill_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_link_pair ON concept_links(sub_skill_a_id, sub_skill_b_id, link_type);

-- ============================================================
-- Sessions — intent-based learning sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL,
    intent     TEXT NOT NULL,
    scope      TEXT,
    status     TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    ended_at   INTEGER,
    summary    TEXT,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_intent ON sessions(intent);

-- ============================================================
-- Session Skills — active skill set per session
-- ============================================================

CREATE TABLE IF NOT EXISTS session_skills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    sub_skill_id INTEGER NOT NULL,
    is_target    INTEGER NOT NULL DEFAULT 1,
    pre_mastery  REAL,
    post_mastery REAL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_skills_session ON session_skills(session_id);
CREATE INDEX IF NOT EXISTS idx_session_skills_skill ON session_skills(sub_skill_id);

-- ============================================================
-- Session Events — mastery events within a session
-- ============================================================

CREATE TABLE IF NOT EXISTS session_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    sub_skill_id INTEGER NOT NULL,
    event_type   TEXT NOT NULL,
    score        REAL,
    intent_weight REAL NOT NULL,
    context      TEXT,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_skill ON session_events(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(event_type);

-- ============================================================
-- Messages — chat messages scoped to sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    input_mode TEXT,
    metadata   TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- ============================================================
-- Journal Entries — session learning journals
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       TEXT NOT NULL,
    course_id        TEXT NOT NULL,
    intent           TEXT NOT NULL,
    entry_data       TEXT NOT NULL,
    skills_practiced TEXT,
    mastery_changes  TEXT,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_session ON journal_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_journal_course ON journal_entries(course_id);

-- ============================================================
-- Practice Sets — practice mode state per sub-skill
-- ============================================================

CREATE TABLE IF NOT EXISTS practice_sets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id INTEGER NOT NULL,
    session_id   TEXT,
    data         TEXT NOT NULL,
    updated_at   INTEGER,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_sets_skill_session
    ON practice_sets(sub_skill_id, COALESCE(session_id, ''));
