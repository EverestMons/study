import React from "react";
import { T } from "../../lib/theme.jsx";
import { useStudy } from "../../StudyContext.jsx";

export default function InputBar() {
  const {
    msgs, input, setInput, codeMode, setCodeMode,
    busy, practiceMode,
    focusContext, sessionMode,
    taRef, sendMessage,
  } = useStudy();

  if (msgs.length === 0 || practiceMode) return null;

  return (
    <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 16px", flexShrink: 0 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Mode context bar */}
        {(focusContext || sessionMode) && (
          <div style={{ fontSize: 11, color: T.txM, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ background: T.acS, color: T.ac, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
              {focusContext?.type === "assignment" ? "HW" : focusContext?.type === "skill" ? "SK" : focusContext?.type === "recap" ? "RC" : focusContext?.type === "exam" ? "XM" : focusContext?.type === "explore" ? "XP" : sessionMode?.toUpperCase()?.slice(0, 2) || ""}
            </span>
            <span>
              {focusContext?.type === "assignment" ? "Assignment: " + (focusContext.assignment?.title || "")
                : focusContext?.type === "skill" ? "Skill: " + (focusContext.skill?.name || "")
                : focusContext?.type === "recap" ? "Session Recap"
                : focusContext?.type === "exam" ? "Exam Prep: " + (focusContext.materials?.map(m => m.name).join(", ") || "")
                : focusContext?.type === "explore" ? "Explore: " + (focusContext.topic || "")
                : sessionMode || ""}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Ctrl/Cmd+Shift+C toggles code mode
              if (e.key === "C" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                var savedPos = e.target.selectionStart;
                setCodeMode(c => !c);
                setTimeout(() => { if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = savedPos; taRef.current.focus(); } }, 0);
                return;
              }
              // Escape exits code mode
              if (e.key === "Escape" && codeMode) { setCodeMode(false); return; }
              // Cmd/Ctrl+Enter always sends
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); return; }
              // Enter in prose mode sends; in code mode inserts newline (default)
              if (e.key === "Enter" && !e.shiftKey && !codeMode) { e.preventDefault(); sendMessage(); return; }
              // Tab inserts 2 spaces (code mode only)
              if (e.key === "Tab" && codeMode && !e.shiftKey) {
                e.preventDefault();
                var ta = e.target, start = ta.selectionStart, end = ta.selectionEnd;
                var newVal = input.substring(0, start) + "  " + input.substring(end);
                setInput(newVal);
                setTimeout(() => { if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = start + 2; } }, 0);
                return;
              }
              // Shift+Tab dedents current line (code mode only)
              if (e.key === "Tab" && codeMode && e.shiftKey) {
                e.preventDefault();
                var ta2 = e.target, pos = ta2.selectionStart;
                var lineStart = input.lastIndexOf("\n", pos - 1) + 1;
                var lineText = input.substring(lineStart);
                var spaces = 0;
                if (lineText.startsWith("  ")) spaces = 2;
                else if (lineText.startsWith(" ")) spaces = 1;
                if (spaces > 0) {
                  var dedented = input.substring(0, lineStart) + input.substring(lineStart + spaces);
                  setInput(dedented);
                  var newPos = Math.max(lineStart, pos - spaces);
                  setTimeout(() => { if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = newPos; } }, 0);
                }
                return;
              }
            }}
            placeholder={codeMode ? "Enter code..." : "Type your answer or ask a question..."}
            rows={codeMode ? 3 : 1}
            style={{
              flex: 1, borderRadius: 12, padding: "12px 16px", color: T.tx,
              transition: "all 0.2s",
              ...(codeMode ? {
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 13, lineHeight: 1.6, background: "#1A1D24",
                border: "1px solid " + T.acB, minHeight: 80, maxHeight: 200,
                resize: "vertical", tabSize: 2
              } : {
                fontSize: 14, lineHeight: 1.5, background: T.sf,
                border: "1px solid " + T.bd, maxHeight: 150, resize: "none"
              })
            }} />
          <button onClick={() => {
              var savedPos = taRef.current?.selectionStart || 0;
              setCodeMode(c => !c);
              setTimeout(() => { if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = savedPos; taRef.current.focus(); } }, 0);
            }}
            aria-label="Toggle code input mode"
            aria-pressed={codeMode}
            style={{
              width: 32, height: 44, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, fontFamily: "monospace", cursor: "pointer",
              transition: "all 0.2s",
              color: codeMode ? T.ac : T.txD,
              background: codeMode ? T.acS : "transparent",
              border: codeMode ? "1px solid " + T.acB : "none"
            }}
            title="Code mode (Ctrl+Shift+C)"
          >&lt;/&gt;</button>
          <button onClick={sendMessage} disabled={!input.trim() || busy}
            onMouseEnter={e => { if (input.trim() && !busy) e.currentTarget.style.background = "#7DAAFD"; }}
            onMouseLeave={e => { e.currentTarget.style.background = input.trim() && !busy ? T.ac : T.sf; }}
            style={{
              background: input.trim() && !busy ? T.ac : T.sf,
              color: input.trim() && !busy ? "#0F1115" : T.txM,
              border: "none", borderRadius: 12, width: 44, height: 44,
              cursor: input.trim() && !busy ? "pointer" : "default",
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease"
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {codeMode && <div style={{ fontSize: 10, color: T.txM, marginTop: 4, textAlign: "right" }}>&#x23CE; new line &middot; {navigator.platform?.includes("Mac") ? "&#x2318;" : "Ctrl+"}&#x23CE; send</div>}
      </div>
    </div>
  );
}
