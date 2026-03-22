-- Migration 008: Cross-Course Skill Unification
-- Adds skill_courses junction table for many-to-many skill↔course mapping
-- and unified_into column on sub_skills for merge tracking.
-- Date: March 22, 2026

-- 1. Junction table: skills ↔ courses (many-to-many)
CREATE TABLE IF NOT EXISTS skill_courses (
    skill_id  INTEGER NOT NULL REFERENCES sub_skills(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(skill_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_courses_skill ON skill_courses(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_courses_course ON skill_courses(course_id);

-- 2. Soft-delete tracking for absorbed skills
-- When a skill is absorbed into another via unification, this points to the survivor.
-- NULL means the skill is independent (not absorbed).
ALTER TABLE sub_skills ADD COLUMN unified_into INTEGER REFERENCES sub_skills(id);
