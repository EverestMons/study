# Material Skills Menu — QA Report
**Date:** 2026-03-22 | **Blueprint:** `knowledge/architecture/material-skills-menu-blueprint-2026-03-22.md`

---

## Area 1: DB Query — `SubSkills.getByMaterial()`
**File:** `src/lib/db.js:1491-1502`

| Check | Result |
|---|---|
| SQL joins `chunks → chunk_skill_bindings → sub_skills` | PASS — `JOIN chunk_skill_bindings csb ON csb.sub_skill_id = ss.id` then `JOIN chunks c ON c.id = csb.chunk_id` |
| Filters by `material_id` | PASS — `WHERE c.material_id = ?` |
| Includes `is_archived = 0` | PASS |
| Includes `unified_into IS NULL` | PASS |
| `DISTINCT` prevents duplicates | PASS — `SELECT DISTINCT ss.id` |
| Returns only IDs (filter-set pattern) | PASS — `SELECT DISTINCT ss.id` |

**Verdict: PASS**

---

## Area 2: Material ID Flow
**Trace:** `MaterialsScreen.jsx:268,298` → `enterStudy(active, "skills", mat.id)` → `StudyContext.jsx:874` `enterStudy(course, initialMode, materialId)` → line 908 `selectMode(initialMode, materialId)` → line 913 `selectMode(mode, materialId)`

| Check | Result |
|---|---|
| MaterialsScreen passes `mat.id` as 3rd arg (line 268, "Study Available Skills") | PASS |
| MaterialsScreen passes `mat.id` as 3rd arg (line 298, "Start Studying") | PASS |
| `enterStudy` accepts 3rd param `materialId` | PASS |
| `enterStudy` passes `materialId` to `selectMode` (line 908) | PASS |
| `selectMode` accepts 2nd param `materialId` | PASS |
| No dropped context in chain | PASS |

**Verdict: PASS**

---

## Area 3: Skill Filtering (Conditional)
**File:** `src/StudyContext.jsx:1032-1060`

| Check | Result |
|---|---|
| When `materialId` present: calls `SubSkills.getByMaterial(materialId)` | PASS — line 1036 |
| Builds ID set from result | PASS — `new Set(matSkillRows.map(...))` line 1037 |
| Filters enriched list by ID set | PASS — `enriched.filter(s => matSkillIds.has(s.id))` line 1038 |
| Saves unfiltered copy in `allEnriched` before filtering | PASS — line 1033 |
| When `materialId` absent: no filtering, `setPickerData({ mode, items: enriched })` | PASS — line 1058-1059 |
| `enriched` declared with `var` (allows reassignment) | PASS — line 1001 |

**Verdict: PASS**

---

## Area 4: Single-Skill Confirmation
**Files:** `StudyContext.jsx:1043-1047`, `SkillPicker.jsx:43-70`

| Check | Result |
|---|---|
| When `materialId && enriched.length === 1`: sets `pickerData.singleSkill` | PASS — line 1044-1045 |
| `singleSkill` is the enriched skill object (has strength, deadlines, etc.) | PASS — `enriched[0]` |
| SkillPicker checks `pickerData.singleSkill` before empty state | PASS — line 44, before line 73 |
| Renders material name | PASS — line 49-51 |
| Renders skill name, strength dot, strength percentage | PASS — lines 54-56 |
| Renders description (truncated to 2 lines) | PASS — lines 58-59, `-webkit-line-clamp: 2` |
| "Start" calls `bootWithFocus({ type: "skill", skill: sk1 })` | PASS — line 64 |
| "Back" calls `setPickerData(null); setSessionMode(null)` | PASS — line 62 |

**Verdict: PASS**

---

## Area 5: Zero-Skill Edge Case
**File:** `StudyContext.jsx:1049-1053`

| Check | Result |
|---|---|
| When `materialId && enriched.length === 0`: sets `pickerData.empty` | PASS — line 1050 |
| Message includes material name | PASS — `'No skills extracted from "' + (materialName || 'this material') + '" yet.'` |
| Uses existing SkillPicker empty state branch (line 73) | PASS — no new code needed |
| Back button in empty state works | PASS — existing code at line 133 |

**Verdict: PASS**

---

## Area 6: "Show All Skills" Escape Hatch
**File:** `SkillPicker.jsx:39, 142, 254-263`

| Check | Result |
|---|---|
| Local `showingAll` state (default false) | PASS — line 39 |
| `items` variable uses toggle: `(showingAll && pickerData.allItems) ? pickerData.allItems : pickerData.items` | PASS — line 142 |
| Banner visible when `pickerData.materialFilter` exists | PASS — line 255 |
| Banner shows material name in filtered view | PASS — `"Showing skills from \"" + pickerData.materialFilter.name + "\""` |
| Banner shows "Showing all course skills" in expanded view | PASS |
| Toggle button text changes: "Show all skills" ↔ "Show material skills" | PASS — line 260 |
| Stats, grouping, filtering all derive from `items` (toggled) | PASS — `items` used at lines 145, 163, 164, 168, 177, 228 |
| `allItems` set on `pickerData` when `materialId` present | PASS — `StudyContext.jsx:1057` |

**Verdict: PASS**

---

## Area 7: Normal Flow Regression
**Non-material entry points checked:**

| Caller | Code | Material ID? | Result |
|---|---|---|---|
| `CourseHomepage.jsx:125` | `enterStudy(active, "skills")` | No 3rd arg | PASS — all skills shown |
| `CourseHomepage.jsx:113` | `enterStudy(active, "assignment")` | No 3rd arg | PASS |
| `CourseHomepage.jsx:119` | `enterStudy(active, "exam")` | No 3rd arg | PASS |
| `ScheduleScreen.jsx:348,412` | `enterStudy(active)` | No 3rd arg, no mode | PASS |
| `CurriculumScreen.jsx` | Does not call `enterStudy` | N/A | PASS — uses `bootWithFocus` directly |

When `materialId` is undefined: `selectMode` skips filtering block (line 1035 `if (materialId)` is false), falls through to `setPickerData({ mode, items: enriched })` at line 1059. No `materialFilter`, no `allItems`, no `singleSkill`. Existing behavior unchanged.

**Verdict: PASS**

---

## Area 8: Build Verification
```
npx vite build --mode development
✓ 185 modules transformed.
✓ built in 2.07s
```
No errors. No const-reassignment warning (fixed during implementation).

**Verdict: PASS**

---

## Summary

| Area | Verdict |
|---|---|
| 1. DB Query | PASS |
| 2. Material ID Flow | PASS |
| 3. Skill Filtering | PASS |
| 4. Single-Skill Confirmation | PASS |
| 5. Zero-Skill Edge Case | PASS |
| 6. "Show All" Escape Hatch | PASS |
| 7. Normal Flow Regression | PASS |
| 8. Build Verification | PASS |

**Overall: 8/8 PASS**
