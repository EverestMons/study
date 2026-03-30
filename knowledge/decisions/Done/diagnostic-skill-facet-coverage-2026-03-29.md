# study — Skill-to-Facet Coverage Gap Diagnostic
**Date:** 2026-03-29 | **Type:** Diagnostic

---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a code-tracing + data audit task. **Investigate how skills and facets are created during extraction, and identify where coverage gaps can occur.** This diagnostic has two parts: code tracing and live DB audit.
>
> **Part A — Code tracing (extraction pipeline):**
> (1) In `skills.js`, trace `runExtractionV2()` — after the API returns extracted skills/facets, how are they written to the DB? Which functions in db.js handle skill creation and facet creation? Are skills and facets always created together, or can a skill be created without facets?
> (2) In `extraction.js`, trace `extractChapter()` — what does the LLM response look like? Does it always include facets nested under skills? What happens if the LLM returns a skill with zero facets — does the code skip it, create a skill without facets, or error?
> (3) Trace `decomposeAssignments()` in `skills.js` — when assignment questions get their `requiredSkills`, where do those skill references come from? Are they matched to extracted skills by ID, conceptKey, or name? Could a required skill reference point to a skill that has no facets?
> (4) Check the `facets` table schema and `Facets` db module — is there a foreign key or constraint ensuring every skill has at least one facet? Or is it purely application-level?
> (5) Check `chunk_facet_bindings` — are bindings created during extraction alongside facets? Can a facet exist with zero bindings?
>
> **Part B — Live DB audit:**
> Open the live database at `~/Library/Application Support/com.everestmons.study/study.db`. Run these queries and report exact results:
> (6) `SELECT COUNT(*) FROM sub_skills` — total skills
> (7) `SELECT s.id, s.name FROM sub_skills s LEFT JOIN facets f ON f.skill_id = s.id WHERE f.id IS NULL` — skills with ZERO facets
> (8) `SELECT s.id, s.name, COUNT(f.id) as facet_count FROM sub_skills s LEFT JOIN facets f ON f.skill_id = s.id GROUP BY s.id ORDER BY facet_count ASC LIMIT 20` — skills with lowest facet counts
> (9) For any assignment in the DB, check if its required skills have facets: `SELECT aq.description, aqf.facet_id, f.skill_id, s.name FROM assignment_questions aq LEFT JOIN assignment_question_facets aqf ON aq.id = aqf.question_id LEFT JOIN facets f ON aqf.facet_id = f.id LEFT JOIN sub_skills s ON f.skill_id = s.id LIMIT 20`
> (10) `SELECT COUNT(*) FROM facets WHERE id NOT IN (SELECT DISTINCT facet_id FROM chunk_facet_bindings)` — orphan facets with no chunk bindings
>
> **Deposit findings** to `knowledge/research/skill-facet-coverage-diagnostic-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/research/skill-facet-coverage-diagnostic-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
