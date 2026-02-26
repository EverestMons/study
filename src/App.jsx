import React, { useState, useEffect, useRef, useCallback, Component, createContext } from "react";

// --- Module Imports ---
import { T, CSS, renderMd } from "./lib/theme.jsx";
import { CLS, autoClassify, parseFailed } from "./lib/classify.js";
import { getApiKey, setApiKey, DB } from "./lib/db.js";
import { readFile } from "./lib/parsers.js";
import { callClaude, callClaudeStream, extractJSON, testApiKey } from "./lib/api.js";
import {
  storeAsChunks, getMatContent, verifyDocument,
  generateReferenceTaxonomy, extractSkillTree,
  validateSkillTree, mergeSkillTree, decomposeAssignments
} from "./lib/skills.js";
import {
  effectiveStrength, nextReviewDate, applySkillUpdates,
  buildContext, buildFocusedContext, generateSessionEntry,
  formatJournal, buildSystemPrompt, parseQuestionUnlock,
  parseSkillUpdates, TIERS, strengthToTier,
  createPracticeSet, generateProblems, evaluateAnswer,
  completeTierAttempt, loadPracticeMaterialCtx, DEFAULT_EASE
} from "./lib/study.js";

// --- Error Context (for capturing app state in crash reports) ---
const ErrorContext = createContext({ screen: "unknown", courseId: null, sessionMode: null });

// --- Error Boundary ---
class StudyErrorBoundary extends Component {
  static contextType = ErrorContext;
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showNuclear: false };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  buildReport() {
    const err = this.state.error;
    const ctx = this.context || {};
    return [
      "STUDY CRASH REPORT",
      "==================",
      "Timestamp: " + new Date().toISOString(),
      "Screen: " + (ctx.screen || "unknown"),
      "Course ID: " + (ctx.courseId || "none"),
      "Session Mode: " + (ctx.sessionMode || "none"),
      "Storage: SQLite",
      "",
      "Error: " + (err.message || String(err)),
      "",
      "Stack:",
      (err.stack || "no stack").split("\n").slice(0, 10).join("\n"),
      "",
      "Component stack:",
      (this.state.info?.componentStack || "unavailable").trim().split("\n").slice(0, 6).join("\n"),
    ].join("\n");
  }
  handleCopy(report) {
    try { navigator.clipboard.writeText(report); } catch (e) { console.log("Clipboard not available"); }
  }
  handleSoftReset() {
    this.setState({ error: null, info: null, showNuclear: false });
  }
  async handleHardReset() {
    try {
      await DB.resetAll();
    } catch (e) { console.error("Failed to clear database:", e); }
    window.location.reload();
  }
  render() {
    if (this.state.error) {
      const report = this.buildReport();
      const btnBase = { padding: "10px 20px", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", marginTop: 12 };
      return React.createElement("div", {
        style: { background: "#0F1115", minHeight: "100vh", padding: 32, fontFamily: "system-ui, -apple-system, sans-serif" }
      },
        React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } },
          React.createElement("div", { style: { fontSize: 20, color: "#F87171", marginBottom: 8, fontWeight: 700 } }, "Study crashed"),
          React.createElement("div", { style: { fontSize: 13, color: "#6B7280", marginBottom: 20 } }, 
            "Copy the error report below and paste it to Claude for debugging help."),
          
          // Crash report textarea
          React.createElement("textarea", {
            readOnly: true, value: report,
            onClick: function(e) { e.target.select(); },
            style: {
              width: "100%", minHeight: 280, background: "#1A1D24", color: "#E8EAF0",
              border: "1px solid #2A2F3A", borderRadius: 8, padding: 16, fontSize: 11,
              fontFamily: "SF Mono, Fira Code, Consolas, monospace", resize: "vertical", lineHeight: 1.5
            }
          }),
          
          // Primary actions row
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            React.createElement("button", {
              onClick: () => this.handleCopy(report),
              style: { ...btnBase, background: "#6C9CFC", color: "#0F1115", fontWeight: 600 }
            }, "Copy to clipboard"),
            React.createElement("button", {
              onClick: () => this.handleSoftReset(),
              style: { ...btnBase, background: "#22262F", color: "#E8EAF0", border: "1px solid #2A2F3A" }
            }, "Try to recover")
          ),
          
          // Nuclear option section
          React.createElement("div", { style: { marginTop: 32, paddingTop: 20, borderTop: "1px solid #2A2F3A" } },
            !this.state.showNuclear 
              ? React.createElement("button", {
                  onClick: () => this.setState({ showNuclear: true }),
                  style: { ...btnBase, marginTop: 0, background: "transparent", color: "#6B7280", fontSize: 12, padding: "8px 0" }
                }, "Still crashing? Show reset options...")
              : React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 13, color: "#F87171", marginBottom: 12 } }, 
                    "⚠️ This will permanently delete all your courses and data."),
                  React.createElement("button", {
                    onClick: () => this.handleHardReset(),
                    style: { ...btnBase, marginTop: 0, background: "#7F1D1D", color: "#FEE2E2", fontWeight: 600 }
                  }, "Clear all data and restart"),
                  React.createElement("button", {
                    onClick: () => this.setState({ showNuclear: false }),
                    style: { ...btnBase, marginLeft: 8, background: "transparent", color: "#6B7280" }
                  }, "Cancel")
                )
          )
        )
      );
    }
    return this.props.children;
  }
}

// STUDY - Skill-Based Teaching Architecture (Clean Rebuild)
//
// Storage keys:
//   study-courses                  -> course metadata (materials with chunk lists)
//   study-doc:{cid}:{chunkId}      -> individual chunk content
//   study-cskills:{cid}:{chunkId}  -> skills from one chunk
//   study-skills:{cid}             -> merged course skill tree
//   study-asgn:{cid}               -> assignment decomposition
//   study-profile:{cid}            -> student skill point log
//   study-chat:{cid}               -> chat message history
//   study-journal:{cid}            -> session journal entries
//
// All utility code extracted to src/lib/ modules. See imports above.
// --- Main Component ---
function StudyInner({ setErrorCtx }) {
  const [asyncError, setAsyncError] = useState(null);

  const [screen, setScreen] = useState("home");
  const [courses, setCourses] = useState([]);
  const [active, setActive] = useState(null);
  const [ready, setReady] = useState(false);
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keyVerifying, setKeyVerifying] = useState(false);
  const [keyError, setKeyError] = useState("");

  const [files, setFiles] = useState([]);
  const [cName, setCName] = useState("");
  const [drag, setDrag] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [status, setStatus] = useState("");
  const [processingMatId, setProcessingMatId] = useState(null); // ID of material currently being extracted
  const [errorLogModal, setErrorLogModal] = useState(null); // { chunk, mat } for showing error details
  
  // Global operation lock - prevents any user interaction while a long operation is running
  const [globalLock, setGlobalLock] = useState(null); // null or { message: "Extracting skills..." }

  const [showManage, setShowManage] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [skillViewData, setSkillViewData] = useState(null); // { skills, report, refTax }
  const [expandedCats, setExpandedCats] = useState({}); // { categoryName: true/false }
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [notifs, setNotifs] = useState([]); // [{ id, type, msg, time }]
  const [showNotifs, setShowNotifs] = useState(false);
  const [lastSeenNotif, setLastSeenNotif] = useState(0);
  const [extractionErrors, setExtractionErrors] = useState([]); // [{ label, error, debugInfo, time }]
  const [sessionMode, setSessionMode] = useState(null);
  const [focusContext, setFocusContext] = useState(null);
  const [pickerData, setPickerData] = useState(null);
  const [chunkPicker, setChunkPicker] = useState(null); // { courseId, materials, selectedChunks: Set }
  const [asgnWork, setAsgnWork] = useState(null); // { questions: [{id, description, unlocked, answer, done}], currentIdx: 0 }
  const [practiceMode, setPracticeMode] = useState(null); // { set: PracticeSet, skill: {}, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null }
  const [showCourseManagement, setShowCourseManagement] = useState(false);
  const [showNotifsSection, setShowNotifsSection] = useState(false);

  const endRef = useRef(null);
  const taRef = useRef(null);
  const fiRef = useRef(null);
  const sessionStartIdx = useRef(0);
  const sessionSkillLog = useRef([]);
  const cachedSessionCtx = useRef(null); // { ctx, skills, profile, journal, focus }
  const extractionCancelledRef = useRef(false); // For cancelling extraction mid-process

  // Notification helper: type = "info" | "warn" | "error" | "skill" | "success"
  const addNotif = (type, msg) => {
    setNotifs(p => [{ id: Date.now() + Math.random(), type, msg, time: new Date() }, ...p].slice(0, 50));
  };

  // --- Effects ---
  // Update error context for crash reports
  useEffect(() => {
    if (setErrorCtx) setErrorCtx({ screen, courseId: active?.id || null, sessionMode });
  }, [screen, active?.id, sessionMode, setErrorCtx]);
  
  useEffect(() => {
    const onErr = (e) => { setAsyncError({ message: e.message || "Unknown error", stack: e.error?.stack || "" }); };
    const onRej = (e) => { setAsyncError({ message: e.reason?.message || String(e.reason), stack: e.reason?.stack || "" }); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  useEffect(() => { (async () => {
    setCourses(await DB.getCourses());
    const key = await getApiKey();
    setApiKeyInput(key);
    if (!key) setShowSettings(true);
    setApiKeyLoaded(true);
    setReady(true);
  })(); }, []);
  useEffect(() => { if (ready) { var t = setTimeout(() => DB.saveCourses(courses).catch(e => console.error("Auto-save courses failed:", e)), 500); return () => clearTimeout(t); } }, [courses, ready]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 150) + "px"; } }, [input]);

  const saveSessionToJournal = useCallback(async () => {
    if (!active || msgs.length <= sessionStartIdx.current + 1) return;
    try {
      const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
      if (!entry) return;
      const journal = await DB.getJournal(active.id);
      journal.push(entry);
      await DB.saveJournal(active.id, journal.slice(-50));
      await DB.saveChat(active.id, msgs.slice(-100));
      sessionStartIdx.current = msgs.length;
      sessionSkillLog.current = [];
    } catch (e) { console.error("Journal save failed:", e); }
  }, [active, msgs]);

  useEffect(() => {
    const onUnload = () => { saveSessionToJournal(); };
    const onVis = () => { if (document.visibilityState === "hidden") saveSessionToJournal(); };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("beforeunload", onUnload); document.removeEventListener("visibilitychange", onVis); };
  }, [saveSessionToJournal]);

  // --- File Handlers ---
  const onDrop = useCallback(async (e) => {
    e.preventDefault(); setDrag(false);
    const fl = Array.from(e.dataTransfer.files);
    setParsing(true);
    const parsed = await Promise.all(fl.map(readFile));
    setFiles(p => [...p, ...parsed.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false);
  }, []);

  const onSelect = useCallback(async (e) => {
    const fl = Array.from(e.target.files);
    setParsing(true);
    const parsed = await Promise.all(fl.map(readFile));
    setFiles(p => [...p, ...parsed.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false); e.target.value = "";
  }, []);

  const classify = (id, c) => setFiles(p => p.map(f => f.id === id ? { ...f, classification: c } : f));
  const removeF = (id) => setFiles(p => p.filter(f => f.id !== id));

  // --- Course Creation ---
  const createCourse = async () => {
    if (!cName.trim() || !files.length || files.some(f => !f.classification)) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    const courseId = Date.now().toString();
    setGlobalLock({ message: "Creating course..." });
    setBusy(true);
    setStatus("Storing documents...");

    try {
      const mats = [];
      for (let i = 0; i < validFiles.length; i++) {
        const f = validFiles[i];
        setStatus("Storing: " + f.name + "...");
        const mat = await storeAsChunks(courseId, f, "doc-" + i + "-" + Date.now());
        var failedChunks = mat.chunks.filter(c => c.status === "failed").length;
        if (failedChunks > 0) {
          addNotif("error", failedChunks + " of " + mat.chunks.length + " chunks failed to save for \"" + f.name + "\". Storage may be unreliable.");
        }
        mats.push(mat);
      }

      const newCourse = { id: courseId, name: cName.trim(), materials: mats, createdAt: new Date().toISOString() };
      const updated = [...courses.filter(c => c.id !== courseId), newCourse];
      await DB.saveCourses(updated);
      // Flush buffered content now that chunk rows exist
      for (const mat of mats) {
        for (const pd of (mat._pendingDocs || [])) {
          await DB.saveDoc(courseId, pd.chunkId, pd.doc);
        }
        delete mat._pendingDocs;
      }
      setCourses(updated); setActive(newCourse); setFiles([]); setCName("");
      setScreen("materials");
      var totalSections = mats.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
      addNotif("success", "Course created with " + mats.length + " material(s) and " + totalSections + " section(s). Activate sections to start studying.");
    } catch (err) {
      console.error("Course creation failed:", err);
      addNotif("error", "Course creation failed: " + err.message);
    } finally {
      setGlobalLock(null); setBusy(false); setStatus("");
    }
    setBooting(false); setStatus("");
  };

  // --- Run extraction after chunk selection ---
  const runExtraction = async (selectedChunkIds) => {
    if (!chunkPicker || !active) { console.error("runExtraction: missing chunkPicker or active", { chunkPicker: !!chunkPicker, active: !!active }); return; }
    
    // Immediate feedback
    setStatus("Starting extraction...");
    setBusy(true); setBooting(true); 
    
    // Get the material IDs that are part of this extraction
    var extractingMatIds = new Set(chunkPicker.materials.map(m => m.id));
    
    setChunkPicker(null);

    // Mark unselected chunks as "skipped" ONLY for materials being extracted
    // Leave other materials untouched
    var updatedMats = active.materials.map(mat => {
      if (!mat.chunks) return mat;
      // Only modify materials that are part of this extraction
      if (!extractingMatIds.has(mat.id)) return mat;
      return { ...mat, chunks: mat.chunks.map(ch =>
        selectedChunkIds.has(ch.id) ? { ...ch, status: "pending" } : { ...ch, status: "skipped" }
      )};
    });

    // Save updated metadata
    var updatedCourse = { ...active, materials: updatedMats };
    var allCourses = await DB.getCourses();
    allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
    await DB.saveCourses(allCourses);
    setCourses(allCourses); setActive(updatedCourse);

    // Count what we're processing
    var totalSelected = updatedMats.flatMap(m => (m.chunks || []).filter(c => c.status === "pending")).length;
    var totalSkipped = updatedMats.flatMap(m => (m.chunks || []).filter(c => c.status === "skipped")).length;
    setStatus("Extracting skills from " + totalSelected + " chunks...");

    let skills = [];
    setGlobalLock({ message: "Extracting skills from selected sections..." });
    try {
      extractionCancelledRef.current = false; // Reset cancel flag
      skills = await extractSkillTree(active.id, updatedMats, setStatus, false, addNotif, extractionCancelledRef,
        (err) => {
          setExtractionErrors(p => [...p, err].slice(-10));
          if (err.error && /401|403|authentication|unauthorized|invalid.*key/i.test(err.error)) {
            addNotif("error", "API key is invalid or expired. Go to Settings to update it.");
          }
        }, setProcessingMatId);
      if (!Array.isArray(skills)) {
        addNotif("error", "Skill extraction didn't return structured data.");
      }
    } catch (e) {
      console.error("Skill extraction failed:", e);
      var eMsg = e.message || "";
      if (/401|403|authentication|unauthorized|invalid.*key/i.test(eMsg)) {
        addNotif("error", "API key is invalid or expired. Go to Settings to update it.");
        setShowSettings(true);
      } else {
        addNotif("error", "Skill extraction failed: " + eMsg);
      }
    } finally {
      setGlobalLock(null);
    }

    // Validation pass
    if (Array.isArray(skills) && skills.length > 0) {
      try {
        var validation = await validateSkillTree(active.id, skills, setStatus);
        skills = validation.skills;
        var vr = validation.report;
        if (vr && vr.status !== "parse_failed" && vr.status !== "error") {
          var fixCount = (vr.prerequisiteFixes?.length || 0) + (vr.descriptionFixes?.length || 0) + (vr.mergedDuplicates?.length || 0);
          if (fixCount > 0) addNotif("success", "Validation applied " + fixCount + " correction" + (fixCount !== 1 ? "s" : "") + " to the skill tree.");
        }
      } catch (e) {
        console.error("Validation failed:", e);
      }
    }

    // Decompose assignments
    var hasAsgn = updatedMats.some(m => m.classification === "assignment");
    let asgn = [];
    if (hasAsgn && Array.isArray(skills) && skills.length > 0) {
      setStatus("Breaking down assignments...");
      try { asgn = await decomposeAssignments(active.id, updatedMats, skills, setStatus); } catch (e) { console.error("Assignment decomp failed:", e); }
    }

    // Refresh from DB
    var refreshed = await DB.getCourses();
    var refreshedCourse = refreshed.find(c => c.id === active.id);
    if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }

    var skillCount = Array.isArray(skills) ? skills.length : 0;
    var failedCount = (refreshedCourse?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed")).length;
    var summary = skillCount > 0 ? "Found " + skillCount + " skills." : "No skills extracted.";
    if (failedCount > 0) summary += " " + failedCount + " chunk(s) failed -- you can retry from the mode picker.";
    if (skillCount > 0) {
      addNotif("success", summary);
      // Show sample skills
      var sampleSkills = skills.slice(0, Math.min(5, skills.length));
      for (var sk of sampleSkills) {
        addNotif("skill", "Added: " + sk.name);
      }
      if (skills.length > 5) {
        addNotif("skill", "...and " + (skills.length - 5) + " more skills");
      }
    }

    setBooting(false); setBusy(false); setStatus("");
    setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null);
  };
  const enterStudy = async (course) => {
    setActive(course); setScreen("study");
    setMsgs([]); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null);
    sessionSkillLog.current = [];
    cachedSessionCtx.current = null;
    sessionStartIdx.current = 0;
    // Save previous session to journal before clearing
    try {
      const savedMsgs = await DB.getChat(course.id);
      if (savedMsgs.length > 1) {
        const entry = generateSessionEntry(savedMsgs, 0, []);
        if (entry) {
          const journal = await DB.getJournal(course.id);
          journal.push(entry);
          await DB.saveJournal(course.id, journal.slice(-50));
        }
      }
    } catch (e) { console.error("Journal capture on enter:", e); }
    await DB.saveChat(course.id, []);
  };

  // --- Mode Selection (step 1: load picker data) ---
  const selectMode = async (mode) => {
    setSessionMode(mode);
    if (mode === "recap") {
      // Recap boots directly -- no picker needed
      bootWithFocus({ type: "recap" });
      return;
    }
    // Load structured data for picker
    try {
      const skills = await DB.getSkills(active.id);
      const profile = await DB.getProfile(active.id);
      if (mode === "assignment") {
        const asgn = await DB.getAsgn(active.id);
        if (!Array.isArray(asgn) || asgn.length === 0) {
          setPickerData({ mode, empty: true, message: "No assignments found. Upload assignment files and recreate the course, or switch to skill work." });
          return;
        }
        // Enrich assignments with readiness info
        const enriched = asgn.map(a => {
          const reqSkills = new Set();
          if (a.questions) a.questions.forEach(q => q.requiredSkills?.forEach(s => reqSkills.add(s)));
          const skillList = [...reqSkills].map(sid => {
            const sk = Array.isArray(skills) ? skills.find(s => s.id === sid) : null;
            return { id: sid, name: sk?.name || sid, points: profile.skills[sid]?.points || 0, strength: effectiveStrength(profile.skills[sid]) };
          });
          const weakSkills = skillList.filter(sk => sk.strength < 0.4);
          const avgStrength = skillList.length > 0 ? skillList.reduce((s, sk) => s + sk.strength, 0) / skillList.length : 0;
          return { ...a, skillList, avgStrength, weakSkills, questionCount: a.questions?.length || 0 };
        });
        setPickerData({ mode, items: enriched, _skills: skills });
      } else if (mode === "skills") {
        if (!Array.isArray(skills) || skills.length === 0) {
          setPickerData({ mode, empty: true, message: "No skills yet. Activate sections from your materials first." });
          return;
        }
        const enriched = skills.map(s => {
          const sd = profile.skills[s.id];
          return {
            ...s,
            points: sd?.points || 0,
            strength: effectiveStrength(sd),
            ease: sd?.ease || DEFAULT_EASE,
            lastPracticed: sd?.lastPracticed || null,
            reviewDate: nextReviewDate(sd, 0.4),
            sessions: sd?.entries?.length || 0,
            lastRating: sd?.entries?.slice(-1)[0]?.rating || null
          };
        }).sort((a, b) => a.strength - b.strength);
        setPickerData({ mode, items: enriched });
      }
    } catch (e) {
      console.error("Picker load failed:", e);
      setPickerData({ mode, empty: true, message: "Failed to load data: " + e.message });
    }
  };

  // --- Boot with focused context (step 2: after picker selection) ---
  const bootWithFocus = async (focus) => {
    if (!active) return;
    setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
    try {
      const skills = await DB.getSkills(active.id);
      const profile = await DB.getProfile(active.id);
      const journal = await DB.getJournal(active.id);
      const ctx = await buildFocusedContext(active.id, active.materials, focus, skills, profile);

      // Cache context for reuse in sendMessage
      cachedSessionCtx.current = { ctx, skills, profile, journal, focus };

      // --- IES Rec 1 & 6b: Calculate gaps and review-due skills ---
      var studentContext = "";
      if (Array.isArray(skills) && skills.length > 0) {
        const now = new Date();
        const today = now.toISOString().split("T")[0];
        
        // Find skills due for review (nextReviewDate <= today or "now")
        const dueForReview = skills.map(s => {
          const sd = profile.skills[s.id];
          const reviewDate = nextReviewDate(sd, 0.4);
          return { ...s, reviewDate, strength: effectiveStrength(sd) };
        }).filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today));
        
        // Find weak skills (strength < 0.4)
        const weakSkills = skills.map(s => ({
          ...s, strength: effectiveStrength(profile.skills[s.id])
        })).filter(s => s.strength < 0.4 && s.strength > 0);
        
        // Find solid skills (strength >= 0.7)
        const solidSkills = skills.map(s => ({
          ...s, strength: effectiveStrength(profile.skills[s.id])
        })).filter(s => s.strength >= 0.7);
        
        if (dueForReview.length > 0 || weakSkills.length > 0 || solidSkills.length > 0) {
          studentContext = "\n\nSTUDENT SKILL STATUS:";
          if (solidSkills.length > 0) {
            studentContext += "\n- Solid (70%+): " + solidSkills.slice(0, 5).map(s => s.name).join(", ") + (solidSkills.length > 5 ? " (+" + (solidSkills.length - 5) + " more)" : "");
          }
          if (weakSkills.length > 0) {
            studentContext += "\n- Needs work (<40%): " + weakSkills.slice(0, 5).map(s => s.name + " (" + Math.round(s.strength * 100) + "%)").join(", ");
          }
          if (dueForReview.length > 0) {
            studentContext += "\n- DUE FOR REVIEW: " + dueForReview.slice(0, 5).map(s => s.name).join(", ");
          }
          studentContext += "\n\nBe direct about gaps. If skills are due for review, mention it. Students benefit from knowing where they stand.";
        }
      }

      var userMsg, modeHint;
      if (focus.type === "recap") {
        userMsg = "Catch me up on where I left off.";
        modeHint = "\n\nMODE: RECAP. Summarize progress from session history. Be direct about skill status -- name what's solid, what needs work, and what's due for review. Suggest what to do next based on gaps and upcoming assignments.";
      } else if (focus.type === "assignment") {
        // Initialize workspace with all questions locked
        var qs = (focus.assignment.questions || []).map(q => ({
          id: q.id, description: q.description, difficulty: q.difficulty,
          requiredSkills: q.requiredSkills || [],
          unlocked: false, answer: "", done: false
        }));
        setAsgnWork({ questions: qs, currentIdx: 0 });

        userMsg = "I want to work on: " + focus.assignment.title;
        modeHint = "\n\nMODE: ASSIGNMENT WORK.\n\nIMPORTANT FLOW: Questions are hidden from the student. You control when they see each question.\n\n1. Look at the FIRST question's required skills. Check the student's strength on those skills.\n2. If ANY required skill is below 50% strength, teach that skill first using the ASK FIRST method. Diagnose, fill gaps, verify.\n3. Once the student has demonstrated competence on ALL skills needed for the question, reveal it by including:\n[UNLOCK_QUESTION]" + (qs[0]?.id || "q1") + "[/UNLOCK_QUESTION]\n4. After revealing, guide them but do NOT write their answer. Ask them to explain their approach. Nudge if stuck.\n5. When the student says they've completed a question or moves on, proceed to the next question's required skills.\n\nStart by diagnosing the first question's prerequisites. Do NOT show or describe the question yet. Just begin with a skill-check question.\n\nThe question order is: " + qs.map(q => q.id).join(", ") + "\nUse the exact question ID in the unlock tag.";
      } else if (focus.type === "skill") {
        userMsg = "I want to work on: " + focus.skill.name;
        modeHint = "\n\nMODE: SKILL MASTERY. The student chose this specific skill to strengthen. You have the skill details and source material loaded. Start by asking a diagnostic question to find where their understanding breaks down.";
      }

      const bootSystem = "You are Study -- a master teacher.\n\nCOURSE: " + active.name + "\n\n" + ctx + "\n\nSESSION HISTORY:\n" + formatJournal(journal) + studentContext + modeHint + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";
      setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: "" }]);
      const response = await callClaudeStream(bootSystem, [{ role: "user", content: userMsg }], function(partial) {
        setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: partial }]);
      });
      setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: response }]);
      sessionStartIdx.current = 0;
      await DB.saveChat(active.id, [{ role: "user", content: userMsg }, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Boot failed:", err);
      addNotif("error", "Failed to start session: " + err.message);
    }
    setBooting(false); setStatus("");
  };

  // --- Send Message ---
  const sendMessage = async () => {
    if (!input.trim() || busy || !active) return;
    const userMsg = input.trim(); setInput("");
    const newMsgs = [...msgs, { role: "user", content: userMsg }];
    setMsgs([...newMsgs, { role: "assistant", content: "" }]); setBusy(true);

    try {
      // Use cached context if available, otherwise rebuild
      let ctx, skills, profile, journal;
      if (cachedSessionCtx.current && focusContext) {
        ctx = cachedSessionCtx.current.ctx;
        skills = cachedSessionCtx.current.skills;
        profile = cachedSessionCtx.current.profile;
        journal = cachedSessionCtx.current.journal;
      } else {
        skills = await DB.getSkills(active.id) || "";
        profile = await DB.getProfile(active.id);
        journal = await DB.getJournal(active.id);
        if (focusContext && (focusContext.type === "assignment" || focusContext.type === "skill")) {
          ctx = await buildFocusedContext(active.id, active.materials, focusContext, skills, profile);
        } else {
          const asgn = await DB.getAsgn(active.id) || [];
          ctx = await buildContext(active.id, active.materials, skills, asgn, profile, newMsgs);
        }
      }

      const sysPrompt = buildSystemPrompt(active.name, ctx, journal);
      const chatMsgs = newMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

      const response = await callClaudeStream(sysPrompt, chatMsgs, function(partial) {
        setMsgs([...newMsgs, { role: "assistant", content: partial }]);
      });

      const updates = parseSkillUpdates(response);
      if (updates.length) {
        await applySkillUpdates(active.id, updates);
        sessionSkillLog.current.push(...updates);
        for (var u of updates) addNotif("skill", u.skill + ": " + (u.delta > 0 ? "+" : "") + u.delta + " pts (" + u.rating + ")");
        // Refresh cached context after skill updates (profile changed)
        if (cachedSessionCtx.current) {
          var updatedProfile = await DB.getProfile(active.id);
          var updatedCtx = await buildFocusedContext(active.id, active.materials, focusContext, skills, updatedProfile);
          cachedSessionCtx.current = { ...cachedSessionCtx.current, profile: updatedProfile, ctx: updatedCtx };
        }
      }

      // Handle question unlocks
      const unlockId = parseQuestionUnlock(response);
      if (unlockId && asgnWork) {
        setAsgnWork(prev => {
          if (!prev) return prev;
          var updated = { ...prev, questions: prev.questions.map(q =>
            q.id === unlockId ? { ...q, unlocked: true } : q
          )};
          // Set currentIdx to the newly unlocked question
          var idx = updated.questions.findIndex(q => q.id === unlockId);
          if (idx >= 0) updated.currentIdx = idx;
          return updated;
        });
      }

      const finalMsgs = [...newMsgs, { role: "assistant", content: response }];
      setMsgs(finalMsgs); setBusy(false);
      await DB.saveChat(active.id, finalMsgs.slice(-100));
    } catch (e) {
      console.error("sendMessage error:", e);
      const errorMsgs = [...newMsgs, { role: "assistant", content: "Sorry, something went wrong: " + e.message }];
      setMsgs(errorMsgs); setBusy(false);
      addNotif("error", "Message failed: " + e.message);
    }
  };

  // --- Delete Course ---
  const delCourse = async (id) => {
    if (globalLock) return;
    setGlobalLock({ message: "Deleting course..." });
    try {
      const course = courses.find(c => c.id === id);
      setCourses(p => p.filter(c => c.id !== id));
      await DB.deleteCourse(id);
      if (active?.id === id) { setActive(null); setScreen("home"); }
    } finally { setGlobalLock(null); }
  };

  // --- Add Materials ---
  const addMats = async () => {
    if (!active || !files.length || files.some(f => !f.classification) || globalLock) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    if (validFiles.length === 0) return;
    setGlobalLock({ message: "Adding materials..." });
    setBusy(true);
    setStatus("Storing new materials...");
    
    try {
    const newMeta = [];
    for (let i = 0; i < validFiles.length; i++) {
      const f = validFiles[i];
      setStatus("Storing: " + f.name + "...");
      const mat = await storeAsChunks(active.id, f, "doc-add-" + i + "-" + Date.now());
      newMeta.push(mat);
    }
    
    // Update course with new materials (all inactive by default)
    const updatedCourse = { ...active, materials: [...active.materials, ...newMeta] };
    const allCourses = await DB.getCourses();
    const updatedCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
    await DB.saveCourses(updatedCourses);
    // Flush buffered content now that chunk rows exist
    for (const mat of newMeta) {
      for (const pd of (mat._pendingDocs || [])) {
        await DB.saveDoc(active.id, pd.chunkId, pd.doc);
      }
      delete mat._pendingDocs;
    }
    setCourses(updatedCourses);
    setActive(updatedCourse);
    setFiles([]);

    // Count total sections added
    const totalSections = newMeta.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
    addNotif("success", "Added " + newMeta.length + " file(s) with " + totalSections + " section(s). Activate sections to add them to your curriculum.");
    } finally {
      setGlobalLock(null);
      setStatus("");
      setBusy(false);
    }
  };

  // --- Remove Material ---
  const removeMat = async (docId) => {
    if (!active || globalLock) return;
    const removedMat = active.materials.find(m => m.id === docId);
    setGlobalLock({ message: "Removing " + (removedMat?.name || "material") + "..." });
    setBusy(true);
    try {
      // Delete chunk data from SQLite
      if (removedMat?.chunks) {
        for (const ch of removedMat.chunks) {
          await DB.deleteChunk(active.id, ch.id);
        }
      }
      const updatedMats = active.materials.filter(m => m.id !== docId);
      const updatedCourse = { ...active, materials: updatedMats };
      setCourses(p => p.map(c => c.id === active.id ? updatedCourse : c));
      setActive(updatedCourse);
      if (updatedMats.length > 0) {
        // Prune skills whose ONLY source was the removed document
        const existingSkills = await DB.getSkills(active.id);
        if (Array.isArray(existingSkills) && removedMat) {
          const removedName = removedMat.name.toLowerCase();
          const pruned = existingSkills.filter(s => {
            if (!s.sources || s.sources.length === 0) return true;
            const remaining = s.sources.filter(src => src.toLowerCase() !== removedName);
            if (remaining.length > 0) {
              s.sources = remaining;
              return true;
            }
            return false; // All sources were the removed doc
          });
          const removedCount = existingSkills.length - pruned.length;
          await DB.saveSkills(active.id, pruned);
          addNotif("success", "Removed \"" + removedMat.name + "\"." + (removedCount > 0 ? " " + removedCount + " skill" + (removedCount !== 1 ? "s" : "") + " pruned." : ""));
        } else {
          addNotif("success", "Material removed.");
        }
        // Re-decompose assignments if any remain
        if (updatedMats.some(m => m.classification === "assignment")) {
          const sk = await DB.getSkills(updatedCourse.id);
          await decomposeAssignments(updatedCourse.id, updatedMats, sk, () => {});
        }
      } else {
        addNotif("warn", "All materials removed. Upload new files to continue.");
      }
    } catch (err) {
      addNotif("error", "Remove failed: " + err.message);
    } finally {
      setGlobalLock(null);
      setBusy(false);
    }
  };

  // --- Reprocess Material (re-verify only, no skill extraction) ---
  const reprocessMat = async (mat) => {
    if (!active || globalLock) return;
    setGlobalLock({ message: "Verifying \"" + mat.name + "\"..." });
    setBusy(true);
    setStatus("Verifying \"" + mat.name + "\"...");
    try {
      const v = await verifyDocument(active.id, mat);
      const updatedMats = active.materials.map(m => m.id === mat.id ? { ...m, verification: v.status } : m);
      const updatedCourse = { ...active, materials: updatedMats };
      setCourses(p => p.map(c => c.id === active.id ? updatedCourse : c));
      setActive(updatedCourse);
      if (v.status === "verified") {
        addNotif("success", "Verified: " + mat.name);
      } else {
        addNotif("warn", "Verification issues for \"" + mat.name + "\": " + (v.issues?.join("; ") || v.summary));
      }
    } catch (err) {
      addNotif("error", "Verification failed: " + err.message);
    } finally {
      setGlobalLock(null);
      setBusy(false);
      setStatus("");
    }
  };

  // --- Async Error Reporter ---
  const catchAsync = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) {
      console.error("Async error:", e);
      setAsyncError({ message: e.message || String(e), stack: e.stack || "no stack" });
    }
  };

  // --- Async Error Display ---
  const [showAsyncNuclear, setShowAsyncNuclear] = useState(false);
  if (asyncError) {
    const report = [
      "STUDY ASYNC ERROR",
      "==================",
      "Timestamp: " + new Date().toISOString(),
      "Screen: " + screen,
      "Course ID: " + (active?.id || "none"),
      "Session Mode: " + (sessionMode || "none"),
      "Storage: SQLite",
      "",
      "Error: " + asyncError.message,
      "",
      "Stack:",
      (asyncError.stack || "").split("\n").slice(0, 10).join("\n"),
    ].join("\n");
    const handleAsyncHardReset = async () => {
      try {
        await DB.resetAll();
      } catch (e) { console.error("Failed to clear database:", e); }
      window.location.reload();
    };
    return (
      <div style={{ background: T.bg, minHeight: "100vh", padding: 32, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 20, color: T.rd, marginBottom: 8, fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Copy the error report below and paste it to Claude for debugging help.</div>
          <textarea readOnly value={report} onClick={e => e.target.select()}
            style={{ width: "100%", minHeight: 280, background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, padding: 16, fontSize: 11, fontFamily: "SF Mono, Fira Code, Consolas, monospace", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => { try { navigator.clipboard.writeText(report); } catch(e) { console.log("Clipboard not available"); } }}
              style={{ padding: "10px 20px", background: T.ac, color: "#0F1115", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Copy to clipboard</button>
            <button onClick={() => setAsyncError(null)}
              style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Dismiss</button>
            <button onClick={() => { setAsyncError(null); setScreen("home"); }}
              style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Go home</button>
          </div>
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid " + T.bd }}>
            {!showAsyncNuclear ? (
              <button onClick={() => setShowAsyncNuclear(true)}
                style={{ background: "transparent", border: "none", color: T.txM, fontSize: 12, padding: "8px 0", cursor: "pointer" }}>
                Still having issues? Show reset options...
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: T.rd, marginBottom: 12 }}>⚠️ This will permanently delete all your courses and data.</div>
                <button onClick={handleAsyncHardReset}
                  style={{ padding: "10px 20px", background: "#7F1D1D", color: "#FEE2E2", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Clear all data and restart
                </button>
                <button onClick={() => setShowAsyncNuclear(false)}
                  style={{ marginLeft: 8, padding: "10px 20px", background: "transparent", color: T.txM, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (!ready) return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style><div style={{ color: T.txD }}>Loading...</div>
    </div>
  );

  // --- GLOBAL LOCK OVERLAY ---
  // Shows during long operations like extraction to prevent user interaction
  const lockOverlay = globalLock ? (
    <div style={{ 
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", 
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", 
      zIndex: 2000, pointerEvents: "all"
    }}>
      <style>{CSS}</style>
      <div style={{ 
        background: T.sf, borderRadius: 16, padding: 32, maxWidth: 400, width: "90%", textAlign: "center"
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.tx, marginBottom: 16 }}>{globalLock.message || "Processing..."}</div>
        <div style={{ fontSize: 14, color: T.txD, marginBottom: 20 }}>{status || "Please wait..."}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out infinite" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out 0.2s infinite" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.ac, animation: "pulse 1s ease-in-out 0.4s infinite" }} />
        </div>
        <button 
          onClick={() => { extractionCancelledRef.current = true; }}
          style={{ padding: "10px 24px", background: T.rd, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          Cancel Operation
        </button>
      </div>
    </div>
  ) : null;

  // --- SETTINGS MODAL ---
  if (showSettings) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <style>{CSS}</style>
      <div style={{ background: T.sf, borderRadius: 16, padding: 28, maxWidth: 420, width: "90%" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 20 }}>Settings</div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Anthropic API Key</div>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => { setApiKeyInput(e.target.value); setKeyError(""); }}
            placeholder="sk-ant-..."
            style={{ width: "100%", padding: 14, background: T.bg, border: "1px solid " + (keyError ? T.rd : T.bd), borderRadius: 8, color: T.tx, fontSize: 14, outline: "none" }}
          />
          {keyError && (
            <div style={{ fontSize: 12, color: T.rd, marginTop: 8 }}>{keyError}</div>
          )}
          <div style={{ fontSize: 11, color: T.txD, marginTop: 8 }}>
            Get your key from <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: T.ac }}>console.anthropic.com</a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {apiKeyLoaded && apiKeyInput && (
            <button onClick={async () => { setShowSettings(false); setApiKeyInput(await getApiKey()); setKeyError(""); }}
              disabled={keyVerifying}
              style={{ flex: 1, padding: 14, background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: T.txD, cursor: keyVerifying ? "default" : "pointer", opacity: keyVerifying ? 0.5 : 1 }}>
              Cancel
            </button>
          )}
          <button onClick={async () => {
              var key = apiKeyInput.trim();
              if (!key) return;
              setKeyVerifying(true);
              setKeyError("");
              var result = await testApiKey(key);
              setKeyVerifying(false);
              if (result.valid) {
                await setApiKey(key);
                setShowSettings(false);
                addNotif("success", "API key verified and saved");
              } else {
                setKeyError(result.error || "Invalid API key");
              }
            }}
            disabled={!apiKeyInput.trim() || keyVerifying}
            style={{ flex: 1, padding: 14, background: !apiKeyInput.trim() || keyVerifying ? T.sfH : T.ac, border: "none", borderRadius: 8, color: !apiKeyInput.trim() || keyVerifying ? T.txD : T.bg, fontWeight: 600, cursor: !apiKeyInput.trim() || keyVerifying ? "default" : "pointer" }}>
            {keyVerifying ? "Verifying..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  // --- HOME SCREEN ---
  if (screen === "home") return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <style>{CSS}</style>
      {/* Settings button */}
      <button onClick={() => setShowSettings(true)}
        style={{ position: "absolute", top: 20, right: 20, background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13 }}>
        ⚙ Settings
      </button>
      <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease", maxWidth: 500 }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: T.tx, letterSpacing: "-0.03em", marginBottom: 8 }}>Study</div>
          <div style={{ fontSize: 15, color: T.txD, lineHeight: 1.6 }}>Your AI teacher. Upload your course materials,<br/>and master the material together.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setScreen("upload")}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 16, padding: "28px 32px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Upload Course Data</div>
            <div style={{ fontSize: 13, color: T.txD }}>Syllabus, textbooks, transcripts, assignments, notes</div>
          </button>
          <button onClick={() => courses.length ? setScreen("courses") : setScreen("upload")}
            style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 16, padding: "28px 32px", cursor: "pointer", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = T.acS}>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.ac, marginBottom: 4 }}>Study</div>
            <div style={{ fontSize: 13, color: T.txD }}>{courses.length ? courses.length + " course" + (courses.length > 1 ? "s" : "") : "Upload materials first"}</div>
          </button>
        </div>
      </div>
    </div>
  );

  // --- UPLOAD SCREEN ---
  if (screen === "upload") {
    const pending = files.filter(f => !f.classification);
    const confirmed = files.filter(f => f.classification);
    const failed = files.filter(f => f.parseOk === false);
    const cur = pending[0] || null;
    const allDone = files.length > 0 && pending.length === 0;
    const hasFailures = failed.length > 0;
    const goodFiles = confirmed.filter(f => f.parseOk !== false);
    const rdy = allDone && cName.trim() && goodFiles.length > 0;

    const previewContent = (f) => {
      if (f.parseOk === false) return f.content || "[Parse failed]";
      if (f.chapters) return f.chapters.length + " chapters, " + (f.totalChars || 0).toLocaleString() + " chars";
      if (f.content) {
        var preview = f.content.substring(0, 150).replace(/\n/g, " ").trim();
        if (f.content.length > 150) preview += "...";
        return preview;
      }
      if (f.type === "image") return "[Image file]";
      return "[No content]";
    };

    return (
      <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Upload Course Data</h1>
          <p style={{ fontSize: 14, color: T.txD, marginBottom: 32, lineHeight: 1.6 }}>Drop your files in. Study will auto-detect file types when possible.</p>

          <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
            style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 16, padding: cur ? "24px 20px" : "48px 32px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent", marginBottom: 24, transition: "all 0.2s" }}>
            <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
            <div style={{ fontSize: cur ? 13 : 15, color: T.tx, fontWeight: 500, marginBottom: 4 }}>
              {parsing ? "Parsing files..." : drag ? "Drop here" : files.length > 0 ? "Add more files" : "Drag & drop or click to browse"}
            </div>
            {files.length === 0 && (
              <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
                <span style={{ color: T.gn }}>Best:</span> .txt .md .csv .srt .vtt
                <span style={{ margin: "0 6px", color: T.bd }}>|</span>
                <span style={{ color: "#F59E0B" }}>Good:</span> .docx .xlsx .epub .pptx
                <span style={{ margin: "0 6px", color: T.bd }}>|</span>
                <span style={{ color: T.txM }}>No support:</span> .pdf
              </div>
            )}
          </div>

          {files.length === 0 && (
            <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 12, lineHeight: 1.8, color: T.txD }}>
              <div style={{ fontWeight: 600, color: T.tx, marginBottom: 8, fontSize: 13 }}>Format guide</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Plain text (.txt, .md, .csv)</span> -- always works perfectly. When in doubt, export to .txt.</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Subtitles (.srt, .vtt)</span> -- timestamps stripped, clean transcript extracted.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Word docs (.docx)</span> -- works for most files. Complex formatting may be lost. If content looks wrong, save as .txt from Word.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Spreadsheets (.xlsx, .csv)</span> -- tables extracted as tab-separated text. For best results, export as .csv from Excel.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>E-books (.epub)</span> -- chapters extracted individually. Non-standard EPUBs may fail.</div>
              <div><span style={{ color: T.txM, fontWeight: 600 }}>PDFs (.pdf)</span> -- not yet supported. Open in Preview/Acrobat, select all text, paste into a .txt file.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Slides (.pptx)</span> -- text and speaker notes extracted. Complex layouts may lose some content.</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Images</span> -- screenshots of assignments or notes. AI reads them directly.</div>
              <div style={{ marginTop: 8, color: T.txM, fontStyle: "italic" }}>Tip: if a file fails to parse, the fastest fix is always exporting to .txt or .csv from the source application.</div>
            </div>
          )}

          {cur && (
            <div style={{ background: T.sf, border: "1px solid " + T.acB, borderRadius: 14, padding: 20, marginBottom: 16, animation: "fadeIn 0.3s" }}>
              <div style={{ fontSize: 12, color: T.ac, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
                Classify file {confirmed.length + 1} of {files.length}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{cur.name}</div>
              <div style={{ fontSize: 12, color: cur.parseOk === false ? T.rd : T.txD, marginBottom: 12, marginTop: 4, fontStyle: cur.parseOk === false ? "italic" : "normal" }}>
                {previewContent(cur)}
              </div>
              {cur.parseOk === false && (
                <div style={{ fontSize: 12, color: T.rd, marginBottom: 12, padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>
                  Parse failed. Try re-exporting as .txt or .csv.
                </div>
              )}
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 14 }}>What type of material is this?</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CLS.map(c => (
                  <button key={c.v} onClick={() => classify(cur.id, c.v)}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: T.tx, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.ac; e.currentTarget.style.background = T.acS; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.background = T.sf; }}>
                    {c.l}
                  </button>
                ))}
              </div>
              <button onClick={() => removeF(cur.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 12, marginTop: 12, padding: 0 }}>Skip this file</button>
            </div>
          )}

          {confirmed.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Files ({confirmed.length})</div>
              {confirmed.map(f => {
                const cls = CLS.find(c => c.v === f.classification);
                const ok = f.parseOk !== false;
                return (
                  <div key={f.id} style={{ background: T.sf, borderRadius: 10, marginBottom: 6, padding: "10px 14px", border: "1px solid " + (ok ? T.bd : "rgba(248,113,113,0.3)") }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? T.gn : T.rd, flexShrink: 0 }} />
                        <span style={{ color: T.tx, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ color: T.ac, fontSize: 11 }}>{cls?.l}</span>
                        <button onClick={() => setFiles(p => p.map(pf => pf.id === f.id ? { ...pf, classification: "" } : pf))} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 11 }}>change</button>
                        <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 14 }}>x</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: ok ? T.txD : T.rd, paddingLeft: 16, lineHeight: 1.4 }}>{previewContent(f)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {hasFailures && allDone && (
            <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: T.rd }}>
              {failed.length} file{failed.length !== 1 ? "s" : ""} failed to parse. These will be skipped. Remove them or re-export as .txt/.csv.
            </div>
          )}

          {allDone && (
            <div style={{ animation: "fadeIn 0.3s" }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Course Name</label>
                <input type="text" value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Organic Chemistry 201"
                  style={{ width: "100%", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 16px", color: T.tx, fontSize: 15 }} />
              </div>
              <button onClick={createCourse} disabled={!rdy}
                style={{ width: "100%", padding: "16px 24px", borderRadius: 12, border: "none", background: rdy ? T.ac : T.sf, color: rdy ? "#0F1115" : T.txM, fontSize: 15, fontWeight: 600, cursor: rdy ? "pointer" : "default" }}>
                {!cName.trim() ? "Name your course to continue" : "Create Course & Extract Skills"}
              </button>
            </div>
          )}

          {files.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: T.txM, fontSize: 13 }}>
              Drop your syllabus, textbook, transcripts, assignments, or notes above.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- COURSES SCREEN ---
  if (screen === "courses") return (
    <>
    {globalLock && lockOverlay}
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Your Courses</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 32 }}>Pick a course to study.</p>
        {courses.map(c => {
          const mats = c.materials || [];
          const types = [...new Set(mats.map(m => m.classification))].map(v => CLS.find(cl => cl.v === v)?.l || v).join(", ");
          return (
            <div key={c.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: 20, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 6 }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: T.txD }}>{mats.length} materials | {types}</div>
                </div>
                <button onClick={e => { e.stopPropagation();
                    if (pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id) { setPendingConfirm(null); delCourse(c.id); }
                    else setPendingConfirm({ type: "delCourse", id: c.id });
                  }} style={{ background: "none", border: "none", color: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? T.rd : T.txM, cursor: "pointer", fontSize: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? 11 : 13 }}>
                  {pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? "Confirm delete?" : "Delete"}
                </button>
              </div>
              <button onClick={() => enterStudy(c)}
                style={{ marginTop: 14, width: "100%", padding: "12px 20px", borderRadius: 10, border: "1px solid " + T.acB, background: T.acS, color: T.ac, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Start Studying
              </button>
            </div>
          );
        })}
        <button onClick={() => setScreen("upload")} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "1px dashed " + T.bd, background: "transparent", color: T.txD, fontSize: 14, cursor: "pointer", marginTop: 8 }}>+ Add New Course</button>
      </div>
    </div>
    </>
  );

  // --- COURSE MANAGEMENT SCREEN ---
  if (screen === "manage" && active) return (
    <>
    {globalLock && lockOverlay}
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <button onClick={() => { if (!processingMatId) setScreen("study"); }} 
          style={{ background: "none", border: "none", color: processingMatId ? T.txM : T.txD, cursor: processingMatId ? "not-allowed" : "pointer", fontSize: 14, marginBottom: 24, opacity: processingMatId ? 0.5 : 1 }}>
          &lt; Back {processingMatId && "(extraction in progress)"}
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, marginBottom: 8 }}>{active.name}</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 32 }}>Manage your course content</p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setScreen("materials")}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Materials</div>
            <div style={{ fontSize: 12, color: T.txD }}>{active.materials.length} files uploaded</div>
          </button>
          
          <button onClick={async () => {
            var sk = await DB.getSkills(active.id) || [];
            var rt = await DB.getRefTaxonomy(active.id);
            setSkillViewData({ skills: sk, refTax: rt });
            setScreen("skills");
          }}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Skills</div>
            <div style={{ fontSize: 12, color: T.txD }}>View skill tree from active sections</div>
          </button>
        </div>
      </div>
    </div>
    </>
  );

  // --- MATERIALS SCREEN ---
  if (screen === "materials" && active) return (
    <>
    {globalLock && lockOverlay}
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <button onClick={() => { if (!processingMatId) setScreen("manage"); }} 
          style={{ background: "none", border: "none", color: processingMatId ? T.txM : T.txD, cursor: processingMatId ? "not-allowed" : "pointer", fontSize: 14, marginBottom: 24, opacity: processingMatId ? 0.5 : 1 }}>
          &lt; Back {processingMatId && "(extraction in progress)"}
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Materials</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 24 }}>{active.name}</p>
        
        {/* Add Materials */}
        <div style={{ marginBottom: 24 }}>
          <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
            style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 12, padding: "20px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent" }}>
            <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
            <div style={{ fontSize: 14, color: T.txD }}>+ Drop or click to add materials</div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} style={{ background: T.sf, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: T.tx }}>{f.name}</span>
                    <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer" }}>x</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CLS.map(c => <button key={c.v} onClick={() => classify(f.id, c.v)}
                      style={{ background: f.classification === c.v ? T.acS : "transparent", border: "1px solid " + (f.classification === c.v ? T.ac : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: f.classification === c.v ? T.ac : T.txD, cursor: "pointer" }}>{c.l}</button>)}
                  </div>
                </div>
              ))}
              {files.every(f => f.classification) && (
                <button onClick={addMats} style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Add Materials</button>
              )}
            </div>
          )}
        </div>
        
        {/* Extraction Progress */}
        {processingMatId && (
          <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: T.ac, animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: T.ac, fontWeight: 600 }}>Extracting skills...</div>
              <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{status}</div>
            </div>
            <button onClick={() => { extractionCancelledRef.current = true; }}
              style={{ padding: "6px 12px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 12, color: T.txD, cursor: "pointer" }}>Stop</button>
          </div>
        )}
        
        {/* Materials List */}
        <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Course Materials ({active.materials.length})</div>
        {active.materials.map(mat => {
          const clsLabel = CLS.find(c => c.v === mat.classification)?.l || mat.classification;
          const chunks = mat.chunks || [];
          const extracted = chunks.filter(c => c.status === "extracted").length;
          const failed = chunks.filter(c => c.status === "failed").length;
          const skipped = chunks.filter(c => c.status === "skipped").length;
          const pending = chunks.filter(c => c.status === "pending").length;
          const isProcessing = processingMatId === mat.id;
          const hasNoChunks = chunks.length === 0;
          const allExtracted = chunks.length > 0 && extracted === chunks.length;
          const allSkipped = chunks.length > 0 && skipped === chunks.length;
          
          return (
            <div key={mat.id} style={{ background: T.sf, borderRadius: 12, marginBottom: 10, overflow: "hidden", border: isProcessing ? "2px solid " + T.ac : "1px solid " + T.bd }}>
              <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{mat.name}</div>
                  <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>{clsLabel}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {hasNoChunks && <span style={{ color: T.txM }}>Not yet processed</span>}
                    {chunks.length > 0 && <span>{chunks.length} section{chunks.length !== 1 ? "s" : ""}</span>}
                    {extracted > 0 && <span style={{ color: T.gn }}>{extracted} active</span>}
                    {failed > 0 && <span style={{ color: "#F59E0B" }}>{failed} failed</span>}
                    {skipped > 0 && <span style={{ color: T.txM }}>{skipped} inactive</span>}
                    {pending > 0 && isProcessing && <span style={{ color: T.ac }}>{pending} extracting...</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {/* Processing indicator */}
                  {isProcessing && (
                    <span style={{ fontSize: 11, color: T.ac, padding: "6px 12px" }}>Activating...</span>
                  )}
                  
                  {/* Activate button for materials with no chunks (never processed or chunks lost) */}
                  {hasNoChunks && !isProcessing && (
                    <button onClick={async () => {
                      if (globalLock) return;
                      setGlobalLock({ message: "Processing " + mat.name + "..." });
                      setProcessingMatId(mat.id);
                      setBusy(true);
                      setStatus("Processing " + mat.name + "...");
                      extractionCancelledRef.current = false;
                      try {
                        // Material has no chunks — try to load content and create a synthetic chunk
                        var doc = await DB.getDoc(active.id, mat.id);
                        // Also check chunk-style IDs
                        if (!doc || !doc.content) doc = await DB.getDoc(active.id, mat.id + "-c0");
                        if (!doc || !doc.content) {
                          addNotif("error", "No content found for " + mat.name + ". Try removing and re-uploading.");
                          return;
                        }
                        // Create chunk metadata and save
                        var chunkId = mat.id + "-c0";
                        var matWithChunks = { ...mat, chunks: [{ id: chunkId, label: mat.name, charCount: doc.content.length, status: "pending" }] };
                        await DB.saveDoc(active.id, chunkId, doc);
                        var updatedMats = active.materials.map(m => m.id !== mat.id ? m : matWithChunks);
                        var updatedCourse = { ...active, materials: updatedMats };
                        var allCourses = await DB.getCourses();
                        allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                        await DB.saveCourses(allCourses);
                        setCourses(allCourses); setActive(updatedCourse);
                        // Now extract
                        await extractSkillTree(active.id, [matWithChunks], setStatus, false, addNotif, extractionCancelledRef,
                          (err) => {
                            setExtractionErrors(p => [...p, err].slice(-10));
                            if (err.error && /401|403|authentication|unauthorized|invalid.*key/i.test(err.error)) {
                              addNotif("error", "API key is invalid or expired. Go to Settings to update it.");
                            }
                          }, setProcessingMatId);
                        var refreshed = await DB.getCourses();
                        var refreshedCourse = refreshed.find(c => c.id === active.id);
                        if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }
                        addNotif("success", "Extracted skills from " + mat.name);
                      } catch (e) { addNotif("error", "Extraction failed: " + e.message); }
                      finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                    }}
                      style={{ background: T.acS, border: "1px solid " + T.ac, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.ac, cursor: "pointer" }}>Activate</button>
                  )}
                  
                  {/* Deactivate button for single-section materials where active */}
                  {allExtracted && !isProcessing && chunks.length === 1 && (
                    <button onClick={async () => {
                      if (globalLock) return;
                      setGlobalLock({ message: "Deactivating " + mat.name + "..." });
                      try {
                      // Mark all chunks as skipped (inactive)
                      var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                        ...m,
                        chunks: m.chunks.map(c => ({ ...c, status: "skipped" }))
                      });
                      var updatedCourse = { ...active, materials: updatedMats };
                      var allCourses = await DB.getCourses();
                      allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                      await DB.saveCourses(allCourses);
                      setCourses(allCourses); setActive(updatedCourse);
                      
                      // Prune skills sourced from this material
                      var matName = mat.name.toLowerCase();
                      var existingSkills = await DB.getSkills(active.id) || [];
                      var pruned = existingSkills.filter(s => {
                        if (!s.sources || s.sources.length === 0) return true;
                        var remaining = s.sources.filter(src => !src.toLowerCase().includes(matName.substring(0, 30)));
                        if (remaining.length > 0) {
                          s.sources = remaining;
                          return true;
                        }
                        return false;
                      });
                      var prunedCount = existingSkills.length - pruned.length;
                      await DB.saveSkills(active.id, pruned);
                      addNotif("success", "Deactivated " + mat.name + "." + (prunedCount > 0 ? " " + prunedCount + " skills removed." : ""));
                      } finally { setGlobalLock(null); }
                    }}
                      style={{ background: "transparent", border: "1px solid " + T.txM, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.txM, cursor: "pointer" }}>Deactivate</button>
                  )}
                  
                  {/* Edit Sections for multi-section materials where all active - opens in deactivate mode */}
                  {allExtracted && !isProcessing && chunks.length > 1 && (
                    <button onClick={() => {
                      var activeIds = new Set(chunks.map(c => c.id));
                      setChunkPicker({ courseId: active.id, materials: [mat], selectedChunks: activeIds, mode: "deactivate" });
                    }}
                      style={{ background: "transparent", border: "1px solid " + T.ac, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.ac, cursor: "pointer" }}>Edit Sections</button>
                  )}
                  
                  {/* Activate button for single-section materials where inactive */}
                  {allSkipped && !isProcessing && chunks.length === 1 && (
                    <button onClick={async () => {
                      if (globalLock) return;
                      setGlobalLock({ message: "Activating " + mat.name + "..." });
                      // Single section - activate immediately
                      var ch = chunks[0];
                      setProcessingMatId(mat.id);
                      setBusy(true);
                      setStatus("Activating " + mat.name + "...");
                      try {
                      // Check cache first
                      var cachedSkills = await DB.getChunkSkills(active.id, ch.id);
                      if (cachedSkills && cachedSkills.length > 0) {
                        var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                          ...m,
                          chunks: m.chunks.map(c => ({ ...c, status: "extracted" }))
                        });
                        var updatedCourse = { ...active, materials: updatedMats };
                        var allCourses = await DB.getCourses();
                        allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                        await DB.saveCourses(allCourses);
                        setCourses(allCourses); setActive(updatedCourse);
                        
                        var existingSkills = await DB.getSkills(active.id) || [];
                        var merged = [...existingSkills, ...cachedSkills];
                        var seen = new Set();
                        merged = merged.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
                        await DB.saveSkills(active.id, merged);
                        addNotif("success", "Activated " + mat.name + " (" + cachedSkills.length + " skills from cache)");
                      } else {
                        var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                          ...m,
                          chunks: m.chunks.map(c => ({ ...c, status: "pending" }))
                        });
                        var updatedCourse = { ...active, materials: updatedMats };
                        var allCourses = await DB.getCourses();
                        allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                        await DB.saveCourses(allCourses);
                        setCourses(allCourses); setActive(updatedCourse);
                        
                        extractionCancelledRef.current = false;
                        try {
                          var matToProcess = { ...mat, chunks: mat.chunks.map(c => ({ ...c, status: "pending" })) };
                          await extractSkillTree(active.id, [matToProcess], setStatus, false, addNotif, extractionCancelledRef,
                            (err) => setExtractionErrors(p => [...p, err].slice(-10)), setProcessingMatId);
                          var refreshed = await DB.getCourses();
                          var refreshedCourse = refreshed.find(c => c.id === active.id);
                          if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }
                        } catch (e) {
                          addNotif("error", "Activation failed: " + e.message);
                        }
                      }
                      } finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                    }}
                      style={{ background: T.acS, border: "1px solid " + T.ac, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.ac, cursor: "pointer" }}>Activate</button>
                  )}
                  
                  {/* Select Sections for multi-section materials where all inactive */}
                  {allSkipped && !isProcessing && chunks.length > 1 && (
                    <button onClick={() => {
                      var allChunkIds = new Set(chunks.map(c => c.id));
                      setChunkPicker({ courseId: active.id, materials: [mat], selectedChunks: allChunkIds, mode: "activate" });
                    }}
                      style={{ background: T.acS, border: "1px solid " + T.ac, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.ac, cursor: "pointer" }}>Select Sections</button>
                  )}
                  
                  {/* Edit Sections for multi-section materials with mixed states */}
                  {!allSkipped && !allExtracted && !isProcessing && chunks.length > 1 && (
                    <button onClick={() => {
                      var inactiveChunkIds = new Set(chunks.filter(c => c.status === "skipped" || c.status === "failed").map(c => c.id));
                      setChunkPicker({ courseId: active.id, materials: [mat], selectedChunks: inactiveChunkIds, mode: "activate" });
                    }}
                      style={{ background: "transparent", border: "1px solid " + T.ac, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.ac, cursor: "pointer" }}>Edit Sections</button>
                  )}
                  {(() => {
                    // Check if any failed chunks have been retried too many times
                    const failedChunks = chunks.filter(c => c.status === "failed");
                    const retriableChunks = failedChunks.filter(c => (c.failCount || 0) < 2);
                    const permanentlyFailed = failedChunks.filter(c => (c.failCount || 0) >= 2);
                    
                    return (
                      <>
                        {retriableChunks.length > 0 && !isProcessing && (
                          <button onClick={async () => {
                            if (globalLock) return;
                            setGlobalLock({ message: "Retrying failed extractions..." });
                            setProcessingMatId(mat.id);
                            setBusy(true);
                            setStatus("Starting retry...");
                            extractionCancelledRef.current = false;
                            try {
                              await extractSkillTree(active.id, active.materials, setStatus, true, addNotif, extractionCancelledRef, (err) => setExtractionErrors(p => [...p, err].slice(-10)), setProcessingMatId);
                              var refreshed = await DB.getCourses();
                              var updatedCourse = refreshed.find(c => c.id === active.id);
                              if (updatedCourse) { setCourses(refreshed); setActive(updatedCourse); }
                              addNotif("success", "Retry complete.");
                            } catch (e) { addNotif("error", "Retry failed: " + e.message); }
                            finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                          }}
                            style={{ background: "transparent", border: "1px solid #F59E0B", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "#F59E0B", cursor: "pointer" }}>
                            Retry ({retriableChunks.length})
                          </button>
                        )}
                        {permanentlyFailed.length > 0 && !isProcessing && (
                          <button onClick={() => setErrorLogModal({ mat, chunks: permanentlyFailed })}
                            style={{ background: "transparent", border: "1px solid " + T.rd, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.rd, cursor: "pointer" }}>
                            Log Error ({permanentlyFailed.length})
                          </button>
                        )}
                      </>
                    );
                  })()}
                  {!isProcessing && (
                    <button onClick={() => {
                      if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                      else setPendingConfirm({ type: "removeMat", id: mat.id });
                    }}
                      style={{ background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.rd, cursor: "pointer" }}>
                      {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                    </button>
                  )}
                </div>
              </div>
              {/* Chunk list - for multi-section materials, just show status */}
              {chunks.length > 1 && (
                <div style={{ borderTop: "1px solid " + T.bd, maxHeight: 250, overflowY: "auto" }}>
                  {chunks.map((ch, ci) => {
                    var statusColor = ch.status === "extracted" ? T.gn : ch.status === "failed" ? "#F59E0B" : ch.status === "skipped" ? T.txM : T.ac;
                    var statusIcon = ch.status === "extracted" ? "\u2713" : ch.status === "failed" ? "\u2717" : ch.status === "skipped" ? "\u2013" : "\u25CB";
                    var statusLabel = ch.status === "extracted" ? "active" : ch.status === "failed" ? "failed" : ch.status === "skipped" ? "inactive" : "activating";
                    return (
                      <div key={ci} style={{ padding: "8px 14px 8px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: ci < chunks.length - 1 ? "1px solid " + T.bg : "none", fontSize: 12 }}>
                        <span style={{ color: statusColor, fontWeight: 600, width: 16, textAlign: "center" }}>{statusIcon}</span>
                        <span style={{ color: ch.status === "skipped" ? T.txM : T.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.label}</span>
                        <span style={{ color: T.txD, fontSize: 11, marginRight: 8 }}>{(ch.charCount || 0).toLocaleString()}</span>
                        <span style={{ fontSize: 10, color: statusColor }}>{statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        
        {/* Chunk Picker Modal - Unified Activate/Deactivate interface */}
        {chunkPicker && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: T.sf, borderRadius: 16, padding: 24, maxWidth: 500, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
              
              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button 
                  onClick={() => {
                    // Switch to activate mode - pre-select inactive chunks
                    var mat = chunkPicker.materials[0];
                    var inactiveIds = new Set((mat.chunks || []).filter(c => c.status === "skipped" || c.status === "failed").map(c => c.id));
                    setChunkPicker(prev => ({ ...prev, mode: "activate", selectedChunks: inactiveIds }));
                  }}
                  style={{ 
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", 
                    background: (chunkPicker.mode || "activate") === "activate" ? T.ac : T.bg, 
                    color: (chunkPicker.mode || "activate") === "activate" ? "#0F1115" : T.txD, 
                    cursor: "pointer", fontWeight: 600, fontSize: 14 
                  }}>
                  Activate
                </button>
                <button 
                  onClick={() => {
                    // Switch to deactivate mode - pre-select active chunks
                    var mat = chunkPicker.materials[0];
                    var activeIds = new Set((mat.chunks || []).filter(c => c.status === "extracted").map(c => c.id));
                    setChunkPicker(prev => ({ ...prev, mode: "deactivate", selectedChunks: activeIds }));
                  }}
                  style={{ 
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", 
                    background: chunkPicker.mode === "deactivate" ? T.rd : T.bg, 
                    color: chunkPicker.mode === "deactivate" ? "#fff" : T.txD, 
                    cursor: "pointer", fontWeight: 600, fontSize: 14 
                  }}>
                  Deactivate
                </button>
              </div>
              
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>
                {(chunkPicker.mode || "activate") === "activate" 
                  ? "Select sections to add to your curriculum" 
                  : "Select sections to remove from your curriculum"}
              </div>
              
              {chunkPicker.materials.map((mat, mi) => {
                const mode = chunkPicker.mode || "activate";
                const relevantChunks = mode === "activate" 
                  ? (mat.chunks || []).filter(c => c.status === "skipped" || c.status === "failed")
                  : (mat.chunks || []).filter(c => c.status === "extracted");
                
                if (relevantChunks.length === 0) {
                  return (
                    <div key={mi} style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>
                      {mode === "activate" ? "All sections are already active" : "No active sections to deactivate"}
                    </div>
                  );
                }
                
                return (
                <div key={mi} style={{ marginBottom: 12, background: T.bg, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: 12, borderBottom: "1px solid " + T.bd, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{mat.name}</span>
                    {relevantChunks.length > 1 && (
                      <button onClick={() => {
                        var relevantIds = relevantChunks.map(c => c.id);
                        var allSelected = relevantIds.every(id => chunkPicker.selectedChunks.has(id));
                        setChunkPicker(prev => {
                          var next = new Set(prev.selectedChunks);
                          relevantIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                          return { ...prev, selectedChunks: next };
                        });
                      }} style={{ background: "none", border: "none", color: mode === "activate" ? T.ac : T.rd, cursor: "pointer", fontSize: 11 }}>
                        {relevantChunks.every(c => chunkPicker.selectedChunks.has(c.id)) ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                  {relevantChunks.map((ch, ci) => {
                    const isSelected = chunkPicker.selectedChunks.has(ch.id);
                    return (
                      <label key={ci} style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 10, 
                        padding: "8px 12px", 
                        cursor: "pointer", 
                        borderBottom: ci < relevantChunks.length - 1 ? "1px solid " + T.sf : "none",
                        background: "transparent"
                      }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => {
                            setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                              return { ...prev, selectedChunks: next };
                            });
                          }}
                          style={{ accentColor: mode === "activate" ? T.ac : T.rd }} 
                        />
                        <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{ch.label}</span>
                        <span style={{ fontSize: 10, color: T.txD }}>{(ch.charCount || 0).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                );
              })}
              
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => setChunkPicker(null)} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.bd, background: "transparent", color: T.txD, cursor: "pointer", fontSize: 14 }}>Cancel</button>
                
                {(chunkPicker.mode || "activate") === "activate" ? (
                  <button onClick={() => runExtraction(chunkPicker.selectedChunks)} disabled={chunkPicker.selectedChunks.size === 0}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: chunkPicker.selectedChunks.size > 0 ? T.ac : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#0F1115" : T.txD, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default", fontWeight: 600, fontSize: 14 }}>
                    Activate ({chunkPicker.selectedChunks.size})
                  </button>
                ) : (
                  <button 
                    onClick={async () => {
                      if (chunkPicker.selectedChunks.size === 0) return;
                      var mat = chunkPicker.materials[0];
                      var selectedIds = chunkPicker.selectedChunks;
                      
                      // Mark selected chunks as skipped
                      var updatedMats = active.materials.map(m => m.id !== mat.id ? m : {
                        ...m,
                        chunks: m.chunks.map(c => selectedIds.has(c.id) ? { ...c, status: "skipped" } : c)
                      });
                      var updatedCourse = { ...active, materials: updatedMats };
                      var allCourses = await DB.getCourses();
                      allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                      await DB.saveCourses(allCourses);
                      setCourses(allCourses); setActive(updatedCourse);
                      
                      // Prune skills from deactivated chunks
                      var deactivatedLabels = mat.chunks.filter(c => selectedIds.has(c.id)).map(c => c.label.toLowerCase());
                      var existingSkills = await DB.getSkills(active.id) || [];
                      var pruned = existingSkills.filter(s => {
                        if (!s.sources || s.sources.length === 0) return true;
                        var remaining = s.sources.filter(src => {
                          var srcLower = src.toLowerCase();
                          return !deactivatedLabels.some(label => srcLower.includes(label.substring(0, 30)));
                        });
                        if (remaining.length > 0) {
                          s.sources = remaining;
                          return true;
                        }
                        return false;
                      });
                      var prunedCount = existingSkills.length - pruned.length;
                      await DB.saveSkills(active.id, pruned);
                      
                      setChunkPicker(null);
                      addNotif("success", "Deactivated " + selectedIds.size + " section(s)." + (prunedCount > 0 ? " " + prunedCount + " skills removed." : ""));
                    }} 
                    disabled={chunkPicker.selectedChunks.size === 0}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: chunkPicker.selectedChunks.size > 0 ? T.rd : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#fff" : T.txD, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default", fontWeight: 600, fontSize: 14 }}>
                    Deactivate ({chunkPicker.selectedChunks.size})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Error Log Modal */}
        {errorLogModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: T.sf, borderRadius: 16, padding: 24, maxWidth: 600, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.rd }}>Extraction Failed</div>
                <button onClick={() => setErrorLogModal(null)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 18 }}>&times;</button>
              </div>
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>
                These sections failed to extract after multiple attempts. Copy the error details below to report the issue.
              </div>
              <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>Material: {errorLogModal.mat.name}</div>
              
              {errorLogModal.chunks.map((ch, i) => (
                <div key={i} style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid " + T.rd }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 8 }}>{ch.label}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>Failed {ch.failCount || 0} time(s)</div>
                  {ch.lastError && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: T.rd, marginBottom: 4 }}>Error: {ch.lastError.error}</div>
                      {ch.lastError.debugInfo && (
                        <pre style={{ 
                          background: "#1a1a1a", 
                          padding: 10, 
                          borderRadius: 6, 
                          fontSize: 10, 
                          color: "#ccc", 
                          overflow: "auto", 
                          maxHeight: 150,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all"
                        }}>
                          {typeof ch.lastError.debugInfo === "string" 
                            ? ch.lastError.debugInfo 
                            : JSON.stringify(ch.lastError.debugInfo, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button onClick={() => {
                  // Copy all error info to clipboard
                  const errorData = {
                    material: errorLogModal.mat.name,
                    materialId: errorLogModal.mat.id,
                    chunks: errorLogModal.chunks.map(ch => ({
                      label: ch.label,
                      chunkId: ch.id,
                      failCount: ch.failCount,
                      error: ch.lastError?.error,
                      debugInfo: ch.lastError?.debugInfo,
                      charCount: ch.charCount
                    }))
                  };
                  navigator.clipboard.writeText(JSON.stringify(errorData, null, 2));
                  addNotif("success", "Error details copied to clipboard");
                }}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid " + T.ac, background: T.acS, color: T.ac, cursor: "pointer", fontWeight: 600 }}>
                  Copy Error Details
                </button>
                <button onClick={() => setErrorLogModal(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid " + T.bd, background: "transparent", color: T.txD, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );

  // --- SKILLS SCREEN ---
  if (screen === "skills" && active) return (<>
    {globalLock && lockOverlay}
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 650, margin: "0 auto" }}>
        <button onClick={() => setScreen("manage")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Skills</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 24 }}>{active.name}</p>

        {/* Re-index button */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
          <button disabled={!!globalLock} onClick={async () => {
            if (globalLock) return;
            setGlobalLock({ message: "Re-indexing activated materials..." });
            setBusy(true); setStatus("Scanning chunks for missing skills...");
            extractionCancelledRef.current = false;
            try {
              // Smart check: find activated chunks that have no saved skills in DB
              var matsToReindex = [];
              var resetCount = 0;
              for (var mat of (active.materials || [])) {
                var chunks = mat.chunks || [];
                var needsWork = false;
                var updatedChunks = [];
                for (var ch of chunks) {
                  if (ch.status === "skipped") { updatedChunks.push(ch); continue; }
                  // Check if this chunk actually has skills saved
                  var chunkSkills = await DB.getChunkSkills(active.id, ch.id);
                  if (!chunkSkills || !Array.isArray(chunkSkills) || chunkSkills.length === 0) {
                    // No skills for this chunk — reset to pending so extraction picks it up
                    updatedChunks.push({ ...ch, status: "pending" });
                    needsWork = true;
                    resetCount++;
                  } else {
                    updatedChunks.push(ch);
                  }
                }
                matsToReindex.push({ ...mat, chunks: updatedChunks });
              }

              if (resetCount === 0) {
                // All activated chunks already have skills — just rebuild the merged tree from chunk skills
                setStatus("All sections extracted. Rebuilding skill tree...");
                var allSkills = [];
                for (var mat2 of (active.materials || [])) {
                  for (var ch2 of (mat2.chunks || [])) {
                    if (ch2.status === "skipped") continue;
                    var cs = await DB.getChunkSkills(active.id, ch2.id);
                    if (Array.isArray(cs)) allSkills.push(...cs);
                  }
                }
                // Deduplicate by id
                var seen = {};
                allSkills = allSkills.filter(s => { if (seen[s.id]) return false; seen[s.id] = true; return true; });
                await DB.saveSkills(active.id, allSkills);
                var sk0 = allSkills;
                var rt0 = await DB.getRefTaxonomy(active.id);
                setSkillViewData({ skills: sk0, refTax: rt0 });
                addNotif("success", "Skill tree rebuilt from existing data. " + sk0.length + " skills.");
              } else {
                // Save reset statuses and run extraction
                setStatus("Extracting " + resetCount + " section(s)...");
                var updatedCourse = { ...active, materials: matsToReindex };
                var allCourses = await DB.getCourses();
                allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                await DB.saveCourses(allCourses);
                setCourses(allCourses); setActive(updatedCourse);

                var skills = await extractSkillTree(active.id, matsToReindex, setStatus, false, addNotif, extractionCancelledRef,
                  (err) => {
                    setExtractionErrors(p => [...p, err].slice(-10));
                    if (err.error && /401|403|authentication|unauthorized|invalid.*key/i.test(err.error)) {
                      addNotif("error", "API key is invalid or expired. Go to Settings to update it.");
                    }
                  }, setProcessingMatId);
                if (Array.isArray(skills) && skills.length > 0) {
                  try {
                    var validation = await validateSkillTree(active.id, skills, setStatus);
                    skills = validation.skills;
                  } catch (e) { console.error("Validation failed:", e); }
                }
                var refreshed = await DB.getCourses();
                var rc = refreshed.find(c => c.id === active.id);
                if (rc) { setCourses(refreshed); setActive(rc); }
                var sk = await DB.getSkills(active.id) || [];
                var rt = await DB.getRefTaxonomy(active.id);
                setSkillViewData({ skills: sk, refTax: rt });
                addNotif("success", "Re-index complete. " + sk.length + " skills from " + resetCount + " section(s).");
              }
            } catch (e) {
              console.error("Re-index failed:", e);
              addNotif("error", "Re-index failed: " + e.message);
            } finally {
              setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null);
            }
          }}
            style={{ padding: "8px 16px", background: T.acS, border: "1px solid " + T.ac, borderRadius: 8, color: T.ac, cursor: globalLock ? "default" : "pointer", fontSize: 13, fontWeight: 600, opacity: globalLock ? 0.5 : 1 }}>
            Re-index
          </button>
        </div>

        {/* Reference Taxonomy */}
        {skillViewData?.refTax && (
          <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ac }}>{skillViewData.refTax.subject || "Unknown Subject"}</div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>Level: {skillViewData.refTax.level || "?"} | Confidence: {skillViewData.refTax.confidence || "?"}%</div>
          </div>
        )}
        
        {/* Skills by Category */}
        {(() => {
          var skills = skillViewData?.skills || [];
          if (!skills.length) return <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No skills yet. Activate sections from your materials to build your skill tree.</div>;
          
          var cats = {};
          for (var s of skills) {
            var cat = s.category || "Uncategorized";
            if (!cats[cat]) cats[cat] = [];
            cats[cat].push(s);
          }
          var catEntries = Object.entries(cats).sort((a, b) => b[1].length - a[1].length);
          
          return (
            <div>
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>{skills.length} skills across {catEntries.length} categories</div>
              {catEntries.map(([cat, catSkills]) => {
                var isExpanded = expandedCats[cat];
                return (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <button onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                      style={{ width: "100%", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{isExpanded ? "▾" : "▸"} {cat}</span>
                      <span style={{ fontSize: 12, color: T.txD }}>{catSkills.length}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ marginTop: 8, marginLeft: 16 }}>
                        {catSkills.map(s => (
                          <div key={s.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{s.name}</div>
                              <span style={{ fontSize: 10, color: T.txM, background: T.bg, padding: "2px 8px", borderRadius: 4 }}>{s.id}</span>
                            </div>
                            {s.description && <div style={{ fontSize: 13, color: T.txD, marginBottom: 8 }}>{s.description}</div>}
                            {s.prerequisites && s.prerequisites.length > 0 && (
                              <div style={{ fontSize: 12, color: T.txD, marginBottom: 4 }}>Prerequisites: {s.prerequisites.join(", ")}</div>
                            )}
                            {s.sources && s.sources.length > 0 && (
                              <div style={{ fontSize: 11, color: T.txM }}>Sources: {s.sources.slice(0, 3).join(", ")}{s.sources.length > 3 ? "..." : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  </>);

  // --- NOTIFICATIONS SCREEN ---
  if (screen === "notifs" && active) return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <button onClick={() => setScreen("study")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Notifications</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 24 }}>{active.name}</p>
        
        {/* Extraction Errors */}
        {extractionErrors.length > 0 && (
          <div style={{ background: T.sf, border: "1px solid " + (T.rd || "#EF4444"), borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.rd || "#EF4444" }}>Extraction Errors ({extractionErrors.length})</div>
              <button onClick={() => setExtractionErrors([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11 }}>Clear</button>
            </div>
            {extractionErrors.map((err, i) => (
              <div key={i} style={{ padding: 10, background: T.bg, borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: T.tx, marginBottom: 4 }}>{err.label}</div>
                <div style={{ fontSize: 11, color: T.rd || "#EF4444" }}>{err.error}</div>
              </div>
            ))}
          </div>
        )}
        
        {/* Notifications */}
        {notifs.length === 0 ? (
          <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No notifications yet</div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.txD }}>{notifs.length} notifications</div>
              <button onClick={() => setNotifs([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 12 }}>Clear all</button>
            </div>
            {notifs.slice().reverse().map(n => (
              <div key={n.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 14, marginBottom: 8, display: "flex", gap: 12 }}>
                <span style={{ fontSize: 16, color: n.type === "error" ? T.rd : n.type === "skill" ? T.gn : n.type === "warn" ? "#F59E0B" : T.ac }}>
                  {n.type === "error" ? "✕" : n.type === "skill" ? "+" : n.type === "warn" ? "⚠" : "✓"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: T.tx }}>{n.msg}</div>
                  <div style={{ fontSize: 11, color: T.txM, marginTop: 4 }}>{n.time.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // --- STUDY / CHAT SCREEN ---


  if (screen === "study" && active) {
    return (
      <>
      {globalLock && lockOverlay}
      <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{CSS}</style>
        {/* Simple header - just back button */}
        <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button onClick={async () => { await saveSessionToJournal(); setScreen("courses"); setMsgs([]); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null); setShowSkills(false); setSkillViewData(null); sessionStartIdx.current = 0; sessionSkillLog.current = []; cachedSessionCtx.current = null; }}
            style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14 }}>&lt; Back to courses</button>
        </div>

        {/* Materials Panel (includes Add functionality) */}
        {showManage && (
          <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0, maxHeight: "50vh", overflowY: "auto" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              
              {/* Add Materials Section */}
              <div style={{ marginBottom: 16 }}>
                <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
                  style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 12, padding: "16px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent" }}>
                  <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
                  <div style={{ fontSize: 13, color: T.txD }}>+ Add materials (drop or click)</div>
                </div>
                {files.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {files.map(f => (
                      <div key={f.id} style={{ background: T.bg, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: T.tx }}>{f.name}</span>
                          <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer" }}>x</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {CLS.map(c => <button key={c.v} onClick={() => classify(f.id, c.v)}
                            style={{ background: f.classification === c.v ? T.acS : "transparent", border: "1px solid " + (f.classification === c.v ? T.ac : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: f.classification === c.v ? T.ac : T.txD, cursor: "pointer" }}>{c.l}</button>)}
                        </div>
                      </div>
                    ))}
                    {files.every(f => f.classification) && (
                      <button onClick={addMats} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add Materials</button>
                    )}
                  </div>
                )}
              </div>

              {/* Existing Materials List */}
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>Course Materials ({active.materials.length})</div>
              
              {/* Extraction progress indicator */}
              {processingMatId && (
                <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: T.ac, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: T.ac, fontWeight: 600 }}>Extracting skills...</div>
                    <div style={{ fontSize: 11, color: T.txD, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</div>
                  </div>
                  <button onClick={() => { extractionCancelledRef.current = true; }}
                    style={{ padding: "4px 10px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 11, color: T.txD, cursor: "pointer", flexShrink: 0 }}>
                    Stop
                  </button>
                </div>
              )}
              
              {active.materials.map(mat => {
                const clsLabel = CLS.find(c => c.v === mat.classification)?.l || mat.classification;
                const chunks = mat.chunks || [];
                const extracted = chunks.filter(c => c.status === "extracted").length;
                const failed = chunks.filter(c => c.status === "failed").length;
                const skipped = chunks.filter(c => c.status === "skipped").length;
                const pending = chunks.filter(c => c.status === "pending").length;
                const hasMultiChunk = chunks.length > 1;
                const isProcessing = processingMatId === mat.id;

                return (
                  <div key={mat.id} style={{ background: T.bg, borderRadius: 10, marginBottom: 8, overflow: "hidden", border: isProcessing ? "1px solid " + T.ac : "none" }}>
                    {/* Material header */}
                    <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clsLabel}: {mat.name}</div>
                        <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {chunks.length > 0 && <span>{chunks.length} section{chunks.length !== 1 ? "s" : ""}</span>}
                          {extracted > 0 && <span style={{ color: T.gn }}>{extracted} active</span>}
                          {failed > 0 && <span style={{ color: "#F59E0B" }}>{failed} failed</span>}
                          {skipped > 0 && <span style={{ color: T.txD }}>{skipped} inactive</span>}
                          {pending > 0 && isProcessing && <span style={{ color: T.ac }}>{pending} extracting...</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {failed > 0 && (
                          <button onClick={async () => {
                            if (globalLock) return;
                            setGlobalLock({ message: "Retrying " + failed + " failed chunk(s)..." });
                            setBusy(true);
                            setStatus("Retrying " + failed + " failed chunk(s)...");
                            extractionCancelledRef.current = false;
                            try {
                              var skills = await extractSkillTree(active.id, active.materials, setStatus, true, addNotif, extractionCancelledRef,
                                (err) => setExtractionErrors(p => [...p, err].slice(-10)), setProcessingMatId);
                              var refreshed = await DB.getCourses();
                              var updatedCourse = refreshed.find(c => c.id === active.id);
                              if (updatedCourse) { setCourses(refreshed); setActive(updatedCourse); }
                              addNotif("success", "Retry complete. " + (Array.isArray(skills) ? skills.length + " total skills." : "Check results."));
                            } catch (e) {
                              addNotif("error", "Retry failed: " + e.message);
                            } finally { setGlobalLock(null); setBusy(false); setStatus(""); }
                          }} disabled={globalLock}
                            style={{ background: "none", border: "1px solid #F59E0B", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#F59E0B", cursor: globalLock ? "default" : "pointer" }}>Retry failed</button>
                        )}
                        <button onClick={() => {
                            if (busy) return;
                            if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                            else setPendingConfirm({ type: "removeMat", id: mat.id });
                          }} disabled={busy}
                          style={{ background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: T.rd, cursor: busy ? "default" : "pointer" }}>
                          {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                        </button>
                      </div>
                    </div>
                    {/* Chunk list for multi-chunk materials */}
                    {hasMultiChunk && (
                      <div style={{ borderTop: "1px solid " + T.bd, maxHeight: 200, overflowY: "auto" }}>
                        {chunks.map((ch, ci) => {
                          var statusColor = ch.status === "extracted" ? T.gn : ch.status === "failed" ? "#F59E0B" : ch.status === "skipped" ? T.txD : T.ac;

                          var statusIcon = ch.status === "extracted" ? "\u2713" : ch.status === "failed" ? "\u2717" : ch.status === "skipped" ? "\u2013" : "\u25CB";
                          return (
                            <div key={ci} style={{ padding: "6px 12px 6px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: ci < chunks.length - 1 ? "1px solid " + T.bg : "none", fontSize: 12 }}>
                              <span style={{ color: statusColor, fontWeight: 600, width: 14, textAlign: "center", flexShrink: 0 }}>{statusIcon}</span>
                              <span style={{ color: ch.status === "skipped" ? T.txD : T.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: ch.status === "skipped" ? "italic" : "normal" }}>{ch.label}</span>
                              <span style={{ color: T.txD, flexShrink: 0 }}>{(ch.charCount || 0).toLocaleString()}</span>
                              {ch.status === "skipped" && (
                                <button onClick={async () => {
                                  if (busy || globalLock) return;
                                  // Re-enable and immediately extract this chunk
                                  var updatedMats = active.materials.map(m => m.id !== mat.id ? m : { ...m, chunks: m.chunks.map(c => c.id === ch.id ? { ...c, status: "pending" } : c) });
                                  var updatedCourse = { ...active, materials: updatedMats };
                                  var allCourses = await DB.getCourses();
                                  allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                                  await DB.saveCourses(allCourses);
                                  setCourses(allCourses); setActive(updatedCourse);
                                  // Trigger extraction
                                  setGlobalLock({ message: "Extracting " + ch.label + "..." });
                                  setProcessingMatId(mat.id);
                                  setBusy(true);
                                  extractionCancelledRef.current = false;
                                  try {
                                    var matToExtract = { ...mat, chunks: [{ ...ch, status: "pending" }] };
                                    await extractSkillTree(active.id, [matToExtract], setStatus, false, addNotif, extractionCancelledRef,
                                      (err) => setExtractionErrors(p => [...p, err].slice(-10)), setProcessingMatId);
                                    var refreshed = await DB.getCourses();
                                    var refreshedCourse = refreshed.find(c => c.id === active.id);
                                    if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }
                                  } catch (e) { addNotif("error", "Extraction failed: " + e.message); }
                                  finally { setGlobalLock(null); setBusy(false); setStatus(""); setProcessingMatId(null); }
                                }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, padding: 0 }}>enable</button>
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
          </div>
        )}

        {/* Skills Viewer Panel */}
        {showSkills && skillViewData && (
          <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0, maxHeight: "60vh", overflowY: "auto" }}>
            <div style={{ maxWidth: 650, margin: "0 auto" }}>
              {/* Header with ref taxonomy info */}
              {skillViewData.refTax && (
                <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12 }}>
                  <span style={{ color: T.ac, fontWeight: 600 }}>{skillViewData.refTax.subject || "Unknown"}</span>
                  <span style={{ color: T.txD }}> | {skillViewData.refTax.level || "?"} | confidence: {skillViewData.refTax.confidence || "?"}%</span>
                  {skillViewData.refTax.flags && skillViewData.refTax.flags.length > 0 && (
                    <div style={{ color: "#F59E0B", marginTop: 4 }}>{skillViewData.refTax.flags.join(" | ")}</div>
                  )}
                </div>
              )}

              {/* Validation report summary */}
              {skillViewData.report && skillViewData.report.status !== "parse_failed" && skillViewData.report.status !== "error" && (
                <div style={{ marginBottom: 14 }}>
                  {(() => {
                    var r = skillViewData.report;
                    var pf = r.prerequisiteFixes?.length || 0;
                    var df = r.descriptionFixes?.length || 0;
                    var md = r.mergedDuplicates?.length || 0;
                    var cg = r.coverageGaps?.length || 0;
                    var total = pf + df + md;
                    if (total === 0 && cg === 0 && (!r.warnings || r.warnings.length === 0)) return (
                      <div style={{ fontSize: 12, color: T.gn, background: T.gnS, borderRadius: 8, padding: "8px 12px" }}>Validation: no issues found.</div>
                    );
                    return (
                      <div style={{ background: T.bg, borderRadius: 10, overflow: "hidden", border: "1px solid " + T.bd }}>
                        <div style={{ padding: "8px 12px", fontSize: 12, color: T.tx, fontWeight: 600, borderBottom: "1px solid " + T.bd }}>
                          Validation: {total} fix{total !== 1 ? "es" : ""} applied{cg > 0 ? ", " + cg + " gap" + (cg !== 1 ? "s" : "") + " noted" : ""}
                        </div>
                        {pf > 0 && r.prerequisiteFixes.map((f, i) => (
                          <div key={"pf" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: T.ac }}>prereq</span> <span style={{ color: T.txD }}>{f.skillId}:</span> <span style={{ color: T.tx }}>{f.fix}</span>
                          </div>
                        ))}
                        {df > 0 && r.descriptionFixes.map((f, i) => (
                          <div key={"df" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: "#8B5CF6" }}>desc</span> <span style={{ color: T.txD }}>{f.skillId}:</span> <span style={{ color: T.tx }}>{f.after}</span>
                          </div>
                        ))}
                        {md > 0 && r.mergedDuplicates.map((f, i) => (
                          <div key={"md" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: "#F59E0B" }}>merged</span> <span style={{ color: T.txD }}>{f.removed} into {f.kept}:</span> <span style={{ color: T.tx }}>{f.reason}</span>
                          </div>
                        ))}
                        {cg > 0 && r.coverageGaps.map((f, i) => (
                          <div key={"cg" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: T.rd }}>gap</span> <span style={{ color: T.tx }}>{f.missingTopic}:</span> <span style={{ color: T.txD }}>{f.reason}</span>
                          </div>
                        ))}
                        {r.warnings && r.warnings.map((w, i) => (
                          <div key={"w" + i} style={{ padding: "6px 12px", fontSize: 11, color: T.txD }}>{w}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Skills list - collapsible by category */}
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                Skills ({skillViewData.skills.length})
              </div>

              {(() => {
                // Group by category
                var cats = {};
                for (var s of skillViewData.skills) {
                  var cat = s.category || "Uncategorized";
                  if (!cats[cat]) cats[cat] = [];
                  cats[cat].push(s);
                }
                var catEntries = Object.entries(cats).sort((a, b) => b[1].length - a[1].length);
                
                return catEntries.map(([cat, skills]) => {
                  // Calculate category progress (placeholder - would use profile data)
                  var isExpanded = expandedCats[cat];
                  
                  return (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      {/* Category header - clickable */}
                      <div 
                        onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "space-between",
                          padding: "10px 12px", 
                          background: T.bg, 
                          borderRadius: isExpanded ? "8px 8px 0 0" : 8, 
                          border: "1px solid " + T.bd,
                          borderBottom: isExpanded ? "none" : "1px solid " + T.bd,
                          cursor: "pointer",
                          transition: "background 0.15s"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: T.txD }}>{isExpanded ? "v" : ">"}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{cat}</span>
                          <span style={{ fontSize: 11, color: T.txD }}>({skills.length} skill{skills.length !== 1 ? "s" : ""})</span>
                        </div>
                      </div>
                      
                      {/* Expanded skills list */}
                      {isExpanded && (
                        <div style={{ 
                          border: "1px solid " + T.bd, 
                          borderTop: "none", 
                          borderRadius: "0 0 8px 8px",
                          padding: 8,
                          background: T.sf
                        }}>
                          {skills.map(sk => (
                            <div key={sk.id} style={{ background: T.bg, borderRadius: 8, padding: "8px 12px", marginBottom: 4, border: "1px solid " + T.bd }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, color: T.tx, fontWeight: 500 }}>
                                    {sk.name}
                                    {sk.refMatch && <span style={{ fontSize: 10, color: T.gn, marginLeft: 6, fontWeight: 400 }}>ref</span>}
                                    {sk.refMatch === false && <span style={{ fontSize: 10, color: "#F59E0B", marginLeft: 6, fontWeight: 400 }}>custom</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{sk.description}</div>
                                  {sk.prerequisites && sk.prerequisites.length > 0 && (
                                    <div style={{ fontSize: 10, color: T.txD, marginTop: 3 }}>
                                      requires: {sk.prerequisites.map(p => {
                                        var dep = skillViewData.skills.find(s => s.id === p);
                                        return dep ? dep.name : p;
                                      }).join(", ")}
                                    </div>
                                  )}
                                  {sk.sources && sk.sources.length > 0 && (
                                    <div style={{ fontSize: 10, color: T.txD, marginTop: 2 }}>from: {sk.sources.join(", ")}</div>
                                  )}
                                </div>
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  if (busy) return;
                                  setBusy(true); setStatus("Re-examining " + sk.name + "...");
                                  try {
                                    var refTax = await DB.getRefTaxonomy(active.id);
                                    var refCtx = refTax && refTax.taxonomy ? "\n\nREFERENCE TAXONOMY CONTEXT:\n" + JSON.stringify(refTax.taxonomy.filter(t => t.refId === sk.refId || t.category === sk.category).slice(0, 10), null, 1) : "";
                                    var flagPrompt = "A student flagged this skill as potentially incorrect in their course skill tree.\n\nFLAGGED SKILL:\n" + JSON.stringify(sk, null, 2) + "\n\nFULL SKILL TREE CONTEXT (nearby skills):\n" + JSON.stringify(skillViewData.skills.filter(s => s.category === sk.category || (sk.prerequisites && sk.prerequisites.includes(s.id)) || (s.prerequisites && s.prerequisites.includes(sk.id))).slice(0, 15), null, 1) + refCtx + "\n\nRe-examine this skill. Check:\n1. Is the name accurate for what the source material actually teaches?\n2. Is the description specific and testable?\n3. Are the prerequisites correct and complete?\n4. Is it categorized correctly?\n5. Should it be split into multiple skills or merged with another?\n\nRespond with ONLY a JSON object:\n{\n  \"action\": \"keep|modify|split|merge\",\n  \"explanation\": \"why this action\",\n  \"correctedSkill\": { ...the skill with any fixes applied... },\n  \"splitInto\": [ ...if splitting, the new skills... ]\n}";
                                    var result = await callClaude(flagPrompt, [{ role: "user", content: "Re-examine this flagged skill." }], 4096);
                                    var parsed = extractJSON(result);
                                    if (parsed && parsed.correctedSkill) {
                                      var allSkills = await DB.getSkills(active.id) || [];
                                      if (parsed.action === "split" && parsed.splitInto && parsed.splitInto.length > 0) {
                                        allSkills = allSkills.filter(s => s.id !== sk.id).concat(parsed.splitInto);
                                      } else if (parsed.action === "merge") {
                                        allSkills = allSkills.map(s => s.id === sk.id ? parsed.correctedSkill : s);
                                      } else {
                                        allSkills = allSkills.map(s => s.id === sk.id ? parsed.correctedSkill : s);
                                      }
                                      await DB.saveSkills(active.id, allSkills);
                                      setSkillViewData(prev => ({ ...prev, skills: allSkills }));
                                      addNotif("success", (parsed.action === "keep" ? "Reviewed: " : "Fixed: ") + sk.name);
                                    } else {
                                      addNotif("warn", "Couldn't parse re-examination result for " + sk.name + ".");
                                    }
                                  } catch (e) {
                                    addNotif("error", "Re-examination failed: " + e.message);
                                  }
                                  setBusy(false); setStatus("");
                                }} disabled={busy}
                                  title="Flag this skill for re-examination"
                                  style={{ background: "none", border: "1px solid " + T.bd, borderRadius: 6, padding: "3px 7px", fontSize: 10, color: T.txD, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>?</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Practice Mode View */}
        {practiceMode && !practiceMode.generating && practiceMode.set && (() => {
          var pm = practiceMode;
          var pset = pm.set;
          var tier = pset.currentTier;
          var tierInfo = TIERS[tier];
          var tierData = pset.tiers[tier];
          var currentAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
          var problems = currentAttempt?.problems || [];
          var curIdx = pm.currentProblemIdx;
          var problem = problems[curIdx];
          var passCount = problems.filter(p => p.passed === true).length;
          var answeredCount = problems.filter(p => p.passed !== null).length;

          return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Practice Header */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid " + T.bd, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{pm.skill.name}</div>
                  <div style={{ fontSize: 12, color: T.ac, fontWeight: 600 }}>Tier {tier}: {tierInfo.name}</div>
                </div>
                {/* Tier progress bar */}
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                  {[1,2,3,4,5,6].map(t => (
                    <div key={t} style={{ flex: 1, height: 4, borderRadius: 2, background: t < tier ? T.gn : t === tier ? T.ac : T.bd }} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.txD }}>
                  <span>Problem {curIdx + 1} of {problems.length}</span>
                  <span>Passed: {passCount}/{problems.length} (need 4)</span>
                </div>
              </div>

              {/* Tier Complete Screen */}
              {pm.tierComplete ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                  <div style={{ textAlign: "center", maxWidth: 400 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>{pm.tierComplete.advanced ? "OK" : "..."}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 8 }}>
                      {pm.tierComplete.advanced ? "Tier " + (tier - 1) + " Complete!" : "Not quite -- " + pm.tierComplete.passCount + "/5 passed"}
                    </div>
                    <div style={{ fontSize: 14, color: T.txD, marginBottom: 20 }}>
                      {pm.tierComplete.advanced
                        ? "+" + pm.tierComplete.points + " points (" + pm.tierComplete.rating + "). Moving to Tier " + tier + ": " + tierInfo.name + "."
                        : "You need 4/5 to advance. New problems will be generated for another attempt."}
                    </div>
                    {/* Problem results */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20, textAlign: "left" }}>
                      {(pm.tierComplete.problems || []).map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.sf }}>
                          <span style={{ color: p.passed ? T.gn : p.passed === false ? T.rd : T.txD, fontWeight: 600 }}>{p.passed ? "+" : p.passed === false ? "x" : "--"}</span>
                          <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{p.prompt.substring(0, 60)}{p.prompt.length > 60 ? "..." : ""}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={async () => {
                      if (pm.tierComplete.advanced) {
                        // Generate problems for new tier
                        setPracticeMode(prev => ({ ...prev, generating: true, tierComplete: null }));
                        try {
                          var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, pm.skill);
                          var updated = await generateProblems(pset, pm.skill, active.name, matCtx);
                          await DB.savePractice(active.id, pm.skill.id, updated);
                          setPracticeMode({ set: updated, skill: pm.skill, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                        } catch (e) {
                          addNotif("error", "Failed to generate next tier: " + e.message);
                          setPracticeMode(prev => ({ ...prev, generating: false }));
                        }
                      } else {
                        // Retry - generate new problems for same tier
                        setPracticeMode(prev => ({ ...prev, generating: true, tierComplete: null }));
                        try {
                          var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, pm.skill);
                          var updated = await generateProblems(pset, pm.skill, active.name, matCtx);
                          await DB.savePractice(active.id, pm.skill.id, updated);
                          setPracticeMode({ set: updated, skill: pm.skill, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                        } catch (e) {
                          addNotif("error", "Failed to generate retry problems: " + e.message);
                          setPracticeMode(prev => ({ ...prev, generating: false }));
                        }
                      }
                    }}
                      style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      {pm.tierComplete.advanced ? "Start Tier " + tier : "Try Again"}
                    </button>
                  </div>
                </div>
              ) : problem ? (
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                  <div style={{ maxWidth: 700, margin: "0 auto" }}>
                    {/* IES Rec 2: Worked Example (Tiers 1-3 only, before attempting problem) */}
                    {tier <= 3 && problem.workedExample && !problem.exampleViewed && problem.passed === null ? (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 12, background: T.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>1</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Study This Example First</div>
                        </div>
                        <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: T.ac, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Example Problem</div>
                          <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{problem.workedExample.problem}</div>
                          <div style={{ fontSize: 12, color: T.ac, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Solution</div>
                          <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap", fontFamily: "'SF Mono', 'Fira Code', monospace", background: "#1A1D24", padding: 12, borderRadius: 8 }}>{problem.workedExample.solution}</div>
                          <div style={{ fontSize: 12, color: T.txD, fontStyle: "italic", borderLeft: "2px solid " + T.ac, paddingLeft: 12 }}>{problem.workedExample.keyInsight}</div>
                        </div>
                        <button onClick={() => {
                          setPracticeMode(prev => {
                            var s = prev.set, t = s.currentTier;
                            var td = { ...s.tiers[t] };
                            var attempts = [...td.attempts];
                            var lastA = { ...attempts[attempts.length - 1] };
                            var probs = [...lastA.problems];
                            probs[prev.currentProblemIdx] = { ...probs[prev.currentProblemIdx], exampleViewed: true };
                            lastA.problems = probs;
                            attempts[attempts.length - 1] = lastA;
                            td.attempts = attempts;
                            return { ...prev, set: { ...s, tiers: { ...s.tiers, [t]: td } } };
                          });
                        }}
                          style={{ width: "100%", padding: "12px 24px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                          Got It - Show Me the Problem
                        </button>
                      </div>
                    ) : (
                      <div>
                        {/* Problem indicator for Tiers 1-3 after example */}
                        {tier <= 3 && problem.exampleViewed && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 12, background: T.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>2</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Now Try This One</div>
                          </div>
                        )}
                        {/* Problem prompt */}
                        <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{problem.prompt}</div>

                        {/* IES Rec 6a: Confidence Rating (before allowing answer) */}
                        {problem.confidenceRating === null && problem.passed === null && (
                          <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 12 }}>Before you start: How confident are you?</div>
                            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                              {[1, 2, 3, 4, 5].map(level => (
                                <button key={level} onClick={() => {
                                  setPracticeMode(prev => {
                                    var s = prev.set, t = s.currentTier;
                                    var td = { ...s.tiers[t] };
                                    var attempts = [...td.attempts];
                                    var lastA = { ...attempts[attempts.length - 1] };
                                    var probs = [...lastA.problems];
                                    probs[prev.currentProblemIdx] = { ...probs[prev.currentProblemIdx], confidenceRating: level };
                                    lastA.problems = probs;
                                    attempts[attempts.length - 1] = lastA;
                                    td.attempts = attempts;
                                    return { ...prev, set: { ...s, tiers: { ...s.tiers, [t]: td } } };
                                  });
                                }}
                                  style={{
                                    width: 48, height: 48, borderRadius: 8,
                                    border: "1px solid " + T.bd, background: T.bg,
                                    color: T.tx, fontSize: 16, fontWeight: 600, cursor: "pointer",
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                                  }}>
                                  <span>{level}</span>
                                  <span style={{ fontSize: 8, color: T.txD, marginTop: 2 }}>
                                    {level === 1 ? "Lost" : level === 2 ? "Shaky" : level === 3 ? "Maybe" : level === 4 ? "Good" : "Easy"}
                                  </span>
                                </button>
                              ))}
                            </div>
                            <div style={{ fontSize: 11, color: T.txD, textAlign: "center", marginTop: 8 }}>Rate before attempting - this helps calibrate your self-assessment</div>
                          </div>
                        )}

                        {/* Confidence shown after rating */}
                        {problem.confidenceRating !== null && problem.passed === null && (
                          <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>
                            Your confidence: {problem.confidenceRating}/5 ({["", "Lost", "Shaky", "Maybe", "Good", "Easy"][problem.confidenceRating]})
                          </div>
                        )}

                        {/* Code editor - disabled until confidence is rated */}
                        <textarea
                          value={problem.studentAnswer || (problem.starterCode || "")}
                          onChange={e => {
                            var val = e.target.value;
                            setPracticeMode(prev => {
                              var s = prev.set;
                              var t = s.currentTier;
                              var td = { ...s.tiers[t] };
                              var attempts = [...td.attempts];
                              var lastA = { ...attempts[attempts.length - 1] };
                              var probs = [...lastA.problems];
                              probs[prev.currentProblemIdx] = { ...probs[prev.currentProblemIdx], studentAnswer: val };
                              lastA.problems = probs;
                              attempts[attempts.length - 1] = lastA;
                              td.attempts = attempts;
                              var newTiers = { ...s.tiers, [t]: td };
                              return { ...prev, set: { ...s, tiers: newTiers } };
                            });
                          }}
                          disabled={problem.passed !== null || pm.evaluating || problem.confidenceRating === null}
                          onKeyDown={e => {
                            if (e.key === "Tab") {
                              e.preventDefault();
                              var ta = e.target;
                              var start = ta.selectionStart, end = ta.selectionEnd;
                              var val = (problem.studentAnswer || problem.starterCode || "");
                              var newVal = val.substring(0, start) + "  " + val.substring(end);
                              setPracticeMode(prev => {
                                var s = prev.set, t2 = s.currentTier;
                                var td2 = { ...s.tiers[t2] }; var atts = [...td2.attempts];
                                var la = { ...atts[atts.length - 1] }; var pr = [...la.problems];
                                pr[prev.currentProblemIdx] = { ...pr[prev.currentProblemIdx], studentAnswer: newVal };
                                la.problems = pr; atts[atts.length - 1] = la; td2.attempts = atts;
                                return { ...prev, set: { ...s, tiers: { ...s.tiers, [t2]: td2 } } };
                              });
                              setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
                            }
                          }}
                          style={{
                            width: "100%", minHeight: 220, maxHeight: 400, padding: 16,
                            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", fontSize: 13, lineHeight: 1.6,
                            background: "#1A1D24", color: problem.passed !== null ? T.txD : "#E8EAF0",
                            border: "1px solid " + (pm.feedback ? (problem.passed ? T.gn : T.rd) : T.bd),
                        borderRadius: 10, resize: "vertical", tabSize: 2
                      }}
                      placeholder={tier === 1 ? "Type the expected output..." : "Write your answer here..."}
                    />

                    {/* Action buttons */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <button onClick={() => {
                        var nextUnanswered = problems.findIndex((p, idx) => idx > curIdx && p.passed === null);
                        if (nextUnanswered < 0) nextUnanswered = problems.findIndex((p, idx) => idx !== curIdx && p.passed === null);
                        if (nextUnanswered >= 0) setPracticeMode(prev => ({ ...prev, currentProblemIdx: nextUnanswered, feedback: null }));
                      }}
                        disabled={problem.passed !== null || pm.evaluating}
                        style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid " + T.bd, background: T.sf, color: T.txD, fontSize: 12, cursor: "pointer" }}>Skip</button>

                      {problem.passed === null ? (
                        <button onClick={async () => {
                          var answer = problem.studentAnswer || problem.starterCode || "";
                          if (!answer.trim()) return;
                          setPracticeMode(prev => ({ ...prev, evaluating: true }));
                          try {
                            var result = await evaluateAnswer(pm.skill, problem, answer, tier);
                            // Update the problem in the set
                            var updatedSet = { ...pset };
                            var attempt = updatedSet.tiers[tier].attempts.slice(-1)[0];
                            attempt.problems[curIdx] = { ...attempt.problems[curIdx], passed: result.passed, evaluation: result.feedback, studentAnswer: answer };
                            updatedSet.lastActiveAt = new Date().toISOString();
                            await DB.savePractice(active.id, pm.skill.id, updatedSet);

                            setPracticeMode(prev => ({
                              ...prev, set: updatedSet, evaluating: false,
                              feedback: { passed: result.passed, text: result.feedback }
                            }));

                            // Check if all problems answered
                            var allDone = attempt.problems.every(p => p.passed !== null);
                            if (allDone) {
                              var tierResult = completeTierAttempt(updatedSet);
                              await DB.savePractice(active.id, pm.skill.id, updatedSet);
                              if (tierResult.points > 0) {
                                await applySkillUpdates(active.id, [{
                                  skillId: pm.skill.id, skill: pm.skill.name,
                                  delta: tierResult.points, rating: tierResult.rating,
                                  reason: "Practice Tier " + (tier) + " (" + tierResult.tierName + ") - attempt " + tierResult.attemptNum
                                }]);
                                addNotif("skill", pm.skill.name + ": +" + tierResult.points + " pts (Tier " + tier + " " + tierResult.tierName + ")");
                              }
                              // Show tier complete after a brief delay to let feedback show
                              setTimeout(() => {
                                setPracticeMode(prev => ({
                                  ...prev, set: updatedSet,
                                  tierComplete: { ...tierResult, problems: attempt.problems }
                                }));
                              }, 2000);
                            }
                          } catch (e) {
                            addNotif("error", "Evaluation failed: " + e.message);
                            setPracticeMode(prev => ({ ...prev, evaluating: false }));
                          }
                        }}
                          disabled={pm.evaluating || !(problem.studentAnswer || problem.starterCode || "").trim()}
                          style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: pm.evaluating ? T.bd : T.ac, color: pm.evaluating ? T.txD : "#0F1115", fontSize: 13, fontWeight: 600, cursor: pm.evaluating ? "wait" : "pointer" }}>
                          {pm.evaluating ? "Evaluating..." : "Submit"}
                        </button>
                      ) : (
                        <button onClick={() => {
                          var nextUnanswered = problems.findIndex((p, idx) => idx > curIdx && p.passed === null);
                          if (nextUnanswered < 0) nextUnanswered = problems.findIndex(p => p.passed === null);
                          if (nextUnanswered >= 0) setPracticeMode(prev => ({ ...prev, currentProblemIdx: nextUnanswered, feedback: null }));
                        }}
                          style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Next Problem
                        </button>
                      )}
                    </div>

                    {/* Feedback */}
                    {pm.feedback && (
                      <div style={{
                        marginTop: 16, padding: "12px 16px", borderRadius: 10,
                        background: pm.feedback.passed ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                        border: "1px solid " + (pm.feedback.passed ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)")
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: pm.feedback.passed ? T.gn : T.rd, marginBottom: 4 }}>
                          {pm.feedback.passed ? "Correct" : "Incorrect"}
                        </div>
                        <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.6 }}>{pm.feedback.text}</div>
                        {problem.confidenceRating !== null && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + (pm.feedback.passed ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)") }}>
                            <div style={{ fontSize: 11, color: T.txD }}>
                              {(() => {
                                var conf = problem.confidenceRating;
                                var passed = pm.feedback.passed;
                                if (passed && conf >= 4) return "Good calibration - your confidence matched your performance.";
                                if (passed && conf <= 2) return "You did better than expected! Confidence was " + conf + "/5 but you got it. Trust yourself more.";
                                if (!passed && conf >= 4) return "Calibration check: " + conf + "/5 confidence but missed it. Notice this gap.";
                                if (!passed && conf <= 2) return "You predicted this would be hard, and it was. Good self-awareness.";
                                return "Confidence: " + conf + "/5";
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Problem navigation dots */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                      {problems.map((p, idx) => (
                        <button key={idx} onClick={() => setPracticeMode(prev => ({ ...prev, currentProblemIdx: idx, feedback: p.passed !== null ? { passed: p.passed, text: p.evaluation } : null }))}
                          style={{
                            width: 12, height: 12, borderRadius: 6, border: "none", cursor: "pointer",
                            background: p.passed === true ? T.gn : p.passed === false ? T.rd : idx === curIdx ? T.ac : T.bd,
                            transform: idx === curIdx ? "scale(1.3)" : "scale(1)"
                          }} />
                      ))}
                    </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Practice generating indicator */}
        {practiceMode?.generating && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, color: T.txD, marginBottom: 8 }}>Generating practice problems...</div>
              <div style={{ fontSize: 12, color: T.txD }}>Tier {practiceMode?.set?.currentTier || "?"}: {TIERS[practiceMode?.set?.currentTier]?.name || "..."}</div>
            </div>
          </div>
        )}



        {!practiceMode && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Notification Side Panel */}
        {showNotifs && (
          <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid " + T.bd, background: T.sf, display: "flex", flexDirection: "column", order: 2 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.bd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Notifications</div>
              {notifs.length > 0 && (
                <button onClick={() => setNotifs([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11 }}>Clear all</button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {/* Extraction Errors Section */}
              {extractionErrors.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: T.bg, borderRadius: 8, border: "1px solid " + (T.rd || "#EF4444") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.rd || "#EF4444", textTransform: "uppercase" }}>
                      Extraction Errors ({extractionErrors.length})
                    </div>
                    <button onClick={() => setExtractionErrors([])} 
                      style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 10 }}>Clear</button>
                  </div>
                  {extractionErrors.slice(0, 3).map((err, i) => {
                    var shortLabel = err.label.length > 20 ? err.label.substring(0, 20) + "..." : err.label;
                    return (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: T.tx, marginBottom: 4 }}>{shortLabel}</div>
                        <div style={{ fontSize: 10, color: T.txD, marginBottom: 4 }}>{err.error}</div>
                        <button onClick={() => {
                          var debugText = "EXTRACTION ERROR REPORT\n" +
                            "=======================\n\n" +
                            "Material: " + err.label + "\n" +
                            "Error: " + err.error + "\n" +
                            "Time: " + err.time.toISOString() + "\n\n" +
                            "DEBUG INFO:\n" + JSON.stringify(err.debugInfo, null, 2);
                          try { navigator.clipboard.writeText(debugText); } catch(e) {}
                          alert("Error details copied to clipboard. Paste into Claude to debug.");
                        }} style={{ fontSize: 10, padding: "3px 8px", background: T.sf, border: "1px solid " + T.bd, borderRadius: 4, color: T.txD, cursor: "pointer" }}>
                          Copy debug info
                        </button>
                      </div>
                    );
                  })}
                  {extractionErrors.length > 3 && (
                    <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>...and {extractionErrors.length - 3} more</div>
                  )}
                </div>
              )}
              
              {notifs.length === 0 && extractionErrors.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 12 }}>No notifications yet</div>
              ) : notifs.map(n => {
                var typeColor = n.type === "error" ? (T.rd || "#EF4444") : n.type === "warn" ? "#F59E0B" : n.type === "skill" ? "#8B5CF6" : n.type === "success" ? T.gn : T.ac;
                var typeIcon = n.type === "error" ? "x" : n.type === "warn" ? "!" : n.type === "skill" ? "^" : n.type === "success" ? "+" : "*";
                var ago = Math.round((Date.now() - n.time.getTime()) / 1000);
                var agoStr = ago < 60 ? ago + "s" : ago < 3600 ? Math.round(ago / 60) + "m" : Math.round(ago / 3600) + "h";
                return (
                  <div key={n.id} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: T.bg, borderLeft: "3px solid " + typeColor }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5, flex: 1 }}>
                        <span style={{ color: typeColor, fontWeight: 600, marginRight: 6 }}>{typeIcon}</span>
                        {n.msg}
                      </div>
                      <div style={{ fontSize: 10, color: T.txD, flexShrink: 0, marginTop: 2 }}>{agoStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", order: 1 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Chunk Selection Picker */}
            {chunkPicker && !booting && (
              <div style={{ padding: "40px 20px", animation: "fadeIn 0.3s" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 6 }}>Select sections to analyze</div>
                  <div style={{ fontSize: 13, color: T.txD }}>Uncheck chapters or files that aren't relevant to your course. Only selected sections will be processed.</div>
                </div>
                <div style={{ maxWidth: 520, margin: "0 auto" }}>
                  {chunkPicker.materials.map((mat, mi) => (
                    <div key={mi} style={{ marginBottom: 16, background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: mat.chunks && mat.chunks.length > 1 ? "1px solid " + T.bd : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{mat.name}</div>
                          <div style={{ fontSize: 11, color: T.txD }}>{mat.classification} {mat.chunks ? "-- " + mat.chunks.length + " section" + (mat.chunks.length !== 1 ? "s" : "") : ""}</div>
                        </div>
                        {mat.chunks && mat.chunks.length > 1 && (
                          <button onClick={() => {
                            var allIds = mat.chunks.map(c => c.id);
                            var allSelected = allIds.every(id => chunkPicker.selectedChunks.has(id));
                            setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              allIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                              return { ...prev, selectedChunks: next };
                            });
                          }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                            {mat.chunks.every(c => chunkPicker.selectedChunks.has(c.id)) ? "Deselect all" : "Select all"}
                          </button>
                        )}
                      </div>
                      {mat.chunks && mat.chunks.length > 1 ? (
                        <div style={{ maxHeight: 300, overflowY: "auto" }}>
                          {mat.chunks.map((ch, ci) => (
                            <label key={ci} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", borderBottom: ci < mat.chunks.length - 1 ? "1px solid " + T.bg : "none" }}
                              onMouseEnter={e => e.currentTarget.style.background = T.acS}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <input type="checkbox" checked={chunkPicker.selectedChunks.has(ch.id)}
                                onChange={() => setChunkPicker(prev => {
                                  var next = new Set(prev.selectedChunks);
                                  next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                                  return { ...prev, selectedChunks: next };
                                })}
                                style={{ accentColor: T.ac, width: 16, height: 16, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.label}</div>
                                <div style={{ fontSize: 11, color: T.txD }}>{(ch.charCount || 0).toLocaleString()} chars</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : mat.chunks && mat.chunks.length === 1 ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer" }}>
                          <input type="checkbox" checked={chunkPicker.selectedChunks.has(mat.chunks[0].id)}
                            onChange={() => setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              var id = mat.chunks[0].id;
                              next.has(id) ? next.delete(id) : next.add(id);
                              return { ...prev, selectedChunks: next };
                            })}
                            style={{ accentColor: T.ac, width: 16, height: 16 }} />
                          <div style={{ fontSize: 13, color: T.tx }}>Include this file</div>
                        </label>
                      ) : null}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
                    <div style={{ fontSize: 12, color: T.txD, alignSelf: "center" }}>
                      {chunkPicker.selectedChunks.size} of {chunkPicker.materials.flatMap(m => m.chunks || []).length} sections selected
                    </div>
                    <button onClick={() => runExtraction(chunkPicker.selectedChunks)}
                      disabled={chunkPicker.selectedChunks.size === 0}
                      style={{ background: chunkPicker.selectedChunks.size > 0 ? T.ac : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#0F1115" : T.txD, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default" }}>
                      Extract skills
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!sessionMode && !booting && !chunkPicker && !practiceMode && (
              <div style={{ padding: "60px 20px", animation: "fadeIn 0.3s" }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: T.tx, marginBottom: 16 }}>{active.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: T.tx, marginBottom: 8 }}>What are we doing today?</div>
                  <div style={{ fontSize: 13, color: T.txD }}>Pick a direction and we'll get started.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420, margin: "0 auto" }}>
                  <button onClick={() => selectMode("assignment")}
                    style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.background = T.acS}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.ac, marginBottom: 4 }}>Work on an assignment</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Pick an assignment, then get taught what you need to complete it.</div>
                  </button>
                  <button onClick={() => selectMode("recap")}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Recap last session</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Review where you left off and what still needs work.</div>
                  </button>
                  <button onClick={() => selectMode("skills")}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Skill work</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Pick a skill to strengthen and go deep.</div>
                  </button>
                </div>
                
                {/* Bottom navigation - Course Management & Notifications */}
                <div style={{ marginTop: 60, display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={() => setScreen("manage")}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 20px", cursor: "pointer", fontSize: 13, color: T.txD }}>
                    Course Management
                  </button>
                  <button onClick={() => { setScreen("notifs"); setLastSeenNotif(Date.now()); }}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 20px", cursor: "pointer", fontSize: 13, color: T.txD, position: "relative" }}>
                    Notifications
                    {notifs.filter(n => n.time.getTime() > lastSeenNotif).length > 0 && (
                      <span style={{ position: "absolute", top: -6, right: -6, background: T.rd || "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "2px 6px" }}>
                        {notifs.filter(n => n.time.getTime() > lastSeenNotif).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {pickerData && !booting && (
              <div style={{ padding: "40px 20px", animation: "fadeIn 0.3s" }}>
                <button onClick={() => { setSessionMode(null); setPickerData(null); }}
                  style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>&lt; Back</button>

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
                            var skills = await extractSkillTree(active.id, active.materials, setStatus, isRetry, addNotif, extractionCancelledRef,
                              (err) => setExtractionErrors(p => [...p, err].slice(-10)), setProcessingMatId);
                            // Refresh active course from DB (chunk statuses updated)
                            var refreshed = await DB.getCourses();
                            var updatedCourse = refreshed.find(c => c.id === active.id);
                            if (updatedCourse) { setActive(updatedCourse); setCourses(refreshed); }
                            if (Array.isArray(skills) && skills.length > 0) {
                              var stillFailed = (updatedCourse?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed")).length;
                              var msg = "Found " + skills.length + " skills.";
                              if (stillFailed > 0) msg += " " + stillFailed + " chunk(s) still need retry.";
                              else msg += " All chunks extracted.";
                              addNotif("success", msg);
                            } else {
                              addNotif("error", "Skill extraction returned unexpected format.");
                            }
                          } catch (e) {
                            addNotif("error", "Extraction failed: " + e.message);
                          } finally { setGlobalLock(null); setBusy(false); setStatus(""); }
                        }} style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {hasExtracted && failedChunks.length > 0 ? "Retry failed chunks" : "Extract skills"}
                        </button>
                      </>;
                    })()}
                  </div>
                ) : pickerData.mode === "assignment" ? (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick an assignment</div>
                    <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Study will focus on teaching what you need for the one you choose.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
                      {pickerData.items.map((a, i) => {
                        var isExpanded = pickerData.expanded === i;
                        var readyColor = a.avgStrength >= 0.6 ? T.gn : a.avgStrength >= 0.3 ? "#F59E0B" : (T.txM || T.txD);
                        return (
                          <div key={i} style={{ background: T.sf, border: "1px solid " + (isExpanded ? T.acB : T.bd), borderRadius: 12, overflow: "hidden", transition: "all 0.15s" }}>
                            <div onClick={() => setPickerData(prev => ({ ...prev, expanded: isExpanded ? null : i }))}
                              style={{ padding: "16px 20px", cursor: "pointer" }}
                              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.acS; }}
                              onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{a.title}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {a.dueDate && <div style={{ fontSize: 11, color: T.ac, flexShrink: 0 }}>{a.dueDate}</div>}
                                  <span style={{ fontSize: 11, color: T.txD }}>{isExpanded ? "^" : "v"}</span>
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
                                                <button onClick={(e) => {
                                                  e.stopPropagation();
                                                  var fullSkill = Array.isArray(pickerData._skills) ? pickerData._skills.find(s => s.id === sk.id) : null;
                                                  if (fullSkill) bootWithFocus({ type: "skill", skill: { ...fullSkill, strength: sk.strength, points: sk.points } });
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
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 20, animation: "fadeIn 0.25s", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && <div style={{ fontSize: 11, color: T.ac, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>Study</div>}
                <div style={{
                  maxWidth: m.role === "user" ? "80%" : "100%",
                  background: m.role === "user" ? T.acS : "transparent",
                  border: m.role === "user" ? "1px solid " + T.acB : "none",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "0",
                  padding: m.role === "user" ? "12px 16px" : "4px 0",
                  color: T.tx, lineHeight: 1.7, fontSize: 14
                }}>
                  {m.role === "assistant" ? (m.content ? renderMd(m.content) : <span style={{ display: "inline-block", width: 8, height: 16, background: T.ac, animation: "blink 1s step-end infinite", verticalAlign: "middle" }} />) : m.content}
                </div>
              </div>
            ))}
            {((booting && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content)) || (busy && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant"))) && !processingMatId && (
              <div style={{ padding: "16px 0", animation: "fadeIn 0.2s" }}>
                <div style={{ fontSize: 11, color: T.ac, marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{booting ? status || "Reading materials..." : "Study"}</div>
                <svg width="64" height="28" viewBox="0 0 64 28" style={{ display: "block" }}>
                  {/* shelf */}
                  <rect x="2" y="24" width="60" height="2" rx="1" fill={T.bd} style={{ animation: "shelfPulse 2s ease-in-out infinite" }} />
                  {/* books - pixel style rectangles with different colors */}
                  <rect x="8" y="10" width="6" height="14" rx="1" fill={T.ac} style={{ animation: "bookSlide1 3.2s ease-in-out infinite" }} />
                  <rect x="16" y="12" width="5" height="12" rx="1" fill="#F59E0B" style={{ animation: "bookSlide2 2.8s ease-in-out 0.3s infinite" }} />
                  <rect x="23" y="8" width="7" height="16" rx="1" fill={T.ac} opacity="0.6" style={{ animation: "bookSlide3 3.5s ease-in-out 0.6s infinite" }} />
                  <rect x="32" y="14" width="5" height="10" rx="1" fill="#8B5CF6" style={{ animation: "bookSlide4 3s ease-in-out 0.15s infinite" }} />
                  <rect x="39" y="11" width="6" height="13" rx="1" fill={T.ac} opacity="0.8" style={{ animation: "bookSlide1 3.4s ease-in-out 0.8s infinite" }} />
                  <rect x="47" y="13" width="5" height="11" rx="1" fill="#F59E0B" opacity="0.7" style={{ animation: "bookSlide2 3.1s ease-in-out 0.5s infinite" }} />
                </svg>
                {booting && status && status.toLowerCase().includes("extract") && (
                  <button onClick={() => { extractionCancelledRef.current = true; }}
                    style={{ marginTop: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 11, color: T.txD, cursor: "pointer" }}>
                    Stop extraction
                  </button>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Assignment Panel */}
        {asgnWork && msgs.length > 0 && (
          <div style={{ width: 340, borderLeft: "1px solid " + T.bd, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid " + T.bd }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 4 }}>
                {focusContext?.assignment?.title || "Assignment"}
              </div>
              <div style={{ fontSize: 11, color: T.txD }}>
                {asgnWork.questions.filter(q => q.done).length} / {asgnWork.questions.length} complete
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {asgnWork.questions.map((q, i) => (
                <div key={q.id} style={{ marginBottom: 12 }}>
                  {q.done ? (
                    /* Completed question - collapsed */
                    <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: T.gn }}>{q.id}</div>
                        <div style={{ fontSize: 10, color: T.gn }}>Done</div>
                      </div>
                      <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>{q.answer.substring(0, 80)}{q.answer.length > 80 ? "..." : ""}</div>
                    </div>
                  ) : q.unlocked ? (
                    /* Active question - expanded with answer box */
                    <div style={{ background: T.sf, border: "1px solid " + T.acB, borderRadius: 12, padding: 14, animation: "fadeIn 0.3s" }}>
                      <div style={{ fontSize: 11, color: T.ac, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{q.id}</div>
                      <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 12 }}>{q.description}</div>
                      <textarea
                        value={q.answer}
                        onChange={e => {
                          var val = e.target.value;
                          setAsgnWork(prev => ({
                            ...prev,
                            questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, answer: val } : pq)
                          }));
                        }}
                        placeholder="Write your answer here..."
                        style={{ width: "100%", minHeight: 100, background: T.bg, border: "1px solid " + T.bd, borderRadius: 8, padding: "10px 12px", color: T.tx, fontSize: 13, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                      {q.answer.trim().length > 0 && (
                        <button onClick={() => {
                          setAsgnWork(prev => ({
                            ...prev,
                            questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, done: true } : pq)
                          }));
                        }}
                          style={{ marginTop: 8, background: T.gn, color: "#0F1115", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                          Mark done
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Locked question */
                    <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.4 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.txM }}>{q.id}</div>
                      <div style={{ fontSize: 11, color: T.txM, marginTop: 2 }}>Locked -- building skills</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Export button */}
            {asgnWork.questions.some(q => q.done) && (
              <div style={{ padding: 12, borderTop: "1px solid " + T.bd }}>
                <button onClick={() => {
                  var content = "# " + (focusContext?.assignment?.title || "Assignment") + "\n\n";
                  for (var q of asgnWork.questions) {
                    if (q.done) {
                      content += "## " + q.id + ": " + q.description + "\n\n";
                      content += q.answer + "\n\n---\n\n";
                    }
                  }
                  var blob = new Blob([content], { type: "text/markdown" });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement("a");
                  a.href = url;
                  a.download = (focusContext?.assignment?.title || "assignment").replace(/[^a-zA-Z0-9]/g, "_") + "_answers.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                  style={{ width: "100%", background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Export answers
                </button>
              </div>
            )}
          </div>
        )}

        </div>
        )}

        {/* Input Bar - only show after session has started, hidden during practice */}
        {msgs.length > 0 && !practiceMode && (
        <div style={{ borderTop: "1px solid " + T.bd, padding: 16, flexShrink: 0 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type your answer or ask a question..." rows={1}
              style={{ flex: 1, background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, padding: "12px 16px", color: T.tx, fontSize: 14, resize: "none", lineHeight: 1.5, maxHeight: 150 }} />
            <button onClick={sendMessage} disabled={!input.trim() || busy}
              style={{
                background: input.trim() && !busy ? T.ac : T.sf,
                color: input.trim() && !busy ? "#0F1115" : T.txM,
                border: "none", borderRadius: 12, width: 44, height: 44,
                fontSize: 16, cursor: input.trim() && !busy ? "pointer" : "default",
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700
              }}>-&gt;</button>
          </div>
        </div>
        )}

      </div>
      </>
    );
  }

  // Always render lock overlay on top if active
  if (globalLock) return lockOverlay;
  
  return null;
}

export default function Study() {
  return React.createElement(StudyErrorBoundary, null, React.createElement(StudyInnerWithContext));
}

// Wrapper that provides error context
function StudyInnerWithContext() {
  const [errorCtx, setErrorCtx] = useState({ screen: "loading", courseId: null, sessionMode: null });
  return React.createElement(
    ErrorContext.Provider,
    { value: errorCtx },
    React.createElement(StudyInner, { setErrorCtx })
  );
}
