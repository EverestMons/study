# study — Homework 9 Unlock Gate State Diagnostic
**Date:** 2026-03-29 | **Type:** Diagnostic

---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a DB query + code-tracing task. **Investigate the exact state of the unlock gate for Homework 9 (Irvine Chapters 7-8).** Open the live database at `~/Library/Application Support/com.everestmons.study/study.db`.
>
> (1) Find the assignment: `SELECT a.id, a.title FROM assignments a WHERE a.title LIKE '%Homework 9%' OR a.title LIKE '%Irvine%Chapter%7%'`. Show the assignment ID.
> (2) Get its questions and required skills: `SELECT aq.id, aq.question_ref, aq.description, aqf.facet_id, f.skill_id, f.name as facet_name, s.name as skill_name, s.concept_key FROM assignment_questions aq LEFT JOIN assignment_question_facets aqf ON aq.id = aqf.question_id LEFT JOIN facets f ON aqf.facet_id = f.id LEFT JOIN sub_skills s ON f.skill_id = s.id WHERE aq.assignment_id = [ID from Q1]`. Show all results.
> (3) For each skill found in Q2, check facet mastery: `SELECT f.id, f.name, f.skill_id, fm.stability, fm.retrievability, fm.last_review_at, fm.reps FROM facets f LEFT JOIN facet_mastery fm ON f.id = fm.facet_id WHERE f.skill_id IN ([skill IDs from Q2])`. Show all results — especially any with NULL stability or retrievability.
> (4) For each skill, compute what `computeFacetReadiness()` would return — use the formula: if `stability` and `last_review_at` exist, compute `retrievability = e^(-elapsed_days / stability)`. If NULL stability, the facet has no mastery data. Report per-skill average retrievability.
> (5) Check if ANY `[SKILL_UPDATE]` tags were emitted during recent sessions for these skills: `SELECT se.* FROM session_exchanges se WHERE se.session_id IN (SELECT id FROM sessions WHERE course_id = [course ID] ORDER BY created_at DESC LIMIT 5) AND se.skill_id IN ([skill IDs from Q2]) ORDER BY se.created_at DESC LIMIT 20`. If no results, check if `session_exchanges` has ANY rows for this course.
> (6) Summarize: for the first question on Homework 9, list each required skill, its facet count, its computed readiness, and whether it would pass the 60% gate.
>
> **Deposit findings** to `knowledge/research/hw9-unlock-state-diagnostic-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/research/hw9-unlock-state-diagnostic-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
