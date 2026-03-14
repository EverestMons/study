import React from "react";
import { T } from "../../lib/theme.jsx";
import { PracticeSets, loadCoursesNested } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2 } from "../../lib/skills.js";
import {
  strengthToTier, TIERS, createPracticeSet, generateProblems,
  loadPracticeMaterialCtx,
} from "../../lib/study.js";
import { useStudy } from "../../StudyContext.jsx";

export default function SkillPicker() {
  var {
    active, setActive, setCourses,
    globalLock, setGlobalLock,
    setBusy, setStatus,
    extractionCancelledRef,
    pickerData, setPickerData,
    sessionMode, setSessionMode,
    setPracticeMode,
    addNotif, bootWithFocus,
  } = useStudy();

  if (!pickerData) return null;

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      {pickerData.empty ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: T.txD, fontSize: 14, marginBottom: 16 }}>{pickerData.message}</div>
          {(() => {
            var failedChunks = (active?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed"));
            var hasExtracted = (active?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "extracted")).length > 0;
            return <>
              {failedChunks.length > 0 && (
                <div style={{ color: "#F59E0B", fontSize: 12, marginBottom: 12 }}>
                  {failedChunks.length} chunk{failedChunks.length !== 1 ? "s" : ""} failed extraction
                </div>
              )}
              <button onClick={async () => {
                if (!active || globalLock) return;
                var isRetry = hasExtracted;
                setGlobalLock({ message: isRetry ? "Retrying failed chunks..." : "Extracting skills..." });
                setPickerData(null); setSessionMode(null);
                setBusy(true);
                setStatus(isRetry ? "Retrying failed chunks..." : "Extracting skills...");
                extractionCancelledRef.current = false;
                try {
                  var extractableMats = (active.materials || []).filter(m =>
                    (m.chunks || []).length > 0 &&
                    m.classification !== "assignment" &&
                    (m.chunks || []).some(c => c.status === "pending" || c.status === "failed")
                  );
                  if (!extractableMats.length) {
                    addNotif("warn", "All materials already extracted.");
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
                    var refreshed = await loadCoursesNested();
                    var updatedCourse = refreshed.find(c => c.id === active.id);
                    if (updatedCourse) { setActive(updatedCourse); setCourses(refreshed); }
                    if (totalSkills > 0) {
                      addNotif("success", "Extracted " + totalSkills + " skills from " + extractableMats.length + " material" + (extractableMats.length !== 1 ? "s" : "") + ".");
                    } else if (extractableMats.length > 0) {
                      addNotif("error", "Extraction completed with issues.");
                    }
                  }
                } catch (e) {
                  addNotif("error", "Extraction failed: " + e.message);
                } finally { setGlobalLock(null); setBusy(false); setStatus(""); }
              }} style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {hasExtracted && failedChunks.length > 0 ? "Retry failed chunks" : "Extract skills"}
              </button>
            </>;
          })()}
          <button onClick={() => { setPickerData(null); setSessionMode(null); }}
            style={{ marginTop: 12, padding: "8px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: T.txD, fontSize: 12, cursor: "pointer" }}>Back</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick a skill to work on</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Sorted by weakest first. Pick one to go deep.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 500 }}>
            {pickerData.items.map((s, i) => {
              var isExp = pickerData.expanded === i;
              var strColor = s.strength >= 0.7 ? T.gn : s.strength >= 0.4 ? "#F59E0B" : T.txM;
              var startTier = strengthToTier(s.strength);
              return (
                <div key={i} style={{ background: T.sf, border: "1px solid " + (isExp ? T.acB : T.bd), borderRadius: 10, overflow: "hidden", transition: "all 0.15s" }}>
                  <div onClick={() => setPickerData(prev => ({ ...prev, expanded: isExp ? null : i }))}
                    style={{ padding: "12px 16px", cursor: "pointer" }}
                    onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = T.acS; }}
                    onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{s.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                        {(s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= new Date().toISOString().split("T")[0])) && <span style={{ fontSize: 10, color: T.rd, fontWeight: 600, background: T.rd + "20", padding: "2px 6px", borderRadius: 4 }}>REVIEW DUE</span>}
                        <span style={{ fontSize: 11, color: strColor, fontWeight: 600 }}>{Math.round(s.strength * 100)}%</span>
                        <span style={{ fontSize: 11, color: T.txD }}>{isExp ? "\u25b4" : "\u25be"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>
                      {s.lastRating ? "Last: " + s.lastRating : "Not yet practiced"}
                      {s.lastPracticed ? " | " + Math.round((Date.now() - new Date(s.lastPracticed).getTime()) / 86400000) + "d ago" : ""}
                      {s.deadlineTitle && <span style={{ color: s.deadlineDays < 7 ? T.am : T.ac }}>{" | Needed for " + s.deadlineTitle + " (" + s.deadlineDays + "d)"}</span>}
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 16px", display: "flex", gap: 8 }}>
                      <button onClick={() => bootWithFocus({ type: "skill", skill: s })}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: "1px solid " + T.acB, background: T.acS, color: T.ac, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Learn
                        <div style={{ fontSize: 10, fontWeight: 400, color: T.txD, marginTop: 2 }}>AI-guided dialogue</div>
                      </button>
                      <button onClick={async () => {
                        var existingRow = await PracticeSets.get(s.id);
                        var pset = existingRow?.data || createPracticeSet(active.id, s, active.name);
                        var tier = pset.currentTier;
                        setPracticeMode({ generating: true, set: pset, skill: s });
                        setPickerData(null); setSessionMode("practice");
                        try {
                          var tierData = pset.tiers[tier];
                          var lastAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
                          if (!lastAttempt || lastAttempt.completed) {
                            var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, s);
                            pset = await generateProblems(pset, s, active.name, matCtx);
                          }
                          await PracticeSets.upsert(s.id, pset);
                          var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                          var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                          setPracticeMode({ set: pset, skill: s, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                        } catch (e) {
                          addNotif("error", "Failed to start practice: " + e.message);
                          setPracticeMode(null); setSessionMode(null);
                        }
                      }}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Practice
                        <div style={{ fontSize: 10, fontWeight: 400, color: "rgba(15,17,21,0.6)", marginTop: 2 }}>Tier {startTier}: {TIERS[startTier].name}</div>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
