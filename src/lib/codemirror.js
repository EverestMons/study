// Lazy loader for CodeMirror 6 — all imports are dynamic to avoid white screen risk

let _cmCore = null;
const _langCache = {};

export async function loadCMCore() {
  if (_cmCore) return _cmCore;
  const [view, state, language, commands, highlight] = await Promise.all([
    import("@codemirror/view"),
    import("@codemirror/state"),
    import("@codemirror/language"),
    import("@codemirror/commands"),
    import("@lezer/highlight"),
  ]);
  _cmCore = {
    EditorView: view.EditorView,
    keymap: view.keymap,
    lineNumbers: view.lineNumbers,
    placeholder: view.placeholder,
    EditorState: state.EditorState,
    Compartment: state.Compartment,
    syntaxHighlighting: language.syntaxHighlighting,
    indentWithTab: commands.indentWithTab,
    HighlightStyle: highlight.HighlightStyle,
    tags: highlight.tags,
  };
  return _cmCore;
}

export function buildDarkTheme(EditorView, HighlightStyle, syntaxHighlighting, tags) {
  const editorTheme = EditorView.theme({
    "&": { backgroundColor: "#13151A", color: "#E8EAF0" },
    ".cm-content": {
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: "13px", lineHeight: "1.6", caretColor: "#6C9CFC",
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6C9CFC" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "rgba(108,156,252,0.2) !important" },
    ".cm-gutters": { backgroundColor: "#0F1115", color: "#64748B", border: "none", minWidth: "36px" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px", fontSize: "11px" },
    ".cm-activeLine": { backgroundColor: "rgba(108,156,252,0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(108,156,252,0.08)" },
    ".cm-line": { padding: "0 12px" },
    "&.cm-focused": { outline: "none" },
    ".cm-placeholder": { color: "#64748B", fontStyle: "italic" },
    ".cm-scroller": { overflow: "auto" },
  }, { dark: true });

  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "#6C9CFC" },
    { tag: tags.controlKeyword, color: "#6C9CFC" },
    { tag: tags.operatorKeyword, color: "#6C9CFC" },
    { tag: tags.definitionKeyword, color: "#6C9CFC" },
    { tag: tags.moduleKeyword, color: "#6C9CFC" },
    { tag: tags.string, color: "#34D399" },
    { tag: tags.regexp, color: "#34D399" },
    { tag: tags.number, color: "#FBBF24" },
    { tag: tags.integer, color: "#FBBF24" },
    { tag: tags.float, color: "#FBBF24" },
    { tag: tags.bool, color: "#FBBF24" },
    { tag: tags.comment, color: "#64748B", fontStyle: "italic" },
    { tag: tags.lineComment, color: "#64748B", fontStyle: "italic" },
    { tag: tags.blockComment, color: "#64748B", fontStyle: "italic" },
    { tag: tags.typeName, color: "#F59E0B" },
    { tag: tags.className, color: "#F59E0B" },
    { tag: tags.function(tags.variableName), color: "#A78BFA" },
    { tag: tags.definition(tags.variableName), color: "#E8EAF0" },
    { tag: tags.propertyName, color: "#93C5FD" },
    { tag: tags.operator, color: "#8B95A5" },
    { tag: tags.punctuation, color: "#8B95A5" },
    { tag: tags.paren, color: "#8B95A5" },
    { tag: tags.squareBracket, color: "#8B95A5" },
    { tag: tags.brace, color: "#8B95A5" },
    { tag: tags.meta, color: "#8B95A5" },
  ]);

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}

export async function loadLanguage(langId) {
  if (!langId) return null;
  if (_langCache[langId]) return _langCache[langId];

  let ext = null;
  try {
    switch (langId) {
      case "python": { const m = await import("@codemirror/lang-python"); ext = m.python(); break; }
      case "java": { const m = await import("@codemirror/lang-java"); ext = m.java(); break; }
      case "javascript": { const m = await import("@codemirror/lang-javascript"); ext = m.javascript(); break; }
      case "c":
      case "c++": { const m = await import("@codemirror/lang-cpp"); ext = m.cpp(); break; }
      case "rust": { const m = await import("@codemirror/lang-rust"); ext = m.rust(); break; }
      case "sql": { const m = await import("@codemirror/lang-sql"); ext = m.sql(); break; }
      case "go": { const m = await import("@codemirror/lang-go"); ext = m.go(); break; }
      case "c#":
      case "kotlin": {
        const [legacy, lang] = await Promise.all([
          import("@codemirror/legacy-modes/mode/clike"),
          import("@codemirror/language"),
        ]);
        const mode = langId === "c#" ? legacy.csharp : legacy.kotlin;
        if (mode && typeof mode.token === "function") ext = lang.StreamLanguage.define(mode);
        break;
      }
      case "swift": {
        const [legacy, lang] = await Promise.all([
          import("@codemirror/legacy-modes/mode/swift"),
          import("@codemirror/language"),
        ]);
        if (legacy.swift && typeof legacy.swift.token === "function") ext = lang.StreamLanguage.define(legacy.swift);
        break;
      }
      case "ruby": {
        const [legacy, lang] = await Promise.all([
          import("@codemirror/legacy-modes/mode/ruby"),
          import("@codemirror/language"),
        ]);
        if (legacy.ruby && typeof legacy.ruby.token === "function") ext = lang.StreamLanguage.define(legacy.ruby);
        break;
      }
      case "r": {
        const [legacy, lang] = await Promise.all([
          import("@codemirror/legacy-modes/mode/r"),
          import("@codemirror/language"),
        ]);
        if (legacy.r && typeof legacy.r.token === "function") ext = lang.StreamLanguage.define(legacy.r);
        break;
      }
      case "matlab": {
        const [legacy, lang] = await Promise.all([
          import("@codemirror/legacy-modes/mode/octave"),
          import("@codemirror/language"),
        ]);
        if (legacy.octave && typeof legacy.octave.token === "function") ext = lang.StreamLanguage.define(legacy.octave);
        break;
      }
      default: break;
    }
  } catch (e) {
    console.warn("Failed to load CM language for:", langId, e);
  }

  if (ext) _langCache[langId] = ext;
  return ext;
}

export const LANG_DISPLAY = {
  python: "Python", java: "Java", javascript: "JavaScript",
  c: "C", "c++": "C++", "c#": "C#",
  rust: "Rust", sql: "SQL", go: "Go",
  kotlin: "Kotlin", swift: "Swift",
  ruby: "Ruby", r: "R", matlab: "MATLAB",
};
