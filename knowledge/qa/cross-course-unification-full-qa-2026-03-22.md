# Cross-Course Skill Unification — Full QA Report
**Date:** 2026-03-22 | **Agent:** Study Security & Testing Analyst | **Step:** 6

**Blueprint reference:** `knowledge/architecture/cross-course-unification-blueprint-2026-03-22.md`

---

## Area 1: Absorbed Skill Invisibility — PASS (with fix)

**What was tested:** `unified_into IS NULL` filters on all display/computation queries in `db.js`.

**Expected:** All queries that load sub_skills for display or computation exclude absorbed skills.

**Actual — 9 locations filtered:**
| Location | Line | Filter Added |
|----------|------|-------------|
| `SubSkills.getByParent()` | 1475 | `AND unified_into IS NULL` |
| `SubSkills.getAllActive()` | 1481 | `AND unified_into IS NULL` |
| `SubSkills.getByCourse()` | 1487 | `AND unified_into IS NULL` |
| `SubSkills.findByConceptKey()` | 1575 | `AND unified_into IS NULL` |
| `SubSkills.getAllConceptKeys()` | 1583 | `AND unified_into IS NULL` |
| `Mastery.getDueForReview()` | 1938 | `AND ss.unified_into IS NULL` |
| `Facets.getByCourse()` | 2240 | `AND ss.unified_into IS NULL` |
| `FacetMastery.getAll(courseId)` | 2352 | `AND ss.unified_into IS NULL` |
| `FacetMastery.getDueForReview()` | 2374 | `AND ss.unified_into IS NULL` |

**QA finding — fixed during QA:** `FacetMastery.getDueForReview()` (line 2374) was missing the filter in the Step 5 implementation. Added during QA verification. Build passes after fix.

**Intentionally NOT filtered:**
- `SubSkills.getById()` — returns absorbed skills for debugging/merge verification. CORRECT per blueprint.
- `Facets.getBySkill()`, `Facets.getById()` — facets on absorbed skills are archived or transferred. CORRECT.

**Severity:** N/A — PASS (gap found and fixed).

---

## Area 2: Extraction Pipeline Hook — PASS

**What was tested:** `detectAndUnify()` hooks in `skills.js` and `SkillCourses.add()` calls in `extraction.js`.

**Expected:** Both hooks present, non-blocking.

**Actual:**

### detectAndUnify() hooks (skills.js)
- **Re-extraction path** (line 635-640): After concept link generation. Dynamic `import('./unification.js')`, wrapped in try/catch. Logs on success, warns on failure. CORRECT.
- **First extraction path** (line 683-688): Same pattern after concept link generation. CORRECT.

### SkillCourses.add() hooks (extraction.js)
- Line 1064: After `SubSkills.createBatch` (initial extraction). `for (const sid of skillIds) { await SkillCourses.add(sid, courseId); }`. CORRECT.
- Line 1427: After `SubSkills.create` in `extractCourse`. CORRECT.
- Line 1597: After `SubSkills.create` in `extractChaptersOnly`. CORRECT.
- Line 1908: After `SubSkills.create` in `reExtractCourse`. CORRECT.

All 4 SubSkills creation sites covered. All hooks non-blocking (try/catch or fire-and-forget).

**Severity:** N/A — PASS.

---

## Area 3: ProfileScreen Attribution — PASS

**What was tested:** Multi-course attribution in `ProfileScreen.jsx` via `SkillCourses` junction table.

**Expected:** Course attribution uses `skill_courses` data, not just `source_course_id`. Multi-course display ("From: MATH 201, PHYS 202") exists.

**Actual:**

### Data pipeline (StudyContext.jsx)
- `SkillCourses` imported (line 4). CORRECT.
- `loadProfile()` bulk-loads `SkillCourses.getAll()` (line 740), builds `skillCoursesMap` grouped by skill_id (line 741-742). CORRECT.
- Each enriched sub-skill gets `courseIds` array: `skillCoursesMap[sub.id] || (sub.source_course_id ? [sub.source_course_id] : [])` (line 831). Falls back to `source_course_id` if no skill_courses entries. CORRECT.

### Display (ProfileScreen.jsx)
- **Parent-level attribution** (line 187): Collects courses via `for (var cid of (s.courseIds || []))`. Shows up to 3 course names with "+N more" overflow. CORRECT.
- **Sub-skill detail attribution** (line 390): Uses `sub.courseIds` with fallback to `[sub.sourceCourseId]`. Displays as comma-separated: "From: MATH 201, PHYS 202". CORRECT.

**Note:** Implementation uses bulk `SkillCourses.getAll()` + JS grouping instead of per-skill `SkillCourses.getBySkill()`. This is correct — avoids N+1 queries in the profile loading path.

**Severity:** N/A — PASS.

---

## Area 4: AI Context Chunks — PASS

**What was tested:** Context builders in `study.js` load chunks from all bound courses for unified skills.

**Expected:** No single-course filter blocks cross-course chunk loading.

**Actual:**

### Chunk loading path (facet-based)
1. `loadFacetBasedContent(facetIds)` (line 974) → `collectFacetBindings(facetIds)` (line 872)
2. `collectFacetBindings` calls `ChunkFacetBindings.getByFacetRanked(facetId)` (line 876)
3. `getByFacetRanked` (db.js:2440) queries by `facet_id` only — **no course_id filter**. Joins `chunks → materials` for metadata but does not filter by course.
4. `loadChunksForBindings` (line 820) loads chunk content by `chunk_id` — **no course filter**.

After unification:
- Survivor skill's facets include transferred facets from absorbed skill
- Chunk_facet_bindings for matched facets are re-pointed to survivor facets
- Unique facets are transferred with their bindings intact
- Result: All chunks from both courses are available via facet bindings. CORRECT.

### Cross-domain content
`loadCrossDomainChunks` (called from `loadFacetBasedContent` line 990) follows facet concept links — also course-agnostic. CORRECT.

### Keyword fallback path
`_keywordFallbackLoad` iterates `materials` (course-specific), but this is only reached when facet-based loading returns empty. For unified skills with facets, this path is not taken. ACCEPTABLE.

**Severity:** N/A — PASS.

---

## Area 5: FSRS Integrity — PASS

**What was tested:** `fsrs.js` unchanged; `applySkillUpdates` in `study.js` works with unified skills.

**Expected:** FSRS algorithm untouched.

**Actual:**
- `git diff HEAD~5 -- src/lib/fsrs.js` produces no output — file is unchanged across all 5 commits. CORRECT.
- `applySkillUpdates` (study.js:244):
  - Loads skill via `SubSkills.getById(u.skillId)` (line 267) — `getById` intentionally NOT filtered by `unified_into IS NULL`, so unified skills are accessible for mastery updates. CORRECT.
  - Loads facets via `Facets.getBySkill(u.skillId)` (line 298) — queries by `skill_id` without `unified_into` check (facets belong to skill, not the other way around). After unification, survivor has all facets (merged + transferred). CORRECT.
  - FSRS computation uses `currentRetrievability` from fsrs.js — unchanged. CORRECT.
  - Facet-level FSRS routing (line 309+) processes each facet individually by `concept_key`. Unified skills with more facets get more granular updates. CORRECT.

**Severity:** N/A — PASS.

---

## Area 6: Build Verification — PASS

**What was tested:** `npx vite build --mode development`.

**Expected:** Builds without errors.

**Actual:** 185 modules transformed, built in 1.74s. No errors. PASS.

---

## Area 7: Regression — PASS

**What was tested:** App startup path, ProfileScreen rendering, single-course extraction scenario.

### App startup
- Init flow (StudyContext.jsx:289-327): CIP seed → facet migration → material dedup → `backfillSkillCourses()` → `loadCoursesNested()` → API key. All wrapped in try/catch with `if (cancelled) return` guards. CORRECT.
- `backfillSkillCourses()` uses settings flag — idempotent, fast-path skip on second run. CORRECT.
- All `unified_into IS NULL` filters are in SQL WHERE clauses — if column doesn't exist (impossible after migration 008 runs), SQLite would error, but Tauri migrations run before React loads. Safe.

### ProfileScreen rendering
- `loadProfile()` bulk-loads via `SubSkills.getAllActive()` which now filters `unified_into IS NULL`. On a DB with no unified skills, this returns all active skills (same as before). CORRECT.
- `SkillCourses.getAll()` wrapped in try/catch (line 739-740) — if table doesn't exist, returns empty array, `skillCoursesMap` is empty, `courseIds` falls back to `[source_course_id]`. CORRECT.
- ProfileScreen accesses `sub.courseIds` with `|| []` guards (line 187) and explicit fallback (line 390). No null reference risk. CORRECT.

### Single-course extraction
- `detectAndUnify()` (unification.js:280-356): Query filters `sa.source_course_id != sb.source_course_id` — with a single course, no pairs match. Returns `{ pairsDetected: 0, pairsUnified: 0, errors: [] }`. CORRECT.
- Both hooks in skills.js log nothing for 0 pairs, catch any errors. CORRECT.

**Severity:** N/A — PASS.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Absorbed skill invisibility | PASS | 9 filters verified; 1 gap found + fixed (FacetMastery.getDueForReview) |
| Extraction pipeline hook | PASS | 2 detectAndUnify hooks + 4 SkillCourses.add hooks |
| ProfileScreen attribution | PASS | Bulk SkillCourses.getAll() + courseIds on enriched subs |
| AI context chunks | PASS | No course filter in facet-based chunk loading path |
| FSRS integrity | PASS | fsrs.js unchanged, applySkillUpdates works with unified skills |
| Build verification | PASS | 185 modules, 1.74s |
| Regression | PASS | Startup, ProfileScreen, single-course extraction all safe |

**Result: 7/7 areas PASS. All 11 blueprint acceptance criteria verified across Phase 1 + Phase 2 + Phase 3.**

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** 6
**Status:** Complete

### What Was Done
Full QA verification of cross-course skill unification across all 3 phases (7 areas). Found and fixed 1 missing filter (FacetMastery.getDueForReview). All areas pass.

### Files Deposited
- `study/knowledge/qa/cross-course-unification-full-qa-2026-03-22.md` — this report

### Files Created or Modified (Code)
- `src/lib/db.js` — added missing `AND ss.unified_into IS NULL` to `FacetMastery.getDueForReview()` (line 2374)

### Decisions Made
- None

### Flags for CEO
- None

### Flags for Next Step
- Step 7 (UXV) validates the user experience of unified skills in ProfileScreen, mastery accuracy, learning science risk, and AI tutor context quality.
