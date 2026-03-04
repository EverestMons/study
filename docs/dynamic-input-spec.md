# Dynamic Input Spec

## Overview

The chat input adapts to what the student needs to respond with. The AI signals a mode switch via a tag in its response; the frontend parses it and swaps the input component. Three modes: text (default), code, and math.

This applies to both tutoring chat and practice mode — the input component is shared.

---

## Input Modes

### Text Mode (default)
What exists now. Plain textarea, enter to send, shift+enter for newline.

### Code Mode
- Monospace font (system monospace or Fira Code / JetBrains Mono)
- Syntax highlighting for the active language
- Tab key inserts indentation (not focus change)
- Shift+Enter for newlines, Cmd/Ctrl+Enter to submit (enter alone also creates newline — opposite of text mode since code input needs frequent newlines)
- Line numbers in gutter
- Minimum height: ~6 lines. Expands as content grows, max ~15 lines before scrolling.
- Language indicator badge in corner (e.g., "Java", "Python")
- No autocomplete, no intellisense — this is for learning, not productivity

### Math Mode
- Standard textarea base (not monospace)
- Toolbar row above the input with symbol buttons grouped by category:
  - **Greek:** α β γ δ θ λ μ π σ φ ω Δ Σ Ω
  - **Operators:** ± × ÷ ≠ ≈ ≤ ≥ ∈ ∉ ⊂ ⊃ ∪ ∩
  - **Calculus:** ∫ ∂ ∑ ∏ √ ∞ lim
  - **Superscript/subscript:** x² x³ xⁿ x₁ x₂ xₙ (inserts the actual Unicode characters)
  - **Arrows:** → ← ⇒ ⇔ ↦
  - **Misc:** ∀ ∃ ∴ ∵ ℝ ℤ ℕ ℚ ℂ
- Clicking a symbol inserts it at cursor position
- Toolbar is collapsible (chevron toggle) so it doesn't dominate the UI when the student is typing prose between equations
- Enter to send, shift+enter for newline (same as text mode)

---

## Mode Switching Protocol

### AI signals mode via SESSION_EVENT tag

The AI already uses `[SESSION_EVENT: ...]` tags for session tracking (journal entries, mastery updates). Input mode uses the same pattern:

```
[INPUT_MODE: code:java]
[INPUT_MODE: code:python]
[INPUT_MODE: math]
[INPUT_MODE: text]
```

The tag can appear anywhere in the AI's response. The frontend strips it from the displayed message and applies the mode change.

### Persistence rules

1. **Mode persists until explicitly changed.** Once the AI sets `[INPUT_MODE: code:java]`, every subsequent message uses the code editor in Java mode until the AI sends a different `[INPUT_MODE]` tag.

2. **Session start defaults to text.** Every new session begins in text mode. The AI switches when appropriate based on intent and course content.

3. **AI switches back when context changes.** If the AI moves from "write this function" to "explain in your own words," it sends `[INPUT_MODE: text]`. The prompt templates instruct the AI when to switch (see below).

4. **Student can manually override.** A mode toggle in the input bar lets the student force a mode if the AI didn't switch when they wanted. This is a small icon row (text/code/math) next to the send button. Manual override persists until the AI sends a new mode tag.

5. **Practice mode inherits.** When entering practice mode, the mode is set based on the skill type — code skills start in code mode, math skills in math mode. The AI doesn't need to signal it; the practice mode entry logic sets it.

---

## Prompt Integration

### Addition to Shared Tutoring Core

Add to the "Response Format" section of the shared tutoring core prompt:

```
INPUT MODE CONTROL:
You control what kind of input the student sees. Use these tags to switch the input mode:
- [INPUT_MODE: code:<language>] — Student sees a code editor with syntax highlighting for <language>. Use when asking the student to write, complete, fix, or predict code output.
- [INPUT_MODE: math] — Student sees a math-enabled input with symbol toolbar. Use when asking the student to write equations, solve problems, or show mathematical work.
- [INPUT_MODE: text] — Student sees a plain text input. Use for explanations, definitions, conceptual questions, or conversational responses.

The mode persists until you change it. Don't re-signal every message — only signal when switching.

Guidelines:
- Switch to code mode when you first ask a coding question. Keep it in code mode while the coding conversation continues.
- Switch to math mode when you first ask for mathematical notation. Keep it while doing math.
- Switch back to text when you shift to conceptual discussion, explanation requests, or non-technical dialogue.
- If the skill is programming-related, default to code mode early in the session.
- If the skill involves equations or formulas, default to math mode early.
- For mixed sessions (e.g., explaining a concept then asking the student to implement it), switch modes as the focus shifts.
```

### Intent-specific defaults

| Intent | Likely default mode | AI switches when... |
|--------|-------------------|---------------------|
| Complete Assignment (CS) | code | Assignment has conceptual questions → text |
| Complete Assignment (math) | math | Problem asks for explanation → text |
| Exam Prep | text (mixed) | AI presents a problem to solve → code or math |
| Learn New | text | AI asks student to try something → code or math |
| Review | text | AI quizzes with a problem → code or math |
| Explore | text | Student steers toward hands-on → code or math |

---

## Frontend Architecture

### Component: `<DynamicInput>`

A single component that renders the appropriate input based on current mode. Props:

```javascript
<DynamicInput
  mode="code"           // "text" | "code" | "math"
  language="java"       // Only used in code mode
  value={inputValue}
  onChange={setInputValue}
  onSubmit={handleSend}
  disabled={isLoading}
/>
```

### Mode state management

```javascript
const [inputMode, setInputMode] = useState('text');     // 'text' | 'code' | 'math'
const [codeLanguage, setCodeLanguage] = useState(null);  // 'java', 'python', etc.
const [manualOverride, setManualOverride] = useState(false);

// Parse AI response for INPUT_MODE tags
function processAiResponse(content) {
  const modeMatch = content.match(/\[INPUT_MODE:\s*(text|code|math)(?::(\w+))?\]/);
  if (modeMatch && !manualOverride) {
    setInputMode(modeMatch[1]);
    if (modeMatch[2]) setCodeLanguage(modeMatch[2]);
  }
  // Strip tag from displayed content
  return content.replace(/\[INPUT_MODE:\s*[^\]]+\]/g, '');
}
```

### Code editor implementation

For syntax highlighting in a lightweight editor, options (all open source):

1. **CodeMirror 6** — Full editor framework with language modes. Heavier (~100KB) but battle-tested. Good syntax highlighting, proper indentation.
2. **Prism.js + contenteditable** — Lightweight highlighting (~20KB) overlaid on an editable div. Simpler but less robust editing behavior.
3. **Custom monospace textarea with highlight overlay** — Simplest. A `<textarea>` with monospace styling, and a transparent `<pre>` overlay that shows highlighted tokens. No line numbers but minimal dependencies.

**Recommendation: CodeMirror 6.** It's the standard for embedded editors, handles tab/indent correctly, has language modes for all common languages, and works well at constrained sizes. The ~100KB cost is acceptable for a desktop app. It's also what most educational platforms use.

For the Tauri app, install via npm. For the artifact prototype, load from CDN:
```
https://cdnjs.cloudflare.com/ajax/libs/codemirror/...
```

### Math toolbar implementation

Simple button row. Each button inserts a Unicode character at the cursor position in the textarea:

```javascript
const MATH_SYMBOLS = {
  greek: [
    { label: 'α', char: 'α' }, { label: 'β', char: 'β' },
    { label: 'γ', char: 'γ' }, { label: 'δ', char: 'δ' },
    { label: 'θ', char: 'θ' }, { label: 'λ', char: 'λ' },
    { label: 'μ', char: 'μ' }, { label: 'π', char: 'π' },
    { label: 'σ', char: 'σ' }, { label: 'φ', char: 'φ' },
    { label: 'ω', char: 'ω' }, { label: 'Δ', char: 'Δ' },
    { label: 'Σ', char: 'Σ' }, { label: 'Ω', char: 'Ω' },
  ],
  operators: [
    { label: '±', char: '±' }, { label: '×', char: '×' },
    { label: '÷', char: '÷' }, { label: '≠', char: '≠' },
    { label: '≈', char: '≈' }, { label: '≤', char: '≤' },
    { label: '≥', char: '≥' }, { label: '∈', char: '∈' },
    { label: '∉', char: '∉' }, { label: '⊂', char: '⊂' },
    { label: '∪', char: '∪' }, { label: '∩', char: '∩' },
  ],
  calculus: [
    { label: '∫', char: '∫' }, { label: '∂', char: '∂' },
    { label: '∑', char: '∑' }, { label: '∏', char: '∏' },
    { label: '√', char: '√' }, { label: '∞', char: '∞' },
    { label: 'lim', char: 'lim' },
  ],
  superscript: [
    { label: 'x²', char: '²' }, { label: 'x³', char: '³' },
    { label: 'xⁿ', char: 'ⁿ' }, { label: 'x₁', char: '₁' },
    { label: 'x₂', char: '₂' }, { label: 'xₙ', char: 'ₙ' },
  ],
  arrows: [
    { label: '→', char: '→' }, { label: '←', char: '←' },
    { label: '⇒', char: '⇒' }, { label: '⇔', char: '⇔' },
    { label: '↦', char: '↦' },
  ],
  sets: [
    { label: '∀', char: '∀' }, { label: '∃', char: '∃' },
    { label: '∴', char: '∴' }, { label: '∵', char: '∵' },
    { label: 'ℝ', char: 'ℝ' }, { label: 'ℤ', char: 'ℤ' },
    { label: 'ℕ', char: 'ℕ' }, { label: 'ℚ', char: 'ℚ' },
    { label: 'ℂ', char: 'ℂ' },
  ],
};

function insertAtCursor(textarea, char) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  textarea.value = value.substring(0, start) + char + value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + char.length;
  textarea.focus();
}
```

The toolbar renders as a row of small buttons grouped by category, with category labels as subtle separators. Default state: collapsed (just category labels visible as tabs). Click a category to expand its symbols. Click a symbol to insert and auto-collapse.

---

## Mode indicator in chat messages

When the student submits in code mode, their message should render differently in the chat — as a code block with syntax highlighting, not as plain text. Similarly, math-mode submissions should render with the math symbols displayed clearly.

This is handled by tagging the message with its input mode when stored:

```javascript
// When sending a message
const message = {
  role: 'user',
  content: inputValue,
  input_mode: inputMode,        // 'text', 'code', 'math'
  code_language: codeLanguage,  // 'java', 'python', null
};
```

The chat renderer checks `input_mode` and wraps code submissions in a `<pre><code>` block with highlighting, and math submissions with appropriate styling.

---

## Practice Mode Integration

Practice mode already has a dedicated editor area (from the practice-mode-spec). The `<DynamicInput>` component replaces the ad-hoc editor with a unified component:

- **Code skills:** Practice mode sets `mode="code"` and `language` from the skill name/context at entry. The `<DynamicInput>` renders as the code editor.
- **Math skills:** Practice mode sets `mode="math"`. The `<DynamicInput>` renders the math toolbar + textarea.
- **Other skills:** Practice mode sets `mode="text"`. Standard textarea.

The practice mode problem prompt can also include `[INPUT_MODE]` tags to switch mid-set if needed (e.g., a debug problem might start in code mode, then ask "explain what was wrong" in text mode).

---

## What This Doesn't Cover (Future)

- **Handwriting/drawing canvas** — Deferred. Would be a fourth mode (`canvas`) for kanji, diagrams, circuit drawings. Needs stroke recognition (ML model or vision API).
- **Multiple choice widget** — Could be a fifth mode for recognition/recall questions. Radio buttons instead of free text.
- **Drag-and-drop ordering** — For "arrange these steps" type questions.
- **LaTeX rendering** — Math mode uses Unicode symbols, not LaTeX. A future enhancement could add LaTeX input with live preview rendering via KaTeX.
- **Image/diagram upload** — Student draws on paper, takes a photo, uploads for AI evaluation. Needs vision API integration.
