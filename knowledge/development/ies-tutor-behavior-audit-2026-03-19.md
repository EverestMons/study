# IES Teaching Principles Audit — DEV Diagnostic
**Date:** 2026-03-19
**Agent:** Study Developer
**Task:** Investigate how the AI tutor currently implements (or fails to implement) each of the 7 IES Practice Guide recommendations.

---

## IES Rec 1 — Space Learning Over Time

### What Exists Today

**FSRS scheduling** (`src/lib/fsrs.js`):
- Full FSRS-4.5 implementation with 19 trained weights (lines 21-28).
- `DESIRED_RETENTION = 0.9` — reviews scheduled when recall probability drops to 90% (line 37).
- `MAX_INTERVAL = 365` days (line 40).
- `retrievability(t, s)` computes forgetting curve: `R(t, S) = (1 + F * t/S)^C` (line 59).
- `reviewCard()` produces next review date via `interval(s)` (line 67-70).
- Rating map: struggled=Again(1), hard=Hard(2), good=Good(3), easy=Easy(4) (lines 46-51).
- Stability update formulas include difficulty penalty, stability saturation, retrievability saturation, hard penalty, and easy bonus (lines 84-93).

**Review scheduling surfaces**:
- **SkillPicker** (`src/components/study/SkillPicker.jsx`, lines 114-128): Calculates `dueSkills` by comparing `reviewDate` to today. Shows "X skills due for review" banner with "Start Review" button that boots the most urgent (lowest retrievability) skill.
- **CurriculumScreen** (`src/screens/CurriculumScreen.jsx`, lines 143-148): `handleStartReview()` loads `dueReviews` from `Assignments.getReviewDueSkills()`, shows "X skills due for review" banner with "Start Review" button.
- **ProfileScreen** (`src/screens/ProfileScreen.jsx`, lines 201-229): Shows "Review X Due Skills" button when sub-skills are due. Individual sub-skills show "DUE" badges and `isDue` indicators (line 285).
- **ScheduleScreen** (`src/screens/ScheduleScreen.jsx`, lines 378-400): Summary bar shows `dueReviewCount` badge with "due for review" label. Links to Curriculum for review actions.

**System prompt references to previously-learned material** (`src/lib/study.js`, `buildSystemPrompt()`, line 1634):
- "Breakthrough last session: Build on it. 'You nailed [X]. Today extends that.'" — SESSION HISTORY section.
- `formatJournal()` (lines 1616-1631) includes past session topics, skill updates, struggles, wins, and where the student left off.
- `buildDeadlineContext()` (lines 55-136) surfaces weakest skills for upcoming deadlines.
- `buildCrossSkillContext()` (lines 143-218) surfaces cross-course concept links with retrievability.

**Re-exposure mechanisms**:
- `bootWithFocus()` in StudyContext (line 1075-1098) computes `dueForReview` and `weakSkills` at session start, appending a `STUDENT SKILL STATUS` block that flags skills due for review: "DUE FOR REVIEW: [names]" with instruction "Be direct about gaps."
- The ASSIGNMENT-FIRST PRIORITY section of the system prompt says: "When all assignments are handled, shift to mastery mode. Find skills where they struggled or scraped by."

### Relevant System Prompt Text

> "When all assignments are handled, shift to mastery mode. Find skills where they struggled or scraped by. Go back and build real depth."

> "Breakthrough last session: Build on it. 'You nailed [X]. Today extends that.'"

> "Be direct about gaps. If skills are due for review, mention it. Students benefit from knowing where they stand."

### Gap Assessment

1. **No interleaved review during new learning.** When a student is learning Skill B, the system never prompts the AI to weave in a quick retrieval check on previously-learned Skill A. Spacing only happens BETWEEN sessions (via FSRS scheduling), not WITHIN sessions.
2. **No expanding retrieval practice.** The system schedules reviews but doesn't instruct the AI to use expanding intervals within a session (ask about concept after 5 min, then 15 min, then 30 min).
3. **Review is opt-in.** The "Start Review" button requires student initiative. There is no mechanism that automatically incorporates review into new-learning sessions.
4. **No cumulative review.** When studying for Exam mode, all skills are loaded but there's no instruction to revisit older material alongside new content.

---

## IES Rec 2 — Interleave Worked Examples with Problem-Solving

### What Exists Today

**Practice mode worked examples** (`src/components/study/PracticeMode.jsx`, lines 133-163):
- For Tiers 1-3 (Predict, Fill, Write), the UI shows a worked example BEFORE the student sees the actual problem.
- Flow: Step 1 "Study This Example First" → shows `workedExample.problem`, `workedExample.solution`, `workedExample.keyInsight` → student clicks "Got It - Show Me the Problem" → Step 2 "Now Try This One".
- For Tiers 4-6 (Debug, Combine, Apply), no worked example is shown (`tier <= 3` gate at line 134).

**Problem generation includes worked examples** (`src/lib/study.js`, `generateProblems()`, lines 1806-1809):
- Each generated problem includes a `workedExample` object: `{ problem, solution, keyInsight }`.
- Prompt specifies: "workedExample must be DIFFERENT from prompt - same concept, different scenario" and "workedExample.solution shows work step by step, not just the answer."
- Comment at line 133: `{/* IES Rec 2: Worked Example (Tiers 1-3 only, before attempting problem) */}` — explicitly coded as IES implementation.

**System prompt — no worked example instructions for tutoring mode:**
- The system prompt's "YOUR TEACHING METHOD" section (lines 1634+) describes an ask-first-teach-second approach but never instructs the AI to alternate between showing worked solutions and asking students to solve similar problems.
- No instruction like "after teaching a concept, show a worked example, then ask the student to solve a similar problem."

### Relevant System Prompt Text

> "When to go medium (1-2 short paragraphs): Teaching a specific concept AFTER diagnosing the gap. Worked examples the student asked for."

This only mentions worked examples as reactive (student-requested), not as a proactive teaching strategy.

### Gap Assessment

1. **Worked examples only exist in practice mode, not in tutoring mode.** During AI-guided dialogue (the "Learn" path), the system prompt doesn't instruct the AI to proactively alternate between showing solutions and posing problems.
2. **No interleaving across skills within practice.** Practice mode is single-skill: all 5 problems target the same skill. IES recommends interleaving problems from different skills to improve discrimination and transfer.
3. **Tiers 4-6 have no worked examples.** The gate `tier <= 3` means Debug/Combine/Apply tiers jump straight to problems. Higher-difficulty problems arguably need examples more.
4. **Example → Problem is always the order.** IES suggests alternating (example, problem, example, problem). Current flow shows one example then one problem, then moves to the next problem with no further examples.

---

## IES Rec 3 — Combine Graphics with Verbal Descriptions

### What Exists Today

**Image display system** (`src/lib/study.js`, `buildImageCatalog()`, lines 1288-1310):
- `buildImageCatalog()` loads images from `MaterialImages.getByCourse()` and builds an `AVAILABLE VISUALS` catalog in the context. Each image has `shortId`, `image_type`, `caption`, `page_or_slide_number`.
- Capped at 20 images per course.

**System prompt IMAGE DISPLAY section** (line 1634, near the end of `buildSystemPrompt()`):
- Instructs the AI to display images inline using `[SHOW_IMAGE]img_id[/SHOW_IMAGE]` tags.
- Rules: only use IDs from AVAILABLE VISUALS, show when helpful for understanding, include verbal description alongside image, maximum 2 per response.

**Image tag parser** (`src/lib/study.js`, `parseImageTags()`, lines 1704-1712):
- Extracts `[SHOW_IMAGE]img_xxx[/SHOW_IMAGE]` tags from responses for rendering.

**Markdown rendering** (`src/lib/theme.jsx`):
- `renderMd()` converts markdown to HTML with streaming-safe tag stripping. No SVG/LaTeX/chart rendering.

### Relevant System Prompt Text

> "When you reference a visual from the course materials — a slide, diagram, figure, or page — and the AVAILABLE VISUALS section lists a matching image, display it inline: [SHOW_IMAGE]img_id[/SHOW_IMAGE]"

> "Show an image when it would help the student understand what you're teaching."

> "Include a brief verbal description alongside the image so the student knows what to focus on."

### Gap Assessment

1. **No AI-generated diagrams.** The system can only display pre-extracted images from course materials. It cannot generate new diagrams, flowcharts, concept maps, or visual aids.
2. **No LaTeX/math rendering.** Mathematical formulas are displayed as plain text. No MathJax/KaTeX integration.
3. **No SVG/Mermaid support.** The AI cannot create on-the-fly diagrams (e.g., flowcharts, state diagrams, data structure visualizations).
4. **No instruction about WHEN to use visuals vs. text.** The system prompt says "when it would help" but doesn't guide the AI on which concepts benefit most from visual representation (e.g., spatial relationships, processes, hierarchies).
5. **Image catalog is limited to extracted images.** If no images were extracted from course materials, the AI has zero visual capability. The system does not tell the AI to describe diagrams verbally as a fallback (though it says "describe it verbally instead" if no matching visual exists).

---

## IES Rec 4 — Connect Abstract and Concrete Representations

### What Exists Today

**CONCRETENESS FADING section in system prompt** (`src/lib/study.js`, `buildSystemPrompt()`, line 1634):
- Full 4-step concreteness fading protocol:
  1. CONCRETE FIRST — Start with tangible, relatable examples from course materials.
  2. BRIDGE — Connect concrete to underlying principle.
  3. ABSTRACT — State the general rule/formula/concept.
  4. VARY — Give a different concrete example to show transfer.
- Includes explicit anti-pattern: "The trap: jumping straight to abstract definitions."
- Includes adaptive instruction: "When a student struggles with the abstract form, return to concrete. When they handle concrete easily, push toward abstract."

**Cross-skill context** (`src/lib/study.js`, `buildCrossSkillContext()`, lines 143-218):
- Surfaces connections between skills across courses: `same_concept`, `prerequisite`, `related`.
- Links include retrievability and tier data, enabling the AI to reference concrete instances of abstract principles in other domains.

**Cross-domain content loading** (`src/lib/study.js`, `loadCrossDomainChunks()`, lines 900-965):
- Loads content from linked facets in other courses via `FacetConceptLinks`.
- Provides cross-domain chunks labeled with `linkedFacetName` and `linkType` — enabling the AI to draw on concrete examples from other contexts.

**Focus type prompts** (`src/StudyContext.jsx`, `bootWithFocus()`, lines 1101-1118):
- Assignment mode: "teach the prerequisite SKILLS" — focused on concrete skill gaps.
- Skill mode: "Start by asking a diagnostic question to find where their understanding breaks down."
- Exam mode: "Ask questions that test understanding at increasing difficulty" — no explicit abstract/concrete guidance.

### Relevant System Prompt Text

> "CONCRETENESS FADING: When teaching abstract concepts, follow this research-backed progression: 1. CONCRETE FIRST. Start with a specific, tangible example... 2. BRIDGE. Connect the concrete to the underlying principle... 3. ABSTRACT. Now state the general rule... 4. VARY. Give a different concrete example to show the principle transfers."

> "The trap: jumping straight to abstract definitions. Students can memorize abstractions without understanding them. Concrete-first builds genuine comprehension."

### Gap Assessment

1. **No enforcement or verification of concreteness fading.** The instruction exists in the system prompt but there's no mechanism to verify the AI actually follows it. No structural enforcement (e.g., requiring concrete examples before abstract statements).
2. **No Bloom's-aware concreteness.** The system has Bloom's taxonomy data on facets but doesn't use it to modulate the concrete/abstract balance. "Remember"-level facets might benefit from more concrete examples; "Analyze"-level facets from more abstract reasoning.
3. **Focus type prompts don't vary abstract/concrete balance.** Assignment, skill, and exam modes all use the same concreteness fading instruction. Exam prep could benefit from more abstract pattern recognition; assignment work from more concrete application.
4. **Cross-skill connections exist but aren't framed as concrete↔abstract bridges.** The CROSS-SKILL CONNECTIONS and CROSS-DOMAIN REFERENCES are loaded into context but the system prompt doesn't instruct the AI to use them specifically as concrete instances of abstract principles.

---

## IES Rec 5 — Use Quizzing to Promote Learning

### What Exists Today

**5a: Pre-questions** (`src/lib/study.js`, `buildSystemPrompt()`, line 1634):
- Full PRE-QUESTION PHASE section in system prompt:
  - "When a student first engages with a skill — whether starting fresh or returning after time away — open with 1-2 quick diagnostic questions BEFORE any teaching."
  - Explicit examples: "What does [key term] mean to you?", "Quick check: how would you explain [concept]?"
  - States purpose: "This is research-backed: pre-questions activate prior knowledge and focus attention."
  - Includes handling for "I don't know": "that's useful data. Start from the ground floor."

**5b: Retrieval practice in practice mode** (`src/components/study/PracticeMode.jsx`):
- Closed-book: No hints or material visible during problem-solving. Code editor disabled until confidence is rated (line 246).
- Corrective feedback: After submission, evaluation returns `{ passed, feedback }` (line 270-281). Feedback text displayed with pass/fail indicator (lines 343-368).
- 6-tier system with escalating difficulty: Predict → Fill → Write → Debug → Combine → Apply.
- 4/5 pass threshold to advance tiers (line 1899 in study.js).
- Practice is source-tagged (`source: 'practice'`) and carries full FSRS weight (sourceWeight = 1.0, line 261 in study.js).

**Stealth assessment / facet assessment block** (`src/lib/study.js`, `buildFacetAssessmentBlock()`, lines 1223-1283):
- Exposes facets to the AI with mastery state and mastery criteria.
- System prompt ASSESSMENT PROTOCOL section: "Assess facets continuously during teaching — each exchange is evidence. Do NOT save assessment for the end or announce you are assessing."
- "Near the end, if unassessed facets remain, introduce them through a synthesis question requiring multiple facets."
- "Never iterate through facets one-by-one and never announce assessment mode."

**Embedded quizzing during tutoring** (`buildSystemPrompt()`, YOUR TEACHING METHOD):
- "Most of your responses should be questions, not explanations."
- "The ratio should be roughly: 60% of your messages are questions, 30% are short teaching, 10% are confirmations or redirects."
- Diagnostic context tags (lines in system prompt): `diagnostic` = "answered a cold question without any teaching first."
- Rating system distinguishes between `diagnostic` (cold recall), `transfer` (applied in new context), `guided` (1-2 hints), `scaffolded` (3+ hints), `explained` (just listened).

### Relevant System Prompt Text

> "PRE-QUESTION PHASE: When a student first engages with a skill — whether starting fresh or returning after time away — open with 1-2 quick diagnostic questions BEFORE any teaching. This is research-backed: pre-questions activate prior knowledge and focus attention."

> "ASSESSMENT PROTOCOL: Assess facets continuously during teaching — each exchange is evidence. Do NOT save assessment for the end or announce you are assessing. Near the end, if unassessed facets remain, introduce them through a synthesis question requiring multiple facets. Never iterate through facets one-by-one and never announce assessment mode."

> "The ratio should be roughly: 60% of your messages are questions, 30% are short teaching, 10% are confirmations or redirects."

### Gap Assessment

1. **Pre-questions are prompt-only.** There's no structural enforcement. The AI could skip pre-questions and jump to teaching. No mechanism verifies pre-questions actually happen.
2. **No pre-questions in practice mode.** Practice mode jumps directly to problems (with optional worked example). No warm-up or pre-assessment before the timed problem set.
3. **Retrieval practice is only in dedicated practice mode.** During tutoring sessions ("Learn" path), the system prompt encourages questions but doesn't enforce closed-book retrieval. The student always has context available (the tutor can provide hints, rephrase, etc.).
4. **No spaced retrieval within a single session.** No mechanism asks about a concept, moves on, then returns to it 10 minutes later within the same session.

---

## IES Rec 6 — Help Students Allocate Study Time Efficiently

### What Exists Today

**Metacognition — confidence calibration** (`src/components/study/PracticeMode.jsx`, lines 177-218):
- IES Rec 6a explicitly implemented: "Before you start: How confident are you?" with 1-5 scale (Lost/Shaky/Maybe/Good/Easy).
- Comment: `{/* IES Rec 6a: Confidence Rating (before allowing answer) */}`.
- Post-answer calibration feedback (lines 353-364): Compares predicted confidence to actual performance:
  - "Good calibration - your confidence matched your performance."
  - "You did better than expected! Trust yourself more."
  - "Calibration check: X/5 confidence but missed it. Notice this gap."
  - "You predicted this would be hard, and it was. Good self-awareness."
- `confidenceRating` field stored per problem (line 1840 in study.js).

**Curriculum dashboard** (`src/screens/CurriculumScreen.jsx`):
- Shows readiness per assignment (0-100%) computed from required skill strengths.
- Shows readiness per question within each assignment.
- Weakest skill highlighted per assignment.
- "Study Weakest" button directs to the lowest-strength skill.
- Color-coded: green (≥60%), yellow (30-59%), gray (<30%).
- Review section shows due skills grouped by completed assignments.

**Profile screen** (`src/screens/ProfileScreen.jsx`):
- Cross-course skill profile organized by CIP domain.
- Per-skill detail: retrievability %, stability, difficulty, reviews, lapses, next review date, mastery points.
- Facet-level breakdown within each skill.
- Mastery criteria with verified/unverified checkmarks.
- Evidence section: diagnosed count, practiced count, tutored count, decay events.
- Confidence labels: "Verified", "Limited evidence", "Practice recommended", "New".
- "Practice This Skill" button on every sub-skill.

**Schedule screen** (`src/screens/ScheduleScreen.jsx`):
- Temporal sections: PAST DUE, THIS WEEK, NEXT WEEK, LATER.
- Color-coded urgency: red (overdue/urgent), yellow (soon), blue (normal).
- Per-assignment readiness with required skill breakdown.
- Summary bar: active count, total skills, avg readiness, due for review count.
- "Study active" toggle to flag assignments for focused study.

**Deadline intelligence** (`src/lib/study.js`, `buildDeadlineContext()`, lines 55-136):
- Surfaces nearest 3 upcoming deadlines in AI context.
- Each deadline shows: title, due date (with relative time), readiness %, weakest 3 skills.
- System prompt ASSIGNMENT-FIRST PRIORITY: "Check the assignment list and deadlines. Check which skills each assignment requires. Check the student's skill profile."
- SkillPicker sorts by deadline proximity within similar strength bands (lines 150-160 in SkillPicker.jsx): skills needed for sooner deadlines appear first.

**System prompt — metacognitive guidance** (`buildSystemPrompt()`):
- "READING THE STUDENT" section adjusts approach based on skill level.
- "All assignments done: Pivot to mastery. Find the shaky skills."
- No explicit instruction for the AI to teach students HOW to study.

### Relevant System Prompt Text

> "ASSIGNMENT-FIRST PRIORITY: Every session starts from the same question: what does this student need to turn in, and can they do it? Check the assignment list and deadlines."

> "All assignments done: Pivot to mastery. Find the shaky skills."

### Gap Assessment

1. **No delayed judgment of learning.** Confidence is rated immediately before answering. IES recommends asking students to predict performance AFTER a delay (e.g., "how well do you think you'll remember this tomorrow?").
2. **App doesn't teach students HOW to study.** It directs them WHAT to study (deadline intelligence, weakness identification) but never teaches study strategies (spaced practice, retrieval practice, elaborative interrogation). No "study tips" or "learning science" content.
3. **No time allocation guidance.** The app doesn't tell students "spend 30 minutes on X and 15 minutes on Y based on your deadlines and gaps." The 25-minute break reminder (`StudyScreen.jsx`, line 125-133) is the only temporal guidance.
4. **Confidence calibration is practice-mode only.** During tutoring sessions, the AI doesn't ask students to self-assess their confidence on skills being discussed.
5. **No study planning tool.** The schedule and curriculum screens show what needs work but don't generate a recommended study plan with time allocation.

---

## IES Rec 7 — Deep Explanatory Questions

### What Exists Today

**System prompt question hierarchy** (`buildSystemPrompt()`):
- READING THE STUDENT section includes escalation by skill level:
  - "New, low points: Start with something they can answer."
  - "Moderate points: Push harder. Expect them to explain things back. Call out shortcuts."
  - "High points: Move fast. Test edge cases. Ask 'why' more than 'what.'"

**Bloom's taxonomy data**:
- Each facet has a `blooms_level` field: remember, understand, apply, analyze, evaluate, create.
- `BLOOMS_MULTIPLIERS` in study.js (lines 18-21): remember=0.8, understand=0.9, apply=1.0, analyze=1.1, evaluate=1.15, create=1.2.
- Bloom's level displayed in SkillPicker badges (line 317), ProfileScreen badges (line 243), and facet assessment block (line 1256).
- `buildFacetAssessmentBlock()` includes `[blooms: level]` tag per facet in the AI context.

**Assessment protocol** (`buildSystemPrompt()`):
- "Near the end, if unassessed facets remain, introduce them through a synthesis question requiring multiple facets."
- This is the closest to deep explanatory questions — synthesis across facets.

**Exam mode hint** (`bootWithFocus()`, line 1117):
- "Use interleaved practice across topics. Ask questions that test understanding at increasing difficulty. Mix retrieval practice with elaborative interrogation."
- Mentions "elaborative interrogation" — a deep questioning technique.

**Practice mode tiers** (`src/lib/study.js`, TIERS, lines 1718-1726):
- Tier 5 "Combine": "Use multiple concepts together" — requires cross-skill integration.
- Tier 6 "Apply": "Mini-program / complex problem" — requires deep application.
- These are structural prompts to the AI problem generator but don't control the types of questions in tutoring mode.

### Relevant System Prompt Text

> "High points: Move fast. Test edge cases. Ask 'why' more than 'what.'"

> "Near the end, if unassessed facets remain, introduce them through a synthesis question requiring multiple facets."

> "Use interleaved practice across topics. Ask questions that test understanding at increasing difficulty. Mix retrieval practice with elaborative interrogation."

### Gap Assessment

1. **No explicit "deep question" types in system prompt.** The prompt says "ask 'why' more than 'what'" for high-performing students but doesn't specify question types: why, how, what-if, compare/contrast, what would happen if, how does X relate to Y.
2. **Bloom's data doesn't influence question type.** The AI receives `[blooms: analyze]` tags but the system prompt never says "for analyze-level facets, ask 'why' and 'how' questions; for create-level facets, ask 'what if' and 'design' questions."
3. **No scaffolding from shallow to deep.** The READING THE STUDENT section adjusts based on overall skill level but doesn't instruct a progression from recall → understanding → application → analysis within a single skill. The escalation is based on overall student level, not within-skill progression.
4. **Synthesis questions are a last resort.** The assessment protocol uses synthesis questions only "near the end, if unassessed facets remain" — not as a regular teaching strategy.
5. **No elaborative interrogation in tutoring mode.** Only exam mode mentions "elaborative interrogation." The core system prompt never instructs the AI to ask "why does this work that way?" or "what would happen if we changed X?" as a regular practice.
6. **No question type tracking.** The system tracks WHAT was assessed (skill/facet) and HOW (context tags) but not the TYPE of question used (recall vs. explanation vs. application). This means there's no data to ensure question diversity.

---

## Summary Table

| IES Recommendation | Implementation Level | Key Strengths | Critical Gaps |
|---|---|---|---|
| 1. Space learning | **Strong** | Full FSRS-4.5, review banners in 4 screens, session history, deadline context | No within-session interleaving, review is opt-in, no cumulative review |
| 2. Worked examples | **Partial** | Practice mode Tiers 1-3 show worked examples before problems | Tutoring mode has no examples, no cross-skill interleaving, Tiers 4-6 skip examples |
| 3. Graphics + verbal | **Partial** | Image display from extracted materials, verbal description alongside | No AI-generated diagrams, no LaTeX/math, no SVG, limited to pre-extracted images |
| 4. Abstract + concrete | **Strong** | Full concreteness fading protocol in system prompt, cross-domain content | No enforcement, no Bloom's-aware modulation, cross-skill links not framed as bridges |
| 5. Quizzing | **Strong** | Pre-question phase, 60% question ratio, stealth assessment, 6-tier practice | Pre-questions not enforced, no spaced retrieval within sessions, closed-book only in practice mode |
| 6. Study allocation | **Moderate** | Confidence calibration (practice mode), curriculum dashboard, deadline intelligence, profile detail | No delayed JOL, no study strategy teaching, no time allocation, confidence only in practice mode |
| 7. Deep questions | **Weak** | "Ask why" at high levels, Bloom's data on facets, synthesis questions in assessment | No explicit deep question types, Bloom's doesn't influence questions, no shallow→deep scaffolding |

---

## Output Receipt
**Agent:** Study Developer
**Step:** Standalone
**Status:** Complete

### What Was Done
Comprehensive diagnostic of all 7 IES Practice Guide recommendations traced through the codebase: system prompt text, context builder logic, FSRS scheduling, practice mode UI, curriculum/profile/schedule screens, and session orchestration. Each recommendation mapped to specific code references, exact prompt language, and gap assessment.

### Files Deposited
- `knowledge/development/ies-tutor-behavior-audit-2026-03-19.md` — Full IES audit with 7-dimension analysis

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- Classified `buildFocusedContext` as having 3 branches (assignment, skill, exam) — not 5 as suggested in the prompt. No `recap` or `explore` focus types exist in the current codebase.
- Noted that `ModePicker.jsx` no longer exists (confirmed by `modepicker-elimination-2026-03-14.md` in development knowledge).

### Flags for CEO
- Rec 7 (Deep Questions) is the weakest area — Bloom's taxonomy data exists on every facet but is never used to influence the type of questions the AI asks. This is a high-impact, relatively low-effort improvement.
- Rec 1 (Spacing) within-session interleaving is architecturally significant — would require changes to context building and system prompt to weave review questions into new-learning sessions.

### Flags for Next Step
- The prompt referenced `ModePicker.jsx` and 5 focus type branches (recap, explore) that don't exist. Future prompts should reference the actual mode selection flow: `selectMode()` → SkillPicker/AssignmentPicker/ExamScopePicker → `bootWithFocus()` with 3 types.
- The system prompt is a single 2,000+ word string concatenated in `buildSystemPrompt()`. Any modifications to teaching behavior should target specific sections within this function.
