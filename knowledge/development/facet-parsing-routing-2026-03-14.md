# Facet Parsing + FSRS Routing + Mastery Detection — Development Log
**Date:** 2026-03-14
**Agent:** Study Developer
**Step:** Step 5
**Blueprint:** `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md`

---

## What Was Implemented

### 1. `parseSkillUpdates` — Rewritten with Facet Sub-Line Support

**Location:** `src/lib/study.js` lines 1692–1747 (full rewrite of existing function)

**Behavior:**
- Maintains backward compatibility: skill-level lines parsed as before
- NEW: Detects facet sub-lines (indented with spaces/tabs or `>` prefixed) following a skill line
- Facet sub-lines use same format: `facet-key: rating | reason | context:tag | criteria:text`
- Each skill update object now includes `facets: []` array (empty if no facet sub-lines)
- Facet entries: `{ facetKey, rating, reason, context, criteria }`
- `currentSkill` tracker: facet lines attach to the most recent skill-level line

**Example parsed output:**
```
[SKILL_UPDATE]
power-rule: good | Applied correctly | context:guided
  basic-differentiation: good | Solid polynomial work | context:diagnostic
  chain-rule-combo: hard | Struggled with chain rule
[/SKILL_UPDATE]
```
→ `[{ skillId: "power-rule", rating: "good", ..., facets: [{ facetKey: "basic-differentiation", ... }, { facetKey: "chain-rule-combo", ... }] }]`

### 2. `applySkillUpdates` — Major Rewrite with Per-Facet FSRS Routing

**Location:** `src/lib/study.js` lines 244–724 (expanded from ~310 lines to ~480 lines)

**Signature change:** `async (courseId, updates, intentWeight, sessionMasteredSkills)` — new 4th parameter

**Return type change:** Now returns `masteryEvents[]` array (was void/undefined). Backward compatible — callers that ignore return value are unaffected.

**New behavior:**

#### a. Pre-update Snapshot (lines 300–307)
- Loads facets for skill via `Facets.getBySkill()`
- Snapshots `preFacetRatings` map (`facet_id → last_rating`) before any writes
- Used for mastery threshold new-transition detection

#### b. Per-Facet Routing Branch (lines 316–417)
When `u.facets.length > 0` (AI provided individual facet ratings):
- Each facet gets its own:
  - Grade mapping via `mapRating(fu.rating)`
  - Context multiplier (can differ from skill-level context)
  - Source weight
  - FSRS card init or load from `FacetMastery.get()`
  - `reviewCard()` state transition
  - Stability modulation by evidence quality
  - Concept link mastery transfer (first interaction only, checks both `FacetConceptLinks` and falls back to skill-level `ConceptLinks`)
  - Bloom's multiplier (uses facet's own `blooms_level` if available, else skill's)
  - Weighted points calculation
  - `FacetMastery.upsert()` with full FSRS state
- Collects `facetResults[]` for aggregate computation
- Loads unmentioned facets' existing mastery for accurate aggregate (lines 419–438)

#### c. Uniform Distribution Branch (lines 439–534)
Preserved as `else` branch — existing behavior for skills without facet sub-lines. All facets get the same grade as the skill-level rating. Unchanged from pre-Step 5 logic except now within the branching structure.

#### d. Skill-Level Aggregate (lines 536–559)
When facet results exist, computes aggregate:
- `retrievability` = mean of facet retrievabilities
- `stability` = min of facet stabilities (weakest link)
- `difficulty` = mean of facet difficulties
- `reps` = max, `lapses` = max
- `lastReviewAt` = max, `nextReviewAt` = min (earliest due)
- `totalMasteryPoints` = sum
- Writes to skill-level `Mastery` table (backward compat)

#### e. Mastery Threshold Check (lines 561–603)
- Condition: all facets have `last_rating` of "good" or "easy"
- Must be a NEW transition: `preFacetRatings` snapshot shows at least one facet was not "good"/"easy" before
- Deduplicated by `sessionMasteredSkills` Set (passed from StudyContext)
- Emits `MasteryEvent` object:
  ```js
  {
    skillId, skillName, conceptKey,
    facets: [{ id, name, rating, isNew }],
    levelBefore, levelAfter,
    nextReviewDays: Math.ceil(minStability),
    messageIndex: null, // set by sendMessage
    timestamp: Date.now()
  }
  ```

#### f. Skill-Level Fallback (lines 605–678)
For skills WITHOUT facets — unchanged from pre-Step 5. Direct FSRS on skill-level `Mastery` row.

### 3. `_pointsToLevel` Helper

**Location:** `src/lib/study.js` lines 727–734

**Thresholds:** 0→0, >0→1, ≥10→2, ≥30→3, ≥60→4, ≥100→5

Used in mastery event `levelBefore`/`levelAfter` computation.

### 4. StudyContext Session Refs + sendMessage Integration

**Location:** `src/StudyContext.jsx`

#### a. New Refs (lines 127–129)
```js
const sessionMasteryEvents = useRef([]);
const sessionFacetUpdates = useRef([]);
const sessionMasteredSkills = useRef(new Set());
```

#### b. Reset in `enterStudy` (lines 712–714)
All three refs reset when entering a new study session.

#### c. `sendMessage` Skill Update Handling (lines 1049–1082)
- Passes `sessionMasteredSkills.current` to `applySkillUpdates` (line 1052)
- Accumulates facet-level updates to `sessionFacetUpdates.current` (lines 1055–1062)
- Handles mastery events: sets `messageIndex`, pushes to `sessionMasteryEvents`, adds to dedup Set, fires mastery notification (lines 1064–1075)
- Regular skill notifications skip mastered skills to avoid duplicate notifs (lines 1077–1082)

#### d. Context Value (line 1384)
Exposed `sessionMasteryEvents`, `sessionFacetUpdates`, `sessionMasteredSkills` in the context value object alongside other session refs.

---

## Files Modified

| File | Lines Changed | Nature |
|---|---|---|
| `src/lib/study.js` | ~170 new lines in `applySkillUpdates`, ~55 lines rewritten in `parseSkillUpdates`, +8 lines `_pointsToLevel` | Major: per-facet routing + parser + helper |
| `src/StudyContext.jsx` | +3 refs, +3 resets, ~30 lines in sendMessage, +1 context value line | Session accumulation + mastery event handling |

No other files modified. No UI changes. No new exports needed beyond what was already exported.

---

## Build Verification

```
npx vite build --mode development
✓ 175 modules transformed.
✓ built in 1.74s
```

No new errors or warnings. Existing dynamic import warnings for db.js and extraction.js unchanged.

---

## Backward Compatibility

1. **PracticeMode** (`src/components/study/PracticeMode.jsx` line 287): Calls `applySkillUpdates(active.id, [{...}])` without 4th argument. `sessionMasteredSkills` defaults to `new Set()` inside the function. Update objects lack `facets` field, so `u.facets` is `undefined` → treated as empty → uniform distribution branch. Return value (array) is ignored. **No changes needed.**

2. **Skills without facets**: `Facets.getBySkill()` returns `[]` → falls through to skill-level fallback branch (lines 605–678). Identical to pre-Step 5 behavior.

3. **Legacy `+N points` format**: Still parsed by fallback regex in `parseSkillUpdates` (line 1738). Gets `facets: []`.

---

## Deviations from Blueprint

1. **`preFacetRatings` implementation**: Blueprint described this conceptually as "snapshot before updates." Implementation captures a `Map<facet_id, last_rating>` by querying `FacetMastery.getByFacets()` before any writes. The `wasAlreadyMastered` check iterates all facets against this snapshot, which is slightly different from the blueprint's "any facet newly rated good/easy" — but the logic is equivalent: if all facets were already good/easy before, it's not a new mastery transition.

2. **Aggregate computation placement**: Blueprint had aggregate as a separate subsection. Implementation places it inside the facets branch guard (`if (facets.length > 0)`) to avoid computing aggregates when there are no facets. The skill-level fallback writes directly to `Mastery` instead.

3. **Mastery event `messageIndex`**: Blueprint didn't specify exactly when to set this. Implementation sets it in `sendMessage` (line 1068) to `newMsgs.length` (the index of the assistant message that triggered the event), which is the natural point since the assistant response is where ratings appear.

---

## Output Receipt
**Agent:** Study Developer
**Step:** Step 5
**Status:** Complete

### What Was Done
Rewrote `parseSkillUpdates` with facet sub-line parsing, expanded `applySkillUpdates` with per-facet FSRS routing + mastery threshold detection + aggregation, added `_pointsToLevel` helper, and wired session-level accumulation refs into StudyContext with sendMessage integration. Build passes.

### Files Deposited
- `study/knowledge/development/facet-parsing-routing-2026-03-14.md` — This development log

### Files Created or Modified (Code)
- `src/lib/study.js` — Rewritten `parseSkillUpdates` (lines 1692-1747), expanded `applySkillUpdates` (lines 244-724), new `_pointsToLevel` (lines 727-734)
- `src/StudyContext.jsx` — New refs (lines 127-129), reset in `enterStudy` (lines 712-714), `sendMessage` mastery handling (lines 1049-1082), context value exposure (line 1384)

### Decisions Made
- Placed aggregate computation inside the facets guard to avoid unnecessary work for skills without facets
- Used `preFacetRatings` snapshot approach for new-transition detection (more reliable than checking individual facet changes)
- Mastery notification format: `"skillName → Lv N"` for concise display in notif panel
- Regular skill update notifs suppressed for skills that triggered mastery events (avoid double notification)

### Flags for CEO
- None — all implementation follows blueprint specification

### Flags for Next Step
- **For Step 6 (SessionSummary):** `sessionMasteryEvents`, `sessionFacetUpdates`, `sessionMasteredSkills` are now exposed on the context. SessionSummary component needs to consume these to display mastery celebrations and facet-level progress. The `MasteryEvent` shape is documented above.
- **`_pointsToLevel` is not exported** — it's private to study.js. If SessionSummary needs level computation, either export it or replicate the thresholds in the component.
- **`applySkillUpdates` return type** is now `masteryEvents[]` — any future callers should be aware they can capture mastery events.
