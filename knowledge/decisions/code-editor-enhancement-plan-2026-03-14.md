# study — Code Editor Enhancement
## Execution Plan
**Date:** 2026-03-14
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Reusable CodeMirror 6 code editor with syntax highlighting, line numbers, language detection, and proper code rendering in chat history

---

## Feature Summary

Replace the plain `<textarea>` code input in the study app with a CodeMirror 6-based code editor component. The editor provides syntax highlighting (Java + 13 other languages already detected by `detectLanguage`), line numbers, a language badge, and spellcheck-disabled input. The component is reusable across InputBar (chat), PracticeMode (tiered practice), and future screens. User-submitted code messages render in the chat with syntax highlighting matching the editor. DOCX export continues to work with code answers.

## CEO Decisions (Locked In)

1. **CodeMirror 6** — lightweight, tree-shakeable, no Monaco overkill
2. **Syntax highlighting in chat history** — user code messages render with highlighted CodeMirror (read-only)
3. **Line numbers** — enabled in the editor
4. **Language badge** — small label showing detected language in the editor corner
5. **Minimum ~15 rows** in code mode to eliminate scrolling for 10-15 line methods

## What Already Exists

### Code Mode Infrastructure
- `codeMode` state in `StudyContext.jsx` (line 84) — boolean toggle
- `detectLanguage()` in `study.js` (line 1493) — scans course name + skill name for 14 languages (java, python, javascript, c++, c#, c, rust, go, sql, r, matlab, swift, kotlin, ruby). Returns language ID string or null.
- `bootWithFocus()` in `StudyContext.jsx` (line 913) — auto-enables code mode when `detectLanguage` returns truthy for the active course/skill
- `enterStudy()` in `StudyContext.jsx` (line 704) — resets `codeMode` to false on course entry

### InputBar.jsx (131 lines)
- Toggle button (`</>`) with keyboard shortcut (Ctrl+Shift+C)
- Code mode textarea: monospace font, 3 rows (80px min / 200px max), darker background, Tab/Shift-Tab indent, Enter = newline, Cmd+Enter = send
- Prose mode textarea: system font, 1 row, Enter = send

### sendMessage() in StudyContext.jsx (line 1005)
- Wraps code input in markdown fences: `` "```\n" + raw + "\n```" ``
- Stores `codeMode: isCode` on the user message object
- Resets `codeMode` to false after send

### MessageList.jsx (95 lines)
- **Assistant messages** → rendered via `renderMd()` which DOES handle code fences (lines 66-76 of theme.jsx — `<pre>` block with monospace, `#13151A` background, `T.ac` color)
- **User messages** → rendered as raw `<div>{m.content}</div>` — **BUG: code fences render as plain text, whitespace collapses**

### PracticeMode.jsx (394 lines)
- Has its own monospace textarea (line 211) with Tab indent support
- Fixed at 220px min / 400px max height
- No syntax highlighting, no line numbers, no spellcheck handling
- Deeply coupled to `setPracticeMode` state updates — the CodeEditor integration needs a controlled `value`/`onChange` interface

### renderMd() in theme.jsx (lines 52-97)
- Custom markdown renderer. Handles headings, code fences, bold, lists, numbered lists, empty lines.
- Code fence rendering: `<pre>` with monospace font, `#13151A` background, `T.ac` text color, 8px border-radius. **No syntax highlighting** — just monospace blue text.

### export.js (143 lines)
- `generateSubmission()` accepts questions with `codeMode?: boolean`
- Already detects code answers via `q.codeMode || looksLikeCode(cleanAnswer)`
- Renders code as monospace Consolas in shaded `F5F5F5` blocks
- `stripCodeFences()` helper removes ``` wrappers
- **No changes needed** — this already works correctly

### Theme Constants (theme.jsx)
- `T.bg: "#0F1115"`, `T.sf: "#1A1D24"`, `T.bd: "#2A2F3A"`, `T.ac: "#6C9CFC"`
- Code blocks currently use `#13151A` background

### Dependencies (package.json)
- No code editor library currently installed
- New dependency needed: `@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-java`, plus additional language packages

---

## Execution Steps

### Step 1 — UX: Code Editor Interaction Design
**Agent:** Study UX Designer
**Specialist file:** `study/agents/STUDY_UX_DESIGNER.md`
**Reads:**
- `study/agents/STUDY_UX_DESIGNER.md` (own agent file)
- This execution plan (CEO decisions section)
- `src/components/study/InputBar.jsx` (current code mode UX)
- `src/components/study/PracticeMode.jsx` (current practice code input)
- `src/components/study/MessageList.jsx` (current message rendering)

**Task:**
Design the interaction patterns for the code editor component across its three contexts:

1. **Chat input (InputBar):** How does the editor sit within the existing input bar layout? Sizing behavior (min 15 rows, max height, resize handle vs auto-grow). Language badge placement (bottom-right corner recommended — must not overlap line numbers). Toggle button relationship to the editor. How does the editor visually transition when toggling code mode on/off?

2. **Practice mode (PracticeMode):** The editor replaces the existing textarea. Sizing may differ from chat (practice problems need more space). Disabled state styling when confidence not yet rated or after submission. Pass/fail border color feedback (currently green/red border on textarea).

3. **Chat message history (MessageList):** User code messages render with syntax highlighting in a read-only view. Should this look identical to the editor (line numbers, language badge) or simpler (just highlighted code in a block)? How does it visually relate to the assistant's code blocks (which are currently plain monospace)?

4. **Consistency:** Should assistant code blocks also get syntax highlighting for visual consistency? (Flag for CEO if this affects scope.)

**Constraints:**
- Editor must match the app's dark theme (`T.bg`, `T.sf`, `T.bd`, `T.ac` color palette)
- Language badge must not interfere with code editing
- The toggle button stays in InputBar (not inside the editor component)
- No aesthetic decisions — define interaction patterns and layout, flag visual style choices to CEO

**Output deposit:** `study/knowledge/design/code-editor-ux-2026-03-14.md`
**Depends on:** None (parallel)

---

### Step 2 — Architecture: CodeEditor Component Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SYSTEMS_ANALYST.md` (own agent file)
- This execution plan (What Already Exists section)
- Step 1 deposit: `study/knowledge/design/code-editor-ux-2026-03-14.md`
- `src/components/study/InputBar.jsx` (current integration point)
- `src/components/study/PracticeMode.jsx` (second integration point)
- `src/components/study/MessageList.jsx` (read-only rendering point)
- `src/lib/theme.jsx` (theme constants + renderMd)
- `src/lib/study.js` lines 1493-1517 (detectLanguage function)
- `src/StudyContext.jsx` lines 80-90 (codeMode state), lines 1005-1013 (sendMessage code wrapping)

**Task:**
Design the `CodeEditor.jsx` component architecture and define integration points:

1. **CodeEditor.jsx props interface:**
   - `value` / `onChange` — controlled component (critical for PracticeMode's deeply nested state updates)
   - `language` — language ID from `detectLanguage` (maps to CodeMirror language extension)
   - `readOnly` — for chat message rendering
   - `disabled` — for PracticeMode confidence-gating (differs from readOnly: grayed out, not interactive)
   - `minHeight` / `maxHeight` — context-dependent sizing
   - `showLineNumbers` — boolean (true for input, potentially false for inline chat rendering — per UX design)
   - `showLanguageBadge` — boolean
   - `onSubmit` — callback for Cmd+Enter send behavior (InputBar needs this, PracticeMode doesn't)
   - `borderColor` — override for PracticeMode pass/fail feedback
   - `placeholder` — text shown when empty

2. **CodeMirror 6 extension stack:**
   - Base: `@codemirror/view` (EditorView), `@codemirror/state` (EditorState)
   - Language support: `@codemirror/language` + individual language packages for all 14 languages in `detectLanguage`
   - Theme: Custom dark theme matching `T.*` palette
   - Extensions: line numbers, bracket matching, `spellcheck: false`, `autocorrect: off`, `autocapitalize: off`
   - Key bindings: Tab indent (2 spaces), Shift-Tab dedent, Cmd+Enter → `onSubmit`, Escape → blur or exit code mode

3. **Language package mapping:**
   Map each `detectLanguage` ID to its CodeMirror language package. Specify whether to bundle all or lazy-load. Consider bundle size — list each package and its approximate gzipped size. Flag if any language lacks a CodeMirror package.

4. **Integration changes:**
   - `InputBar.jsx`: Replace code-mode textarea with `<CodeEditor>`. Prose textarea unchanged. Define how `value`/`onChange` maps to existing `input`/`setInput` state.
   - `PracticeMode.jsx`: Replace textarea with `<CodeEditor>`. Define how `value`/`onChange` maps to the deeply nested `setPracticeMode` state update pattern. `disabled` maps to confidence-gating. `borderColor` maps to pass/fail feedback.
   - `MessageList.jsx`: User messages with `codeMode: true` render a `<CodeEditor readOnly language={...}>` instead of raw `<div>`. Define how language is determined (store on message object? re-detect from course context?).
   - `sendMessage()`: Currently stores `codeMode: isCode` on message. Should also store `language: detectedLang` so MessageList can highlight without re-detection.

5. **renderMd code block enhancement:**
   Define whether assistant code blocks in `renderMd` should also use CodeMirror for highlighting (scope creep vs consistency). If yes, define the language detection approach for assistant messages (parse the language hint after ` ``` `). Flag to CEO if this significantly increases scope.

**Migration Impact:** None — no database changes. Pure frontend component addition.

**Constraints:**
- CodeEditor must be a single `.jsx` file in `src/components/shared/`
- Must not break existing code mode behavior during migration
- Must support controlled component pattern (React state drives editor content)
- Bundle size impact must be documented

**Output deposit:** `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md`
**Depends on:** Step 1 (UX design informs component API decisions)

---

### Step 3 — Development: CodeEditor Component + InputBar Integration
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md` (own agent file)
- Step 2 deposit: `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md`
- Step 1 deposit: `study/knowledge/design/code-editor-ux-2026-03-14.md`
- `src/components/study/InputBar.jsx` (file being modified)
- `src/StudyContext.jsx` lines 80-90, 1005-1013 (codeMode state + sendMessage)
- `src/lib/theme.jsx` (theme constants)
- `src/lib/study.js` lines 1493-1517 (detectLanguage)
- `package.json` (adding CodeMirror dependencies)

**Task:**
1. Install CodeMirror 6 dependencies (exact packages from blueprint)
2. Create `src/components/shared/CodeEditor.jsx` implementing the component API from the blueprint
3. Integrate into `InputBar.jsx`:
   - Replace code-mode `<textarea>` with `<CodeEditor>`
   - Wire `value={input}` / `onChange={setInput}`
   - Wire `onSubmit={sendMessage}` for Cmd+Enter
   - Wire `language` from `detectLanguage` result (needs access — may need to pass through context or compute locally)
   - Keep prose-mode textarea unchanged
   - Keep toggle button unchanged
   - Set `minHeight` to ~300px (15 rows x 20px line height), `maxHeight` to 500px
   - `showLineNumbers={true}`, `showLanguageBadge={true}`
4. Update `sendMessage()` in StudyContext.jsx to store `language` on user message objects (alongside existing `codeMode`)
5. Verify `npx vite build --mode development` passes
6. Document new dependency and its gzipped bundle impact

**Constraints:**
- Do NOT modify PracticeMode.jsx or MessageList.jsx in this step
- Do NOT modify FSRS, db.js, or any non-UI code except the `sendMessage` language storage
- Do NOT break prose mode input behavior
- The toggle and Ctrl+Shift+C shortcut must continue to work
- Code mode rows must be at least 15 (no more 3-row tiny textarea)

**Output deposit:** `study/knowledge/development/code-editor-inputbar-2026-03-14.md`
**Depends on:** Step 2 (blueprint defines component API and dependency list)

---

### Step 4 — Development: PracticeMode Integration
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md` (own agent file)
- Step 2 deposit: `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md`
- Step 3 deposit: `study/knowledge/development/code-editor-inputbar-2026-03-14.md` (for any API adjustments made during Step 3)
- `src/components/study/PracticeMode.jsx` (file being modified)
- `src/components/shared/CodeEditor.jsx` (component from Step 3)

**Task:**
1. Replace the PracticeMode textarea (lines 211-257) with `<CodeEditor>`
2. Wire the controlled component:
   - `value={problem.studentAnswer || problem.starterCode || ""}`
   - `onChange` maps to the existing deeply nested `setPracticeMode` state update
   - `disabled` maps to `problem.passed !== null || pm.evaluating || problem.confidenceRating === null`
   - `borderColor` maps to pass/fail feedback: `pm.feedback ? (problem.passed ? T.gn : T.rd) : T.bd`
3. Wire `language` from `pm.set.detectedLanguage` (already stored on practice sets by `createPracticeSet`)
4. Remove the manual Tab/Shift-Tab key handlers (lines 231-245) — CodeMirror handles this natively
5. Sizing: `minHeight={220}` (matches current), `maxHeight={400}`
6. `readOnly={false}`, `showLineNumbers={true}`, `showLanguageBadge={true}`
7. Verify build passes

**Constraints:**
- Do NOT change the PracticeMode state structure or evaluation logic
- The disabled/enabled gating on confidence rating must still work
- Pass/fail border color feedback must still work
- Tab indent behavior must be functionally identical (2-space indent)

**Output deposit:** `study/knowledge/development/code-editor-practicemode-2026-03-14.md`
**Depends on:** Step 3 (CodeEditor.jsx must exist)

---

### Step 5 — Development: Chat Message Code Rendering
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md` (own agent file)
- Step 2 deposit: `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md`
- Step 1 deposit: `study/knowledge/design/code-editor-ux-2026-03-14.md`
- `src/components/study/MessageList.jsx` (file being modified)
- `src/lib/theme.jsx` (renderMd — may be modified for assistant code blocks)
- `src/components/shared/CodeEditor.jsx` (component from Step 3)

**Task:**
1. **User code messages:** In MessageList.jsx, detect user messages with `codeMode: true`. Instead of `<div>{m.content}</div>`, extract the code content (strip the ``` fences from `m.content`), and render via `<CodeEditor readOnly value={code} language={m.language} showLineNumbers={false} showLanguageBadge={true} />`. Keep the user message bubble styling (background, border-radius, alignment) — the CodeEditor renders inside it.

2. **Backward compatibility:** Messages sent before this change won't have `m.language`. Fall back to detecting from the active course context, or render without highlighting (just monospace).

3. **Assistant code blocks (scope decision from UX/SA):** If the blueprint recommends upgrading `renderMd` code blocks to use CodeMirror, implement it. The language hint is available after ``` (e.g., ```java). If not recommended, leave `renderMd` as-is.

4. Verify build passes

**Constraints:**
- Do NOT change how assistant text messages render
- Do NOT change the `renderMd` heading/list/bold rendering
- User code messages must still show the timestamp
- The visual distinction between user and assistant messages must be preserved

**Output deposit:** `study/knowledge/development/code-editor-messagelist-2026-03-14.md`
**Depends on:** Step 3 (CodeEditor.jsx must exist). Can run parallel with Step 4.

---

### Step 6 — QA: Full Feature Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SECURITY_TESTING_ANALYST.md` (own agent file)
- Step 2 deposit: `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md`
- Steps 3-5 deposits (development logs)
- `src/components/shared/CodeEditor.jsx`
- `src/components/study/InputBar.jsx`
- `src/components/study/PracticeMode.jsx`
- `src/components/study/MessageList.jsx`

**Task:**
Test the following scenarios:

**InputBar (Chat):**
1. Toggle code mode on/off — editor appears/disappears correctly
2. Ctrl+Shift+C keyboard shortcut still works
3. Escape exits code mode
4. Type 15-line Java method — no scrolling needed, line numbers visible
5. Cmd+Enter sends message
6. Enter inserts newline (does NOT send)
7. Tab inserts 2 spaces
8. Language badge shows "Java" for a Java course
9. Spellcheck does NOT activate (no red underlines on `System.out.println`)
10. After send, code mode resets to prose
11. Sent code message appears highlighted in chat history

**PracticeMode:**
12. Code editor appears for practice problems
13. Disabled state works (before confidence rating)
14. Pass/fail border colors work after evaluation
15. Tab indent works
16. Starter code displays correctly
17. Language badge shows correct language

**Message History:**
18. User code messages render with syntax highlighting
19. User code messages preserve indentation and line breaks
20. Old messages without `language` field still render (fallback)
21. Assistant code blocks still render correctly (regression check)
22. Timestamps still visible on user code messages

**General:**
23. Prose mode input completely unaffected
24. Build passes (`npx vite build --mode development`)
25. No new console errors or warnings
26. Bundle size impact documented and reasonable (<50KB gzipped added)

**Severity classification:**
- 🔴 Critical: Code mode doesn't activate, messages don't render, build fails
- 🟡 Minor: Visual polish issues, edge case formatting
- 🔵 Advisory: Suggestions for future improvement

**Output deposit:** `study/knowledge/qa/code-editor-qa-2026-03-14.md`
**Depends on:** Steps 3, 4, 5 (all development complete)

---

### Step 7 — UX Validation: Code Editor Experience
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/agents/STUDY_UX_VALIDATOR.md` (own agent file)
- Step 1 deposit: `study/knowledge/design/code-editor-ux-2026-03-14.md`
- Steps 3-5 deposits (what was built)
- Step 6 deposit: `study/knowledge/qa/code-editor-qa-2026-03-14.md`

**Task:**
Validate the implemented code editor experience against the UX design:

1. **Editor sizing** — is 15 rows sufficient? Does the editor feel natural in the chat input context?
2. **Language badge** — readable without being distracting? Positioned correctly?
3. **Code mode toggle** — smooth transition? Clear visual state change?
4. **Chat message rendering** — does highlighted code in user messages feel integrated with the chat flow? Visual consistency between user and assistant code blocks?
5. **PracticeMode** — does the editor feel appropriate for practice problem answers? Disabled state clear?
6. **Learning science alignment** — does the improved code input support or risk undermining the learning process? (e.g., does syntax highlighting give too much "help" during practice assessments?)

**Output deposit:** `study/knowledge/design/validation/code-editor-uxv-2026-03-14.md`
**Depends on:** Step 6 (QA must pass first)

---

### Step 8 — Closeout: Status + Index Updates
**Agent:** Study Product Analyst
**Specialist file:** `study/agents/STUDY_PRODUCT_ANALYST.md`
**Reads:**
- `study/agents/STUDY_PRODUCT_ANALYST.md` (own agent file)
- All step deposits (Steps 1-7)
- `study/PROJECT_STATUS.md` (to update)
- `study/knowledge/KNOWLEDGE_INDEX.md` (to update)

**Task:**
1. Update `PROJECT_STATUS.md`:
   - Add "Code Editor Enhancement" to "What Is Working" table
   - Add development activity entries
   - Update codebase summary (new file count, LOC, new dependency)
2. Update `knowledge/KNOWLEDGE_INDEX.md` with all new files from Steps 1-7
3. Compile any open flags from step receipts into a summary

**Output deposit:** Updated `study/PROJECT_STATUS.md` and `study/knowledge/KNOWLEDGE_INDEX.md`
**Depends on:** Steps 6, 7 (all validation complete)

---

## Dependency Chain

```
Step 1 (UX Design) ──────┐
                          ├──→ Step 2 (Architecture) ──→ Step 3 (DEV: CodeEditor + InputBar)
                          │                                       │
                          │                                       ├──→ Step 4 (DEV: PracticeMode)  ──┐
                          │                                       │                                   │
                          │                                       └──→ Step 5 (DEV: MessageList)  ───┤
                          │                                                                           │
                          │                                                                           ├──→ Step 6 (QA) ──→ Step 7 (UXV) ──→ Step 8 (Closeout)
```

**Parallel lanes:**
- Steps 4 and 5 can run in parallel (both depend on Step 3 but don't depend on each other)

---

## How to Execute in Claude Code

Each step is run as a separate Claude Code session. Assemble the prompt from:

1. **Agent identity:** "You are the [Specialist Name]. Read your agent file at `study/agents/[FILE].md`"
2. **Reads:** "Before starting, read these files: [list from step]"
3. **Task:** Copy the Task section verbatim from the step
4. **Constraints:** Copy the Constraints section verbatim
5. **Deposit instruction:** "When complete, write your output to [deposit path] and include an Output Receipt at the bottom"

**Example prompt for Step 3:**
```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/code-editor-blueprint-2026-03-14.md
- study/knowledge/design/code-editor-ux-2026-03-14.md
- src/components/study/InputBar.jsx
- src/StudyContext.jsx (lines 80-90 and 1005-1013)
- src/lib/theme.jsx
- src/lib/study.js (lines 1493-1517)
- package.json

[Paste Task section from Step 3]
[Paste Constraints section from Step 3]

When complete, write your development log to study/knowledge/development/code-editor-inputbar-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Knowledge Base Deposits (Expected)

| Step | File | Location |
|---|---|---|
| 1 | Code editor UX design | `study/knowledge/design/code-editor-ux-2026-03-14.md` |
| 2 | Code editor component blueprint | `study/knowledge/architecture/code-editor-blueprint-2026-03-14.md` |
| 3 | InputBar integration dev log | `study/knowledge/development/code-editor-inputbar-2026-03-14.md` |
| 4 | PracticeMode integration dev log | `study/knowledge/development/code-editor-practicemode-2026-03-14.md` |
| 5 | MessageList rendering dev log | `study/knowledge/development/code-editor-messagelist-2026-03-14.md` |
| 6 | QA report | `study/knowledge/qa/code-editor-qa-2026-03-14.md` |
| 7 | UX validation report | `study/knowledge/design/validation/code-editor-uxv-2026-03-14.md` |
| 8 | Updated PROJECT_STATUS.md | `study/PROJECT_STATUS.md` |
| 8 | Updated KNOWLEDGE_INDEX.md | `study/knowledge/KNOWLEDGE_INDEX.md` |

---

## Open Questions for CEO During Execution

1. **Assistant code block highlighting:** Step 2 (SA) will flag whether upgrading `renderMd` code blocks to use CodeMirror is worth the scope. The SA should present the tradeoff (visual consistency vs. additional rendering weight per assistant message). CEO decides during execution.

2. **Bundle size threshold:** If CodeMirror + all 14 language packages exceeds ~50KB gzipped, the SA may recommend lazy-loading less common languages. CEO may need to approve the strategy.

3. **PracticeMode learning science concern:** UX Validator (Step 7) will assess whether syntax highlighting during practice assessments gives students too much assistance. If flagged, CEO decides whether to disable highlighting in practice mode or keep it.
