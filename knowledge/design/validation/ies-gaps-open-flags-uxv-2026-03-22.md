# IES Gaps + Open Flags — UX Validation
**Date:** 2026-03-22 | **Agent:** Study UX Validator | **Step:** 4

**QA reference:** `knowledge/qa/ies-gaps-open-flags-qa-2026-03-22.md`

---

## Area 1: Gap Identification Tone

**What was assessed:** Does the AI naming "your weakest area is X" feel helpful or pressuring? Could it discourage a student who's already struggling?

**Assessment:**

The prompt instruction reads: *"After your pre-question, briefly note which skill area appears weakest based on the mastery data in context -- e.g., 'I notice your strength in [X] is lower than the rest. Want to focus there?' This gives the student agency over gap targeting. One sentence, not a lecture about their weaknesses. If all skills are roughly equal, skip this."*

**Tone analysis:**

- **"I notice your strength in [X] is lower than the rest"** — observational, not judgmental. Uses "lower than the rest" rather than "weak" or "bad." This frames it as relative positioning, not failure.
- **"Want to focus there?"** — gives the student a choice. The student can say "no, I want to work on Y instead." This is agency, not direction.
- **"One sentence, not a lecture about their weaknesses"** — explicitly prevents the AI from dwelling or listing multiple weak areas. Brief observation, move on.
- **"If all skills are roughly equal, skip this"** — prevents forced gap-naming when there's nothing meaningful to surface. No awkward "your weakest area is... well, they're all about the same."

**Risk scenario:** A student with very low mastery across all skills sees "I notice your strength in [X] is lower than the rest." This could feel like "everything is bad, but this is especially bad." However, the escape clause ("if all skills are roughly equal, skip this") handles this — the AI won't surface a gap if there's no meaningful differentiation.

**Risk scenario 2:** A student who's already anxious about a topic gets told "your strength in [X] is lower." This could reinforce anxiety. However, the prompt frames it as an invitation ("Want to focus there?"), not a mandate. The student can redirect. The alternative — not telling the student about their gap — is worse pedagogically. Students who don't know their weak areas waste study time on material they already understand.

**Verdict: Acceptable.** The tone is observational and inviting, not evaluative or pressuring. The escape clause and agency framing mitigate the main risks. The IES research (Rec 6b) specifically recommends surfacing gaps to students because most learners cannot accurately self-assess.

**Severity:** None — no action needed.

---

## Area 2: Mastery Celebration in PracticeMode

**What was assessed:** With mastery events now wired from Practice Mode, does the celebration feel earned? Is the inline MasteryCard appropriate in practice context?

**Assessment:**

**How mastery events reach the student from Practice Mode:**
1. Student completes a tier → `applySkillUpdates` runs with a practice-derived rating
2. If all facets are now "good" or "easy," a mastery event fires
3. Event gets `messageIndex = -1` — no inline MasteryCard in MessageList
4. `addNotif("mastery", skillName + " → Lv X")` fires as a toast notification
5. Event stored in `sessionMasteryEvents.current` → appears in SessionSummary on exit

**Does it feel earned?**

Practice Mode mastery is arguably MORE earned than teaching-session mastery. In teaching, the AI guides the student through questions and the student may receive "good" ratings with scaffolding. In Practice Mode, the student independently solves 4/5 problems across increasing tiers. A mastery event triggered by practice performance represents genuine demonstrated competence.

**Is the notification appropriate?**

The toast notification ("Chain Rule → Lv 3") is appropriately understated — it doesn't interrupt the practice flow. The student sees it briefly and can continue to the next tier. The full celebration appears in the SessionSummary when they exit, which is the natural "reflection" moment.

**What about the inline MasteryCard?**

The inline MasteryCard (the green-bordered card in MessageList) is intentionally NOT shown for practice-origin events (`messageIndex = -1`). This is correct — Practice Mode has its own tier completion UI with points, rating, and now calibration feedback. An additional MasteryCard would be redundant and would appear in the wrong UI context (MessageList is not visible during practice).

**Verdict: PASS.** The mastery celebration is appropriately channeled: immediate toast during practice, full summary on exit. No inline card avoids redundancy. Practice-earned mastery feels more legitimate than teaching-earned mastery.

**Severity:** None — no action needed.

---

## Area 3: Level Display Guard Honesty

**What was assessed:** Does clamping level decreases prevent confusion without being dishonest? The student's actual level data is unchanged — only the celebration display is clamped.

**Assessment:**

**What the guard does:** If a mastery event computes `levelAfter < levelBefore`, the display shows nothing (the level transition row is hidden entirely). It does NOT show a fake increase — it simply omits the level line.

**Is this dishonest?**

No. The mastery celebration card still appears (showing skill name, facet list, next review date). Only the "Lv 2 → Lv 3" line is conditionally hidden. The student still sees that they mastered the skill — they just don't see a confusing level regression.

**When would this happen?**

The edge case requires: (1) all facets rated good/easy (mastery threshold met), BUT (2) total points decreased. This could occur if facet-level aggregation math produces fewer total points than a previous skill-level-only calculation. In practice, this is extremely rare — points only increase from positive ratings.

**Alternative approaches considered:**
- Show "Lv 3 → Lv 2" honestly: confusing and discouraging. A student sees "you mastered this skill" AND "your level went down" simultaneously. This is incoherent.
- Show "Lv 3 → Lv 3" (no change): arguably more misleading than omitting — suggests nothing happened.
- Omit the level line entirely (current approach): the least misleading option. The mastery card still celebrates the achievement. The level is simply not mentioned.

**Data integrity check:** The actual `me.levelAfter` field is unchanged. Journal entries, session summaries (for data export), and any future analytics will have the true value. Only the inline celebration UI is clamped.

**Verdict: Acceptable.** Omitting a confusing level regression from a celebration card is the right UX call. The data is untouched. The student still sees the mastery achievement.

**Severity:** None — no action needed.

---

## Area 4: Calibration Feedback Phrasing

**What was assessed:** Is "Your confidence tends to be overconfident" helpful or demoralizing? Is the phrasing constructive? Is the sample size sufficient?

**Assessment:**

**Phrasing review (all three tendencies):**

1. **"well-calibrated"**: *"Your confidence matched your performance. Good self-awareness."*
   - Positive reinforcement. Brief. Doesn't oversell. GOOD.

2. **"overconfident"**: *"You tended to rate higher confidence than your results showed. Notice which topics feel solid vs. actually are."*
   - Frames it as an observation ("you tended to"), not a judgment ("you are overconfident"). The action item ("Notice which topics...") is constructive and specific. Does not use the word "overconfident" in the student-facing text. GOOD.

3. **"underconfident"**: *"You underestimated yourself -- you did better than expected. Trust your preparation more."*
   - Frames the mismatch positively ("you did better than expected"). The encouragement ("Trust your preparation more") is actionable. GOOD.

**Is 3 problems sufficient?**

The minimum sample (3 rated problems) provides a directional signal, not a statistical certainty. With 5 problems per tier, most completions will have 5 data points. At 3, calibration can detect strong patterns (e.g., rating 5/5 and failing 2/3) but may misclassify borderline cases. The 0.15 threshold (normalized) requires a meaningful gap — a single mismatch in 3 problems won't trigger overconfident/underconfident unless the mismatch is large.

**Risk: could repeated "overconfident" labels be demoralizing?**

Calibration is shown once per tier completion — not per problem. A student advancing through tiers sees it maybe 2-3 times per session. If they consistently rate high and fail, the feedback helps them recalibrate. The IES research (Rec 6a) specifically identifies "illusion of knowing" as a major learning obstacle: *"Most learners cannot accurately judge what they do and don't know, and typically overestimate how well they have mastered material."* Surfacing this gently is the point.

**The per-problem feedback (already existing) complements this:**
- After each problem: "Calibration check: 4/5 confidence but missed it. Notice this gap." (existing, lines 391-405)
- After tier completion: "You tended to rate higher confidence than your results showed." (new)

The per-problem feedback is immediate and specific. The tier-level calibration is aggregate and reflective. These are complementary, not redundant.

**Verdict: PASS.** Phrasing is constructive across all three tendencies. Sample size of 3 is reasonable for directional feedback. The label "Calibration:" with bold styling helps students recognize this as a meta-learning tool, not a grade.

**Severity:** None — no action needed.

---

## Area 5: Learning Science Risk — Metacognitive Overhead

**What was assessed:** All 5 changes together — is the combined metacognitive load at session start too high? Pre-question + gap identification + calibration feedback.

**Assessment:**

**Session start flow (skill-focused session):**
1. Student selects a skill in SkillPicker
2. AI opens with pre-question: "Before we dig in — what does [X] mean to you?" (existing, PRE-QUESTION PHASE)
3. Student answers
4. AI briefly notes gap: "I notice your strength in [Y] is lower than the rest. Want to focus there?" (new, GAP TARGETING)
5. Teaching begins

**Analysis of flow steps 2-4:**
- Step 2 (pre-question): 1 sentence from AI, student responds. Lightweight.
- Step 3 (student answer): Student's own words. Not overhead — this IS learning.
- Step 4 (gap targeting): 1 sentence from AI. Student can accept or redirect. Lightweight.

Total metacognitive overhead added by this batch: **1 sentence** (the gap targeting line). The pre-question was already implemented. This is negligible.

**Calibration feedback timing:**
Calibration appears ONLY after tier completion in Practice Mode — NOT at session start. It does not contribute to session-start overhead. A student encounters it after completing 5 problems, which is a natural reflection point.

**Combined metacognitive tools a student encounters in a full session:**
1. Pre-question (session start) — existing
2. Gap targeting (session start) — new, 1 sentence
3. Confidence rating per problem (Practice Mode) — existing
4. Per-problem calibration hint (after each answer) — existing
5. Tier-level calibration summary (after tier completion) — new, 1 line

Items 1-2 are at session start. Items 3-5 are in Practice Mode only (not teaching sessions). A student in a teaching-only session encounters only items 1-2. A student in Practice Mode encounters 3-5 but items 3-4 were already there — only item 5 is new.

**IES research perspective:** The IES Practice Guide explicitly recommends all of these metacognitive interventions. The guide warns against students who "don't know what they don't know" and recommends pre-questions, delayed self-assessment, and gap identification as evidence-based strategies. The concern is not "too much metacognition" but "too little."

**Verdict: No risk.** The combined metacognitive overhead is minimal — 1 new sentence at session start, 1 new line after tier completion. Both appear at natural transition points (session opening, tier boundary). The existing metacognitive tools (pre-questions, confidence ratings) were already in place. No cumulative overload.

**Severity:** None — no action needed.

---

## Summary

| Area | Verdict | Action |
|------|---------|--------|
| Gap identification tone | Acceptable | None |
| Mastery celebration in PracticeMode | PASS | None |
| Level display guard honesty | Acceptable | None |
| Calibration feedback phrasing | PASS | None |
| Learning science risk (metacognitive overhead) | No risk | None |

**Overall: PASS — no blocking issues. All 5 changes are pedagogically sound and appropriately implemented.**

---

## Output Receipt
**Agent:** Study UX Validator
**Step:** 4
**Status:** Complete

### What Was Done
Validated 5 UX areas for IES gaps + open flags batch. Assessed tone, honesty, phrasing, and metacognitive overhead. All areas pass or are acceptable.

### Files Deposited
- `study/knowledge/design/validation/ies-gaps-open-flags-uxv-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (validation only)

### Decisions Made
- Gap targeting tone is observational and inviting — no changes needed.
- Level display guard (omit rather than fake) is the right UX choice.
- Calibration phrasing avoids using the word "overconfident" in student-facing text — uses behavioral observation instead.
- Combined metacognitive overhead is minimal (1 new sentence + 1 new line at natural transition points).

### Flags for CEO
- None

### Flags for Next Step
- Plan complete. Move to Done.
