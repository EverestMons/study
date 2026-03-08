import React, { useState, useEffect } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";
import { Assignments, CourseSchedule } from "../lib/db.js";
import { loadSkillsV2 } from "../lib/skills.js";
import { effectiveStrength } from "../lib/study.js";

function formatDueDate(epoch) {
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

function getUrgencyLevel(epoch) {
  if (!epoch) return "none";
  var now = Math.floor(Date.now() / 1000);
  var diff = epoch - now;
  if (diff < 0) return "overdue";
  if (diff < 48 * 3600) return "urgent";
  if (diff < 7 * 86400) return "soon";
  return "normal";
}

var URGENCY_COLORS = { overdue: T.rd, urgent: T.rd, soon: T.am, normal: T.ac, none: T.txM };

function readinessColor(v) { return v >= 0.6 ? T.gn : v >= 0.3 ? "#F59E0B" : T.txM; }

export default function ScheduleScreen() {
  var {
    active, setScreen, setShowSettings, enterStudy, setActive,
  } = useStudy();

  var [items, setItems] = useState(null);
  var [skills, setSkills] = useState([]);
  var [expanded, setExpanded] = useState(null);
  var [showAllExamSkills, setShowAllExamSkills] = useState(false);

  useEffect(() => { if (active) loadData(); }, []);

  async function loadData() {
    var rawAsgn = await Assignments.getByCourse(active.id);
    var schedule = await CourseSchedule.getByCourse(active.id);
    var sk = await loadSkillsV2(active.id);
    setSkills(Array.isArray(sk) ? sk : []);

    // Enrich assignments
    var all = [];
    for (var a of rawAsgn) {
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
      all.push({
        type: a.source === "syllabus" && !a.materialId ? "placeholder" : "assignment",
        id: a.id, title: a.title, dueDateEpoch: a.dueDate || null,
        dueDate: formatDueDate(a.dueDate), status: a.status, source: a.source,
        questionCount: a.questionCount || questions.length, skillList: skillList, avgStrength: avg,
      });
    }

    // Extract exams from schedule
    var allSkillAvg = (sk || []).length > 0
      ? (sk || []).reduce(function (s, x) { return s + effectiveStrength(x); }, 0) / sk.length : 0;
    for (var week of schedule) {
      try {
        var exams = JSON.parse(week.exams || "[]");
        for (var ei = 0; ei < exams.length; ei++) {
          var exam = exams[ei];
          var dateEpoch = exam.date ? Math.floor(new Date(exam.date).getTime() / 1000) : null;
          if (dateEpoch && isNaN(dateEpoch)) dateEpoch = null;
          all.push({
            type: "exam", id: "exam-" + (week.week_number || week.weekNumber || 0) + "-" + ei,
            title: exam.name || exam.title || "Exam",
            dueDateEpoch: dateEpoch, dueDate: formatDueDate(dateEpoch),
            coversWeeks: exam.coversWeeks || [], coversTopics: exam.coversTopics || [],
            weekNumber: week.week_number || week.weekNumber,
            skillList: (sk || []).map(function (x) { return { id: x.id, name: x.name, strength: effectiveStrength(x) }; }),
            avgStrength: allSkillAvg,
          });
        }
      } catch (e) { /* skip malformed exams JSON */ }
    }
    setItems(all);
  }

  if (!active) return null;

  var now = Math.floor(Date.now() / 1000);

  // Group items into sections
  var sections = [];
  if (items) {
    var pastDue = [], thisWeek = [], nextWeek = [], later = [], notUploaded = [];
    for (var it of items) {
      if (it.type === "placeholder") { notUploaded.push(it); continue; }
      if (!it.dueDateEpoch) { later.push(it); continue; }
      var diff = it.dueDateEpoch - now;
      if (diff < 0) pastDue.push(it);
      else if (diff < 7 * 86400) thisWeek.push(it);
      else if (diff < 14 * 86400) nextWeek.push(it);
      else later.push(it);
    }
    var sortFn = function (a, b) {
      if (a.dueDateEpoch && b.dueDateEpoch) return a.dueDateEpoch - b.dueDateEpoch;
      if (a.dueDateEpoch) return -1; if (b.dueDateEpoch) return 1;
      return (a.title || "").localeCompare(b.title || "");
    };
    pastDue.sort(sortFn); thisWeek.sort(sortFn); nextWeek.sort(sortFn); later.sort(sortFn); notUploaded.sort(sortFn);

    if (pastDue.length) sections.push({ label: "PAST DUE", color: T.rd, items: pastDue });
    if (thisWeek.length) sections.push({ label: "THIS WEEK", color: T.am, items: thisWeek });
    if (nextWeek.length) sections.push({ label: "NEXT WEEK", color: T.ac, items: nextWeek });
    if (later.length) sections.push({ label: "LATER", color: T.txM, items: later });
    if (notUploaded.length) sections.push({ label: "NOT YET UPLOADED", color: T.txM, items: notUploaded });
  }

  function renderCard(it, idx) {
    var key = it.id || idx;
    var isExp = expanded === key;
    var urgency = getUrgencyLevel(it.dueDateEpoch);
    var urgencyColor = URGENCY_COLORS[urgency];
    var isOverdue = urgency === "overdue";
    var isPlaceholder = it.type === "placeholder";
    var isExam = it.type === "exam";
    var border = isExp ? T.acB : isOverdue ? "rgba(248,113,113,0.3)" : T.bd;
    var bg = isOverdue ? "rgba(248,113,113,0.06)" : T.sf;

    var sortedSkills = (it.skillList || []).slice().sort(function (a, b) { return a.strength - b.strength; });
    var displaySkills = isExam && !showAllExamSkills && sortedSkills.length > 10 ? sortedSkills.slice(0, 10) : sortedSkills;

    return (
      <div key={key} style={{ background: bg, border: "1px solid " + border, borderRadius: 12, borderStyle: isPlaceholder ? "dashed" : "solid", overflow: "hidden", transition: "all 0.15s" }}>
        <div onClick={function () { setExpanded(isExp ? null : key); setShowAllExamSkills(false); }}
          style={{ padding: "14px 18px", cursor: "pointer" }}
          onMouseEnter={function (e) { if (!isExp) e.currentTarget.style.background = isOverdue ? "rgba(248,113,113,0.1)" : T.sfH; }}
          onMouseLeave={function (e) { if (!isExp) e.currentTarget.style.background = "transparent"; }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isExam ? "\u2605 " : ""}{it.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
              <span style={{ fontSize: 12, color: urgencyColor }}>{it.dueDate || "No date"}</span>
              {!isPlaceholder && <span style={{ fontSize: 12, fontWeight: 600, color: readinessColor(it.avgStrength) }}>{Math.round(it.avgStrength * 100)}%</span>}
              {isPlaceholder && <span style={{ fontSize: 12, color: T.txM }}>&mdash;</span>}
              <span style={{ fontSize: 11, color: T.txD }}>{isExp ? "\u25B4" : "\u25BE"}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.txD }}>
            {isExam && (it.coversWeeks?.length ? "Covers weeks " + Math.min(...it.coversWeeks) + "\u2013" + Math.max(...it.coversWeeks) + " \u00B7 " : "")}
            {isExam && sortedSkills.length + " skill" + (sortedSkills.length !== 1 ? "s" : "")}
            {!isExam && !isPlaceholder && (it.questionCount + " question" + (it.questionCount !== 1 ? "s" : "") + " \u00B7 " + sortedSkills.length + " skill" + (sortedSkills.length !== 1 ? "s" : "") + " needed")}
            {isPlaceholder && "Placeholder \u2014 upload materials to decompose"}
          </div>
        </div>

        {isExp && (
          <div style={{ borderTop: "1px solid " + T.bd, padding: "14px 18px" }}>
            {/* Exam readiness bar */}
            {isExam && sortedSkills.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, fontWeight: 600 }}>Overall Readiness</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.bd, overflow: "hidden" }}>
                    <div style={{ width: Math.round(it.avgStrength * 100) + "%", height: "100%", borderRadius: 3, background: readinessColor(it.avgStrength), transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: readinessColor(it.avgStrength), flexShrink: 0 }}>{Math.round(it.avgStrength * 100)}%</span>
                </div>
              </div>
            )}

            {/* Skill list */}
            {displaySkills.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>
                  {isExam ? "Weakest Skills" + (sortedSkills.length > 10 ? " (showing " + displaySkills.length + " of " + sortedSkills.length + ")" : "") : "Required Skills"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {displaySkills.map(function (sk) {
                    var skColor = sk.strength >= 0.6 ? T.gn : sk.strength >= 0.4 ? "#F59E0B" : (T.rd || "#EF4444");
                    return (
                      <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: 6, background: sk.strength < 0.4 ? "rgba(239,68,68,0.06)" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: skColor, flexShrink: 0 }} />
                          <div style={{ fontSize: 12, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</div>
                        </div>
                        <span style={{ fontSize: 11, color: skColor, fontWeight: 600, flexShrink: 0 }}>{Math.round(sk.strength * 100)}%</span>
                      </div>
                    );
                  })}
                </div>
                {isExam && sortedSkills.length > 10 && !showAllExamSkills && (
                  <button onClick={function (e) { e.stopPropagation(); setShowAllExamSkills(true); }}
                    style={{ background: "none", border: "none", color: T.ac, fontSize: 12, cursor: "pointer", padding: "6px 0", marginTop: 4 }}>
                    Show all {sortedSkills.length} skills
                  </button>
                )}
              </div>
            )}

            {/* Placeholder message */}
            {isPlaceholder && (
              <div style={{ fontSize: 13, color: T.txD, padding: "8px 0", lineHeight: 1.5 }}>
                Upload assignment materials to get question breakdown and readiness tracking.
              </div>
            )}

            {/* Action button */}
            {!isPlaceholder && (
              <button onClick={function () { enterStudy(active); }}
                style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: it.avgStrength >= 0.4 ? "none" : "1px solid " + T.bd, background: it.avgStrength >= 0.4 ? T.ac : T.sf, color: it.avgStrength >= 0.4 ? "#0F1115" : T.tx, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {isExam ? "Start Exam Prep" : it.avgStrength >= 0.4 ? "Start Assignment" : "Start Anyway (low readiness)"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={function () { setScreen("home"); }}
          style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "none"; }}>&lt; Back</button>
        <div style={{ flex: 1 }} />
        <button onClick={function () { setShowSettings(true); }}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>Settings</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Schedule</h1>
          <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 28 }}>{active.name}</p>

          {/* Loading */}
          {!items && <div style={{ color: T.txD, fontSize: 14, padding: "24px 0" }}>Loading schedule...</div>}

          {/* Empty — no syllabus and no assignments */}
          {items && items.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", background: T.sf, borderRadius: 14, border: "1px solid " + T.bd }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.tx, marginBottom: 8 }}>No schedule yet</div>
              <div style={{ fontSize: 14, color: T.txD, lineHeight: 1.5, marginBottom: 20 }}>
                Upload a syllabus to automatically extract your weekly schedule, exam dates, and assignments.
              </div>
              <button onClick={function () { enterStudy(active); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Go to Course
              </button>
            </div>
          )}

          {/* Sections */}
          {sections.map(function (sec) {
            return (
              <div key={sec.label} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: sec.color, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>{sec.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sec.items.map(function (it, idx) { return renderCard(it, sec.label + "-" + idx); })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
