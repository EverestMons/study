# Parent-Level AI Context — Architecture Blueprint

**Date:** 2026-03-10
**Status:** Blueprint
**Phase:** 3 of Character Sheet Profile

---

## 1. Problem

The AI tutor currently sees per-sub-skill FSRS retrievability in the STUDENT PROFILE section of the prompt. It has no awareness of the student's **parent-level proficiency** — their overall Calculus level, Statistics level, etc. This means:

- A Physics student with Level 7 Calculus gets the same derivative explanations as a Level 1 student
- The AI can't reference cross-domain strength: "Given your Calculus background, this should look familiar"
- No sense of overall academic profile breadth or depth

## 2. Solution

Add a `DOMAIN PROFICIENCY` block to the AI context, showing the student's top parent skill levels aggregated from the same mastery data that drives the character sheet. This gives the AI calibration for instruction level, cross-domain referencing, and prerequisite assumptions.

### Output format (in prompt)

```
DOMAIN PROFICIENCY (student's skill levels across all courses):
  Calculus: Level 7 (73% ready, 12 sub-skills)
  Linear Algebra: Level 6 (85% ready, 9 sub-skills)
  Mechanics: Level 5 (62% ready, 18 sub-skills)
  Probability: Level 3 (41% ready, 7 sub-skills)
```

- Top 8 parents by level (configurable, 8 covers all typical cases)
- ~80-120 tokens total — negligible prompt cost
- Always included when parent skills exist for the student

---

## 3. New Helper: `buildDomainProficiency(courseId)`

**Location:** `src/lib/study.js` (alongside existing context helpers)

**Signature:**
```js
const buildDomainProficiency = async (courseId) => { ... }
```

Not exported — only used internally by `buildContext` and `buildFocusedContext`.

### Algorithm

```
1. courseSubs = SubSkills.getByCourse(courseId)
   → gets all sub-skills for the active course

2. parentIds = deduplicated set of courseSubs[].parent_skill_id
   → identifies which parent skills are relevant to this course

3. For each parentId:
   a. parent = ParentSkills.getById(parentId)
   b. allSubs = SubSkills.getByParent(parentId)
      → ALL sub-skills under this parent, across ALL courses
   c. masteryRows = Mastery.getBySkills(allSubs.map(s => s.id))
   d. Compute:
      - totalPoints = sum of mastery.total_mastery_points
      - level = Math.floor(Math.sqrt(totalPoints))
      - readiness = weighted average of currentRetrievability()

4. Sort results by level descending, take top 8

5. Format as string block
```

### Why query all sub-skills across courses (step 3b)?

The parent skill level is an aggregate across all courses, matching the character sheet. If a student studies "Calculus" in both MATH 201 and PHYS 301, their Calculus level reflects mastery points from both courses. This is the correct behavior — the AI should know the student's **total** proficiency, not just within the current course.

### Performance

| Query | Count | Cost |
|-------|-------|------|
| `SubSkills.getByCourse` | 1 | ~1ms |
| `ParentSkills.getById` | N (typically 2-8) | ~0.5ms each |
| `SubSkills.getByParent` | N (typically 2-8) | ~1ms each |
| `Mastery.getBySkills` | N (typically 2-8) | ~1ms each |
| **Total** | | ~10-30ms for 5 parents |

This runs once per `buildContext` call (once per message send). The existing `buildContext` already does 5-15 DB queries for materials + chunks + sessions. Adding ~10ms is negligible.

### Early return

```js
if (parentIds.length === 0) return "";
```

New students with no parent skills (no extraction done yet) get an empty string — the block is omitted from the prompt entirely.

---

## 4. Integration Points

The domain proficiency block should appear in every context path — it's always relevant and always cheap.

### 4a. `buildContext()` (general context, line 494)

Insert after the STUDENT PROFILE section (line 494), before the source material loading (line 496):

```js
// After line 494: ctx += "New student -- no skill history yet.\n"; }
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

### 4b. `buildFocusedContext()` — assignment branch (line 623)

Insert after cross-skill connections (line 623), before the closing brace:

```js
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

### 4c. `buildFocusedContext()` — skill branch (line 686)

Insert after cross-skill connections (line 686):

```js
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

### 4d. `buildFocusedContext()` — recap branch (line 706)

Insert after cross-skill connections (line 706):

```js
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

### 4e. `buildFocusedContext()` — exam branch

Insert after exam deadline context, before closing brace:

```js
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

### 4f. `buildFocusedContext()` — explore branch

Insert similarly after the explore context building:

```js
var domainCtx = await buildDomainProficiency(courseId);
if (domainCtx) ctx += "\n" + domainCtx;
```

**Pattern:** Every branch calls `buildDomainProficiency(courseId)` once and appends if non-empty. The variable name `domainCtx` is used consistently.

---

## 5. Import Changes

**File:** `src/lib/study.js` line 1

**Current:**
```js
import { Mastery, SubSkills, Sessions, Assignments, CourseSchedule, ConceptLinks, Courses } from './db.js';
```

**New:**
```js
import { Mastery, SubSkills, Sessions, Assignments, CourseSchedule, ConceptLinks, Courses, ParentSkills } from './db.js';
```

One addition: `ParentSkills`.

---

## 6. System Prompt Implications

The `buildSystemPrompt` function already includes this instruction block (from the READING THE STUDENT section):

```
- New, low points: Start with something they can answer. Build confidence with a small win.
- Moderate points: Push harder. Expect them to explain things back.
- High points: Move fast. Test edge cases. Ask "why" more than "what."
```

This naturally applies to the domain proficiency data. When the AI sees "Calculus: Level 7 (73% ready)", it calibrates to "high points" behavior for calculus-adjacent topics.

**No changes to `buildSystemPrompt` are needed.** The AI model naturally uses the DOMAIN PROFICIENCY data to:
1. Calibrate instruction level (Level 7 = assume foundational knowledge)
2. Make cross-references ("Your Calculus skills should help here")
3. Identify gaps (Level 1 in Statistics while doing probability problems)

The existing system prompt already instructs the AI to "read the student" based on skill data. Adding domain proficiency enriches the data the AI reads.

---

## 7. Data Freshness

Domain proficiency is computed fresh on every `buildContext` call (every message). This means:
- If the student just leveled up (via practice), the next message reflects the new level
- No stale cache issues
- `profileData` in StudyContext (used by the character sheet) may lag behind, but the AI always sees the latest

---

## 8. Edge Cases

| Case | Behavior |
|------|----------|
| New student, no skills | `parentIds.length === 0` → returns empty string, block omitted |
| Single course, single parent | Shows 1 line: "Calculus: Level 3 (65% ready, 8 sub-skills)" |
| Many parents (10+) | Sorted by level, top 8 shown. Others omitted to save tokens |
| Parent with 0 mastery points | Level 0 — still shown (informs AI that student has extracted but not practiced) |
| Parent with sub-skills from multiple courses | Level reflects total mastery points across all courses (correct) |
| `currentRetrievability` for expired mastery | Returns low value (memory has decayed), shown as low readiness |

---

## 9. Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/study.js` | Add `ParentSkills` to import, add `buildDomainProficiency()` helper (~25 lines), insert 6 call sites (2 lines each) | ~37 new |

No other files modified. No database changes. No new dependencies.

---

## 10. Verification

1. `npm run build` — clean, no missing imports
2. Grep for `buildDomainProficiency` — appears in study.js 7 times (1 definition + 6 calls)
3. Grep for `DOMAIN PROFICIENCY` — appears in study.js 1 time (in the helper)
4. Grep for `ParentSkills` in study.js — appears in import + helper
5. Static trace: `sendMessage` → `buildContext`/`buildFocusedContext` → `buildDomainProficiency` → DB queries → formatted string → appended to context → passed to `buildSystemPrompt` → sent to Claude
