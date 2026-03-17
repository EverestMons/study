import React, { useState } from "react";
import { T } from "../../lib/theme.jsx";
import { PracticeSets, loadCoursesNested, Chunks } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2 } from "../../lib/skills.js";
import {
  strengthToTier, TIERS, createPracticeSet, generateProblems,
  loadPracticeMaterialCtx,
} from "../../lib/study.js";
import { currentRetrievability } from "../../lib/fsrs.js";
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

  var [collapsedCats, setCollapsedCats] = useState(null);
  var [expandedSkill, setExpandedSkill] = useState(null);

  if (!pickerData) return null;

  // --- Empty state (no skills extracted) ---
  if (pickerData.empty) {
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
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
                      await Chunks.resetForRetry(extractableMats[mi].id);
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
      </div>
    );
  }

  // --- Populated state ---
  var today = new Date().toISOString().split("T")[0];
  var items = pickerData.items;

  // Due skills
  var dueSkills = items.filter(s =>
    s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today)
  );

  // Most urgent due skill (lowest retrievability = most decayed)
  var mostUrgent = null;
  if (dueSkills.length > 0) {
    mostUrgent = dueSkills.reduce((best, s) => {
      var r = currentRetrievability(s.mastery || s);
      var bestR = currentRetrievability(best.mastery || best);
      if (r === 0 && bestR === 0) {
        // Fallback: oldest reviewDate, then lowest strength
        if (s.reviewDate && best.reviewDate && s.reviewDate !== best.reviewDate)
          return s.reviewDate < best.reviewDate ? s : best;
        return s.strength < best.strength ? s : best;
      }
      return r < bestR ? s : best;
    }, dueSkills[0]);
  }

  // Group by category
  var grouped = {};
  for (var s of items) {
    var cat = s.category || "Uncategorized";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  // Sort within each category: weakest first, deadline-promoted
  for (var catSkills of Object.values(grouped)) {
    catSkills.sort((a, b) => {
      var diff = a.strength - b.strength;
      if (Math.abs(diff) < 0.10) {
        var aHas = a.deadlineDays != null;
        var bHas = b.deadlineDays != null;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (aHas && bHas) return a.deadlineDays - b.deadlineDays;
      }
      return diff;
    });
  }

  // Sort categories: most due first, then weakest avg strength
  var catEntries = Object.entries(grouped);
  catEntries.sort((a, b) => {
    var aDue = a[1].filter(sk => sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today)).length;
    var bDue = b[1].filter(sk => sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today)).length;
    if (aDue !== bDue) return bDue - aDue;
    var aAvg = a[1].reduce((sum, sk) => sum + sk.strength, 0) / a[1].length;
    var bAvg = b[1].reduce((sum, sk) => sum + sk.strength, 0) / b[1].length;
    return aAvg - bAvg;
  });

  // Default collapse: categories with due skills expanded, others collapsed
  // If all would be collapsed (nothing due), expand all
  if (collapsedCats === null) {
    var init = new Set();
    for (var [catName, skills] of catEntries) {
      var hasDue = skills.some(sk =>
        sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today)
      );
      if (!hasDue) init.add(catName);
    }
    if (init.size === catEntries.length) init.clear();
    // Use a microtask to avoid setting state during render
    setTimeout(() => setCollapsedCats(init), 0);
    // For the first render, show all expanded
    var effectiveCollapsed = init.size === catEntries.length ? new Set() : init;
  }
  var collapsed = collapsedCats || effectiveCollapsed || new Set();

  var strColor = str => str >= 0.7 ? T.gn : str >= 0.4 ? "#F59E0B" : T.txM;
  var strBg = str => str >= 0.7 ? T.gn + "20" : str >= 0.4 ? "#F59E0B20" : T.txM + "20";

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick a skill to work on</div>
      <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Grouped by category. Sorted by weakest first.</div>

      {/* Review banner */}
      {dueSkills.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.acS, border: "1px solid " + T.acB, borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ac }}>{dueSkills.length} skill{dueSkills.length !== 1 ? "s" : ""} due for review</span>
          <button onClick={() => bootWithFocus({ type: "skill", skill: mostUrgent })}
            style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Start Review
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.gnS, border: "1px solid " + T.gn + "40", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
          <span style={{ color: T.gn, fontWeight: 600 }}>{"\u2713"}</span>
          <span style={{ fontSize: 13, color: T.gn, fontWeight: 500 }}>You're current — no reviews needed</span>
        </div>
      )}

      {/* Category grid */}
      {catEntries.map(([catName, skills]) => {
        var isCollapsed = collapsed.has(catName);
        var catDue = skills.filter(sk => sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today)).length;
        return (
          <div key={catName} style={{ marginBottom: 20 }}>
            {/* Category header */}
            <div onClick={() => setCollapsedCats(prev => { var next = new Set(prev || new Set()); next.has(catName) ? next.delete(catName) : next.add(catName); return next; })}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: isCollapsed ? 0 : 10, padding: "6px 0" }}>
              <span style={{ fontSize: 10, color: T.txM }}>{isCollapsed ? "\u25B6" : "\u25BC"}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{catName}</span>
              <span style={{ fontSize: 12, color: T.txM }}>({skills.length})</span>
              {catDue > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: T.ac, background: T.acS, padding: "2px 8px", borderRadius: 4, marginLeft: "auto" }}>{catDue} due</span>}
            </div>

            {/* Skill cards grid */}
            {!isCollapsed && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                {skills.map(sk => {
                  var isExp = expandedSkill === sk.id;
                  var isDue = sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today);
                  var startTier = strengthToTier(sk.strength);
                  var daysAgo = sk.lastPracticed ? Math.round((Date.now() - new Date(sk.lastPracticed).getTime()) / 86400000) : null;

                  if (isExp) {
                    return (
                      <div key={sk.id} style={{ gridColumn: "1 / -1", background: T.sf, border: "1px solid " + T.acB, borderRadius: 14, padding: "20px 22px", transition: "all 0.15s ease" }}>
                        {/* Top row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: strColor(sk.strength), background: strBg(sk.strength), padding: "2px 8px", borderRadius: 4 }}>{Math.round(sk.strength * 100)}%</span>
                          {isDue && <span style={{ fontSize: 10, color: T.rd, fontWeight: 600, background: T.rd + "20", padding: "2px 6px", borderRadius: 4 }}>REVIEW DUE</span>}
                        </div>
                        {/* Skill name */}
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.tx, marginBottom: 6 }}>{sk.name}</div>
                        {/* Info line */}
                        <div style={{ fontSize: 11, color: T.txD, marginBottom: 14 }}>
                          {daysAgo !== null ? daysAgo + "d ago" : "Not yet practiced"}
                          {sk.deadlineTitle && <span style={{ color: sk.deadlineDays < 7 ? T.am : T.ac }}>{" | Needed for " + sk.deadlineTitle + " (" + sk.deadlineDays + "d)"}</span>}
                        </div>
                        {/* Learn / Practice buttons */}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => bootWithFocus({ type: "skill", skill: sk })}
                            style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: "1px solid " + T.acB, background: T.acS, color: T.ac, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            Learn
                            <div style={{ fontSize: 10, fontWeight: 400, color: T.txD, marginTop: 2 }}>AI-guided dialogue</div>
                          </button>
                          <button onClick={async () => {
                            var existingRow = await PracticeSets.get(sk.id);
                            var pset = existingRow?.data || createPracticeSet(active.id, sk, active.name);
                            var tier = pset.currentTier;
                            setPracticeMode({ generating: true, set: pset, skill: sk });
                            setPickerData(null); setSessionMode("practice");
                            try {
                              var tierData = pset.tiers[tier];
                              var lastAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
                              if (!lastAttempt || lastAttempt.completed) {
                                var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, sk);
                                pset = await generateProblems(pset, sk, active.name, matCtx);
                              }
                              await PracticeSets.upsert(sk.id, pset);
                              var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                              var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                              setPracticeMode({ set: pset, skill: sk, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
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
                      </div>
                    );
                  }

                  // Compact card
                  return (
                    <div key={sk.id} onClick={() => setExpandedSkill(sk.id)}
                      style={{ background: T.sf, borderRadius: 14, padding: "20px 22px", cursor: "pointer", border: "1px solid " + T.bd, transition: "all 0.15s ease", display: "flex", flexDirection: "column", gap: 10, minHeight: 90 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.acB; e.currentTarget.style.background = T.sfH; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.background = T.sf; }}>
                      {/* Top row: strength + due badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: strColor(sk.strength), background: strBg(sk.strength), padding: "2px 8px", borderRadius: 4 }}>{Math.round(sk.strength * 100)}%</span>
                        {isDue && <span style={{ fontSize: 10, color: T.rd, fontWeight: 600, background: T.rd + "20", padding: "2px 6px", borderRadius: 4 }}>REVIEW DUE</span>}
                      </div>
                      {/* Skill name */}
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}>{sk.name}</div>
                      {/* Last practiced */}
                      <div style={{ fontSize: 11, color: T.txD, marginTop: "auto" }}>
                        {daysAgo !== null ? daysAgo + "d ago" : "Not yet practiced"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
