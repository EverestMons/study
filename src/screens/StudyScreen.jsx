import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { effectiveStrength, generateSessionEntry } from "../lib/study.js";
import { useStudy } from "../StudyContext.jsx";
import MaterialsPanel from "../components/study/MaterialsPanel.jsx";
import SkillsPanel from "../components/study/SkillsPanel.jsx";
import PracticeMode from "../components/study/PracticeMode.jsx";
import NotifPanel from "../components/study/NotifPanel.jsx";
import ChunkPicker from "../components/study/ChunkPicker.jsx";
import AssignmentPicker from "../components/study/AssignmentPicker.jsx";
import SkillPicker from "../components/study/SkillPicker.jsx";
import ExamScopePicker from "../components/study/ExamScopePicker.jsx";
import MessageList from "../components/study/MessageList.jsx";
import AssignmentPanel from "../components/study/AssignmentPanel.jsx";
import InputBar from "../components/study/InputBar.jsx";
import SessionSummary from "../components/study/SessionSummary.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function StudyScreen() {
  const {
    msgs, setMsgs, setInput, setInputMode,
    goBack, active,
    clearSessionState,
    sessionMode, setSessionMode,
    pickerData, setPickerData,
    chunkPicker, setChunkPicker,
    practiceMode, setPracticeMode,
    setFocusContext,
    asgnWork, setAsgnWork,
    setShowSkills, setSkillViewData,
    sessionSummary, setSessionSummary,
    sessionElapsed, setSessionElapsed, breakDismissed, setBreakDismissed,
    setSidebarCollapsed,
    sessionStartIdx, sessionSkillLog,
    sessionMasteryEvents, sessionFacetUpdates, sessionMasteredSkills,
    cachedSessionCtx, sessionStartTime, discussedChunks,
    saveSessionToJournal,
    focusContext, booting,
  } = useStudy();

  const inSession = msgs.length > 0 || booting || !!practiceMode;

  const handleExitSession = async () => {
    // Practice mode: exit cleanly (progress already auto-saved)
    if (practiceMode && msgs.length === 0) {
      clearSessionState();
      goBack();
      return;
    }
    if (msgs.length > 1 && sessionStartTime.current) {
      const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current, sessionMasteryEvents.current, sessionFacetUpdates.current);
      const duration = Math.floor((Date.now() - sessionStartTime.current) / 60000);
      const allSkills = cachedSessionCtx.current?.skills || [];
      const skillChanges = sessionSkillLog.current.map(u => {
        const sk = allSkills.find(s => s.id === u.skillId || s.conceptKey === u.skillId);
        return { ...u, name: sk?.name || u.skillId, strength: sk ? effectiveStrength(sk) : 0 };
      });
      await saveSessionToJournal();
      var capturedAsgnWork = asgnWork;
      setAsgnWork(null);
      setSessionSummary({ entry, skillChanges, duration, courseName: active.name, asgnWork: capturedAsgnWork, masteryEvents: sessionMasteryEvents.current.slice(), facetsAssessed: sessionFacetUpdates.current.slice() });
    } else {
      await saveSessionToJournal();
      clearSessionState();
      goBack();
    }
  };

  const handleBackToOrigin = () => {
    setSessionMode(null); setPickerData(null); setChunkPicker(null);
    setPracticeMode(null); setFocusContext(null); setInputMode("text");
    setMsgs([]); setInput("");
    goBack();
  };

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        {/* Left: Exit Session (active) or Back (pre-session) */}
        {inSession ? (
          <button onClick={handleExitSession}
            style={{ background: "none", border: "1px solid " + T.bd, color: T.txD, cursor: "pointer", fontSize: 13, padding: "6px 14px", borderRadius: 8, transition: "all 0.15s ease", fontWeight: 500 }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>Exit Session</button>
        ) : (
          <button onClick={handleBackToOrigin}
            style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>&lt; Back</button>
        )}
        {/* Center: Session timer (focus mode only) */}
        {msgs.length > 0 && sessionElapsed > 0 && (
          <span style={{ fontSize: 11, color: T.txM, fontWeight: 400, marginLeft: 12 }}>
            {sessionElapsed < 60 ? sessionElapsed + "m" : Math.floor(sessionElapsed / 60) + "h" + (sessionElapsed % 60 > 0 ? " " + (sessionElapsed % 60) + "m" : "")}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Right: TopBarButtons only in pre-session state */}
        {!inSession && <TopBarButtons />}
      </div>

      <MaterialsPanel />
      <SkillsPanel />
      <PracticeMode />

      {!practiceMode && (
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <NotifPanel />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", order: 1 }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <ChunkPicker />
            {sessionMode && !focusContext && !booting && msgs.length <= 1 && (
              <>
                {sessionMode === "assignment" && <AssignmentPicker />}
                {sessionMode === "skills" && <SkillPicker />}
                {sessionMode === "exam" && <ExamScopePicker />}
              </>
            )}
            {/* Break reminder banner */}
            {sessionElapsed >= 25 && !breakDismissed && msgs.length > 0 && (
              <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, animation: "fadeIn 0.3s" }}>
                <span style={{ fontSize: 13, color: T.am, lineHeight: 1.5 }}>You've been studying for 25+ minutes. A short break can help retention.</span>
                <button onClick={() => setBreakDismissed(true)}
                  style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 12, flexShrink: 0, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>Dismiss</button>
              </div>
            )}
            <MessageList />
          </div>
        </div>
        <AssignmentPanel />
      </div>
      )}

      <InputBar />
      <SessionSummary />
    </div>
  );
}
