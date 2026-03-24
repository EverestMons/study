# study — Continue Feature Diagnostic
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DEV diagnostic)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/diagnostic-continue-feature-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DEV (Diagnostic)

---

> You are the Study Developer. Read your specialist file at `study/agents/STUDY_DEVELOPER.md` first. Skip glossary — this is a UI/data flow investigation task. **Task:** The CEO wants a "Continue" button on CourseHomepage that picks up where the student left off — using prerequisite ordering and the student's mastery state to determine the next logical skill/facet to study. Investigate what's needed. **Investigate:** (1) **CourseHomepage current layout.** Read `src/screens/CourseHomepage.jsx`. What cards/buttons exist? Where would a "Continue" action fit — is there room for a prominent button, or should it replace an existing card? What does the current click-routing state machine look like (the `getCourseState()` function from the diagnostic earlier)? (2) **Prerequisite ordering data.** The chunk relationships plan just shipped. Verify: does `ChunkPrerequisites` exist in `db.js`? What methods are available? Can we query "given a course, what's the next chunk the student hasn't mastered yet, following prerequisite order?" (3) **Student mastery state.** How do we determine "where the student left off"? Options: (a) the most recently studied skill (from `sessions` table — last session's focus skill), (b) the lowest-mastery skill that has prerequisites satisfied, (c) the next chunk in prerequisite order after the last mastered chunk. Which data is most readily available? (4) **"Next skill" algorithm.** Given the prerequisite ordering + mastery state, design the logic: query all skills for the course → sort by prerequisite order → find the first skill where (mastery is low OR untested) AND (all prerequisite chunks have been studied). This is the "continue" target. What queries are needed? Do the existing DB methods support this, or do we need new ones? (5) **Session resume vs. fresh start.** Should "Continue" resume the last study session (if one exists with the same skill), or always start a fresh session? Check: does the app currently support session resume, or does `enterStudy` always create a new session? (6) **What `bootWithFocus` needs.** The "Continue" button should ultimately call `bootWithFocus({ type: "skill", skill: nextSkill })` to start studying. What enriched skill data does `bootWithFocus` expect? Can we get that from `loadSkillsV2` + the prerequisite-based selection, or do we need additional loading? **Report:** CourseHomepage layout, prerequisite data availability, "next skill" algorithm recommendation, session resume status, and `bootWithFocus` data requirements. **Deposit:** `study/knowledge/research/continue-feature-diagnostic-2026-03-22.md`. After your output receipt, standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Commit with message: `"docs: continue feature diagnostic"`. **Final:** Move this diagnostic to Done: `mv study/knowledge/decisions/diagnostic-continue-feature-2026-03-22.md study/knowledge/decisions/Done/`. Plan complete — all steps executed.
