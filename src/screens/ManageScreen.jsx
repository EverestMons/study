import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import GlobalLockOverlay from "../components/GlobalLockOverlay.jsx";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function ManageScreen() {
  const {
    active, processingMatId, globalLock,
    goBack,
  } = useStudy();

  return (
    <>
    {globalLock && <GlobalLockOverlay />}
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => { if (!processingMatId) goBack(); }}
          style={{ background: "none", border: "none", color: processingMatId ? T.txM : T.txD, cursor: processingMatId ? "not-allowed" : "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, opacity: processingMatId ? 0.5 : 1, transition: "all 0.15s ease" }}
          onMouseEnter={e => { if (!processingMatId) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          &lt; Back {processingMatId && "(extraction in progress)"}
        </button>
        <TopBarButtons />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>{active.name}</h1>
          <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 32 }}>Manage your course content</p>

          <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.6 }}>
            Access Materials and Skills from Course Home.
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
