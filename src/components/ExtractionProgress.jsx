import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function ExtractionProgress() {
  const { bgExtraction, status, setScreen, extractionCancelledRef } = useStudy();

  if (!bgExtraction) return null;

  const mats = bgExtraction.materials;
  const current = mats.find(m => m.status === 'extracting' || m.status === 'awaiting_decision');
  const doneCount = mats.filter(m => m.status === 'done' || m.status === 'skipped' || m.status === 'error').length;
  const totalCount = mats.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const allDone = doneCount === totalCount;

  return (
    <div
      onClick={() => setScreen("materials")}
      style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 100, cursor: "pointer",
        background: "rgba(15,17,21,0.92)", backdropFilter: "blur(8px)",
        borderRadius: 12, padding: "10px 20px", maxWidth: 480, width: "90%",
        border: "1px solid " + T.bd,
        animation: "fadeIn 0.3s ease",
      }}
    >
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {!allDone && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {allDone ? "Extraction complete" : current ? current.name : "Extracting skills..."}
            </span>
            <span style={{ fontSize: 12, color: T.txM, flexShrink: 0 }}>
              ({doneCount}/{totalCount})
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ width: "100%", height: 3, borderRadius: 2, background: T.bg, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ height: "100%", borderRadius: 2, background: allDone ? T.gn : T.ac, width: progressPct + "%", transition: "width 0.4s ease" }} />
          </div>
          {status && !allDone && (
            <div style={{ fontSize: 11, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</div>
          )}
        </div>
        {!allDone && (
          <button
            onClick={(e) => { e.stopPropagation(); extractionCancelledRef.current = true; }}
            style={{
              background: "transparent", border: "1px solid " + T.rd + "60",
              borderRadius: 6, padding: "4px 10px", fontSize: 11, color: T.rd,
              cursor: "pointer", flexShrink: 0, fontWeight: 500,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
