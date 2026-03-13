ALTER TABLE assignments ADD COLUMN study_active INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_assignments_study_active
    ON assignments(course_id, study_active) WHERE study_active = 1;
