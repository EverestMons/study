# Materials Status Tabs + Retry All — Orchestrator Plan

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Standard feature development + bug fix.

---

## CEO Decisions (Resolved)

1. **Status tabs:** Filter materials by processing state (All, Ready, Needs Attention, Failed)
2. **Retry All:** Re-queue error-state chunks only — do NOT reset permanently failed (failCount >= 3)
3. **Bug fix:** Exclude syllabus-classified materials from skill extraction pipeline
4. **No skip/dismiss option** for non-extractable materials (deferred)

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

3 batches, executed sequentially:
- **Batch A:** Bug fix — syllabus extraction exclusion (2-line fix, highest priority)
- **Batch B:** Status filter tabs on MaterialsScreen
- **Batch C:** Retry All button + handler

No UXD/UXV involvement — this is a utilitarian developer UI enhancement, not a design-driven feature. The tabs follow standard filter-tab patterns already used elsewhere in the app.

---

## Context for All Agents

### Current MaterialsScreen State

**File:** `src/screens/MaterialsScreen.jsx` (577 lines)

Materials are listed in a flat list under "Course Materials (N)". Each material card shows:
- Status badge via `getMaterialState(mat)` → `"reading" | "analyzing" | "extracting" | "ready" | "incomplete" | "partial" | "critical_error"`
- Per-material retry button (already exists for incomplete/partial/error states)
- Progress bar, section counts, skill counts

**Pain point:** With many materials, user has to scroll through everything to find which ones need attention. No filtering.

### getMaterialState() Logic (StudyContext.jsx lines 141-160)

```
chunks.length === 0              → "reading"
pending=0, errored=0:
  extracted>0, skills>0          → "ready"
  failed === total               → "critical_error"
  extracted>0, failed>0          → "partial"
  else                           → "incomplete"
processingMatId === mat.id       → "extracting" (override)
```

### Extraction Filter Bug

Two locations in StudyContext.jsx where materials are sent to skill extraction:
1. `createCourse` (~line 470): `var extractable = mats.filter(m => m.classification !== "assignment" && ...)`
2. `addMats` (~line 1010): same pattern

Both exclude `"assignment"` but not `"syllabus"`. Syllabus files go through `parseSyllabus()` correctly, then also get sent to `runExtractionV2()` where they fail because calendar/schedule content has no skills.

---

## Batch A — Syllabus Extraction Bug Fix

### Step A.1 · DEV · Exclude Syllabus from Extraction Filter

**Agent:** Study Developer
**Files:** `src/StudyContext.jsx`

**Change:** In both `createCourse` and `addMats`, update the extractable filter:

```javascript
// Before:
var extractable = mats.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);

// After:
var extractable = mats.filter(m => m.classification !== "assignment" && m.classification !== "syllabus" && (m.chunks || []).length > 0);
```

**Additionally:** After syllabus parsing completes, mark syllabus chunks as `'extracted'` so they show as "Ready" instead of "incomplete":
- After `parseSyllabus()` succeeds for a material, call `Chunks.updateStatusBatch(chunkIds, 'extracted')` for that material's chunks
- This prevents syllabus materials from appearing in "Needs Attention" tab

**Lines changed:** ~6

### Step A.2 · QA · Bug Fix Verification

**Agent:** Study Security & Testing Analyst

Test:
- Upload a file classified as "syllabus" (e.g., a schedule xlsx or a file with "syllabus" in the name)
- Verify `parseSyllabus()` runs and extracts schedule data to `course_schedule` table
- Verify `runExtractionV2()` does NOT run on the syllabus material
- Verify syllabus material shows as "Ready" (not "incomplete" or "failed")
- Verify the fix applies in both `createCourse` (new course with syllabus) and `addMats` (adding syllabus to existing course)
- Verify non-syllabus materials still extract normally

**Output:** `knowledge/qa/syllabus-extraction-bugfix-YYYY-MM-DD.md`

---

## Batch B — Status Filter Tabs

### Step B.1 · SA · Materials Tabs Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/materials-status-tabs-YYYY-MM-DD.md`

Design the tab filtering system:

**Tab definitions:**

| Tab | Key | Filter | Badge |
|---|---|---|---|
| All | `"all"` | No filter | `materials.length` |
| Ready | `"ready"` | `matState === "ready"` | count |
| Needs Attention | `"attention"` | `matState` in `["incomplete", "partial"]` OR has chunks with `status === "error"` | count |
| Failed | `"failed"` | `matState === "critical_error"` | count |

**State:** `materialFilter` in component state (not context — resets on unmount)

**Compute once per render:** Loop through `active.materials`, call `getMaterialState(mat)` for each, bucket into tab counts, then filter the render list by selected tab.

**Processing materials:** Materials currently being extracted (`matState` is `"reading"`, `"analyzing"`, `"extracting"`) show in "All" tab only — they're not "ready", not "failed", not "needs attention" yet.

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step B.2 · DEV · Implement Status Tabs

**Agent:** Study Developer
**Input:** Architecture from Step B.1
**File:** `src/screens/MaterialsScreen.jsx`

Add tab bar between the "Add Materials" section and the materials list:
- `materialFilter` state defaulting to `"all"`
- Pre-compute tab counts from `active.materials`
- Filter materials list by selected tab
- Tab styling: active tab highlighted with accent color, inactive tabs show count, zero-count tabs grayed out

**Lines changed:** ~30-40

### Step B.3 · QA · Tab Testing

**Agent:** Study Security & Testing Analyst

Test:
- Each tab filters correctly
- Tab counts match actual material states
- "All" shows everything including processing materials
- "Ready" shows only fully extracted materials
- "Needs Attention" shows incomplete + partial + error-state materials
- "Failed" shows only critical_error materials
- Switching tabs doesn't lose expansion state
- Zero-count tabs are visually disabled
- Tab resets to "All" when leaving and returning to MaterialsScreen

**Output:** `knowledge/qa/materials-tabs-testing-YYYY-MM-DD.md`

---

## Batch C — Retry All Button

### Step C.1 · DEV · Implement Retry All Handler

**Agent:** Study Developer
**File:** `src/StudyContext.jsx`

Add `retryAllFailed` function:
1. Find all materials with error-state chunks (`chunks.some(c => c.status === "error")`)
2. Skip materials where all chunks are `"extracted"` or `"failed"` (nothing retryable)
3. Set `globalLock` with progress message
4. Loop through retryable materials sequentially, calling `runExtractionV2()` for each
5. Update status with progress: "Retrying 1/4: [name]..."
6. After loop, refresh courses and skill counts
7. Release `globalLock`

Expose via context.

**Lines changed:** ~40

### Step C.2 · DEV · Wire Retry All Button into MaterialsScreen

**Agent:** Study Developer
**File:** `src/screens/MaterialsScreen.jsx`

Add "Retry All" button:
- Visible when "Needs Attention" tab is active and there are retryable materials
- Also show in "All" tab if any materials need attention
- Disabled when `globalLock` is active
- Amber styling matching existing per-material retry buttons

**Lines changed:** ~15

### Step C.3 · QA · Retry All Testing

**Agent:** Study Security & Testing Analyst

Test:
- "Retry All" only processes materials with error-state chunks
- Does NOT touch permanently failed chunks (failCount >= 3, status === "failed")
- Shows progress for each material during retry
- GlobalLock prevents navigation and double-click during retry
- After retry, material states update correctly (some may move from "attention" to "ready")
- Retry All with 0 retryable materials shows "Nothing to retry" notification
- Retry All with 1 material works (no off-by-one in progress display)
- Retry All with 5+ materials completes sequentially without errors

**Output:** `knowledge/qa/retry-all-testing-YYYY-MM-DD.md`

---

## Batch Checkpoints

### After Batch A
- [ ] Syllabus files excluded from extraction pipeline
- [ ] Syllabus chunks marked as extracted after syllabus parsing
- [ ] Both `createCourse` and `addMats` paths fixed
- [ ] Build verified

### After Batch B
- [ ] Tab bar renders with correct counts
- [ ] Filtering works for all 4 tabs
- [ ] Zero-count tabs grayed out
- [ ] Build verified

### After Batch C
- [ ] Retry All processes error-state chunks only
- [ ] Progress displayed during batch retry
- [ ] GlobalLock active during retry
- [ ] States refresh after completion
- [ ] Build verified

---

## Final PM Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Add "Materials status filter tabs" to "What Is Working"
- Add "Batch retry for failed extractions" to "What Is Working"
- Note bug fix: "Syllabus/schedule files no longer sent to skill extraction"
- Update department activity dates

---

## Estimated Scope

| Batch | Steps | Lines Changed | Risk |
|---|---|---|---|
| A (Bug fix) | A.1–A.2 | ~6 | Low |
| B (Tabs) | B.1–B.3 | ~35 | Low |
| C (Retry All) | C.1–C.3 | ~55 | Medium (batch extraction) |

**Total:** ~96 lines changed. No new files. No schema changes.

---

## Knowledge Artifacts Produced

| Batch | Agent | Artifact | Location |
|---|---|---|---|
| A | QA | Bug fix verification | `knowledge/qa/syllabus-extraction-bugfix-YYYY-MM-DD.md` |
| B | SA | Tabs architecture | `knowledge/architecture/materials-status-tabs-YYYY-MM-DD.md` |
| B | QA | Tabs test report | `knowledge/qa/materials-tabs-testing-YYYY-MM-DD.md` |
| C | QA | Retry All test report | `knowledge/qa/retry-all-testing-YYYY-MM-DD.md` |

---

## Agent Involvement

| Batch | SA | DEV | QA | PM |
|---|---|---|---|---|
| A — Bug fix | — | 2-line filter fix + chunk status update | Verify both code paths | — |
| B — Tabs | Tab architecture | Tab bar + filtering | Filter correctness | — |
| C — Retry All | — | Handler + button | Batch retry + edge cases | — |
| Final | — | — | — | Status update |
