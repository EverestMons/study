# study — IES Teaching Principles Audit
**Date:** 2026-03-19

---

## Step 1 — DEV Diagnostic: Extract AI Tutor Behavior Across All 7 IES Dimensions

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip domain glossary — this project has none; domain knowledge is in the specialist file.
>
> **Task:** Investigate how the AI tutor currently implements (or fails to implement) each of the 7 IES Practice Guide recommendations. For each recommendation below, trace the relevant code paths and report exactly what the system does today. Be specific — quote system prompt text, function names, context builder logic, and UI behavior. Do NOT fix anything.
>
> **Files to investigate:**
> - `src/lib/study.js` — `buildSystemPrompt()`, `buildContext()`, `buildFocusedContext()` (all 5 branches: assignment, skill, recap, exam, explore), `buildFacetAssessmentBlock()`, `buildDeadlineContext()`, `buildDomainProficiency()`, `buildCrossSkillContext()`
> - `src/lib/fsrs.js` — scheduling algorithm, retrievability calculation, review interval logic
> - `src/components/study/ModePicker.jsx` — session mode selection, deadline nudge, skill picker sort
> - `src/components/study/PracticeMode.jsx` — retrieval practice flow, question generation, feedback
> - `src/components/StudyScreen.jsx` — session orchestration
> - `src/components/CurriculumScreen.jsx` — readiness display, gap detection
> - `src/components/ProfileScreen.jsx` — mastery visualization, review indicators
> - `src/components/ScheduleScreen.jsx` — temporal sections, urgency signals
>
> **For each IES recommendation, report:**
>
> **IES Rec 1 — Space learning over time:**
> - How does FSRS schedule reviews? What are the default parameters (desired retention, initial stability)?
> - Does the system prompt instruct the AI to reference previously-learned material?
> - Is there any mechanism that re-exposes students to old content during new learning sessions?
> - Does the deadline intelligence or skill picker promote review of older material?
>
> **IES Rec 2 — Interleave worked examples with problem-solving:**
> - Does the system prompt instruct the AI to alternate between showing solutions and asking students to solve?
> - In practice mode, does the flow alternate examples and exercises, or is it all exercises?
> - Does any context builder or focus type prompt include instructions about worked examples?
> - Is there any interleaving logic in how skills or facets are presented within a session?
>
> **IES Rec 3 — Combine graphics with verbal descriptions:**
> - Does the system prompt instruct the AI to use diagrams, graphs, or visual representations?
> - Is there any rendering support for images, SVGs, LaTeX, code diagrams, or charts in the chat UI?
> - Does the AI context include any instruction about when to use visual aids vs. text-only?
>
> **IES Rec 4 — Connect abstract and concrete representations:**
> - Does the system prompt instruct the AI to bridge abstract concepts with concrete examples?
> - Is there any "concreteness fading" logic (start concrete, gradually abstract)?
> - Do the focus type prompts (assignment, skill, recap, exam, explore) differ in their abstract/concrete balance?
> - Does the cross-skill context or concept link system help the AI connect abstract principles across concrete instances?
>
> **IES Rec 5 — Use quizzing to promote learning:**
> - 5a: Does any session mode use pre-questions before introducing new material? Check the "learn new material" / skills focus type specifically.
> - 5b: How does practice mode implement retrieval practice? Is it closed-book (no hints visible)? Does it provide corrective feedback?
> - Does the stealth assessment protocol (facet assessment block) function as embedded quizzing?
> - Is there any mechanism for the AI to quiz during teaching (not just practice mode)?
>
> **IES Rec 6 — Help students allocate study time efficiently:**
> - Does the system prompt or any context builder instruct the AI to help students judge what they know vs. don't know (metacognition)?
> - Does the curriculum dashboard or profile screen help students identify weak areas for targeted study?
> - Is there any "delayed judgment of learning" mechanism — asking students to self-assess after a delay?
> - Does the deadline intelligence direct students toward the most efficient study allocation?
> - Does the app teach students HOW to study, or just what to study?
>
> **IES Rec 7 — Deep explanatory questions:**
> - Does the system prompt instruct the AI to ask "why", "how", "what-if", "compare" questions?
> - Is there any distinction between shallow questions (recall) and deep questions (explanation/causation)?
> - Does the Bloom's taxonomy data on facets influence the type of questions the AI asks?
> - Does the assessment protocol instruct the AI to use synthesis questions?
> - Is there any scaffolding logic (start simple, escalate to deep questions as mastery increases)?
>
> **Output format:** For each of the 7 recommendations, provide:
> 1. **What exists today** — specific code references (function name, file, what it does)
> 2. **Relevant system prompt text** — quote the exact prompt language that addresses this principle (or note its absence)
> 3. **Gap assessment** — what the IES guide recommends that the app does NOT currently do
>
> Deposit your findings to: `study/knowledge/development/ies-tutor-behavior-audit-2026-03-19.md`
>
> After your output receipt, read `study/knowledge/research/agent-prompt-feedback.md` (create it if it doesn't exist). Append a dated entry with:
> - Agent name and prompt summary (one line)
> - Were any reads unnecessary? Which files could have been skipped?
> - Was the prompt over-scoped or under-scoped?
> - What would have made this prompt more efficient?
> - What can be added to future prompts to increase performance and excellence?
>
> Then review the Patterns Identified section at the bottom of the file. If your feedback reinforces an existing pattern, note it. If it reveals a NEW pattern, add it.
>
> Commit with message: "docs: IES teaching principles audit — DEV diagnostic"


## Step 2 — Research: IES Compliance Gap Analysis and Recommendations

> You are the Educational Research Analyst. Read your specialist file at `study/agents/EDUCATIONAL_RESEARCH_ANALYST.md` first.
>
> **Reads:**
> - The IES Practice Guide PDF at `study/knowledge/ED498555-2.pdf` (focus on the 7 recommendations and their evidence summaries — pages 5-32)
> - The DEV diagnostic findings at `study/knowledge/development/ies-tutor-behavior-audit-2026-03-19.md`
> - The existing facet assessment research at `study/knowledge/research/facet-assessment-research-2026-03-14.md` (to avoid duplicating work already done on assessment/celebration/decay)
>
> **Task:** Produce a comprehensive IES compliance scorecard for the study app. For each of the 7 IES recommendations:
>
> 1. **IES Recommendation Summary** — 2-3 sentences on what the research says and the evidence level (Strong/Moderate/Low)
> 2. **Current Implementation Status** — based on the DEV diagnostic, what does the app actually do today? Rate as: ✅ Well-implemented, 🟡 Partially implemented, ❌ Not implemented
> 3. **Gap Analysis** — specific gaps between what the IES guide recommends and what the app does. Be concrete: "The system prompt does not instruct the AI to X" not "there could be more Y"
> 4. **Recommendations** — specific, actionable changes to close each gap. For each recommendation, note:
>    - Which component would change (system prompt, context builder, UI, practice mode, etc.)
>    - Estimated scope (prompt-only change vs. new feature vs. architectural change)
>    - Priority (High = directly improves learning outcomes per strong evidence; Medium = moderate evidence; Low = low evidence or marginal improvement)
> 5. **What NOT to change** — where the app already implements the principle well or where the IES recommendation doesn't apply to the app's context (e.g., the app is AI-tutored, not classroom-taught — some recommendations need reinterpretation)
>
> **Cross-cutting analysis:** After the per-recommendation sections, include:
> - **Overall compliance score** — how many of the 7 recommendations are well-implemented vs. partially vs. not at all?
> - **Top 3 highest-impact gaps** — which gaps, if closed, would most improve learning outcomes?
> - **Quick wins** — which gaps can be closed with prompt-only changes (no code, just system prompt updates)?
> - **Architectural gaps** — which gaps require new features or significant code changes?
>
> **Important:** The IES guide was written for K-12 classroom teachers. The study app is an AI tutor for college CS students. Some recommendations translate directly; others need reinterpretation for the AI tutoring context. Call out where you're adapting the recommendation and why.
>
> **Do NOT re-research topics already covered** in `facet-assessment-research-2026-03-14.md` (assessment timing, mastery thresholds, celebration design, decay communication). Reference that document where relevant.
>
> Deposit your findings to: `study/knowledge/research/ies-compliance-gap-analysis-2026-03-19.md`
>
> After your output receipt, read `study/knowledge/research/agent-prompt-feedback.md` (create it if it doesn't exist). Append a dated entry with:
> - Agent name and prompt summary (one line)
> - Were any reads unnecessary? Which files could have been skipped?
> - Was the prompt over-scoped or under-scoped?
> - What would have made this prompt more efficient?
> - What can be added to future prompts to increase performance and excellence?
>
> Then review the Patterns Identified section at the bottom of the file. If your feedback reinforces an existing pattern, note it. If it reveals a NEW pattern, add it.
>
> Commit with message: "docs: IES compliance gap analysis — Educational Research Analyst"

---

## Dependency Notes
- Step 2 depends on Step 1 — the Research Analyst needs the DEV diagnostic findings to assess current implementation status.
- The IES Practice Guide PDF (`study/knowledge/ED498555-2.pdf`) must remain in the knowledge directory for Step 2.
