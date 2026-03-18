import React from "react";
import { T } from "../../lib/theme.jsx";
import { useStudy } from "../../StudyContext.jsx";

const CodeEditor = React.lazy(() => import("./CodeEditor.jsx"));

const ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };

export default function InputBar() {
  const {
    msgs, input, setInput, codeMode, setCodeMode, detectedLanguage,
    busy, practiceMode,
    currentSkillNotif,
    taRef, sendMessage,
  } = useStudy();

  if (msgs.length === 0 || practiceMode) return null;

  return (
    <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 16px", flexShrink: 0 }}
      onKeyDown={e => {
        // Ctrl/Cmd+Shift+C toggles code mode (works regardless of focus)
        if (e.key === "C" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setCodeMode(c => !c);
          return;
        }
      }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Skill update notification — always mounted for smooth expand/collapse */}
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
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          {codeMode ? (
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
                  onEscape={() => setCodeMode(false)}
                  autoFocus
                  placeholder="Enter code..."
                />
              </React.Suspense>
            </div>
          ) : (
            <textarea ref={taRef} value={input} onChange={e => {
                setInput(e.target.value);
                // Auto-grow: reset height to measure scrollHeight, cap at ~10 lines
                const ta = e.target;
                ta.style.height = 'auto';
                const lineHeight = 14 * 1.5; // fontSize * lineHeight
                const maxH = Math.round(lineHeight * 10) + 24; // 10 lines + padding
                ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
                ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
              }}
              onKeyDown={e => {
                // Cmd/Ctrl+Enter always sends
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); return; }
                // Enter in prose mode sends
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
              }}
              placeholder="Type your answer or ask a question..."
              rows={1}
              style={{
                flex: 1, borderRadius: 12, padding: "12px 16px", color: T.tx,
                transition: "border-color 0.2s",
                fontSize: 14, lineHeight: 1.5, background: T.sf,
                border: "1px solid " + T.bd, resize: "none", overflowY: "hidden"
              }} />
          )}
          <button onClick={() => setCodeMode(c => !c)}
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
        {codeMode && <div style={{ fontSize: 10, color: T.txM, marginTop: 4, textAlign: "right" }}>Esc exit &#xB7; &#x23CE; new line &#xB7; {navigator.platform?.includes("Mac") ? "&#x2318;" : "Ctrl+"}&#x23CE; send</div>}
      </div>
    </div>
  );
}
