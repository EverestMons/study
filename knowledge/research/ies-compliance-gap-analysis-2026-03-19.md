# IES Compliance Gap Analysis — Scorecard
**Date:** 2026-03-19
**Agent:** Educational Research Analyst
**Project:** study
**Implementation Relevance:** Directly informs every AI tutoring behavior, system prompt design, practice mode logic, and scheduling architecture. Each gap maps to a specific code change or prompt modification.
**Depends On:** `knowledge/development/ies-tutor-behavior-audit-2026-03-19.md` (DEV diagnostic, Step 1)
**Do NOT re-research:** Topics from `knowledge/research/facet-assessment-research-2026-03-14.md` (assessment timing, completion protocol, mastery thresholds, celebration design, decay communication)

---

## Evidence Levels Reference (from IES Practice Guide, Table 2)

| Recommendation | IES Evidence Level |
|---|---|
| 1. Space learning over time | Moderate |
| 2. Interleave worked examples with problem-solving | Moderate |
| 3. Combine graphics with verbal descriptions | Moderate |
| 4. Connect abstract and concrete representations | Moderate |
| 5a. Use pre-questions to introduce a new topic | Low |
| 5b. Use quizzes to re-expose students to information | **Strong** |
| 6a. Delayed judgment of learning | Low |
| 6b. Use tests to identify content that needs learning | Low |
| 7. Deep explanatory questions | **Strong** |

---

## Recommendation 1: Space Learning Over Time

### IES Recommendation Summary
The IES guide recommends arranging for students to be exposed to key course concepts on at least two occasions separated by several weeks to several months. Research shows that delayed re-exposure markedly increases retention, and the cost of "overshooting" optimal spacing is much smaller than the cost of too-short spacing. Hundreds of laboratory experiments and several classroom studies support this. **Evidence level: Moderate** — strong lab evidence, limited classroom replication with K-12.

### Current Implementation Status: ✅ Strong

The app has a complete FSRS-4.5 implementation (`fsrs.js`) with 19 trained weights, desired retention 0.9, and max interval 365 days. Review scheduling surfaces in four screens (SkillPicker, CurriculumScreen, ProfileScreen, ScheduleScreen). `buildDeadlineContext()` surfaces weakest skills for upcoming deadlines. `buildCrossSkillContext()` surfaces cross-course connections with retrievability. Session history via `formatJournal()` enables continuity across sessions.

**AI tutoring context adaptation:** In a 1:1 AI tutoring system, spacing can be more precisely calibrated than in a classroom. FSRS's per-skill/per-facet scheduling is superior to the classroom recommendation of "several weeks to several months" because it adapts interval to individual student performance. The app exceeds the IES recommendation in precision.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| No within-session interleaved review | Medium | `study.js` system prompt |
| Review is opt-in (requires student initiative) | Medium | SkillPicker, CurriculumScreen |
| No expanding retrieval within a session | Low | `study.js` system prompt |
| No cumulative review in exam mode | Low | `buildFocusedContext()` |

**Gap 1: No within-session interleaved review.** When learning Skill B, the AI never weaves in a retrieval check on previously-learned Skill A. The IES guide specifically recommends "sprinkling" earlier content into current sessions. In an AI tutor, this is straightforward — the system prompt could instruct the AI to insert 1-2 brief recall questions on recently-reviewed skills during a learning session.

**Gap 2: Review is opt-in.** The "Start Review" button requires student initiative. The IES guide's classroom recommendation translates to an AI tutoring context as: the tutor should proactively raise review topics, not wait for the student to click a button. The system prompt's "shift to mastery mode" only triggers after all assignments are handled, not during active learning.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add "interleaved review" instruction to system prompt — when due skills exist, weave 1-2 recall questions into learning sessions | `study.js:buildSystemPrompt()` | High | Prompt-only |
| Add "proactive review nudge" — when due skills exceed threshold (e.g., 5+), AI mentions it early in session | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Load 1-2 due skills into focused context alongside the primary skill | `study.js:buildFocusedContext()` | Medium | Code change |

### What NOT to Change
- **FSRS-4.5 algorithm** — interval scheduling is correct and well-calibrated
- **Review banners in SkillPicker/CurriculumScreen/ProfileScreen/ScheduleScreen** — these are valuable passive surfaces
- **`buildDeadlineContext()`** — correctly surfaces weakest skills for upcoming deadlines
- **Session journal** — `formatJournal()` provides valuable continuity

---

## Recommendation 2: Interleave Worked Examples with Problem-Solving

### IES Recommendation Summary
Students should alternate between studying worked example solutions and solving problems on their own. Research shows this interleaving leads to faster learning and better post-test performance than solving problems alone. As expertise develops, worked examples should be "faded" — providing early steps and requiring students to complete later steps. Variability between examples (changing values and formats) improves transfer. **Evidence level: Moderate** — numerous lab experiments, some classroom studies in math/science/CS.

### Current Implementation Status: 🟡 Partial

Practice mode (`PracticeMode.jsx`) shows worked examples before problems for Tiers 1-3 (Predict, Fill, Write). Each problem generated by `generateProblems()` includes a `workedExample` with `{ problem, solution, keyInsight }`. The flow is: study example → click "Got It" → attempt problem. The system prompt mentions worked examples only as reactive ("Worked examples the student asked for").

**AI tutoring context adaptation:** In an AI tutor, "worked examples" naturally occur during teaching — the AI demonstrates a solution approach, then asks the student to try a similar problem. The IES recommendation maps to the tutor's dialogue pattern, not just to practice mode. The key insight: alternation should happen in the tutoring conversation itself, not only in dedicated practice mode.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| Tutoring mode has no proactive worked example instruction | High | `study.js` system prompt |
| No cross-skill interleaving in practice mode | Medium | `study.js:generateProblems()` |
| Tiers 4-6 skip worked examples entirely | Medium | `PracticeMode.jsx` |
| Example → Problem is always 1:1, not alternating | Low | `PracticeMode.jsx` |
| No "fading" of worked examples | Low | `PracticeMode.jsx` |

**Gap 1: Tutoring mode lacks proactive example-problem alternation.** The system prompt's teaching method is 60% questions, 30% teaching, 10% confirmation. It never instructs: "after teaching a concept, demonstrate a worked solution, then ask the student to solve a similar problem." This is the core IES recommendation and it's absent from the primary teaching mode.

**Gap 2: No cross-skill interleaving.** Practice mode generates 5 problems for a single skill. The IES research on interleaving (distinct from the worked-examples research) shows that mixing problems from different skills improves discrimination and transfer. This is particularly valuable in exam preparation.

**Gap 3: Tiers 4-6 no examples.** The `tier <= 3` gate means Debug, Combine, and Apply tiers have no worked examples. The IES guide recommends fading examples with expertise, not eliminating them entirely. Even advanced tiers benefit from seeing how an expert approaches a complex problem.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add "example-problem alternation" instruction to system prompt — after teaching a concept, demonstrate a solution, then ask the student to try one | `study.js:buildSystemPrompt()` | High | Prompt-only |
| Add optional worked examples for Tiers 4-6 — show "expert approach" before complex problems, faded (partial solution) | `PracticeMode.jsx`, `study.js:generateProblems()` | Medium | Code change |
| Add interleaved multi-skill practice for exam mode — mix problems from 2-3 skills | `study.js:generateProblems()` | Medium | Code change |

### What NOT to Change
- **Tiers 1-3 worked example flow** — the "study example first → attempt problem" pattern is correct
- **`generateProblems()` worked example structure** — `{ problem, solution, keyInsight }` is well-designed
- **IES Rec 2 comment annotations in PracticeMode.jsx** — keep these for traceability
- **Tier system itself** — the 6-tier progression is sound

---

## Recommendation 3: Combine Graphics with Verbal Descriptions

### IES Recommendation Summary
Adding relevant graphical presentations (graphs, figures, diagrams) to verbal descriptions leads to better learning than text alone. Text descriptions should appear near the relevant elements in visual representations. Graphics don't need to be photorealistic — sometimes abstract or schematic illustrations are more effective. In mathematics, graphics like number lines help students connect symbols to quantities. Multiple representations of the same concept help students see the deep structure. **Evidence level: Moderate** — many lab experiments, some classroom studies in math/science.

### Current Implementation Status: 🟡 Partial

The app has an image display system: `buildImageCatalog()` loads extracted images from course materials, the system prompt instructs the AI to display images inline via `[SHOW_IMAGE]` tags with verbal descriptions alongside. Image display is capped at 2 per response, 20 per catalog.

**AI tutoring context adaptation:** A K-12 classroom has whiteboards, textbooks, and physical manipulatives. An AI tutor is constrained to text and pre-extracted images. This is an inherent limitation of the text-based tutoring modality, but it can be partially mitigated by:
1. High-quality extraction of visuals from course materials (already done)
2. Verbal description of diagrams the AI cannot display
3. Eventually: AI-generated diagrams via SVG/Mermaid/LaTeX

The IES finding that "a well-chosen sequence of still pictures is often as or more effective than narrated animations" is encouraging — static extracted images may be sufficient.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| No AI-generated diagrams (SVG, Mermaid, ASCII art) | Medium | Architectural |
| No LaTeX/math rendering | Medium | `theme.jsx`, frontend |
| No guidance on WHEN to use visuals vs. text | Low | `study.js` system prompt |
| No verbal-description fallback instruction when no images exist | Low | `study.js` system prompt |

**Gap 1: No AI-generated diagrams.** The app can only display pre-extracted images. For concepts not in course materials, or for personalized explanations, the AI cannot create diagrams. This is a significant architectural gap but also a significant engineering effort. The IES finding that "abstract or schematic pictures often best illustrate a key idea" suggests that even simple ASCII art or Mermaid diagrams could help.

**Gap 2: No math rendering.** Mathematical formulas are plain text. The IES guide specifically highlights mathematical graphics (number lines, graphs of functions) as beneficial. LaTeX rendering would directly serve this recommendation.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add system prompt guidance on when to describe diagrams verbally (spatial relationships, processes, hierarchies) | `study.js:buildSystemPrompt()` | Low | Prompt-only |
| Add LaTeX/KaTeX rendering for mathematical expressions | `theme.jsx`, frontend dependencies | Medium | Code change |
| Add ASCII art / text-based diagram instruction for concepts without available images | `study.js:buildSystemPrompt()` | Low | Prompt-only |

### What NOT to Change
- **`buildImageCatalog()` system** — correctly catalogs extracted images
- **`[SHOW_IMAGE]` tag protocol** — well-designed display mechanism
- **"Include verbal description alongside image" instruction** — directly implements IES recommendation
- **2-per-response cap** — prevents visual overload (aligned with cognitive load theory)

---

## Recommendation 4: Connect Abstract and Concrete Representations

### IES Recommendation Summary
Teachers should connect abstract representations with concrete representations of the same concept. Students who learn with concrete objects show better initial understanding, but those taught with abstract representations transfer better to novel contexts. The research supports "concreteness fading" — starting with concrete representations and systematically replacing components with abstract ones. Explicitly marking relationships between different representations is critical; without guidance, students struggle to identify transferable components. **Evidence level: Moderate** — substantial lab experiments, growing number of classroom studies.

### Current Implementation Status: ✅ Strong

The system prompt has a full 4-step concreteness fading protocol: CONCRETE FIRST → BRIDGE → ABSTRACT → VARY. It includes the anti-pattern warning ("The trap: jumping straight to abstract definitions") and adaptive instruction ("When a student struggles with the abstract form, return to concrete"). Cross-skill context (`buildCrossSkillContext()`) and cross-domain content (`loadCrossDomainChunks()`) provide connections across courses and skills.

**AI tutoring context adaptation:** Concreteness fading was originally studied with physical manipulatives and computer simulations in classrooms. In an AI tutoring context, the "concrete" representation is verbal (a real-world example, a specific scenario) rather than physical. This is a limitation, but the IES finding that "explicitly marking relationships between different representations" is critical maps perfectly to what an AI tutor does — it can explicitly state "this specific example illustrates the general principle that..."

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| No enforcement or verification of fading protocol | Low | Architectural |
| Bloom's level doesn't modulate abstract/concrete balance | Medium | `study.js` system prompt |
| Cross-skill links not framed as concrete↔abstract bridges | Low | `study.js` system prompt |
| Mode-specific concrete/abstract balance missing | Low | `StudyContext.jsx:bootWithFocus()` |

**Gap 1: No enforcement.** The concreteness fading instruction exists but there's no mechanism to verify the AI follows it. However, this is inherent to LLM-based tutoring — system prompt instructions are probabilistic, not deterministic. The instruction is well-written and specific enough to be reliably followed.

**Gap 2: Bloom's-aware modulation.** The app has Bloom's taxonomy data on every facet (`[blooms: level]` in context) but doesn't instruct the AI to adjust the concrete/abstract balance based on Bloom's level. "Remember"-level facets benefit from concrete examples; "Analyze/Evaluate"-level facets from more abstract reasoning. This is a medium-priority prompt enhancement.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add Bloom's-aware concreteness instruction: "For remember/understand facets, emphasize concrete examples. For analyze/evaluate/create facets, push toward abstract reasoning sooner." | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Add instruction to use cross-skill links as concrete↔abstract bridges: "When a concept appears in multiple courses, use the concrete instance from one course to illustrate the abstract principle in another." | `study.js:buildSystemPrompt()` | Low | Prompt-only |

### What NOT to Change
- **4-step concreteness fading protocol** — comprehensive, well-designed, directly implements IES recommendation
- **Anti-pattern warning** — "The trap: jumping straight to abstract definitions" is excellent
- **Adaptive instruction** — "return to concrete when struggling, push abstract when comfortable"
- **Cross-domain content loading** — `loadCrossDomainChunks()` provides raw material for bridges
- **READING THE STUDENT skill-level adjustments** — already modulates teaching approach by mastery

---

## Recommendation 5: Use Quizzing to Promote Learning

### IES Recommendation Summary

**5a: Pre-questions (Low evidence).** Pre-questions before introducing new material help students identify what they don't know and activate prior knowledge. However, evidence is primarily from lab studies on reading comprehension. When students are required to attend to all material (not just pre-questioned topics), pre-questions improve learning of targeted content without penalizing non-targeted content.

**5b: Quizzes for retrieval practice (Strong evidence).** Taking a test directly promotes learning and reduces forgetting — the "testing effect." This is one of the most robust findings in cognitive science. Active recall (fill-in-the-blank, short-answer) is more effective than recognition (multiple-choice). Having students take a test is "almost always a more potent learning device than having students spend additional time studying." Corrective feedback should be provided after quizzes. **Evidence level: Strong** — nine K-12 studies, 30+ college studies, hundreds of lab experiments.

### Current Implementation Status: ✅ Strong (with notable gaps)

**5a implementation:** Full PRE-QUESTION PHASE in system prompt with examples, purpose statement, and handling for "I don't know." Skill mode hint in `bootWithFocus()`: "Start by asking a diagnostic question to find where their understanding breaks down."

**5b implementation:** Practice mode is a complete retrieval practice system — closed-book, 6-tier difficulty, corrective feedback, 4/5 pass threshold. The system prompt enforces 60% question ratio in tutoring. Stealth assessment via `buildFacetAssessmentBlock()` enables continuous embedded quizzing. Context tags distinguish evidence quality (diagnostic, transfer, guided, scaffolded, explained).

**AI tutoring context adaptation:** The IES recommendation was written for classrooms where quizzes are discrete events. In an AI tutor, every exchange can be a quiz — the 60% question ratio effectively implements continuous retrieval practice. This is superior to the classroom recommendation. The distinction between "formal quiz" and "conversation question" dissolves in the AI tutor context.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| Pre-questions are prompt-only (no structural enforcement) | Low | Acceptable for LLM tutor |
| No spaced retrieval within a single session | Medium | `study.js` system prompt |
| Closed-book retrieval only in practice mode, not tutoring | Low | By design |
| No pre-assessment warm-up in practice mode | Low | `PracticeMode.jsx` |

**Gap 1: Pre-question enforcement.** The system prompt instructs pre-questions but can't guarantee them. This is acceptable — the instruction is specific and well-placed. Adding structural enforcement (e.g., blocking teaching until a diagnostic is answered) would reduce the tutor's flexibility.

**Gap 2: No within-session spaced retrieval.** During a 25-minute session, the AI never circles back to ask about a concept discussed 10 minutes earlier. IES 5b specifically emphasizes re-exposure through quizzing. A prompt instruction like "if you taught a concept earlier in this session, briefly quiz the student on it before moving to new material" would address this.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add within-session retrieval instruction: "If you taught a concept earlier in this conversation, circle back with a brief recall question before closing the session" | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Add corrective feedback emphasis: "When a student answers incorrectly, always provide the correct answer with explanation before moving on" (IES explicitly requires this) | `study.js:buildSystemPrompt()` | Low | Prompt-only |

### What NOT to Change
- **PRE-QUESTION PHASE** — comprehensive, research-cited, with good "I don't know" handling
- **60% question ratio** — directly implements IES 5b in tutoring context
- **6-tier practice mode** — full retrieval practice system with escalating difficulty
- **Stealth assessment protocol** — see `facet-assessment-research-2026-03-14.md` (resolved design)
- **Evidence quality tagging** — diagnostic/transfer/guided/scaffolded/explained hierarchy
- **Closed-book practice mode** — IES explicitly recommends closed-book quizzes

---

## Recommendation 6: Help Students Allocate Study Time Efficiently

### IES Recommendation Summary

**6a: Delayed judgment of learning (Low evidence).** Students should assess their mastery AFTER a delay, not immediately after studying. Immediate judgments produce an "illusion of knowing" — students overestimate their retention. The "cue-only delayed JOL" technique (seeing just the question without the answer, after a delay) produces highly accurate self-assessment. Students should judge "how likely am I to get this right on a test tomorrow?" — the delay component is critical.

**6b: Use tests to identify what needs learning (Low evidence).** Quizzes help students identify what they don't know, enabling more effective study time allocation. Students who can accurately identify weak areas and focus study there outperform those who study randomly. Corrective feedback pointing students to where answers can be found is important.

### Current Implementation Status: 🟡 Partial

**6a implementation:** Confidence calibration in practice mode (`PracticeMode.jsx`) with 1-5 scale before answering. Post-answer calibration feedback comparing confidence to performance. However, this is IMMEDIATE judgment (before answering), not DELAYED judgment (after time has passed).

**6b implementation:** Strong surfaces for identifying weak areas: CurriculumScreen (readiness per assignment, weakest skills), ProfileScreen (retrievability %, mastery criteria), ScheduleScreen (temporal urgency), SkillPicker (strength bands with deadline sorting). The AI system prompt prioritizes assignments by deadline.

**AI tutoring context adaptation:** The IES "delayed JOL" technique is designed for self-study contexts (flashcards, reading). In an AI tutor, the equivalent is: the AI asks "before we start, how well do you think you remember X from last time?" — this is a delayed judgment (time has passed since last session) using a cue-only format (the AI names the topic without showing the answer). The app's confidence calibration in practice mode is close but timing is wrong — it's pre-answer, not post-delay.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| Confidence rating is immediate, not delayed | Medium | `PracticeMode.jsx`, system prompt |
| App doesn't teach students HOW to study | Medium | `study.js` system prompt |
| No time allocation guidance | Low | Architectural |
| Confidence calibration only in practice mode, not tutoring | Medium | `study.js` system prompt |

**Gap 1: Immediate vs. delayed JOL.** The IES research specifically shows that immediate judgments produce "illusion of knowing." The pre-problem confidence rating in practice mode is immediate — the student hasn't had time to forget. A delayed JOL would be: at session start, before any teaching, ask "how confident are you that you still remember X from our last session?" This maps naturally to the pre-question phase.

**Gap 2: No study strategy teaching.** The app directs WHAT to study (deadline intelligence, weakness identification) but never teaches HOW to study. The IES guide emphasizes that students need explicit instruction in metacognitive strategies. An AI tutor is uniquely positioned to model good study habits — it could occasionally say "notice how you felt confident but got it wrong? That's called the 'illusion of knowing' — next time, try testing yourself after a delay."

**Gap 3: Confidence in tutoring mode.** During tutoring sessions, the AI never asks students to self-assess confidence on skills being discussed. The system prompt's READING THE STUDENT section adjusts by skill level but doesn't engage the student in self-assessment.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| Add delayed JOL to session start: "For returning skills, ask 'How well do you think you remember X?' before any teaching — this calibrates both you and the student" | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Add occasional metacognitive coaching: "When a student shows overconfidence (high confidence + wrong answer), briefly explain the 'illusion of knowing' and suggest delayed self-testing" | `study.js:buildSystemPrompt()` | Low | Prompt-only |
| Add confidence check in tutoring mode for key concepts: "Before moving to a new topic, ask 'How solid do you feel on that?'" | `study.js:buildSystemPrompt()` | Low | Prompt-only |

### What NOT to Change
- **Practice mode confidence calibration** — correct implementation of immediate JOL (still valuable, just incomplete)
- **Post-answer calibration feedback** — "Good calibration" / "You did better than expected" messages are excellent
- **CurriculumScreen readiness dashboard** — directly implements 6b (identifying what needs learning)
- **ProfileScreen mastery detail** — enables student self-assessment of strengths and weaknesses
- **ScheduleScreen urgency coding** — visual allocation guidance
- **Deadline intelligence in system prompt** — correctly prioritizes study allocation
- See `facet-assessment-research-2026-03-14.md` for mastery thresholds (0.7 ongoing, 0.5 review trigger) — already resolved

---

## Recommendation 7: Deep Explanatory Questions

### IES Recommendation Summary
After students have acquired basic knowledge, teachers should ask deep questions that prompt explanations appealing to causal mechanisms, planning, arguments, and logic. Deep question types include: why, why-not, how, what-if, how does X compare to Y, and what is the evidence for X? Students should be encouraged to "think aloud" and receive feedback on their explanations. Challenging students' prior beliefs is particularly effective. Crucially, deep questions should come AFTER basic knowledge is established — students need sufficient foundation before deep questioning benefits them. **Evidence level: Strong** — dozen+ K-12 studies, dozen+ college studies, extensive lab evidence. This is one of the two strongest-supported recommendations in the guide.

### Current Implementation Status: ❌ Weak

The system prompt has "Ask 'why' more than 'what'" for high-performing students and mentions "elaborative interrogation" in exam mode only. Bloom's taxonomy data exists on every facet but is never used to influence question types. The assessment protocol uses synthesis questions only as a last resort ("near the end, if unassessed facets remain"). Practice mode tiers 5-6 (Combine, Apply) require deep application but this is in problem generation, not tutoring dialogue.

**AI tutoring context adaptation:** This is the recommendation where an AI tutor has the LARGEST natural advantage over a classroom. A human teacher asking deep questions to 30 students must manage time across all of them. An AI tutor is 1:1 — it can ask deep questions to every student, wait for them to think, and provide individualized feedback on their explanations. The IES emphasis on "modeling" deep question-asking behavior maps directly to the AI demonstrating how to think about a concept before asking the student to do the same.

The IES caveat — deep questions should come after basic knowledge — maps to the existing Bloom's data on facets. "Remember" and "Understand" facets need foundational questions; "Analyze," "Evaluate," and "Create" facets are ready for deep questioning.

### Gap Analysis

| Gap | Severity | Component |
|---|---|---|
| No deep question type taxonomy in system prompt | **High** | `study.js:buildSystemPrompt()` |
| Bloom's data doesn't influence question types | **High** | `study.js:buildSystemPrompt()` |
| No shallow→deep scaffolding within a skill | Medium | `study.js:buildSystemPrompt()` |
| Synthesis questions only as assessment fallback | Medium | `study.js:buildSystemPrompt()` |
| No "think aloud" encouragement | Low | `study.js:buildSystemPrompt()` |
| "Elaborative interrogation" only in exam mode | Medium | `StudyContext.jsx:bootWithFocus()` |

**Gap 1: No deep question type taxonomy.** The system prompt never lists the IES question types (why, how, what-if, compare, evidence-for). This is a critical omission because Rec 7 has **Strong** evidence — it's one of the two best-supported recommendations in the entire guide, yet has the weakest implementation in the app.

**Gap 2: Bloom's data is unused for question generation.** Every facet carries a `[blooms: level]` tag in the AI context. The system prompt never says: "For analyze-level facets, ask 'why does this work?' For evaluate-level facets, ask 'what is the evidence for X?' For create-level facets, ask 'how would you design a solution to Y?'" This is a high-impact, low-effort prompt enhancement — the data infrastructure already exists.

**Gap 3: No shallow→deep progression.** The IES guide explicitly states: deep questions should come after foundational knowledge is established. The system prompt should instruct: "For new/weak skills, start with recall and understanding questions. As the student demonstrates competence, escalate to why, how, and what-if questions." This maps to the existing READING THE STUDENT section but needs explicit question-type guidance.

### Recommendations

| Action | Scope | Priority | Type |
|---|---|---|---|
| **Add deep question type taxonomy to system prompt** — list IES question types (why, how, what-if, compare, evidence-for, what-caused) and instruct the AI to use them | `study.js:buildSystemPrompt()` | **High** | Prompt-only |
| **Add Bloom's→question type mapping** — "For remember: what/when/who. For understand: explain/describe. For apply: how would you use. For analyze: why/how does this compare. For evaluate: what evidence/which is better. For create: design/propose/what-if." | `study.js:buildSystemPrompt()` | **High** | Prompt-only |
| Add shallow→deep scaffolding instruction: "Start with recall questions on new skills. Escalate to deep questions as the student demonstrates foundational knowledge." | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Add "think aloud" encouragement: "Ask students to explain their reasoning, not just give answers. 'Walk me through your thinking' is more valuable than 'What's the answer?'" | `study.js:buildSystemPrompt()` | Medium | Prompt-only |
| Extend "elaborative interrogation" from exam mode to all modes | `StudyContext.jsx:bootWithFocus()` | Low | Prompt-only |

### What NOT to Change
- **Bloom's taxonomy data on facets** — the infrastructure is correct, just underutilized
- **READING THE STUDENT skill-level adjustments** — good foundation for escalation
- **Practice mode tiers 5-6** — Combine and Apply tiers implement deep application in practice
- **Assessment protocol synthesis questions** — keep as assessment wrap-up mechanism
- **BLOOMS_MULTIPLIERS** — evidence weighting by Bloom's level is correctly calibrated

---

## Cross-Cutting Analysis

### Overall Compliance Score

| Recommendation | Evidence Level | Implementation | Rating |
|---|---|---|---|
| 1. Spacing | Moderate | ✅ Strong | 8/10 |
| 2. Worked examples | Moderate | 🟡 Partial | 5/10 |
| 3. Graphics + verbal | Moderate | 🟡 Partial | 5/10 |
| 4. Abstract + concrete | Moderate | ✅ Strong | 8/10 |
| 5a. Pre-questions | Low | ✅ Strong | 9/10 |
| 5b. Retrieval quizzing | **Strong** | ✅ Strong | 8/10 |
| 6a. Delayed JOL | Low | 🟡 Partial | 4/10 |
| 6b. Test-identified gaps | Low | ✅ Strong | 8/10 |
| 7. Deep questions | **Strong** | ❌ Weak | 3/10 |

**Weighted overall: 6.2/10** (weighting Strong evidence recs 2x)

The app excels at infrastructure (FSRS scheduling, facet data model, retrieval practice system, pre-question protocol, gap identification dashboards) but underperforms on the two **Strong** evidence recommendations where it has the most room for improvement: deep explanatory questions (Rec 7) and within-session retrieval practice (Rec 5b enhancement).

### Top 3 Highest-Impact Gaps

**1. Bloom's-aware deep question types (Rec 7) — HIGH PRIORITY**
- **Why:** Strong evidence, weakest implementation, largest natural advantage for AI tutoring
- **Effort:** Prompt-only (15-20 lines added to `buildSystemPrompt()`)
- **Impact:** Transforms every tutoring session from recall-focused to understanding-focused
- **Data ready:** Bloom's level already on every facet in context (`[blooms: level]`)

**2. Example-problem alternation in tutoring mode (Rec 2) — MEDIUM-HIGH PRIORITY**
- **Why:** Moderate evidence, completely absent from primary teaching mode
- **Effort:** Prompt-only (5-10 lines added to YOUR TEACHING METHOD section)
- **Impact:** Every tutoring session gains structured worked-example flow

**3. Within-session interleaved review (Rec 1 + 5b) — MEDIUM PRIORITY**
- **Why:** Combines two recommendations (moderate + strong evidence)
- **Effort:** Prompt instruction + minor context loading change
- **Impact:** Sessions become more retentive; review stops being a separate activity

### Quick Wins (Prompt-Only Changes)

These changes require modifying only `study.js:buildSystemPrompt()` — no code changes, no schema changes, no new dependencies:

1. **Deep question type taxonomy + Bloom's mapping** (Rec 7) — ~20 lines
2. **Example-problem alternation instruction** (Rec 2) — ~8 lines
3. **Within-session retrieval instruction** (Rec 1 + 5b) — ~5 lines
4. **Delayed JOL at session start** (Rec 6a) — ~5 lines
5. **"Think aloud" encouragement** (Rec 7) — ~3 lines
6. **Shallow→deep scaffolding** (Rec 7) — ~5 lines

**Total: ~46 lines of prompt text** could address most gaps from the three highest-priority recommendations and elevate the weighted score from 6.2 to approximately 8.0.

### Architectural Gaps (Require Code Changes)

These gaps cannot be addressed through prompt changes alone:

1. **LaTeX/KaTeX rendering** (Rec 3) — requires frontend dependency, `theme.jsx` changes
2. **Multi-skill interleaved practice** (Rec 2) — requires `generateProblems()` to accept multiple skills
3. **Loading due skills into focused context** (Rec 1) — requires `buildFocusedContext()` modification
4. **Worked example fading for Tiers 4-6** (Rec 2) — requires `PracticeMode.jsx` UI changes
5. **AI-generated diagrams** (Rec 3) — requires SVG/Mermaid rendering infrastructure

None of these architectural gaps are urgent — the prompt-only quick wins should be prioritized first.

### AI Tutoring Context: Where IES Recommendations Need Adaptation

The IES Practice Guide was written for K-12 classroom instruction. Several recommendations require reinterpretation for 1:1 AI tutoring:

| IES Concept | Classroom Context | AI Tutor Adaptation |
|---|---|---|
| Spacing over time | Teacher plans review sessions weeks apart | FSRS automatically schedules per-skill reviews at optimal intervals — superior to classroom |
| Worked examples on paper | Homework alternates examples and problems | AI demonstrates solution in conversation, then asks student to try — natural dialogue flow |
| Graphics | Textbook figures, whiteboard drawings | Pre-extracted images from course materials + verbal descriptions as fallback |
| Pre-questions before a lesson | Teacher poses questions at start of class | AI asks diagnostic questions at start of skill session — implemented |
| Delayed JOL | Student self-tests after a delay at home | AI asks "how well do you remember X?" at start of return session |
| Deep questions to a class | Teacher asks one student, class discusses | AI asks every student, waits for individual response, gives individualized feedback — superior |
| Cumulative exams | Teacher creates end-of-semester exam | Exam mode with interleaved multi-skill practice |

**Key insight:** The AI tutor's largest advantages over classroom instruction are in Recommendations 5 (every exchange is a quiz) and 7 (1:1 deep questioning). These should be the highest investment areas.

---

## Output Receipt
**Agent:** Educational Research Analyst
**Step:** Step 2
**Status:** Complete

### What Was Done
Comprehensive IES compliance gap analysis for the study app. Read the IES Practice Guide PDF (all 7 recommendations with evidence levels), the DEV diagnostic from Step 1, and the facet assessment research. Produced a scorecard with per-recommendation analysis (IES summary, evidence level, current status, gaps, actionable recommendations, preservation notes). Included cross-cutting analysis with overall weighted score (6.2/10), top 3 gaps, 6 prompt-only quick wins (~46 lines), and 5 architectural gaps. Adapted all IES recommendations for AI tutoring context.

### Files Deposited
- `knowledge/research/ies-compliance-gap-analysis-2026-03-19.md` — Full IES compliance scorecard with 7-recommendation analysis and cross-cutting analysis

### Files Created or Modified (Code)
- None (analysis only)

### Decisions Made
- Classified Rec 7 (Deep Questions) as the #1 highest-impact gap — Strong evidence, weakest implementation, largest AI tutoring advantage, addressable with prompt-only changes
- Classified overall weighted score as 6.2/10, achievable 8.0/10 with ~46 lines of prompt changes
- Identified that all 6 prompt-only quick wins target `study.js:buildSystemPrompt()` — single file, minimal risk
- Did NOT re-research assessment timing, completion protocol, mastery thresholds, celebration design, or decay communication (deferred to `facet-assessment-research-2026-03-14.md`)

### Flags for CEO
- **Rec 7 is the critical gap.** Strong IES evidence, weakest implementation, highest potential for AI tutor differentiation. ~20 lines of prompt text (Bloom's→question type mapping + deep question taxonomy) would transform tutoring quality.
- **Quick wins are concentrated.** All 6 prompt-only improvements target one function (`buildSystemPrompt()`). A single focused session could implement all of them.
- **Architectural gaps are non-urgent.** LaTeX rendering, multi-skill practice, and diagram generation are valuable but not blocking — prompt changes deliver more IES compliance per effort.

### Flags for Next Step
- All high-priority recommendations are prompt-only changes to `buildSystemPrompt()` in `study.js` (starts at line ~1634). The system prompt is a single concatenated string — modifications should target specific labeled sections (YOUR TEACHING METHOD, READING THE STUDENT, ASSESSMENT PROTOCOL).
- Bloom's→question type mapping requires that `[blooms: level]` tags are present in facet assessment context — verify this is true for all session types by checking `buildFacetAssessmentBlock()`.
- The "within-session retrieval" instruction should reference `formatJournal()` session history to know which concepts were covered earlier in the session — currently, the AI only has the message history, not a structured list of concepts covered.
