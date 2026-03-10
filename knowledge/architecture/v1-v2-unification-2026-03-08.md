# V1 → V2 Unification Architecture Blueprint
**Date:** 2026-03-08
**Role:** Study Systems Analyst
**Migration State:** Contract phase of expand-and-contract (code changes only, no schema changes)
**Prerequisite:** Migration 004 (v1 skill data migration) — ✅ Applied

---

## Summary

The `DB` object (db.js:1570–1846) contains 16 V1 compatibility shims that map old method signatures to v2 tables. These shims exist because the original App.jsx (pre-decomposition) used a flat API where courses contained nested materials, chunks, skills, profiles, chats, journals, and practice sets. The v2 schema normalizes this into dedicated tables with dedicated module APIs (`Courses`, `Materials`, `Chunks`, `SubSkills`, `Sessions`, `Messages`, `JournalEntries`, `PracticeSets`, `Mastery`).

With migration 004 complete (v1 skill blobs now migrated to v2 sub_skills), the V1 compat layer can be contracted. This blueprint defines the replacement map, new utility functions, and cleanup sequence.

---

## 1. V1 → V2 Replacement Map

### 1.1 Course CRUD

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.getCourses()` | `loadCoursesNested()` (new utility) | Returns courses with nested materials + chunks. See §2.1. |
| `DB.saveCourses(courses)` | `saveCoursesNested(courses)` (new utility) | Upserts courses/materials/chunks. See §2.2. |
| `DB.deleteCourse(cid)` | `Courses.delete(id)` + v1 key cleanup | CASCADE handles children. Settings cleanup needed. See §5. |
| `DB.resetAll()` | `resetAll({ confirmed: true })` | Already implemented. Direct passthrough. |

### 1.2 Chunk Data

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.saveDoc(cid, chunkId, doc)` | `Chunks.updateContent(id, content)` (new) | Updates `chunks.content` column. See §3.1. |
| `DB.getDoc(cid, chunkId)` | `Chunks.getContent(id)` | **Already exists** (db.js:751). Returns raw content string. |
| `DB.deleteChunk(cid, chunkId)` | `Chunks.delete(id)` (new) | Deletes chunk row + CASCADE clears bindings. See §3.2. |
| `DB.getChunkSkills(cid, chunkId)` | **Dead code — remove** | 0 callers outside db.js. Reads `v1_chunk_skills` settings key. |

### 1.3 Profile

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.getProfile(cid)` | Inline composition from v2 data | See §4. Profile is **derived**, not stored. |
| `DB.saveProfile(cid, p)` | Inline save of relevant parts | See §4. Only `profile.sessions` and `profile.skills[].entries` are consumed. |

### 1.4 Chat / Messages

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.saveChat(cid, messages)` | `Messages.appendBatch(sessionId, messages)` (new) | See §3.4. |
| `DB.getChat(cid)` | `Messages.getBySession(sessionId)` | Already exists. Needs session ID resolution. See §3.3. |

### 1.5 Journal

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.saveJournal(cid, entries)` | `JournalEntries.create(...)` | Already exists. Called per-entry instead of bulk rewrite. |
| `DB.getJournal(cid)` | `JournalEntries.getByCourse(courseId)` | Already exists. Returns rows with `entry_data` field. |

### 1.6 Practice Sets

| V1 Method | V2 Replacement | Notes |
|---|---|---|
| `DB.savePractice(cid, skillId, data)` | `PracticeSets.upsert(subSkillId, data)` | Already exists. Key change: keyed by v2 `subSkillId`, not v1 `skillId`. |
| `DB.getPractice(cid, skillId)` | `PracticeSets.get(subSkillId)` | Already exists. Returns `{ data }` with parsed JSON. |

### 1.7 Legacy Data (migrate.js only)

| V1 Method | Used By | Disposition |
|---|---|---|
| `DB.getSkills(cid)` | `migrate.js` only | Keep until migration 005 (cleanup). |
| `DB.getRefTaxonomy(cid)` | `migrate.js` only | Keep until migration 005. |
| `DB._saveCourseData` | Dead code | Remove. |
| `DB._getCourseData` | Used by getSkills/getRefTaxonomy | Keep until migration 005. |

---

## 2. New Utility Functions

### 2.1 `loadCoursesNested()`

**Location:** `src/lib/db.js` (new export, outside DB object)

**Purpose:** Replaces `DB.getCourses()`. Loads courses with nested materials and chunks using v2 module APIs.

```
async function loadCoursesNested(): Course[]

Returns:
[{
  id, name, created_at, updated_at,
  // syllabus fields (course_number, instructor, semester, etc.)
  materials: [{
    id, label, file_type, classification, active, created_at,
    // v1 compat aliases:
    name: label,           // alias for consumers expecting .name
    type: file_type,       // alias for consumers expecting .type
    created: created_at,   // alias for consumers expecting .created
    chunks: [{
      id, label, charCount, status, errorInfo, failCount
      // Note: content NOT loaded (expensive, load on demand via Chunks.getContent)
    }]
  }]
}]
```

**Query pattern:**
```sql
-- Step 1: Load all courses
SELECT * FROM courses ORDER BY created_at DESC

-- Step 2: For each course, load materials
SELECT * FROM materials WHERE course_id = ? ORDER BY created_at

-- Step 3: For each material, load chunk metadata (no content)
SELECT id, label, char_count, status, error_info, fail_count
FROM chunks WHERE material_id = ? ORDER BY ordering
```

**Design decisions:**
- Returns v1-compat field aliases (`name`, `type`, `created`) so existing consumers don't break during migration
- Does NOT load chunk `content` — this is the expensive column. Loaded on demand via `Chunks.getContent(id)`.
- `errorInfo` is JSON-parsed from `error_info` column
- `failCount` is aliased from `fail_count`

### 2.2 `saveCoursesNested(courses)`

**Location:** `src/lib/db.js` (new export, outside DB object)

**Purpose:** Replaces `DB.saveCourses()`. Upserts courses with nested materials and chunks.

```
async function saveCoursesNested(courses: Course[]): boolean

Input shape: Same as loadCoursesNested output (with v1 compat aliases accepted)
```

**Query pattern:**
```sql
-- Within withTransaction():
-- Step 1: Upsert course
INSERT INTO courses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at

-- Step 2: For each material
INSERT INTO materials (id, course_id, label, classification, file_type, active, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label, classification = excluded.classification,
  file_type = excluded.file_type, active = excluded.active, updated_at = ?

-- Step 3: For each chunk (metadata only — content not touched)
INSERT INTO chunks (id, material_id, course_id, label, content_hash, char_count,
  status, error_info, fail_count, ordering, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label, char_count = excluded.char_count,
  status = excluded.status, error_info = excluded.error_info,
  fail_count = excluded.fail_count
```

**Design decisions:**
- Accepts both v1 field names (`name`/`type`/`created`) and v2 field names (`label`/`file_type`/`created_at`)
- Wrapped in `withTransaction()` for atomicity
- Does NOT write chunk `content` — that's a separate operation via `Chunks.updateContent`
- Nearly identical to current `DB.saveCourses` — this is a lift-and-shift, not a redesign

---

## 3. New V2 Module Methods

### 3.1 `Chunks.updateContent(id, content)`

**Location:** Add to `Chunks` module in db.js

```js
async updateContent(id, content) {
  const db = await getDb();
  const c = typeof content === 'string' ? content : JSON.stringify(content);
  await db.execute(
    'UPDATE chunks SET content = ?, updated_at = ? WHERE id = ?',
    [c, now(), id]
  );
}
```

**Replaces:** `DB.saveDoc(cid, chunkId, doc)` — drops the unused `cid` parameter. The chunk ID is sufficient (chunks have unique IDs).

### 3.2 `Chunks.delete(id)`

**Location:** Add to `Chunks` module in db.js

```js
async delete(id) {
  const db = await getDb();
  await db.execute('DELETE FROM chunks WHERE id = ?', [id]);
}
```

**Replaces:** `DB.deleteChunk(cid, chunkId)` — drops `cid` parameter and `v1_chunk_skills` settings cleanup (dead code, 0 callers for getChunkSkills).

**CASCADE effect:** `chunk_skill_bindings`, `chunk_fingerprints`, `chunk_media` rows deleted automatically via FK cascade.

### 3.3 `Sessions.getOrCreateCompat(courseId)`

**Location:** Add to `Sessions` module in db.js

```js
async getOrCreateCompat(courseId) {
  const db = await getDb();
  // Check for existing active session
  const rows = await db.select(
    "SELECT id FROM sessions WHERE course_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    [courseId]
  );
  if (rows.length > 0) return rows[0].id;
  // Create new compat session
  const id = uuid();
  await db.execute(
    "INSERT INTO sessions (id, course_id, intent, status, started_at) VALUES (?, ?, 'explore', 'active', ?)",
    [id, courseId, now()]
  );
  return id;
}
```

**Replaces:** The `v1_chat_session:{cid}` settings key pattern used by `DB.saveChat`, `DB.getChat`, `DB.saveJournal`. Instead of storing session IDs in settings, we query the sessions table directly for the active session.

### 3.4 `Messages.appendBatch(sessionId, messages)`

**Location:** Add to `Messages` module in db.js

```js
async appendBatch(sessionId, messages) {
  return withTransaction(async (db) => {
    for (const msg of messages) {
      await db.execute(
        'INSERT INTO messages (session_id, role, content, input_mode, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, msg.role, msg.content, msg.inputMode || null,
         JSON.stringify({ thinking: msg.thinking, skills: msg.skills }), now()]
      );
    }
  });
}
```

**Replaces:** `DB.saveChat(cid, messages)` which did delete-all-then-reinsert. The new method only appends — callers will be updated to track what's already persisted vs new messages.

**Note:** The current `DB.saveChat` does a destructive `DELETE FROM messages WHERE session_id = ?` then reinserts all messages on every save. This is wasteful — `appendBatch` only inserts new messages. The caller in StudyContext will need to track the last-persisted message index to avoid duplicates.

### 3.5 `Courses.delete(id)` — Settings Cleanup

**Already exists** at db.js:268. However, the current implementation does NOT clean up v1 settings keys. During the contract phase, `DB.deleteCourse` adds `DELETE FROM settings WHERE key LIKE 'v1_%:{cid}%'`. Once V1 keys are fully cleaned up (§5), this line becomes a no-op and can be removed in migration 005.

**Decision:** Add settings cleanup to `Courses.delete` temporarily:
```js
async delete(id) {
  const db = await getDb();
  await db.execute("DELETE FROM settings WHERE key LIKE ?", [`v1_%:${id}%`]);
  await db.execute('DELETE FROM courses WHERE id = ?', [id]);
}
```

---

## 4. Profile Removal Strategy

### 4.1 Current State

The v1 profile blob (`v1_profile:{cid}` in settings) stores:
```js
{
  skills: {
    [skillId]: {
      points: number,
      entries: [{ date, rating, reason, context, source, weightedPts }]
    }
  },
  sessions: number
}
```

### 4.2 Consumers

| Consumer | What it reads | V2 equivalent |
|---|---|---|
| `buildContext` (study.js:343) | `profile.skills[s.id].entries[-1].rating` | `Mastery.getBySkill` → last review info |
| `buildContext` (study.js:375) | `profile.sessions` | `Sessions.getByCourse(cid).length` |
| `buildContext` (study.js:382–386) | `profile.skills[s.id].entries[-1]` | Session events or mastery last_review_at |
| `buildFocusedContext` (study.js:482) | `profile.skills[sid].entries[-1].rating` | Same as above |
| `buildFocusedContext` (study.js:523) | `profile.skills[skill.id].entries[-1].rating` | Same |
| `applySkillUpdates` (study.js:162) | Loads profile, appends entries, increments sessions, saves back | **Primary writer** |
| `generateSessionEntry` (study.js:716) | Not directly — uses `sessionSkillLog` | Independent |

### 4.3 What Profile Data Actually Provides to Context Builders

1. **`profile.sessions`** — total session count → simple `SELECT COUNT(*) FROM sessions WHERE course_id = ?`
2. **`profile.skills[id].entries[-1].rating`** — last rating for a skill → can be derived from session_events or mastery update timestamp. However, the exact rating string ("struggled"/"hard"/"good"/"easy") is NOT stored in `sub_skill_mastery`. It IS stored in `session_events.event_type` but with mapped FSRS grades.
3. **`profile.skills[id].entries[-1].date`** — last practice date → `mastery.last_review_at` (epoch → date string)
4. **`profile.skills[id].points`** — total weighted points → `mastery.total_mastery_points`

### 4.4 The Rating Gap

The v1 profile stores the **original human-readable rating** (`struggled`, `hard`, `good`, `easy`) for each entry. The v2 mastery table stores FSRS-computed fields but NOT the original rating string. `session_events` stores `event_type` which is the FSRS grade (1–4), not the original rating text.

**Options:**
1. **Drop last-rating display** — context builders stop showing "last: good on 2026-03-08". Strength % already conveys mastery level. Simplest change.
2. **Store last rating in mastery** — add `last_rating TEXT` to the `applySkillUpdates` path. No schema change needed — we can store it in a JSON column or use an existing text column.
3. **Derive from session_events** — query `session_events` for the most recent event per skill. More complex, adds a query per context build.

### 4.5 CEO Escalation: Profile History Entry Decision

**Decision required:** The v1 profile accumulates a full history of entries per skill (date, rating, reason, context, source, points). This history is used in:
- Context builders: only the **last entry** (last rating + date) is consumed
- Journal: independent system, not affected
- Display: nowhere directly (ProfileScreen reads from v2 mastery/fitness)

**Options for CEO:**
- **A) Drop history** — only preserve the "last rating" field. History entries are never displayed to users and only the last one feeds into LLM context. Simplest. ~0 lines of migration code.
- **B) Migrate history to session_events** — each history entry becomes a session_event row. Preserves audit trail. More complex (~30 lines migration code). But history is never queried after migration.

**Recommendation:** Option A (drop history). The data has no consumer beyond the last entry, and FSRS mastery + fitness counters already provide a richer picture of student progress than the v1 entry log.

### 4.6 Replacement Implementation (assuming CEO picks A)

**In `applySkillUpdates`:**
- Keep writing `profile.sessions` increment and `profile.skills[id].entries.push(...)` for now
- But ALSO write `last_rating` to a v2 location (either `sub_skill_mastery` metadata or a settings key per skill)
- **Simplest v2 path:** After `Mastery.upsert(...)`, store the rating:
  ```js
  // Inside applySkillUpdates, after Mastery.upsert:
  await SubSkills.update(u.skillId, {
    // Repurpose an existing JSON field or add to fitness
  });
  ```
  Actually, the cleanest path is to embed last-rating info in the `fitness` JSON column on `sub_skills`, which is already a bag of counters:
  ```js
  fitness.lastRating = u.rating;
  fitness.lastRatingDate = date;
  ```
  `SubSkills.incrementTutoringReferences` etc. already write to `fitness`. Adding `lastRating`/`lastRatingDate` is consistent.

**In context builders:**
- Replace `profile.skills[s.id].entries[-1].rating` → `s.fitness?.lastRating || null`
- Replace `profile.skills[s.id].entries[-1].date` → format `s.mastery?.lastReviewAt` to date string
- Replace `profile.sessions` → count from sessions table (or pass in as parameter)

**In `applySkillUpdates` itself:**
- Stop loading/saving profile entirely once last-rating is stored in fitness
- Session count: `Sessions.getByCourse` count (or increment a course-level counter)

---

## 5. V1 Settings Key Cleanup

### 5.1 Key Patterns to Delete

| Pattern | Current Writer | Current Reader | Delete When |
|---|---|---|---|
| `v1_course_data:{cid}:skills` | None (saveSkills removed) | `migrate.js` only | Migration 005 |
| `v1_course_data:{cid}:reftax` | None (saveRefTaxonomy removed) | `migrate.js` only | Migration 005 |
| `v1_course_data:{cid}:asgn` | None | `migrate.js` (deletes after migration) | Already cleaned by migrateAssignmentBlobs |
| `v1_profile:{cid}` | `applySkillUpdates` | `applySkillUpdates`, context builders | After profile removal (this phase) |
| `v1_chat_session:{cid}` | `DB.saveChat`, `DB.saveJournal` | `DB.getChat`, `DB.saveChat`, `DB.saveJournal` | After chat/journal migration (this phase) |
| `v1_chunk_skills:{cid}:{chunkId}` | None | `DB.getChunkSkills` (0 callers) | Immediately (dead code) |
| `v1_practice:{cid}:{skillId}` | `DB.savePractice` | `DB.getPractice` | After practice migration (this phase) |

### 5.2 Cleanup Sequence

**Phase 1 (this blueprint):** Remove dead code
- Delete `DB.getChunkSkills` (0 callers)
- Delete `DB._saveCourseData` (0 callers)
- Delete `v1_chunk_skills` cleanup from `DB.deleteChunk` → replaced by `Chunks.delete` (CASCADE)

**Phase 2 (contract — code changes):** Replace callers
- Replace all `DB.getCourses()` → `loadCoursesNested()`
- Replace all `DB.saveCourses()` → `saveCoursesNested()`
- Replace all `DB.saveDoc()` → `Chunks.updateContent()`
- Replace all `DB.getDoc()` → `Chunks.getContent()` (already exists)
- Replace all `DB.deleteChunk()` → `Chunks.delete()`
- Replace all `DB.deleteCourse()` → `Courses.delete()` (with settings cleanup)
- Replace all `DB.saveChat/getChat` → `Sessions.getOrCreateCompat()` + `Messages` methods
- Replace all `DB.saveJournal/getJournal` → `JournalEntries` methods
- Replace all `DB.savePractice/getPractice` → `PracticeSets.upsert/get`
- Replace all `DB.saveProfile/getProfile` → fitness-based approach (§4.6)

**Phase 3 (delete V1 shim):** After all callers migrated
- Delete entire `DB` object from db.js (~280 lines)
- Delete `v1_chat_session` settings key creation
- Add startup cleanup: `DELETE FROM settings WHERE key LIKE 'v1_%'`

**Phase 4 (migration 005):** Schema cleanup
- Drop old v1 tables if any remain
- Final settings table cleanup

### 5.3 Timing of Settings Key Deletion

Settings keys should be deleted **after** all readers are migrated away, not before. The sequence per key pattern:

1. Migrate all readers to v2 APIs
2. Migrate all writers to v2 APIs
3. Delete the settings key (one-time cleanup at startup)
4. Remove the DB method

---

## 6. Impact Analysis

### 6.1 Files Affected

| File | Changes |
|---|---|
| `src/lib/db.js` | Add `loadCoursesNested`, `saveCoursesNested`, `Chunks.updateContent`, `Chunks.delete`, `Sessions.getOrCreateCompat`, `Messages.appendBatch`. Update `Courses.delete` with settings cleanup. Eventually delete entire `DB` object. |
| `src/StudyContext.jsx` | Replace all 20+ `DB.*` calls with v2 module calls. Remove profile state management. |
| `src/lib/study.js` | Replace `DB.getProfile`/`DB.saveProfile` in `applySkillUpdates`. Update context builders to use fitness-based last-rating. |
| `src/lib/skills.js` | Replace `DB.getDoc` calls with `Chunks.getContent`. |
| `src/screens/MaterialsScreen.jsx` | Replace `DB.getCourses`/`DB.saveCourses` with nested utilities. |
| `src/components/study/MaterialsPanel.jsx` | Same as MaterialsScreen. |
| `src/components/study/ChunkPicker.jsx` | Replace `DB.getCourses`. |
| `src/components/study/ModePicker.jsx` | Replace `DB.getCourses`, `DB.savePractice`/`DB.getPractice`. |
| `src/components/study/PracticeMode.jsx` | Replace `DB.savePractice`. |
| `src/screens/ProfileScreen.jsx` | Replace `DB.savePractice`. |
| `src/App.jsx` | Replace `DB.resetAll` with direct `resetAll`. |
| `src/components/ErrorDisplay.jsx` | Same. |

### 6.2 What Is NOT Changed

- **Schema** — no SQL migration files, no table changes
- **FSRS algorithm** — `fsrs.js` untouched
- **Extraction pipeline** — `extraction.js` unchanged
- **Skill loading** — `loadSkillsV2` in skills.js unchanged
- **Assignment system** — already on v2 tables
- **CIP taxonomy** — unchanged
- **UI components** — no visual changes (same data, different plumbing)

---

## 7. Recommended Implementation Order

1. **Add new methods to db.js** — `loadCoursesNested`, `saveCoursesNested`, `Chunks.updateContent`, `Chunks.delete`, `Sessions.getOrCreateCompat`, `Messages.appendBatch`, update `Courses.delete`
2. **Replace callers in phases** — one subsystem at a time:
   - a. Course CRUD (getCourses/saveCourses) — highest call count (15+), most impactful
   - b. Chunk data (saveDoc/getDoc/deleteChunk) — 5 callers, straightforward
   - c. Chat/messages — 5 callers, needs session ID threading
   - d. Journal — 5 callers, similar to chat
   - e. Practice sets — 10 callers, key change is v1 skillId → v2 subSkillId
   - f. Profile (last) — most complex, depends on CEO decision
3. **Delete DB object** — after all callers migrated
4. **Settings cleanup** — startup task to delete remaining v1 keys

---

## 8. Open Decisions

### CEO Decision Required

**Profile history entries:** Drop (option A) or migrate to session_events (option B)?

- **Option A (recommended):** Drop history. Only preserve "last rating" in `fitness` JSON. ~0 migration code. No consumer for full history.
- **Option B:** Migrate to session_events. ~30 lines. Preserves audit trail that no one reads.

**Impact of decision:** Affects §4 implementation only. All other sections are independent of this choice.
