import React from "react";
import { T } from "../../lib/theme.jsx";
import { useStudy } from "../../StudyContext.jsx";

export default function ExamScopePicker() {
  var {
    pickerData, setPickerData,
    sessionMode, setSessionMode,
    bootWithFocus,
  } = useStudy();

  if (!pickerData) return null;

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      {pickerData.empty ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: T.txD, fontSize: 14, marginBottom: 16 }}>{pickerData.message}</div>
          <button onClick={() => { setPickerData(null); setSessionMode(null); }}
            style={{ marginTop: 12, padding: "8px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: T.txD, fontSize: 12, cursor: "pointer" }}>Back</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Select exam scope</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Pick the materials you want to review for the exam.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 500 }}>
            {pickerData.materials.map((mat, i) => {
              var isSelected = pickerData.selectedMats.has(mat.id);
              var chunkCount = (mat.chunks || []).filter(c => c.status === "extracted").length;
              return (
                <div key={i} onClick={() => setPickerData(prev => {
                  var next = new Set(prev.selectedMats);
                  if (next.has(mat.id)) next.delete(mat.id); else next.add(mat.id);
                  return { ...prev, selectedMats: next };
                })}
                  style={{ background: isSelected ? T.acS : T.sf, border: "1px solid " + (isSelected ? T.acB : T.bd), borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.sfH; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? T.acS : T.sf; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid " + (isSelected ? T.ac : T.bd), background: isSelected ? T.ac : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSelected && <span style={{ color: "#0F1115", fontSize: 12, fontWeight: 700 }}>&#10003;</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{mat.name}</div>
                        <div style={{ fontSize: 11, color: T.txD }}>{chunkCount} section{chunkCount !== 1 ? "s" : ""} | {mat.classification || "material"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button onClick={() => {
              var selected = pickerData.materials.filter(m => pickerData.selectedMats.has(m.id));
              if (!selected.length) return;
              bootWithFocus({ type: "exam", materials: selected });
            }}
              disabled={pickerData.selectedMats.size === 0}
              style={{ background: pickerData.selectedMats.size > 0 ? T.ac : T.bd, color: pickerData.selectedMats.size > 0 ? "#0F1115" : T.txD, border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: pickerData.selectedMats.size > 0 ? "pointer" : "default" }}>
              Start exam prep ({pickerData.selectedMats.size} selected)
            </button>
            <button onClick={() => { setPickerData(null); setSessionMode(null); }}
              style={{ padding: "10px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 10, color: T.txD, fontSize: 13, cursor: "pointer" }}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
