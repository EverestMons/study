# Concept Link Generation Architecture

**Date:** 2026-03-10
**Status:** Implemented

## Overview

After skill extraction completes for a material, newly created sub-skills are compared against existing sub-skills under the same parent domain to discover relationships: same-concept duplicates, prerequisite chains, and topical connections. These concept links populate the `concept_links` table for downstream features (AI context enrichment, mastery transfer, profile graph visualization).

## Components

### 1. ConceptLinks DB module (`src/lib/db.js`)

CRUD module following the same pattern as `SkillPrerequisites`, `Mastery`, etc.

| Method | Description |
|--------|-------------|
| `create({subSkillAId, subSkillBId, similarityScore, linkType})` | Single insert with canonical `a < b` ordering |
| `createBatch(links)` | Batch insert in transaction, same swap logic |
| `getBySkill(skillId)` | All links touching a skill, JOINs both sides for names |
| `getByParent(parentSkillId)` | All links within a parent domain |
| `getByCourse(courseId)` | All links touching skills from a course |
| `delete(linkId)` | Delete by link ID |
| `deleteBySkill(skillId)` | Delete all links touching a skill |

Key design: `INSERT OR IGNORE` — the unique index on `(sub_skill_a_id, sub_skill_b_id, link_type)` silently skips duplicates. Idempotent re-runs are safe.

### 2. Concept link generator (`src/lib/conceptLinks.js`)

**Export:** `generateConceptLinks(courseId, newSkillIds, options?)`

**Flow:**
1. Load new skills from course, filter by `newSkillIds`
2. Group by `parent_skill_id`
3. Per parent group: load ALL sub-skills under parent (cross-course), split into new vs existing
4. Skip if no existing skills or total < 2
5. Build prompt → call `callClaude()` with Haiku → parse with `extractJSON()`
6. Validate IDs against loaded sets, filter confidence < 0.7 (< 0.9 for same_concept)
7. Write valid pairs via `ConceptLinks.createBatch()`

**Cross-course behavior:** `SubSkills.getByParent()` returns skills from ALL courses under a parent domain. This is intentional — skills in the same domain across courses are valid comparison targets.

**Link types:**
- `same_concept` — same underlying knowledge (confidence >= 0.9)
- `prerequisite` — existing must be learned before new (directional)
- `related` — topically connected, shared vocabulary

### 3. Integration in extraction flow

**Approach:** Extraction functions return `createdSkillIds` arrays, `runExtractionV2` passes them directly.

**extraction.js** — three functions return `createdSkillIds`:
- `extractCourse()` — collects from `conceptKeyToId` Map (all chapter skills)
- `enrichFromMaterial()` — collects from `SubSkills.create()` calls (new skills only)
- `extractChaptersOnly()` — collects from `SubSkills.create()` calls (new skills only)

**skills.js** — `runExtractionV2` hooks BOTH branches:
```
After extraction succeeds (either branch):
  if result.createdSkillIds?.length > 0:
    lazy import('./conceptLinks.js')
    await generateConceptLinks(courseId, result.createdSkillIds)
```

**Lazy import:** `await import('./conceptLinks.js')` — avoids static dependency graph. Only loaded when concept links are needed. Vite code-splits it into a separate chunk.

### Skip conditions

| Condition | Where checked |
|-----------|---------------|
| Extraction produced 0 new skills | `runExtractionV2`: `result.createdSkillIds?.length > 0` |
| Extraction skipped/failed | Only hooked on success paths |
| Parent group has 0 existing skills | `generateConceptLinks`: per-parent check |
| Parent group total < 2 | `generateConceptLinks`: per-parent check |

### Error handling

All non-critical. Concept link generation never blocks extraction.

- API error → log issue, skip parent group
- Parse failure → log issue, skip parent group
- Invalid skill ID → skip individual pair
- DB write → `INSERT OR IGNORE` handles duplicates

### Cost

- Haiku model (~$0.80/M input, $4.00/M output)
- Typical: ~30 skills × 60 tokens + system = ~$0.006 per extraction
- Adds 2-10% overhead on extraction cost

## Database schema (existing, no migration needed)

```sql
CREATE TABLE IF NOT EXISTS concept_links (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_a_id   INTEGER NOT NULL,
    sub_skill_b_id   INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    link_type        TEXT NOT NULL,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_a_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_b_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_a_id < sub_skill_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_link_pair
    ON concept_links(sub_skill_a_id, sub_skill_b_id, link_type);
```

## Files modified

| File | Change |
|------|--------|
| `src/lib/db.js` | Added `ConceptLinks` module (~70 lines) |
| `src/lib/conceptLinks.js` | **NEW** — generateConceptLinks, prompt builder, validator (~127 lines) |
| `src/lib/extraction.js` | Added `createdSkillIds` to 3 extraction function returns (~10 lines) |
| `src/lib/skills.js` | Concept link hook on both `runExtractionV2` branches (~12 lines) |
