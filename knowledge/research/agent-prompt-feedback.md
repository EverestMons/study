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

### What improves prompt quality
- Cite exact function names for large files, not just file paths.
- Reference the development knowledge index to check if a feature has been eliminated/redesigned (e.g., `modepicker-elimination-2026-03-14.md`).
- Structured output format (per-dimension: what exists / prompt text / gaps) produces excellent diagnostics.
- **"Adapt for AI tutoring context" should be standard** for any IES/classroom-research prompt. AI tutoring is a fundamentally different modality — naive application of classroom recommendations produces incorrect priorities.
- **Include "What NOT to change" section** in gap analyses — prevents next-step agents from breaking well-implemented features while fixing gaps.
