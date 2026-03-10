# V1/V2 Unification — Orchestrator Plan

**Date:** 2026-03-09
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Granted — this plan enters the contract/cleanup phase of the expand-and-contract migration strategy. Study Developer and Study Systems Analyst guardrails are satisfied by this authorization.

---

## CEO Decisions (Resolved)

1. **Profile history entries:** **Drop.** FSRS state in `sub_skill_mastery` is the authoritative mastery signal. Per-event history entries in the profile blob are not surfaced in any current UI. Do not migrate to `session_events`.
2. **Active v1 skill data:** **No v1 data to preserve.** CEO will delete courses and start fresh. Migration 004 (Step A.1) still runs at startup as a safety net for any edge cases, but is expected to be a no-op.
3. **Execution order:** **A→B→C→D→E→F confirmed.**

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

6 batches, executed sequentially. No UI changes — this is purely data layer and code cleanup.
Each batch follows: **SA** (blueprint where needed) → **DEV** (implement) → **QA** (validate) → **PM** (status update where needed).

**Migration numbering note:** The redesign spec (Q7) labels these as Phases 3-4 of expand-and-contract. The actual SQL migrations are `001_v2_schema.sql`, `002_skill_extraction_v2.sql`, `003_assignments.sql`. Migrations 004/005 in this plan are JS-level data migrations and code cleanup — no new SQL migration files.

---

## Context for All Agents

### What Exists Today

The app has two data layers running simultaneously:

**V2 (the real schema):** `parent_skills`, `sub_skills`, `sub_skill_mastery`, `chunks`, `materials`, `courses`, `sessions`, `messages`, `journal_entries`, `assignments`, `chunk_skill_bindings`, etc. — proper relational tables with indexes. New features write here.

**V1 compat (`DB` object in db.js):** 15 shim methods mapping old call signatures onto v2 tables, plus JSON blobs in the `settings` table. Called from 9 files across 35+ call sites.

**V1 data in `settings` table:**
- `v1_course_data:{courseId}:skills` — flat skill arrays
- `v1_course_data:{courseId}:reftax` — reference taxonomy
- `v1_profile:{courseId}` — profile with skill history entries
- `v1_chat_session:{courseId}` — session ID mapping
- `v1_practice:{courseId}:{skillId}` — practice set state
- `v1_chunk_skills:{courseId}:{chunkId}` — chunk-level skill data

### V1 Compat Method → V2 Replacement Map

| V1 Compat Method | What It Does | V2 Replacement | Called By |
|---|---|---|---|
| `DB.getCourses()` | Reads courses + nests materials + chunks | `loadCoursesNested()` standalone function — same shape, no compat wrapper | StudyContext, MaterialsScreen, MaterialsPanel, ModePicker, ChunkPicker |
| `DB.saveCourses(courses)` | Upserts nested course/material/chunk objects | `saveCoursesNested(courses)` standalone function | StudyContext, MaterialsScreen, MaterialsPanel |
| `DB.saveDoc(cid, chunkId, doc)` | Writes chunk content to `chunks.content` | `Chunks.updateContent(chunkId, content)` | StudyContext, skills.js |
| `DB.getDoc(cid, chunkId)` | Reads chunk content, JSON-parses | `Chunks.getContent(chunkId)` | skills.js |
| `DB.getProfile(cid)` | Reads JSON blob from settings | **Remove dual-write.** Mastery already in `sub_skill_mastery`. Session count from `sessions` table. | study.js, StudyContext |
| `DB.saveProfile(cid, p)` | Writes JSON blob to settings | **Remove.** FSRS writes already go to `sub_skill_mastery`. | study.js |
| `DB.getChat(cid)` | Reads messages via compat session mapping | `Sessions.getOrCreateCompat(courseId)` + `Messages.getBySession(sessionId)` | StudyContext |
| `DB.saveChat(cid, messages)` | Clears and rewrites all messages | Incremental append via `Messages` module | StudyContext |
| `DB.getJournal(cid)` | Reads journal_entries for course | `JournalEntries.getByCourse(courseId)` | StudyContext |
| `DB.saveJournal(cid, entries)` | Clears and rewrites journal entries | Append-only `JournalEntries.create()` | StudyContext |
| `DB.getPractice(cid, skillId)` | Reads practice set from settings blob | `PracticeSets.getBySkill(skillId)` | ModePicker, ProfileScreen, PracticeMode |
| `DB.savePractice(cid, skillId, data)` | Writes practice set to settings blob | `PracticeSets.upsert(skillId, data)` | ModePicker, ProfileScreen, PracticeMode |
| `DB.getChunkSkills(cid, chunkId)` | Reads chunk skills from settings blob | `ChunkSkillBindings.getByChunk(chunkId)` + join to `sub_skills` | StudyContext |
| `DB.deleteChunk(cid, chunkId)` | Deletes chunk + v1 settings key | `Chunks.delete(chunkId)` — CASCADE handles bindings | StudyContext |
| `DB.deleteCourse(cid)` | Deletes v1 settings keys + course | `Courses.delete(courseId)` — CASCADE + settings cleanup | StudyContext |
| `DB.resetAll()` | Deletes all rows from all tables | Keep as standalone `resetAll()` — not a compat issue | App.jsx, ErrorDisplay |
| `DB.getSkills(cid)` | Reads v1 skill blob | Only used by migrate.js — remove after migration confirmed | migrate.js |
| `DB.getRefTaxonomy(cid)` | Reads v1 ref taxonomy | Only used by migrate.js — same | migrate.js |

### The Nested Course Object

`DB.getCourses()` returns courses with materials and chunks nested inside. Every consumer expects this shape. **Strategy: keep the nested shape, kill the compat wrapper.** Replace with a standalone `loadCoursesNested()` function that queries v2 tables directly but assembles the same nested shape. Consumers don't change. Property aliasing (`mat.name = mat.label`) stays for now.

---

## Batch A — Migration 004: V1 Skill Data Migration

### Step A.1 · DEV · Wire Migration Into Startup

**Agent:** Study Developer
**File:** `src/StudyContext.jsx` (init effect, after assignment blob migration block ~line 268)
**CEO Authorization:** This step implements migration 004 (data migration phase). CEO approval granted via this plan.

Add v1→v2 skill migration call at startup:

```javascript
// After migrateAssignmentBlobs block:
try {
  for (const course of loaded) {
    const needs = await needsV1Migration(course.id);
    if (needs) {
      const result = await migrateV1ToV2(course.id);
      console.log(`[Init] V1→V2 skill migration for "${course.name}": ${result.migrated} skills, ${result.mastery} mastery records, ${result.prereqs} prereqs, ${result.bindings} bindings`);
      if (result.issues.length > 0) console.warn('[Init] Migration issues:', result.issues);
    }
  }
} catch (e) { console.error("V1→V2 skill migration failed:", e); }
```

The `migrateV1ToV2` function already exists in `src/lib/migrate.js` and handles: creating v2 `sub_skills` from v1 blobs, FSRS mastery conversion, prerequisites, chunk bindings, CIP parent skill resolution. It has idempotency guards (checks for existing v2 skills before migrating). Non-fatal — wrapped in try/catch.

**Lines changed:** ~10
**Migration State:** Implements migration 004 — JS-level data migration, no new SQL files

**Output:** `knowledge/development/migration-004-wiring-YYYY-MM-DD.md`

### Step A.2 · QA · Migration 004 Correctness Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed Step A.1
**Reminder:** Per agent spec, migration correctness failures are automatically 🔴 Critical.

Test scope:
- **Migration runs:** Courses with v1 skills produce correct v2 `sub_skills` rows
- **FSRS conversion:** Compare v1 profile `strength`/`ease` values to v2 `difficulty`/`stability`/`retrievability`. Verify the conversion formulas in `easeToDifficulty()` and `estimateStability()` produce mathematically correct results
- **Idempotency:** Running migration twice does not duplicate skills or mastery records
- **No-op courses:** Courses with no v1 skills skip cleanly (no errors, no empty records)
- **Chunk bindings:** Skills with `sources` arrays produce chunk bindings via label matching
- **Parent skill resolution:** V1 `refTax.subject` maps to CIP parent skill correctly
- **App boot:** App boots and renders correctly post-migration, no console errors
- **Edge cases:** Course with v1 skills but no profile data. Course with profile but no skills. Skills with circular prerequisites.

**Output:** `knowledge/qa/migration-004-testing-YYYY-MM-DD.md`

### Step A.3 · PM · Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "Migration 004 — v1 skill data migration" from "Not started" to "✅ Applied" in Skill Architecture Redesign Progress table
- Update Development and Security & Testing department last activity dates

### Batch A Checkpoint

- [ ] DEV implementation complete, dev log deposited
- [ ] QA testing report deposited — no 🔴 Critical findings
- [ ] PM status updated
- [ ] App boots cleanly, v1 skills migrated to v2 (or no-op if no v1 data)

---

## Batch B — Foundation: Add V2 Methods + Architecture Blueprint

### Step B.1 · SA · Unification Architecture Blueprint

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/v1-v2-unification-YYYY-MM-DD.md`

Document the unification design as a formal architecture blueprint:
- The V1 → V2 replacement map (from Context section above) as the authoritative reference
- `loadCoursesNested()` and `saveCoursesNested()` function specs (input, output, query pattern)
- New v2 module methods needed: `Chunks.updateContent`, `Chunks.getContent`, `Chunks.delete`, `Courses.delete`, `PracticeSets` module, `Messages.appendBatch`, `Sessions.getOrCreateCompat`
- Profile removal strategy: what feeds `buildFocusedContext`/`buildContext` today vs what replaces it
- V1 settings key cleanup: which keys get deleted, when

**Migration Impact:** No schema changes. Contract phase of expand-and-contract — code changes only.

**Decisions within authority:** Function signatures, query patterns, module organization

**Handoff → DEV:** Blueprint file in `knowledge/architecture/`

### Step B.2 · DEV · Add Missing V2 DB Module Methods

**Agent:** Study Developer
**Input:** Architecture blueprint from Step B.1
**File:** `src/lib/db.js`

Add methods that the compat layer provides but v2 modules don't yet have:

1. **`Chunks.updateContent(chunkId, content)`** — `UPDATE chunks SET content = ? WHERE id = ?`
2. **`Chunks.getContent(chunkId)`** — `SELECT content FROM chunks WHERE id = ?`, return parsed JSON or raw string
3. **`Chunks.delete(chunkId)`** — `DELETE FROM chunks WHERE id = ?` (CASCADE handles bindings)
4. **`Courses.delete(courseId)`** — `DELETE FROM courses WHERE id = ?` (CASCADE) + `DELETE FROM settings WHERE key LIKE 'v1_%:{courseId}%'`
5. **`PracticeSets` module:**
   - `getBySkill(skillId, sessionId = null)` — read from `practice_sets` table
   - `upsert(skillId, sessionId, data)` — insert or replace in `practice_sets` table
6. **`Messages.appendBatch(sessionId, messages)`** — append messages without clearing existing
7. **`Sessions.getOrCreateCompat(courseId)`** — find existing session for course or create one with intent `'explore'`
8. **`JournalEntries.getByCourse(courseId)`** — `SELECT * FROM journal_entries WHERE course_id = ? ORDER BY id`
9. **`JournalEntries.create(sessionId, courseId, intent, entryData)`** — single insert

Follow existing code patterns: `withTransaction` for writes, `uuid()` for IDs, `now()` for timestamps, `jsonParse()` for JSON fields.

**Lines changed:** ~100
**Migration State:** No schema changes — methods for existing tables

### Step B.3 · DEV · Create Unified Course Loader & Saver

**Agent:** Study Developer
**Input:** Architecture blueprint from Step B.1
**File:** `src/lib/db.js`

Create two standalone exported functions:

**`loadCoursesNested()`** — same logic as current `DB.getCourses()`: queries `courses`, nests `materials` with `chunks`, applies property aliases (`mat.name = mat.label`, `mat.type = mat.file_type`, `course.created = course.created_at`). Not a compat method — a proper standalone function.

**`saveCoursesNested(courses)`** — same logic as current `DB.saveCourses()`: upserts courses + materials + chunks from nested object. Uses `withTransaction`.

These are transitional — the same queries, just no longer inside the `DB` compat object.

**Lines changed:** ~60

**Output:** `knowledge/development/batch-b-foundation-YYYY-MM-DD.md` (covers Steps B.2–B.3)

### Batch B Checkpoint

- [ ] SA blueprint deposited in `knowledge/architecture/`
- [ ] DEV methods added, dev log deposited
- [ ] Old code still works — nothing calls new functions yet
- [ ] Build verified

---

## Batch C — Course Data Path Replacement

### Step C.1 · DEV · Replace `DB.getCourses` / `DB.saveCourses` Calls

**Agent:** Study Developer
**Input:** `loadCoursesNested` and `saveCoursesNested` from Step B.3

Replace all call sites (find-and-replace + import updates):

**`src/StudyContext.jsx`** (~6 calls):
- Init effect: `DB.getCourses()` → `loadCoursesNested()`
- `addFiles`: `DB.saveCourses(updated)` → `saveCoursesNested(updated)`
- `addMaterials`: same pattern
- Post-extraction refresh: `DB.getCourses()` → `loadCoursesNested()`
- `createCourse`: `DB.getCourses()` → `loadCoursesNested()`
- `removeMaterial`: `DB.saveCourses(updated)` → `saveCoursesNested(updated)`

**`src/screens/MaterialsScreen.jsx`** (~3 calls):
- Retry extraction refresh: `DB.getCourses()` → `loadCoursesNested()`
- Activate chunks: `DB.getCourses()` + `DB.saveCourses()` → `loadCoursesNested()` + `saveCoursesNested()`
- Deactivate chunks: same

**`src/components/study/MaterialsPanel.jsx`** (~3 calls):
- Retry, re-enable chunk, extract: same pattern

**`src/components/study/ModePicker.jsx`** (~2 calls):
- Extract: `DB.getCourses()` → `loadCoursesNested()`

**`src/components/study/ChunkPicker.jsx`** (~1 call):
- Extract: `DB.getCourses()` → `loadCoursesNested()`

Update imports in all 5 files: add `loadCoursesNested, saveCoursesNested` from `./lib/db.js`, remove `DB` from import if no other `DB.*` calls remain in that file.

**Lines changed:** ~15 (mostly import changes + function name swaps)

### Step C.2 · DEV · Replace `DB.saveDoc` / `DB.getDoc` Calls

**Agent:** Study Developer

**`src/StudyContext.jsx`** — `addFiles` / `addMaterials` functions:
- `DB.saveDoc(courseId, chunkId, doc)` → `Chunks.updateContent(chunkId, typeof doc === 'string' ? doc : JSON.stringify(doc))`

**`src/lib/skills.js`** — `getMatContent` function (~line 115-155):
- v2 path already reads from `Chunks.getByMaterial()` with inline content — remove the `DB.saveDoc` fallback comment
- v1 fallback path: `DB.getDoc(cid, chunkId)` → `Chunks.getContent(chunkId)`
- `storeAsChunks` v1 path: `DB.saveDoc` → `Chunks.updateContent`

**Lines changed:** ~10

### Step C.3 · DEV · Replace `DB.deleteChunk` / `DB.deleteCourse`

**Agent:** Study Developer
**File:** `src/StudyContext.jsx`

- `DB.deleteChunk(cid, chunkId)` → `Chunks.delete(chunkId)` (CASCADE handles chunk_skill_bindings, no settings cleanup needed)
- `DB.deleteCourse(cid)` → `Courses.delete(courseId)` (from Step B.2 — handles CASCADE + v1 settings cleanup)

**Lines changed:** ~5

### Step C.4 · DEV · Replace `DB.getChunkSkills`

**Agent:** Study Developer
**File:** `src/StudyContext.jsx` (skills panel section)

- `DB.getChunkSkills(cid, chunkId)` → `ChunkSkillBindings.getByChunk(chunkId)` joined to `sub_skills`
- Verify: is this method actually still called? The skills panel may have been fully migrated to v2 during extraction v2 work. If unused, just remove the call site.

**Lines changed:** ~5

**Output:** `knowledge/development/batch-c-course-data-YYYY-MM-DD.md` (covers Steps C.1–C.4)

### Step C.5 · QA · Course Data Path Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps C.1–C.4

Test scope:
- **Course CRUD:** Create course, rename, delete — data persists across restart
- **Material upload:** Upload DOCX, PDF, EPUB — chunks created, content stored, material card renders
- **Extraction pipeline:** Run extraction on uploaded material — skills extracted, chunk bindings created, material state transitions correctly
- **Chunk operations:** Activate/deactivate chunks, delete chunks — state updates, no orphaned data
- **Retry extraction:** Retry failed chunks — works end-to-end
- **Course deletion:** Delete a course with materials, chunks, skills, sessions — everything cascades cleanly, no orphaned settings keys
- **Build verification:** Release build boots, no white screen

**Output:** `knowledge/qa/batch-c-course-data-testing-YYYY-MM-DD.md`

### Batch C Checkpoint

- [ ] DEV implementation complete, dev log deposited
- [ ] QA testing report — no 🔴 Critical
- [ ] Build verified
- [ ] All course/material/chunk CRUD works through unified functions

---

## Batch D — Session Data Path (Chat, Journal)

### Step D.1 · DEV · Replace `DB.saveChat` / `DB.getChat`

**Agent:** Study Developer
**File:** `src/StudyContext.jsx`

The compat layer creates a hidden session per course (stored as `v1_chat_session:{courseId}` in settings) and rewrites all messages on every save.

Replace:
- Chat load (init, `enterStudy`): `DB.getChat(cid)` → `Sessions.getOrCreateCompat(courseId)` to get session ID, then `Messages.getBySession(sessionId)`
- Chat save (after AI response, on course exit): `DB.saveChat(cid, msgs)` → `Messages.appendBatch(sessionId, newMessages)` for incremental saves
- Store the resolved `sessionId` in a ref so it doesn't need to be re-resolved on every save

**Lines changed:** ~25

### Step D.2 · DEV · Replace `DB.saveJournal` / `DB.getJournal`

**Agent:** Study Developer
**File:** `src/StudyContext.jsx`

Replace:
- Journal load: `DB.getJournal(cid)` → `JournalEntries.getByCourse(courseId)`
- Journal save: `DB.saveJournal(cid, entries)` → `JournalEntries.create(sessionId, courseId, 'v1_compat', entryData)` — single append, not clear-and-rewrite

The current compat does a full clear-and-rewrite which is wasteful. Switch to append-only.

**Lines changed:** ~15

**Output:** `knowledge/development/batch-d-sessions-YYYY-MM-DD.md` (covers D.1–D.2)

### Step D.3 · QA · Session Data Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps D.1–D.2

Test scope:
- **Chat persistence:** Send messages, close app, reopen — messages are there
- **Chat across course switches:** Switch course, switch back — correct messages for each course
- **Journal accumulation:** Complete a study session, journal entry created. Complete another — both entries exist (not just the latest)
- **Session continuity:** Enter study mode → chat → exit → re-enter → previous messages load with correct session
- **New course:** Create a new course, start chatting — session created automatically
- **Edge case:** Course with no chat history, course with very long chat history

**Output:** `knowledge/qa/batch-d-sessions-testing-YYYY-MM-DD.md`

### Batch D Checkpoint

- [ ] DEV implementation complete, dev log deposited
- [ ] QA testing report — no 🔴 Critical
- [ ] Chat persistence works across restart
- [ ] Journal entries accumulate correctly

---

## Batch E — Mastery & Practice (Highest Risk)

### Step E.0 · SA · Profile Removal Audit

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/profile-removal-audit-YYYY-MM-DD.md`

**CRITICAL PRE-STEP:** Before any code changes in this batch, audit every place the v1 profile blob is read and map each field access to a v2 equivalent.

Audit targets:
1. **`study.js` — `applySkillUpdates()`** (~line 159-303): Currently reads profile, appends per-skill history entries, increments session counter, writes profile back. The FSRS mastery write already happens independently to `sub_skill_mastery`. What in this function actually needs the profile blob vs what's redundant?

2. **`study.js` — `buildFocusedContext()` and `buildContext()`**: These construct the AI system prompt. Find every reference to `profile`, `profile.skills`, `profile.sessions`. Map each to a v2 equivalent:
   - `profile.skills[skillId].strength` → `currentRetrievability(mastery)` from FSRS
   - `profile.skills[skillId].entries` → **drop** (CEO decision: do not migrate to session_events)
   - `profile.skills[skillId].points` → `mastery.total_mastery_points`
   - `profile.sessions` → `SELECT COUNT(*) FROM sessions WHERE course_id = ?`

3. **`StudyContext.jsx`**: Find every `DB.getProfile()` call. Determine what the result is used for.

4. **`study.js` — `generateSessionEntry()`**: Does it read profile data for journal generation?

**Document findings as a field-by-field map.** If any profile field has no v2 equivalent and is actively used, flag to CEO before proceeding.

**Handoff → DEV:** Audit findings in `knowledge/architecture/`

### Step E.1 · DEV · Replace `DB.getProfile` / `DB.saveProfile` — Dual-Write Removal

**Agent:** Study Developer
**Input:** Profile removal audit from Step E.0. **Do not start this step without the audit.**
**Files:** `src/lib/study.js`, `src/StudyContext.jsx`
**CEO Authorization:** This step removes the v1 profile dual-write. CEO approval granted via this plan.
**CEO Decision:** Profile history entries are **dropped** — do not migrate to `session_events`.

In `applySkillUpdates()` (~line 159-303 of study.js):
- Remove `DB.getProfile(courseId)` call at the top
- Remove the `profile.skills[u.skillId]` accumulation block at the bottom (~lines 289-298)
- Remove `profile.sessions` increment
- Remove `DB.saveProfile(courseId, profile)` call
- Remove `return profile` — function no longer needs to return anything (or return void). Update all callers that use the return value.
- The FSRS mastery writes (`Mastery.upsert`) already happen independently — those stay untouched

In `StudyContext.jsx`:
- Replace `DB.getProfile(courseId)` calls with v2 mastery reads per the audit map
- Where profile feeds into `buildFocusedContext` / `buildContext`: pass mastery data from `loadSkillsV2()` (which already enriches skills with mastery via `Mastery.getBySkill`)
- Session count: `SELECT COUNT(*) FROM sessions WHERE course_id = ?` (add to `Sessions` module if not already there)
- Any profile data used for journal generation: replace with mastery snapshot or drop

**Lines changed:** ~40
**Risk:** HIGH — verify AI prompt context is equivalent before and after

### Step E.2 · DEV · Replace `DB.getPractice` / `DB.savePractice`

**Agent:** Study Developer
**Input:** `PracticeSets` module from Step B.2
**Files:** `src/components/study/ModePicker.jsx`, `src/screens/ProfileScreen.jsx`, `src/components/study/PracticeMode.jsx`

Replace all call sites:

**`ModePicker.jsx`** (4 calls):
- 2× `DB.getPractice(active.id, skillId)` → `PracticeSets.getBySkill(skillId)`
- 2× `DB.savePractice(active.id, skillId, data)` → `PracticeSets.upsert(skillId, null, data)`

**`ProfileScreen.jsx`** (2 calls):
- `DB.savePractice(course.id, skillId, data)` → `PracticeSets.upsert(skillId, null, data)`

**`PracticeMode.jsx`** (3 calls):
- `DB.savePractice(active.id, pm.skill.id, data)` → `PracticeSets.upsert(pm.skill.id, null, data)`

Update imports in all 3 files: add `PracticeSets` from `../lib/db.js` (or `../../lib/db.js`), remove `DB` from import if no other `DB.*` calls remain.

**Lines changed:** ~15

**Output:** `knowledge/development/batch-e-mastery-practice-YYYY-MM-DD.md` (covers E.1–E.2)

### Step E.3 · QA · Mastery & Practice Testing (Heavy)

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps E.1–E.2
**Reminder:** Per agent spec, FSRS calculation errors are automatically 🔴 Critical.

Test scope:
- **FSRS integrity:** Skill updates from a tutoring session produce correct `sub_skill_mastery` values. Compare before/after for: difficulty, stability, retrievability, reps, lapses, total_mastery_points. Values must be mathematically identical to pre-change behavior.
- **AI prompt context:** Compare system prompt content before and after profile removal. Mastery information (strength, readiness, points) must be present. The prompt should not reference profile blob fields that no longer exist.
- **Practice mode full flow:** Start practice from ProfileScreen → answer questions → tier progression → persistence across app restart. Start practice from ModePicker skill picker → same flow.
- **Profile screen:** Domain grouping, levels, readiness percentages, concept keys all display correctly
- **Skill updates from chat:** Complete a study session, AI rates skills, mastery updates — verify `sub_skill_mastery` rows update correctly
- **Deadline intelligence regression:** Nudge banner, skill picker sort, exam auto-scope all read mastery data — verify they still work
- **Edge cases:** Skill with no mastery record (first interaction). Skill with very high mastery. Multiple skills updated in one session.

**Output:** `knowledge/qa/batch-e-mastery-testing-YYYY-MM-DD.md`

### Batch E Checkpoint

- [ ] SA profile removal audit deposited — all fields mapped
- [ ] DEV implementation complete, dev log deposited
- [ ] QA testing report — no 🔴 Critical, FSRS integrity confirmed
- [ ] Build verified
- [ ] Practice mode works end-to-end
- [ ] AI prompt context contains equivalent mastery information

---

## Batch F — Cleanup

### Step F.1 · DEV · Remove the `DB` Compat Object

**Agent:** Study Developer
**File:** `src/lib/db.js`

Delete the entire `// V1 COMPAT` section at the bottom of db.js (~200 lines, from the `export const DB = {` line to the closing `};`).

Update imports in all consumer files — remove `DB` from destructured imports. By this point, no file should reference `DB.*` methods. Verify: `grep -rn "DB\." src/ --include="*.js" --include="*.jsx" | grep -v node_modules | grep -v "//.*DB\."` returns zero results (excluding comments).

**Lines removed:** ~200

### Step F.2 · DEV · Clean Up V1 Settings Keys

**Agent:** Study Developer
**Files:** `src/lib/db.js` (add function), `src/StudyContext.jsx` (call at startup)

Add:
```javascript
export async function cleanupV1SettingsKeys() {
  const db = await getDb();
  const result = await db.execute("DELETE FROM settings WHERE key LIKE 'v1_%'");
  console.log(`[Init] Cleaned up ${result.rowsAffected} v1 settings keys`);
  return result.rowsAffected;
}
```

Call in StudyContext init effect, after migration 004 block. Only runs if there are v1 keys to clean. Idempotent.

**Lines changed:** ~10

### Step F.3 · DEV · Remove Migration Code

**Agent:** Study Developer
**File:** `src/lib/migrate.js`

Remove:
- `migrateV1ToV2()` function and all its helpers (`kebab`, `generateConceptKey`, `easeToDifficulty`, `estimateStability`, `estimateNextReview`)
- `needsV1Migration()` function
- `migrateAssignmentBlobs()` function (already completed its job)

Also remove from `db.js`:
- `DB.getSkills()` — only served migrate.js
- `DB.getRefTaxonomy()` — only served migrate.js

If `migrate.js` is now empty, delete the file and remove its import from `StudyContext.jsx`.

Update `StudyContext.jsx` init effect: remove the migration blocks (both assignment blob and v1→v2 skill migration), remove the `cleanupV1SettingsKeys` call (it's already run). The init effect simplifies to: seed CIP → load courses → load API key.

**Lines removed:** ~300

**Output:** `knowledge/development/batch-f-cleanup-YYYY-MM-DD.md` (covers F.1–F.3)

### Step F.4 · QA · Final Verification

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps F.1–F.3

Test scope:
- **Clean startup:** App boots with no console errors, no warnings about v1 data
- **No orphaned data:** `SELECT * FROM settings WHERE key LIKE 'v1_%'` returns zero rows
- **No compat references:** `grep -rn "V1_COMPAT\|v1_\|DB\." src/ --include="*.js" --include="*.jsx"` returns zero (excluding comments and the grep command itself)
- **Full regression:** Course creation, material upload, extraction, study session, practice mode, profile view, schedule view, deadline nudge — all work
- **Release build:** `npm run tauri build` succeeds, binary boots, no white screen

**Output:** `knowledge/qa/batch-f-final-testing-YYYY-MM-DD.md`

### Step F.5 · PM · Final Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "Migration 005 — Cleanup" from "Not started" to "✅ Applied" in Skill Architecture Redesign Progress table
- Remove all v1 compat references from the document
- Update "What Is Working" to note unified data layer
- Update Codebase Summary: recalculate LOC, file count (migrate.js removed, db.js ~200 lines shorter)
- Update Recent Development Activity with batch dates
- Clear any "Specified But Not Built" entries related to migrations 004/005

### Batch F Checkpoint

- [ ] DEV cleanup complete, dev log deposited
- [ ] QA final report — no 🔴 Critical, clean boot, no v1 references
- [ ] PM status updated
- [ ] Build verified — release build boots
- [ ] `grep "v1_\|V1_COMPAT\|DB\." src/` returns zero

---

## Estimated Scope

| Batch | Steps | Files Touched | Lines Changed | Risk |
|---|---|---|---|---|
| A (Mig 004) | A.1–A.3 | 1 | +10 | Low |
| B (Foundation) | B.1–B.3 | 1 + blueprint | +160 | Low |
| C (Course data) | C.1–C.5 | 7 | ~35 | Low-Med |
| D (Sessions) | D.1–D.3 | 1 | ~40 | Medium |
| E (Mastery) | E.0–E.3 | 5 + audit | ~55 | **High** |
| F (Cleanup) | F.1–F.5 | 3+ | -500 | Low |

**Total:** ~300 lines added, ~500 lines removed. Net: **-200 lines.**

---

## Knowledge Artifacts Produced

| Batch | Agent | Artifact | Location |
|---|---|---|---|
| A | DEV | Migration 004 dev log | `knowledge/development/migration-004-wiring-YYYY-MM-DD.md` |
| A | QA | Migration 004 test report | `knowledge/qa/migration-004-testing-YYYY-MM-DD.md` |
| B | SA | Unification architecture blueprint | `knowledge/architecture/v1-v2-unification-YYYY-MM-DD.md` |
| B | DEV | Foundation dev log | `knowledge/development/batch-b-foundation-YYYY-MM-DD.md` |
| C | DEV | Course data path dev log | `knowledge/development/batch-c-course-data-YYYY-MM-DD.md` |
| C | QA | Course data test report | `knowledge/qa/batch-c-course-data-testing-YYYY-MM-DD.md` |
| D | DEV | Sessions dev log | `knowledge/development/batch-d-sessions-YYYY-MM-DD.md` |
| D | QA | Sessions test report | `knowledge/qa/batch-d-sessions-testing-YYYY-MM-DD.md` |
| E | SA | Profile removal audit | `knowledge/architecture/profile-removal-audit-YYYY-MM-DD.md` |
| E | DEV | Mastery & practice dev log | `knowledge/development/batch-e-mastery-practice-YYYY-MM-DD.md` |
| E | QA | Mastery test report (heavy) | `knowledge/qa/batch-e-mastery-testing-YYYY-MM-DD.md` |
| F | DEV | Cleanup dev log | `knowledge/development/batch-f-cleanup-YYYY-MM-DD.md` |
| F | QA | Final test report | `knowledge/qa/batch-f-final-testing-YYYY-MM-DD.md` |
| F | PM | Updated PROJECT_STATUS.md | `study/PROJECT_STATUS.md` |

---

## Agent Involvement Per Batch

| Batch | SA | DEV | QA | PM |
|---|---|---|---|---|
| A — Migration 004 | — | Wire startup (1 step) | Migration correctness | Status update |
| B — Foundation | Architecture blueprint | Add methods (2 steps) | — | — |
| C — Course data | — | Replace calls (4 steps) | Course CRUD + extraction regression | — |
| D — Sessions | — | Replace calls (2 steps) | Chat/journal persistence | — |
| E — Mastery | Profile removal audit | Dual-write removal + practice (2 steps) | FSRS verification + full regression | — |
| F — Cleanup | — | Remove compat + cleanup (3 steps) | Final verification + build | Status update |

---

## Post-Execution

After all batches complete, update `knowledge/KNOWLEDGE_INDEX.md` with all new files deposited during execution.
