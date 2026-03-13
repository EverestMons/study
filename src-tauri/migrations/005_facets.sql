-- Migration 005: Facet Architecture
-- Promotes mastery_criteria from JSON strings on sub_skills into first-class
-- trackable entities (facets) with own FSRS schedules, typed chunk bindings,
-- cross-domain concept links, and assignment question mappings.
--
-- Data migration: existing sub_skills → facets promotion handled in JS layer
-- because SQLite lacks JSON_EACH in the Tauri plugin's bundled version.
-- This migration creates the schema only; JS migration populates data on first boot.

-- ============================================================
-- 1. facets — atomic trackable learning units under sub_skills
-- ============================================================

CREATE TABLE IF NOT EXISTS facets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id         INTEGER NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    concept_key      TEXT,
    skill_type       TEXT,
    blooms_level     TEXT,
    mastery_criteria TEXT,
    evidence         TEXT,
    is_archived      INTEGER DEFAULT 0,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER,
    FOREIGN KEY (skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facets_skill ON facets(skill_id);
CREATE INDEX IF NOT EXISTS idx_facets_concept ON facets(concept_key);
CREATE INDEX IF NOT EXISTS idx_facets_type ON facets(skill_type);

-- ============================================================
-- 2. facet_mastery — FSRS state per facet
-- ============================================================

CREATE TABLE IF NOT EXISTS facet_mastery (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    facet_id             INTEGER NOT NULL UNIQUE,
    difficulty           REAL NOT NULL DEFAULT 0.3,
    stability            REAL NOT NULL DEFAULT 1.0,
    retrievability       REAL NOT NULL DEFAULT 1.0,
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    last_review_at       INTEGER,
    next_review_at       INTEGER,
    last_rating          TEXT,
    total_mastery_points REAL NOT NULL DEFAULT 0.0,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_facet_mastery_facet ON facet_mastery(facet_id);
CREATE INDEX IF NOT EXISTS idx_facet_mastery_next_review ON facet_mastery(next_review_at);

-- ============================================================
-- 3. chunk_facet_bindings — typed, ranked chunk-to-facet relationships
-- ============================================================

CREATE TABLE IF NOT EXISTS chunk_facet_bindings (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id               TEXT NOT NULL,
    facet_id               INTEGER NOT NULL,
    extraction_context     TEXT,
    confidence             REAL,
    binding_type           TEXT DEFAULT 'teaches',
    quality_rank           INTEGER DEFAULT 0,
    content_range          TEXT,
    teaching_effectiveness REAL,
    extracted_at           INTEGER NOT NULL,
    updated_at             INTEGER,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cfb_chunk ON chunk_facet_bindings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_cfb_facet ON chunk_facet_bindings(facet_id);
CREATE INDEX IF NOT EXISTS idx_cfb_type ON chunk_facet_bindings(binding_type);
CREATE INDEX IF NOT EXISTS idx_cfb_quality ON chunk_facet_bindings(facet_id, quality_rank);

-- ============================================================
-- 4. facet_concept_links — cross-domain relationships between facets
-- ============================================================

CREATE TABLE IF NOT EXISTS facet_concept_links (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    facet_a_id       INTEGER NOT NULL,
    facet_b_id       INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    link_type        TEXT NOT NULL,
    reason           TEXT,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (facet_a_id) REFERENCES facets(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_b_id) REFERENCES facets(id) ON DELETE CASCADE,
    CHECK (facet_a_id < facet_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facet_link_pair
    ON facet_concept_links(facet_a_id, facet_b_id, link_type);

-- ============================================================
-- 5. assignment_question_facets — maps questions to facets
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_question_facets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    facet_id    INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aqf_question ON assignment_question_facets(question_id);
CREATE INDEX IF NOT EXISTS idx_aqf_facet ON assignment_question_facets(facet_id);

-- ============================================================
-- 6. Track whether JS data migration has run
-- ============================================================

INSERT OR IGNORE INTO settings (key, value) VALUES ('facet_migration_done', '0');
