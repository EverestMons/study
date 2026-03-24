# study — Documentation Sync (PROJECT_STATUS + PROJECT_BRIEF)
**Date:** 2026-03-22 | **Tier:** Small | **Execution:** Step 1 (DOC)

## How to Run This Plan

Paste this into Claude Code:

Read the orchestration plan at `study/knowledge/decisions/executable-study-doc-sync-2026-03-22.md`. Execute Step 1, then stop.

---
---

## STEP 1 — DOC

---

> You are the Study Documentation Analyst. Read `study/PROJECT_STATUS.md` (currently last updated 2026-03-14, with session summaries appended for 2026-03-21 and 2026-03-22) and `study/PROJECT_BRIEF.md` (v1.0, 2026-03-05). **Task 1 — PROJECT_BRIEF v2.0:** The brief is massively outdated. It still lists session intent as "not yet built" and PDF support as "not yet implemented." Rewrite the brief to reflect the current state. Key updates: (1) Current State section — list all major features as implemented (session intent, PDF, OCR, facet architecture, curriculum dashboard, character sheet profile, concept links, mastery transfer, folder import, CIP taxonomy, cross-course skill unification, chunk metadata enrichment, materials staging redesign, self-updater). (2) Tech Stack — add tesseract.js, tauri plugins (dialog, fs, updater, process). (3) Architecture Overview — update to reflect 55+ source files, StudyContext + ScreenRouter decomposition, 3-tier skill hierarchy (parent → sub → facet), 8 migrations. (4) What Is NOT Yet Built — update to reflect only genuinely unbuilt items (local Whisper, Python sidecar deprioritized). (5) Current Priorities — update based on where the app actually is. (6) Open Questions — most are resolved, update or remove. Bump to v2.0, date 2026-03-22. **Task 2 — PROJECT_STATUS refresh:** The status file is enormous (~900 lines) with detailed feature descriptions that are now historical. The "What Is Working" table has 40+ entries. Restructure: keep the Department Status table current, keep the Codebase Summary current, move the massive "What Is Working" detail into a collapsed/archived section or trim to a summary table (feature name + status, no multi-paragraph descriptions). Update "What Is Specified But Not Yet Built" to reflect current reality. Update Recent Development Activity to include 2026-03-22 session. Keep Open Flags current (some were just resolved). **Constraints:** Preserve all factual content — do not delete information about implemented features, just restructure for readability. The session summaries appended at the bottom should be integrated into the main document, not left as appendices. Commit with message: `"docs: PROJECT_BRIEF v2.0 + PROJECT_STATUS refresh"`. **Final:** Move this plan to Done: `mv study/knowledge/decisions/executable-study-doc-sync-2026-03-22.md study/knowledge/decisions/Done/`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`. Plan complete — all steps executed.
