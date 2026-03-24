# study — Dynamic Input Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-dynamic-input-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a UI/code investigation task. **Task:** Investigate the current state of dynamic input and what's needed to implement the full spec. Read the spec at `study/docs/planning/dynamic-input-spec.md` (full file). Then investigate: (1) **Current code input mode:** The spec says code input exists. Find it — where is it implemented? What component renders it? What triggers the switch to code mode? Does the AI currently emit `[INPUT_MODE: code:python]` tags, or is it triggered differently? What features does code input currently have (monospace, line numbers, syntax highlighting, tab handling, language indicator)? (2) **Current InputBar component:** Read `src/components/study/InputBar.jsx` (full file). What does it render today? Is there already a mode-switching mechanism? What state drives the input variant? (3) **Message parsing for INPUT_MODE tags:** Does `study.js` or any other file currently parse `[INPUT_MODE: ...]` tags from AI responses? Search for `INPUT_MODE` across the codebase. If not parsed, is there a `[SESSION_EVENT: ...]` parser that could be extended? (4) **Math mode dependencies:** The spec describes a symbol toolbar with Greek letters, operators, calculus symbols, etc. This is Unicode insertion — no external dependencies needed. But are there any existing toolbar/popover patterns in the app that could be reused? Check SettingsModal, FolderPickerModal, DatePicker for popover/toolbar patterns. (5) **Code mode dependencies:** The spec mentions syntax highlighting and line numbers. Does the app currently use any code highlighting library? Or is it just monospace font? What would be needed for real syntax highlighting (e.g., highlight.js, prism)? (6) **System prompt:** Does `buildSystemPrompt()` currently include any instructions about `[INPUT_MODE: ...]` tags? Or would this be a new prompt addition? **Report:** current code input state (what exists, what's missing), InputBar architecture, INPUT_MODE parsing status, reusable UI patterns, dependency assessment for syntax highlighting, and prompt status. **Deposit:** `study/knowledge/research/dynamic-input-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: dynamic input diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-dynamic-input-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
