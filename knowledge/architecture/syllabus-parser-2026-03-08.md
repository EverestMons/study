# Syllabus Parser — Architecture Blueprint
**Date:** 2026-03-08
**Analyst:** Study Systems Analyst
**Spec:** `docs/planning/assignment-scheduler-spec.md` — Phase 2 (lines 175–309)
**Handoff:** DEV

---

## 1. Module Interface

**File:** `src/lib/syllabusParser.js`
**Dependencies:** `api.js` (callClaude, extractJSON), `db.js` (CourseSchedule, CourseAssessments, Courses, Assignments)

### Exported Functions

```javascript
/**
 * parseSyllabus(courseId, materialText, options?)
 *
 * Main entry point. Sends syllabus text to Claude, validates response
 * deterministically, writes to DB tables, creates placeholder assignments.
 *
 * @param {string} courseId
 * @param {string} materialText — full text content of the syllabus material
 * @param {object} [options]
 * @param {function} [options.onStatus] — progress callback
 * @returns {Promise<SyllabusResult>}
 *
 * SyllabusResult: {
 *   success: boolean,
 *   confidence: 'high' | 'medium' | 'low',
 *   weeksFound: number,
 *   assignmentsCreated: number,
 *   gradingCategories: number,
 *   metadataBackfilled: string[],  // which fields were updated
 *   issues: Array<{ type: string, message: string, severity: 'warn' | 'error' }>
 * }
 */
export async function parseSyllabus(courseId, materialText, options = {}) {}

/**
 * validateSchedule(parsed)
 *
 * Deterministic validation of LLM output. Returns confidence score
 * and list of issues. Does NOT write to DB.
 *
 * @param {object} parsed — raw LLM JSON (metadata, schedule, exams, grading)
 * @returns {{ confidence: 'high'|'medium'|'low', issues: Array }}
 */
export function validateSchedule(parsed) {}
```

---

## 2. LLM Prompt Design

### System Prompt

```
You are a syllabus parser. Extract structured data from the syllabus text below.

Respond with ONLY a JSON object matching this exact schema:

{
  "metadata": {
    "courseNumber": "CS 301 or null if not found",
    "instructor": "Dr. Smith or null",
    "semester": "Fall 2026 or null",
    "credits": 3,
    "description": "Catalog description if present, null otherwise"
  },
  "schedule": [
    {
      "weekNumber": 1,
      "dates": "Aug 26 - Aug 30",
      "startDate": "2026-08-26",
      "endDate": "2026-08-30",
      "topics": ["Course overview", "Introduction to algorithms"],
      "readings": ["Chapter 1"],
      "assignmentsDue": [],
      "exams": []
    }
  ],
  "exams": [
    {
      "name": "Midterm",
      "weekNumber": 7,
      "date": "2026-10-11",
      "coversWeeks": [1, 2, 3, 4, 5, 6],
      "coversTopics": ["Intro", "Sorting", "Trees"]
    }
  ],
  "grading": [
    { "category": "Homework", "weight": 30, "count": 8 },
    { "category": "Midterm", "weight": 25, "count": 1 },
    { "category": "Final Exam", "weight": 30, "count": 1 },
    { "category": "Participation", "weight": 15, "count": null }
  ]
}

Rules:
- Extract ALL weeks from the schedule. If the syllabus uses a table format, parse every row.
- Dates must be ISO 8601 (YYYY-MM-DD). If dates are ambiguous (e.g., "Week 3" with no calendar dates), set startDate and endDate to null but still include the week.
- topics must be a non-empty array for every week (this is the primary content).
- readings and assignmentsDue should be arrays (empty if none that week).
- exams array in schedule is for inline exam mentions. The top-level exams array is for detailed exam scope.
- coversWeeks in exams should be an integer array of week numbers covered.
- grading weights are percentages (not decimals). They should sum to approximately 100.
- count in grading is the number of that assessment type (null if not specified or if continuous like "Participation").
- If the syllabus has no schedule table, extract what you can from topic lists, week-by-week descriptions, or dated sections.
- If there is no grading information, return an empty grading array.
- Do NOT invent data. If information is not in the syllabus, use null or empty arrays.
```

### User Message

```
Parse this syllabus and extract the structured schedule, exams, grading, and course metadata.
```

### Call Parameters

```javascript
callClaude(systemPrompt, [{ role: "user", content: materialText }], 16384, true)
//                                                                          ^^^^
//                                                              useHaiku = true (cost optimization)
```

**Rationale for Haiku:** Syllabi are 2-8 pages. The task is structured extraction (not reasoning). Haiku handles this well and costs ~10x less than Sonnet. If Haiku produces low-confidence results, a fallback to Sonnet could be added later.

---

## 3. Deterministic Validation Rules

### `validateSchedule(parsed)` Implementation

```javascript
export function validateSchedule(parsed) {
  const issues = [];
  let dateScore = 1;   // 0-1
  let weekScore = 1;   // 0-1
  let gradingScore = 1; // 0-1

  // --- 1. Schedule presence ---
  if (!parsed.schedule || !Array.isArray(parsed.schedule) || parsed.schedule.length === 0) {
    issues.push({ type: 'no_schedule', message: 'No schedule weeks found', severity: 'error' });
    return { confidence: 'low', issues };
  }

  // --- 2. Week number continuity ---
  const weeks = parsed.schedule
    .map(w => w.weekNumber)
    .filter(n => typeof n === 'number');
  if (weeks.length > 0) {
    const sorted = [...weeks].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) gaps++;
    }
    if (gaps > 0) {
      weekScore = Math.max(0, 1 - gaps * 0.2);
      issues.push({ type: 'week_gaps', message: `${gaps} gap(s) in week numbering`, severity: 'warn' });
    }
    // Check for duplicates
    if (new Set(weeks).size !== weeks.length) {
      weekScore *= 0.5;
      issues.push({ type: 'week_duplicates', message: 'Duplicate week numbers found', severity: 'warn' });
    }
  } else {
    weekScore = 0.5; // No week numbers at all — partial credit
    issues.push({ type: 'no_week_numbers', message: 'No week numbers in schedule', severity: 'warn' });
  }

  // --- 3. Date validation ---
  let datesFound = 0;
  let datesParseable = 0;
  let datesSequential = true;
  let lastEndEpoch = 0;

  for (const w of parsed.schedule) {
    if (w.startDate) {
      datesFound++;
      const d = new Date(w.startDate);
      if (!isNaN(d.getTime())) {
        datesParseable++;
        const epoch = d.getTime();
        if (epoch < lastEndEpoch) datesSequential = false;
        lastEndEpoch = epoch;
      }
    }
    if (w.endDate) {
      datesFound++;
      const d = new Date(w.endDate);
      if (!isNaN(d.getTime())) {
        datesParseable++;
      }
    }
  }

  if (datesFound === 0) {
    dateScore = 0.3; // No dates at all
    issues.push({ type: 'no_dates', message: 'No dates found in schedule', severity: 'warn' });
  } else {
    dateScore = datesParseable / datesFound;
    if (datesParseable < datesFound) {
      issues.push({ type: 'unparseable_dates', message: `${datesFound - datesParseable} unparseable date(s)`, severity: 'warn' });
    }
    if (!datesSequential) {
      dateScore *= 0.7;
      issues.push({ type: 'non_sequential_dates', message: 'Dates are not in chronological order', severity: 'warn' });
    }
  }

  // --- 4. Grading weight sum ---
  if (Array.isArray(parsed.grading) && parsed.grading.length > 0) {
    const totalWeight = parsed.grading.reduce((sum, g) => sum + (g.weight || 0), 0);
    if (totalWeight < 90 || totalWeight > 105) {
      gradingScore = 0.5;
      issues.push({ type: 'grading_sum', message: `Grading weights sum to ${totalWeight}% (expected ~100%)`, severity: 'warn' });
    }
  } else {
    gradingScore = 0.7; // No grading info — not necessarily wrong
  }

  // --- 5. Confidence composite ---
  const composite = (dateScore * 0.35) + (weekScore * 0.35) + (gradingScore * 0.3);
  let confidence;
  if (composite >= 0.8) confidence = 'high';
  else if (composite >= 0.5) confidence = 'medium';
  else confidence = 'low';

  return { confidence, issues, _scores: { dateScore, weekScore, gradingScore, composite } };
}
```

### Confidence Scoring Weights

| Factor | Weight | High (1.0) | Medium (~0.5) | Low (~0) |
|---|---|---|---|---|
| Dates | 35% | All ISO 8601, sequential | Some missing or unparseable | No dates at all |
| Weeks | 35% | Continuous 1..N, no gaps | Few gaps | No week numbers |
| Grading | 30% | Sum 90–105% | Missing grading section | Sum way off |

---

## 4. Data Flow

```
User uploads "syllabus.pdf"
  │
  ▼
autoClassify() → classification = "syllabus"
  │
  ▼
storeAsChunks() → material stored, text available
  │
  ▼
Upload pipeline (StudyContext.jsx) checks classification
  │
  ├── classification === "syllabus" && !course.syllabus_parsed
  │     │
  │     ▼
  │   parseSyllabus(courseId, fullMaterialText)
  │     │
  │     ├── 1. callClaude(prompt, materialText, 16384, true)
  │     ├── 2. extractJSON(response)
  │     ├── 3. validateSchedule(parsed) → confidence + issues
  │     │
  │     ├── 4. CourseSchedule.clearForCourse(courseId)
  │     ├── 5. CourseSchedule.insert() × N weeks
  │     │     └── Maps: startDate/endDate → epoch, topics/readings/assignmentsDue/exams → JSON
  │     │
  │     ├── 6. CourseAssessments.clearForCourse(courseId)
  │     ├── 7. CourseAssessments.insert() × N categories
  │     │
  │     ├── 8. Courses.update(courseId, { metadata fields, syllabus_parsed: 1 })
  │     │     └── Only backfills fields that are currently null/empty on the course row
  │     │
  │     ├── 9. Create placeholder assignments:
  │     │     └── For each unique assignment name in schedule[].assignmentsDue:
  │     │         Assignments.create({ courseId, title, dueDate: week.endDate, source: 'syllabus' })
  │     │
  │     └── 10. Return SyllabusResult
  │
  ├── Then: runExtractionV2() for skill extraction (same as before)
  │
  └── Notification: "Syllabus processed — {N} weeks, {M} assignments found"
```

### Detailed Write Operations

#### Step 5: Schedule Writes

```javascript
for (const week of parsed.schedule) {
  await CourseSchedule.insert(courseId, {
    weekNumber: week.weekNumber,
    startDate: parseISOToEpoch(week.startDate),  // null-safe
    endDate: parseISOToEpoch(week.endDate),
    topics: week.topics || [],        // stored as JSON array
    readings: week.readings || [],
    assignmentsDue: week.assignmentsDue || [],
    exams: week.exams || [],
    parserConfidence: validation.confidence,
  });
}
```

#### Step 7: Assessment Writes

```javascript
for (const g of (parsed.grading || [])) {
  await CourseAssessments.insert(courseId, {
    category: g.category,
    weight: g.weight,
    count: g.count || null,
  });
}
```

#### Step 8: Course Metadata Backfill

```javascript
// Only update fields that are currently null/empty — don't overwrite user edits
const course = await Courses.getById(courseId);
const updates = {};
const backfilled = [];
const meta = parsed.metadata || {};

if (!course.course_number && meta.courseNumber) { updates.course_number = meta.courseNumber; backfilled.push('course_number'); }
if (!course.instructor && meta.instructor) { updates.instructor = meta.instructor; backfilled.push('instructor'); }
if (!course.semester && meta.semester) { updates.semester = meta.semester; backfilled.push('semester'); }
if (!course.credits && meta.credits) { updates.credits = meta.credits; backfilled.push('credits'); }
if (!course.description && meta.description) { updates.description = meta.description; backfilled.push('description'); }

updates.syllabus_parsed = 1;
await Courses.update(courseId, updates);
```

#### Step 9: Placeholder Assignment Creation

```javascript
// Collect all unique assignment names from schedule
const assignmentNames = new Set();
const assignmentDueDates = {};  // name → epoch

for (const week of parsed.schedule) {
  for (const name of (week.assignmentsDue || [])) {
    const normalized = name.trim();
    if (normalized && !assignmentNames.has(normalized)) {
      assignmentNames.add(normalized);
      // Use week's endDate as due date (best available from syllabus)
      assignmentDueDates[normalized] = parseISOToEpoch(week.endDate);
    }
  }
}

let assignmentsCreated = 0;
for (const name of assignmentNames) {
  // Check if assignment already exists (idempotency)
  const existing = await Assignments.findPlaceholderMatch(courseId, name);
  if (existing?.match) continue;  // Already created — skip

  await Assignments.create({
    courseId,
    title: name,
    dueDate: assignmentDueDates[name] || null,
    source: 'syllabus',
  });
  assignmentsCreated++;
}
```

---

## 5. Integration Point

### Where in the Upload Pipeline

**File:** `src/StudyContext.jsx`
**Two entry points:** course creation (line 373) and material add (line 850)

Both follow the same pattern:
```javascript
var extractable = mats.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);
for (var ei = 0; ei < extractable.length; ei++) {
  // ... runExtractionV2()
}
```

**Change:** Before the extraction loop, check for syllabus materials and run `parseSyllabus` first.

```javascript
// --- Syllabus parsing (before skill extraction) ---
var syllabusMats = newMeta.filter(m => m.classification === "syllabus");
if (syllabusMats.length > 0 && !active.syllabus_parsed) {
  for (const syllMat of syllabusMats) {
    setStatus("Parsing syllabus: " + syllMat.name + "...");
    try {
      // Load full text from chunks
      const chunks = await Chunks.getByCourse(active.id);
      const syllChunks = chunks.filter(c => c.material_id === syllMat.id);
      const fullText = syllChunks.map(c => c.content).join("\n\n");

      if (fullText.trim()) {
        const result = await parseSyllabus(active.id, fullText, { onStatus: setStatus });
        if (result.success) {
          addNotif("success", "Syllabus processed — " + result.weeksFound + " weeks, " + result.assignmentsCreated + " assignment(s) found.");
        } else {
          addNotif("warn", "Syllabus parsed with issues: " + result.issues.map(i => i.message).join("; "));
        }
      }
    } catch (e) {
      console.error("Syllabus parsing failed:", e);
      addNotif("warn", "Could not parse syllabus: " + e.message);
    }
  }
}

// --- Skill extraction (existing code) ---
var extractable = newMeta.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);
// ...existing extraction loop...
```

### Why Before Extraction

1. Placeholders exist before skill extraction runs → `decomposeAssignments` can match against them immediately
2. Course metadata (instructor, semester) is available for skill extraction context
3. Non-blocking: if syllabus parsing fails, extraction proceeds normally

### Handling Re-parses

The `course.syllabus_parsed` flag prevents automatic re-parsing on every upload. If a user uploads a second syllabus or updates the first one, re-parsing requires manual trigger (future UI). `CourseSchedule.clearForCourse()` + `CourseAssessments.clearForCourse()` make re-parsing safe (idempotent wipe-and-rewrite).

---

## 6. Exam Scope Parsing

### `coversWeeks` → `course_schedule` Mapping

The `exams` array in the LLM output includes `coversWeeks: [1, 2, 3, 4, 5, 6]`. This maps directly to `course_schedule` rows by `week_number`.

**Storage:** Exam entries are stored in `course_schedule.exams` (JSON array) for the week they occur in. The top-level `parsed.exams` array with `coversWeeks` is stored as a separate structure — either in the schedule row's `exams` JSON field (enriched) or in a future `course_exams` table.

**For Phase 2 (minimal):** Store the `coversWeeks` data directly in the schedule row's `exams` JSON:

```javascript
// When writing schedule, enrich exam entries with coverage info
for (const week of parsed.schedule) {
  const enrichedExams = (week.exams || []).map(examName => {
    // Find matching top-level exam entry
    const examDetail = (parsed.exams || []).find(e => examName.includes(e.name) || e.name.includes(examName));
    if (examDetail) {
      return {
        name: examDetail.name,
        date: examDetail.date,
        coversWeeks: examDetail.coversWeeks || [],
        coversTopics: examDetail.coversTopics || [],
      };
    }
    return { name: examName };
  });

  await CourseSchedule.insert(courseId, {
    // ...other fields...
    exams: enrichedExams,
  });
}
```

**Consumer (exam prep mode):** When a student selects "Exam Prep" and picks "Midterm":
1. Read `course_schedule` row containing the midterm → `exams[0].coversWeeks = [1,2,3,4,5,6]`
2. Query `course_schedule` for those weeks → get `topics` arrays
3. Match topics to uploaded materials via skill extraction bindings
4. Pre-select those materials in the exam prep picker

---

## 7. Error Handling

### LLM Returns Unparseable JSON

```javascript
const result = await callClaude(systemPrompt, messages, 16384, true);
const parsed = extractJSON(result);

if (!parsed) {
  return {
    success: false,
    confidence: 'low',
    weeksFound: 0,
    assignmentsCreated: 0,
    gradingCategories: 0,
    metadataBackfilled: [],
    issues: [{ type: 'parse_failed', message: 'LLM returned unparseable response', severity: 'error' }],
  };
}
```

No DB writes occur. The `syllabus_parsed` flag stays 0. User sees a warning notification. They can re-upload or manually enter course info.

### Dates Are Nonsensical

Handled by `validateSchedule()`:
- Non-sequential dates → `dateScore` reduced, issue logged
- Unparseable ISO dates → `parseISOToEpoch` returns null, stored as null in `course_schedule`
- Dates in wrong year → validation doesn't reject (professors may post next semester's syllabus), but confidence reduced

The schedule is still written with whatever dates could be parsed. Null dates are acceptable — the `CASE WHEN due_date IS NULL THEN 1 ELSE 0 END` ordering pattern handles them.

### Syllabus Has No Schedule Table

The LLM is instructed to extract what it can from topic lists, week-by-week descriptions, or dated sections. If it returns an empty schedule:
- `validateSchedule` sets confidence = 'low'
- No schedule rows written
- Grading and metadata still processed (they may exist independently)
- No placeholder assignments created
- Notification: "Syllabus parsed with issues: No schedule weeks found"

### Partial Success

The pipeline is designed for graceful degradation:

| LLM Output | Written | Confidence |
|---|---|---|
| Full schedule + grading + metadata | All tables + placeholders | high |
| Schedule only, no grading | Schedule + placeholders | medium |
| Grading only, no schedule | Assessments only | medium |
| Metadata only | Course backfill only | low |
| Nothing parseable | No writes | low |

---

## 8. Internal Helpers

```javascript
/**
 * Parse ISO 8601 date string to Unix epoch seconds. Returns null if unparseable.
 */
function parseISOToEpoch(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Deduplicate assignment names across all weeks.
 * Returns Map<normalizedName, { title: string, dueDate: number|null }>
 */
function collectAssignmentNames(schedule) {
  // ... see Step 9 above
}
```

---

## 9. File Layout

```
src/lib/syllabusParser.js  (~200 lines estimated)
  ├── parseISOToEpoch()       — internal helper
  ├── validateSchedule()      — exported, deterministic validation
  └── parseSyllabus()         — exported, main entry point
```

No new DB tables. No new migrations. All storage targets already exist:
- `course_schedule` — `CourseSchedule.insert()`
- `course_assessments` — `CourseAssessments.insert()`
- `courses` — `Courses.update()`
- `assignments` — `Assignments.create()` with `source: 'syllabus'`

---

## 10. Testing Considerations

| Scenario | Expected Behavior |
|---|---|
| Well-structured syllabus with table | Full schedule, high confidence |
| Syllabus with no dates | Schedule with null dates, medium confidence |
| Syllabus with grading but no schedule | Assessments written, no schedule, low confidence |
| PDF syllabus with formatting artifacts | LLM handles format variation, validation catches issues |
| Re-upload same syllabus | `syllabus_parsed = 1` guard prevents re-parse |
| Syllabus + assignment uploaded together | Syllabus parsed first → placeholders exist → assignment matches |
| Empty/corrupt material text | `extractJSON` returns null → early return, no writes |
| Grading sums to 130% | Written as-is, validation flags issue, medium confidence |
