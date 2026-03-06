import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { CLS } from "../lib/classify.js";
import { useStudy } from "../StudyContext.jsx";

export default function HomeScreen() {
  const {
    courses, cName, setCName, pendingConfirm, setPendingConfirm,
    setScreen, setShowSettings, quickCreateCourse, loadProfile, enterStudy, delCourse,
  } = useStudy();

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div />
        <button onClick={() => setShowSettings(true)}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.sfH}
          onMouseLeave={e => e.currentTarget.style.background = T.sf}>
          Settings
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, letterSpacing: "-0.03em", margin: 0, marginBottom: 4 }}>Study</h1>
            <p style={{ fontSize: 14, color: T.txD, margin: 0 }}>Your courses and skill profile</p>
          </div>
          <button onClick={async () => { await loadProfile(); setScreen("profile"); }}
            style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: "10px 18px", color: T.ac, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = T.acS}>
            View Profile
          </button>
        </div>

        {/* Course list */}
        {courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: T.txD, fontSize: 15, background: T.sf, borderRadius: 14, border: "1px solid " + T.bd }}>
            No courses yet. Add one to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {courses.map(c => {
              const mats = c.materials || [];
              const types = [...new Set(mats.map(m => m.classification))].filter(Boolean).map(v => CLS.find(cl => cl.v === v)?.l || v).join(", ");
              return (
                <div key={c.id} onClick={() => enterStudy(c)}
                  style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{c.name}</div>
                      <div style={{ fontSize: 13, color: T.txD }}>
                        {mats.length} material{mats.length !== 1 ? "s" : ""}{types ? " \u00B7 " + types : ""}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation();
                        if (pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id) { setPendingConfirm(null); delCourse(c.id); }
                        else setPendingConfirm({ type: "delCourse", id: c.id });
                      }} style={{ background: "none", border: "none", color: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? T.rd : T.txM, cursor: "pointer", fontSize: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? 11 : 13, flexShrink: 0, marginLeft: 12, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      {pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? "Confirm delete?" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inline Add Course form */}
        <div style={{ display: "flex", gap: 8, marginTop: courses.length === 0 ? 24 : 0, marginBottom: 16 }}>
          <input value={cName} onChange={e => setCName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") quickCreateCourse(); }}
            placeholder="New course name..."
            style={{ flex: 1, padding: "12px 16px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, color: T.tx, fontSize: 14, outline: "none" }} />
          <button onClick={quickCreateCourse} disabled={!cName.trim()}
            style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: cName.trim() ? T.ac : T.sf, color: cName.trim() ? "#0F1115" : T.txM, fontSize: 14, fontWeight: 600, cursor: cName.trim() ? "pointer" : "default" }}>
            Add Course
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
