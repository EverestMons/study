# Development Log: Skill Picker Redesign
## Review Focus Button + Categorized Card Grid

**Date:** 2026-03-14
**Step:** 2 (from skill-picker-redesign-plan-2026-03-14)
**Blueprint:** `knowledge/architecture/skill-picker-redesign-2026-03-14.md`
**Build:** 179 modules, 1m 27s (`npx vite build --mode development`)

---

## What Was Done

Rewrote `src/components/study/SkillPicker.jsx` from a flat vertical list (159 lines) to a categorized card grid with review focus button (224 lines).

### 1. Category Field Verification
- Confirmed `category` is already present in `pickerData.items` via `{ ...s, ... }` spread in `selectMode("skills")` (StudyContext.jsx line 844)
- `loadSkillsV2` explicitly includes `category: s.category` (skills.js line 413)
- **No changes needed to selectMode or StudyContext**

### 2. Review Banner
- Added `currentRetrievability` import from `../../lib/fsrs.js`
- **Due state:** Shows "{N} skills due for review" with "Start Review" button. Styled with `T.acS` background + `T.acB` border
- **Current state:** Shows "You're current — no reviews needed" with green check. Styled with `T.gnS` background
- Start Review selects the most urgent skill via lowest `currentRetrievability` (most decayed memory), with fallback to oldest `reviewDate` then lowest `strength` when retrievability is 0
- Calls existing `bootWithFocus({ type: "skill", skill: mostUrgent })` — no new focus type needed

### 3. Categorized Card Grid
- **Grouping:** `s.category || "Uncategorized"`
- **Category sort:** Most due-for-review skills first, then weakest average strength
- **Within-category sort:** Weakest first, with deadline-promoted skills within 10% strength band
- **Category header:** Collapsible with triangle toggle (`▶`/`▼`), category name, skill count, due badge
- **Default collapse:** Categories with due skills expanded, all others collapsed. Edge case: if all would be collapsed (nothing due), expand all
- **Card grid:** `repeat(2, 1fr)`, gap 16 — matches MaterialsScreen exactly
- **Compact card:** `T.sf` background, borderRadius 14, padding "20px 22px", minHeight 90. Shows strength badge (color-coded), REVIEW DUE badge, skill name (2-line clamp), last practiced
- **Expanded card:** `gridColumn: "1 / -1"`, highlighted border (`T.acB`). Shows full info + Learn/Practice buttons
- **Hover:** `borderColor: T.acB`, `background: T.sfH` — matches MaterialsScreen

### 4. State Changes
- `pickerData.expanded` (index-based, stored in context) → `expandedSkill` (ID-based, local state). Cleaner separation — expansion is a UI concern
- Added `collapsedCats` local state (Set) for category collapse tracking
- Lazy initialization of `collapsedCats` on first render

### 5. Handlers Unchanged
- **Learn:** `bootWithFocus({ type: "skill", skill: sk })` — identical
- **Practice:** Same practice set creation flow (PracticeSets.get → createPracticeSet → generateProblems → setPracticeMode) — identical
- **Empty state:** Extract skills flow completely unchanged

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/study/SkillPicker.jsx` | Complete rewrite: 159 → 224 lines |

## Files NOT Modified (confirmed no changes needed)

- `src/StudyContext.jsx` — `selectMode("skills")` already includes `category` via spread
- `src/lib/skills.js` — `loadSkillsV2` already returns `category`
- `src/lib/fsrs.js` — Only imported `currentRetrievability`, no modifications
- `src/lib/study.js` — No changes
- `src/screens/StudyScreen.jsx` — No changes

---

## Layout Token Consistency

| Token | MaterialsScreen | SkillPicker | Match |
|-------|----------------|-------------|-------|
| Grid columns | `repeat(2, 1fr)` | `repeat(2, 1fr)` | Yes |
| Grid gap | `16` | `16` | Yes |
| Card borderRadius | `14` | `14` | Yes |
| Card padding | `"20px 22px"` | `"20px 22px"` | Yes |
| Card background | `T.sf` | `T.sf` | Yes |
| Card border | `"1px solid " + T.bd` | `"1px solid " + T.bd` | Yes |
| Expanded gridColumn | `"1 / -1"` | `"1 / -1"` | Yes |
| Hover border | `T.acB` | `T.acB` | Yes |
| Hover bg | `T.sfH` | `T.sfH` | Yes |
| Card minHeight | `90` | `90` | Yes |
| Triangle collapsed | `"\u25B6"` | `"\u25B6"` | Yes |
| Triangle expanded | `"\u25BC"` | `"\u25BC"` | Yes |
| Header font | `13/600/T.tx` | `13/600/T.tx` | Yes |
| Count font | `12/T.txM` | `12/T.txM` | Yes |
| Transition | `"all 0.15s ease"` | `"all 0.15s ease"` | Yes |

---

## Output Receipt
**Agent:** Development
**Step:** 2
**Status:** Complete

### Files Created or Modified (Code)
- `src/components/study/SkillPicker.jsx` — complete rewrite

### Files Deposited
- `knowledge/development/skill-picker-redesign-2026-03-14.md` — this dev log

### Decisions Made
- Used `currentRetrievability` for urgency ranking (continuous 0-1) rather than date string comparison
- Switched from `pickerData.expanded` (context state, index-based) to `expandedSkill` (local state, ID-based)
- Lazy-init `collapsedCats` via `setTimeout` to avoid setState during render
- Added "expand all if nothing due" edge case to prevent blank initial state on fresh courses

### Flags for Next Step
- QA should verify: review banner counts match actual due skills, category grouping matches skill categories, card hover/expand behavior, Learn/Practice flows unchanged, 181 skills render without visible lag
