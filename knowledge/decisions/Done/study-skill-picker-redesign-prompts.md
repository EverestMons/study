# study — Skill Picker Redesign: Review Focus + Category Cards — Claude Code Prompts

---

## Step 1 — Architecture: Skill Picker Redesign Blueprint

```
You are the Study Systems Analyst. Read your agent file at study/agents/STUDY_SYSTEMS_ANALYST.md.

Before starting, read these files:
- study/knowledge/decisions/skill-picker-redesign-plan-2026-03-14.md
- src/components/study/SkillPicker.jsx (current flat list — 150 lines)
- src/StudyContext.jsx (search for "selectMode" to find how pickerData is built for "skills" mode)
- src/lib/skills.js (loadSkillsV2 — what fields are available on skill objects)
- src/lib/study.js (bootWithFocus, effectiveStrength, currentRetrievability, buildFocusedContext)

TASK:

Blueprint the skill picker redesign with review focus button and categorized card grid:

1. Review button design:
   - At top of picker, above category grid
   - Shows "N skills due for review" with "Start Review" button
   - Due = skills where reviewDate <= today
   - Click behavior: pick the SINGLE most urgent due skill (lowest retrievability or oldest review date) and boot existing { type: "skill", skill: mostUrgent }. No new focus type needed.
   - After the session ends, user returns to the skill picker and can start the next review. Per-skill sessions give a sense of progression.
   - If no skills due: show "You're current — no reviews needed"

2. Materials-style category grouping:
   - Adopt the SAME layout pattern as MaterialsScreen grouped grid:
     - Collapsible category groups with triangle (▶/▼) expand/collapse
     - Category header row: click to toggle, shows category name + skill count + due count
     - 2-column card grid (repeat(2, 1fr), gap 16) within each expanded group
   - Verify category field is available in pickerData items (check selectMode in StudyContext)
   - If missing, define how to add it
   - Sort categories: most due-for-review first, then weakest aggregate
   - Default state: categories with due skills expanded, others collapsed

3. Card layout (within category groups):
   - 2-column grid matching MaterialsScreen card sizing (repeat(2, 1fr), gap 16, padding 20px 22px, border-radius 14)
   - Card content: skill name, strength %, REVIEW DUE badge, last practiced
   - Click card → expand full-width (gridColumn: "1 / -1") with Learn/Practice buttons
   - Same expand-in-place pattern as MaterialsScreen

4. Data flow:
   - What needs to change in selectMode("skills") for category data?
   - Due-count: compute in selectMode or in component?
   - Any new state needed?

CONSTRAINTS:
- No data model changes, FSRS untouched
- Learn/Practice flows work identically
- Card styling consistent with CourseHomepage and MaterialsScreen

When complete, write to study/knowledge/architecture/skill-picker-redesign-2026-03-14.md with Output Receipt.
```

---

## Step 2 — Development: Skill Picker Redesign

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read:
- study/knowledge/architecture/skill-picker-redesign-2026-03-14.md
- src/components/study/SkillPicker.jsx
- src/StudyContext.jsx (selectMode, bootWithFocus)
- src/lib/study.js (buildFocusedContext — if new review focus type needed)

TASK:

1. Add category field to pickerData items if not already present (check selectMode)

2. "Start Review" button at top:
   - Compute due-for-review count from pickerData items
   - Prominent button: "N skills due for review — Start Review"
   - Click: find the most urgent due skill (lowest retrievability or oldest review date), boot existing { type: "skill", skill: mostUrgent }. No new focus type.
   - If no skills due: show "You're current — no reviews needed" in muted text

3. Rewrite SkillPicker layout to match MaterialsScreen grouped grid pattern:
   - Group skills by category
   - Collapsible category groups with triangle (▶/▼) toggle — same pattern as MaterialsScreen
   - Category header: click to toggle, shows category name, skill count, due count, aggregate strength %
   - Categories with due skills expanded by default, others collapsed
   - Sort categories: most due first, then weakest
   - 2-column card grid within each category (repeat(2, 1fr), gap 16)
   - Cards: borderRadius 14, padding "20px 22px", background T.sf, border T.bd
   - Card content: skill name (14px, 600 weight), strength % (color-coded), REVIEW DUE badge if due, last practiced info
   - Click card → expand full-width (gridColumn "1 / -1") with Learn and Practice buttons — same expand-in-place as MaterialsScreen

4. Verify build passes: npx vite build --mode development

CONSTRAINTS:
- Learn/Practice button handlers stay exactly the same
- Card styling: 14px radius, 20px padding, 16px gap — matching CourseHomepage/MaterialsScreen
- FSRS untouched, no data model changes
- 181 skills must render without lag

When complete, write to study/knowledge/development/skill-picker-redesign-2026-03-14.md with Output Receipt.
```

---

## Step 3 — QA: Skill Picker Verification

```
You are the Study Security & Testing Analyst. Read your agent file at study/agents/STUDY_SECURITY_TESTING_ANALYST.md.

Before starting, read:
- study/knowledge/architecture/skill-picker-redesign-2026-03-14.md
- study/knowledge/development/skill-picker-redesign-2026-03-14.md
- Modified source files

TASK:

Review Button:
1. Due count displays correctly at top
2. Start Review boots AI session focused on due skills
3. No due skills → "You're current" message
4. Review session targets correct skills

Category Grouping:
5. Skills grouped by category with correct counts
6. Categories with due skills sorted first and expanded by default
7. Headers show name, count, due count, aggregate strength
8. Collapse/expand works

Card Layout:
9. 2-column grid within categories
10. Cards show name, strength %, REVIEW DUE badge, last practiced
11. Styling matches CourseHomepage/MaterialsScreen
12. Click → expand full-width with Learn/Practice
13. Expanded card shows correct tier info for Practice

Functional:
14. Learn boots AI for that skill
15. Practice starts practice set
16. Weakest-first sort within categories
17. 181 skills render without performance issues

Regression:
18. Assignment picker works
19. Exam picker works
20. Build passes

Classify: 🔴 Critical / 🟡 Minor / 🔵 Advisory

Write to study/knowledge/qa/skill-picker-qa-2026-03-14.md with Output Receipt.
```
