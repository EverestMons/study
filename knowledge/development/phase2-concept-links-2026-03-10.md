# Phase 2: Concept Link Generation — Development Notes

**Date:** 2026-03-10
**Covers:** Steps 2.2 (DB module), 2.3 (generator), 2.4 (extraction integration)

## Step 2.2 — ConceptLinks DB Module

Added to `src/lib/db.js` after `SkillPrerequisites`, before `Mastery` (~70 lines).

**Methods:** `create`, `createBatch`, `getBySkill`, `getByParent`, `getByCourse`, `delete`, `deleteBySkill`

Key design decisions:
- Canonical `a < b` ID ordering enforced in code (swap before INSERT), matching the `CHECK (sub_skill_a_id < sub_skill_b_id)` constraint
- `INSERT OR IGNORE` — unique index on `(a, b, link_type)` silently skips duplicates
- All query methods JOIN both `sub_skills` sides to return enriched rows with `name_a`, `key_a`, `name_b`, `key_b`

## Step 2.3 — Concept Link Generator

New file: `src/lib/conceptLinks.js` (~127 lines)

**Export:** `generateConceptLinks(courseId, newSkillIds, options?)`

**Flow:**
1. Load new skills from `SubSkills.getByCourse()`, filter by `newSkillIds` set
2. Group by `parent_skill_id`
3. Per parent: load ALL sub-skills under parent (cross-course via `getByParent`), split new vs existing
4. Skip if no existing or total < 2
5. Build prompt → `callClaude()` Haiku → `extractJSON()`
6. Validate IDs, filter confidence: >= 0.7 base, >= 0.9 for `same_concept`
7. `ConceptLinks.createBatch()` for valid pairs

**Prompt structure:** Each skill rendered as `[id] concept_key | "name" | description(120) | category | type | top-3 criteria`

**Cross-course:** Intentional — `getByParent()` returns skills from ALL courses, enabling cross-course concept linking within the same academic domain.

## Step 2.4 — Extraction Integration

### Changes to `extraction.js` (3 functions)

**A) `extractCourse()`** — Already had `conceptKeyToId` Map collecting all created skill IDs across chapters. Added `createdSkillIds: [...conceptKeyToId.values()]` to return object.

**B) `enrichFromMaterial()`** — Added `createdSkillIds` array, pushed each `skillId` from `SubSkills.create()` calls. Added to return object.

**C) `extractChaptersOnly()`** — Added `createdSkillIds` array, pushed each `skillId` from `SubSkills.create()` (new skills only, not matched/enriched existing). Added to return object.

### Changes to `skills.js` (`runExtractionV2`)

**Replaced** the pre/post snapshot diff approach (from Step 2.1) with direct `result.createdSkillIds` from extraction results:

- Removed `preExtractionSkillIds` snapshot
- Added concept link hook on BOTH return paths:
  - `existingV2.length > 0` branch (retry/enrichment via `extractChaptersOnly`)
  - `existingV2.length === 0` branch (first extraction via `extractCourse`)
- Both hooks use `result.createdSkillIds?.length > 0` guard
- Lazy `import('./conceptLinks.js')` preserved — code-split into separate chunk
- Wrapped in try/catch — failures logged but never block extraction

### Why both paths now get concept links

The Step 2.1 blueprint skipped first extraction (`preExtractionSkillIds.size === 0`). This was too restrictive — `generateConceptLinks` loads skills by parent via `SubSkills.getByParent()` which returns skills across ALL courses. So even first extraction for a new course can discover links to existing skills in other courses under the same parent domain.

The skip logic in `generateConceptLinks` itself handles the "no existing skills" case per-parent group, making the caller-side guard unnecessary.

## Files changed

| File | Lines changed | What |
|------|--------------|------|
| `src/lib/db.js` | +70 | ConceptLinks module (Step 2.2) |
| `src/lib/conceptLinks.js` | +127 (new) | Generator (Step 2.3) |
| `src/lib/extraction.js` | +10 | `createdSkillIds` in 3 return objects (Step 2.4) |
| `src/lib/skills.js` | +12, -10 | Hook on both branches, removed snapshot diff (Step 2.4) |

## Verification

- `npm run build` — passes, `conceptLinks.js` code-split into 2.58 kB chunk
- `createdSkillIds` present in all 3 extraction function returns
- `generateConceptLinks` called on both `runExtractionV2` branches
- All lazy-imported, never in static dependency graph
