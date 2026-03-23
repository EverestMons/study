# Continue Feature Diagnostic
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## 1. CourseHomepage Current Layout

**File:** `src/screens/CourseHomepage.jsx` (193 lines)

### Current cards (3-column grid, `alignContent: "start"`):

| Card | Subtitle | Action |
|------|----------|--------|
| Assignment Work | active/overdue count | `enterStudy(active, "assignment")` |
| Exam Review | days until exam + readiness % | `enterStudy(active, "exam")` |
| Skill Development | skill count + due for review | `enterStudy(active, "skills")` |
| Curriculum | active assignments + skill count | `navigateTo("curriculum")` |
| Materials | material count + sections | `navigateTo("materials")` |
| Schedule | current week | `navigateTo("schedule")` |

### Where "Continue" fits:

**Recommended: New prominent button ABOVE the card grid**, not replacing a card. The 3×2 grid is balanced and all cards serve distinct purposes. A "Continue Studying" button between the header and the grid would be prominent and semantically different — it's a personalized recommendation, not a category.

**Alternative:** Replace the first card position (shift cards right). But this breaks the 3×2 grid symmetry.

### Data already loaded:
- `loadSkillsV2(active.id)` — full enriched skill objects with mastery state
- `effectiveStrength(skill)` — computed per skill
- `nextReviewDate(skill)` — FSRS-based next review date

The skills data needed for "Continue" is already loaded in the CourseHomepage `useEffect`.

---

## 2. Prerequisite Ordering Data

### Confirmed: `ChunkPrerequisites` exists in `db.js`

**Methods available:**
- `ChunkPrerequisites.create(chunkId, prereqChunkId, source)` — single insert
- `ChunkPrerequisites.createBatch(records)` — batch insert with transaction
- `ChunkPrerequisites.getByChunk(chunkId)` — returns prereqs with `prereq_label`, `prereq_section_path`
- `ChunkPrerequisites.getByMaterial(materialId)` — all prereqs for a material

### Can we query "next unmastered chunk in prerequisite order"?

**Not directly.** The prerequisite table links chunks, not skills. The mapping path is:
- Chunk → ChunkFacetBindings → Facet → Skill
- ChunkPrerequisites tells us chunk ordering, but "mastery" is tracked at the skill/facet level, not chunk level

To find "next chunk to study," we'd need:
1. Get all chunks for the course ordered by `ordering`
2. For each chunk, get bound skills/facets
3. Check if those skills/facets are mastered
4. The first chunk where skills are unmastered AND all prerequisite chunks' skills ARE mastered = continue target

**However, a simpler approach works better** (see Section 4).

---

## 3. Student Mastery State — "Where They Left Off"

### Three options investigated:

**(a) Most recently studied skill (from sessions table)**
- `Sessions.getByCourse(courseId)` — ordered by `started_at DESC`
- Sessions store `intent` and `scope` (JSON), but NOT the focus skill directly
- `SessionSkills` table links session → sub_skill_id with `is_target` flag
- To get last studied skill: get latest session → get session_skills where `is_target = 1`
- **Data path exists but requires 2 queries**

**(b) Lowest-mastery skill with prerequisites satisfied**
- `loadSkillsV2` already returns all skills with mastery + prerequisites
- Can filter in-memory: find skills where `effectiveStrength < threshold` and all prerequisites have `effectiveStrength >= threshold`
- **Most readily available — zero new queries needed**

**(c) Next chunk in prerequisite order after last mastered**
- Requires chunk → skill mapping + mastery check per chunk
- More complex, less direct benefit
- **Not recommended as primary signal**

### Recommendation: Option (b) — prerequisite-aware lowest-mastery skill

This uses data already loaded by CourseHomepage's `useEffect`. No new DB queries needed. The algorithm runs entirely in-memory on the `skills` array from `loadSkillsV2`.

---

## 4. "Next Skill" Algorithm

### Recommended algorithm (runs in CourseHomepage's existing data):

```javascript
function getNextSkill(skills) {
  if (!skills || skills.length === 0) return null;

  // Build prerequisite satisfaction map
  const strengthMap = new Map();
  for (const s of skills) strengthMap.set(s.id, effectiveStrength(s));

  // Filter to eligible skills: low mastery + all prereqs satisfied
  const eligible = skills.filter(s => {
    const str = strengthMap.get(s.id) || 0;
    if (str >= 0.7) return false; // Already strong — skip

    // Check all prerequisites are satisfied (strength >= 0.5)
    const prereqsSatisfied = (s.prerequisites || []).every(p => {
      return (strengthMap.get(p.id) || 0) >= 0.5;
    });
    return prereqsSatisfied;
  });

  if (eligible.length === 0) return null;

  // Sort: untested first (no mastery), then by ascending strength
  eligible.sort((a, b) => {
    const strA = strengthMap.get(a.id) || 0;
    const strB = strengthMap.get(b.id) || 0;
    // Due for review takes priority
    const dueA = nextReviewDate(a) && nextReviewDate(a) <= new Date().toISOString().split("T")[0] ? 1 : 0;
    const dueB = nextReviewDate(b) && nextReviewDate(b) <= new Date().toISOString().split("T")[0] ? 1 : 0;
    if (dueA !== dueB) return dueB - dueA; // Due first
    return strA - strB; // Then weakest first
  });

  return eligible[0];
}
```

### Queries needed: **None new.** Uses `loadSkillsV2` data already loaded + `effectiveStrength` + `nextReviewDate` (both already imported in CourseHomepage).

### The skill-level prerequisite ordering from `loadSkillsV2` is sufficient. We don't need chunk-level `ChunkPrerequisites` for the Continue feature — those are for tutor context enrichment, not UI navigation.

---

## 5. Session Resume vs. Fresh Start

### Current behavior: **No session resume exists.**

- `enterStudy(course, initialMode)` always creates a fresh state:
  - Clears `msgs`, `input`, `sessionMode`, `focusContext`, `practiceMode`
  - Resets all session refs (`sessionSkillLog`, `sessionMasteryEvents`, etc.)
  - No mechanism to restore previous messages or session state
- `Sessions.pause(id)` exists in db.js but is never called from UI
- No "paused session" detection or restoration code

### Recommendation: **Always start fresh.**

Session resume would require persisting/restoring messages, focus context, and session state — significant complexity for marginal benefit. The "Continue" button should start a fresh session focused on the recommended next skill.

---

## 6. What `bootWithFocus` Needs

### Signature: `bootWithFocus(focus)` where `focus` is:

```javascript
// For skill focus:
{ type: "skill", skill: enrichedSkillObject }

// For assignment focus:
{ type: "assignment", assignment: assignmentObject }
```

### What the enriched skill object must include:

From `bootWithFocus` code (StudyContext.jsx:1142-1201):
- `focus.skill.name` — used for user message + language detection
- `focus.skill.description` — used for language detection + math detection

From `buildFocusedContext` (study.js) when `focus.type === "skill"`:
- `focus.skill.id` — used to look up facets, prereqs, cross-skill connections
- `focus.skill.sources` — used for keyword fallback material loading
- `focus.skill.name`, `focus.skill.description` — used for context

### Can we use `loadSkillsV2` output directly?

**Yes.** `loadSkillsV2` returns fully enriched skill objects with all required fields: `id`, `name`, `description`, `sources`, `mastery`, `prerequisites`, `conceptKey`, etc. The skill objects are already in the right shape.

### Continue button implementation:

```javascript
var nextSkill = getNextSkill(skills);
// skills already loaded in CourseHomepage useEffect
if (nextSkill) {
  bootWithFocus({ type: "skill", skill: nextSkill });
}
```

No additional loading needed — `loadSkillsV2` data from the `useEffect` is sufficient.

---

## Summary

| Question | Answer |
|----------|--------|
| Where does Continue fit? | New button above card grid (not replacing a card) |
| Prerequisite data? | `ChunkPrerequisites` exists but not needed — skill-level prereqs from `loadSkillsV2` suffice |
| "Where they left off"? | Lowest-mastery skill with satisfied prerequisites (in-memory from existing data) |
| Next skill algorithm? | Filter by unsatisfied + prereqs met, sort by due-for-review then weakest |
| New queries needed? | None — all data already loaded by CourseHomepage |
| Session resume? | No mechanism exists. Always start fresh. |
| `bootWithFocus` data? | `loadSkillsV2` output is already the right shape |

### Implementation estimate:

The Continue feature is **small-to-medium scope** — primarily CourseHomepage UI changes + a `getNextSkill()` utility function. No new DB methods, no new API calls, no migration needed.

---

## Output Receipt

**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Investigated 6 areas: CourseHomepage layout (3×2 card grid), ChunkPrerequisites availability (confirmed, but not needed for Continue), mastery state options (3 approaches evaluated), next-skill algorithm design, session resume status (none exists), and bootWithFocus data requirements.

### Files Deposited
- `study/knowledge/research/continue-feature-diagnostic-2026-03-22.md`

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- Continue button should be a prominent element above the card grid, not replacing a card
- Skill-level prerequisites from `loadSkillsV2` are sufficient — chunk-level `ChunkPrerequisites` not needed
- Option (b) "lowest-mastery skill with prereqs satisfied" is the best approach — uses existing data
- Always start fresh sessions (no resume mechanism exists or is needed)
- `loadSkillsV2` skill objects are already in the right shape for `bootWithFocus`

### Flags for CEO
- The Continue feature is lightweight — no new DB methods, queries, or migrations needed
- All data is already loaded by CourseHomepage's existing `useEffect`
- `Sessions.pause()` exists but is unused — could be leveraged later for session resume if desired

### Flags for Next Step
- `getNextSkill` algorithm is designed but not implemented
- CourseHomepage needs a new UI element + the algorithm function
- The `skills` array from `useEffect` data load should be stored in state for the Continue button to access
