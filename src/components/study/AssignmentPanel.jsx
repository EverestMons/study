import React from "react";
import { T } from "../../lib/theme.jsx";
import { generateSubmission, downloadBlob } from "../../lib/export.js";
import { useStudy } from "../../StudyContext.jsx";

export default function AssignmentPanel() {
  const {
    msgs, active,
    exporting, setExporting,
    focusContext,
    asgnWork, setAsgnWork,
    sidebarCollapsed, setSidebarCollapsed,
  } = useStudy();

  if (!asgnWork || msgs.length === 0) return null;

  return (
    <div style={{ width: sidebarCollapsed ? 48 : 340, borderLeft: "1px solid " + T.bd, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column", transition: "width 0.2s ease", overflow: "hidden" }}>
      {/* Toggle button */}
      <div style={{ padding: sidebarCollapsed ? "12px 0" : "8px 12px 0", display: "flex", justifyContent: sidebarCollapsed ? "center" : "flex-end" }}>
        <button onClick={() => setSidebarCollapsed(c => !c)}
          style={{ width: 24, height: 24, background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, transition: "all 0.15s ease", fontSize: 12, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          {sidebarCollapsed ? "\u25C0" : "\u25B6"}
        </button>
      </div>
      {sidebarCollapsed ? (
        /* Collapsed: show only progress */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ac, writingMode: "vertical-rl", textOrientation: "mixed" }}>
            {asgnWork.questions.filter(q => q.done).length}/{asgnWork.questions.length}
          </div>
        </div>
      ) : (
        /* Expanded: full sidebar */
        <>
      <div style={{ padding: "8px 16px 8px", borderBottom: "1px solid " + T.bd }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {focusContext?.assignment?.title || "Assignment"}
        </div>
        <div style={{ fontSize: 11, color: T.txD }}>
          {asgnWork.questions.filter(q => q.done).length} / {asgnWork.questions.length} complete
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {asgnWork.questions.map((q) => (
          <div key={q.id} style={{ marginBottom: 12 }}>
            {q.done ? (
              /* Completed question - collapsed */
              <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.gn }}>{q.id}</div>
                  <div style={{ fontSize: 10, color: T.gn }}>Done</div>
                </div>
                <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>{q.answer.substring(0, 80)}{q.answer.length > 80 ? "..." : ""}</div>
              </div>
            ) : q.unlocked ? (
              /* Active question - expanded with answer box */
              <div style={{ background: T.sf, border: "1px solid " + T.acB, borderRadius: 12, padding: 14, animation: "fadeIn 0.3s" }}>
                <div style={{ fontSize: 11, color: T.ac, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{q.id}</div>
                <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.6, marginBottom: 12 }}>{q.description}</div>
                <textarea
                  value={q.answer}
                  onChange={e => {
                    var val = e.target.value;
                    setAsgnWork(prev => ({
                      ...prev,
                      questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, answer: val } : pq)
                    }));
                  }}
                  placeholder="Write your answer here..."
                  style={{ width: "100%", minHeight: 100, background: T.bg, border: "1px solid " + T.bd, borderRadius: 8, padding: "10px 12px", color: T.tx, fontSize: 13, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box" }}
                />
                {q.answer.trim().length > 0 && (
                  <button onClick={() => {
                    setAsgnWork(prev => ({
                      ...prev,
                      questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, done: true } : pq)
                    }));
                  }}
                    style={{ marginTop: 8, background: T.gn, color: "#0F1115", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    Mark done
                  </button>
                )}
              </div>
            ) : (
              /* Locked question */
              <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.4 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.txM }}>{q.id}</div>
                <div style={{ fontSize: 11, color: T.txM, marginTop: 2 }}>Locked -- building skills</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Export DOCX button */}
      {asgnWork.questions.some(q => q.done) && (
        <div style={{ padding: 12, borderTop: "1px solid " + T.bd }}>
          <button disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              var title = focusContext?.assignment?.title || "Assignment";
              var blob = await generateSubmission(title, asgnWork.questions, active?.name || "Course");
              if (blob) downloadBlob(blob, title.replace(/[^a-zA-Z0-9]/g, "_") + "_answers.docx");
            } finally {
              setExporting(false);
            }
          }}
            style={{ width: "100%", background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: exporting ? 0.5 : 1 }}>
            {exporting ? "Exporting..." : "Export answers"}
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
