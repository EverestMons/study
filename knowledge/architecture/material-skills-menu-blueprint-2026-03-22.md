# Material Skills Menu — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Diagnostic reference:** `knowledge/research/material-skills-menu-diagnostic-2026-03-22.md`

---

## Overview

When a user clicks "Start Studying" on a material card in MaterialsScreen, the system shows skills extracted from **that specific material** in the SkillPicker, not all course skills. The user picks a skill to study. Single-skill materials show a compact confirmation card. A "Show all skills" escape hatch expands to the full course view.

---

## Component 1: DB Query — `SubSkills.getByMaterial(materialId)`

**Location:** `src/lib/db.js`, inside the `SubSkills` export object.

**SQL:**
```sql
SELECT DISTINCT ss.id
FROM sub_skills ss
JOIN chunk_skill_bindings csb ON csb.sub_skill_id = ss.id
JOIN chunks c ON c.id = csb.chunk_id
WHERE c.material_id = ?
  AND ss.is_archived = 0
  AND ss.unified_into IS NULL
```

**Returns:** Array of `{ id }` rows — just the skill IDs. We only need IDs because the enrichment (mastery, deadlines, review dates) is already done by the existing pipeline in `selectMode`. This query is used as a **filter set**, not as a data source.

**Why not return full skill objects:** `loadSkillsV2` already loads and enriches all skills for the course with mastery data, prerequisites, and facets. Duplicating that enrichment would be wasteful and fragile. Instead: load all skills → enrich → filter by material ID set.

**Acceptance criteria:**
- Query returns only skill IDs linked to chunks of the specified material
- Respects `is_archived = 0` and `unified_into IS NULL` (matches existing `SubSkills.getByCourse`)
- `DISTINCT` prevents duplicates when a skill is linked to multiple chunks in the same material

---

## Component 2: `enterStudy` Signature Change

**Location:** `src/StudyContext.jsx:874`

**Current:**
```javascript
const enterStudy = async (course, initialMode) => {
```

**New:**
```javascript
const enterStudy = async (course, initialMode, materialId) => {
```

**Flow:** `materialId` is passed through to `selectMode`:
```javascript
if (initialMode) {
  selectMode(initialMode, materialId);
}
```

No new state variable needed. The `materialId` flows as a function parameter, not stored in state — it's only needed during the `selectMode` call and then the result is captured in `pickerData`.

**Acceptance criteria:**
- Third parameter is optional (existing callers unaffected)
- Parameter flows to `selectMode` without being stored in state

---

## Component 3: `selectMode("skills")` Filtering

**Location:** `src/StudyContext.jsx:913`

**Current signature:**
```javascript
const selectMode = async (mode) => {
```

**New signature:**
```javascript
const selectMode = async (mode, materialId) => {
```

**Filtering logic — inserted after skill enrichment (after line 1031), before `setPickerData`:**

```javascript
// Material-specific filtering
var materialName = null;
var allEnriched = enriched; // save unfiltered copy
if (materialId) {
  var matSkillRows = await SubSkills.getByMaterial(materialId);
  var matSkillIds = new Set(matSkillRows.map(r => r.id));
  enriched = enriched.filter(s => matSkillIds.has(s.id));
  var mat = (active.materials || []).find(m => m.id === materialId);
  materialName = mat?.name || null;
}
```

**Then the `setPickerData` call changes to include material filter info and unfiltered items:**

```javascript
// Single-skill confirmation (CEO decision: show brief card, not full picker)
if (materialId && enriched.length === 1) {
  setPickerData({ mode, singleSkill: enriched[0], materialName });
  return;
}

// Zero-skill edge case
if (materialId && enriched.length === 0) {
  setPickerData({ mode, empty: true, message: 'No skills extracted from "' + (materialName || 'this material') + '" yet.' });
  return;
}

// Normal and material-filtered multi-skill
setPickerData({
  mode,
  items: enriched,
  ...(materialId ? { materialFilter: { id: materialId, name: materialName }, allItems: allEnriched } : {}),
});
```

**Key properties added to `pickerData`:**
- `singleSkill` — enriched skill object (triggers compact confirmation in SkillPicker)
- `materialFilter` — `{ id, name }` (shown as banner in SkillPicker, enables "Show all" toggle)
- `allItems` — full unfiltered enriched skill list (used when user clicks "Show all")

**Acceptance criteria:**
- When `materialId` is absent: existing behavior unchanged (no filter, no extra properties)
- When `materialId` is present with multiple skills: `items` is filtered, `allItems` and `materialFilter` are set
- When `materialId` is present with 1 skill: `singleSkill` is set instead of `items`
- When `materialId` is present with 0 skills: empty state with material-specific message

---

## Component 4: Single-Skill Confirmation (SkillPicker branch)

**Location:** `src/components/study/SkillPicker.jsx` — new branch near the top of the component, after the empty state check.

**When:** `pickerData.singleSkill` is truthy.

**Renders:** A compact card (not the full picker):
```
┌─────────────────────────────────┐
│  [Material Name]                │
│                                 │
│  ● [Skill Name]          [82%] │
│    [Description, 1 line]        │
│                                 │
│  ┌─────────┐  ┌───────────────┐│
│  │  Back   │  │     Start     ││
│  └─────────┘  └───────────────┘│
└─────────────────────────────────┘
```

**Behavior:**
- "Start" → calls `bootWithFocus({ type: "skill", skill: pickerData.singleSkill })`
- "Back" → calls `setPickerData(null); setSessionMode(null);` (returns to previous screen — same as existing empty state "Back" button)

**Styling:** Uses existing theme tokens. Card centered, max-width 400px, `animation: "fadeIn 0.3s"`. Strength dot uses existing `strengthColor()` helper.

**Acceptance criteria:**
- Card shows material name, skill name, strength percentage, description (truncated)
- "Start" begins a skill-focused session
- "Back" exits to previous screen
- Renders only when `pickerData.singleSkill` is set

---

## Component 5: Zero-Skill Edge Case

**Handled by:** The existing `pickerData.empty` branch in SkillPicker (lines 43-107).

**How:** When `materialId` is present and `enriched.length === 0`, `selectMode` sets:
```javascript
setPickerData({ mode, empty: true, message: 'No skills extracted from "[name]" yet.' });
```

SkillPicker already renders: message text + back button. **No new code in SkillPicker for this case.**

**Acceptance criteria:**
- Material-specific message mentions the material name
- Back button works (returns to MaterialsScreen)

---

## Component 6: "Show All Skills" Escape Hatch

**Location:** `src/components/study/SkillPicker.jsx` — new banner above the search bar.

**When:** `pickerData.materialFilter` is truthy (material-filtered view).

**Renders:**
```
┌──────────────────────────────────────────┐
│ Showing skills from "[Material Name]"    │
│                          Show all skills →│
└──────────────────────────────────────────┘
```

**Implementation:** SkillPicker uses a local state toggle:
```javascript
var [showingAll, setShowingAll] = useState(false);
var items = (showingAll && pickerData.allItems) ? pickerData.allItems : pickerData.items;
```

The banner changes when toggled:
- Filtered: `Showing skills from "[name]"` + "Show all skills →"
- All: `Showing all course skills` + "Show material skills →"

**Reset:** `showingAll` resets when `pickerData` changes (standard React behavior — component remounts when switching modes).

**Acceptance criteria:**
- Banner visible when `pickerData.materialFilter` exists
- Click toggles between material-filtered and all-course skill lists
- Stats, grouping, and filtering all work on the toggled items
- Banner text updates to reflect current view

---

## MaterialsScreen Changes

**Location:** `src/screens/MaterialsScreen.jsx`

**Change 1 — "Start Studying" button (line 298):**
```jsx
// Before:
onClick={() => enterStudy(active, "skills")}
// After:
onClick={() => enterStudy(active, "skills", mat.id)}
```

**Change 2 — "Study Available Skills" button (line 268):**
```jsx
// Before:
onClick={() => enterStudy(active, "skills")}
// After:
onClick={() => enterStudy(active, "skills", mat.id)}
```

Both are inside the `renderExpandedDetail(mat)` function, which has access to `mat` (the expanded material object).

**No other file changes needed.** CourseHomepage, ScheduleScreen, ProfileScreen, and CurriculumScreen all call `enterStudy(active, "skills")` or `enterStudy(active)` without a materialId — they continue to show all course skills.

---

## Data Flow Diagram

```
MaterialsScreen: user clicks "Start Studying" on material card
  │
  ▼
enterStudy(active, "skills", mat.id)           [StudyContext.jsx]
  │ setPreviousScreen, setActive, setScreen("study")
  │ reset session state, create chat session
  ▼
selectMode("skills", materialId)               [StudyContext.jsx]
  │ loadSkillsV2(active.id) → all course skills
  │ enrich all skills (strength, deadlines, review dates)
  │ SubSkills.getByMaterial(materialId) → skill ID set
  │ filter enriched list by ID set
  ▼
┌─────────────────────────────────────────┐
│ enriched.length === 0 ?                 │
│   → pickerData.empty + material message │
│                                         │
│ enriched.length === 1 ?                 │
│   → pickerData.singleSkill              │
│                                         │
│ enriched.length >= 2 ?                  │
│   → pickerData.items (filtered)         │
│   + pickerData.allItems (unfiltered)    │
│   + pickerData.materialFilter           │
└─────────────────────────────────────────┘
  │
  ▼
SkillPicker renders                        [SkillPicker.jsx]
  │ singleSkill → compact confirmation card
  │ empty → message + back button
  │ items → full picker (with "Show all" banner)
  ▼
User picks skill → bootWithFocus({ type: "skill", skill })
```

---

## New State Variables

**None in StudyContext.** The materialId flows as a function parameter, and the result is captured in the existing `pickerData` state object. No new refs or state needed.

**One local state in SkillPicker:** `showingAll` (boolean, default false) — toggles between material-filtered and all-course skills.

---

## How to Verify

1. **Material with multiple skills:** Click "Start Studying" on a ready material → SkillPicker shows only skills from that material. Banner says "Showing skills from [name]". Click "Show all skills" → all course skills appear. Click "Show material skills" → filtered view returns.

2. **Material with exactly 1 skill:** Click "Start Studying" → compact confirmation card with material name, skill name, strength. Click "Start" → skill-focused session begins. Click "Back" → returns to MaterialsScreen.

3. **Material with 0 skills:** Click "Start Studying" on a material with no extracted skills → message "No skills extracted from [name] yet." with Back button.

4. **Normal flow (non-material):** Click "Skills" on CourseHomepage → all course skills in SkillPicker. No material filter banner. (Regression check.)

5. **Build:** `npx vite build --mode development` passes with no errors.

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Designed the material skills menu feature across 6 components: DB query, enterStudy change, selectMode filtering, single-skill confirmation, zero-skill handling, "show all" escape hatch. Data flow diagram and verification checklist included.

### Files Deposited
- `study/knowledge/architecture/material-skills-menu-blueprint-2026-03-22.md` — this blueprint

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Material skill lookup returns IDs only (filter-set pattern, not duplicating enrichment)
- Single-skill confirmation is a branch in SkillPicker (not a separate component/state)
- "Show all" is a local toggle in SkillPicker using `allItems` on `pickerData`
- No new state variables in StudyContext (materialId flows as param, result in pickerData)

### Flags for CEO
- None

### Flags for Next Step
- Step 2 (DEV) implements the 4-file change list: db.js, StudyContext.jsx, MaterialsScreen.jsx, SkillPicker.jsx.
