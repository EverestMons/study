import React from "react";
import { T } from "../../lib/theme.jsx";
import { useStudy } from "../../StudyContext.jsx";
import MathToolbar from "./MathToolbar.jsx";

const CodeEditor = React.lazy(() => import("./CodeEditor.jsx").catch(e => {
  console.error("CodeEditor chunk failed:", e);
  return { default: function FallbackEditor({ value, onChange, onSubmit, onEscape, disabled, placeholder, minHeight, maxHeight }) {
    return React.createElement("textarea", {
      value: value || "", onChange: e => onChange && onChange(e.target.value),
      onKeyDown: e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit && onSubmit(); } if (e.key === "Escape") { onEscape && onEscape(); } },
      disabled: disabled, placeholder: placeholder || "Enter code...",
      style: { width: "100%", minHeight: minHeight || 240, maxHeight: maxHeight || 400, background: "#13151A", color: "#E8EAF0", border: "1px solid #2A2F3A", borderRadius: 10, padding: 12, fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace", resize: "vertical" }
    });
  }};
}));

var ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };

var modeBtn = function(mode, active) {
  return {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "0 6px", height: 28, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: 600, transition: "all 0.15s ease",
    background: active ? T.acS : "transparent",
    color: active ? T.ac : T.txD,
  };
};

export default function InputBar() {
  var {
    msgs, input, setInput, inputMode, setInputMode, detectedLanguage,
    busy, practiceMode,
    currentSkillNotif,
    taRef, sendMessage,
  } = useStudy();

  if (msgs.length === 0 || practiceMode) return null;

  return (
    <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 16px", flexShrink: 0 }}
      onKeyDown={function(e) {
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
      }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Skill update notification */}
        <div style={{
          maxHeight: currentSkillNotif ? 32 : 0, overflow: "hidden",
          transition: "max-height 200ms ease",
          marginBottom: currentSkillNotif ? 8 : 0,
        }}>
          <div role="status" aria-live="polite" style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, fontWeight: 500,
            opacity: currentSkillNotif && currentSkillNotif.phase === "in" ? 1 : 0,
            transform: currentSkillNotif && currentSkillNotif.phase === "in" ? "translateY(0)" : "translateY(-2px)",
            transition: "opacity 300ms ease, transform 300ms ease",
          }}>
            {currentSkillNotif && <>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ratingColor[currentSkillNotif.rating] || T.ac, flexShrink: 0 }} />
              <span style={{ color: T.tx, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentSkillNotif.skillName}
              </span>
              <span style={{ color: T.txM }}>&middot;</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: ratingColor[currentSkillNotif.rating] || T.ac }}>
                {currentSkillNotif.rating}
              </span>
            </>}
          </div>
        </div>
        {/* Math toolbar */}
        {inputMode === "math" && <MathToolbar taRef={taRef} input={input} setInput={setInput} />}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          {inputMode === "code" ? (
            <div style={{ flex: 1 }}>
              <React.Suspense fallback={
                <div style={{ minHeight: 240, maxHeight: 400, background: "#13151A", borderRadius: 10, border: "1px solid " + T.bd, display: "flex", alignItems: "center", justifyContent: "center", color: T.txM, fontSize: 12 }}>
                  Loading editor...
                </div>
              }>
                <CodeEditor
                  value={input}
                  onChange={setInput}
                  language={detectedLanguage}
                  minHeight={240}
                  maxHeight={400}
                  onSubmit={sendMessage}
                  onEscape={function() { setInputMode("text"); }}
                  autoFocus
                  placeholder="Enter code..."
                />
              </React.Suspense>
            </div>
          ) : (
            <textarea ref={taRef} value={input} onChange={function(e) {
                setInput(e.target.value);
                var ta = e.target;
                ta.style.height = 'auto';
                var lineHeight = 14 * 1.5;
                var maxH = Math.round(lineHeight * 10) + 24;
                ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
                ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
              }}
              onKeyDown={function(e) {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); return; }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
              }}
              placeholder={inputMode === "math" ? "Type your answer (use toolbar for symbols)..." : "Type your answer or ask a question..."}
              rows={1}
              style={{
                flex: 1, borderRadius: 12, padding: "12px 16px", color: T.tx,
                transition: "border-color 0.2s",
                fontSize: 14, lineHeight: 1.5, background: T.sf,
                border: "1px solid " + T.bd, resize: "none", overflowY: "hidden"
              }} />
          )}
          {/* 3-way mode selector */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid " + T.bd, flexShrink: 0 }}>
            <button onClick={function() { setInputMode("text"); }} title="Text mode"
              style={modeBtn("text", inputMode === "text")}>T</button>
            <button onClick={function() { setInputMode("code"); }} title="Code mode (Ctrl+Shift+C)"
              style={modeBtn("code", inputMode === "code")}>&lt;/&gt;</button>
            <button onClick={function() { setInputMode("math"); }} title="Math mode (Ctrl+Shift+M)"
              style={modeBtn("math", inputMode === "math")}>&pi;</button>
          </div>
          <button onClick={sendMessage} disabled={!input.trim() || busy}
            onMouseEnter={function(e) { if (input.trim() && !busy) e.currentTarget.style.background = "#7DAAFD"; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = input.trim() && !busy ? T.ac : T.sf; }}
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
        {inputMode === "code" && <div style={{ fontSize: 10, color: T.txM, marginTop: 4, textAlign: "right" }}>Esc exit &#xB7; &#x23CE; new line &#xB7; {navigator.platform?.includes("Mac") ? "&#x2318;" : "Ctrl+"}&#x23CE; send</div>}
        {inputMode === "math" && <div style={{ fontSize: 10, color: T.txM, marginTop: 4, textAlign: "right" }}>&#x23CE; send &#xB7; &#x21E7;&#x23CE; new line &#xB7; Click symbols to insert</div>}
      </div>
    </div>
  );
}
