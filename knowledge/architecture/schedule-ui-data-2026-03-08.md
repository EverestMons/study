# Schedule UI — Data Architecture Blueprint
**Date:** 2026-03-08
**Analyst:** Study Systems Analyst
**Implementation:** `src/screens/ScheduleScreen.jsx`, `src/screens/HomeScreen.jsx`
**Related:** `knowledge/design/schedule-ui-2026-03-08.md`

---

## 1. Architectural Decision: Component-Local vs Context State

### Decision: Component-local data loading — no new StudyContext state

Schedule data is **not** stored in StudyContext. Both the HomeScreen info bars and the ScheduleScreen load their data directly from DB modules via component-local `useEffect` hooks.

**Rationale:**
- Schedule data is read-only and display-only — no other components need it
- Adding schedule state to StudyContext (already 51 `useState`, 9 `useRef`) would increase context size and re-render blast radius for data only consumed by 2 screens
- Schedule data is cheap to load (small row counts, indexed queries) and infrequently accessed (HomeScreen mount, ScheduleScreen mount)
- No cross-component communication needed — info bars and schedule screen independently query the same DB tables

**Trade-off:** Navigating from HomeScreen info bar to ScheduleScreen triggers a second load of the same data. Acceptable because the schedule screen needs enriched data (skills, questions) that the HomeScreen doesn't load.

---

## 2. Data Loading Strategy

### HomeScreen Info Bars — Eager on mount, lightweight

```
Trigger:    useEffect([courses]) — fires on mount and when courses array changes
Scope:      All courses (N queries per course, N = number of courses)
Cached:     In component state (summaries), survives re-renders
Invalidated: When courses array reference changes (new course added/deleted)
```

**Queries per course (2 queries, no joins):**
1. `Assignments.getByCourse(courseId)` — returns rows with `dueDate` (epoch), `status`, `source`, `materialId`
2. `CourseSchedule.getByCourse(courseId)` — returns rows with `exams` JSON column

**No skill loading.** Info bars don't show readiness — only counts and proximity. This keeps the HomeScreen fast (<50ms per course on SQLite).

**Computation (per course):**
```javascript
{
  overdueCount:  assignments.filter(a => a.dueDate && a.dueDate < now && a.status !== 'completed').length,
  dueThisWeek:   assignments.filter(a => a.dueDate && a.dueDate >= now && a.dueDate < now + 7*86400).length,
  nextExam:      soonest future exam from schedule rows { name, daysUntil, epoch },
}
```

**Cancellation guard:** `var cancelled = false` with cleanup `return () => { cancelled = true }` prevents stale setState on unmount.

### ScheduleScreen — On-demand, full enrichment

```
Trigger:    useEffect([]) — fires once on mount
Scope:      Single course (active.id)
Cached:     In component state (items, skills), survives re-renders
Invalidated: Not invalidated — fresh load each time user navigates to schedule
```

**Queries (3 base + N per assignment):**
1. `Assignments.getByCourse(active.id)` — all assignments
2. `CourseSchedule.getByCourse(active.id)` — schedule with exams
3. `loadSkillsV2(active.id)` — all skills with mastery data
4. `Assignments.getQuestions(a.id)` × N — for each assignment, load questions with skill mappings

**Why N+3 queries instead of a single batch:** `Assignments.getQuestions` returns per-assignment data with JOIN on `assignment_question_skills` + `sub_skills`. No batch API exists. With typical course sizes (5–15 assignments), the N queries add <100ms total. Not worth a new batch method.

---

## 3. Readiness Computation

### Assignment Readiness

```
                                    ┌─────────────┐
  assignments table ───────────────→│ assignment  │
                                    │   row       │
                                    └──────┬──────┘
                                           │ getQuestions(a.id)
                                    ┌──────▼──────┐
                                    │  questions  │
                                    │  with skill │
                                    │  mappings   │
                                    └──────┬──────┘
                                           │ extract requiredSkills
                                    ┌──────▼──────┐
  loadSkillsV2() ─────────────────→│ skill match │ ◄── find by id, conceptKey,
                                    │             │     or name (case-insensitive)
                                    └──────┬──────┘
                                           │ effectiveStrength(skill)
                                    ┌──────▼──────┐
                                    │  readiness  │
                                    │  = avg of   │
                                    │  strengths  │
                                    └─────────────┘
```

**Step-by-step:**
1. `Assignments.getQuestions(a.id)` returns questions with `requiredSkills` array
2. Each skill mapping has `{ conceptKey, name, subSkillId }` — extract unique skill identifiers
3. Match each ID against loaded skills via 3-tier resolution:
   - Exact: `skill.id === sid || skill.conceptKey === sid`
   - Fuzzy: `skill.name.toLowerCase() === sid.toLowerCase()`
4. `effectiveStrength(skill)` → FSRS `currentRetrievability(mastery)` — a 0–1 float based on `stability` and `lastReviewAt` elapsed time
5. `avgStrength = sum(strengths) / count` — unweighted mean across all required skills

**Edge cases:**
- Skill not found: strength defaults to `0` (treated as unknown = weak)
- No questions: `avgStrength = 0`
- No skills mapped to questions: `avgStrength = 0`

### Exam Readiness (v1 — All Course Skills)

```
  loadSkillsV2(courseId) ─── all skills ──→ effectiveStrength each ──→ average
```

Current implementation uses **all course skills** as the exam skill set, regardless of `coversWeeks`/`coversTopics`. This is a v1 simplification.

**Why not scope-filtered (v2 roadmap):**
Exam scope resolution requires matching `coversTopics` strings against skill names/descriptions — a fuzzy matching problem. False negatives (missing relevant skills) are worse than false positives (including extra skills), so the conservative approach (include everything) is safer for v1.

**v2 scope resolution (future):**
```
exam.coversWeeks → schedule rows for those weeks → topics array per week
                → union all topics
                → fuzzy match against skill names/descriptions
                → filtered skill set for readiness
```

This requires either:
- String containment checks (`skill.name.includes(topic)`)
- Or a dedicated skill-to-topic mapping table
- Neither exists today; would be part of the parent skill / concept link feature

---

## 4. Exam Scope Resolution — Current Data Flow

### How exam data reaches the schedule

```
Syllabus text ──→ parseSyllabus() ──→ LLM extracts JSON ──→ parsed.exams[]
                                                              │
                  parsed.schedule[] ◄────── enrichment ◄──────┘
                  (per-week entries)        examDetail matched by name
                        │
                        ▼
              CourseSchedule.insert()
              exams column = JSON string
              [{ name, date, coversWeeks, coversTopics }]
```

**Enrichment step** (syllabusParser.js:222–237):
- Each week's `exams` array contains exam name strings (e.g., `"Midterm"`)
- The parser matches these against `parsed.exams[]` (top-level, detailed exam objects)
- If matched: stores `{ name, date, coversWeeks, coversTopics }` as enriched exam object
- If unmatched: stores `{ name }` (no scope data)

### How ScheduleScreen reads exams

```
CourseSchedule.getByCourse(courseId) ──→ rows with exams column (JSON string)
        │
        ▼ JSON.parse(week.exams || '[]')
        │
        ▼ For each exam object:
        │   dateEpoch = new Date(exam.date).getTime() / 1000
        │   coversWeeks = exam.coversWeeks || []
        │   coversTopics = exam.coversTopics || []
        │
        ▼ Pushed to items[] as type: "exam"
```

**Key fields per exam item:**
| Field | Source | Type |
|---|---|---|
| `title` | `exam.name \|\| exam.title \|\| "Exam"` | string |
| `dueDateEpoch` | `new Date(exam.date)` → epoch | number \| null |
| `coversWeeks` | `exam.coversWeeks` | number[] |
| `coversTopics` | `exam.coversTopics` | string[] |
| `weekNumber` | `week.week_number` (parent row) | number |
| `skillList` | All course skills | array |
| `avgStrength` | Mean of all `effectiveStrength()` | number |

**ID generation:** `"exam-" + weekNumber + "-" + examIndex` — synthetic, stable per week/position.

---

## 5. ScheduleScreen Data Contract

### Context consumed (via `useStudy()`)

| Variable | Type | Usage |
|---|---|---|
| `active` | Course object | `active.id` for DB queries, `active.name` for header |
| `setScreen` | function | Back button → `setScreen("home")` |
| `setShowSettings` | function | Settings button |
| `enterStudy` | function | Action buttons → navigate to study screen |
| `setActive` | function | Available but not used (active already set) |

### Local state

| State | Type | Initial | Usage |
|---|---|---|---|
| `items` | array \| null | `null` | Unified list of all assignments + exams. `null` = loading. |
| `skills` | array | `[]` | All course skills (for future use / re-expansion) |
| `expanded` | string \| null | `null` | Key of currently expanded card |
| `showAllExamSkills` | boolean | `false` | Whether to show all exam skills (vs top 10) |

### Unified item shape

```typescript
type ScheduleItem = {
  type: 'assignment' | 'exam' | 'placeholder',
  id: string,                    // DB id (assignments) or synthetic (exams)
  title: string,
  dueDateEpoch: number | null,   // raw epoch for sorting/urgency
  dueDate: string | null,        // formatted display string
  status?: string,               // 'active' | 'completed' (assignments only)
  source?: string,               // 'syllabus' | 'decomposition' (assignments only)
  questionCount?: number,        // assignments only
  skillList: SkillEntry[],       // matched skills with strengths
  avgStrength: number,           // 0–1 readiness score
  coversWeeks?: number[],        // exams only
  coversTopics?: string[],       // exams only
  weekNumber?: number,           // exams only — parent schedule row
}

type SkillEntry = { id: string, name: string, strength: number }
```

### Section grouping (render-time, not persisted)

Grouping is computed on every render from `items` + current `Date.now()`:
```
items ──→ split by type/epoch ──→ 5 buckets ──→ sort each ──→ filter empty ──→ sections[]
```

Sections array shape: `[{ label: string, color: string, items: ScheduleItem[] }]`

---

## 6. HomeScreen Info Bar Data Contract

### Context consumed

Same as before, plus `setActive` (new — needed for schedule navigation).

### Summary state

```javascript
summaries: { [courseId: string]: CourseSummary }

type CourseSummary = {
  overdueCount: number,
  dueThisWeek: number,
  nextExam: { name: string, daysUntil: number, epoch: number } | null,
}
```

### Signal generation (render-time)

```javascript
signals = []
if (summary.overdueCount > 0)  → { text: "N overdue",       color: T.rd }
if (summary.dueThisWeek > 0)   → { text: "N due this week",  color: T.am }
if (summary.nextExam)           → { text: "Exam in N days",   color: <7d ? T.am : T.ac }
```

Max 3 signals. Priority: overdue > due this week > exam. If zero signals, the info bar row is not rendered.

### Navigation from info bar

```javascript
onClick: e.stopPropagation() → setActive(c) → setScreen("schedule")
```

`setActive(c)` sets the course object directly from the `courses` array (which includes `materials`). No `enterStudy()` call — the schedule screen doesn't need chat initialization, profile loading, or session setup.

---

## 7. Dependency Graph

```
                                    ScheduleScreen.jsx
                                   ╱      │       ╲
                         db.js ◄──╱  skills.js    study.js
                        ╱    ╲         │              │
               Assignments  CourseSchedule  loadSkillsV2  effectiveStrength
              getByCourse()  getByCourse()       │              │
              getQuestions()                      ▼              ▼
                                           sub_skills     fsrs.js
                                             table    currentRetrievability()


                                     HomeScreen.jsx
                                   ╱            ╲
                         db.js ◄──╱         StudyContext
                        ╱    ╲              (useStudy)
               Assignments  CourseSchedule     │
              getByCourse()  getByCourse()    courses
                                             setActive
                                             setScreen
                                             enterStudy
```

No circular dependencies. No new imports added to StudyContext. Both screens import DB modules directly — consistent with the existing pattern (MaterialsScreen, ProfileScreen also query DB directly).

---

## 8. Performance Characteristics

| Operation | Queries | Est. Time | When |
|---|---|---|---|
| HomeScreen summary load | 2 × N courses | ~20ms per course | Mount + courses change |
| ScheduleScreen full load | 3 + N assignments | ~50–150ms total | Mount |
| Section grouping | 0 (in-memory) | <1ms | Every render |
| Card expand | 0 (data pre-loaded) | <1ms | User click |

**Why no caching layer:** SQLite on local disk is fast enough (<5ms per indexed query). Adding a caching layer (in context or otherwise) would increase complexity for negligible latency improvement. If course count grows >20, batch queries could be added.

---

## 9. Known Limitations & Future Work

| Limitation | Impact | Resolution Path |
|---|---|---|
| Exam readiness uses all skills, not scoped | Readiness % may be lower than actual (diluted by unrelated skills) | v2: topic-based skill filtering via `coversTopics` |
| `formatDueDate` + `getUrgencyLevel` duplicated in 3 files | Maintenance risk | Extract to `src/lib/dates.js` shared utility |
| Action buttons go to study mode picker, not directly to the assignment | Extra click for user | Thread assignment ID through state or use `bootWithFocus` |
| Info bar data not refreshed without remount | Stale after long HomeScreen session | Add refresh interval or invalidation callback |
| Exam deduplication not handled | Exam mentioned in multiple weeks appears multiple times | Deduplicate by `name + date` composite key |
