import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

import { CLS, autoClassify, parseFailed } from "./lib/classify.js";
import { getApiKey, setApiKey, getDb, DB, Courses, ParentSkills, SubSkills, Mastery, ChunkSkillBindings, SkillPrerequisites, Assignments, CourseSchedule } from "./lib/db.js";
import { currentRetrievability } from "./lib/fsrs.js";
import { readFile } from "./lib/parsers.js";
import { callClaude, callClaudeStream, extractJSON, testApiKey } from "./lib/api.js";
import {
  storeAsChunks, decomposeAssignments, loadSkillsV2, runExtractionV2, getMatContent
} from "./lib/skills.js";
import { parseSyllabus } from "./lib/syllabusParser.js";
import { migrateV1ToV2, migrateAssignmentBlobs } from "./lib/migrate.js";
import { seedCipTaxonomy } from "./lib/cipSeeder.js";
import { generateSubmission, downloadBlob } from "./lib/export.js";
import {
  effectiveStrength, nextReviewDate, applySkillUpdates, masteryConfidence,
  buildContext, buildFocusedContext, generateSessionEntry,
  formatJournal, buildSystemPrompt, parseQuestionUnlock,
  parseSkillUpdates, extractKeywords, detectLanguage, TIERS, strengthToTier,
  createPracticeSet, generateProblems, evaluateAnswer,
  completeTierAttempt, loadPracticeMaterialCtx
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

export function StudyProvider({ children, setErrorCtx }) {
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
  const [codeMode, setCodeMode] = useState(false);
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

  const endRef = useRef(null);
  const taRef = useRef(null);
  const fiRef = useRef(null);
  const sessionStartIdx = useRef(0);
  const sessionSkillLog = useRef([]);
  const cachedSessionCtx = useRef(null);
  const extractionCancelledRef = useRef(false);
  const coursesLoaded = useRef(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const sessionStartTime = useRef(null);
  const discussedChunks = useRef(new Set());
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
    if (chunks.length === 0) return "reading";
    const pending = chunks.filter(c => c.status === "pending").length;
    const failed = chunks.filter(c => c.status === "failed").length;
    const extracted = chunks.filter(c => c.status === "extracted").length;
    const sc = materialSkillCounts[mat.id];
    if (pending > 0) return (sc && sc.count > 0) ? "extracting" : "analyzing";
    if (failed > 0) {
      const permanent = chunks.filter(c => c.status === "failed" && (c.failCount || 0) >= 2).length;
      if (permanent === chunks.length) return "critical_error";
      if (failed > chunks.length * 0.25) return "error";
    }
    if (extracted > 0 && sc && sc.count > 0) return "ready";
    if (extracted > 0 && (!sc || sc.count === 0)) return "extracting";
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
        const loaded = await DB.getCourses();
        if (cancelled) return;
        setCourses(loaded);
        coursesLoaded.current = true;
        // Migrate assignment blobs → tables (non-fatal)
        try {
          const migResult = await migrateAssignmentBlobs(loaded);
          if (migResult.migrated > 0) console.log(`[Init] Migrated ${migResult.migrated} assignment blob(s)`);
        } catch (e) { console.error("Assignment blob migration failed:", e); }
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

  useEffect(() => { if (ready && !globalLock && !asyncError && coursesLoaded.current) { var t = setTimeout(() => DB.saveCourses(courses).catch(e => console.error("Auto-save courses failed:", e)), 500); return () => clearTimeout(t); } }, [courses, ready, globalLock, asyncError]);

  // Prevent browser default of opening dropped files
  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => { document.removeEventListener("dragover", prevent); document.removeEventListener("drop", prevent); };
  }, []);

  useEffect(() => { if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (taRef.current) { if (codeMode) { taRef.current.style.height = ""; } else { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 150) + "px"; } } }, [input, codeMode]);

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
  const filterDuplicates = (newFiles) => {
    const existingNames = new Set(files.map(f => f.name));
    if (active) for (const m of active.materials || []) existingNames.add(m.name);
    const unique = [];
    for (const f of newFiles) {
      if (existingNames.has(f.name)) {
        addNotif("warn", "Skipped duplicate: " + f.name);
      } else {
        existingNames.add(f.name);
        unique.push(f);
      }
    }
    return unique;
  };

  const onDrop = useCallback(async (e) => {
    e.preventDefault(); setDrag(false);
    const fl = Array.from(e.dataTransfer.files);
    setParsing(true);
    const parsed = await Promise.all(fl.map(readFile));
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
    const parsed = await Promise.all(fl.map(readFile));
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

  // --- Course Creation ---
  const createCourse = async () => {
    if (!cName.trim() || !files.length || files.some(f => !f.classification)) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    setGlobalLock({ message: "Creating course..." });
    setBusy(true);
    setStatus("Storing documents...");

    try {
      const courseId = await Courses.create({ name: cName.trim() });
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
      for (const mat of mats) {
        for (const pd of (mat._pendingDocs || [])) {
          await DB.saveDoc(courseId, pd.chunkId, pd.doc);
        }
        delete mat._pendingDocs;
      }
      setCourses(updated); setActive(newCourse); setFiles([]); setCName("");
      setScreen("materials");

      // --- Syllabus parsing (before skill extraction) ---
      var syllabusMats = mats.filter(m => m.classification === "syllabus" && (m.chunks || []).length > 0);
      for (const syllMat of syllabusMats) {
        setStatus("Parsing syllabus: " + syllMat.name + "...");
        try {
          const { content: fullText } = await getMatContent(courseId, syllMat);
          if (fullText && fullText.trim()) {
            const syllResult = await parseSyllabus(courseId, fullText, { onStatus: setStatus });
            if (syllResult.success) {
              addNotif("success", "Syllabus processed — " + syllResult.weeksFound + " weeks, " + syllResult.assignmentsCreated + " assignment(s) found.");
            } else {
              addNotif("warn", "Syllabus parsed with issues: " + syllResult.issues.map(i => i.message).join("; "));
            }
          }
        } catch (e) {
          console.error("Syllabus parsing failed:", e);
          addNotif("warn", "Could not parse syllabus: " + e.message);
        }
      }

      var extractable = mats.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);
      if (extractable.length > 0) {
        addNotif("success", "Course created. Processing " + extractable.length + " material(s)...");
        for (var ei = 0; ei < extractable.length; ei++) {
          setStatus("Extracting skills: " + extractable[ei].name + "...");
          setProcessingMatId(extractable[ei].id);
          try {
            await runExtractionV2(courseId, extractable[ei].id, {
              onStatus: setStatus,
              onNotif: addNotif,
              onChapterComplete: (ch, cnt) => setStatus(extractable[ei].name + " — " + ch + ": " + cnt + " skills"),
            });
          } catch (e) {
            console.error("Auto-extraction failed for", extractable[ei].name, e);
            addNotif("warn", "Could not extract skills from " + extractable[ei].name + ". You can retry from the material card.");
          }
        }
        setProcessingMatId(null);
        var refreshed2 = await DB.getCourses();
        var rc2 = refreshed2.find(c => c.id === courseId);
        if (rc2) { setCourses(refreshed2); setActive(rc2); }
        await refreshMaterialSkillCounts(courseId);
        addNotif("success", "Done! " + extractable.length + " material(s) processed.");
      } else {
        var totalSections = mats.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
        addNotif("success", "Course created with " + mats.length + " material(s) and " + totalSections + " section(s).");
      }
    } catch (err) {
      console.error("Course creation failed:", err);
      addNotif("error", "Course creation failed: " + err.message);
    } finally {
      setGlobalLock(null); setBusy(false); setStatus("");
    }
    setBooting(false); setStatus("");
  };

  const quickCreateCourse = async () => {
    if (!cName.trim()) return;
    try {
      await Courses.create({ name: cName.trim() });
      const refreshed = await DB.getCourses();
      setCourses(refreshed);
      addNotif("success", "Course created: " + cName.trim());
      setCName("");
    } catch (e) {
      addNotif("error", "Failed to create course: " + e.message);
    }
  };

  const loadProfile = async () => {
    try {
      const allParents = await ParentSkills.getAll();
      const results = [];
      const now = new Date();
      for (const parent of allParents) {
        const subs = await SubSkills.getByParent(parent.id);
        if (subs.length === 0) continue;
        const subIds = subs.map(s => s.id);
        const masteryRows = await Mastery.getBySkills(subIds);
        const masteryMap = {};
        for (const m of masteryRows) masteryMap[m.sub_skill_id] = m;

        const prereqMap = {};
        for (const sub of subs) {
          const prereqs = await SkillPrerequisites.getForSkill(sub.id);
          prereqMap[sub.id] = prereqs;
        }

        let totalPoints = 0;
        let readinessSum = 0;
        let readinessCount = 0;
        let reviewedCount = 0;
        let dueForReview = 0;
        let lastActivityDate = null;

        const enrichedSubs = subs.map(sub => {
          const m = masteryMap[sub.id];
          const fitness = typeof sub.fitness === 'string' ? JSON.parse(sub.fitness || '{}') : (sub.fitness || {});
          if (fitness.lastUsed) {
            var luDate = new Date(fitness.lastUsed);
            if (!lastActivityDate || luDate > lastActivityDate) lastActivityDate = luDate;
          }
          const evidence = typeof sub.evidence === 'string' ? JSON.parse(sub.evidence || '{}') : (sub.evidence || {});
          const rawCriteria = typeof sub.mastery_criteria === 'string' ? JSON.parse(sub.mastery_criteria || '[]') : (sub.mastery_criteria || []);
          const masteryCriteria = rawCriteria.map(c => typeof c === 'string' ? { text: c, verified: false } : c);
          const prereqs = prereqMap[sub.id] || [];

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

          return {
            id: sub.id, name: sub.name, description: sub.description,
            conceptKey: sub.concept_key, category: sub.category,
            skillType: sub.skill_type, bloomsLevel: sub.blooms_level,
            sourceCourseId: sub.source_course_id, masteryCriteria, evidence, fitness,
            confidence: masteryConfidence(fitness),
            prerequisites: prereqs.map(p => ({ id: p.prerequisite_id, name: p.name, conceptKey: p.concept_key })),
            mastery: m ? {
              retrievability, stability, difficulty: m.difficulty,
              reps: m.reps, lapses: m.lapses,
              totalMasteryPoints: m.total_mastery_points || 0,
              nextReview, isDue,
            } : null,
          };
        });

        const level = Math.floor(Math.sqrt(totalPoints));
        const nextLevelThreshold = (level + 1) * (level + 1);
        const progressToNext = totalPoints - (level * level);
        const progressNeeded = nextLevelThreshold - (level * level);

        results.push({
          parent, cipDomain: parent.cip_code ? parent.cip_code.substring(0, 2) : null,
          subSkills: enrichedSubs, masteryMap, level, progressToNext, progressNeeded,
          readiness: readinessCount > 0 ? readinessSum / readinessCount : 0,
          subCount: subs.length, reviewedCount, dueForReview, totalPoints, lastActivityDate,
        });
      }
      results.sort((a, b) => b.level - a.level);
      setProfileData(results);
    } catch (e) {
      console.error("Failed to load profile:", e);
      addNotif("error", "Failed to load profile: " + e.message);
    }
  };

  const enterStudy = async (course) => {
    setActive(course); setScreen("study");
    setMsgs([]); setInput(""); setCodeMode(false); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null);
    sessionSkillLog.current = [];
    cachedSessionCtx.current = null;
    sessionStartIdx.current = 0;
    sessionStartTime.current = null;
    discussedChunks.current = new Set();
    setSessionSummary(null);
    setSessionElapsed(0);
    setBreakDismissed(false);
    setSidebarCollapsed(false);
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
      await DB.saveChat(course.id, []);
    } catch (e) { console.error("Journal capture on enter:", e); }
  };

  // --- Mode Selection ---
  const selectMode = async (mode) => {
    setSessionMode(mode);
    if (mode === "recap") {
      bootWithFocus({ type: "recap" });
      return;
    }
    try {
      const skills = await loadSkillsV2(active.id);
      const profile = await DB.getProfile(active.id);
      if (mode === "assignment") {
        const asgn = await loadAssignmentsCompat(active.id);
        if (!Array.isArray(asgn) || asgn.length === 0) {
          var hasAsgnMats = (active.materials || []).some(m => m.classification === "assignment");
          var hasSkills = skills && Array.isArray(skills) && skills.length > 0;
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

        const enriched = skills.map(s => {
          const pd = profile.skills[s.id] || profile.skills[s.conceptKey] || null;
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
            lastRating: pd?.entries?.slice(-1)[0]?.rating || null,
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
        setPickerData({ mode, items: enriched });
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
      } else if (mode === "explore") {
        setPickerData({ mode, exploreTopic: "" });
      }
    } catch (e) {
      console.error("Picker load failed:", e);
      setPickerData({ mode, empty: true, message: "Failed to load data: " + e.message });
    }
  };

  // --- Boot with focused context ---
  const bootWithFocus = async (focus) => {
    if (!active) return;
    setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
    if (focus.type === "assignment") {
      var lang = detectLanguage(active.name, focus.assignment?.title || "", "");
      if (lang) setCodeMode(true);
    } else if (focus.type === "skill") {
      var lang2 = detectLanguage(active.name, focus.skill?.name || "", focus.skill?.description || "");
      if (lang2) setCodeMode(true);
    } else {
      var lang3 = detectLanguage(active.name, "", "");
      if (lang3) setCodeMode(true);
    }
    try {
      const skills = await loadSkillsV2(active.id);
      const profile = await DB.getProfile(active.id);
      const journal = await DB.getJournal(active.id);
      const ctx = await buildFocusedContext(active.id, active.materials, focus, skills, profile);

      cachedSessionCtx.current = { ctx, skills, profile, journal, focus };

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
      if (focus.type === "recap") {
        userMsg = "Catch me up on where I left off.";
        modeHint = "\n\nMODE: RECAP. Summarize progress from session history. Be direct about skill status -- name what's solid, what needs work, and what's due for review. Suggest what to do next based on gaps and upcoming assignments.";
      } else if (focus.type === "assignment") {
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
      } else if (focus.type === "exam") {
        var matNames = (focus.materials || []).map(m => m.name || m).join(", ");
        userMsg = "I'm preparing for an exam covering: " + matNames;
        modeHint = "\n\nMODE: EXAM PREPARATION. The student is preparing for an exam covering the selected materials. Use interleaved practice across topics. Ask questions that test understanding at increasing difficulty. Focus on common exam question formats. Identify weak areas and drill them. Mix retrieval practice with elaborative interrogation.";
      } else if (focus.type === "explore") {
        userMsg = "I want to explore: " + (focus.topic || "this course");
        modeHint = "\n\nMODE: OPEN EXPLORATION. The student wants to freely explore a topic. Be conversational and curious. Follow their interests. Share interesting connections. Still track skill demonstrations but don't force structured assessment. If they show genuine understanding, note it, but keep the tone light and exploratory.";
      }

      const bootSystem = "You are Study -- a master teacher.\n\nCOURSE: " + active.name + "\n\n" + ctx + "\n\nSESSION HISTORY:\n" + formatJournal(journal) + studentContext + modeHint + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";
      sessionStartTime.current = Date.now();
      const userTs = Date.now();
      setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: "", ts: userTs }]);
      const response = await callClaudeStream(bootSystem, [{ role: "user", content: userMsg }], function(partial) {
        setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: partial, ts: userTs }]);
      });
      const asstTs = Date.now();
      setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: response, ts: asstTs }]);
      sessionStartIdx.current = 0;
      await DB.saveChat(active.id, [{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: response, ts: asstTs }]);
    } catch (err) {
      console.error("Boot failed:", err);
      addNotif("error", "Failed to start session: " + err.message);
    }
    setBooting(false); setStatus("");
  };

  // --- Send Message ---
  const sendMessage = async () => {
    if (!input.trim() || busy || !active) return;
    const raw = codeMode ? input.trimEnd() : input.trim();
    const userMsg = codeMode ? "```\n" + raw + "\n```" : raw;
    const isCode = codeMode;
    setInput(""); setCodeMode(false);
    const userTs = Date.now();
    const newMsgs = [...msgs, { role: "user", content: userMsg, ts: userTs, codeMode: isCode }];
    setMsgs([...newMsgs, { role: "assistant", content: "", ts: userTs }]); setBusy(true);

    try {
      let ctx, skills, profile, journal;
      if (cachedSessionCtx.current && focusContext) {
        ctx = cachedSessionCtx.current.ctx;
        skills = cachedSessionCtx.current.skills;
        profile = cachedSessionCtx.current.profile;
        journal = cachedSessionCtx.current.journal;
      } else {
        skills = await loadSkillsV2(active.id);
        profile = await DB.getProfile(active.id);
        journal = await DB.getJournal(active.id);
        if (focusContext && (focusContext.type === "assignment" || focusContext.type === "skill" || focusContext.type === "exam" || focusContext.type === "explore")) {
          ctx = await buildFocusedContext(active.id, active.materials, focusContext, skills, profile);
        } else {
          const asgn = await loadAssignmentsCompat(active.id) || [];
          ctx = await buildContext(active.id, active.materials, skills, asgn, profile, newMsgs, discussedChunks.current);
        }
      }

      const sysPrompt = buildSystemPrompt(active.name, ctx, journal);
      const chatMsgs = newMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

      const response = await callClaudeStream(sysPrompt, chatMsgs, function(partial) {
        setMsgs([...newMsgs, { role: "assistant", content: partial, ts: userTs }]);
      });

      const asstTs = Date.now();
      const updates = parseSkillUpdates(response);
      if (updates.length) {
        var intentWeights = { assignment: 1.0, exam: 0.8, skills: 1.0, recap: 0.4, explore: 0.2 };
        var intentWeight = intentWeights[sessionMode] || 1.0;
        await applySkillUpdates(active.id, updates, intentWeight);
        sessionSkillLog.current.push(...updates);
        for (var u of updates) addNotif("skill", u.skillId + ": " + u.rating + (u.context !== 'guided' ? " (" + u.context + ")" : ""));
        if (cachedSessionCtx.current) {
          var updatedSkills = await loadSkillsV2(active.id);
          var updatedProfile = await DB.getProfile(active.id);
          var updatedCtx = await buildFocusedContext(active.id, active.materials, focusContext, updatedSkills, updatedProfile);
          var recentKw = extractKeywords(newMsgs.slice(-12), 10);
          var skillsSoFar = sessionSkillLog.current.map(s => s.skillId + ":" + s.rating).join(", ");
          if (recentKw.length || skillsSoFar) {
            updatedCtx += "\n\nSESSION CONTEXT SO FAR:";
            if (recentKw.length) updatedCtx += "\nTopics discussed: " + recentKw.join(", ");
            if (skillsSoFar) updatedCtx += "\nSkills assessed: " + skillsSoFar;
          }
          cachedSessionCtx.current = { ...cachedSessionCtx.current, skills: updatedSkills, profile: updatedProfile, ctx: updatedCtx };
        }
      }

      const unlockId = parseQuestionUnlock(response);
      if (unlockId && asgnWork) {
        setAsgnWork(prev => {
          if (!prev) return prev;
          var updated = { ...prev, questions: prev.questions.map(q =>
            q.id === unlockId ? { ...q, unlocked: true } : q
          )};
          var idx = updated.questions.findIndex(q => q.id === unlockId);
          if (idx >= 0) updated.currentIdx = idx;
          return updated;
        });
      }

      const finalMsgs = [...newMsgs, { role: "assistant", content: response, ts: asstTs }];
      setMsgs(finalMsgs); setBusy(false);
      await DB.saveChat(active.id, finalMsgs.slice(-100));
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
      await DB.deleteCourse(id);
      setCourses(p => p.filter(c => c.id !== id));
      if (active?.id === id) { setActive(null); setScreen("home"); }
    } catch (e) {
      addNotif("error", "Failed to delete course: " + e.message);
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
      var failedChunks = mat.chunks.filter(c => c.status === "failed").length;
      if (failedChunks > 0) {
        addNotif("error", failedChunks + " of " + mat.chunks.length + " chunks failed for \"" + f.name + "\".");
      }
      newMeta.push(mat);
    }

    const updatedCourse = { ...active, materials: [...active.materials, ...newMeta] };
    const updatedCourses = courses.map(c => c.id === active.id ? updatedCourse : c);
    await DB.saveCourses(updatedCourses);
    for (const mat of newMeta) {
      for (const pd of (mat._pendingDocs || [])) {
        await DB.saveDoc(active.id, pd.chunkId, pd.doc);
      }
      delete mat._pendingDocs;
    }
    setCourses(updatedCourses); setActive(updatedCourse); setFiles([]);

    // --- Syllabus parsing (before skill extraction) ---
    if (!active.syllabus_parsed) {
      var syllabusMats2 = newMeta.filter(m => m.classification === "syllabus" && (m.chunks || []).length > 0);
      for (const syllMat of syllabusMats2) {
        setStatus("Parsing syllabus: " + syllMat.name + "...");
        try {
          const { content: fullText } = await getMatContent(active.id, syllMat);
          if (fullText && fullText.trim()) {
            const syllResult = await parseSyllabus(active.id, fullText, { onStatus: setStatus });
            if (syllResult.success) {
              addNotif("success", "Syllabus processed — " + syllResult.weeksFound + " weeks, " + syllResult.assignmentsCreated + " assignment(s) found.");
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

    var extractable = newMeta.filter(m => m.classification !== "assignment" && (m.chunks || []).length > 0);
    if (extractable.length > 0) {
      addNotif("success", "Materials added. Processing " + extractable.length + " material(s)...");
      for (var ei = 0; ei < extractable.length; ei++) {
        setStatus("Extracting skills: " + extractable[ei].name + "...");
        setProcessingMatId(extractable[ei].id);
        try {
          await runExtractionV2(active.id, extractable[ei].id, {
            onStatus: setStatus,
            onNotif: addNotif,
            onChapterComplete: (ch, cnt) => setStatus(extractable[ei].name + " — " + ch + ": " + cnt + " skills"),
          });
        } catch (e) {
          console.error("Auto-extraction failed for", extractable[ei].name, e);
          addNotif("warn", "Could not extract skills from " + extractable[ei].name + ".");
        }
      }
      setProcessingMatId(null);
      const refreshed = await DB.getCourses();
      const rc = refreshed.find(c => c.id === active.id);
      if (rc) { setCourses(refreshed); setActive(rc); }
      await refreshMaterialSkillCounts(active.id);
      addNotif("success", "Done processing " + extractable.length + " material(s).");
    } else {
      const totalSections = newMeta.reduce((sum, m) => sum + (m.chunks?.length || 0), 0);
      addNotif("success", "Added " + newMeta.length + " file(s) with " + totalSections + " section(s).");
    }
    } catch (err) {
      console.error("Adding materials failed:", err);
      addNotif("error", "Failed to add materials: " + err.message);
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
      if (removedMat?.chunks) {
        for (const ch of removedMat.chunks) {
          await DB.deleteChunk(active.id, ch.id);
        }
      }
      const updatedMats = active.materials.filter(m => m.id !== docId);
      const updatedCourse = { ...active, materials: updatedMats };
      const updatedCourses = courses.map(c => c.id === active.id ? updatedCourse : c);
      await DB.saveCourses(updatedCourses);
      setCourses(updatedCourses);
      setActive(updatedCourse);
      addNotif("success", "Removed: " + (removedMat?.name || "material"));
    } catch (e) {
      addNotif("error", "Failed to remove material: " + e.message);
    } finally {
      setGlobalLock(null);
      setBusy(false);
    }
  };

  // Expose everything through context
  const value = {
    // State
    asyncError, setAsyncError, showAsyncNuclear, setShowAsyncNuclear,
    screen, setScreen, courses, setCourses, active, setActive, ready,
    showSettings, setShowSettings, apiKeyLoaded, setApiKeyLoaded,
    apiKeyInput, setApiKeyInput, keyVerifying, setKeyVerifying, keyError, setKeyError,
    files, setFiles, cName, setCName, drag, setDrag, parsing,
    msgs, setMsgs, input, setInput, codeMode, setCodeMode,
    exporting, setExporting, busy, setBusy, booting, setBooting,
    status, setStatus, processingMatId, setProcessingMatId,
    errorLogModal, setErrorLogModal,
    globalLock, setGlobalLock, lockElapsed,
    showManage, _setShowManage, showSkills, setShowSkills,
    skillViewData, setSkillViewData, expandedCats, setExpandedCats,
    pendingConfirm, setPendingConfirm,
    notifs, setNotifs, showNotifs, _setShowNotifs,
    lastSeenNotif, setLastSeenNotif,
    extractionErrors, setExtractionErrors,
    sessionMode, setSessionMode, focusContext, setFocusContext,
    pickerData, setPickerData, chunkPicker, setChunkPicker,
    asgnWork, setAsgnWork, practiceMode, setPracticeMode,
    profileData, setProfileData,
    expandedProfile, setExpandedProfile, expandedSubSkill, setExpandedSubSkill,
    materialSkillCounts, expandedMaterial, setExpandedMaterial,
    sessionSummary, setSessionSummary,
    sessionElapsed, setSessionElapsed, breakDismissed, setBreakDismissed,
    sidebarCollapsed, setSidebarCollapsed,
    // Refs
    endRef, taRef, fiRef, sessionStartIdx, sessionSkillLog,
    cachedSessionCtx, extractionCancelledRef, sessionStartTime, discussedChunks,
    // Handlers
    addNotif, getMaterialState, computeTrustSignals, refreshMaterialSkillCounts,
    timeAgo, filterDuplicates, saveSessionToJournal,
    onDrop, onSelect, classify, removeF,
    createCourse, quickCreateCourse, loadProfile, enterStudy,
    selectMode, bootWithFocus, sendMessage,
    delCourse, addMats, removeMat,
    // Re-exports from lib (used directly in screen JSX)
    CLS, getApiKey, setApiKey: setApiKey, getDb, DB, Courses,
    loadSkillsV2, runExtractionV2, migrateV1ToV2,
    generateSubmission, downloadBlob,
    effectiveStrength, nextReviewDate, strengthToTier, masteryConfidence,
    currentRetrievability, TIERS,
    createPracticeSet, generateProblems, evaluateAnswer, completeTierAttempt,
    loadPracticeMaterialCtx, renderMd: null, // renderMd imported directly by screens from theme.jsx
    testApiKey,
  };

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
