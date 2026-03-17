# Architecture Blueprint: Skill Picker Redesign
## Review Focus Button + Categorized Card Grid

**Date:** 2026-03-14
**Agent:** Study Systems Analyst
**Step:** 1 (from skill-picker-redesign-plan-2026-03-14)
**Migration Impact:** None. No schema changes. All data already exists in v2 tables. This is a pure frontend restructuring.

---

## 1. Current State Analysis

### SkillPicker.jsx (150 lines)
`/src/components/study/SkillPicker.jsx`

The current implementation is a flat vertical list (`flexDirection: column, gap: 6, maxWidth: 500`). Each skill renders as a single row with:
- Skill name + strength % + REVIEW DUE badge
- Click to expand: reveals Learn/Practice buttons inline
- State tracking via `pickerData.expanded` (stores index of expanded item)

Two branches: **empty state** (no skills extracted -- shows extract button) and **populated state** (flat list).

### selectMode("skills") in StudyContext.jsx (lines 808-867)
`/src/StudyContext.jsx`

Loads skills via `loadSkillsV2(active.id)`, then enriches each skill with:

| Field | Source | Already in pickerData.items? |
|---|---|---|
| `name` | `s.name` from loadSkillsV2 | Yes |
| `category` | `s.category` from loadSkillsV2 | **Yes** -- spread via `...s` at line 844 |
| `strength` | `effectiveStrength(s)` | Yes (computed) |
| `reviewDate` | `nextReviewDate(s)` | Yes (computed) |
| `lastPracticed` | from `s.mastery.lastReviewAt` | Yes (computed) |
| `lastRating` | `s.mastery.lastRating` | Yes |
| `deadlineTitle` | deadline skill map lookup | Yes |
| `deadlineDays` | deadline skill map lookup | Yes |
| `points` | `s.mastery.totalMasteryPoints` | Yes |
| `sessions` | `s.mastery.reps` | Yes |
| `id`, `conceptKey`, `description` | from loadSkillsV2 | Yes (via spread) |
| `mastery` | full mastery object | Yes (via spread) |
| `prerequisites` | prerequisite array | Yes (via spread) |

**Key finding:** The `category` field IS already present in pickerData items. The `selectMode` function uses `{ ...s, ... }` spread at line 844, which copies all fields from the loadSkillsV2 result -- including `category`. The loadSkillsV2 function explicitly includes `category: s.category` at line 413 of skills.js.

### loadSkillsV2 output shape (skills.js lines 394-452)
Returns objects with `category`, `skillType`, `bloomsLevel`, `name`, `description`, `id`, `conceptKey`, `mastery` (with FSRS fields: `stability`, `retrievability`, `nextReviewAt`, `lastReviewAt`, `difficulty`, `reps`, `lapses`, `lastRating`, `totalMasteryPoints`), `prerequisites`, `masteryCriteria`, `evidence`, `fitness`, etc.

### effectiveStrength (study.js lines 31-37)
Calls `currentRetrievability(mastery)` which computes `R(t, S) = (1 + F * t/S)^C` where t = elapsed days since last review and S = FSRS stability. Returns 0 if no stability or no lastReviewAt.

### currentRetrievability (fsrs.js lines 195-206)
Handles both epoch-seconds and ISO string formats for `lastReviewAt`. Returns the current probability of recall as a float 0.0-1.0.

### nextReviewDate (study.js lines 40-51)
Returns `"now"` if next review date is in the past, or an ISO date string `"YYYY-MM-DD"` if in the future, or `null` if no FSRS data exists.

### bootWithFocus (StudyContext.jsx lines 922-1004)
For `{ type: "skill", skill: s }`:
- Sets `focusContext`, clears `pickerData`, shows loading state
- Loads fresh skills, journal, and builds focused context via `buildFocusedContext`
- Boots an AI session with `modeHint` = "MODE: SKILL MASTERY"
- No changes needed for the review flow -- the existing `{ type: "skill", skill: s }` path handles everything

### MaterialsScreen layout pattern (MaterialsScreen.jsx lines 492-541)
The reference pattern for the category grid:
```
// Group header (lines 499-503)
<div onClick={toggle} style={{ cursor: "pointer", padding: "6px 0" }}>
  <span>{isCollapsed ? "▶" : "▼"}</span>  // triangle
  <span>{CLS_LABELS[cls]}</span>           // category name
  <span>({mats.length})</span>              // count
</div>

// Grid (lines 507-537)
<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
  {mats.map(mat => {
    if (isExpanded) return (
      <div style={{ gridColumn: "1 / -1" }}>{renderExpandedDetail(mat)}</div>
    );
    return (
      <div style={{ background: T.sf, borderRadius: 14, padding: "20px 22px",
                    border: "1px solid " + T.bd, minHeight: 90, ... }}>
        {/* card content */}
      </div>
    );
  })}
</div>
```

---

## 2. Review Button Design

### Placement
At the top of the picker, above the category grid. Renders between the "Pick a skill to work on" header and the first category group.

### Computing due skills
The enriched pickerData items already have `reviewDate` computed via `nextReviewDate(s)`. The "due" check is:

```js
var today = new Date().toISOString().split("T")[0];
var dueSkills = pickerData.items.filter(s =>
  s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today)
);
```

This is the same logic already used in the existing SkillPicker REVIEW DUE badge (line 105) and in `bootWithFocus` (lines 947-950).

### Selecting the most urgent skill
When the user clicks "Start Review", pick the single most urgent due skill. Urgency is determined by lowest retrievability (most decayed memory):

```js
var mostUrgent = dueSkills.reduce((best, s) => {
  var r = currentRetrievability(s.mastery || s);
  var bestR = currentRetrievability(best.mastery || best);
  return r < bestR ? s : best;
}, dueSkills[0]);
```

Using `currentRetrievability` (imported from fsrs.js) gives a continuous 0.0-1.0 value that precisely represents how much memory has decayed. The skill with the lowest retrievability is the one most likely to be forgotten and therefore most urgent to review.

Fallback: if `currentRetrievability` returns 0 for all due skills (which happens when stability or lastReviewAt is missing), fall back to sorting by `reviewDate` ascending (oldest first), then by lowest `strength`.

### Click behavior
```js
bootWithFocus({ type: "skill", skill: mostUrgent })
```

No new focus type needed. The existing `type: "skill"` path in `bootWithFocus` and `buildFocusedContext` handles everything:
- Loads source material for the skill
- Computes prerequisite status
- Builds facet assessment block
- Boots AI session with "MODE: SKILL MASTERY" hint

After the session ends, the user returns to the skill picker (by closing/ending the session), and the due count will have updated (because the review session records a mastery rating via FSRS). The next "Start Review" click picks the next most urgent skill. This creates a natural sense of progression: review one skill, see the count drop, review the next.

### UI states

**Skills due (dueSkills.length > 0):**
```
+----------------------------------------------------------+
|  [icon]  N skills due for review                         |
|                                          [Start Review]  |
+----------------------------------------------------------+
```

- Container: `background: T.acS`, `border: 1px solid T.acB`, `borderRadius: 14`, `padding: "16px 20px"`, `marginBottom: 20`
- Left: count text -- `fontSize: 14`, `fontWeight: 600`, `color: T.ac`
- Right: Start Review button -- `background: T.ac`, `color: "#0F1115"`, `borderRadius: 10`, `padding: "10px 20px"`, `fontWeight: 600`
- Layout: `display: flex`, `justifyContent: space-between`, `alignItems: center`

**No skills due:**
```
+----------------------------------------------------------+
|  You're current -- no reviews needed              [check] |
+----------------------------------------------------------+
```

- Container: `background: T.gnS`, `border: 1px solid T.gn + "40"`, `borderRadius: 14`, `padding: "14px 20px"`, `marginBottom: 20`
- Text: `fontSize: 13`, `color: T.gn`, `fontWeight: 500`
- Check mark icon inline

### Import requirement
The component needs `currentRetrievability` from `../../lib/fsrs.js` to compute urgency ranking. This is a new import for SkillPicker.jsx.

---

## 3. Category Grouping

### Grouping logic
Compute in the component from `pickerData.items` (category is already available):

```js
var grouped = {};
for (var s of pickerData.items) {
  var cat = s.category || "Uncategorized";
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(s);
}
```

### Category sort order
Categories sorted by: (1) most due-for-review skills first, then (2) weakest aggregate strength.

```js
var catEntries = Object.entries(grouped);
catEntries.sort((a, b) => {
  var aDue = a[1].filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today)).length;
  var bDue = b[1].filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today)).length;
  if (aDue !== bDue) return bDue - aDue; // more due first
  var aAvg = a[1].reduce((sum, s) => sum + s.strength, 0) / a[1].length;
  var bAvg = b[1].reduce((sum, s) => sum + s.strength, 0) / b[1].length;
  return aAvg - bAvg; // weaker first
});
```

### Skill sort within categories
Preserve existing sort: weakest first (by strength ascending), with deadline-relevant skills promoted within the same strength band. The pickerData.items array is already sorted this way by `selectMode`. However, since grouping scatters the sorted array into buckets, each category's skills array must be re-sorted:

```js
// Within each category, sort by strength ascending (weakest first)
// Skills are already enriched with strength, deadlineTitle, deadlineDays
for (var cat of Object.values(grouped)) {
  cat.sort((a, b) => {
    var diff = a.strength - b.strength;
    if (Math.abs(diff) < 0.10) {
      var aHas = a.deadlineDays !== null;
      var bHas = b.deadlineDays !== null;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (aHas && bHas) return a.deadlineDays - b.deadlineDays;
    }
    return diff;
  });
}
```

**Note:** Actually, since `pickerData.items` is already sorted globally (weakest first), and the grouping preserves insertion order within each category, the within-category order is already approximately correct. However, explicitly sorting each category is safer -- the global sort optimizes for overall weakness, but within a category the relative order may differ from the global order when deadline promotion is involved.

### Category header
```
▶ Category Name                          12 skills  |  3 due
```

or expanded:
```
▼ Category Name                          12 skills  |  3 due
```

- Clickable header row toggles expand/collapse
- Triangle: `"\u25B6"` (collapsed) / `"\u25BC"` (expanded) -- same as MaterialsScreen line 501
- Category name: `fontSize: 13`, `fontWeight: 600`, `color: T.tx`
- Skill count: `fontSize: 12`, `color: T.txM`
- Due count (if > 0): `fontSize: 11`, `fontWeight: 600`, `color: T.ac`, `background: T.acS`, `padding: "2px 8px"`, `borderRadius: 4`
- Layout: `display: flex`, `alignItems: center`, `gap: 8`, `cursor: pointer`, `padding: "6px 0"`

### Default collapsed state
- Categories with due-for-review skills: **expanded** by default
- Categories with no due skills: **collapsed** by default

```js
var initialCollapsed = new Set();
for (var [catName, skills] of catEntries) {
  var hasDue = skills.some(s =>
    s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today)
  );
  if (!hasDue) initialCollapsed.add(catName);
}
```

This uses local component state (`React.useState`), initialized once. Same pattern as MaterialsScreen's `collapsedGroups` state (line 35).

### State management
- `collapsedCats`: `React.useState(Set)` -- tracks which categories are collapsed
- Toggle: `setCollapsedCats(prev => { var next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next; })`
- Identical to MaterialsScreen pattern (line 499)

---

## 4. Card Layout

### Grid
Within each expanded category, a 2-column card grid:

```js
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 16,
}}>
```

Identical to MaterialsScreen line 507.

### Card (collapsed state)
```
+-----------------------------------+
|  [strength%]       [REVIEW DUE]  |
|                                   |
|  Skill Name That Might Be Long   |
|                                   |
|  Last practiced: 3d ago           |
+-----------------------------------+
```

Styling matches MaterialsScreen compact cards:
- `background: T.sf`
- `borderRadius: 14`
- `padding: "20px 22px"`
- `border: "1px solid " + T.bd`
- `cursor: "pointer"`
- `minHeight: 90`
- `transition: "all 0.15s ease"`
- `display: "flex"`, `flexDirection: "column"`, `gap: 10`

Hover: `borderColor: T.acB`, `background: T.sfH` (same as MaterialsScreen line 452-453)

Card content layout:
1. **Top row** (`display: flex`, `justifyContent: space-between`, `alignItems: center`):
   - Left: Strength badge -- `fontSize: 11`, `fontWeight: 700`, strength-colored (`>= 0.7`: `T.gn`, `>= 0.4`: `"#F59E0B"`, else: `T.txM`), `background` tinted, `padding: "2px 8px"`, `borderRadius: 4`
   - Right: REVIEW DUE badge (if applicable) -- `fontSize: 10`, `color: T.rd`, `fontWeight: 600`, `background: T.rd + "20"`, `padding: "2px 6px"`, `borderRadius: 4`
2. **Skill name**: `fontSize: 13`, `fontWeight: 500`, `color: T.tx`, 2-line clamp (`WebkitLineClamp: 2`), `lineHeight: 1.4`
3. **Last practiced**: `fontSize: 11`, `color: T.txD` -- "3d ago" or "Not yet practiced"

### Card (expanded state)
When a card is clicked, it expands to full width (`gridColumn: "1 / -1"`), matching the MaterialsScreen expand-in-place pattern (line 516).

```
+---------------------------------------------------------------+
|  82%                                          REVIEW DUE      |
|                                                               |
|  Skill Name                                                   |
|  Last practiced: 3d ago | Needed for HW3 (5d)                |
|                                                               |
|  +---------------------------+  +---------------------------+ |
|  |  Learn                    |  |  Practice                 | |
|  |  AI-guided dialogue       |  |  Tier 2: Intermediate     | |
|  +---------------------------+  +---------------------------+ |
+---------------------------------------------------------------+
```

Expanded card details:
- `gridColumn: "1 / -1"` -- spans full width
- `background: T.sf`
- `border: "1px solid " + T.acB` -- highlighted border
- `borderRadius: 14`
- `padding: "20px 22px"`
- Top section: same as collapsed card but with more room
- Additional info line: deadline context if available
- Button row: `display: flex`, `gap: 8`, matching existing SkillPicker button styling (lines 117-149)

The Learn and Practice button implementations remain exactly as they are today in SkillPicker.jsx:
- **Learn** (line 118): calls `bootWithFocus({ type: "skill", skill: s })`
- **Practice** (lines 123-143): loads/creates practice set, generates problems, enters practice mode

### Expanded state tracking
Replace `pickerData.expanded` (which stores a flat index) with a skill ID:

```js
var [expandedSkill, setExpandedSkill] = React.useState(null);
```

This is cleaner than index-based tracking because the card grid changes shape when grouped. Click card: `setExpandedSkill(isExpanded ? null : s.id)`. Check expanded: `expandedSkill === s.id`.

---

## 5. Data Flow

### What changes in selectMode("skills")?
**Nothing.** The `category` field is already present in pickerData items via the `{ ...s, ... }` spread at line 844. All required fields (`strength`, `reviewDate`, `lastPracticed`, `lastRating`, `deadlineTitle`, `deadlineDays`, `mastery`, `id`, `conceptKey`, `name`, `description`, `masteryCriteria`, `prerequisites`) are already there.

The current sort (weakest first with deadline promotion) can remain as-is. The component will re-sort within categories.

### Due-count computation
Computed in the component, not in selectMode. Rationale:
1. The data needed (`reviewDate`, `strength`, `mastery`) is already in the enriched items
2. Due counts are display-only -- they don't affect data loading
3. Computing in the component keeps selectMode focused on data loading/enrichment
4. The today-string computation (`new Date().toISOString().split("T")[0]`) should happen once at render time and be shared across the review button, category headers, and badge rendering

### New state needed
All state is local to SkillPicker.jsx:

| State | Type | Purpose |
|---|---|---|
| `collapsedCats` | `Set<string>` | Which categories are collapsed |
| `expandedSkill` | `string \| null` | ID of the expanded skill card (replaces `pickerData.expanded`) |

No new StudyContext state needed. The `pickerData.expanded` field in context is no longer used for skill cards (it was set via `setPickerData(prev => ({ ...prev, expanded: i }))` -- this gets replaced by local `expandedSkill` state).

**Note on pickerData.expanded removal:** The current code at line 98 sets `pickerData.expanded` via `setPickerData`. This pattern writes back into context state for something that's purely a UI concern. The redesigned component should use local state instead, which is a cleaner separation. However, the `setPickerData` call is needed by other picker modes (assignment, exam). Only the "skills" mode should switch to local state for expansion tracking.

### Import changes for SkillPicker.jsx
Add one new import:
```js
import { currentRetrievability } from "../../lib/fsrs.js";
```

This is needed for computing most-urgent-skill ranking in the review button click handler. No other new imports required -- `strengthToTier`, `TIERS`, `createPracticeSet`, `generateProblems`, `loadPracticeMaterialCtx` are already imported from study.js.

---

## 6. Component Structure (Pseudocode)

```
SkillPicker()
  |
  |-- if pickerData.empty: render empty state (unchanged)
  |
  |-- else:
  |   |
  |   |-- Header: "Pick a skill to work on" (unchanged)
  |   |
  |   |-- ReviewBanner (new)
  |   |   |-- compute dueSkills from pickerData.items
  |   |   |-- if dueSkills.length > 0:
  |   |   |     "N skills due for review" + [Start Review] button
  |   |   |-- else:
  |   |         "You're current -- no reviews needed"
  |   |
  |   |-- CategoryGrid (new structure, replaces flat list)
  |       |-- for each category (sorted: most due first, then weakest):
  |           |-- CategoryHeader (clickable, triangle + name + counts)
  |           |-- if expanded:
  |               |-- 2-column grid
  |                   |-- for each skill in category (sorted weakest first):
  |                       |-- SkillCard (compact or expanded)
  |                           |-- if expanded: full-width with Learn/Practice buttons
```

---

## 7. Sizing Impact

Current SkillPicker.jsx: 150 lines.

Estimated after redesign: ~280-320 lines. The increase comes from:
- Review banner section: ~25 lines
- Category grouping logic (grouping, sorting, collapse state): ~30 lines
- Category header render: ~15 lines
- Card layout (more structured than current row): ~20 lines more per card
- The Learn/Practice button code (lines 117-149) remains the same size

The component stays within reasonable bounds as a single file. No need to extract sub-components yet -- the MaterialsScreen at 592 lines is a reference point for acceptable single-file complexity.

---

## 8. Consistency Checklist

| Element | Source | Matching Values |
|---|---|---|
| Card border-radius | MaterialsScreen line 524 | `14` |
| Card padding | MaterialsScreen line 524 | `"20px 22px"` |
| Grid gap | MaterialsScreen line 507 | `16` |
| Grid columns | MaterialsScreen line 507 | `"repeat(2, 1fr)"` |
| Expanded gridColumn | MaterialsScreen line 516 | `"1 / -1"` |
| Card background | MaterialsScreen line 524 | `T.sf` |
| Card border | MaterialsScreen line 524 | `"1px solid " + T.bd` |
| Card hover border | MaterialsScreen line 525 | `T.acB` |
| Card hover bg | MaterialsScreen line 525 | `T.sfH` |
| Card min-height | MaterialsScreen line 524 | `90` |
| Triangle collapsed | MaterialsScreen line 501 | `"\u25B6"` |
| Triangle expanded | MaterialsScreen line 501 | `"\u25BC"` |
| Group header font | MaterialsScreen line 502 | `fontSize: 13, fontWeight: 600, color: T.tx` |
| Count font | MaterialsScreen line 503 | `fontSize: 12, color: T.txM` |
| Transition | MaterialsScreen line 524 | `"all 0.15s ease"` |

---

## 9. Edge Cases

1. **No categories:** If all skills have `null` category, they all group under "Uncategorized". The picker still works -- just one group.

2. **Single skill:** Review button still shows "1 skill due for review". Card grid renders one card in the first column.

3. **All skills due:** Every category header shows due count. All categories expanded by default. Start Review picks the single most urgent one.

4. **No skills due, no skills practiced:** Review banner shows "You're current". All cards show 0% strength with "Not yet practiced". All categories expanded (since the `initialCollapsed` logic only collapses categories with no due skills, and this means all categories have no due skills, so all would be collapsed -- but this leaves the user seeing nothing). **Correction:** If ALL categories would be collapsed (no due skills anywhere), expand all categories instead. This handles the fresh-course case:

```js
if (initialCollapsed.size === catEntries.length) {
  initialCollapsed.clear(); // expand everything if nothing is due
}
```

5. **181 skills across many categories:** The 2-column grid is more compact than the flat list. With cards at ~90px min-height + 16px gap, each row takes ~106px. If a category has 20 skills, that's 10 rows = ~1060px. With collapsible categories, the user only sees expanded categories, keeping scroll manageable.

6. **Category with 1 skill:** Renders as a single card in the first column. The category header still shows count "(1)".

7. **Skill with very long name:** 2-line clamp (`WebkitLineClamp: 2`) truncates with ellipsis. Same pattern as MaterialsScreen line 457.

---

## 10. What Does NOT Change

- **FSRS algorithm**: Untouched. No changes to fsrs.js.
- **Data model/schema**: No new tables, no new columns, no migrations.
- **selectMode("skills")**: No changes. Data enrichment stays the same.
- **bootWithFocus**: No changes. Existing `{ type: "skill", skill: s }` path handles review sessions.
- **buildFocusedContext**: No changes. The "skill" focus type already loads source material, prerequisites, facet assessments.
- **Learn flow**: Same `bootWithFocus` call.
- **Practice flow**: Same practice set creation and problem generation.
- **Assignment picker / Exam scope picker**: Completely separate components, unaffected.
- **Empty state** (no skills extracted): Same extract/retry UI.

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Comprehensive architecture blueprint for the SkillPicker redesign, covering the review button (due computation, urgency ranking via currentRetrievability, click-to-boot flow), category grouping (using the already-available category field from pickerData items), 2-column card grid (matching MaterialsScreen's exact styling tokens), data flow analysis confirming no changes needed to selectMode or StudyContext, and edge case handling.

### Files Deposited
- `study/knowledge/architecture/skill-picker-redesign-2026-03-14.md` -- Full architecture blueprint for SkillPicker redesign with review focus button and categorized card grid

### Files Created or Modified (Code)
- None (architecture-only task)

### Decisions Made
- Category field confirmed already present in pickerData items via spread operator -- no selectMode changes needed
- Most urgent skill selection uses `currentRetrievability` (continuous 0-1 value) rather than reviewDate string comparison, for more precise urgency ranking
- Expanded skill tracking moves from `pickerData.expanded` (context state, index-based) to local `expandedSkill` state (ID-based), since it is a UI concern
- Due-count computation happens in the component (not selectMode), since it is display-only and all data is already available
- Fresh-course edge case: if all categories would be collapsed (no due skills), expand all instead
- No sub-component extraction needed -- estimated 280-320 lines is within acceptable bounds

### Flags for CEO
- None

### Flags for Next Step
- The developer should import `currentRetrievability` from `../../lib/fsrs.js` for the review urgency computation
- The `pickerData.expanded` field is still used by assignment and exam picker modes -- only the skills mode should switch to local state for expansion tracking
- Within-category sort should replicate the existing deadline-promotion logic from selectMode (strength band within 10% promotes deadline-relevant skills)
- The "expand all if nothing due" edge case (Section 9, item 4) prevents a blank initial state on fresh courses
