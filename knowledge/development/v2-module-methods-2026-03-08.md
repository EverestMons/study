# Batch B Foundation — Development Log
**Date:** 2026-03-08
**Role:** Study Developer
**Blueprint:** `knowledge/architecture/v1-v2-unification-2026-03-08.md`
**Build:** `npm run build` PASS (1.31s) — both steps verified

---

## Summary

**Step B.2:** Added 5 new methods and updated 1 existing method across 4 v2 modules in `src/lib/db.js`. These methods provide the v2 equivalents needed to replace V1 compat shims during the contract phase.

**Step B.3:** Added 2 standalone exported utility functions (`loadCoursesNested`, `saveCoursesNested`) that lift the `DB.getCourses`/`DB.saveCourses` logic out of the V1 compat object into proper standalone exports.

---

## File Modified

| File | Before | After | Delta | Changes |
|------|--------|-------|-------|---------|
| `src/lib/db.js` | 1,862 | 1,965 | +103 | Step B.2: 5 new methods + 1 updated. Step B.3: 2 standalone functions. |

---

## Methods Added/Updated

### 1. `Chunks.updateContent(id, content)` — NEW

**Location:** After `Chunks.getContent` (line ~756)

```js
async updateContent(id, content) {
  const c = typeof content === 'string' ? content : JSON.stringify(content);
  await db.execute('UPDATE chunks SET content = ?, updated_at = ? WHERE id = ?', [c, now(), id]);
}
```

**Replaces:** `DB.saveDoc(cid, chunkId, doc)` — drops unused `cid` parameter.

### 2. `Chunks.delete(id)` — NEW

**Location:** After `Chunks.markFailedBatch` (line ~855)

```js
async delete(id) {
  await db.execute('DELETE FROM chunks WHERE id = ?', [id]);
}
```

**Replaces:** `DB.deleteChunk(cid, chunkId)` — drops `cid` parameter and dead `v1_chunk_skills` settings cleanup. CASCADE handles `chunk_skill_bindings`, `chunk_fingerprints`, `chunk_media`.

### 3. `Courses.delete(id)` — UPDATED

**Location:** Existing method (line ~270)

Added v1 settings cleanup before CASCADE delete:
```js
await db.execute("DELETE FROM settings WHERE key LIKE ?", [`v1_%:${id}%`]);
```

**Why:** The V1 compat `DB.deleteCourse` had this cleanup. Moving it to the v2 module ensures settings are cleaned regardless of which API is used to delete a course.

### 4. `Sessions.getOrCreateCompat(courseId)` — NEW

**Location:** After `Sessions.pause` (line ~1358)

```js
async getOrCreateCompat(courseId) {
  // Find existing active session for this course
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

**Replaces:** The `v1_chat_session:{cid}` settings key pattern used by `DB.saveChat`, `DB.getChat`, `DB.saveJournal`. Queries sessions table directly instead of maintaining a parallel settings key.

### 5. `Messages.appendBatch(sessionId, messages)` — NEW

**Location:** After `Messages.create` (line ~1450)

```js
async appendBatch(sessionId, messages) {
  return withTransaction(async (db) => {
    for (const msg of messages) {
      await db.execute(
        'INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, msg.role, msg.content, msg.inputMode || null,
         msg.metadata ? ... : JSON.stringify({ thinking: msg.thinking, skills: msg.skills }),
         now()]
      );
    }
  });
}
```

**Replaces:** `DB.saveChat(cid, messages)` which did destructive delete-all-then-reinsert. `appendBatch` only inserts new messages — callers will need to track what's already persisted.

---

## Already Existing (No Changes Needed)

| Method | Status | Notes |
|---|---|---|
| `Chunks.getContent(id)` | Already exists (line 751) | Returns raw content string |
| `PracticeSets.get(subSkillId, sessionId)` | Already exists (line 1489) | Returns parsed `{ data }` |
| `PracticeSets.upsert(subSkillId, data, sessionId)` | Already exists (line 1499) | INSERT or UPDATE |
| `JournalEntries.getByCourse(courseId)` | Already exists (line 1454) | Returns rows ordered by created_at DESC |
| `JournalEntries.create(...)` | Already exists (line 1469) | Single insert with JSON stringification |

---

## Step B.3 — Nested Course Loader & Saver

### 6. `loadCoursesNested()` — NEW standalone export

**Location:** Before `resetAll` (line ~1570)

Same logic as `DB.getCourses()`: queries courses, nests materials with chunks, applies property aliases (`mat.name = mat.label`, `mat.type = mat.file_type`, `course.created = course.created_at`). Chunk content NOT loaded — use `Chunks.getContent(id)` on demand.

### 7. `saveCoursesNested(courses)` — NEW standalone export

**Location:** After `loadCoursesNested` (line ~1600)

Same logic as `DB.saveCourses()`: upserts courses + materials + chunks from nested object. Uses `withTransaction`. Accepts both v1 field names (`name`/`type`/`created`) and v2 field names (`label`/`file_type`/`created_at`). Chunk content NOT written — use `Chunks.updateContent(id, content)` separately.

---

## What Was NOT Changed

- No schema changes — all methods target existing tables
- No V1 compat shims removed yet (that's the contract phase)
- Nothing calls the new functions yet — old code still works
- FSRS algorithm unchanged
- Extraction pipeline unchanged
- No UI changes
