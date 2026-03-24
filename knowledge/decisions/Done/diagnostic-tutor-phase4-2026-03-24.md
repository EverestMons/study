# study — Tutor Phase 4 Diagnostic
**Date:** 2026-03-24 | **Type:** Diagnostic

## How to Run This Plan

Paste the following into Claude Code:

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/diagnostic-tutor-phase4-2026-03-24.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — STUDY DEVELOPER (phase 4 prerequisite audit)

---

> You are the Study Developer. Skip specialist file reads — this is a targeted code and config audit. Four questions: (1) Read `study/src-tauri/tauri.conf.json` or `study/src-tauri/capabilities/` — confirm whether `@tauri-apps/plugin-fs` is configured and what permissions are available. Specifically: is `fs:write-files` or equivalent write permission enabled? What base directories are permitted (e.g., `$APPDATA`, `$DOCUMENT`, `$RESOURCE`)? Can the plugin write to an arbitrary absolute path, or only to sandboxed directories? (2) Read `study/src/lib/study.js` — find `generateSessionEntry()` and the session end handler. Show: (a) the exact function signature of `generateSessionEntry()`; (b) where in `StudyContext.jsx` the session is marked complete and `generateSessionEntry()` is called — show the surrounding 10 lines including where `updateChunkEffectiveness()` was added in Phase 3; (c) whether there is any existing file write using `@tauri-apps/plugin-fs` anywhere in the study codebase — search for `import.*plugin-fs` or `writeTextFile` or `BaseDirectory` in study.js and StudyContext.jsx. (3) Read `study/package.json` — confirm `@tauri-apps/plugin-fs` is in dependencies. (4) Read `forge/src/config.py` — show the full `ChunkType` enum and the full `CLASSIFICATION_RULES` list so I can see the current chunk types and what file patterns are already mapped. Report all findings. Do not change anything. Deposit: `study/knowledge/development/tutor-phase4-diagnostic-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — CONSOLIDATION

---

> You are the Study Developer. Skip specialist file reads. Confirm `study/knowledge/development/tutor-phase4-diagnostic-2026-03-24.md` exists. Move this plan to Done: `mv study/knowledge/decisions/diagnostic-tutor-phase4-2026-03-24.md study/knowledge/decisions/Done/`. Commit: `"docs: tutor phase 4 diagnostic complete"`.

---
