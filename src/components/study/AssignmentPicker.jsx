import React, { useState, useRef } from "react";
import { T } from "../../lib/theme.jsx";
import { Assignments, PracticeSets, loadCoursesNested } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2, decomposeAssignments } from "../../lib/skills.js";
import {
  strengthToTier, effectiveStrength,
  TIERS, createPracticeSet, generateProblems,
  loadPracticeMaterialCtx,
} from "../../lib/study.js";
import DatePicker from "../DatePicker.jsx";
import { useStudy } from "../../StudyContext.jsx";

function getUrgencyLevel(dueDateEpoch) {
  if (!dueDateEpoch) return "none";
  var now = Math.floor(Date.now() / 1000);
  var diff = dueDateEpoch - now;
  if (diff < 0) return "overdue";
  if (diff < 48 * 3600) return "urgent";
  if (diff < 7 * 86400) return "soon";
  return "normal";
}

var URGENCY_COLORS = { overdue: T.rd, urgent: T.rd, soon: T.am, normal: T.ac, none: T.txM };

function formatNudgeDate(epoch) {
  if (!epoch) return null;
  var now = Math.floor(Date.now() / 1000);
  var diff = epoch - now;
  var days = Math.floor(Math.abs(diff) / 86400);
  if (diff < 0) return days === 0 ? "overdue" : "overdue by " + days + (days === 1 ? " day" : " days");
  if (days === 0) return "due today";
  if (days === 1) return "tomorrow";
  if (days <= 14) return "in " + days + " days";
  var d = new Date(epoch * 1000);
  if (d.getFullYear() === new Date().getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AssignmentPicker() {
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

  var [openPicker, setOpenPicker] = useState(null);
  var dateRefs = useRef({});

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
          <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick an assignment</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Study will focus on teaching what you need for the one you choose.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
            {pickerData.items.map((a, i) => {
              var isExpanded = pickerData.expanded === i;
              var readyColor = a.avgStrength >= 0.6 ? T.gn : a.avgStrength >= 0.3 ? "#F59E0B" : (T.txM || T.txD);
              var urgency = getUrgencyLevel(a.dueDateEpoch);
              var urgencyColor = URGENCY_COLORS[urgency];
              var isOverdue = urgency === "overdue";
              var cardBorder = isExpanded ? T.acB : isOverdue ? "rgba(248,113,113,0.3)" : T.bd;
              var cardBg = isOverdue ? "rgba(248,113,113,0.06)" : T.sf;
              return (
                <div key={a.id || i} style={{ background: cardBg, border: "1px solid " + cardBorder, borderRadius: 12, overflow: "hidden", transition: "all 0.15s" }}>
                  <div onClick={() => setPickerData(prev => ({ ...prev, expanded: isExpanded ? null : i }))}
                    style={{ padding: "16px 20px", cursor: "pointer" }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = isOverdue ? "rgba(248,113,113,0.1)" : T.acS; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{a.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span ref={el => { dateRefs.current[a.id] = el; }}
                          onClick={e => { e.stopPropagation(); setOpenPicker(openPicker === a.id ? null : a.id); }}
                          style={{ fontSize: 11, color: urgencyColor, cursor: "pointer" }}
                          title="Click to set due date">
                          {a.dueDate || "No due date"}
                        </span>
                        {openPicker === a.id && (
                          <DatePicker value={a.dueDateEpoch}
                            onChange={async (newEpoch) => {
                              await Assignments.updateDueDate(a.id, newEpoch);
                              setPickerData(prev => {
                                if (!prev?.items) return prev;
                                var updated = prev.items.map(item => {
                                  if (item.id !== a.id) return item;
                                  return { ...item, dueDateEpoch: newEpoch, dueDate: formatNudgeDate(newEpoch) };
                                });
                                return { ...prev, items: updated };
                              });
                              setOpenPicker(null);
                            }}
                            anchorRef={{ current: dateRefs.current[a.id] }}
                            onClose={() => setOpenPicker(null)}
                          />
                        )}
                        <span style={{ fontSize: 11, color: T.txD }}>{isExpanded ? "\u25b4" : "\u25be"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.txD }}>
                      {a.questionCount} question{a.questionCount !== 1 ? "s" : ""} | {a.skillList.length} skills needed
                      <span style={{ color: readyColor }}> | readiness: {Math.round(a.avgStrength * 100)}%</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 20px" }}>
                      {a.skillList.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>Required Skills</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {a.skillList.sort((x, y) => x.strength - y.strength).map(sk => {
                              var skColor = sk.strength >= 0.6 ? T.gn : sk.strength >= 0.4 ? "#F59E0B" : (T.rd || "#EF4444");
                              var isWeak = sk.strength < 0.4;
                              return (
                                <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, background: isWeak ? "rgba(239,68,68,0.06)" : "transparent" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: 3, background: skColor, flexShrink: 0 }} />
                                    <div style={{ fontSize: 12, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                    <span style={{ fontSize: 11, color: skColor, fontWeight: 600 }}>{Math.round(sk.strength * 100)}%</span>
                                    {isWeak && (
                                      <button onClick={async (e) => {
                                        e.stopPropagation();
                                        var fullSkill = Array.isArray(pickerData._skills) ? pickerData._skills.find(s => s.id === sk.id) : null;
                                        if (!fullSkill) { addNotif("error", "Skill not found"); return; }
                                        var existingRow = await PracticeSets.get(fullSkill.id);
                                        var existing = existingRow?.data || null;
                                        var pset = existing || createPracticeSet(active.id, fullSkill, active.name);
                                        var tier = pset.currentTier;
                                        setPracticeMode({ generating: true, set: pset, skill: fullSkill });
                                        setPickerData(null); setSessionMode("practice");
                                        try {
                                          var tierData = pset.tiers[tier];
                                          var lastAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
                                          if (!lastAttempt || lastAttempt.completed) {
                                            var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, fullSkill);
                                            pset = await generateProblems(pset, fullSkill, active.name, matCtx);
                                          }
                                          await PracticeSets.upsert(fullSkill.id, pset);
                                          var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                                          var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                                          setPracticeMode({ set: pset, skill: fullSkill, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                                        } catch (err) {
                                          addNotif("error", "Failed to start practice: " + err.message);
                                          setPracticeMode(null); setSessionMode(null);
                                        }
                                      }}
                                        style={{ background: "none", border: "1px solid " + T.acB, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.ac, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Practice</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <button onClick={() => bootWithFocus({ type: "assignment", assignment: a })}
                        style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: a.avgStrength >= 0.4 ? "none" : "1px solid " + T.bd, background: a.avgStrength >= 0.4 ? T.ac : T.sf, color: a.avgStrength >= 0.4 ? "#0F1115" : T.tx, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        {a.avgStrength >= 0.4 ? "Start Assignment" : "Start Anyway (low readiness)"}
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
