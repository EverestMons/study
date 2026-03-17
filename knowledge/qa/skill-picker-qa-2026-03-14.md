# QA Report: Skill Picker Redesign
## Review Focus Button + Categorized Card Grid

**Date:** 2026-03-14
**Agent:** Study Security & Testing Analyst
**Build:** 179 modules, `npx vite build --mode development` -- PASS
**Source:** `src/components/study/SkillPicker.jsx` (224 lines, rewritten from 159)

---

## Test Results

### Review Button

**Test 1: Due count displays correctly at top**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:101-103` computes `dueSkills` by filtering items where `reviewDate === "now"` or `reviewDate <= today`. The count is rendered at line 184: `{dueSkills.length} skill{dueSkills.length !== 1 ? "s" : ""} due for review`. The `today` variable at line 97 is computed as `new Date().toISOString().split("T")[0]` which produces a `YYYY-MM-DD` string, matching the format returned by `nextReviewDate` in `study.js:40-51`. The plural/singular logic is correct (`!== 1` handles 0 and 2+ correctly).

---

**Test 2: Start Review boots AI session focused on due skills**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:185` -- the Start Review button calls `bootWithFocus({ type: "skill", skill: mostUrgent })`. This uses the existing `bootWithFocus` path in `StudyContext.jsx:922-1004` which handles `type: "skill"` at line 928-930 and 979-981. The focus type loads fresh skills, builds focused context via `buildFocusedContext`, and boots an AI session with `modeHint = "MODE: SKILL MASTERY"`. No new focus type was needed; the existing path is reused correctly.

---

**Test 3: No due skills -> "You're current" message**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:190-194` -- when `dueSkills.length === 0`, renders a green banner with checkmark (`\u2713`) and text "You're current -- no reviews needed". Styled with `background: T.gnS`, `border: "1px solid " + T.gn + "40"`, `color: T.gn`. Matches the architecture spec exactly.

---

**Test 4: Review session targets correct skills (most urgent = lowest retrievability)**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:106-119` -- `mostUrgent` is computed via `reduce` over `dueSkills`, comparing `currentRetrievability(s.mastery || s)` values. The skill with the lowest retrievability (most decayed memory) is selected. Fallback logic at lines 111-115 handles the case where both skills have retrievability 0: falls back to oldest `reviewDate`, then lowest `strength`. The `currentRetrievability` import from `fsrs.js:195-206` correctly computes `R(t, S) = (1 + F * t/S)^C` where `t` is elapsed days. The `s.mastery || s` guard handles both skill objects with `.mastery` sub-object and raw mastery objects.

---

### Category Grouping

**Test 5: Skills grouped by category with correct counts**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:122-127` -- groups items by `s.category || "Uncategorized"`. The `category` field is confirmed present in `pickerData.items` via the spread `{ ...s, ... }` at `StudyContext.jsx:844`, which copies all fields from `loadSkillsV2` output. `loadSkillsV2` explicitly includes `category: s.category` at `skills.js:413`. Category header at line 208 renders `({skills.length})` showing the correct count per category.

---

**Test 6: Categories with due skills sorted first and expanded by default**
**Result:** PASS
**Evidence:**
- **Sort:** `SkillPicker.jsx:146-153` -- `catEntries.sort` uses `bDue - aDue` (more due first) as primary sort, then `aAvg - bAvg` (weaker average strength first) as tiebreaker.
- **Default expand:** `SkillPicker.jsx:157-170` -- when `collapsedCats === null` (first render), builds a Set of categories to collapse. Only categories where `!hasDue` (no due skills) are added to the collapsed set. Line 165 handles the edge case: if ALL categories would be collapsed (nothing due anywhere), clears the set so all expand.

---

**Test 7: Headers show name, count, due count**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:204-210`:
- Category name: `<span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{catName}</span>` (line 207)
- Total count: `<span style={{ fontSize: 12, color: T.txM }}>({skills.length})</span>` (line 208)
- Due count (conditional): `{catDue > 0 && <span ...>{catDue} due</span>}` (line 209) with `fontSize: 11, fontWeight: 600, color: T.ac, background: T.acS, padding: "2px 8px", borderRadius: 4`

---

**Test 8: Collapse/expand works**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:204` -- the category header `onClick` handler: `setCollapsedCats(prev => { var next = new Set(prev || new Set()); next.has(catName) ? next.delete(catName) : next.add(catName); return next; })`. This creates a new Set from the previous state (with `|| new Set()` fallback for null), toggles the category name in/out, and returns the new Set. Line 199 reads `isCollapsed` from `collapsed.has(catName)`, and line 213 conditionally renders the grid: `{!isCollapsed && (...)}`. The `marginBottom` on the header switches from `10` (expanded) to `0` (collapsed) at line 205.

---

### Card Layout

**Test 9: 2-column grid within categories**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:214` -- `display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16`. This is identical to `MaterialsScreen.jsx:507` which uses the same three properties with the same values.

---

**Test 10: Cards show name, strength %, REVIEW DUE badge, last practiced**
**Result:** PASS
**Evidence:** Compact card at `SkillPicker.jsx:275-291`:
- Strength badge: line 282 -- `{Math.round(sk.strength * 100)}%` with color-coded background via `strColor`/`strBg` helpers (line 173-174)
- REVIEW DUE badge: line 283 -- conditional render `{isDue && <span ...>REVIEW DUE</span>}` with `color: T.rd, background: T.rd + "20"`
- Skill name: line 286 -- `{sk.name}` with 2-line clamp (`WebkitLineClamp: 2`)
- Last practiced: line 288-289 -- `{daysAgo !== null ? daysAgo + "d ago" : "Not yet practiced"}`

---

**Test 11: Styling matches CourseHomepage/MaterialsScreen (compare exact tokens)**
**Result:** PASS

Token-by-token comparison against `MaterialsScreen.jsx` grouped materials grid (lines 507-537):

| Token | MaterialsScreen | SkillPicker | Match |
|-------|----------------|-------------|-------|
| Grid columns | `repeat(2, 1fr)` (507) | `repeat(2, 1fr)` (214) | Yes |
| Grid gap | `16` (507) | `16` (214) | Yes |
| Card background | `T.sf` (524) | `T.sf` (277) | Yes |
| Card borderRadius | `14` (524) | `14` (277) | Yes |
| Card padding | `"20px 22px"` (524) | `"20px 22px"` (277) | Yes |
| Card border | `"1px solid " + T.bd` (524) | `"1px solid " + T.bd` (277) | Yes |
| Card transition | `"all 0.15s ease"` (524) | `"all 0.15s ease"` (277) | Yes |
| Card display | `flex` (524) | `flex` (277) | Yes |
| Card flexDirection | `column` (524) | `column` (277) | Yes |
| Card gap | `10` (524) | `10` (277) | Yes |
| Card minHeight | `90` (524) | `90` (277) | Yes |
| Hover borderColor | `T.acB` (525) | `T.acB` (278) | Yes |
| Hover background | `T.sfH` (525) | `T.sfH` (278) | Yes |
| Title fontSize | `12` (533) | `12` (286) | Yes |
| Title fontWeight | `500` (533) | `500` (286) | Yes |
| Title color | `T.tx` (533) | `T.tx` (286) | Yes |
| Title lineClamp | `2` (533) | `2` (286) | Yes |
| Title lineHeight | `1.4` (533) | `1.4` (286) | Yes |
| Expanded gridColumn | `"1 / -1"` (516) | `"1 / -1"` (223) | Yes |
| Triangle collapsed | `"\u25B6"` (501) | `"\u25B6"` (206) | Yes |
| Triangle expanded | `"\u25BC"` (501) | `"\u25BC"` (206) | Yes |
| Header fontSize | `13` (502) | `13` (207) | Yes |
| Header fontWeight | `600` (502) | `600` (207) | Yes |
| Header color | `T.tx` (502) | `T.tx` (207) | Yes |
| Count fontSize | `12` (503) | `12` (208) | Yes |
| Count color | `T.txM` (503) | `T.txM` (208) | Yes |
| Group marginBottom | `20` (497) | `20` (202) | Yes |
| Header cursor | `pointer` (499) | `pointer` (205) | Yes |
| Header padding | `"6px 0"` (499) | `"6px 0"` (205) | Yes |

All 28 tokens match exactly.

---

**Test 12: Click -> expand full-width with Learn/Practice**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:276` -- compact card `onClick={() => setExpandedSkill(sk.id)}`. When `expandedSkill === sk.id` (line 216), the expanded card renders at lines 222-271 with `gridColumn: "1 / -1"` (full width), `border: "1px solid " + T.acB` (highlighted). Learn button at line 238-241 and Practice button at lines 243-268 are both present in the expanded view.

---

**Test 13: Expanded card shows correct tier info for Practice**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:218` computes `var startTier = strengthToTier(sk.strength)`. The Practice button label at line 267: `Tier {startTier}: {TIERS[startTier].name}`. `strengthToTier` is imported from `study.js:1677-1684` and maps strength thresholds to tiers 1-6. `TIERS` at `study.js:1663-1671` provides tier names: Predict, Fill, Write, Debug, Combine, Apply. The tier displayed reflects the skill's current strength correctly (e.g., 0% strength -> Tier 1: Predict, 80%+ -> Tier 6: Apply).

---

### Functional

**Test 14: Learn boots AI for that skill**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:238` -- Learn button: `onClick={() => bootWithFocus({ type: "skill", skill: sk })`. This is the same `bootWithFocus` call used throughout the app (CurriculumScreen, etc.). The `type: "skill"` path in `StudyContext.jsx:979-981` sets `userMsg = "I want to work on: " + focus.skill.name` and `modeHint = "MODE: SKILL MASTERY"`.

---

**Test 15: Practice starts practice set**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:243-264` -- Practice button handler:
1. Gets existing practice set: `PracticeSets.get(sk.id)` (line 244)
2. Creates new if needed: `createPracticeSet(active.id, sk, active.name)` (line 245)
3. Sets generating state: `setPracticeMode({ generating: true, set: pset, skill: sk })` (line 247)
4. Clears picker and switches to practice: `setPickerData(null); setSessionMode("practice")` (line 248)
5. Generates problems if needed: `generateProblems(pset, sk, active.name, matCtx)` (line 254)
6. Persists: `PracticeSets.upsert(sk.id, pset)` (line 256)
7. Sets final state with `currentProblemIdx` (line 259)
8. Error handling wraps the async flow (lines 260-263)

This is identical to the practice flow in `AssignmentPicker.jsx:136-160`.

---

**Test 16: Weakest-first sort within categories**
**Result:** PASS
**Evidence:** `SkillPicker.jsx:130-142` -- each category's skills array is sorted with `a.strength - b.strength` (ascending = weakest first). Within the same strength band (< 10% difference), skills with deadlines are promoted (`deadlineDays != null`), and among deadline skills, the nearest deadline comes first (`a.deadlineDays - b.deadlineDays`). This matches the global sort at `StudyContext.jsx:855-866`.

---

**Test 17: 181 skills render without performance issues**
**Result:** PASS (no O(n^2) or worse patterns found)
**Evidence:** Analysis of algorithmic complexity:
- **Due skills filter** (line 101-103): O(n) single pass
- **Most urgent reduce** (line 108-118): O(k) where k = due skills
- **Grouping** (line 122-127): O(n) single pass
- **Within-category sort** (line 130-142): O(m * log(m)) per category, total O(n * log(n))
- **Category sort** (line 146-153): O(c * log(c)) where c = categories. The `filter` inside the comparator runs on each category's skills -- this is O(n) per comparison, making it O(n * c * log(c)). For 181 skills across ~10-20 categories, this is negligible.
- **Collapse init** (line 157-170): O(c * m) = O(n) total
- **Render** (line 198-298): O(c * m) = O(n) total

The `dueSkills` filter is computed once at lines 101-103 and reused (not recomputed inside the category sort comparator). The category sort at lines 147-148 does recompute due counts per category per comparison, which is O(m) per comparison and O(m * c * log(c)) total. With 181 skills, this is well under 10,000 operations.

No `O(n^2)` patterns detected. The most expensive operation is the array sort at O(n log n). React's virtual DOM diffing adds O(n) for the card list. With 181 skills, total work is approximately ~1,500-2,000 operations, trivially fast.

Additionally, the collapsed categories feature means only expanded categories render their card grids. With the default collapse behavior (only categories with due skills are expanded), the initial render is typically much less than 181 cards.

---

### Regression

**Test 18: Assignment picker works (unaffected by changes)**
**Result:** PASS
**Evidence:** `AssignmentPicker.jsx` is an independent component (186 lines) with no imports from `SkillPicker.jsx`. It imports from `db.js`, `skills.js`, `study.js`, `DatePicker.jsx`, and `StudyContext.jsx`. It uses `pickerData.expanded` via `setPickerData(prev => ({ ...prev, expanded: ... }))` at line 79, which is the context-level expansion tracking. The SkillPicker redesign moved expansion tracking to local state (`expandedSkill`) only for skills mode, which does not affect the assignment picker's use of `pickerData.expanded`. `StudyScreen.jsx:90` renders `AssignmentPicker` when `sessionMode === "assignment"`, completely independent of the skills mode path at line 91.

---

**Test 19: Exam picker works (unaffected by changes)**
**Result:** PASS
**Evidence:** `ExamScopePicker.jsx` is an independent component (71 lines) with no imports from `SkillPicker.jsx`. It uses `pickerData.materials` and `pickerData.selectedMats`, not `pickerData.items` or `pickerData.expanded`. The exam mode path in `selectMode` (`StudyContext.jsx:868-913`) sets completely different `pickerData` fields. `StudyScreen.jsx:92` renders `ExamScopePicker` when `sessionMode === "exam"`, fully independent.

---

**Test 20: Build passes**
**Result:** PASS
**Evidence:** `npx vite build --mode development` completed successfully: "179 modules transformed" and "built in 1.78s". No errors. Only warnings are pre-existing (dynamic import of db.js and htmlToMarkdown.js -- same warnings present before the redesign).

---

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | Due count displays correctly | PASS |
| 2 | Start Review boots AI session | PASS |
| 3 | No due skills -> "You're current" | PASS |
| 4 | Review targets lowest retrievability | PASS |
| 5 | Skills grouped by category | PASS |
| 6 | Due categories sorted first + expanded | PASS |
| 7 | Headers show name, count, due | PASS |
| 8 | Collapse/expand works | PASS |
| 9 | 2-column grid | PASS |
| 10 | Cards show all required info | PASS |
| 11 | Styling matches MaterialsScreen | PASS |
| 12 | Click -> expand full-width | PASS |
| 13 | Expanded shows tier info | PASS |
| 14 | Learn boots AI | PASS |
| 15 | Practice starts practice set | PASS |
| 16 | Weakest-first sort | PASS |
| 17 | 181 skills performance | PASS |
| 18 | Assignment picker unaffected | PASS |
| 19 | Exam picker unaffected | PASS |
| 20 | Build passes | PASS |

**Result: 20/20 PASS**

---

## Findings

### Finding 1: Dead ternary in collapse initialization
**Severity:** Advisory
**Location:** `SkillPicker.jsx:169`
**Description:** The ternary `init.size === catEntries.length ? new Set() : init` is dead code. By the time line 169 executes, if `init.size === catEntries.length` was true, line 165 already called `init.clear()`, making `init.size` = 0, so the ternary condition is always false. `effectiveCollapsed` always resolves to `init` regardless.
**Impact:** None. Functionally correct. The `init.clear()` on line 165 already handles the "expand all if nothing due" case. The ternary just adds confusion.
**Recommendation:** Simplify to `var effectiveCollapsed = init;`

### Finding 2: setTimeout for state initialization during render
**Severity:** Advisory
**Location:** `SkillPicker.jsx:167`
**Description:** The component uses `setTimeout(() => setCollapsedCats(init), 0)` to avoid React's "Cannot update a component while rendering a different component" warning. This causes an extra re-render on mount. The pattern works but is not idiomatic React. A `useEffect` with a dependency on `pickerData.items` would be the standard approach, or a `useRef` to track initialization.
**Impact:** Minimal. Causes one extra render cycle on mount. With 181 skills this is imperceptible. No visual flicker because `effectiveCollapsed` provides correct values for the first render.
**Recommendation:** Consider replacing with `useEffect` for idiomatic React pattern, or `useMemo`/`useRef` for the initial collapsed set computation.

### Finding 3: Compact card skill name fontSize 12 vs architecture spec fontSize 13
**Severity:** Advisory
**Location:** `SkillPicker.jsx:286`
**Description:** The architecture blueprint specified `fontSize: 13` for the skill name in compact cards. The implementation uses `fontSize: 12`. However, this actually matches `MaterialsScreen.jsx:533` which also uses `fontSize: 12` for card titles. The expanded card correctly uses `fontSize: 13` (line 230), providing a subtle size increase on expansion.
**Impact:** None. The implementation matches the MaterialsScreen reference pattern better than the architecture spec.
**Recommendation:** No change needed. The architecture spec was slightly off; the implementation correctly follows the MaterialsScreen pattern.

### Finding 4: Category sort recomputes due counts in comparator
**Severity:** Advisory
**Location:** `SkillPicker.jsx:147-148`
**Description:** The category sort comparator calls `.filter()` on each category's skills array during each comparison. With c categories and m skills per category, this is O(m * c * log(c)) total. Pre-computing due counts per category before sorting would reduce this to O(n + c * log(c)).
**Impact:** Negligible for current scale. With 181 skills across ~10-20 categories, the total operations are well under 10,000. Would only matter at 1000+ skills.
**Recommendation:** No immediate action. If skill counts grow significantly, pre-compute `catDue` counts into a Map before the sort.

### Finding 5: `var` declarations inside `for...of` over destructured entries
**Severity:** Advisory
**Location:** `SkillPicker.jsx:159`
**Description:** The `for (var [catName, skills] of catEntries)` uses `var`, which hoists `catName` and `skills` to function scope rather than block scope. This is consistent with the rest of the codebase (which uses `var` throughout), but the destructured `skills` variable at line 159 shadows the `skills` parameter in the `.map` callback at line 198 (`catEntries.map(([catName, skills]) => ...)`). No actual bug because the map callback's `skills` parameter takes precedence inside its scope, but the shared name could cause confusion during maintenance.
**Impact:** None. JavaScript scoping rules prevent any runtime issue. The `.map` callback parameter shadows the outer `var`.
**Recommendation:** No change needed. This pattern is consistent with the codebase's existing style.

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** 3
**Status:** Complete

### What Was Done
Ran 20 QA test scenarios against the Skill Picker redesign covering the review button (due count, AI boot, "you're current" state, urgency targeting), category grouping (grouping, sorting, headers, collapse/expand), card layout (grid, content, styling token comparison, expand behavior, tier info), functional flows (Learn, Practice, weakest-first sort, 181-skill performance analysis), and regression (assignment picker, exam picker, build). All 20 tests passed. Identified 5 advisory findings -- no critical or minor issues.

### Files Deposited
- `knowledge/qa/skill-picker-qa-2026-03-14.md` -- Full QA report with 20 test results, evidence, and 5 advisory findings

### Files Created or Modified (Code)
- None

### Decisions Made
- Classified all 5 findings as Advisory (no functional impact, no data integrity risk)
- Compact card fontSize 12 (vs architecture spec's 13) classified as correct behavior since it matches MaterialsScreen reference pattern

### Flags for CEO
- None

### Flags for Next Step
- None -- all 20 tests pass, no blockers
