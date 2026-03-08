# Phase 5 — Deadline-Aware Intelligence — Architecture Blueprint
**Date:** 2026-03-08
**Analyst:** Study Systems Analyst
**Design:** `knowledge/design/deadline-intelligence-ux-2026-03-08.md`
**Implementation:** `src/components/study/ModePicker.jsx`, `src/lib/study.js`, `src/StudyContext.jsx`

---

## 1. `buildDeadlineContext()` Function Spec

### Purpose

Generates a text block that tells the LLM what the student needs to turn in soon and how ready they are. Injected into the system prompt context so the tutor can proactively reference upcoming deadlines.

### Signature

```javascript
// src/lib/study.js
export const buildDeadlineContext = async (courseId, skills) => { ... }
```

### Inputs

| Param | Type | Source |
|---|---|---|
| `courseId` | string | `active.id` |
| `skills` | array | Pre-loaded via `loadSkillsV2(courseId)` — passed in, not re-loaded |

**No assignments param.** The function loads its own assignment data via `Assignments.getByCourse(courseId)` + `Assignments.getQuestions(a.id)` and schedule data via `CourseSchedule.getByCourse(courseId)`. This keeps the call site simple — callers already have `courseId` and `skills` but may not have pre-loaded assignments.

### Output

A string block (or empty string if no deadlines exist). Example:

```
UPCOMING DEADLINES:

1. HW 5: Sorting Algorithms (due in 2 days, OVERDUE)
   Readiness: 31%
   Weakest skills:
     - merge-sort: Merge Sort [12%]
     - quicksort-partition: Quicksort Partitioning [28%]
     - big-o-analysis: Big-O Analysis [45%]

2. Midterm Exam (due in 8 days)
   Readiness: 52%
   Weakest skills:
     - binary-tree-traversal: Binary Tree Traversal [18%]
     - graph-bfs: Breadth-First Search [33%]
     - dynamic-programming-basics: DP Basics [41%]

3. HW 6: Graph Algorithms (due in 12 days)
   Readiness: 0%
   Weakest skills:
     - (no skills mapped yet)
```

### Computation Logic

```
1. Load raw assignments: Assignments.getByCourse(courseId)
2. Filter:
   - Exclude completed (status === "completed")
   - Exclude placeholders (source === "syllabus" && !materialId)
3. For each remaining assignment:
   a. Load questions: Assignments.getQuestions(a.id)
   b. Extract requiredSkills from questions (same 3-tier resolution as ScheduleScreen)
   c. Compute avgStrength via effectiveStrength()
   d. Collect weakest 3 skills (sorted ascending by strength)
4. Load exams from CourseSchedule.getByCourse(courseId)
   - Parse exams JSON from each schedule row
   - Compute exam readiness = avg of all course skills (v1, same as ScheduleScreen)
   - Weakest 3 skills from all course skills
5. Merge assignments + exams into single list
6. Sort by dueDateEpoch ascending (nulls last)
7. Take first 3 items (nearest 3 deadlines)
8. Format as text block
```

**Performance:** Same N+3 query pattern as ScheduleScreen. <150ms for typical course.

### Edge Cases

| Case | Behavior |
|---|---|
| No assignments or exams | Return `""` (empty string — no block injected) |
| All assignments completed | Return `""` |
| Assignment with no questions/skills | Show "Readiness: 0%" + "(no skills mapped yet)" |
| Exam with no date | Include but sort to end (null date = Infinity) |
| >3 upcoming items | Show only nearest 3 (token budget) |

---

## 2. Insertion Points in Context Builders

### `buildContext()` (study.js:245) — General chat context

**Insert after:** Section 2 (ASSIGNMENTS & SKILL REQUIREMENTS, line 282) and before Section 3 (STUDENT PROFILE, line 284).

```javascript
// study.js line 282 (after assignments section)

// 2b. Deadline context
var deadlineCtx = await buildDeadlineContext(courseId, skills);
if (deadlineCtx) ctx += "\n" + deadlineCtx + "\n";

// 3. Student profile  (existing line 284)
ctx += "\nSTUDENT PROFILE:\n";
```

**Rationale:** The deadline block sits between assignment structure (what exists) and student profile (how they're doing). It provides the bridge: "here's what's due and how ready they are." The tutor already has the full assignment list above; the deadline block adds temporal urgency and readiness summary that the raw assignment data doesn't have.

### `buildFocusedContext()` (study.js:368) — Focused session context

**Insert at the end** of each focus type's context, before the return. Only for focus types where deadline awareness is relevant:

**Assignment focus (line 424):** Add after source material loading.
```javascript
// After source material section
var deadlineCtx = await buildDeadlineContext(courseId, allSkills);
if (deadlineCtx) ctx += "\n" + deadlineCtx + "\n";
```

**Skill focus (line 482):** Add after source material loading.
```javascript
var deadlineCtx = await buildDeadlineContext(courseId, allSkills);
if (deadlineCtx) ctx += "\n" + deadlineCtx + "\n";
```

**Exam focus (line 503):** Add after exam scope section.
```javascript
var deadlineCtx = await buildDeadlineContext(courseId, allSkills);
if (deadlineCtx) ctx += "\n" + deadlineCtx + "\n";
```

**Recap focus (line 496):** Add after skill summary.
```javascript
var deadlineCtx = await buildDeadlineContext(courseId, allSkills);
if (deadlineCtx) ctx += "\n" + deadlineCtx + "\n";
```

**Explore focus:** Skip. Explore mode is free-form — injecting deadline data would bias the tutor toward assignment topics when the student chose to explore freely.

**Why all focus types except explore:** The system prompt's ASSIGNMENT-FIRST PRIORITY section instructs the tutor to "check the assignment list and deadlines" — but without `buildDeadlineContext`, the tutor only sees raw assignment data with no temporal urgency or readiness scores. The deadline block makes the system prompt's own instructions actionable.

---

## 3. FSRS Priority Boost

### Problem

The skill picker sorts weakest-first. A student sees their 15% skills at the top regardless of whether those skills are needed for anything due soon. A 40% skill needed for HW 5 (due tomorrow) should feel more urgent than a 15% skill not needed for any upcoming deadline.

### Decision: Sort-time promotion, NOT FSRS interval modification

**Critical principle:** FSRS intervals are not modified. The spaced repetition algorithm's scheduling (stability, difficulty, retrievability decay) remains untouched. The "boost" is purely a **display-time sort adjustment** in the skill picker.

### Implementation: Deadline relevance flag + sort comparator

**Step 1: Build deadline skill map**

When `selectMode("skills")` runs (StudyContext.jsx:641), after loading skills and before building picker data, compute a map of skills that are relevant to upcoming deadlines:

```javascript
// Inside selectMode("skills"), after loading skills
var deadlineSkillMap = {};  // { skillId: { title, daysUntil } }

var asgn = await Assignments.getByCourse(active.id);
var now = Math.floor(Date.now() / 1000);
for (var a of asgn) {
  if (a.status === "completed") continue;
  if (a.source === "syllabus" && !a.materialId) continue;
  if (!a.dueDate || a.dueDate < now) continue;  // skip overdue + no-date for badge
  var daysUntil = Math.floor((a.dueDate - now) / 86400);
  if (daysUntil > 14) continue;  // only flag skills for items due within 2 weeks

  var questions = await Assignments.getQuestions(a.id);
  for (var q of questions) {
    for (var rs of (q.requiredSkills || [])) {
      var sid = rs.conceptKey || rs.name || String(rs.subSkillId);
      // Keep the soonest deadline per skill
      if (!deadlineSkillMap[sid] || daysUntil < deadlineSkillMap[sid].daysUntil) {
        deadlineSkillMap[sid] = { title: a.title, daysUntil: daysUntil };
      }
    }
  }
}
```

**Step 2: Attach deadline info to enriched skill items**

```javascript
const enriched = skills.map(s => {
  // ... existing enrichment (strength, lastPracticed, reviewDate, etc.)
  var dl = deadlineSkillMap[s.id] || deadlineSkillMap[s.conceptKey] || null;
  if (!dl && s.name) {
    // Case-insensitive name fallback (same 3-tier resolution)
    for (var [sid, info] of Object.entries(deadlineSkillMap)) {
      if (s.name.toLowerCase() === sid.toLowerCase()) { dl = info; break; }
    }
  }
  return {
    ...existingFields,
    deadlineTitle: dl?.title || null,
    deadlineDays: dl?.daysUntil ?? null,
  };
});
```

**Step 3: Modified sort comparator**

```javascript
enriched.sort((a, b) => {
  // Primary: strength ascending (weakest first) — existing behavior
  var strengthDiff = a.strength - b.strength;

  // Within same strength band (±10%), promote deadline-relevant skills
  if (Math.abs(strengthDiff) < 0.10) {
    var aHas = a.deadlineDays !== null;
    var bHas = b.deadlineDays !== null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas) return a.deadlineDays - b.deadlineDays;  // sooner deadline first
  }

  return strengthDiff;
});
```

**Why ±10% band:** A 15% skill and a 22% skill are in the same "weak" territory — promoting the one with a deadline is reasonable. But a 15% skill should NOT be deprioritized below a 55% skill just because the 55% has a deadline. The band prevents deadline relevance from overriding large strength differences.

### What the skill picker renders

ModePicker.jsx skill card (lines 396-461) — append deadline badge to the existing metadata line:

```
  Sorting Algorithms                     22%
  Not yet practiced | Needed for HW 5 (2d)
```

The badge is rendered from `s.deadlineTitle` and `s.deadlineDays` attached by the enrichment step above. Color: `T.am` if `deadlineDays < 7`, `T.ac` otherwise.

---

## 4. Exam Scope Auto-Selection

### Problem

When `selectMode("exam")` runs, it shows all materials with a checkbox picker. The student must manually select which materials to review. But if the course has exam data from the syllabus (`coversWeeks`), we can pre-select relevant materials.

### Data Flow

```
CourseSchedule.getByCourse(courseId)
    │
    ▼ Find nearest future exam with coversWeeks
    │
    ▼ exam.coversWeeks = [1, 2, 3, 4, 5, 6]
    │
    ▼ For each covered week:
    │   schedule row → readings JSON column → ["Chapter 1", "Chapter 2"]
    │
    ▼ Union all readings across covered weeks
    │   → readingSet = {"Chapter 1", "Chapter 2", "Chapter 3", ...}
    │
    ▼ Match readings against material names (fuzzy)
    │   → material.name.toLowerCase().includes(reading.toLowerCase())
    │   → or reading.toLowerCase().includes(material.name.toLowerCase())
    │
    ▼ Pre-select matched materials in pickerData.selectedMats
```

### Implementation (in `selectMode("exam")`, StudyContext.jsx:659)

```javascript
} else if (mode === "exam") {
  var mats = (active.materials || []).filter(m =>
    (m.chunks || []).some(c => c.status === "extracted")
  );
  if (!mats.length) {
    setPickerData({ mode, empty: true, message: "..." });
    return;
  }

  // Auto-select materials based on nearest exam scope
  var preSelected = new Set();
  try {
    var schedule = await CourseSchedule.getByCourse(active.id);
    var now = Math.floor(Date.now() / 1000);

    // Find nearest future exam with coversWeeks
    var nearestExam = null;
    for (var week of schedule) {
      var exams = JSON.parse(week.exams || "[]");
      for (var exam of exams) {
        if (!exam.date || !exam.coversWeeks?.length) continue;
        var epoch = Math.floor(new Date(exam.date).getTime() / 1000);
        if (isNaN(epoch) || epoch <= now) continue;
        if (!nearestExam || epoch < nearestExam.epoch) {
          nearestExam = { ...exam, epoch };
        }
      }
    }

    if (nearestExam && nearestExam.coversWeeks.length > 0) {
      // Collect readings from covered weeks
      var readingSet = new Set();
      for (var week of schedule) {
        var wn = week.week_number || week.weekNumber;
        if (nearestExam.coversWeeks.includes(wn)) {
          var readings = JSON.parse(week.readings || "[]");
          readings.forEach(r => readingSet.add(r.toLowerCase()));
        }
      }

      // Match readings against material names
      if (readingSet.size > 0) {
        for (var mat of mats) {
          var nameLower = mat.name.toLowerCase();
          for (var reading of readingSet) {
            if (nameLower.includes(reading) || reading.includes(nameLower)) {
              preSelected.add(mat.id);
              break;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Exam scope auto-selection failed:", e);
    // Non-fatal — fall back to empty selection
  }

  setPickerData({ mode, materials: mats, selectedMats: preSelected });
}
```

### Matching Strategy

**Fuzzy containment check** — `nameLower.includes(reading) || reading.includes(nameLower)`. This handles:
- Material: "Chapter 1 - Introduction to Algorithms", Reading: "Chapter 1" → match
- Material: "Sorting", Reading: "Sorting Algorithms Textbook" → match

**Why not exact match:** Syllabus reading names rarely match material filenames exactly. Students upload "Chapter1.pdf" or "sorting-notes.docx" while the syllabus says "Chapter 1" or "Sorting".

**False positive risk:** Low. A material named "Chapter" could match "Chapter 1" through "Chapter 20". But in practice, students don't upload materials with single-word generic names. If false positives occur, the student simply unchecks — the selection is pre-populated, not forced.

**Fallback:** If no exam has `coversWeeks`, or no readings match any materials, `preSelected` is empty — same behavior as today.

---

## 5. ModePicker Nudge Data Computation

### Computation: `computeNudge()`

Runs inside a `useEffect` in ModePicker, fires when the main mode picker is visible (no sessionMode, no booting, no chunkPicker, no practiceMode).

```javascript
// Inside ModePicker component
var [nudgeItem, setNudgeItem] = useState(null);
var [suggestedMode, setSuggestedMode] = useState(null);
var [nudgeDismissed, setNudgeDismissed] = useState(false);

useEffect(() => {
  if (sessionMode || booting || chunkPicker || practiceMode) return;
  if (!active) return;
  var cancelled = false;

  (async () => {
    var now = Math.floor(Date.now() / 1000);
    var candidates = [];

    // 1. Assignments
    var asgn = await Assignments.getByCourse(active.id);
    var sk = await loadSkillsV2(active.id);

    for (var a of asgn) {
      if (a.status === "completed") continue;
      if (a.source === "syllabus" && !a.materialId) continue;

      var questions = await Assignments.getQuestions(a.id);
      var reqIds = new Set();
      questions.forEach(q =>
        (q.requiredSkills || []).forEach(s =>
          reqIds.add(s.conceptKey || s.name || String(s.subSkillId))
        )
      );
      var skillList = [...reqIds].map(sid => {
        var s = (sk || []).find(x => x.id === sid || x.conceptKey === sid);
        if (!s) s = (sk || []).find(x => x.name?.toLowerCase() === sid.toLowerCase());
        return { id: s?.id || sid, name: s?.name || sid, strength: s ? effectiveStrength(s) : 0 };
      });
      var avg = skillList.length > 0
        ? skillList.reduce((sum, x) => sum + x.strength, 0) / skillList.length
        : 0;

      var isOverdue = a.dueDate && a.dueDate < now;
      var daysUntil = a.dueDate ? Math.floor((a.dueDate - now) / 86400) : null;

      // Nudge threshold: overdue OR (due <3 days AND readiness <60%)
      if (isOverdue || (daysUntil !== null && daysUntil <= 3 && avg < 0.6)) {
        candidates.push({
          type: "assignment",
          title: a.title,
          dueDateEpoch: a.dueDate,
          readiness: avg,
          isOverdue: isOverdue,
          daysUntil: daysUntil,
          assignment: a,  // for bootWithFocus
          sortKey: isOverdue ? a.dueDate : a.dueDate,  // overdue: most recent; upcoming: soonest
        });
      }
    }

    // 2. Exams
    var schedule = await CourseSchedule.getByCourse(active.id);
    var allSkillAvg = (sk || []).length > 0
      ? sk.reduce((s, x) => s + effectiveStrength(x), 0) / sk.length
      : 0;

    for (var week of schedule) {
      try {
        var exams = JSON.parse(week.exams || "[]");
        for (var exam of exams) {
          if (!exam.date) continue;
          var epoch = Math.floor(new Date(exam.date).getTime() / 1000);
          if (isNaN(epoch)) continue;
          var examOverdue = epoch < now;
          var examDays = Math.floor((epoch - now) / 86400);

          // Nudge threshold: overdue OR (due <7 days AND readiness <60%)
          if (examOverdue || (examDays <= 7 && allSkillAvg < 0.6)) {
            candidates.push({
              type: "exam",
              title: exam.name || exam.title || "Exam",
              dueDateEpoch: epoch,
              readiness: allSkillAvg,
              isOverdue: examOverdue,
              daysUntil: examDays,
              sortKey: epoch,
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    if (cancelled) return;

    if (candidates.length === 0) {
      setNudgeItem(null);
      setSuggestedMode(null);
      return;
    }

    // Priority: overdue first (most recently overdue), then soonest upcoming
    candidates.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isOverdue && b.isOverdue) return b.sortKey - a.sortKey;  // most recently overdue
      return a.sortKey - b.sortKey;  // soonest upcoming
    });

    var top = candidates[0];
    setNudgeItem(top);
    setSuggestedMode(top.type === "exam" ? "exam" : "assignment");
  })();

  return () => { cancelled = true; };
}, [active?.id]);
```

### Spaced Repetition Suggestion

If no deadline nudge fires, check for skills with `reviewDate <= today`:

```javascript
// After deadline candidate check, if candidates.length === 0:
if (candidates.length === 0 && Array.isArray(sk)) {
  var today = new Date().toISOString().split("T")[0];
  var dueForReview = sk.filter(s => {
    var rd = nextReviewDate(s);
    return rd && rd <= today;
  });
  if (dueForReview.length > 0) {
    setSuggestedMode("skills");
    // No nudge banner for spaced repetition — just mode highlight
  }
}
```

### Auto-Suggestion Mode Highlight

The `suggestedMode` state drives which mode button gets the accent treatment. In the render:

```javascript
// For each mode button:
var issuggested = suggestedMode === "assignment";  // (or "exam", "skills", etc.)
var btnBg = issuggested ? T.acS : T.sf;
var btnBorder = issuggested ? T.acB : T.bd;
```

When `suggestedMode` is null, the assignment button retains its existing default accent styling (no change from current behavior).

---

## 6. Dependency Graph

```
                          ModePicker.jsx
                         ╱      │       ╲
               db.js ◄──╱  skills.js   study.js
              ╱    ╲         │              │
     Assignments  CourseSchedule  loadSkillsV2  effectiveStrength
    getByCourse()  getByCourse()       │         nextReviewDate
    getQuestions()                      ▼
                                  sub_skills
                                    table


                          study.js
                             │
                   buildDeadlineContext()
                        │         │
               Assignments    CourseSchedule
              getByCourse()   getByCourse()
              getQuestions()

                             │
                    buildContext()
                    buildFocusedContext()
                             │
                    buildSystemPrompt()
```

No new tables. No new DB methods. No new imports in StudyContext. ModePicker gains: `Assignments`, `CourseSchedule` (already imported), `loadSkillsV2`, `effectiveStrength`, `nextReviewDate` (new imports from skills.js and study.js).

---

## 7. File Change Summary

| File | Change | Est. Lines |
|---|---|---|
| `src/lib/study.js` | Add `buildDeadlineContext()` export | +50 |
| `src/lib/study.js` | Insert `buildDeadlineContext()` call in `buildContext()` | +3 |
| `src/lib/study.js` | Insert `buildDeadlineContext()` call in `buildFocusedContext()` (4 focus types) | +12 |
| `src/components/study/ModePicker.jsx` | Add nudge computation `useEffect` | +80 |
| `src/components/study/ModePicker.jsx` | Render nudge banner | +25 |
| `src/components/study/ModePicker.jsx` | Dynamic mode button accent styling | +10 |
| `src/components/study/ModePicker.jsx` | Skill picker deadline badges (render) | +8 |
| `src/StudyContext.jsx` | Skill picker deadline map in `selectMode("skills")` | +25 |
| `src/StudyContext.jsx` | Exam scope auto-selection in `selectMode("exam")` | +35 |
| **Total** | | **~248** |

---

## 8. Performance Characteristics

| Operation | Queries | Est. Time | When |
|---|---|---|---|
| ModePicker nudge load | 2 + N assignments | ~50–150ms | Mode picker mount |
| `buildDeadlineContext()` | 2 + N assignments | ~50–150ms | Session boot (once) |
| Skill picker deadline map | 1 + N assignments | ~30–100ms | `selectMode("skills")` |
| Exam scope auto-select | 1 (schedule only) | ~5ms | `selectMode("exam")` |

**No duplicate loading.** ModePicker nudge runs on mount. `selectMode` runs when user clicks a mode button (later). `buildDeadlineContext` runs during session boot (later still). Each runs independently at different lifecycle points.

---

## 9. Known Limitations

| Limitation | Impact | Resolution Path |
|---|---|---|
| Exam readiness uses all skills (v1) | Readiness may be diluted | v2: topic-filtered skill set via `coversTopics` |
| Exam scope matching is string containment | May match wrong materials if names are generic | v2: material-to-week explicit mapping table |
| `buildDeadlineContext` re-queries assignments | Data already loaded by nudge computation | Acceptable — different lifecycle points; caching would add complexity for <100ms savings |
| Nudge only shows 1 item | Student may have 3 overdue items | Schedule screen link shows full picture |
| Skill picker deadline map loads all assignments | Could be slow with >50 assignments | Unlikely — typical courses have 5-15 assignments |
