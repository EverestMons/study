import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { CLS } from "../lib/classify.js";
import { loadCoursesNested, saveCoursesNested } from "../lib/db.js";
import { loadSkillsV2, runExtractionV2 } from "../lib/skills.js";
import GlobalLockOverlay from "../components/GlobalLockOverlay.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function MaterialsScreen() {
  const {
    active, setActive, courses, setCourses,
    files, setFiles, drag, setDrag, parsing,
    busy, setBusy, status, setStatus,
    processingMatId, setProcessingMatId,
    globalLock, setGlobalLock,
    errorLogModal, setErrorLogModal,
    showSkills, setShowSkills, skillViewData, setSkillViewData,
    pendingConfirm, setPendingConfirm,
    expandedMaterial, setExpandedMaterial,
    chunkPicker, setChunkPicker,
    focusContext, setFocusContext, sessionMode, setSessionMode,
    fiRef, extractionCancelledRef,
    setScreen, setShowSettings,
    onDrop, onSelect, classify, removeF,
    addMats, removeMat, addNotif,
    getMaterialState, computeTrustSignals, refreshMaterialSkillCounts,
  } = useStudy();

  return (
    <>
    {globalLock && <GlobalLockOverlay />}
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => { if (!processingMatId) setScreen("manage"); }}
          style={{ background: "none", border: "none", color: processingMatId ? T.txM : T.txD, cursor: processingMatId ? "not-allowed" : "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, opacity: processingMatId ? 0.5 : 1, transition: "all 0.15s ease" }}
          onMouseEnter={e => { if (!processingMatId) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          &lt; Back {processingMatId && "(extraction in progress)"}
        </button>
        <button onClick={() => setShowSettings(true)}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.sfH}
          onMouseLeave={e => e.currentTarget.style.background = T.sf}>
          Settings
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Materials</h1>
        <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 24 }}>{active.name}</p>

        {/* Add Materials */}
        <div style={{ marginBottom: 24 }}>
          <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
            style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 12, padding: "20px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent" }}>
            <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
            <div style={{ fontSize: 14, color: T.txD }}>{parsing ? "Parsing files..." : drag ? "Drop here" : "+ Drop or click to add materials"}</div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} style={{ background: T.sf, borderRadius: 10, padding: 12, marginBottom: 8 }}>
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
                <button onClick={addMats} style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Add Materials</button>
              )}
            </div>
          )}
        </div>

        {/* Materials List */}
        <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Course Materials ({active.materials.length})</div>
        {active.materials.map(mat => {
          const matState = getMaterialState(mat);
          const trust = computeTrustSignals(mat);
          const chunks = mat.chunks || [];
          const failed = chunks.filter(c => c.status === "failed");
          const errored = chunks.filter(c => c.status === "error");
          const unfinished = chunks.filter(c => c.status === "pending" || c.status === "error");
          const extracted = chunks.filter(c => c.status === "extracted");
          const isProcessing = matState === "reading" || matState === "analyzing" || matState === "extracting";
          const isReady = matState === "ready";
          const isError = matState === "critical_error";
          const isIncomplete = matState === "incomplete" || matState === "partial";
          const progress = chunks.length > 0 ? Math.round(extracted.length / chunks.length * 100) : 0;
          const sectionsExpanded = expandedMaterial === mat.id;

          // Status badge config
          const badges = {
            reading: { bg: T.acS, color: T.ac, label: "Reading file...", dot: true },
            analyzing: { bg: T.acS, color: T.ac, label: "Analyzing content...", dot: true },
            extracting: { bg: T.acS, color: T.ac, label: "Finding skills...", dot: true },
            ready: { bg: T.gnS, color: T.gn, label: "Ready to study", icon: "\u2713" },
            incomplete: { bg: T.amS, color: T.am, label: "Extraction incomplete", icon: "\u26A0" },
            partial: { bg: T.amS, color: T.am, label: "Partially extracted", icon: "\u26A0" },
            critical_error: { bg: "rgba(248,113,113,0.1)", color: T.rd, label: "Processing failed", icon: "\u26A0" },
          };
          const badge = badges[matState] || badges.analyzing;

          return (
            <div key={mat.id} style={{ background: T.sf, borderRadius: 14, marginBottom: 12, overflow: "hidden", border: "1px solid " + (isProcessing ? T.acB : isIncomplete ? T.am + "40" : isError ? T.rd + "40" : T.bd), transition: "border-color 0.2s ease" }}>
              {/* Card Header */}
              <div style={{ padding: "16px 18px 14px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                {/* Type icon */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: T.acS, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.ac, letterSpacing: "0.02em" }}>
                    {({ textbook: "Tb", assignment: "As", notes: "Nt", lecture_transcript: "Tr", slides: "Sl", syllabus: "Sy" })[mat.classification] || "Dc"}
                  </span>
                </div>
                {/* Name + metadata */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{mat.name}</div>
                  <div style={{ fontSize: 12, color: T.txD, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{trust.clsLabel}</span>
                    {trust.sectionCount > 0 && <><span style={{ width: 3, height: 3, borderRadius: "50%", background: T.txM, display: "inline-block" }} /><span>{trust.sectionCount} section{trust.sectionCount !== 1 ? "s" : ""}</span></>}
                    {isReady && <><span style={{ width: 3, height: 3, borderRadius: "50%", background: T.txM, display: "inline-block" }} /><span>{trust.wordLabel} words</span></>}
                  </div>
                </div>
                {/* Status badge */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap", background: badge.bg, color: badge.color }}>
                  {badge.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: badge.color, animation: "pulse 1.5s ease-in-out infinite" }} />}
                  {badge.icon && <span>{badge.icon}</span>}
                  {badge.label}
                </div>
              </div>

              {/* Card Body -- Processing states */}
              {isProcessing && (
                <div style={{ padding: "14px 18px 16px", borderTop: "1px solid " + T.bd }}>
                  {/* Progress bar */}
                  <div style={{ width: "100%", height: 4, borderRadius: 2, background: T.bg, overflow: "hidden", marginBottom: 14 }}>
                    {matState === "reading" ? (
                      <div style={{ width: "40%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg, transparent, " + T.ac + ", transparent)", animation: "shimmer 1.5s ease-in-out infinite" }} />
                    ) : (
                      <div style={{ height: "100%", borderRadius: 2, background: T.ac, transition: "width 0.4s ease", width: progress + "%" }} />
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.5 }}>
                    {matState === "reading" && "Reading and parsing document..."}
                    {matState === "analyzing" && "Analyzing " + chunks.length + " section" + (chunks.length !== 1 ? "s" : "") + "..."}
                    {matState === "extracting" && <span>Extracting skills... <span style={{ color: T.ac, fontWeight: 600 }}>{trust.skillCount} found</span></span>}
                  </div>
                  {/* Emerging stats */}
                  {chunks.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: T.bg, fontSize: 11, color: T.txD, animation: "fadeIn 0.3s" }}>{trust.sectionCount} sections</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: T.bg, fontSize: 11, color: T.txD, animation: "fadeIn 0.3s 0.15s both" }}>{trust.wordLabel} words</span>
                    </div>
                  )}
                </div>
              )}

              {/* Card Body -- Incomplete / Partial state */}
              {isIncomplete && (
                <div style={{ padding: "14px 18px 16px", borderTop: "1px solid " + T.bd }}>
                  {/* Progress bar (static, not animated) */}
                  <div style={{ width: "100%", height: 4, borderRadius: 2, background: T.bg, overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ height: "100%", borderRadius: 2, background: progress > 0 ? T.gn : T.am, width: progress + "%" }} />
                  </div>
                  <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.5, marginBottom: 4 }}>
                    <span style={{ color: T.tx, fontWeight: 600 }}>{extracted.length}/{chunks.length}</span> sections extracted ({progress}%)
                  </div>
                  {failed.length > 0 && (
                    <div style={{ fontSize: 12, color: T.rd, marginBottom: 4 }}>
                      {failed.length} section{failed.length !== 1 ? "s" : ""} permanently failed
                    </div>
                  )}
                  {unfinished.length > 0 && (
                    <div style={{ fontSize: 12, color: T.am, marginBottom: 12 }}>
                      {unfinished.length} section{unfinished.length !== 1 ? "s" : ""} need{unfinished.length === 1 ? "s" : ""} retry
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={async () => {
                      if (globalLock) return;
                      setGlobalLock({ message: "Retrying extraction..." });
                      setProcessingMatId(mat.id); setBusy(true); setStatus("Retrying..."); extractionCancelledRef.current = false;
                      try {
                        var result = await runExtractionV2(active.id, mat.id, { onStatus: setStatus, onNotif: addNotif, onChapterComplete: (ch, cnt) => setStatus(mat.name + " \u2014 " + ch + ": " + cnt + " skills") });
                        var refreshed = await loadCoursesNested(); var uc = refreshed.find(c => c.id === active.id);
                        if (uc) { setCourses(refreshed); setActive(uc); }
                        refreshMaterialSkillCounts(active.id);
                        addNotif(result.success ? "success" : "warn", "Retry complete." + (result.totalSkills > 0 ? " " + result.totalSkills + " skills." : ""));
                      } catch (e) { addNotif("error", "Retry failed: " + e.message); }
                      finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                    }}
                      disabled={!!globalLock}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.am, background: T.amS, color: T.am, fontSize: 12, fontWeight: 600, cursor: globalLock ? "not-allowed" : "pointer", opacity: globalLock ? 0.5 : 1 }}>
                      Retry {unfinished.length > 0 ? "(" + unfinished.length + " section" + (unfinished.length !== 1 ? "s" : "") + ")" : "Extraction"}
                    </button>
                    {trust.skillCount > 0 && (
                      <button onClick={() => { setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study"); }}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.bd, background: "transparent", color: T.txD, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                        Study Available Skills
                      </button>
                    )}
                    <button onClick={() => {
                        if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                        else setPendingConfirm({ type: "removeMat", id: mat.id });
                      }}
                      style={{ marginLeft: "auto", background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 8, padding: "6px 14px", fontSize: 11, color: T.txM, cursor: "pointer" }}>
                      {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                    </button>
                  </div>
                </div>
              )}

              {/* Card Body -- Ready state: trust signals + actions */}
              {isReady && (
                <div style={{ padding: "14px 18px", borderTop: "1px solid " + T.bd }}>
                  {/* Stat row */}
                  <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{trust.sectionCount}</div><div style={{ fontSize: 11, color: T.txM, textTransform: "uppercase", letterSpacing: "0.04em" }}>sections</div></div>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{trust.wordLabel}</div><div style={{ fontSize: 11, color: T.txM, textTransform: "uppercase", letterSpacing: "0.04em" }}>words</div></div>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{trust.clsLabel}</div><div style={{ fontSize: 11, color: T.txM, textTransform: "uppercase", letterSpacing: "0.04em" }}>type</div></div>
                  </div>
                  {/* Skill summary */}
                  {trust.skillCount > 0 && (
                    <>
                      <div style={{ fontSize: 13, color: T.txD, marginBottom: 8, lineHeight: 1.5 }}>
                        <span style={{ color: T.tx, fontWeight: 600 }}>{trust.skillCount} skills</span>{" extracted across "}
                        <span style={{ color: T.tx, fontWeight: 600 }}>{trust.categoryCount} topic area{trust.categoryCount !== 1 ? "s" : ""}</span>
                      </div>
                      {trust.topCats.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                          {trust.topCats.map(cat => <span key={cat} style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: T.ac, fontWeight: 500 }}>{cat}</span>)}
                          {trust.overflow > 0 && <span style={{ background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: T.txM }}>+{trust.overflow} more</span>}
                        </div>
                      )}
                    </>
                  )}
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => { setSessionMode("skills"); setFocusContext({ type: "skill", skill: null }); setScreen("study"); }}
                      style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s ease" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>Start Studying</button>
                    {trust.skillCount > 0 && (
                      <button onClick={async () => {
                        const sk = await loadSkillsV2(active.id);
                        setSkillViewData({ skills: sk, isV2: true });
                        setShowSkills(true);
                      }}
                        style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid " + T.bd, background: "transparent", color: T.txD, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s ease" }}
                        onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = T.bd; }}>Review Skills</button>
                    )}
                    <button onClick={() => {
                        if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                        else setPendingConfirm({ type: "removeMat", id: mat.id });
                      }}
                      style={{ marginLeft: "auto", background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 8, padding: "8px 14px", fontSize: 11, color: T.rd, cursor: "pointer", transition: "all 0.15s ease" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                    </button>
                  </div>
                  {/* Silent error note */}
                  {failed.length > 0 && failed.length <= chunks.length * 0.25 && (
                    <div style={{ fontSize: 11, color: T.txM, marginTop: 8, padding: "6px 10px", background: T.bg, borderRadius: 6 }}>
                      {failed.length} section{failed.length !== 1 ? "s" : ""} skipped (content too short or extraction issue)
                    </div>
                  )}
                </div>
              )}

              {/* Card Body -- Critical error state (all chunks permanently failed) */}
              {isError && (
                <div style={{ padding: "14px 18px", borderTop: "1px solid " + T.bd }}>
                  <div style={{ fontSize: 13, color: T.txD, marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span>{"\u26A0"}</span>
                    <span>This file couldn't be processed after multiple attempts. The content may not be compatible.</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {failed.length > 0 && (
                      <button onClick={() => setErrorLogModal({ mat, chunks: failed })}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.bd, background: "transparent", color: T.txD, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                        View Details
                      </button>
                    )}
                    <button onClick={() => {
                        if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                        else setPendingConfirm({ type: "removeMat", id: mat.id });
                      }}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.rd, background: "transparent", color: T.rd, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                      {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                    </button>
                  </div>
                </div>
              )}

              {/* Expandable section list */}
              {chunks.length > 1 && isReady && (
                <>
                  <div onClick={() => setExpandedMaterial(sectionsExpanded ? null : mat.id)}
                    style={{ padding: "8px 18px", borderTop: "1px solid " + T.bd, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "background 0.15s ease" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.sfH} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 12, color: T.txM }}>{trust.sectionCount} sections</span>
                    <span style={{ fontSize: 10, color: T.txM }}>{sectionsExpanded ? "\u25B4" : "\u25BE"}</span>
                  </div>
                  {sectionsExpanded && (
                    <div style={{ maxHeight: 250, overflowY: "auto" }}>
                      {chunks.map((ch, ci) => (
                        <div key={ci} style={{ padding: "6px 18px 6px 32px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, borderBottom: ci < chunks.length - 1 ? "1px solid " + T.bg : "none" }}>
                          <span style={{ color: T.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.label}</span>
                          <span style={{ color: T.txM, fontSize: 11, flexShrink: 0 }}>{(ch.charCount || 0).toLocaleString()} chars</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Chunk Picker Modal */}
        {chunkPicker && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: T.sf, borderRadius: 16, padding: 24, maxWidth: 500, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>

              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => {
                    var mat = chunkPicker.materials[0];
                    var inactiveIds = new Set((mat.chunks || []).filter(c => c.status === "skipped" || c.status === "failed").map(c => c.id));
                    setChunkPicker(prev => ({ ...prev, mode: "activate", selectedChunks: inactiveIds }));
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "none",
                    background: (chunkPicker.mode || "activate") === "activate" ? T.ac : T.bg,
                    color: (chunkPicker.mode || "activate") === "activate" ? "#0F1115" : T.txD,
                    cursor: "pointer", fontWeight: 600, fontSize: 14
                  }}>
                  Activate
                </button>
                <button
                  onClick={() => {
                    var mat = chunkPicker.materials[0];
                    var activeIds = new Set((mat.chunks || []).filter(c => c.status === "extracted").map(c => c.id));
                    setChunkPicker(prev => ({ ...prev, mode: "deactivate", selectedChunks: activeIds }));
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "none",
                    background: chunkPicker.mode === "deactivate" ? T.rd : T.bg,
                    color: chunkPicker.mode === "deactivate" ? "#fff" : T.txD,
                    cursor: "pointer", fontWeight: 600, fontSize: 14
                  }}>
                  Deactivate
                </button>
              </div>

              <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>
                {(chunkPicker.mode || "activate") === "activate"
                  ? "Select sections to add to your curriculum"
                  : "Select sections to remove from your curriculum"}
              </div>

              {chunkPicker.materials.map((mat, mi) => {
                const mode = chunkPicker.mode || "activate";
                const relevantChunks = mode === "activate"
                  ? (mat.chunks || []).filter(c => c.status === "skipped" || c.status === "failed")
                  : (mat.chunks || []).filter(c => c.status === "extracted");

                if (relevantChunks.length === 0) {
                  return (
                    <div key={mi} style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>
                      {mode === "activate" ? "All sections are already active" : "No active sections to deactivate"}
                    </div>
                  );
                }

                return (
                <div key={mi} style={{ marginBottom: 12, background: T.bg, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: 12, borderBottom: "1px solid " + T.bd, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{mat.name}</span>
                    {relevantChunks.length > 1 && (
                      <button onClick={() => {
                        var relevantIds = relevantChunks.map(c => c.id);
                        var allSelected = relevantIds.every(id => chunkPicker.selectedChunks.has(id));
                        setChunkPicker(prev => {
                          var next = new Set(prev.selectedChunks);
                          relevantIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                          return { ...prev, selectedChunks: next };
                        });
                      }} style={{ background: "none", border: "none", color: mode === "activate" ? T.ac : T.rd, cursor: "pointer", fontSize: 11 }}>
                        {relevantChunks.every(c => chunkPicker.selectedChunks.has(c.id)) ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                  {relevantChunks.map((ch, ci) => {
                    const isSelected = chunkPicker.selectedChunks.has(ch.id);
                    return (
                      <label key={ci} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: ci < relevantChunks.length - 1 ? "1px solid " + T.sf : "none",
                        background: "transparent"
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                              return { ...prev, selectedChunks: next };
                            });
                          }}
                          style={{ accentColor: mode === "activate" ? T.ac : T.rd }}
                        />
                        <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{ch.label}</span>
                        <span style={{ fontSize: 10, color: T.txD }}>{(ch.charCount || 0).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                );
              })}

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => setChunkPicker(null)} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.bd, background: "transparent", color: T.txD, cursor: "pointer", fontSize: 14 }}>Cancel</button>

                {(chunkPicker.mode || "activate") === "activate" ? (
                  <button onClick={async () => {
                    if (chunkPicker.selectedChunks.size === 0) return;
                    var mat = chunkPicker.materials[0];
                    var selectedIds = chunkPicker.selectedChunks;
                    var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                      ...m,
                      chunks: m.chunks.map(c => selectedIds.has(c.id) ? { ...c, status: "extracted" } : c)
                    });
                    var updatedCourse = { ...active, materials: updatedMats };
                    var allCourses = await loadCoursesNested();
                    allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                    await saveCoursesNested(allCourses);
                    setCourses(allCourses); setActive(updatedCourse);
                    setChunkPicker(null);
                    addNotif("success", "Activated " + selectedIds.size + " section(s). Go to Skills to extract.");
                  }} disabled={chunkPicker.selectedChunks.size === 0}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: chunkPicker.selectedChunks.size > 0 ? T.ac : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#0F1115" : T.txD, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default", fontWeight: 600, fontSize: 14 }}>
                    Activate ({chunkPicker.selectedChunks.size})
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (chunkPicker.selectedChunks.size === 0) return;
                      var mat = chunkPicker.materials[0];
                      var selectedIds = chunkPicker.selectedChunks;
                      var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                        ...m,
                        chunks: m.chunks.map(c => selectedIds.has(c.id) ? { ...c, status: "skipped" } : c)
                      });
                      var updatedCourse = { ...active, materials: updatedMats };
                      var allCourses = await loadCoursesNested();
                      allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                      await saveCoursesNested(allCourses);
                      setCourses(allCourses); setActive(updatedCourse);
                      setChunkPicker(null);
                      addNotif("success", "Deactivated " + selectedIds.size + " section(s).");
                    }}
                    disabled={chunkPicker.selectedChunks.size === 0}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: chunkPicker.selectedChunks.size > 0 ? T.rd : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#fff" : T.txD, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default", fontWeight: 600, fontSize: 14 }}>
                    Deactivate ({chunkPicker.selectedChunks.size})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error Log Modal */}
        {errorLogModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: T.sf, borderRadius: 16, padding: 24, maxWidth: 600, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.rd }}>Extraction Failed</div>
                <button onClick={() => setErrorLogModal(null)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 18 }}>&times;</button>
              </div>
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>
                These sections failed to extract after multiple attempts. Copy the error details below to report the issue.
              </div>
              <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>Material: {errorLogModal.mat.name}</div>

              {errorLogModal.chunks.map((ch, i) => (
                <div key={i} style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid " + T.rd }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 8 }}>{ch.label}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>Failed {ch.failCount || 0} time(s)</div>
                  {ch.lastError && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: T.rd, marginBottom: 4 }}>Error: {ch.lastError.error}</div>
                      {ch.lastError.debugInfo && (
                        <pre style={{
                          background: "#1a1a1a",
                          padding: 10,
                          borderRadius: 6,
                          fontSize: 10,
                          color: "#ccc",
                          overflow: "auto",
                          maxHeight: 150,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all"
                        }}>
                          {typeof ch.lastError.debugInfo === "string"
                            ? ch.lastError.debugInfo
                            : JSON.stringify(ch.lastError.debugInfo, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button onClick={() => {
                  const errorData = {
                    material: errorLogModal.mat.name,
                    materialId: errorLogModal.mat.id,
                    chunks: errorLogModal.chunks.map(ch => ({
                      label: ch.label,
                      chunkId: ch.id,
                      failCount: ch.failCount,
                      error: ch.lastError?.error,
                      debugInfo: ch.lastError?.debugInfo,
                      charCount: ch.charCount
                    }))
                  };
                  navigator.clipboard.writeText(JSON.stringify(errorData, null, 2))
                    .then(() => addNotif("success", "Error details copied to clipboard"))
                    .catch(() => addNotif("error", "Clipboard not available \u2014 select and copy manually"));
                }}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid " + T.ac, background: T.acS, color: T.ac, cursor: "pointer", fontWeight: 600 }}>
                  Copy Error Details
                </button>
                <button onClick={() => setErrorLogModal(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid " + T.bd, background: "transparent", color: T.txD, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
    </>
  );
}
