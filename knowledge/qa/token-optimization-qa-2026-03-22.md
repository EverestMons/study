# Token Optimization — QA Report
**Date:** 2026-03-22 | **Agent:** Study Security & Testing Analyst | **Step:** 2

---

## Verification Areas

### 1. Model downgrades — PASS
- **evaluateAnswer** (study.js:1898): `callClaude(prompt, [...], 1024, true)` — Haiku confirmed.
- **Flag re-exam** (SkillsPanel.jsx:192): `callClaude(flagPrompt, [...], 4096, true)` — Haiku confirmed.
- **generateProblems** (study.js:1843): `callClaude(prompt, [...], 8192)` — Sonnet (no 4th arg = default `useHaiku=false`). Unchanged, correct.

### 2. Facet concept link batching — PASS
- `generateFacetConceptLinks` (conceptLinks.js:194-206): New facets now batched in groups of `FACET_BATCH_SIZE` (60).
- Nested loop: `for (const newBatch of newBatches) { for (const existBatch of existBatches) { ... } }`
- `buildFacetPrompt(newBatch, existBatch)` — passes batch, not full list.
- `validNewIds` uses `newBatch.map(...)` — scoped to current batch.
- **Call count analysis:** 30 new + 200 existing → `ceil(30/60) * ceil(200/60)` = 1 × 4 = 4 calls (same count but each call sends only its batch of new facets, not all 30 repeated). For 90 new + 200 existing → `ceil(90/60) * ceil(200/60)` = 2 × 4 = 8 calls (previously 4 calls each with all 90 new facets; now 8 calls each with 60 or 30 new facets — net token savings).

### 3. Verification preview truncation — PASS
- `verifyDocument` (skills.js:245): `ch.content.substring(0, 150)` — truncated to 150 chars. Was 300.

### 4. Assignment facet pre-filtering — PASS
- `decomposeAssignments` (skills.js:312-321): Keyword extraction from `asgnContent`, stopword removal, then facet filtering by name/category word match.
- **Fallback:** `if (filteredFacets.length < 10) filteredFacets = courseFacets;` — sends full list if filtering too aggressive. Correct.
- Only applies to facet path (`useFacets === true`). Skill-based path unchanged. Correct.

### 5. Tutoring calls unchanged — PASS
- `bootSession` (StudyContext.jsx:1212): `callClaudeStream(bootSystem, [...], ...)` — no model parameter, uses default Sonnet. Unchanged.
- `sendMessage` (StudyContext.jsx:1270): `callClaudeStream(sysPrompt, chatMsgs, ...)` — no model parameter, uses default Sonnet. Unchanged.

### 6. Extraction calls unchanged — PASS
- `extractChapter` (extraction.js:916-920): `callClaude(..., 12288, true)` — Haiku. Unchanged.
- `enrichFromMaterial` (extraction.js:1271-1275): `callClaude(..., 12288, true)` — Haiku. Unchanged.
- `wireCrossChapterPrereqs` (extraction.js:851): `callClaude(..., 4096, true)` — Haiku. Unchanged.

### 7. Build verification — PASS
`npx vite build --mode development` — builds successfully, no errors.

---

## Summary
| Area | Status |
|---|---|
| 1. Model downgrades (eval + flag) | PASS |
| 2. Facet concept link batching | PASS |
| 3. Verification preview truncation | PASS |
| 4. Assignment facet pre-filtering | PASS |
| 5. Tutoring calls unchanged | PASS |
| 6. Extraction calls unchanged | PASS |
| 7. Build verification | PASS |

**Overall: 7/7 PASS**
