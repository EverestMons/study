# study — Tutor Phase 1 Blueprint: Facet Assessment in All Modes
**Date:** 2026-03-24 | **Agent:** Study Systems Analyst | **Output Receipt:** Complete

---

## Audit: Facet Assessment Block Coverage Across 5 Study Modes

### What `buildFacetAssessmentBlock()` produces (study.js:1330-1390)
- Takes `(skillIds, allSkills)`, caps at `MAX_SKILLS = 3`
- For each skill: loads facets via `Facets.getBySkill()`, loads mastery via `FacetMastery.getByFacets()`
- Output format per skill:
  ```
  FACETS FOR skill_name (concept_key):
    facet-key: facet_name [mastery: X%] [blooms: level]
      Demonstrates: criteria text
  ```
- Returns empty string when `skillIds` is empty or no facets exist for any skill

### Coverage matrix

| Mode | Context Builder | Has Facet Block? | Call Site |
|------|----------------|-----------------|-----------|
| Assignment | `buildFocusedContext()` | YES | Line 1470: `buildFacetAssessmentBlock(asgnSkillIdsArr, allSkills)` |
| Skill | `buildFocusedContext()` | YES | Line 1546: `buildFacetAssessmentBlock([skill.id], allSkills)` |
| Exam | `buildFocusedContext()` | NO | Exam branch (lines 1579-1684) never calls it |
| Recap | `buildContext()` | NO | `buildContext()` (lines 1169-1325) never calls it |
| Explore | `buildContext()` | NO | Same as recap — no focus context falls to `buildContext()` |

### How modes route to context builders (StudyContext.jsx:1253-1264)
```javascript
if (focusContext && (focusContext.type === "assignment" || focusContext.type === "skill" || focusContext.type === "exam")) {
  ctx = await buildFocusedContext(active.id, active.materials, rebuildFocus, skills);
} else {
  ctx = await buildContext(active.id, active.materials, skills, asgn, newMsgs, discussedChunks.current);
}
```
Recap and explore have no `focusContext` set, so they always fall to `buildContext()`.

### Downstream pipeline confirmation
- **`buildSystemPrompt()`** (line 1756): Contains "FACET-LEVEL ASSESSMENT:" section instructing the AI to rate individual facets when FACETS section is present in context. This section is present for ALL modes (single system prompt function). **No changes needed.**
- **`parseSkillUpdates()`** (lines 1766-1821): Facet sub-line parsing implemented at lines 1773-1785. Regex: `^(?:\s+|>)\s*([\w-]+):\s*(struggled|hard|good|easy)`. Extracts `facetKey`, `rating`, `reason`, `context`, `criteria`. Pushes to `currentSkill.facets[]`. **No changes needed.**
- **`applySkillUpdates()`** (lines 244+): Per-facet routing at lines 316-393 when `u.facets.length > 0`. Falls back to uniform distribution when no facet ratings. **No changes needed.**

---

## Blueprint: Add Facet Assessment Block to `buildContext()`

### Target
`src/lib/study.js` — `buildContext()` function (lines 1169-1325). Single additive change.

### Skills to pass
Use the `relevantSkillIds` array already computed at lines 1243-1249:
```javascript
let relevantSkillIds = [];
if (Array.isArray(skills)) {
  for (const s of skills) {
    const nameLower = s.name.toLowerCase();
    if (keywords.some(kw => nameLower.includes(kw))) relevantSkillIds.push(s.id);
  }
}
```
These are skill IDs whose names match keywords extracted from the last 6 messages — exactly the skills relevant to the current conversation.

### Placement
Insert **after** `relevantSkillIds` is computed (line 1249) and **before** the "LOADED SOURCE MATERIAL" line (line 1253). This matches the pattern in `buildFocusedContext()` where the facet block appears between skills and source material.

### Code to insert (between lines 1249 and 1251)
```javascript
// Facet assessment block for relevant skills (enables per-facet FSRS in recap/explore)
var allSkills = Array.isArray(skills) ? skills : [];
if (relevantSkillIds.length > 0) {
  var facetBlock = await buildFacetAssessmentBlock(relevantSkillIds, allSkills);
  if (facetBlock) ctx += "\n" + facetBlock + "\n";
}
```

### Empty `relevantSkillIds` handling
When `relevantSkillIds` is empty (no skill names match recent keywords), skip the facet block entirely. This is consistent with:
1. `buildFacetAssessmentBlock()` itself returning `""` for empty `skillIds` (line 1331)
2. The existing guard pattern in `buildFocusedContext()`

### What does NOT change
- `buildFocusedContext()` — existing facet block calls for assignment and skill modes remain untouched
- `parseSkillUpdates()` — already handles facet sub-lines
- `applySkillUpdates()` — already routes per-facet when `u.facets` populated
- `buildSystemPrompt()` — FACET-LEVEL ASSESSMENT section already present for all modes
- No schema changes — no migration needed
- No new imports — `buildFacetAssessmentBlock` is already defined in the same file

### Note on exam mode
The exam branch of `buildFocusedContext()` (lines 1579-1684) also lacks a facet assessment block call. This is out of scope for this plan (which targets `buildContext()` for recap + explore coverage). Exam mode facet coverage could be addressed in a follow-up if needed, though exam mode's broad multi-material scope may make per-facet assessment less useful there.

---

## Verification checklist (for Step 3 QA)
1. `buildContext()` calls `buildFacetAssessmentBlock(relevantSkillIds, allSkills)` between skill tree and source material
2. Call is conditional on `relevantSkillIds.length > 0`
3. `buildFocusedContext()` unchanged
4. `parseSkillUpdates()` unchanged
5. `applySkillUpdates()` unchanged
6. `buildSystemPrompt()` unchanged
7. Build passes: `npx vite build --mode development`
