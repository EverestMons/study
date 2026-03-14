import React from "react";
import { T, renderMd } from "../../lib/theme.jsx";
import { parseSkillUpdates } from "../../lib/study.js";
import { useStudy } from "../../StudyContext.jsx";

const CodeEditor = React.lazy(() => import("./CodeEditor.jsx"));

export default function MessageList() {
  const {
    msgs, booting, status, processingMatId,
    cachedSessionCtx, extractionCancelledRef,
    endRef, timeAgo,
  } = useStudy();

  const ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };
  const ratingBg = { easy: T.gnS, good: T.gnS, hard: T.amS, struggled: T.amS };

  return (
    <>
      {msgs.map((m, i) => {
        const isUser = m.role === "user";
        const isAsst = m.role === "assistant";
        const ts = m.ts ? timeAgo(m.ts) : null;
        // Parse skill update pills from assistant messages
        const skillPills = isAsst && m.content ? parseSkillUpdates(m.content) : [];
        return (
        <div key={i} style={{ marginBottom: 28, animation: "fadeIn 0.25s", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
          {/* Thin separator before user messages (after the first) */}
          {isUser && i > 0 && <div style={{ width: "100%", height: 1, background: T.bd, opacity: 0.3, marginBottom: 20 }} />}
          {isAsst && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: T.ac, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>Study</div>
              {ts && <div style={{ fontSize: 10, color: T.txM }}>{ts}</div>}
            </div>
          )}
          <div style={{
            maxWidth: isUser ? "80%" : "100%",
            background: isUser ? T.acS : "transparent",
            border: isUser ? "1px solid " + T.acB : "none",
            borderLeft: isAsst ? "2px solid rgba(108,156,252,0.25)" : "none",
            borderRadius: isUser ? "16px 16px 4px 16px" : "0",
            padding: isUser ? "12px 16px" : "4px 0 4px 12px",
            color: T.tx, lineHeight: 1.7, fontSize: 15
          }}>
            {isAsst ? (m.content ? renderMd(m.content) : (
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 16, verticalAlign: "middle" }}>
                {[0, 1, 2].map(d => <span key={d} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.ac, animation: "dotPulse 1.2s ease-in-out infinite", animationDelay: (d * 0.2) + "s" }} />)}
              </span>
            )) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                {m.codeMode ? (
                  <React.Suspense fallback={<pre style={{ fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: "pre-wrap", color: T.ac }}>{m.content.replace(/^```\n?/, "").replace(/\n?```$/, "")}</pre>}>
                    <CodeEditor
                      value={m.content.replace(/^```\n?/, "").replace(/\n?```$/, "")}
                      language={m.detectedLanguage}
                      readOnly
                      minHeight={null}
                      maxHeight={null}
                      showLineNumbers
                      showLanguageBadge={false}
                    />
                  </React.Suspense>
                ) : (
                  <div>{m.content}</div>
                )}
                {ts && <div style={{ fontSize: 10, color: T.txM, marginTop: 4 }}>{ts}</div>}
              </div>
            )}
          </div>
          {/* Skill update pills */}
          {skillPills.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, paddingLeft: 12 }}>
              {skillPills.map((sp, si) => {
                const allSk = cachedSessionCtx.current?.skills || [];
                const sk = allSk.find(s => s.id === sp.skillId || s.conceptKey === sp.skillId);
                return (
                  <span key={si} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: ratingBg[sp.rating] || T.acS, color: ratingColor[sp.rating] || T.ac, fontWeight: 500 }}>
                    {sk?.name || sp.skillId}: {sp.rating}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
      {/* Books loader — only during boot before streaming starts (status text visible) */}
      {booting && status && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content !== undefined) && !processingMatId && (
        <div style={{ padding: "16px 0", animation: "fadeIn 0.2s" }}>
          <div style={{ fontSize: 11, color: T.ac, marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{status || "Reading materials..."}</div>
          <svg width="64" height="28" viewBox="0 0 64 28" style={{ display: "block" }}>
            <rect x="2" y="24" width="60" height="2" rx="1" fill={T.bd} style={{ animation: "shelfPulse 2s ease-in-out infinite" }} />
            <rect x="8" y="10" width="6" height="14" rx="1" fill={T.ac} style={{ animation: "bookSlide1 3.2s ease-in-out infinite" }} />
            <rect x="16" y="12" width="5" height="12" rx="1" fill="#F59E0B" style={{ animation: "bookSlide2 2.8s ease-in-out 0.3s infinite" }} />
            <rect x="23" y="8" width="7" height="16" rx="1" fill={T.ac} opacity="0.6" style={{ animation: "bookSlide3 3.5s ease-in-out 0.6s infinite" }} />
            <rect x="32" y="14" width="5" height="10" rx="1" fill="#8B5CF6" style={{ animation: "bookSlide4 3s ease-in-out 0.15s infinite" }} />
            <rect x="39" y="11" width="6" height="13" rx="1" fill={T.ac} opacity="0.8" style={{ animation: "bookSlide1 3.4s ease-in-out 0.8s infinite" }} />
            <rect x="47" y="13" width="5" height="11" rx="1" fill="#F59E0B" opacity="0.7" style={{ animation: "bookSlide2 3.1s ease-in-out 0.5s infinite" }} />
          </svg>
          {status.toLowerCase().includes("extract") && (
            <button onClick={() => { extractionCancelledRef.current = true; }}
              style={{ marginTop: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 11, color: T.txD, cursor: "pointer" }}>
              Stop extraction
            </button>
          )}
        </div>
      )}
      <div ref={endRef} />
    </>
  );
}
