import React, { useState, useEffect } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";
import { Assignments } from "../lib/db.js";
import { loadSkillsV2, decomposeAssignments } from "../lib/skills.js";
import { effectiveStrength, computeFacetReadiness } from "../lib/study.js";
import { currentRetrievability } from "../lib/fsrs.js";

function readinessColor(v) { return v >= 0.6 ? T.gn : v >= 0.3 ? "#F59E0B" : T.txM; }

function formatDueDate(epoch) {
  if (!epoch) return null;
  var n = Math.floor(Date.now() / 1000);
  var diff = epoch - n;
  var days = Math.floor(Math.abs(diff) / 86400);
  if (diff < 0) return days === 0 ? "overdue" : "overdue " + days + "d";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 14) return "in " + days + "d";
  var d = new Date(epoch * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getUrgencyLevel(epoch) {
  if (!epoch) return "none";
  var n = Math.floor(Date.now() / 1000);
  var diff = epoch - n;
  if (diff < 0) return "overdue";
  if (diff < 48 * 3600) return "urgent";
  if (diff < 7 * 86400) return "soon";
  return "normal";
}

// Compute 0-1 retrievability from raw mastery record
function masteryToStrength(m) {
  if (!m || !m.stability || !m.lastReviewAt) return 0;
  return currentRetrievability(m);
}

var URGENCY_COLORS = { overdue: T.rd, urgent: T.rd, soon: T.am, normal: T.ac, none: T.txM };

export default function CurriculumScreen() {
  var { active, setScreen, setShowSettings, bootWithFocus } = useStudy();

  var [activeAssignments, setActiveAssignments] = useState(null);
  var [reviewPool, setReviewPool] = useState([]);
  var [dueReviews, setDueReviews] = useState([]);
  var [skills, setSkills] = useState([]);

  var [expandedAsgn, setExpandedAsgn] = useState(null);
  var [expandedQuestion, setExpandedQuestion] = useState(null);
  var [expandedSkill, setExpandedSkill] = useState(null);
  var [chunkCache, setChunkCache] = useState({});
  var [loadingChunks, setLoadingChunks] = useState(null);
  var [confirmSubmitId, setConfirmSubmitId] = useState(null);
  var [decomposing, setDecomposing] = useState(false);

  useEffect(function () { if (active) loadData(); }, []);

  async function loadData() {
    // Parallel: curriculum data + skills + completed skills + review due
    var [curriculum, sk, completedSkills, dueSkills] = await Promise.all([
      Assignments.getCurriculum(active.id),
      loadSkillsV2(active.id),
      Assignments.getCompletedSkills(active.id),
      Assignments.getReviewDueSkills(active.id),
    ]);
    var safeSkills = Array.isArray(sk) ? sk : [];
    setSkills(safeSkills);
    setDueReviews(dueSkills);

    // Also compute facet readiness for more accurate strength values
    var allSkillIds = safeSkills.map(function (s) { return s.id; });
    var frMap = await computeFacetReadiness(allSkillIds);

    // Enrich curriculum assignments with computed readiness
    var enriched = curriculum.map(function (a) {
      var enrichedQs = (a.questions || []).map(function (q) {
        var qSkills = (q.skills || []).map(function (s) {
          // Prefer facet readiness → mastery record → 0
          var str = frMap.has(s.subSkillId) ? frMap.get(s.subSkillId) : masteryToStrength(s.mastery);
          return { id: s.subSkillId, name: s.name, conceptKey: s.conceptKey, strength: str };
        });
        var qReady = qSkills.length > 0 ? qSkills.reduce(function (sum, x) { return sum + x.strength; }, 0) / qSkills.length : 0;
        return { id: q.id, questionRef: q.questionRef, description: q.description, difficulty: q.difficulty, readiness: qReady, skills: qSkills };
      });

      // Compute assignment-level readiness from unique skills
      var uniqueSkills = {};
      enrichedQs.forEach(function (eq) { eq.skills.forEach(function (s) { if (!uniqueSkills[s.id]) uniqueSkills[s.id] = s; }); });
      var uSkillArr = Object.values(uniqueSkills);
      var aReady = uSkillArr.length > 0 ? uSkillArr.reduce(function (sum, x) { return sum + x.strength; }, 0) / uSkillArr.length : 0;
      var weakest = uSkillArr.length > 0 ? uSkillArr.reduce(function (w, x) { return x.strength < w.strength ? x : w; }) : null;

      return {
        id: a.id, title: a.title, dueDate: a.dueDate, status: a.status, readiness: aReady,
        weakestSkill: weakest, questions: enrichedQs,
      };
    });
    setActiveAssignments(enriched);

    // Build review pool from completed skills grouped by assignment
    var byAssignment = {};
    for (var cs of completedSkills) {
      if (!byAssignment[cs.assignmentId]) byAssignment[cs.assignmentId] = { id: cs.assignmentId, title: cs.assignmentTitle, skills: [] };
      var str = frMap.has(cs.subSkillId) ? frMap.get(cs.subSkillId) : masteryToStrength(cs.mastery);
      byAssignment[cs.assignmentId].skills.push({ id: cs.subSkillId, name: cs.name, strength: str });
    }
    setReviewPool(Object.values(byAssignment));
  }

  // Lazy-load chunks when a skill is expanded
  async function loadChunksForSkill(skillId) {
    if (chunkCache[skillId]) return;
    setLoadingChunks(skillId);
    try {
      var chunks = await Assignments.getChunksForSkill(skillId);
      setChunkCache(function (prev) { var next = Object.assign({}, prev); next[skillId] = chunks; return next; });
    } catch (e) {
      setChunkCache(function (prev) { var next = Object.assign({}, prev); next[skillId] = []; return next; });
    }
    setLoadingChunks(null);
  }

  function handleStudyWeakest(assignment) {
    var allSkills = [];
    (assignment.questions || []).forEach(function (q) { (q.skills || []).forEach(function (s) { allSkills.push(s); }); });
    if (allSkills.length === 0) return;
    var weakest = allSkills.reduce(function (w, x) { return x.strength < w.strength ? x : w; });
    var fullSkill = skills.find(function (s) { return s.id === weakest.id; });
    bootWithFocus({ type: "skill", skill: fullSkill || weakest });
  }

  function handleStudyQuestion(question) {
    var qSkills = question.skills || [];
    if (qSkills.length === 0) return;
    var weakest = qSkills.reduce(function (w, x) { return x.strength < w.strength ? x : w; });
    var fullSkill = skills.find(function (s) { return s.id === weakest.id; });
    bootWithFocus({ type: "skill", skill: fullSkill || weakest });
  }

  function handleStartReview() {
    if (dueReviews.length === 0) return;
    var due = dueReviews[0];
    var fullSkill = skills.find(function (s) { return s.id === due.subSkillId; });
    if (fullSkill) bootWithFocus({ type: "skill", skill: fullSkill });
  }

  async function handleMarkSubmitted(assignmentId) {
    await Assignments.markSubmitted(assignmentId);
    setConfirmSubmitId(null);
    await loadData();
  }

  function handleStudySkill(sk) {
    var fullSkill = skills.find(function (s) { return s.id === sk.id; });
    bootWithFocus({ type: "skill", skill: fullSkill || sk });
  }

  async function handleDecompose() {
    if (!active || decomposing) return;
    setDecomposing(true);
    try {
      await decomposeAssignments(active.id, active.materials || [], skills, function () {});
      await loadData();
    } catch (e) {
      console.error("Decompose failed:", e);
    }
    setDecomposing(false);
  }

  if (!active) return null;

  var hasActive = activeAssignments && activeAssignments.length > 0;
  var hasReviews = reviewPool.length > 0;
  var hasDue = dueReviews.length > 0;
  var showEmpty = activeAssignments && !hasActive && !hasDue;

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={function () { setScreen("schedule"); }}
          style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "none"; }}>&lt; Schedule</button>
        <div style={{ flex: 1 }} />
        <button onClick={function () { setShowSettings(true); }}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>Settings</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Curriculum</h1>
          <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 28 }}>{active.name}</p>

          {/* Loading */}
          {!activeAssignments && <div style={{ color: T.txD, fontSize: 14, padding: "24px 0" }}>Loading curriculum...</div>}

          {/* No materials prompt */}
          {activeAssignments && activeAssignments.every(function (a) { return a.questions.length === 0; }) && skills.length === 0 && activeAssignments.length > 0 && (
            <div style={{ textAlign: "center", padding: "32px 20px", background: "rgba(251,191,36,0.06)", borderRadius: 14, border: "1px solid rgba(251,191,36,0.15)", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 8 }}>Upload course materials first</div>
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 14 }}>Assignment decomposition requires extracted skills from your course materials.</div>
              <button onClick={function () { setScreen("materials"); }}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Go to Materials
              </button>
            </div>
          )}

          {/* ACTIVE ASSIGNMENTS */}
          {hasActive && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: T.ac, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 10 }}>ACTIVE ASSIGNMENTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeAssignments.map(function (asgn) {
                  var isExpA = expandedAsgn === asgn.id;
                  var urgency = getUrgencyLevel(asgn.dueDate);
                  var urgencyColor = URGENCY_COLORS[urgency];
                  return (
                    <div key={asgn.id} style={{ background: T.sf, border: "1px solid " + (isExpA ? T.acB : T.bd), borderRadius: 12, overflow: "hidden", transition: "all 0.15s" }}>
                      {/* Assignment header */}
                      <div onClick={function () { setExpandedAsgn(isExpA ? null : asgn.id); setExpandedQuestion(null); setExpandedSkill(null); }}
                        style={{ padding: "14px 18px", cursor: "pointer" }}
                        onMouseEnter={function (e) { if (!isExpA) e.currentTarget.style.background = T.sfH; }}
                        onMouseLeave={function (e) { if (!isExpA) e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asgn.title}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                            {asgn.dueDate && <span style={{ fontSize: 12, color: urgencyColor }}>{formatDueDate(asgn.dueDate)}</span>}
                            <span style={{ fontSize: 12, fontWeight: 600, color: readinessColor(asgn.readiness) }}>{Math.round(asgn.readiness * 100)}%</span>
                            <span style={{ fontSize: 11, color: T.txD }}>{isExpA ? "\u25B4" : "\u25BE"}</span>
                          </div>
                        </div>
                        {/* Readiness bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.bd, overflow: "hidden" }}>
                            <div style={{ width: Math.round(asgn.readiness * 100) + "%", height: "100%", borderRadius: 2, background: readinessColor(asgn.readiness), transition: "width 0.3s" }} />
                          </div>
                        </div>
                      </div>

                      {/* Expanded assignment */}
                      {isExpA && (
                        <div style={{ borderTop: "1px solid " + T.bd, padding: "14px 18px" }}>
                          {/* Ready to submit banner */}
                          {asgn.readiness >= 0.6 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8, marginBottom: 12 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.gn }}>{asgn.readiness >= 0.8 ? "Highly prepared" : "Ready to submit"}</span>
                            </div>
                          )}

                          {/* Action row */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            <button onClick={function () { handleStudyWeakest(asgn); }}
                              style={{ flex: 1, padding: "9px 14px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {asgn.readiness >= 0.6 ? "Review Before Submitting" : "Study Weakest"}
                            </button>
                            {confirmSubmitId === asgn.id ? (
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12, color: T.txD }}>Are you sure?</span>
                                <button onClick={function () { handleMarkSubmitted(asgn.id); }}
                                  style={{ padding: "7px 12px", borderRadius: 6, border: "none", background: T.gn, color: "#0F1115", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Yes</button>
                                <button onClick={function () { setConfirmSubmitId(null); }}
                                  style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid " + T.bd, background: T.sf, color: T.txD, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={function () { setConfirmSubmitId(asgn.id); }}
                                style={{ flex: 1, padding: "9px 14px", borderRadius: 8, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                                onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
                                onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
                                Mark as Submitted
                              </button>
                            )}
                          </div>

                          {/* Not decomposed — inline trigger */}
                          {asgn.questions.length === 0 && (
                            <div style={{ padding: "14px 0", textAlign: "center" }}>
                              <div style={{ fontSize: 13, color: T.txD, marginBottom: 10 }}>Not yet decomposed</div>
                              <button onClick={handleDecompose} disabled={decomposing}
                                style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 12, fontWeight: 600, cursor: decomposing ? "default" : "pointer", opacity: decomposing ? 0.6 : 1 }}>
                                {decomposing ? "Decomposing..." : "Decompose Now"}
                              </button>
                            </div>
                          )}

                          {/* Questions */}
                          {asgn.questions.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>QUESTIONS</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {asgn.questions.map(function (q) {
                                  var isExpQ = expandedQuestion === q.id;
                                  return (
                                    <div key={q.id} style={{ background: T.bg, border: "1px solid " + T.bd, borderRadius: 8, overflow: "hidden" }}>
                                      {/* Question header */}
                                      <div onClick={function () { setExpandedQuestion(isExpQ ? null : q.id); setExpandedSkill(null); }}
                                        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                        onMouseEnter={function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                                        onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 13, color: T.tx, fontWeight: 500 }}>
                                            <span style={{ color: T.txD, marginRight: 6 }}>{q.questionRef}</span>
                                            {q.description && <span style={{ color: T.txM, fontSize: 12 }}>{q.description.length > 60 ? q.description.slice(0, 60) + "..." : q.description}</span>}
                                          </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
                                          {q.difficulty && <span style={{ fontSize: 10, color: T.txD, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: T.bd }}>{q.difficulty}</span>}
                                          <span style={{ fontSize: 12, fontWeight: 600, color: readinessColor(q.readiness) }}>{Math.round(q.readiness * 100)}%</span>
                                          <span style={{ fontSize: 10, color: T.txD }}>{isExpQ ? "\u25B4" : "\u25BE"}</span>
                                        </div>
                                      </div>

                                      {/* Expanded question */}
                                      {isExpQ && (
                                        <div style={{ borderTop: "1px solid " + T.bd, padding: "10px 14px" }}>
                                          <button onClick={function () { handleStudyQuestion(q); }}
                                            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}
                                            onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
                                            onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
                                            Study Question
                                          </button>

                                          {/* Required skills */}
                                          {q.skills.length > 0 && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                              {q.skills.map(function (sk) {
                                                var isExpS = expandedSkill === sk.id;
                                                var skColor = sk.strength === 0 ? T.txM : readinessColor(sk.strength);
                                                var isUntested = sk.strength === 0;
                                                var hasChunks = chunkCache[sk.id] ? chunkCache[sk.id].length > 0 : true; // assume yes until loaded
                                                var isGap = sk.strength < 0.3 && chunkCache[sk.id] && chunkCache[sk.id].length === 0;
                                                var rowBg = isGap ? "rgba(239,68,68,0.08)" : sk.strength < 0.3 && !isUntested ? "rgba(239,68,68,0.06)" : "transparent";
                                                var parentBadge = sk.conceptKey && sk.conceptKey.indexOf("/") !== -1 ? sk.conceptKey.split("/")[0] : null;
                                                return (
                                                  <div key={sk.id}>
                                                    <div onClick={function () {
                                                      var newId = isExpS ? null : sk.id;
                                                      setExpandedSkill(newId);
                                                      if (newId) loadChunksForSkill(newId);
                                                    }}
                                                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: rowBg }}
                                                      onMouseEnter={function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                                                      onMouseLeave={function (e) { e.currentTarget.style.background = rowBg; }}>
                                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: 3, background: skColor, flexShrink: 0 }} />
                                                        {parentBadge && <span style={{ fontSize: 9, color: T.txD, padding: "1px 4px", borderRadius: 3, background: "rgba(255,255,255,0.04)", flexShrink: 0 }}>{parentBadge}</span>}
                                                        <div style={{ fontSize: 12, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</div>
                                                      </div>
                                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                        <div style={{ width: 40, height: 4, borderRadius: 2, background: T.bd, overflow: "hidden" }}>
                                                          <div style={{ width: isUntested ? 0 : Math.round(sk.strength * 100) + "%", height: "100%", borderRadius: 2, background: skColor }} />
                                                        </div>
                                                        <span style={{ fontSize: 11, color: skColor, fontWeight: 600, width: 30, textAlign: "right" }}>{isUntested ? "New" : Math.round(sk.strength * 100) + "%"}</span>
                                                        <span style={{ fontSize: 9, color: T.txD }}>{isExpS ? "\u25B4" : "\u25BE"}</span>
                                                      </div>
                                                    </div>
                                                    {/* Expanded skill — chunk list */}
                                                    {isExpS && (
                                                      <div style={{ marginLeft: 22, marginTop: 4, marginBottom: 4 }}>
                                                        {loadingChunks === sk.id && <div style={{ fontSize: 11, color: T.txD, padding: 4 }}>Loading sources...</div>}
                                                        {chunkCache[sk.id] && chunkCache[sk.id].length === 0 && (
                                                          <div style={{ fontSize: 11, color: "#F59E0B", padding: "6px 10px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6, marginBottom: 4 }}>
                                                            {"\u26A0"} No material covers this skill
                                                          </div>
                                                        )}
                                                        {chunkCache[sk.id] && chunkCache[sk.id].length > 0 && chunkCache[sk.id].slice(0, 5).map(function (ch, ci) {
                                                          return (
                                                            <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", fontSize: 11, color: T.txM }}>
                                                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: ch.bindingType === "teaches" ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)", color: ch.bindingType === "teaches" ? T.gn : T.txD }}>{ch.bindingType}</span>
                                                              {ch.materialName && <span style={{ color: T.txD, flexShrink: 0 }}>{ch.materialName} {"\u203A"}</span>}
                                                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.label}</span>
                                                            </div>
                                                          );
                                                        })}
                                                        {chunkCache[sk.id] && chunkCache[sk.id].length > 5 && (
                                                          <div style={{ fontSize: 11, color: T.txD, padding: "2px 6px" }}>+{chunkCache[sk.id].length - 5} more</div>
                                                        )}
                                                        {/* Study This Skill button */}
                                                        <button onClick={function () { handleStudySkill(sk); }}
                                                          style={{ width: "100%", marginTop: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                                                          onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
                                                          onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
                                                          Study This Skill
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REVIEW SECTION */}
          {hasReviews && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: T.am, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 10 }}>REVIEW</div>

              {/* Due banner */}
              {hasDue && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.am }}>{dueReviews.length} skill{dueReviews.length !== 1 ? "s" : ""} due for review</span>
                  <button onClick={handleStartReview}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: T.am, color: "#0F1115", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Start Review
                  </button>
                </div>
              )}

              {/* Completed assignments */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reviewPool.map(function (rp) {
                  var isExpR = expandedAsgn === "review-" + rp.id;
                  var rpDueCount = rp.skills.filter(function (sk) { return dueReviews.some(function (d) { return d.subSkillId === sk.id; }); }).length;
                  return (
                    <div key={rp.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, overflow: "hidden" }}>
                      <div onClick={function () { setExpandedAsgn(isExpR ? null : "review-" + rp.id); }}
                        style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
                        onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{rp.title}</span>
                          {rpDueCount > 0 && <span style={{ fontSize: 11, color: T.am, fontWeight: 600 }}>({rpDueCount} due)</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, color: T.txD }}>{isExpR ? "\u25B4" : "\u25BE"}</span>
                        </div>
                      </div>
                      {isExpR && rp.skills.length > 0 && (
                        <div style={{ borderTop: "1px solid " + T.bd, padding: "10px 16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {rp.skills.map(function (sk) {
                              var skColor = readinessColor(sk.strength);
                              var isDue = dueReviews.some(function (d) { return d.subSkillId === sk.id; });
                              return (
                                <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: 6 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: 3, background: skColor, flexShrink: 0 }} />
                                    <div style={{ fontSize: 12, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</div>
                                    {isDue && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(248,113,113,0.12)", color: T.rd, fontWeight: 600 }}>DUE</span>}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    <div style={{ width: 40, height: 4, borderRadius: 2, background: T.bd, overflow: "hidden" }}>
                                      <div style={{ width: Math.round(sk.strength * 100) + "%", height: "100%", borderRadius: 2, background: skColor }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: skColor, fontWeight: 600 }}>{Math.round(sk.strength * 100)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* EMPTY STATE */}
          {showEmpty && (
            <div style={{ textAlign: "center", padding: "48px 20px", background: T.sf, borderRadius: 14, border: "1px solid " + T.bd }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.tx, marginBottom: 8 }}>No active assignments</div>
              <div style={{ fontSize: 14, color: T.txD, lineHeight: 1.5, marginBottom: 20 }}>
                Activate assignments on the schedule to start tracking readiness, or go to materials to manage your uploads.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={function () { setScreen("schedule"); }}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Go to Schedule
                </button>
                <button onClick={function () { setScreen("materials"); }}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid " + T.bd, background: "transparent", color: T.txD, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Materials
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
