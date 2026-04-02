# React Error #31 — SyntheticEvent Rendered as Child
**Date:** 2026-04-01 | **Type:** Diagnostic Result

## Root Cause

**File:** `src/components/study/InputBar.jsx`, line 135
**Pattern:** `<button onClick={sendMessage} ...>`

The Send button passes `sendMessage` directly as the `onClick` handler. React calls `sendMessage(event)` with the SyntheticEvent as the first argument.

`sendMessage` (in `StudyContext.jsx:1252`) accepts an optional `overrideContent` parameter for direct message injection (used by AssignmentPanel). When the click event is passed:

1. `overrideContent = event` (truthy) → enters the override branch
2. `raw = overrideContent` → SyntheticEvent object
3. `userMsg = overrideContent` → SyntheticEvent object
4. Message created: `{ role: "user", content: SyntheticEvent, ... }`
5. `setMsgs(...)` triggers re-render
6. `MessageList.jsx:210` renders `<div>{m.content}</div>` → React Error #31

## Why It Only Crashes on Button Click

- **Enter key** (InputBar.jsx:114–115): calls `sendMessage()` with no args → `overrideContent = undefined` → normal path
- **Send button** (InputBar.jsx:135): calls `sendMessage(event)` → `overrideContent = event` → crash

Users who always press Enter to send never hit this bug. Only mouse-clicking the Send button triggers it.

## Crash Report Context

The crash report shows "Screen: unknown, Course ID: none" because the `StudyErrorBoundary` in `App.jsx` sits *above* the `ErrorContext.Provider`, so it always reads the default context value `{ screen: "unknown" }`. This is a separate (cosmetic) issue — the crash can happen on any screen with an active study session.

## Recommended Fix

**InputBar.jsx:135** — wrap `sendMessage` to prevent event leakage:

```jsx
// Before (bug):
<button onClick={sendMessage} ...>

// After (fix):
<button onClick={function() { sendMessage(); }} ...>
```

No other callers are affected:
- `AssignmentPanel.jsx:94` calls `sendMessage(string)` correctly
- Keyboard handlers in InputBar call `sendMessage()` with no args

## Optional: Defensive Guard in sendMessage

Add a type check at the top of `sendMessage` to prevent future event leakage:

```javascript
const sendMessage = async (overrideContent) => {
    if (overrideContent && typeof overrideContent !== 'string') overrideContent = undefined;
    ...
```
