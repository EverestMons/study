# Exam Prep Black Screen Fix — Dev Log
**Date:** 2026-03-25 | **Agent:** Study Developer

---

## Changes Made

### 1. `src/StudyContext.jsx` — `bootWithFocus` catch block (line ~1222)

**Before:**
```javascript
} catch (err) {
    console.error("Boot failed:", err);
    addNotif("error", "Failed to start session: " + err.message);
}
setBooting(false); setStatus("");
```

**After:**
```javascript
} catch (err) {
    console.error("Boot failed:", err);
    addNotif("error", "Failed to start session: " + err.message);
    setFocusContext(null);
    setMsgs([]);
    setPickerData({ error: true, message: "Failed to start session: " + err.message });
}
setBooting(false); setStatus("");
```

**Why:** When `bootWithFocus` fails, `focusContext` was left set (truthy), which hid all pickers via the `!focusContext` guard in StudyScreen.jsx:114. Meanwhile `msgs` was empty, so nothing rendered — a dead black screen. Clearing `focusContext` re-enables pickers. Setting `pickerData` with an error flag lets the active picker show an inline error message.

Also added `setMsgs([])` to ensure any partial messages from streaming are cleaned up (e.g., if `callClaudeStream` set messages at line 1214 before throwing).

### 2. `src/components/study/ExamScopePicker.jsx` — error state handler (after line 12)

Added early return for `pickerData.error`:
```jsx
if (pickerData.error) return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ color: T.rd, fontSize: 14, marginBottom: 16 }}>{pickerData.message}</div>
        <button onClick={() => { setPickerData(null); setSessionMode(null); }}
          style={{ ... }}>Back</button>
      </div>
    </div>
);
```

**Why:** Without this, the else branch in ExamScopePicker would try to access `pickerData.materials.map(...)` which is undefined on the error object → crash. Error text shown in `T.rd` (red) to differentiate from the `pickerData.empty` state (which uses `T.txD`). Back button clears both `pickerData` and `sessionMode` matching the existing back-button pattern.

### 3. `src/components/study/SkillPicker.jsx` — error state handler (after line 41)

Same pattern as ExamScopePicker. Without this, `pickerData.items` access on line 142 would crash when `bootWithFocus` fails from a skill-mode session.

### 4. `src/components/study/AssignmentPicker.jsx` — error state handler (after line 54)

Same pattern. Without this, `pickerData.items.map(...)` on line 69 would crash when `bootWithFocus` fails from an assignment-mode session.

---

## Early Return Scan

Scanned all `return` statements inside `bootWithFocus` (lines 1145-1229):
- **Line 1146:** `if (!active) return;` — BEFORE `setFocusContext(focus)` (line 1148). No fix needed.
- **Try block (1157-1221):** No `return` statements.
- **Catch block (1222-1226):** Now properly clears `focusContext`. No `return` statement.

No early returns after `setFocusContext(focus)` exist. Only the catch block needed fixing.

---

## Build Verification

`npx vite build --mode development` — clean build, 186 modules transformed, no errors. Pre-existing chunk size warnings only.
