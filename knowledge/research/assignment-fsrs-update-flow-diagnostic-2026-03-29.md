# Assignment Mode FSRS Update Flow — Diagnostic Findings
**Date:** 2026-03-29

---

## Q1: Is `parseSkillUpdates()` called during assignment mode?

**YES — no mode guard.** In `sendMessage()` (StudyContext.jsx:1309), `parseSkillUpdates(response)` is called unconditionally after every AI response, regardless of `sessionMode`. If updates are found, `applySkillUpdates()` is called at line 1313 with a mode-specific `intentWeight`:

```js
// StudyContext.jsx:1309-1313
const updates = parseSkillUpdates(response);
if (updates.length) {
  var intentWeights = { assignment: 1.0, exam: 0.8, skills: 1.0 };
  var intentWeight = intentWeights[sessionMode] || 1.0;
  var newMasteryEvents = await applySkillUpdates(active.id, updates, intentWeight, sessionMasteredSkills.current, chatSessionId.current, contextChunkIds) || [];
```

**Code path**: `callClaudeStream` (line 1304) → response string → `parseSkillUpdates(response)` (line 1309) → `applySkillUpdates(...)` (line 1313). No conditional branches exclude assignment mode.

---

## Q2: Does `applySkillUpdates()` write FSRS mastery to DB during assignment mode?

**YES — no mode guard in `applySkillUpdates`.** The function (study.js:244) accepts `courseId`, `updates`, `intentWeight`, etc. — it never checks session mode. It writes unconditionally to:

- **`FacetMastery.upsert()`** (study.js:394 for per-facet routing, line 528 for uniform distribution) — writes `difficulty`, `stability`, `retrievability`, `reps`, `lapses`, `lastReviewAt`, `nextReviewAt`, `totalMasteryPoints`, `lastRating`
- **`Mastery.upsert()`** (study.js:566) — skill-level aggregate computed from facet results
- If no facets exist, falls back to skill-level FSRS at line 623+, writing only to `Mastery.upsert()` (line 688+, not shown in trace but follows same pattern)

Both paths execute for assignment mode. The `intentWeight` of `1.0` for assignment mode means full weight — no dampening.

---

## Q3: Unlock attempt flow + `computeFacetReadiness()`

When the AI emits `[UNLOCK_QUESTION]qN[/UNLOCK_QUESTION]`:

```
StudyContext.jsx:1394  →  parseQuestionUnlock(response) extracts unlockId
StudyContext.jsx:1397  →  targetQ = asgnWork.questions.find(q => q.id === unlockId)
StudyContext.jsx:1401  →  if targetQ has requiredSkills:
StudyContext.jsx:1402-1407 →  resolve skill IDs via cachedSessionCtx.current.skills
StudyContext.jsx:1410  →  computeFacetReadiness(resolvedSkillIds)   ← DB query
StudyContext.jsx:1412-1427 →  for each skill, check readiness against UNLOCK_MASTERY_THRESHOLD (0.6)
```

**`computeFacetReadiness` (study.js:770) queries the DB directly:**
```js
var sf = await Facets.getBySkill(sid);           // line 778 — facets table
var fmRows = await FacetMastery.getByFacets(facetIds);  // line 785 — facet_mastery table
```

It computes `currentRetrievability()` from the DB-stored `stability` and `last_review_at`. It does **NOT** use `cachedSessionCtx.current.skills` for mastery values — only for resolving skill IDs (line 1402-1407).

---

## Q4: Timing — mastery write vs. unlock check

**Correct ordering. Mastery is written BEFORE the unlock check.**

Sequential flow within `sendMessage()`:
```
Line 1304:       callClaudeStream → response
Line 1309-1313:  parseSkillUpdates → applySkillUpdates    ← WRITES to DB
Line 1366-1383:  cache refresh (loadSkillsV2, buildFocusedContext)
Line 1394:       parseQuestionUnlock                      ← READS from DB
Line 1410:       computeFacetReadiness                    ← READS fresh DB data
```

All operations are `await`ed sequentially. `applySkillUpdates` completes (DB writes committed) before `computeFacetReadiness` runs. **No timing issue.**

---

## Q5: Does `computeFacetReadiness` use cached or live DB data?

**Live DB data.** It calls:
- `Facets.getBySkill(sid)` — direct DB query for facet definitions
- `FacetMastery.getByFacets(facetIds)` — direct DB query for facet mastery state
- `currentRetrievability({ stability, lastReviewAt })` — pure computation on DB values

The cached `cachedSessionCtx.current.skills` is used **only** for skill ID resolution (StudyContext.jsx:1402-1407), not for mastery values. The cache IS refreshed at line 1367-1383 inside the `if (updates.length)` block, so even the ID resolution uses up-to-date skill data when updates were written.

---

## Q6: `unlockRejectionRef` — is the rejection injected into the next API call?

**YES, works correctly.**

```
SET:    StudyContext.jsx:1441  unlockRejectionRef.current = "Unlock rejected for ..."
READ:   StudyContext.jsx:1299  if (unlockRejectionRef.current) {
INJECT: StudyContext.jsx:1300    chatMsgs.push({ role: "user", content: "[SYSTEM NOTE — not from student] " + unlockRejectionRef.current });
CLEAR:  StudyContext.jsx:1301    unlockRejectionRef.current = null;
SEND:   StudyContext.jsx:1304  callClaudeStream(sysPrompt, chatMsgs, ...)
```

On the **next** `sendMessage()` call, the rejection message is injected as a user-role message with `[SYSTEM NOTE — not from student]` prefix into `chatMsgs` (after the last 40 messages are sliced). It appears right before the API call at line 1304. The ref is cleared immediately after injection so it's only sent once.

---

## Summary: The Flow is Correctly Wired

| Question | Answer |
|---|---|
| `parseSkillUpdates` called in assignment mode? | **Yes** — unconditional |
| `applySkillUpdates` writes to DB in assignment mode? | **Yes** — no mode guard |
| Timing: write before unlock check? | **Yes** — sequential awaits |
| `computeFacetReadiness` uses live DB? | **Yes** — direct queries |
| `unlockRejectionRef` injection works? | **Yes** — next sendMessage cycle |

---

## Edge Cases / Potential Issues Found

### 1. No-facets edge case (CRITICAL for unlock gate)
If a required skill has **no facets** in the `facets` table, `computeFacetReadiness` returns an empty map for that skill → `readinessMap.get(rsid)` returns `undefined` → unlock is **always rejected** with "has no mastery data yet".

This could happen if:
- Facet extraction hasn't run for the course material
- A required skill was manually created without facets
- The `facets` table doesn't exist yet (caught by try/catch, returns empty)

### 2. Partial facet mastery coverage
If a skill has facets in the DB, but **none** have been FSRS-reviewed yet (all `FacetMastery` entries have null/0 stability), then `rCount` stays 0 in `computeFacetReadiness` (study.js:797-801) and the skill gets no readiness entry → same "has no mastery data yet" rejection.

However, this is mitigated by the **uniform distribution** path in `applySkillUpdates` (study.js:457-551): when the AI provides a skill-level rating WITHOUT facet sub-lines, it writes `FacetMastery.upsert()` for ALL facets with the same rating. So after the first `[SKILL_UPDATE]` for a skill, all its facets get FSRS data.

### 3. AI emits UNLOCK without SKILL_UPDATE in same response
If the AI emits `[UNLOCK_QUESTION]` but no `[SKILL_UPDATE]` in the same response, the `if (updates.length)` block (lines 1310-1385) is skipped entirely. This means:
- No new mastery data is written
- The cache is NOT refreshed
- `computeFacetReadiness` still reads from DB (sees whatever was last written)
- Skill ID resolution uses the existing cache (fine — IDs don't change)

This is not a bug per se, but means the unlock gate evaluates against the mastery state from the **previous** response's updates, not any teaching that happened in this response. The AI should ideally emit both tags in the same response.

### 4. `cachedSessionCtx` not refreshed when no updates
The skill ID resolution at line 1402-1407 uses `cachedSessionCtx.current.skills`. This cache is only refreshed inside `if (updates.length)` (line 1366-1383). If a session has no skill updates yet, it uses the initial cache from session boot. This is fine for ID resolution but could miss skills added mid-session (unlikely in practice).
