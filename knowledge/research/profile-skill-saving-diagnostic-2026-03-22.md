# Profile Skill Saving — Full Chain Diagnostic
**Date:** 2026-03-22

---

## Area 1: FSRS Update Path

**File:** `src/lib/study.js` — `applySkillUpdates()` (line 244)

When the AI rates a single facet (e.g., one facet rated "good"), the following happens:

### Per-facet FSRS (lines 316–417)
1. `facets = await Facets.getBySkill(u.skillId)` — loads all facets for the skill (line 298)
2. If `u.facets` contains per-facet ratings (per-facet routing, line 316), each rated facet goes through:
   - `FacetMastery.get(targetFacet.id)` — check for existing mastery (line 327)
   - If none → `initCard()` — `{ difficulty: 0, stability: 0, reps: 0, lapses: 0 }`
   - `reviewCard(card, grade, now)` — FSRS-4.5 computation (line 341)
   - Stability modifier applied: `fuStabMod = contextMult * sourceWeight` (line 344)
   - `FacetMastery.upsert(targetFacet.id, ...)` fires with full FSRS state (line 394)
   - Result pushed to `facetResults[]` (line 406)

### Unmentioned facets loop (lines 419–438)
For facets NOT mentioned in the AI's rating:
```javascript
if (!mentionedKeys.has(umFacet.concept_key)) {
    var umExisting = await FacetMastery.get(umFacet.id);
    if (umExisting) {      // ← CRITICAL: only if they have prior mastery
        facetResults.push({ ... });
    }
}
```
**Untested facets with no `FacetMastery` record are EXCLUDED from `facetResults`.** This means the aggregate is computed from only the facets that have been tested at least once.

### Aggregate computation (lines 536–558)
```javascript
aggRetrievability = sum(facetResults.retrievability) / facetResults.length;  // average
aggStability = Math.min(facetResults.stability);   // minimum
aggDifficulty = sum(facetResults.difficulty) / facetResults.length;  // average
aggReps = Math.max(facetResults.reps);             // maximum
aggLastReviewAt = Math.max(facetResults.lastReviewAt);  // most recent
aggNextReviewAt = Math.min(facetResults.nextReviewAt);  // soonest
```
Then: `Mastery.upsert(u.skillId, { ... })` fires with these aggregates (line 548).

### Exact computation: 1/5 facets rated "good"
- Only 1 facet enters `facetResults` (the other 4 have no prior mastery → excluded)
- FSRS for first review with grade=3 (good):
  - `s0(3) = W[2] = 3.173` (initial stability)
  - `d0(3) = clampD(W[4] - exp(W[5] * 2) + 1) = clampD(7.195 - 2.912 + 1) = 5.283`
  - `retrievability = 1.0` (returned explicitly for first reviews)
- Stability modifier: `contextMult=1.0 (guided) * sourceWeight=0.6 (tutor/guided) = 0.6`
  - `stabGain = 3.173 - 0 = 3.173`
  - `finalStability = 0 + 3.173 * 0.6 = 1.904`
- Skill-level aggregate:
  - **`aggRetrievability = 1.0 / 1 = 1.0`** (100%)
  - **`aggStability = 1.904`**
  - **`aggDifficulty = 5.283`**

**Conclusion:** `FacetMastery.upsert()` fires. `Mastery.upsert()` fires. The skill gets a mastery record with 100% retrievability.

---

## Area 2: Profile Data Loading

**File:** `src/StudyContext.jsx` — `loadProfile()` (line 727)

### Bulk queries (lines 730–743)
```javascript
const allParents = await ParentSkills.getAll();
const allSubs = await SubSkills.getAllActive();
const allMasteryRows = await Mastery.getAll();
const allFacetRows = await Facets.getAllActive();
const allFacetMasteryRows = await FacetMastery.getAll();
```

### Hash map builds (lines 747–757)
- `masteryBySkill[m.sub_skill_id] = m` — maps skill ID → mastery record
- `facetsBySkill[f.skill_id] = [...]` — maps skill ID → facet array
- `facetMasteryById[fm.facet_id] = fm` — maps facet ID → facet mastery

### Skill enrichment (lines 774–851)
For each sub-skill:
- `m = masteryBySkill[sub.id]` — looks up skill-level mastery (line 775)
- If `m` exists:
  - `retrievability = currentRetrievability({ stability: m.stability, lastReviewAt: m.last_review_at })` (line 794)
  - `if (retrievability > 0) { readinessSum += retrievability; readinessCount++; }` (line 796)
- Facets are also enriched with per-facet mastery (lines 806–831)
- Mastery object attached: `mastery: m ? { retrievability, stability, difficulty, ... } : null` (line 844)

**Both skill-level and facet-level mastery are loaded.** The profile readiness computation uses **skill-level** mastery (which is the facet aggregate). Facet-level data is loaded but used for sub-skill detail display, not the readiness bar directly.

---

## Area 3: ProfileScreen Display

**File:** `src/screens/ProfileScreen.jsx` (lines 146–194)

### Visibility filter (StudyContext.jsx:854)
```javascript
const acquiredSubs = enrichedSubs.filter(s => s.mastery !== null);
if (acquiredSubs.length === 0) continue;
```
A skill appears on the profile if it has **any** mastery record. There is **no minimum mastery threshold, no minimum strength, and no filter that hides skills with low mastery**.

### Readiness bar (ProfileScreen.jsx:188–193)
```javascript
<div style={{ width: Math.round(readiness * 100) + "%", ... background: readinessColor, ... }} />
<span>{Math.round(readiness * 100)}%</span>
```
Where `readiness = readinessCount > 0 ? readinessSum / readinessCount : 0` (StudyContext.jsx:865).

Color thresholds (line 147): `readiness > 0.8 → T.gn (green), > 0.5 → #F59E0B (amber), else → T.rd (red)`.

### Would 1/5 facets rated "good" appear?
**Yes.** `Mastery.upsert()` creates a mastery record → `m !== null` → passes `acquiredSubs` filter. The readiness bar would show `Math.round(1.0 * 100) = 100%` in green immediately after the session.

---

## Area 4: `effectiveStrength` Computation

**File:** `src/lib/study.js` (line 31)
```javascript
export const effectiveStrength = (skillOrMastery) => {
  if (!skillOrMastery) return 0;
  const m = skillOrMastery.mastery || skillOrMastery;
  if (!m.stability || !m.lastReviewAt) return 0;
  return currentRetrievability(m);
};
```

**File:** `src/lib/fsrs.js` — `currentRetrievability()` (line 195)
```javascript
const elapsed = Math.max(0, (nowMs - lrMs) / 86400000);
return retrievability(elapsed, card.stability);
```

**File:** `src/lib/fsrs.js` — `retrievability()` (line 59)
```javascript
if (!s || s <= 0 || !t || t <= 0) return s > 0 ? 1.0 : 0.0;
return Math.pow(1 + F * (t / s), C);
```

`effectiveStrength` uses **skill-level aggregates only** (the `mastery` sub-object from `Mastery.upsert`), not facet-level data directly.

### Scenario: 1 facet at 80% retrievability, 4 untested
- Skill-level aggregate `retrievability` was set to 0.80 at upsert time (from Area 1 aggregate)
- But `effectiveStrength` does NOT read the stored `retrievability` field — it **recomputes** from `stability` and `lastReviewAt`
- So the returned value depends on elapsed time since last review, not the stored aggregate
- With `stability ≈ 1.904` and `elapsed ≈ 0` → returns `1.0` (just reviewed)
- After 1 day: `retrievability(1, 1.904) = (1 + 0.2346 * 1/1.904)^(-0.5) = (1.1232)^(-0.5) ≈ 0.944`
- After 3 days: `retrievability(3, 1.904) = (1 + 0.2346 * 3/1.904)^(-0.5) = (1.3695)^(-0.5) ≈ 0.854`

---

## Area 5: Parent Skill Level Computation

**File:** `src/StudyContext.jsx` (lines 767–869)

Parent readiness is computed from acquired sub-skills:
```javascript
// Per sub-skill (line 796):
if (retrievability > 0) { readinessSum += retrievability; readinessCount++; }

// Parent level (line 865):
readiness: readinessCount > 0 ? readinessSum / readinessCount : 0,
```

- Parent readiness = **average retrievability of acquired sub-skills that have retrievability > 0**
- If a parent has 10 sub-skills and only 1 has minimal facet progress → parent shows readiness based on that 1 sub-skill alone (not diluted by the 9 without mastery)
- Level = `Math.floor(Math.sqrt(totalPoints))` (line 857) — based on accumulated mastery points
- A single facet "good" rating earns 3 base points × 1.0 (guided) × 1.0 (blooms) × 0.6 (tutor/guided) × 1.0 × 1.0 = 2 points (Math.max(1, round(1.8))) → Level 1 (sqrt(2) = 1.41, floor = 1)

**One sub-skill with minimal facet progress IS visible on the parent.** The parent shows up with level 1 and a readiness % that reflects only the tested skills.

---

## Area 6: Edge Case — First Interaction

### Scenario: Student starts studying, AI rates one facet as "good" on first message.

**DB writes that happen:**
1. `FacetMastery.upsert(facetId, { stability: 1.904, retrievability: 1.0, difficulty: 5.283, reps: 1, lastReviewAt: now, nextReviewAt: now+3days, totalMasteryPoints: 2, lastRating: "good" })`
2. `Mastery.upsert(skillId, { stability: 1.904, retrievability: 1.0, difficulty: 5.283, reps: 1, lastReviewAt: now, nextReviewAt: now+3days, totalMasteryPoints: 2, lastRating: "good" })`

**Profile display after navigating to it:**
- `loadProfile()` runs on mount (triggered by `useEffect` when `screen === "profile"`)
- `Mastery.getAll()` returns the new mastery record → `masteryBySkill[skillId] = m`
- `m !== null` → skill passes `acquiredSubs` filter → appears on profile
- `currentRetrievability({ stability: 1.904, lastReviewAt: now })` → elapsed ≈ 0 → returns **1.0**
- Readiness bar shows **100%** in **green** (> 0.8 threshold)
- Level badge shows **1** (sqrt(2) = 1.41, floor = 1)
- "1 skill · 1 reviewed" text

**Is there a caching/loading delay?**
- `loadProfile()` is called fresh each time the profile screen is entered (via `useEffect` dependency on `screen`)
- No caching layer — it queries the DB directly
- The update is **immediately visible** on the next profile visit

---

## Summary: Full Chain

```
AI rates 1 facet "good"
  → applySkillUpdates() (study.js:244)
    → FacetMastery.upsert()  — facet-level FSRS record created
    → facetResults = [1 entry]  — untested facets excluded (no prior mastery)
    → aggregate: retrievability=1.0, stability=1.904
    → Mastery.upsert()  — skill-level aggregate record created
      → User navigates to Profile
        → loadProfile() queries Mastery.getAll()
          → acquiredSubs.filter(s.mastery !== null) — PASSES (mastery exists)
          → currentRetrievability() recomputed live — returns ~1.0 (just reviewed)
          → readinessSum += 1.0, readinessCount++
            → Parent readiness = 1.0 / 1 = 100%
            → Readiness bar: 100% green
            → Level: 1
```

### Thresholds/Filters That Could Hide Early Progress
| Check | Threshold | Blocks Early Progress? |
|---|---|---|
| `acquiredSubs` filter | `mastery !== null` | **No** — any mastery record passes |
| Readiness inclusion | `retrievability > 0` | **No** — retrievability is 1.0 right after review |
| Parent visibility | `acquiredSubs.length === 0` | **No** — 1 acquired sub-skill suffices |
| Level computation | `Math.floor(Math.sqrt(points))` | **No** — 2 points → level 1 |

### Verdict
**A single facet "good" rating IS immediately visible on the profile.** No signal is lost. The skill appears with 100% readiness (green bar) and level 1.

### Design Consideration (Not a Bug)
The aggregate computation only includes tested facets. This means:
- 1/5 facets rated "good" → skill shows 100% readiness
- This could appear misleading — the student has only been tested on 20% of the skill's facets
- The readiness reflects "how well do you remember what you've studied" (correct), not "how much of this skill have you covered" (coverage)
- The profile does show "1 skill · 1 reviewed" and the level is low (1), providing some signal about limited progress
- Facet-level detail is available when expanding the skill (enriched facets with per-facet mastery)
