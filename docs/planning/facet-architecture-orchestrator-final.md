# Facet Architecture — Orchestrator Plan
**Project:** study
**Date:** 2026-03-12
**Requested By:** CEO
**Status:** APPROVED — Ready for Execution
**Dependency:** This plan must complete before the Curriculum Dashboard plan executes.

---

## Feature Summary

Restructure the skill hierarchy from two tiers to three tiers by promoting mastery criteria into first-class trackable entities called **facets**. Each facet gets its own FSRS schedule, its own chunk bindings, and participates independently in concept links. This makes the atomic unit of learning granular enough to match what professors actually test, and enables cross-domain connections at the precise level where knowledge overlaps.

Additionally, this plan addresses six extraction accuracy improvements that strengthen the data relationships between chunks, facets, skills, and the AI tutor context. These improvements are folded into the relevant phases rather than treated separately.

**Before (current):**
```
Domain (42 CIP domains)
  └── Parent Skill ("Data Structures")
        └── Sub Skill ("BST Operations")
              └── mastery_criteria: ["Can insert", "Can delete", "Can search"]  ← JSON strings, no FSRS
```

**After:**
```
Domain (42 CIP domains)
  └── Parent Skill ("Data Structures")
        └── Skill ("BST Operations")                    ← renamed from sub_skill
              └── Facet ("BST Insertion")                ← promoted from mastery_criteria
                    ├── Own FSRS schedule
                    ├── Own chunk bindings (with type + quality rank)
                    ├── Own concept link participation (cross-domain)
                    └── mastery_criteria: ["Can insert node maintaining BST property",
                                           "Handles duplicate keys correctly"]
```

**Extraction Accuracy Improvements (integrated):**
1. **Direct chunk ID references** — LLM receives chunk IDs in prompt, outputs exact IDs instead of heading labels that need fuzzy matching
2. **Concept-tagging within chunks** — bindings annotate which portion of a chunk teaches a facet, so the context builder loads relevant content, not the whole chunk
3. **Binding quality scoring** — when multiple chunks teach the same facet, rank them by teaching quality so the context builder loads the best source first
4. **Effectiveness tracking schema** — design chunk_facet_bindings to support future learning-outcome feedback (deferred for implementation, built into schema now)
5. **Deterministic pre-merge** — auto-merge duplicate facets by concept_key before running LLM concept link comparison
6. **Binding type classification** — each binding tagged as teaches/references/prerequisite_for so the context builder prioritizes appropriately

---

## Current State Analysis

### Current Schema (relevant tables)

| Table | Role | Atomic unit? |
|---|---|---|
| `parent_skills` | Top-level grouping (CIP taxonomy) | No — grouping only |
| `sub_skills` | Extracted skills with mastery_criteria JSON | Yes — FSRS tracks this |
| `sub_skill_mastery` | FSRS state per sub_skill | Tracks sub_skills |
| `chunk_skill_bindings` | Links chunks → sub_skills | Points to sub_skills |
| `concept_links` | Cross-skill similarity | Between sub_skills |
| `assignment_question_skills` | Maps assignment questions → sub_skills | Points to sub_skills |
| `skill_prerequisites` | Directed prerequisite graph | Between sub_skills |
| `session_skills` | Skills active in a study session | Points to sub_skills |

### Current Extraction Accuracy Weaknesses

| Problem | Where | Impact |
|---|---|---|
| Chunk binding uses heading-label fuzzy matching | `resolveChunkBindings` in extraction.js | Falls back to binding skill to ALL chapter chunks at confidence 0.5 when labels don't match |
| Chunks are structural units, not concept units | chunker.js (MIN_CHUNK 2000, HARD_MAX 20000) | A 12,000-char chunk about "Trees" contains 3 separate concepts. Binding says "this chunk teaches BST Insertion" but 80% of the chunk is about something else. |
| Enrichment doesn't refine bindings | extraction.js enrichment pass | Old low-confidence bindings persist alongside new high-confidence ones. No preference signal. |
| No feedback from tutoring to binding quality | study.js context builder | Chunks that fail to teach are never demoted. Chunks that succeed are never promoted. |
| Cross-material duplicates not pre-merged | conceptLinks.js | Same concept extracted from textbook, slides, and notes produces 3 skills. Concept links catch some but not all. |
| All bindings treated equally | chunk_skill_bindings schema | "This chunk teaches recursion" and "this chunk mentions recursion in passing" stored identically |

### What Changes

| Component | Current | After |
|---|---|---|
| `sub_skills` table | Atomic trackable unit | Becomes a grouping layer for facets |
| `mastery_criteria` | JSON array on sub_skill | Promoted to `facets` table rows |
| FSRS tracking | On sub_skill | On facet |
| `chunk_skill_bindings` | chunk → sub_skill, heading-label fuzzy match | chunk → facet via `chunk_facet_bindings`, direct ID reference, typed, quality-ranked |
| `concept_links` | Between sub_skills, same-parent only | Between facets, cross-domain |
| `assignment_question_skills` | question → sub_skill | question → facet |
| Context builder | Loads chunks by keyword match | Traverses facet → chunk bindings by type and quality rank |

---

## Architecture Design

### Schema Changes

#### New Table: `facets`

```sql
CREATE TABLE IF NOT EXISTS facets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id         INTEGER NOT NULL,          -- FK to sub_skills (the "skill" layer)
    name             TEXT NOT NULL,              -- "BST Insertion"
    description      TEXT,                       -- "Can insert a node into a BST maintaining the BST property"
    concept_key      TEXT,                       -- "data-structures/bst-insertion"
    skill_type       TEXT,                       -- procedural | conceptual | recall | synthesis
    blooms_level     TEXT,                       -- remember | understand | apply | analyze | evaluate | create
    mastery_criteria TEXT,                       -- JSON array of testable statements specific to this facet
    evidence         TEXT,                       -- JSON: anchor terms, definitions, examples
    is_archived      INTEGER DEFAULT 0,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER,
    FOREIGN KEY (skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facets_skill ON facets(skill_id);
CREATE INDEX IF NOT EXISTS idx_facets_concept ON facets(concept_key);
CREATE INDEX IF NOT EXISTS idx_facets_type ON facets(skill_type);
```

#### New Table: `facet_mastery`

```sql
CREATE TABLE IF NOT EXISTS facet_mastery (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    facet_id             INTEGER NOT NULL UNIQUE,
    difficulty           REAL NOT NULL DEFAULT 0.3,
    stability            REAL NOT NULL DEFAULT 1.0,
    retrievability       REAL NOT NULL DEFAULT 1.0,
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    last_review_at       INTEGER,
    next_review_at       INTEGER,
    last_rating          TEXT,
    total_mastery_points REAL NOT NULL DEFAULT 0.0,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_facet_mastery_facet ON facet_mastery(facet_id);
CREATE INDEX IF NOT EXISTS idx_facet_mastery_next_review ON facet_mastery(next_review_at);
```

#### New Table: `chunk_facet_bindings`

Incorporates accuracy improvements: binding_type, quality_rank, content_range, teaching_effectiveness.

```sql
CREATE TABLE IF NOT EXISTS chunk_facet_bindings (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id              TEXT NOT NULL,
    facet_id              INTEGER NOT NULL,
    extraction_context    TEXT,                     -- section heading or label
    confidence            REAL,                     -- 1.0 direct ID, 0.9 high, 0.5 fallback
    binding_type          TEXT DEFAULT 'teaches',   -- teaches | references | prerequisite_for
    quality_rank          INTEGER DEFAULT 0,        -- 0=unranked, 1=best, 2=second, etc. per facet
    content_range         TEXT,                     -- JSON: {startChar, endChar} or {paragraphs: [3,4,5,6,7]}
                                                    -- which portion of the chunk teaches this facet
    teaching_effectiveness REAL,                    -- null initially; updated by learning outcome feedback (future)
    extracted_at          INTEGER NOT NULL,
    updated_at            INTEGER,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cfb_chunk ON chunk_facet_bindings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_cfb_facet ON chunk_facet_bindings(facet_id);
CREATE INDEX IF NOT EXISTS idx_cfb_type ON chunk_facet_bindings(binding_type);
CREATE INDEX IF NOT EXISTS idx_cfb_quality ON chunk_facet_bindings(facet_id, quality_rank);
```

#### New Table: `facet_concept_links`

```sql
CREATE TABLE IF NOT EXISTS facet_concept_links (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    facet_a_id       INTEGER NOT NULL,
    facet_b_id       INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    link_type        TEXT NOT NULL,             -- same_concept | prerequisite | related
    reason           TEXT,                      -- LLM explanation of why these are linked
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (facet_a_id) REFERENCES facets(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_b_id) REFERENCES facets(id) ON DELETE CASCADE,
    CHECK (facet_a_id < facet_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facet_link_pair 
    ON facet_concept_links(facet_a_id, facet_b_id, link_type);
```

#### New Table: `assignment_question_facets`

```sql
CREATE TABLE IF NOT EXISTS assignment_question_facets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id     INTEGER NOT NULL,
    facet_id        INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (facet_id) REFERENCES facets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aqf_question ON assignment_question_facets(question_id);
CREATE INDEX IF NOT EXISTS idx_aqf_facet ON assignment_question_facets(facet_id);
```

### Naming Convention Decision

**CEO Decision Required:**

- **Option A: Rename sub_skills → skills in code, keep SQL table name**
- **Option B: Rename everything** — table and code
- **Option C: Keep all names, add facets below** — lowest risk

**Recommendation:** Option C

I agree with option C. 
### Relationship Graph (After)

```
parent_skills (Domain grouping — "Data Structures")
    │
    ├── sub_skills (Skill grouping — "BST Operations")
    │       │
    │       ├── facets (Atomic — "BST Insertion")
    │       │     ├── facet_mastery (FSRS state)
    │       │     ├── chunk_facet_bindings → chunks
    │       │     │     ├── binding_type: teaches | references | prerequisite_for
    │       │     │     ├── quality_rank: 1 (best source), 2, 3...
    │       │     │     ├── content_range: {paragraphs: [3,4,5,6,7]}
    │       │     │     └── teaching_effectiveness: null (future feedback)
    │       │     ├── facet_concept_links ↔ other facets (cross-domain)
    │       │     └── assignment_question_facets ← questions
    │       │
    │       ├── facets ("BST Deletion")
    │       └── facets ("BST Search")
    │
    └── sub_skills ("Tree Traversal Algorithms")
            └── facets (...)
```

### Context Builder Rework

**Current:** `buildFocusedContext` and `buildContext` guess which chunks are relevant via keyword/name matching against recent messages and material names. `chunk_skill_bindings` are ignored.

**After:** The context builder traverses the relationship graph:

1. Determine active facets (from assignment questions, or selected skill's facets)
2. Query `chunk_facet_bindings` for each facet, filtered by `binding_type = 'teaches'`, ordered by `quality_rank`
3. For each binding, use `content_range` to load only the relevant portion of the chunk (not the whole 15,000-char chunk)
4. Query `facet_concept_links` for cross-domain connections
5. If a linked facet from another domain has high-confidence `teaches` bindings, pull those chunks too
6. For prerequisite facets (`binding_type = 'prerequisite_for'`), load those chunks only if the student's mastery on the prerequisite is low
7. Ignore `references` bindings unless doing broad review or exploration

---

## Implementation Phases

### Phase 0: Extraction Granularity Audit
**Agent:** Research Analyst → Systems Analyst
**Scope:** Verify current extraction output and determine how facet extraction should work

**Shared with the Curriculum Dashboard plan.**

**Tasks:**
1. RA: Pull real sub_skills from an active course. List concept_keys, mastery_criteria, categories.
2. RA: Pull real assignment decompositions. List question → skill mappings.
3. RA: Identify where mastery_criteria contain multiple independently-testable facets under one skill.
4. RA: Identify chunk binding accuracy — how many bindings fell back to confidence 0.5 (all-chapter fallback)? How many heading-label matches succeeded vs. failed?
5. SA: Design the extraction prompt changes:
   - Nested skill→facet output structure
   - Direct chunk ID references (LLM receives chunk index with IDs, outputs IDs instead of labels)
   - Binding type classification (teaches/references/prerequisite_for) per facet-chunk pair
   - Content range annotation (which paragraphs/portion of the chunk teaches this facet)
6. SA: Produce extraction prompt revision spec + facet schema spec

**Output:** `knowledge/research/extraction-granularity-audit-2026-03-12.md`, `knowledge/architecture/facet-extraction-spec-2026-03-12.md`

**Estimated complexity:** Medium

---

### Phase 1: Schema Migration
**Agent:** SA → DEV → QA
**Scope:** Migration 005 — all new tables, data promotion from existing mastery_criteria

**Tasks:**
1. SA: Architecture doc for migration 005 — tables, indexes, data migration strategy
2. SA: Design data migration — existing mastery_criteria promoted to facet rows:
   - For each sub_skill with mastery_criteria, create one facet per criterion
   - Copy FSRS state from sub_skill_mastery to each facet's facet_mastery (baseline)
   - Copy chunk_skill_bindings to chunk_facet_bindings (all facets of a skill initially share bindings)
   - Copy concept_links to facet_concept_links (all facets inherit skill-level links)
   - Copy assignment_question_skills to assignment_question_facets (refined later by decomposition)
3. DEV: Create migration 005 SQL file with all new tables including accuracy columns (`binding_type`, `quality_rank`, `content_range`, `teaching_effectiveness`)
4. DEV: Build migration runner that promotes existing data
5. DEV: Add `Facets` DB module — CRUD:
   - `getBySkill(skillId)`, `getByCourse(courseId)`, `getById(id)`
   - `create()`, `createBatch()`, `update()`, `archive()`
6. DEV: Add `FacetMastery` DB module — FSRS operations:
   - `get(facetId)`, `getAll(courseId)`, `upsert(facetId, fsrsState)`
   - `getDueForReview(courseId, epoch)`
7. DEV: Add `ChunkFacetBindings` DB module:
   - `getByFacet(facetId, { type, minConfidence })` — filter by binding type and confidence
   - `getByFacetRanked(facetId)` — ordered by quality_rank, teaches-type first
   - `getByChunk(chunkId)`, `create/createBatch`, `deleteByFacetIds`
   - `updateQualityRanks(facetId, rankings)` — set quality_rank per binding
8. DEV: Add `FacetConceptLinks` DB module — same interface as `ConceptLinks` but on facet IDs
9. DEV: Add `AssignmentQuestionFacets` DB module:
   - `getByQuestion(questionId)`, `getByFacet(facetId)`
10. QA: Verify migration on existing database with real data, validate data promotion integrity

**Output:** Architecture doc, migration 005, updated db.js with 5 new modules, QA report

**Estimated complexity:** High

---

### Phase 2: Extraction Pipeline Changes
**Agent:** SA → DEV → QA
**Scope:** Modify extraction to produce skills with nested facets, direct chunk ID binding, binding type classification, content range annotation

**This phase integrates accuracy improvements #1, #2, #5, and #6.**

**Tasks:**
1. SA: Revise extraction prompt output schema:
```json
{
  "name": "BST Operations",
  "conceptKey": "data-structures/bst-operations",
  "description": "Core binary search tree manipulation",
  "category": "Trees",
  "facets": [
    {
      "name": "BST Insertion",
      "conceptKey": "data-structures/bst-insertion",
      "description": "Insert a node maintaining BST property",
      "skillType": "procedural",
      "bloomsLevel": "apply",
      "masteryCriteria": ["Can insert maintaining order", "Handles duplicates"],
      "sourceChunks": [
        {
          "chunkId": "chunk-uuid-abc",
          "bindingType": "teaches",
          "contentRange": {"paragraphs": [3, 4, 5, 6, 7]},
          "confidence": 0.95
        }
      ]
    }
  ],
  "prerequisites": ["data-structures/binary-tree-traversal"]
}
```
2. SA: Revise the chunk index passed to the LLM — instead of just section headings, pass:
   - Chunk ID
   - Chunk label (heading)
   - First ~200 chars of content (preview)
   - Paragraph count
   This gives the LLM enough context to output exact chunk IDs and paragraph ranges.
3. SA: Revise enrichment prompt to add facets to existing skills when new material covers new aspects
4. DEV: Modify `buildInitialExtractionPrompt` to include chunk index with IDs and previews
5. DEV: Modify extraction prompt to request faceted output with direct `sourceChunks` (IDs + binding type + content range)
6. DEV: Modify `buildEnrichmentPrompt` to handle facet-level enrichment
7. DEV: Replace `resolveChunkBindings` (heading-label fuzzy matching) with `resolveChunkBindingsDirect` — reads chunk IDs directly from LLM output, no fuzzy matching. Fallback: if LLM outputs an invalid chunk ID, fall back to heading match at lower confidence.
8. DEV: Modify extraction result processing to:
   - Create sub_skill row (skill grouping)
   - Create facet rows under it
   - Create chunk_facet_bindings with binding_type, content_range, and confidence from LLM output
9. DEV: Add deterministic pre-merge step (**accuracy improvement #5**): before running `generateConceptLinks`, compare new facets against existing facets by `concept_key`. If two facets share the same concept_key (after normalization), auto-merge without an LLM call. Log merged pairs.
10. DEV: Update `generateConceptLinks` to compare facets instead of skills, with cross-domain support
11. QA: Run extraction on test materials, verify:
    - Skills have facets with correct granularity
    - Facets have chunk bindings with correct IDs (no 0.5 fallbacks on well-structured docs)
    - Binding types are classified correctly (teaches vs. references)
    - Content ranges are present and valid
    - Pre-merge catches obvious duplicates

**Output:** Architecture doc, modified extraction.js, modified conceptLinks.js, QA report

**Estimated complexity:** High — extraction pipeline (~1,500 lines) has significant changes: prompt restructure, result processing, binding resolution rewrite

---

### Phase 3: Binding Quality Scoring
**Agent:** SA → DEV → QA
**Scope:** When multiple chunks are bound to the same facet, rank them by teaching quality

**This phase integrates accuracy improvement #3.**

**Tasks:**
1. SA: Define quality scoring criteria:
   - `binding_type = 'teaches'` outranks `references` and `prerequisite_for`
   - Higher `confidence` outranks lower
   - Smaller `content_range` (more focused) outranks larger (whole-chunk binding)
   - Primary source material (textbook) outranks secondary (slides, notes) for initial ranking
   - Material classification informs ranking: textbook > lecture_transcript > notes > slides for `teaches` bindings
2. DEV: Implement `rankBindingsForFacet(facetId)` — applies scoring criteria, updates `quality_rank` column
3. DEV: Call `rankBindingsForFacet` after extraction completes and after enrichment adds new bindings
4. DEV: Add `ChunkFacetBindings.getByFacetRanked(facetId)` — returns bindings ordered by quality_rank
5. QA: Verify rankings are stable, correct, and update when new bindings are added

**Output:** Architecture doc, binding ranking logic, QA report

**Estimated complexity:** Low-Medium — scoring is deterministic, no LLM calls

---

### Phase 4: FSRS Migration
**Agent:** SA → DEV → QA
**Scope:** Move FSRS tracking from sub_skill level to facet level

**Tasks:**
1. SA: Architecture for FSRS migration — how applySkillUpdates changes to operate on facets
2. DEV: Modify `applySkillUpdates` in study.js to:
   - Receive facet-level ratings (not skill-level)
   - Update `facet_mastery` instead of `sub_skill_mastery`
   - Skill-level readiness becomes computed aggregate (avg of facet retrievabilities)
3. DEV: Modify `effectiveStrength` to work at facet level
4. DEV: Modify `nextReviewDate` to work at facet level
5. DEV: Modify practice mode to track facet-level practice sets
6. DEV: Modify mastery transfer (concept links) to operate at facet level
7. DEV: Ensure `sub_skill_mastery` is deprecated or computed as aggregate
8. QA: Verify FSRS calculations identical per-facet vs. old per-skill, no data loss

**Output:** Architecture doc, modified study.js, modified PracticeMode.jsx, QA report

**Estimated complexity:** Medium-High

**CEO approval required before FSRS migration executes.**

---

### Phase 5: Context Builder Rework
**Agent:** SA → DEV → QA
**Scope:** Make the context builder traverse the relationship graph using binding types, quality ranks, and content ranges

**This phase integrates accuracy improvements #1 (consumption side), #2 (content range usage), #3 (quality rank usage), and #6 (binding type filtering).**

**Tasks:**
1. SA: Architecture for graph-traversal context building:
   - `buildFocusedContext` queries facet → chunk_facet_bindings (type=teaches, ordered by quality_rank) → chunks
   - When `content_range` is present, load only that portion of the chunk, not the full content
   - Cross-domain chunks loaded via facet_concept_links when linked facet has high-confidence teaches bindings
   - `prerequisite_for` bindings loaded only when student's mastery on the prerequisite facet is low
   - `references` bindings ignored unless in explore/recap mode
   - `buildContext` (general mode) falls back to keyword matching for open-ended sessions
2. DEV: New helper: `loadChunksForFacets(facetIds, options)`:
   - Queries chunk_facet_bindings filtered by type and min confidence
   - Orders by quality_rank
   - When content_range exists, extracts relevant portion from chunk content
   - Returns structured result: `{ facetId, chunkId, content, materialName, classification, bindingType, confidence }`
3. DEV: New helper: `loadCrossDomainChunks(facetIds)`:
   - Queries facet_concept_links → linked facets in other courses/domains
   - Loads their teaches bindings → chunks
   - Returns with link context: "Related: [facet name] from [course name] — [chunk content]"
4. DEV: Modify `buildFocusedContext` for assignment type:
   - Get questions → facets per question → ranked chunks per facet
   - Structure context with clear facet-to-chunk attribution
5. DEV: Modify `buildFocusedContext` for skill type:
   - Get skill's facets → ranked chunks per facet
   - Include cross-domain chunks when concept links exist
6. DEV: Modify `buildContext` (general sessions):
   - When conversation mentions a specific skill/facet, switch to binding-based loading
   - Otherwise fall back to keyword matching
7. QA: Test context loading for all 5 focus types, verify:
   - Correct chunks loaded per facet
   - Quality ranking respected (best source loaded first)
   - Content ranges used (partial chunk content, not full)
   - Cross-domain chunks surface when links exist
   - `references` bindings excluded from teaches-focused modes

**Output:** Architecture doc, modified study.js, QA report

**Estimated complexity:** Medium

---

### Phase 6: UI Updates
**Agent:** UXD → DEV → UXV → QA
**Scope:** Update all UI components to display facet-level data

**Tasks:**
1. UXD: Design facet display in ProfileScreen — skills expand to show facets with individual mastery bars
2. UXD: Design facet display in SkillsPanel — skill picker shows facets when expanded
3. DEV: Update ProfileScreen — skill cards expand to show facets, each with FSRS readiness bar
4. DEV: Update SkillsPanel — skill rows expand to show facets
5. DEV: Update ModePicker — nudge calculations use facet-level readiness
6. DEV: Update ScheduleScreen — assignment readiness computed from facet-level mastery
7. DEV: Update all `SubSkills` import sites to also import `Facets` where needed
8. UXV: Validate facet display is clear, not overwhelming (progressive disclosure)
9. QA: Full regression — all screens render correctly with facet data

**Output:** UX direction, updated screen components, UXV report, regression QA report

**Estimated complexity:** Medium

---

### Phase 7: Decomposition Pipeline Update
**Agent:** SA → DEV → QA
**Scope:** Update `decomposeAssignments` to map questions to facets

**Tasks:**
1. SA: Revise decomposition prompt — map questions to facet concept keys instead of skill concept keys
2. DEV: Modify `decomposeAssignments` prompt to reference facets
3. DEV: Modify `Assignments.saveQuestions` to write to `assignment_question_facets`
4. DEV: Modify `resolveSkillId` → `resolveFacetId` — resolve LLM output to facet IDs
5. DEV: Update `Assignments.getQuestions` to join through `assignment_question_facets` → `facets`
6. QA: Test decomposition with real assignments, verify questions map to correct facets

**Output:** Architecture doc, modified skills.js, modified db.js (Assignments module), QA report

**Estimated complexity:** Medium

---

## Agent Routing Summary

| Phase | Role Flow | Key Deliverables |
|---|---|---|
| Phase 0 | RA → SA | Extraction audit, facet extraction spec |
| Phase 1 | SA → DEV → QA | Migration 005, 5 new DB modules (with accuracy columns) |
| Phase 2 | SA → DEV → QA | Extraction pipeline: skills + facets, direct ID binding, type classification, content ranges, pre-merge |
| Phase 3 | SA → DEV → QA | Binding quality scoring and ranking |
| Phase 4 | SA → DEV → QA | FSRS moves to facet level (**CEO approval required**) |
| Phase 5 | SA → DEV → QA | Context builder: graph traversal with type/rank/range filtering, cross-domain |
| Phase 6 | UXD → DEV → UXV → QA | UI displays facet-level data |
| Phase 7 | SA → DEV → QA | Assignment decomposition maps to facets |

---

## CEO Decision Points

### Decision 1: Naming Convention — RESOLVED: Option C
Keep all existing names (`sub_skills` in SQL and JS). Add `facets` below. UI uses "skill" and "facet" regardless of table names.

### Decision 2: FSRS Migration Strategy — RESOLVED: Option A
Move FSRS entirely to facets. `sub_skill_mastery` deprecated. Skill-level readiness is computed as avg of facet retrievabilities.

### Decision 3: Cross-Domain Concept Links — RESOLVED: Option C
Cross-domain (math ↔ CS). Start with same-parent comparisons, expand to cross-domain in Phase 5 when the context builder can use cross-domain chunks.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data migration corrupts existing mastery | Medium | High | Backup before migration, validate row counts, spot-check FSRS values |
| Extraction produces wrong facet granularity | Medium | Medium | Phase 0 audit calibrates; prompt includes min/max facets per skill |
| FSRS behavior changes subtly at facet level | Low | High | Phase 4: CEO gate, side-by-side comparison |
| Performance — more entities = more queries | Medium | Medium | Batch queries, lazy-load facets on expand |
| Cross-domain concept links too noisy | Medium | Low | Confidence thresholds (0.7/0.9), limit to high-confidence |
| Extraction complexity increases significantly | High | Medium | Keep skill→facet nesting in single LLM call |
| LLM outputs invalid chunk IDs | Medium | Low | Fallback to heading match at lower confidence (Phase 2 task 7) |
| Content range annotation increases token usage | Medium | Low | Only request ranges for teaches bindings, not references |

---

## Dependencies

- Phase 0: No dependencies — start immediately
- Phase 1: Phase 0 (need facet structure spec)
- Phase 2: Phase 1 (need facets table)
- Phase 3: Phase 2 (need bindings populated with type data)
- Phase 4: Phase 1 + Phase 2 (need facets populated)
- Phase 5: Phase 2 + Phase 3 (need bindings with types and ranks)
- Phase 6: Phase 4 (need facet-level mastery to display)
- Phase 7: Phase 1 + Phase 2 (need facets to map questions to)

**External dependency:** Curriculum Dashboard plan depends on at least Phase 1 + Phase 2 + Phase 5 + Phase 7 completing.

---

## Relationship to Curriculum Dashboard Plan

Once this plan completes through Phases 1 + 2 + 5 + 7:
1. Dashboard queries (Q1-Q4) join through facets instead of sub_skills
2. Dashboard UI shows facet-level readiness per assignment question
3. Dashboard skill drill-down shows chunk links with binding type and quality rank
4. "Study This Facet" loads the highest-ranked teaches chunks via graph traversal

The curriculum dashboard plan does NOT need to be rewritten — its queries update once the facet schema is in place.

---

## Out of Scope

- **Renaming `sub_skills` table** — cosmetic, deferred
- **Embedding-based concept links** — vector similarity instead of LLM comparison
- **User-editable facets** — student manually splits/merges facets
- **Facet-level practice problem generation** — generating problems per facet
- **Teaching effectiveness feedback loop implementation** — schema is designed for it (`teaching_effectiveness` column), but the logic that updates it from learning outcomes is deferred. This requires tracking which chunks were used in a session and correlating with mastery changes — a meaningful lift that should be its own phase once the core facet architecture is stable.
