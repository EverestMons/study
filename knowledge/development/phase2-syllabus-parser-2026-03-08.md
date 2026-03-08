# Phase 2 — Syllabus Parser — Development Log
**Date:** 2026-03-08
**Developer:** Study Developer Agent
**Blueprint:** `knowledge/architecture/syllabus-parser-2026-03-08.md`
**Spec:** `docs/planning/assignment-scheduler-spec.md` (Phase 2)
**Build:** `npm run build` passes (83 modules, 921.22 kB main chunk)

---

## Summary

Created `src/lib/syllabusParser.js` (~230 lines) implementing the syllabus parsing pipeline: LLM extraction via Haiku, deterministic validation with composite confidence scoring, DB writes to 4 tables, and placeholder assignment creation.

---

## Step 2.2 — Implement syllabusParser.js

### `src/lib/syllabusParser.js` (NEW)

**Dependencies:** `api.js` (callClaude, extractJSON), `db.js` (CourseSchedule, CourseAssessments, Courses, Assignments)

**Internal helpers:**
- `parseISOToEpoch(dateStr)` — ISO 8601 → epoch seconds, null-safe

**Exported functions:**

| Function | Lines | Description |
|---|---|---|
| `validateSchedule(parsed)` | ~80 | Deterministic validation: schedule presence, week continuity, date sequencing, grading sum. Composite confidence = date (35%) + week (35%) + grading (30%). Returns `{ confidence, issues, _scores }`. |
| `parseSyllabus(courseId, materialText, options?)` | ~100 | Main entry: Claude call (Haiku, 16384 tokens) → extractJSON → validate → write schedule rows (with enriched exam data) → write assessments → backfill course metadata (null-only) → create placeholder assignments (idempotent). Returns `SyllabusResult`. |

**LLM prompt:**
- System prompt defines exact JSON schema with 4 sections: metadata, schedule, exams, grading
- 13 extraction rules covering edge cases (no dates, no grading, table vs. prose formats)
- User message is the raw syllabus text

**Key design decisions:**
1. **Haiku model** — syllabi are structured extraction (not reasoning), ~10x cheaper than Sonnet
2. **Exam enrichment** — schedule-level exam strings matched against top-level exam details to carry `coversWeeks` and `coversTopics` into schedule rows
3. **Null-only backfill** — course metadata only updated for fields that are currently null/empty, preserving user edits
4. **Idempotent placeholders** — `findPlaceholderMatch` prevents duplicate assignment creation on re-parse
5. **Clear-and-rewrite** — `clearForCourse` + insert loop for both schedule and assessments makes re-parsing safe
6. **Graceful degradation** — each section (schedule, grading, metadata) processed independently; partial success still returns useful data

**Validation thresholds:**
- `high` confidence: composite >= 0.8
- `medium` confidence: composite >= 0.5
- `low` confidence: composite < 0.5

**Error handling:**
- Unparseable LLM response → early return, no DB writes, `syllabus_parsed` stays 0
- Missing schedule → `low` confidence, grading/metadata still processed
- Non-sequential dates → confidence reduced, data still written with available dates
- Grading sum off → flagged as issue, data still written

---

## Step 2.3 — Wire Upload Auto-Trigger

### `src/StudyContext.jsx` (MODIFIED)

**New imports:**
- `getMatContent` added to `skills.js` import
- `parseSyllabus` imported from `./lib/syllabusParser.js`

**Two integration points — both BEFORE the `extractable` skill extraction loop:**

#### 1. Course creation flow (~line 374)
- Filters `mats` for `classification === "syllabus"` with chunks
- No `syllabus_parsed` guard needed (new course, always 0)
- Loads full text via `getMatContent(courseId, syllMat)` (handles v1 + v2 paths)
- Calls `parseSyllabus(courseId, fullText, { onStatus: setStatus })`
- Success notification: "Syllabus processed — N weeks, M assignment(s) found."
- Failure notification: "Syllabus parsed with issues: ..."
- Non-fatal: `try/catch` wraps each syllabus, extraction proceeds regardless

#### 2. Material add flow (~line 871)
- Same logic but filters `newMeta` and uses `active.id`
- Guarded by `!active.syllabus_parsed` — prevents re-parsing on every material add
- Re-parse requires manual trigger (future UI)

**Why before extraction:**
1. Placeholder assignments exist before skill extraction → `decomposeAssignments` can match immediately
2. Course metadata (instructor, semester) available for extraction context
3. Non-blocking: syllabus failure doesn't prevent extraction

---

## Verification

- `npm run build` → PASS (83 modules, 921.22 kB main chunk, no new warnings)
- `syllabusParser.js` now included in bundle (was tree-shaken in Step 2.2)
- Main chunk grew +7.3 kB (913.90 → 921.22 kB) for parser module
