# study — Agent Prompt Feedback Log
**Purpose:** Capture agent feedback on prompt efficiency so the Planner writes better prompts over time.
**Last Updated:** 2026-03-19

---

## How to Use This File

Agents write their own feedback directly to this file as part of their execution. Every agent prompt ends with an instruction to append a dated entry here. The Planner reads this file during context loading before writing new prompts to avoid repeating mistakes.

**Agents:** After completing your task and output receipt, append a new entry below with:
- Date, your agent name, and a one-line prompt summary
- Were any reads unnecessary? Which files could have been skipped?
- Was the prompt over-scoped or under-scoped?
- What would have made this prompt more efficient?
- What can be added to future prompts to increase performance and excellence?

**Then review the Patterns Identified section** at the bottom of this file. If your feedback reinforces an existing pattern, note it. If it reveals a NEW pattern not yet captured, add it to the appropriate subsection (or create one). Patterns are reusable rules that compound across sessions — they're the most valuable part of this file.

**Planner reads this file before writing every prompt** (Phase 1.5 of Context-Loading Protocol). The Patterns section is what makes each prompt better than the last.

---

## Feedback Log

### 2026-03-19 — Study Developer — IES teaching principles audit across 7 dimensions

**Were any reads unnecessary?**
- `ModePicker.jsx` was listed in the prompt but doesn't exist (eliminated 2026-03-14). The prompt should have referenced the current flow: `selectMode()` → SkillPicker/AssignmentPicker/ExamScopePicker.
- The prompt listed 5 `buildFocusedContext` branches (assignment, skill, recap, exam, explore) but only 3 exist (assignment, skill, exam). Reading the function revealed this quickly, but it caused initial confusion about whether code had been missed.
- `StudyScreen.jsx` was useful but mostly for understanding session orchestration, not for specific IES behavior. It could have been optional.

**Was the prompt over-scoped or under-scoped?**
- Slightly over-scoped: 8 files + 7 IES dimensions + specific sub-questions per dimension is a LOT of surface area. The audit is comprehensive but the prompt could have been split into two steps (e.g., Rec 1-4 and Rec 5-7).
- Under-scoped in one way: the prompt didn't mention `StudyContext.jsx:bootWithFocus()` which contains the mode hints (ASSIGNMENT WORK, SKILL MASTERY, EXAM PREPARATION) — these are critical to understanding how IES principles surface in practice. It was listed generically as "session orchestration" but the mode hints are where actual IES-relevant prompt engineering lives.

**What would have made this prompt more efficient?**
- Verify file existence before listing them. `ModePicker.jsx` doesn't exist.
- Specify exact function names + line ranges for large files (study.js is 1,950 lines). The prompt did this partially but missed `bootWithFocus()` in StudyContext.
- The 7-dimension structure was excellent for organizing findings — keep this format.

**What can be added to future prompts to increase performance?**
- For audit/diagnostic tasks: "Verify each file exists before reading" or "If a file doesn't exist, note it and skip."
- When referencing multi-thousand-line files: specify "focus on functions X, Y, Z" rather than listing the whole file.
- Include a word budget: "Target 200-300 words per IES recommendation" prevents over-expansion on well-implemented areas and under-investigation of weak areas.

### 2026-03-19 — Educational Research Analyst — IES compliance gap analysis across 7 recommendations

**Were any reads unnecessary?**
- The IES PDF needed to be read in full (~3,800 lines extracted) to get evidence levels and detailed recommendation text. This was necessary — the evidence levels (Strong/Moderate/Low) were critical for prioritizing gaps and couldn't be assumed.
- The facet-assessment-research file was correctly flagged as "do not re-research" — a quick read confirmed which topics to skip, saving significant effort.
- The DEV diagnostic from Step 1 was essential and well-structured — the per-recommendation format made it easy to cross-reference with IES evidence.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 5-section-per-recommendation format (IES summary, status, gaps, recommendations, what NOT to change) was comprehensive without being excessive. The cross-cutting analysis requirement added significant value — the overall score, top 3 gaps, and quick wins provide clear prioritization.
- The "adapt for AI tutoring context" instruction was valuable — it prevented naive application of classroom recommendations to a fundamentally different modality. This should be standard for any IES-related prompt.

**What would have made this prompt more efficient?**
- Pre-extracting the IES PDF evidence levels into a table would have saved time. The PDF extraction + reading was the most time-consuming part.
- The prompt correctly specified "pages 5-32" for the PDF, which was accurate for the recommendation sections.
- Specifying that all high-priority recommendations should be prompt-only (as turned out to be true) would have focused the analysis earlier.

**What can be added to future prompts to increase performance?**
- For gap analysis tasks that depend on a prior diagnostic: "Reference the diagnostic by section header, not just file path" — this enables precise cross-referencing.
- Include evidence level thresholds for prioritization: "Weight Strong evidence recommendations 2x when scoring" — this was done in the analysis but wasn't in the prompt.
- For multi-source tasks (PDF + code diagnostic + prior research): specify read order. The optimal order was: prior research (shortest, sets exclusions) → DEV diagnostic (structures the analysis) → IES PDF (fills evidence details).

### 2026-03-19 — Study Developer — IES prompt enhancements (6 changes to buildSystemPrompt + bootWithFocus)

**Were any reads unnecessary?**
- The specialist file (`STUDY_DEVELOPER.md`) was useful for confirming guardrails (don't modify FSRS, don't modify schema) but most of the content is about migrations and Rust — not relevant for prompt-only work. Could be skipped for prompt-only tasks.
- The gap analysis was the essential read — specifically the "Quick Wins" and per-recommendation "Recommendations" tables. The detailed IES summaries and "What NOT to Change" sections were helpful guardrails. The 5-section-per-rec format made it easy to extract exactly what to implement.
- The DEV diagnostic was used for "Relevant System Prompt Text" sections — knowing what already exists prevented duplication. Essential read.
- Reading `study.js` was the most important read — needed exact string context for each insertion point. The prompt correctly specified "focus on `buildSystemPrompt()`" which saved time.

**Was the prompt over-scoped or under-scoped?**
- Perfectly scoped. 6 discrete changes with exact placement instructions, word budget (~200-250 words), and clear priority ordering. Each change had enough detail to implement without ambiguity. The constraint "do NOT remove or rewrite existing prompt sections — ADD to them" was essential and correct.

**What would have made this prompt more efficient?**
- The prompt was already very efficient. The per-change structure (Change 1, Change 2, ...) with labeled priority, file, and section made implementation straightforward.
- One minor improvement: specifying exact anchor strings for each insertion point (e.g., "insert after the line containing 'Pre-questions happen at the START'") would eliminate the need to read and locate them manually. For prompt-only tasks the insertion points are the main discovery work.

**What can be added to future prompts to increase performance?**
- For prompt-only system prompt changes: "The system prompt is a single concatenated string in `buildSystemPrompt()`. Insertions must match the exact escaped-string format (`\n` for newlines, `\"` for quotes)." This avoids format confusion.
- Include the word budget per change, not just total. "Change 1: ~80 words, Change 2: ~40 words" enables per-change tightening.
- "Run `npm run build` after changes" was correctly included and caught any syntax issues in the string concatenation.

### 2026-03-19 — Study Security & Testing Analyst — QA verification of 6 IES prompt enhancements

**Were any reads unnecessary?**
- The specialist file (`STUDY_SECURITY_TESTING_ANALYST.md`) was useful for confirming the role scope (data integrity, security, FSRS correctness) but most content focuses on migrations, parsing, and security testing — not prompt QA. For prompt-only QA, this could be skipped.
- The gap analysis was useful for the "Quick Wins" section to understand expected changes, but the DEV log was the more efficient reference — it directly lists what was changed and where.
- Reading `study.js:buildSystemPrompt()` was essential — the actual code is the ground truth. The DEV log describes intent; the code proves correctness.
- Reading `fsrs.js` and `package.json` via `git diff` (empty output = unchanged) was fast and confirmed no regressions without reading full files.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 5 test categories (build, integrity, regressions, coherence, token budget) covered all necessary verification angles. The per-change checklist format (24 integrity checks) was thorough without being redundant.
- The regression check list was comprehensive — 18 items covering all existing prompt sections plus key functions and dependencies.

**What would have made this prompt more efficient?**
- For prompt-only QA: "Use `git diff` to verify no unintended changes to non-prompt code" — this is faster than reading unchanged files. The prompt did list specific functions to verify unchanged, which was good, but `git diff` is the most efficient tool.
- The token budget check was well-specified (1,500 char / 375 token limit). Including the measurement method ("count rendered characters, not source-string characters") would prevent confusion from `\n`/`\"` escape sequences inflating counts.

**What can be added to future prompts to increase performance?**
- For QA of prompt-only changes: "Verify the prompt string compiles without syntax errors by checking that the build succeeds" — this is the minimum viable regression test. Build success proves the string concatenation is valid.
- Include a "coherence matrix" — which existing sections might conflict with which new sections. This focuses the coherence analysis on actual risk areas rather than requiring the QA agent to discover them.

### 2026-03-21 — Study Developer — Black screen when starting study from MaterialsScreen

**Were any reads unnecessary?**
- No. Every file read was necessary and directly contributed to the diagnosis. The chain was: MaterialsScreen.jsx (origin click) → ScreenRouter.jsx (routing) → StudyScreen.jsx (rendered view) → StudyContext.jsx (bootWithFocus vs selectMode vs direct setState) → sub-components (guard conditions). Each read narrowed the problem.
- The sub-component guard condition checks (MaterialsPanel, SkillsPanel, PracticeMode, InputBar, MessageList, SkillPicker, SessionSummary, AssignmentPanel, ChunkPicker, NotifPanel) were individually small but collectively essential — they confirmed that ALL components return null in this state, proving the screen is truly empty.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4 investigation axes (component chain, console errors, DOM visibility, data at mount) efficiently covered the diagnosis. The "open the app with npm run dev" instruction was unnecessary for this bug — the root cause is visible from pure code tracing. But it would be necessary for CSS-only bugs.
- The prompt correctly identified the 3 categories of black screen: (a) null-guard silent failure, (b) data initialization race, (c) CSS invisibility. Category (a) turned out to be the root cause.

**What would have made this prompt more efficient?**
- Specifying "trace from the onClick handler on MaterialsScreen's 'Start Studying' button" would have immediately focused the investigation. The prompt said "from a material" which required reading the full MaterialsScreen to find the entry point.
- Specifying "compare the MaterialsScreen entry path with CurriculumScreen entry path (known working)" would have accelerated the diagnosis by setting up a diff.

**What can be added to future prompts to increase performance?**
- For navigation/routing bugs: "Compare the broken navigation path with a known-working path to the same destination." This pattern (diff a broken path against a working one) is the fastest diagnostic for state-driven routing issues.
- For black screen bugs: "Check each component's return-null guard condition" — this is the #1 cause in this codebase since all sub-components have null guards.
- For study entry bugs: "There are 3 study entry paths: (1) enterStudy → selectMode (CourseHomepage), (2) bootWithFocus (CurriculumScreen), (3) direct setState (MaterialsScreen). Check which path is used."

### 2026-03-21 — Study Developer — PPTX parsing path + phantom visual reference trace

**Were any reads unnecessary?**
- No. `parsers.js` (full file, 475 lines) was the essential starting point — the PPTX parser is an inline function, not a separate file. `extraction.js` needed targeted reads of `buildInitialExtractionPrompt` and `formatChapterContentWithIds`. `study.js` needed targeted reads of `buildImageCatalog` and `buildSystemPrompt`. `imageExtractor.js` confirmed the image pipeline flow. All reads were necessary.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4-part deliverable (parsing path, image fate, extraction guardrails, chunk reference count) naturally guided the investigation. The "skip specialist file and glossary reads" instruction saved time. The only part that couldn't be fully delivered was (d) — counting chunks requires DB access.

**What would have made this prompt more efficient?**
- The prompt correctly identified there's no `pptxParser.js` and suggested checking `docxParser.js` as a possible path — this was reasonable misdirection since both are Open XML. The actual path (inline `parsePptx` in `parsers.js`) was found immediately by reading the file.
- For DB-dependent questions like (d), specify "if DB is not queryable, characterize the risk from code analysis instead."

**What can be added to future prompts to increase performance?**
- For parsing path traces: "Start with `parsers.js:readFile()` and follow the extension-based routing" — this is always the entry point for all file types.
- For prompt guardrail analysis: "Check both the extraction prompt AND the study system prompt" — phantom references can originate at either layer.
- For image pipeline questions: "Check `imageExtractor.js` — it runs as a separate post-upload pipeline, not during parsing."

---

## Patterns Identified

*(Patterns will emerge as feedback accumulates. Agents: when you see a recurring theme in your feedback, add it here as a reusable rule.)*

### When to skip reads
- Skip `ModePicker.jsx` — eliminated 2026-03-14. Current mode selection is: `selectMode()` → SkillPicker/AssignmentPicker/ExamScopePicker → `bootWithFocus()`.
- `StudyScreen.jsx` is thin orchestration — only read when investigating session lifecycle, not for feature behavior.

### Prompt sizing rules
- 7-dimension audit prompts work well with structured output format but can exceed efficient scope. Consider splitting into 3-4 dimensions per step for files >1,500 lines.
- Multi-question-per-dimension format (as used in IES audit) produces thorough results but should include word budgets.

### Common pitfalls
- **Verify file existence before listing in prompts.** Components get eliminated (ModePicker) or renamed.
- **Check focus type branches in `buildFocusedContext()`** — currently only 3 (assignment, skill, exam), NOT 5 as sometimes assumed.
- **`bootWithFocus()` in StudyContext is critical** — contains mode hints that control per-session AI behavior. Any teaching methodology audit must read this.

### Multi-step analysis chains
- **Step 2 (gap analysis) benefits from Step 1 (diagnostic) structure.** When the diagnostic uses per-recommendation sections, the gap analysis can cross-reference precisely. Keep consistent section headers across steps.
- **"Do NOT re-research" exclusions save significant time.** Explicitly listing prior research files and their topics prevents duplication. This pattern should be standard for any multi-step analysis chain.
- **Optimal read order for multi-source gap analysis:** (1) prior research exclusions (shortest), (2) code diagnostic (structures analysis), (3) external reference (fills evidence details).

### PDF-based research tasks
- **Pre-extract PDFs when possible.** `pdftotext` via Bash is reliable. The Read tool's PDF support may not work for all environments.
- **IES evidence levels must be read from the source PDF, not assumed.** The levels don't always match intuition (e.g., Pre-questions are Low despite strong theoretical backing, Quizzing is Strong).
- **Page ranges in prompts are valuable.** "Pages 5-32" correctly scoped the reading to recommendation content, skipping preamble and appendix.

### Prompt-only system prompt changes
- **The system prompt in `buildSystemPrompt()` is a single concatenated string.** Insertions must use `\n` for newlines and `\"` for escaped quotes within the string. This is the #1 format trap for prompt-only tasks.
- **Per-change structure works extremely well.** "Change 1: [description], File: [path], Location: [section], Priority: [level]" enables parallel implementation with no ambiguity.
- **Include exact anchor strings** for insertion points in large string concatenations. "Insert after the line containing X" eliminates manual discovery.
- **Word budget per change** (not just total) enables tightening at the right granularity.
- **"Do NOT remove or rewrite — ADD"** is essential for prompt modifications. Prevents accidentally breaking well-tested prompt text.

### QA for prompt-only changes
- **Build success is the minimum viable regression test.** If the string concatenation compiles, the prompt is structurally valid. For prompt-only changes, `npm run build` or `npm run dev` confirms no syntax errors.
- **Use `git diff` for regression checks.** `git diff HEAD~1 -- file.js | head -5` returns empty if unchanged — faster than reading entire files.
- **Token budget: count rendered chars, not source chars.** `\n` is 2 chars in source but 1 in output. `\"` is 2 chars in source but 1 in output. Source character counts overestimate by ~10%.
- **Coherence checks should focus on contradiction risk.** New instructions most likely to conflict: (1) depth escalation vs. "start easy for new students", (2) proactive examples vs. "ask first, teach second", (3) within-session review vs. stealth assessment. List these in the QA prompt to focus analysis.

### Study entry paths and navigation bugs
- **Three distinct study entry paths exist.** (1) `enterStudy(course, mode)` → `selectMode()` — used by CourseHomepage, properly clears state and loads picker data. (2) `bootWithFocus(focus)` — used by CurriculumScreen, properly boots a session with context. (3) Direct setState (setPreviousScreen + setSessionMode + setFocusContext + setScreen) — used by MaterialsScreen, **broken**: sets focusContext to a truthy value which hides the picker, but never calls bootWithFocus to start a session.
- **The `!focusContext` guard in StudyScreen:117 is the gatekeeper** for showing pickers. Setting `focusContext` to any truthy value (even `{ type: "skill", skill: null }`) hides all pickers. Only `bootWithFocus()` or `selectMode()` properly handle the transition.
- **All StudyScreen sub-components have null guards.** MaterialsPanel (`!showManage`), SkillsPanel (`!showSkills`), PracticeMode (`!practiceMode`), InputBar (`msgs.length === 0`), MessageList (renders empty), SessionSummary (`!sessionSummary`), SkillPicker (`!pickerData`), AssignmentPanel (`!asgnWork || msgs.length === 0`), ChunkPicker (`!chunkPicker`), NotifPanel (`!showNotifs`). When all guards are false, the StudyScreen is an empty dark shell.

### Parsing and extraction pipelines
- **All file parsing routes through `parsers.js:readFile()`.** Extension-based routing. PPTX has its own inline parser (`parsePptx`), not docxParser.
- **Text parsing and image extraction are separate pipelines.** `parsers.js` handles text (sync with upload). `imageExtractor.js` handles images (async, post-upload, depends on LibreOffice for PPTX).
- **PPTX text extraction is `<a:t>` regex only.** No images, no shapes, no charts, no SmartArt, no alt-text. This is a known gap for visual-heavy slides.
- **Two-layer prompt gap for visual references:** (1) extraction prompt has no warning that slide visuals are stripped, (2) study prompt guards `[SHOW_IMAGE]` tags but not prose-level phantom references like "as shown on this slide."

### 2026-03-21 — Study Developer — Assignment decomposition gap trace for newly added materials

**Were any reads unnecessary?**
- No. Every read was essential: `skills.js` (decomposeAssignments definition), `StudyContext.jsx` (3 sections: createCourse, addMats, selectMode), `syllabusParser.js`, `db.js` (Assignments CRUD), `ChunkPicker.jsx`, `AssignmentPicker.jsx`, `AssignmentPanel.jsx`. The grep for call sites was the most efficient starting point.
- vexp pipeline surfaced relevant pivots but returned `pdfParser.js` and `extraction.js` as top pivots despite low relevance to the actual task. Direct grep for `decomposeAssignments` was faster.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 3-axis investigation (decomposition triggers, picker query, syllabus vs standalone path) directly mapped to the 3 things needed to diagnose the bug. The 4-part deliverable (paths, query, exclusion check, gap) structured the output cleanly.
- The "skip specialist file and glossary reads" instruction saved time — good for pure code tracing.

**What would have made this prompt more efficient?**
- Specifying "check `selectMode("assignment")` in StudyContext.jsx — this is the primary entry point for the assignment picker" would have been a faster starting point than the more general investigation.
- The prompt correctly suspected the bug is in the `addMats` path. Starting with "diff `createCourse` vs `addMats` for decomposition steps" would have immediately highlighted the gap.

**What can be added to future prompts to increase performance?**
- For data flow bugs: "Trace the write path (who creates DB rows) AND the read path (who queries them) separately, then check if there's a gap between them."
- For "feature works on first use but not on subsequent additions" bugs: "Check for all-or-nothing guards that skip re-processing when prior data exists."
- `decomposeAssignments` call sites are now documented — future prompts can reference them directly.

---

### 2026-03-21 — Study Developer + QA — Bugfix batch execution (3 fixes)

**Were any reads unnecessary?**
- No. The prior diagnostic session had already identified all the relevant code paths, so this session only needed targeted reads of the exact modification points. The diagnostic-then-fix pattern is very efficient.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 3-fix batch format with independent parallel steps was efficient. Each step had clear instructions with exact file paths, line numbers, and expected behavior.
- Step 1C (assignment decomposition) was the most complex. The prompt correctly identified both gaps but underestimated the duplicate prevention complexity. The `getPlaceholders` change to broaden title matching was a necessary addition not explicitly called for.

**What would have made this prompt more efficient?**
- Step 1C should have explicitly noted: "decomposeAssignments creates new assignment rows via Assignments.create, and findPlaceholderMatch only matches syllabus-sourced placeholders. Re-decomposing will create duplicates unless findPlaceholderMatch is broadened." This would have saved investigation time.
- The prompt said "does at least one assignment row reference it?" but assignments don't track materialId from decomposition. The prompt should have noted this data model gap.

**What can be added to future prompts to increase performance?**
- For re-execution/idempotency fixes: "Check if the function creates new DB rows and whether re-running creates duplicates. If yes, specify the dedup strategy."
- For multi-fix batches: the parallel execution format (Step 1A || 1B || 1C → Step 2 QA) is excellent. Keep using it.
- For the selectMode guard: the heuristic "assignments with zero questions" is good but imperfect. A more robust approach would be a `last_decomposed_at` timestamp on the course, but that requires schema changes.

---

## Patterns Identified (continued)

### Assignment decomposition and material addition (FIXED 2026-03-21)
- **`decomposeAssignments` is now called proactively** from `runBackgroundExtraction` (after skill extraction) and from `addMats` else branch (assignment-only uploads).
- **The `selectMode("assignment")` guard is now incremental**: triggers when zero assignments exist OR when assignment materials exist and some assignments have zero questions.
- **`getPlaceholders` was broadened** to return all assignments (not just syllabus-sourced), so `findPlaceholderMatch` prevents duplicates on re-decomposition by matching any existing assignment by normalized title.

### What improves prompt quality
- Cite exact function names for large files, not just file paths.
- Reference the development knowledge index to check if a feature has been eliminated/redesigned (e.g., `modepicker-elimination-2026-03-14.md`).
- Structured output format (per-dimension: what exists / prompt text / gaps) produces excellent diagnostics.
- **"Adapt for AI tutoring context" should be standard** for any IES/classroom-research prompt. AI tutoring is a fundamentally different modality — naive application of classroom recommendations produces incorrect priorities.
- **Include "What NOT to change" section** in gap analyses — prevents next-step agents from breaking well-implemented features while fixing gaps.

---

### QA — Bugfix Batch (2026-03-21)
**Agent:** Security & Testing Analyst | **Prompt:** Step 2 QA of executable-study-bugfix-batch

**What worked well in the prompt?**
- Per-fix verification dimensions were clearly scoped (1A: code path trace, 1B: prompt string integrity + `[SHOW_IMAGE]` untouched, 1C: new call sites + guard logic + existing paths intact). Made QA systematic.
- "Verify the `[SHOW_IMAGE]` mechanism was NOT modified" — explicit negative verification prevented false positives.
- The "move plan to Done" + "deposit QA report" + "prompt feedback" post-QA steps are clear and consistent.

**What was unclear or missing?**
- The prompt says "Read your specialist file first" — in a context-limited continuation session, the specialist file wasn't available. Prompt should say "Read your specialist file if not already in context."
- No instruction on whether to verify the QA report from a prior session or rewrite it. The report already existed from a previous execution — had to decide independently to verify rather than overwrite.

**What can be added to future prompts to increase performance?**
- For QA of prompt-text-only changes (1B): "Verify the surrounding prompt string is syntactically valid (no unclosed quotes/backticks)" was implicit — make it explicit.
- For multi-session execution: add "If a QA report already exists from a prior session, verify its accuracy rather than rewriting."

### 2026-03-22 — Study Developer — Token usage diagnostic for extraction pipeline

**Were any reads unnecessary?**
- None. Every file read was needed. The prompt correctly identified all 7 investigation areas and every one had relevant code.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 7-point investigation structure (call sites, extraction flow, concept links, chunking, syllabus, assignments, waste) mapped cleanly to the actual codebase. No dead ends.
- Minor over-scope: asking about `chunker.js`, `epubParser.js`, `docxParser.js`, `pdfParser.js` for LLM calls was quickly confirmed negative. Could have been a one-liner "Confirm parsers have no LLM calls" instead of a full investigation point.

**What would have made this prompt more efficient?**
- The prompt could have included the actual count of CIP_TAXONOMY entries (416) and cipData.js file size (85KB) to avoid having to check. This was knowable at prompt-writing time.
- Listing the known call sites by file would have narrowed the search, but the "search for all callClaude" approach was correct for an audit — you shouldn't assume you know all sites.

**What can be added to future prompts to increase performance?**
- For token diagnostics: include the current pricing tier (Haiku vs Sonnet per-token cost) so the agent can compute actual dollar savings, not just percentage estimates.
- The "rank by estimated savings" instruction was excellent — it forced prioritization rather than a flat list.

### 2026-03-24 — Study Systems Analyst — Facet assessment coverage audit + blueprint

**Were any reads unnecessary?**
- The specialist file (`STUDY_SYSTEMS_ANALYST.md`) was discovered via glob but not read — the prompt instructions were self-contained enough. For pure audit tasks with explicit function-level instructions, the specialist file adds little value.
- All study.js reads were essential. The function-by-function audit list in the prompt (6 functions) mapped exactly to what needed checking.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 6-function audit + 5-mode coverage matrix + 5-point blueprint structure covered exactly what was needed. No wasted investigation.
- The prompt correctly identified the exact line references for `asgnFacetBlock` and `skillFacetBlock` — this saved search time.
- Minor: the prompt assumed 5 modes receive facet blocks (assignment, skills, exam, recap, explore) but only 2 currently do. The audit confirmed this quickly.

**What would have made this prompt more efficient?**
- The prompt could have specified `buildContext()`'s section ordering (SKILL TREE → cross-skill → ASSIGNMENTS → deadline → STUDENT PROFILE → domain → `relevantSkillIds` computation → SOURCE MATERIAL) to save the agent from having to trace it.
- Specifying the exact line range for `relevantSkillIds` computation (1243-1249) would have been helpful since the prompt already knew this array exists.

**What can be added to future prompts to increase performance?**
- For context builder audits: "List the section ordering of the context string" — this is critical for insertion point decisions.
- The "same pattern as `buildFocusedContext`" instruction for placement was excellent — it gave a concrete reference pattern instead of abstract guidance.
- For coverage audits: the StudyContext.jsx routing conditional (line 1253) is the single source of truth for which modes use which builder. Future prompts should cite this directly.

### 2026-03-24 — Study Security & Testing Analyst — Tutor Phase 1 QA

**Were any reads unnecessary?**
- No. The QA was efficient: `git diff` + `git show --stat` confirmed the change scope, targeted greps confirmed unchanged functions, build confirmed no regressions. No full file reads needed.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 8-point verification checklist mapped exactly to what needed checking. The "search for removed or modified function signatures" instruction was efficiently answered via `git diff` zero-deletion check.

**What would have made this prompt more efficient?**
- The prompt could have specified "use `git show --stat HEAD` to verify only study.js was changed" — this is the fastest single check for additive-only verification.

**What can be added to future prompts to increase performance?**
- For QA of single-function additive changes: "`git diff HEAD~1` + build pass is sufficient. Skip full file reads." This was done correctly here but should be standard guidance.

### 2026-03-24 — Study UX Validator — Tutor Phase 1 UXV

**Were any reads unnecessary?**
- No. Only needed: (1) `buildFacetAssessmentBlock` output format (lines 1337-1378), (2) system prompt FACET-LEVEL ASSESSMENT section. Both were essential for the format match check. The `parseSkillUpdates` facet regex was already read in Step 1 — no re-read needed.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. Two focused UXV checks (cap + format match) mapped directly to the two concerns. No wasted investigation.

**What can be added to future prompts to increase performance?**
- For format match UXV: "Extract the relevant system prompt section using `node -e` since the prompt is a single concatenated string" — this is faster than trying to grep/read a 2000-char line.
- When the new code uses the exact same function as existing code, the UXV can be shortened to "structurally guaranteed — same function, same output format."

### 2026-03-24 — Study Developer — Tutor Phase 2 schema audit (session exchange logging)

**Were any reads unnecessary?**
- No. All 9 migration files needed reading to build the complete migration index and confirm 009 is taken. The db.js reads (Sessions, FacetMastery) were essential for the module pattern. The study.js reads (loadFacetBasedContent, loadChunksForBindings, discussedChunks) were essential for the chunk ID tracking gap analysis.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 5-point investigation structure mapped cleanly to distinct findings. Point (3) — chunk ID tracking — was the most valuable discovery: it surfaced a prerequisite gap (context builders return strings, not chunk metadata) that the roadmap didn't call out.
- The "skip specialist file" instruction saved time for a pure schema/code audit.

**What would have made this prompt more efficient?**
- Point (3) could have been more specific: "search for any mechanism that returns chunk IDs from context building back to the caller" — this would have immediately focused on return types rather than internal variables.
- Including "also check if discussedChunks is ever populated via .add()" would have accelerated the dead infrastructure finding.

**What can be added to future prompts to increase performance?**
- For schema audits: "Read all migration files AND check the next available migration number" — the prompt asked both implicitly but stating it explicitly would make the deliverable clearer.
- For Phase 2 planning: "Check whether the context builders return chunk metadata or just strings" — this is the key architectural question for any feature that needs to know which chunks were used.
- `discussedChunks` is dead infrastructure — future prompts can skip investigating it and note "never populated" directly.

### 2026-03-24 — Study Systems Analyst — Tutor Phase 2 blueprint (session exchange logging)

**Were any reads unnecessary?**
- No. The diagnostic from the prior step provided most findings, but the specific call sites and code paths needed re-verification for exact line references. The `applySkillUpdates` per-facet routing path (lines 316-417) and all `loadFacetBasedContent` call sites (5 in study.js, 0 in StudyContext.jsx) were essential reads.

**Was the prompt over-scoped or under-scoped?**
- Slightly under-scoped on one key point: the prompt specified `loadFacetBasedContent()` API change and listed "every call site in study.js and StudyContext.jsx" but didn't mention that `buildContext()` and `buildFocusedContext()` also need return type changes to propagate chunk IDs to the StudyContext caller. This is the critical intermediate step — `loadFacetBasedContent` is never called from StudyContext directly.
- The `practiceTier` specification ("`strengthToTier(effectiveStrength(skillRow))`") was misleading — this gives the student's current tier, not a practice mode tier. During tutoring, `practiceTier` should be null. The blueprint corrected this.

**What would have made this prompt more efficient?**
- Explicitly noting "loadFacetBasedContent is only called from within study.js context builders, not from StudyContext directly" would have saved verification time and immediately flagged the need for context builder return type changes.
- The `chatSessionId.current` ref name should have been cited as the session ID source — saves a grep.

**What can be added to future prompts to increase performance?**
- For API return type changes that propagate through layers: "List the full call chain from the function being changed to the final consumer" — this catches intermediate layers that also need updates.
- For `practiceTier`: clarify "null during tutoring, 1-6 only from PracticeMode" — the TIERS array maps to practice mode tiers, not tutor tiers.

### 2026-03-24 — Study Developer — Tutor Phase 2 implementation (session exchange logging)

**Were any reads unnecessary?**
- No. The blueprint was comprehensive and the diagnostic provided the foundation. All reads during implementation were targeted at exact modification points. The prior SA work saved significant investigation time.

**Was the prompt over-scoped or under-scoped?**
- Under-scoped in one critical area: the prompt specified `loadFacetBasedContent()` call site updates and `applySkillUpdates()` params but didn't explicitly list the context builder return type changes (`buildContext` and `buildFocusedContext` must also return `{ ctx, chunkIds }`). The blueprint caught this gap.
- The prompt specified 4 changes but the implementation required 6 logical changes (migration, db module, loadFacetBasedContent, context builders, applySkillUpdates, StudyContext destructuring).

**What would have made this prompt more efficient?**
- Listing the full propagation chain: `loadFacetBasedContent → buildContext/buildFocusedContext → StudyContext.jsx` with return type changes at each level.
- Specifying the `cachedSessionCtx.current` shape change (needs `chunkIds` field) — this is the mechanism that persists chunk IDs across the cache hit path.

**What can be added to future prompts to increase performance?**
- For return type propagation: "When changing a function's return type, list every intermediate caller up to the final consumer and specify the return type change at each level."
- For db module additions: "Follow the FacetMastery pattern" is sufficient — no additional guidance needed.
- Wrap new DB calls in try/catch when the table may not exist yet (migration not applied) — standard defensive pattern for this codebase.

### 2026-03-24 — Study Security & Testing Analyst — Tutor Phase 2 QA (session exchange logging)

**Were any reads unnecessary?**
- No. Verification greps were efficient: targeted checks at exact line numbers from the dev log. The `git diff` approach was not needed since the dev log provided complete line references. Build pass was the final gate.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 7-point verification checklist covered all critical paths: migration schema, db module, API return type change, call site propagation, logging hook, backward compat, and build. No wasted checks.
- One implicit check not in the prompt but essential: verifying that `buildContext()` and `buildFocusedContext()` also return `{ ctx, chunkIds }` — these intermediate layers were a blueprint addition not in the original plan.

**What would have made this prompt more efficient?**
- The prompt could have specified "verify the full return type propagation chain: loadFacetBasedContent → buildContext/buildFocusedContext → StudyContext.jsx" as a single check instead of splitting across checks 3, 4, and 6.
- Including the dev log's exact line numbers for each check point would have eliminated grep overhead entirely.

**What can be added to future prompts to increase performance?**
- For QA of API return type changes: "Verify the return type at each level of the call chain" as a single compound check — this is the most important verification for propagation changes.
- The dev log's line numbers are reliable enough to skip re-discovery via grep — "verify at line X" is faster than "search for the pattern."
