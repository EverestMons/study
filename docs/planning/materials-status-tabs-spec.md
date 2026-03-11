# Materials Status Tabs + Retry All — Dev Spec

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**Scope:** Small — single screen enhancement, one new DB method

---

## CEO Decisions

1. **Status tabs:** Filter materials by processing state
2. **Retry All:** Re-queue error-state chunks only — do NOT reset permanently failed (failCount >= 3)
3. **No skip/dismiss option** for non-extractable materials (deferred)

---

## Feature 1: Status Filter Tabs

**Location:** `src/screens/MaterialsScreen.jsx`

Add a tab bar above the materials list (below the "Add Materials" section, above "Course Materials (N)").

**Tabs:**

| Tab | Filter Logic | Badge Count |
|---|---|---|
| **All** | No filter — show everything | `active.materials.length` |
| **Ready** | `matState === "ready"` | count of ready materials |
| **Needs Attention** | `matState` is `"incomplete"`, `"partial"`, or has chunks with `status === "error"` | count |
| **Failed** | `matState === "critical_error"` | count |

**Behavior:**
- Default tab: "All"
- Tab shows count badge
- Clicking a tab filters the materials list
- If a tab has 0 items, still show it but grayed out / disabled
- Tab state resets when navigating away from MaterialsScreen

**Implementation:**
- Add `materialFilter` state: `"all" | "ready" | "attention" | "failed"`
- Compute counts from `active.materials` using existing `getMaterialState()`
- Filter `active.materials.map(...)` by the selected tab before rendering

**Lines changed:** ~30-40

---

## Feature 2: Retry All Button

**Location:** `src/screens/MaterialsScreen.jsx` (UI), `src/StudyContext.jsx` (handler)

**Button placement:** Shown in the tab bar area when "Needs Attention" tab is active and there are retryable materials. Alternatively, always visible as a floating action when any material has error-state chunks.

**What it does:**
1. Find all materials in the course that have chunks with `status === "error"` (NOT `"failed"`)
2. Loop through each such material sequentially
3. Call `runExtractionV2(courseId, matId, callbacks)` for each — same as the per-material retry button
4. Show progress: "Retrying 1/4: [material name]..."
5. After all retries, refresh course data

**What it does NOT do:**
- Does NOT reset permanently failed chunks (failCount >= 3, status === "failed")
- Does NOT retry materials where ALL chunks are either "extracted" or "failed" (nothing retryable)

**Implementation:**

**StudyContext.jsx** — new `retryAllFailed` function:
```javascript
const retryAllFailed = async () => {
  if (globalLock || !active) return;
  // Find materials with error-state chunks
  const retryable = active.materials.filter(mat => {
    const chunks = mat.chunks || [];
    return chunks.some(c => c.status === "error");
  });
  if (retryable.length === 0) { addNotif("info", "Nothing to retry."); return; }
  
  setGlobalLock({ message: "Retrying failed extractions..." });
  let totalRetried = 0;
  try {
    for (let i = 0; i < retryable.length; i++) {
      const mat = retryable[i];
      setStatus(`Retrying ${i + 1}/${retryable.length}: ${mat.name}...`);
      setProcessingMatId(mat.id);
      try {
        await runExtractionV2(active.id, mat.id, {
          onStatus: setStatus,
          onNotif: addNotif,
          onChapterComplete: (ch, cnt) => setStatus(`${mat.name} — ${ch}: ${cnt} skills`),
        });
        totalRetried++;
      } catch (e) {
        addNotif("error", `Retry failed for ${mat.name}: ${e.message}`);
      }
    }
    // Refresh
    const refreshed = await loadCoursesNested();
    const uc = refreshed.find(c => c.id === active.id);
    if (uc) { setCourses(refreshed); setActive(uc); }
    refreshMaterialSkillCounts(active.id);
    addNotif("success", `Retried ${totalRetried} material${totalRetried !== 1 ? "s" : ""}.`);
  } finally {
    setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null);
  }
};
```

Expose `retryAllFailed` via context.

**MaterialsScreen.jsx** — button in tab bar:
```jsx
{materialFilter === "attention" && attentionCount > 0 && (
  <button onClick={retryAllFailed} disabled={!!globalLock}
    style={{ ... amber retry styling ... }}>
    Retry All ({attentionCount})
  </button>
)}
```

**Lines changed:** ~40 in StudyContext, ~20 in MaterialsScreen

---

## Bug Fix: Syllabus/Schedule Files Sent to Skill Extraction

**Problem:** Files classified as `"syllabus"` go through `parseSyllabus()` correctly (extracting course schedule, assessments, grading weights into `course_schedule` and `course_assessments` tables). But they also get sent to `runExtractionV2()` for skill extraction, which fails because schedule/calendar content has no extractable skills. This causes chunks to hit the 3-strike permanent failure threshold.

**Example:** `schedule-240-02-20265-v0_0.xlsx` → auto-classified as `"syllabus"` (filename contains "schedule") → `parseSyllabus()` extracts the weekly calendar → `runExtractionV2()` tries to find skills in "2026 Weekly Calendar" → fails 3 times → permanently failed.

**Root cause:** The extractable materials filter excludes assignments but not syllabus:
```javascript
// Current (two locations in StudyContext.jsx — createCourse and addMats):
var extractable = mats.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);
```

**Fix:** Add `"syllabus"` to the exclusion filter:
```javascript
var extractable = mats.filter(m => m.classification !== "assignment" && m.classification !== "syllabus" && (m.chunks || []).length > 0);
```

**Locations:** Two places in `StudyContext.jsx`:
1. In `createCourse` — after syllabus parsing, before the extraction loop (~line 470)
2. In `addMats` — same pattern (~line 1010, approximate)

**After fix:** Syllabus/schedule files will be processed by `parseSyllabus()` for schedule data, then marked as complete without entering the skill extraction pipeline. No more false failures on calendar content.

---

## Total Scope

~90 lines changed across 2 files + 2-line bug fix in StudyContext.jsx. No new files. No schema changes. No new DB methods needed (the existing `runExtractionV2` already handles error-state chunks).

---

## QA Checklist

- [ ] Tabs filter correctly — each tab shows only matching materials
- [ ] Tab counts are accurate
- [ ] "Retry All" only processes materials with error-state chunks
- [ ] "Retry All" does NOT touch permanently failed chunks (failCount >= 3)
- [ ] "Retry All" shows progress for each material
- [ ] After retry, materials list refreshes with updated states
- [ ] GlobalLock prevents double-clicking or navigating during retry
- [ ] Empty tabs are grayed out
- [ ] Tab state resets on screen change
- [ ] **Bug fix:** Syllabus-classified materials are NOT sent to skill extraction
- [ ] **Bug fix:** Filter applied in both `createCourse` and `addMats` code paths
- [ ] **Bug fix:** Syllabus still goes through `parseSyllabus()` for schedule data
- [ ] Build passes
