import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { resetAll } from "../lib/db.js";
import { useStudy } from "../StudyContext.jsx";

export default function ErrorDisplay() {
  const ctx = useStudy();
  if (!ctx) return null;
  const {
    asyncError, setAsyncError, showAsyncNuclear, setShowAsyncNuclear,
    screen, active, sessionMode, addNotif, setScreen,
  } = ctx;

  const report = [
    "STUDY ASYNC ERROR",
    "==================",
    "Timestamp: " + new Date().toISOString(),
    "Screen: " + screen,
    "Course ID: " + (active?.id || "none"),
    "Session Mode: " + (sessionMode || "none"),
    "Storage: SQLite",
    "",
    "Error: " + asyncError.message,
    "",
    "Stack:",
    (asyncError.stack || "").split("\n").slice(0, 10).join("\n"),
  ].join("\n");

  const handleAsyncHardReset = async () => {
    try {
      await resetAll({ confirmed: true });
    } catch (e) { console.error("Failed to clear database:", e); }
    window.location.reload();
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ fontSize: 20, color: T.rd, marginBottom: 8, fontWeight: 700 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Copy the error report below and paste it to Claude for debugging help.</div>
        <textarea readOnly value={report} onClick={e => e.target.select()}
          style={{ width: "100%", minHeight: 280, background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, padding: 16, fontSize: 11, fontFamily: "SF Mono, Fira Code, Consolas, monospace", resize: "vertical", lineHeight: 1.5 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => { navigator.clipboard.writeText(report).then(() => addNotif("success", "Copied to clipboard")).catch(() => addNotif("error", "Clipboard not available — select the text and copy manually")); }}
            style={{ padding: "10px 20px", background: T.ac, color: "#0F1115", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Copy to clipboard</button>
          <button onClick={() => setAsyncError(null)}
            style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Dismiss</button>
          <button onClick={() => { setAsyncError(null); setScreen("home"); }}
            style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Go home</button>
        </div>
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid " + T.bd }}>
          {!showAsyncNuclear ? (
            <button onClick={() => setShowAsyncNuclear(true)}
              style={{ background: "transparent", border: "none", color: T.txM, fontSize: 12, padding: "8px 0", cursor: "pointer" }}>
              Still having issues? Show reset options...
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: T.rd, marginBottom: 12 }}>⚠️ This will permanently delete all your courses and data.</div>
              <button onClick={handleAsyncHardReset}
                style={{ padding: "10px 20px", background: "#7F1D1D", color: "#FEE2E2", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Clear all data and restart
              </button>
              <button onClick={() => setShowAsyncNuclear(false)}
                style={{ marginLeft: 8, padding: "10px 20px", background: "transparent", color: T.txM, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
