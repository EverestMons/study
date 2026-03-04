# Skill Architecture Redesign — Design Reference

**Date:** February 26, 2026  
**Status:** Design phase — no code written yet  
**Context:** Rethinking how skills are defined, extracted, stored, and surfaced in Study

---

## Problem Statement

The current skill extraction pipeline is a black box: LLM generates a reference taxonomy → LLM extracts skills against it → LLM validates its own output. There are no deterministic checks, no user confirmation steps, and no way to verify skills aren't incorrectly classified, incomplete, or overlapping. The entire chain shares the same blind spots.

### Specific issues with current approach:
- Reference taxonomy is generated from course name alone (hallucination scaffold)
- Skill granularity is undefined — "be GRANULAR" is the only instruction
- Merge pass does too much in one LLM call (dedup, renumber, rewire, cross-link)
- Validation is LLM-based, so it shares extraction's blind spots
- No human-in-the-loop for skill review
- Skills exist only within a course — no cross-course persistence or user-level progression

---

## Core Architectural Shifts

### 1. Skills are user-level entities, not course-level

Skills belong to the **user**, not to a course. A course is one source that feeds skills into a user's master profile. "Calculus" learned across Calc I and Physics II is the same parent skill, and the user's proficiency reflects both contexts.

**Parent skills** are general domains — the thing you'd put on a character sheet. Slightly more specific than a video game skill tree, roughly at the course-subject level:
- Calculus (Level 7)
- Microeconomics (Level 4)  
- Organic Chemistry (Level 2)
- Academic Writing (Level 12)

Target: ~15-30 active parent skills for a typical student at any time.

**Sub-skills** are the granular, course-extracted skills that feed into parent levels. Sub-skills are course-specific and context-specific. They don't need to unify across courses — they just need to map to the same parent skill.

**Parent skill source:** Curated-but-extensible list. Seed with common academic domains, system suggests mappings when a course is added, users can create new ones if nothing fits.

**Level computation:** Function of total sub-skill mastery within that domain. RPG-style curve where early levels come fast, later levels require increasingly more depth (e.g., `level = floor(sqrt(total_weighted_mastery_points))`).

**Decay:** Mastery percentage decays over time per spaced repetition principles, but only activates when a skill is relevant to an active course or intent. Archived skills maintain last-known level until the user re-enters a context where they matter. Avoids the demoralizing "everything is dropping" problem.

### 2. Chunks are the durable storage unit

Chunks are the long-term knowledge store. Skills are generated on-demand from chunks, not pre-computed for all possible intents.

**Why:** A student might upload Chapter 5 for homework help in September, then want a general review of it in February. The chunks are still there; the system extracts a fresh skill set scoped to the new intent at that moment. No stale master set of pre-computed skills sitting around.

**Chunk requirements:**
- Content-hashed for deduplication (exact hash + similarity check for near-matches)
- Course-tagged but retrievable independently after course archival
- Searchable metadata: chapter title, source document, subject tags, brief summary
- **Full fidelity storage** — text content, image blobs (or filesystem paths), captions/alt text, positional context ("image X appears after paragraph Y"), structural metadata (heading level, section hierarchy)
- Nothing lost from the original material — a chunk is a faithful representation, not a lossy text extraction

**Image storage note:** Images significantly increase storage size (50KB text vs 5MB images per chapter). Decision needed: SQLite blobs vs filesystem with database references. Filesystem + DB paths is more conventional at this scale.

### 3. Chunk ↔ Skill binding is persistent and bidirectional

Every extraction creates a permanent record linking chunks to the skills extracted from them.

**Schema concept:**
```
chunk_skills
  chunk_id            TEXT
  skill_name          TEXT
  skill_description   TEXT
  extraction_context  TEXT  -- "homework-3", "general-review", "midterm-prep"
  extracted_at        TEXT
  parent_skill        TEXT  -- which parent domain this mapped to
```

**What this enables:**
- When a user revisits a chunk, prior extraction history is visible as a starting point
- Skill identity is anchored to (chunk_id, parent_skill, context) not to unstable skill names — same chunk + same parent = same skill regardless of name variation
- Cross-course skill unification: if Calculus Ch.3 and Physics Ch.5 both produce skills under parent "Calculus" from similar content, evidence of overlap exists
- Consistent sub-skill names emerge over time (same chunk repeatedly producing "Power Rule Application" = high-confidence identity)

### 4. Sessions replace the open-ended chat model

Every learning session starts with structured intent declaration. The user never manually manages skills — they answer "what are you here to do" and the system handles scoping.

**Three questions at session start:**

**Q1 — Course context:** Which course? (picker from existing courses, or "new course")

**Q2 — Intent:** What are you trying to do? (structured choices, not freeform)
- Complete an assignment
- Prepare for an exam
- Learn new material
- Review / refresh past material
- Just explore a topic

**Q3 — Scope:** Adapts based on Q2:
- Complete assignment → which assignment? (picker or upload)
- Prepare for exam → which chapters/assignments are covered? (multi-select from course chunks, or date range if syllabus is parsed)
- Learn new material → which material? (picker from chunks, or upload)
- Review → system suggests skills with decayed mastery, user confirms
- Explore → freeform topic entry

**Intent determines:**
- Which chunks are loaded as context
- Which skills are active for the session
- What teaching strategy the AI uses
- How mastery is assessed (assignment completion ≠ review questions ≠ concept explanation)

**What this deprecates:**
- Current model of entering a course and just chatting
- "Activate/deactivate materials" model
- Pre-computed skill sets for all intents

### 5. Deterministic parsing before any LLM call

Code handles structure, counts, constraints, and sanity checks. LLM handles domain knowledge, prerequisite reasoning, and description quality. Neither does the other's job.

**What code can extract without an LLM:**

**Assignment decomposition:**
- Numbered items, lettered sub-parts, question marks after prompts
- Output: "12 questions, 3 with sub-parts, 18 discrete items"
- Each item becomes a skill anchor
- LLM job shrinks to: "what prerequisite knowledge does question 3b require"

**Chapter structure extraction:**
- Headings, subheadings, bold terms, definition blocks, example blocks, image count
- Output: "4 sections, 12 subsections, 23 bolded terms, 8 worked examples, 3 diagrams"
- Subsection headings = candidate skill names
- Bolded terms = candidate concepts
- Image-heavy sections signal conceptual/visual content; equation-heavy = procedural
- LLM job: validate candidates, wire prerequisites, not discovery

**Syllabus schedule parsing:**
- Week numbers, topic lists, reading assignments, due dates
- Pattern matching extracts: "Week 7: Thermodynamics (Ch. 5-6), HW 4 due"
- Code builds the course skeleton; LLM fills gaps

**Skill type classification from question format:**
- Multiple choice → recognition/recall skill
- "Solve for X" → procedural skill
- "Explain why" → conceptual/analytical skill
- "Design a..." → synthesis skill
- Classifiable with regex and keyword matching

**Coded post-processing (replaces LLM validation for structural checks):**
- Circular dependency detection
- Duplicate name checking
- Prerequisite count limits (flag skill with 15 prerequisites)
- Skill-to-chunk ratio sanity checks
- Orphaned skill detection
- Skill count within target range for intent

**Graceful fallback:** If deterministic parsing produces a rich structural profile, LLM gets tightly constrained. If document has poor structure (scanned PDF, unformatted notes), LLM gets more latitude but the user gets an extra question ("this document didn't have clear structure — can you tell me roughly how many topics it covers?"). Never silently lose what the user thinks was processed.

### 6. Revised extraction flow

```
1. User uploads material(s)
2. Deterministic parsing → structural profile + candidate skills
3. Content hashing → dedup check against existing chunks
4. Store chunks with full fidelity (text, images, captions, structure)
5. Session intent questions (course, intent, scope)
6. Intent → scoping constraints (target skill count, granularity, skill types)
7. LLM call → validate structural candidates, wire prerequisites, map to parent skills
8. Coded post-processing → enforce constraints, catch structural anomalies
9. Chunk-skill bindings saved to persistent store
10. Session begins with scoped skill set
```

---

## Storage Schema (Conceptual)

### Durable / permanent:
- **chunks** — content-hashed, full fidelity (text + images + structure), course-tagged but independently retrievable
- **chunk_skills** — every extraction recorded: chunk_id, skill info, context, parent skill mapping, timestamp
- **skill_mastery** — user-level: parent_skill + level + last_updated
- **sub_skill_history** — permanent record: chunk_id + parent_skill + context + score + timestamp + source_course

### Session / ephemeral:
- **session_skills** — the active skill set for the current learning session, generated per intent, disposable

### Deduplication:
- **Exact content hash** — catches true duplicates instantly
- **Similarity check** — for near-matches (different edition, whitespace differences). Triggered when exact hash misses but filename/structure looks suspicious. Simple threshold: "90%+ shared sentences"

---

## Concrete SQL Schema (Migration 002)

This is the actual SQL that implements the redesign. It runs as migration 002 alongside the existing 001 schema (expand-and-contract pattern from Q7). No existing tables are modified or dropped — that happens in migration 003 after data migration is confirmed.

### Table: parent_skills

CIP-seeded skill domains. The RPG character sheet.

```sql
CREATE TABLE IF NOT EXISTS parent_skills (
    id          TEXT PRIMARY KEY,              -- UUID, generated application-side
    cip_code    TEXT,                          -- CIP 4-digit code if seeded (e.g., "27.01")
    name        TEXT NOT NULL,                 -- Display name ("Calculus", "Organic Chemistry")
    description TEXT,                          -- Brief description for matching
    embedding   BLOB,                         -- Sentence embedding for similarity gating (~1.5KB)
    is_custom   INTEGER NOT NULL DEFAULT 0,   -- 1 if user-created, 0 if CIP-seeded
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_parent_skills_cip ON parent_skills(cip_code);
```

### Table: parent_skill_aliases

Prevents fragmentation. "Calc" → Calculus, "Econ" → Economics.

```sql
CREATE TABLE IF NOT EXISTS parent_skill_aliases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_skill_id TEXT NOT NULL,
    alias           TEXT NOT NULL,              -- Lowercase normalized alias
    FOREIGN KEY (parent_skill_id) REFERENCES parent_skills(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_unique ON parent_skill_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_alias_parent ON parent_skill_aliases(parent_skill_id);
```

### Table: courses (expanded)

New columns added to existing table in migration 003 (after dual-write confirmed). Listed here for reference — during Phase 1-2, these live in a separate `courses_v2` table.

```sql
CREATE TABLE IF NOT EXISTS courses_v2 (
    id              TEXT PRIMARY KEY,           -- Same UUID as courses.id for mapping
    name            TEXT NOT NULL,
    course_number   TEXT,                       -- Parsed from syllabus ("PHYS 201")
    instructor      TEXT,
    semester        TEXT,                       -- "Fall 2026"
    credits         INTEGER,
    description     TEXT,                       -- Catalog description from syllabus
    syllabus_parsed INTEGER NOT NULL DEFAULT 0, -- 1 if syllabus has been processed
    migration_state TEXT DEFAULT 'pending',     -- 'pending', 'migrating', 'complete'
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER
);
```

### Table: course_schedule

Week-by-week schedule parsed from syllabus. Drives session intent suggestions and reading↔chunk linking.

```sql
CREATE TABLE IF NOT EXISTS course_schedule (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   TEXT NOT NULL,
    week_number INTEGER,                       -- NULL if date-based without week numbers
    start_date  INTEGER,                       -- Unix epoch, NULL if not parseable
    end_date    INTEGER,
    topics      TEXT NOT NULL,                 -- JSON array of topic strings
    readings    TEXT,                           -- JSON array ("Chapter 5", "pp. 45-67")
    assignments_due TEXT,                       -- JSON array ("HW 4", "Lab Report 2")
    exams       TEXT,                           -- JSON array ("Midterm — covers weeks 1-6")
    parser_confidence TEXT DEFAULT 'medium',    -- 'high', 'medium', 'low'
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_course ON course_schedule(course_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dates ON course_schedule(start_date, end_date);
```

### Table: course_assessments

Grading breakdown parsed from syllabus.

```sql
CREATE TABLE IF NOT EXISTS course_assessments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   TEXT NOT NULL,
    category    TEXT NOT NULL,                 -- "homework", "midterms", "final", "participation"
    weight      REAL NOT NULL,                 -- 0.0 to 1.0 (30% = 0.30)
    count       INTEGER,                       -- Number of items in category (8 homeworks, 2 midterms)
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assessments_course ON course_assessments(course_id);
```

### Table: materials (expanded)

Adds file path for re-chunking during migration and future re-processing.

```sql
CREATE TABLE IF NOT EXISTS materials_v2 (
    id                TEXT PRIMARY KEY,
    course_id         TEXT NOT NULL,
    label             TEXT NOT NULL,
    classification    TEXT,                     -- "textbook", "assignment", "syllabus", "lecture", "notes"
    file_type         TEXT,                     -- MIME type or extension
    file_path         TEXT,                     -- Relative path to original file in app data dir
    original_filename TEXT,                     -- User-facing filename for display
    active            INTEGER DEFAULT 1,
    parser_output     TEXT,                     -- JSON: full parser output for this material
    parser_confidence TEXT,                     -- 'high', 'medium', 'low'
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_materials_v2_course ON materials_v2(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_v2_classification ON materials_v2(classification);
```

### Table: chunks (expanded)

Full-fidelity storage with content hashing and structural metadata.

```sql
CREATE TABLE IF NOT EXISTS chunks_v2 (
    id                  TEXT PRIMARY KEY,       -- UUID
    material_id         TEXT NOT NULL,
    course_id           TEXT NOT NULL,
    label               TEXT,                   -- Section/subsection heading
    content             TEXT,                   -- Markdown text content
    content_hash        TEXT NOT NULL,          -- SHA-256 of normalized text for exact dedup
    char_count          INTEGER,
    source_format       TEXT,                   -- 'pdf', 'epub', 'docx', 'txt', etc.
    heading_level       INTEGER,                -- 1-6 or NULL
    section_path        TEXT,                   -- "5.1.1" — dot-notation position in hierarchy
    structural_metadata TEXT,                   -- JSON: bold_terms, definitions, examples, equations counts
    fidelity            TEXT DEFAULT 'full',    -- 'full', 'text_only', 'low' (scanned/OCR)
    page_start          INTEGER,                -- Source page number (PDF) or position
    page_end            INTEGER,
    ordering            INTEGER,                -- Sort order within material
    status              TEXT DEFAULT 'pending', -- 'pending', 'ready', 'error'
    error_info          TEXT,
    fail_count          INTEGER DEFAULT 0,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials_v2(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_v2_material ON chunks_v2(material_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_course ON chunks_v2(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_hash ON chunks_v2(content_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_section ON chunks_v2(section_path);
```

### Table: chunk_media

Images and figures associated with chunks. Hybrid storage per Q3.

```sql
CREATE TABLE IF NOT EXISTS chunk_media (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id         TEXT NOT NULL,
    media_hash       TEXT NOT NULL,             -- Content hash for image dedup
    media_type       TEXT NOT NULL,             -- MIME type: "image/png", "image/jpeg"
    size_bytes       INTEGER NOT NULL,
    width            INTEGER,
    height           INTEGER,
    storage_type     TEXT NOT NULL,             -- 'inline' (≤100KB) or 'external' (>100KB)
    storage_source   TEXT NOT NULL DEFAULT 'native',  -- 'native' (extracted) or 'rendered' (vector graphic)
    inline_blob      BLOB,                     -- Image bytes when storage_type = 'inline'
    external_path    TEXT,                      -- Relative path when storage_type = 'external'
    caption          TEXT,                      -- Extracted caption text
    alt_text         TEXT,                      -- Alt text if available (EPUB)
    position_context TEXT,                      -- "after_para_3_in_section_5.1.1"
    page_number      INTEGER,                  -- Source page
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunk_media_chunk ON chunk_media(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_media_hash ON chunk_media(media_hash);
```

### Table: chunk_fingerprints

MinHash signatures for near-duplicate detection per Q4.

```sql
CREATE TABLE IF NOT EXISTS chunk_fingerprints (
    chunk_id        TEXT PRIMARY KEY,
    minhash_sig     BLOB NOT NULL,             -- 128 × 4 bytes = 512 bytes MinHash signature
    shingle_count   INTEGER,                   -- Number of 5-grams (indicator of content size)
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks_v2(id) ON DELETE CASCADE
);
```

### Table: sub_skills

Granular skills extracted from chunks. Chunk-anchored, course-contextual.

```sql
CREATE TABLE IF NOT EXISTS sub_skills (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_skill_id   TEXT NOT NULL,            -- FK to parent_skills
    name              TEXT NOT NULL,            -- "Power Rule Application", "First Law of Thermodynamics"
    description       TEXT,                     -- LLM-generated description of what this skill covers
    skill_type        TEXT,                     -- 'conceptual', 'procedural', 'recall', 'analytical', 'synthesis'
    embedding         BLOB,                     -- Sentence embedding for concept linking (~1.5KB)
    source_course_id  TEXT,                     -- Which course context produced this skill
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (parent_skill_id) REFERENCES parent_skills(id),
    FOREIGN KEY (source_course_id) REFERENCES courses_v2(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_skills_parent ON sub_skills(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_sub_skills_course ON sub_skills(source_course_id);
CREATE INDEX IF NOT EXISTS idx_sub_skills_type ON sub_skills(skill_type);
```

### Table: chunk_skill_bindings

Junction table recording every extraction event. A sub_skill may be linked to multiple chunks, and a chunk may produce multiple sub_skills.

```sql
CREATE TABLE IF NOT EXISTS chunk_skill_bindings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id            TEXT NOT NULL,
    sub_skill_id        INTEGER NOT NULL,
    extraction_context  TEXT NOT NULL,          -- "homework-3", "midterm-prep", "general-review"
    confidence          REAL,                   -- 0.0-1.0 extraction confidence
    extracted_at        INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks_v2(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bindings_chunk ON chunk_skill_bindings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_bindings_skill ON chunk_skill_bindings(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_bindings_context ON chunk_skill_bindings(extraction_context);
```

### Table: sub_skill_mastery

Full FSRS state per sub-skill. One row per sub_skill — updated after each review event.

```sql
CREATE TABLE IF NOT EXISTS sub_skill_mastery (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id    INTEGER NOT NULL UNIQUE,    -- One mastery record per sub_skill
    difficulty      REAL NOT NULL DEFAULT 0.3,  -- FSRS D: 0.0-1.0, how hard the material is
    stability       REAL NOT NULL DEFAULT 1.0,  -- FSRS S: days until retrievability drops to 90%
    retrievability  REAL NOT NULL DEFAULT 1.0,  -- FSRS R: current recall probability 0.0-1.0
    reps            INTEGER NOT NULL DEFAULT 0, -- Total successful reviews
    lapses          INTEGER NOT NULL DEFAULT 0, -- Times the student forgot after learning
    last_review_at  INTEGER,                    -- Unix epoch of last review
    next_review_at  INTEGER,                    -- Computed optimal next review time
    total_mastery_points REAL NOT NULL DEFAULT 0.0,  -- Accumulated weighted points for level calc
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mastery_skill ON sub_skill_mastery(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON sub_skill_mastery(next_review_at);
```

### Table: concept_links

Cross-sub-skill similarity links per Q5. Background-created, not blocking.

```sql
CREATE TABLE IF NOT EXISTS concept_links (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_a_id    INTEGER NOT NULL,
    sub_skill_b_id    INTEGER NOT NULL,
    similarity_score  REAL NOT NULL,            -- Embedding cosine similarity
    link_type         TEXT NOT NULL,            -- 'same_concept', 'prerequisite', 'related'
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_a_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_b_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_a_id < sub_skill_b_id)    -- Canonical ordering prevents duplicate pairs
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_link_pair ON concept_links(sub_skill_a_id, sub_skill_b_id, link_type);
```

### Table: sessions

Intent-based learning sessions. Replaces open-ended chat.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,               -- UUID
    course_id   TEXT NOT NULL,
    intent      TEXT NOT NULL,                  -- 'complete_assignment', 'exam_prep', 'learn_new', 'review', 'explore'
    scope       TEXT,                           -- JSON: intent-specific scope (which assignment, which chapters, etc.)
    status      TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed'
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    summary     TEXT,                           -- Auto-generated session summary (journal integration)
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_intent ON sessions(intent);
```

### Table: session_skills

Active skill set for a session. Generated per intent, disposable after session ends but kept for history.

```sql
CREATE TABLE IF NOT EXISTS session_skills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    sub_skill_id INTEGER NOT NULL,
    is_target    INTEGER NOT NULL DEFAULT 1,    -- 1 if this skill is being actively practiced
    pre_mastery  REAL,                          -- Retrievability at session start (snapshot)
    post_mastery REAL,                          -- Retrievability at session end
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_skills_session ON session_skills(session_id);
CREATE INDEX IF NOT EXISTS idx_session_skills_skill ON session_skills(sub_skill_id);
```

### Table: session_events

Mastery events within a session — individual question attempts, explanations, practice results.

```sql
CREATE TABLE IF NOT EXISTS session_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    sub_skill_id    INTEGER NOT NULL,
    event_type      TEXT NOT NULL,              -- 'question_correct', 'question_incorrect', 'explanation_given',
                                                -- 'hint_used', 'scaffolding_step', 'self_assessment'
    score           REAL,                       -- 0.0-1.0 where applicable
    intent_weight   REAL NOT NULL,              -- Weight from intent type (1.0 for assignment, 0.2 for explore)
    context         TEXT,                       -- JSON: question text, student response summary, etc.
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_skill ON session_events(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(event_type);
```

### Table: messages (session-scoped)

Chat messages now belong to sessions, not courses directly.

```sql
CREATE TABLE IF NOT EXISTS messages_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,                  -- 'user', 'assistant', 'system'
    content     TEXT NOT NULL,
    metadata    TEXT,                           -- JSON: token counts, model used, etc.
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_v2_session ON messages_v2(session_id);
```

### Table: journal_entries (expanded)

Session journals now include intent and skill metadata.

```sql
CREATE TABLE IF NOT EXISTS journal_entries_v2 (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    course_id       TEXT NOT NULL,              -- Denormalized for quick course-level queries
    intent          TEXT NOT NULL,              -- Denormalized from session
    entry_data      TEXT NOT NULL,              -- JSON: learning summary, topics covered
    skills_practiced TEXT,                      -- JSON array of sub_skill_ids touched
    mastery_changes TEXT,                       -- JSON: {sub_skill_id: {before: 0.6, after: 0.8}}
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses_v2(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_v2_session ON journal_entries_v2(session_id);
CREATE INDEX IF NOT EXISTS idx_journal_v2_course ON journal_entries_v2(course_id);
```

### Table: practice_sets (carried forward)

Retained from v1. Practice mode still generates question sets per skill.

```sql
CREATE TABLE IF NOT EXISTS practice_sets_v2 (
    sub_skill_id INTEGER NOT NULL,
    session_id   TEXT,                          -- NULL for standalone practice
    data         TEXT NOT NULL,                 -- JSON: generated questions and state
    updated_at   INTEGER,
    PRIMARY KEY (sub_skill_id, session_id),
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

### Table: settings (unchanged)

Carried forward from migration 001.

```sql
-- No changes to settings table. Already exists from 001.
```

### Summary: 20 Tables

| Table | PK Type | Rows (est.) | Notes |
|-------|---------|-------------|-------|
| `parent_skills` | TEXT UUID | ~200 seeded + user additions | CIP-seeded |
| `parent_skill_aliases` | INTEGER | ~500-1000 | Fragmentation prevention |
| `courses_v2` | TEXT UUID | 5-15 per student | Expanded with syllabus data |
| `course_schedule` | INTEGER | ~15 per course (weeks) | Syllabus-parsed |
| `course_assessments` | INTEGER | ~3-5 per course | Grading weights |
| `materials_v2` | TEXT UUID | ~5-20 per course | Now tracks file paths |
| `chunks_v2` | TEXT UUID | ~20-100 per material | Full fidelity + content hash |
| `chunk_media` | INTEGER | ~5-30 per material | Hybrid blob/filesystem |
| `chunk_fingerprints` | TEXT FK | 1:1 with chunks | MinHash for near-dedup |
| `sub_skills` | INTEGER | ~50-200 per course | Chunk-anchored |
| `chunk_skill_bindings` | INTEGER | ~1-3 per sub_skill | Extraction provenance |
| `sub_skill_mastery` | INTEGER | 1:1 with sub_skills | Full FSRS state |
| `concept_links` | INTEGER | Sparse | Background-created |
| `sessions` | TEXT UUID | ~50-200 per course over time | Intent-based |
| `session_skills` | INTEGER | ~5-30 per session | Active skill set |
| `session_events` | INTEGER | ~10-50 per session | Mastery evidence |
| `messages_v2` | INTEGER | ~20-100 per session | Session-scoped |
| `journal_entries_v2` | INTEGER | 1 per session | Expanded with skill data |
| `practice_sets_v2` | Composite | ~1 per active sub_skill | Carried forward |
| `settings` | TEXT | ~5-10 rows | Unchanged |

### Migration File Structure

The actual migration files in `src-tauri/migrations/`:

```
001_initial.sql          -- Existing v1 schema (untouched)
002_skill_redesign.sql   -- All new tables above (Phase 1: expand)
003_data_migration.sql   -- Alter existing tables, migrate data (Phase 2-3: contract)
004_cleanup.sql          -- Drop old tables after confirmed migration (Phase 4)
```

`002` is pure additive — no existing table is touched. `003` handles the tricky part: adding columns to existing tables, copying data, creating v2 ↔ v1 mappings. `004` is the destructive step that only runs after all courses have been migrated.

---

## Open Design Questions

1. **Parent skill list curation** — ~~what's the seed list? How does the system suggest mappings? How do user-created parent skills get validated to prevent fragmentation?~~ **RESOLVED — see below**

2. **Level computation specifics** — ~~exact formula, how different intent types weight mastery differently, how decay rate is calibrated~~ **RESOLVED — see below**

3. **Image storage implementation** — ~~SQLite blobs vs filesystem + DB paths. Filesystem is conventional but adds path management complexity in Tauri.~~ **RESOLVED — see below**

4. **Chunk similarity threshold** — ~~what constitutes "near-duplicate"? Simple sentence overlap percentage, or something more nuanced?~~ **RESOLVED — see below**

5. **Sub-skill identity stability** — ~~the (chunk_id, parent_skill, context) key handles most cases, but what about when the same concept genuinely appears in different chunks? Is that two sub-skills or one?~~ **RESOLVED — see below**

6. **Session intent → teaching strategy mapping** — ~~concrete rules for how each intent changes the AI's tutoring approach, question types, and mastery assessment weights~~ **RESOLVED — see below**

7. **Migration path** — ~~how does the current flat skill-per-course model transition to this architecture? Can existing courses be retrofitted, or is this a clean break?~~ **RESOLVED — see below**

---

## Resolved Design Questions

### Q1 — Parent Skill List Curation

**Decision: Use CIP (Classification of Instructional Programs) codes as the seed taxonomy.**

CIP is the U.S. Department of Education's standard taxonomy for academic disciplines. It's hierarchical: 2-digit codes are broad fields (e.g., "27 = Mathematics and Statistics"), 4-digit codes are subfields (e.g., "27.01 = Mathematics"), and 6-digit codes are specific programs. The 4-digit level maps well to the "course-subject level" target for parent skills.

**Implementation:**

1. **Seed with ~200 CIP 4-digit codes** covering common undergraduate subjects. Gives standardized names that won't drift.
2. **Course → parent skill mapping:** When a course is added, use course name + syllabus content to suggest 1-3 parent skill mappings via embedding similarity against CIP descriptions. The LLM ranks from the existing list — it doesn't pick from scratch.
3. **User-created parent skills go into a "pending" bucket.** System checks if any existing parent skill has >0.85 cosine similarity (sentence embeddings) to the proposed name + description. If yes, suggest the existing one. If no, create it but flag for potential future merging.
4. **Alias table** to prevent casual fragmentation: "Calc" → "Calculus", "Econ" → "Economics", "Orgo" → "Organic Chemistry." LinkedIn's skills taxonomy learned this the hard way — freeform skill creation produces unmanageable fragmentation. Their approach uses a combination of human taxonomists and ML (KGBert) to curate ~39k skills with 374,000+ aliases.

**Why not a custom taxonomy:** CIP is maintained, comprehensive, and widely used. Inventing our own seed list would be duplicating work that already exists and would lack the coverage of edge-case disciplines.

**Fragmentation is the real risk**, not coverage gaps. Even with a single user, split mastery across "Calculus," "Calc I," and "Differential Calculus" degrades the RPG leveling experience. The alias table + similarity gating handles this.

**References:**
- [CIP Classification — U.S. Dept. of Education](https://www.kent.edu/provost/curriculum/cip)
- [LinkedIn Skills Taxonomy Engineering Blog](https://www.linkedin.com/blog/engineering/data/building-maintaining-the-skills-taxonomy-that-powers-linkedins-skills-graph)
- [Knowledge Graphs in Education — Systematic Review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10847940/)

---

### Q2 — Level Computation, Intent Weighting, and Decay

**Decision: Adapt FSRS's DSR model for decay/retrievability. Keep `floor(sqrt(...))` for the display level. Separate "Level" from "Readiness."**

**FSRS (Free Spaced Repetition Scheduler)** is the current state-of-the-art open-source spaced repetition algorithm, now integrated into Anki. It models memory with three variables: Difficulty (how hard the material is), Stability (time in days for retrievability to drop from 100% to 90%), and Retrievability (probability of recall at a given moment). The forgetting curve is `R = exp(ln(0.9) * t / S)` where `t` is elapsed time and `S` is stability. FSRS-6 (latest) has 21 trainable parameters that adapt to individual user review patterns. It's MIT licensed and available as a Python package.

**Two-number display model:**

- **Level** = `floor(sqrt(total_weighted_mastery_points))` — the RPG number. Always goes up or stays flat, never drops. This is motivational and represents accumulated evidence of practice.
- **Readiness** = current retrievability computed via FSRS — the honest signal about whether the student can actually perform right now. This is what drives review recommendations and fluctuates over time.

User sees: **"Calculus — Level 7 (85% ready)"**

The level is the permanent achievement. Readiness is the truthful decay signal. This avoids the demoralizing "everything is dropping" problem while still being honest about memory decay.

**Rationale for separation:** `floor(sqrt(total_weighted_mastery_points))` conflates accumulated evidence (how much you've practiced) with current retrievability (can you do it right now). A student who crammed 50 calculus problems in one night has high accumulated points but low stability. Separating them gives you the motivational always-increasing number AND the honest decay signal.

**Mastery point computation per sub-skill:**

```
mastery_points(sub_skill) = weight(intent_type) * score * stability_factor
```

**Intent type weights:**

| Intent | Weight | Rationale |
|--------|--------|-----------|
| Complete assignment | 1.0 | Strongest evidence — graded, applied work |
| Prepare for exam | 0.8 | Focused practice, high stakes |
| Learn new material | 0.6 | First exposure, understanding not yet tested |
| Review / refresh | 0.4 | Reinforcement of existing knowledge |
| Explore a topic | 0.2 | Passive, low-commitment engagement |

- **score:** 0–1 based on session performance (correct answers, quality of explanations, etc.)
- **stability_factor:** Borrowed from FSRS — how stable the memory is. A skill reviewed 5 times over 3 months has higher stability than one crammed yesterday.

**Decay model:** Use FSRS's open-source implementation directly (MIT license). The doc's existing idea of "decay only activates when a skill is relevant to an active course" maps naturally — FSRS only updates retrievability when queried, so archived skills just sit at their last-computed state.

**References:**
- [FSRS Algorithm — GitHub Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
- [Technical Explanation of FSRS — Expertium](https://expertium.github.io/Algorithm.html)
- [FSRS Open Source Repo (MIT)](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)
- [Implementing FSRS in 100 Lines](https://borretti.me/article/implementing-fsrs-in-100-lines)
- [FSRS on PyPI](https://pypi.org/project/fsrs/)
- [ABC of FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs)

---

### Q5 — Sub-Skill Identity Stability

**Decision: Two sub-skills, one concept link. Don't merge cross-chunk instances of the same concept.**

The answer to "is that two sub-skills or one?" is: **two sub-skills with a link between them.** Merging creates more problems than it solves. Research on knowledge component attribution in educational data mining consistently shows that keeping knowledge components anchored to their source context and using entity resolution to create *links* (not merges) between related components produces better models.

**Why not merge:**
- Lose the ability to track context-specific mastery (Power Rule for derivatives ≠ Power Rule for kinematics, even though they're the same math)
- Ambiguity about which chunk a "merged" skill came from
- No clean demerge path when the student realizes they understand a concept in one context but not another
- Entity resolution literature is clear: link rather than merge unless confidence is very high and the merge is irreversible

**New schema addition — `concept_links` table:**

```
concept_links
  sub_skill_a_id    TEXT
  sub_skill_b_id    TEXT
  similarity_score  REAL  -- embedding cosine similarity
  link_type         TEXT  -- "same_concept", "prerequisite", "related"
  created_at        TEXT
```

**Linking process:**
1. Sub-skills stay chunk-anchored. "Power Rule" from Calc Ch.3 and "Power Rule" from Physics Ch.5 are distinct sub-skills with independent mastery tracking.
2. When a new sub-skill is extracted, compute its sentence embedding and compare against existing sub-skills under the same parent skill.
3. If similarity > 0.9, create a "same_concept" link. This runs as a background process, not blocking extraction.

**What concept links enable:**
- **Cross-course review:** "You learned Power Rule in Calc — it's relevant to your Physics homework too"
- **Mastery transfer:** Partial credit toward the Physics sub-skill because the Calc sub-skill has high mastery (weighted at ~0.3x — related knowledge helps but isn't sufficient)
- **User-visible connections:** "This concept appears in 3 of your courses"

**References:**
- [SMART: Latent Skill Mining from Courseware (JEDM)](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/552)
- [Knowledge Component Attribution Problem (JEDM)](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/755)
- [Entity Resolution for Knowledge Graph Construction](https://medium.com/@shereshevsky/entity-resolution-at-scale-deduplication-strategies-for-knowledge-graph-construction-7499a60a97c3)

---

### Q3 — Image Storage Implementation

**Decision: Hybrid approach — SQLite blobs for images ≤100KB, filesystem + DB path references for images >100KB.**

SQLite's own benchmarks show that reading/writing BLOBs <100KB is **35% faster** than equivalent filesystem operations, and uses ~20% less disk space (because filesystem block alignment wastes space on small files). Above 100KB, the filesystem wins on read performance.

For educational content, this breaks down practically:

- **Inline diagrams, equations, icons, thumbnails** (<100KB) → SQLite blobs. These are the majority of images in textbook content. Keeping them in SQLite means a single-file database with no path management, which is a significant advantage in Tauri where the app data directory is the natural home for the DB.
- **Full-page scans, high-res photos, complex figures** (>100KB) → Filesystem storage in a dedicated `chunks_media/` directory inside the Tauri app data path, with the DB storing `(chunk_id, media_hash, relative_path, size_bytes, mime_type)`.

**Implementation details:**

```
chunk_media
  chunk_id        TEXT
  media_hash      TEXT     -- content hash for dedup
  media_type      TEXT     -- "image/png", "image/jpeg", etc.
  size_bytes      INTEGER
  storage_type    TEXT     -- "inline" or "external"
  inline_blob     BLOB     -- populated when storage_type = "inline"
  external_path   TEXT     -- relative path when storage_type = "external"
  caption         TEXT
  position_context TEXT    -- "after paragraph 3 in section 2.1"
```

**Why not pure filesystem:** Single-file distribution is a major Tauri advantage. Keeping most images in SQLite means backup = copy one file. The hybrid approach only breaks this for large images, which are the minority.

**Why not pure SQLite blobs:** A chapter with 20 high-res scanned pages at 500KB each = 10MB of blobs. This bloats the DB, slows `VACUUM`, and hurts WAL checkpoint performance. The 100KB threshold is well-established in SQLite's own documentation.

**Tauri-specific note:** Use `app_data_dir()` from `tauri::api::path` for the media directory. This is per-user, persistent, and the conventional location for app-managed files. Relative paths in the DB mean the entire app data folder is portable.

**References:**
- [SQLite: 35% Faster Than The Filesystem](https://sqlite.org/fasterthanfs.html)
- [SQLite: Internal Versus External BLOBs](https://sqlite.org/intern-v-extern-blob.html)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri File System Plugin](https://v2.tauri.app/plugin/file-system/)

---

### Q4 — Chunk Similarity Threshold

**Decision: Two-tier detection — exact content hash for true duplicates, MinHash LSH with Jaccard threshold of 0.7 for near-duplicates.**

Near-duplicate detection is a well-studied problem. The practical options are SimHash (fixed-length fingerprint, good for quick pairwise comparison) and MinHash with Locality-Sensitive Hashing (set-similarity estimation, better for corpus-wide dedup). For StudyBuddy's use case — detecting when a student uploads a slightly different version of the same chapter — MinHash LSH is the better fit because it naturally handles insertions, deletions, and reorderings that are common across textbook editions.

**Implementation:**

1. **Exact hash (SHA-256 of normalized text)** — catches true duplicates instantly. Normalize = lowercase, strip whitespace, remove page numbers/headers. This is the fast path.

2. **MinHash LSH for near-duplicates:**
   - Shingle the chunk text into 5-grams (overlapping 5-word windows)
   - Compute MinHash signature (128 hash functions is standard)
   - Use LSH with **Jaccard similarity threshold of 0.7**
   - Candidates above threshold get a confirmation pass: sentence-level overlap percentage

3. **Threshold rationale:**
   - **0.7 Jaccard** catches: different editions of the same chapter, same content with reformatted whitespace/headers, PDFs with OCR variations, instructor-modified excerpts
   - **0.7 does NOT catch:** genuinely different chapters that share some terminology (which is correct — those aren't duplicates)
   - This aligns with the standard threshold used in web-scale near-duplicate detection (Google's research used 3-bit hamming distance on 64-bit SimHash, which corresponds to roughly 0.7 Jaccard)

4. **User confirmation for near-matches:** When a near-duplicate is detected, don't silently merge. Show the user: "This looks similar to [existing chunk]. Same material or different?" This fits the human-in-the-loop philosophy of the redesign.

**What to use:** The `datasketch` Python library provides a production-ready MinHash LSH implementation. For a Rust/Tauri context, the `gaoya` crate provides MinHash LSH. Both are well-maintained.

**References:**
- [Near-duplicate Detection with LSH and Datasketch](https://yorko.github.io/2023/practical-near-dup-detection/)
- [text-dedup: All-in-one Text Deduplication (GitHub)](https://github.com/ChenghaoMou/text-dedup)
- [semhash: Fast Semantic Deduplication (GitHub)](https://github.com/MinishLab/semhash)
- [MinHash — Wikipedia](https://en.wikipedia.org/wiki/MinHash)

---

### Q6 — Session Intent → Teaching Strategy Mapping

**Decision: Map each intent to concrete rules across five dimensions — pedagogy, question types, mastery assessment, IES recommendations emphasis, and session pacing.**

The IES Practice Guide "Organizing Instruction and Study to Improve Student Learning" (2007) provides seven evidence-based recommendations. Each intent type should emphasize different subsets of these. The mapping below also draws on intelligent tutoring system research and the existing StudyBuddy philosophy of "teach to derive, never give answers."

**The five dimensions:**

1. **Pedagogy** — how the AI teaches (explain → demonstrate → scaffold → assess)
2. **Question types** — what the AI asks the student
3. **Mastery evidence** — what counts as "mastered" for scoring purposes
4. **IES emphasis** — which of the 7 IES recommendations are most active
5. **Pacing** — how the session is structured temporally

**Intent mapping table:**

#### Complete Assignment (weight: 1.0)

| Dimension | Strategy |
|-----------|----------|
| Pedagogy | Scaffold-first: don't explain the topic broadly. Start from the specific problem. If the student is stuck, teach the minimum prerequisite needed to unblock them, then return to the problem. IES Rec #2 (interleave worked examples with exercises) is primary. |
| Question types | Mirror the assignment format. If the assignment asks "solve for X," the AI asks "what's your first step to isolate X?" Not "explain the concept of isolation." |
| Mastery evidence | Binary per item: student produces a correct, justified answer. Partial credit for correct process with arithmetic errors. No credit for AI-assisted answers where the student couldn't explain the steps. |
| IES emphasis | #2 (interleaved examples), #4 (connect abstract ↔ concrete), #7 (deep explanatory questions) |
| Pacing | Item-sequential. Work through assignment items in order (or student-chosen order). Don't jump ahead. Each item is a micro-session. |

#### Prepare for Exam (weight: 0.8)

| Dimension | Strategy |
|-----------|----------|
| Pedagogy | Retrieval-practice-first: start with a diagnostic question set (no teaching). Identify gaps, then teach to gaps. IES Rec #5 (use quizzing to promote learning) is primary. Interleave topics rather than blocking by chapter. |
| Question types | Mixed format matching likely exam style. If the course has had multiple-choice exams, use MC. If open-ended, use open-ended. Include "explain why" questions regardless — these reveal shallow memorization. |
| Mastery evidence | Accuracy on retrieval practice questions without hints. Weighted by question difficulty. A student who gets hard questions right on first try scores higher than one who needs scaffolding. |
| IES emphasis | #1 (space learning over time), #2 (interleave), #5 (quizzing), #6 (allocate study time efficiently) |
| Pacing | Spaced across available time. If exam is in 3 days, front-load weak areas. If 2 weeks, space reviews using FSRS scheduling. Flag topics where readiness is below 70%. |

#### Learn New Material (weight: 0.6)

| Dimension | Strategy |
|-----------|----------|
| Pedagogy | Pre-question → explain → example → practice. IES Rec #3 (combine graphics with verbal descriptions) and #4 (connect abstract ↔ concrete) are primary. Start with a pre-question to activate prior knowledge before teaching. |
| Question types | Conceptual: "In your own words, what does X mean?" and "How does X relate to Y you learned last week?" Avoid procedural questions until concepts are established. |
| Mastery evidence | Explanation quality. Can the student explain the concept without repeating the textbook verbatim? Can they generate a novel example? Lower bar than assignment completion — this is first exposure. |
| IES emphasis | #3 (graphics + verbal), #4 (abstract ↔ concrete), #7 (deep explanatory questions) |
| Pacing | Section-by-section through the material. Don't rush. Allow the student to set pace. Flag sections where the student seems to be nodding along without engaging (short answers, no questions asked). |

#### Review / Refresh (weight: 0.4)

| Dimension | Strategy |
|-----------|----------|
| Pedagogy | Pure retrieval practice with expanding intervals. Minimal new teaching — this is about strengthening existing memory. If a topic fails retrieval, give a brief refresher, then re-test. IES Rec #1 (space learning) is primary. |
| Question types | Recall-focused: "What is X?" "What are the steps to solve Y?" Quick-fire format. Include interleaved questions from different topics to build discrimination (IES Rec #2). |
| Mastery evidence | Retrieval success rate and response latency (did they know it immediately, or did they struggle and reconstruct?). FSRS stability updates based on success/fail. |
| IES emphasis | #1 (spacing), #2 (interleaving), #5 (quizzing) |
| Pacing | System-driven. FSRS determines which sub-skills are due for review based on current retrievability. Student can override but the default sequence is optimized for memory retention. |

#### Explore a Topic (weight: 0.2)

| Dimension | Strategy |
|-----------|----------|
| Pedagogy | Conversational and curiosity-driven. Follow the student's lead. Provide context and connections. Suggest related topics. This is the closest to the current open-chat model, but with the system tracking which concepts are touched for future reference. |
| Question types | Open-ended, Socratic: "What do you think would happen if...?" "How might this connect to...?" No assessment pressure. |
| Mastery evidence | Minimal. Engagement is tracked (which concepts were discussed, how deeply) but no formal scoring. Exploration feeds into the chunk-skill binding record so future sessions know what was covered, but doesn't significantly move mastery scores. |
| IES emphasis | #7 (deep explanatory questions), #4 (abstract ↔ concrete) |
| Pacing | Student-driven. No structured sequence. Session ends when the student is done. |

**Cross-cutting rule:** Regardless of intent, the AI never gives answers directly. It always scaffolds toward the student producing the answer. The intent determines *how aggressively* it scaffolds (assignment = tight scaffolding, exploration = loose Socratic questioning).

**References:**
- [IES Practice Guide: Organizing Instruction and Study to Improve Student Learning (PDF)](https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/20072004.pdf)
- [IES Practice Guide Overview (WWC)](https://ies.ed.gov/ncee/wwc/practiceguide/1)
- [Intelligent Tutoring Systems: 7 Research-Backed Principles](https://thirdspacelearning.com/us/blog/intelligent-tutoring-systems/)
- [IES: Interleaved Mathematics Practice](https://ies.ed.gov/use-work/awards/interleaved-mathematics-practice)

---

### Q7 — Migration Path

**Decision: Expand-and-contract migration. Retrofit existing courses incrementally, not a clean break.**

A clean break would mean existing users lose their course data or have to re-upload everything. That's unacceptable for an app whose core value proposition is preserving learning progress. The expand-and-contract pattern (well-established in database migration literature) lets you add the new schema alongside the old, migrate data gradually, and deprecate the old schema once migration is complete.

**Migration phases:**

#### Phase 1 — Schema Expansion (no breaking changes)

Add the new tables alongside existing ones. Nothing is removed or renamed.

```sql
-- New tables added
CREATE TABLE IF NOT EXISTS parent_skills (...);
CREATE TABLE IF NOT EXISTS chunk_skills (...);
CREATE TABLE IF NOT EXISTS skill_mastery (...);
CREATE TABLE IF NOT EXISTS sub_skill_history (...);
CREATE TABLE IF NOT EXISTS concept_links (...);
CREATE TABLE IF NOT EXISTS chunk_media (...);
CREATE TABLE IF NOT EXISTS session_skills (...);

-- Version tracking
PRAGMA user_version = 2;  -- bump from current version
```

The existing course tables, skill tables, and chat history remain untouched. The app continues to work exactly as before.

#### Phase 2 — Dual-Write Bridge

When a user opens an existing course, the system:

1. **Re-chunks existing materials** using the new chunking pipeline (deterministic parsing + content hashing). Since the original uploaded files should still be on disk (or stored as blobs), this is a re-processing pass, not a data loss event.
2. **Maps existing flat skills to parent skills** using the CIP-based mapping system from Q1. This is a one-time LLM call per course: "Given these existing skills [list] and this course name, map each to the most appropriate parent skill from [CIP subset]."
3. **Writes to both old and new schemas** during transition. Old code paths still read from old tables. New code paths read from new tables. This ensures nothing breaks if the migration is interrupted.

#### Phase 3 — Intent System Introduction

The session intent system (Q1-Q3 at session start) is introduced as the **default but skippable** entry point. Existing users who open a course see the intent picker but can click "Just chat" to get the old behavior. This avoids forcing a workflow change overnight.

Over time, "Just chat" maps internally to the "Explore a topic" intent, so it still benefits from the new architecture without the user knowing.

#### Phase 4 — Old Schema Deprecation

Once all existing courses have been accessed at least once (triggering Phase 2 migration) or after a configurable timeout (e.g., 90 days post-update), the old tables are dropped:

```sql
-- Only after confirming all data is migrated
DROP TABLE IF EXISTS old_skills;
DROP TABLE IF EXISTS old_course_skills;
-- etc.
PRAGMA user_version = 3;
```

**Safety mechanisms:**
- **Pre-migration backup:** Before any schema change, copy the DB file to `{db_name}.backup.{timestamp}`. SQLite makes this trivial — it's a single file copy.
- **Migration version tracking:** Use `PRAGMA user_version` to track which migration phase each DB is at. The app checks this on startup and runs any pending migrations.
- **Rollback path:** Phases 1 and 2 are fully reversible (just drop the new tables). Phase 4 is the only destructive step, and it only runs after successful migration is confirmed.

**What can't be retrofitted:** Chunk-level image fidelity. If the original upload pipeline discarded images or didn't preserve positional context, that data is gone. The migration can flag these chunks as "low fidelity" and prompt the user to re-upload if they want full image support. Don't silently pretend old chunks have data they don't.

**References:**
- [Expand and Contract Pattern (Prisma)](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern)
- [Evolutionary Database Design (Martin Fowler)](https://martinfowler.com/articles/evodb.html)
- [Declarative Schema Migration for SQLite](https://david.rothlis.net/declarative-schema-migration-for-sqlite/)
- [sqlite-migrate (Simon Willison)](https://github.com/simonw/sqlite-migrate)

---

## Deterministic Parser Specifications

### Design Philosophy

The parser system uses a **classify-then-route** approach. Rather than one monolithic parser, a lightweight classifier first detects what type of document it's looking at, then routes to the appropriate parsing strategy. When the classifier is uncertain, it asks the user a targeted clarification question — this is a natural part of the upload flow, not a failure state.

The split: **code handles structure, counts, and classification. LLM handles domain knowledge, prerequisite reasoning, and description quality.** The deterministic parser's output becomes the constraints that scope the LLM's work.

### Parser 1: Assignment Parser

#### Assignment Type Classification (macro-level)

The first job is detecting which category the document falls into:

**Category A — Discrete items (fully parseable):**
- Problem sets (STEM) — numbered problems with sub-parts
- Worksheets — fill-in-the-blank, matching, short answer
- Online quizzes — multiple choice, select all, true/false
- Lab pre-labs — structured questions about procedure

**Category B — Single unit (parseable as one deliverable):**
- Essays — one deliverable, prompt-based
- Lab reports — structured sections (intro, methods, results, discussion) but not discrete questions
- Case studies — analyze a scenario, usually with guiding questions
- Research papers — extended single deliverable
- Discussion posts — respond to a prompt

**Category C — Unstructured (minimal parsing, flag for user):**
- Creative projects (design, build, present)
- Group projects with division of labor
- Portfolios / reflective journals
- Coding assignments (spec → code)

**Detection signals:**
- Category A: presence of numbered items (regex for `1.`, `1)`, `Problem 1`, `Q1`, etc.), multiple choice option markers (A/B/C/D), point values
- Category B: essay keywords ("write a", "discuss", "analyze"), report section headers ("Introduction", "Methods", "Results"), word count requirements
- Category C: project keywords ("design", "build", "create", "portfolio"), group work indicators, code submission references
- **When uncertain:** ask user — "This looks like an essay prompt — is that right, or does it contain individual questions?"

#### Question Format Detection (micro-level, within Category A)

For discrete-item assignments, each item gets classified by format:

| Format | Detection Pattern | Skill Type Signal |
|--------|------------------|-------------------|
| Multiple choice | A/B/C/D options, "circle," "select" | Recognition/recall |
| True/false | "True or False:", "T/F" | Recognition |
| Fill in the blank | Underscores (___), "fill in" | Recall |
| Matching | Two columns, "match," "=" separator | Association |
| Short answer | "briefly explain," "in 2-3 sentences" | Recall + comprehension |
| Calculation/solve | "solve," "calculate," "find," "evaluate" | Procedural |
| Proof/derivation | "prove," "show that," "derive" | Analytical |
| Explain/discuss | "explain why," "discuss," "compare and contrast" | Conceptual/analytical |
| Diagram/graph | "draw," "sketch," "graph," "label" | Visual/procedural |
| Design/create | "design," "propose," "construct" | Synthesis |
| Ordering | "arrange," "rank," "put in order" | Comprehension |

#### Numbering Convention Patterns

Research shows consistent patterns across institutions:
- Question numbers: `1.` or `1)` or `1:` or `Problem 1` or `Question 1` or `Q1`
- Sub-parts: `a.` or `a)` or `(a)` or `i.` or `(i)`
- Point values: `(10 pts)` or `(10 points)` or `[10]` or `/10`
- The Respondus format (widely used for LMS import) serves as a de facto standard: number + period/paren + space + question text

#### Output Structure

```json
{
  "assignment_category": "discrete_items",
  "total_items": 18,
  "questions": [
    {
      "number": "1",
      "text": "...",
      "sub_parts": [
        { "label": "a", "text": "...", "type": "computation", "points": 5 },
        { "label": "b", "text": "...", "type": "explanation", "points": 10 }
      ],
      "references": ["Chapter 3", "Table 2.1"],
      "type": "computation"
    }
  ],
  "type_distribution": {
    "computation": 8,
    "explanation": 4,
    "multiple_choice": 3,
    "synthesis": 2,
    "proof": 1
  },
  "external_references": ["Chapter 3", "Chapter 5", "Table 2.1"],
  "parser_confidence": "high"
}
```

For Category B (single-unit), output is simpler:
```json
{
  "assignment_category": "single_unit",
  "type": "essay",
  "prompt": "...",
  "requirements": { "word_count": 1500, "sources_required": 5 },
  "references": ["Chapter 7", "lecture notes week 4"],
  "parser_confidence": "medium"
}
```

#### What this gives the LLM

- **Category A:** "Here are 18 discrete items, 8 computation and 4 explanation. For each item, identify the 1-3 prerequisite skills needed to answer it." — massively constrained vs. open-ended extraction.
- **Category B:** "This is an essay assignment about [topic]. What skills does a student need to write this effectively?" — single focused question.
- **Category C:** "I couldn't parse this structurally. Here's the raw text. Extract the core deliverables and identify what skills they require." — LLM gets more latitude, but user has already confirmed the type.

### Parser 2: Chapter Parser

#### Format Landscape

Students upload textbook content in three primary formats, each with different structural richness:

- **PDF** — most common by far (scanned textbooks, publisher PDFs, downloaded chapters). Geometry-based structure only.
- **EPUB** — growing via OpenStax and OER. Richest format: semantic HTML with `epub:type` annotations, `<h1>`-`<h6>`, `<aside>`, `<figcaption>`, MathML.
- **DOCX** — instructor-created course readers, notes, study guides. Paragraph styles + run-level formatting.

Parser priority: PDF first (most common, hardest), EPUB second (best structure), DOCX third.

#### Textbook Pedagogical Structure

Textbook chapters follow a remarkably standardized structure (Schneider taxonomy, widely cited across OER publishing). The parser should detect elements in three categories:

**Openers** (before main content — preview/motivate):
- Learning objectives ("By the end of this section, you will be able to...")
- Chapter introduction / overview
- Focus questions / pre-assessment
- Key terms preview
- Motivational vignette, case study, or scenario

**Closers** (after main content — review/reinforce):
- Chapter summary / key takeaways
- Review questions
- Key terms list / glossary
- Practice problems / exercises
- Further reading / references

**Integrated devices** (within main content — support learning):
- Definitions ("X is defined as...", bold term + explanation)
- Worked examples ("Example:", numbered examples)
- Case studies / applications
- Figures, diagrams, images with captions
- Sidebars / callout boxes
- Margin notes
- Equations / theorems / proofs
- Tables (data, comparison, reference)

Each element type maps to different skill extraction strategies. Definitions → vocabulary/concept skills. Worked examples → procedural skills. Learning objectives → direct skill candidates.

#### Format-Specific Extraction Strategies

| Feature | EPUB | DOCX | PDF |
|---------|------|------|-----|
| Heading hierarchy | `<h1>`-`<h6>` + `epub:type` | Paragraph styles (Heading 1-9) | Font size heuristics |
| Bold/italic terms | HTML `<b>`/`<i>`/`<strong>`/`<em>` | Run-level `bold`/`italic` | Font weight detection (unreliable) |
| Definitions | `<aside>` or styled `<div>` blocks | Custom styles or callout boxes | Keyword detection only |
| Examples | `epub:type="example"` or styled blocks | Custom styles | Keyword detection ("Example:") |
| Images + captions | `<img>` with `<figcaption>` | Inline shapes with captions | Image extraction + nearby text |
| Equations | MathML embedded | Equation objects | OCR or image extraction |
| Table of contents | `<nav epub:type="toc">` with `<ol>` | Built-in TOC | Bookmark tree or page heuristic |
| Learning objectives | `epub:type="learning-objective"` | Keyword detection | Keyword detection |

**Key insight:** EPUB gives you semantics, DOCX gives you styles, PDF gives you geometry. Three different strategies, same output format.

**PDF tooling consideration:** pymupdf4llm produces markdown with preserved headings in ~0.12s (vs marker-pdf at 11.3s for "perfect" structure). For Tauri, options include: Rust bindings to MuPDF, shelling out to Python, or using Rust-native `lopdf`/`pdf-extract` crates (less mature for structure preservation). The pymupdf4llm markdown output is close enough to the chapter parser's needs that it could serve as the intermediate representation for all PDF chapter parsing.

#### Parser Confidence Tiers

The parser should report what it could and couldn't extract:

- **High confidence** (EPUB with semantic markup): "Extracted 12 subsections, 23 bold terms, 8 definitions, 6 examples from document markup."
- **Medium confidence** (DOCX with heading styles): "Extracted 10 sections from paragraph styles, 15 bold terms from run formatting. Definitions detected by keyword pattern."
- **Low confidence** (PDF or plain text): "Detected 8 likely headings from font size changes. No formatting information available for term extraction. Structure is approximate."

Confidence level determines how much latitude the LLM gets and whether the user gets an extra confirmation question.

#### Output Structure

```json
{
  "title": "Chapter 5: Thermodynamics",
  "source_format": "epub",
  "parser_confidence": "high",
  "openers": {
    "learning_objectives": [
      "Explain the first law of thermodynamics",
      "Calculate internal energy changes for ideal gases"
    ],
    "introduction": "summary text...",
    "key_terms_preview": ["internal energy", "state function", "enthalpy"]
  },
  "sections": [
    {
      "heading": "5.1 The First Law",
      "level": 2,
      "subsections": [
        {
          "heading": "5.1.1 Internal Energy",
          "level": 3,
          "content_signals": {
            "bold_terms": ["internal energy", "state function", "path function"],
            "definitions": 3,
            "examples": 2,
            "equations": 4,
            "images": [
              { "id": "fig-5-1", "caption": "Energy transfer diagram", "position": "after_para_3" }
            ],
            "content_type": "conceptual_with_math"
          }
        }
      ]
    }
  ],
  "closers": {
    "summary": "text...",
    "review_questions": 12,
    "key_terms_list": ["internal energy", "enthalpy", "heat capacity", "..."]
  },
  "aggregate": {
    "total_sections": 4,
    "total_subsections": 12,
    "total_bold_terms": 23,
    "total_definitions": 8,
    "total_examples": 6,
    "total_equations": 15,
    "total_images": 5,
    "dominant_content_type": "mixed_conceptual_procedural"
  },
  "candidate_skills": [
    { "name": "Internal Energy", "source": "5.1.1", "type": "conceptual_with_math", "evidence": "subsection heading + 3 definitions + 4 equations" },
    { "name": "State Functions", "source": "5.1.1", "type": "conceptual", "evidence": "2 bold terms + 3 definitions" }
  ]
}
```

#### What this gives the LLM

Instead of "extract skills from this chapter," the prompt becomes: "Here are 12 candidate skills derived from subsection headings, with 23 key terms distributed across them and 8 formal definitions. Validate these as skills, wire prerequisites between them, identify any that should be split or merged, and map each to a parent skill." The LLM is editing and validating, not generating from scratch.

### Parser 3: Syllabus Parser

#### Syllabus Content Structure

Despite high format variance, syllabi are remarkably consistent in content. Almost every syllabus contains these sections (roughly in this order):

1. **Course metadata** — number, title, instructor, term/semester, credits, meeting times
2. **Contact/office hours** — email, office location, office hours schedule
3. **Course description** — catalog description, sometimes expanded
4. **Learning objectives** — what students will be able to do
5. **Required materials** — textbooks, software, lab equipment
6. **Grading breakdown** — weights by category (homework %, exams %, participation %)
7. **Course schedule** — week-by-week or date-by-date (THE HIGHEST VALUE TARGET)
8. **Assignment descriptions** — details on major deliverables
9. **Policies** — attendance, late work, academic integrity, accommodations

#### Why the Schedule Section Matters Most

The schedule is where topics, readings, and due dates live. It's the skeleton the entire course hangs on. For Study's purposes:
- Topics → candidate skill names
- Readings → chunk references ("Chapter 5" links to uploaded chapter chunks)
- Due dates → assignment anchors for session intent
- Week structure → pacing constraints for spaced repetition

#### Detection Strategies

**Structurally parseable signals:**
- Tables (most common schedule format) — detect via HTML `<table>`, DOCX table objects, or PDF table extraction
- Repeating patterns: "Week N" / "Module N" headers followed by topics and readings
- Date patterns: `Aug 26`, `8/26`, `August 26, 2026`, etc.
- Assignment markers: "HW 1 due", "Midterm", "Final exam", "Quiz"
- Grading percentages: "Homework: 30%", "Exams: 40%"
- Textbook references: "Chapter 1-3", "pp. 45-67", ISBN patterns

**What code can extract reliably:**
- Course number/title (usually first line or header, regex for patterns like `PHYS 201`, `CS 101`)
- Dates and week numbers (date parsing libraries)
- Percentage breakdowns (regex for `N%`)
- Table structure (row/column detection)
- Assignment names when they follow patterns ("HW N", "Problem Set N", "Midterm N")

**What needs LLM assist:**
- Distinguishing topic names from readings from assignments within prose-format schedules
- Resolving ambiguous references ("Chapters 5-7" — is that one reading or three?)
- Extracting learning objectives from varying phrasings
- Parsing non-standard schedule formats (paragraph-form, nested bullets)

#### Two-Pass Architecture

**Pass 1 — Deterministic extraction (code):**
1. Detect document sections by keyword headers ("Course Schedule", "Grading", "Required Materials", etc.)
2. Within schedule section: extract tables, or detect repeating week/date patterns
3. Extract all dates, percentages, course numbers, textbook references
4. Build partial structural profile with confidence scores per section

**Pass 2 — LLM fill-in (constrained):**
1. Send partial extraction + raw text of unparsed sections
2. LLM completes the gaps: "I found 10 of 15 weeks. Here's the raw text for the rest — fill in the gaps."
3. LLM maps topic names to canonical forms
4. Validation: if code found 15 weeks and LLM says 12, flag the conflict

The structural pass reduces LLM work significantly and gives a validation anchor.

#### LMS-Origin Detection

Many syllabi now originate from Canvas or Blackboard templates. These produce HTML-structured content that's more parseable than freeform Word docs. The parser should detect LMS artifacts:
- Canvas: characteristic CSS classes, accordion structures, Simple Syllabus format
- Blackboard: specific HTML patterns from content export
- If detected, use HTML parsing instead of text heuristics — significantly higher extraction quality.

#### Output Structure

```json
{
  "parser_confidence": "medium",
  "metadata": {
    "course_number": "PHYS 201",
    "title": "Introduction to Thermodynamics",
    "instructor": "Dr. Smith",
    "semester": "Fall 2026",
    "credits": 3
  },
  "schedule": [
    {
      "week": 1,
      "dates": "Aug 26 - Aug 30",
      "topics": ["Course overview", "Temperature and heat"],
      "readings": ["Chapter 1"],
      "assignments_due": [],
      "exams": []
    },
    {
      "week": 7,
      "dates": "Oct 7 - Oct 11",
      "topics": ["First Law of Thermodynamics", "Internal energy"],
      "readings": ["Chapter 5", "Chapter 6 (sections 1-3)"],
      "assignments_due": ["HW 4"],
      "exams": ["Midterm — covers weeks 1-6"]
    }
  ],
  "assessments": {
    "homework": { "weight": 30, "count": 8 },
    "midterms": { "weight": 40, "count": 2 },
    "final": { "weight": 30, "count": 1 }
  },
  "textbooks": ["Fundamentals of Thermodynamics, 9th ed."],
  "learning_objectives": ["...", "..."],
  "schedule_topics_as_candidate_skills": [
    "Temperature and heat",
    "First Law of Thermodynamics",
    "Internal energy"
  ]
}
```

#### What this gives the LLM

The syllabus parser output enables:
- **Course skeleton:** auto-populate the course structure before any materials are uploaded
- **Reading ↔ chunk linking:** when "Chapter 5" is uploaded, auto-associate with weeks 7-8 topics
- **Assessment timeline:** know when exams and assignments fall, drive session intent suggestions ("your midterm is in 3 days — switch to exam prep?")
- **Candidate skill names:** syllabus topics become seed skills that chapter parsing refines

### PDF Extraction Performance Architecture

#### The Problem

pymupdf4llm is the chosen PDF-to-markdown tool (Python, shelled out from Tauri). Out of the box, calling `to_markdown()` with all features enabled is slow for image-heavy textbooks — table detection scans every page, image "extraction" actually re-renders page regions as new image files at the specified DPI, and pathological PDFs with bloated StructTreeRoot objects can hit ~1 second per page. A 40-page chapter with 15 figures shouldn't take 40+ seconds.

The core insight: pymupdf4llm's `write_images=True` does not extract embedded images. It renders page areas classified as "picture" into new image files. This is fundamentally slower than pulling out the original embedded image bytes, which PyMuPDF itself can do in single-digit microseconds via `doc.extract_image(xref)`.

#### Three-Tier Extraction Architecture

Split the single `to_markdown()` call into three independent tiers, each optimized for its job:

**Tier 1 — Text + Structure (fast path, always runs first)**

```python
md_chunks = pymupdf4llm.to_markdown(
    doc,
    page_chunks=True,
    write_images=False,        # skip image rendering entirely
    table_strategy=None,       # skip table detection
    graphics_limit=200,        # cap vector graphics analysis
    image_size_limit=0.05,     # default — ignore tiny decorative elements
)
```

Expected: ~0.1-0.3s per page. This extracts all text, heading hierarchy, bold/italic formatting, and reading order. The structural profile (headings, sections, bold terms) is available immediately for the chapter parser to build candidate skills.

**Tier 2 — Image Extraction (parallel, native format)**

Bypass pymupdf4llm entirely for images. Use PyMuPDF's direct extraction API:

```python
import pymupdf

def extract_images_native(doc_path, output_dir, size_threshold=0.05):
    doc = pymupdf.open(doc_path)
    images = []
    
    for page_num, page in enumerate(doc):
        page_rect = page.rect
        min_dim = min(page_rect.width, page_rect.height) * size_threshold
        
        # Get embedded raster images by xref (microseconds each)
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            img_data = doc.extract_image(xref)
            
            if not img_data:
                continue
                
            # Filter by size — skip tiny icons, bullets, decorative elements
            width = img_data.get("width", 0)
            height = img_data.get("height", 0)
            if width < min_dim or height < min_dim:
                continue
            
            # Native format — no re-encoding. JPEG stays JPEG, PNG stays PNG.
            ext = img_data["ext"]       # "jpeg", "png", etc.
            raw_bytes = img_data["image"]  # original bytes
            
            images.append({
                "page": page_num,
                "xref": xref,
                "width": width,
                "height": height,
                "format": ext,
                "size_bytes": len(raw_bytes),
                "data": raw_bytes,
            })
    
    return images
```

Expected: near-instant for a typical chapter. A 40-page chapter with 15 embedded images completes in <100ms total. Images arrive in their original format and quality — no lossy re-encoding.

**Tier 3 — Vector Graphics Rendering (targeted, only when needed)**

Some textbook figures are drawn with PDF path commands (vector graphics), not embedded as raster images. These won't appear in `page.get_images()` — they need rendering. But rendering every page to catch them is wasteful.

Detection heuristic: after Tier 1 and Tier 2, compare pymupdf4llm's markdown references to images against what Tier 2 actually extracted. Pages where the markdown mentions a figure/image area but Tier 2 found nothing are candidates for vector graphic rendering.

```python
def render_vector_regions(doc, pages_needing_render, dpi=150, image_format="jpg"):
    """Selectively render only pages/regions with vector graphics."""
    rendered = []
    for page_num in pages_needing_render:
        page = doc[page_num]
        # Get drawing commands to identify graphic regions
        drawings = page.get_drawings()
        if not drawings:
            continue
        
        # Cluster nearby drawings into regions, render each region
        # (not the full page — just the bounding box of the graphic)
        regions = cluster_drawings_to_regions(drawings, page.rect)
        for region in regions:
            clip = pymupdf.Rect(region)
            pix = page.get_pixmap(clip=clip, dpi=dpi)
            rendered.append({
                "page": page_num,
                "region": region,
                "format": image_format,
                "data": pix.tobytes(output=image_format),
            })
    
    return rendered
```

Expected: only fires on pages with vector-drawn diagrams (charts, flowcharts, circuit diagrams). Most textbook pages with only text + embedded rasters skip this entirely. When it does fire, it renders only the graphic region (clip rect), not the full page — much faster.

**Tier 3b — Table Re-extraction (targeted, only flagged pages)**

Table detection is expensive but only relevant for pages that actually contain tables:

```python
def extract_tables_targeted(doc_path, candidate_pages):
    """Re-process only pages likely to contain tables."""
    if not candidate_pages:
        return {}
    
    return pymupdf4llm.to_markdown(
        doc_path,
        pages=candidate_pages,
        table_strategy="lines_strict",
        write_images=False,
        page_chunks=True,
    )
```

Table-likely pages detected from Tier 1 output: presence of tab-separated text, repeated delimiter patterns, or columnar alignment in the markdown.

#### Performance Parameters

Key tuning knobs and their trade-offs:

| Parameter | Default | Effect | Recommendation |
|-----------|---------|--------|----------------|
| `image_format` | `"png"` | PNG encoding is ~3-5x slower than JPEG | Use `"jpg"` for Tier 3 rendering. Tier 2 preserves native format. |
| `dpi` | `150` | 300 DPI = 4x pixel count = 4x render time | 150 DPI sufficient for screen display. Only increase for OCR-dependent scans. |
| `table_strategy` | `"lines_strict"` | Scans every page for table structures | Set to `None` in Tier 1; targeted re-extraction in Tier 3b. |
| `graphics_limit` | `None` | Uncapped vector graphics analysis per page | Set to `200` to cap pathological pages with thousands of drawing commands. |
| `image_size_limit` | `0.05` | Ignores images <5% of page dimension | Reasonable default. Increase to `0.10` if too many decorative elements pass through. |
| `force_text` | `True` | Extracts text overlaid on image regions | Keep `True` — textbook figures often have labeled axes and annotations. |

#### Image Format Decision

Tier 2 (native extraction) preserves the original format — if the PDF embedded a JPEG, you get a JPEG. No quality loss, no encoding time.

Tier 3 (vector rendering) requires choosing a format. **JPEG at quality 85** is the right default:
- ~3-5x smaller files than PNG for photographic/complex content
- ~3-5x faster encoding
- Quality 85 is visually lossless for diagrams and figures
- For the rare case of text-heavy rendered regions (equations rendered as vector graphics), PNG may preserve sharpness better — but these are minority cases and the text was already extracted in Tier 1

#### Chunk-Image Association

Images extracted in Tiers 2 and 3 need to be associated with their surrounding text chunks from Tier 1. The association logic:

1. Each image has a page number and vertical position (from xref metadata or clip rect)
2. Each text chunk from Tier 1 has page boundaries
3. Match: image on page N associates with the text chunk spanning page N
4. Within a chunk, position the image reference after the nearest preceding paragraph (using the image's y-coordinate vs text block y-coordinates)
5. Store in `chunk_media` table with `position_context` = `"after_para_N_in_section_X.Y"`

This preserves the "image X appears after paragraph Y" spatial relationship from the original PDF without requiring the LLM to figure out image placement.

#### Storage Integration

Images flow into the hybrid storage system from Q3:
- Tier 2 images ≤100KB → SQLite blob in `chunk_media.inline_blob`
- Tier 2 images >100KB → filesystem in `chunks_media/`, path in `chunk_media.external_path`
- Tier 3 rendered regions → same threshold, stored with `storage_source = "rendered"` flag so the system knows this was a vector graphic capture, not an original embedded image

The `storage_source` distinction matters for future re-processing: if pymupdf4llm improves its vector rendering, only `storage_source = "rendered"` images need re-extraction. Native images are already at original quality.

#### Orchestration and Progress Reporting

The three tiers run in sequence with progress reporting between each:

```
[Tier 1] Extracting text and structure... (fast — seconds)
  → "Found 12 sections, 23 bold terms, 15 equations"
  → Candidate skills available for preview

[Tier 2] Extracting images... (fast — sub-second)
  → "Found 8 embedded images (3 JPEG, 5 PNG, total 1.2MB)"

[Tier 3] Rendering vector graphics... (targeted — only if needed)
  → "Rendered 3 diagram regions from 2 pages"

[Tier 3b] Extracting tables... (targeted — only if needed)
  → "Re-processed 4 pages for table content"

[Complete] 40 pages processed in 4.2s
  → 12 sections, 11 images, 2 tables, parser confidence: medium
```

The UI can show incremental results: text/structure appears immediately from Tier 1 while images are still being processed. This is important for perceived performance — the user sees progress within the first second, not a spinner for 40 seconds.

#### Fallback for Scanned PDFs

Scanned PDFs (image-only pages with no extractable text) are a special case:
- Tier 1 returns empty or near-empty text → detection signal
- Fall back to OCR path: `pymupdf4llm.to_markdown(doc, use_ocr=True, ocr_dpi=300)`
- OCR is slow (~2-5s per page) but unavoidable for scanned content
- Report to user: "This appears to be a scanned document. Text extraction requires OCR and will take longer."
- Consider: for scanned textbooks, OCR quality on equations and diagrams is poor. Flag these chunks as `low_fidelity` and suggest the student also upload a digital version if available.

#### Licensing Note

pymupdf4llm is dual-licensed: AGPL 3.0 (open source) and commercial. The AGPL requires that if Study distributes pymupdf4llm as part of its application, Study's source code must also be available under AGPL-compatible terms. Since Study is already committed to open source, AGPL is compatible. If this changes, a commercial license from Artifex would be needed. PyMuPDF (the underlying library) has the same dual-license structure.

**References:**
- [pymupdf4llm API Documentation](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/api.html)
- [PyMuPDF Image Extraction Recipes](https://pymupdf.readthedocs.io/en/latest/recipes-images.html)
- [PyMuPDF Performance Benchmarks](https://pymupdf.readthedocs.io/en/latest/app4.html)
- [pymupdf4llm Changelog — Performance Fixes](https://github.com/pymupdf/pymupdf4llm/blob/main/CHANGES.md)
- [MuPDF Forum — StructTreeRoot Performance Issue](https://forum.mupdf.com/t/pymupdf4llm-performance/200/2)

---

### Cross-Parser Coordination

The three parsers don't operate in isolation. The syllabus provides the course skeleton; chapter parsing fills in the detail; assignment parsing anchors specific assessments to specific skills.

**Data flow:**
1. Syllabus uploaded → course skeleton with topic list and assessment timeline
2. Chapter uploaded → matches to syllabus topics via reading references, enriches topic skills with subsection detail
3. Assignment uploaded → decomposes into discrete items, each linked to chapter-derived skills and syllabus topics

**Cross-reference resolution:**
- Syllabus says "Chapter 5" → chapter parser has headings for Chapter 5 → assignment references "problems from Ch. 5" → all three converge on the same skill set
- The chunk content-hash deduplication system (MinHash LSH at Jaccard 0.7) catches when the same content appears in different uploads

**References:**
- [EPUB 3 Structural Semantics Vocabulary](https://idpf.github.io/epub-vocabs/structure/)
- [Schneider, D. K. — Textbook writing tutorial](http://edutechwiki.unige.ch/en/Textbook_writing_tutorial)
- [Structuring a Textbook with Pedagogical Elements (Indiana University / Pressbooks)](https://iu.pressbooks.pub/eastcmtf/chapter/structuring-a-textbook-with-pedagogical-elements/)
- [pymupdf4llm — PDF to Markdown](https://pymupdf.readthedocs.io/en/latest/)
- [python-docx — Working with Styles](https://python-docx.readthedocs.io/en/latest/user/styles-using.html)
- [Gradescope Assignment Types](https://guides.gradescope.com/hc/en-us/articles/22244660005901-Assignment-Types)
- [Respondus Formatting Guide (UAB)](https://www.uab.edu/elearning/academic-technologies/respondus/docx-formatting)

---

## What This Does NOT Change

- The IES learning science recommendations still apply (spaced repetition, interleaving, pre-questions, etc.)
- The core tutoring philosophy (teach to derive, never give answers) is unchanged
- The assignment-driven teaching approach is preserved and strengthened by the intent system
- Tauri as the deployment target
- Open source requirement
- SQLite for local storage
