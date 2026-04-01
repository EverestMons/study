import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";

import { CLS, autoClassify, parseFailed } from "./lib/classify.js";
import { getApiKey, setApiKey, getSetting, setSetting, getDb, Courses, Chunks, Sessions, Messages, JournalEntries, ParentSkills, SubSkills, Mastery, ChunkSkillBindings, SkillPrerequisites, Assignments, CourseSchedule, Materials, MaterialImages, loadCoursesNested, saveCoursesNested, migrateFacets, backfillSkillCourses, SkillCourses, Facets, FacetMastery, fixAssignmentDateYearOffset } from "./lib/db.js";
import { currentRetrievability } from "./lib/fsrs.js";
import { readFile } from "./lib/parsers.js";
import { callClaude, callClaudeStream, extractJSON, testApiKey } from "./lib/api.js";
import {
  storeAsChunks, decomposeAssignments, loadSkillsV2, runExtractionV2, getMatContent,
  computeAndStoreFingerprints
} from "./lib/skills.js";
import { parseSyllabus } from "./lib/syllabusParser.js";
import { seedCipTaxonomy } from "./lib/cipSeeder.js";
import { generateSubmission, downloadBlob } from "./lib/export.js";
import { checkForUpdate, installUpdate as installAppUpdate } from "./lib/updater.js";
import {
  effectiveStrength, nextReviewDate, applySkillUpdates, masteryConfidence,
  buildContext, buildFocusedContext, generateSessionEntry, computeFacetReadiness,
  formatJournal, buildSystemPrompt, parseQuestionUnlock, parseAnswerResult,
  parseSkillUpdates, parseInputMode, extractKeywords, detectLanguage, detectMathSubject, TIERS, strengthToTier,
  createPracticeSet, generateProblems, evaluateAnswer,
  completeTierAttempt, loadPracticeMaterialCtx, updateChunkEffectiveness, _updateTutorSessionSummary
} from "./lib/study.js";

/** Format due date epoch — relative when close, absolute when far. */
function formatDueDate(dueDateEpoch) {
  if (!dueDateEpoch) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = dueDateEpoch - now;
  const days = Math.floor(Math.abs(diff) / 86400);
  if (diff < 0) return days === 0 ? 'overdue' : 'overdue by ' + days + (days === 1 ? ' day' : ' days');
  if (days === 0) return 'due today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return 'in ' + days + ' days';
  const d = new Date(dueDateEpoch * 1000);
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() === thisYear) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Load assignments with questions mapped to the shape consumers expect. */
async function loadAssignmentsCompat(courseId) {
  const assignments = await Assignments.getByCourse(courseId);
  for (const a of assignments) {
    const questions = await Assignments.getQuestions(a.id);
    a.questions = questions.map(q => ({
      id: q.questionRef || String(q.id),
      description: q.description,
      difficulty: q.difficulty,
      requiredSkills: (q.requiredSkills || []).map(s => s.conceptKey || s.name || String(s.subSkillId)),
    }));
    a.dueDateEpoch = a.dueDate || null;
    a.dueDate = formatDueDate(a.dueDate);
  }
  return assignments;
}

const StudyContext = createContext(null);
export const useStudy = () => useContext(StudyContext);

const UNLOCK_MASTERY_THRESHOLD = 0.6; // 60% average facet retrievability required for question unlock

export function StudyProvider({ children, setErrorCtx }) {
  const [asyncError, setAsyncError] = useState(null);

  const [screen, setScreen] = useState("home");
  const [navStack, setNavStack] = useState([]);

  const navigateTo = (target) => {
    if (target === screen) return;
    setNavStack(prev => [...prev, screen]);
    setScreen(target);
  };
  const goBack = () => {
    setNavStack(prev => {
      if (prev.length === 0) { setScreen("home"); return []; }
      setScreen(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  };
  const resetNav = (target) => { setNavStack([]); setScreen(target || "home"); };
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
  const [folderImportData, setFolderImportData] = useState(null);

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState("text");
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [status, setStatus] = useState("");
  const [processingMatId, setProcessingMatId] = useState(null);
  const [errorLogModal, setErrorLogModal] = useState(null);

  const [globalLock, setGlobalLock] = useState(null);
  const [lockElapsed, setLockElapsed] = useState(0);

  const [showManage, _setShowManage] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [skillViewData, setSkillViewData] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, _setShowNotifs] = useState(false);
  const [lastSeenNotif, setLastSeenNotif] = useState(0);
  const [extractionErrors, setExtractionErrors] = useState([]);
  const [duplicateAlert, setDuplicateAlert] = useState(null);
  const [sessionMode, setSessionMode] = useState(null);
  const [focusContext, setFocusContext] = useState(null);
  const [pickerData, setPickerData] = useState(null);
  const [chunkPicker, setChunkPicker] = useState(null);
  const [asgnWork, setAsgnWork] = useState(null);
  const [practiceMode, setPracticeMode] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [expandedProfile, setExpandedProfile] = useState({});
  const [expandedSubSkill, setExpandedSubSkill] = useState(null);
  const [materialSkillCounts, setMaterialSkillCounts] = useState({});
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  const [dupPrompt, setDupPrompt] = useState(null);
  const [bgExtraction, setBgExtraction] = useState(null);
  const [currentSkillNotif, setCurrentSkillNotif] = useState(null);

  // App update state
  const [updateInfo, setUpdateInfo] = useState(null);      // { version, notes, update } or null
  const [updateStatus, setUpdateStatus] = useState(null);  // null | "checking" | "downloading" | "installing"

  const endRef = useRef(null);
  const taRef = useRef(null);
  const fiRef = useRef(null);
  const sessionStartIdx = useRef(0);
  const sessionSkillLog = useRef([]);
  const sessionMasteryEvents = useRef([]);
  const sessionFacetUpdates = useRef([]);
  const sessionMasteredSkills = useRef(new Set());
  const cachedSessionCtx = useRef(null);
  const extractionCancelledRef = useRef(false);
  const skillNotifQueue = useRef([]);
  const skillNotifTimers = useRef({ hold: null, clear: null });
  const coursesLoaded = useRef(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const sessionStartTime = useRef(null);
  const discussedChunks = useRef(new Set());
  const chatSessionId = useRef(null);
  const unlockRejectionRef = useRef(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [breakDismissed, setBreakDismissed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // --- Async Error Display state ---
  const [showAsyncNuclear, setShowAsyncNuclear] = useState(false);

  // Notification helper
  const addNotif = (type, msg) => {
    setNotifs(p => [{ id: Date.now() + Math.random(), type, msg, time: new Date() }, ...p].slice(0, 50));
  };

  // --- Material Processing State ---
  const getMaterialState = (mat) => {
    const chunks = mat.chunks || [];
    if (chunks.length === 0) {
      // Only show "reading" if this material is actively being processed
      // Otherwise it's just queued/waiting — don't show a fake loading animation
      return processingMatId === mat.id ? "reading" : "queued";
    }

    const total = chunks.length;
    const extracted = chunks.filter(c => c.status === "extracted").length;
    const failed = chunks.filter(c => c.status === "failed").length;
    const errored = chunks.filter(c => c.status === "error").length;
    const pending = chunks.filter(c => c.status === "pending").length;
    const sc = materialSkillCounts[mat.id];

    // Everything done (success or permanent failure) — no pending/errored chunks
    if (pending === 0 && errored === 0) {
      if (extracted > 0 && sc?.count > 0) return "ready";
      if (failed === total) return "critical_error";
      if (extracted > 0 && failed > 0) return "partial";
      return "ready"; // extracted but no skills yet — possible for very short docs
    }

    // Active processing — extraction is currently running on this material
    if (processingMatId === mat.id) {
      return (sc?.count > 0) ? "extracting" : "analyzing";
    }

    // Not processing but has unfinished chunks — stale
    if (pending > 0 || errored > 0) return "incomplete";

    return "analyzing";
  };

  const computeTrustSignals = (mat) => {
    const chunks = mat.chunks || [];
    const totalChars = chunks.reduce((s, c) => s + (c.charCount || 0), 0);
    const wordCount = Math.round(totalChars / 5);
    const wordLabel = wordCount >= 1000 ? (wordCount / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(wordCount);
    const clsLabel = CLS.find(c => c.v === mat.classification)?.l || mat.classification || "Document";
    const sc = materialSkillCounts[mat.id] || { count: 0, categories: [] };
    const topCats = sc.categories.slice(0, 3);
    const overflow = Math.max(0, sc.categories.length - 3);
    return { sectionCount: chunks.length, wordLabel, clsLabel, skillCount: sc.count, categoryCount: sc.categories.length, topCats, overflow };
  };

  const refreshMaterialSkillCounts = useCallback(async (courseId) => {
    try {
      const skills = await loadSkillsV2(courseId);
      const counts = {};
      for (const s of skills) {
        const bindings = await ChunkSkillBindings.getBySkill(s.id);
        for (const b of bindings) {
          if (!counts[b.chunk_id]) counts[b.chunk_id] = new Set();
          counts[b.chunk_id].add({ skillId: s.id, category: s.category });
        }
      }
      const matCounts = {};
      if (active?.materials) {
        for (const mat of active.materials) {
          const skillSet = new Set();
          const catSet = new Set();
          for (const ch of (mat.chunks || [])) {
            const chunkSkills = counts[ch.id];
            if (chunkSkills) {
              for (const entry of chunkSkills) {
                skillSet.add(entry.skillId);
                if (entry.category) catSet.add(entry.category);
              }
            }
          }
          matCounts[mat.id] = { count: skillSet.size, categories: [...catSet].sort() };
        }
      }
      setMaterialSkillCounts(matCounts);
    } catch (e) {
      console.error("Failed to load material skill counts:", e);
    }
  }, [active?.materials]);

  const timeAgo = (ts) => {
    if (!ts) return null;
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  };

  // --- Effects ---
  useEffect(() => {
    if (!globalLock) { setLockElapsed(0); return; }
    setLockElapsed(0);
    const iv = setInterval(() => setLockElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [globalLock]);

  // Skill notification queue processor — timers stored in ref to survive effect re-runs
  useEffect(function() {
    if (!currentSkillNotif && skillNotifQueue.current.length > 0) {
      var next = skillNotifQueue.current.shift();
      setCurrentSkillNotif({ ...next, phase: "in" });
      skillNotifTimers.current.hold = setTimeout(function() {
        setCurrentSkillNotif(function(prev) { return prev ? { ...prev, phase: "out" } : null; });
      }, 2300);
      skillNotifTimers.current.clear = setTimeout(function() {
        setCurrentSkillNotif(null);
      }, 2600);
    }
  }, [currentSkillNotif]);
  // Cleanup skill notification timers on unmount
  useEffect(function() {
    return function() {
      clearTimeout(skillNotifTimers.current.hold);
      clearTimeout(skillNotifTimers.current.clear);
    };
  }, []);

  useEffect(() => {
    if (active?.id && screen === "materials") refreshMaterialSkillCounts(active.id);
  }, [active?.id, active?.materials?.length, screen]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Seed CIP taxonomy (idempotent, fast-path skips if already seeded)
        try {
          const cipResult = await seedCipTaxonomy();
          if (cipResult.seeded > 0) console.log(`[Init] Seeded ${cipResult.seeded} CIP parent skills, ${cipResult.aliases} aliases`);
        } catch (e) { console.error("CIP taxonomy seeding failed:", e); }
        if (cancelled) return;
        // Promote existing mastery_criteria to facet rows (idempotent, fast-path skips if done)
        try {
          const facetResult = await migrateFacets();
          if (!facetResult.skipped) console.log(`[Init] Facet migration: ${facetResult.facetsCreated} facets created`);
        } catch (e) { console.error("Facet migration failed:", e); }
        if (cancelled) return;
        // One-time fix for assignment dates off by -1 year (idempotent)
        try {
          const dateFixResult = await fixAssignmentDateYearOffset();
          if (!dateFixResult.skipped) console.log(`[Init] Date year fix: ${dateFixResult.fixed} assignment(s) corrected`);
        } catch (e) { console.error("Date year fix failed:", e); }
        if (cancelled) return;
        // One-time cleanup of duplicate materials (idempotent, no-op if none)
        try {
          const dedupResult = await Materials.deduplicateAll();
          if (dedupResult.removed > 0) console.log(`[Init] Deduplicated ${dedupResult.removed} duplicate material(s)`);
        } catch (e) { console.error("Material deduplication failed:", e); }
        if (cancelled) return;
        // Backfill skill_courses junction table from existing source_course_id (idempotent)
        try {
          const scResult = await backfillSkillCourses();
          if (!scResult.skipped) console.log(`[Init] Backfilled skill_courses: ${scResult.backfilled} entries`);
        } catch (e) { console.error("Skill courses backfill failed:", e); }
        if (cancelled) return;
        const loaded = await loadCoursesNested();
        if (cancelled) return;
        setCourses(loaded);
        coursesLoaded.current = true;
        if (cancelled) return;
        const key = await getApiKey();
        if (cancelled) return;
        setApiKeyInput(key);
        if (!key) setShowSettings(true);
        setApiKeyLoaded(true);
        setReady(true);
      } catch (e) {
        console.error("Init failed:", e);
        if (cancelled) return;
        setAsyncError({ message: "Failed to initialize database: " + e.message, stack: e.stack || "" });
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (ready && !globalLock && !asyncError && coursesLoaded.current) { var t = setTimeout(() => saveCoursesNested(courses).catch(e => console.error("Auto-save courses failed:", e)), 500); return () => clearTimeout(t); } }, [courses, ready, globalLock, asyncError]);

  // Silent update check on startup
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      checkForUpdate().then(info => { if (info) setUpdateInfo(info); }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [ready]);

  // Prevent browser default of opening dropped files
  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => { document.removeEventListener("dragover", prevent); document.removeEventListener("drop", prevent); };
  }, []);

  useEffect(() => { if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (taRef.current) { if (inputMode === "code") { taRef.current.style.height = ""; } else { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 150) + "px"; } } }, [input, inputMode]);

  useEffect(() => {
    if (!sessionStartTime.current) { setSessionElapsed(0); return; }
    var update = () => setSessionElapsed(Math.floor((Date.now() - sessionStartTime.current) / 60000));
    update();
    var iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [msgs.length]);

  const saveSessionToJournal = useCallback(async () => {
    if (!active || msgs.length <= sessionStartIdx.current + 1) return;
    try {
      const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
      if (!entry) return;
      await JournalEntries.create({ sessionId: chatSessionId.current, courseId: active.id, intent: 'v1_compat', entryData: entry });
      try { await updateChunkEffectiveness(chatSessionId.current); } catch { /* non-critical */ }
      try { await _updateTutorSessionSummary(entry, active.id, chatSessionId.current); } catch { /* non-critical */ }
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

  const clearSessionState = useCallback(() => {
    setMsgs([]); setInput(""); setInputMode("text");
    setSessionMode(null); setFocusContext(null);
    setPickerData(null); setChunkPicker(null);
    setAsgnWork(null); setPracticeMode(null);
    setShowSkills(false); setSkillViewData(null);
    sessionStartIdx.current = 0;
    sessionSkillLog.current = [];
    sessionMasteryEvents.current = [];
    sessionFacetUpdates.current = [];
    sessionMasteredSkills.current = new Set();
    cachedSessionCtx.current = null;
    sessionStartTime.current = null;
    discussedChunks.current = new Set();
    setSessionSummary(null);
    setSessionElapsed(0);
    setBreakDismissed(false);
    setSidebarCollapsed(false);
  }, []);

  // --- File Handlers ---
  const filterDuplicates = (newFiles) => {
    const existingNames = new Set(files.map(f => f.name));
    if (active) for (const m of active.materials || []) existingNames.add(m.name);
    const unique = [];
    var dupNames = [];
    for (const f of newFiles) {
      if (existingNames.has(f.name)) {
        dupNames.push(f.name);
      } else {
        existingNames.add(f.name);
        unique.push(f);
      }
    }
    if (dupNames.length > 0) setDuplicateAlert(dupNames);
    return unique;
  };

  const onDrop = useCallback(async (e) => {
    e.preventDefault(); setDrag(false);
    const fl = Array.from(e.dataTransfer.files);
    setParsing(true);
    var _ocrL; try { var _v = await getSetting("ocr_languages"); if (_v) _ocrL = JSON.parse(_v); } catch {}
    const parsed = await Promise.all(fl.map(f => readFile(f, { onProgress: msg => setStatus(msg), ocrLanguages: _ocrL })));
    for (const p of parsed) { if (p._structured?._ocrWarning) addNotif('warn', p.name + ': ' + p._structured._ocrWarning); }
    const unique = filterDuplicates(parsed);
    if (unique.length) setFiles(p => [...p, ...unique.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false);
  }, [files, active]);

  const onSelect = useCallback(async (e) => {
    const fl = Array.from(e.target.files);
    setParsing(true);
    var _ocrL; try { var _v = await getSetting("ocr_languages"); if (_v) _ocrL = JSON.parse(_v); } catch {}
    const parsed = await Promise.all(fl.map(f => readFile(f, { onProgress: msg => setStatus(msg), ocrLanguages: _ocrL })));
    for (const p of parsed) { if (p._structured?._ocrWarning) addNotif('warn', p.name + ': ' + p._structured._ocrWarning); }
    const unique = filterDuplicates(parsed);
    if (unique.length) setFiles(p => [...p, ...unique.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false); e.target.value = "";
  }, [files, active]);

  const classify = (id, c) => setFiles(p => p.map(f => f.id === id ? { ...f, classification: c } : f));
  const removeF = (id) => setFiles(p => p.filter(f => f.id !== id));

  // --- Folder Import ---
  const importFromFolder = useCallback(async () => {
    try {
      const { pickFolder, scanFolder } = await import("./lib/folderImport.js");
      const lastPath = await getSetting("lastFolderPath");
      const folderPath = await pickFolder(lastPath);
      if (!folderPath) return;
      const data = await scanFolder(folderPath);
      if (data.files.length === 0 && data.unsupported.length === 0) {
        addNotif("warn", "No files found in selected folder.");
        return;
      }
      await setSetting("lastFolderPath", folderPath);
      setFolderImportData(data);
    } catch (e) {
      console.error("[folderImport] Scan failed:", e);
      addNotif("error", "Could not read folder: " + (e.message || "unknown error"));
    }
  }, []);

  const confirmFolderImport = useCallback(async (selectedFiles) => {
    setFolderImportData(null);
    setParsing(true);
    try {
      const subfolderByName = new Map(selectedFiles.map(f => [f.name, f.subfolder]));
      const { readSelectedFiles } = await import("./lib/folderImport.js");
      const browserFiles = await readSelectedFiles(selectedFiles);
      var _ocrL; try { var _v = await getSetting("ocr_languages"); if (_v) _ocrL = JSON.parse(_v); } catch {}
      const parsed = await Promise.all(browserFiles.map(f => readFile(f, { onProgress: msg => setStatus(msg), ocrLanguages: _ocrL })));
      for (const p of parsed) { if (p._structured?._ocrWarning) addNotif('warn', p.name + ': ' + p._structured._ocrWarning); }
      const unique = filterDuplicates(parsed);
      if (unique.length) setFiles(p => [...p, ...unique.map(f => ({
        ...f,
        classification: autoClassify(f, subfolderByName.get(f.name)) || (f.type === "epub" ? "textbook" : ""),
        parseOk: !parseFailed(f.content),
        id: Date.now() + "-" + Math.random()
      }))]);
    } catch (e) {
      console.error("[folderImport] Import failed:", e);
      addNotif("error", "Folder import failed: " + e.message);
    }
    setParsing(false);
  }, [files, active]);

  // --- Background Extraction Runner ---
  const runBackgroundExtraction = async (courseId, extractable) => {
    const updateMatInBg = (matId, updater) => {
      setBgExtraction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          materials: prev.materials.map(m =>
            m.id === matId ? (typeof updater === 'function' ? updater(m) : { ...m, ...updater }) : m
          ),
        };
      });
    };

    for (let i = 0; i < extractable.length; i++) {
      const mat = extractable[i];

      // Check cancellation between materials
      if (extractionCancelledRef.current) {
        for (let j = i; j < extractable.length; j++) {
          updateMatInBg(extractable[j].id, { status: 'skipped' });
        }
        addNotif("warn", "Extraction cancelled.");
        break;
      }

      updateMatInBg(mat.id, { status: 'extracting' });
      setProcessingMatId(mat.id);
      setStatus("Extracting: " + mat.name + "...");

      try {
        var exResult = await runExtractionV2(courseId, mat.id, {
          onStatus: setStatus,
          onNotif: addNotif,
          onChapterComplete: (ch, cnt) => {
            updateMatInBg(mat.id, m => ({ ...m, chaptersComplete: m.chaptersComplete + 1 }));
            setStatus(mat.name + " — " + ch + ": " + cnt + " skills");
          },
        });

        if (exResult?.needsUserDecision) {
          updateMatInBg(mat.id, { status: 'awaiting_decision' });
          const decision = await new Promise(resolve => {
            setDupPrompt({ materialName: mat.name, dupSummary: exResult.dupSummary, resolve });
          });
          setDupPrompt(null);

          if (decision === 'extract') {
            updateMatInBg(mat.id, { status: 'extracting' });
            await runExtractionV2(courseId, mat.id, {
              onStatus: setStatus, onNotif: addNotif,
              onChapterComplete: (ch, cnt) => setStatus(mat.name + " — " + ch + ": " + cnt + " skills"),
            }, { skipNearDedupCheck: true });
            updateMatInBg(mat.id, { status: 'done' });
          } else {
            const skippedIds = [...new Set(exResult.nearDuplicates.map(m => m.newChunkId))];
            await Chunks.updateStatusBatch(skippedIds, 'extracted');
            updateMatInBg(mat.id, { status: 'skipped' });
            addNotif("info", "Skipped \"" + mat.name + "\" — matched existing content.");
          }
        } else {
          updateMatInBg(mat.id, { status: 'done' });
        }
      } catch (e) {
        console.error("Background extraction failed for", mat.name, e);
        updateMatInBg(mat.id, { status: 'error', error: e.message });
        const errMsg = e.message || String(e);
        if (/API\s*(429|529|500|503)|overloaded|rate.?limit|service.?unavailable|failed.?to.?fetch|connection|ECONNREFUSED|timeout/i.test(errMsg)) {
          addNotif("error", "Claude API unavailable — " + mat.name + " was not processed.");
        } else {
          addNotif("warn", "Could not extract skills from " + mat.name + ": " + errMsg.substring(0, 120));
        }
      }
    }

    // Cleanup
    setProcessingMatId(null);
    setStatus("");
    const refreshed = await loadCoursesNested();
    const rc = refreshed.find(c => c.id === courseId);
    if (rc) { setCourses(refreshed); setActive(rc); }
    await refreshMaterialSkillCounts(courseId);
    addNotif("success", "Extraction complete.");

    // Decompose assignments if any assignment-classified materials exist
    const allMats = rc ? rc.materials : [];
    const hasAsgnMats = allMats.some(m => m.classification === "assignment");
    if (hasAsgnMats) {
      try {
        const sk = await loadSkillsV2(courseId);
        if (sk.length > 0) {
          setStatus("Decomposing assignments...");
          await decomposeAssignments(courseId, allMats, sk, setStatus);
          setStatus("");
          addNotif("success", "Assignments decomposed.");
        }
      } catch (e) {
        console.warn("[addMats] Assignment decomposition failed:", e);
      }
    }

    setTimeout(() => setBgExtraction(null), 3000);
  };

  // --- Course Creation ---
  const createCourse = async () => {
    if (!cName.trim() || !files.length || files.some(f => !f.classification)) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    setGlobalLock({ message: "Creating course..." });
    setStatus("Storing documents...");

    let courseId, mats;
    try {
      // === PHASE 1 (blocking): store docs, parse syllabi, mark assignment chunks ===
      courseId = await Courses.create({ name: cName.trim() });
      mats = [];
      for (let i = 0; i < validFiles.length; i++) {
        const f = validFiles[i];
        setStatus("Storing: " + f.name + "...");
        const mat = await storeAsChunks(courseId, f, "doc-" + i + "-" + Date.now());
        var failedChunks = mat.chunks.filter(c => c.status === "failed").length;
        if (failedChunks > 0) {
          addNotif("error", failedChunks + " of " + mat.chunks.length + " chunks failed to save for \"" + f.name + "\". Storage may be unreliable.");
        }
        // Extract images (non-blocking — failure does not stop upload)
        if (!mat._deduplicated) {
          try {
            const { extractAndStoreImages } = await import('./lib/imageExtractor.js');
            await extractAndStoreImages(courseId, mat, f, { onStatus: setStatus });
          } catch (e) { console.warn('[ImageExtract] Failed for', f.name, e); }
        }
        mats.push(mat);
      }

      const newCourse = { id: courseId, name: cName.trim(), materials: mats, createdAt: new Date().toISOString() };
      const updated = [...courses.filter(c => c.id !== courseId), newCourse];
      await saveCoursesNested(updated);
      for (const mat of mats) {
        const pendingDocs = mat._pendingDocs || [];
        for (const pd of pendingDocs) {
          await Chunks.updateContent(pd.chunkId, typeof pd.doc === 'string' ? pd.doc : JSON.stringify(pd.doc));
        }
        if (pendingDocs.length > 0) {
          try { await computeAndStoreFingerprints(mat.id); } catch (e) { console.warn('[MinHash] Fingerprint failed:', e); }
        }
        delete mat._pendingDocs;
      }
      setCourses(updated); setActive(newCourse); setFiles([]); setCName("");

      // --- Syllabus parsing ---
      var syllabusMats = mats.filter(m => m.classification === "syllabus" && (m.chunks || []).length > 0);
      for (const syllMat of syllabusMats) {
        setStatus("Parsing syllabus: " + syllMat.name + "...");
        try {
          const { content: fullText } = await getMatContent(courseId, syllMat);
          if (fullText && fullText.trim()) {
            const syllResult = await parseSyllabus(courseId, fullText, { onStatus: setStatus });
            if (syllResult.success) {
              addNotif("success", "Syllabus processed — " + syllResult.weeksFound + " weeks, " + syllResult.assignmentsCreated + " assignment(s) found.");
              var syllChunkIds = (syllMat.chunks || []).map(c => c.id).filter(Boolean);
              if (syllChunkIds.length) await Chunks.updateStatusBatch(syllChunkIds, "extracted");
            } else {
              addNotif("warn", "Syllabus parsed with issues: " + syllResult.issues.map(i => i.message).join("; "));
            }
          }
        } catch (e) {
          console.error("Syllabus parsing failed:", e);
          addNotif("warn", "Could not parse syllabus: " + e.message);
        }
      }

      // Mark assignment chunks as extracted
      var asgnMats = mats.filter(m => m.classification === "assignment" && (m.chunks || []).length > 0);
      for (const asgnMat of asgnMats) {
        var asgnChunkIds = (asgnMat.chunks || []).map(c => c.id).filter(Boolean);
        if (asgnChunkIds.length) await Chunks.updateStatusBatch(asgnChunkIds, "extracted");
      }
    } catch (err) {
      console.error("Course creation failed:", err);
      addNotif("error", "Course creation failed: " + err.message);
      setGlobalLock(null); setStatus("");
      return;
    }

    // Phase 1 complete — unblock UI
    setGlobalLock(null); setStatus("");
    navigateTo("materials");

    // === PHASE 2 (non-blocking): skill extraction ===
    var extractable = mats.filter(m => m.classification !== "assignment" && m.classification !== "syllabus" && (m.chunks || []).length > 0);
    if (extractable.length > 0) {
      addNotif("success", "Course created. Extracting skills in the background...");
      extractionCancelledRef.current = false;
      setBgExtraction({
        courseId,
        materials: extractable.map(m => ({
          id: m.id, name: m.name, status: 'pending',
          chaptersTotal: null, chaptersComplete: 0, error: null,
        })),
        startedAt: Date.now(),
      });
      runBackgroundExtraction(courseId, extractable);
    } else {
      var totalSections = mats.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
      addNotif("success", "Course created with " + mats.length + " material(s) and " + totalSections + " section(s).");
    }
  };

  const quickCreateCourse = async () => {
    if (!cName.trim()) return;
    try {
      await Courses.create({ name: cName.trim() });
      const refreshed = await loadCoursesNested();
      setCourses(refreshed);
      addNotif("success", "Course created: " + cName.trim());
      setCName("");
    } catch (e) {
      addNotif("error", "Failed to create course: " + e.message);
    }
  };

  const loadProfile = async () => {
    try {
      // 4 bulk queries instead of ~1,150 individual queries
      const allParents = await ParentSkills.getAll();
      const allSubs = await SubSkills.getAllActive();
      const allMasteryRows = await Mastery.getAll();
      const allPrereqRows = await SkillPrerequisites.getAllWithNames();

      // Bulk-load facets and facet mastery (safe — returns [] if table doesn't exist)
      var allFacetRows = [];
      var allFacetMasteryRows = [];
      try { allFacetRows = await Facets.getAllActive(); } catch { /* facets table may not exist */ }
      try { allFacetMasteryRows = await FacetMastery.getAll(); } catch { /* facet_mastery table may not exist */ }

      // Bulk-load skill_courses for multi-course attribution
      var allSkillCoursesRows = [];
      try { allSkillCoursesRows = await SkillCourses.getAll(); } catch { /* skill_courses table may not exist */ }
      const skillCoursesMap = {};
      for (const sc of allSkillCoursesRows) (skillCoursesMap[sc.skill_id] ||= []).push(sc.course_id);

      // Group in JavaScript — O(n) hash map builds
      const subsByParent = {};
      for (const s of allSubs) (subsByParent[s.parent_skill_id] ||= []).push(s);
      const masteryBySkill = {};
      for (const m of allMasteryRows) masteryBySkill[m.sub_skill_id] = m;
      const prereqsBySkill = {};
      for (const p of allPrereqRows) (prereqsBySkill[p.sub_skill_id] ||= []).push(p);
      const facetsBySkill = {};
      for (const f of allFacetRows) (facetsBySkill[f.skill_id] ||= []).push(f);
      const facetMasteryById = {};
      for (const fm of allFacetMasteryRows) facetMasteryById[fm.facet_id] = fm;

      const results = [];
      const now = new Date();
      for (const parent of allParents) {
        const subs = subsByParent[parent.id] || [];
        if (subs.length === 0) continue;
        const masteryMap = {};
        for (const s of subs) { if (masteryBySkill[s.id]) masteryMap[s.id] = masteryBySkill[s.id]; }

        let totalPoints = 0;
        let readinessSum = 0;
        let readinessCount = 0;
        let reviewedCount = 0;
        let dueForReview = 0;
        let lastActivityDate = null;

        const enrichedSubs = subs.map(sub => {
          const m = masteryBySkill[sub.id];
          const fitness = typeof sub.fitness === 'string' ? JSON.parse(sub.fitness || '{}') : (sub.fitness || {});
          if (fitness.lastUsed) {
            var luDate = new Date(fitness.lastUsed);
            if (!lastActivityDate || luDate > lastActivityDate) lastActivityDate = luDate;
          }
          const evidence = typeof sub.evidence === 'string' ? JSON.parse(sub.evidence || '{}') : (sub.evidence || {});
          const rawCriteria = typeof sub.mastery_criteria === 'string' ? JSON.parse(sub.mastery_criteria || '[]') : (sub.mastery_criteria || []);
          const masteryCriteria = rawCriteria.map(c => typeof c === 'string' ? { text: c, verified: false } : c);
          const prereqs = prereqsBySkill[sub.id] || [];

          let retrievability = 0;
          let stability = 0;
          let nextReview = null;
          let isDue = false;

          if (m) {
            totalPoints += m.total_mastery_points || 0;
            reviewedCount++;
            retrievability = currentRetrievability({ stability: m.stability, lastReviewAt: m.last_review_at });
            stability = m.stability || 0;
            if (retrievability > 0) { readinessSum += retrievability; readinessCount++; }
            if (m.next_review_at) {
              var nrMs = m.next_review_at < 1e11 ? m.next_review_at * 1000 : m.next_review_at;
              nextReview = new Date(nrMs);
              isDue = nextReview <= now;
              if (isDue) dueForReview++;
            }
          }

          // Enrich facets for this sub-skill
          var subFacets = (facetsBySkill[sub.id] || []).map(f => {
            var fm = facetMasteryById[f.id];
            var fRetrievability = 0;
            var fStability = 0;
            var fNextReview = null;
            var fIsDue = false;
            if (fm) {
              fRetrievability = currentRetrievability({ stability: fm.stability, lastReviewAt: fm.last_review_at });
              fStability = fm.stability || 0;
              if (fm.next_review_at) {
                var fnrMs = fm.next_review_at < 1e11 ? fm.next_review_at * 1000 : fm.next_review_at;
                fNextReview = new Date(fnrMs);
                fIsDue = fNextReview <= now;
              }
            }
            return {
              id: f.id, name: f.name, description: f.description,
              conceptKey: f.concept_key, bloomsLevel: f.blooms_level,
              mastery: fm ? {
                retrievability: fRetrievability, stability: fStability,
                difficulty: fm.difficulty, reps: fm.reps, lapses: fm.lapses,
                totalMasteryPoints: fm.total_mastery_points || 0,
                nextReview: fNextReview, isDue: fIsDue,
              } : null,
            };
          });

          // Multi-course attribution: prefer skill_courses junction, fall back to source_course_id
          const courseIds = skillCoursesMap[sub.id] || (sub.source_course_id ? [sub.source_course_id] : []);

          // Coverage: how many facets have been tested
          var allSubFacets = facetsBySkill[sub.id] || [];
          var totalFacetCount = allSubFacets.length;
          var testedFacetCount = allSubFacets.filter(f => facetMasteryById[f.id]).length;
          var coverage = totalFacetCount > 0 ? testedFacetCount / totalFacetCount : 0;

          return {
            id: sub.id, name: sub.name, description: sub.description,
            conceptKey: sub.concept_key, category: sub.category,
            skillType: sub.skill_type, bloomsLevel: sub.blooms_level,
            sourceCourseId: sub.source_course_id, courseIds, masteryCriteria, evidence, fitness,
            confidence: masteryConfidence(fitness),
            prerequisites: prereqs.map(p => ({ id: p.prerequisite_id, name: p.name, conceptKey: p.concept_key })),
            facets: subFacets, coverage, testedFacetCount, totalFacetCount,
            mastery: m ? {
              retrievability, stability, difficulty: m.difficulty,
              reps: m.reps, lapses: m.lapses,
              totalMasteryPoints: m.total_mastery_points || 0,
              nextReview, isDue,
            } : null,
          };
        });

        // Only show skills the user has actually reviewed/acquired
        const acquiredSubs = enrichedSubs.filter(s => s.mastery !== null);
        if (acquiredSubs.length === 0) continue;

        // Parent-level facet coverage
        var parentTestedFacets = 0, parentTotalFacets = 0;
        for (var as of acquiredSubs) { parentTestedFacets += as.testedFacetCount; parentTotalFacets += as.totalFacetCount; }
        var parentCoverage = parentTotalFacets > 0 ? parentTestedFacets / parentTotalFacets : 0;

        const level = Math.floor(Math.sqrt(totalPoints));
        const nextLevelThreshold = (level + 1) * (level + 1);
        const progressToNext = totalPoints - (level * level);
        const progressNeeded = nextLevelThreshold - (level * level);

        results.push({
          parent, cipDomain: parent.cip_code ? parent.cip_code.substring(0, 2) : null,
          subSkills: acquiredSubs, masteryMap, level, progressToNext, progressNeeded,
          readiness: readinessCount > 0 ? readinessSum / readinessCount : 0,
          parentCoverage, parentTestedFacets, parentTotalFacets,
          subCount: acquiredSubs.length, reviewedCount, dueForReview, totalPoints, lastActivityDate,
        });
      }
      results.sort((a, b) => b.level - a.level);
      setProfileData(results);
    } catch (e) {
      console.error("Failed to load profile:", e);
      addNotif("error", "Failed to load profile: " + e.message);
    }
  };

  const enterStudy = async (course, initialMode, materialId) => {
    setActive(course); navigateTo("study");
    setMsgs([]); setInput(""); setInputMode("text"); setDetectedLanguage(null); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null);
    sessionSkillLog.current = [];
    sessionMasteryEvents.current = [];
    sessionFacetUpdates.current = [];
    sessionMasteredSkills.current = new Set();
    cachedSessionCtx.current = null;
    sessionStartIdx.current = 0;
    sessionStartTime.current = null;
    discussedChunks.current = new Set();
    setSessionSummary(null);
    setSessionElapsed(0);
    setBreakDismissed(false);
    setSidebarCollapsed(false);
    try {
      const oldSid = await Sessions.getOrCreateCompat(course.id);
      const savedRows = await Messages.getBySession(oldSid);
      const savedMsgs = savedRows.map(r => {
        let meta = {};
        try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch { /* ignored */ }
        return { role: r.role, content: r.content, ...meta };
      });
      if (savedMsgs.length > 1) {
        const entry = generateSessionEntry(savedMsgs, 0, []);
        if (entry) {
          await JournalEntries.create({ sessionId: oldSid, courseId: course.id, intent: 'v1_compat', entryData: entry });
        }
      }
      await Sessions.end(oldSid);
      chatSessionId.current = await Sessions.create({ courseId: course.id, intent: 'study' });
    } catch (e) { console.error("Journal capture on enter:", e); }
    if (initialMode) {
      selectMode(initialMode, materialId);
    }
  };

  // --- Mode Selection ---
  const selectMode = async (mode, materialId) => {
    setSessionMode(mode);
    try {
      const skills = await loadSkillsV2(active.id);
      if (mode === "assignment") {
        const asgn = await loadAssignmentsCompat(active.id);
        var hasAsgnMats = (active.materials || []).some(m => m.classification === "assignment");
        var hasSkills = skills && Array.isArray(skills) && skills.length > 0;
        var needsDecomposition = !Array.isArray(asgn) || asgn.length === 0 ||
          (hasAsgnMats && asgn.some(a => !a.questions || a.questions.length === 0));
        if (needsDecomposition) {
          if (hasAsgnMats && hasSkills) {
            setPickerData({ mode, empty: true, message: "Decomposing assignment..." });
            try {
              await decomposeAssignments(active.id, active.materials, skills, () => {});
              var freshAsgn = await loadAssignmentsCompat(active.id);
              if (Array.isArray(freshAsgn) && freshAsgn.length > 0) {
                var enriched2 = freshAsgn.map(a => {
                  var reqSkills2 = new Set();
                  if (a.questions) a.questions.forEach(q => q.requiredSkills?.forEach(s => reqSkills2.add(s)));
                  var skillList2 = [...reqSkills2].map(sid => {
                    var sk2 = Array.isArray(skills) ? skills.find(s => s.id === sid || s.conceptKey === sid) : null;
                    return { id: sid, name: sk2?.name || sid, points: sk2?.mastery?.totalMasteryPoints || 0, strength: effectiveStrength(sk2) };
                  });
                  return { ...a, skillList: skillList2, avgStrength: skillList2.length > 0 ? skillList2.reduce((s, sk) => s + sk.strength, 0) / skillList2.length : 0, weakSkills: skillList2.filter(sk => sk.strength < 0.4), questionCount: a.questions?.length || 0 };
                });
                enriched2.sort((a, b) => {
                  if (a.dueDateEpoch && b.dueDateEpoch) return a.dueDateEpoch - b.dueDateEpoch;
                  if (a.dueDateEpoch) return -1; if (b.dueDateEpoch) return 1;
                  return (a.title || '').localeCompare(b.title || '');
                });
                setPickerData({ mode, items: enriched2, _skills: skills });
                addNotif("success", "Assignments decomposed.");
                return;
              }
            } catch (e) {
              addNotif("error", "Assignment decomposition failed: " + e.message);
            }
          }
          setPickerData({ mode, empty: true, message: hasAsgnMats ? "Assignment decomposition failed. Check your API key and try again." : "No assignments found. Upload an assignment in the material manager and extract skills from your course materials first." });
          return;
        }
        const enriched = asgn.map(a => {
          const reqSkills = new Set();
          if (a.questions) a.questions.forEach(q => q.requiredSkills?.forEach(s => reqSkills.add(s)));
          const skillList = [...reqSkills].map(sid => {
            var sk = Array.isArray(skills) ? skills.find(s => s.id === sid || s.conceptKey === sid) : null;
            if (!sk && Array.isArray(skills)) sk = skills.find(s => s.name.toLowerCase() === sid.toLowerCase());
            return { id: sk?.id || sid, name: sk?.name || sid, points: sk?.mastery?.totalMasteryPoints || 0, strength: effectiveStrength(sk) };
          });
          const weakSkills = skillList.filter(sk => sk.strength < 0.4);
          const avgStrength = skillList.length > 0 ? skillList.reduce((s, sk) => s + sk.strength, 0) / skillList.length : 0;
          return { ...a, skillList, avgStrength, weakSkills, questionCount: a.questions?.length || 0 };
        });
        enriched.sort((a, b) => {
          if (a.dueDateEpoch && b.dueDateEpoch) return a.dueDateEpoch - b.dueDateEpoch;
          if (a.dueDateEpoch) return -1; if (b.dueDateEpoch) return 1;
          return (a.title || '').localeCompare(b.title || '');
        });
        setPickerData({ mode, items: enriched, _skills: skills });
      } else if (mode === "skills") {
        if (!Array.isArray(skills) || skills.length === 0) {
          setPickerData({ mode, empty: true, message: "No skills yet. Activate sections and extract skills first." });
          return;
        }
        // Build deadline skill map: which skills are needed for upcoming assignments
        var deadlineSkillMap = {};
        try {
          var skAsgn = await Assignments.getByCourse(active.id);
          var skNow = Math.floor(Date.now() / 1000);
          for (var sa of skAsgn) {
            if (sa.status === "completed") continue;
            if (sa.source === "syllabus" && !sa.materialId) continue;
            if (!sa.dueDate || sa.dueDate < skNow) continue;
            var skDaysUntil = Math.floor((sa.dueDate - skNow) / 86400);
            if (skDaysUntil > 14) continue;
            var skQuestions = await Assignments.getQuestions(sa.id);
            for (var sq of skQuestions) {
              for (var srs of (sq.requiredSkills || [])) {
                var ssid = srs.conceptKey || srs.name || String(srs.subSkillId);
                if (!deadlineSkillMap[ssid] || skDaysUntil < deadlineSkillMap[ssid].daysUntil) {
                  deadlineSkillMap[ssid] = { title: sa.title, daysUntil: skDaysUntil };
                }
              }
            }
          }
        } catch (e) { console.error("Deadline skill map failed:", e); }

        var enriched = skills.map(s => {
          // Match deadline info via 3-tier resolution
          var dl = deadlineSkillMap[s.id] || deadlineSkillMap[s.conceptKey] || null;
          if (!dl && s.name) {
            for (var [dsid, dinfo] of Object.entries(deadlineSkillMap)) {
              if (s.name.toLowerCase() === dsid.toLowerCase()) { dl = dinfo; break; }
            }
          }
          return {
            ...s,
            points: s.mastery?.totalMasteryPoints || 0,
            strength: effectiveStrength(s),
            lastPracticed: s.mastery?.lastReviewAt ? new Date((s.mastery.lastReviewAt < 1e11 ? s.mastery.lastReviewAt * 1000 : s.mastery.lastReviewAt)).toISOString() : null,
            reviewDate: nextReviewDate(s),
            sessions: s.mastery?.reps || 0,
            lastRating: s.mastery?.lastRating || null,
            deadlineTitle: dl?.title || null,
            deadlineDays: dl?.daysUntil ?? null,
          };
        }).sort((a, b) => {
          var strengthDiff = a.strength - b.strength;
          // Within same strength band (±10%), promote deadline-relevant skills
          if (Math.abs(strengthDiff) < 0.10) {
            var aHas = a.deadlineDays !== null;
            var bHas = b.deadlineDays !== null;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            if (aHas && bHas) return a.deadlineDays - b.deadlineDays;
          }
          return strengthDiff;
        });
        // Material-specific filtering
        var allEnriched = enriched;
        var materialName = null;
        if (materialId) {
          var matSkillRows = await SubSkills.getByMaterial(materialId);
          var matSkillIds = new Set(matSkillRows.map(function(r) { return r.id; }));
          enriched = enriched.filter(function(s) { return matSkillIds.has(s.id); });
          var _mat = (active.materials || []).find(function(m) { return m.id === materialId; });
          materialName = _mat?.name || null;
        }

        // Single-skill confirmation
        if (materialId && enriched.length === 1) {
          setPickerData({ mode, singleSkill: enriched[0], materialName: materialName });
          return;
        }

        // Zero-skill edge case
        if (materialId && enriched.length === 0) {
          setPickerData({ mode, empty: true, message: 'No skills extracted from "' + (materialName || 'this material') + '" yet.' });
          return;
        }

        // Normal and material-filtered multi-skill
        if (materialId) {
          setPickerData({ mode, items: enriched, materialFilter: { id: materialId, name: materialName }, allItems: allEnriched });
        } else {
          setPickerData({ mode, items: enriched });
        }
      } else if (mode === "exam") {
        var mats = (active.materials || []).filter(m => (m.chunks || []).some(c => c.status === "extracted"));
        if (!mats.length) {
          setPickerData({ mode, empty: true, message: "No extracted materials found. Extract skills from your course materials first." });
          return;
        }
        // Auto-select materials based on nearest exam scope
        var preSelected = new Set();
        try {
          var examSchedule = await CourseSchedule.getByCourse(active.id);
          var examNow = Math.floor(Date.now() / 1000);
          var nearestExam = null;
          for (var ew of examSchedule) {
            var ewExams = JSON.parse(ew.exams || "[]");
            for (var eex of ewExams) {
              if (!eex.date || !eex.coversWeeks?.length) continue;
              var eEpoch = Math.floor(new Date(eex.date).getTime() / 1000);
              if (isNaN(eEpoch) || eEpoch <= examNow) continue;
              if (!nearestExam || eEpoch < nearestExam.epoch) {
                nearestExam = { ...eex, epoch: eEpoch };
              }
            }
          }
          if (nearestExam && nearestExam.coversWeeks.length > 0) {
            var readingSet = new Set();
            for (var sw of examSchedule) {
              var swn = sw.week_number || sw.weekNumber;
              if (nearestExam.coversWeeks.includes(swn)) {
                var readings = JSON.parse(sw.readings || "[]");
                readings.forEach(function (r) { readingSet.add(r.toLowerCase()); });
              }
            }
            if (readingSet.size > 0) {
              for (var em of mats) {
                var emName = em.name.toLowerCase();
                for (var reading of readingSet) {
                  if (emName.includes(reading) || reading.includes(emName)) {
                    preSelected.add(em.id);
                    break;
                  }
                }
              }
            }
          }
        } catch (e) { console.error("Exam scope auto-selection failed:", e); }
        setPickerData({ mode, materials: mats, selectedMats: preSelected });
      }
    } catch (e) {
      console.error("Picker load failed:", e);
      setPickerData({ mode, empty: true, message: "Failed to load data: " + e.message });
    }
  };

  // --- Boot with focused context ---
  const bootWithFocus = async (focus) => {
    if (!active) return;
    if (screen !== "study") navigateTo("study");
    setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
    var _skillName = focus.type === "skill" ? (focus.skill?.name || "") : (focus.type === "assignment" ? (focus.assignment?.title || "") : "");
    var _skillDesc = focus.type === "skill" ? (focus.skill?.description || "") : "";
    var _lang = detectLanguage(active.name, _skillName, _skillDesc);
    if (_lang) {
      setInputMode("code"); setDetectedLanguage(_lang);
    } else if (detectMathSubject(active.name, _skillName, _skillDesc)) {
      setInputMode("math");
    }
    try {
      const skills = await loadSkillsV2(active.id);
      const journalRows = await JournalEntries.getByCourse(active.id);
      const journal = journalRows.reverse().map(r => { try { return typeof r.entry_data === 'string' ? JSON.parse(r.entry_data) : r.entry_data; } catch { return null; } }).filter(Boolean);
      // For assignment mode, inject initial questionStatus (all locked) so buildFocusedContext can redact question text
      var bootFocus = focus;
      if (focus.type === "assignment" && focus.assignment?.questions) {
        var initStatus = {};
        for (var iq of focus.assignment.questions) { initStatus[iq.id] = "locked"; }
        bootFocus = { ...focus, questionStatus: initStatus };
      }
      const ctxResult = await buildFocusedContext(active.id, active.materials, bootFocus, skills);
      const ctx = ctxResult.ctx;

      // modeHint is set below and added to cache after it's built
      var _cachedBase = { ctx, skills, journal, focus, chunkIds: ctxResult.chunkIds };

      var studentContext = "";
      if (Array.isArray(skills) && skills.length > 0) {
        const now = new Date();
        const today = now.toISOString().split("T")[0];
        const dueForReview = skills.map(s => {
          const reviewDate = nextReviewDate(s);
          return { ...s, reviewDate, strength: effectiveStrength(s) };
        }).filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today));
        const weakSkills = skills.map(s => ({ ...s, strength: effectiveStrength(s) })).filter(s => s.strength < 0.4 && s.strength > 0);
        const solidSkills = skills.map(s => ({ ...s, strength: effectiveStrength(s) })).filter(s => s.strength >= 0.7);

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
      if (focus.type === "assignment") {
        var qs = (focus.assignment.questions || []).map(q => ({
          id: q.id, description: q.description, difficulty: q.difficulty,
          requiredSkills: q.requiredSkills || [],
          answer: "", status: "locked"
        }));
        setAsgnWork({ questions: qs, currentIdx: 0 });
        userMsg = "I want to work on: " + focus.assignment.title;
        modeHint = "\n\nMODE: ASSIGNMENT WORK.\n\nQUESTION VISIBILITY RULES:\n- LOCKED questions have their text HIDDEN from you. You cannot see them and must not guess at them.\n- You can ONLY see question text after it is unlocked via the mastery gate.\n- The student CANNOT see questions until you unlock them with [UNLOCK_QUESTION].\n- Your job is to teach the prerequisite SKILLS listed for each locked question. Teach the CONCEPTS, not the assignment task.\n- Do NOT try to infer, reconstruct, or paraphrase what a locked question might ask. You do not have that information.\n\nBAD vs GOOD example:\n  Assignment question: \"Implement a binary search algorithm\"\n  BAD (asking the assignment question): \"How would you implement binary search?\"\n  GOOD (teaching the prerequisite skill): \"What property of a sorted array lets us skip checking every element?\"\n\nFLOW:\n1. Look at the FIRST locked question's required skills. Check the student's strength on those skills in the REQUIRED SKILLS section.\n2. If ANY required skill is below 50% strength, teach that skill first. Ask diagnostic questions about the CONCEPT, not about the assignment task. Mix retrieval practice with elaborative interrogation — ask 'why does this work?' and 'what would happen if we changed X?'\n3. After EVERY teaching exchange where the student demonstrates (or fails to demonstrate) understanding, emit a [SKILL_UPDATE] tag rating what they showed. Use the facet keys from the FACETS section if available, otherwise rate at skill level. This is CRITICAL: your [SKILL_UPDATE] ratings are the ONLY way the system tracks mastery. The unlock gate reads your ratings to compute a mastery score. If you do not rate, the score stays at 0% and questions can NEVER be unlocked — no matter how well the student performs.\n4. When you believe the student has demonstrated competence on ALL skills needed for the question, attempt to unlock it:\n   [UNLOCK_QUESTION]" + (qs[0]?.id || "q1") + "[/UNLOCK_QUESTION]\n   The system checks the mastery score (requires >=60% average retrievability). If the score is still too low, the unlock will be REJECTED and you will receive a system note explaining which skill fell short. Continue teaching that skill, emit more [SKILL_UPDATE] ratings as the student improves, then try unlocking again.\n5. After unlocking, the student sees the question and a text box for their answer. They will submit their answer for your review.\n   - NEVER state the answer to the assignment question, even as a \"check\" or \"for reference.\"\n   - NEVER say \"the correct answer is...\" or \"you should write...\" or similar.\n   - If they ask what to write: \"What do you think, based on what we just covered?\"\n   - Guide their THINKING, not their writing. Help them reason toward the answer, not transcribe yours.\n6. When the student completes a question, move to the next locked question's required skills. Start from step 1 for the new question.\n\nStart by checking the first question's prerequisite skills. Your opening question should test a CONCEPT — not describe or hint at the assignment task.\n\nQuestion order: " + qs.map(q => q.id).join(", ") + "\nUse the exact question ID in the unlock tag.\n\nANSWER ASSESSMENT:\nWhen you receive [ANSWER_SUBMISSION q=\"qN\"]...[/ANSWER_SUBMISSION], assess the student's answer:\n1. Compare against the question's required skills and your knowledge of correct answers.\n2. Emit a [SKILL_UPDATE] tag rating the relevant skills/facets based on answer quality. (Same format as during teaching — this updates the student's mastery score.)\n3. If the answer demonstrates sufficient understanding:\n   - Respond with [ANSWER_ACCEPTED]qN[/ANSWER_ACCEPTED]\n   - Give brief positive feedback (1-2 sentences, specific to what they got right).\n4. If the answer is incomplete or incorrect:\n   - Do NOT include [ANSWER_ACCEPTED]. Do NOT reveal the correct answer.\n   - Identify the specific gap or misconception.\n   - Ask a targeted question to guide the student toward the fix.\n   - The student can revise and resubmit.\n5. Never write the answer for the student. Even if they're close, guide them to the last step themselves.\n\nANSWER REVISION PROTOCOL:\nWhen a submitted answer is incorrect or incomplete:\n- Your feedback should identify WHAT is wrong or missing, not WHAT the answer should be.\n- BAD: \"You need to add X to your answer.\"\n- GOOD: \"Look at your second step -- what assumption are you making about [concept]?\"\n- After 2+ revision cycles on the same question, DO NOT escalate detail. Instead:\n  - Step back to the prerequisite concept.\n  - Ask a diagnostic question about the underlying principle.\n  - Once they demonstrate the principle, redirect them back to their answer.\n- Maximum 4 revision cycles. After 4, tell the student: \"Let's move on and come back to this one later with fresh eyes.\" Leave the question unlocked but move teaching to the next question's skills.";
      } else if (focus.type === "skill") {
        userMsg = "I want to work on: " + focus.skill.name;
        modeHint = "\n\nMODE: SKILL MASTERY. The student chose this specific skill to strengthen. You have the skill details and source material loaded. Start by asking a diagnostic question to find where their understanding breaks down. Mix retrieval practice with elaborative interrogation — ask 'why does this work?' and 'what would happen if we changed X?'";
      } else if (focus.type === "exam") {
        var matNames = (focus.materials || []).map(m => m.name || m).join(", ");
        userMsg = "I'm preparing for an exam covering: " + matNames;
        modeHint = "\n\nMODE: EXAM PREPARATION. The student is preparing for an exam covering the selected materials. Use interleaved practice across topics. Ask questions that test understanding at increasing difficulty. Focus on common exam question formats. Identify weak areas and drill them. Mix retrieval practice with elaborative interrogation.";
      }

      cachedSessionCtx.current = { ..._cachedBase, modeHint: modeHint || "" };
      const sysPrompt = buildSystemPrompt(active.name, ctx, journal, modeHint);
      const bootSystem = sysPrompt + studentContext + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";
      sessionStartTime.current = Date.now();
      const userTs = Date.now();
      setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: "", ts: userTs }]);
      const response = await callClaudeStream(bootSystem, [{ role: "user", content: userMsg }], function(partial) {
        setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: partial, ts: userTs }]);
      });
      const asstTs = Date.now();
      setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: response, ts: asstTs }]);
      sessionStartIdx.current = 0;
      await Messages.appendBatch(chatSessionId.current, [{ role: "user", content: userMsg }, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Boot failed:", err);
      addNotif("error", "Failed to start session: " + err.message);
      setFocusContext(null);
      setMsgs([]);
      setPickerData({ error: true, message: "Failed to start session: " + err.message });
    }
    setBooting(false); setStatus("");
  };

  // --- Send Message ---
  const sendMessage = async (overrideContent) => {
    if (overrideContent) {
      // Direct message injection (e.g., from AssignmentPanel answer submission)
      if (busy || !active) return;
    } else {
      if (!input.trim() || busy || !active) return;
    }
    skillNotifQueue.current = [];
    clearTimeout(skillNotifTimers.current.hold);
    clearTimeout(skillNotifTimers.current.clear);
    setCurrentSkillNotif(null);
    const raw = overrideContent || (inputMode === "code" ? input.trimEnd() : input.trim());
    const userMsg = overrideContent || (inputMode === "code" ? "```\n" + raw + "\n```" : raw);
    const isCode = !overrideContent && inputMode === "code";
    if (!overrideContent) {
      setInput("");
      if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.overflowY = 'hidden'; }
    }
    const userTs = Date.now();
    const newMsgs = [...msgs, { role: "user", content: userMsg, ts: userTs, codeMode: isCode, detectedLanguage: isCode ? detectedLanguage : null }];
    setMsgs([...newMsgs, { role: "assistant", content: "", ts: userTs }]); setBusy(true);

    try {
      let ctx, skills, journal;
      var contextChunkIds = [];
      if (cachedSessionCtx.current && focusContext) {
        ctx = cachedSessionCtx.current.ctx;
        skills = cachedSessionCtx.current.skills;
        journal = cachedSessionCtx.current.journal;
        contextChunkIds = cachedSessionCtx.current.chunkIds || [];
      } else {
        skills = await loadSkillsV2(active.id);
        var jRows = await JournalEntries.getByCourse(active.id);
        journal = jRows.reverse().map(r => { try { return typeof r.entry_data === 'string' ? JSON.parse(r.entry_data) : r.entry_data; } catch { return null; } }).filter(Boolean);
        if (focusContext && (focusContext.type === "assignment" || focusContext.type === "skill" || focusContext.type === "exam")) {
          var rebuildFocus = focusContext;
          if (focusContext.type === "assignment" && asgnWork) {
            var statusMap = {};
            for (var aq of asgnWork.questions) { statusMap[aq.id] = aq.status; }
            rebuildFocus = { ...focusContext, questionStatus: statusMap };
          }
          var focusResult = await buildFocusedContext(active.id, active.materials, rebuildFocus, skills);
          ctx = focusResult.ctx;
          contextChunkIds = focusResult.chunkIds;
        } else {
          const asgn = await loadAssignmentsCompat(active.id) || [];
          var generalResult = await buildContext(active.id, active.materials, skills, asgn, newMsgs, discussedChunks.current);
          ctx = generalResult.ctx;
          contextChunkIds = generalResult.chunkIds;
        }
      }

      const sysPrompt = buildSystemPrompt(active.name, ctx, journal, cachedSessionCtx.current?.modeHint || "");
      const chatMsgs = newMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

      // Inject unlock rejection as a system-context message if pending
      if (unlockRejectionRef.current) {
        chatMsgs.push({ role: "user", content: "[SYSTEM NOTE — not from student] " + unlockRejectionRef.current });
        unlockRejectionRef.current = null;
      }

      const response = await callClaudeStream(sysPrompt, chatMsgs, function(partial) {
        setMsgs([...newMsgs, { role: "assistant", content: partial, ts: userTs }]);
      });

      const asstTs = Date.now();
      const updates = parseSkillUpdates(response);
      if (updates.length) {
        var intentWeights = { assignment: 1.0, exam: 0.8, skills: 1.0 };
        var intentWeight = intentWeights[sessionMode] || 1.0;
        var newMasteryEvents = await applySkillUpdates(active.id, updates, intentWeight, sessionMasteredSkills.current, chatSessionId.current, contextChunkIds) || [];
        sessionSkillLog.current.push(...updates);

        // Accumulate facet-level updates for session summary
        for (var u of updates) {
          if (u.facets && u.facets.length > 0) {
            for (var fu of u.facets) {
              sessionFacetUpdates.current.push({ facetKey: fu.facetKey, skillId: u.skillId, rating: fu.rating });
            }
          }
        }

        // Handle mastery events
        var masteredSkillIds = new Set();
        if (newMasteryEvents.length > 0) {
          for (var me of newMasteryEvents) {
            me.messageIndex = newMsgs.length; // index of the assistant message
            sessionMasteryEvents.current.push(me);
            sessionMasteredSkills.current.add(me.skillId);
            masteredSkillIds.add(me.skillId);
            masteredSkillIds.add(me.conceptKey);
            addNotif("mastery", me.skillName + " → Lv " + me.levelAfter);
          }
        }

        // Notifications for regular skill updates (skip skills that triggered mastery)
        for (var u2 of updates) {
          if (!masteredSkillIds.has(u2.skillId)) {
            addNotif("skill", u2.skillId + ": " + u2.rating + (u2.context !== 'guided' ? " (" + u2.context + ")" : ""));
          }
        }

        // Enqueue InputBar skill notifications (max 3) — start first directly to avoid null→null no-op
        var fmtKey = function(k) { return k.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }); };
        var notifItems = updates.slice(0, 3).map(function(u) {
          var allSk = cachedSessionCtx.current?.skills || [];
          var sk = allSk.find(function(s) { return s.id === u.skillId || s.conceptKey === u.skillId; });
          return { skillName: sk?.name || fmtKey(u.skillId), skillId: u.skillId, rating: u.rating, facetCount: u.facets?.length || 0 };
        });
        if (notifItems.length > 0) {
          clearTimeout(skillNotifTimers.current.hold);
          clearTimeout(skillNotifTimers.current.clear);
          var first = notifItems.shift();
          skillNotifQueue.current = notifItems;
          setCurrentSkillNotif({ ...first, phase: "in" });
          skillNotifTimers.current.hold = setTimeout(function() {
            setCurrentSkillNotif(function(prev) { return prev ? { ...prev, phase: "out" } : null; });
          }, 2300);
          skillNotifTimers.current.clear = setTimeout(function() {
            setCurrentSkillNotif(null);
          }, 2600);
        }

        if (cachedSessionCtx.current) {
          var updatedSkills = await loadSkillsV2(active.id);
          var updateFocus = focusContext;
          if (focusContext.type === "assignment" && asgnWork) {
            var statusMap2 = {};
            for (var aq2 of asgnWork.questions) { statusMap2[aq2.id] = aq2.status; }
            updateFocus = { ...focusContext, questionStatus: statusMap2 };
          }
          var updatedCtxResult = await buildFocusedContext(active.id, active.materials, updateFocus, updatedSkills);
          var updatedCtx = updatedCtxResult.ctx;
          var recentKw = extractKeywords(newMsgs.slice(-12), 10);
          var skillsSoFar = sessionSkillLog.current.map(s => s.skillId + ":" + s.rating).join(", ");
          if (recentKw.length || skillsSoFar) {
            updatedCtx += "\n\nSESSION CONTEXT SO FAR:";
            if (recentKw.length) updatedCtx += "\nTopics discussed: " + recentKw.join(", ");
            if (skillsSoFar) updatedCtx += "\nSkills assessed: " + skillsSoFar;
          }
          cachedSessionCtx.current = { ...cachedSessionCtx.current, skills: updatedSkills, ctx: updatedCtx, chunkIds: updatedCtxResult.chunkIds };
        }
      }

      // Parse INPUT_MODE tag from AI response
      var parsedMode = parseInputMode(response);
      if (parsedMode) {
        setInputMode(parsedMode.mode);
        if (parsedMode.language) setDetectedLanguage(parsedMode.language);
      }

      const unlockId = parseQuestionUnlock(response);
      if (unlockId && asgnWork) {
        // Data-driven unlock gate: check FSRS mastery before honoring
        var targetQ = asgnWork.questions.find(q => q.id === unlockId);
        var unlockAllowed = true;
        var rejectionReason = null;

        if (targetQ && targetQ.requiredSkills.length > 0) {
          var resolvedSkillIds = targetQ.requiredSkills.map(function(sid) {
            var sk = cachedSessionCtx.current?.skills?.find(
              s => s.id === sid || s.conceptKey === sid
            );
            return sk ? sk.id : null;
          }).filter(Boolean);

          if (resolvedSkillIds.length > 0) {
            var readinessMap = await computeFacetReadiness(resolvedSkillIds);

            for (var rsid of resolvedSkillIds) {
              var readiness = readinessMap.get(rsid);
              if (readiness === undefined) {
                var skName = cachedSessionCtx.current?.skills?.find(s => s.id === rsid)?.name || rsid;
                unlockAllowed = false;
                rejectionReason = skName + " has no mastery data yet — facet coverage gap";
                break;
              }
              if (readiness < UNLOCK_MASTERY_THRESHOLD) {
                var skName2 = cachedSessionCtx.current?.skills?.find(s => s.id === rsid)?.name || rsid;
                unlockAllowed = false;
                rejectionReason = skName2 + " is at " + Math.round(readiness * 100) + "% mastery, below the " + Math.round(UNLOCK_MASTERY_THRESHOLD * 100) + "% threshold";
                break;
              }
            }
          }
        }

        if (unlockAllowed) {
          setAsgnWork(prev => {
            if (!prev) return prev;
            var updated = { ...prev, questions: prev.questions.map(q =>
              q.id === unlockId ? { ...q, status: "unlocked" } : q
            )};
            var idx = updated.questions.findIndex(q => q.id === unlockId);
            if (idx >= 0) updated.currentIdx = idx;
            return updated;
          });
        } else {
          unlockRejectionRef.current = "Unlock rejected for " + unlockId + " — " + rejectionReason + ". Continue teaching the required skills. Do not attempt to unlock again until the student demonstrates stronger mastery.";
        }
      }

      // Answer assessment: check for [ANSWER_ACCEPTED] or revision needed
      const acceptedId = parseAnswerResult(response);
      if (acceptedId && asgnWork) {
        setAsgnWork(prev => {
          if (!prev) return prev;
          return { ...prev, questions: prev.questions.map(q =>
            q.id === acceptedId ? { ...q, status: "accepted" } : q
          )};
        });
      } else if (asgnWork) {
        setAsgnWork(prev => {
          if (!prev) return prev;
          var hasSubmitted = prev.questions.some(q => q.status === "submitted");
          if (!hasSubmitted) return prev;
          return { ...prev, questions: prev.questions.map(q =>
            q.status === "submitted" ? { ...q, status: "unlocked" } : q
          )};
        });
      }

      const finalMsgs = [...newMsgs, { role: "assistant", content: response, ts: asstTs }];
      setMsgs(finalMsgs); setBusy(false);
      await Messages.appendBatch(chatSessionId.current, [{ role: "user", content: userMsg, inputMode: isCode ? 'code' : null }, { role: "assistant", content: response }]);
    } catch (e) {
      console.error("sendMessage error:", e);
      const errorMsgs = [...newMsgs, { role: "assistant", content: "Sorry, something went wrong: " + e.message, ts: Date.now() }];
      setMsgs(errorMsgs); setBusy(false);
      addNotif("error", "Message failed: " + e.message);
    }
  };

  // --- Delete Course ---
  const delCourse = async (id) => {
    if (globalLock) return;
    setGlobalLock({ message: "Deleting course..." });
    try {
      // Clean up images (DB rows + filesystem) before cascade delete
      try {
        const { deleteCourseImages } = await import('./lib/imageStore.js');
        const courseMats = courses.find(c => c.id === id)?.materials || [];
        await MaterialImages.deleteByCourse(id);
        await deleteCourseImages(courseMats.map(m => m.id));
      } catch (e) { console.warn('[ImageCleanup] Course:', e); }
      await Courses.delete(id);
      setCourses(p => p.filter(c => c.id !== id));
      if (active?.id === id) { setActive(null); resetNav("home"); }
    } catch (e) {
      addNotif("error", "Failed to delete course: " + e.message);
    } finally { setGlobalLock(null); }
  };

  // --- Add Materials ---
  const addMats = async () => {
    if (!active || !files.length || files.some(f => !f.classification) || globalLock || bgExtraction) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    if (validFiles.length === 0) return;
    setGlobalLock({ message: "Adding materials..." });
    setStatus("Storing new materials...");

    let trulyNew;
    try {
    // === PHASE 1 (blocking): store docs, parse syllabi, mark assignment chunks ===
    const newMeta = [];
    for (let i = 0; i < validFiles.length; i++) {
      const f = validFiles[i];
      setStatus("Storing: " + f.name + "...");
      const mat = await storeAsChunks(active.id, f, "doc-add-" + i + "-" + Date.now());
      var failedChunks = mat.chunks.filter(c => c.status === "failed").length;
      if (failedChunks > 0) {
        addNotif("error", failedChunks + " of " + mat.chunks.length + " chunks failed for \"" + f.name + "\".");
      }
      // Extract images (non-blocking — failure does not stop upload)
      if (!mat._deduplicated) {
        try {
          const { extractAndStoreImages } = await import('./lib/imageExtractor.js');
          await extractAndStoreImages(active.id, mat, f, { onStatus: setStatus });
        } catch (e) { console.warn('[ImageExtract] Failed for', f.name, e); }
      }
      newMeta.push(mat);
    }

    const dedupNames = newMeta.filter(m => m._deduplicated).map(m => m.name);
    if (dedupNames.length > 0) {
      setDuplicateAlert(dedupNames);
    }
    trulyNew = newMeta.filter(m => !m._deduplicated);

    const updatedCourse = { ...active, materials: [...active.materials, ...trulyNew] };
    const updatedCourses = courses.map(c => c.id === active.id ? updatedCourse : c);
    await saveCoursesNested(updatedCourses);
    for (const mat of trulyNew) {
      const pendingDocs = mat._pendingDocs || [];
      for (const pd of pendingDocs) {
        await Chunks.updateContent(pd.chunkId, typeof pd.doc === 'string' ? pd.doc : JSON.stringify(pd.doc));
      }
      if (pendingDocs.length > 0) {
        try { await computeAndStoreFingerprints(mat.id); } catch (e) { console.warn('[MinHash] Fingerprint failed:', e); }
      }
      delete mat._pendingDocs;
    }
    setCourses(updatedCourses); setActive(updatedCourse); setFiles([]);

    if (!active.syllabus_parsed) {
      var syllabusMats2 = trulyNew.filter(m => m.classification === "syllabus" && (m.chunks || []).length > 0);
      for (const syllMat of syllabusMats2) {
        setStatus("Parsing syllabus: " + syllMat.name + "...");
        try {
          const { content: fullText } = await getMatContent(active.id, syllMat);
          if (fullText && fullText.trim()) {
            const syllResult = await parseSyllabus(active.id, fullText, { onStatus: setStatus });
            if (syllResult.success) {
              addNotif("success", "Syllabus processed — " + syllResult.weeksFound + " weeks, " + syllResult.assignmentsCreated + " assignment(s) found.");
              var syllChunkIds2 = (syllMat.chunks || []).map(c => c.id).filter(Boolean);
              if (syllChunkIds2.length) await Chunks.updateStatusBatch(syllChunkIds2, "extracted");
            } else {
              addNotif("warn", "Syllabus parsed with issues: " + syllResult.issues.map(i => i.message).join("; "));
            }
          }
        } catch (e) {
          console.error("Syllabus parsing failed:", e);
          addNotif("warn", "Could not parse syllabus: " + e.message);
        }
      }
    }

    var asgnMats2 = trulyNew.filter(m => m.classification === "assignment" && (m.chunks || []).length > 0);
    for (const asgnMat of asgnMats2) {
      var asgnChunkIds2 = (asgnMat.chunks || []).map(c => c.id).filter(Boolean);
      if (asgnChunkIds2.length) await Chunks.updateStatusBatch(asgnChunkIds2, "extracted");
    }
    } catch (err) {
      console.error("Adding materials failed:", err);
      addNotif("error", "Failed to add materials: " + err.message);
      setGlobalLock(null); setStatus("");
      return;
    }

    // Phase 1 complete — unblock UI
    setGlobalLock(null); setStatus("");

    // === PHASE 2 (non-blocking): skill extraction ===
    var extractable = trulyNew.filter(m => m.classification !== "assignment" && m.classification !== "syllabus" && (m.chunks || []).length > 0);
    if (extractable.length > 0) {
      addNotif("success", "Materials added. Extracting skills in the background...");
      extractionCancelledRef.current = false;
      setBgExtraction({
        courseId: active.id,
        materials: extractable.map(m => ({
          id: m.id, name: m.name, status: 'pending',
          chaptersTotal: null, chaptersComplete: 0, error: null,
        })),
        startedAt: Date.now(),
      });
      runBackgroundExtraction(active.id, extractable);
    } else {
      const totalSections = trulyNew.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
      addNotif("success", "Added " + trulyNew.length + " file(s) with " + totalSections + " section(s).");

      // If only assignments were uploaded, try to decompose them directly
      var newAsgnMats = trulyNew.filter(m => m.classification === "assignment");
      if (newAsgnMats.length > 0) {
        try {
          var allMats = active.materials.concat(trulyNew);
          var sk = await loadSkillsV2(active.id);
          if (sk.length > 0) {
            await decomposeAssignments(active.id, allMats, sk, () => {});
            addNotif("success", "Assignments decomposed.");
          }
        } catch (e) {
          console.warn("[addMats] Assignment decomposition failed:", e);
        }
      }
    }
  };

  // --- Remove Material ---
  const removeMat = async (docId) => {
    if (!active || globalLock) return;
    const removedMat = active.materials.find(m => m.id === docId);
    setGlobalLock({ message: "Removing " + (removedMat?.name || "material") + "..." });
    try {
      // Clean up images (DB rows + filesystem)
      try {
        const { deleteImageDir } = await import('./lib/imageStore.js');
        await MaterialImages.deleteByMaterial(docId);
        await deleteImageDir(docId);
      } catch (e) { console.warn('[ImageCleanup] Material:', e); }
      if (removedMat?.chunks) {
        for (const ch of removedMat.chunks) {
          await Chunks.delete(ch.id);
        }
      }
      await Materials.delete(docId);
      const updatedMats = active.materials.filter(m => m.id !== docId);
      const updatedCourse = { ...active, materials: updatedMats };
      const updatedCourses = courses.map(c => c.id === active.id ? updatedCourse : c);
      await saveCoursesNested(updatedCourses);
      setCourses(updatedCourses);
      setActive(updatedCourse);
      addNotif("success", "Removed: " + (removedMat?.name || "material"));
    } catch (e) {
      addNotif("error", "Failed to remove material: " + e.message);
    } finally {
      setGlobalLock(null);
    }
  };

  const retryAllFailed = async () => {
    if (!active || bgExtraction) return;
    var retryable = active.materials.filter(mat => {
      var chunks = mat.chunks || [];
      if (chunks.length === 0) return false;
      return chunks.some(c => c.status === "pending" || c.status === "error");
    });
    if (retryable.length === 0) { addNotif("info", "No materials need retry."); return; }
    extractionCancelledRef.current = false;
    setBgExtraction({
      courseId: active.id,
      materials: retryable.map(m => ({
        id: m.id, name: m.name, status: 'pending',
        chaptersTotal: null, chaptersComplete: 0, error: null,
      })),
      startedAt: Date.now(),
    });
    runBackgroundExtraction(active.id, retryable);
  };

  // --- Update handlers ---
  const checkUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
      } else {
        addNotif("info", "You're on the latest version.");
      }
    } catch (e) {
      console.error("Update check failed:", e);
      addNotif("error", "Update check failed: " + (e.message || e));
    }
    setUpdateStatus(null);
  }, []);

  const doInstallUpdate = useCallback(async () => {
    if (!updateInfo?.update) return;
    setUpdateStatus("downloading");
    try {
      await installAppUpdate(updateInfo.update, (event) => {
        if (event.event === "Started") setUpdateStatus("installing");
      });
    } catch (e) {
      console.error("Update install failed:", e);
      addNotif("error", "Update failed: " + (e.message || e));
      setUpdateStatus(null);
    }
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => { setUpdateInfo(null); }, []);

  // Expose everything through context — useMemo prevents re-creating the value object
  // on every render. Only state variables are dependencies; setters, refs, useCallback
  // handlers, and lib re-exports have stable identity and are excluded.
  const value = useMemo(() => ({
    // State
    asyncError, setAsyncError, showAsyncNuclear, setShowAsyncNuclear,
    screen, setScreen, navigateTo, goBack, resetNav,
    courses, setCourses, active, setActive, ready,
    showSettings, setShowSettings, apiKeyLoaded, setApiKeyLoaded,
    apiKeyInput, setApiKeyInput, keyVerifying, setKeyVerifying, keyError, setKeyError,
    files, setFiles, cName, setCName, drag, setDrag, parsing,
    msgs, setMsgs, input, setInput, inputMode, setInputMode, detectedLanguage,
    exporting, setExporting, busy, setBusy, booting, setBooting,
    status, setStatus, processingMatId, setProcessingMatId,
    errorLogModal, setErrorLogModal,
    globalLock, setGlobalLock, lockElapsed, dupPrompt, bgExtraction, setBgExtraction, currentSkillNotif,
    showManage, _setShowManage, showSkills, setShowSkills,
    skillViewData, setSkillViewData, expandedCats, setExpandedCats,
    pendingConfirm, setPendingConfirm,
    notifs, setNotifs, showNotifs, _setShowNotifs,
    lastSeenNotif, setLastSeenNotif,
    extractionErrors, setExtractionErrors,
    duplicateAlert, setDuplicateAlert,
    sessionMode, setSessionMode, focusContext, setFocusContext,
    pickerData, setPickerData, chunkPicker, setChunkPicker,
    asgnWork, setAsgnWork, practiceMode, setPracticeMode,
    profileData, setProfileData,
    expandedProfile, setExpandedProfile, expandedSubSkill, setExpandedSubSkill,
    materialSkillCounts, expandedMaterial, setExpandedMaterial,
    sessionSummary, setSessionSummary,
    sessionElapsed, setSessionElapsed, breakDismissed, setBreakDismissed,
    sidebarCollapsed, setSidebarCollapsed,
    updateInfo, updateStatus, checkUpdate, doInstallUpdate, dismissUpdate,
    // Refs (stable identity)
    endRef, taRef, fiRef, sessionStartIdx, sessionSkillLog,
    sessionMasteryEvents, sessionFacetUpdates, sessionMasteredSkills,
    cachedSessionCtx, extractionCancelledRef, sessionStartTime, discussedChunks,
    // Handlers
    addNotif, getMaterialState, computeTrustSignals, refreshMaterialSkillCounts,
    timeAgo, filterDuplicates, saveSessionToJournal, clearSessionState,
    onDrop, onSelect, classify, removeF, importFromFolder, confirmFolderImport,
    folderImportData, setFolderImportData,
    createCourse, quickCreateCourse, loadProfile, enterStudy,
    selectMode, bootWithFocus, sendMessage,
    delCourse, addMats, removeMat, retryAllFailed,
    // Re-exports from lib (stable identity)
    CLS, getApiKey, setApiKey: setApiKey, getDb, Courses,
    loadSkillsV2, runExtractionV2,
    generateSubmission, downloadBlob,
    effectiveStrength, nextReviewDate, strengthToTier, masteryConfidence,
    currentRetrievability, TIERS,
    createPracticeSet, generateProblems, evaluateAnswer, completeTierAttempt,
    loadPracticeMaterialCtx, renderMd: null, // renderMd imported directly by screens from theme.jsx
    testApiKey,
  }), [ // eslint-disable-line react-hooks/exhaustive-deps -- setters, refs, callbacks, and lib re-exports are stable
    asyncError, showAsyncNuclear,
    screen, navStack, courses, active, ready,
    showSettings, apiKeyLoaded, apiKeyInput, keyVerifying, keyError,
    files, cName, drag, parsing,
    msgs, input, inputMode, detectedLanguage, exporting, busy, booting,
    status, processingMatId, errorLogModal,
    globalLock, lockElapsed, dupPrompt, bgExtraction, currentSkillNotif,
    showManage, showSkills, skillViewData, expandedCats,
    pendingConfirm, notifs, showNotifs, lastSeenNotif,
    extractionErrors, duplicateAlert, sessionMode, focusContext,
    pickerData, chunkPicker, asgnWork, practiceMode,
    profileData, expandedProfile, expandedSubSkill,
    materialSkillCounts, expandedMaterial,
    sessionSummary, sessionElapsed, breakDismissed,
    sidebarCollapsed, folderImportData,
    updateInfo, updateStatus,
  ]);

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
