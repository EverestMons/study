import React from "react";
import { T } from "../../lib/theme.jsx";
import { DB } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2 } from "../../lib/skills.js";
import { decomposeAssignments } from "../../lib/skills.js";
import { useStudy } from "../../StudyContext.jsx";

export default function ChunkPicker() {
  const {
    active, setActive, setCourses,
    busy, setBusy, booting,
    status, setStatus,
    globalLock, setGlobalLock,
    chunkPicker, setChunkPicker,
    extractionCancelledRef,
    addNotif,
  } = useStudy();

  if (!chunkPicker || booting) return null;

  return (
    <div style={{ padding: "40px 20px", animation: "fadeIn 0.3s" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 6 }}>Select sections to analyze</div>
        <div style={{ fontSize: 13, color: T.txD }}>Uncheck chapters or files that aren't relevant to your course. Only selected sections will be processed.</div>
      </div>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {chunkPicker.materials.map((mat, mi) => (
          <div key={mi} style={{ marginBottom: 16, background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: mat.chunks && mat.chunks.length > 1 ? "1px solid " + T.bd : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{mat.name}</div>
                <div style={{ fontSize: 11, color: T.txD }}>{mat.classification} {mat.chunks ? "-- " + mat.chunks.length + " section" + (mat.chunks.length !== 1 ? "s" : "") : ""}</div>
              </div>
              {mat.chunks && mat.chunks.length > 1 && (
                <button onClick={() => {
                  var allIds = mat.chunks.map(c => c.id);
                  var allSelected = allIds.every(id => chunkPicker.selectedChunks.has(id));
                  setChunkPicker(prev => {
                    var next = new Set(prev.selectedChunks);
                    allIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                    return { ...prev, selectedChunks: next };
                  });
                }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                  {mat.chunks.every(c => chunkPicker.selectedChunks.has(c.id)) ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {mat.chunks && mat.chunks.length > 1 ? (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {mat.chunks.map((ch, ci) => (
                  <label key={ci} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", borderBottom: ci < mat.chunks.length - 1 ? "1px solid " + T.bg : "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.acS}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <input type="checkbox" checked={chunkPicker.selectedChunks.has(ch.id)}
                      onChange={() => setChunkPicker(prev => {
                        var next = new Set(prev.selectedChunks);
                        next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                        return { ...prev, selectedChunks: next };
                      })}
                      style={{ accentColor: T.ac, width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.label}</div>
                      <div style={{ fontSize: 11, color: T.txD }}>{(ch.charCount || 0).toLocaleString()} chars</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : mat.chunks && mat.chunks.length === 1 ? (
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer" }}>
                <input type="checkbox" checked={chunkPicker.selectedChunks.has(mat.chunks[0].id)}
                  onChange={() => setChunkPicker(prev => {
                    var next = new Set(prev.selectedChunks);
                    var id = mat.chunks[0].id;
                    next.has(id) ? next.delete(id) : next.add(id);
                    return { ...prev, selectedChunks: next };
                  })}
                  style={{ accentColor: T.ac, width: 16, height: 16 }} />
                <div style={{ fontSize: 13, color: T.tx }}>Include this file</div>
              </label>
            ) : null}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
          <div style={{ fontSize: 12, color: T.txD, alignSelf: "center" }}>
            {chunkPicker.selectedChunks.size} of {chunkPicker.materials.flatMap(m => m.chunks || []).length} sections selected
          </div>
          <button onClick={async () => {
            if (!active || globalLock) return;
            setChunkPicker(null);
            setGlobalLock({ message: "Extracting skills..." });
            setBusy(true);
            setStatus("Extracting skills...");
            extractionCancelledRef.current = false;
            try {
              var extractableMats = (active.materials || []).filter(m =>
                (m.chunks || []).length > 0 &&
                m.classification !== "assignment" &&
                (m.chunks || []).some(c => c.status === "pending" || c.status === "failed")
              );
              // Always try decomposing assignments regardless of extraction
              var allMats = active.materials || [];
              var hasAssignments = allMats.some(m => m.classification === "assignment");

              if (!extractableMats.length && !hasAssignments) {
                addNotif("warn", "All materials already extracted. Upload new materials or retry failed sections.");
              } else {
                var totalSkills = 0;
                for (var mi = 0; mi < extractableMats.length; mi++) {
                  if (extractionCancelledRef.current) break;
                  setStatus("Extracting " + (mi + 1) + " of " + extractableMats.length + ": " + extractableMats[mi].name + "...");
                  var result = await runExtractionV2(active.id, extractableMats[mi].id, {
                    onStatus: setStatus,
                    onNotif: addNotif,
                    onChapterComplete: (ch, cnt) => setStatus("Chapter " + ch + ": " + cnt + " skills"),
                  });
                  if (result.success) totalSkills += result.totalSkills || 0;
                }
                var refreshed = await DB.getCourses();
                var updatedCourse = refreshed.find(c => c.id === active.id);
                if (updatedCourse) { setActive(updatedCourse); setCourses(refreshed); }
                if (totalSkills > 0) {
                  addNotif("success", "Extracted " + totalSkills + " skills from " + extractableMats.length + " material" + (extractableMats.length !== 1 ? "s" : "") + ".");
                } else if (extractableMats.length > 0) {
                  addNotif("error", "Extraction completed with issues.");
                }
                // Decompose assignments if any exist and we have skills
                if (hasAssignments) {
                  var sk = await loadSkillsV2(active.id);
                  if (sk.length > 0) {
                    setStatus("Decomposing assignments...");
                    await decomposeAssignments(active.id, allMats, sk, setStatus);
                    addNotif("success", "Assignments decomposed.");
                  }
                }
              }
            } catch (e) {
              addNotif("error", "Extraction failed: " + e.message);
            } finally { setGlobalLock(null); setBusy(false); setStatus(""); }
          }}
            disabled={chunkPicker.selectedChunks.size === 0}
            style={{ background: chunkPicker.selectedChunks.size > 0 ? T.ac : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#0F1115" : T.txD, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default" }}>
            Extract skills
          </button>
        </div>
      </div>
    </div>
  );
}
