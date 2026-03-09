import React, { useState, useEffect, useRef } from "react";
import { T } from "../../lib/theme.jsx";
import { DB, Assignments, CourseSchedule } from "../../lib/db.js";
import { runExtractionV2, loadSkillsV2 } from "../../lib/skills.js";
import { decomposeAssignments } from "../../lib/skills.js";
import DatePicker from "../DatePicker.jsx";

function getUrgencyLevel(dueDateEpoch) {
  if (!dueDateEpoch) return 'none';
  const now = Math.floor(Date.now() / 1000);
  const diff = dueDateEpoch - now;
  if (diff < 0) return 'overdue';
  if (diff < 48 * 3600) return 'urgent';
  if (diff < 7 * 86400) return 'soon';
  return 'normal';
}

const URGENCY_COLORS = {
  overdue: T.rd, urgent: T.rd, soon: T.am, normal: T.ac, none: T.txM,
};

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
import {
  strengthToTier, effectiveStrength, nextReviewDate,
  TIERS, createPracticeSet, generateProblems,
  loadPracticeMaterialCtx,
} from "../../lib/study.js";
import { useStudy } from "../../StudyContext.jsx";

export default function ModePicker() {
  const {
    active, setActive, setCourses,
    busy, setBusy, booting,
    status, setStatus,
    globalLock, setGlobalLock,
    setScreen,
    notifs, lastSeenNotif, setLastSeenNotif,
    sessionMode, setSessionMode,
    pickerData, setPickerData,
    chunkPicker, practiceMode, setPracticeMode,
    extractionCancelledRef,
    addNotif,
    selectMode, bootWithFocus,
  } = useStudy();

  var [nudgeItem, setNudgeItem] = useState(null);
  var [suggestedMode, setSuggestedMode] = useState(null);
  var [nudgeDismissed, setNudgeDismissed] = useState(false);
  var [openPicker, setOpenPicker] = useState(null);
  var dateRefs = useRef({});

  useEffect(() => {
    if (!active) return;
    var cancelled = false;

    (async () => {
      var now = Math.floor(Date.now() / 1000);
      var candidates = [];

      var asgn = await Assignments.getByCourse(active.id);
      var sk = await loadSkillsV2(active.id);

      for (var a of asgn) {
        if (a.status === "completed") continue;
        if (a.source === "syllabus" && !a.materialId) continue;

        var questions = await Assignments.getQuestions(a.id);
        var reqIds = new Set();
        questions.forEach(function (q) {
          (q.requiredSkills || []).forEach(function (s) { reqIds.add(s.conceptKey || s.name || String(s.subSkillId)); });
        });
        var skillList = [...reqIds].map(function (sid) {
          var s = (sk || []).find(function (x) { return x.id === sid || x.conceptKey === sid; });
          if (!s) s = (sk || []).find(function (x) { return x.name && x.name.toLowerCase() === sid.toLowerCase(); });
          return { id: s?.id || sid, name: s?.name || sid, strength: s ? effectiveStrength(s) : 0 };
        });
        var avg = skillList.length > 0 ? skillList.reduce(function (sum, x) { return sum + x.strength; }, 0) / skillList.length : 0;

        var isOverdue = a.dueDate && a.dueDate < now;
        var daysUntil = a.dueDate ? Math.floor((a.dueDate - now) / 86400) : null;

        if (isOverdue || (daysUntil !== null && daysUntil <= 3 && avg < 0.6)) {
          // Build enriched assignment for bootWithFocus
          var enrichedQuestions = questions.map(function (q) {
            return {
              id: q.questionRef || String(q.id),
              description: q.description,
              difficulty: q.difficulty,
              requiredSkills: (q.requiredSkills || []).map(function (s) { return s.conceptKey || s.name || String(s.subSkillId); }),
            };
          });
          candidates.push({
            type: "assignment",
            title: a.title,
            dueDateEpoch: a.dueDate,
            readiness: avg,
            isOverdue: isOverdue,
            daysUntil: daysUntil,
            assignment: { ...a, questions: enrichedQuestions, dueDateEpoch: a.dueDate || null, dueDate: formatNudgeDate(a.dueDate) },
          });
        }
      }

      // Exams
      var schedule = await CourseSchedule.getByCourse(active.id);
      var allSkillAvg = (sk || []).length > 0
        ? sk.reduce(function (s, x) { return s + effectiveStrength(x); }, 0) / sk.length : 0;

      for (var week of schedule) {
        try {
          var exams = JSON.parse(week.exams || "[]");
          for (var exam of exams) {
            if (!exam.date) continue;
            var epoch = Math.floor(new Date(exam.date).getTime() / 1000);
            if (isNaN(epoch)) continue;
            var examOverdue = epoch < now;
            var examDays = Math.floor((epoch - now) / 86400);

            if (examOverdue || (examDays <= 7 && allSkillAvg < 0.6)) {
              candidates.push({
                type: "exam",
                title: exam.name || exam.title || "Exam",
                dueDateEpoch: epoch,
                readiness: allSkillAvg,
                isOverdue: examOverdue,
                daysUntil: examDays,
              });
            }
          }
        } catch (e) { /* skip malformed */ }
      }

      if (cancelled) return;

      if (candidates.length === 0) {
        // Check for spaced repetition due
        if (Array.isArray(sk)) {
          var today = new Date().toISOString().split("T")[0];
          var dueForReview = sk.filter(function (s) { var rd = nextReviewDate(s); return rd && rd <= today; });
          if (dueForReview.length > 0) setSuggestedMode("skills");
        }
        return;
      }

      candidates.sort(function (a, b) {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.isOverdue && b.isOverdue) return b.dueDateEpoch - a.dueDateEpoch;
        return a.dueDateEpoch - b.dueDateEpoch;
      });

      var top = candidates[0];
      setNudgeItem(top);
      setSuggestedMode(top.type === "exam" ? "exam" : "assignment");
    })();

    return function () { cancelled = true; };
  }, [active?.id]);

  // Mode button style helper — accent for suggested mode, neutral for others
  function modeBtn(mode) {
    var isSuggested = suggestedMode === mode || (!suggestedMode && mode === "assignment");
    return {
      bg: isSuggested ? T.acS : T.sf,
      border: isSuggested ? T.acB : T.bd,
      titleColor: isSuggested ? T.ac : T.tx,
      hoverBg: isSuggested ? "rgba(108,156,252,0.15)" : T.sfH,
      hoverBorder: T.acB,
    };
  }

  // Main mode picker (no session, no boot, no chunk picker, no practice)
  if (!sessionMode && !booting && !chunkPicker && !practiceMode) {
    var nudgeLabel = null;
    var nudgeBg = null;
    var nudgeBorder = null;
    var nudgeColor = null;
    if (nudgeItem && !nudgeDismissed) {
      var isRed = nudgeItem.isOverdue || (nudgeItem.daysUntil !== null && nudgeItem.daysUntil < 2);
      nudgeBg = isRed ? "rgba(248,113,113,0.08)" : "rgba(245,158,11,0.06)";
      nudgeBorder = isRed ? "rgba(248,113,113,0.3)" : "rgba(245,158,11,0.2)";
      nudgeColor = isRed ? (T.rd || "#EF4444") : T.am;
      if (nudgeItem.isOverdue) {
        var overdueDays = Math.abs(nudgeItem.daysUntil);
        nudgeLabel = overdueDays === 0 ? "overdue" : "overdue by " + overdueDays + (overdueDays === 1 ? " day" : " days");
      } else if (nudgeItem.daysUntil === 0) {
        nudgeLabel = "due today";
      } else if (nudgeItem.daysUntil === 1) {
        nudgeLabel = "due tomorrow";
      } else {
        nudgeLabel = "due in " + nudgeItem.daysUntil + " days";
      }
    }

    var readinessColor = function (v) { return v >= 0.6 ? T.gn : v >= 0.3 ? "#F59E0B" : (T.txM || T.txD); };

    var a1 = modeBtn("assignment");
    var a2 = modeBtn("recap");
    var a3 = modeBtn("skills");
    var a4 = modeBtn("exam");
    var a5 = modeBtn("explore");

    return (
      <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>{active.name}</h1>
        <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: nudgeItem && !nudgeDismissed ? 16 : 32 }}>Pick a direction and we'll get started.</p>

        {/* Deadline nudge banner */}
        {nudgeItem && !nudgeDismissed && (
          <div style={{ background: nudgeBg, border: "1px solid " + nudgeBorder, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: nudgeColor, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nudgeItem.title.length > 30 ? nudgeItem.title.substring(0, 30) + "\u2026" : nudgeItem.title}
                  <span style={{ fontWeight: 400, color: T.txD }}> {"\u2014"} {nudgeLabel}</span>
                  <span style={{ fontWeight: 400 }}> {"\u00B7"} </span>
                  <span style={{ color: readinessColor(nudgeItem.readiness) }}>{Math.round(nudgeItem.readiness * 100)}% ready</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button onClick={() => {
                  if (nudgeItem.type === "assignment" && nudgeItem.assignment) {
                    bootWithFocus({ type: "assignment", assignment: nudgeItem.assignment });
                  } else {
                    selectMode("exam");
                  }
                }}
                  style={{ background: nudgeColor, color: "#0F1115", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {nudgeItem.type === "exam" ? "Start prep" : "Work on it"}
                </button>
                <button onClick={() => setNudgeDismissed(true)}
                  style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 12, padding: "5px 6px" }}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => selectMode("assignment")}
            style={{ background: a1.bg, border: "1px solid " + a1.border, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = a1.hoverBg; e.currentTarget.style.borderColor = a1.hoverBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = a1.bg; e.currentTarget.style.borderColor = a1.border; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: a1.titleColor, marginBottom: 4 }}>Work on an assignment</div>
            <div style={{ fontSize: 12, color: T.txD }}>Pick an assignment, then get taught what you need to complete it.</div>
          </button>
          <button onClick={() => selectMode("recap")}
            style={{ background: a2.bg, border: "1px solid " + a2.border, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = a2.hoverBg; e.currentTarget.style.borderColor = a2.hoverBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = a2.bg; e.currentTarget.style.borderColor = a2.border; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: a2.titleColor, marginBottom: 4 }}>Recap last session</div>
            <div style={{ fontSize: 12, color: T.txD }}>Review where you left off and what still needs work.</div>
          </button>
          <button onClick={() => selectMode("skills")}
            style={{ background: a3.bg, border: "1px solid " + a3.border, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = a3.hoverBg; e.currentTarget.style.borderColor = a3.hoverBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = a3.bg; e.currentTarget.style.borderColor = a3.border; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: a3.titleColor, marginBottom: 4 }}>Skill work</div>
            <div style={{ fontSize: 12, color: T.txD }}>Pick a skill to strengthen and go deep.</div>
          </button>
          <button onClick={() => selectMode("exam")}
            style={{ background: a4.bg, border: "1px solid " + a4.border, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = a4.hoverBg; e.currentTarget.style.borderColor = a4.hoverBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = a4.bg; e.currentTarget.style.borderColor = a4.border; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: a4.titleColor, marginBottom: 4 }}>Prepare for exam</div>
            <div style={{ fontSize: 12, color: T.txD }}>Select materials and drill across topics with interleaved practice.</div>
          </button>
          <button onClick={() => selectMode("explore")}
            style={{ background: a5.bg, border: "1px solid " + a5.border, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = a5.hoverBg; e.currentTarget.style.borderColor = a5.hoverBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = a5.bg; e.currentTarget.style.borderColor = a5.border; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: a5.titleColor, marginBottom: 4 }}>Explore a topic</div>
            <div style={{ fontSize: 12, color: T.txD }}>Freely explore something you're curious about.</div>
          </button>
        </div>

        {/* Bottom navigation - Course Management & Notifications */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
          <button onClick={() => setScreen("manage")}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Course Management</div>
            <div style={{ fontSize: 12, color: T.txD }}>Materials, skills, and course settings</div>
          </button>
          <button onClick={() => { setScreen("notifs"); setLastSeenNotif(Date.now()); }}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", position: "relative" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Notifications</div>
            <div style={{ fontSize: 12, color: T.txD }}>{notifs.length} notification{notifs.length !== 1 ? "s" : ""}</div>
            {notifs.filter(n => n.time.getTime() > lastSeenNotif).length > 0 && (
              <span style={{ position: "absolute", top: 12, right: 16, background: T.rd || "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "2px 6px" }}>
                {notifs.filter(n => n.time.getTime() > lastSeenNotif).length}
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Picker data view (assignment picker, exam picker, skill picker, explore)
  if (!pickerData || booting) return null;

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto", animation: "fadeIn 0.3s" }}>
      {pickerData.empty ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: T.txD, fontSize: 14, marginBottom: 16 }}>{pickerData.message}</div>
          {pickerData.mode !== "assignment" && (() => {
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
                  var allMats = active.materials || [];
                  var hasAssignments = allMats.some(m => m.classification === "assignment");

                  if (!extractableMats.length && !hasAssignments) {
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
                    var refreshed = await DB.getCourses();
                    var updatedCourse = refreshed.find(c => c.id === active.id);
                    if (updatedCourse) { setActive(updatedCourse); setCourses(refreshed); }
                    if (totalSkills > 0) {
                      addNotif("success", "Extracted " + totalSkills + " skills from " + extractableMats.length + " material" + (extractableMats.length !== 1 ? "s" : "") + ".");
                    } else if (extractableMats.length > 0) {
                      addNotif("error", "Extraction completed with issues.");
                    }
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
              }} style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {hasExtracted && failedChunks.length > 0 ? "Retry failed chunks" : "Extract skills"}
              </button>
            </>;
          })()}
          <button onClick={() => { setPickerData(null); setSessionMode(null); }}
            style={{ marginTop: 12, padding: "8px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: T.txD, fontSize: 12, cursor: "pointer" }}>Back</button>
        </div>
      ) : pickerData.mode === "assignment" ? (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick an assignment</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Study will focus on teaching what you need for the one you choose.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
            {pickerData.items.map((a, i) => {
              var isExpanded = pickerData.expanded === i;
              var readyColor = a.avgStrength >= 0.6 ? T.gn : a.avgStrength >= 0.3 ? "#F59E0B" : (T.txM || T.txD);
              var urgency = getUrgencyLevel(a.dueDateEpoch);
              var urgencyColor = URGENCY_COLORS[urgency];
              var isOverdue = urgency === 'overdue';
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
                                        var existing = await DB.getPractice(active.id, fullSkill.id);
                                        var str = sk.strength || 0;
                                        var startTier = strengthToTier(str);
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
                                          await DB.savePractice(active.id, fullSkill.id, pset);
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
      ) : pickerData.mode === "exam" ? (
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
      ) : pickerData.mode === "explore" ? (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>What do you want to explore?</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Type a topic, concept, or question you're curious about.</div>
          <input
            type="text"
            value={pickerData.exploreTopic || ""}
            onChange={e => setPickerData(prev => ({ ...prev, exploreTopic: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter" && pickerData.exploreTopic?.trim()) bootWithFocus({ type: "explore", topic: pickerData.exploreTopic.trim() }); }}
            placeholder="e.g., eigenvalues and eigenvectors"
            maxLength={200}
            autoFocus
            style={{ width: "100%", padding: "12px 16px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, color: T.tx, fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => {
              if (!pickerData.exploreTopic?.trim()) return;
              bootWithFocus({ type: "explore", topic: pickerData.exploreTopic.trim() });
            }}
              disabled={!pickerData.exploreTopic?.trim()}
              style={{ background: pickerData.exploreTopic?.trim() ? T.ac : T.bd, color: pickerData.exploreTopic?.trim() ? "#0F1115" : T.txD, border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: pickerData.exploreTopic?.trim() ? "pointer" : "default" }}>
              Start exploring
            </button>
            <button onClick={() => { setPickerData(null); setSessionMode(null); }}
              style={{ padding: "10px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 10, color: T.txD, fontSize: 13, cursor: "pointer" }}>Back</button>
          </div>
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
                        var existing = await DB.getPractice(active.id, s.id);
                        var pset = existing || createPracticeSet(active.id, s, active.name);
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
                          await DB.savePractice(active.id, s.id, pset);
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
