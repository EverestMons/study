# Dynamic Input — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Diagnostic reference:** `knowledge/research/dynamic-input-diagnostic-2026-03-22.md`
**Spec reference:** `docs/planning/dynamic-input-spec.md`

---

## Overview

Replace the `codeMode` boolean with a 3-state `inputMode` enum ("text" | "code" | "math"). Add a math symbol toolbar. Add `[INPUT_MODE]` tag parsing so the AI can switch modes mid-conversation. Mode persists across messages until explicitly changed.

---

## Change 1: `inputMode` Enum State

### Replace declaration

**File:** `src/StudyContext.jsx:85`

```javascript
// Before:
const [codeMode, setCodeMode] = useState(false);

// After:
const [inputMode, setInputMode] = useState("text");
```

`detectedLanguage` state stays as-is — it's orthogonal (language within code mode).

### Migration checklist — every `codeMode` reference in `src/`

| Location | Current | New |
|---|---|---|
| `StudyContext.jsx:85` | `useState(false)` | `useState("text")` |
| `StudyContext.jsx:358` (useEffect textarea height) | `if (codeMode)` | `if (inputMode === "code")` |
| `StudyContext.jsx:358` (dep array) | `[input, codeMode]` | `[input, inputMode]` |
| `StudyContext.jsx:388` (clearSessionState) | `setCodeMode(false)` | `setInputMode("text")` |
| `StudyContext.jsx:877` (enterStudy reset) | `setCodeMode(false)` | `setInputMode("text")` |
| `StudyContext.jsx:1122` (bootWithFocus assignment) | `setCodeMode(true)` | `setInputMode("code")` |
| `StudyContext.jsx:1125` (bootWithFocus skill) | `setCodeMode(true)` | `setInputMode("code")` |
| `StudyContext.jsx:1128` (bootWithFocus other) | `setCodeMode(true)` | `setInputMode("code")` |
| `StudyContext.jsx:1208` (sendMessage raw) | `codeMode ? input.trimEnd() : input.trim()` | `inputMode === "code" ? input.trimEnd() : input.trim()` |
| `StudyContext.jsx:1209` (sendMessage userMsg) | `codeMode ? "```\n" + raw + "\n```" : raw` | `inputMode === "code" ? "```\n" + raw + "\n```" : raw` |
| `StudyContext.jsx:1210` (sendMessage isCode) | `const isCode = codeMode` | `const isCode = inputMode === "code"` |
| `StudyContext.jsx:1211` (sendMessage reset) | `setCodeMode(false)` | **REMOVE** (mode persists — Change 4) |
| `StudyContext.jsx:1215` (user message metadata) | `codeMode: isCode` | `codeMode: isCode` (keep for backwards compat with MessageList rendering) |
| `StudyContext.jsx:1591` (context value) | `codeMode, setCodeMode` | `inputMode, setInputMode` |
| `StudyContext.jsx:1638` (useMemo deps) | `codeMode` | `inputMode` |
| `InputBar.jsx:21` (destructure) | `codeMode, setCodeMode` | `inputMode, setInputMode` |
| `InputBar.jsx:32-36` (keyboard shortcut) | `setCodeMode(c => !c)` | See Change 4 (keyboard shortcuts) |
| `InputBar.jsx:66` (conditional) | `codeMode ?` | `inputMode === "code" ?` (becomes 3-way) |
| `InputBar.jsx:80` (onEscape) | `setCodeMode(false)` | `setInputMode("text")` |
| `InputBar.jsx:112` (toggle button) | `setCodeMode(c => !c)` | See Change 4 (3-way selector) |
| `InputBar.jsx:114` (aria-pressed) | `codeMode` | `inputMode === "code"` |
| `InputBar.jsx:120-122` (toggle styling) | `codeMode ? ...` | See Change 4 |
| `InputBar.jsx:142` (hint text) | `codeMode &&` | `inputMode === "code" &&` |
| `StudyScreen.jsx:21` (destructure) | `setCodeMode` | `setInputMode` |
| `StudyScreen.jsx:73` (exit handler) | `setCodeMode(false)` | `setInputMode("text")` |
| `MessageList.jsx:197` (render) | `m.codeMode` | No change — reads from message object, not state |
| `export.js:9,70` | `q.codeMode` | No change — reads from question object |

### useMemo context value update

In the value object (line 1591): replace `codeMode, setCodeMode` with `inputMode, setInputMode`.
In the dependency array (line 1638): replace `codeMode` with `inputMode`.

---

## Change 2: Math Toolbar Component

### New file: `src/components/study/MathToolbar.jsx`

**Props:** `taRef` (ref to textarea), `input` (string), `setInput` (setter)

**Symbol groups:**

```javascript
var MATH_SYMBOLS = {
  greek: [
    { label: "α", ch: "α" }, { label: "β", ch: "β" },
    { label: "γ", ch: "γ" }, { label: "δ", ch: "δ" },
    { label: "θ", ch: "θ" }, { label: "λ", ch: "λ" },
    { label: "μ", ch: "μ" }, { label: "π", ch: "π" },
    { label: "σ", ch: "σ" }, { label: "φ", ch: "φ" },
    { label: "ω", ch: "ω" }, { label: "Δ", ch: "Δ" },
    { label: "Σ", ch: "Σ" }, { label: "Ω", ch: "Ω" },
  ],
  operators: [
    { label: "±", ch: "±" }, { label: "×", ch: "×" },
    { label: "÷", ch: "÷" }, { label: "≠", ch: "≠" },
    { label: "≈", ch: "≈" }, { label: "≤", ch: "≤" },
    { label: "≥", ch: "≥" }, { label: "∈", ch: "∈" },
    { label: "∉", ch: "∉" }, { label: "⊂", ch: "⊂" },
    { label: "∪", ch: "∪" }, { label: "∩", ch: "∩" },
  ],
  calculus: [
    { label: "∫", ch: "∫" }, { label: "∂", ch: "∂" },
    { label: "∑", ch: "∑" }, { label: "∏", ch: "∏" },
    { label: "√", ch: "√" }, { label: "∞", ch: "∞" },
    { label: "lim", ch: "lim" },
  ],
  super_sub: [
    { label: "x²", ch: "²" }, { label: "x³", ch: "³" },
    { label: "xⁿ", ch: "ⁿ" }, { label: "x₁", ch: "₁" },
    { label: "x₂", ch: "₂" }, { label: "xₙ", ch: "ₙ" },
  ],
  arrows: [
    { label: "→", ch: "→" }, { label: "←", ch: "←" },
    { label: "⇒", ch: "⇒" }, { label: "⇔", ch: "⇔" },
    { label: "↦", ch: "↦" },
  ],
  sets: [
    { label: "∀", ch: "∀" }, { label: "∃", ch: "∃" },
    { label: "∴", ch: "∴" }, { label: "∵", ch: "∵" },
    { label: "ℝ", ch: "ℝ" }, { label: "ℤ", ch: "ℤ" },
    { label: "ℕ", ch: "ℕ" }, { label: "ℚ", ch: "ℚ" },
    { label: "ℂ", ch: "ℂ" },
  ],
};

var GROUP_LABELS = {
  greek: "Greek", operators: "Ops", calculus: "Calc",
  super_sub: "Sup/Sub", arrows: "Arrows", sets: "Sets",
};
```

**Insertion mechanism:**

```javascript
function insertSymbol(ch) {
  var ta = taRef.current;
  if (!ta) return;
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  var val = input;
  var newVal = val.substring(0, start) + ch + val.substring(end);
  setInput(newVal);
  // Restore cursor after React re-render
  requestAnimationFrame(function() {
    ta.selectionStart = ta.selectionEnd = start + ch.length;
    ta.focus();
  });
}
```

**Collapsible toggle behavior:**

- Local state: `var [expanded, setExpanded] = useState(null)` — tracks which category is expanded (null = all collapsed).
- Default state: collapsed — shows only category label tabs as small pills.
- Click a category pill → expands that category's symbols below.
- Click a symbol → inserts character, collapses back (set `expanded` to null).
- Click the same category pill again → collapses.

**Visual styling:**

- Category pills: `fontSize: 10`, `padding: "2px 8px"`, `borderRadius: 6`, `border: "1px solid " + T.bd`, `background: expanded === key ? T.acS : "transparent"`, `color: expanded === key ? T.ac : T.txM`. Click sets `expanded`.
- Symbol buttons: `fontSize: 14`, `width: 28`, `height: 28`, `borderRadius: 6`, `border: "1px solid " + T.bd`, `background: "transparent"`, `color: T.tx`, hover: `background: T.sfH`. Grid layout with `gap: 4`, `flexWrap: "wrap"`.
- Container: `marginBottom: 8`, `padding: "6px 0"`. Compact — one line of category pills, one expandable row of symbols.

**Integration in InputBar:**

Rendered above the textarea when `inputMode === "math"`:
```jsx
{inputMode === "math" && <MathToolbar taRef={taRef} input={input} setInput={setInput} />}
```

---

## Change 3: `[INPUT_MODE]` Tag Parsing + AI-Driven Switching

### New parser function

**File:** `src/lib/study.js` — after `parseImageTags` (line ~1712)

```javascript
export const parseInputMode = (response) => {
  var match = response.match(/\[INPUT_MODE:\s*(text|code|math)(?::(\w+))?\]/);
  if (!match) return null;
  return { mode: match[1], language: match[2] || null };
};
```

### Call site

**File:** `src/StudyContext.jsx` — in `sendMessage`, after `parseSkillUpdates` processing (after line ~1264), before storing the final message.

```javascript
var parsedMode = parseInputMode(response);
if (parsedMode) {
  setInputMode(parsedMode.mode);
  if (parsedMode.language) setDetectedLanguage(parsedMode.language);
}
```

### Tag stripping

**File:** `src/lib/theme.jsx` — in `renderMd`, add to the stripping chain:

```javascript
// Complete tags
.replace(/\[INPUT_MODE:\s*[^\]]*\]/g, "")
// Partial tags (streaming)
.replace(/\[INPUT_MODE[^\]]*$/g, "")
.replace(/\[INPUT_MO[\s\S]*$/g, "")
```

### System prompt addition

**File:** `src/lib/study.js` — in `buildSystemPrompt()`, add before the closing `";` of the return string, after the SHOW_IMAGE section:

```
\n\n---\n\nINPUT MODE CONTROL:\n\nYou control what kind of input the student sees. Use these tags to switch the input mode:\n- [INPUT_MODE: code:<language>] — Student sees a code editor with syntax highlighting for <language>. Use when asking the student to write, complete, fix, or predict code output. Supported languages: python, java, javascript, c, c++, c#, rust, sql, go, kotlin, swift, ruby, r, matlab.\n- [INPUT_MODE: math] — Student sees a math-enabled input with symbol toolbar (Greek letters, operators, calculus symbols, etc). Use when asking the student to write equations, solve problems, or show mathematical work.\n- [INPUT_MODE: text] — Student sees a plain text input. Use for explanations, definitions, conceptual questions, or conversational responses.\n\nThe mode persists until you change it. Don't re-signal every message — only signal when switching.\n\nGuidelines:\n- Switch to code mode when you first ask a coding question. Keep it in code mode while the coding conversation continues.\n- Switch to math mode when you first ask for mathematical notation. Keep it while doing math.\n- Switch back to text when you shift to conceptual discussion, explanation requests, or non-technical dialogue.\n- If the skill is programming-related, emit [INPUT_MODE: code:<language>] early in the session.\n- If the skill involves equations or formulas, emit [INPUT_MODE: math] early.\n- For mixed sessions (e.g., explaining a concept then asking the student to implement it), switch modes as the focus shifts.
```

---

## Change 4: Mode Persistence + Manual Override

### Remove mode reset on submit

**File:** `src/StudyContext.jsx:1211`

```javascript
// Before:
setInput(""); setCodeMode(false);

// After:
setInput("");
// Mode persists — no reset
```

### 3-way mode selector UI

Replace the single `</>` toggle button in `InputBar.jsx:112-125` with three small icon buttons in a segmented control:

```
┌─────┬─────┬─────┐
│  T  │ </> │  π  │
└─────┴─────┴─────┘
```

- **T** = text mode (plain "T" letter)
- **</>** = code mode (existing icon)
- **π** = math mode (pi symbol)

Each button uses the same sizing as the current toggle (width: 28, height: 36, borderRadius: 6). The active mode button gets `background: T.acS`, `color: T.ac`, `border: 1px solid T.acB`. Inactive: `background: transparent`, `color: T.txD`, `border: none`.

The three buttons are wrapped in a container with `display: "flex"`, `borderRadius: 8`, `overflow: "hidden"`, `border: "1px solid " + T.bd` — a segmented control look.

### Keyboard shortcuts

- **Ctrl/Cmd+Shift+C** — toggle code mode (existing shortcut, keep it)
- **Ctrl/Cmd+Shift+M** — toggle math mode (new)
- **Escape** (in code editor) — returns to text mode (existing behavior, keep it)

Toggle behavior: if the shortcut matches the current mode, switch to "text". If current mode is something else, switch to the target mode. E.g., pressing Ctrl+Shift+C when in code mode → text. Pressing Ctrl+Shift+C when in text or math mode → code.

```javascript
// In InputBar onKeyDown:
if (e.key === "C" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  setInputMode(inputMode === "code" ? "text" : "code");
  return;
}
if (e.key === "M" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  setInputMode(inputMode === "math" ? "text" : "math");
  return;
}
```

### Mode hint text

Below the input, show context-specific hint text:

- Code mode: `Esc exit · ↵ new line · ⌘↵ send` (existing)
- Math mode: `↵ send · ⇧↵ new line · Click symbols above to insert` (new)
- Text mode: no hint (existing behavior)

---

## New State Variables

**In StudyContext:**
- Replace `codeMode` (boolean) with `inputMode` (string: "text" | "code" | "math")
- `detectedLanguage` stays as-is

**In MathToolbar (local):**
- `expanded` (string|null) — which category is expanded

**No new refs needed.** `taRef` already exists and is passed through context.

---

## Data Flow Diagram

```
Session start:
  bootWithFocus → detectLanguage() → setInputMode("code") + setDetectedLanguage(lang)
                → detectMath() → setInputMode("math")  [NEW]
                → neither → stays "text"

Manual switch:
  User clicks mode selector → setInputMode("text"|"code"|"math")
  Keyboard shortcut → setInputMode(toggle)

AI-driven switch:
  AI response contains [INPUT_MODE: math]
    → parseInputMode(response) → { mode: "math", language: null }
    → setInputMode("math")
  AI response contains [INPUT_MODE: code:python]
    → parseInputMode(response) → { mode: "code", language: "python" }
    → setInputMode("code"); setDetectedLanguage("python")

Rendering:
  inputMode === "text"  → <textarea>
  inputMode === "code"  → <CodeEditor> (unchanged)
  inputMode === "math"  → <MathToolbar> + <textarea>

Message submit:
  inputMode === "code" → wrap in ``` fences, tag message with codeMode: true
  inputMode !== "code" → plain text
  Mode does NOT reset on submit
```

---

## How to Verify

1. **State migration:** Search `src/` for `codeMode` — should find zero references except `m.codeMode` in MessageList.jsx (reads from message object, not state) and `q.codeMode` in export.js (reads from question object). Both are backwards-compatible reads.

2. **3-way selector:** Click each mode button — input switches between textarea, CodeEditor, and MathToolbar+textarea. Active button highlights correctly.

3. **Math toolbar:** Click a category pill → symbols expand. Click a symbol → character inserted at cursor, category collapses. Cursor stays at correct position after insertion.

4. **Keyboard shortcuts:** Ctrl+Shift+C toggles code mode. Ctrl+Shift+M toggles math mode. Escape in CodeEditor returns to text.

5. **AI-driven switching:** When AI response contains `[INPUT_MODE: math]`, the input switches to math mode. Tag is stripped from displayed text. When AI sends `[INPUT_MODE: text]`, switches back.

6. **Mode persistence:** Send a message in code mode → input stays in code mode after sending. Switch to math → send → stays in math.

7. **System prompt:** AI receives INPUT_MODE instructions and emits tags appropriately.

8. **Build:** `npx vite build --mode development` passes with no errors.

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Designed the dynamic input feature across 4 changes: inputMode enum state (migration checklist for 25+ codeMode references), math toolbar component (6 symbol groups, 66 symbols, collapsible categories, cursor insertion), INPUT_MODE tag parsing (regex + system prompt), and mode persistence with 3-way manual selector.

### Files Deposited
- `study/knowledge/architecture/dynamic-input-blueprint-2026-03-22.md` — this blueprint

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Mode selector is a segmented control with 3 small icon buttons (T, </>, π)
- Math toolbar uses collapsible category pills — one expanded at a time
- Symbol insertion uses `requestAnimationFrame` to restore cursor after React re-render
- Mode persists across messages — no reset on submit
- AI-driven mode change applies immediately (no manual override flag — simplicity over complexity)
- Tag stripping in `renderMd` follows existing streaming-safe pattern (complete + partial)

### Flags for CEO
- None

### Flags for Next Step
- Step 2 (DEV) implements Changes 1 and 2 (state refactor + math toolbar)
- Step 3 (DEV) implements Changes 3 and 4 (AI parsing + mode persistence)
