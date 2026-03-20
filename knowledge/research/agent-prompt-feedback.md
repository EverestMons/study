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

### What improves prompt quality
- Cite exact function names for large files, not just file paths.
- Reference the development knowledge index to check if a feature has been eliminated/redesigned (e.g., `modepicker-elimination-2026-03-14.md`).
- Structured output format (per-dimension: what exists / prompt text / gaps) produces excellent diagnostics.
