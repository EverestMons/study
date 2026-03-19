-- Migration 007: Material Images catalog
-- Stores metadata for images extracted from course materials (slides, PDF pages, DOCX figures).
-- Actual image files stored on filesystem at $APPDATA/images/{material_id}/

CREATE TABLE IF NOT EXISTS material_images (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    image_type TEXT NOT NULL,
    page_or_slide_number INTEGER,
    caption TEXT,
    file_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    chunk_id TEXT,
    file_size_bytes INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

CREATE INDEX IF NOT EXISTS idx_material_images_material
    ON material_images(material_id);
CREATE INDEX IF NOT EXISTS idx_material_images_course
    ON material_images(course_id);
CREATE INDEX IF NOT EXISTS idx_material_images_chunk
    ON material_images(chunk_id);
