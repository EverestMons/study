import React from "react";
import { T } from "../../lib/theme.jsx";
import { generateSubmission, downloadBlob } from "../../lib/export.js";
import { useStudy } from "../../StudyContext.jsx";

export default function SessionSummary() {
  const {
    msgs, setScreen, setMsgs, setInput, setCodeMode,
    exporting, setExporting,
    setSessionMode, setFocusContext,
    setPickerData, setChunkPicker,
    setAsgnWork, setPracticeMode,
    setShowSkills, setSkillViewData,
    sessionSummary, setSessionSummary,
    setBreakDismissed, setSidebarCollapsed,
    sessionStartIdx, sessionSkillLog,
    cachedSessionCtx, sessionStartTime, discussedChunks,
    setSessionElapsed,
  } = useStudy();

  if (!sessionSummary) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 100, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }}>
      <div style={{ maxWidth: 500, width: "100%" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 24, textAlign: "center" }}>Session Complete</div>

        {/* Duration + Messages */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: T.sf, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.ac }}>{sessionSummary.duration || 0}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>minutes</div>
          </div>
          <div style={{ flex: 1, background: T.sf, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.ac }}>{sessionSummary.entry?.messageCount || msgs.length}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>messages</div>
          </div>
        </div>

        {/* Skills practiced */}
        {sessionSummary.skillChanges?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 10 }}>Skills Practiced</div>
            {sessionSummary.skillChanges.map((sc, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.sf, borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: T.tx }}>{sc.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: sc.rating === "easy" || sc.rating === "good" ? T.gn : T.am, fontWeight: 500 }}>{sc.rating}</span>
                  <span style={{ fontSize: 10, color: T.txD }}>{Math.round(sc.strength * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Topics covered */}
        {sessionSummary.entry?.topicsDiscussed?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 10 }}>Topics Covered</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sessionSummary.entry.topicsDiscussed.slice(0, 12).map((t, i) => (
                <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: T.acS, color: T.ac }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Breakthroughs */}
        {sessionSummary.entry?.wins?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.gn, marginBottom: 10 }}>Breakthroughs</div>
            {sessionSummary.entry.wins.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: T.txD, padding: "6px 10px", background: T.gnS, borderRadius: 8, marginBottom: 4, fontStyle: "italic" }}>"{w}"</div>
            ))}
          </div>
        )}

        {/* Export DOCX button — only if assignment work exists */}
        {sessionSummary.asgnWork?.questions?.some(q => q.done) && (
          <button disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              var title = sessionSummary.asgnWork.title || "Assignment";
              var blob = await generateSubmission(title, sessionSummary.asgnWork.questions, sessionSummary.courseName || "Course");
              if (blob) downloadBlob(blob, title.replace(/[^a-zA-Z0-9]/g, "_") + "_answers.docx");
            } finally {
              setExporting(false);
            }
          }}
            style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, opacity: exporting ? 0.5 : 1 }}>
            {exporting ? "Exporting..." : "Export answers (.docx)"}
          </button>
        )}

        <button onClick={() => {
          setSessionSummary(null); setScreen("home"); setMsgs([]); setInput(""); setCodeMode(false); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null); setShowSkills(false); setSkillViewData(null); sessionStartIdx.current = 0; sessionSkillLog.current = []; cachedSessionCtx.current = null; sessionStartTime.current = null; discussedChunks.current = new Set(); setSessionElapsed(0); setBreakDismissed(false); setSidebarCollapsed(false);
        }}
          style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: T.ac, color: "#0F1115", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
          Done
        </button>
      </div>
    </div>
  );
}
