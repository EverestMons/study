# Phase 1: Character Sheet Hero Screen — Dev Log

**Date:** 2026-03-10
**File:** `src/screens/ProfileScreen.jsx` (409 → 455 lines, +46 net)
**Design:** `knowledge/design/character-sheet-profile-2026-03-10.md`
**Architecture:** `knowledge/architecture/character-sheet-profile-2026-03-10.md`

---

## What Changed

Refactored ProfileScreen from a single flat view into a two-view layout:

### 1. New state: `profileView`

```js
const [profileView, setProfileView] = React.useState(null);
// null → hero view (character sheet)
// { domKey: "27" } → domain drill-down
```

Component-local state. No StudyContext changes.

### 2. Conditional header bar

Back button behavior changes based on view:
- Hero: `← Back` → `setScreen("home")`
- Domain: `← Back to Profile` → `setProfileView(null); setExpandedSubSkill(null)`

Both clear `expandedSubSkill` to avoid stale expansion state.

### 3. Hero view (new, ~110 lines)

| Section | Lines | Description |
|---------|-------|-------------|
| Summary stats | ~13 | 4-stat row (skill areas, sub-skills, total level, due) — unchanged from original |
| TOP SKILLS | ~35 | 2×2 grid, top 4 parents by level. Each card: level number (32px, top-right), skill name, progress-to-next-level bar (accent blue), readiness % (color-coded) |
| Due banner | ~5 | Amber banner with ⚡ icon, shown only when totalDue > 0 |
| DOMAINS | ~45 | Tappable domain rows: name, aggregate level, readiness %, parent/sub-skill counts, due count. Sorted by level desc. Hover effect. Chevron. |
| Empty state | ~8 | "Upload course materials..." message + "Go to Upload" button |

**Top 4 data source:** `profileData.filter(p => p.level > 0).slice(0, 4)` — profileData is already sorted by level descending from `loadProfile()`.

**Domain data source:** `byDomain` grouping (unchanged from original) → mapped to `domainList` sorted by totalLevel.

**Readiness thresholds:** Top 4 cards and domain rows use >0.7 green, >0.4 amber, else red (per CEO spec). Domain drill-down keeps existing >0.8/>0.5 thresholds on parent cards.

**Empty slots:** When fewer than 4 qualifying skills, remaining slots render as dashed-border placeholders with "—".

### 4. Domain drill-down view (~300 lines, moved code)

The entire parent skill card + sub-skill detail panel code from the original ProfileScreen is wrapped in `profileView && selectedDomain ? (...)`. Content is identical — no functional changes.

Added domain header: domain name (h1), aggregate stats subtitle (level, sub-skill count, readiness).

`selectedDomain = byDomain[profileView.domKey]` provides the parent skills for the selected domain via `selectedDomain.items`.

### 5. Shared computation (unchanged)

`totalParents`, `totalSubs`, `overallLevel`, `totalDue`, `byDomain`, `courseNames`, `bloomsColors`, `confidenceLabels`, `confidenceColors`, `difficultyLabel`, `connectionCache` + useEffect — all remain at component top level, shared by both views.

---

## What Did NOT Change

- No StudyContext.jsx changes
- No ScreenRouter.jsx changes
- No new files
- No new imports
- No database queries
- No FSRS changes
- All sub-skill detail functionality preserved (mastery criteria, readiness, prerequisites, connections, key terms, evidence, practice button)

---

## Build Verification

```
✓ built in 10.78s
```

No compilation errors. No missing imports. 88 modules transformed.

---

## Line Count

| View | Lines |
|------|-------|
| Imports + hooks + shared computation | ~60 |
| Header bar | ~12 |
| Hero view | ~110 |
| Domain drill-down view | ~270 |
| **Total** | ~455 |

Previous: 409 lines. Net increase: +46 lines.
