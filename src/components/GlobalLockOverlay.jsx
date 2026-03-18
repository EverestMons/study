import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function GlobalLockOverlay() {
  const {
    globalLock, setGlobalLock, lockElapsed, status,
    setBusy, setStatus, setProcessingMatId, extractionCancelledRef,
  } = useStudy();

  if (!globalLock) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 2000, pointerEvents: "all"
    }}>
      <style>{CSS}</style>
      <div style={{
        background: T.sf, borderRadius: 16, padding: 32, maxWidth: 400, width: "90%", textAlign: "center"
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.tx, marginBottom: 16 }}>{globalLock.message || "Processing..."}</div>
        <div style={{ fontSize: 14, color: T.txD, marginBottom: 8 }}>{status || "Please wait..."}</div>
        <div style={{ fontSize: 12, color: T.txM, marginBottom: 20 }}>{lockElapsed}s elapsed</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out infinite" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out 0.2s infinite" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out 0.4s infinite" }} />
        </div>
        <button
          onClick={() => { extractionCancelledRef.current = true; }}
          style={{ padding: "10px 24px", background: T.rd, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          Cancel Operation
        </button>
        {lockElapsed >= 30 && (
          <button
            onClick={() => { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); window.location.reload(); }}
            style={{ display: "block", margin: "12px auto 0", padding: "8px 20px", background: "transparent", border: "1px solid " + T.rd, borderRadius: 8, color: T.rd, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            Force unlock and return
          </button>
        )}
      </div>
    </div>
  );
}
