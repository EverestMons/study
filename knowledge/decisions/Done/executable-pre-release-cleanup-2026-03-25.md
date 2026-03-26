# study — Pre-Release Commit Cleanup
**Date:** 2026-03-25 | **Tier:** Small | **Execution:** Step 1 (DEV)

## How to Run

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/executable-pre-release-cleanup-2026-03-25.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation.
```

---
---

## STEP 1 — STUDY DEVELOPER (pre-release commit cleanup)

---

> You are the Study Developer. Skip specialist file reads. Clean up the working tree before running release.sh. (1) Add `vite.config.js.timestamp-*.mjs` to `.gitignore` if not already present — these are Vite temp files that should never be committed. (2) Stage and commit the following files: `src-tauri/Cargo.lock`, `src-tauri/gen/schemas/capabilities.json`, and all untracked files under `knowledge/` (decisions/Done/, development/). Use: `git add src-tauri/Cargo.lock src-tauri/gen/schemas/capabilities.json knowledge/` then `git commit -m "chore: commit outstanding build artifacts and knowledge files"`. (3) Confirm the working tree is clean after the commit by running `git status` and showing the output — the only remaining item should be the vite timestamp file (now gitignored) or nothing. Do not run release.sh — just clean the tree. No deposit needed.

---
