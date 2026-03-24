# study — Cross-Course Skill Unification Roadmap
**Date:** 2026-03-22 | **Owner:** CEO | **Status:** Roadmap — architectural scoping

---

## Problem

Sub-skills are course-scoped. If a student takes Calc I and Physics II, and both courses extract "Chain Rule Application," those are two separate rows in `sub_skills` with different `course_id` values. The concept link system may detect them as `same_concept`, but they're tracked independently with separate FSRS schedules. Mastery earned in one course doesn't fully carry to the other.

## CEO Decisions (Locked)

| Decision | Choice |
|---|---|
| Equivalent sub_skills | **Merge into one** — shared mastery, one FSRS schedule |
| Detection | **Automatic** — system detects and unifies silently |
| Primary surfaces | **ProfileScreen** (unified domain view) + **AI tutor** (cross-course references) |
| HomeScreen / ScheduleScreen | Not in initial scope |

---

## What Already Exists

The foundation is partially built:

- **CIP taxonomy** — 416 parent skills seeded with aliases. Extraction constrains LLM to pick from canonical CIP list. `findOrCreateByCip` resolves aliases.
- **Concept links** — `same_concept` links exist between sub_skills (and facets) across courses at ≥0.9 confidence. Generated automatically after extraction.
- **Mastery transfer** — first interaction with a skill checks `same_concept` links; if linked skill retrievability >0.7, applies stability boost (up to 1.4x) and difficulty ease (up to -1.0).
- **ProfileScreen cross-course aggregation** — domain drill-down already shows parent skills aggregated across courses, with "From: MATH 201, MATH 301" attribution.
- **AI context cross-course references** — `buildCrossSkillContext()` already injects concept links with mastery from other courses into all 5 focus types.

## The Gap

Mastery transfer via concept links is a **one-time boost on first interaction**, not true unification. After the boost, the two sub_skills diverge — studying one doesn't update the other. The student sees two entries for what is functionally the same skill.

True unification means: when concept links detect `same_concept` between sub_skills across courses, they are **merged** into a single sub_skill (and its facets) with one FSRS schedule. The merged skill retains references to both courses and all source chunks.

---

## Architectural Questions to Resolve


### 1. Merge mechanics — which sub_skill survives?
When two sub_skills are detected as `same_concept`, one must become the canonical version. Options:
- **Keep the older one** (first extracted) — stable IDs, but may have worse description
- **Keep the one with more mastery data** — more FSRS history means better scheduling
- **Keep the one with better metadata** (more facets, more chunk bindings) — richer skill definition

**Recommendation:** Keep the one with more mastery data (more FSRS reviews = better calibrated schedule). The surviving skill inherits the other's chunk bindings, facet mappings, and course references.

### 2. What happens to the absorbed skill's data?
- **Chunk bindings** → re-pointed to the surviving skill (both courses' chunks now bind to one skill)
- **Facets** → merged. If both skills have a "Power Rule" facet, merge FSRS state (take the higher stability, lower difficulty — optimistic merge). If only one has a facet, it transfers to the surviving skill.
- **FSRS state** → the surviving skill keeps its schedule. The absorbed skill's review history is discarded (FSRS is forward-looking — past reviews don't affect future scheduling once stability/difficulty are set).
- **Assignment question mappings** → re-pointed to the surviving skill
- **Concept links** → surviving skill inherits all links from the absorbed skill (deduped)
- **The absorbed skill row** → soft-deleted or hard-deleted. Soft-delete is safer for debugging.

### 3. When does unification run?
- **After extraction** — when new sub_skills are created and concept links are generated, check if any new `same_concept` links cross course boundaries. If so, trigger merge.
- **Not retroactive on app startup** — don't re-scan all existing skills on every boot. Only process new detections.
- **Idempotent** — running unification twice on the same data produces the same result.

### 4. `course_id` on `sub_skills` — what happens?
Currently `sub_skills.course_id` is NOT NULL. A unified skill belongs to multiple courses. Options:
- **Add a junction table** `skill_courses(skill_id, course_id)` — the clean relational approach. `sub_skills.course_id` becomes the "origin course" (where it was first extracted), and the junction table tracks all courses it appears in.
- **Make `course_id` nullable** and use concept links as the cross-course reference — simpler but less queryable.

**Recommendation:** Junction table. It's the correct relational model and makes queries like "all skills for course X" and "all courses for skill Y" straightforward.

### 5. ProfileScreen changes
Currently groups by CIP domain with cross-course attribution. After unification:
- Unified skills show all source courses in the attribution line
- No duplicate entries for the same skill across courses
- Mastery reflects the single unified FSRS schedule
- **Minimal UI change** — the profile already aggregates by domain. The main visible change is fewer duplicate skill entries and richer "From:" attribution.

### 6. AI tutor changes
Currently `buildCrossSkillContext()` injects concept links from other courses. After unification:
- Cross-course context is **implicit** — the unified skill already has chunk bindings from both courses. The context builder loads chunks from all bound sources.
- `buildCrossSkillContext()` still adds value for non-unified related skills (e.g., `prerequisite` and `related` links that don't trigger merge).
- The AI sees richer context without any prompt changes — it naturally gets chunks from multiple courses for a unified skill.

---

## Proposed Phases


### Phase 1 — Schema + merge engine (SA → DEV → QA)
- Add `skill_courses` junction table (migration 007)
- Populate junction table from existing `sub_skills.course_id` data (backfill)
- Build `unifySkills(skillA, skillB)` function in a new `unification.js` module: re-points chunk bindings, merges facets (optimistic FSRS merge), re-points assignment question mappings, inherits concept links, creates junction table entries, soft-deletes absorbed skill
- Build `detectAndUnify()` function: scans `same_concept` concept links for cross-course pairs not yet unified, calls `unifySkills` for each

### Phase 2 — Extraction pipeline integration (DEV → QA)
- Hook `detectAndUnify()` into `runExtractionV2` after concept link generation (where mastery transfer currently runs)
- Verify idempotency: running extraction on already-unified skills doesn't create duplicates or break merged state

### Phase 3 — ProfileScreen + AI context (DEV → QA → UXV)
- Update ProfileScreen queries to use `skill_courses` junction table instead of `sub_skills.course_id` for course attribution
- Remove duplicate entries for unified skills in domain drill-down
- Update `buildCrossSkillContext()` — for unified skills, load chunks from all bound courses (already happens if chunk bindings were re-pointed, but verify the query path)
- UXV: verify profile shows unified view correctly, AI references cross-course knowledge naturally

---

## Prerequisites
- Chunk metadata enrichment (just completed) — richer metadata helps concept link detection produce better `same_concept` matches
- Need at least 2 courses with overlapping content to test unification. If the current DB doesn't have this, testing will require creating test courses.

---

## Risk Notes
- **Merge is destructive** — once two skills are unified, the absorbed skill's independent FSRS history is lost. Soft-delete provides a recovery path but requires manual intervention.
- **False positive `same_concept` detection** — if concept links incorrectly classify two different skills as the same concept (e.g., "limits" in Calculus vs "limits" in systems engineering), the merge would combine unrelated mastery. The 0.9 confidence threshold mitigates this but isn't perfect.
- **Retroactive unification of existing data** — if the user has courses with duplicate skills already studied independently, the first unification run will merge them. This could surprise the user if mastery suddenly changes. Worth noting in a one-time notification.

---

## Status
Roadmap — ready for SA blueprint when the CEO decides to execute.
