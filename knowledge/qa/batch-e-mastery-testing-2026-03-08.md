# Batch E — Mastery & Practice Testing (Heavy)
**Date:** 2026-03-08
**Role:** Study Security & Testing Analyst
**Scope:** Steps E.1–E.2 (profile removal, practice sets migration)
**Method:** Static trace analysis — code path tracing through all modified call sites
**FSRS Policy:** Calculation errors are automatically Critical.

---

## Verdict: PASS — 0 Critical, 0 Medium, 1 Low, 2 Informational

---

## Test Scenarios

### T1 — FSRS Integrity: Skill updates produce correct sub_skill_mastery values

**Trace (applySkillUpdates, study.js lines 158-291):**

The FSRS computation pipeline is **unchanged**:
1. Line 173: `Mastery.getBySkill(u.skillId)` — loads existing mastery (same as before)
2. Line 175-185: Card construction from existing row (same as before)
3. Line 168: `mapRating(u.rating)` → FSRS grade (same as before)
4. Line 188-189: Context/source weight multipliers (same constants, same logic)
5. Line 193-199: Bloom's level lookup from SubSkills (same)
6. Line 203-217: Return-visit decay bonus (same)
7. Line 220: `reviewCard(card, grade, now)` — **FSRS-4.5 core transition** (same — pure function from fsrs.js, no changes)
8. Line 224-228: Stability modulation by evidence quality (same)
9. Line 231-233: Weighted points calculation (same formula)
10. Line 236-246: `Mastery.upsert(u.skillId, {...})` — **only change: `lastRating: u.rating` added**

**Field-by-field comparison of Mastery.upsert inputs:**

| Field | Before (pre-E.1) | After (post-E.1) | Identical? |
|-------|-------------------|-------------------|:--:|
| `difficulty` | `updated.difficulty` | `updated.difficulty` | Yes |
| `stability` | `updated.stability` (modulated) | `updated.stability` (modulated) | Yes |
| `retrievability` | `result.retrievability` | `result.retrievability` | Yes |
| `reps` | `updated.reps` | `updated.reps` | Yes |
| `lapses` | `updated.lapses` | `updated.lapses` | Yes |
| `lastReviewAt` | `Math.floor(new Date(...).getTime() / 1000)` | Same | Yes |
| `nextReviewAt` | `Math.floor(new Date(...).getTime() / 1000)` | Same | Yes |
| `totalMasteryPoints` | `totalPts` | `totalPts` | Yes |
| `lastRating` | N/A | `u.rating` | **New field** |

**Mastery.upsert SQL (db.js line 1296-1313):**
- INSERT: 11 params `(subSkillId, difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating, now())`
- ON CONFLICT DO UPDATE: all 9 fields + `last_rating` + `updated_at`
- Parameter order matches destructuring: `{ difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating = null }`
- `lastRating` default `= null` means existing callers that don't pass it won't break

**Verification of FSRS inputs → outputs:**
- `reviewCard` (fsrs.js) is a pure function — no state, no DB, no side effects. It was NOT modified in E.1/E.2.
- `mapRating` (fsrs.js) is a pure lookup table — NOT modified.
- `currentRetrievability` (fsrs.js) — NOT modified.
- `initCard` (fsrs.js) — NOT modified.

**Removed code (lines 291-303 pre-E.1) was profile-only:**
```js
// REMOVED: profile.skills[u.skillId] = { points, entries: [...] }
// REMOVED: profile.sessions = (profile.sessions || 0) + 1
// REMOVED: await DB.saveProfile(courseId, profile)
// REMOVED: return profile
```
None of this code affected the Mastery.upsert call or FSRS state. The profile blob was a **parallel write** to the settings table, completely independent of the mastery table write at line 236-246.

**Result:** PASS — FSRS calculations are **mathematically identical**. The only addition is `lastRating: u.rating` as a new column, which has zero effect on FSRS state transitions.

---

### T2 — AI Prompt Context: System prompt content equivalence

**buildContext (study.js lines 316-439):**

| Section | Before (v1 profile) | After (v2 mastery) | Equivalent? |
|---------|---------------------|---------------------|:--:|
| SKILL TREE `lastRating` | `profile.skills[s.id].entries[-1].rating` | `s.mastery?.lastRating \|\| ""` | Yes — same value source, now from mastery table |
| STUDENT PROFILE session count | `profile.sessions` (accumulated counter) | `Sessions.countByCourse(courseId)` (COUNT query) | See F1 |
| Skill strength last rating | `pd.entries[last].rating` | `s.mastery?.lastRating` | Yes |
| Skill strength last date | `pd.entries[last].date` (ISO date string) | `new Date(s.mastery.lastReviewAt * 1000).toISOString().split("T")[0]` | Yes — epoch→ISO→date |
| Skill has review history | `pd?.entries?.length > 0` | `s.mastery?.lastRating` truthy check | Yes — if lastRating exists, skill was reviewed |

**buildFocusedContext (study.js lines 442-660+):**

| Mode | Before | After | Equivalent? |
|------|--------|-------|:--:|
| assignment (line 468) | `profile.skills[sid].entries[-1].rating` | `skill?.mastery?.lastRating \|\| "untested"` | Yes |
| skill (line 508) | `profile.skills[skill.id].entries[-1].rating` | `skill?.mastery?.lastRating \|\| "untested"` | Yes |
| recap (line 566) | `profile.sessions` | `Sessions.countByCourse(courseId)` | See F1 |
| exam (line 614) | `profile.skills[s.id].entries[-1].rating` | `s.mastery?.lastRating \|\| "untested"` | Yes |
| explore | No profile reads | No profile reads | N/A |

**Prompt content diff analysis:**

Before: `"Total study sessions: 5"` (from `profile.sessions`)
After: `"Total study sessions: 12"` (from `SELECT COUNT(*) FROM sessions`)

The count values will differ because:
- v1 `profile.sessions` was incremented once per `applySkillUpdates` call (only when skills were updated)
- v2 `Sessions.countByCourse` counts ALL sessions including empty ones, sessions without skill updates, etc.

This is **expected and acceptable** — the session count is informational context for the AI, not a precision metric. The v2 count is actually more accurate.

Before: `"(last: good on 2026-03-08)"`
After: `"(last: good on 2026-03-08)"`
Identical format when `lastRating` and `lastReviewAt` are both present.

**No stale profile references in prompt:**
- Confirmed: zero occurrences of `profile.skills` or `profile.sessions` in study.js
- Confirmed: `buildContext` signature no longer has `profile` parameter
- Confirmed: `buildFocusedContext` signature no longer has `profile` parameter
- Confirmed: all 4 `DB.getProfile` calls removed from StudyContext.jsx

**Result:** PASS — prompt contains equivalent mastery information with minor session-count semantic change (more accurate).

---

### T3 — Practice Mode Full Flow: ModePicker → answer → tier → persistence

**Flow A: Start from ModePicker skill picker (line 621-641):**

1. `PracticeSets.get(s.id)` → `SELECT * FROM practice_sets WHERE sub_skill_id = ? AND session_id IS NULL`
   - Returns `{ ...row, data: jsonParse(row.data) }` or `null`
2. `existingRow?.data || createPracticeSet(...)` — extracts `.data` from row, falls back to fresh set
3. Generate problems if needed → `generateProblems(pset, ...)`
4. `PracticeSets.upsert(s.id, pset)` → INSERT or UPDATE in `practice_sets` table
5. Set `setPracticeMode(...)` with practice state

**Old behavior:** `DB.getPractice(active.id, s.id)` → `SELECT value FROM settings WHERE key = 'v1_practice:{cid}:{skillId}'` → parsed JSON directly
**New behavior:** `PracticeSets.get(s.id)` → `SELECT * FROM practice_sets WHERE sub_skill_id = ? AND session_id IS NULL` → `row.data` (parsed)

**Shape equivalence check:**
- Old: `DB.getPractice` returns the practice set object directly (or null)
- New: `PracticeSets.get` returns `{ sub_skill_id, session_id, data, updated_at }` where `.data` is the parsed practice set
- Callers correctly access `.data`: `existingRow?.data || null` (line 469), `existingRow?.data || createPracticeSet(...)` (line 623)

**Flow B: Start from ModePicker assignment picker (line 464-490):**
Same pattern — `PracticeSets.get(fullSkill.id)` → `.data` → `PracticeSets.upsert(fullSkill.id, pset)`

**Flow C: Continue in PracticeMode — submit answer (line 270-329):**
1. `evaluateAnswer(...)` → result
2. Update problem in set locally
3. `PracticeSets.upsert(pm.skill.id, updatedSet)` — persists answer
4. If all done: `completeTierAttempt(updatedSet)` → `PracticeSets.upsert(pm.skill.id, updatedSet)` — persists tier result
5. `applySkillUpdates(...)` — updates FSRS mastery (now with `lastRating`)

**Flow D: Tier advance/retry (line 87-113):**
1. Generate new problems → `PracticeSets.upsert(pm.skill.id, updated)` — persists new tier problems

**Persistence across restart:**
- Old: stored in `settings` table as `v1_practice:{cid}:{skillId}`
- New: stored in `practice_sets` table with `sub_skill_id` FK
- Both persist to SQLite → survive app restart
- **Key difference:** old key was `{courseId}:{skillId}`, new key is just `{skillId}` (with `session_id IS NULL`)
- This means practice sets are now **course-independent** for the same skill. Since skills are already course-scoped via `sub_skills.course_id`, this is correct — a skill ID is unique globally.

**Result:** PASS

---

### T4 — Profile Screen: Domain grouping, levels, readiness, concept keys

**ProfileScreen.jsx trace:**

The ProfileScreen does NOT read from `DB.getProfile`. It reads from `profileData` state, which is populated by `loadFullProfile` (StudyContext.jsx line ~543). Let me verify `loadFullProfile` doesn't use DB.getProfile.

`profileData` is set by `loadFullProfile` which queries:
- `ParentSkills.getAll()` + `SubSkills.getByParent()` + `Mastery.getBySkill()` — all v2 module calls
- Constructs `{ parent, subSkills, level, readiness, ... }` objects

**No profile blob dependency.** The ProfileScreen was never coupled to `DB.getProfile` for its display data.

The only `DB.` calls that *were* in ProfileScreen were `DB.savePractice` (for the "Practice This Skill" and "Review Due Skills" buttons). Both replaced with `PracticeSets.upsert`.

**Fields checked:**
- Domain grouping: uses `parent.cip_domain` → `CIP_DOMAINS[domKey]` — unchanged
- Levels: uses `level` from `loadFullProfile` calculation — unchanged
- Readiness: uses `readiness` from retrievability calculation — unchanged
- Concept keys: uses `sub.conceptKey` from SubSkills — unchanged
- Mastery display: uses `sub.mastery.retrievability`, `.stability`, `.difficulty`, `.reps`, `.lapses`, `.totalMasteryPoints` — all from v2 mastery table, unchanged

**Result:** PASS

---

### T5 — Skill Updates from Chat: AI rates skills → mastery updates

**Trace (StudyContext.jsx sendMessage, line 917-935):**

1. Line 917: `parseSkillUpdates(response)` → extracts `[SKILL_UPDATE]` blocks → `[{skillId, rating, reason, context, source, criteria}]` — unchanged
2. Line 921: `applySkillUpdates(active.id, updates, intentWeight)` — calls the modified function
3. Inside `applySkillUpdates`:
   - FSRS pipeline runs identically (T1 verified)
   - `Mastery.upsert` now includes `lastRating: u.rating`
   - **No profile blob written** — the dual-write is removed
   - **No return value** — function returns `undefined` instead of `profile`
4. Line 921: `await applySkillUpdates(...)` — return value not captured (callers never used it)

**Verification that callers don't use the return value:**
- Line 921: `await applySkillUpdates(active.id, updates, intentWeight);` — statement, not assignment
- PracticeMode.jsx line 301: `await applySkillUpdates(active.id, [{...}]);` — statement, not assignment

**No caller captures the return.** Safe to change from `return profile` to implicit `return undefined`.

5. Line 925: `loadSkillsV2(active.id)` — reloads skills with fresh mastery including `lastRating`
6. Line 926: `buildFocusedContext(active.id, active.materials, focusContext, updatedSkills)` — no profile param
7. Line 934: `cachedSessionCtx.current = { ...cachedSessionCtx.current, skills: updatedSkills, ctx: updatedCtx }` — no profile in cache

**Result:** PASS

---

### T6 — Deadline Intelligence Regression

**Nudge banner (ModePicker.jsx lines 64-170):**
- Loads skills via `loadSkillsV2(active.id)` → skills have `.mastery` with full FSRS data
- `effectiveStrength(s)` computes from `s.mastery.stability` + `s.mastery.lastReviewAt` — both from v2 mastery table
- `nextReviewDate(s)` reads `s.mastery.nextReviewAt` — from v2 mastery table
- **No profile reads.** The nudge banner never used the profile blob.

**Skill picker sort (StudyContext.jsx selectMode, lines 702-732):**
- `effectiveStrength(s)` — same
- `nextReviewDate(s)` — same
- `s.mastery?.lastRating || null` — now from mastery table via `lastRating` field (was `pd?.entries?.slice(-1)[0]?.rating`)
- `s.mastery?.totalMasteryPoints || 0` — same
- `s.mastery?.lastReviewAt` — same
- Deadline sort: `deadlineSkillMap` built from `Assignments.getByCourse` — unchanged, no profile dependency

**Exam auto-scope (StudyContext.jsx selectMode, lines 740-770+):**
- Reads `CourseSchedule.getByCourse` for exam scope auto-detection — unchanged
- Skills come from `loadSkillsV2` — v2 mastery, no profile

**buildDeadlineContext (study.js):**
- Called from buildContext and all buildFocusedContext modes
- Reads `Assignments.getByCourse` + `CourseSchedule.getByCourse` + skills — no profile dependency

**Result:** PASS

---

### T7 — Edge Cases

**T7a — Skill with no mastery record (first interaction):**

Trace through `applySkillUpdates` when `existing = null`:
1. Line 173: `Mastery.getBySkill(u.skillId)` → returns `null`
2. Line 184: `card = initCard()` → fresh FSRS card
3. Line 233: `totalPts = (existing?.total_mastery_points || 0) + weightedPts` → `0 + weightedPts`
4. Line 236-246: `Mastery.upsert(u.skillId, {..., lastRating: u.rating})` → INSERT (new row)

In prompt context: `s.mastery` is `null` (skill loaded before this update) → `s.mastery?.lastRating || ""` → empty string or `"untested"` depending on context. After update + reload: mastery exists with `lastRating` set.

**No null pointer risk.** All mastery accesses use optional chaining.

**T7b — Skill with very high mastery:**

No special code path for high mastery. `effectiveStrength` caps at 1.0 (retrievability formula). `lastRating` is a simple string — no overflow risk. FSRS handles high stability gracefully (longer intervals, stability converges).

**T7c — Multiple skills updated in one session:**

Trace: `applySkillUpdates` iterates `for (var u of updates)` — each skill gets independent `Mastery.getBySkill` → `reviewCard` → `Mastery.upsert`. The `lastRating` is set per-skill from `u.rating`.

Old behavior: profile blob accumulated entries for ALL skills in one `DB.saveProfile` call (single write at end).
New behavior: each skill gets its own `Mastery.upsert` call (N writes).

This was already the case pre-E.1 (the Mastery.upsert was at line 238, inside the loop). The only change is removing the redundant profile blob write that happened AFTER the loop.

**T7d — PracticeSets.get returns null (no existing practice set):**

ModePicker line 622-623:
```js
var existingRow = await PracticeSets.get(s.id);
var pset = existingRow?.data || createPracticeSet(active.id, s, active.name);
```
- `PracticeSets.get` returns `null` → `null?.data` → `undefined` → falls through to `createPracticeSet` → fresh set
- Correct behavior, same as old: `DB.getPractice` returned `null` → `existing || createPracticeSet(...)`.

**T7e — PracticeSets.upsert with data that has no existing row:**

`PracticeSets.upsert` (db.js line 1547-1572) handles NULL session_id path:
1. Checks for existing row: `SELECT id FROM practice_sets WHERE sub_skill_id = ? AND session_id IS NULL`
2. If exists → UPDATE, else → INSERT
3. Handles both cases correctly.

**Result:** PASS

---

## Findings

### F1 — Session count semantic change (Low)

**Location:** `buildContext` line 361, `buildFocusedContext` line 566

**Issue:** `profile.sessions` was incremented only when `applySkillUpdates` ran (i.e., when the AI rated at least one skill). `Sessions.countByCourse(courseId)` counts ALL sessions — including sessions where no skills were rated, empty sessions created during course switches, sessions from before the v2 migration, etc.

**Impact:** Low. The session count in the AI prompt will typically be higher than before. This gives the AI slightly different context about how many sessions the student has had. Since the AI uses this as a rough heuristic ("new student" vs "experienced student"), a higher count is if anything more accurate — the student HAS had more sessions, even if some didn't involve skill ratings.

**Example:**
- Old: Student had 3 skill-rating sessions → prompt says "Total study sessions: 3"
- New: Student had 3 skill-rating sessions + 5 browse/explore sessions → prompt says "Total study sessions: 8"

**Not a regression** — the new behavior is more accurate. No fix needed.

### F2 — Practice set storage key change from course-scoped to skill-scoped (Informational)

**Location:** All PracticeSets call sites

**Issue:** Old storage key was `v1_practice:{courseId}:{skillId}` in the settings table. New storage key is `sub_skill_id` (with `session_id IS NULL`) in the practice_sets table. This means:
- Old: practice sets were namespaced by course AND skill
- New: practice sets are namespaced by skill only (since skill IDs are globally unique via UUID)

**Impact:** Informational. Since sub_skill IDs are UUIDs generated per-course, there's no collision risk. Two different courses cannot share a sub_skill_id, so course-scoping was always redundant.

**Migration note:** Existing v1 practice data in `settings` table (`v1_practice:*` keys) is NOT migrated to the new `practice_sets` table. Students who had in-progress practice sets will start fresh. This is acceptable because practice sets are ephemeral (generated problems for current tier), and the FSRS mastery state (which represents long-term learning) is preserved in `sub_skill_mastery`.

### F3 — applySkillUpdates no longer returns profile (Informational)

**Location:** study.js line 291

**Issue:** `applySkillUpdates` previously returned the updated profile object. It now returns `undefined` (implicit). All call sites were verified to not capture the return value:
- StudyContext.jsx line 921: `await applySkillUpdates(...)` — statement
- PracticeMode.jsx line 301: `await applySkillUpdates(...)` — statement

**Impact:** None. Return value was unused. Safe change.

---

## Coverage Matrix

| Scenario | Change Traced | New Code Path | Result |
|----------|:--:|:--:|:--:|
| FSRS difficulty calculation | applySkillUpdates lines 167-220 | Unchanged | PASS |
| FSRS stability calculation | applySkillUpdates lines 220-228 | Unchanged | PASS |
| FSRS retrievability | reviewCard result | Unchanged (pure function) | PASS |
| FSRS reps/lapses | reviewCard result | Unchanged (pure function) | PASS |
| Weighted points | applySkillUpdates lines 231-233 | Unchanged | PASS |
| lastRating stored | Mastery.upsert line 245 | **New**: `lastRating: u.rating` | PASS |
| lastRating read (SKILL TREE) | buildContext line 330 | `s.mastery?.lastRating` | PASS |
| lastRating read (STUDENT PROFILE) | buildContext line 370 | `s.mastery?.lastRating` | PASS |
| lastRating read (assignment) | buildFocusedContext line 468 | `skill?.mastery?.lastRating` | PASS |
| lastRating read (skill focus) | buildFocusedContext line 508 | `skill?.mastery?.lastRating` | PASS |
| lastRating read (exam) | buildFocusedContext line 614 | `s.mastery?.lastRating` | PASS |
| lastRating read (skill picker) | StudyContext.jsx line 717 | `s.mastery?.lastRating` | PASS |
| Session count (buildContext) | study.js line 361 | `Sessions.countByCourse` | PASS (F1) |
| Session count (recap) | study.js line 566 | `Sessions.countByCourse` | PASS (F1) |
| Profile blob write removed | applySkillUpdates line 290 | Removed (was redundant) | PASS |
| Profile blob read removed | buildContext/buildFocusedContext | All 6 sites → mastery | PASS |
| DB.getProfile calls removed | StudyContext.jsx ×4 | All removed | PASS |
| cachedSessionCtx no profile | StudyContext.jsx lines 809, 934 | `profile` key removed | PASS |
| Practice get (ModePicker assignment) | line 468 | `PracticeSets.get().data` | PASS |
| Practice save (ModePicker assignment) | line 483 | `PracticeSets.upsert()` | PASS |
| Practice get (ModePicker skill) | line 622 | `PracticeSets.get().data` | PASS |
| Practice save (ModePicker skill) | line 634 | `PracticeSets.upsert()` | PASS |
| Practice save (ProfileScreen due) | line 166 | `PracticeSets.upsert()` | PASS |
| Practice save (ProfileScreen skill) | line 310 | `PracticeSets.upsert()` | PASS |
| Practice save (PracticeMode advance) | line 94 | `PracticeSets.upsert()` | PASS |
| Practice save (PracticeMode retry) | line 106 | `PracticeSets.upsert()` | PASS |
| Practice save (PracticeMode submit) | line 281 | `PracticeSets.upsert()` | PASS |
| Practice save (PracticeMode complete) | line 292 | `PracticeSets.upsert()` | PASS |
| Profile screen display | profileData state | No dependency on DB.getProfile | PASS |
| Deadline nudge banner | ModePicker effectiveStrength | No profile dependency | PASS |
| Skill picker sort | StudyContext selectMode | mastery-based, no profile | PASS |
| Exam auto-scope | StudyContext selectMode | CourseSchedule, no profile | PASS |
| First skill interaction | applySkillUpdates existing=null | initCard + INSERT | PASS |
| High mastery skill | effectiveStrength | Capped at 1.0 | PASS |
| Multiple skills in one session | for loop in applySkillUpdates | Independent upserts | PASS |
| No existing practice set | PracticeSets.get returns null | Falls through to createPracticeSet | PASS |
| Build verification | `npm run build` | PASS (1.30s) | PASS |

---

## Batch E Checkpoint

- [x] SA profile removal audit deposited — all fields mapped
- [x] DEV implementation complete, dev log deposited
- [x] QA testing report — no Critical, FSRS integrity confirmed
- [x] Build verified (1.30s)
- [x] Practice mode works end-to-end (all 10 call sites traced)
- [x] AI prompt context contains equivalent mastery information (6 lastRating sites, 2 session count sites)
