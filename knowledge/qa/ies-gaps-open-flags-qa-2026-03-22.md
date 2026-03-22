# IES Gaps + Open Flags — QA Report
**Date:** 2026-03-22 | **Agent:** Study Security & Testing Analyst | **Step:** 3

**Blueprint reference:** `knowledge/architecture/ies-gaps-open-flags-blueprint-2026-03-22.md`

---

## Area 1: Gap Identification Prompt (A1) — PASS

**What was tested:** GAP TARGETING section exists in `buildSystemPrompt()` after PRE-QUESTION PHASE.

**Expected:** Instruction present with correct scoping, 2-3 sentences max, escape clause for equal strengths.

**Actual:**

The GAP TARGETING section is present in the system prompt string at `src/lib/study.js:1635`. Section order verified:

| # | Section | Status |
|---|---------|--------|
| ... | PRE-QUESTION PHASE | Existing |
| **NEW** | **GAP TARGETING** | **Added** |
| ... | YOUR TEACHING METHOD | Existing |

Full text of added section:
```
GAP TARGETING:

After your pre-question, briefly note which skill area appears weakest based on the mastery
data in context -- e.g., "I notice your strength in [X] is lower than the rest. Want to focus
there?" This gives the student agency over gap targeting. One sentence, not a lecture about
their weaknesses. If all skills are roughly equal, skip this.
```

**Verification checklist:**
- [x] Section exists after PRE-QUESTION PHASE, before TEACHING METHOD
- [x] 3 sentences — within 2-3 sentence budget
- [x] Escape clause present: "If all skills are roughly equal, skip this"
- [x] No scoping logic in code — self-scoping via data availability (skill strengths only in context for skill/assignment sessions)
- [x] No changes to `applySkillUpdates`, `buildFocusedContext`, or any data logic

**Severity:** N/A — PASS.

---

## Area 2: PracticeMode Mastery Events (A2) — PASS

**What was tested:** `applySkillUpdates()` return value captured in PracticeMode.jsx, mastery events wired to session refs + notification.

**Expected:** Wiring complete, no dropped events.

**Actual:**

PracticeMode.jsx changes verified:

1. **useStudy() destructure** (line 40): `sessionMasteryEvents, sessionMasteredSkills` added. Both are exposed in StudyContext value (confirmed at StudyContext.jsx:1586).

2. **Return value captured** (line 321): `var masteryResult = await applySkillUpdates(...) || [];` — the `|| []` fallback prevents null reference if applySkillUpdates returns undefined.

3. **Mastery events wired** (lines 329-337):
```javascript
if (masteryResult.length > 0) {
  for (var me of masteryResult) {
    me.messageIndex = -1;
    sessionMasteryEvents.current.push(me);
    sessionMasteredSkills.current.add(me.skillId);
    addNotif("mastery", me.skillName + " → Lv " + me.levelAfter);
  }
}
```

**Wiring analysis:**
- `me.messageIndex = -1` — correctly marks as practice-origin. MessageList's filter (`me.messageIndex === i`) will never match -1, so no orphaned inline cards.
- `sessionMasteryEvents.current.push(me)` — events accumulate in the ref, captured by SessionSummary via `sessionMasteryEvents.current.slice()`.
- `sessionMasteredSkills.current.add(me.skillId)` — prevents duplicate mastery notifications for the same skill if the student continues practicing.
- `addNotif("mastery", ...)` — triggers toast notification immediately.

**Event flow verified:** Practice tier completion → `applySkillUpdates` → mastery events returned → pushed to session refs → toast notification fires → events appear in SessionSummary when student exits.

**Severity:** N/A — PASS.

---

## Area 3: Level Decrease Display Guard (A3) — PASS

**What was tested:** `levelAfter` clamped to `max(levelAfter, levelBefore)` for display in MessageList.jsx and SessionSummary.jsx.

**Expected:** Guard present, data untouched.

**Actual:**

1. **MessageList.jsx** (line 273):
```jsx
{(() => { var displayLevel = Math.max(me.levelAfter, me.levelBefore); return me.levelBefore !== displayLevel ? (
  <div ...>
    <span ...>Lv {me.levelBefore}</span>
    <span ...>→</span>
    <span ...>Lv {displayLevel}</span>
  </div>
) : null; })()}
```

2. **SessionSummary.jsx** (line 76):
```jsx
{(() => { var displayLevel = Math.max(me.levelAfter, me.levelBefore); return me.levelBefore !== displayLevel ? (
  <span ...>Lv {me.levelBefore}→{displayLevel}</span>
) : null; })()}
```

**Guard analysis:**
- If `levelAfter >= levelBefore` (normal case): `displayLevel = levelAfter`. Condition `levelBefore !== displayLevel` is true when levels differ → shows level transition. Unchanged behavior.
- If `levelAfter < levelBefore` (edge case): `displayLevel = levelBefore`. Condition `levelBefore !== displayLevel` is false → level transition hidden entirely. Correct — no confusing "Lv 3 → Lv 2" display.
- If `levelAfter === levelBefore`: `displayLevel = levelBefore`. Condition false → hidden. Same as original behavior.

**Data integrity:** `git diff HEAD~3 -- src/lib/study.js` shows only the prompt string change. The `masteryEvents.push({...levelBefore, levelAfter...})` at study.js:594-595 is untouched. The `me.levelAfter` field retains its true computed value on the data object.

**Severity:** N/A — PASS.

---

## Area 4: Calibration Tracking (B1) — PASS

**What was tested:** `computeCalibration()` function, calibration computation in tier completion handler, calibration display in tier completion UI.

**Expected:** Calibration result computed and displayed after tier completion. Formula matches blueprint.

**Actual:**

1. **`computeCalibration` function** (PracticeMode.jsx:23-33):
```javascript
function computeCalibration(problems) {
  var rated = problems.filter(function(p) { return p.confidenceRating !== null && p.passed !== null; });
  if (rated.length < 3) return { tendency: "insufficient", sampleSize: rated.length, score: null };
  var deltas = rated.map(function(p) { return ((p.confidenceRating - 1) / 4) - (p.passed ? 1 : 0); });
  var avgDelta = deltas.reduce(function(s, d) { return s + d; }, 0) / deltas.length;
  var tendency;
  if (avgDelta > 0.15) tendency = "overconfident";
  else if (avgDelta < -0.15) tendency = "underconfident";
  else tendency = "well-calibrated";
  return { tendency: tendency, sampleSize: rated.length, score: Math.round(avgDelta * 100) / 100 };
}
```

**Formula verification:**
- Confidence normalized: `(rating - 1) / 4` maps 1→0, 2→0.25, 3→0.5, 4→0.75, 5→1.0. CORRECT.
- Passed normalized: `passed ? 1 : 0`. CORRECT.
- Delta = normalizedConfidence - normalizedResult. Positive = overconfident, negative = underconfident. CORRECT.
- Threshold 0.15 matches blueprint. CORRECT.
- `< 3` sample minimum matches blueprint. CORRECT.

**Scenario tests:**
- Student rates 5/5 confidence, fails all 5: delta = (1.0 - 0) = 1.0 → "overconfident". CORRECT.
- Student rates 1/5 confidence, passes all 5: delta = (0 - 1) = -1.0 → "underconfident". CORRECT.
- Student rates 3/5, passes 3/5: avg delta ≈ 0.1 → "well-calibrated". CORRECT.
- Only 2 rated problems: returns "insufficient". CORRECT.

2. **Computation in handler** (line 348-349):
```javascript
var calibration = computeCalibration(attempt.problems);
```
Called after `completeTierAttempt` and mastery wiring, before setTimeout. CORRECT — uses final problem states.

3. **Storage on tierComplete** (line 355):
```javascript
tierComplete: { ...tierResult, problems: attempt.problems, calibration: calibration }
```
CORRECT — calibration available to render.

4. **Display** (lines 112-122):
```jsx
{pm.tierComplete.calibration && pm.tierComplete.calibration.tendency !== "insufficient" && (
  <div style={{ ... }}>
    <span style={{ fontWeight: 600 }}>Calibration: </span>
    {pm.tierComplete.calibration.tendency === "well-calibrated"
      ? "Your confidence matched your performance. Good self-awareness."
      : pm.tierComplete.calibration.tendency === "overconfident"
        ? "You tended to rate higher confidence than your results showed. Notice which topics feel solid vs. actually are."
        : "You underestimated yourself -- you did better than expected. Trust your preparation more."}
  </div>
)}
```
- Hidden for "insufficient" (< 3 rated). CORRECT.
- Position: after problem results, before action button. CORRECT per blueprint.
- Phrasing is constructive, not demoralizing. CORRECT.

**Severity:** N/A — PASS.

---

## Area 5: Review Mode (B2) — PASS

**What was tested:** Blueprint decision implemented.

**Expected:** No new study mode added. Decision documented.

**Actual:**

- No new mode added to `selectMode()` in StudyContext.jsx (modes remain: assignment, skills, exam).
- No new card added to CourseHomepage.jsx (cards remain: 6).
- Blueprint documents rationale: "Close this gap as 'addressed by existing DUE badges and system prompt ASSESSMENT PROTOCOL.'"

**Severity:** N/A — PASS.

---

## Area 6: FSRS Integrity — PASS

**What was tested:** `fsrs.js` unchanged.

**Expected:** No diff.

**Actual:** `git diff HEAD~3 -- src/lib/fsrs.js` produces empty output. File completely unchanged across all commits in this batch.

**Severity:** N/A — PASS.

---

## Area 7: Build Verification — PASS

**What was tested:** `npx vite build --mode development`.

**Expected:** Builds without errors.

**Actual:** 185 modules transformed, built in 1.83s. No errors. PASS.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Gap identification prompt (A1) | PASS | GAP TARGETING section in correct position, 3 sentences, escape clause |
| PracticeMode mastery events (A2) | PASS | Return captured, events wired to refs + notification, messageIndex=-1 |
| Level decrease display guard (A3) | PASS | Math.max clamp in MessageList + SessionSummary, data untouched |
| Calibration tracking (B1) | PASS | Formula correct (0.15 threshold), 3-sample minimum, constructive phrasing |
| Review mode (B2) | PASS | No new mode — gap closed per blueprint decision |
| FSRS integrity | PASS | fsrs.js unchanged |
| Build verification | PASS | 185 modules, 1.83s |

**Result: 7/7 areas PASS. All blueprint acceptance criteria verified.**

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** 3
**Status:** Complete

### What Was Done
Full QA verification of IES gaps + open flags batch across all 7 areas (5 changes + FSRS integrity + build). All areas pass.

### Files Deposited
- `study/knowledge/qa/ies-gaps-open-flags-qa-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (QA only)

### Decisions Made
- None

### Flags for CEO
- None

### Flags for Next Step
- Step 4 (UXV) validates tone of gap identification, mastery celebration in practice context, level guard honesty, calibration phrasing, and metacognitive overhead assessment.
