# Facet-Level Mastery Assessment — UX Validation Report
**Date:** 2026-03-14
**Agent:** Study UX Validator
**Step:** Step 8
**Feature:** Facet-Level Mastery Assessment (Steps 4-6)
**Reference Design:** `study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md`
**Reference Research:** `study/knowledge/research/facet-assessment-research-2026-03-14.md`

---

## 1. Assessment Feels Like Teaching, Not Testing

**Verdict: PASS — with one risk to monitor**

### What works

The Assessment Protocol in the system prompt is well-constructed. Three specific directives enforce the stealth assessment pattern the research recommended:

1. **"Assess facets continuously during teaching — each exchange is evidence."** This is the single most important line. It tells the AI that every student response is data, not that it needs to create special assessment moments. The AI should be rating facets as a byproduct of its normal ask-listen-teach-verify loop.

2. **"Do NOT save assessment for the end or announce you are assessing."** Explicit prohibition against the most common failure mode — the AI turning the last 5 minutes into a quiz.

3. **"If unassessed facets remain, introduce them through a synthesis question requiring multiple facets."** This is the graceful gap-filler. Instead of "Now let me check if you understand X," the AI should ask something like "Given what we've covered, how would you approach [problem that requires both X and Y]?" A synthesis question feels like a teaching moment, not a test.

4. **"Never iterate through facets one-by-one and never announce assessment mode."** Belt-and-suspenders against the checklist interrogation pattern.

The rating format also helps: `"Only rate facets the student demonstrated or failed to demonstrate."` This frees the AI from feeling it must rate everything in one exchange. Partial assessment per message is the expected pattern, which prevents the "rapid-fire question" failure.

### What could fail

The system prompt gives the AI the facet list with mastery percentages (e.g., `"[mastery: untested]"` or `"[mastery: 45%]"`). This creates a risk: the AI sees a dashboard of assessed vs. unassessed facets and unconsciously shifts toward completing the checklist rather than teaching the skill. The explicit directives above mitigate this, but it's an inherent tension between giving the AI context (it needs to know what's been assessed to avoid redundant testing) and keeping it in teacher mode.

**Risk level:** Low. The teaching methodology section of the system prompt (ASK FIRST, TEACH SECOND; CONCRETENESS FADING; 60% questions ratio) is extensive and dominates the prompt. The facet section is additive — it's the last ~300 characters of a ~6,000-character prompt. The AI's primary identity is "master teacher," not "assessor." But this is worth monitoring in real sessions.

**Recommendation:** No code change needed. Monitor in Step 9 (live validation) for sessions where the AI's questioning feels checklist-driven rather than student-driven. If detected, add a single line to the assessment protocol: "Your teaching agenda drives the conversation, not the facet list."

---

## 2. Celebration Calibration

**Verdict: PASS — calibration is correct**

### Inline MasteryCard analysis

The MasteryCard appears in the chat flow as a centered card with a green border (`1px solid T.gn`). It is:

- **Non-modal:** Does not block the conversation. The student can continue typing. The card is a permanent part of the chat history, scrollable like any message.
- **Non-animated beyond fade:** `animation: "fadeIn 0.3s"` — no confetti, no bounce, no shake, no sound. This aligns with the research recommendation: "Brief (2-3 seconds), specific, non-blocking. No extrinsic rewards."
- **Informationally dense but compact:** Skill name (16px bold), level change (20px bold, conditional), facet checklist (13px), next review text (11px muted). The card communicates *what* was mastered, *how much* they improved, and *when* they'll revisit — all in one scannable block.
- **Green border only:** The only special visual treatment. No green background, no glow. The `T.sf` background (surface color) keeps it visually grounded in the existing chat aesthetic.

### Is it too much? Too little?

It's calibrated correctly. Here's why:

**Not too much:** The card doesn't interrupt flow, doesn't auto-scroll to itself, and doesn't demand acknowledgment. A student deep in a session will see it appear below the assistant message and can choose to engage or keep going. The 14px border-radius matches the chat bubble aesthetic — it feels like a special message, not a popup.

**Not too little:** The level change display (`Lv 2 → Lv 3` at 20px bold) is the right amount of weight for a permanent achievement. The facet checklist with green checkmarks provides specific validation: "You demonstrated *these* things." This is the "specific praise" the teaching methodology already calls for — "good, you caught the sign error" — expressed as UI rather than text.

### Motivation to continue

The next-review line (`"Next review in 8 days"` or `"well locked in"`) is the bridge to forward momentum. It says: this skill is handled, you'll see it again when it needs refreshing. This implicitly signals: you can move on.

The notification (`"★ Skill Name → Lv 3"`) appears in the left panel simultaneously. The notification panel is designed for awareness, not interruption — it's a log, not an alert. The star icon (`★`) with green color distinguishes mastery from regular skill updates (`^` with purple). This provides a secondary reinforcement channel without doubling the interruption.

**One gap:** There's no explicit "What should we work on next?" after a mastery event in the chat itself. The AI would need to generate that transition organically. Given the teaching methodology instructs the AI to "move on" after verification, this should happen naturally. But if it doesn't, the student sees a celebration card and then... silence, waiting for them to initiate. This is acceptable — the student is in control — but the AI should ideally follow up with a transition question.

**Recommendation:** No code change. The teaching methodology's existing flow (VERIFY → MOVE ON) should produce natural transitions. If sessions stall after mastery events, consider adding a hint to the assessment protocol: "After mastery is demonstrated, suggest the next skill or return to the assignment."

---

## 3. Decay Communication

**Verdict: PASS — honest without deflating**

### What the student sees

The MasteryCard includes one line at the bottom:

- **Short stability:** `"Next review in 3 days"` — factual, forward-looking.
- **Long stability:** `"Next review in 21 days — well locked in"` — adds a reassurance phrase.

The phrasing is good:

1. **"Next review" not "You'll forget":** The framing is about a future positive action (reviewing), not a negative prediction (forgetting). This follows the research recommendation: "Frame reviews as 'strengthening' not 're-learning.'"

2. **"Well locked in" for >14 days:** This is the celebration sweetener. When stability is high (the student really nailed it), the review is far away, and the language reflects confidence. When stability is low (mastery was marginal — all good but with scaffolding), the review is soon, and the language is neutral (just the days).

3. **No percentages:** The student never sees "73% chance of remembering." The system uses retrievability internally for FSRS scheduling, but the UI abstracts this to "N days until review." This is the right call — percentages create anxiety. Days create a plan.

### What could be better

The current text doesn't distinguish between "you'll review this as part of your normal schedule" and "you'll need to practice this again specifically." Both show as "Next review in N days." For the student, the implication is: "I don't need to think about this until then." That's the correct implication — the FSRS scheduler will surface it when needed.

One minor concern: when `nextReviewDays` is very small (1-2 days), the mastery card simultaneously says "you mastered this!" and "review tomorrow." That could feel contradictory. However, this edge case requires ALL facets to be good/easy (triggering mastery) while having very low stability (e.g., first review on a brand new skill). The FSRS model would give low stability to first-reviewed items, so this is actually correct: the student demonstrated competence but hasn't yet consolidated it through spaced repetition. The card is honest.

**Recommendation:** No code change. The phrasing is honest and well-calibrated. If user testing reveals confusion about "mastered but review in 2 days," consider adding: `"Next review in 2 days — we'll confirm it stuck"` for very short intervals (< 3 days). This reframes the short interval as confirmation rather than re-learning.

---

## 4. Facet Progress Clarity

**Verdict: PASS — with two advisory notes**

### In-chat facet pills

Three rendering paths, all appropriate:

1. **No facets (backward compat):** Original inline pill. `[Skill Name: rating]` with rating color background. Clean, minimal.

2. **Single facet:** Minimal pill with colored dot + facet name + rating. This is the right choice for a single assessment — no need for the expanded card structure when there's only one data point. The student sees what was assessed and how they did.

3. **Multiple facets (2+):** Expanded card with skill name header, tree connectors (├/└), facet names, 5-dot mini indicator, and rating text. This is the richest view and appears inline below the assistant message that triggered the assessment.

The 5-dot indicator is a thoughtful touch: it provides a quick visual scan (mostly filled = doing well, few filled = struggling) without requiring the student to read rating text. The dots use the rating color (green for good/easy, amber for hard/struggled) for instant recognition.

### Can the student understand which facets are demonstrated vs. pending?

**In-session: Partially.** The facet pills show what was just assessed in this exchange. A student can scroll back through the chat and see a breadcrumb trail of facet assessments. However, there's no single place during the session where the student can see "3/5 facets demonstrated, 2 remaining." This information exists in the AI's context (via `buildFacetAssessmentBlock` showing `[mastery: untested]` vs. `[mastery: N%]`), but it's not surfaced to the student.

This is a deliberate design choice from the research: stealth assessment means the student shouldn't be tracking checkboxes. If the student saw "2/5 facets remaining," it would shift their motivation from understanding to completion. The research explicitly warns against this: "students optimizing for checkmarks rather than understanding."

**At session end: Yes.** The SessionSummary Facets Assessed section shows all facets that received ratings during the session, deduplicated. The Skills Mastered section shows which skills hit the all-facets-good threshold. The student gets a complete picture at exit.

### Advisory notes

**A1: Facet names differ between pills and mastery cards.** As the QA report noted, pills use `formatKey(facetKey)` (kebab→Title Case) while mastery cards use `me.facets[].name` from the database. Example: pill might show "Applying L Hopital S Rule" while the mastery card shows "Applying L'Hopital's Rule." The database name is better. This inconsistency is minor since the mastery card is the canonical reference, and pills are ephemeral in-chat indicators. But it could confuse a student who sees both in the same scroll distance.

**A2: Facets Assessed section in SessionSummary doesn't group by parent skill.** The current implementation shows a flat list of facet names with ratings. If the student practiced 3 skills with 4 facets each, they see 12 facets in a flat list with no grouping. This is manageable at small scale (the 5-item cap helps) but could be disorienting for longer sessions.

**Recommendation:** Both are advisory. A1 could be addressed by having `parseSkillUpdates` store the DB facet name alongside the key (would require an async lookup during parse, which was intentionally avoided). A2 could be addressed by grouping facets by `skillId` in the SessionSummary. Neither is blocking.

---

## 5. Session Summary Utility

**Verdict: PASS — functional but could be more actionable**

### What the summary provides

The SessionSummary now has seven potential sections (all conditional):

1. **Stats row:** Duration, messages, mastered count. Quick quantitative snapshot.
2. **Skills Mastered:** Green-tinted, specific. "You demonstrated all facets of [skill]."
3. **Skills Practiced:** Non-mastered skills with ratings and strength. Shows progress without completion.
4. **Facets Assessed:** Granular detail for students who want it. Expandable.
5. **Topics Covered:** Word-frequency chips. Confirms session scope.
6. **Breakthroughs:** Student quotes where they showed understanding. Reinforcement.
7. **What's Next:** "Suggested: [weakest skill] (needs more practice)" or "All practiced skills are in good shape."

### Does it help the student know what to do next?

**Partially.** The "What's Next" section is the forward-looking element. Its current implementation:

```js
weakest && (weakest.rating === "struggled" || weakest.rating === "hard")
  ? "Suggested: " + weakest.name + " (needs more practice)"
  : "All practiced skills are in good shape."
```

This is minimal guidance. It tells the student which skill was weakest, but:

- **No time frame:** "Needs more practice" — when? Tomorrow? Before the exam?
- **No connection to assignments:** If the weak skill is required for an upcoming assignment, that's important context. The data exists (`sessionSummary.asgnWork`) but isn't used in the What's Next logic.
- **Binary output:** Either one weak skill or "all good." No nuance for "good on most things, one area needs attention."

**The summary leans toward "report card" more than "action plan."** The top sections (stats, mastered, practiced) are backward-looking — here's what you did. The What's Next section is the only forward-looking element, and it's one line of generic advice.

### What would make it more actionable

These are not blocking changes but would strengthen utility:

1. **Connect to schedule:** If the student has an assignment due in 2 days, What's Next could say: "Suggested: [skill] — needed for [assignment] due [date]." The data is available in `cachedSessionCtx.current`.

2. **Estimated next session scope:** "Next time: review [skill A] + continue [skill B]." This gives the student a reason to come back.

3. **Streak or consistency note:** "3 sessions this week" or "First session in 4 days." Encourages regularity without gamification pressure.

However, the current implementation is functional and follows the design spec. The summary isn't misleading or confusing — it just could be more motivating.

**Recommendation:** The current implementation matches the design spec and is adequate for V1. Flag for future iteration: strengthen What's Next with assignment-awareness and estimated next session scope.

---

## 6. Learning Science Risk Assessment

**Verdict: LOW RISK — but requires monitoring**

### The core question

Does the assessment protocol risk students optimizing for checkmarks (demonstrating facets to clear the mastery threshold) rather than genuine understanding?

### Analysis

**Three design decisions protect against this:**

1. **Stealth assessment.** The student never sees a facet checklist during the session. They don't know which facets remain unassessed. They can't "target" specific facets because the facets are invisible to them. The only visible signals are the post-hoc facet pills (which appear after the AI has already assessed) and the mastery card (which appears only after mastery is achieved). Neither provides a "to-do list" that the student could game.

2. **Evidence weighting.** The FSRS routing modulates stability gain by context type. A `diagnostic` assessment (student answered cold) carries more weight than `scaffolded` (heavy guidance) or `explained` (AI explained, student confirmed). A student who says "yeah, makes sense" after an explanation gets `explained` context → lower stability gain → shorter review interval. They'd need to demonstrate actual competence (answering questions, applying concepts) to get meaningful mastery credit.

3. **The teaching methodology.** The system prompt's 60/30/10 ratio (questions/teaching/confirmation) means the AI is constantly probing. A student who tries to "game" facets by giving quick answers will find the AI pushing harder: "Walk me through it," "Why does that work?", "What if [variation]?" The Ask First, Teach Second methodology is inherently verification-oriented.

### Remaining risks

**Risk A: "Good" threshold is achievable with guidance.**
The mastery threshold is "all facets rated good or easy." A `good` rating means: "Answered correctly with minor nudges. Applied the concept." This is achievable within a single guided session — the AI teaches, asks a verification question, the student gets it with one hint, rated `good`. This is *appropriate* for V1 (it indicates competence), but it doesn't require deep understanding. The FSRS scheduler handles this by giving low stability to guided-context ratings, ensuring the student will be retested. But the *mastery card* fires immediately, which could give premature confidence.

**Mitigation:** The next-review text in the mastery card ("Next review in 3 days") signals that this isn't permanent. The FSRS system will verify retention through spaced review. The celebration is for demonstrating competence, not for permanent mastery.

**Risk B: Students may rush through facets in focused sessions.**
In skill-focused mode, the AI sees the facet list. A student could ask: "Can you quiz me on everything?" and the AI, following the synthesis-question directive, might oblige with a comprehensive question. If the student handles it, multiple facets could be rated in one exchange. This isn't gaming per se — answering a synthesis question correctly IS evidence of understanding — but it compresses the assessment timeline.

**Mitigation:** The assessment protocol says "Never iterate through facets one-by-one." The synthesis-question approach ensures the student faces integrated challenges, not isolated checkboxes. If the student can answer a synthesis question correctly, they likely do understand the material. The risk here is low.

**Risk C: The mastery threshold doesn't require spacing.**
A student could master a skill in a single session (all facets rated good/easy on first exposure). The FSRS system would assign low stability (new card, first review), so the student would see "Next review in 1-2 days." But the mastery event still fires, the celebration card still appears, and the SessionSummary lists it as mastered. This could create an expectation gap: "I mastered it yesterday, why is it back?"

**Mitigation:** The decay communication section handles this. "Next review in 2 days" after a mastery card is honest: you demonstrated it, now we'll make sure it sticks. If students consistently express confusion about this, the mastery threshold could be tightened (e.g., require minimum stability > 2 days before mastery fires), but this would delay gratification significantly for V1.

### Overall assessment

The system is designed to resist teaching-to-the-test at multiple layers:
- **Student-facing:** No visible checklist, no facet progress tracker, no "2/5 remaining" display
- **AI-facing:** Teaching methodology dominates prompt, assessment is secondary
- **FSRS-facing:** Evidence weighting ensures low-quality demonstrations get low stability
- **Mastery-facing:** Threshold is "all facets demonstrated," not "all facets memorized"

The main residual risk is premature confidence from single-session mastery, which the decay communication and FSRS scheduling mitigate. This is acceptable for V1.

**Recommendation:** No code changes. Monitor in Step 9 for:
- Sessions where the AI's behavior shifts from teaching to testing after seeing facet context
- Students who express frustration at "mastered" skills reappearing for review
- Single-session mastery frequency — if >50% of mastery events happen in the first session with a skill, the threshold may need tightening

---

## Summary

| Validation Area | Verdict | Action Required |
|---|---|---|
| 1. Assessment feels like teaching | PASS | Monitor in live sessions |
| 2. Celebration calibration | PASS | None |
| 3. Decay communication | PASS | None |
| 4. Facet progress clarity | PASS | Two advisory notes (A1, A2) |
| 5. Session summary utility | PASS | Flag for future iteration |
| 6. Learning science risk | LOW RISK | Monitor in live sessions |

**Overall: Feature is ready for live validation (Step 9).** No blocking issues. Two advisory UI inconsistencies (facet name formatting, facet grouping in summary) and one future iteration opportunity (more actionable What's Next section).

---

## Escalation Notes

Per the UX Validator decision authority table:

- **Learning science risk (Section 6):** Flagged to CEO per escalation protocol. Risk is assessed as LOW but requires monitoring. The premature-confidence-from-single-session-mastery pattern is the primary residual concern. No code change recommended for V1, but the mastery threshold (all facets good/easy) could be tightened if user testing reveals overconfidence.

- **Aesthetic decisions:** None escalated. All visual treatment follows existing design spec. Green border for mastery card, star icon for notification, 5-dot rating indicator — all within established palette and patterns.

---

## Output Receipt
**Agent:** Study UX Validator
**Step:** Step 8
**Status:** Complete

### What Was Done
Validated the implemented facet-level mastery assessment experience across six dimensions: teaching-vs-testing feel, celebration calibration, decay communication, facet progress clarity, session summary utility, and learning science risk assessment. Reviewed system prompt text, MessageList rendering code, SessionSummary sections, and notification styling against research recommendations and UX design spec.

### Files Deposited
- `study/knowledge/design/validation/facet-mastery-uxv-2026-03-14.md` — This validation report

### Files Created or Modified (Code)
- None

### Decisions Made
- Assessment Protocol system prompt text is well-constructed; no modifications needed
- MasteryCard celebration level is correctly calibrated (non-modal, non-animated beyond fade, informationally dense)
- Decay communication ("Next review in N days") is honest without deflating; no reframing needed
- Facet progress is intentionally NOT shown mid-session (stealth assessment preserves learning motivation)
- Session summary is functional for V1 but leans "report card" more than "action plan" — flagged for future iteration
- Learning science risk is LOW; stealth assessment + evidence weighting + teaching methodology provide multi-layer protection against teaching-to-the-test

### Flags for CEO
- **Learning science risk — premature confidence:** Single-session mastery is possible when all facets rated good/easy on first exposure. FSRS assigns low stability (short review interval), and the mastery card communicates this honestly. But the "mastered" label + short review could confuse students. Monitor in live validation; consider tightening threshold (e.g., minimum stability requirement) if overconfidence pattern emerges.

### Flags for Next Step
- **Step 9 (Live Validation):** Three behaviors to watch for:
  1. AI shifting from teaching to checklist-driven questioning after seeing facet context
  2. Student confusion about "mastered" skills reappearing for review
  3. Single-session mastery frequency (>50% first-session mastery would suggest threshold is too lenient)
- **Future iteration:** Session summary What's Next section could be strengthened with assignment-awareness and estimated next-session scope
- **Advisory A1:** Facet name inconsistency between pills (`formatKey`) and mastery cards (DB name) — cosmetic, not blocking
- **Advisory A2:** Facets Assessed section in SessionSummary shows flat list without parent skill grouping — manageable at small scale, could confuse in long sessions
