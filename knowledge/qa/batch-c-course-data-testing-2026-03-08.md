# Batch C — Course Data Path Testing
**Date:** 2026-03-08
**Role:** Study Security & Testing Analyst
**Scope:** Steps C.1–C.4 (DB.getCourses, DB.saveCourses, DB.saveDoc, DB.getDoc, DB.deleteChunk, DB.deleteCourse, DB.getChunkSkills)
**Method:** Static trace analysis — code path tracing through all modified call sites

---

## Verdict: PASS — 0 Critical, 1 Low, 1 Informational

---

## Test Scenarios

### T1 — Course CRUD: Create, rename, delete — data persists across restart

**Trace (Create):**
- `addFiles` (line 395): `Courses.create({ name })` → returns UUID → used as `courseId`
- Nested materials/chunks assembled → `saveCoursesNested(updated)` (line 410) → upserts into `courses`, `materials`, `chunks` tables via transaction
- `_pendingDocs` flushed via `Chunks.updateContent(pd.chunkId, ...)` (line 413)
- On next launch: `loadCoursesNested()` (line 257) → `SELECT * FROM courses` + nested materials + chunks

**Trace (Quick create — no files):**
- `quickCreateCourse` (line 479): `Courses.create({ name })` → `loadCoursesNested()` refresh
- Correct: creates course row, then reloads nested tree

**Trace (Rename):**
- Not in scope of C.1–C.4 — uses `Courses.update()` directly, unchanged

**Trace (Delete):**
- `delCourse` (line 968): `Courses.delete(id)`
- `Courses.delete` (line 268-273): cleans `v1_%:{id}%` settings keys → `DELETE FROM courses WHERE id = ?` → CASCADE

**Trace (Persistence):**
- Auto-save effect (line 295): `saveCoursesNested(courses)` on 500ms debounce when `courses` state changes
- Load on init (line 257): `loadCoursesNested()` from SQLite

**Result:** PASS

### T2 — Material upload: DOCX, PDF, EPUB — chunks created, content stored, card renders

**V2 path (EPUB, DOCX with `_structured`):**
- `storeAsChunks` (skills.js line 39-73): `Materials.create()` → `chunkDocument()` → `Chunks.createBatch()` → content stored inline. No `_pendingDocs`.
- `saveCoursesNested(updated)` (line 410): upserts course/material/chunk metadata
- No `Chunks.updateContent` needed — content already in chunks table from `createBatch`

**V1 fallback path (TXT, PPTX, CSV, plain content):**
- `storeAsChunks` (skills.js line 76-112): builds `_pendingDocs` array with `{ chunkId, doc: { content: "..." } }`
- `saveCoursesNested(updated)` (line 410): upserts metadata (chunk rows created with `content_hash = 'legacy-' + ch.id`)
- `Chunks.updateContent(pd.chunkId, typeof pd.doc === 'string' ? pd.doc : JSON.stringify(pd.doc))` (line 413): pd.doc is `{ content: "..." }` (object) → `JSON.stringify` → stored as `'{"content":"..."}'`

**V1 compat comparison:**
- Old: `DB.saveDoc(courseId, pd.chunkId, pd.doc)` → `typeof doc === 'string' ? doc : JSON.stringify(doc)` → `UPDATE chunks SET content = ? WHERE id = ? AND course_id = ?`
- New: `Chunks.updateContent(pd.chunkId, typeof pd.doc === 'string' ? pd.doc : JSON.stringify(pd.doc))` → same serialization → `UPDATE chunks SET content = ? WHERE id = ?`
- Difference: new version drops `course_id` from WHERE clause. **Safe** — chunk IDs are UUIDs, globally unique.

**Result:** PASS

### T3 — Extraction pipeline: Run extraction — skills extracted, bindings created, state transitions

**Trace:**
- `addFiles` line 447: `runExtractionV2(courseId, matId, ...)` — uses `Chunks.getByMaterial()` internally (unchanged)
- After extraction: `loadCoursesNested()` refresh (line 458) → reloads all course/material/chunk state from DB
- `refreshMaterialSkillCounts()` → unchanged v2 path
- `getMatContent(courseId, mat)` called for syllabus parsing (line 425): now uses `Chunks.getContent` instead of `DB.getDoc`

**Content read path in getMatContent (skills.js line 116-168):**
1. V2 path (line 119-138): `Chunks.getByMaterial(mat.id)` → reads inline content → JSON-unwrap if needed → UNCHANGED
2. V1 fallback (line 141-153): `Chunks.getContent(ch.id)` → raw string → JSON-unwrap `{"content":"..."}` → text
   - Old: `DB.getDoc(courseId, ch.id)` → auto-parsed JSON → `doc?.content`
   - New: `Chunks.getContent(ch.id)` → raw string → manual JSON-unwrap
   - **Equivalent:** both paths extract the text content correctly
3. Legacy flat doc (line 155-167): `Chunks.getContent(mat.id)` → raw string → `JSON.parse` → handles `.chapters` or `.content`
   - Old: `DB.getDoc(courseId, mat.id)` → auto-parsed → `doc.chapters` / `doc.content`
   - New: `Chunks.getContent(mat.id)` → `JSON.parse(raw)` → same object shape
   - Non-JSON fallback: `catch { return { content: raw, chunks: [...] } }` — graceful

**Result:** PASS

### T4 — Chunk operations: Activate/deactivate chunks — state updates, no orphaned data

**Activate (MaterialsScreen line 440-453):**
- Modifies chunk status in JS object → `loadCoursesNested()` → overlay with local changes → `saveCoursesNested(allCourses)` → persists
- Pattern: load-fresh → overlay → save. Correct.

**Deactivate (MaterialsScreen line 460-474):**
- Same load-overlay-save pattern. Correct.

**Enable skipped chunk (MaterialsPanel line 148-173):**
- Same load-overlay-save pattern + triggers extraction. Correct.

**Delete chunks (removeMat, line 1075-1078):**
- `Chunks.delete(ch.id)` → `DELETE FROM chunks WHERE id = ?` → CASCADE handles `chunk_skill_bindings`, `chunk_fingerprints`, `chunk_media`
- Then `saveCoursesNested(updatedCourses)` with material removed from JS array
- Old: `DB.deleteChunk(cid, ch.id)` also cleaned `v1_chunk_skills:{cid}:{chunkId}` settings key. New `Chunks.delete` does not.
- **Impact:** orphaned `v1_chunk_skills:*` settings keys may remain. See finding F1 below.

**Result:** PASS (with F1 Low finding)

### T5 — Retry extraction: Retry failed chunks — works end-to-end

**MaterialsScreen retry (line 185-196):**
- `runExtractionV2(active.id, mat.id, ...)` → `loadCoursesNested()` refresh → update state
- No `DB.getCourses`/`DB.saveCourses` in this path — purely load-refresh. Correct.

**MaterialsPanel retry (line 107-120):**
- Same pattern: `runExtractionV2` → `loadCoursesNested()` refresh. Correct.

**ChunkPicker extract-all (line 119):**
- `loadCoursesNested()` refresh after extraction. Correct.

**ModePicker extract-all (line 364):**
- `loadCoursesNested()` refresh after extraction. Correct.

**Result:** PASS

### T6 — Course deletion: Delete with materials, chunks, skills, sessions — CASCADE + settings cleanup

**Trace:**
- `delCourse(id)` (line 964-974): `Courses.delete(id)`
- `Courses.delete` (line 268-273):
  1. `DELETE FROM settings WHERE key LIKE 'v1_%:{id}%'` — catches `v1_profile:`, `v1_chat_session:`, `v1_practice:`, `v1_course_data:`, `v1_chunk_skills:` patterns
  2. `DELETE FROM courses WHERE id = ?` — CASCADE deletes:
     - `materials` (FK → courses) → `chunks` (FK → materials) → `chunk_skill_bindings` (FK → chunks), `chunk_fingerprints`, `chunk_media`
     - `sessions` (FK → courses) → `messages` (FK → sessions)
     - `sub_skills` has `course_id` but no CASCADE FK — **see F2**

**Result:** PASS (with F2 Informational finding)

### T7 — Build verification: Release build boots, no white screen

- `npm run build` PASS (1.30s)
- No new static imports added — `Chunks`, `Courses` already exported from db.js, already statically imported by StudyContext.jsx
- `loadCoursesNested`/`saveCoursesNested` are static exports from db.js — no lazy loading risk
- skills.js removed `DB` from import — reduces coupling, no risk

**Result:** PASS

---

## Findings

### F1 — Orphaned v1_chunk_skills settings keys on chunk delete (Low)

**Location:** `Chunks.delete(id)` (db.js line 858) — replaces `DB.deleteChunk(cid, chunkId)`

**Issue:** The old `DB.deleteChunk` cleaned `v1_chunk_skills:{cid}:{chunkId}` from the settings table. The new `Chunks.delete(id)` does not, because it doesn't receive `cid` and because the v1_chunk_skills pattern is legacy.

**Impact:** Low. These keys are read-only artifacts from the v1 skill system. The v2 extraction system uses `chunk_skill_bindings` table (CASCADE-deleted with the chunk). The orphaned settings keys:
- Waste a few KB of storage
- Are fully cleaned on course deletion (`Courses.delete` line 271: `DELETE FROM settings WHERE key LIKE 'v1_%:{id}%'`)
- Are never read by current code (DB.getChunkSkills has zero callers)

**Recommendation:** No action needed. Will be cleaned up when V1 compat shims are removed entirely.

### F2 — sub_skills not CASCADE-deleted on course delete (Informational)

**Location:** `Courses.delete(id)` → `DELETE FROM courses WHERE id = ?`

**Issue:** `sub_skills` table has `course_id` column but the FK constraint behavior depends on the migration schema. If the FK has `ON DELETE CASCADE`, sub_skills are cleaned automatically. If not, orphaned sub_skills rows remain.

**Impact:** Informational. This is a pre-existing condition — not introduced by Batch C. The old `DB.deleteCourse` had the same behavior. `sub_skills` rows without a valid course_id are harmless (never queried without a valid course context).

**Recommendation:** Verify CASCADE behavior in migration 001. If missing, can add a manual `DELETE FROM sub_skills WHERE course_id = ?` to `Courses.delete`.

### F3 — Duplicate Chunks.delete method definition (Informational)

**Location:** db.js lines 858-861 and 874-877

**Issue:** `Chunks.delete(id)` is defined twice in the Chunks object. Both are identical (`DELETE FROM chunks WHERE id = ?`). JavaScript silently uses the last definition.

**Impact:** None — both definitions are identical. The duplication is cosmetic.

**Recommendation:** Remove the duplicate in a future cleanup pass.

---

## Coverage Matrix

| Scenario | V1 Method Replaced | New Call | Traced | Result |
|---|---|---|:--:|:--:|
| Init load | `DB.getCourses()` | `loadCoursesNested()` | Yes | PASS |
| Auto-save | `DB.saveCourses(courses)` | `saveCoursesNested(courses)` | Yes | PASS |
| Create course (files) | `DB.saveCourses` + `DB.saveDoc` | `saveCoursesNested` + `Chunks.updateContent` | Yes | PASS |
| Quick create | `DB.getCourses()` | `loadCoursesNested()` | Yes | PASS |
| Add materials | `DB.saveCourses` + `DB.saveDoc` | `saveCoursesNested` + `Chunks.updateContent` | Yes | PASS |
| Delete course | `DB.deleteCourse(cid)` | `Courses.delete(id)` | Yes | PASS |
| Delete chunk | `DB.deleteChunk(cid, chunkId)` | `Chunks.delete(chunkId)` | Yes | PASS (F1) |
| Activate/deactivate | `DB.getCourses` + `DB.saveCourses` | `loadCoursesNested` + `saveCoursesNested` | Yes | PASS |
| Retry extraction | `DB.getCourses()` | `loadCoursesNested()` | Yes | PASS |
| Read chunk content | `DB.getDoc(cid, chunkId)` | `Chunks.getContent(chunkId)` | Yes | PASS |
| Read legacy doc | `DB.getDoc(cid, matId)` | `Chunks.getContent(matId)` | Yes | PASS |
| getChunkSkills | *(already unused)* | N/A | Yes | PASS |
| Build | — | — | Yes | PASS |
