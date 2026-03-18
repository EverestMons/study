# Bug Investigation: Duplicate Materials on Extraction Failure

**Date:** 2026-03-17
**Routed by:** CEO via Planner
**Agent:** Study Developer
**Priority:** Bug fix — prevents data duplication

---

## Problem

When a material extraction fails (or is retried), the system creates a duplicate material record instead of retrying extraction on the original material. This is visible in the Assignments section of the Course Homepage where the same `.docx` file (e.g., "Homework 7.docx", "Project 1.docx") appears multiple times with different status indicators (queued, complete, needs review).

**Screenshot evidence:** 5 assignment cards shown for what should be 2 unique assignments. "Homework 7.docx" appears 3 times, "Project 1.docx" appears 2 times.

---

## Suspected Root Cause

In `src/lib/skills.js`, `storeAsChunks()` always calls `Materials.create()` which generates a fresh `uuid()` (line 65). There is no check for whether a material with the same filename already exists in the course.

In `src/StudyContext.jsx`, `addMats()` (line 1136) iterates through `validFiles` and calls `storeAsChunks()` for each one, then pushes ALL results into `newMeta` which gets appended to `active.materials`. No dedup check against existing materials.

The likely scenario:
1. User uploads "Homework 7.docx" → `storeAsChunks` creates material A with new UUID → extraction runs → fails
2. User re-uploads same file (or some retry/re-process path triggers) → `storeAsChunks` creates material B with NEW UUID → now two materials exist for the same file
3. `saveCoursesNested` uses `ON CONFLICT(id) DO UPDATE` — but since each material gets a new UUID, there's never a conflict

---

## Investigation Tasks

1. **Confirm the duplication path.** Trace exactly how duplicate materials are created:
   - Is it from re-uploading the same file via the UI?
   - Is it from the syllabus auto-trigger creating assignment materials that match existing uploads?
   - Is it from the extraction retry loop creating new materials instead of retrying on existing ones?
   - Check if `parseSyllabus` → `Assignments.create` is creating assignment records that then get materialized as duplicate material records somewhere

2. **Check `storeAsChunks` for filename dedup.** Before `Materials.create()`, there should be a check:
   - Does a material with the same `original_filename` (or `label`) already exist for this `courseId`?
   - If yes, should it update/retry the existing material instead of creating a new one?

3. **Check `addMats` for dedup.** Before pushing to `newMeta`, does it check against `active.materials`?

4. **Check the assignment → material link.** When `parseSyllabus` creates placeholder assignments ("Homework 7", "Project 1") and the user later uploads the `.docx` file:
   - Does `findPlaceholderMatch` correctly link the upload to the placeholder?
   - Could the material be created twice — once as an upload material and once as an assignment-linked material?

5. **Fix the duplication.** Implement filename-based dedup:
   - In `storeAsChunks`: before `Materials.create()`, check if a material with the same `original_filename` exists for this courseId. If it does, decide: update the existing material's chunks (retry path) or skip (already processed).
   - In `addMats`: before processing, filter out files whose names match existing materials (unless the existing material is in a failed state, in which case retry).
   - Consider: should the dedup check be on `original_filename` or on `label` or on a content hash?

6. **Clean up existing duplicates.** Write a one-time cleanup query or function that identifies and removes duplicate materials within a course (keeping the one with the most complete extraction state).

---

## Files to Read

- `src/lib/skills.js` lines 52-101 — `storeAsChunks` function
- `src/lib/db.js` lines 1084-1094 — `Materials.create` (always generates new UUID)
- `src/lib/db.js` lines 2836-2865 — `saveCoursesNested` (ON CONFLICT on id, not filename)
- `src/StudyContext.jsx` lines 1136-1160 — `addMats` function (no dedup before push)
- `src/lib/syllabusParser.js` lines 240-260 — `parseSyllabus` assignment creation
- `src/lib/db.js` lines 1007-1030 — `Assignments.findPlaceholderMatch`
- `src/StudyContext.jsx` lines 1175-1200 — syllabus auto-trigger + assignment chunk marking

---

## Constraints

- Do NOT break existing material upload for new files — dedup should only prevent duplicates, not block legitimate new uploads
- Do NOT modify the extraction pipeline itself — this is a material-creation dedup issue, not an extraction issue
- Preserve existing test suite compatibility
- The fix should be safe for courses that already have duplicates — don't crash on existing data

---

## Output

Deposit findings + fix to: `knowledge/development/duplicate-material-bugfix-2026-03-17.md`

Include Output Receipt per specialist file format.
