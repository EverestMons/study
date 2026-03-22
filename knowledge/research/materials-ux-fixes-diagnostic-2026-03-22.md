# Materials UX Fixes — Diagnostic Report
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## Issue 1: Reclassify Uploaded Materials

### (a) Where is `classification` stored?

Yes — on the `materials` table in the DB.

- **Column:** `classification` (TEXT, nullable)
- **Insert:** `db.js:1088` — `INSERT INTO materials (..., classification, ...) VALUES (...)`
- **Read:** Used throughout the codebase as `mat.classification`

### (b) Existing update method?

**Yes — `Materials.update()` already supports it.** `db.js:1096-1112`:

```javascript
async update(id, fields) {
  const allowed = ['label', 'classification', 'file_type', ...];
  // builds SET clause from allowed fields
}
```

Reclassifying is a single call: `Materials.update(materialId, { classification: "textbook" })`. No new DB method needed.

### (c) Where is the expanded material detail rendered?

**`MaterialsScreen.jsx:137`** — `renderExpandedDetail(mat)` function.

- Shows: classification badge (`CLS_ABBR[mat.classification]` at line 174), trust signals (`trust.clsLabel` at line 179), section count, word count, image count, OCR status
- **Currently displays classification as a read-only badge** (36x36 rounded box with abbreviation, e.g., "Tx" for textbook)
- **Best place to add reclassify control:** Inside the expanded header area (lines 172-193), near the classification badge. Could add a dropdown or pill buttons below the material name, or make the badge itself clickable to cycle/select classification.

The trust label at line 179 (`trust.clsLabel`) also shows the classification as text (e.g., "Textbook", "Notes"). This would need to update reactively.

### (d) Downstream effects of changing classification

**Yes — classification affects 3 downstream systems:**

1. **Chunker split levels** — `chunker.js:18-27`: `SPLIT_LEVELS` map determines heading-level splitting.
   - `textbook: 2` (split at H2), `assignment: 1` (split at top-level), `syllabus: 99` (no split), `slides: 99`, etc.
   - **Impact:** Changing classification after chunking does NOT retroactively re-chunk. Existing chunks persist. Only affects future re-chunking if the material is re-processed.

2. **Extraction binding quality scores** — `extraction.js:2126-2130`: `CLASS_SCORES` map.
   - `textbook: 15, lecture: 12, notes: 9, slides: 6, reference: 3, assignment: 3`
   - **Impact:** Reclassifying changes the quality score of existing bindings. However, `rankBindingsForFacet()` (line 2171) queries classification from the materials table via JOIN at runtime, so scores update automatically after reclassification.

3. **Extraction prompt** — `extraction.js:308-345`: The extraction prompt does NOT reference classification directly. It uses structural analysis (bold terms, equations, code blocks) instead. **No impact.**

4. **MaterialsScreen grouping** — `MaterialsScreen.jsx:74-80`: Materials are grouped by `mat.classification`. Reclassifying moves the material to a different visual group immediately.

5. **Image count labels** — `MaterialsScreen.jsx:182,599`: Uses classification to choose label text ("slides" vs "pages" vs "images"). Updates reactively.

**Summary:** Reclassifying is safe. The only concern is that existing chunks were split at the old classification's heading level, but this is cosmetic — the content is the same, just split differently. Optionally, a "re-extract" could be offered after reclassification, but it's not required.

---

## Issue 2: Extraction Progress Visibility

### (a) Where is extraction progress displayed?

**`src/components/ExtractionProgress.jsx`** — a fixed-position floating bar at the bottom of the screen.

- **Rendered in:** `ScreenRouter.jsx:103` — `{bgExtraction && screen !== "materials" && <ExtractionProgress />}`
- **Key:** It is **intentionally hidden on MaterialsScreen** (`screen !== "materials"` guard). The rationale is that MaterialsScreen has its own inline progress display per material card.

### (b) What state drives it?

- `bgExtraction` — object with `{ materials: [...] }` array, each material has a `status` field (`extracting`, `done`, `skipped`, `error`, `awaiting_decision`)
- `status` — general status text string
- `extractionCancelledRef` — ref for cancel button
- `setScreen` — used to navigate to MaterialsScreen on click

### (c) Why does it only show when clicking notifications?

It doesn't "only show when clicking notifications" — it shows as a **fixed bottom bar on any screen except MaterialsScreen** whenever `bgExtraction` is truthy (Phase 2 background extraction is running).

The likely confusion: when the user is already on MaterialsScreen, the floating bar is hidden. They see per-card progress inline instead (the `renderExpandedDetail` function shows progress bars per material at lines 205-229). But if they navigate away from MaterialsScreen, the floating bar appears.

**The CEO's issue is likely:** The inline per-material progress on MaterialsScreen is only visible when a card is expanded. If no card is expanded, there's no visible progress indicator on MaterialsScreen itself.

### (d) What would need to change for inline progress on MaterialsScreen?

Two options:

**Option A — Always-visible summary bar at top of materials list.** Add a compact progress summary above the material groups in MaterialsScreen when `bgExtraction` is active. Show: overall progress (N/M materials done), current material name, cancel button. Similar to ExtractionProgress but rendered inline, not fixed-position.

**Option B — Remove the `screen !== "materials"` guard.** Let ExtractionProgress show on MaterialsScreen too. Downside: it overlaps with the inline per-card progress, creating redundancy.

**Recommended: Option A** — a compact inline progress bar at the top of MaterialsScreen's material list, only visible during active extraction. This gives the CEO what they want without duplication.

---

## Issue 3: Duplicate Material Handling

### (a) Where is duplicate detection happening?

**Two separate duplicate detection paths:**

1. **Pre-upload client-side filter** — `StudyContext.jsx:408-421`, `filterDuplicates()`:
   - Compares `f.name` against existing `files` staging list and `active.materials` names
   - Triggered on drag-and-drop (`onDrop`, line 430) and file input
   - **Detection method:** Exact filename string match (`existingNames.has(f.name)`)

2. **Database-level dedup during store** — `skills.js:64-82`, inside `storeAsChunks()`:
   - Calls `Materials.findByFilename(courseId, file.name)` (db.js:1135)
   - If found, returns the existing material with `_deduplicated: true` flag
   - **Detection method:** `original_filename` column match in DB

### (b) What currently happens when a duplicate is detected?

**Path 1 (client-side):** `addNotif("warn", "Skipped duplicate: " + f.name)` — a notification toast. The file is silently excluded from the staging list.

**Path 2 (DB-level):** Material is returned with `_deduplicated: true`. Then in `StudyContext.jsx:1406-1408`:
```javascript
const dedupNames = newMeta.filter(m => m._deduplicated).map(m => m.name);
if (dedupNames.length > 0) {
  addNotif("warn", "Skipped duplicate(s): " + dedupNames.join(", "));
}
```
Another notification toast. The material is excluded from `trulyNew` (line 1410).

**Both paths use notifications, not modals.**

### (c) Where in the flow does the check occur?

1. **Client-side:** `StudyContext.jsx:408` — `filterDuplicates(newFiles)` function, called at line 430 (onDrop) and line 628 (file input handler after staging screen parse)
2. **DB-level:** `skills.js:64` — first check inside `storeAsChunks()`, called from `StudyContext.jsx:1391` during Phase 1 upload

### (d) What information is available at the duplicate detection point?

**Path 1 (client-side):**
- `f.name` — filename of the dropped/selected file
- `active.materials` — list of all existing materials in the course (has `name`, `id`, `classification`)
- Does NOT know the existing material's classification or other metadata

**Path 2 (DB-level):**
- `existing` — full material row from DB (`id`, `label`, `classification`, `file_type`, `course_id`, `original_filename`, etc.)
- `file` — the new file being uploaded (has `name`, `type`, `classification`, `content`)
- `existingChunks` — all chunks of the existing material

**Both paths have enough info for a modal.** The client-side path knows at minimum the filename; the DB-level path knows everything about the existing material. The modal could show: "Material already uploaded" with the existing material's name, classification, and upload date, plus options like "Replace", "Skip", or "Upload as new".

---

## Summary

| Issue | Key Finding | Effort |
|---|---|---|
| 1. Reclassify | `Materials.update()` already supports it. Add UI control in `renderExpandedDetail`. Downstream effects are minimal and auto-updating. | Small — UI-only change in MaterialsScreen |
| 2. Extraction progress | Hidden on MaterialsScreen by design (`screen !== "materials"` guard). Inline per-card progress exists but only when expanded. Need a summary bar at top of materials list. | Small — new summary component at top of MaterialsScreen |
| 3. Duplicate handling | Two detection paths (client-side + DB-level), both use notification toasts. Need to replace with a modal. Client-side path (pre-staging) is the primary one to target. | Small-medium — replace `addNotif` with modal state + component |
