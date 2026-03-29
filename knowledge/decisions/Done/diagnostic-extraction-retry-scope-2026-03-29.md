# study — Extraction Retry Scope Diagnostic
**Date:** 2026-03-29 | **Type:** Diagnostic

---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a code-tracing task. **Investigate the extraction retry path.** When a user clicks "Retry" on a material that partially failed extraction, trace exactly what happens: (1) Find the retry button handler in MaterialsScreen.jsx — what function does it call? What arguments does it pass? (2) Trace that function into StudyContext.jsx — does it call `skills.js:extractSkills()` or `extraction.js:extractFacets()` or both? What chunks does it pass — ALL chunks for the material, or only chunks that failed/have no extracted skills? (3) In `extraction.js`, check `extractFacets()` — does it check whether a chunk already has facet bindings before sending it to the API? Or does it re-extract everything it receives? (4) In `skills.js`, check `extractSkills()` — same question: does it filter out chunks that already have extracted skills? (5) Check the DB: is there a per-chunk extraction status column (e.g., `extraction_status`, `extracted`, `has_skills`) that could be used to filter? If not, what query would identify "already extracted" chunks (e.g., chunks with existing `chunk_facet_bindings` rows)? **Deposit findings** to `knowledge/research/extraction-retry-scope-diagnostic-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/research/extraction-retry-scope-diagnostic-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
