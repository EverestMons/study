# study — Clean Navigation Routes Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-clean-routes-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a UI/navigation investigation task. **Task:** The CEO wants strict navigation hierarchy: Main Menu → Course Level → Course Options (materials, schedule, curriculum, study). Settings, notifications, and profile are "inward" paths — the user can only go back to where they came from, not jump to a different screen. Diagnose the current navigation state. **Investigate:** (1) **Screen state management.** In `StudyContext.jsx`, find `screen` state and `setScreen`. List every possible value of `screen` (the enum of all screens). Find `previousScreen` state — how is it used? Is there a navigation stack, or just a single "previous" value? (2) **All `setScreen()` call sites.** Search the entire `src/` directory for every `setScreen(` call. For each, report: file, line, what screen it navigates to, and what triggered the navigation (button click, handler, etc.). This is the complete navigation graph. (3) **Top bar / header navigation.** Find the top bar or header component that appears across screens. Does it have buttons for Settings, Profile, Notifications that are always accessible? Can the user click these from ANY screen, or are they gated? List every navigation button in the header and what it does. (4) **Back button behavior.** How does "back" work? Is there a universal back button? Does it use `previousScreen`? Does it use a stack? Can the user go back from Settings to wherever they were? (5) **Screen hierarchy violations.** Based on your findings, identify every path where a user can "jump" to a screen that breaks the CEO's intended hierarchy (Main Menu → Course → Course Options, with Settings/Profile/Notifications as inward-only). Examples: Can a user go from Materials directly to Profile and then to Schedule? Can a user go from Settings to a different course? Can notifications navigate the user to a different screen? (6) **Current screen categories.** Categorize every screen value into the CEO's hierarchy: (a) Main Menu screens, (b) Course-level screens, (c) Course option screens (materials, schedule, curriculum, study), (d) Overlay screens (settings, notifications, profile). Are there screens that don't fit this hierarchy? **Report:** the full navigation graph (every screen → screen transition with trigger), all hierarchy violations, and the current back navigation mechanism. **Deposit:** `study/knowledge/research/clean-routes-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: clean navigation routes diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-clean-routes-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
