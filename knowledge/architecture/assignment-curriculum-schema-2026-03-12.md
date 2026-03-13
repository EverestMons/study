# Assignment Curriculum Schema — Architecture Doc

**Date:** 2026-03-12
**Migration:** 006_assignment_activation.sql
**Scope:** study_active column, curriculum data assembly methods, Q1-Q4 queries

---

## Migration 006: Assignment Activation

```sql
ALTER TABLE assignments ADD COLUMN study_active INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_assignments_study_active
    ON assignments(course_id, study_active) WHERE study_active = 1;
```

**Rationale:** Partial index on `study_active = 1` is optimal since only a small subset of assignments are active at any time. Column default `0` ensures backward compatibility with existing rows.

---

## DB Method Signatures (Assignments module)

### Mutation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `setStudyActive` | `(id: string, active: boolean) → void` | Toggle single assignment's study_active flag |
| `bulkSetStudyActive` | `(ids: string[], active: boolean) → void` | Batch toggle via withTransaction |
| `markSubmitted` | `(id: string) → void` | Atomic: status='submitted' + study_active=0 |

### Query Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getCurriculum` | `(courseId: string) → CurriculumAssignment[]` | Q1: Active assignments with nested questions → skills → mastery |
| `getChunksForSkill` | `(subSkillId: string) → ChunkBinding[]` | Q2: Teaching chunks via facet bindings (fallback: skill bindings) |
| `getCompletedSkills` | `(courseId: string) → CompletedSkill[]` | Q3: Distinct skills from submitted/graded assignments with mastery |
| `getReviewDueSkills` | `(courseId: string) → DueSkill[]` | Q4: Skills due for FSRS review from completed assignments |
| `getCurriculumSummary` | `(courseId: string) → CurriculumSummary` | Summary stats for active curriculum |

---

## Data Structures

### CurriculumAssignment
```js
{
  id, title, dueDate, status, source,
  questions: [{
    id, questionRef, description, difficulty,
    skills: [{
      subSkillId, name, conceptKey,
      mastery: { stability, lastReviewAt, difficulty, reps } | null
    }],
    facets: [{
      facetId, name, conceptKey, skillId, bloomsLevel,
      mastery: { stability, lastReviewAt, difficulty, reps } | null
    }]
  }]
}
```

### ChunkBinding
```js
{
  chunkId, label, materialName, bindingType,  // 'teaches' | 'prerequisite_for' | 'practices'
  confidence, qualityRank
}
```

### CompletedSkill
```js
{
  subSkillId, name, conceptKey, assignmentId, assignmentTitle,
  mastery: { stability, lastReviewAt, difficulty, reps, nextReviewAt } | null
}
```

### DueSkill
```js
{
  subSkillId, name, conceptKey, assignmentId, assignmentTitle,
  nextReviewAt, stability, lastReviewAt
}
```

### CurriculumSummary
```js
{
  activeCount,        // number of study_active assignments
  totalSkills,        // distinct skills across active assignments
  avgMastery,         // average mastery (stability > 0 only)
  dueReviewCount,     // skills from completed assignments due for review
  completedCount      // submitted/graded assignment count
}
```

---

## Queries

### Q1: getCurriculum (Active assignments → questions → skills → mastery)

```sql
-- Step 1: Active assignments
SELECT * FROM assignments WHERE course_id = ? AND study_active = 1
ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC;

-- Step 2: Questions per assignment (batched)
SELECT * FROM assignment_questions WHERE assignment_id IN (...)
ORDER BY ordering, id;

-- Step 3: Skills per question (batched)
SELECT aqs.question_id, aqs.sub_skill_id, ss.name, ss.concept_key
FROM assignment_question_skills aqs
JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
WHERE aqs.question_id IN (...);

-- Step 4: Skill mastery (batched)
SELECT * FROM sub_skill_mastery WHERE sub_skill_id IN (...);

-- Step 5: Facets per question (batched, optional)
SELECT aqf.question_id, aqf.facet_id, f.name, f.concept_key, f.skill_id, f.blooms_level
FROM assignment_question_facets aqf
JOIN facets f ON aqf.facet_id = f.id
WHERE aqf.question_id IN (...) AND f.is_archived = 0;

-- Step 6: Facet mastery (batched, optional)
SELECT * FROM facet_mastery WHERE facet_id IN (...);
```

### Q2: getChunksForSkill

```sql
-- Primary: via facet bindings (ranked)
SELECT cfb.*, c.label AS chunk_label, c.char_count,
       m.classification AS material_classification
FROM chunk_facet_bindings cfb
JOIN chunks c ON cfb.chunk_id = c.id
JOIN materials m ON c.material_id = m.id
WHERE cfb.facet_id IN (SELECT id FROM facets WHERE skill_id = ? AND is_archived = 0)
ORDER BY
  CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
  cfb.quality_rank, cfb.confidence DESC;

-- Fallback: direct skill bindings (if no facets)
SELECT csb.*, c.label AS chunk_label
FROM chunk_skill_bindings csb
JOIN chunks c ON csb.chunk_id = c.id
WHERE csb.sub_skill_id = ?;
```

### Q3: getCompletedSkills

```sql
SELECT DISTINCT ss.id AS sub_skill_id, ss.name, ss.concept_key,
       a.id AS assignment_id, a.title AS assignment_title,
       ssm.stability, ssm.last_review_at, ssm.difficulty, ssm.reps, ssm.next_review_at
FROM assignments a
JOIN assignment_questions aq ON aq.assignment_id = a.id
JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
LEFT JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
WHERE a.course_id = ? AND a.status IN ('submitted', 'graded')
  AND ss.is_archived = 0
ORDER BY ss.name;
```

### Q4: getReviewDueSkills

```sql
SELECT DISTINCT ss.id AS sub_skill_id, ss.name, ss.concept_key,
       a.id AS assignment_id, a.title AS assignment_title,
       ssm.next_review_at, ssm.stability, ssm.last_review_at
FROM assignments a
JOIN assignment_questions aq ON aq.assignment_id = a.id
JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
WHERE a.course_id = ? AND a.status IN ('submitted', 'graded')
  AND ssm.next_review_at IS NOT NULL AND ssm.next_review_at <= ?
  AND ss.is_archived = 0
ORDER BY ssm.next_review_at;
```

---

## Edge Cases

- **Empty data:** All query methods return empty arrays/zero counts gracefully
- **No mastery records:** Skills without mastery entries get `mastery: null`
- **Facet tables missing:** Try/catch wraps facet queries — degrades to skill-only
- **No active assignments:** `getCurriculum` returns `[]`, `getCurriculumSummary` returns zeroes
- **Concurrent toggles:** `withTransaction` serializes writes to prevent lock contention
- **markSubmitted atomicity:** Both updates in same `withTransaction` call

---

## Dependency Impact

- `db.js` (Assignments) — self-contained, no new imports needed
- `ScheduleScreen.jsx` — calls `setStudyActive` (renamed from `toggleStudyActive`)
- `CurriculumScreen.jsx` — calls `getCurriculum`, `getChunksForSkill`, `getCompletedSkills`, `getReviewDueSkills`, `getCurriculumSummary`, `markSubmitted`
