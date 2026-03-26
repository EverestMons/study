# Exam Prep Black Screen — Diagnostic
**Date:** 2026-03-25 | **Agent:** Study Developer

---

## 1. "Start Exam Prep" Button — Click Handler and Navigation

**Location:** `src/components/study/ExamScopePicker.jsx:55-58`

The button labeled "Start exam prep (N selected)" is in ExamScopePicker, NOT CourseHomepage. The full onClick:

```jsx
onClick={() => {
  var selected = pickerData.materials.filter(m => pickerData.selectedMats.has(m.id));
  if (!selected.length) return;  // guard: no-op if nothing selected
  bootWithFocus({ type: "exam", materials: selected });
}}
```

**How users reach ExamScopePicker:**
- CourseHomepage card "Exam Review" (line 161) calls `enterStudy(active, "exam")`
- `enterStudy` (StudyContext.jsx:905) → navigates to "study" screen, clears all state, creates a new chat session, then calls `selectMode("exam")` (line 938) — **NOT awaited** (fire-and-forget)
- `selectMode("exam")` (StudyContext.jsx:1091-1136) → loads materials with extracted chunks, auto-selects based on nearest exam in schedule, sets `pickerData`
- StudyScreen.jsx:114-119 renders ExamScopePicker when `sessionMode === "exam" && !focusContext && !booting && msgs.length <= 1`

---

## 2. `enterStudy` — Exam Intent Handling

**Location:** `src/StudyContext.jsx:905-940`

```javascript
const enterStudy = async (course, initialMode, materialId) => {
    setActive(course); navigateTo("study");
    // Clears ALL state:
    setMsgs([]); setInput(""); setInputMode("text"); setDetectedLanguage(null);
    setSessionMode(null); setFocusContext(null); setPickerData(null);
    setChunkPicker(null); setAsgnWork(null); setPracticeMode(null);
    // Resets all session refs
    sessionSkillLog.current = [];
    sessionMasteryEvents.current = [];
    sessionFacetUpdates.current = [];
    sessionMasteredSkills.current = new Set();
    cachedSessionCtx.current = null;
    sessionStartIdx.current = 0;
    sessionStartTime.current = null;
    discussedChunks.current = new Set();
    setSessionSummary(null); setSessionElapsed(0); setBreakDismissed(false);
    setSidebarCollapsed(false);
    // Journal capture + new session creation
    try {
      const oldSid = await Sessions.getOrCreateCompat(course.id);
      // ... captures old session to journal ...
      chatSessionId.current = await Sessions.create({ courseId: course.id, intent: 'study' });
    } catch (e) { console.error("Journal capture on enter:", e); }
    if (initialMode) {
      selectMode(initialMode, materialId);  // NOT awaited
    }
};
```

**Key findings:**
- `selectMode` is called but **not awaited**. Any errors inside `selectMode` are caught by its own try/catch (line 1138) and set `pickerData` with an error message. This is safe but means `enterStudy` returns before the picker data is populated.
- `enterStudy` does NOT validate whether materials exist or whether the course has extracted content. It delegates entirely to `selectMode`.
- `selectMode` reads `active.id` from the closure (line 946), NOT from the `course` parameter passed to `enterStudy`. Since CourseHomepage passes `active` as the `course` argument, `setActive(course)` is effectively a no-op (same reference), so the stale closure is safe in this flow.

---

## 3. `selectMode("exam")` — Material Validation

**Location:** `src/StudyContext.jsx:1091-1136`

```javascript
} else if (mode === "exam") {
    var mats = (active.materials || []).filter(m =>
      (m.chunks || []).some(c => c.status === "extracted")
    );
    if (!mats.length) {
      setPickerData({ mode, empty: true,
        message: "No extracted materials found. Extract skills from your course materials first." });
      return;
    }
    // Auto-select materials based on nearest exam scope
    // ... schedule parsing, reading list matching ...
    setPickerData({ mode, materials: mats, selectedMats: preSelected });
}
```

**If no extracted materials:** `pickerData.empty = true` → ExamScopePicker shows error message + Back button. Handled gracefully.
**If materials exist:** ExamScopePicker shows the material selection list with checkboxes.

---

## 4. StudyScreen — Conditional Rendering Analysis

**Location:** `src/screens/StudyScreen.jsx` (143 lines)

### (a) Guards that could produce a blank screen

The critical picker guard is at **line 114**:
```jsx
{sessionMode && !focusContext && !booting && msgs.length <= 1 && (
  <>
    {sessionMode === "assignment" && <AssignmentPicker />}
    {sessionMode === "skills" && <SkillPicker />}
    {sessionMode === "exam" && <ExamScopePicker />}
  </>
)}
```

If `focusContext` is truthy, ALL pickers are hidden. This is by design — once `bootWithFocus` sets `focusContext`, the picker disappears and messages take over.

**Sub-component null guards (all must be false for a blank screen):**
- MaterialsPanel: hidden unless `showManage`
- SkillsPanel: hidden unless `showSkills`
- PracticeMode: hidden unless `practiceMode`
- NotifPanel: hidden unless `showNotifs`
- ChunkPicker: hidden unless `chunkPicker`
- MessageList: renders empty if `msgs === []`
- AssignmentPanel: hidden unless `asgnWork && msgs.length > 0`
- SessionSummary: hidden unless `sessionSummary`
- InputBar: always renders but may show minimal UI

### (b) Exam focus type handling

StudyScreen itself has NO exam-specific logic. The `sessionMode === "exam"` condition only controls which picker renders (ExamScopePicker). All exam-specific behavior lives in:
- `selectMode("exam")` — material list preparation
- `bootWithFocus({ type: "exam" })` — context building and session boot
- `buildFocusedContext` in study.js — exam context assembly

### (c) Error handling

**No ErrorBoundary wrapping StudyScreen itself.** The only ErrorBoundary is in `App.jsx` (wraps the entire app). If any component inside StudyScreen throws during render, the global ErrorBoundary catches it — but this would show the error UI, not a black screen.

`bootWithFocus` has a try/catch (lines 1222-1224):
```javascript
} catch (err) {
    console.error("Boot failed:", err);
    addNotif("error", "Failed to start session: " + err.message);
}
setBooting(false); setStatus("");
```

---

## 5. ExamScopePicker → `bootWithFocus` — Exam Scope Flow

**Location:** `src/components/study/ExamScopePicker.jsx:55-58` → `src/StudyContext.jsx:1145-1227`

When user clicks "Start exam prep":
1. `bootWithFocus({ type: "exam", materials: selected })` is called
2. Line 1148: `setFocusContext(focus); setPickerData(null); setBooting(true);`
   - Immediately hides ExamScopePicker (pickerData → null)
   - Hides picker guard (focusContext is now truthy)
   - Shows loading state (booting = true → inSession = true)
3. Loads skills, journal, calls `buildFocusedContext` with exam focus
4. Builds system prompt with exam mode hint
5. Streams AI response

**`bootWithFocus` can NOT be called before scope is selected** — the button is disabled when `pickerData.selectedMats.size === 0` (ExamScopePicker line 60-61) and the click handler returns early if `!selected.length` (line 57).

---

## 6. Root Cause Analysis — Black Screen Scenarios

### Scenario A: `bootWithFocus` API failure (MOST LIKELY)

After the try/catch in `bootWithFocus` handles an error:
- `focusContext` = set (truthy) → **hides all pickers**
- `pickerData` = null → ExamScopePicker returns null
- `msgs` = `[]` (never populated) → MessageList renders nothing
- `booting` = false → no loading indicator
- `inSession` = false (msgs empty, not booting, no practiceMode)
- Error notification added via `addNotif` but NotifPanel requires `showNotifs` to be visible — **the error is not shown as a toast**

**Result: Dark empty shell with only a "< Back" button. This is the black screen.**

The "< Back" button calls `handleBackToOrigin` (line 69-73) which properly clears all state and navigates back. But the user has no indication of what went wrong.

### Scenario B: `buildFocusedContext` throws internally

`buildFocusedContext` (study.js:1615-1690) for exam type iterates selected materials and loads chunks. If the DB queries fail, the function throws, caught by `bootWithFocus`'s catch → same dead state as Scenario A.

### Scenario C: No API key configured

`callClaudeStream` (line 1215) would fail immediately. Error caught → same dead state.

### Scenario D: Stale `active` in `bootWithFocus`

If somehow `active` becomes null between ExamScopePicker render and button click, `bootWithFocus` line 1146 returns early (`if (!active) return`). State has already been partially modified by ExamScopePicker's filter logic... but actually `bootWithFocus` hasn't modified state yet at that point. The user would just see nothing happen. Unlikely since `active` is stable while on CourseHomepage.

---

## 7. Summary

| Component | File:Line | Exam Handling | Black Screen Risk |
|-----------|-----------|---------------|-------------------|
| CourseHomepage | CourseHomepage.jsx:161 | `enterStudy(active, "exam")` | None — delegates cleanly |
| enterStudy | StudyContext.jsx:905-940 | Clears state, calls `selectMode("exam")` (not awaited) | Low — selectMode has own error handling |
| selectMode("exam") | StudyContext.jsx:1091-1136 | Loads materials, auto-selects scope, sets pickerData | Low — empty materials → shows error message |
| ExamScopePicker | ExamScopePicker.jsx:55-58 | Calls `bootWithFocus({ type: "exam", materials })` | None — guard prevents empty selection |
| bootWithFocus | StudyContext.jsx:1145-1227 | Sets focusContext, builds context, streams AI | **HIGH** — on failure: focusContext set + no msgs = dead state |
| StudyScreen | StudyScreen.jsx:114 | Picker guard: `!focusContext` | **HIGH** — focusContext truthy hides pickers permanently |

**Root cause:** `bootWithFocus` failure leaves the screen in a dead state. `focusContext` is set (hiding pickers) but `msgs` is empty (showing nothing). The error notification goes to `addNotif` which is not a visible toast — it goes to the notification queue accessible via the notification bell, which isn't visible during `inSession = false` state either (NotifPanel requires `showNotifs`).

**Fix vectors (not implementing — diagnostic only):**
1. Wrap `bootWithFocus` in a finally block that clears `focusContext` on failure so the picker can re-appear
2. Show `bootWithFocus` errors as visible inline content on StudyScreen instead of silent notifications
3. Add a `bootError` state that StudyScreen can render as a visible error with retry/back options
