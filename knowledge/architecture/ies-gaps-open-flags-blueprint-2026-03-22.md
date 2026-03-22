# IES Gaps + Open Flags — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**References:**
- IES diagnostic: `knowledge/research/ies-full-status-diagnostic-2026-03-22.md`
- PracticeMode: `src/components/study/PracticeMode.jsx` (390 lines)
- MessageList MasteryCard: `src/components/study/MessageList.jsx:268-294`
- applySkillUpdates: `src/lib/study.js:244-723`
- sendMessage mastery wiring: `src/StudyContext.jsx:1226-1256`
- buildSystemPrompt: `src/lib/study.js:1634-1636`

**Migration Impact:** None. All changes are prompt additions, UI display logic, or event wiring. No schema changes.

---

## Lane A — Small Fixes (3 items)

### A1 — Explicit Gap Identification in Boot Message (IES 6b)

**Problem:** The system prompt tells the AI to identify gaps internally (ASSIGNMENT-FIRST PRIORITY, READING THE STUDENT) but never instructs it to explicitly name the student's weakest area to the student.

**Change:** Add a short prompt instruction to `buildSystemPrompt()` in `src/lib/study.js`.

**Insertion point:** After the PRE-QUESTION PHASE section (section #6), before the TEACHING METHOD section (section #7). The gap identification logically follows pre-questions — once the AI has assessed prior knowledge, it names the specific gap.

**Prompt text:**
```
GAP TARGETING:

After your pre-question, briefly note which skill area appears weakest based on the mastery data in context — e.g., "I notice your strength in [X] is lower than the rest. Want to focus there?" This gives the student agency over gap targeting. One sentence, no lecture about their weaknesses. If all skills are roughly equal, skip this.
```

**Scoping:** This instruction fires for all sessions (skill, assignment, exam, explore) because the system prompt is shared. However, skill strength data is only present in context for skill-focused and assignment-focused sessions. For explore/exam sessions, the AI will see "no mastery data in context" and skip per the "if all skills are roughly equal, skip this" clause. No additional scoping logic needed.

**Files changed:** `src/lib/study.js` — insert ~5 lines into the `buildSystemPrompt` string literal after the PRE-QUESTION PHASE section's closing divider.

---

### A2 — PracticeMode Mastery Events Wiring

**Problem:** In PracticeMode.jsx line 296, `applySkillUpdates()` is called but its return value (mastery events array) is discarded. When a student achieves mastery during Practice Mode, no inline MasteryCard appears and no mastery notification fires.

**Current call site** (PracticeMode.jsx:296-302):
```javascript
await applySkillUpdates(active.id, [{
  skillId: pm.skill.id,
  rating: practiceRating,
  reason: "Practice Tier " + tier + "...",
  source: 'practice',
  context: 'guided',
}]);
```

**Change:**

1. **Add refs to useStudy() destructure** (PracticeMode.jsx:23-27): Add `sessionMasteryEvents` and `sessionMasteredSkills` to the destructured values from `useStudy()`.

2. **Capture return value** (PracticeMode.jsx:296): Change `await applySkillUpdates(...)` to `var masteryResult = await applySkillUpdates(...)`.

3. **Wire mastery events** (after line 302, before the `incrementPracticeAttempts` block):
```javascript
if (masteryResult && masteryResult.length > 0) {
  for (var me of masteryResult) {
    me.messageIndex = -1; // practice mode, no message index
    sessionMasteryEvents.current.push(me);
    sessionMasteredSkills.current.add(me.skillId);
    addNotif("mastery", me.skillName + " → Lv " + me.levelAfter);
  }
}
```

**Note:** `messageIndex = -1` marks these as practice-origin events. MessageList's filter (`me.messageIndex === i`) will never match -1, so no inline card renders during practice. The events ARE captured in `sessionMasteryEvents.current` so they appear in the SessionSummary when the student exits. The `addNotif("mastery", ...)` call triggers the toast notification immediately.

**Files changed:** `src/components/study/PracticeMode.jsx` — 2 edits (useStudy destructure + mastery wiring).

---

### A3 — Level Decrease Display Guard

**Problem:** The mastery event detection computes `levelBefore` from pre-update points and `levelAfter` from post-update points. In rare edge cases (e.g., facet-level aggregation rounding, or a "struggled" rating after previous mastery), `levelAfter` could be less than `levelBefore`. Displaying "Lv 3 → Lv 2" in a celebration card is confusing and discouraging.

**Change:** Display-only clamp in two locations:

1. **MessageList.jsx** (line 273-278) — inline MasteryCard:
   - Before the level display conditional, compute: `var displayLevel = Math.max(me.levelAfter, me.levelBefore);`
   - Change the condition from `me.levelBefore !== me.levelAfter` to `me.levelBefore !== displayLevel`
   - Change `Lv {me.levelAfter}` to `Lv {displayLevel}`

2. **SessionSummary.jsx** (line 76-77) — session summary:
   - Same pattern: `var displayLevel = Math.max(me.levelAfter, me.levelBefore);`
   - Change `me.levelBefore !== me.levelAfter` to `me.levelBefore !== displayLevel`
   - Change `{me.levelAfter}` to `{displayLevel}`

**Data untouched:** The actual `masteryEvents` array in study.js is unchanged. The `levelAfter` field retains its true computed value. Only the render path is clamped.

**Files changed:** `src/components/study/MessageList.jsx`, `src/components/study/SessionSummary.jsx` — 1 edit each (display guard).

---

## Lane B — Confidence Calibration + Review Mode Assessment

### B1 — Confidence Calibration Tracking + Surface

**Problem:** PracticeMode captures `confidenceRating` (1-5) per problem but never analyzes or surfaces the aggregate calibration tendency.

**Data source:** After tier completion, the attempt's `problems` array contains objects with `{ confidenceRating: 1-5|null, passed: boolean|null }`. Each problem that has both a `confidenceRating !== null` and `passed !== null` is a valid sample.

**Calibration formula:**

```javascript
function computeCalibration(problems) {
  var rated = problems.filter(function(p) { return p.confidenceRating !== null && p.passed !== null; });
  if (rated.length < 3) return { tendency: "insufficient", sampleSize: rated.length, score: null };
  // Normalize: confidence 1-5 → 0-1, passed → 0 or 1
  var deltas = rated.map(function(p) { return ((p.confidenceRating - 1) / 4) - (p.passed ? 1 : 0); });
  var avgDelta = deltas.reduce(function(s, d) { return s + d; }, 0) / deltas.length;
  // avgDelta > 0 = overconfident (rated higher than performed)
  // avgDelta < 0 = underconfident (rated lower than performed)
  var tendency;
  if (avgDelta > 0.15) tendency = "overconfident";
  else if (avgDelta < -0.15) tendency = "underconfident";
  else tendency = "well-calibrated";
  return { tendency: tendency, sampleSize: rated.length, score: Math.round(avgDelta * 100) / 100 };
}
```

**Threshold rationale:** 0.15 (~0.75 on 5-scale) is sensitive enough to detect patterns over 3-5 problems while tolerating single-problem noise. A student who rates 4/5 confidence and fails 2 of 5 will register as overconfident. A student who rates 2/5 confidence and passes 4 of 5 will register as underconfident.

**Surface location:** PracticeMode.jsx tier completion screen (lines 77-128), inside the `pm.tierComplete` block. After the problem results list (line 97) and before the action button (line 98).

**UI:**
```jsx
{/* Confidence calibration — IES Rec 6a */}
{calibration.tendency !== "insufficient" && (
  <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, padding: "8px 12px", background: T.sf, borderRadius: 8 }}>
    <span style={{ fontWeight: 600 }}>Calibration: </span>
    {calibration.tendency === "well-calibrated"
      ? "Your confidence matched your performance. Good self-awareness."
      : calibration.tendency === "overconfident"
        ? "You tended to rate higher confidence than your results showed. Try to notice which topics feel solid vs. actually are."
        : "You underestimated yourself — you did better than you expected. Trust your preparation more."}
  </div>
)}
```

**Compute location:** Inside the tier completion handler (PracticeMode.jsx around line 286), after `completeTierAttempt(updatedSet)`. Compute calibration from `attempt.problems` and store it on the `tierComplete` state object:

```javascript
var calibration = computeCalibration(attempt.problems);
// Include in tierComplete state:
setPracticeMode(prev => ({
  ...prev, set: updatedSet,
  tierComplete: { ...tierResult, problems: attempt.problems, calibration: calibration }
}));
```

**Where to put `computeCalibration`:** Inline in PracticeMode.jsx (it's ~10 lines, only used there). No need for a separate module.

**ProfileScreen integration:** Deferred. The calibration data lives transiently in PracticeMode state and is not persisted to the database. To surface in ProfileScreen, we'd need to store calibration history in `practice_sets` or a new table. That's a separate feature — for now, PracticeMode surface is sufficient.

**Files changed:** `src/components/study/PracticeMode.jsx` — add `computeCalibration` function + calibration display in tier completion + calibration compute in tier completion handler.

---

### B2 — Review Mode Entry Point Assessment (IES Rec 1)

**Assessment:** A separate "Review" study mode is **not recommended** for v1.

**Rationale:**

1. **Due skills are already surfaced comprehensively:**
   - SkillPicker.jsx: `isDue` filter (line 130), due skills banner (line 211), per-group due count badges (line 274), per-skill DUE indicators (line 284)
   - CurriculumScreen.jsx: Due review banner (line 421), per-skill DUE badges (lines 453-459)
   - CourseHomepage.jsx: "N due" count on Skill Development card (line 123)
   - ScheduleScreen.jsx: Overdue indicators

2. **The system prompt already handles review context:**
   - ASSESSMENT PROTOCOL: "If skills are flagged DUE FOR REVIEW in student status, weave 1-2 brief recall questions about those skills into the session naturally."

3. **User flow is already minimal:**
   - CourseHomepage → "Skill Development" → SkillPicker → due skill banner at top → select due skill → AI opens with retrieval-focused pre-question for returning skills
   - Adding a "Review" mode would save exactly one click (auto-selecting due skills instead of the student clicking the DUE banner).

4. **Mode proliferation risk:**
   - CourseHomepage currently has 3 study modes (Assignment, Exam, Skills) + 3 navigation cards (Curriculum, Materials, Schedule). Adding a 4th study mode increases cognitive load on the mode selection screen.
   - The 3-column grid layout would need to accommodate 7 cards (currently 6), which may require layout changes.

**Decision:** Close this gap as "addressed by existing DUE badges and system prompt ASSESSMENT PROTOCOL." No code changes.

---

## How to Verify

### A1 — Gap Identification Prompt
- [ ] Read `buildSystemPrompt()` in study.js — GAP TARGETING section exists after PRE-QUESTION PHASE
- [ ] Instruction is 2-3 sentences maximum
- [ ] Includes "if all skills are roughly equal, skip this" escape clause
- [ ] No scoping logic needed (data availability self-scopes)

### A2 — PracticeMode Mastery Events
- [ ] PracticeMode.jsx destructures `sessionMasteryEvents` and `sessionMasteredSkills` from useStudy()
- [ ] `applySkillUpdates()` return value is captured
- [ ] Mastery events pushed to `sessionMasteryEvents.current` with `messageIndex: -1`
- [ ] `sessionMasteredSkills.current.add(me.skillId)` called for each event
- [ ] `addNotif("mastery", ...)` fires for each event
- [ ] Events appear in SessionSummary (via `sessionMasteryEvents.current` ref)

### A3 — Level Decrease Display Guard
- [ ] MessageList.jsx: `displayLevel = Math.max(me.levelAfter, me.levelBefore)` computed before render
- [ ] MessageList.jsx: Level display uses `displayLevel`, not `me.levelAfter`
- [ ] SessionSummary.jsx: Same guard applied
- [ ] study.js `masteryEvents` data unchanged (display-only guard)
- [ ] fsrs.js unchanged

### B1 — Confidence Calibration
- [ ] `computeCalibration()` function exists in PracticeMode.jsx
- [ ] Returns `{tendency, sampleSize, score}` with correct thresholds (0.15)
- [ ] "insufficient" returned for < 3 rated problems
- [ ] Calibration computed in tier completion handler, stored on `tierComplete` state
- [ ] Calibration line displayed in tier completion UI (only if not "insufficient")
- [ ] Phrasing is constructive, not demoralizing

### B2 — Review Mode
- [ ] No new study mode added
- [ ] Decision documented in blueprint (this document)

### General
- [ ] Build passes: `npx vite build --mode development`
- [ ] fsrs.js unchanged (no FSRS logic changes)
- [ ] No schema changes, no new migrations

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Designed blueprint for 5 changes across 2 work lanes. Lane A: gap identification prompt, PracticeMode mastery event wiring, level decrease display guard. Lane B: confidence calibration tracking + surface, review mode assessment (closed as addressed).

### Files Deposited
- `study/knowledge/architecture/ies-gaps-open-flags-blueprint-2026-03-22.md` — this blueprint

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Review mode (IES Rec 1) not recommended — existing DUE badges + system prompt ASSESSMENT PROTOCOL already cover the use case. Gap closed.
- Calibration threshold set at 0.15 (normalized delta) — sensitive enough for 3-5 problem samples.
- `computeCalibration` placed inline in PracticeMode.jsx (no separate module needed for ~10 lines).
- ProfileScreen calibration integration deferred (requires persistent storage).
- Mastery events from Practice Mode get `messageIndex: -1` to distinguish from teaching-session events.

### Flags for CEO
- None

### Flags for Next Step
- A2 requires adding `sessionMasteryEvents` and `sessionMasteredSkills` to PracticeMode's useStudy() destructure. Verify these are exposed in the StudyContext value (they are — line 1586).
- A3 requires editing both MessageList.jsx and SessionSummary.jsx. The SessionSummary location is line 76-77.
- B1's `computeCalibration` should be defined before the component (or inside it as a plain function). It's pure computation with no React dependencies.
