# Assignment Activation & Curriculum Dashboard — Orchestrator Plan
**Project:** study
**Date:** 2026-03-12
**Requested By:** CEO
**Status:** APPROVED — Ready for Execution
**Prerequisite:** Facet Architecture plan must complete Phases 1 + 2 + 5 + 7 before this plan's Phase 3 executes.

---

## Feature Summary

Restructure the study app around **active problems as the primary dashboard**. The student's learning experience is organized backward from the assignments they need to complete:

1. **Extraction** (already exists) — Student uploads course materials. System extracts skills from chunks. Student uploads assignments. System decomposes assignments into required skills, mapping each problem/question to the skills needed to solve it.

2. **Activation** (new) — Student selects which assignments are "active" on the ScheduleScreen. The system builds a **visible curriculum** from the skill requirements of those assignments, linking each skill to the material chunks that teach it.

3. **Curriculum Dashboard** (new) — A new CurriculumScreen shows the student a structured breakdown: "Assignment 7 requires Skills A, B, C. Skill A is taught in Chapter 3 of your textbook. Your mastery of Skill A is 35%." The student enters study sessions targeting specific skills, or lets the system route them to their weakest areas.

4. **Review Mode** (new) — Completed assignments appear in a review section on the Curriculum Dashboard. FSRS spaced repetition resurfaces skills on schedule. If everything is caught up, the student sees "You're current."

**CEO Decisions (resolved):**
- Assignments are **filters/views** over the single canonical skill graph — not separate trees
- Assignment-to-skill mapping comes from **student uploading assignment documents** (existing `decomposeAssignments` pipeline)
- "Advance Mode" (dive deeper with no schedule) is **deferred**
- **Decision 1:** Activation UI on **ScheduleScreen** (Option A)
- **Decision 2:** Curriculum Dashboard as **new CurriculumScreen** (Option A)
- **Decision 3:** Review Mode **integrated into Curriculum Dashboard** (Option C)
- **Decision 4:** Assignment completion trigger is **manual only** (Option A)

---

## Current State Analysis

### What Already Exists

| Component | Location | What It Does |
|---|---|---|
| `assignments` table | `003_assignments.sql` | Stores assignments with course_id, material_id, title, due_date, status (active/submitted/graded), source |
| `assignment_questions` table | `003_assignments.sql` | Individual questions within an assignment, linked to assignment_id |
| `assignment_question_skills` table | `003_assignments.sql` | Maps questions → sub_skills (the required-skill linkage) |
| `decomposeAssignments()` | `skills.js:262` | LLM pipeline that reads assignment content and maps questions to required skills from the course skill set |
| `Assignments` DB module | `db.js:367` | Full CRUD: getByCourse, getById, create, getQuestions, saveQuestions, getPlaceholders, findPlaceholderMatch, updateStatus |
| `chunk_skill_bindings` table | `001_v2_schema.sql` | Maps chunks → sub_skills (the content-teaches-skill linkage) |
| `sub_skill_mastery` table | `001_v2_schema.sql` | FSRS state per sub_skill: difficulty, stability, retrievability, next_review_at |
| ModePicker assignment flow | `ModePicker.jsx:68-105` | Loads assignments, resolves required skills, computes readiness, builds nudge candidates |
| `bootWithFocus({ type: "assignment" })` | `StudyContext.jsx:854` | Launches assignment work session with focused context, question unlock flow |
| `buildFocusedContext()` | `study.js` | Builds AI context scoped to focus type (assignment, skill, exam, etc.) |
| Assignment status field | `assignments.status` | Values: `active`, `submitted`, `graded` — exists but not used for completion tracking in skill acquisition |

### What's Missing

| Gap | Description |
|---|---|
| **Activation concept** | No way to mark assignments as "active for study." The existing `status` field tracks submission state, not study focus. |
| **Curriculum dashboard** | No screen that shows the student a structured breakdown of active problems → required skills → teaching material → mastery state. The data linkage exists across tables but there is no aggregated, student-facing view. |
| **Skill-to-chunk visibility** | `chunk_skill_bindings` links skills to chunks, but this is never surfaced to the student. Only used as background AI context. |
| **Assignment-scoped study entry** | `bootWithFocus({ type: "assignment" })` works for one assignment at a time. No multi-assignment curriculum view or per-skill study entry from the dashboard. |
| **Completion-driven review pool** | Assignment `status` changes to `submitted`/`graded` but this doesn't feed skills into a scoped review pool. |
| **"You're current" state** | No detection or messaging for "all reviews caught up, no active assignments." |

---

## Architecture Design

### Data Model Changes

**One column addition to assignments table. Facet tables are a prerequisite from the Facet Architecture plan.**

#### Migration 006: Assignment Activation

*(Migration 005 is claimed by the Facet Architecture plan for facet tables.)*

```sql
ALTER TABLE assignments ADD COLUMN study_active INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_assignments_study_active 
  ON assignments(course_id, study_active) WHERE study_active = 1;
```

**Why `study_active` instead of reusing `status`:**
- `status` tracks assignment lifecycle (active → submitted → graded) — workflow state
- `study_active` tracks whether the student is currently studying for this assignment — UI focus state
- These are orthogonal: a student might re-activate a submitted assignment for review, or deactivate one they're ignoring

### Query Design

**Note:** These queries reference `sub_skills`, `sub_skill_mastery`, and `assignment_question_skills` as written. Once the Facet Architecture plan completes, they will be rewritten to join through `facets`, `facet_mastery`, and `assignment_question_facets`. The query structure remains the same — only the table names and join paths change.

#### Q1: Full curriculum for active assignments

Returns per-assignment, per-question, per-skill breakdown with mastery and parent domain.

```sql
SELECT a.id AS assignment_id, a.title AS assignment_title, a.due_date, a.status,
       aq.id AS question_id, aq.question_ref, aq.description AS question_desc, aq.ordering,
       ss.id AS skill_id, ss.name AS skill_name, ss.concept_key,
       ps.name AS parent_skill_name,
       ssm.retrievability, ssm.stability, ssm.difficulty, 
       ssm.reps, ssm.next_review_at
FROM assignments a
JOIN assignment_questions aq ON aq.assignment_id = a.id
JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
JOIN parent_skills ps ON ps.id = ss.parent_skill_id
LEFT JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
WHERE a.course_id = ? AND a.study_active = 1
  AND ss.is_archived = 0
ORDER BY a.due_date ASC, aq.ordering ASC, ss.name ASC
```

#### Q2: Chunks that teach a specific skill (drill-down)

```sql
SELECT c.id, c.label, c.section_path, c.content, c.char_count,
       m.label AS material_name, m.classification,
       csb.confidence AS binding_confidence
FROM chunk_skill_bindings csb
JOIN chunks c ON c.id = csb.chunk_id
JOIN materials m ON m.id = c.material_id
WHERE csb.sub_skill_id = ?
  AND c.status = 'extracted'
ORDER BY csb.confidence DESC, c.ordering ASC
```

#### Q3: Skills from completed assignments (review pool)

```sql
SELECT DISTINCT ss.id, ss.name, ss.parent_skill_id, ps.name AS parent_skill_name,
       ssm.retrievability, ssm.stability, ssm.next_review_at, ssm.reps
FROM assignments a
JOIN assignment_questions aq ON aq.assignment_id = a.id
JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
JOIN parent_skills ps ON ps.id = ss.parent_skill_id
LEFT JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
WHERE a.course_id = ? 
  AND a.status IN ('submitted', 'graded')
  AND ss.is_archived = 0
```

#### Q4: Skills due for FSRS review (scoped to completed assignments)

Same as Q3 with additional filter:
```sql
  AND ssm.next_review_at IS NOT NULL
  AND ssm.next_review_at <= ?  -- current epoch
```

### Curriculum Dashboard Data Model (in-memory)

Built from Q1 + Q2 at render time:

```
CurriculumDashboard {
  activeAssignments: [
    {
      id, title, dueDate, status, urgencyLevel,
      overallReadiness: avg of all skill retrievabilities,
      questions: [
        {
          id, ref, description,
          readiness: avg of required skill retrievabilities,
          skills: [
            {
              id, name, conceptKey, parentSkillName,
              retrievability, stability, reps,
              chunks: [              // lazy-loaded on expand via Q2
                { id, label, materialName, classification, sectionPath }
              ]
            }
          ]
        }
      ]
    }
  ],
  reviewSection: {                    // from Q3/Q4
    totalSkills, dueForReview,
    skills: [ { id, name, parentSkillName, retrievability, nextReviewAt } ]
  },
  summary: {
    totalSkills, masteredSkills, weakSkills, untestedSkills,
    skillsWithNoChunks
  }
}
```

### User Flows

#### Flow A: Activation (ScheduleScreen)

```
Student uploads materials → extraction → skills extracted from chunks
Student uploads assignments → decomposition → skills mapped to questions
Student opens ScheduleScreen
  → Sees all assignments with activation toggles
  → Toggles assignments "active for study"
  → Summary bar: "N active, M skills to master, X% ready"
  → Navigates to CurriculumScreen
```

#### Flow B: Curriculum Dashboard (CurriculumScreen)

```
Student opens CurriculumScreen
  → Dashboard shows hierarchical breakdown:
     ┌─────────────────────────────────────────────────┐
     │ ACTIVE ASSIGNMENTS                              │
     │                                                 │
     │ ▼ Assignment 7: Data Structures Problem Set     │
     │   Due: Mar 18 (6 days)  |  Readiness: 42%      │
     │                                                 │
     │   ▼ Q1: Implement a binary search tree          │
     │     ├── Binary Tree Traversal ████████░░ 80%    │
     │     │   └── Ch 6.2 Trees (textbook)             │
     │     ├── BST Insert/Delete   ███░░░░░░░ 30%      │
     │     │   └── Ch 6.4 BST Operations (textbook)    │
     │     │   └── Lecture 11 slides                    │
     │     └── Recursion Patterns  ██████░░░░ 60%      │
     │         └── Ch 3.1 Recursion (textbook)          │
     │                                                 │
     │   ▶ Q2: Analyze time complexity... (2 skills)   │
     │                                                 │
     │ [Study Weakest] [Study Q1] [Study Q2]           │
     │                                                 │
     │─────────────────────────────────────────────────│
     │ REVIEW (Completed Assignments)                  │
     │ 3 skills due for review                         │
     │ [Start Review]                                  │
     └─────────────────────────────────────────────────┘

  → Tap skill → study session for that skill (linked chunks as AI context)
  → Tap "Study Weakest" → lowest-readiness skill across active assignments
  → Tap "Study Q1" → sequence through Q1's skills weakness-first
  → Tap "Start Review" → FSRS review for completed-assignment skills
  → No active + no reviews → "You're current! All caught up."
```

#### Flow C: Completion (Manual)

```
Student taps "Mark as Submitted" on assignment card
  → status='submitted', study_active=0 (atomic)
  → Skills move to review pool (Review section on CurriculumScreen)
  → FSRS schedules reviews based on mastery state
```

---

## Implementation Phases

### Phase 0: Extraction Granularity Audit
**Agent:** Research Analyst → Systems Analyst
**Scope:** Verify that the extraction pipeline produces skills at assignment-testable granularity. The curriculum dashboard's value depends entirely on skills being at the right level — if a professor tests insertion and deletion as separate questions, the extraction must have produced them as separate skills, each with its own FSRS schedule.

**Why this matters:** The curriculum dashboard makes extraction quality *visible*. Today, a coarse skill like "Binary Search Trees" works fine because the AI tutor implicitly covers sub-facets during conversation. But when the dashboard shows one skill mapped to three different questions, and that skill's readiness bar hits 100% after the student only demonstrated one facet, the system is lying to the student. The fix is ensuring extraction granularity matches assignment-testable granularity — not adding a second measurement system on top of FSRS.

**Tasks:**
1. Research Analyst: Pull real extracted skills from an active course in the study app database. List all sub_skills with their concept_keys, mastery_criteria, and parent_skill associations.
2. Research Analyst: Pull real decomposed assignments from the same course. List all assignment_question_skills mappings — which questions map to which skills.
3. Research Analyst: Identify granularity mismatches:
   - Skills that are mapped to multiple questions testing *different facets* (e.g., "BST Operations" mapped to both an insertion question and a deletion question)
   - Skills with mastery_criteria that cover multiple independently-testable capabilities (e.g., criteria list includes both "Can insert into BST" and "Can delete from BST" under one skill)
   - Questions with zero skill mappings (decomposition couldn't find a match — indicates missing skills)
4. SA: If mismatches are found, assess whether the fix is:
   - **Extraction prompt tuning** — adjust the DIAGNOSTIC/PRACTICE/DECAY tests to encourage finer splitting when sub-facets are independently testable
   - **Decomposition prompt tuning** — adjust `decomposeAssignments` to flag when a question maps to a skill that's too coarse (e.g., "this question tests a specific facet of this skill")
   - **Neither** — the current granularity is adequate for the courses in use
5. SA: If prompt tuning is needed, produce a prompt revision spec for DEV to implement before Phase 1

**Output:** `knowledge/research/extraction-granularity-audit-2026-03-12.md`, optional SA prompt revision spec

**Estimated complexity:** Low — this is an analysis task, not a build task. But it gates whether Phase 1+ will produce accurate curriculum dashboards.

**Decision point:** If the audit reveals significant granularity problems, the Facet Architecture plan is the resolution — facets promote mastery criteria into independently-trackable entities with their own FSRS schedules. This plan's Phase 0 output feeds directly into the Facet Architecture plan's Phase 0.

---

### Phase 1: Schema + DB Methods
**Agent:** SA → DEV → QA
**Scope:** Migration 005, new DB methods, curriculum data assembly

**Tasks:**
1. SA: Architecture doc — migration 006, new DB method signatures, curriculum data structure, Q1-Q4 queries
2. DEV: Create and apply migration 006 (`study_active` column + index)
3. DEV: `Assignments.setStudyActive(id, active)` — toggle
4. DEV: `Assignments.bulkSetStudyActive(ids, active)` — batch toggle
5. DEV: `Assignments.getCurriculum(courseId)` — Q1 + assemble nested structure
6. DEV: `Assignments.getChunksForSkill(subSkillId)` — Q2
7. DEV: `Assignments.getCompletedSkills(courseId)` — Q3
8. DEV: `Assignments.getReviewDueSkills(courseId)` — Q4
9. DEV: `Assignments.getCurriculumSummary(courseId)` — summary stats
10. DEV: `Assignments.markSubmitted(id)` — status='submitted' + study_active=0 atomic
11. QA: Migration clean apply, method output shapes, edge cases (empty data, no mastery records)

**Output:** `knowledge/architecture/assignment-curriculum-schema-2026-03-12.md`, `006_assignment_activation.sql`, updated db.js, QA report

**Estimated complexity:** Low-Medium

---

### Phase 1.5: Context Builder Rework
**Handled by:** Facet Architecture Plan, Phase 5
**Scope:** The context builder rework (replacing keyword-based chunk selection with binding-graph traversal) is fully specified in the Facet Architecture plan's Phase 5. That phase implements graph traversal at facet level with binding type filtering, quality ranking, and content range extraction. This plan does not duplicate that work.

**Why it matters for the dashboard:** The CurriculumScreen shows "Facet A is taught in Chapter 6.2." When the student taps "Study This Facet," the study session must load those same chunks. The Facet Architecture's context builder rework ensures the binding graph is the single source of truth for both display and tutoring.

**Dependency:** Facet Architecture Phase 5 should complete before this plan's Phase 3 (CurriculumScreen) so that "Study This Facet" actions use graph traversal.

---

### Phase 2: Activation UI (ScheduleScreen)
**Agent:** UXD → DEV → UXV → QA
**Scope:** Activation toggles on assignment cards, summary bar, "Mark as Submitted"

**Tasks:**
1. UXD: Activation toggle design — active (accent), inactive (dimmed), completed (checkmark)
2. UXD: Summary bar design — active count, skill count, readiness %
3. UXD: "Mark as Submitted" button placement and confirmation
4. DEV: Activation toggle on assignment cards
5. DEV: Summary bar with live counts from `getCurriculumSummary()`
6. DEV: "Mark as Submitted" → `Assignments.markSubmitted()` with optimistic UI
7. DEV: Wire toggles to `setStudyActive()` with optimistic update
8. UXV: Validate activation clarity, submitted flow
9. QA: Toggle persistence, batch ops, submitted transition, edge cases

**Output:** UX direction doc, updated ScheduleScreen.jsx, QA report

**Estimated complexity:** Medium

---

### Phase 3: Curriculum Dashboard (CurriculumScreen)
**Agent:** UXD → SA → DEV → UXV → QA
**Scope:** New CurriculumScreen — structured skill breakdown, chunk links, study entry points, review section

**This is the biggest phase.**

**Tasks:**
1. UXD: CurriculumScreen layout:
   - Active assignments section with collapsible cards (due date, urgency, readiness %)
   - Collapsible question sections (description, skill count, readiness)
   - Skill/facet rows (name, parent badge, mastery bar, readiness %)
   - Chunk links per facet (lazy expand: material name, classification badge, section path)
   - Visual states: mastered (green), progressing (amber), untested (gray), gap (red warning)
   - Action buttons: "Study This Facet", "Study Weakest", "Study [Question]"
   - Review section at bottom: completed-assignment skills, FSRS status, "Start Review"
   - "You're current!" state
   - Progressive disclosure: collapsed by default, expand on demand
2. SA: Architecture for:
   - Data loading + caching (re-query on return from study session)
   - "Study This Skill" → `bootWithFocus` with linked chunks override
   - "Study [Question]" → skill sequencing logic
   - Review session entry from Q4
3. DEV: Build CurriculumScreen.jsx:
   - Load `getCurriculum()` on mount, render hierarchy
   - Mastery bars, readiness %, urgency colors
   - Collapsible assignment/question/skill sections
4. DEV: Skill/facet drill-down — lazy load chunks via `getChunksForFacet()`, show material + section path, "Study This Facet" button
5. DEV: Gap detection — zero chunk bindings → "⚠ No material covers this facet"
6. DEV: Wire "Study This Facet" → `bootWithFocus({ type: "skill", facet, chunks })` using Facet Architecture's graph-traversal context builder
7. DEV: Modify `buildFocusedContext()` to accept optional `facetId` + `chunks` override (or rely on Facet Architecture Phase 5's implementation)
8. DEV: Wire "Study Weakest" → lowest-readiness facet + its chunks
9. DEV: Wire "Study [Question]" → sequence skills weakness-first
10. DEV: Review section — load Q3/Q4, render, "Start Review" button
11. DEV: "You're current!" state — no active + Q4 empty
12. DEV: Re-query curriculum on return from study session
13. DEV: Add to ScreenRouter + HomeScreen navigation
14. DEV: Edge cases:
    - Not decomposed → inline trigger `decomposeAssignments`
    - No materials extracted → prompt
    - All skills high readiness → "Ready to submit!"
15. UXV: Hierarchy clarity, chunk link usefulness, action discoverability, progressive disclosure
16. QA: Data states, study entry, mastery refresh, edge cases, gap detection

**Output:** UX direction, architecture doc, CurriculumScreen.jsx (~400-600 lines), modified study.js + StudyContext.jsx, UXV report, QA report

**Estimated complexity:** High

---

### Phase 4: Integration & Polish
**Agent:** DEV → UXV → QA
**Scope:** HomeScreen, state machine, regression

**Tasks:**
1. DEV: HomeScreen curriculum summary when active assignments exist — tap to navigate
2. DEV: "Resume Course" routes to CurriculumScreen (or "current" state)
3. DEV: Nudge banner references active curriculum
4. DEV: Course-level state machine:
   - No materials → "Upload materials"
   - Materials, no assignments → "Upload assignments"
   - Assignments, none active → "Activate assignments"
   - Active → CurriculumScreen
   - Completed + reviews due → Review section
   - All caught up → "You're current!"
5. UXV: Full lifecycle validation
6. QA: Full regression — existing features unaffected when no assignments activated

**Output:** Updated HomeScreen, state machine, UXV report, regression QA report

**Estimated complexity:** Medium

---

## Agent Routing Summary

| Phase | Role Flow | Key Deliverables |
|---|---|---|
| Phase 0 | Research → SA | Extraction granularity audit (shared with Facet Architecture plan) |
| Phase 1 | SA → DEV → QA | Migration 006, 8 new DB methods |
| Phase 1.5 | *Facet Architecture Phase 5* | Context builder rework — handled by Facet Architecture plan |
| Phase 2 | UXD → DEV → UXV → QA | Activation toggles + summary + submitted button on ScheduleScreen |
| Phase 3 | UXD → SA → DEV → UXV → QA | **CurriculumScreen** — skill hierarchy, chunk links, study entry, review section |
| Phase 4 | DEV → UXV → QA | HomeScreen integration, state machine, regression |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Assignments with no decomposed skills | High | Empty curriculum | Detect + inline decomposition trigger |
| Skills with no chunk bindings | Medium | Gaps in curriculum | Visual warning: "⚠ No material covers this" |
| `decomposeAssignments` maps wrong skills | Medium | Incorrect curriculum | Existing risk, more visible. Manual edit deferred. |
| Extraction granularity too coarse for assignment questions | Medium | One skill covers multiple testable facets → readiness bar misleads | Phase 0 audit detects this. Fix via extraction prompt tuning if needed. |
| Dashboard stale after study session | Low | Wrong readiness % | Re-query on return to CurriculumScreen |
| Context builder loads wrong chunks for skill sessions | High (current state) | AI tutor teaches from irrelevant material | Resolved by Facet Architecture Phase 5 (graph traversal) |
| Q1 joins 6 tables | Low | Slow render | All indexed. Single-user SQLite. <20ms expected. |
| CurriculumScreen too complex | Medium | Student overwhelm | Progressive disclosure: collapsed by default |

---

## Dependencies

- Phase 0: No dependencies — start immediately (shared with Facet Architecture plan)
- Phase 1: Phase 0 (audit feeds into both plans). Can begin once Facet Architecture Phase 1 (migration 005) completes, since migration 006 depends on 005.
- Phase 1.5: Handled by Facet Architecture Phase 5 — no work in this plan.
- Phase 2: Phase 1 (DB methods for summary bar). Can run in parallel with Facet Architecture phases.
- Phase 3: Phase 1 + Phase 2 + Facet Architecture Phases 1, 2, 5, 7 (dashboard needs facets, facet-chunk bindings, graph-traversal context builder, and facet-level decomposition)
- Phase 4: Phases 1-3

---

## Out of Scope (Deferred)

- **Advance Mode** — "what's next" for caught-up students
- **Auto-activation from syllabus** — activate based on due dates
- **Cross-course review** — review across multiple courses
- **Prerequisite skill chains** — auto-include prerequisite skills
- **Manual skill-to-question editing** — student corrects bad mappings
- **Chunk content preview** — inline text on dashboard (v1 = metadata only)
