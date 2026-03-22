# Dynamic Input — Diagnostic Report
**Date:** 2026-03-22

---

## 1. Current Code Input Mode

**Status: Fully implemented — CodeMirror 6 editor with syntax highlighting.**

### Where it's implemented
- **Component:** `src/components/study/CodeEditor.jsx` (187 lines) — wraps CodeMirror 6
- **Lazy loader:** `src/lib/codemirror.js` (154 lines) — dynamic imports to avoid white screen risk
- **State:** `codeMode` (boolean) + `detectedLanguage` (string) in `StudyContext.jsx:85`
- **Rendering:** `InputBar.jsx:66-85` — conditionally renders `<CodeEditor>` or `<textarea>` based on `codeMode`
- **Toggle button:** `InputBar.jsx:112-125` — `</>` button next to send, Ctrl+Shift+C keyboard shortcut

### What triggers the switch
Code mode is triggered in two ways:
1. **Manual toggle:** User clicks the `</>` button or presses Ctrl+Shift+C (`InputBar.jsx:32-36`)
2. **Auto-detection at session start:** `bootWithFocus` in `StudyContext.jsx:1120-1129` calls `detectLanguage(courseName, skillName, skillDesc)` which pattern-matches against known programming language keywords in the course/skill name. If a language is detected, `setCodeMode(true)` and `setDetectedLanguage(lang)` are called.

**The AI does NOT currently emit `[INPUT_MODE: code]` tags.** Code mode is purely client-side (manual toggle + auto-detection at session start). There is no mid-conversation AI-driven mode switching.

### Current features
| Feature | Status |
|---|---|
| Monospace font (SF Mono/Fira Code) | Yes — `codemirror.js:34` |
| Syntax highlighting | Yes — CodeMirror 6 with dark theme, 14 languages supported |
| Tab key inserts indentation | Yes — `indentWithTab` keymap (`CodeEditor.jsx:59`) |
| Cmd/Ctrl+Enter to submit | Yes — keymap (`CodeEditor.jsx:60`) |
| Enter creates newline (not submit) | Yes — CodeMirror default behavior |
| Escape exits code mode | Yes — keymap (`CodeEditor.jsx:61`) → `setCodeMode(false)` |
| Line numbers | Yes — optional prop, default true (`CodeEditor.jsx:67`) |
| Language indicator badge | Yes — top-right corner badge (`CodeEditor.jsx:176-184`) |
| Min/max height with scroll | Yes — 240px min, 400px max (`CodeEditor.jsx:42-48`) |
| Fallback textarea on load failure | Yes — both lazy import catch (`InputBar.jsx:5-15`) and init error fallback (`CodeEditor.jsx:136-153`) |

### Supported languages
Python, Java, JavaScript, C, C++, C#, Rust, SQL, Go, Kotlin, Swift, Ruby, R, MATLAB — all loaded dynamically via `codemirror.js:81-146`.

### What's missing vs. spec
- No AI-driven mode switching (no `[INPUT_MODE]` tag parsing)
- No manual mode override (current toggle is binary code/text, no math option)
- On submit, code is wrapped in markdown fences (`StudyContext.jsx:1209`) and `codeMode` is reset to false (`StudyContext.jsx:1211`) — the spec says mode should persist until changed

---

## 2. Current InputBar Component

**File:** `src/components/study/InputBar.jsx` (147 lines)

### What it renders
A fixed-bottom bar with:
1. **Skill update notification** — always-mounted container with maxHeight transition (lines 40-64)
2. **Input area** — either `<CodeEditor>` (code mode) or `<textarea>` (text mode), selected by `codeMode` boolean (lines 66-111)
3. **Code toggle button** — `</>` icon, accent-highlighted when active (lines 112-125)
4. **Send button** — arrow icon, disabled when empty or busy (lines 126-140)
5. **Code mode hint text** — "Esc exit · ↵ new line · ⌘↵ send" (line 142)

### Mode-switching mechanism
Binary: `codeMode ? <CodeEditor> : <textarea>`. There is no multi-mode system (text/code/math). The toggle is a single boolean, not an enum.

### State driving input variant
- `codeMode` (boolean) — from StudyContext
- `detectedLanguage` (string|null) — from StudyContext, passed to CodeEditor as `language` prop
- `input` (string) — shared value state for both textarea and CodeEditor

### Architecture assessment
InputBar is thin (147 lines) and delegates to CodeEditor for code rendering. Adding a third mode (math) requires changing the conditional from `codeMode ? A : B` to a switch/if-chain on a mode enum. The skill notification, send button, and layout container are mode-agnostic and won't need changes.

---

## 3. INPUT_MODE Tag Parsing

**Status: Does not exist in production code.**

- `INPUT_MODE` appears only in `docs/planning/dynamic-input-spec.md` and the diagnostic plan file — zero matches in `src/`.
- `SESSION_EVENT` also has zero matches in `src/` — it only appears in `docs/prompt-templates.md` (design docs, not implemented).
- The app DOES parse other structured tags from AI responses:
  - `[SKILL_UPDATE]...[/SKILL_UPDATE]` — parsed by `parseSkillUpdates()` in `study.js:1644`
  - `[SHOW_IMAGE]img_id[/SHOW_IMAGE]` — parsed by `parseImageTags()` in `study.js:1704`
  - `[UNLOCK_QUESTION]...[/UNLOCK_QUESTION]` — parsed by `parseQuestionUnlock()` in `study.js:1639`

These parsers use simple regex on the full response string. The same pattern can be used for `[INPUT_MODE: ...]` — a new parser function in `study.js` + call site in `StudyContext.jsx` where AI response processing happens.

---

## 4. Math Mode Dependencies

**Status: No external dependencies needed. Unicode insertion only.**

The spec calls for a toolbar of clickable symbol buttons that insert Unicode characters at cursor position. This is a pure DOM operation (`textarea.selectionStart/End`).

### Reusable popover/toolbar patterns in the app
- **`DatePicker.jsx`** (line 31) — described as a "dark-themed calendar popover". Uses absolute positioning, z-index layering, click-outside dismiss. The popover pattern (positioned container + event handling) could inform the collapsible toolbar, but the math toolbar is simpler — it's a fixed row above the textarea, not a floating popover.
- **`FolderPickerModal.jsx`** (line 163) — has a "Toolbar" comment, but it's a simple button row inside a modal. Not directly reusable.
- **`SettingsModal.jsx`** — modal overlay pattern with sections. Not applicable to toolbar.

**Assessment:** The math toolbar doesn't need to reuse existing patterns. It's a horizontal row of small buttons (grouped by category) positioned above the textarea. The closest analogy is the filter chips in SkillPicker (`.chipStyle`), but even that's not worth extracting — the math toolbar is simpler and self-contained.

**Key implementation detail:** The toolbar needs to insert at cursor position in a React-controlled textarea. This requires a ref to the textarea element and `selectionStart`/`selectionEnd` manipulation. The current `taRef` in StudyContext already provides this ref.

---

## 5. Code Mode Dependencies

**Status: Already installed and working. No new dependencies needed.**

CodeMirror 6 is fully integrated:
- **Core packages:** `@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/commands`, `@lezer/highlight`
- **Language packs:** 14 languages via `@codemirror/lang-*` and `@codemirror/legacy-modes`
- **Lazy loading:** All imports are dynamic (`codemirror.js:6-28`) to avoid white screen risk
- **Dark theme:** Custom theme matching the app palette (`codemirror.js:30-78`)
- **Syntax highlighting:** Full highlight style with 26 tag rules

The code editor is production-ready. No new packages needed for the dynamic input feature's code mode — it's already complete.

---

## 6. System Prompt Status

**Status: No INPUT_MODE instructions exist. Must be added.**

`buildSystemPrompt()` in `study.js:1634` returns a single large string. It contains:
- SKILL_UPDATE tag instructions (how to rate skills)
- SHOW_IMAGE tag instructions (how to display images)
- UNLOCK_QUESTION tag instructions (for assignment questions)

It does NOT contain:
- Any mention of INPUT_MODE
- Any instructions about switching input modes
- Any guidance on when to use code vs. math vs. text input

The spec provides the exact prompt text to add (under "Addition to Shared Tutoring Core"). This would be appended to the existing system prompt, following the same pattern as the other tag instructions.

---

## Summary: What Exists vs. What's Needed

| Component | Exists | Needs |
|---|---|---|
| Code editor (CodeMirror 6) | Full — syntax highlighting, line numbers, language badge, 14 langs | No changes (already spec-complete) |
| Code mode toggle | Binary button + keyboard shortcut | Expand to 3-way mode selector (text/code/math) |
| Math mode | Nothing | New: symbol toolbar + textarea combo |
| `[INPUT_MODE]` tag parsing | Nothing | New: regex parser in `study.js` + call site in StudyContext |
| AI-driven mode switching | Nothing — mode is client-side only | New: parse tags from AI responses, set mode state |
| Mode persistence | Code mode resets on submit (`StudyContext.jsx:1211`) | Change: mode persists until AI or user changes it |
| System prompt | No INPUT_MODE instructions | New: add prompt block per spec |
| `inputMode` state | `codeMode` boolean | Change: replace with `inputMode` enum ("text"/"code"/"math") |
| `codeLanguage` state | `detectedLanguage` string | Already exists — rename or keep as-is |
| Manual override | Single toggle button | New: 3-way mode selector UI in InputBar |
| Message metadata | `codeMode` boolean on user messages | Expand: `input_mode` + `code_language` fields |
| Practice mode integration | Code mode auto-detected at boot | Extend: also auto-detect math mode for math skills |

### Architecture recommendation
The core change is replacing the `codeMode` boolean with an `inputMode` enum in StudyContext. Everything else follows from that:
- InputBar renders based on `inputMode` instead of `codeMode`
- AI response processing adds `[INPUT_MODE]` parsing alongside existing `[SKILL_UPDATE]` parsing
- Mode persists across messages instead of resetting on submit
- The math toolbar is a new sub-component rendered when `inputMode === "math"`
- The CodeEditor component needs zero changes — it's already complete

---

## Output Receipt
**Agent:** Study Developer (diagnostic mode)
**Step:** 1
**Status:** Complete

### What Was Done
Investigated 6 areas of the dynamic input feature: current code input (fully implemented with CodeMirror 6), InputBar architecture (thin wrapper, binary mode), INPUT_MODE parsing (does not exist), math mode dependencies (none needed), code mode dependencies (already installed), and system prompt (no INPUT_MODE instructions).

### Files Deposited
- `study/knowledge/research/dynamic-input-diagnostic-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- None (diagnostic only — decisions deferred to blueprint step)

### Flags for CEO
- None

### Flags for Next Step
- Code editor is production-ready — no changes needed for dynamic input
- Core architectural change is `codeMode` boolean → `inputMode` enum
- Math toolbar is new UI (Unicode insertion, no external deps)
- `[INPUT_MODE]` parsing follows same pattern as existing `[SKILL_UPDATE]` parsing
- System prompt needs new block (spec provides exact text)
