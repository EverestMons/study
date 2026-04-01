# Study — Assignment Date Year-Off-By-One Diagnostic
**Date:** 2026-04-01 | **Tier:** Small | **Execution:** Step 1 (DEV) → Step 2 (DEV consolidation)

## How to Run This Plan

```
Read the plan at study/knowledge/decisions/diagnostic-assignment-date-year-offset-2026-04-01.md. Execute Step 1. After completing Step 1, stop and wait for my confirmation before proceeding to Step 2.
```

---
---

## STEP 1 — DEV

---

> **FIRST — claim this plan:** `import shutil; shutil.move("knowledge/decisions/diagnostic-assignment-date-year-offset-2026-04-01.md", "knowledge/decisions/in-progress-diagnostic-assignment-date-year-offset-2026-04-01.md")`. Skip specialist file and glossary reads — this is a code-tracing task. **Investigate the full date pipeline for assignment due dates.** The CEO reports that parsed assignment dates are showing up one year older than they should be (e.g., 2026 dates appearing as 2025). Trace every step where a date is created, transformed, or displayed: **(1)** Read `src/lib/syllabusParser.js` — find the LLM prompt that extracts dates from syllabi. What year context is provided to the model? Does it pass the current year, the semester year, or nothing? If "semester year" — where does that value come from? Is there a hardcoded year anywhere? **(2)** Read the `validateSchedule` function in the same file — does post-validation adjust years? Is there any logic that clamps dates to a range or infers a year from semester context? **(3)** Check how `course_schedule` stores dates — is it ISO string, epoch, or something else? Query the live DB at `~/Library/Application Support/com.everestmons.study/study.db`: `SELECT week_number, dates, assignments_due FROM course_schedule LIMIT 10` — report the raw stored values. **(4)** Check how assignment `due_date` is stored and displayed — trace from DB storage through to the UI component that renders the date. Is there an epoch-to-date conversion that could be off by timezone/year? **(5)** Check if the app has ANY concept of "current date" or "current semester" — search for `new Date()`, `Date.now()`, any semester detection logic, any year inference. Report whether the app passes current date context to the LLM during syllabus parsing. **(6)** Check `src/lib/skills.js` `decomposeAssignments()` — does it extract dates from assignment text? What year does it assume? **(7)** Report: what is the exact mechanism producing the wrong year? Is it the LLM prompt missing year context, a validation function adjusting dates, a storage/conversion bug, or something else? **Deposit:** Write findings to `knowledge/research/date-year-offset-diagnostic-2026-04-01.md` using `with open("knowledge/research/date-year-offset-diagnostic-2026-04-01.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.

---
---

## STEP 2 — DEV (Consolidation)

---

> Before starting, read `knowledge/research/date-year-offset-diagnostic-2026-04-01.md` and check the Output Receipt status field. If status is not Complete, stop and report the issue to the CEO before proceeding. **Consolidation only — no investigative work.** Confirm the diagnostic deposit exists and Output Receipt is Complete. Update `PROJECT_STATUS.md` — add entry: "Diagnostic: assignment date year-off-by-one investigation complete, findings in knowledge/research/." Then move plan to Done: `import shutil; shutil.move("knowledge/decisions/in-progress-diagnostic-assignment-date-year-offset-2026-04-01.md", "knowledge/decisions/Done/diagnostic-assignment-date-year-offset-2026-04-01.md")`. Commit: `"chore: status update + move date-year-offset diagnostic to Done"`.
