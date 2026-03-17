import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { PracticeSets, ConceptLinks, Mastery } from "../lib/db.js";
import {
  strengthToTier, createPracticeSet, generateProblems, loadPracticeMaterialCtx
} from "../lib/study.js";
import { currentRetrievability } from "../lib/fsrs.js";
import { CIP_DOMAINS } from "../App.jsx";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

export default function ProfileScreen() {
  const {
    courses, profileData,
    expandedProfile, setExpandedProfile, expandedSubSkill, setExpandedSubSkill,
    setScreen, setSessionMode, setPracticeMode,
    enterStudy, addNotif,
  } = useStudy();

  const [profileView, setProfileView] = React.useState(null);
  const [domainSort, setDomainSort] = React.useState("level");

  const totalParents = profileData?.length || 0;
  const totalSubs = profileData?.reduce((s, p) => s + p.subCount, 0) || 0;
  const overallLevel = profileData?.reduce((s, p) => s + p.level, 0) || 0;
  const totalDue = profileData?.reduce((s, p) => s + p.dueForReview, 0) || 0;

  // Group parents by CIP domain
  const byDomain = {};
  for (const p of (profileData || [])) {
    const domKey = p.cipDomain || "00";
    if (!byDomain[domKey]) byDomain[domKey] = { name: CIP_DOMAINS[domKey] || "General", items: [], totalLevel: 0, totalSubs: 0, readinessSum: 0, readinessCount: 0 };
    byDomain[domKey].items.push(p);
    byDomain[domKey].totalLevel += p.level;
    byDomain[domKey].totalSubs += p.subCount;
    if (p.readiness > 0) { byDomain[domKey].readinessSum += p.readiness * p.subCount; byDomain[domKey].readinessCount += p.subCount; }
  }

  const bloomsColors = { remember: "#6B7280", understand: "#8B5CF6", apply: T.ac, analyze: "#F59E0B", evaluate: "#F97316", create: T.gn };
  const confidenceLabels = { verified: "Verified", "partially-verified": "Limited evidence", unverified: "Practice recommended", untested: "New" };
  const confidenceColors = { verified: T.gn, "partially-verified": "#F59E0B", unverified: T.txD, untested: T.txM };
  const difficultyLabel = (d) => !d ? "\u2014" : d < 3 ? "Easy" : d < 5 ? "Moderate" : d < 7 ? "Hard" : "Very Hard";
  const courseNames = {};
  for (const c of courses) courseNames[c.id] = c.name;

  // Top 4 parent skills by level (profileData already sorted by level desc)
  const top4 = (profileData || []).filter(p => p.level > 0).slice(0, 4);

  // Domain list sorted by aggregate level
  const domainList = Object.entries(byDomain)
    .map(([domKey, dom]) => ({
      domKey, name: dom.name, totalLevel: dom.totalLevel,
      parentCount: dom.items.length, totalSubs: dom.totalSubs,
      readiness: dom.readinessCount > 0 ? dom.readinessSum / dom.readinessCount : 0,
      dueCount: dom.items.reduce((s, p) => s + p.dueForReview, 0),
    }))
    .sort((a, b) => b.totalLevel - a.totalLevel);

  // Lazy-load concept links when a sub-skill is expanded (domain view only)
  const [connectionCache, setConnectionCache] = React.useState({});
  React.useEffect(() => {
    if (!expandedSubSkill || connectionCache[expandedSubSkill]) return;
    var skillId = expandedSubSkill;
    var cancelled = false;
    (async () => {
      try {
        var links = await ConceptLinks.getBySkillBatch([skillId]);
        if (cancelled) return;
        var linkedIds = [];
        var conns = [];
        for (var l of links) {
          var isA = l.sub_skill_a_id === skillId;
          var lid = isA ? l.sub_skill_b_id : l.sub_skill_a_id;
          linkedIds.push(lid);
          conns.push({ linkedId: lid, linkedName: isA ? l.name_b : l.name_a, linkedCourseId: isA ? l.course_b : l.course_a, linkType: l.link_type, retrievability: 0 });
        }
        if (linkedIds.length > 0 && !cancelled) {
          var masteryRows = await Mastery.getBySkills([...new Set(linkedIds)]);
          if (cancelled) return;
          var mMap = {};
          for (var m of masteryRows) mMap[m.sub_skill_id] = m;
          for (var c of conns) {
            var mr = mMap[c.linkedId];
            if (mr && mr.stability) c.retrievability = currentRetrievability({ stability: mr.stability, lastReviewAt: mr.last_review_at });
          }
        }
        var pri = { same_concept: 0, prerequisite: 1, related: 2 };
        conns.sort(function(a, b) { return (pri[a.linkType] ?? 3) - (pri[b.linkType] ?? 3) || b.retrievability - a.retrievability; });
        if (!cancelled) setConnectionCache(function(prev) { return Object.assign({}, prev, { [skillId]: conns }); });
      } catch (e) {
        if (!cancelled) setConnectionCache(function(prev) { return Object.assign({}, prev, { [skillId]: [] }); });
      }
    })();
    return function() { cancelled = true; };
  }, [expandedSubSkill]);

  // Reset sort when entering a different domain
  React.useEffect(() => { setDomainSort("level"); }, [profileView?.domKey]);

  // Selected domain data for drill-down
  const selectedDomain = profileView ? byDomain[profileView.domKey] : null;

  return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Header bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => {
          if (profileView) { setProfileView(null); setExpandedSubSkill(null); }
          else { setScreen("home"); setExpandedSubSkill(null); }
        }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          {profileView ? "\u2190 Back to Profile" : "\u2190 Back"}
        </button>
        <TopBarButtons />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

      {profileView && selectedDomain ? (
        /* ═══════════════════════════════════════════════════════════ */
        /* DOMAIN DRILL-DOWN VIEW                                     */
        /* ═══════════════════════════════════════════════════════════ */
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>{selectedDomain.name}</h1>
          <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 24 }}>
            Lv {selectedDomain.totalLevel} {"\u00B7"} {selectedDomain.totalSubs} sub-skills
            {(() => { var dr = selectedDomain.readinessCount > 0 ? selectedDomain.readinessSum / selectedDomain.readinessCount : 0; return dr > 0 ? " \u00B7 " + Math.round(dr * 100) + "% ready" : ""; })()}
          </p>

          {/* Sort toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[{ key: "level", label: "Level" }, { key: "weakest", label: "Weakest first" }].map(opt => (
              <button key={opt.key} onClick={() => setDomainSort(opt.key)}
                style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: domainSort === opt.key ? "none" : "1px solid " + T.bd, background: domainSort === opt.key ? T.ac : "transparent", color: domainSort === opt.key ? T.bg : T.txD, transition: "all 0.15s ease" }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Parent skill cards */}
          {selectedDomain.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px", color: T.txD, fontSize: 14 }}>No skills in this domain yet.</div>
          ) : [...selectedDomain.items].sort((a, b) => domainSort === "weakest" ? (a.readiness - b.readiness || b.dueForReview - a.dueForReview) : (b.level - a.level || b.totalPoints - a.totalPoints)).map(({ parent, subSkills, level, progressToNext, progressNeeded, readiness, subCount, reviewedCount, dueForReview, lastActivityDate: lastAct }) => {
            const readinessColor = readiness > 0.8 ? T.gn : readiness > 0.5 ? "#F59E0B" : T.rd;
            const isExpanded = expandedProfile[parent.id];
            const progressPct = progressNeeded > 0 ? Math.min(100, Math.round((progressToNext / progressNeeded) * 100)) : 0;
            const daysSinceActivity = lastAct ? Math.floor((new Date() - lastAct) / 86400000) : null;
            const isActive = daysSinceActivity !== null && daysSinceActivity <= 7;

            const byCategory = {};
            for (const sub of subSkills) {
              const cat = sub.category || "General";
              if (!byCategory[cat]) byCategory[cat] = [];
              byCategory[cat].push(sub);
            }

            return (
              <div key={parent.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div onClick={() => setExpandedProfile(p => ({ ...p, [parent.id]: !p[parent.id] }))} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  {/* Level badge with progress ring */}
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    <svg width="52" height="52" viewBox="0 0 52 52">
                      <circle cx="26" cy="26" r="23" fill="none" stroke={T.bd} strokeWidth="3" />
                      <circle cx="26" cy="26" r="23" fill="none" stroke={T.ac} strokeWidth="3"
                        strokeDasharray={2 * Math.PI * 23} strokeDashoffset={2 * Math.PI * 23 * (1 - progressPct / 100)}
                        transform="rotate(-90 26 26)" style={{ transition: "stroke-dashoffset 0.3s" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: T.ac }}>{level}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.tx }}>{parent.name}</div>
                    {parent.cip_code && <div style={{ fontSize: 11, color: T.txM, marginTop: 1 }}>CIP {parent.cip_code}</div>}
                    <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>
                      {subCount} skill{subCount !== 1 ? "s" : ""} {"\u00B7"} {reviewedCount} reviewed
                      {dueForReview > 0 && <span style={{ color: "#F59E0B", marginLeft: 6 }}>{"\u00B7"} {dueForReview} due</span>}
                      {daysSinceActivity !== null && (
                        <span style={{ color: isActive ? T.gn : T.txM, marginLeft: 6 }}>
                          {"\u00B7"} {isActive ? "active" : daysSinceActivity + "d ago"}
                        </span>
                      )}
                    </div>
                    {(() => { var cs = new Set(); for (var s of subSkills) if (s.sourceCourseId) cs.add(s.sourceCourseId); var labels = [...cs].map(id => courseNames[id]).filter(Boolean); if (labels.length === 0) return null; var shown = labels.slice(0, 3); var extra = labels.length - 3; return <div style={{ fontSize: 11, color: T.txM, marginTop: 3 }}>From: {shown.join(", ")}{extra > 0 ? " +" + extra + " more" : ""}</div>; })()}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 5, background: T.bd, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: Math.round(readiness * 100) + "%", height: "100%", background: readinessColor, borderRadius: 3, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 11, color: readinessColor, flexShrink: 0 }}>{Math.round(readiness * 100)}%</span>
                    </div>
                  </div>
                  <span style={{ color: T.txD, fontSize: 11, flexShrink: 0 }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                </div>

                {/* Expanded: sub-skills grouped by category */}
                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + T.bd }}>
                    {dueForReview > 0 && (() => {
                      var dueSubs = subSkills.filter(s => s.mastery?.isDue);
                      var firstDue = dueSubs[0];
                      var course = firstDue?.sourceCourseId ? courses.find(c => c.id === firstDue.sourceCourseId) : null;
                      return course ? (
                        <button onClick={async () => {
                          await enterStudy(course);
                          var skillObj = { id: firstDue.id, name: firstDue.name, description: firstDue.description, conceptKey: firstDue.conceptKey, category: firstDue.category, sources: firstDue.evidence?.anchorTerms || [] };
                          var str = firstDue.mastery?.retrievability || 0;
                          var startTier = strengthToTier(str);
                          var pset = await createPracticeSet(firstDue.id, startTier);
                          setSessionMode("practice");
                          try {
                            var matCtx = await loadPracticeMaterialCtx(course.id, course.materials, skillObj);
                            pset = await generateProblems(pset, skillObj, course.name, matCtx);
                            await PracticeSets.upsert(firstDue.id, pset);
                            var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                            var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                            setPracticeMode({ set: pset, skill: skillObj, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                          } catch (err) {
                            addNotif("error", "Failed to start review: " + err.message);
                            setPracticeMode(null); setSessionMode(null);
                          }
                        }}
                          style={{ width: "100%", padding: "8px 16px", borderRadius: 8, border: "1px solid #F59E0B", background: "rgba(251,191,36,0.08)", color: "#F59E0B", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
                          Review {dueForReview} Due Skill{dueForReview !== 1 ? "s" : ""}
                        </button>
                      ) : null;
                    })()}
                    {Object.entries(byCategory).map(([cat, subs]) => (
                      <div key={cat} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cat}</div>
                        {subs.map(sub => {
                          const r = sub.mastery?.retrievability || 0;
                          const subColor = !sub.mastery ? T.txM : r > 0.8 ? T.gn : r > 0.5 ? "#F59E0B" : T.rd;
                          const isSubExpanded = expandedSubSkill === sub.id;
                          return (
                            <div key={sub.id} style={{ marginBottom: 2 }}>
                              <div onClick={() => setExpandedSubSkill(isSubExpanded ? null : sub.id)}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, cursor: "pointer", background: isSubExpanded ? T.bg : "transparent", border: isSubExpanded ? "1px solid " + T.bd : "1px solid transparent" }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", background: sub.mastery ? subColor : T.bd, flexShrink: 0 }} />
                                <div style={{ flex: 1, fontSize: 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
                                {sub.bloomsLevel && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: (bloomsColors[sub.bloomsLevel] || T.txD) + "18", color: bloomsColors[sub.bloomsLevel] || T.txD }}>{sub.bloomsLevel}</span>}
                                {sub.mastery ? (
                                  <div style={{ width: 52, height: 4, borderRadius: 2, background: T.bd, flexShrink: 0, overflow: "hidden" }}>
                                    <div style={{ width: Math.round(r * 100) + "%", height: "100%", background: subColor, borderRadius: 2 }} />
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, color: T.txM, flexShrink: 0 }}>{confidenceLabels[sub.confidence] || "New"}</span>
                                )}
                              </div>

                              {/* Sub-skill detail panel */}
                              {isSubExpanded && (
                                <div style={{ background: T.bg, border: "1px solid " + T.bd, borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16, marginBottom: 4 }}>
                                  {sub.description && <div style={{ fontSize: 13, color: T.tx, marginBottom: 8, lineHeight: 1.5 }}>{sub.description}</div>}
                                  {sub.conceptKey && <div style={{ fontSize: 11, color: T.txM, marginBottom: 10, fontFamily: "monospace" }}>{sub.conceptKey}</div>}
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                    {sub.skillType && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: T.acS, color: T.ac }}>{sub.skillType}</span>}
                                    {sub.bloomsLevel && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (bloomsColors[sub.bloomsLevel] || T.txD) + "18", color: bloomsColors[sub.bloomsLevel] || T.txD }}>{sub.bloomsLevel}</span>}
                                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (confidenceColors[sub.confidence] || T.txM) + "18", color: confidenceColors[sub.confidence] || T.txM }}>{confidenceLabels[sub.confidence] || "New"}</span>
                                  </div>

                                  {sub.masteryCriteria?.length > 0 && (
                                    <div style={{ marginBottom: 14 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>MASTERY CRITERIA</div>
                                      {sub.masteryCriteria.map((c, ci) => (
                                        <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 0", fontSize: 12 }}>
                                          <span style={{ color: c.verified ? T.gn : T.txM, flexShrink: 0, marginTop: 1 }}>{c.verified ? "\u2713" : "\u25CB"}</span>
                                          <span style={{ color: c.verified ? T.tx : T.txD }}>{c.text}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {sub.mastery && (
                                    <div style={{ marginBottom: 14 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>READINESS & MEMORY</div>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                                        <div><span style={{ color: T.txD }}>Recall: </span><span style={{ color: subColor, fontWeight: 500 }}>{Math.round(r * 100)}%</span></div>
                                        <div><span style={{ color: T.txD }}>Stability: </span><span style={{ color: T.tx }}>{sub.mastery.stability >= 1 ? Math.round(sub.mastery.stability) + "d" : "<1d"}</span></div>
                                        <div><span style={{ color: T.txD }}>Difficulty: </span><span style={{ color: T.tx }}>{difficultyLabel(sub.mastery.difficulty)}</span></div>
                                        <div><span style={{ color: T.txD }}>Reviews: </span><span style={{ color: T.tx }}>{sub.mastery.reps || 0}</span></div>
                                        <div><span style={{ color: T.txD }}>Lapses: </span><span style={{ color: (sub.mastery.lapses || 0) > 2 ? "#F59E0B" : T.tx }}>{sub.mastery.lapses || 0}</span></div>
                                        <div><span style={{ color: T.txD }}>Next review: </span><span style={{ color: sub.mastery.isDue ? "#F59E0B" : T.tx }}>{sub.mastery.isDue ? "Due now" : sub.mastery.nextReview ? sub.mastery.nextReview.toLocaleDateString() : "\u2014"}</span></div>
                                        <div><span style={{ color: T.txD }}>Points: </span><span style={{ color: T.ac }}>{sub.mastery.totalMasteryPoints || 0}</span></div>
                                      </div>
                                    </div>
                                  )}

                                  {sub.facets?.length > 0 && (
                                    <div style={{ marginBottom: 14 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>FACETS ({sub.facets.length})</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {sub.facets.map(facet => {
                                          var fr = facet.mastery?.retrievability || 0;
                                          var fColor = !facet.mastery ? T.txM : fr > 0.8 ? T.gn : fr > 0.5 ? "#F59E0B" : T.rd;
                                          return (
                                            <div key={facet.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: T.bg, border: "1px solid " + T.bd }}>
                                              <div style={{ width: 5, height: 5, borderRadius: "50%", background: facet.mastery ? fColor : T.bd, flexShrink: 0 }} />
                                              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: T.tx }}>{facet.name}</div>
                                              {facet.mastery ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                  <div style={{ width: 40, height: 3, borderRadius: 2, background: T.bd, overflow: "hidden" }}>
                                                    <div style={{ width: Math.round(fr * 100) + "%", height: "100%", background: fColor, borderRadius: 2 }} />
                                                  </div>
                                                  <span style={{ fontSize: 10, color: fColor, fontWeight: 500, minWidth: 26, textAlign: "right" }}>{Math.round(fr * 100)}%</span>
                                                  {facet.mastery.isDue && <span style={{ fontSize: 9, color: "#F59E0B", fontWeight: 600 }}>DUE</span>}
                                                </div>
                                              ) : (
                                                <span style={{ fontSize: 10, color: T.txM, flexShrink: 0 }}>New</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {sub.prerequisites?.length > 0 && (
                                    <div style={{ marginBottom: 14 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>PREREQUISITES</div>
                                      {sub.prerequisites.map((p, pi) => {
                                        const prereqSub = subSkills.find(s => s.id === p.id);
                                        const pr = prereqSub?.mastery?.retrievability || 0;
                                        const pColor = pr > 0.8 ? T.gn : pr > 0.5 ? "#F59E0B" : pr > 0 ? T.rd : T.txM;
                                        return (
                                          <div key={pi} onClick={(e) => { e.stopPropagation(); setExpandedSubSkill(p.id); }}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12, cursor: "pointer" }}>
                                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                                            <span style={{ color: T.ac }}>{p.name || p.conceptKey}</span>
                                            {prereqSub?.mastery && <span style={{ color: pColor, fontSize: 11 }}>{Math.round(pr * 100)}%</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {(() => {
                                    var conns = connectionCache[sub.id];
                                    if (!conns || conns.length === 0) return null;
                                    return (
                                      <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>CONNECTIONS</div>
                                        {conns.map(function(cn, ci) {
                                          var cColor = cn.retrievability > 0.8 ? T.gn : cn.retrievability > 0.5 ? "#F59E0B" : cn.retrievability > 0 ? T.rd : T.txM;
                                          var arrow = cn.linkType === "prerequisite" ? "\u2192" : "\u2194";
                                          var cName = courseNames[cn.linkedCourseId] || "another course";
                                          return (
                                            <div key={ci} onClick={function(e) {
                                              e.stopPropagation();
                                              if (profileData) { for (var pd of profileData) { if (pd.subSkills.find(function(s) { return s.id === cn.linkedId; })) { setExpandedProfile(function(prev) { var n = Object.assign({}, prev); n[pd.parent.id] = true; return n; }); var linkedDomKey = pd.cipDomain || "00"; if (profileView && profileView.domKey !== linkedDomKey) { setProfileView({ domKey: linkedDomKey }); } break; } } }
                                              setExpandedSubSkill(cn.linkedId);
                                            }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12, cursor: "pointer" }}>
                                              <span style={{ color: T.txM, fontSize: 11, width: 14, textAlign: "center", flexShrink: 0 }}>{arrow}</span>
                                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: cColor, flexShrink: 0 }} />
                                              <span style={{ color: T.ac, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn.linkedName}</span>
                                              <span style={{ color: T.txD, fontSize: 11, flexShrink: 0 }}>in {cName}</span>
                                              {cn.retrievability > 0 && <span style={{ color: cColor, fontSize: 11, flexShrink: 0, marginLeft: 4 }}>{Math.round(cn.retrievability * 100)}%</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}

                                  {(sub.evidence?.anchorTerms?.length > 0 || sub.evidence?.definitions?.length > 0) && (
                                    <div style={{ marginBottom: 14 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>KEY TERMS</div>
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {(sub.evidence.anchorTerms || []).map((term, ti) => (
                                          <span key={ti} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: T.bd, color: T.txD }}>{term}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {(sub.fitness?.practiceAttempts > 0 || sub.fitness?.tutoringReferences > 0 || sub.fitness?.diagnosticCount > 0) && (
                                    <div style={{ marginBottom: 8 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>EVIDENCE</div>
                                      <div style={{ fontSize: 11, color: T.txD, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                        {sub.fitness.diagnosticCount > 0 && <span>Diagnosed: {sub.fitness.diagnosticCount}</span>}
                                        {(sub.fitness.practiceAttempts || sub.fitness.practiceSuccesses) > 0 && <span>Practiced: {sub.fitness.practiceAttempts || sub.fitness.practiceSuccesses}</span>}
                                        {sub.fitness.tutoringReferences > 0 && <span>Tutored: {sub.fitness.tutoringReferences}</span>}
                                        {sub.fitness.decayEvents > 0 && <span style={{ color: "#F59E0B" }}>Decayed: {sub.fitness.decayEvents}</span>}
                                      </div>
                                    </div>
                                  )}

                                  {sub.sourceCourseId && courseNames[sub.sourceCourseId] && (
                                    <div style={{ fontSize: 11, color: T.txM, marginTop: 8 }}>From: {courseNames[sub.sourceCourseId]}</div>
                                  )}

                                  {sub.sourceCourseId && (
                                    <button onClick={async (e) => {
                                      e.stopPropagation();
                                      var course = courses.find(c => c.id === sub.sourceCourseId);
                                      if (!course) { addNotif("error", "Course not found"); return; }
                                      await enterStudy(course);
                                      var skillObj = { id: sub.id, name: sub.name, description: sub.description, conceptKey: sub.conceptKey, category: sub.category, sources: sub.evidence?.anchorTerms || [] };
                                      var str = sub.mastery?.retrievability || 0;
                                      var startTier = strengthToTier(str);
                                      var pset = await createPracticeSet(sub.id, startTier);
                                      setSessionMode("practice");
                                      try {
                                        var matCtx = await loadPracticeMaterialCtx(course.id, course.materials, skillObj);
                                        pset = await generateProblems(pset, skillObj, course.name, matCtx);
                                        await PracticeSets.upsert(sub.id, pset);
                                        var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                                        var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                                        setPracticeMode({ set: pset, skill: skillObj, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                                      } catch (err) {
                                        addNotif("error", "Failed to start practice: " + err.message);
                                        setPracticeMode(null); setSessionMode(null);
                                      }
                                    }}
                                      style={{ marginTop: 12, width: "100%", padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.ac, background: T.acS, color: T.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                      Practice This Skill
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      ) : (
        /* ═══════════════════════════════════════════════════════════ */
        /* CHARACTER SHEET HERO VIEW                                   */
        /* ═══════════════════════════════════════════════════════════ */
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Skill Profile</h1>
          <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 24 }}>Your knowledge across all courses</p>

          {!profileData || profileData.length === 0 ? (
            /* Empty state */
            <div style={{ textAlign: "center", padding: "32px 16px", color: T.txD, fontSize: 15, background: T.sf, borderRadius: 10, border: "1px solid " + T.bd }}>
              Upload course materials to start building your skill profile
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setScreen("upload")}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid " + T.ac, background: T.acS, color: T.ac, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Go to Upload
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Skill Areas", value: totalParents },
                  { label: "Sub-skills", value: totalSubs },
                  { label: "Total Level", value: overallLevel },
                  { label: "Due for Review", value: totalDue, color: totalDue > 0 ? "#F59E0B" : T.txD },
                ].map((stat, i) => (
                  <div key={i} style={{ flex: 1, background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: stat.color || T.ac }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: T.txD, marginTop: 3 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Top 4 skills — "ability scores" */}
              {top4.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>TOP SKILLS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[0, 1, 2, 3].map(i => {
                      const skill = top4[i];
                      if (!skill) {
                        return (
                          <div key={i} style={{ background: T.sf, border: "1px dashed " + T.bd, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", color: T.txM, fontSize: 13 }}>
                            {"\u2014"}
                          </div>
                        );
                      }
                      const progressPct = skill.progressNeeded > 0 ? Math.min(100, Math.round((skill.progressToNext / skill.progressNeeded) * 100)) : 0;
                      const rColor = skill.readiness > 0.7 ? T.gn : skill.readiness > 0.4 ? "#F59E0B" : T.rd;
                      return (
                        <div key={i} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 12px 10px", position: "relative" }}>
                          <div style={{ position: "absolute", top: 10, right: 12, fontSize: 28, fontWeight: 700, color: T.ac, lineHeight: 1 }}>{skill.level}</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginTop: 24, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 50 }}>
                            {skill.parent.name}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <div style={{ flex: 1, height: 4, background: T.bd, borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ width: progressPct + "%", height: "100%", background: T.ac, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: rColor, flexShrink: 0 }}>{Math.round(skill.readiness * 100)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Due for review banner */}
              {totalDue > 0 && (
                <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                  <span style={{ fontSize: 15 }}>{"\u26A1"}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#F59E0B" }}>{totalDue} skill{totalDue !== 1 ? "s" : ""} due for review</span>
                </div>
              )}

              {/* Domain summary */}
              {domainList.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>DOMAINS</div>
                  {domainList.map(dom => {
                    const domRColor = dom.readiness > 0.7 ? T.gn : dom.readiness > 0.4 ? "#F59E0B" : T.txD;
                    return (
                      <div key={dom.domKey} onClick={() => setProfileView({ domKey: dom.domKey })}
                        style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", marginBottom: 8, cursor: "pointer", transition: "background 0.15s ease" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.sfH}
                        onMouseLeave={e => e.currentTarget.style.background = T.sf}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{dom.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, color: T.txD }}>Lv {dom.totalLevel}</span>
                            {dom.readiness > 0 && <span style={{ fontSize: 13, color: domRColor }}>{Math.round(dom.readiness * 100)}%</span>}
                            <span style={{ color: T.txM, fontSize: 11 }}>{"\u203A"}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>
                          {dom.parentCount} skill{dom.parentCount !== 1 ? "s" : ""} {"\u00B7"} {dom.totalSubs} sub-skills
                          {dom.dueCount > 0 && <span style={{ color: "#F59E0B", marginLeft: 6 }}>{"\u00B7"} {dom.dueCount} due</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      </div>
      </div>
    </div>
  );
}
