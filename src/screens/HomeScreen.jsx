import React, { useState } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { CLS } from "../lib/classify.js";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function HomeScreen() {
  const {
    courses, cName, setCName, pendingConfirm, setPendingConfirm,
    setScreen, setActive, quickCreateCourse, delCourse,
  } = useStudy();

  var [showAddForm, setShowAddForm] = useState(false);

  function handleAdd() {
    if (!cName.trim()) return;
    quickCreateCourse();
    setShowAddForm(false);
  }

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div />
        <TopBarButtons />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, letterSpacing: "-0.03em", margin: 0, marginBottom: 4 }}>Study</h1>
            <p style={{ fontSize: 14, color: T.txD, margin: 0 }}>Your courses and skill profile <span style={{ fontSize: 11, color: T.txM, marginLeft: 8 }}>v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}</span></p>
          </div>
        </div>

        {/* Course list */}
        {courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: T.txD, fontSize: 15, background: T.sf, borderRadius: 10, border: "1px solid " + T.bd }}>
            No courses yet. Add one to get started.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 24 }}>
            {courses.map(c => {
              const mats = c.materials || [];
              const types = [...new Set(mats.map(m => m.classification))].filter(Boolean).map(v => CLS.find(cl => cl.v === v)?.l || v).join(", ");

              return (
                <div key={c.id} onClick={() => { setActive(c); setScreen("courseHome"); }}
                  style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all 0.2s", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 6 }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: T.txD }}>
                      {mats.length} material{mats.length !== 1 ? "s" : ""}{types ? " · " + types : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button onClick={e => { e.stopPropagation();
                        if (pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id) { setPendingConfirm(null); delCourse(c.id); }
                        else setPendingConfirm({ type: "delCourse", id: c.id });
                      }} style={{ background: "none", border: "none", color: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? T.rd : T.txM, cursor: "pointer", fontSize: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? 11 : 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
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

        {/* Add Course — animated expand */}
        <div style={{ display: "flex", justifyContent: showAddForm ? "flex-start" : "center", gap: 8, marginTop: courses.length === 0 ? 24 : 0, marginBottom: 16 }}>
          <div style={{
            overflow: "hidden", transition: "all 0.25s ease",
            width: showAddForm ? "100%" : 0,
            opacity: showAddForm ? 1 : 0,
            transform: showAddForm ? "translateX(0)" : "translateX(-12px)",
            flexShrink: 1,
          }}>
            <input value={cName} onChange={e => setCName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setCName(""); setShowAddForm(false); } }}
              onBlur={() => { if (!cName.trim()) { setCName(""); setShowAddForm(false); } }}
              placeholder="New course name..."
              autoFocus={showAddForm}
              style={{ width: "100%", padding: "12px 16px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, color: T.tx, fontSize: 14, outline: "none" }} />
          </div>
          <button onClick={() => { if (showAddForm && cName.trim()) { handleAdd(); } else { setShowAddForm(true); } }}
            disabled={showAddForm && !cName.trim()}
            style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: showAddForm && cName.trim() ? T.ac : showAddForm ? T.sf : T.ac, color: showAddForm && cName.trim() ? "#0F1115" : showAddForm ? T.txM : "#0F1115", fontSize: 14, fontWeight: 600, cursor: showAddForm && !cName.trim() ? "default" : "pointer", flexShrink: 0, transition: "all 0.2s" }}>
            Add Course
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
