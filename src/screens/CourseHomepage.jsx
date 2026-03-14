import React, { useState, useEffect } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { Assignments, CourseSchedule } from "../lib/db.js";
import { loadSkillsV2 } from "../lib/skills.js";
import { effectiveStrength, nextReviewDate } from "../lib/study.js";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function CourseHomepage() {
  var { active, setScreen, enterStudy } = useStudy();
  var [data, setData] = useState(null);

  useEffect(function () {
    if (!active) return;
    var cancelled = false;
    (async function () {
      try {
        var [asgn, skills, schedule, curSum] = await Promise.all([
          Assignments.getByCourse(active.id),
          loadSkillsV2(active.id),
          CourseSchedule.getByCourse(active.id),
          Assignments.getCurriculumSummary(active.id),
        ]);

        var now = Math.floor(Date.now() / 1000);

        // Assignment card
        var activeAsgn = asgn.filter(function (a) { return a.status !== "completed"; });
        var overdueCount = activeAsgn.filter(function (a) { return a.dueDate && a.dueDate < now; }).length;

        // Exam card
        var nextExam = null;
        var allSkillAvg = 0;
        if (Array.isArray(skills) && skills.length > 0) {
          allSkillAvg = skills.reduce(function (s, sk) { return s + effectiveStrength(sk); }, 0) / skills.length;
        }
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
          } catch (e) { /* skip malformed */ }
        }

        // Skills card
        var skillTotal = Array.isArray(skills) ? skills.length : 0;
        var today = new Date().toISOString().split("T")[0];
        var dueForReview = Array.isArray(skills) ? skills.filter(function (s) {
          var rd = nextReviewDate(s);
          return rd && rd <= today;
        }).length : 0;

        // Materials card
        var mats = active.materials || [];
        var totalSections = mats.reduce(function (sum, m) {
          return sum + (m.chunks || []).filter(function (c) { return c.status === "extracted"; }).length;
        }, 0);

        // Schedule card
        var totalWeeks = schedule.length;
        var currentWeek = null;
        if (totalWeeks > 0) {
          var nowDate = new Date();
          for (var i = 0; i < schedule.length; i++) {
            var w = schedule[i];
            try {
              if (w.start_date) {
                var start = new Date(w.start_date);
                var end = w.end_date ? new Date(w.end_date) : new Date(start.getTime() + 7 * 86400000);
                if (nowDate >= start && nowDate <= end) { currentWeek = (w.week_number || w.weekNumber || i + 1); break; }
              }
            } catch (e) { /* skip */ }
          }
          if (!currentWeek) currentWeek = Math.min(Math.ceil((Date.now() - new Date(schedule[0].start_date || Date.now()).getTime()) / (7 * 86400000)) + 1, totalWeeks);
        }

        if (!cancelled) {
          setData({
            activeCount: activeAsgn.length,
            overdueCount: overdueCount,
            nextExam: nextExam,
            examReadiness: Math.round(allSkillAvg * 100),
            skillTotal: skillTotal,
            dueForReview: dueForReview,
            curActiveCount: curSum ? curSum.activeCount : 0,
            curTotalSkills: curSum ? curSum.totalSkills : 0,
            matCount: mats.length,
            totalSections: totalSections,
            totalWeeks: totalWeeks,
            currentWeek: currentWeek,
          });
        }
      } catch (e) {
        console.error("CourseHomepage data load failed:", e);
        if (!cancelled) setData({});
      }
    })();
    return function () { cancelled = true; };
  }, [active?.id]);

  var cards = [
    {
      title: "Assignment Work",
      subtitle: data ? (data.activeCount > 0 ? data.activeCount + " active" + (data.overdueCount > 0 ? " \u00B7 " + data.overdueCount + " overdue" : "") : "No active assignments") : "",
      urgency: data && data.overdueCount > 0 ? T.rd : null,
      onClick: function () { enterStudy(active, "assignment"); },
    },
    {
      title: "Exam Review",
      subtitle: data ? (data.nextExam ? "Exam in " + data.nextExam.daysUntil + "d \u00B7 " + data.examReadiness + "% ready" : "No upcoming exams") : "",
      urgency: data && data.nextExam ? (data.nextExam.daysUntil < 2 ? T.rd : data.nextExam.daysUntil < 7 ? T.am : null) : null,
      onClick: function () { enterStudy(active, "exam"); },
    },
    {
      title: "Skill Development",
      subtitle: data ? (data.skillTotal > 0 ? data.skillTotal + " skills" + (data.dueForReview > 0 ? " \u00B7 " + data.dueForReview + " due" : "") : "No skills yet") : "",
      urgency: data && data.dueForReview > 0 ? T.am : null,
      onClick: function () { enterStudy(active, "skills"); },
    },
    {
      title: "Curriculum",
      subtitle: data ? (data.curActiveCount > 0 ? data.curActiveCount + " active \u00B7 " + data.curTotalSkills + " skills" : "No assignments") : "",
      urgency: null,
      onClick: function () { setScreen("curriculum"); },
    },
    {
      title: "Materials",
      subtitle: data ? data.matCount + " material" + (data.matCount !== 1 ? "s" : "") + (data.totalSections > 0 ? " \u00B7 " + data.totalSections + " sections" : "") : "",
      urgency: null,
      onClick: function () { setScreen("materials"); },
    },
    {
      title: "Schedule",
      subtitle: data ? (data.totalWeeks > 0 ? "Week " + (data.currentWeek || "?") + " of " + data.totalWeeks : "No schedule") : "",
      urgency: null,
      onClick: function () { setScreen("schedule"); },
    },
  ];

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={function () { setScreen("home"); }}
          style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "none"; }}>&lt; Back</button>
        <TopBarButtons />
      </div>
      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 32px 20px", overflow: "hidden" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Header */}
          <div style={{ marginBottom: 24, flexShrink: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>{active ? active.name : ""}</h1>
            <p style={{ fontSize: 13, color: T.txD, margin: 0 }}>
              {active ? (active.materials || []).length + " material" + ((active.materials || []).length !== 1 ? "s" : "") : ""}
            </p>
          </div>
          {/* Card grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)",
            gap: 12, flex: 1, minHeight: 0,
          }}>
            {cards.map(function (card, i) {
              return (
                <button key={i} onClick={card.onClick}
                  style={{
                    background: T.sf, border: "1px solid " + T.bd, borderRadius: 14,
                    padding: 20, cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                    display: "flex", flexDirection: "column", justifyContent: "flex-start",
                  }}
                  onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                  onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: card.urgency || T.txD, marginTop: 4 }}>{card.subtitle}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
