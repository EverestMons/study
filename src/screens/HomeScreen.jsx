import React, { useState, useEffect } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { CLS } from "../lib/classify.js";
import { Assignments, CourseSchedule } from "../lib/db.js";
import { useStudy } from "../StudyContext.jsx";

function getCourseState(c, summary, curriculum) {
  var mats = c.materials || [];
  if (mats.length === 0) return { state: "no-materials", label: "Upload materials", action: "materials" };
  var hasAssignmentMats = mats.some(function (m) { return m.classification === "assignment"; });
  if (!hasAssignmentMats) return { state: "no-assignments", label: "Upload assignments", action: "materials" };
  if (curriculum && curriculum.activeCount === 0 && curriculum.completedCount === 0) return { state: "none-active", label: "Activate assignments", action: "schedule" };
  if (curriculum && curriculum.activeCount > 0) return { state: "active", label: null, action: "curriculum" };
  if (curriculum && curriculum.completedCount > 0 && curriculum.dueReviewCount > 0) return { state: "reviews-due", label: curriculum.dueReviewCount + " skill" + (curriculum.dueReviewCount !== 1 ? "s" : "") + " due for review", action: "curriculum" };
  if (curriculum && curriculum.completedCount > 0) return { state: "current", label: "You're current!", action: "curriculum" };
  return { state: "default", label: null, action: "study" };
}

export default function HomeScreen() {
  const {
    courses, cName, setCName, pendingConfirm, setPendingConfirm,
    setScreen, setActive, setShowSettings, quickCreateCourse, loadProfile, enterStudy, delCourse,
  } = useStudy();

  var [summaries, setSummaries] = useState({});
  var [curriculumSummaries, setCurriculumSummaries] = useState({});

  useEffect(() => {
    if (courses.length === 0) return;
    var cancelled = false;
    (async () => {
      var result = {};
      var curResult = {};
      for (var c of courses) {
        try {
          var [asgn, schedule, curSum] = await Promise.all([
            Assignments.getByCourse(c.id),
            CourseSchedule.getByCourse(c.id),
            Assignments.getCurriculumSummary(c.id),
          ]);
          curResult[c.id] = curSum;
          var now = Math.floor(Date.now() / 1000);
          var overdueCount = asgn.filter(a => a.dueDate && a.dueDate < now && a.status !== "completed").length;
          var dueThisWeek = asgn.filter(a => a.dueDate && a.dueDate >= now && a.dueDate < now + 7 * 86400).length;
          var nextExam = null;
          for (var week of schedule) {
            try {
              var exams = JSON.parse(week.exams || "[]");
              for (var exam of exams) {
                if (!exam.date) continue;
                var epoch = Math.floor(new Date(exam.date).getTime() / 1000);
                if (isNaN(epoch) || epoch <= now) continue;
                var daysUntil = Math.floor((epoch - now) / 86400);
                if (!nextExam || epoch < nextExam.epoch) {
                  nextExam = { name: exam.name || exam.title || "Exam", daysUntil: daysUntil, epoch: epoch };
                }
              }
            } catch (e) { /* skip malformed exams JSON */ }
          }
          if (overdueCount || dueThisWeek || nextExam) {
            result[c.id] = { overdueCount: overdueCount, dueThisWeek: dueThisWeek, nextExam: nextExam };
          }
        } catch (e) {
          console.error("Failed to load schedule summary for", c.name, e);
        }
      }
      if (!cancelled) {
        setSummaries(result);
        setCurriculumSummaries(curResult);
      }
    })();
    return () => { cancelled = true; };
  }, [courses]);

  function formatExamProximity(days) {
    if (days === 0) return "Exam today";
    if (days === 1) return "Exam tomorrow";
    return "Exam in " + days + " days";
  }

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div />
        <button onClick={() => setShowSettings(true)}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.sfH}
          onMouseLeave={e => e.currentTarget.style.background = T.sf}>
          Settings
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, letterSpacing: "-0.03em", margin: 0, marginBottom: 4 }}>Study</h1>
            <p style={{ fontSize: 14, color: T.txD, margin: 0 }}>Your courses and skill profile <span style={{ fontSize: 11, color: T.txM, marginLeft: 8 }}>v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}</span></p>
          </div>
          <button onClick={async () => { await loadProfile(); setScreen("profile"); }}
            style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: "10px 18px", color: T.ac, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = T.acS}>
            View Profile
          </button>
        </div>

        {/* Course list */}
        {courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: T.txD, fontSize: 15, background: T.sf, borderRadius: 14, border: "1px solid " + T.bd }}>
            No courses yet. Add one to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {courses.map(c => {
              const mats = c.materials || [];
              const types = [...new Set(mats.map(m => m.classification))].filter(Boolean).map(v => CLS.find(cl => cl.v === v)?.l || v).join(", ");
              const summary = summaries[c.id];
              const curSum = curriculumSummaries[c.id];
              const courseState = getCourseState(c, summary, curSum);
              const signals = [];
              if (summary) {
                if (summary.overdueCount > 0) signals.push({ text: summary.overdueCount + " overdue", color: T.rd });
                if (summary.dueThisWeek > 0) signals.push({ text: summary.dueThisWeek + " due this week", color: T.am });
                if (summary.nextExam) signals.push({ text: formatExamProximity(summary.nextExam.daysUntil), color: summary.nextExam.daysUntil < 7 ? T.am : T.ac });
              }

              function handleCourseClick() {
                setActive(c);
                if (courseState.action === "curriculum") { setScreen("curriculum"); }
                else if (courseState.action === "schedule") { setScreen("schedule"); }
                else if (courseState.action === "materials") { setScreen("materials"); }
                else { enterStudy(c); }
              }

              return (
                <div key={c.id} onClick={handleCourseClick}
                  style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{c.name}</div>
                      <div style={{ fontSize: 13, color: T.txD }}>
                        {mats.length} material{mats.length !== 1 ? "s" : ""}{types ? " \u00B7 " + types : ""}
                      </div>
                      {/* Schedule signals */}
                      {signals.length > 0 && (
                        <div onClick={e => { e.stopPropagation(); setActive(c); setScreen("schedule"); }}
                          style={{ fontSize: 12, marginTop: 6, cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                          {signals.map((s, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span style={{ color: T.txM }}> {"\u00B7"} </span>}
                              <span style={{ color: s.color }}>{s.text}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      {/* Curriculum summary */}
                      {curSum && curSum.activeCount > 0 && (
                        <div onClick={e => { e.stopPropagation(); setActive(c); setScreen("curriculum"); }}
                          style={{ fontSize: 12, marginTop: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                          <span style={{ color: T.ac }}>{curSum.activeCount} active assignment{curSum.activeCount !== 1 ? "s" : ""}</span>
                          {curSum.totalSkills > 0 && <span style={{ color: T.txD }}>{"\u00B7"} {curSum.totalSkills} skill{curSum.totalSkills !== 1 ? "s" : ""}</span>}
                          {curSum.dueReviewCount > 0 && <span style={{ color: T.am }}>{"\u00B7"} {curSum.dueReviewCount} due</span>}
                        </div>
                      )}
                      {/* State machine nudge */}
                      {courseState.label && courseState.state !== "active" && (
                        <div style={{ fontSize: 12, marginTop: signals.length > 0 || (curSum && curSum.activeCount > 0) ? 4 : 6, color: courseState.state === "reviews-due" ? T.am : courseState.state === "current" ? T.gn : T.txD }}>
                          {courseState.label}
                        </div>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation();
                        if (pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id) { setPendingConfirm(null); delCourse(c.id); }
                        else setPendingConfirm({ type: "delCourse", id: c.id });
                      }} style={{ background: "none", border: "none", color: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? T.rd : T.txM, cursor: "pointer", fontSize: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? 11 : 13, flexShrink: 0, marginLeft: 12, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      {pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? "Confirm delete?" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inline Add Course form */}
        <div style={{ display: "flex", gap: 8, marginTop: courses.length === 0 ? 24 : 0, marginBottom: 16 }}>
          <input value={cName} onChange={e => setCName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") quickCreateCourse(); }}
            placeholder="New course name..."
            style={{ flex: 1, padding: "12px 16px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, color: T.tx, fontSize: 14, outline: "none" }} />
          <button onClick={quickCreateCourse} disabled={!cName.trim()}
            style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: cName.trim() ? T.ac : T.sf, color: cName.trim() ? "#0F1115" : T.txM, fontSize: 14, fontWeight: 600, cursor: cName.trim() ? "pointer" : "default" }}>
            Add Course
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
