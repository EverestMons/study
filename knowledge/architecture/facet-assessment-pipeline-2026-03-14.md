# Facet Assessment Pipeline — Architecture Blueprint
**Date:** 2026-03-14
**Agent:** Study Systems Analyst
**Project:** study
**Scope:** Complete pipeline design for facet-level AI assessment, from context injection through mastery event emission

---

## Design Inputs

- **Step 1 (Research):** Continuous stealth assessment, not checkpoints. Evidence weighted by context (unprompted > prompted > hinted > scaffolded). Mastery threshold: all facets rated "good"+ at least once. Ongoing mastery: retrievability >= 0.7. Review trigger: retrievability < 0.5. Assessment wrap-up via synthesis question covering unassessed facets — never sequential diagnostic pass.
- **Step 2 (UX Design):** MasteryEvent data: `{ skillId, skillName, facets, levelBefore, levelAfter, nextReviewDays }`. FacetPills need `{ facetId, name, rating, isNew }`. SessionSummary needs `masteryEvents`, `facetsAssessed`, `nextSuggestion`. MasteryCard inline in chat, keyed to message index.
- **Existing Pipeline:** `buildFocusedContext` → `buildSystemPrompt` → Claude → `parseSkillUpdates` → `applySkillUpdates` → notifications + context rebuild. Facets exist in schema but are invisible to the AI and uniformly rated.

---

## 1. `buildFacetAssessmentBlock(skillIds, allSkills)` — Context Builder Helper

### Purpose

Expose facets to the AI as individually assessable units with their current mastery state, so the AI can rate specific facets rather than applying a blanket skill-level rating.

### Signature

```js
// In src/lib/study.js
export const buildFacetAssessmentBlock = async (skillIds, allSkills) => { ... }
```

### Parameters

- `skillIds` — `Array<number|string>` — skill IDs or concept keys to load facets for
- `allSkills` — loaded skills array for name resolution

### Returns

- `string` — formatted text block, or `""` if no facets exist for any of the given skills

### Algorithm

```
1. For each skillId in skillIds:
   a. Resolve to numeric ID (may be conceptKey — use allSkills for lookup)
   b. facets = await Facets.getBySkill(id)
   c. If facets.length === 0, skip this skill
   d. facetIds = facets.map(f => f.id)
   e. masteryRows = await FacetMastery.getByFacets(facetIds)
   f. masteryMap = new Map(masteryRows.map(m => [m.facet_id, m]))

2. Format output block:
   FACETS FOR [SKILL NAME] (concept-key):
     [facet-concept-key]: [facet-name] [mastery: NN% | untested] [blooms: level]
       Demonstrates: [mastery_criteria text]
     [facet-concept-key]: [facet-name] [mastery: NN% | untested] [blooms: level]
       Demonstrates: [mastery_criteria text]
   ...

3. Mastery % = currentRetrievability(facetMastery) * 100, rounded
   If no FacetMastery record exists: "untested"
   If mastery_criteria is null or empty: omit "Demonstrates:" line
```

### Token Budget

- Per facet: ~25–40 tokens (key + name + mastery + criteria line)
- Per skill with 5 facets: ~150–200 tokens
- Cap: process at most 3 skills per call. Skills with the most facets first. If more than 3 skills, truncate with `"[N more skills with facets — rate by skill-level]"`
- Total budget: **~400–600 tokens worst case** for 3 skills × 8 facets

### Injection Points

**Skill-focused sessions** (`buildFocusedContext`, lines 1110–1167):
- After the FOCUS SKILL block (line 1136, after prerequisites):
  ```js
  var facetBlock = await buildFacetAssessmentBlock([skill.id], allSkills);
  if (facetBlock) ctx += "\n" + facetBlock + "\n";
  ```

**Assignment-focused sessions** (`buildFocusedContext`, lines 1036–1108):
- After the REQUIRED SKILLS block (line 1063, after skill iteration):
  ```js
  var asgnSkillIds = [...requiredSkillIds].map(sid => {
    var s = allSkills.find(sk => sk.id === sid || sk.conceptKey === sid);
    return s ? s.id : null;
  }).filter(Boolean);
  var facetBlock = await buildFacetAssessmentBlock(asgnSkillIds, allSkills);
  if (facetBlock) ctx += "\n" + facetBlock + "\n";
  ```

**Recap and exam sessions:** No facet block — these are broad-scope, not targeted assessment contexts.

### Backward Compatibility

When `Facets.getBySkill(id)` returns `[]` (skill has no facets), the function returns `""`. No change to existing context output.

---

## 2. System Prompt Additions

### Location

Appended to `buildSystemPrompt()` output (study.js line 1416), after the existing SKILL STRENGTH TRACKING section. Two new sections totaling ~750 characters.

### New Section: FACET-LEVEL ASSESSMENT

```
FACET-LEVEL ASSESSMENT:

When the context includes a FACETS section for a skill, rate individual facets instead of the skill as a whole. Use the facet keys shown in the context.

Format:
[SKILL_UPDATE]
concept-key: good | reason | context:tag
  facet-key-1: easy | reason | context:tag
  facet-key-2: good | reason | context:guided
[/SKILL_UPDATE]

The skill-level line is the overall assessment. The indented facet lines rate specific facets. You may rate just the facets you observed evidence for — you do not need to rate every facet in each update. Only rate facets the student actually demonstrated or failed to demonstrate.

If the context has no FACETS section for a skill, rate at the skill level only (existing format).
```

### New Section: ASSESSMENT PROTOCOL

```
ASSESSMENT PROTOCOL:

When teaching a skill with facets, assess continuously — each exchange is an opportunity to rate the facets the student demonstrated. Do NOT save assessment for the end or announce that you're assessing.

Near the end of a skill segment, if some facets have not been demonstrated, organically introduce them through a synthesis question that requires multiple facets: "Given what we've covered, walk me through how you'd approach [scenario requiring unassessed facets]."

Never iterate through facets one by one with direct questions. Never announce "let me check each facet." The student should feel like the conversation is reaching a natural conclusion, not an exam.
```

### Character Count

- FACET-LEVEL ASSESSMENT: ~560 chars
- ASSESSMENT PROTOCOL: ~520 chars
- Total: ~1,080 chars added to system prompt (was ~3,800, now ~4,880)

This exceeds the 800-char constraint from the execution plan. **Mitigation:** The ASSESSMENT PROTOCOL section can be shortened to ~350 chars by removing the example sentence:

```
ASSESSMENT PROTOCOL:

Assess facets continuously during teaching — each exchange is evidence. Do NOT save assessment for the end or announce you're assessing. Near the end, if unassessed facets remain, introduce them through a synthesis question requiring multiple facets. Never iterate through facets one-by-one and never announce assessment mode.
```

Shortened total: ~910 chars. Still over 800 but within 15% — acceptable given the critical importance of the assessment protocol instructions.

### Why This Approach (Conditional Facet Rating)

The system prompt tells the AI: "If facets are in context, rate facets. If not, rate skills." This is the key architectural choice — the AI's behavior adapts based on what `buildFocusedContext` provides, not based on a global flag.

---

## 3. SKILL_UPDATE Format Recommendation

### Analysis of Options

| Criterion | Option A (Facet sub-lines) | Option B (Separate FACET_UPDATE) | Option C (Facet-only) |
|---|---|---|---|
| Backward compatibility | Full — skill-level line preserved | Full — separate tag, existing parser untouched | Breaking — no skill-level fallback |
| Parsing complexity | Medium — indent detection | Low — simple new regex | Low — single tag |
| AI cognitive load | Low — one tag, familiar structure | Medium — must emit two tags | Low — one tag |
| Skills without facets | Works — skill-level only | Works — no FACET_UPDATE emitted | Breaks — no format for skill-only |
| Redundancy | Some — skill + facets in same block | More — skill + facets in separate blocks | None — single source of truth |
| Error resilience | Good — if facet lines malformed, skill line still works | Good — if one tag missing, other still works | Poor — no fallback |

### Recommendation: Option A (Facet sub-lines under SKILL_UPDATE)

**Rationale:**

1. **Single emission point.** The AI already reliably emits `[SKILL_UPDATE]`. Adding facet sub-lines within the same block is a lower cognitive burden than requiring a second tag. LLMs are better at extending a known pattern than learning a new one.

2. **Graceful degradation.** If the AI emits only the skill-level line (as it does today), the existing parser handles it. If facet lines are malformed, the skill-level line still provides a usable rating. Option C has no fallback — if parsing fails, no rating is recorded.

3. **Backward compatibility for skills without facets.** When the context has no FACETS section, the AI emits the existing format. No code path change.

4. **Consistent with existing parser architecture.** `parseSkillUpdates` already parses multi-line content within `[SKILL_UPDATE]` blocks. Adding indent-based sub-line parsing is a ~15-line addition, not a rewrite.

**Tradeoff acknowledged:** Indentation-based parsing can be fragile with LLM output. Mitigation: accept both `  ` (2-space indent) and `\t` as facet line markers. Also accept `>` prefix as alternate marker (common LLM formatting habit).

### Exact Format Specification

```
[SKILL_UPDATE]
concept-key: good | Student applied power rule to composite functions | context:guided
  facet-key-1: easy | Differentiated x^n cold | context:diagnostic
  facet-key-2: good | Applied chain rule after one hint | context:guided
  facet-key-3: hard | Struggled with fractional exponents, needed scaffolding | context:scaffolded
another-skill: good | reason | context:diagnostic
[/SKILL_UPDATE]
```

**Rules:**
- Lines starting with alphanumeric char = skill-level rating (existing format)
- Lines starting with whitespace or `>` = facet rating belonging to the preceding skill
- Facet lines use the same `key: rating | reason | context:tag` format
- Facet lines inherit the parent skill's `source` (always `'tutor'` from chat)
- A skill-level line MUST precede its facet sub-lines
- Facet sub-lines are optional — the skill may have facets in the DB but the AI only rates some of them
- `criteria:text` tag remains supported on both skill and facet lines

---

## 4. `parseSkillUpdates` Modification

### Current Behavior (lines 1426–1464)

1. Extract content between `[SKILL_UPDATE]...[/SKILL_UPDATE]`
2. Split into lines
3. Parse each line as `concept-key: rating | reason | context:tag`
4. Return `Array<{ skillId, rating, reason, context, criteria, source }>`

### Modified Behavior

1. Same extraction
2. Split into lines
3. For each line:
   - If starts with `\s+` or `>`: parse as facet update, attach to preceding skill
   - Else: parse as skill-level update (existing logic)
4. Return `Array<SkillUpdate>` where:

```typescript
// Conceptual shape (JS — no actual TypeScript)
{
  skillId: string,          // concept-key
  rating: string,           // struggled|hard|good|easy
  reason: string,
  context: string,          // diagnostic|transfer|corrected|guided|scaffolded|explained
  criteria: string | null,
  source: string,           // 'tutor'
  facets: Array<{           // NEW — optional, empty array if no facet lines
    facetKey: string,       // facet concept-key
    rating: string,
    reason: string,
    context: string,
    criteria: string | null,
  }>
}
```

### Implementation Sketch

```js
export const parseSkillUpdates = (response) => {
  const match = response.match(/\[SKILL_UPDATE\]([\s\S]*?)\[\/SKILL_UPDATE\]/);
  if (!match) return [];
  const updates = [];
  var currentSkill = null;
  const lines = match[1].trim().split("\n");

  for (const line of lines) {
    // Check if this is a facet sub-line (indented or > prefixed)
    var facetMatch = line.match(/^(?:\s+|>)\s*([\w-]+):\s*(struggled|hard|good|easy)\s*\|?\s*(.*)/i);
    if (facetMatch && currentSkill) {
      var fReason = facetMatch[3].trim();
      var fContext = 'guided';
      var fCriteria = null;
      // Extract context:tag
      var fCtxMatch = fReason.match(/\|?\s*context:(diagnostic|transfer|corrected|guided|scaffolded|explained)\b/i);
      if (fCtxMatch) { fContext = fCtxMatch[1].toLowerCase(); fReason = fReason.replace(fCtxMatch[0], '').trim(); }
      // Extract criteria:text
      var fCritMatch = fReason.match(/\|?\s*criteria:(.+?)(?:\||$)/);
      if (fCritMatch) { fCriteria = fCritMatch[1].trim(); fReason = fReason.replace(fCritMatch[0], '').trim(); }
      fReason = fReason.replace(/\|\s*$/, '').trim();
      currentSkill.facets.push({ facetKey: facetMatch[1], rating: facetMatch[2].toLowerCase(), reason: fReason, context: fContext, criteria: fCriteria });
      continue;
    }

    // Skill-level line (existing parsing)
    var m = line.match(/^([\w-]+):\s*(struggled|hard|good|easy)\s*\|?\s*(.*)/i);
    if (m) {
      var reason = m[3].trim();
      var context = 'guided';
      var criteria = null;
      var ctxMatch = reason.match(/\|?\s*context:(diagnostic|transfer|corrected|guided|scaffolded|explained)\b/i);
      if (ctxMatch) { context = ctxMatch[1].toLowerCase(); reason = reason.replace(ctxMatch[0], '').trim(); }
      var critMatch = reason.match(/\|?\s*criteria:(.+?)(?:\||$)/);
      if (critMatch) { criteria = critMatch[1].trim(); reason = reason.replace(critMatch[0], '').trim(); }
      reason = reason.replace(/\|\s*$/, '').trim();
      currentSkill = { skillId: m[1], rating: m[2].toLowerCase(), reason, context, criteria, source: 'tutor', facets: [] };
      updates.push(currentSkill);
      continue;
    }

    // Legacy format fallback
    m = line.match(/^([\w-]+):\s*\+(\d+)\s*(?:points?)?\s*\|?\s*(.*)/);
    if (m) {
      var pts = parseInt(m[2]);
      var rating = pts >= 5 ? "easy" : pts >= 3 ? "good" : pts >= 2 ? "hard" : "struggled";
      currentSkill = { skillId: m[1], rating, reason: m[3].trim(), context: 'guided', criteria: null, source: 'tutor', facets: [] };
      updates.push(currentSkill);
    }
  }
  return updates;
};
```

### Backward Compatibility

- Updates without facet sub-lines: `facets` is `[]`. All downstream code that only reads `skillId`, `rating`, etc. is unaffected.
- `PracticeMode` (line 287) constructs updates manually without `facets` field: will be `undefined`. The modified `applySkillUpdates` must treat `undefined` / `[]` equivalently → uniform distribution (existing behavior).
- `sendMessage` notification loop (line 1048): reads `u.skillId` and `u.rating` — unaffected by new `facets` field.
- `sessionSkillLog.current.push(...updates)` (line 1047): logs gain `facets` field — no harm, used only for `generateSessionEntry` which reads `skillId` and `rating`.

---

## 5. `applySkillUpdates` Modification

### Current Behavior (lines 244–544)

For each update:
1. Load facets for the skill
2. If facets exist: apply the **same rating** to **every facet** uniformly
3. If no facets: apply to skill-level mastery directly
4. After facets: compute skill-level aggregate from facet results

### Modified Behavior

For each update:
1. Load facets for the skill
2. If `update.facets` has entries AND facets exist in DB:
   - **Route each facet update to its specific facet** based on `facetKey` match
   - Facets not mentioned in the update: **skip** (no change to their mastery)
   - Facets mentioned but not found in DB: **skip** (graceful degradation)
   - Each matched facet gets its own `grade = mapRating(facetUpdate.rating)` and `context/source` for weight calculation
3. Else if facets exist but no `update.facets` (skill-level only): **uniform distribution** (existing behavior, backward compat)
4. Else (no facets in DB): **skill-level fallback** (existing behavior)
5. After all facet writes: compute skill-level aggregate (existing aggregation logic)
6. **NEW:** Check mastery threshold for affected skills → emit `MasteryEvent` if triggered

### Return Type Change

**Current:** `void` (implicit)
**New:** Returns `Array<MasteryEvent>`

```js
export const applySkillUpdates = async (courseId, updates, intentWeight) => {
  // ... existing setup ...
  var masteryEvents = [];

  for (var u of updates) {
    // ... existing weight computation ...
    // ... existing facet loading ...

    if (facets.length > 0) {
      var facetUpdates = u.facets || [];
      var facetResults = [];

      if (facetUpdates.length > 0) {
        // === PER-FACET ROUTING (NEW) ===
        for (var fu of facetUpdates) {
          // Resolve facet by concept_key
          var facet = facets.find(f => f.concept_key === fu.facetKey);
          if (!facet) continue; // facet key not found — skip

          var fGrade = mapRating(fu.rating);
          var fContext = fu.context || u.context || 'guided';
          var fContextMult = CONTEXT_MULTIPLIERS[fContext] || 1.0;
          var fSourceWeight = u.source === 'practice' ? 1.0 : (TUTOR_SOURCE_WEIGHTS[fContext] || 0.6);

          // ... existing FSRS transition logic per facet ...
          // ... existing concept link transfer logic per facet ...
          // ... existing weighted points per facet ...
          // ... FacetMastery.upsert() ...

          facetResults.push({ /* same shape as current */ });
        }

        // For unmentioned facets: load their existing mastery for aggregate
        for (var facet of facets) {
          if (!facetUpdates.some(fu => fu.facetKey === facet.concept_key)) {
            var existingFM = await FacetMastery.get(facet.id);
            if (existingFM) {
              facetResults.push({
                retrievability: currentRetrievability({ stability: existingFM.stability, lastReviewAt: existingFM.last_review_at }),
                stability: existingFM.stability,
                difficulty: existingFM.difficulty,
                reps: existingFM.reps,
                lapses: existingFM.lapses,
                lastReviewAt: existingFM.last_review_at,
                nextReviewAt: existingFM.next_review_at,
                totalMasteryPoints: existingFM.total_mastery_points,
              });
            }
          }
        }
      } else {
        // === UNIFORM DISTRIBUTION (existing behavior) ===
        // ... existing code that applies same rating to all facets ...
      }

      // --- Compute skill-level aggregate (existing logic, unchanged) ---
      if (facetResults.length > 0) {
        // ... existing aggregation: avg retrievability, min stability, etc. ...
        // ... Mastery.upsert() ...
      }

      // --- Mastery threshold check (NEW) ---
      var masteryEvent = await checkMasteryThreshold(u.skillId, facets, allSkills);
      if (masteryEvent) masteryEvents.push(masteryEvent);
    } else {
      // === SKILL-LEVEL FALLBACK (existing, unchanged) ===
    }

    // ... existing fitness counter updates ...
    // ... existing mastery criteria verification ...
  }

  return masteryEvents;
};
```

### Per-Facet Routing: Key Differences from Uniform Distribution

| Aspect | Uniform (current) | Per-facet (new) |
|---|---|---|
| Grade | Same `mapRating(u.rating)` for all | `mapRating(fu.rating)` per facet |
| Context multiplier | Shared from skill-level `u.context` | Per-facet `fu.context` |
| Source weight | Shared from `u.source` | Inherited from `u.source` (always same within one update) |
| Blooms multiplier | From skill's `blooms_level` | Could use facet's `blooms_level` if set, else skill's |
| Decay bonus | Shared | Shared (session-level, not facet-level) |
| Intent weight | Shared | Shared |
| Which facets | All | Only facets mentioned in `update.facets` |

### Aggregate Computation with Partial Updates

When per-facet routing applies to only some facets, the aggregate must include **all** facets, not just the updated ones. For unmentioned facets, load their existing `FacetMastery` records and include in the aggregate calculation. This ensures the skill-level mastery stays consistent with the full facet picture.

If an unmentioned facet has no mastery record at all (never assessed), exclude it from the aggregate — it doesn't contribute positively or negatively. This prevents a single unassessed facet from dragging down the aggregate retrievability.

### Call Sites Impacted by Return Type Change

1. **`sendMessage`** (StudyContext.jsx line 1046): Currently ignores return value (`await applySkillUpdates(...)`). Must capture: `var masteryEvents = await applySkillUpdates(...)`. No breaking change.

2. **`PracticeMode`** (PracticeMode.jsx line 287): Currently ignores return value. No breaking change — will return `[]` since practice updates don't include `facets` and uniform distribution rarely triggers mastery.

---

## 6. Mastery Threshold Detection: `checkMasteryThreshold()`

### Purpose

After updating facet mastery, check if all facets of a skill now meet the mastery threshold — if so, and if this is the first time, emit a `MasteryEvent`.

### Signature

```js
// In src/lib/study.js (private helper, not exported)
const checkMasteryThreshold = async (skillId, facets, allSkills) => { ... }
```

### Algorithm

```
1. Load all facet mastery records for the skill:
   facetIds = facets.map(f => f.id)
   masteryRows = await FacetMastery.getByFacets(facetIds)

2. Check mastery conditions:
   a. EVERY facet must have a mastery record (all assessed at least once)
   b. EVERY facet's last_rating must be "good" or "easy"

   If either condition fails → return null (not mastered)

3. Check if this is a NEW mastery event:
   a. Resolve the skill from allSkills
   b. Compute levelBefore from existing mastery points
   c. If the skill was ALREADY at this mastery level before this session's updates → return null
      (Prevents re-firing mastery events on subsequent updates to an already-mastered skill)

   Implementation: Check if a mastery event was already emitted for this skill
   in the current session. This requires a session-level Set tracked in the caller
   (applySkillUpdates receives a `sessionMasteredSkills` Set parameter).

4. If new mastery event:
   a. Compute levelAfter from updated mastery points
   b. Compute nextReviewDays from min facet stability
   c. Return MasteryEvent
```

### Mastery Threshold Values (from Research)

- **Celebration trigger:** All facets have `last_rating` of `"good"` or `"easy"` at least once
- **Ongoing mastery status (profile/curriculum):** `retrievability >= 0.7` — handled by existing `computeFacetReadiness()`
- **Review trigger:** `retrievability < 0.5` — handled by existing scheduling

The celebration check uses `last_rating` rather than retrievability because (per research): "the threshold should be based on initial demonstration quality, not long-term retention — because long-term retention hasn't been tested yet."

### Level Computation

The mastery event needs `levelBefore` and `levelAfter`. Currently, skill "level" is not explicitly tracked as a single field. It's derived from `total_mastery_points`:

```js
// Level thresholds (from existing SubSkills / mastery points logic)
const pointsToLevel = (pts) => {
  if (pts >= 100) return 5;
  if (pts >= 60) return 4;
  if (pts >= 30) return 3;
  if (pts >= 10) return 2;
  if (pts > 0) return 1;
  return 0;
};
```

`levelBefore`: computed from the skill's `total_mastery_points` BEFORE the current batch of updates.
`levelAfter`: computed from the skill's `total_mastery_points` AFTER the current batch.

**Important:** `applySkillUpdates` must capture `total_mastery_points` before writing to compute `levelBefore`. Currently it reads `existing.total_mastery_points` early (line 273) — this can be stored.

---

## 7. `MasteryEvent` Data Structure

```js
{
  skillId: number,                // sub_skills.id
  skillName: string,              // resolved from allSkills
  conceptKey: string,             // sub_skills.concept_key
  facets: [
    {
      id: number,                 // facets.id
      name: string,               // facets.name
      rating: string,             // last_rating after update
      isNew: boolean,             // true if this was the first assessment (no prior mastery record)
    },
  ],
  levelBefore: number,            // 0-5
  levelAfter: number,             // 0-5
  nextReviewDays: number,         // Math.ceil(minStability) across all facets
  messageIndex: number | null,    // set by sendMessage after applySkillUpdates returns
  timestamp: number,              // Date.now()
}
```

### `isNew` Flag

Required by Step 2 UX design for the FacetPills component: determines whether to show "NEW" tag vs. mini dots on the facet pill. Computed in `applySkillUpdates`: `isNew = !fExisting` (no prior FacetMastery record before this update).

### `nextReviewDays`

Computed from the minimum `stability` across all facets of the skill after the update. Stability = days for retrievability to drop to 0.9. This gives the earliest point at which any facet would need review.

```js
var minStability = Math.min(...facetMasteryRows.map(fm => fm.stability));
var nextReviewDays = Math.ceil(minStability);
```

### `messageIndex`

Not set by `applySkillUpdates` — set by `sendMessage` after receiving the events. This is the index in the `msgs` array where the MasteryCard should be rendered (after the assistant message that triggered the mastery).

---

## 8. Session Mastery Aggregator

### Session-Level State

In `StudyContext.jsx`, add:

```js
const sessionMasteryEvents = useRef([]);    // accumulates MasteryEvent objects
const sessionFacetUpdates = useRef([]);     // accumulates per-facet update records
const sessionMasteredSkills = useRef(new Set()); // prevents duplicate mastery events
```

Reset in `enterStudy()` alongside existing session state resets.

### sendMessage Integration

```js
// After line 1046 (applySkillUpdates call):
var masteryEvents = await applySkillUpdates(active.id, updates, intentWeight, sessionMasteredSkills.current);

// Accumulate facet-level updates for session summary
for (var u of updates) {
  if (u.facets && u.facets.length > 0) {
    for (var fu of u.facets) {
      sessionFacetUpdates.current.push({
        facetKey: fu.facetKey,
        facetName: null, // resolved at summary time
        skillId: u.skillId,
        rating: fu.rating,
      });
    }
  }
}

// Handle mastery events
if (masteryEvents.length > 0) {
  for (var me of masteryEvents) {
    me.messageIndex = msgs.length; // index of the assistant message that triggered it
    sessionMasteryEvents.current.push(me);
    sessionMasteredSkills.current.add(me.skillId);
    addNotif("mastery", me.skillName + " → Lv " + me.levelAfter);
  }
}

// Existing notification loop for regular skill updates (line 1048):
for (var u of updates) {
  // Only emit regular notification if this skill did NOT trigger mastery
  if (!masteryEvents.some(me => me.skillId === u.skillId || me.conceptKey === u.skillId)) {
    addNotif("skill", u.skillId + ": " + u.rating + (u.context !== 'guided' ? " (" + u.context + ")" : ""));
  }
}
```

### Session Summary Enhancement

In `generateSessionEntry` (or in the StudyContext session-end handler), include mastery data:

```js
// Enhanced session entry fields
{
  ...existingFields,
  masteryEvents: sessionMasteryEvents.current.map(me => ({
    skillName: me.skillName,
    levelBefore: me.levelBefore,
    levelAfter: me.levelAfter,
    facetCount: me.facets.length,
  })),
  facetsAssessed: sessionFacetUpdates.current.length,
}
```

### SessionSummary Component Data

The SessionSummary component needs access to:

```js
// Exposed via useStudy() context value
sessionMasteryEvents: sessionMasteryEvents.current,
sessionFacetUpdates: sessionFacetUpdates.current,
```

Or computed at session exit and passed as part of the session summary object.

### MessageList MasteryCard Rendering

MessageList needs access to `sessionMasteryEvents` to render inline MasteryCard components:

```jsx
{msgs.map((m, i) => {
  // ... existing message rendering ...

  // After each assistant message, check for mastery events keyed to this index
  {sessionMasteryEvents.filter(me => me.messageIndex === i).map((me, mi) => (
    <MasteryCard key={"mastery-" + mi} event={me} />
  ))}
})}
```

### `sessionMasteredSkills` Set — Preventing Duplicate Events

Passed to `applySkillUpdates` as a parameter (or checked within `checkMasteryThreshold`). If a skill's ID is already in the set, `checkMasteryThreshold` returns `null` even if the threshold is still met. This prevents:
- Multiple mastery events for the same skill in one session (e.g., if the student continues to get "good" ratings after already mastering the skill)
- Re-celebrating on context rebuild cycles

---

## 9. Data Flow Summary

```
User sends message
│
├─ buildFocusedContext
│   ├─ FOCUS SKILL / REQUIRED SKILLS (existing)
│   ├─ buildFacetAssessmentBlock() ← NEW: injects facet IDs + mastery state
│   └─ SOURCE MATERIAL (existing)
│
├─ buildSystemPrompt
│   ├─ SKILL STRENGTH TRACKING (existing)
│   ├─ FACET-LEVEL ASSESSMENT ← NEW: format instructions
│   └─ ASSESSMENT PROTOCOL ← NEW: stealth assessment instructions
│
├─ callClaudeStream → AI response with [SKILL_UPDATE] containing facet sub-lines
│
├─ parseSkillUpdates ← MODIFIED: extracts facet sub-lines into update.facets[]
│
├─ applySkillUpdates ← MODIFIED: per-facet FSRS routing + mastery detection
│   ├─ Per-facet: FacetMastery.upsert() with individual rating/context
│   ├─ Skill aggregate: Mastery.upsert() from all facet states
│   ├─ checkMasteryThreshold() → MasteryEvent or null
│   └─ Returns Array<MasteryEvent>
│
├─ sendMessage handler
│   ├─ Accumulates masteryEvents in sessionMasteryEvents ref
│   ├─ Accumulates facet updates in sessionFacetUpdates ref
│   ├─ Notif: "mastery" type for mastery events, "skill" for regular
│   └─ Sets me.messageIndex for MasteryCard placement
│
├─ MessageList renders
│   ├─ Enhanced FacetPills below assistant messages (from parsed updates)
│   └─ MasteryCard inline after triggering message
│
└─ Session exit
    ├─ SessionSummary displays masteryEvents + facetsAssessed
    └─ generateSessionEntry logs mastery data to journal
```

---

## 10. Edge Cases and Guardrails

### 1. AI emits facet keys not found in DB
**Behavior:** Skip the unrecognized facet key silently. Log to console for debugging. The skill-level rating still applies as the overall assessment.

### 2. AI emits facet updates without a preceding skill-level line
**Behavior:** Parser ignores orphan facet lines (no `currentSkill` to attach to). This is invalid format — the AI was instructed to include the skill line.

### 3. Skill has facets in DB but AI emits skill-level only (no facet sub-lines)
**Behavior:** Uniform distribution (existing behavior). `update.facets` is `[]`, code falls through to the existing loop.

### 4. AI rates same facet multiple times in one response
**Behavior:** Later rating overwrites earlier (sequential processing). In practice, this shouldn't happen — the AI rates facets once per exchange.

### 5. PracticeMode calls applySkillUpdates without `facets` field
**Behavior:** `u.facets` is `undefined`, treated as `[]` → uniform distribution. PracticeMode constructs updates manually and doesn't know about facets.

### 6. Mastery event fires but level doesn't change
**Behavior:** `levelBefore === levelAfter`. The MasteryEvent is still emitted (all facets demonstrated is the achievement, not the level change). The MasteryCard can conditionally omit the `Lv N → M` line if unchanged, showing just the facet checklist.

### 7. Student revisits a mastered skill in a later session
**Behavior:** `sessionMasteredSkills` is fresh each session. If the skill already has all facets rated "good"+, `checkMasteryThreshold` checks whether this is a NEW transition by comparing the facet mastery state before the current update. If all facets already had "good"+ `last_rating` before this session's updates, no mastery event fires.

Implementation: store `preMasteryState` (snapshot of all facet `last_rating` values) before applying updates. After updates, check if any facet transitioned from non-mastered to mastered.

### 8. Skill with a single facet
**Behavior:** One facet rated "good"+ → mastery event fires. This is correct — the skill has one atomic component and the student demonstrated it.

### 9. Token budget exceeded (many skills with many facets)
**Behavior:** `buildFacetAssessmentBlock` caps at 3 skills. Remaining skills are listed as "rate by skill-level." This is the explicit truncation mechanism.

---

## 11. Implementation Order for Steps 4–6

### Step 4 (Context + Prompt):
1. Implement `buildFacetAssessmentBlock()` — new function, no existing code changed
2. Inject into `buildFocusedContext` — two insertion points
3. Add system prompt sections — string concatenation in `buildSystemPrompt`
4. Verify: run app, check that facet blocks appear in context for skills with facets

### Step 5 (Parsing + FSRS + Mastery):
1. Modify `parseSkillUpdates` — extend line parsing with facet sub-line detection
2. Modify `applySkillUpdates` — add per-facet routing branch + mastery threshold check
3. Add `checkMasteryThreshold` helper
4. Modify `sendMessage` — capture masteryEvents, add session refs, update notifications
5. Verify: manually test with mock AI responses containing facet sub-lines

### Step 6 (UI):
1. Create `FacetPills` component (or extend MessageList inline)
2. Create `MasteryCard` component
3. Modify `SessionSummary` — add mastery section, facets assessed, what's next
4. Wire `sessionMasteryEvents` through context to MessageList and SessionSummary
5. Verify: full teaching flow end-to-end

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** Step 3
**Status:** Complete

### What Was Done
Designed the complete facet assessment pipeline architecture across 6 subsystems: context builder helper (`buildFacetAssessmentBlock`), system prompt additions (FACET-LEVEL ASSESSMENT + ASSESSMENT PROTOCOL), `parseSkillUpdates` modification for facet sub-line parsing, `applySkillUpdates` modification for per-facet FSRS routing and mastery detection, `MasteryEvent` data structure, and session mastery aggregator.

### Files Deposited
- `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md` — Complete architecture blueprint with data flow, edge cases, implementation sketches, and integration points

### Files Created or Modified (Code)
- None (architecture only)

### Decisions Made
- **Option A recommended** for SKILL_UPDATE format (facet sub-lines under existing tag) — rationale: single emission point for AI, graceful degradation, backward compatible, minimal parser change. Tradeoffs documented.
- **Mastery threshold = all facets rated "good"+ at least once** — per research recommendation, using `last_rating` check not retrievability
- **Per-facet routing only when AI provides facet data** — uniform distribution preserved as fallback for backward compatibility
- **`applySkillUpdates` returns `Array<MasteryEvent>`** — non-breaking change (callers currently ignore return value)
- **`sessionMasteredSkills` Set** — prevents duplicate mastery events within a session
- **Facet context capped at 3 skills** — token budget guardrail (~400-600 tokens worst case)
- **System prompt additions ~910 chars** — slightly over 800 char constraint but justified by critical importance of assessment protocol instructions

### Flags for CEO
- **SKILL_UPDATE format (Option A vs B vs C):** Option A recommended (facet sub-lines). See Section 3 comparison table. CEO should approve or choose alternative.
- **System prompt length:** Additions are ~910 chars (constraint was 800). Can be shortened to ~750 by further trimming ASSESSMENT PROTOCOL, at risk of less clear AI behavior. CEO to approve budget.
- **Level computation from mastery points:** Currently implicit (derived from `total_mastery_points`). The `pointsToLevel` thresholds (10/30/60/100) are not formally defined anywhere — they need CEO approval or should be extracted from existing behavior.

### Flags for Next Step
- **For Step 4 (Context + Prompt):** Implement `buildFacetAssessmentBlock` per Section 1, inject per Section 1 injection points, add system prompt text per Section 2. Do NOT modify parser or applySkillUpdates.
- **For Step 5 (Parsing + FSRS):** Implement parser modification per Section 4, applySkillUpdates per Section 5, mastery detection per Section 6. Return type changes per Section 5. Wire into sendMessage per Section 8. Do NOT modify UI components.
- **For Step 6 (UI):** Consume `sessionMasteryEvents` and `sessionFacetUpdates` refs per Section 8. MasteryEvent shape per Section 7. MasteryCard placement keyed by `messageIndex` per Section 8.
