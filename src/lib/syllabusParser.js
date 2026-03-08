import { callClaude, extractJSON } from './api.js';
import { CourseSchedule, CourseAssessments, Courses, Assignments } from './db.js';

// --- Internal Helpers ---

/** Parse ISO 8601 date string to Unix epoch seconds. Returns null if unparseable. */
function parseISOToEpoch(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

// --- Deterministic Validation ---

/**
 * Deterministic validation of LLM output. Returns confidence score
 * and list of issues. Does NOT write to DB.
 *
 * @param {object} parsed — raw LLM JSON (metadata, schedule, exams, grading)
 * @returns {{ confidence: 'high'|'medium'|'low', issues: Array, _scores: object }}
 */
export function validateSchedule(parsed) {
  const issues = [];
  let dateScore = 1;
  let weekScore = 1;
  let gradingScore = 1;

  // --- 1. Schedule presence ---
  if (!parsed.schedule || !Array.isArray(parsed.schedule) || parsed.schedule.length === 0) {
    issues.push({ type: 'no_schedule', message: 'No schedule weeks found', severity: 'error' });
    return { confidence: 'low', issues, _scores: { dateScore: 0, weekScore: 0, gradingScore, composite: 0 } };
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
    if (new Set(weeks).size !== weeks.length) {
      weekScore *= 0.5;
      issues.push({ type: 'week_duplicates', message: 'Duplicate week numbers found', severity: 'warn' });
    }
  } else {
    weekScore = 0.5;
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
    dateScore = 0.3;
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
    gradingScore = 0.7;
  }

  // --- 5. Confidence composite ---
  const composite = (dateScore * 0.35) + (weekScore * 0.35) + (gradingScore * 0.3);
  let confidence;
  if (composite >= 0.8) confidence = 'high';
  else if (composite >= 0.5) confidence = 'medium';
  else confidence = 'low';

  return { confidence, issues, _scores: { dateScore, weekScore, gradingScore, composite } };
}

// --- LLM Prompt ---

const SYLLABUS_SYSTEM_PROMPT = `You are a syllabus parser. Extract structured data from the syllabus text below.

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
- Do NOT invent data. If information is not in the syllabus, use null or empty arrays.`;

// --- Main Entry Point ---

/**
 * Parse a syllabus: LLM extraction → validation → DB writes → placeholder assignments.
 *
 * @param {string} courseId
 * @param {string} materialText — full text content of the syllabus material
 * @param {object} [options]
 * @param {function} [options.onStatus] — progress callback (receives string)
 * @returns {Promise<SyllabusResult>}
 */
export async function parseSyllabus(courseId, materialText, options = {}) {
  const { onStatus } = options;

  // --- 1. Call Claude ---
  if (onStatus) onStatus('Analyzing syllabus structure...');
  const result = await callClaude(
    SYLLABUS_SYSTEM_PROMPT,
    [{ role: 'user', content: materialText }],
    16384,
    true  // useHaiku
  );

  // --- 2. Extract JSON ---
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

  // --- 3. Validate ---
  if (onStatus) onStatus('Validating schedule data...');
  const validation = validateSchedule(parsed);

  // --- 4-5. Write schedule ---
  let weeksFound = 0;
  if (Array.isArray(parsed.schedule) && parsed.schedule.length > 0) {
    if (onStatus) onStatus('Saving schedule...');
    await CourseSchedule.clearForCourse(courseId);

    for (const week of parsed.schedule) {
      // Enrich exam entries with coverage info from top-level exams
      const enrichedExams = (week.exams || []).map(examName => {
        const examDetail = (parsed.exams || []).find(
          e => examName.includes(e.name) || e.name.includes(examName)
        );
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
        weekNumber: week.weekNumber,
        startDate: parseISOToEpoch(week.startDate),
        endDate: parseISOToEpoch(week.endDate),
        topics: week.topics || [],
        readings: week.readings || [],
        assignmentsDue: week.assignmentsDue || [],
        exams: enrichedExams,
        parserConfidence: validation.confidence,
      });
      weeksFound++;
    }
  }

  // --- 6-7. Write assessments ---
  let gradingCategories = 0;
  if (Array.isArray(parsed.grading) && parsed.grading.length > 0) {
    await CourseAssessments.clearForCourse(courseId);
    for (const g of parsed.grading) {
      await CourseAssessments.insert(courseId, {
        category: g.category,
        weight: g.weight,
        count: g.count || null,
      });
      gradingCategories++;
    }
  }

  // --- 8. Course metadata backfill ---
  const course = await Courses.getById(courseId);
  const updates = {};
  const metadataBackfilled = [];
  const meta = parsed.metadata || {};

  if (!course.course_number && meta.courseNumber) { updates.course_number = meta.courseNumber; metadataBackfilled.push('course_number'); }
  if (!course.instructor && meta.instructor) { updates.instructor = meta.instructor; metadataBackfilled.push('instructor'); }
  if (!course.semester && meta.semester) { updates.semester = meta.semester; metadataBackfilled.push('semester'); }
  if (!course.credits && meta.credits) { updates.credits = meta.credits; metadataBackfilled.push('credits'); }
  if (!course.description && meta.description) { updates.description = meta.description; metadataBackfilled.push('description'); }

  updates.syllabus_parsed = 1;
  await Courses.update(courseId, updates);

  // --- 9. Create placeholder assignments ---
  const assignmentNames = new Set();
  const assignmentDueDates = {};

  for (const week of (parsed.schedule || [])) {
    for (const name of (week.assignmentsDue || [])) {
      const normalized = name.trim();
      if (normalized && !assignmentNames.has(normalized)) {
        assignmentNames.add(normalized);
        assignmentDueDates[normalized] = parseISOToEpoch(week.endDate);
      }
    }
  }

  let assignmentsCreated = 0;
  for (const name of assignmentNames) {
    const existing = await Assignments.findPlaceholderMatch(courseId, name);
    if (existing?.match) continue;

    await Assignments.create({
      courseId,
      title: name,
      dueDate: assignmentDueDates[name] || null,
      source: 'syllabus',
    });
    assignmentsCreated++;
  }

  // --- 10. Return result ---
  const success = validation.confidence !== 'low' || weeksFound > 0 || gradingCategories > 0;

  return {
    success,
    confidence: validation.confidence,
    weeksFound,
    assignmentsCreated,
    gradingCategories,
    metadataBackfilled,
    issues: validation.issues,
  };
}
