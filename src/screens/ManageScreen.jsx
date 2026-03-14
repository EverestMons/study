import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { loadSkillsV2 } from "../lib/skills.js";
import GlobalLockOverlay from "../components/GlobalLockOverlay.jsx";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function ManageScreen() {
  const {
    active, processingMatId, globalLock,
    setScreen, setSkillViewData,
  } = useStudy();

  return (
    <>
    {globalLock && <GlobalLockOverlay />}
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => { if (!processingMatId) setScreen("courseHome"); }}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setScreen("materials")}
              style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Materials</div>
              <div style={{ fontSize: 12, color: T.txD }}>{active.materials.length} files uploaded</div>
            </button>

            <button onClick={async () => {
              var sk = await loadSkillsV2(active.id);
              setSkillViewData({ skills: sk, isV2: sk.length > 0 && sk[0]?.conceptKey != null });
              setScreen("skills");
            }}
              style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Skills</div>
              <div style={{ fontSize: 12, color: T.txD }}>View skill tree from active sections</div>
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
