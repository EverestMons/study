import React, { useState, useMemo } from "react";
import { T } from "../../lib/theme.jsx";
import { PracticeSets, loadCoursesNested, Chunks } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2 } from "../../lib/skills.js";
import {
  strengthToTier, TIERS, createPracticeSet, generateProblems,
  loadPracticeMaterialCtx,
} from "../../lib/study.js";
import { currentRetrievability } from "../../lib/fsrs.js";
import { useStudy } from "../../StudyContext.jsx";

function strengthColor(v) {
  return v >= 0.6 ? T.gn : v >= 0.3 ? "#F59E0B" : v > 0 ? T.rd : T.txM;
}
function strengthBand(v) {
  return v >= 0.6 ? "Strong" : v >= 0.3 ? "Developing" : v > 0 ? "Weak" : "New";
}
var BANDS = ["Strong", "Developing", "Weak", "New"];
var BAND_COLORS = { Strong: T.gn, Developing: "#F59E0B", Weak: T.rd, New: T.txM };

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

  var [search, setSearch] = useState("");
  var [groupBy, setGroupBy] = useState("strength");
  var [bloomsFilter, setBloomsFilter] = useState(null);
  var [typeFilter, setTypeFilter] = useState(null);
  var [expandedSkill, setExpandedSkill] = useState(null);
  var [collapsedCats, setCollapsedCats] = useState(new Set());

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

  // Due skills (from full set, not filtered)
  var dueSkills = items.filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today));
  var mostUrgent = null;
  if (dueSkills.length > 0) {
    mostUrgent = dueSkills.reduce((best, s) => {
      var r = currentRetrievability(s.mastery || s);
      var bestR = currentRetrievability(best.mastery || best);
      if (r === 0 && bestR === 0) {
        if (s.reviewDate && best.reviewDate && s.reviewDate !== best.reviewDate)
          return s.reviewDate < best.reviewDate ? s : best;
        return s.strength < best.strength ? s : best;
      }
      return r < bestR ? s : best;
    }, dueSkills[0]);
  }

  var isDue = (sk) => sk.reviewDate === "now" || (sk.reviewDate && sk.reviewDate <= today);

  // Unique blooms/types for filter chips
  var allBlooms = [...new Set(items.map(s => s.bloomsLevel).filter(Boolean))].sort();
  var allTypes = [...new Set(items.map(s => s.skillType).filter(Boolean))].sort();

  // Filter pipeline
  var q = search.toLowerCase();
  var filtered = items.filter(sk => {
    if (q && !(sk.name || "").toLowerCase().includes(q) && !(sk.description || "").toLowerCase().includes(q) && !(sk.category || "").toLowerCase().includes(q)) return false;
    if (bloomsFilter && sk.bloomsLevel !== bloomsFilter) return false;
    if (typeFilter && sk.skillType !== typeFilter) return false;
    return true;
  });

  // Stats (from full set)
  var stats = { Strong: 0, Developing: 0, Weak: 0, New: 0 };
  for (var it of items) stats[strengthBand(it.strength)]++;

  // Smart sort within groups: weakest first, deadline-promoted
  var sortSkills = (arr) => [...arr].sort((a, b) => {
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

  // Grouped data
  var grouped;
  if (groupBy === "strength") {
    var bands = { Strong: [], Developing: [], Weak: [], New: [] };
    for (var sk of filtered) bands[strengthBand(sk.strength)].push(sk);
    grouped = BANDS.map(b => ({ label: b, color: BAND_COLORS[b], items: sortSkills(bands[b]) })).filter(g => g.items.length > 0);
  } else {
    var cats = {};
    for (var sk of filtered) {
      var cat = sk.category || "Uncategorized";
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(sk);
    }
    grouped = Object.entries(cats)
      .sort((a, b) => {
        var aDue = a[1].filter(isDue).length;
        var bDue = b[1].filter(isDue).length;
        if (aDue !== bDue) return bDue - aDue;
        var aAvg = a[1].reduce((sum, x) => sum + x.strength, 0) / a[1].length;
        var bAvg = b[1].reduce((sum, x) => sum + x.strength, 0) / b[1].length;
        return aAvg - bAvg;
      })
      .map(([label, arr]) => ({ label, color: null, items: sortSkills(arr) }));
  }

  var chipStyle = (on) => ({
    fontSize: 11, padding: "3px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid " + (on ? T.ac : T.bd),
    background: on ? T.acS : "transparent", color: on ? T.ac : T.txD, transition: "all 0.15s ease", whiteSpace: "nowrap",
  });

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick a skill to work on</div>

      {/* Stats bar */}
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span>{items.length} skills</span>
        {BANDS.map(b => stats[b] > 0 && (
          <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: T.txM }}>|</span>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: BAND_COLORS[b], display: "inline-block" }} />
            <span>{stats[b]} {b.toLowerCase()}</span>
          </span>
        ))}
      </div>

      {/* Review banner */}
      {dueSkills.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.acS, border: "1px solid " + T.acB, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ac }}>{dueSkills.length} skill{dueSkills.length !== 1 ? "s" : ""} due for review</span>
          <button onClick={() => bootWithFocus({ type: "skill", skill: mostUrgent })}
            style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Start Review
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.gnS, border: "1px solid " + T.gn + "40", borderRadius: 14, padding: "14px 20px", marginBottom: 16 }}>
          <span style={{ color: T.gn, fontWeight: 600 }}>{"\u2713"}</span>
          <span style={{ fontSize: 13, color: T.gn, fontWeight: 500 }}>You're current — no reviews needed</span>
        </div>
      )}

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          type="text" placeholder="Search skills..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "8px 32px 8px 12px", fontSize: 13, background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, color: T.tx }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid " + T.bd }}>
          {["strength", "category"].map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              style={{ fontSize: 11, padding: "4px 12px", border: "none", cursor: "pointer", background: groupBy === g ? T.acS : "transparent", color: groupBy === g ? T.ac : T.txD, transition: "all 0.15s ease" }}>
              {g === "strength" ? "Strength" : "Category"}
            </button>
          ))}
        </div>
        {(allBlooms.length > 0 || allTypes.length > 0) && <span style={{ color: T.bd }}>|</span>}
        {allBlooms.map(b => (
          <button key={b} onClick={() => setBloomsFilter(bloomsFilter === b ? null : b)} style={chipStyle(bloomsFilter === b)}>{b}</button>
        ))}
        {allBlooms.length > 0 && allTypes.length > 0 && <span style={{ color: T.bd }}>|</span>}
        {allTypes.map(t => (
          <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} style={chipStyle(typeFilter === t)}>{t}</button>
        ))}
      </div>

      {/* Filtered count */}
      {filtered.length !== items.length && (
        <div style={{ fontSize: 12, color: T.txM, marginBottom: 10 }}>Showing {filtered.length} of {items.length} skills</div>
      )}

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No skills match your filters.</div>
      ) : grouped.map(group => {
        var isOpen = groupBy === "strength" || !collapsedCats.has(group.label);
        return (
          <div key={group.label} style={{ marginBottom: 10 }}>
            {/* Group header */}
            <button onClick={() => { if (groupBy === "category") setCollapsedCats(prev => { var next = new Set(prev); next.has(group.label) ? next.delete(group.label) : next.add(group.label); return next; }); }}
              style={{ width: "100%", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 16px", cursor: groupBy === "category" ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8 }}>
              {group.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: group.color, flexShrink: 0 }} />}
              {groupBy === "category" && <span style={{ fontSize: 12, color: T.txD }}>{isOpen ? "\u25BE" : "\u25B8"}</span>}
              <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, flex: 1, textAlign: "left" }}>{group.label}</span>
              {(() => { var gDue = group.items.filter(isDue).length; return gDue > 0 ? <span style={{ fontSize: 10, color: T.ac, background: T.acS, padding: "1px 6px", borderRadius: 4 }}>{gDue} due</span> : null; })()}
              <span style={{ fontSize: 12, color: T.txD }}>{group.items.length}</span>
            </button>

            {/* Skill rows */}
            {isOpen && (
              <div style={{ marginTop: 4 }}>
                {group.items.map(sk => {
                  var expanded = expandedSkill === sk.id;
                  var strPct = Math.round(sk.strength * 100);
                  var due = isDue(sk);
                  var daysAgo = sk.lastPracticed ? Math.round((Date.now() - new Date(sk.lastPracticed).getTime()) / 86400000) : null;
                  var startTier = strengthToTier(sk.strength);

                  return (
                    <div key={sk.id}>
                      {/* Compact row */}
                      <button onClick={() => setExpandedSkill(expanded ? null : sk.id)}
                        style={{ width: "100%", background: expanded ? T.sfH : "transparent", border: "none", borderBottom: "1px solid " + T.bd, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s ease" }}
                        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: strengthColor(sk.strength), flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: T.tx, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</span>
                        {groupBy === "strength" && sk.category && (
                          <span style={{ fontSize: 10, color: T.txM, background: T.sf, padding: "1px 6px", borderRadius: 8, flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.category}</span>
                        )}
                        {due && <span style={{ fontSize: 9, color: T.rd, background: "rgba(248,113,113,0.1)", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>Due</span>}
                        {sk.deadlineTitle && <span style={{ fontSize: 9, color: sk.deadlineDays < 7 ? T.am : T.ac, flexShrink: 0 }}>{sk.deadlineDays}d</span>}
                        <span style={{ fontSize: 12, color: strengthColor(sk.strength), flexShrink: 0, minWidth: 32, textAlign: "right" }}>{sk.strength > 0 ? strPct + "%" : "New"}</span>
                      </button>

                      {/* Expanded detail */}
                      {expanded && (
                        <div style={{ padding: "12px 16px 14px 30px", background: T.sfH, borderBottom: "1px solid " + T.bd }}>
                          {sk.description && <div style={{ fontSize: 13, color: T.txD, marginBottom: 8 }}>{sk.description}</div>}
                          {/* Info line */}
                          <div style={{ fontSize: 11, color: T.txD, marginBottom: 10 }}>
                            {daysAgo !== null ? "Practiced " + daysAgo + "d ago" : "Not yet practiced"}
                            {sk.deadlineTitle && <span style={{ color: sk.deadlineDays < 7 ? T.am : T.ac }}>{" | Needed for " + sk.deadlineTitle + " (" + sk.deadlineDays + "d)"}</span>}
                          </div>
                          {/* Badges */}
                          {(sk.bloomsLevel || sk.skillType) && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                              {sk.bloomsLevel && <span style={{ fontSize: 10, color: T.ac, background: T.acS, padding: "2px 6px", borderRadius: 4 }}>{sk.bloomsLevel}</span>}
                              {sk.skillType && <span style={{ fontSize: 10, color: T.txM, background: T.bg, padding: "2px 6px", borderRadius: 4 }}>{sk.skillType}</span>}
                            </div>
                          )}
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
  );
}
