# Migration 005: Facet Architecture
**Date:** 2026-03-12
**Phase:** 1 — Schema Migration
**Status:** Complete

---

## Overview

Migration 005 introduces five new tables to support the facet architecture, where mastery criteria are promoted from JSON strings on `sub_skills` to first-class trackable entities with own FSRS schedules, typed chunk bindings, cross-domain concept links, and assignment question mappings.

## New Tables

### 1. `facets`
Atomic trackable learning units under `sub_skills`.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| skill_id | INTEGER FK | → sub_skills(id) ON DELETE CASCADE |
| name | TEXT NOT NULL | Facet display name |
| description | TEXT | Detailed description |
| concept_key | TEXT | Identity key: `category/facet-kebab-name` |
| skill_type | TEXT | procedural/conceptual/recall/synthesis |
| blooms_level | TEXT | Bloom's taxonomy level |
| mastery_criteria | TEXT (JSON) | Array of `{text, source, addedAt}` |
| evidence | TEXT (JSON) | `{anchorTerms, definitionsFound, ...}` |
| is_archived | INTEGER | Soft delete (default 0) |
| created_at | INTEGER | Unix epoch seconds |
| updated_at | INTEGER | Last modification |

**Indexes:** skill_id, concept_key, skill_type

### 2. `facet_mastery`
FSRS spaced-repetition state per facet.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| facet_id | INTEGER UNIQUE FK | → facets(id) ON DELETE RESTRICT |
| difficulty | REAL | FSRS difficulty (default 0.3) |
| stability | REAL | FSRS stability (default 1.0) |
| retrievability | REAL | FSRS retrievability (default 1.0) |
| reps | INTEGER | Review count (default 0) |
| lapses | INTEGER | Lapse count (default 0) |
| last_review_at | INTEGER | Last review timestamp |
| next_review_at | INTEGER | Next scheduled review |
| last_rating | TEXT | Most recent rating string |
| total_mastery_points | REAL | Accumulated points (default 0.0) |
| updated_at | INTEGER | Last modification |

**FK constraint:** ON DELETE RESTRICT (cannot delete facet with mastery record — must archive instead)
**Indexes:** facet_id (unique), next_review_at

### 3. `chunk_facet_bindings`
Typed, quality-ranked chunk-to-facet relationships with content range annotation.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| chunk_id | TEXT FK | → chunks(id) ON DELETE CASCADE |
| facet_id | INTEGER FK | → facets(id) ON DELETE CASCADE |
| extraction_context | TEXT | Section heading or quality note |
| confidence | REAL | 1.0 (direct ID), 0.9, 0.5 |
| binding_type | TEXT | `teaches` / `references` / `prerequisite_for` (default teaches) |
| quality_rank | INTEGER | 0=unranked, 1=best, 2=second (default 0) |
| content_range | TEXT (JSON) | `{paragraphs: [3,4,5]}` — which portion of chunk is relevant |
| teaching_effectiveness | REAL | null initially, future feedback signal |
| extracted_at | INTEGER | When binding was created |
| updated_at | INTEGER | Last modification |

**Indexes:** chunk_id, facet_id, binding_type, (facet_id + quality_rank)

### 4. `facet_concept_links`
Cross-domain relationships between facets.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| facet_a_id | INTEGER FK | → facets(id) ON DELETE CASCADE |
| facet_b_id | INTEGER FK | → facets(id) ON DELETE CASCADE |
| similarity_score | REAL | 0.0-1.0 |
| link_type | TEXT | `same_concept` / `prerequisite` / `related` |
| reason | TEXT | LLM explanation |
| created_at | INTEGER | When link was created |

**Constraint:** CHECK (facet_a_id < facet_b_id) — canonical ordering
**Index:** UNIQUE (facet_a_id, facet_b_id, link_type)

### 5. `assignment_question_facets`
Maps assignment questions to specific facets.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| question_id | INTEGER FK | → assignment_questions(id) ON DELETE CASCADE |
| facet_id | INTEGER FK | → facets(id) ON DELETE CASCADE |

**Indexes:** question_id, facet_id

## Data Migration Strategy

The SQL migration (005_facets.sql) creates the schema only. Data promotion from existing `sub_skills` to `facets` is handled by the `migrateFacets()` JS function in db.js, which runs on first boot after the schema migration.

### Migration Rules

| Existing State | Action |
|---|---|
| Skill with ≤2 mastery criteria | Create ONE facet (name = skill name, key = `{key}/core`) with all criteria |
| Skill with 3+ mastery criteria | Create ONE facet per criterion (name = criterion text, key = `{key}/f1`, `/f2`, ...) |
| Skill with no mastery criteria | Create ONE facet (name = skill name, no criteria) |

### Data Copying

For each skill → facets migration:

1. **FSRS state**: Copy `sub_skill_mastery` → `facet_mastery` for each facet (all facets inherit parent skill's FSRS baseline)
2. **Chunk bindings**: Copy `chunk_skill_bindings` → `chunk_facet_bindings` for ALL facets (conservative — all facets share bindings initially; binding_type = 'teaches', quality_rank = 0)
3. **Concept links**: Copy `concept_links` → `facet_concept_links` between all facet pairs of linked skills
4. **Question mappings**: Copy `assignment_question_skills` → `assignment_question_facets` for ALL facets (refined later by decomposition)

### Safety

- **Idempotent**: Checks `settings.facet_migration_done` flag before running
- **Transactional**: All operations in a single `withTransaction()` call
- **Non-destructive**: Original `sub_skills`, `sub_skill_mastery`, `chunk_skill_bindings`, `concept_links`, and `assignment_question_skills` tables are untouched

## DB Modules Added

| Module | Methods | Location |
|---|---|---|
| `Facets` | getBySkill, getByCourse, getById, create, createBatch, update, archive, findByConceptKey | db.js |
| `FacetMastery` | get, getByFacets, getAll, getDueForReview, upsert, upsertBatch | db.js |
| `ChunkFacetBindings` | getByFacet (w/ type/confidence filters), getByFacetRanked, getByChunk, create, createBatch, deleteByFacetIds, updateQualityRanks | db.js |
| `FacetConceptLinks` | create, createBatch, getByFacet, getByFacetBatch, getByCourse, delete, deleteByFacet | db.js |
| `AssignmentQuestionFacets` | getByQuestion, getByFacet, create, createBatch, deleteByQuestion | db.js |
| `migrateFacets` | One-time data promotion function | db.js |

## Files Changed

| File | Change |
|---|---|
| `src-tauri/migrations/005_facets.sql` | New — 5 tables + indexes + migration flag |
| `src-tauri/src/lib.rs` | Register migrations 004 + 005 (004 was missing) |
| `src/lib/db.js` | +5 DB modules, migrateFacets(), updated resetAll() |

## QA Validation Plan

1. **Fresh install**: Verify all 5 tables created empty, settings flag set to '0'
2. **Migration with data**: Upload material → extract skills → run migrateFacets() → verify:
   - facets count = sum of mastery_criteria across all skills (or 1 per skill if ≤2 criteria)
   - facet_mastery count = facets count (for skills with FSRS state)
   - chunk_facet_bindings count = chunk_skill_bindings × facets_per_skill
   - facet_concept_links count ≥ concept_links count
   - assignment_question_facets count = assignment_question_skills × facets_per_skill
3. **Idempotency**: Run migrateFacets() twice → no duplicates, second run returns `{skipped: true}`
4. **Reset**: Verify resetAll() clears all 5 new tables
5. **Build**: Vite build passes (verified ✓)
