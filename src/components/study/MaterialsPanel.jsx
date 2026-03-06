import React from "react";
import { T } from "../../lib/theme.jsx";
import { CLS } from "../../lib/classify.js";
import { DB } from "../../lib/db.js";
import { runExtractionV2 } from "../../lib/skills.js";
import { useStudy } from "../../StudyContext.jsx";

export default function MaterialsPanel() {
  const {
    active, setActive, setCourses,
    files, setFiles, drag, setDrag, parsing,
    busy, setBusy,
    status, setStatus, processingMatId, setProcessingMatId,
    globalLock, setGlobalLock,
    showManage,
    pendingConfirm, setPendingConfirm,
    extractionCancelledRef,
    fiRef,
    addNotif,
    onDrop, onSelect, classify, removeF,
    addMats, removeMat,
  } = useStudy();

  if (!showManage) return null;

  return (
    <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0, maxHeight: "50vh", overflowY: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Add Materials Section */}
        <div style={{ marginBottom: 16 }}>
          <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
            style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 12, padding: "16px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent" }}>
            <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
            <div style={{ fontSize: 13, color: T.txD }}>+ Add materials (drop or click)</div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} style={{ background: T.bg, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: T.tx }}>{f.name}</span>
                    <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer" }}>x</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CLS.map(c => <button key={c.v} onClick={() => classify(f.id, c.v)}
                      style={{ background: f.classification === c.v ? T.acS : "transparent", border: "1px solid " + (f.classification === c.v ? T.ac : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: f.classification === c.v ? T.ac : T.txD, cursor: "pointer" }}>{c.l}</button>)}
                  </div>
                </div>
              ))}
              {files.every(f => f.classification) && (
                <button onClick={addMats} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add Materials</button>
              )}
            </div>
          )}
        </div>

        {/* Existing Materials List */}
        <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>Course Materials ({active.materials.length})</div>

        {/* Extraction progress indicator */}
        {processingMatId && (
          <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: T.ac, animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.ac, fontWeight: 600 }}>Extracting skills...</div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</div>
            </div>
            <button onClick={() => { extractionCancelledRef.current = true; }}
              style={{ padding: "4px 10px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 11, color: T.txD, cursor: "pointer", flexShrink: 0 }}>
              Stop
            </button>
          </div>
        )}

        {active.materials.map(mat => {
          const clsLabel = CLS.find(c => c.v === mat.classification)?.l || mat.classification;
          const chunks = mat.chunks || [];
          const extracted = chunks.filter(c => c.status === "extracted").length;
          const failed = chunks.filter(c => c.status === "failed").length;
          const skipped = chunks.filter(c => c.status === "skipped").length;
          const pending = chunks.filter(c => c.status === "pending").length;
          const hasMultiChunk = chunks.length > 1;
          const isProcessing = processingMatId === mat.id;

          return (
            <div key={mat.id} style={{ background: T.bg, borderRadius: 10, marginBottom: 8, overflow: "hidden", border: isProcessing ? "1px solid " + T.ac : "none" }}>
              {/* Material header */}
              <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clsLabel}: {mat.name}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {chunks.length > 0 && <span>{chunks.length} section{chunks.length !== 1 ? "s" : ""}</span>}
                    {extracted > 0 && <span style={{ color: T.gn }}>{extracted} active</span>}
                    {failed > 0 && <span style={{ color: "#F59E0B" }}>{failed} failed</span>}
                    {skipped > 0 && <span style={{ color: T.txD }}>{skipped} inactive</span>}
                    {pending > 0 && isProcessing && <span style={{ color: T.ac }}>{pending} extracting...</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {failed > 0 && (
                    <button onClick={async () => {
                      if (globalLock) return;
                      setGlobalLock({ message: "Retrying " + failed + " failed chunk(s)..." });
                      setBusy(true);
                      setStatus("Retrying " + failed + " failed chunk(s)...");
                      extractionCancelledRef.current = false;
                      try {
                        var result = await runExtractionV2(active.id, mat.id, {
                          onStatus: setStatus,
                          onNotif: addNotif,
                          onChapterComplete: (ch, cnt) => setStatus("Chapter " + ch + ": " + cnt + " skills"),
                        });
                        var refreshed = await DB.getCourses();
                        var updatedCourse = refreshed.find(c => c.id === active.id);
                        if (updatedCourse) { setCourses(refreshed); setActive(updatedCourse); }
                        addNotif(result.success ? "success" : "warn", "Retry complete." + (result.totalSkills > 0 ? " " + result.totalSkills + " skills." : ""));
                      } catch (e) {
                        addNotif("error", "Retry failed: " + e.message);
                      } finally { setGlobalLock(null); setBusy(false); setStatus(""); }
                    }} disabled={globalLock}
                      style={{ background: "none", border: "1px solid #F59E0B", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#F59E0B", cursor: globalLock ? "default" : "pointer" }}>Retry failed</button>
                  )}
                  <button onClick={() => {
                      if (busy) return;
                      if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                      else setPendingConfirm({ type: "removeMat", id: mat.id });
                    }} disabled={busy}
                    style={{ background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 6, padding: "8px 16px", fontSize: 11, color: T.rd, cursor: busy ? "default" : "pointer", transition: "all 0.15s ease" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                  </button>
                </div>
              </div>
              {/* Chunk list for multi-chunk materials */}
              {hasMultiChunk && (
                <div style={{ borderTop: "1px solid " + T.bd, maxHeight: 200, overflowY: "auto" }}>
                  {chunks.map((ch, ci) => {
                    var statusColor = ch.status === "extracted" ? T.gn : ch.status === "failed" ? "#F59E0B" : ch.status === "skipped" ? T.txD : T.ac;
                    var statusIcon = ch.status === "extracted" ? "\u2713" : ch.status === "failed" ? "\u2717" : ch.status === "skipped" ? "\u2013" : "\u25CB";
                    return (
                      <div key={ci} style={{ padding: "6px 12px 6px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: ci < chunks.length - 1 ? "1px solid " + T.bg : "none", fontSize: 12 }}>
                        <span style={{ color: statusColor, fontWeight: 600, width: 14, textAlign: "center", flexShrink: 0 }}>{statusIcon}</span>
                        <span style={{ color: ch.status === "skipped" ? T.txD : T.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: ch.status === "skipped" ? "italic" : "normal" }}>{ch.label}</span>
                        <span style={{ color: T.txD, flexShrink: 0 }}>{(ch.charCount || 0).toLocaleString()}</span>
                        {ch.status === "skipped" && (
                          <button onClick={async () => {
                            if (busy || globalLock) return;
                            // Re-enable and immediately extract this chunk
                            var updatedMats = active.materials.map(m => m.id !== mat.id ? m : { ...m, chunks: m.chunks.map(c => c.id === ch.id ? { ...c, status: "pending" } : c) });
                            var updatedCourse = { ...active, materials: updatedMats };
                            var allCourses = await DB.getCourses();
                            allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                            await DB.saveCourses(allCourses);
                            setCourses(allCourses); setActive(updatedCourse);
                            // Trigger extraction
                            setGlobalLock({ message: "Extracting " + ch.label + "..." });
                            setProcessingMatId(mat.id);
                            setBusy(true);
                            extractionCancelledRef.current = false;
                            try {
                              await runExtractionV2(active.id, mat.id, {
                                onStatus: setStatus,
                                onNotif: addNotif,
                                onChapterComplete: (ch2, cnt) => setStatus("Chapter " + ch2 + ": " + cnt + " skills"),
                              });
                              var refreshed = await DB.getCourses();
                              var refreshedCourse = refreshed.find(c => c.id === active.id);
                              if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }
                            } catch (e) { addNotif("error", "Extraction failed: " + e.message); }
                            finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                          }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, padding: 0 }}>enable</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
