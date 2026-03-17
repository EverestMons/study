# study — Skill Picker Redesign: Review Focus + Category Cards
## Execution Plan
**Date:** 2026-03-14
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Focused review button + categorized card grid layout for skill picker
**Scope Tier:** Medium (SA Blueprint → DEV → QA)

---

## Feature Summary

Redesign the SkillPicker from a flat 181-skill list into a structured, visually navigable experience:

1. **Focused "Start Review" button at the top** — when skills are due for review (FSRS retrievability decayed), show a prominent action: "N skills due for review — Start Review Session". Clicking it boots a focused AI session targeting due-for-review skills.

2. **Category grouping** — skills grouped by their `category` field into collapsible sections. Each category shown as a card header with skill count and aggregate readiness.

3. **2-column card grid** — within each category, skills displayed as cards in a 2-column grid with generous spacing, matching the materials/course homepage card pattern. Not a flat scrolling list.

## CEO Decisions (Locked In)

1. **Focused review button at top of skill picker** — picks the single most urgent due skill and boots a per-skill session. User returns to picker after each review for a sense of progression.
2. **Review is per-skill, not multi-skill** — no new "review" focus type needed. Use existing `{ type: "skill", skill: mostUrgent }` flow.
3. **Materials-style layout** — collapsible category groups (triangle expand/collapse), category headers with name + count, 2-column card grid within each group. Same pattern as MaterialsScreen grouped grid.
4. **Sorted by weakest first within each category** — existing sort preserved
5. **Categories with due-for-review skills expanded by default** — others collapsed

## What Already Exists

### SkillPicker.jsx (150 lines)
- Flat list of all skills sorted by weakest first
- Each skill shows: name, strength %, "REVIEW DUE" badge, last rating, days since practiced, deadline context
- Expandable: click a skill → shows "Learn" and "Practice" buttons
- `pickerData.items` is the skill array, populated by `selectMode("skills")` in StudyContext
- Skills already have: `s.strength`, `s.reviewDate`, `s.name`, `s.lastRating`, `s.lastPracticed`, `s.deadlineTitle`, `s.deadlineDays`
- **Missing:** no `category` field in pickerData items

### selectMode in StudyContext.jsx
- For "skills" mode: loads skills via `loadSkillsV2`, computes strength, sorts by weakest
- The skill objects from `loadSkillsV2` DO have a `category` field — it just isn't passed through to pickerData items currently
- Need to verify: is `category` included in the pickerData items?

### bootWithFocus
- `bootWithFocus({ type: "skill", skill: s })` boots AI session focused on a single skill
- For a review session targeting multiple due skills, may need a new focus type: `{ type: "review", skills: [due skills] }`

### FSRS data available per skill
- `s.strength` — effective strength (computed from retrievability)
- `s.reviewDate` — next review date string
- `s.stability`, `s.difficulty`, `s.reps` — FSRS parameters
- The "REVIEW DUE" badge logic: `s.reviewDate === "now" || s.reviewDate <= today`

---

## Execution Steps

### Step 1 — Architecture: Skill Picker Redesign Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- This execution plan
- `src/components/study/SkillPicker.jsx` (current flat list)
- `src/StudyContext.jsx` — `selectMode` function (how pickerData is built for "skills" mode)
- `src/lib/skills.js` — `loadSkillsV2` (what fields are available on skill objects)
- `src/lib/study.js` — `bootWithFocus`, `effectiveStrength`, `currentRetrievability`

**Task:**

1. **Review button design:**
   - At the top of the picker, above the category grid
   - Shows: "N skills due for review" with a "Start Review" button
   - Compute "due" count: skills where `reviewDate <= today`
   - Click behavior: boot a focused AI session. Options:
     - Option A: New focus type `{ type: "review", skills: [array of due skills] }` — AI gets all due skills in context, cycles through them
     - Option B: Auto-select the most urgent due skill and boot `{ type: "skill", skill: mostUrgent }` — simpler but only one skill at a time
   - Recommend one. If Option A, define what `buildFocusedContext` needs for the "review" focus type.

2. **Category grouping:**
   - Verify `category` field is available in pickerData items (it may need to be added in `selectMode`)
   - Group skills by `category`
   - Sort categories by: most due-for-review skills first, then by weakest aggregate
   - Category header: category name, skill count, due-for-review count, aggregate strength
   - Collapsible: click header to expand/collapse. Default: all collapsed? Or categories with due skills expanded?

3. **Card layout within categories:**
   - 2-column grid (`gridTemplateColumns: "repeat(2, 1fr)"`, gap 16, padding 20px 22px, border-radius 14)
   - Each card shows: skill name, strength %, "REVIEW DUE" badge, last practiced info
   - Click card → expand to show Learn/Practice buttons (inline expand or detail panel?)
   - Consider: should expand take full width (gridColumn: "1 / -1") like MaterialsScreen?

4. **Data flow:**
   - Does `selectMode("skills")` need to pass `category` through to pickerData items?
   - Does the due-count computation need to happen in `selectMode` or can it be computed in the component?
   - Any new StudyContext state needed?

**Constraints:**
- No data model changes, FSRS untouched
- Existing Learn/Practice flows must work identically
- Card layout must be consistent with CourseHomepage and MaterialsScreen styling

**Output deposit:** `study/knowledge/architecture/skill-picker-redesign-2026-03-14.md`
**Depends on:** None

---

### Step 2 — Development: Skill Picker Redesign
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- Step 1 deposit: blueprint
- `src/components/study/SkillPicker.jsx`
- `src/StudyContext.jsx` (selectMode, bootWithFocus)
- `src/lib/study.js` (buildFocusedContext if new review focus type)

**Task:**
1. Add `category` field to pickerData items if not already present
2. Implement "Start Review" button at top of picker:
   - Compute due-for-review count
   - Button click boots focused review session per blueprint
   - If new focus type "review" is needed, add to bootWithFocus and buildFocusedContext
3. Rewrite SkillPicker layout:
   - Group skills by category
   - Collapsible category headers with name, count, due count, aggregate strength
   - 2-column card grid within each category
   - Cards: skill name, strength %, REVIEW DUE badge, last practiced
   - Click card → expand (full-width) with Learn/Practice buttons
4. Verify build passes

**Constraints:**
- Existing Learn/Practice flows work identically
- Card styling matches CourseHomepage/MaterialsScreen (14px radius, 20px padding, 16px gap)
- FSRS untouched, no data model changes

**Output deposit:** `study/knowledge/development/skill-picker-redesign-2026-03-14.md`
**Depends on:** Step 1

---

### Step 3 — QA: Skill Picker Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- Steps 1-2 deposits
- Modified source files

**Task:**

**Review Button:**
1. Due-for-review count displays correctly at top of picker
2. "Start Review" button boots AI session focused on due skills
3. If no skills are due, review section is hidden or shows "You're current"
4. Review session targets the correct skills

**Category Grouping:**
5. Skills grouped by category with correct counts
6. Categories with due skills sorted first
7. Category headers show name, skill count, due count, aggregate strength
8. Collapse/expand works on each category

**Card Layout:**
9. 2-column grid within each category
10. Cards show skill name, strength %, REVIEW DUE badge, last practiced
11. Card styling matches CourseHomepage/MaterialsScreen (radius, padding, spacing)
12. Click card → expand with Learn/Practice buttons
13. Expanded card takes full width

**Functional:**
14. Learn button boots AI session for that skill
15. Practice button starts practice set for that skill
16. Skills sorted by weakest within each category
17. 181 skills render without performance issues

**Regression:**
18. Assignment picker still works
19. Exam scope picker still works
20. Build passes

Classify: 🔴 Critical / 🟡 Minor / 🔵 Advisory

**Output deposit:** `study/knowledge/qa/skill-picker-qa-2026-03-14.md`
**Depends on:** Step 2

---

## Dependency Chain

```
Step 1 (SA Blueprint) → Step 2 (DEV) → Step 3 (QA)
```
