import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function NotifsScreen() {
  const {
    notifs, setNotifs, extractionErrors, setExtractionErrors,
    goBack,
  } = useStudy();

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => goBack()} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>&lt; Back</button>
        <TopBarButtons />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 24 }}>Notifications</h1>

        {/* Extraction Errors */}
        {extractionErrors.length > 0 && (
          <div style={{ background: T.sf, border: "1px solid " + (T.rd || "#EF4444"), borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.rd || "#EF4444" }}>Extraction Errors ({extractionErrors.length})</div>
              <button onClick={() => setExtractionErrors([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11 }}>Clear</button>
            </div>
            {extractionErrors.map((err, i) => (
              <div key={i} style={{ padding: 10, background: T.bg, borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: T.tx, marginBottom: 4 }}>{err.label}</div>
                <div style={{ fontSize: 11, color: T.rd || "#EF4444" }}>{err.error}</div>
              </div>
            ))}
          </div>
        )}

        {/* Notifications */}
        {notifs.length === 0 ? (
          <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No notifications yet</div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.txD }}>{notifs.length} notifications</div>
              <button onClick={() => setNotifs([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 12 }}>Clear all</button>
            </div>
            {notifs.slice().reverse().map(n => (
              <div key={n.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 14, marginBottom: 8, display: "flex", gap: 12 }}>
                <span style={{ fontSize: 16, color: n.type === "error" ? T.rd : n.type === "skill" ? T.gn : n.type === "warn" ? "#F59E0B" : T.ac }}>
                  {n.type === "error" ? "\u2715" : n.type === "skill" ? "+" : n.type === "warn" ? "\u26A0" : "\u2713"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: T.tx }}>{n.msg}</div>
                  <div style={{ fontSize: 11, color: T.txM, marginTop: 4 }}>{n.time.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
