# Character Sheet Profile — Architecture Blueprint

**Date:** 2026-03-10
**Status:** Blueprint
**Design:** `knowledge/design/character-sheet-profile-2026-03-10.md`

---

## 1. Routing Strategy

**Decision: Option B — single route with internal state.**

Reasons:
- `screen === "profile"` already exists in ScreenRouter.jsx (line 42). No ScreenRouter changes needed.
- Only one entry point: HomeScreen "View Profile" button (line 82) calls `loadProfile()` then `setScreen("profile")`.
- Back navigation from domain drill-down is just `setProfileView(null)` — no screen transition, no context reload.
- The browser-back / "< Back" button on the hero goes to HomeScreen (`setScreen("home")`). The "< Back" on the domain view goes to the hero (`setProfileView(null)`). Clear two-level navigation.

**New state in ProfileScreen:**

```js
const [profileView, setProfileView] = React.useState(null);
// null → hero screen (character sheet)
// { domKey: "27" } → domain drill-down for CIP domain "27"
```

This is component-local state (`useState`), not context state. No changes to StudyContext.jsx. When the user leaves the profile screen (`setScreen("home")`) and returns, `profileView` resets to `null` (hero) because ProfileScreen unmounts and remounts. This is correct — always start at the hero.

**Routing logic in ProfileScreen render:**

```js
if (profileView) {
  return <DomainDrillDown ... />;
}
return <HeroView ... />;
```

---

## 2. Component Structure

**Decision: Single file with conditional rendering.**

ProfileScreen.jsx already handles all the data computation (byDomain, courseNames, bloomsColors, etc.) at the top of the component. Splitting into separate files would require either:
- Passing 15+ props from ProfileScreen to child components, or
- Having each child call `useStudy()` independently and recompute byDomain, courseNames, etc.

Both options add complexity without benefit. The hero view is ~100 lines and the domain view is ~300 lines. A single file at ~450 lines is manageable and keeps shared computed values in scope.

**Internal structure:**

```
ProfileScreen()
├── Shared computation (byDomain, courseNames, top4, domainData, connectionCache)
├── Header bar (shared between both views)
├── if (profileView) → Domain drill-down rendering
│   ├── Domain header + back button
│   ├── Parent skill cards (current lines 150-184 — moved here)
│   ├── Sub-skill category groups (current lines 220-397 — moved here)
│   └── Concept link lazy-loading (current lines 42-78 — fires only here)
└── else → Hero rendering
    ├── Summary stats (current lines 97-109 — kept)
    ├── TOP SKILLS grid (new, ~50 lines)
    ├── Due-for-review banner (new, ~15 lines)
    └── DOMAINS section (new, ~40 lines)
```

---

## 3. Data Flow

### What stays the same

| Data | Source | Used by |
|------|--------|---------|
| `profileData` | `useStudy()` — loaded by `loadProfile()` in StudyContext | Both views |
| `courses` | `useStudy()` | Both views (courseNames map) |
| `expandedProfile` / `setExpandedProfile` | `useStudy()` | Domain view only |
| `expandedSubSkill` / `setExpandedSubSkill` | `useStudy()` | Domain view only |

### What moves within the file

| Computation | Current location | New location |
|-------------|-----------------|--------------|
| `totalParents`, `totalSubs`, `overallLevel`, `totalDue` | Top of render (lines 19-22) | Top of render (unchanged — shared) |
| `byDomain` grouping | Top of render (lines 25-33) | Top of render (unchanged — shared by hero domains section and domain drill-down) |
| `courseNames` map | Top of render (lines 39-40) | Top of render (unchanged — shared) |
| `bloomsColors`, `confidenceLabels`, etc. | Top of render (lines 35-38) | Top of render (unchanged — used by domain view) |
| `connectionCache` + useEffect | Lines 42-78 | Same position — the effect only fires when `expandedSubSkill` changes, which only happens in domain view |

### New computations (hero view)

```js
// Top 4 parent skills by level
const top4 = (profileData || [])
  .filter(p => p.level > 0)
  .slice(0, 4);  // profileData already sorted by level desc (loadProfile line 577)

// Domain aggregates for domain rows (already have byDomain)
const domainList = Object.entries(byDomain)
  .map(([domKey, dom]) => ({
    domKey,
    name: dom.name,
    totalLevel: dom.totalLevel,
    parentCount: dom.items.length,
    totalSubs: dom.totalSubs,
    readiness: dom.readinessCount > 0 ? dom.readinessSum / dom.readinessCount : 0,
    dueCount: dom.items.reduce((s, p) => s + p.dueForReview, 0),
  }))
  .sort((a, b) => b.totalLevel - a.totalLevel);
```

**No new queries. No StudyContext changes. No `loadProfile()` changes.**

`loadProfile()` already sorts results by level descending (line 577: `results.sort((a, b) => b.level - a.level)`), so `top4 = profileData.slice(0, 4)` gives the correct top 4 without re-sorting.

---

## 4. Domain Drill-Down Data Access

When the user taps a domain row with `domKey`, the domain view needs:

```js
// Filter byDomain to get the selected domain's parent skills
const selectedDomain = byDomain[profileView.domKey];
// selectedDomain.items → array of profileData entries for this domain
// selectedDomain.name → domain display name
```

`byDomain` is already computed. No filtering of `profileData` needed — `byDomain[domKey].items` already holds references to the profileData entries for that domain.

The domain drill-down renders `selectedDomain.items` exactly as the current ProfileScreen renders `profileData` — with parent cards, expandable sub-skills, concept links, practice buttons.

---

## 5. State Reset on Navigation

| Navigation | State changes |
|------------|---------------|
| HomeScreen → Profile | `loadProfile()` → `setScreen("profile")` → ProfileScreen mounts with `profileView = null` (hero) |
| Hero → Domain | `setProfileView({ domKey })` — component stays mounted, switches view |
| Domain → Hero | `setProfileView(null)` — switches back to hero, `expandedProfile` and `expandedSubSkill` persist (acceptable — user reopens the domain and sees their previous expansion state) |
| Profile → HomeScreen | `setScreen("home")` → ProfileScreen unmounts → all local state lost (profileView, connectionCache) → correct, fresh start next visit |

**`expandedSubSkill` cleanup on domain exit:**

When leaving the domain view (`setProfileView(null)`), we should clear `expandedSubSkill` to avoid stale sub-skill expansion on re-entry:

```js
const goBackToHero = () => {
  setProfileView(null);
  setExpandedSubSkill(null);
};
```

This mirrors the current "< Back" button which calls `setExpandedSubSkill(null)` (line 84).

---

## 6. Header Bar Behavior

The header bar changes slightly between views:

| View | Left button | Right button |
|------|-------------|-------------|
| Hero | `< Back` → `setScreen("home")` | `Settings` → `setShowSettings(true)` |
| Domain | `< Back to Profile` → `setProfileView(null); setExpandedSubSkill(null)` | `Settings` → `setShowSettings(true)` |

The header bar renders conditionally based on `profileView`:

```js
<button onClick={() => {
  if (profileView) {
    setProfileView(null);
    setExpandedSubSkill(null);
  } else {
    setScreen("home");
    setExpandedSubSkill(null);
  }
}}>
  {profileView ? "< Back to Profile" : "< Back"}
</button>
```

---

## 7. Concept Link Effect Scope

The `connectionCache` + `useEffect` (current lines 42-78) only fires when `expandedSubSkill` changes. Since `expandedSubSkill` is only set in the domain drill-down view (sub-skill click handler), the effect is effectively scoped to the domain view without any conditional logic.

On the hero view, `expandedSubSkill` is either `null` (normal) or stale from a previous domain visit. If stale, the effect's early-return guard (`if (!expandedSubSkill || connectionCache[expandedSubSkill]) return`) prevents re-fetching. No wasted queries.

---

## 8. Migration Impact

**None.**

- No schema changes
- No new database queries
- No StudyContext.jsx changes
- No ScreenRouter.jsx changes
- No new files
- No new dependencies

The entire change is a refactor of ProfileScreen.jsx's render output.

---

## 9. Line Budget Estimate

| Section | Lines |
|---------|-------|
| Imports + hook destructuring | ~18 (unchanged) |
| Shared computation (totals, byDomain, courseNames, bloom colors) | ~20 (unchanged) |
| connectionCache + useEffect | ~37 (unchanged) |
| Header bar (with conditional back) | ~10 (slight change) |
| **Hero view** | |
| Summary stats row | ~13 (unchanged) |
| TOP SKILLS section (header + 2×2 grid + empty slots) | ~50 (new) |
| Due-for-review banner | ~15 (new) |
| DOMAINS section (header + domain rows + empty state) | ~45 (new) |
| **Domain drill-down view** | |
| Domain header | ~8 (new — domain name, back breadcrumb) |
| Parent skill cards | ~35 (moved from current lines 150-184) |
| Sub-skill category groups + detail panel | ~180 (moved from current lines 220-397) |
| **Total** | ~430 lines |

Current ProfileScreen: 409 lines. New: ~430 lines. Net increase: ~20 lines.

The hero view adds ~110 new lines. The domain view is ~220 lines (moved from current code, mostly unchanged). Shared code is ~100 lines (unchanged).

---

## 10. Implementation Sequence

### Phase 1 DEV (this phase):

1. Add `profileView` state
2. Move header bar to conditional (hero vs domain back button)
3. Write hero view: summary stats + Top 4 grid + due banner + domain rows
4. Wrap current parent/sub-skill rendering in `if (profileView)` guard
5. Wire domain row `onClick` → `setProfileView({ domKey })`
6. Wire domain back button → `setProfileView(null); setExpandedSubSkill(null)`
7. Verify: hero shows on first visit, domain click shows drill-down, back returns to hero

### Phase 2 DEV (next phase):

1. Add domain header (domain name, aggregate stats)
2. Filter parent cards to selected domain only
3. Polish domain view layout
4. Handle edge cases (domain with 0 parents after filter, etc.)

Both phases modify only `src/screens/ProfileScreen.jsx`. No other files touched.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hero view doesn't call `loadProfile()` — stale data | None | — | `loadProfile()` is called by HomeScreen before navigating (line 82). Data is always fresh on entry. |
| `byDomain` computation is expensive for many parents | Low | Low | Currently O(n) loop over profileData. Even 100 parents is <1ms. No concern. |
| `profileView` state lost on hot reload | Low | Low | Component remounts → hero view. Acceptable for dev workflow. |
| Domain drill-down code moved incorrectly | Medium | Medium | Phase 1 wraps current code in conditional — no code changes to the drill-down content itself. Just wrapping. |

---

## 12. Verification Criteria

1. `npm run build` — clean, no warnings
2. Hero view renders when navigating to profile from HomeScreen
3. Summary stats match current values
4. Top 4 grid shows correct skills sorted by level
5. Domain rows show correct aggregates
6. Clicking domain row switches to drill-down view
7. "< Back to Profile" returns to hero
8. "< Back" on hero returns to HomeScreen
9. All current sub-skill functionality preserved in domain view
10. Concept link lazy-loading still works in domain view
