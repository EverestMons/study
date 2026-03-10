# Concept Link AI Context Integration — Architecture Blueprint

**Date:** 2026-03-10
**Status:** Blueprint (ready for DEV)

## Overview

Enrich the AI tutoring prompt with cross-skill connections from the `concept_links` table. When a student is studying a skill that has concept links to skills in other courses, the AI gets visibility into related knowledge — enabling it to reference prior learning, transfer mastery, and build bridges across domains.

## Insertion Point

Both `buildContext()` and `buildFocusedContext()` in `src/lib/study.js` gain a new `CROSS-SKILL CONNECTIONS` section.

### buildContext (general chat)

Current section order:
1. SKILL TREE (line 321)
2. ASSIGNMENTS & SKILL REQUIREMENTS (line 344)
3. Deadline context (line 356)
4. STUDENT PROFILE (line 360)
5. LOADED SOURCE MATERIAL (line 402)

**Insert after section 1 (SKILL TREE), before section 2:**
```
CROSS-SKILL CONNECTIONS:
  Power Rule (this course) ↔ Power Rule Application in PHYS 201 [same_concept, 85% strength, Tier 5]
  Integration by Parts (this course) → Fourier Transform in PHYS 201 [prerequisite, 40% strength, Tier 3]
```

### buildFocusedContext (skill/assignment focus)

Three focus types:
- **assignment**: After REQUIRED SKILLS section (line 475), before SOURCE MATERIAL (line 478)
- **skill**: After PREREQUISITE STATUS section (line 530), before SOURCE MATERIAL (line 536)
- **recap**: After skills list — append as additional context

## Data Flow

### New helper function: `buildCrossSkillContext(courseId, skills)`

**Location:** `src/lib/study.js`, near `buildDeadlineContext` (~line 280)

**Dependencies:** `ConceptLinks`, `Courses`, `Mastery`, `SubSkills` from `./db.js`, `effectiveStrength` (local)

**Algorithm:**
```
1. Collect all skill IDs from the active skills array
2. Batch-load concept links: for each skill ID, call ConceptLinks.getBySkill(id)
   - Deduplicate links (same link found via both A and B sides)
   - Filter to only cross-course links (where the OTHER skill's source_course_id ≠ courseId)
   - Also include same-course links of type 'same_concept' (dedup awareness)
3. For each linked skill, load its mastery state from the Mastery table
4. Load course names for display (cache courseId → name lookup)
5. Sort by priority:
   a. same_concept first (highest relevance)
   b. prerequisite second
   c. related third
   Within each type: higher similarity_score first
6. Format lines, capping at TOKEN_BUDGET
7. Return formatted string or "" if no links
```

**Returns:** String (empty if no links — caller checks `if (crossCtx) ctx += ...`)

### Token Budget

**Cap: ~500 tokens (~2000 chars)**

Per line: `"  Skill Name (this course) ↔ Linked Skill in COURSE_NAME [type, XX% strength, Tier N]"` ≈ 20-30 tokens

**Budget allows ~15-20 links** — more than enough for typical usage.

**Truncation strategy:**
- Count chars as proxy (4 chars ≈ 1 token)
- If total exceeds 2000 chars, stop adding lines
- Always include same_concept links (highest priority)
- Add note: `  ... and N more connections` if truncated

### When to Include

- **Only when links exist.** The helper returns `""` if no cross-skill connections found.
- **Both context builders call it.** `buildContext` for general chat, `buildFocusedContext` for focused sessions.
- **For buildFocusedContext (assignment focus):** Only load links for the assignment's required skills, not all course skills.
- **For buildFocusedContext (skill focus):** Only load links for the focused skill and its prerequisites.
- **For buildFocusedContext (recap):** Load links for all skills with mastery data.

## Format Specification

### Section header
```
CROSS-SKILL CONNECTIONS:
```

### Per-link line format
```
  {thisSkillName} (this course) {arrow} {linkedSkillName} in {courseName} [{linkType}, {strengthPct}% strength, Tier {tier}]
```

**Arrow:** `↔` for same_concept/related (bidirectional), `→` for prerequisite (directional: existing → new)

**Example output:**
```
CROSS-SKILL CONNECTIONS:
  Power Rule (this course) ↔ Power Rule Application in PHYS 201 [same_concept, 85% strength, Tier 5]
  Derivative Rules (this course) → Chain Rule in MATH 301 [prerequisite, 40% strength, Tier 3]
  Limit Definition (this course) ↔ Epsilon-Delta Proofs in MATH 301 [related, 60% strength, Tier 4]
```

### Edge cases
- Linked skill has no mastery data: show `0% strength, Tier 1`
- Linked skill is archived: skip (already filtered by `is_archived = 0` in ConceptLinks queries)
- Same skill linked multiple types: show each link separately (they are distinct rows)

## Performance Considerations

### DB queries per context build
- `ConceptLinks.getBySkill(id)` — 1 query per active skill
- For typical session with 5-10 active skills: 5-10 queries
- Each is a simple indexed lookup (unique index on concept_links)

### Optimization: Batch loading
Instead of N individual `getBySkill` calls, use a single batch query:

```sql
SELECT cl.*, sa.name AS name_a, sa.concept_key AS key_a, sa.source_course_id AS course_a,
       sb.name AS name_b, sb.concept_key AS key_b, sb.source_course_id AS course_b
FROM concept_links cl
JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
WHERE cl.sub_skill_a_id IN (?, ?, ...) OR cl.sub_skill_b_id IN (?, ?, ...)
```

**Implementation:** Add `ConceptLinks.getBySkillBatch(skillIds)` to db.js (~10 lines). Single query, much faster than N calls.

### Mastery loading
`Mastery.getBySkills(linkedSkillIds)` — already exists as a batch method. Single query for all linked skills' mastery states.

### Course name caching
Build a `Map<courseId, courseName>` from the linked skills' `source_course_id` values. At most 2-3 `Courses.getById()` calls (courses are few).

## Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/db.js` | Add `ConceptLinks.getBySkillBatch(skillIds)` | ~15 new |
| `src/lib/study.js` | Add `buildCrossSkillContext()` helper | ~60 new |
| `src/lib/study.js` | Insert call in `buildContext()` after SKILL TREE | ~3 changed |
| `src/lib/study.js` | Insert calls in `buildFocusedContext()` (3 focus types) | ~9 changed |

**Total:** ~87 new/changed lines across 2 files

## Dependencies

- `ConceptLinks` module in db.js (Step 2.2) — already implemented
- `Mastery.getBySkills()` — already exists
- `Courses.getById()` — already exists
- `effectiveStrength()` — already exists in study.js
- `strengthToTier()` — already exists in study.js

No new npm packages. No migrations. No new files.

## Verification

1. `npm run build` — no import errors
2. Call `buildContext()` for a course with concept links → verify CROSS-SKILL CONNECTIONS section appears
3. Call `buildContext()` for a course without concept links → verify section is omitted
4. Call `buildFocusedContext()` with skill focus → verify only that skill's links appear
5. Verify token budget: context with 20+ links doesn't exceed ~500 tokens for the cross-skill section
6. Verify sort order: same_concept before prerequisite before related
