# Facet Architecture — QA Report
**Date:** 2026-03-12
**Project:** study
**Orchestrator:** `docs/planning/facet-architecture-orchestrator-final.md`
**Phases Tested:** 0-7

---

## Phase 1: Schema Migration

| # | Test | Result |
|---|---|---|
| 1 | Migration 005 applies cleanly on existing database | PASS |
| 2 | All 5 tables created with correct columns and indexes | PASS |
| 3 | Foreign key constraints enforced (facets.skill_id → sub_skills.id) | PASS |
| 4 | `facet_mastery` DELETE RESTRICT prevents accidental data loss | PASS |
| 5 | `chunk_facet_bindings` accuracy columns present (binding_type, quality_rank, content_range, teaching_effectiveness) | PASS |
| 6 | Partial index on `facet_concept_links(facet_a_id, facet_b_id, link_type)` prevents duplicates | PASS |
| 7 | JS data migration (`migrateFacets`) promotes criteria to facets | PASS |
| 8 | Skills with ≤2 criteria → single "/core" facet | PASS |
| 9 | Skills with 3+ criteria → one facet per criterion | PASS |
| 10 | FSRS state copied correctly from sub_skill_mastery to facet_mastery | PASS |
| 11 | Chunk bindings copied to chunk_facet_bindings for all facets | PASS |
| 12 | Concept links copied to facet_concept_links | PASS |
| 13 | Question mappings copied to assignment_question_facets | PASS |
| 14 | Idempotent — re-running migrateFacets skips (settings flag) | PASS |

## Phase 2: Extraction Pipeline

| # | Test | Result |
|---|---|---|
| 15 | Extraction produces nested skill→facet output | PASS |
| 16 | `buildChunkIndex` includes chunk ID, label, preview, paragraph count | PASS |
| 17 | LLM output includes `sourceChunks` with exact chunk IDs | PASS |
| 18 | `resolveChunkBindingsDirect` reads IDs directly (no fuzzy matching) | PASS |
| 19 | Invalid chunk IDs fall back to heading match at lower confidence | PASS |
| 20 | Binding types classified correctly (teaches vs. references) | PASS |
| 21 | Content ranges present and valid for teaches bindings | PASS |
| 22 | Deterministic pre-merge catches duplicate concept_keys | PASS |
| 23 | `generateConceptLinks` operates at facet level | PASS |
| 24 | Cross-domain concept links detected between facets | PASS |
| 25 | Enrichment adds facets to existing skills when new material covers new aspects | PASS |

## Phase 3: Binding Quality Scoring

| # | Test | Result |
|---|---|---|
| 26 | `computeBindingScore` returns numeric score 0-100 | PASS |
| 27 | teaches (40pts) outranks references (10pts) | PASS |
| 28 | Higher confidence outranks lower | PASS |
| 29 | Focused content_range outranks whole-chunk binding | PASS |
| 30 | textbook (15pts) outranks slides (6pts) | PASS |
| 31 | `rankBindingsForFacet` assigns rank 1=best, 2=second, etc. | PASS |
| 32 | Rankings update when new bindings are added (post-enrichment) | PASS |
| 33 | `getByFacetRanked` returns bindings in correct order | PASS |

## Phase 4: FSRS Migration

| # | Test | Result |
|---|---|---|
| 34 | `applySkillUpdates` updates `facet_mastery` (not `sub_skill_mastery`) | PASS |
| 35 | `effectiveStrength` computes at facet level | PASS |
| 36 | `nextReviewDate` computes at facet level | PASS |
| 37 | Skill-level readiness = avg of facet retrievabilities | PASS |
| 38 | Mastery transfer operates between facets via `facet_concept_links` | PASS |
| 39 | Practice mode tracks facet-level practice sets | PASS |
| 40 | FSRS math unchanged (same D, S, R calculations) | PASS |

## Phase 5: Context Builder

| # | Test | Result |
|---|---|---|
| 41 | Assignment mode: traverses question→facets→chunk_facet_bindings→chunks | PASS |
| 42 | Skill mode: traverses skill→facets→bindings→chunks | PASS |
| 43 | Binding type filter: teaches bindings prioritized | PASS |
| 44 | Quality rank respected: best-ranked chunk loaded first | PASS |
| 45 | Content range used: partial chunk content extracted when present | PASS |
| 46 | Cross-domain chunks loaded via `loadCrossDomainChunks` | PASS |
| 47 | Prerequisite bindings loaded only when mastery is low | PASS |
| 48 | References bindings excluded in focused modes | PASS |
| 49 | General/recap/explore sessions retain keyword fallback | PASS |
| 50 | No regression in open-ended chat quality | PASS |

## Phase 6: UI Updates

| # | Test | Result |
|---|---|---|
| 51 | ProfileScreen shows facets when skill expanded | PASS |
| 52 | SkillsPanel shows facets when expanded | PASS |
| 53 | ModePicker nudge uses facet-level readiness | PASS |
| 54 | ScheduleScreen readiness computed from facet mastery | PASS |

## Phase 7: Decomposition Pipeline

| # | Test | Result |
|---|---|---|
| 55 | `decomposeAssignments` references facets in prompt | PASS |
| 56 | `resolveFacetId` maps LLM output to facet IDs | PASS |
| 57 | `saveQuestions` writes to `assignment_question_facets` | PASS |
| 58 | `getQuestions` joins through `assignment_question_facets` → `facets` | PASS |

## FSRS Integrity Verification

| Check | Result |
|---|---|
| Difficulty calculation unchanged | PASS |
| Stability calculation unchanged | PASS |
| Retrievability decay unchanged | PASS |
| next_review_at scheduling unchanged | PASS |
| Mastery transfer proportional bonus unchanged | PASS |
| Grade mapping (again/hard/good/easy) unchanged | PASS |

## Summary

- **Total tests:** 58
- **Pass:** 58
- **Fail:** 0
- **Critical findings:** 0
- **Build verified:** Yes
- **FSRS integrity:** Confirmed — math identical, only entity changed (sub_skill → facet)
