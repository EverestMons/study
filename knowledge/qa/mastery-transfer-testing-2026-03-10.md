# QA: Mastery Transfer Testing

**Date:** 2026-03-10
**Covers:** Step 3B.2 (mastery transfer in applySkillUpdates)
**Method:** Static code trace + build verification

---

## Test Results

### 1. Transfer Fires Once — PASS

**Trace — First interaction (existing === null):**
```
applySkillUpdates(courseId, [{ skillId: 42, rating: 'good', ... }])
  → existing = await Mastery.getBySkill(42) → null
  → card = initCard() → { difficulty: 0, stability: 0, reps: 0, lapses: 0 }
  → result = reviewCard(card, 3, now) → first-review path (reps === 0)
  → updated = { difficulty: d0(3), stability: s0(3), reps: 1, ... }
  → !existing (true) && grade >= 3 (true) → ENTER transfer block (line 313)
  → ConceptLinks.getBySkill(42) → loads links
  → [if same_concept link found with high mastery] → stability boosted, difficulty eased
  → Mastery.upsert(42, { reps: 1, difficulty: ..., stability: ..., ... })
```

**Trace — Second interaction (existing !== null):**
```
applySkillUpdates(courseId, [{ skillId: 42, rating: 'good', ... }])
  → existing = await Mastery.getBySkill(42) → { reps: 1, difficulty: ..., stability: ..., ... }
  → card = { difficulty: existing.difficulty, stability: existing.stability, reps: 1, ... }
  → !existing (false) → SKIP transfer block entirely (line 313)
  → reviewCard proceeds with subsequent-review path (reps > 0)
```

**Verified:** The guard `!existing` (study.js:313) ensures transfer runs exactly once — on the very first interaction. After `Mastery.upsert` writes the row, all future calls find `existing !== null` and skip the block.

### 2. FSRS Integrity After Transfer — PASS

**Concern:** Does modifying `updated.stability` and `updated.difficulty` after `reviewCard` break subsequent FSRS updates?

**Trace — Values written to DB on first interaction with transfer:**
```
Mastery.upsert(42, {
  difficulty: updated.difficulty,  // d0(3) - transferScale * 1.0 (clamped >= 1)
  stability: updated.stability,   // s0(3) * modifiers * (1 + transferScale * 0.4)
  reps: 1,
  lapses: 0,
  lastReviewAt: epoch_seconds,
  nextReviewAt: epoch_seconds,
  ...
})
```

**Trace — Second interaction reads these values:**
```
existing = { difficulty: D_transferred, stability: S_transferred, reps: 1, ... }
card = { difficulty: D_transferred, stability: S_transferred, reps: 1, ... }
reviewCard(card, grade, now):
  → reps > 0 → subsequent review path (fsrs.js:153)
  → elapsedDays = (now - lastReview) / 86400000
  → r = retrievability(elapsedDays, S_transferred)     ← uses transferred stability
  → if grade >= 2: newS = sSuccess(D_transferred, S_transferred, r, grade)
  → newD = nextDifficulty(D_transferred, grade)
```

**FSRS parameter constraints verified:**

| Parameter | Transfer range | FSRS valid range | Constraint check |
|-----------|---------------|------------------|------------------|
| `stability` | s0(3) * 1.0 to 1.4x ≈ 3.17 to 4.44 | > 0 (clamped ≥ 0.1 at fsrs.js:166) | Always valid |
| `difficulty` | d0(3) to d0(3) - 1.0 ≈ 4.87 to 3.87 | 1-10 (clampD at fsrs.js:80, study.js:336) | Always valid |
| `reps` | 1 (unchanged by transfer) | integer ≥ 0 | Valid |
| `lapses` | 0 (unchanged by transfer) | integer ≥ 0 | Valid |

**FSRS self-correction behavior:**
- `sSuccess` uses `ts = S^(-W[9])` — higher initial stability → smaller growth factor. The FSRS saturation mechanism naturally dampens the transfer advantage over time.
- `nextDifficulty` uses mean-reversion toward `d0(3)` weighted by `W[7] = 0.0046`. A slightly-lowered difficulty gradually drifts back toward the mean. Self-correcting.

**Verified:** The transferred stability and difficulty values fall within FSRS valid ranges. The algorithm's built-in saturation and mean-reversion prevent runaway effects. Subsequent reviews compute correctly.

### 3. No Transfer Without Link — PASS

**Scenario A — No concept links at all:**
```
ConceptLinks.getBySkill(42) → []
sameConceptLinks = [].filter(l => l.link_type === 'same_concept') → []
sameConceptLinks.length > 0 → false → SKIP
→ card = initCard() → reviewCard standard path → no modification
```

**Scenario B — Links exist but none are same_concept:**
```
ConceptLinks.getBySkill(42) → [{ link_type: 'prerequisite', ... }, { link_type: 'related', ... }]
sameConceptLinks = [].filter(l => l.link_type === 'same_concept') → []
sameConceptLinks.length > 0 → false → SKIP
```

**Scenario C — DB query throws:**
```
ConceptLinks.getBySkill(42) → throws Error
catch (e) at line 339 → silent swallow → no modification
```

**Scenario D — Link exists but linked skill has no mastery (never studied):**
```
Mastery.getBySkill(linkedId) → null
linkedMastery && linkedMastery.stability → false → skip this link
bestStrength stays 0 → bestStrength > 0.7 → false → SKIP
```

**Verified:** Four distinct "no transfer" paths all result in standard `initCard()` → `reviewCard` behavior. No bonus applied.

### 4. Threshold — PASS (after fix)

**Bug found:** Original implementation used `bestStrength >= 0.5`. Spec requires `> 0.7`.

**Fix applied (study.js:332-334):**
```js
// Before (wrong threshold):
if (bestStrength >= 0.5) {
  var transferScale = (bestStrength - 0.5) * 2;

// After (correct threshold):
if (bestStrength > 0.7) {
  var transferScale = (bestStrength - 0.7) / 0.3;
```

**Numeric verification of transfer scaling:**

| Linked strength | transferScale | Stability mult | Difficulty delta |
|-----------------|---------------|----------------|-----------------|
| 0.70 (at threshold) | — | 1.0x (no transfer) | 0.0 |
| 0.75 | 0.167 | 1.067x | -0.17 |
| 0.80 | 0.333 | 1.133x | -0.33 |
| 0.85 | 0.500 | 1.200x | -0.50 |
| 0.90 | 0.667 | 1.267x | -0.67 |
| 0.95 | 0.833 | 1.333x | -0.83 |
| 1.00 | 1.000 | 1.400x | -1.00 |

**Edge: linked strength exactly 0.70:**
- `bestStrength > 0.7` → `0.7 > 0.7` → `false` → no transfer. Correct — strictly greater than.

**Edge: linked strength 0.71:**
- `transferScale = (0.71 - 0.7) / 0.3 = 0.033` → stability * 1.013, difficulty - 0.033. Minimal but non-zero. Correct.

**Verified:** Threshold matches spec (`> 0.7`). Scaling is smooth and linear from threshold to maximum.

### 5. Cross-Course Transfer — PASS

**Trace:** Skill 42 (MATH 201, course_id=1) linked to skill 17 (PHYS 201, course_id=2) as `same_concept`.

```
ConceptLinks.getBySkill(42)
  → SQL: WHERE cl.sub_skill_a_id = 42 OR cl.sub_skill_b_id = 42
  → Returns link row (no course filter in query — db.js:1378-1382)
  → link_type = 'same_concept' → passes filter (line 316)

linkedId = link.sub_skill_a_id === 42 ? link.sub_skill_b_id : link.sub_skill_a_id
  → Canonical order: sub_skill_a_id=17, sub_skill_b_id=42 (17 < 42)
  → link.sub_skill_a_id (17) !== 42 → linkedId = link.sub_skill_a_id = 17 ✓

Mastery.getBySkill(17)
  → SQL: WHERE sub_skill_id = 17 (no course filter)
  → Returns PHYS 201 skill's mastery state

currentRetrievability({ stability: ..., lastReviewAt: ... })
  → Computes strength of the PHYS skill
  → If > 0.7 → transfer bonus applied to MATH skill
```

**Verified:** No course filtering at any step. `ConceptLinks.getBySkill` queries by skill ID only. `Mastery.getBySkill` queries by skill ID only. Cross-course transfer works identically to same-course.

### 6. Same-Course Transfer — PASS

**Trace:** Skill 42 and skill 43 are both in MATH 201 (course_id=1), linked as `same_concept`.

```
ConceptLinks.getBySkill(42)
  → Returns link row where sub_skill_a_id=42, sub_skill_b_id=43 (42 < 43)
  → link_type = 'same_concept' → passes filter

linkedId = link.sub_skill_a_id === 42 ? link.sub_skill_b_id : link.sub_skill_a_id
  → link.sub_skill_a_id (42) === 42 → linkedId = link.sub_skill_b_id = 43 ✓

Mastery.getBySkill(43)
  → Returns same-course skill's mastery state
  → If > 0.7 → transfer applied
```

**Note:** Same-course same_concept links are unusual (they imply two skills in the same course cover the same underlying knowledge — potential redundancy). But the transfer logic doesn't discriminate — it works for any `same_concept` link regardless of course boundaries.

**Verified:** Same-course transfer works identically. No course filtering prevents it.

---

## Additional Observations

### 7. Grade Gate — PASS

**Code (study.js:313):**
```js
if (!existing && grade >= 3) {
```

- `mapRating('struggled')` → 1, `mapRating('hard')` → 2 — both < 3 → no transfer
- `mapRating('good')` → 3, `mapRating('easy')` → 4 — both >= 3 → transfer eligible

**Rationale:** If a student struggles with a concept they supposedly already know from another course, the transfer bonus is inappropriate. Only passing grades trigger transfer.

**Verified:** Transfer only fires on `good` or `easy` first interactions.

### 8. Multiple same_concept Links — PASS

**Code (study.js:318-329):** Iterates ALL same_concept links, tracks `bestStrength`:
```js
var bestStrength = 0;
for (var link of sameConceptLinks) {
  // ... compute linkedStr
  if (linkedStr > bestStrength) bestStrength = linkedStr;
}
```

**Scenario:** Skill 42 has same_concept links to skill 17 (strength 0.6) and skill 23 (strength 0.9).
- After loop: `bestStrength = 0.9` → `transferScale = (0.9 - 0.7) / 0.3 = 0.667`
- Only the strongest linked skill drives the bonus

**Verified:** Multiple links are handled correctly. Best-of-N strategy — conservative and predictable.

### 9. Linked Skill Has No lastReviewAt — PASS

**Code (study.js:325-326):**
```js
lastReviewAt: linkedMastery.last_review_at
  ? new Date(linkedMastery.last_review_at * 1000).toISOString() : null,
```

**If `last_review_at` is null:**
- `lastReviewAt: null` passed to `currentRetrievability`
- `currentRetrievability` (fsrs.js:196): `if (!card.lastReviewAt) return 0`
- `linkedStr = 0` → doesn't beat `bestStrength` → no transfer from this link

**Verified:** Null/missing timestamps don't crash. Safely returns 0 strength.

### 10. Interaction with Stability Modifier — PASS

**Execution order (study.js:305-340):**
```
1. reviewCard(card, grade) → updated = { stability: s0(3) = 3.173, difficulty: d0(3) = 4.87, ... }
2. stabilityModifier = contextMult * sourceWeight
3. updated.stability = card.stability + (baseStabilityGain * stabilityModifier)
   → For initCard (stability=0): updated.stability = 0 + (3.173 * modifier)
   → With guided/tutor: modifier = 1.0 * 0.6 = 0.6 → stability = 1.904
4. [Transfer block]: updated.stability *= (1 + transferScale * 0.4)
   → With transferScale=1.0: stability = 1.904 * 1.4 = 2.665
```

**Key insight:** Transfer multiplies the *already-modulated* stability, not the raw FSRS output. This means low-evidence contexts (like `explained` with 0.4 contextMult) get proportionally smaller transfer bonuses. This is correct behavior — a casually-mentioned concept shouldn't get the same boost as a diagnosed one.

**Verified:** Transfer stacks multiplicatively with evidence-quality modifiers. No double-counting.

### 11. Build Verification — PASS

```
✓ built in 1.29s
```

No compilation errors. No missing imports (ConceptLinks already imported at study.js:1).

---

## Bug Fixed During QA

| Bug | Severity | Root cause | Fix |
|-----|----------|-----------|-----|
| Transfer threshold too low | Medium | Implemented `>= 0.5` instead of spec's `> 0.7` | Changed to `bestStrength > 0.7` and scaled `(bestStrength - 0.7) / 0.3` (study.js:333-334) |

The original threshold of 0.5 would have triggered transfer for skills with moderate retrieval probability — too aggressive. At 50% retrievability, a student may not reliably recall the linked concept, making the transfer bonus unjustified. The corrected 0.7 threshold ensures transfer only fires when the linked skill is well-retained.

---

## Static Trace Summary

| Test | Result | Notes |
|------|--------|-------|
| Transfer fires once | PASS | `!existing` guard — null on first call, non-null after upsert |
| FSRS integrity | PASS | Transferred values within valid ranges, self-correcting via saturation/mean-reversion |
| No transfer without link | PASS | 4 skip paths: no links, wrong type, DB error, no mastery |
| Threshold > 0.7 | PASS (after fix) | Changed from >= 0.5 to > 0.7 with correct scaling |
| Cross-course | PASS | No course filtering in queries — works by design |
| Same-course | PASS | Identical code path — no course discrimination |
| Grade gate | PASS | Only good/easy (grade >= 3) — no transfer on struggled/hard |
| Multiple links | PASS | Best-of-N strategy — strongest linked skill wins |
| Null lastReviewAt | PASS | currentRetrievability returns 0 — safe |
| Stability modifier interaction | PASS | Transfer stacks multiplicatively with evidence quality |
| Build verification | PASS | Clean build, no errors |

## Step 3B Checkpoint

- [x] DEV: Transfer bonus logic in `applySkillUpdates()` (~28 lines, study.js:312-340)
- [x] QA: All 6 required test categories verified + 5 additional
- [x] Bug fixed: Threshold corrected from >= 0.5 to > 0.7
- [x] Build verified — clean
