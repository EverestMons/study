# Batch C — Course Data Path Replacement
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (1.30s) — all steps verified

---

## Summary

Replaced all V1 compat course-data-path calls across 6 files. 4 V1 methods fully eliminated from application code; 1 confirmed already unused.

---

## Steps

### C.1 — Replace DB.getCourses / DB.saveCourses

**Call sites replaced:** 13× `DB.getCourses()` → `loadCoursesNested()`, 8× `DB.saveCourses(...)` → `saveCoursesNested(...)`

| File | getCourses | saveCourses | Import change |
|------|:--:|:--:|---|
| `StudyContext.jsx` | 4 | 4 | Added `loadCoursesNested, saveCoursesNested`; kept `DB` |
| `MaterialsScreen.jsx` | 4 | 3 | `{ DB }` → `{ loadCoursesNested, saveCoursesNested }` |
| `MaterialsPanel.jsx` | 3 | 1 | `{ DB }` → `{ loadCoursesNested, saveCoursesNested }` |
| `ModePicker.jsx` | 1 | 0 | Added `loadCoursesNested`; kept `DB` (getPractice/savePractice) |
| `ChunkPicker.jsx` | 1 | 0 | `{ DB }` → `{ loadCoursesNested }` |

### C.2 — Replace DB.saveDoc / DB.getDoc

| File | Changes |
|------|---------|
| `StudyContext.jsx` | Added `Chunks` to import. 2× `DB.saveDoc(cid, chunkId, doc)` → `Chunks.updateContent(chunkId, ...)` |
| `skills.js` | Removed `DB` from import. 2× `DB.getDoc` → `Chunks.getContent` + JSON unwrap. 3× comment updates. |

Key detail: `DB.getDoc` returned parsed JSON (`{content:"..."}`), `Chunks.getContent` returns raw string. Added JSON-unwrap logic matching the existing v2 path pattern (lines 122-128).

### C.3 — Replace DB.deleteChunk / DB.deleteCourse

| File | Changes |
|------|---------|
| `StudyContext.jsx` | `DB.deleteCourse(id)` → `Courses.delete(id)` (line 968) |
| `StudyContext.jsx` | `DB.deleteChunk(active.id, ch.id)` → `Chunks.delete(ch.id)` (line 1077) |

### C.4 — Replace DB.getChunkSkills

**Result:** No call sites found. Already fully migrated during extraction v2 work. Only the V1 compat shim definition remains in db.js (with stale comment referencing "App.jsx section panel").

---

## V1 Methods Eliminated from Application Code

| V1 Method | Replacement | Call sites removed |
|---|---|:--:|
| `DB.getCourses()` | `loadCoursesNested()` | 13 |
| `DB.saveCourses(courses)` | `saveCoursesNested(courses)` | 8 |
| `DB.saveDoc(cid, chunkId, doc)` | `Chunks.updateContent(chunkId, ...)` | 2 |
| `DB.getDoc(cid, chunkId)` | `Chunks.getContent(chunkId)` | 2 |
| `DB.deleteChunk(cid, chunkId)` | `Chunks.delete(chunkId)` | 1 |
| `DB.deleteCourse(cid)` | `Courses.delete(id)` | 1 |
| `DB.getChunkSkills(cid, chunkId)` | *(already unused)* | 0 |

**Total:** 27 call sites replaced, 1 confirmed dead code.

---

## Files Modified

| File | Lines changed |
|------|:--:|
| `src/StudyContext.jsx` | ~10 (import + 5 call sites) |
| `src/screens/MaterialsScreen.jsx` | ~8 (import + 7 call sites) |
| `src/components/study/MaterialsPanel.jsx` | ~5 (import + 4 call sites) |
| `src/components/study/ModePicker.jsx` | ~2 (import + 1 call site) |
| `src/components/study/ChunkPicker.jsx` | ~2 (import + 1 call site) |
| `src/lib/skills.js` | ~12 (import + 2 call sites + JSON unwrap + comments) |
