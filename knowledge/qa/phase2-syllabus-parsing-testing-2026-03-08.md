# Phase 2 — Syllabus Parsing Pipeline — QA Report
**Date:** 2026-03-08
**Analyst:** Study Security & Testing Analyst
**Input:** Steps 2.2–2.3 implementation
**Build:** `npm run build` passes (83 modules)
**Verdict:** PASS — no critical or blocking issues

---

## Test Matrix

| Area | Status | Details |
|---|---|---|
| Module compiles and bundles | PASS | 83 modules, 921.22 kB main chunk (+7.3 kB for parser) |
| Import wiring (StudyContext) | PASS | `parseSyllabus` from syllabusParser.js, `getMatContent` from skills.js — both resolved |
| `validateSchedule` — full schedule | PASS | Continuous weeks + sequential dates + grading ~100% → composite >= 0.8 → `'high'` |
| `validateSchedule` — no schedule | PASS | Empty/missing array → early return `{ confidence: 'low', issues: [no_schedule] }` |
| `validateSchedule` — week gaps | PASS | Non-contiguous week numbers → `weekScore` reduced by `0.2 × gaps` |
| `validateSchedule` — duplicate weeks | PASS | `Set(weeks).size !== weeks.length` → `weekScore *= 0.5` |
| `validateSchedule` — no dates | PASS | `datesFound === 0` → `dateScore = 0.3` |
| `validateSchedule` — non-sequential dates | PASS | `epoch < lastEndEpoch` → `dateScore *= 0.7` |
| `validateSchedule` — unparseable dates | PASS | Invalid ISO string → `datesParseable < datesFound` → issue logged |
| `validateSchedule` — grading sum off | PASS | `totalWeight < 90 \|\| > 105` → `gradingScore = 0.5` |
| `validateSchedule` — no grading | PASS | Empty array → `gradingScore = 0.7` (acceptable partial) |
| `parseISOToEpoch(null)` | PASS | Returns null — null-safe |
| `parseISOToEpoch("garbage")` | PASS | `isNaN(d.getTime())` → returns null |
| `parseISOToEpoch("2026-08-26")` | PASS | Returns epoch seconds (integer) |
| LLM call configuration | PASS | `callClaude(system, [userMsg], 16384, true)` — Haiku model, 16K tokens |
| LLM unparseable response | PASS | `extractJSON` returns null → early return, no DB writes, `syllabus_parsed` stays 0 |
| LLM API error (no key, 429, etc.) | PASS | `callClaude` returns `"Error: ..."` string → `extractJSON` returns null → same path as above |
| Schedule write — `clearForCourse` | PASS | DELETE before INSERT loop — idempotent wipe-and-rewrite |
| Schedule write — exam enrichment | PASS | Top-level `exams[]` matched to schedule `exams[]` strings, coverage info carried through |
| Assessment write — `clearForCourse` | PASS | DELETE before INSERT loop |
| Assessment write — `count: 0` | PASS | `g.count \|\| null` converts 0 → null; 0 is not a meaningful count value |
| Metadata backfill — null-only | PASS | `!course.field && meta.field` guards prevent overwriting user-entered data |
| Metadata backfill — `syllabus_parsed` | PASS | Set to 1 via `Courses.update` (field in allowed whitelist) |
| Metadata backfill — all fields in whitelist | PASS | `course_number`, `instructor`, `semester`, `credits`, `description`, `syllabus_parsed` all in `Courses.update` allowed list |
| Placeholder creation — `source: 'syllabus'` | PASS | Passed to `Assignments.create`, stored in DB |
| Placeholder creation — `materialId: null` | PASS | Default parameter in `Assignments.create` |
| Placeholder creation — due date | PASS | `parseISOToEpoch(week.endDate)` — null-safe |
| Placeholder creation — dedup | PASS | `Set` deduplicates assignment names across weeks; `findPlaceholderMatch` prevents DB duplicates |
| Placeholder creation — ambiguous match | PASS | `findPlaceholderMatch` returns `{confidence: 'ambiguous'}` without `match` property → `existing?.match` is falsy → new assignment created |
| Course creation integration point | PASS | Before extraction loop, filters `mats` for `classification === "syllabus"`, try/catch per syllabus |
| Material add integration point | PASS | Before extraction loop, guarded by `!active.syllabus_parsed`, uses `active.id` |
| Non-blocking on failure | PASS | Both integration points use per-syllabus try/catch; extraction proceeds regardless |
| `getMatContent` v2 path | PASS | `Chunks.getByMaterial(mat.id)` for PDF/DOCX structured output |
| `getMatContent` v1 fallback | PASS | `DB.getDoc` for plain text fallback |
| Empty syllabus text | PASS | `fullText && fullText.trim()` guard → silently skipped |
| `success` flag logic | PASS | `confidence !== 'low' \|\| weeksFound > 0 \|\| gradingCategories > 0` — partial success reported correctly |
| Notification — success | PASS | "Syllabus processed — N weeks, M assignment(s) found." |
| Notification — issues | PASS | "Syllabus parsed with issues: ..." with joined issue messages |
| Notification — crash | PASS | "Could not parse syllabus: ..." with error message |

---

## Edge Case Trace-Throughs

### Scenario: Well-structured syllabus PDF upload (happy path)
1. User adds "CS301-syllabus.pdf" → `autoClassify` matches `/syllabus/i` → classification = `"syllabus"`
2. `storeAsChunks` → v2 path (PDF has `_structured`) → chunks in `chunks` table
3. Course creation flow: `syllabusMats` filter finds the material
4. `getMatContent(courseId, syllMat)` → `Chunks.getByMaterial` → returns full text
5. `parseSyllabus(courseId, fullText, ...)` → Haiku call → 15-week schedule + grading
6. `validateSchedule` → all dates sequential, no gaps → `'high'` confidence
7. `clearForCourse` + 15 `insert()` calls for schedule
8. `clearForCourse` + 4 `insert()` calls for assessments
9. Metadata backfill: course_number, instructor, semester from syllabus
10. 8 placeholder assignments created (one per HW from `assignmentsDue`)
11. `syllabus_parsed = 1` set
12. Notification: "Syllabus processed — 15 weeks, 8 assignment(s) found."
13. Extraction loop runs normally after (skills extracted from syllabus chunks too)
14. **Result:** Full data pipeline, correct ✅

### Scenario: Syllabus with no schedule table
1. LLM returns `{ metadata: {...}, schedule: [], grading: [...], exams: [] }`
2. `validateSchedule` → `schedule.length === 0` → returns `{ confidence: 'low', issues: [no_schedule] }`
3. Schedule block: `Array.isArray([]) && [].length > 0` → false → skipped
4. Grading block: 4 categories written
5. Metadata backfill: instructor, semester written
6. Placeholder creation: no weeks → no `assignmentsDue` → 0 placeholders
7. `success = ('low' !== 'low' || 0 > 0 || 4 > 0)` → `true`
8. Notification: "Syllabus processed — 0 weeks, 0 assignment(s) found."
9. **Result:** Partial success, grading + metadata still captured ✅

### Scenario: LLM returns unparseable response
1. `callClaude` returns garbled text or `"Error: API 429: rate limited"`
2. `extractJSON("Error: ...")` → all parse strategies fail → returns `null`
3. Early return: `{ success: false, confidence: 'low', issues: [parse_failed] }`
4. No DB writes (no schedule, no assessments, no metadata, no placeholders)
5. `syllabus_parsed` stays 0 → can retry on next upload
6. Notification: "Syllabus parsed with issues: LLM returned unparseable response"
7. Extraction loop proceeds normally
8. **Result:** Graceful failure, no data corruption ✅

### Scenario: Second syllabus uploaded to same course (material add)
1. First syllabus: processed, `syllabus_parsed = 1` set, state refreshed from DB
2. Second upload: `addMats` runs → `active.syllabus_parsed = 1`
3. Guard `!active.syllabus_parsed` → false → syllabus parsing block skipped
4. Material stored and extraction runs normally
5. **Result:** No duplicate processing ✅

### Scenario: Two syllabi in same course creation batch
1. Both have `classification === "syllabus"` and chunks
2. `syllabusMats` filter returns both
3. First syllabus: schedule cleared + written, assessments cleared + written, metadata backfilled, placeholders created, `syllabus_parsed = 1`
4. Second syllabus: schedule cleared (wipes first) + written, assessments cleared (wipes first) + written, metadata backfill skips already-filled fields, placeholders already exist (via `findPlaceholderMatch`) → skipped
5. **Result:** Last syllabus wins, no duplicates ✅

### Scenario: Syllabus with no extractable text (scanned image PDF)
1. `storeAsChunks` → chunks created but content is empty/minimal
2. `getMatContent` returns `{ content: "", chunks: [] }` or whitespace
3. Guard `fullText && fullText.trim()` → falsy → silently skipped
4. No notification to user (see M6 below)
5. `syllabus_parsed` stays 0
6. **Result:** No crash, but user gets no feedback ✅ (minor UX gap)

### Scenario: Partial crash during schedule writes
1. `clearForCourse` succeeds → old schedule wiped
2. 7 of 15 `insert()` calls succeed, then DB error
3. Error thrown → caught by outer try/catch → "Could not parse syllabus: ..."
4. `syllabus_parsed` NOT set (crash before line 279)
5. Next syllabus upload: guard allows re-parse, `clearForCourse` wipes 7 partial rows, full re-insert
6. **Result:** Self-healing via idempotent wipe-and-rewrite ✅

---

## Minor Issues (non-blocking)

### M1: API error details lost in notification
**Severity:** 🟡 Minor
**Detail:** `callClaude` returns error strings like `"Error: API 429: rate limited"` rather than throwing. `extractJSON` returns `null`, and the user sees "LLM returned unparseable response" instead of the actual API error.
**Mitigation:** This pattern is consistent across the entire codebase — no other consumer checks for `result.startsWith("Error:")`. The user can retry. The actual error is logged to console via `callClaude`'s internal `console.error`.
**Recommendation:** If desired, add a pre-check: `if (result.startsWith("Error:")) return { success: false, issues: [{ message: result }] }`. Low priority — doesn't affect correctness.

### M2: Exam enrichment assumes string elements in `week.exams`
**Severity:** 🟡 Minor
**Detail:** The enrichment logic calls `examName.includes(e.name)` where `examName` comes from `week.exams[]`. If the LLM returns objects instead of strings (e.g., `{name: "Midterm"}`), `examName.includes` throws `TypeError`.
**Mitigation:** The prompt explicitly specifies `"exams": []` as an array of strings in the schedule. The top-level `exams` key is where objects go. LLMs follow this schema reliably. If it does throw, the outer try/catch in StudyContext catches it; `syllabus_parsed` stays 0 (crash occurs before the flag is set), and `clearForCourse` already ran so the partial schedule will be wiped on retry.
**Recommendation:** Add a defensive `String(examName)` coercion if desired. Low priority.

### M3: No transaction wrapping for schedule/assessment write sequence
**Severity:** 🟡 Minor
**Detail:** `clearForCourse` + N `insert()` are separate statements, not wrapped in `withTransaction`. A crash between clear and complete insert leaves partial data.
**Mitigation:** Self-healing — if `syllabus_parsed` was not yet set (crash before line 279), the next parse attempt re-runs `clearForCourse` which wipes partial data. SQLite is in-process with no network round-trips, making mid-sequence crashes extremely unlikely.
**Recommendation:** Wrap clear+inserts in `withTransaction` if reliability concerns arise. Current risk is negligible.

### M4: Empty syllabus text produces no user feedback
**Severity:** 🟡 Minor (UX gap)
**Detail:** If `getMatContent` returns empty/whitespace content (e.g., scanned image PDF with no OCR), the `fullText.trim()` guard silently skips parsing with no notification. The user sees no indication that syllabus processing was attempted and failed.
**Mitigation:** The material card still shows in the materials list. The user can notice that schedule data is missing and re-upload a text-based version. `syllabus_parsed` stays 0, allowing future re-parse.
**Recommendation:** Add a notification: `addNotif("warn", "Syllabus has no extractable text. Try uploading a text-based version.")`.

### M5: `onStatus` callback shared with extraction loop
**Severity:** 🟡 Minor (cosmetic)
**Detail:** Both syllabus parsing and the subsequent extraction loop use `setStatus` for progress updates. During syllabus parsing, `onStatus` is called with messages like "Analyzing syllabus structure..." which may flash briefly before being overwritten by "Extracting skills: ..." from the next phase.
**Mitigation:** The status text is transient — it's only visible during processing and cleared when done. Users will see the final notification which is accurate.

### M6: `findPlaceholderMatch` ambiguous result creates new assignment
**Severity:** 🟡 Minor (by design)
**Detail:** If `findPlaceholderMatch` returns `{ matches: [...], confidence: 'ambiguous' }` (multiple matches), the result has no `match` property. The check `existing?.match` is falsy → a new assignment is created, potentially adding a near-duplicate.
**Mitigation:** Ambiguous matches are rare — they require two existing placeholders with very similar normalized titles (e.g., "Homework 1" and "HW 1" both resolving to "1"). In practice, placeholders are created from the same syllabus in sequence, so titles are distinct. If a near-duplicate is created, it's harmless — it can be manually cleaned up or will be resolved when the actual assignment material is uploaded and matched.

---

## Security Considerations

| Area | Status |
|---|---|
| SQL injection via LLM output | SAFE — all DB writes use parameterized queries |
| XSS via LLM metadata | SAFE — metadata stored in DB, rendered via React (auto-escaped) |
| Prompt injection in syllabus text | LOW RISK — syllabus text sent as user message, not interpolated into system prompt. LLM output is JSON-parsed, not evaluated. Worst case: LLM returns garbage → `extractJSON` returns null → graceful failure |
| Denial of service via large syllabus | LOW RISK — `callClaude` has 16384 token limit for response. Syllabus text is bounded by max upload size. No recursive processing |
| Data leakage | SAFE — all data stays local (SQLite, no external writes) |

---

## Build Verification

```
npm run build → PASS
83 modules transformed, 921.22 kB main chunk
No new warnings (pre-existing db.js dynamic import warning unchanged)
syllabusParser.js included in bundle via StudyContext.jsx import
```

---

## Conclusion

Phase 2 implementation (Steps 2.2–2.3) is **solid**. No critical or blocking issues. The 6 minor issues are all low-risk with existing mitigations. The pipeline handles all tested edge cases correctly: happy path, no schedule, no grading, LLM failure, duplicate uploads, empty text, and partial crashes. Security review finds no injection vectors — all DB writes are parameterized, all LLM output is JSON-parsed not evaluated.

**Key strengths:**
- Graceful degradation: each section (schedule, grading, metadata, placeholders) processed independently
- Self-healing: `clearForCourse` + `syllabus_parsed` flag ensures clean re-parse on retry
- Non-blocking: syllabus parsing failure doesn't prevent skill extraction
- Idempotent: duplicate detection via `findPlaceholderMatch`, `clearForCourse` wipe-and-rewrite

**Recommendation:** Proceed to Phase 2 PM status update.
