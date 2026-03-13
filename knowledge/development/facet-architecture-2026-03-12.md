# Facet Architecture — Development Log
**Date:** 2026-03-12
**Project:** study
**Orchestrator:** `docs/planning/facet-architecture-orchestrator-final.md`
**Status:** All 8 phases complete

---

## Phase 0: Extraction Granularity Audit

**Agent:** Research Analyst → Systems Analyst
**Output:** `knowledge/research/extraction-granularity-audit-2026-03-12.md`, `knowledge/architecture/facet-extraction-spec-2026-03-12.md`

Audit of existing sub_skills confirmed that mastery_criteria frequently contained multiple independently-testable facets under a single skill. Chunk binding accuracy analysis showed significant fallback to 0.5 confidence (all-chapter binding) when heading labels didn't match. SA produced facet extraction spec with nested skill→facet output structure, direct chunk ID references, binding type classification, and content range annotation.

## Phase 1: Schema Migration (Migration 005)

**Agent:** SA → DEV
**Output:** `005_facets.sql`, `migrateFacets()` in db.js, 5 new DB modules
**Architecture:** `knowledge/architecture/facet-migration-005-2026-03-12.md`

5 new tables: `facets`, `facet_mastery`, `chunk_facet_bindings`, `facet_concept_links`, `assignment_question_facets`. All accuracy columns included from day one: `binding_type`, `quality_rank`, `content_range`, `teaching_effectiveness`.

JS data migration (`migrateFacets()`): promotes existing mastery_criteria to facet rows. Skills with ≤2 criteria get a single "/core" facet; skills with 3+ criteria get one facet per criterion with concept_key suffixes "/f1", "/f2", etc. FSRS state copied from `sub_skill_mastery` to `facet_mastery` for each facet (baseline). Chunk bindings, concept links, and question mappings all copied to facet-level tables. Idempotent via `settings.facet_migration_done` flag.

5 new DB modules in db.js:
- **Facets:** getBySkill, getByCourse, getById, create, createBatch, update, archive, getAllActive, findByConceptKey
- **FacetMastery:** get, getByFacets, getAll, getDueForReview, upsert, upsertBatch
- **ChunkFacetBindings:** getByFacet (with type/confidence filters), getByFacetRanked (ordered by type→rank→confidence), getByChunk, create, createBatch, deleteByFacetIds, updateQualityRanks
- **FacetConceptLinks:** create, createBatch, getByFacet, getByFacetBatch, getByCourse, delete, deleteByFacet
- **AssignmentQuestionFacets:** getByQuestion, getByFacet, create, createBatch, deleteByQuestion

## Phase 2: Extraction Pipeline Changes

**Agent:** SA → DEV
**Output:** Modified extraction.js (~700 lines changed)
**Architecture:** `knowledge/architecture/facet-extraction-pipeline-2026-03-12.md`

Accuracy improvements integrated:
1. **Direct chunk ID references:** `buildChunkIndex()` creates chunk index for LLM with ID, label, preview, paragraph count. LLM outputs exact chunk IDs in `sourceChunks` array. `resolveChunkBindingsDirect` reads IDs directly — no fuzzy matching. Fallback to heading match at lower confidence for invalid IDs.
2. **Binding type classification:** Each binding tagged `teaches`/`references`/`prerequisite_for` by the LLM.
3. **Content range annotation:** `[P#]` markers in prompt, `{paragraphs: [...]}` stored on bindings.
4. **Deterministic pre-merge:** Before running `generateConceptLinks`, new facets compared against existing by `concept_key`. Auto-merge on match without LLM call.

Extraction prompt restructured: flat skill array → nested skill→facet structure. Each facet includes `sourceChunks` with chunkId, bindingType, contentRange, confidence. Enrichment prompt updated for facet-level enrichment.

`generateConceptLinks` updated to operate at facet level with cross-domain support (compares facets across different parent skills/CIP domains).

## Phase 3: Binding Quality Scoring

**Agent:** SA → DEV
**Output:** `computeBindingScore()`, `rankBindingsForFacet()`, `rankBindingsForFacets()` in extraction.js
**Architecture:** `knowledge/architecture/facet-binding-quality-2026-03-12.md`

Composite scoring: binding_type (0-40 pts) + confidence (0-30 pts) + content_range focus (0-15 pts) + material classification (0-15 pts). Rank 1 = best source. Called after extraction and enrichment. `getByFacetRanked()` returns bindings ordered by type→rank→confidence.

## Phase 4: FSRS Migration

**Agent:** SA → DEV

FSRS moved from sub_skill to facet level. `applySkillUpdates` in study.js modified to receive facet-level ratings, update `FacetMastery.upsert` instead of `sub_skill_mastery`. `effectiveStrength` and `nextReviewDate` operate on facets. Skill-level readiness computed as aggregate of facet retrievabilities. Mastery transfer via concept links operates between facets. `sub_skill_mastery` deprecated — retained for backward compatibility but no longer written to by active code paths.

6 `FacetMastery` reference sites in study.js. FSRS math unchanged — only the entity it operates on changed.

## Phase 5: Context Builder Rework

**Agent:** SA → DEV
**Output:** Modified study.js — `loadCrossDomainChunks`, `ChunkFacetBindings` integration

Context builder (`buildFocusedContext` + `buildContext`) now traverses binding graph instead of keyword matching for focused modes. Filters by `binding_type = 'teaches'`, orders by `quality_rank`. Uses `content_range` to extract partial chunk content when present. `loadCrossDomainChunks` queries `facet_concept_links` → linked facets in other courses → their teaches bindings → chunks. Prerequisite bindings loaded only when student mastery is low. References bindings excluded in focused modes. General/recap/explore sessions retain keyword fallback.

3 `ChunkFacetBindings` reference sites, 3 `loadCrossDomainChunks` reference sites, 3 `content_range` usage sites in study.js.

## Phase 6: UI Updates

**Agent:** UXD → DEV
**Output:** CurriculumScreen.jsx (496 lines), updated ProfileScreen, ScheduleScreen, ModePicker

CurriculumScreen displays facet-level data in the assignment→question→skill hierarchy. ProfileScreen and SkillsPanel updated to show facets when expanded. ModePicker nudge calculations use facet-level readiness. ScheduleScreen assignment readiness computed from facet mastery.

## Phase 7: Decomposition Pipeline Update

**Agent:** SA → DEV
**Output:** Modified skills.js, db.js (Assignments module)

`decomposeAssignments` prompt updated to reference facets instead of skills. `resolveFacetId` replaces `resolveSkillId` for mapping LLM output to facet IDs. `Assignments.saveQuestions` writes to `assignment_question_facets` instead of `assignment_question_skills`. `Assignments.getQuestions` joins through `assignment_question_facets` → `facets`.

## Files Changed Summary

| File | Changes |
|---|---|
| db.js | +751 lines — 5 new modules (Facets, FacetMastery, ChunkFacetBindings, FacetConceptLinks, AssignmentQuestionFacets), `migrateFacets()`, `resolveFacetId` |
| extraction.js | +666 lines — faceted prompt, `buildChunkIndex`, `resolveChunkBindingsDirect`, binding scoring, pre-merge |
| study.js | +489 lines — FSRS on facets, graph-traversal context builder, `loadCrossDomainChunks`, content_range extraction |
| skills.js | +45 lines — `rankBindingsForFacet` integration, decomposition facet mapping |
| conceptLinks.js | +117 lines — facet-level comparison, cross-domain support |
| CurriculumScreen.jsx | New file (496 lines) |
| ScheduleScreen.jsx | +147 lines — activation toggles, summary bar |
| HomeScreen.jsx | +50 lines — state machine, curriculum summary row |
| ScreenRouter.jsx | +4 lines — curriculum route |
