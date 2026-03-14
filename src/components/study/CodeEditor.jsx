import React, { useEffect, useRef, useState, useCallback } from "react";
import { T } from "../../lib/theme.jsx";
import { loadCMCore, buildDarkTheme, loadLanguage, LANG_DISPLAY } from "../../lib/codemirror.js";

export default function CodeEditor({
  value, onChange, language, readOnly, disabled,
  minHeight = 240, maxHeight = 400,
  onSubmit, onEscape, autoFocus,
  showLineNumbers = true, showLanguageBadge = true,
  borderColor, placeholder: placeholderText,
}) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const langCompRef = useRef(null);
  const editCompRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Stable callback refs to avoid re-creating editor
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);

  // Create editor view
  useEffect(() => {
    let destroyed = false;
    (async () => {
      const cm = await loadCMCore();
      if (destroyed) return;

      const langComp = new cm.Compartment();
      const editComp = new cm.Compartment();
      langCompRef.current = langComp;
      editCompRef.current = editComp;

      const darkTheme = buildDarkTheme(cm.EditorView, cm.HighlightStyle, cm.syntaxHighlighting, cm.tags);

      const heightTheme = cm.EditorView.theme({
        "&": {
          ...(minHeight != null ? { minHeight: minHeight + "px" } : {}),
          ...(maxHeight != null ? { maxHeight: maxHeight + "px" } : {}),
        },
        ".cm-scroller": { overflow: "auto" },
      });

      const extensions = [
        ...darkTheme,
        heightTheme,
        cm.EditorView.updateListener.of(update => {
          if (update.docChanged && onChangeRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        cm.keymap.of([
          cm.indentWithTab,
          { key: "Mod-Enter", run: () => { if (onSubmitRef.current) { onSubmitRef.current(); return true; } return false; } },
          { key: "Escape", run: () => { if (onEscapeRef.current) { onEscapeRef.current(); return true; } return false; } },
        ]),
        langComp.of([]),
        editComp.of(cm.EditorView.editable.of(!readOnly && !disabled)),
      ];

      if (showLineNumbers) extensions.push(cm.lineNumbers());
      if (placeholderText) extensions.push(cm.placeholder(placeholderText));

      const state = cm.EditorState.create({
        doc: value || "",
        extensions,
      });

      const view = new cm.EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;
      setLoading(false);

      if (autoFocus) setTimeout(() => view.focus(), 0);
    })();

    return () => {
      destroyed = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-time setup

  // Sync value from outside
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value || "" },
      });
    }
  }, [value]);

  // Load and apply language
  useEffect(() => {
    if (!viewRef.current || !langCompRef.current) return;
    let cancelled = false;
    (async () => {
      const ext = await loadLanguage(language);
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: langCompRef.current.reconfigure(ext ? [ext] : []),
      });
    })();
    return () => { cancelled = true; };
  }, [language]);

  // Update editable when readOnly/disabled change
  const updateEditable = useCallback(async () => {
    if (!viewRef.current || !editCompRef.current) return;
    const cm = await loadCMCore();
    viewRef.current.dispatch({
      effects: editCompRef.current.reconfigure(cm.EditorView.editable.of(!readOnly && !disabled)),
    });
  }, [readOnly, disabled]);
  useEffect(() => { updateEditable(); }, [updateEditable]);

  return (
    <div style={{
      border: "1px solid " + (borderColor || T.bd),
      borderRadius: 10, overflow: "hidden",
      position: "relative",
      opacity: disabled ? 0.5 : 1,
      transition: "opacity 0.2s",
    }}>
      {loading && (
        <div style={{
          background: "#13151A",
          ...(minHeight != null ? { minHeight } : { minHeight: 80 }),
          ...(maxHeight != null ? { maxHeight } : {}),
          display: "flex", alignItems: "center", justifyContent: "center",
          color: T.txM, fontSize: 12,
        }}>
          Loading editor...
        </div>
      )}
      <div ref={containerRef} style={{ display: loading ? "none" : "block" }} />
      {showLanguageBadge && language && LANG_DISPLAY[language] && !loading && (
        <div style={{
          position: "absolute", top: 6, right: 10,
          fontSize: 10, color: T.txM, pointerEvents: "none",
          letterSpacing: "0.03em", opacity: 0.7,
        }}>
          {LANG_DISPLAY[language]}
        </div>
      )}
    </div>
  );
}
