# Material Skills Menu — Diagnostic Report
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## Investigation (1): "Start Studying" Button Click Path

### Location
`src/screens/MaterialsScreen.jsx`, two call sites:

1. **Ready state** (line 298): Full "Start Studying" button on expanded material card
2. **Incomplete state** (line 268): "Study Available Skills" button on partially-extracted materials

### What it does
Both call the exact same handler with the same arguments:

```jsx
onClick={() => enterStudy(active, "skills")}
```

**Critical finding:** Neither call passes the material ID or any material-specific information. The handler receives:
- `active` — the entire course object (from `useStudy()`)
- `"skills"` — a string selecting the "skills" study mode

The material the user clicked is completely lost at this point.

### Full click path
```
User clicks "Start Studying" on material card
  → enterStudy(active, "skills")                     [MaterialsScreen.jsx:298]
    → setPreviousScreen(screen)                       [StudyContext.jsx:875]
    → setActive(course); setScreen("study")           [StudyContext.jsx:876]
    → (resets all session state)                      [StudyContext.jsx:877-889]
    → (creates new chat session)                      [StudyContext.jsx:890-906]
    → selectMode("skills")                            [StudyContext.jsx:908]
      → loadSkillsV2(active.id)                       [StudyContext.jsx:916]
      → (builds enriched skill list for ALL course skills) [StudyContext.jsx:1001-1031]
      → setPickerData({ mode, items: enriched })      [StudyContext.jsx:1032]
        → SkillPicker renders with ALL course skills  [SkillPicker.jsx]
```

### Summary
The "Start Studying" button navigates to the study screen and opens the SkillPicker with **all skills for the entire course** — not filtered to the material the user clicked. There is no material context carried through the flow.

---

## Investigation (2): `enterStudy` Handler in StudyContext

### Location
`src/StudyContext.jsx:874-910`

### Signature
```javascript
const enterStudy = async (course, initialMode) => { ... }
```

### What it does
1. Sets `previousScreen` (for back navigation)
2. Sets `active` to the course and navigates to study screen
3. Resets all session state (msgs, focus, practice, etc.)
4. Creates a new chat session (journals old session, creates fresh session row)
5. If `initialMode` is provided, calls `selectMode(initialMode)`

### Material awareness
**None.** `enterStudy` takes a course object and an optional mode string. It has no parameter for material ID or material object. When called from MaterialsScreen, it cannot know which material card was clicked.

### `selectMode("skills")` path (line 913-1032)
When `selectMode("skills")` runs:
1. Loads ALL skills for the course via `loadSkillsV2(active.id)`
2. Builds a deadline skill map from assignments
3. Enriches each skill with strength, deadline info, review dates
4. Sorts by strength (weakest first, deadline-promoted within ±10% band)
5. Sets `pickerData` with the full enriched skill list

No material filtering happens anywhere in this path.

---

## Investigation (3): Material → Skills Data Chain

### The chain
```
material_id
  → chunks (via chunks.material_id)
    → chunk_skill_bindings (via chunk_skill_bindings.chunk_id)
      → sub_skills (via chunk_skill_bindings.sub_skill_id)
```

And at the facet level:
```
material_id
  → chunks (via chunks.material_id)
    → chunk_facet_bindings (via chunk_facet_bindings.chunk_id)
      → facets (via chunk_facet_bindings.facet_id)
        → sub_skills (via facets.skill_id)
```

### Existing DB queries

| Module | Method | What it does |
|---|---|---|
| `Chunks.getByMaterial(materialId)` | Returns all chunks for a material | **db.js:1174** |
| `ChunkSkillBindings.getByChunk(chunkId)` | Returns bindings + skill name for a chunk | **db.js:1693** |
| `ChunkSkillBindings.getBySkill(subSkillId)` | Returns all chunk bindings for a skill | **db.js:1703** |
| `ChunkFacetBindings.getByChunk(chunkId)` | Returns facet bindings for a chunk | **db.js:2457** |
| `SubSkills.getByCourse(courseId)` | Returns all skills for a course | **db.js:1484** |
| `SubSkills.getById(id)` | Returns a single skill | **db.js:1491** |

### Missing query
There is **no `SubSkills.getByMaterial(materialId)` method**. To get skills for a specific material, you need a multi-step join:

```sql
SELECT DISTINCT ss.*
FROM sub_skills ss
JOIN chunk_skill_bindings csb ON csb.sub_skill_id = ss.id
JOIN chunks c ON c.id = csb.chunk_id
WHERE c.material_id = ?
  AND ss.is_archived = 0
  AND ss.unified_into IS NULL
```

### Existing material→skill counting
`refreshMaterialSkillCounts` in `StudyContext.jsx:201-233` already computes per-material skill counts. It traverses:
1. Load all skills for course (`loadSkillsV2`)
2. For each skill, load its chunk bindings (`ChunkSkillBindings.getBySkill`)
3. Map chunk_id → material via the `active.materials` data
4. Build `matCounts[mat.id] = { count, categories }`

This produces **counts only** (skill count + category names), not the actual enriched skill objects needed for a picker.

---

## Investigation (4): Existing Skill Picker Components

### SkillPicker.jsx (`src/components/study/SkillPicker.jsx`, 367 lines)
This is the primary skill picker used by the "skills" study mode. It:
- Receives data via `pickerData` from `useStudy()`
- Shows a searchable, filterable list of skills grouped by strength band or category
- Has expand-to-detail with Learn / Practice buttons
- Calls `bootWithFocus({ type: "skill", skill: sk })` to start learning
- Calls practice mode setup for practice

**Reusability assessment:** SkillPicker is the right component to reuse. It already has:
- Search, filter by Bloom's/type, group by strength/category
- Due-for-review banner
- Expand-to-detail with actions
- All the enrichment logic (strength, deadline, review date)

The only change needed is to **pre-filter the items** passed to `pickerData` to only include skills linked to the selected material.

### SkillsPanel.jsx (`src/components/study/SkillsPanel.jsx`, 258 lines)
This is a different component — it's the sidebar skills panel shown during active study sessions. Not relevant for this feature.

### SkillsScreen.jsx (`src/screens/SkillsScreen.jsx`, ~190 lines)
Course-wide skills overview screen. Not a picker — just a read-only display.

---

## Investigation (5): Expected Flow for Starting a Skill-Focused Session

### How the existing SkillPicker → study session flow works

1. User picks a skill in SkillPicker → clicks "Learn"
2. `bootWithFocus({ type: "skill", skill: sk })` is called (SkillPicker.jsx:323)
3. `bootWithFocus` in StudyContext.jsx:1087-1171:
   - Sets screen to "study"
   - Sets `focusContext` to the focus object
   - Loads skills, journal, builds focused context via `buildFocusedContext()`
   - Caches context in `cachedSessionCtx`
   - Constructs system prompt with mode hint ("SKILL MASTERY")
   - Streams first AI response
4. The session is now active with the selected skill focused

### What `bootWithFocus` expects
```javascript
const bootWithFocus = async (focus) => {
  // focus = { type: "skill", skill: <enriched skill object> }
  // The skill object needs: id, name, description, strength, mastery, etc.
}
```

The skill object must be the enriched shape from `loadSkillsV2` (with mastery, facets, etc.), as `buildFocusedContext` uses these fields.

### For Practice mode
The SkillPicker's "Practice" button (line 328-353) takes a different path:
1. Loads/creates a PracticeSet
2. Sets `practiceMode` state
3. Generates problems
4. PracticeMode component renders

Both paths (Learn and Practice) work with a single enriched skill object from the SkillPicker.

---

## Summary: What's Needed for the Feature

### Current state
- "Start Studying" on a material card → opens SkillPicker with ALL course skills
- No material context is passed or preserved
- No `SubSkills.getByMaterial()` query exists in the DB layer

### To implement "pick a skill from this material":

1. **DB layer:** Add a `getSkillsByMaterial(materialId)` query (single JOIN across chunks → chunk_skill_bindings → sub_skills)

2. **MaterialsScreen:** Change the "Start Studying" click to pass the material ID. Two approaches:
   - **Option A:** Call `enterStudy(active, "skills", materialId)` — add material param to `enterStudy`
   - **Option B:** Set a material filter before calling `enterStudy`, then `selectMode("skills")` picks it up

3. **selectMode("skills"):** After loading all skills and enriching them, filter to only skills linked to the material (using the new DB query or by checking chunk bindings in JS)

4. **SkillPicker:** No changes needed — it already renders whatever `pickerData.items` contains. If the items are pre-filtered to material-specific skills, it just works.

5. **Edge cases to handle:**
   - Material with 0 skills (show empty state message mentioning the material)
   - Material with 1 skill (could auto-select and skip picker)
   - User wants to switch to all-course skills (need a "Show all skills" escape hatch)

### Recommended approach
The simplest path is **Option A**: extend `enterStudy` with an optional `materialId` parameter, flow it through to `selectMode`, and filter the enriched skills list. SkillPicker needs zero changes — the filtering happens upstream.

---

## Output Receipt
**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Investigated the "Start Studying" click path from MaterialsScreen through StudyContext to SkillPicker. Mapped the material→skill data chain. Identified the missing DB query and the upstream filtering point.

### Files Deposited
- `study/knowledge/research/material-skills-menu-diagnostic-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- None (diagnostic only — implementation approach is a recommendation)

### Flags for CEO
- None

### Flags for Next Step
- Implementation needs: 1 new DB query, extend `enterStudy` signature, filter in `selectMode`, edge case handling.
