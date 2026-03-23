-- Persistent MinHash similarity pairs (above 0.5 threshold)
CREATE TABLE IF NOT EXISTS chunk_similarities (
    chunk_a_id TEXT NOT NULL,
    chunk_b_id TEXT NOT NULL,
    similarity REAL NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(chunk_a_id, chunk_b_id),
    FOREIGN KEY (chunk_a_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (chunk_b_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunk_sim_a ON chunk_similarities(chunk_a_id);
CREATE INDEX IF NOT EXISTS idx_chunk_sim_b ON chunk_similarities(chunk_b_id);

-- Chunk-level prerequisite ordering
CREATE TABLE IF NOT EXISTS chunk_prerequisites (
    chunk_id TEXT NOT NULL,
    prerequisite_chunk_id TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(chunk_id, prerequisite_chunk_id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunk_prereq_chunk ON chunk_prerequisites(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_prereq_prereq ON chunk_prerequisites(prerequisite_chunk_id);
