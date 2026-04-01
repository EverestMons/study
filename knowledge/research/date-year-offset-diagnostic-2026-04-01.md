# Date Year-Off-By-One Diagnostic
**Date:** 2026-04-01 | **Status:** Complete

## Summary

Assignment due dates from `decomposeAssignments()` are stored as **2025** when they should be **2026**. The root cause is that the LLM prompt in `decomposeAssignments()` provides **no current-year context**, and the `callClaude()` API call overrides the model's default system prompt — so the model has no way to know the current year. When assignment documents omit the year from dates (e.g., "Due: January 27"), the model defaults to 2025.

## Evidence

### Schedule dates (correct — 2026)
`course_schedule.start_date` / `end_date` are all 2026:
- Week 1: 2026-01-12 → 2026-01-18
- Week 2: 2026-01-19 → 2026-01-25
- Week 8: 2026-03-02 → 2026-03-08

### Assignment due dates (wrong — 2025 for most)
`assignments.due_date` from `source='decomposition'`:
- Module 1 Worksheet: **2025**-01-20
- PA1 Arrays of Objects: **2025**-01-27
- PA2 Sorted Set: **2025**-02-10
- Worksheet W2: **2025**-01-27
- ...all early assignments: **2025**
- PA3 Linked List: **2026**-03-03 (correct — assignment doc likely had explicit year)
- PA4 Stack & Queue: **2026**-03-24 (correct — same reason)

## Root Cause Analysis

### (1) Syllabus Parser — `src/lib/syllabusParser.js`
- **LLM prompt (`SYLLABUS_SYSTEM_PROMPT`)**: Does NOT pass the current year or current date. However, the prompt's example dates use "2026" years, which anchors the model. Combined with the syllabus text typically containing semester info like "Spring 2026", the model correctly produces 2026 dates.
- **`validateSchedule()`**: Checks date parseability and chronological order but does NOT check or adjust years. No year clamping logic.
- **Storage**: Dates are stored as Unix epoch seconds via `parseISOToEpoch()` — simple `new Date(isoString).getTime() / 1000`. No timezone/year conversion bug here; the stored values are correct (2026).

### (2) `decomposeAssignments()` — `src/lib/skills.js:282`
**This is where the bug occurs.** The decomposition prompt:
- Sends raw assignment text as `ASSIGNMENTS:\n{content}`
- Asks LLM to return `"dueDate": "date if found, null otherwise"`
- Provides **zero year context** — no current date, no semester, no year
- Uses `callClaude(asgnPrompt, [...], 16384, true)` — Haiku model with custom system prompt

The LLM receives assignment text like "Due: January 27" and must guess the year. Without any year signal, it defaults to 2025 (its training-data-centric "present").

The date is then parsed at line 349: `new Date(a.dueDate)` → epoch. If the LLM returns "January 27, 2025", this correctly becomes a 2025 epoch — the bug is in the LLM output, not the parsing.

### (3) `scanForDueDate()` — `src/lib/skills.js:265`
Regex fallback for dates in assignment text. Two patterns:
- Pattern 1: `\w+\s+\d{1,2},?\s*\d{4}` — requires 4-digit year (safe)
- Pattern 2: `\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}` — allows 2-digit year

For 2-digit years, `new Date("1/20/25")` in V8 → 2025-01-20 (century window: 00-49 → 2000+). This is technically correct parsing of "25" → 2025, but if the document meant the 2025-2026 school year and wrote "25" meaning Spring 2026, this would also be wrong. Minor secondary issue — the primary problem is the LLM path.

### (4) `callClaude()` — `src/lib/api.js:26`
The API call sends the custom prompt as the `system` parameter. The Anthropic API does NOT inject the current date when a custom system prompt is provided. The model genuinely does not know what year it is.

### (5) App's concept of current date/semester
- `new Date()` / `Date.now()` used extensively for timestamps, UI display, and FSRS scheduling — but NEVER passed as context to LLM prompts.
- No semester detection logic exists.
- Courses table has a `semester` field, but it's **empty** for both existing courses (syllabus parser didn't extract it or wasn't run).
- The app has no mechanism to pass current date context to any LLM call.

### (6) `decomposeAssignments()` date extraction
Two paths, both vulnerable:
1. **LLM path** (primary): LLM returns `dueDate` string → `new Date()` → epoch. Bug is LLM returning 2025.
2. **Regex path** (fallback): `scanForDueDate()` extracts from text. Only fires if LLM returned null. Requires year in the text to match.

## Exact Mechanism

```
Assignment doc says: "Due: January 27"
  → decomposeAssignments() sends to Haiku with NO year context
  → Haiku returns: { "dueDate": "January 27, 2025" }   // guessed 2025
  → new Date("January 27, 2025") → epoch 1737936000     // correct parse of wrong year
  → stored in assignments.due_date as 1737936000         // 2025-01-27
  → UI displays: "Jan 27" (same-year format hides the year!)
```

The UI format function (`formatDueDate` in StudyContext.jsx:35-38) shows "Jan 27" without year when the date's year matches the current year. Since the stored year is 2025 (not matching 2026), it actually shows the full date with year — making the bug visible.

## Recommended Fix

Add current date context to LLM prompts. In `decomposeAssignments()`, prepend to the system prompt:
```
Today's date is ${new Date().toISOString().split('T')[0]}. The current academic year is ${year}.
```

And/or: after the LLM returns dates, cross-reference against `course_schedule` dates for the same course to detect year mismatches and correct them.

---

## Output Receipt
- **Status:** Complete
- **Deposited:** 2026-04-01
- **Location:** `knowledge/research/date-year-offset-diagnostic-2026-04-01.md`
