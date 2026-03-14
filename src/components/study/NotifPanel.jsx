import React from "react";
import { T } from "../../lib/theme.jsx";
import { useStudy } from "../../StudyContext.jsx";

export default function NotifPanel() {
  const {
    notifs, setNotifs, showNotifs,
    extractionErrors, setExtractionErrors,
    addNotif,
  } = useStudy();

  if (!showNotifs) return null;

  return (
    <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid " + T.bd, background: T.sf, display: "flex", flexDirection: "column", order: 2 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.bd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Notifications</div>
        {notifs.length > 0 && (
          <button onClick={() => setNotifs([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11 }}>Clear all</button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {/* Extraction Errors Section */}
        {extractionErrors.length > 0 && (
          <div style={{ marginBottom: 12, padding: 10, background: T.bg, borderRadius: 8, border: "1px solid " + (T.rd || "#EF4444") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.rd || "#EF4444", textTransform: "uppercase" }}>
                Extraction Errors ({extractionErrors.length})
              </div>
              <button onClick={() => setExtractionErrors([])}
                style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 10 }}>Clear</button>
            </div>
            {extractionErrors.slice(0, 3).map((err, i) => {
              var shortLabel = err.label.length > 20 ? err.label.substring(0, 20) + "..." : err.label;
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: T.tx, marginBottom: 4 }}>{shortLabel}</div>
                  <div style={{ fontSize: 10, color: T.txD, marginBottom: 4 }}>{err.error}</div>
                  <button onClick={() => {
                    var debugText = "EXTRACTION ERROR REPORT\n" +
                      "=======================\n\n" +
                      "Material: " + err.label + "\n" +
                      "Error: " + err.error + "\n" +
                      "Time: " + err.time.toISOString() + "\n\n" +
                      "DEBUG INFO:\n" + JSON.stringify(err.debugInfo, null, 2);
                    navigator.clipboard.writeText(debugText)
                      .then(() => addNotif("success", "Error details copied to clipboard"))
                      .catch(() => addNotif("error", "Clipboard not available — select and copy manually"));
                  }} style={{ fontSize: 10, padding: "3px 8px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 4, color: T.txD, cursor: "pointer" }}>
                    Copy debug info
                  </button>
                </div>
              );
            })}
            {extractionErrors.length > 3 && (
              <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>...and {extractionErrors.length - 3} more</div>
            )}
          </div>
        )}

        {notifs.length === 0 && extractionErrors.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 12 }}>No notifications yet</div>
        ) : notifs.map(n => {
          var typeColor = n.type === "error" ? (T.rd || "#EF4444") : n.type === "warn" ? "#F59E0B" : n.type === "skill" ? "#8B5CF6" : n.type === "mastery" ? T.gn : n.type === "success" ? T.gn : T.ac;
          var typeIcon = n.type === "error" ? "x" : n.type === "warn" ? "!" : n.type === "skill" ? "^" : n.type === "mastery" ? "\u2605" : n.type === "success" ? "+" : "*";
          var ago = Math.round((Date.now() - n.time.getTime()) / 1000);
          var agoStr = ago < 60 ? ago + "s" : ago < 3600 ? Math.round(ago / 60) + "m" : Math.round(ago / 3600) + "h";
          return (
            <div key={n.id} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: T.bg, borderLeft: "3px solid " + typeColor }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5, flex: 1 }}>
                  <span style={{ color: typeColor, fontWeight: 600, marginRight: 6 }}>{typeIcon}</span>
                  {n.msg}
                </div>
                <div style={{ fontSize: 10, color: T.txD, flexShrink: 0, marginTop: 2 }}>{agoStr}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
