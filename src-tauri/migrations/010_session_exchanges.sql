-- Migration 010: Session Exchange Logging
-- Per-facet exchange records for tutor session analysis.
-- Tracks which facet was practiced, chunk context, and mastery delta per exchange.

CREATE TABLE IF NOT EXISTS session_exchanges (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL,
    facet_id            INTEGER NOT NULL,
    practice_tier       INTEGER,
    chunk_ids_used      TEXT,
    mastery_before      REAL,
    mastery_after       REAL,
    rating              TEXT NOT NULL,
    exchange_timestamp  INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_se_session ON session_exchanges(session_id);
CREATE INDEX IF NOT EXISTS idx_se_facet ON session_exchanges(facet_id);
CREATE INDEX IF NOT EXISTS idx_se_timestamp ON session_exchanges(exchange_timestamp);
