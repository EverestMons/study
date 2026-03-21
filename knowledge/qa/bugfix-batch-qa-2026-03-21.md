# QA Report — Bugfix Batch (Black Screen, Phantom Slides, Assignment Decomposition)
**Date:** 2026-03-21 | **Build:** PASS

---

## 1A — Black Screen Fix

### Verification: MaterialsScreen study launch
- **`MaterialsScreen.jsx:268`** — "Study Available Skills" button now calls `enterStudy(active, "skills")` instead of broken direct setState
- **`MaterialsScreen.jsx:298`** — "Start Studying" button now calls `enterStudy(active, "skills")` instead of broken direct setState
- **Removed unused imports:** `focusContext`, `setFocusContext`, `sessionMode`, `setSessionMode`, `setPreviousScreen` — confirmed no other references in the file
- **Added `enterStudy`** to destructured imports from `useStudy()`

### Code path trace
1. User clicks "Start Studying" on MaterialsScreen → `enterStudy(active, "skills")`
2. `enterStudy` (StudyContext.jsx) → clears session state, creates new session, calls `selectMode("skills")`
3. `selectMode("skills")` → loads skills, sets `pickerData` → SkillPicker renders
4. This matches CourseHomepage's working pattern exactly

### Regression check
- No other navigation paths in MaterialsScreen were changed
- The "Review Skills" button, material expansion, chunk picker, retry extraction — all untouched
- `enterStudy` is a stable export from StudyContext (used by CourseHomepage)

**Result: PASS**

---

## 1B — Phantom Slide Guardrails

### Verification: extraction.js
- **`extraction.js:362`** — `figureReferences` schema now includes annotation: `"(only include if the figure content is described in text — do not reference stripped visuals)"`
- **`extraction.js:397-398`** — New RULES entry added at end of RULES section: warns against referencing stripped visuals, prohibits "as shown in the figure/slide/diagram" phrasing
- Template literal string properly terminated with closing backtick + semicolon on line 398
- Prompt structure intact — RULES section follows the existing bullet pattern

### Verification: study.js
- **`study.js:1635`** — "PHANTOM VISUAL GUARD" section added after IMAGE DISPLAY rules
- Content: prohibits "as shown on this slide" / "refer to the diagram" — instructs verbal-only description
- String properly terminated with closing `"` before `;`
- Located within the `buildSystemPrompt` return string, after the existing IMAGE DISPLAY section

### [SHOW_IMAGE] mechanism check
- `study.js:1286` — `buildImageCatalog` function unchanged
- `study.js:1702-1706` — `[SHOW_IMAGE]` regex extraction unchanged
- `study.js:1635` — IMAGE DISPLAY rules section unchanged (guardrail ADDED after, not within)
- No modifications to `renderMd` tag stripping in `theme.jsx`

### Prompt string integrity
- `extraction.js:buildInitialExtractionPrompt` — template literal opens at line 292, closes at line 398. Backtick-delimited. No unclosed quotes.
- `study.js:buildSystemPrompt` — double-quoted string with escaped inner quotes. `\"` escaping consistent. String terminates with `";` on line 1635. No syntax errors (confirmed by successful build).

**Result: PASS**

---

## 1C — Assignment Decomposition

### Verification: Gap 1 — Proactive decomposition

**In `runBackgroundExtraction` (StudyContext.jsx:581-596):**
- After extraction cleanup and course refresh, checks `allMats.some(m => m.classification === "assignment")`
- If assignment materials exist, loads skills via `loadSkillsV2(courseId)`
- If skills available, calls `decomposeAssignments(courseId, allMats, sk, setStatus)`
- Wrapped in try/catch — failure does not break extraction flow
- Status cleared after decomposition: `setStatus("")`
- Handles all 3 callers of `runBackgroundExtraction`: `createCourse`, `addMats`, `retryAllFailed`

**In `addMats` else branch (StudyContext.jsx:1435-1448):**
- When only assignments are uploaded (no extractable materials → `runBackgroundExtraction` not called)
- Filters `trulyNew` for assignment-classified materials
- Uses `active.materials.concat(trulyNew)` to pass ALL materials (existing + new)
- Loads skills via `loadSkillsV2` — only decomposes if skills exist
- Wrapped in try/catch

**Duplicate prevention — `db.js:998-1004` (`getPlaceholders`):**
- Changed from `source = 'syllabus' AND material_id IS NULL` to `WHERE course_id = ?`
- Now returns ALL assignments for the course, not just syllabus placeholders
- `findPlaceholderMatch` (line 1007) uses this to match by normalized title
- Re-decomposition now reuses existing assignment IDs instead of creating duplicates
- Safe: `findPlaceholderMatch` returns matches by title similarity — existing decomposition-sourced assignments will be matched and reused

### Verification: Gap 2 — Incremental selectMode guard

**`selectMode("assignment")` (StudyContext.jsx:903-908):**
- Old guard: `if (!Array.isArray(asgn) || asgn.length === 0)` — only-when-zero
- New guard: `needsDecomposition = !Array.isArray(asgn) || asgn.length === 0 || (hasAsgnMats && asgn.some(a => !a.questions || a.questions.length === 0))`
- Three triggers: (1) no assignments at all, (2) empty array, (3) assignment materials exist AND some assignments have zero questions (syllabus placeholders or incomplete decomposition)
- `hasAsgnMats` and `hasSkills` moved outside the guard (now computed before the `if`)
- Inner decomposition logic unchanged — same `decomposeAssignments` call, same enrichment, same sorting

### Existing decomposition paths — regression check

**CurriculumScreen.jsx:165:**
```js
await decomposeAssignments(active.id, active.materials || [], skills, function () {});
```
- Unchanged. Import at line 5 intact. Manual decompose button still works.

**ChunkPicker.jsx:132:**
```js
await decomposeAssignments(active.id, allMats, sk, setStatus);
```
- Unchanged. Import at line 5 intact. Re-extract flow still calls decomposition.

**Result: PASS**

---

## Build Verification
- `npm run build` — completed successfully (exit code 0)
- No compilation errors, no import resolution failures
- Chunk sizes within normal range

---

## Summary

| Fix | Status | Files Modified | Regression Risk |
|-----|--------|----------------|-----------------|
| 1A — Black screen | PASS | MaterialsScreen.jsx | Low — single function call change |
| 1B — Phantom slides | PASS | extraction.js, study.js | None — prompt text only |
| 1C — Assignment decomp | PASS | StudyContext.jsx, db.js | Low — additive logic, dedup via getPlaceholders |
