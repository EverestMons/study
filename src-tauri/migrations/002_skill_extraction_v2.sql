-- 002_skill_extraction_v2.sql
-- Adds columns and tables for the v2 skill extraction pipeline.
-- Depends on: 001_v2_schema.sql
-- Date: March 2, 2026
-- Spec reference: docs/skill-extraction-v2-spec.md, Sections 2 + 15

-- ============================================================
-- sub_skills — new columns for rich extraction data
-- ============================================================

-- Missing from 001: updated_at for sync readiness and updateFromReextraction()
ALTER TABLE sub_skills ADD COLUMN updated_at INTEGER;

-- Identity & classification
ALTER TABLE sub_skills ADD COLUMN concept_key TEXT;
ALTER TABLE sub_skills ADD COLUMN category TEXT;
ALTER TABLE sub_skills ADD COLUMN blooms_level TEXT;

-- Rich content (JSON blobs)
ALTER TABLE sub_skills ADD COLUMN mastery_criteria TEXT;    -- JSON array of {text, source, addedAt}
ALTER TABLE sub_skills ADD COLUMN evidence TEXT;            -- JSON object {anchorTerms, definitionsFound, ...}
ALTER TABLE sub_skills ADD COLUMN fitness TEXT DEFAULT '{}'; -- JSON object {practiceAttempts, ...}

-- Extraction metadata
ALTER TABLE sub_skills ADD COLUMN extraction_model TEXT;
ALTER TABLE sub_skills ADD COLUMN schema_version INTEGER DEFAULT 2;
ALTER TABLE sub_skills ADD COLUMN merged_from TEXT;         -- JSON array of absorbed skill IDs

-- Lifecycle
ALTER TABLE sub_skills ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE sub_skills ADD COLUMN uuid TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_sub_skills_concept ON sub_skills(concept_key);
CREATE INDEX IF NOT EXISTS idx_sub_skills_category ON sub_skills(category);
CREATE INDEX IF NOT EXISTS idx_sub_skills_blooms ON sub_skills(blooms_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_skills_uuid ON sub_skills(uuid);

-- ============================================================
-- courses — soft-delete support
-- ============================================================

ALTER TABLE courses ADD COLUMN is_archived INTEGER DEFAULT 0;

-- ============================================================
-- chunk_skill_bindings — sync timestamp + relax NOT NULL on extraction_context
-- ============================================================

ALTER TABLE chunk_skill_bindings ADD COLUMN updated_at INTEGER;

-- 001 schema has extraction_context as NOT NULL, but enrichment fallback
-- bindings and broad document-level bindings don't have section-level context.
-- SQLite can't ALTER COLUMN, so we recreate the table.

CREATE TABLE chunk_skill_bindings_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id            TEXT NOT NULL,
    sub_skill_id        INTEGER NOT NULL,
    extraction_context  TEXT,  -- nullable now: NULL means document-level binding
    confidence          REAL,
    extracted_at        INTEGER NOT NULL,
    updated_at          INTEGER,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

INSERT INTO chunk_skill_bindings_new (id, chunk_id, sub_skill_id, extraction_context, confidence, extracted_at)
    SELECT id, chunk_id, sub_skill_id, extraction_context, confidence, extracted_at
    FROM chunk_skill_bindings;

DROP TABLE chunk_skill_bindings;
ALTER TABLE chunk_skill_bindings_new RENAME TO chunk_skill_bindings;

CREATE INDEX IF NOT EXISTS idx_bindings_chunk ON chunk_skill_bindings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_bindings_skill ON chunk_skill_bindings(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_bindings_context ON chunk_skill_bindings(extraction_context);

-- ============================================================
-- skill_prerequisites — directed prerequisite graph
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_prerequisites (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id       INTEGER NOT NULL,  -- the skill that has the prerequisite
    prerequisite_id    INTEGER NOT NULL,  -- the skill that must be learned first
    source             TEXT NOT NULL,     -- 'within_chapter' | 'cross_chapter'
    created_at         INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_id != prerequisite_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prereq_pair ON skill_prerequisites(sub_skill_id, prerequisite_id);
CREATE INDEX IF NOT EXISTS idx_prereq_skill ON skill_prerequisites(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_prereq_dep ON skill_prerequisites(prerequisite_id);

-- ============================================================
-- sub_skill_mastery — change CASCADE to RESTRICT
-- ============================================================
-- Prevents accidental deletion of mastery data when sub_skills are hard-deleted.
-- With RESTRICT, any attempt to DELETE a sub_skill that has mastery data will fail,
-- forcing the use of is_archived = 1 (soft-delete) instead.

CREATE TABLE sub_skill_mastery_new (
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
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE RESTRICT
);

INSERT INTO sub_skill_mastery_new SELECT * FROM sub_skill_mastery;
DROP TABLE sub_skill_mastery;
ALTER TABLE sub_skill_mastery_new RENAME TO sub_skill_mastery;

CREATE INDEX IF NOT EXISTS idx_mastery_skill ON sub_skill_mastery(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON sub_skill_mastery(next_review_at);
