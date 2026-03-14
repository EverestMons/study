# Facet-Level Assessment Best Practices for AI-Tutored Learning
**Date:** 2026-03-14
**Agent:** Educational Research Analyst
**Project:** study
**Implementation Relevance:** Directly informs the facet-level mastery assessment protocol (Steps 3-6 of execution plan). Every finding maps to a specific design or implementation decision.

---

## 1. Assessment Timing: When Should the AI Assess a Facet?

### Research Consensus: Continuous Stealth Assessment, Not Discrete Checkpoints

The learning science is clear on this: **formative assessment should be embedded in instruction, not separated from it**. The IES practice guides emphasize that formative assessment is a *process*, not an event — it should occur continuously during instruction, not as a separate activity that interrupts the learning flow ([IES Practice Guide, 2007](https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/20072004.pdf)).

The most relevant paradigm is **stealth assessment** (Shute, 2011; Shute, Lu & Rahimi, 2021). Originally developed for game-based learning, stealth assessment embeds measurement directly into the activity so the learner doesn't perceive a shift from "learning mode" to "testing mode." The assessment is invisible — the student thinks they're still learning while the system is gathering evidence of competency ([Shute et al., 2021](https://files.eric.ed.gov/fulltext/ED612156.pdf)).

Recent work on knowledge tracing in tutor-student dialogues (Shen et al., 2024) demonstrates that **each dialogue turn in a tutoring conversation can be treated as a formative assessment opportunity**. The system estimates the student's knowledge state on each knowledge component after each exchange, without requiring explicit test questions ([Shen et al., 2024](https://arxiv.org/html/2409.16490v1)).

### Practical Recommendation for Study

**Assess facets continuously during conversation, not at designated checkpoints.**

The AI should rate a facet whenever it observes sufficient evidence of the student's understanding — or lack thereof. This means:

- **After a student correctly explains a concept unprompted** — strong positive evidence for the relevant facet
- **After a student solves a problem that requires the facet** — evidence strength depends on whether hints were needed
- **After a student asks a clarifying question** — negative evidence (they don't have it yet) that's also pedagogically informative
- **After a failed attempt with scaffolding** — the recovery attempt provides evidence too

The AI should NOT announce "Now I'm going to assess you on X." The assessment should feel like a natural continuation of the teaching conversation.

### Evidence Weighting by Context

Not all demonstrations are equal. The intelligent tutoring system literature identifies a hierarchy of evidence quality:

| Evidence Type | Weight | Rationale |
|---|---|---|
| Unprompted correct application | Highest | Student retrieved and applied without cues |
| Correct response to direct question | High | Retrieval practice, but cued |
| Correct after one hint | Medium | Guided retrieval — the knowledge is forming but not yet independent |
| Correct after scaffolding/multiple hints | Low | The student followed a path but may not reproduce it alone |
| Self-correction after error | Medium-High | Error + correction shows developing understanding |
| Incorrect with no self-awareness | Lowest / Negative | Evidence of misconception or absence of knowledge |

**Key citation:** The IES recommendation #5 ("Use quizzing to promote learning") emphasizes that retrieval practice itself *is* learning — asking a student to recall is not interrupting instruction, it's a powerful learning activity. This resolves the tension between "assessing" and "teaching" — they are the same act when done correctly.

---

## 2. Assessment Completion Protocol: How to "Wrap Up" a Skill Teaching Segment

### The Risk: End-of-Session Assessment Feels Like an Exam

Research on test anxiety and assessment framing is consistent: **explicitly announcing a summative assessment, even a small one, triggers performance anxiety that degrades both performance and learning** (Cassady & Johnson, 2002). In CS education specifically, programming assessments trigger higher anxiety than conceptual questions (Kinnunen & Simon, 2012).

If the AI says "Before we finish, let me test you on each facet," the student shifts from a growth mindset (I'm learning) to a performance mindset (I'm being judged). This is pedagogically counterproductive.

### Research-Backed Approaches

**Option A: Cumulative assessment with targeted gap-filling (Recommended)**

The pedagogically soundest approach is:

1. **Accumulate evidence throughout the conversation** — each exchange rates the relevant facets as described in Section 1
2. **Near session end, identify unassessed or weakly-assessed facets** — these are facets where the student hasn't had an opportunity to demonstrate understanding
3. **Organically introduce those facets through teaching questions** — "We talked about X and Y, but I want to make sure you see how Z connects to them. How would you approach [scenario requiring Z]?"
4. **Do NOT frame this as a test** — frame it as completing the picture

This aligns with the IES recommendation to "interleave worked examples with exercises" (#2) — the wrap-up questions are exercises, not exams.

**Option B: Collaborative review (Alternative)**

Frame the wrap-up as a mutual review:
- "Let's see what we covered today. You showed strong understanding of [facet-1] when you [specific thing they did]. For [facet-2], you got the idea but needed a hint — want to try one more example to solidify it?"

This makes the student a partner in the assessment, not a subject of it. It also provides metacognitive benefit (IES recommendation #6: "help students allocate study time efficiently") — the student sees what they know and what still needs work.

**Option C: Implicit wrap-up via synthesis question**

Ask a single integrative question that requires multiple facets:
- "Given what we've discussed, walk me through how you'd approach [complex problem requiring facets 1, 2, and 3]."

This naturally surfaces which facets the student has internalized and which they struggle with, without the artificial feeling of a checklist.

### Recommendation for Study

**Use cumulative assessment (Option A) as the primary approach, with Option C as the wrap-up mechanism.** The AI should:

1. Track which facets have been assessed mid-conversation and at what evidence level
2. If any facets have zero or weak evidence, naturally introduce them in the final portion of the conversation
3. Close with a synthesis question or scenario that integrates multiple facets
4. Never announce "assessment mode" — the student should feel like the conversation is reaching a natural conclusion

**Critical anti-pattern to avoid:** Do NOT implement a "final diagnostic pass" that iterates through each facet with a direct question. This is an exam by another name. Even if the questions are soft-framed, the pattern of "question about A, then question about B, then question about C" creates exam-like sequential testing pressure.

---

## 3. Mastery Threshold: What Retrievability Should Count as "Mastered"?

### FSRS Default: 90% Retrievability

In the FSRS model, the default **desired retention is 90%** — meaning a card (or in our case, a facet) is scheduled for review at the point where the predicted probability of recall drops to 90%. Stability is defined as the time in days for retrievability to drop from 100% to 90% ([FSRS Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs); [Expertium](https://expertium.github.io/Retention.html)).

The FSRS documentation notes that reasonable retention values range from **70% to 97%**, with 90% as the recommended balance between recall reliability and review frequency.

### What "Mastered" Means in a Facet Context

There's an important distinction between:

1. **Initial demonstration** — the student has shown they understand the facet during a teaching session (retrievability starts at ~1.0 right after review)
2. **Durable mastery** — the student can reliably recall/apply the facet after time has passed (retrievability remains above threshold)

For the purpose of the **mastery celebration moment** (the "you've mastered this skill" event), the threshold should be based on **initial demonstration quality**, not long-term retention — because long-term retention hasn't been tested yet. The decay clock starts *after* the celebration.

### Research-Informed Threshold Recommendation

**For triggering "skill mastered" celebration: All facets must have at least one FSRS record with initial rating >= "good"**

This means:
- Each facet has been assessed at least once
- The assessment was positive (good or easy, not struggled or hard)
- The FSRS record has been created, starting the decay clock

**For ongoing "mastery status" on profile/curriculum screens: retrievability >= 0.7 (70%)**

This is a lower threshold than FSRS's 0.9 default, reflecting that:
- In educational contexts, 70% is the traditional "passing" threshold
- Facets within a skill are interdependent — if you recall 70% of facets, you likely have functional understanding
- A higher threshold (0.9) would cause mastery to "decay" very quickly after the celebration, which is demoralizing (see Section 5)

**For "needs review" warning: retrievability < 0.5 (50%)**

Below 50% predicted recall, the student is more likely to have forgotten than to remember. This is the point where review becomes urgent.

### Configurable vs. Fixed

The threshold should be **fixed for V1** with specific values chosen to match the app's educational philosophy, not exposed as a user setting. Rationale:
- Users cannot meaningfully evaluate what "70% retrievability" means for their learning
- Configurability creates analysis paralysis and removes the expert guidance the app provides
- If the threshold needs adjustment, it should be based on aggregate user data, not individual preference

Later versions could introduce adaptive thresholds based on observed student performance.

---

## 4. Celebration and Motivation: Mastery Moment Design

### Research on Gamification in Learning

The gamification literature reveals a consistent tension: **celebration must reinforce mastery, not become a substitute for it**.

A comprehensive 2024 meta-analysis (Zeng et al., 2024) found that gamification has a significant positive effect on learning outcomes when implementation fidelity is high and pedagogical objectives remain central. However, when the gamification elements (points, badges, celebrations) become the focus rather than the learning, **intrinsic motivation can actually decrease** — a well-documented phenomenon called the "overjustification effect" ([Zeng et al., 2024](https://bera-journals.onlinelibrary.wiley.com/doi/full/10.1111/bjet.13471)).

Research on gamification's influence on motivation and cognitive load (Alazemi et al., 2024) found that gamification integration has positive impacts when it reduces cognitive load and increases motivation, but **excessive reward mechanisms increase extrinsic cognitive load** and can interfere with learning ([Alazemi et al., 2024](https://www.mdpi.com/2227-7102/14/10/1115)).

### What Makes a "Level Up" Moment Motivating

Drawing from both Duolingo's documented design principles and broader gamification research:

**Effective celebration characteristics:**
1. **Brief but clear** — 2-3 seconds of visual feedback, not a modal that requires dismissal
2. **Specific, not generic** — "You mastered Power Rule Application" is better than "Great job!"
3. **Evidence-backed** — show the student *what they did* that demonstrated mastery, not just that they passed
4. **Forward-looking** — immediately suggest what's next, maintaining momentum
5. **Earned** — the celebration should only trigger when the student did real cognitive work, not after passive consumption

**Risk: Over-celebrating (trivializing mastery)**
- If every minor achievement triggers a celebration, the signal-to-noise ratio drops
- Students learn to ignore celebrations, and true mastery moments lose impact
- Duolingo learned this with their streak and XP systems — they introduced "Time Spent Learning Well" (TSLW) to ensure engagement metrics tracked quality, not just activity

**Risk: Under-celebrating (no feedback loop)**
- Without acknowledgment, the student doesn't know their practice is working
- The "I'm not making progress" feeling is one of the top reasons students abandon study tools
- The FSRS model is invisible to the student by default — without celebration, there's no confirmation that the system is tracking their learning

### Recommendation for Study

**Calibrated celebration: brief, specific, non-blocking, with immediate forward momentum.**

Specifically:
- **In-chat confirmation** when a facet is rated: subtle inline indicator (not a modal, not a toast notification — just a visual change in the conversation flow)
- **Skill mastery moment** when all facets are demonstrated: a more prominent but still inline card showing the skill name, facets mastered, and next suggested skill. Visible for ~5 seconds, auto-dismisses or is dismissable with a click. No animation that blocks interaction.
- **Session summary** on exit: comprehensive view of all progress. This is where detail belongs — the student can review at their own pace.

**Anti-patterns to avoid:**
- Confetti/particle animations (trivializes the achievement in a study context)
- Achievement badges or trophies (externalizes motivation)
- Sound effects (many students study in libraries or shared spaces)
- Full-screen modals (breaks flow, requires dismissal action)
- Multiple sequential celebrations (celebration fatigue)

**The right metaphor:** Think of a tutor nodding approvingly and saying "Good, you've got that — let's move on" rather than standing up and applauding. The acknowledgment is warm and clear, but the focus immediately shifts to what's next.

---

## 5. Decay Communication: Honest Without Demoralizing

### The Problem

The FSRS model is honest: after mastering a skill, retrievability decays over time. A skill at 100% today will be at ~90% after `S` days (where S is stability), and continues to decline. If the app celebrates mastery and then immediately shows "You're already forgetting!", the celebration is hollow.

This is a known UX challenge in spaced repetition systems. Anki users frequently report feeling overwhelmed by their review queue — the system is correct that they need to review, but the presentation creates anxiety rather than motivation.

### Research-Informed Communication Strategies

**1. Separate "Level" from "Readiness" (already planned)**

The skill architecture redesign (Q2) already made this decision: Level is permanent and always-increasing, Readiness is the honest decay signal. This is the most important design choice — it means the mastery celebration (level up) is never undermined by decay. The student gained the level; that's permanent. Readiness is a separate, lower-stakes indicator.

**2. Frame reviews as "strengthening," not "re-learning"**

Language matters enormously. Research on growth mindset in education (Dweck, 2006) shows that how progress is framed affects student motivation:

| Demoralizing framing | Motivating framing |
|---|---|
| "Your mastery is decaying" | "Review to strengthen your skills" |
| "You're forgetting this" | "A quick review will lock this in" |
| "Mastery has dropped to 70%" | "Due for review" |
| "You need to re-learn this" | "Reinforce what you've learned" |

**3. Delay the decay messaging**

At the moment of celebration, do NOT mention decay at all. The student just demonstrated competence — this is not the time for "but you'll forget." Instead:

- **At celebration:** "Skill mastered! Level up to [N]." Full stop. Celebrate the achievement.
- **Hours/days later, when the student next opens the app:** "You have 3 skills due for review. A quick session will keep them strong." This is normal, expected, part of the routine — not a buzzkill on a celebration.
- **Only on the profile/curriculum screen:** Show the readiness percentage. Students who want the honest data can see it; it's not pushed on them.

**4. Use FSRS scheduling as a positive affordance, not a warning**

"Your next review is in 3 days" is a positive message: the system is taking care of the scheduling. It's a feature, not a penalty. Position it as "We'll remind you when it's time" rather than "You'll forget in 3 days."

### CS Education Context

CS students are particularly susceptible to **imposter syndrome** and performance anxiety (Kinnunen & Simon, 2012). Decay messaging that suggests they're "losing" knowledge reinforces the feeling of not being good enough. The separation of Level (permanent) from Readiness (fluctuating) directly addresses this — the student's achievement is real and permanent, even if they need periodic review.

Programming skills have a specific decay pattern worth noting: procedural knowledge (syntax, API calls) decays faster than conceptual knowledge (algorithm design, data structure selection). The FSRS model handles this naturally through different stability values per facet, but the UX should avoid communicating this difference explicitly — telling a student "you've forgotten the syntax but still understand the concepts" can feel patronizing.

### Recommendation for Study

1. **At mastery celebration:** No mention of decay. Pure celebration with forward momentum.
2. **In session summary:** "Next review in [N] days" phrased as a helpful reminder, not a warning.
3. **On curriculum/profile screen:** Readiness percentage shown as a neutral indicator. Color coding: green (>70%), amber (50-70%), red (<50%). No text like "decaying" or "forgetting."
4. **In notification/reminder system:** "3 skills ready for review" — framed as an opportunity, not a deficit.
5. **Never:** "Your mastery of X has dropped to Y%" as a push notification or prominent warning.

---

## Summary of Recommendations

| Topic | Key Recommendation | Confidence |
|---|---|---|
| Assessment timing | Continuous stealth assessment during conversation, not checkpoints | High — strong ITS and stealth assessment research base |
| Assessment completion | Cumulative evidence with organic gap-filling, no announced "test" | High — consistent with formative assessment literature |
| Mastery threshold (celebration) | All facets rated "good" or better at least once | Medium — reasonable default, may need tuning |
| Mastery threshold (ongoing) | Retrievability >= 0.7 for "mastered" status | Medium — balances research and UX |
| Review threshold | Retrievability < 0.5 triggers "needs review" | Medium — standard in SRS literature |
| Celebration style | Brief, specific, non-blocking, no extrinsic rewards | High — consistent gamification research |
| Decay communication | Separated from celebration; framed as strengthening, not forgetting | High — growth mindset research is robust |
| Assessment protocol tone | Collaborative review, not diagnostic test | High — test anxiety research is definitive |

---

## References

### Learning Science & Assessment
- IES Practice Guide: Organizing Instruction and Study to Improve Student Learning (2007). [PDF](https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/20072004.pdf)
- Shute, V., Lu, X., & Rahimi, S. (2021). Stealth Assessment. [ERIC](https://files.eric.ed.gov/fulltext/ED612156.pdf)
- Shen, S. et al. (2024). Exploring Knowledge Tracing in Tutor-Student Dialogues. [arXiv](https://arxiv.org/html/2409.16490v1)
- Cassady, J.C. & Johnson, R.E. (2002). Cognitive Test Anxiety and Academic Performance. *Contemporary Educational Psychology*, 27(2).
- Kinnunen, P. & Simon, B. (2012). My Program is OK — Am I? Computing Freshmen's Experiences of Doing Programming Assignments. *Computer Science Education*, 22(1).
- Dweck, C.S. (2006). *Mindset: The New Psychology of Success*. Random House.
- IES: Formative Assessment and Elementary School Student Achievement. [Link](https://ies.ed.gov/rel-central/2025/01/other-21)

### Spaced Repetition & FSRS
- FSRS Algorithm Wiki — ABC of FSRS. [GitHub](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs)
- Expertium: Understanding Retention in FSRS. [Blog](https://expertium.github.io/Retention.html)
- Expertium: A Technical Explanation of FSRS. [Blog](https://expertium.github.io/Algorithm.html)
- FSRS Algorithm — The Algorithm. [GitHub Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)

### Gamification & Motivation
- Alazemi, A. et al. (2024). Enhancing Learning Engagement: A Study on Gamification's Influence on Motivation and Cognitive Load. *Education Sciences*, 14(10), 1115. [MDPI](https://www.mdpi.com/2227-7102/14/10/1115)
- Zeng, J. et al. (2024). Exploring the impact of gamification on students' academic performance: A comprehensive meta-analysis. *British Journal of Educational Technology*. [Wiley](https://bera-journals.onlinelibrary.wiley.com/doi/full/10.1111/bjet.13471)
- JETIA (2024). Enjoyment or Mastery? A Critical Evidence-Based Analysis of Dominant Outcomes in Gamified Learning. [Link](https://journal.iistr.org/index.php/JETIA/article/view/1697)
- Duolingo Achievement Badges Design. [Blog](https://blog.duolingo.com/achievement-badges/)

### Knowledge Components & Intelligent Tutoring
- SMART: Latent Skill Mining from Courseware. *JEDM*. [Link](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/552)
- Knowledge Component Attribution Problem. *JEDM*. [Link](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/755)
- Knowledge Tracing Framework for Formative Assessment. *Complex & Intelligent Systems* (2025). [Springer](https://link.springer.com/article/10.1007/s40747-025-02149-4)

---

## Output Receipt
**Agent:** Educational Research Analyst
**Step:** Step 1
**Status:** Complete

### What Was Done
Researched and documented best practices for AI-tutored facet-level assessment across five domains: assessment timing, completion protocol, mastery thresholds, celebration design, and decay communication. Synthesized findings from IES practice guides, stealth assessment research, FSRS documentation, gamification meta-analyses, and CS education literature into actionable recommendations for the study app.

### Files Deposited
- `study/knowledge/research/facet-assessment-research-2026-03-14.md` — Complete research document with five research sections, summary table, and references

### Files Created or Modified (Code)
- None (research only)

### Decisions Made
- Recommended continuous stealth assessment over checkpoint-based assessment (within specialist authority — evidence-backed recommendation)
- Recommended cumulative assessment with organic gap-filling over final diagnostic pass (within specialist authority)
- Recommended specific threshold values: 0.7 for ongoing mastery, 0.5 for review trigger (within specialist authority — flagged as configurable in future)
- Recommended fixed (not configurable) thresholds for V1 (within specialist authority)

### Flags for CEO
- **Mastery threshold values (0.7 / 0.5):** These are research-informed defaults but may need tuning based on actual student usage. CEO should approve these specific numbers or adjust.
- **Assessment protocol tone (Section 2):** Three options presented (A: cumulative gap-filling, B: collaborative review, C: synthesis question). Research recommends A with C as wrap-up mechanism. Maps to Open Question #3 in execution plan — CEO decides.
- **Celebration calibration:** Research strongly recommends against extrinsic rewards (badges, confetti, sound effects) in favor of brief, specific, non-blocking acknowledgment. This constrains the UX design in Step 2.

### Flags for Next Step
- **For Step 2 (UX Design):** Celebration must be brief (2-3 seconds), non-blocking, and specific to what the student demonstrated. No modals, no confetti, no sound effects. Frame as "tutor nodding approvingly," not "game level complete." Decay messaging must be absent from the celebration moment — defer to profile screen and review reminders.
- **For Step 3 (Architecture):** Assessment should happen per-exchange (not batched), with evidence weights varying by context type (unprompted > prompted > hinted > scaffolded). The system prompt should instruct the AI to assess facets as evidence emerges, not at designated checkpoints. The wrap-up should use a synthesis question that covers unassessed facets, not a sequential diagnostic pass.
