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

### bootWithFocus failure recovery (FIXED 2026-03-25)
- **`bootWithFocus` catch block now clears `focusContext`** and sets `pickerData` with error flag. Previously, failure left a dead screen (focusContext truthy hiding pickers, msgs empty showing nothing).
- **All three pickers (ExamScopePicker, SkillPicker, AssignmentPicker) now handle `pickerData.error`** with an inline error message and Back button. Without this, the error pickerData object would crash the normal picker render path (accessing `.materials.map()` or `.items.map()` on undefined).
- **Key insight for this codebase:** Any async function that sets `focusContext(focus)` before a try block MUST clear it in the catch block, otherwise the `!focusContext` guard in StudyScreen permanently hides all pickers.

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

### 2026-03-24 — Study Developer — Tutor Phase 3 prerequisite audit (diagnostic)

**Were any reads unnecessary?**
- No. All 4 investigation points required targeted reads. The migration file was small and essential for the `teaching_effectiveness` column analysis. The db.js reads for both `ChunkFacetBindings` and `SessionExchanges` were non-overlapping. The study.js reads for `collectFacetBindings` and `loadFacetBasedContent` covered the full content pipeline.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4-point investigation structure was clean: schema → db module → study.js pipeline → session logging verification. Each point produced distinct, non-overlapping findings.
- Point (2) asking for "all methods in full" was slightly over-broad — listing 7 methods was thorough but the key insight (no method writes `teaching_effectiveness`) could have been targeted with "does any method write `teaching_effectiveness`?"

**What would have made this prompt more efficient?**
- Point (2) could have been split: "Does any ChunkFacetBindings method write `teaching_effectiveness`?" (quick grep) + "Show `getByFacetRanked()` ordering logic" (targeted read). The "show all methods in full" instruction led to reading the entire module when only 2 methods were critical.
- Point (3c) asking whether call sites destructure correctly was already fully verified in Phase 2 QA — this was redundant confirmation. A simple "confirm call sites unchanged since Phase 2" would have sufficed.

**What can be added to future prompts to increase performance?**
- For "dead column" audits: "Search for any INSERT or UPDATE that references column X" is the fastest path — a single grep across db.js answers the question.
- For post-Phase-N diagnostics: "Skip re-verifying Phase N changes that passed QA" — cite the QA report instead of re-auditing.

### 2026-03-24 — Study Systems Analyst — Tutor Phase 3 blueprint (chunk teaching effectiveness)

**Were any reads unnecessary?**
- No. The roadmap Phase 3 section, diagnostic findings, and session end flow reads were all essential. The critical discovery was that `chatSessionId` is a private ref NOT exposed to StudyScreen — this changed where the wiring goes.

**Was the prompt over-scoped or under-scoped?**
- Slightly under-scoped on the wiring location. The prompt specified "called from the session end handler in StudyContext.jsx alongside the existing `generateSessionEntry()` call, after the session is marked complete." But `generateSessionEntry()` is called from StudyScreen.jsx (line 51), not StudyContext.jsx. The actual convergence point is `saveSessionToJournal` in StudyContext.jsx (line 383). The prompt assumed `generateSessionEntry` and the session end handler were in the same file.
- The `NULLS LAST` SQL syntax doesn't work in SQLite — the prompt specified it but the blueprint had to use the `CASE WHEN ... IS NULL THEN 1 ELSE 0 END` idiom instead.

**What would have made this prompt more efficient?**
- Specifying "find where `chatSessionId.current` is accessible and where `generateSessionEntry()` is called — they may be in different files" would have immediately surfaced the wiring constraint.
- Noting "SQLite doesn't support NULLS LAST — use CASE WHEN IS NULL idiom" would have avoided the need to blueprint the workaround.

**What can be added to future prompts to increase performance?**
- For session end wiring: "`saveSessionToJournal` in StudyContext.jsx (line 383) is the canonical session-end hook — all exit paths converge here. `chatSessionId` is a private ref not exposed through context." This saves the discovery work.
- For SQLite ORDER BY: "SQLite NULLS LAST requires `CASE WHEN col IS NULL THEN 1 ELSE 0 END` pattern" — standard idiom for this codebase.
- The mastery delta threshold (> 0.05 for positive deltas) is a good design decision that should be standard for any effectiveness signal — prevents rewarding content when mastery didn't actually improve.

### 2026-03-24 — Study Developer — Tutor Phase 3 implementation (chunk teaching effectiveness)

**Were any reads unnecessary?**
- No. The blueprint was comprehensive. Only needed to verify exact insertion points: `updateQualityRanks` location in db.js (for placing new methods before it), `loadPracticeMaterialCtx` end in study.js (for placing new function after it), and the `saveSessionToJournal` body in StudyContext.jsx.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The blueprint's SA step identified the correct wiring point (`saveSessionToJournal`), the SQLite NULLS LAST idiom, and the mastery delta threshold — DEV just implemented. The 3-change structure was accurate.
- One minor mismatch: the prompt says "add `updateChunkEffectiveness` immediately after the session is marked complete" — but the actual placement is after journal entry creation inside `saveSessionToJournal`, before session state reset. The session is never "marked complete" in `saveSessionToJournal` — that's just a journal write. Precision would help.

**What can be added to future prompts to increase performance?**
- The blueprint-to-DEV handoff was clean. When the SA step produces exact code snippets, DEV execution is nearly mechanical. This is the ideal pattern.
- For db.js methods: "Place new methods before `updateQualityRanks`" — the prompt didn't specify placement within the module, but the blueprint did. DEV prompts should always specify insertion points.

### 2026-03-24 — Study Security & Testing Analyst — Tutor Phase 3 QA (chunk effectiveness)

**Were any reads unnecessary?**
- No. Targeted greps + reads at exact line numbers from the dev log. The NULLS LAST safety analysis required reading the full ORDER BY clause (5 lines) which was efficient.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. 7 checks covered all critical paths. Check 7 (NULLS LAST safety) was the most valuable — confirms backward compatibility for existing data. The "unchanged paths" verification was efficient via grep-only confirmation.

**What can be added to future prompts to increase performance?**
- For SQLite NULLS LAST QA: "Confirm CASE WHEN IS NULL THEN 1 ELSE 0 END idiom is used (not NULLS LAST syntax)" — SQLite-specific verification.
- The stale session check (enterStudy line 928 not wired) should be a standard QA item for any session-end feature.

### 2026-03-24 — Study Developer — Tutor Phase 4 prerequisite audit (diagnostic)

**Were any reads unnecessary?**
- No. All 4 investigation points produced critical findings. The capabilities file was the most important discovery — the `fs:allow-write-file` sandbox restriction means the roadmap's plan to write to `knowledge/research/` won't work without permission changes.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4-point structure covered the right concerns: fs permissions, session end flow, dependency check, and Forge config. The Forge config question was essential — surfaced the missing ChunkType + classification rule.
- Slightly redundant: point (2c) asking about existing `plugin-fs` usage overlaps with point (1) about permissions. The permission check alone reveals the sandbox constraints.

**What would have made this prompt more efficient?**
- Point (2b) could have been "confirm Phase 3 wiring is in place" — the exact code was already verified in Phase 3 QA. A simple confirmation reference would suffice.
- The Forge config read required navigating to a sibling repository (`forge/` not `study/`). The prompt should note when reads cross repository boundaries.

**What can be added to future prompts to increase performance?**
- For Tauri permission audits: "Read `src-tauri/capabilities/default.json` — this is the single source of truth for all plugin permissions." The tauri.conf.json doesn't contain permission config in Tauri v2.
- For cross-repo reads: explicitly note "this file is in a sibling repository at `../forge/src/config.py`" to avoid path confusion.
- **Critical finding for Phase 4 planning**: `fs:allow-write-file` is sandboxed to `$APPDATA`. Writing to `knowledge/research/` requires either expanding permissions or using `$APPDATA/tutor-sessions/` as the write target.

### 2026-03-24 — Study Systems Analyst — Tutor Phase 4 blueprint (Forge ingestion)

**Were any reads unnecessary?**
- No. All reads were essential. The imageStore.js pattern (lazy import, `appDataDir()`, `mkdir`/`writeFile`) was the critical reference for the plugin-fs implementation. The Forge scanner.py reads revealed the architectural gap: `discover_files()` only scans Git repo directories, not `$APPDATA`.

**Was the prompt over-scoped or under-scoped?**
- Under-scoped on one critical point: the prompt specified Forge changes to config.py and scanner.py but didn't identify that `discover_files()` has NO mechanism to scan outside Git repos. The blueprint had to design `EXTRA_SCAN_PATHS` — a new config list — to bridge this gap. The prompt assumed Forge had a `SCAN_ROOTS` or equivalent that just needed a path added.
- The prompt correctly noted "SA should note this needs verification at runtime" for the AppData path — this was a good hedge.

**What would have made this prompt more efficient?**
- Specifying "read `discover_files()` in scanner.py and confirm whether it can scan paths outside `PROJECT_DIRS`" would have immediately surfaced the scan gap in the diagnostic phase instead of requiring discovery during blueprinting.
- Including the Tauri identifier (`com.everestmons.study`) directly would have saved a cross-reference to tauri.conf.json.

**What can be added to future prompts to increase performance?**
- For Forge scan additions: "Forge's `discover_files()` only scans `project_dir / knowledge / KNOWLEDGE_SUBDIRS`. Files outside Git repos require a new scan mechanism."
- For Tauri AppData paths on macOS: "`~/Library/Application Support/{identifier}/` where identifier is from tauri.conf.json."
- For plugin-fs write patterns: "Follow imageStore.js: lazy `import('@tauri-apps/plugin-fs')` + `appDataDir()` from `@tauri-apps/api/path` + `mkdir(recursive: true)` + `writeTextFile`."
- The `_chunk_knowledge_file(text, chunk_type)` helper in scanner.py is reusable for any H2-split file — new chunk types only need a one-line wrapper.

### 2026-03-24 — Study Developer — Tutor Phase 4 study-side implementation (session summary writer)

**Were any reads unnecessary?**
- No. The blueprint was comprehensive. Only needed to verify exact insertion points: capabilities JSON structure, `updateChunkEffectiveness` end in study.js, and `saveSessionToJournal` in StudyContext.jsx.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. Two study-side changes (capabilities + summary writer) were clearly separated from the Forge-side Step 3. The imageStore.js pattern reference was accurate and saved investigation time.

**What can be added to future prompts to increase performance?**
- The `writeTextFile` vs `writeFile` distinction matters: `writeTextFile` takes a string, `writeFile` takes bytes (Uint8Array). The prompt correctly specified `writeTextFile` for markdown content.
- The `readTextFile` try/catch pattern for file-not-found is the standard approach — Tauri doesn't have a separate `exists` check that's needed before reading text files.

### 2026-03-24 — Forge Developer — Tutor Phase 4 Forge-side (tutor_response chunk type)

**Were any reads unnecessary?**
- No. The config.py and scanner.py reads were all essential. The `discover_files()` function structure was critical for understanding where to add the extra scan path loop. The `_chunk_knowledge_file` helper was the right reuse target.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. Three Forge changes (enum, classification rule, chunker) were cleanly separated. The blueprint's `EXTRA_SCAN_PATHS` design was implementable as-is.
- The prompt specified `forge/knowledge/research/agent-prompt-feedback.md` for feedback, but no such file exists in the Forge repo. Feedback appended to the study-side file instead.
- The prompt specified `tests/` directory but Forge tests are in `src/test_*.py`. Minor path discrepancy.

**What can be added to future prompts to increase performance?**
- For Forge test paths: "Run `python3 -m pytest src/ -q`" (not `tests/`).
- The `_chunk_knowledge_file` reuse pattern is the standard for any new H2-split chunk type — one-line wrapper function + dispatch case.
- For cross-repo commits: note both repos need separate `git add` + `git commit` operations.

### 2026-03-24 — Study Security & Testing Analyst — Tutor Phase 4 QA (Forge ingestion)

**Were any reads unnecessary?**
- No. All 8 checks were efficiently verified via targeted greps. No full file reads needed — the dev logs from Study DEV and Forge DEV provided exact line references. Build and Forge test passes were the final gates.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 8-point checklist covered all critical paths across both repos: Tauri capabilities, study.js function, StudyContext wiring, Forge config, classification rules, scanner chunker+dispatch, build, and Forge tests. The cross-repo nature required slightly more checks than a single-repo QA.

**What would have made this prompt more efficient?**
- The cross-repo path alignment check (Tauri `$APPDATA` → Forge `EXTRA_SCAN_PATHS`) could have been specified as a single compound check: "Verify that the write path in study.js and the scan path in Forge config.py resolve to the same directory on macOS."
- Including the Forge test command (`python3 -m pytest src/ -q`) directly in the QA prompt avoids re-discovery.

**What can be added to future prompts to increase performance?**
- For cross-repo QA: "Verify path alignment between writer and reader" as a dedicated check — this is the most critical verification for any cross-repo data flow.
- For Forge QA: the test command is `python3 -m pytest src/ -q` (not `tests/`). Include this in all Forge QA prompts.

### 2026-03-24 — Study Documentation Analyst — Session Wrap (PROJECT_STATUS.md update)

**Were any reads unnecessary?**
- No. Only PROJECT_STATUS.md was read, and every section needed updates. The prompt provided all change content inline — no investigation required.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. All 6 changes were explicit and unambiguous. The migration 010 row was already present from the Phase 2 dev commit — the prompt couldn't have known this, but it was a harmless redundancy (skipped cleanly).
- The consolidated Recent Development Activity row is a good pattern — it summarizes a multi-phase effort as a single entry alongside the per-phase detail rows.

**What would have made this prompt more efficient?**
- The prompt could have noted "migration 010 may already be present — skip if so" to avoid the agent needing to check and decide.
- The exact row content was provided inline which is ideal — no ambiguity, mechanical insertion.

**What can be added to future prompts to increase performance?**
- For session wrap prompts: pre-check which sections already have current-date entries to avoid redundant additions.
- The "add rows after X" placement instruction is precise and efficient — continue this pattern for table insertions.

### 2026-03-24 — Study Developer — Updater diagnostic ("up to date" when newer release exists)

**Were any reads unnecessary?**
- No. Every read was essential: `updater.js` (26 lines, thin wrapper), `tauri.conf.json` (endpoint config + pubkey), `package.json` (version), `release.sh` (artifact pipeline), `release.yml` (CI pipeline), `StudyContext.jsx` (caller context). The WebFetch of the actual `latest.json` endpoint was the most diagnostic read — it confirmed the redirect resolves to v0.2.17, not v0.2.19.
- The `gh release list` and `gh release view` commands were essential for confirming draft vs published status.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 6-point investigation structure (updater.js, tauri.conf.json, package.json, endpoint URL, release.sh, static manifest) covered all relevant components. Point (6) — static manifest check — was a quick negative that ruled out an alternative update mechanism.
- The vexp pipeline was intentionally skipped per prompt instruction ("skip specialist file reads") which was correct — this is a pure infrastructure/devops diagnostic, not a code feature investigation.

**What would have made this prompt more efficient?**
- The prompt could have included a hypothesis: "The release may be in draft state — check `gh release list`" — this would have shortened the investigation since the root cause is entirely operational (draft not published), not a code bug.
- Specifying "check the GitHub redirect target of the endpoint URL" as a distinct step would have made the diagnostic more directed.

**What can be added to future prompts to increase performance?**
- For updater diagnostics: "The Tauri v2 updater delegates entirely to `@tauri-apps/plugin-updater:check()`. The app code is just a thin wrapper. The diagnostic is almost always about the endpoint, not the code."
- For GitHub Releases updater endpoints: "`/releases/latest/download/` only resolves to **published** (non-draft, non-prerelease) releases. Draft releases are invisible to this URL pattern."
- Both `release.sh` and the CI workflow create **draft** releases (`--draft` / `releaseDraft: true`). Every release requires manual publish on GitHub. This is by design but is the #1 cause of "up to date" false positives.
- `release.sh` only builds aarch64. CI builds both aarch64 + x86_64. For full-platform coverage, always use CI.

### 2026-03-25 — Study Developer — Release process audit (release.sh + updater config)

**Were any reads unnecessary?**
- No. Both files were essential: `release.sh` (192 lines, full pipeline) and `tauri.conf.json` (updater config + identifier). The full tauri.conf.json read was slightly more than needed (prompt only asked for identifier + updater section) but the file is small (51 lines).

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. Two files, two specific extractions, deposit. Minimal and efficient for a pure audit.

**What would have made this prompt more efficient?**
- Nothing — this is an ideal audit prompt. Two specific files, clear extraction targets, no ambiguity.

**What can be added to future prompts to increase performance?**
- For release pipeline audits: `release.sh` is the single entry point. It creates **draft** releases that must be manually published. The `/releases/latest/download/` URL only resolves to published releases.
- The `latest.json` generated by `release.sh` only covers `darwin-aarch64`. CI generates multi-platform artifacts.

### 2026-03-25 — Study Developer — bootWithFocus black screen fix (4 files)

**Were any reads unnecessary?**
- No. StudyContext.jsx (bootWithFocus catch block), ExamScopePicker.jsx (error state needed), SkillPicker.jsx and AssignmentPicker.jsx (also crash on error pickerData) were all essential.

**Was the prompt over-scoped or under-scoped?**
- Slightly under-scoped. The prompt specified ExamScopePicker error handling only, but `bootWithFocus` sets `pickerData({ error: true })` regardless of mode. SkillPicker and AssignmentPicker would crash on `pickerData.items` / `pickerData.materials` being undefined. All three needed the error guard.
- The prompt correctly identified the two fix vectors (clear focusContext + visible error state) from the diagnostic.

**What would have made this prompt more efficient?**
- Specifying "also add error handling to SkillPicker and AssignmentPicker since bootWithFocus serves all three modes" would have made the scope explicit.
- The `setMsgs([])` cleanup wasn't in the prompt but is necessary — `callClaudeStream` at line 1214 sets partial messages before potentially throwing. Without clearing, stale partial messages could persist.

**What can be added to future prompts to increase performance?**
- For catch-block fixes: "Check all consumers of the state being set in the catch block" — here, `pickerData` is consumed by 3 pickers, not just 1.
- For `bootWithFocus` changes: "bootWithFocus is called from ExamScopePicker, SkillPicker, AssignmentPicker, CourseHomepage (Continue Studying), and CurriculumScreen. Any state change in the catch block affects all callers."

### 2026-03-25 — Study Developer — Exam prep black screen diagnostic

**Were any reads unnecessary?**
- No. All 4 files were essential: CourseHomepage.jsx (button + onClick), StudyContext.jsx (enterStudy + selectMode + bootWithFocus), StudyScreen.jsx (picker guards + conditional rendering), ExamScopePicker.jsx (button handler + bootWithFocus call). The study.js read for `buildFocusedContext` exam branch was supplementary but confirmed the exam context builder handles empty materials gracefully.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4-part investigation (button handler, enterStudy, StudyScreen guards, ExamScopePicker→enterStudy flow) covered the full chain. The prompt correctly identified ExamScopePicker as the bridge between scope selection and session boot.
- The prompt asked to "show how `enterStudy` handles exam intent" — this was the right question since `enterStudy` delegates to `selectMode`, which is where exam-specific logic lives.

**What would have made this prompt more efficient?**
- The prompt could have specified "also read `bootWithFocus`" — this is the critical function called by the "Start exam prep" button, and it's where the black screen originates. The prompt focused on `enterStudy` but the actual failure point is one step later.
- Specifying "check what happens when `bootWithFocus` fails (catch block behavior)" would have immediately focused the diagnosis on the dead state.

**What can be added to future prompts to increase performance?**
- For black screen bugs after button clicks: "Trace state changes in BOTH the success path AND the failure path of the triggered async function. The black screen is almost always a failure-path state inconsistency."
- `bootWithFocus` failure leaves `focusContext` set (hiding pickers) but `msgs` empty (showing nothing). This is the canonical dead state pattern in this codebase. Future prompts should reference it.
- The notification system (`addNotif`) is NOT a toast — errors go to the notification queue. For user-facing error visibility, inline rendering or a dedicated error state is needed.

### 2026-03-24 — Study Developer — Git log audit (recent changes diagnostic)

**Were any reads unnecessary?**
- No. Both git log commands were essential and produced the complete picture. The `--oneline` view gave a quick inventory (29 commits). The `--stat --no-merges` view showed which files each commit touched, enabling the summary table.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped for a raw data dump. The prompt asked for verbatim output of two specific commands — no ambiguity, no investigation needed beyond running the commands.
- The "skip specialist file reads" instruction was correct — this is a pure git audit with no code investigation.

**What would have made this prompt more efficient?**
- The prompt was already minimal and efficient. Two commands, verbatim output, deposit.
- One operational issue: `git log --stat` on a repo with large commits (34 files in commit 4315573) can trigger a pager even with `--no-pager` in some environments. Specifying `GIT_PAGER=cat` or piping to `head` would have avoided the stuck-pager issue that required retrying.

**What can be added to future prompts to increase performance?**
- For git log audits: always use `GIT_PAGER=cat git log ...` to prevent pager hangs in non-interactive environments.
- The `--stat` format truncates long filenames with `...`. For exact filenames, use `--stat=200` (wider column) or `--name-only` for a clean file list.
- v0.2.18 has no GitHub Release despite having a version bump commit — this is a release process gap worth noting in any release audit.

### 2026-03-24 — Study Developer — Extraction pipeline integrity audit (4 areas)

**Were any reads unnecessary?**
- No. Every read directly answered one of the 4 audit questions. The extraction.js header read (lines 1-50) confirmed file integrity. The grep for `loadFacetBasedContent` in extraction.js was a zero-result negative confirmation (essential). The grep in study.js found all 5 call sites. The db.js read for `updateEffectiveness` and `getByFacetRanked` confirmed correct SQL. Git log commands confirmed no modifications.
- The StudyContext.jsx grep for `buildContext`/`buildFocusedContext` call sites was not explicitly requested but was necessary to verify the full propagation chain — study.js returns `{ ctx, chunkIds }` from context builders, so the consumer layer must also destructure correctly.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 4-area structure mapped cleanly to 4 independent checks. Each had a clear pass/fail criterion. No wasted investigation.
- The prompt correctly specified exact line ranges where possible (`lines 1-50`), exact methods to check (`updateEffectiveness`, `getByFacetRanked`), and exact expected behavior (`COALESCE`, `NULLS LAST` idiom).

**What would have made this prompt more efficient?**
- The prompt could have included the expected call site count ("5 call sites in study.js, 4 in StudyContext.jsx") so the agent can immediately verify completeness rather than having to determine the expected count independently.
- Specifying "also check StudyContext.jsx consumer sites" would have made the scope fully explicit. The prompt focused on study.js but the consumer layer is equally important.

**What can be added to future prompts to increase performance?**
- For API return type audits: "Check both the function's internal call sites AND the consumer layer (StudyContext.jsx)" — always verify the full chain.
- For "was file X modified recently" checks: `GIT_PAGER=cat git log --oneline -- path/to/file` is the fastest single command. The prompt correctly specified this.
- For db.js method isolation checks: "Confirm the new method uses UPDATE only and does not share columns with INSERT methods" — this is the key isolation criterion for additive db methods.
- For ORDER BY audits: specifying the expected clause sequence in the prompt ("binding_type → quality_rank → effectiveness NULLS LAST → confidence") enables fast pass/fail comparison.

### 2026-03-24 — Study Developer — Schema drift diagnostic (unified_into column missing)

**Were any reads unnecessary?**
- No. Every read was essential. The migration file confirmed the SQL exists. The PRAGMA on the live DB confirmed the column is missing. lib.rs revealed the root cause (migrations 008-010 not registered). The db.js grep found all 10 query references. The unification.js grep found 8 more. The `_sqlx_migrations` table confirmed only 7 migrations applied.
- The additional check for `skill_courses`, `chunk_relationships`, and `session_exchanges` tables (all missing) was not in the prompt but was essential — it revealed the scope is 3 missing migrations, not just 1.

**Was the prompt over-scoped or under-scoped?**
- Slightly under-scoped. The prompt focused on `unified_into` but the root cause (missing Rust migration registration) means migrations 009 and 010 are ALSO missing. The prompt should have asked "check if migrations 008-010 are all registered in lib.rs" rather than focusing only on the `unified_into` column.
- The prompt's 5-point structure was good but missed the critical file: `src-tauri/src/lib.rs` — the Rust migration runner where migrations must be registered. Points (1)-(5) investigated the JS/SQL side but not the Rust registration side.
- The prompt asked to "search db.js for any _safe_add_column" — correct instinct but the actual gap is in Rust, not JS.

**What would have made this prompt more efficient?**
- Adding a 6th point: "Read `src-tauri/src/lib.rs` — confirm migration 008 is registered in the `migrations` vec" would have immediately identified the root cause.
- Specifying "check `_sqlx_migrations` table in the live DB to see which migrations have actually run" would have been the fastest single diagnostic step.

**What can be added to future prompts to increase performance?**
- **Critical pattern for this codebase**: SQL migration files in `src-tauri/migrations/` are NOT auto-discovered. Each must be manually registered in `src-tauri/src/lib.rs` as a `Migration { version, description, sql, kind }` entry. This is the #1 cause of schema drift.
- For schema drift bugs: "Check both the migration file AND its registration in lib.rs" — the file existing is necessary but not sufficient.
- For live DB checks: the database lives at `~/Library/Application Support/com.everestmons.study/study.db` (identifier from `tauri.conf.json`). Use `sqlite3` directly for PRAGMA and table checks.
- For "no such column" errors: always check `_sqlx_migrations` table to see the last applied migration number. If the migration that adds the column has a higher version than the last applied, it's an unregistered migration.

### 2026-03-24 — Study Developer — Migration registration fix (008-010 in lib.rs)

**Were any reads unnecessary?**
- No. Only `src-tauri/src/lib.rs` was read (required to find the insertion point). The diagnostic from the prior step provided all context — no re-investigation needed.

**Was the prompt over-scoped or under-scoped?**
- Perfectly scoped. The prompt specified the exact file, exact insertion point (after version 7), exact 3 entries to add (version, description, sql path), exact formatting requirement (match existing entries), and exact commit message. Zero ambiguity.
- The "do NOT run cargo build directly" instruction was helpful — prevented an unnecessary 2-minute Rust compile cycle.

**What would have made this prompt more efficient?**
- Nothing — this is an ideal fix prompt. Exact instructions, single file, clear verification step (show updated vec), explicit commit message.

**What can be added to future prompts to increase performance?**
- This prompt is a template for "apply a known fix from a diagnostic." Pattern: (1) cite the diagnostic, (2) specify exact file + location, (3) specify exact change, (4) specify formatting constraint, (5) specify commit message. All 5 present here.
- For Rust file edits: "do NOT run cargo build — the app rebuilds on next tauri:dev" saves time and avoids unnecessary permission prompts.

### 2026-04-01 — Study Developer — Assignment date year-off-by-one diagnostic

**Were any reads unnecessary?**
- No. All reads were essential: `syllabusParser.js` (LLM prompt + validateSchedule), `api.js` (callClaude system prompt handling), `skills.js` (decomposeAssignments + scanForDueDate), `db.js` (schema/helpers). The live DB queries were critical for confirming the bug with real data.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 7-point investigation structure was thorough and each point contributed unique evidence. Point (5) searching for `new Date()` / `Date.now()` across the codebase was the broadest search but confirmed the key finding: the app never passes current date context to LLM prompts.

**What would have made this prompt more efficient?**
- Point (3) asking to query the live DB was the most valuable instruction — it provided definitive proof (2025 vs 2026 dates) within seconds. Future diagnostics involving stored data should always include a DB query step.
- Point (6) checking `decomposeAssignments()` overlapped significantly with point (2) tracing the date pipeline. Could be combined: "Trace date handling in both syllabusParser.js and skills.js decomposeAssignments."

**What can be added to future prompts to increase performance?**
- For LLM-output-quality bugs: always check whether the prompt includes current date/context. This is a common class of bug where the model's system prompt is overridden and loses default context.
- "Check the API call function to see if it injects any default context" — this was the key insight (callClaude overrides the model's default system prompt, losing the date).

### 2026-04-01 — Study Developer — Fix assignment date year-off-by-one (executable)

**Were any reads unnecessary?**
- The specialist file read was informative but not essential for this code-only task. The diagnostic findings already contained all needed context.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. Three distinct fixes (A, B, C) with clear boundaries. Each was independently testable. The prompt's guidance on semester heuristic ("don't over-engineer it") was helpful — prevented scope creep.

**What would have made this prompt more efficient?**
- Fix (A) could have specified "prepend at callsite, don't modify the const" — the SYLLABUS_SYSTEM_PROMPT is a module-level const, so prepending at the callsite was the only clean approach. Took a moment to decide this.
- Fix (C) could have specified "model it after migrateFacets pattern" — that's exactly what was done but the connection wasn't explicit.

**What can be added to future prompts to increase performance?**
- For "add utility + wire into N callsites" patterns: specify whether the utility should modify the const/template or be prepended at each callsite. This avoids a design decision during implementation.
- For one-time migration fixups: "follow the migrateFacets() pattern in db.js" is a single-sentence shortcut that sets the implementation pattern, guard key approach, and startup wiring all at once.

### 2026-04-01 — Study Security & Testing Analyst — Date year-offset fix QA (executable Step 2)

**Were any reads unnecessary?**
- No. All verification reads were targeted: api.js (utility), syllabusParser.js (callsite), skills.js (callsite + validation), db.js (migration), StudyContext.jsx (startup wiring). DB queries confirmed both pre-fix state and migration correctness.

**Was the prompt over-scoped or under-scoped?**
- Well-scoped. The 5-point verification structure maps cleanly to the 3 fixes + regression + edge cases. Each point was independently verifiable.

**What would have made this prompt more efficient?**
- Point (3) says "verify all dates are now in 2026" but the migration only runs at app startup — the DB won't have changed unless the app was restarted between steps. The prompt should say "simulate the migration via SQL and verify it would correct the right rows" or "restart the app, then verify." The current phrasing created a moment of confusion.

**What can be added to future prompts to increase performance?**
- For JS-runtime migrations tested via QA: always specify whether to "verify post-restart" or "simulate via SQL." JS migrations can't be triggered from the CLI.
