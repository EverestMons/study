# study — Tutor Phase 3 Diagnostic
**Date:** 2026-03-24 | **Type:** Diagnostic

## How to Run This Plan

Paste the following into Claude Code:

```
Read the plan at /Users/marklehn/Desktop/GitHub/study/knowledge/decisions/diagnostic-tutor-phase3-2026-03-24.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — STUDY DEVELOPER (phase 3 prerequisite audit)

---

> You are the Study Developer. Skip specialist file reads — this is a targeted schema and code audit. (1) Read `study/src-tauri/migrations/005_facets.sql` — show the full `chunk_facet_bindings` table definition including the `teaching_effectiveness` column type, default value, and any constraints. (2) Read `study/src/lib/db.js` — find the `ChunkFacetBindings` module and show all its methods in full: what queries exist, whether there is any method that writes `teaching_effectiveness`, and the exact signature of `getByFacetRanked()` — specifically which columns it selects and how it orders results. (3) Read `study/src/lib/study.js` — find `collectFacetBindings()` and `loadFacetBasedContent()` as they exist AFTER the Phase 2 changes. Show: (a) the full return statement of `loadFacetBasedContent()` confirming it now returns `{ ctx, chunkIds }`; (b) the sort/order logic in `collectFacetBindings()` or wherever bindings are ranked before being passed to `loadChunksForBindings()` — specifically whether `quality_rank` or `teaching_effectiveness` is used in ordering; (c) whether `loadFacetBasedContent()` is called anywhere in study.js or StudyContext.jsx and whether those call sites now destructure `{ ctx, chunkIds }`. (4) Read `study/src/lib/db.js` — find the `SessionExchanges` module added in Phase 2 and show `getBySession()` in full — confirm the column names returned match: session_id, facet_id, chunk_ids_used, mastery_before, mastery_after, rating. Report all findings. Do not change anything. Deposit: `study/knowledge/development/tutor-phase3-diagnostic-2026-03-24.md`. Standard prompt feedback protocol → `study/knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — CONSOLIDATION

---

> You are the Study Developer. Skip specialist file reads. Before starting, confirm `study/knowledge/development/tutor-phase3-diagnostic-2026-03-24.md` exists. Update `study/knowledge/decisions/diagnostic-tutor-phase3-2026-03-24.md` — move it to Done: `mv study/knowledge/decisions/diagnostic-tutor-phase3-2026-03-24.md study/knowledge/decisions/Done/`. Commit: `"docs: tutor phase 3 diagnostic complete"`.

---
