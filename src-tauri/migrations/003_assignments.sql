-- ============================================================
-- Migration 003: Assignment Tables
-- Depends on: 001_v2_schema.sql, 002_skill_extraction_v2.sql
-- Date: March 2026
-- Spec: docs/planning/assignment-scheduler-spec.md — Phase 1
-- ============================================================

-- ============================================================
-- Assignments — decomposed from uploaded assignment materials
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
    id          TEXT PRIMARY KEY,                -- UUID
    course_id   TEXT NOT NULL,
    material_id TEXT,                            -- links to uploaded assignment material (NULL for manual/syllabus placeholders)
    title       TEXT NOT NULL,
    title_normalized TEXT,                       -- lowercase, prefix-stripped, for placeholder matching
    due_date    INTEGER,                         -- Unix epoch seconds, NULL if unknown
    status      TEXT NOT NULL DEFAULT 'active',  -- active | submitted | graded
    source      TEXT NOT NULL DEFAULT 'decomposition', -- decomposition | syllabus | manual
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_material ON assignments(material_id);
CREATE INDEX IF NOT EXISTS idx_assignments_title_norm ON assignments(course_id, title_normalized);

-- ============================================================
-- Assignment Questions — individual items within an assignment
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id   TEXT NOT NULL,
    question_ref    TEXT NOT NULL,               -- "q1", "q2a" — matches LLM decomposition IDs
    description     TEXT,
    difficulty      TEXT,                        -- foundational | intermediate | advanced
    ordering        INTEGER,                    -- display order
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aq_assignment ON assignment_questions(assignment_id);

-- ============================================================
-- Assignment Question Skills — maps questions to required sub_skills
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_question_skills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id     INTEGER NOT NULL,
    sub_skill_id    INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aqs_question ON assignment_question_skills(question_id);
CREATE INDEX IF NOT EXISTS idx_aqs_skill ON assignment_question_skills(sub_skill_id);
