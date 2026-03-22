# study — IES Quick Wins: System Prompt Enhancement
**Date:** 2026-03-19
**Tier:** Small (DEV → QA)
**Scope:** 6 prompt-only changes to `buildSystemPrompt()` in `src/lib/study.js` — no schema, no UI, no dependencies

---

## Step 1 — DEV: Implement IES Prompt Enhancements

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip domain glossary — this project has none.
>
> Read the IES compliance gap analysis at `study/knowledge/research/ies-compliance-gap-analysis-2026-03-19.md` — specifically the "Quick Wins" section and the per-recommendation "Recommendations" tables.
>
> Read the DEV diagnostic at `study/knowledge/development/ies-tutor-behavior-audit-2026-03-19.md` — specifically the "Relevant System Prompt Text" sections to understand what already exists.
>
> Then read `src/lib/study.js` — focus on `buildSystemPrompt()` (starts around line 1634). Identify the existing labeled sections: YOUR TEACHING METHOD, READING THE STUDENT, ASSESSMENT PROTOCOL, CONCRETENESS FADING, PRE-QUESTION PHASE, IMAGE DISPLAY, SESSION HISTORY, ASSIGNMENT-FIRST PRIORITY.
>
> **Task:** Add 6 new prompt sections/modifications to `buildSystemPrompt()`. Each change maps to a specific IES recommendation and gap identified in the compliance analysis. The changes are ordered by priority.
>
> **Change 1 — DEEP QUESTION TAXONOMY + BLOOM'S MAPPING (Rec 7, HIGH priority):**
> Add a new section called DEEP QUESTIONS. This section must:
> - List the IES deep question types: why, why-not, how, what-if, how does X compare to Y, what is the evidence for X, what caused Y
> - Map Bloom's levels to question types: remember→what/when/who/list, understand→explain/describe/summarize, apply→how would you use/solve/implement, analyze→why/how does this compare/what are the differences, evaluate→what evidence supports/which approach is better/what are the tradeoffs, create→design/propose/what if we changed
> - Instruct: "The `[blooms: level]` tag on each facet tells you which question depth is appropriate. Match your questions to the Bloom's level. A remember-level facet gets recall questions. An analyze-level facet gets 'why' and 'how' questions. Don't ask deep questions on facets the student hasn't demonstrated basic recall on yet."
> - Instruct: "Ask students to explain their reasoning, not just give answers. 'Walk me through your thinking on that' reveals understanding better than 'What's the answer?'"
> - Place this section AFTER the existing READING THE STUDENT section (since READING THE STUDENT sets up skill-level awareness, and DEEP QUESTIONS builds on that).
>
> **Change 2 — EXAMPLE-PROBLEM ALTERNATION (Rec 2, HIGH priority):**
> Add to the existing YOUR TEACHING METHOD section:
> - "When teaching a new concept: (1) explain the principle, (2) demonstrate with a worked example showing your reasoning step-by-step, (3) ask the student to solve a similar but different problem. This example→problem alternation is research-backed and more effective than explaining alone."
> - "Don't wait for the student to ask for examples. Proactively show a worked solution before asking them to try one."
> - Keep this concise — 3-4 sentences max. It supplements the existing teaching method, doesn't replace it.
>
> **Change 3 — WITHIN-SESSION INTERLEAVED REVIEW (Rec 1 + 5b, MEDIUM priority):**
> Add to the ASSESSMENT PROTOCOL section (or as a small new section adjacent to it):
> - "If you taught a concept earlier in this conversation, circle back with a brief recall question before introducing new material or closing the session. Example: 'Quick check — earlier we covered [X]. Can you explain [key aspect] without looking back?' This within-session spacing strengthens retention."
> - "If skills are flagged as DUE FOR REVIEW in the student status, weave 1-2 brief recall questions about those skills into the session — don't wait for the student to start a separate review session."
> - Keep tight — 3-4 sentences.
>
> **Change 4 — DELAYED JUDGMENT OF LEARNING (Rec 6a, MEDIUM priority):**
> Add to the PRE-QUESTION PHASE section (since it naturally fits with session-start behavior):
> - "For skills the student has seen before (not brand new): before teaching, ask 'How confident are you that you still remember [skill/concept] from last time?' This delayed self-assessment after time away is more accurate than immediate confidence ratings and helps both you and the student calibrate."
> - This is 1-2 sentences. It extends the existing pre-question behavior for returning skills.
>
> **Change 5 — SHALLOW→DEEP SCAFFOLDING (Rec 7, MEDIUM priority):**
> Add to the new DEEP QUESTIONS section (from Change 1):
> - "Progression within a skill session: Start with recall/recognition questions to verify foundation. Once the student demonstrates basic knowledge, escalate to 'why' and 'how' questions. Only push to 'what-if' and 'design' questions when analyze-level understanding is solid. If the student struggles at a deeper level, step back to the previous level — don't keep pushing."
> - This is 2-3 sentences. It provides the within-skill escalation ladder.
>
> **Change 6 — ELABORATIVE INTERROGATION FOR ALL MODES (Rec 7, LOW priority):**
> The DEV diagnostic found that "elaborative interrogation" is mentioned only in exam mode (`bootWithFocus()` exam branch). Check if the other focus type branches in `bootWithFocus()` (assignment, skill) include elaborative interrogation. If not, add "Mix retrieval practice with elaborative interrogation — ask 'why does this work?' and 'what would happen if we changed X?'" to the assignment and skill focus type hints in `bootWithFocus()`. This is the `StudyContext.jsx` file, `bootWithFocus()` function.
>
> **Constraints:**
> - Do NOT modify FSRS logic, facet assessment logic, context builders, or any non-prompt code
> - Do NOT remove or rewrite existing prompt sections — ADD to them or INSERT new sections
> - Keep each addition concise. The system prompt is already ~2,000 words. These 6 changes should add ~200-250 words total, not 500+
> - Preserve the existing labeled section structure (all-caps headers with colons)
> - Test that the app builds cleanly after changes: `npm run dev`
>
> Commit with message: "feat: IES teaching principles — 6 prompt enhancements (deep questions, worked examples, interleaved review, delayed JOL, scaffolding, elaborative interrogation)"
>
> Deposit a brief development log to: `study/knowledge/development/ies-prompt-enhancements-2026-03-19.md`
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
> Commit with message: "docs: prompt feedback — DEV IES prompt enhancements"

## Step 2 — QA: Verify IES Prompt Enhancements

> You are the Study Security & Testing Analyst. Read your specialist file at `study/agents/STUDY_SECURITY_TESTING_ANALYST.md` first. Skip domain glossary.
>
> Read the development log at `study/knowledge/development/ies-prompt-enhancements-2026-03-19.md` to understand what was changed.
>
> Read the IES compliance gap analysis at `study/knowledge/research/ies-compliance-gap-analysis-2026-03-19.md` — specifically the "Quick Wins" section for expected changes.
>
> Then read `src/lib/study.js` — focus on `buildSystemPrompt()` to verify the 6 prompt additions. Also check `src/components/StudyContext.jsx` `bootWithFocus()` for the elaborative interrogation addition (Change 6).
>
> **Test the following:**
>
> 1. **Build verification:** Run `npm run dev` and confirm the app starts without errors.
>
> 2. **Prompt integrity (all 6 changes):**
>    - Verify the DEEP QUESTIONS section exists after READING THE STUDENT
>    - Verify it contains Bloom's→question type mapping
>    - Verify it contains IES deep question types (why, how, what-if, compare, evidence)
>    - Verify the YOUR TEACHING METHOD section now includes example→problem alternation instruction
>    - Verify the ASSESSMENT PROTOCOL section (or adjacent) includes within-session review instruction
>    - Verify the PRE-QUESTION PHASE section includes delayed JOL for returning skills
>    - Verify the DEEP QUESTIONS section includes shallow→deep scaffolding progression
>    - Verify `bootWithFocus()` assignment and skill branches include elaborative interrogation
>
> 3. **No regressions:**
>    - Verify existing prompt sections are intact (CONCRETENESS FADING, IMAGE DISPLAY, SESSION HISTORY, ASSIGNMENT-FIRST PRIORITY)
>    - Verify `buildFacetAssessmentBlock()` is unchanged
>    - Verify `buildContext()` and `buildFocusedContext()` are unchanged
>    - Verify FSRS logic in `fsrs.js` is unchanged
>    - Verify no new dependencies were added
>
> 4. **Prompt coherence:**
>    - Verify the new sections don't contradict existing instructions (e.g., DEEP QUESTIONS shouldn't conflict with READING THE STUDENT's "Start with something they can answer" for new students)
>    - Verify total prompt additions are ~200-250 words (not bloated)
>    - Verify new sections use the same formatting style as existing sections (all-caps headers, concise instructions)
>
> 5. **Token budget check:**
>    - Estimate the character count added to the system prompt. Flag if it exceeds 1,500 characters (~375 tokens) — that would be too much prompt overhead per message.
>
> Rate each test as PASS / FAIL / ADVISORY. Deposit QA report to: `study/knowledge/qa/ies-prompt-enhancements-qa-2026-03-19.md`
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
> Commit with message: "docs: prompt feedback — QA IES prompt enhancements"

---

## Dependency Notes
- Step 2 depends on Step 1 — QA reads the development log and verifies the code changes from Step 1.
