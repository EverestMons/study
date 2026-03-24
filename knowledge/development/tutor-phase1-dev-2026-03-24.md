# study — Tutor Phase 1 Dev Log: Facet Assessment in All Modes
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Change Summary

Added `buildFacetAssessmentBlock()` call to `buildContext()` in `src/lib/study.js`, enabling per-facet FSRS routing during recap and explore study modes.

## What Changed

**File:** `src/lib/study.js` — `buildContext()` function

**Insertion point:** After `relevantSkillIds` computation (line 1249), before "LOADED SOURCE MATERIAL" section (line 1253).

**Code added (7 lines):**
```javascript
// Facet assessment block for relevant skills (enables per-facet FSRS in recap/explore)
var allSkills = Array.isArray(skills) ? skills : [];
if (relevantSkillIds.length > 0) {
  var facetBlock = await buildFacetAssessmentBlock(relevantSkillIds, allSkills);
  if (facetBlock) ctx += "\n" + facetBlock + "\n";
}
```

## What Did NOT Change

- `buildFocusedContext()` — existing facet block calls for assignment (line 1470) and skill (line 1546) modes untouched
- `parseSkillUpdates()` — facet sub-line parsing unchanged
- `applySkillUpdates()` — per-facet FSRS routing unchanged
- `buildSystemPrompt()` — FACET-LEVEL ASSESSMENT section unchanged
- No schema changes, no migrations
- No new imports (function defined in same file)

## Build Verification

```
npx vite build --mode development
✓ 186 modules transformed
✓ built in 1m 8s
```

No errors. Only pre-existing warnings about chunk sizes and dynamic imports (unrelated to this change).

## Commit

```
229bfee feat: tutor facet assessment block added to general context builder (recap + explore modes)
```

## Coverage After Change

| Mode | Context Builder | Has Facet Block? |
|------|----------------|-----------------|
| Assignment | `buildFocusedContext()` | YES |
| Skill | `buildFocusedContext()` | YES |
| Exam | `buildFocusedContext()` | NO (out of scope) |
| Recap | `buildContext()` | **YES (new)** |
| Explore | `buildContext()` | **YES (new)** |
