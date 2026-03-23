import React, { useState, useMemo } from "react";
import { T, CSS } from "../lib/theme.jsx";
import { effectiveStrength } from "../lib/study.js";
import GlobalLockOverlay from "../components/GlobalLockOverlay.jsx";
import { useStudy } from "../StudyContext.jsx";
import TopBarButtons from "../components/TopBarButtons.jsx";

function strengthColor(v) {
  return v >= 0.6 ? T.gn : v >= 0.3 ? "#F59E0B" : v > 0 ? T.rd : T.txM;
}
function strengthBand(v) {
  return v >= 0.6 ? "Strong" : v >= 0.3 ? "Developing" : v > 0 ? "Weak" : "New";
}
var BANDS = ["Strong", "Developing", "Weak", "New"];
var BAND_COLORS = { Strong: T.gn, Developing: "#F59E0B", Weak: T.rd, New: T.txM };

export default function SkillsScreen() {
  const {
    active, globalLock, skillViewData, expandedCats, setExpandedCats, goBack,
  } = useStudy();

  var [search, setSearch] = useState("");
  var [groupBy, setGroupBy] = useState("strength");
  var [bloomsFilter, setBloomsFilter] = useState(null);
  var [typeFilter, setTypeFilter] = useState(null);
  var [expandedSkillId, setExpandedSkillId] = useState(null);

  var skills = skillViewData?.skills || [];

  // Pre-compute strength for each skill
  var enriched = useMemo(() =>
    skills.map(sk => ({ sk, str: effectiveStrength(sk) })),
    [skills]
  );

  // Collect unique blooms levels and skill types
  var allBlooms = useMemo(() => [...new Set(skills.map(s => s.bloomsLevel).filter(Boolean))].sort(), [skills]);
  var allTypes = useMemo(() => [...new Set(skills.map(s => s.skillType).filter(Boolean))].sort(), [skills]);

  // Filter pipeline
  var filtered = useMemo(() => {
    var q = search.toLowerCase();
    return enriched.filter(({ sk }) => {
      if (q && !(sk.name || "").toLowerCase().includes(q) && !(sk.description || "").toLowerCase().includes(q) && !(sk.category || "").toLowerCase().includes(q)) return false;
      if (bloomsFilter && sk.bloomsLevel !== bloomsFilter) return false;
      if (typeFilter && sk.skillType !== typeFilter) return false;
      return true;
    });
  }, [enriched, search, bloomsFilter, typeFilter]);

  // Stats (from full enriched set, not filtered)
  var stats = useMemo(() => {
    var s = { Strong: 0, Developing: 0, Weak: 0, New: 0 };
    for (var e of enriched) s[strengthBand(e.str)]++;
    return s;
  }, [enriched]);

  // Is a skill's review overdue?
  var isDue = (sk) => {
    if (!sk.mastery?.nextReviewAt) return false;
    var nrEpoch = sk.mastery.nextReviewAt;
    // nextReviewAt may be epoch seconds or ms
    var ms = nrEpoch > 1e12 ? nrEpoch : nrEpoch * 1000;
    return ms < Date.now();
  };

  // Grouped data
  var grouped = useMemo(() => {
    if (groupBy === "strength") {
      var bands = { Strong: [], Developing: [], Weak: [], New: [] };
      for (var e of filtered) bands[strengthBand(e.str)].push(e);
      return BANDS.map(b => ({ label: b, color: BAND_COLORS[b], items: bands[b] })).filter(g => g.items.length > 0);
    } else {
      var cats = {};
      for (var e of filtered) {
        var cat = e.sk.category || "Uncategorized";
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(e);
      }
      return Object.entries(cats).sort((a, b) => b[1].length - a[1].length).map(([label, items]) => ({ label, color: null, items }));
    }
  }, [filtered, groupBy]);

  var chipStyle = (active) => ({
    fontSize: 11, padding: "3px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid " + (active ? T.ac : T.bd),
    background: active ? T.acS : "transparent", color: active ? T.ac : T.txD, transition: "all 0.15s ease", whiteSpace: "nowrap",
  });

  return (<>
    {globalLock && <GlobalLockOverlay />}
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => goBack()} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>&lt; Back</button>
        <TopBarButtons />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Skills</h1>
        <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 16 }}>{active.name}</p>

        {/* Reference Taxonomy */}
        {skillViewData?.refTax && (
          <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ac }}>{skillViewData.refTax.subject || "Unknown Subject"}</div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>Level: {skillViewData.refTax.level || "?"} | Confidence: {skillViewData.refTax.confidence || "?"}%</div>
          </div>
        )}

        {!skills.length ? (
          <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No skills yet. Upload materials to get started.</div>
        ) : (<>
          {/* Stats bar */}
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>{skills.length} skills</span>
            {BANDS.map(b => stats[b] > 0 && (
              <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: T.txM }}>|</span>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: BAND_COLORS[b], display: "inline-block" }} />
                <span>{stats[b]} {b.toLowerCase()}</span>
              </span>
            ))}
          </div>

          {/* Search bar */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="text" placeholder="Search skills..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 32px 8px 12px", fontSize: 13, background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, color: T.tx }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
            )}
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {/* Group by toggle */}
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid " + T.bd }}>
              {["strength", "category"].map(g => (
                <button key={g} onClick={() => setGroupBy(g)}
                  style={{ fontSize: 11, padding: "4px 12px", border: "none", cursor: "pointer", background: groupBy === g ? T.acS : "transparent", color: groupBy === g ? T.ac : T.txD, transition: "all 0.15s ease" }}>
                  {g === "strength" ? "Strength" : "Category"}
                </button>
              ))}
            </div>
            <span style={{ color: T.bd }}>|</span>
            {/* Bloom's filter chips */}
            {allBlooms.map(b => (
              <button key={b} onClick={() => setBloomsFilter(bloomsFilter === b ? null : b)} style={chipStyle(bloomsFilter === b)}>{b}</button>
            ))}
            {allBlooms.length > 0 && allTypes.length > 0 && <span style={{ color: T.bd }}>|</span>}
            {/* Type filter chips */}
            {allTypes.map(t => (
              <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} style={chipStyle(typeFilter === t)}>{t}</button>
            ))}
          </div>

          {/* Filtered count (if different from total) */}
          {filtered.length !== enriched.length && (
            <div style={{ fontSize: 12, color: T.txM, marginBottom: 10 }}>Showing {filtered.length} of {skills.length} skills</div>
          )}

          {/* Grouped list */}
          {grouped.length === 0 ? (
            <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No skills match your filters.</div>
          ) : grouped.map(group => {
            var isExpanded = groupBy === "strength" || expandedCats[group.label];
            return (
              <div key={group.label} style={{ marginBottom: 10 }}>
                {/* Group header */}
                <button onClick={() => { if (groupBy === "category") setExpandedCats(prev => ({ ...prev, [group.label]: !prev[group.label] })); }}
                  style={{ width: "100%", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 16px", cursor: groupBy === "category" ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8 }}>
                  {group.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: group.color, flexShrink: 0 }} />}
                  {groupBy === "category" && <span style={{ fontSize: 12, color: T.txD }}>{isExpanded ? "\u25BE" : "\u25B8"}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, flex: 1, textAlign: "left" }}>{group.label}</span>
                  <span style={{ fontSize: 12, color: T.txD }}>{group.items.length}</span>
                </button>

                {/* Skill rows */}
                {isExpanded && (
                  <div style={{ marginTop: 4 }}>
                    {group.items.map(({ sk, str }) => {
                      var expanded = expandedSkillId === sk.id;
                      var strPct = Math.round(str * 100);
                      var due = isDue(sk);
                      return (
                        <div key={sk.id}>
                          {/* Compact row */}
                          <button onClick={() => setExpandedSkillId(expanded ? null : sk.id)}
                            style={{ width: "100%", background: expanded ? T.sfH : "transparent", border: "none", borderBottom: "1px solid " + T.bd, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s ease" }}
                            onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                            onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}>
                            {/* Strength dot */}
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: strengthColor(str), flexShrink: 0 }} />
                            {/* Name */}
                            <span style={{ fontSize: 13, color: T.tx, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</span>
                            {/* Category chip (only in strength mode) */}
                            {groupBy === "strength" && sk.category && (
                              <span style={{ fontSize: 10, color: T.txM, background: T.sf, padding: "1px 6px", borderRadius: 8, flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.category}</span>
                            )}
                            {/* Due badge */}
                            {due && <span style={{ fontSize: 9, color: T.rd, background: "rgba(248,113,113,0.1)", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>Due</span>}
                            {/* Strength % */}
                            <span style={{ fontSize: 12, color: strengthColor(str), flexShrink: 0, minWidth: 32, textAlign: "right" }}>{str > 0 ? strPct + "%" : "New"}</span>
                          </button>

                          {/* Expanded detail */}
                          {expanded && (
                            <div style={{ padding: "10px 16px 12px 30px", background: T.sfH, borderBottom: "1px solid " + T.bd }}>
                              {sk.description && <div style={{ fontSize: 13, color: T.txD, marginBottom: 8 }}>{sk.description}</div>}
                              {/* Badges */}
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                                {sk.bloomsLevel && <span style={{ fontSize: 10, color: T.ac, background: T.acS, padding: "2px 6px", borderRadius: 4 }}>{sk.bloomsLevel}</span>}
                                {sk.skillType && <span style={{ fontSize: 10, color: T.txM, background: T.bg, padding: "2px 6px", borderRadius: 4 }}>{sk.skillType}</span>}
                              </div>
                              {/* Mastery criteria */}
                              {sk.masteryCriteria && sk.masteryCriteria.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 11, color: T.txM, marginBottom: 3 }}>Mastery criteria:</div>
                                  {sk.masteryCriteria.map((c, ci) => (
                                    <div key={ci} style={{ fontSize: 12, color: T.txD, paddingLeft: 8, marginBottom: 1 }}>{typeof c === "string" ? c : c.text}</div>
                                  ))}
                                </div>
                              )}
                              {/* Prerequisites */}
                              {sk.prerequisites && sk.prerequisites.length > 0 && (
                                <div style={{ fontSize: 12, color: T.txD, marginBottom: 6 }}>
                                  Prerequisites: {sk.prerequisites.map(p => typeof p === "string" ? p : (p.name || p.conceptKey || p.id)).join(", ")}
                                </div>
                              )}
                              {/* Mastery info */}
                              {sk.mastery && (
                                <div style={{ fontSize: 11, color: T.gn, marginBottom: 6 }}>
                                  Reviewed {sk.mastery.reps}x | Next: {sk.mastery.nextReviewAt ? new Date(sk.mastery.nextReviewAt > 1e12 ? sk.mastery.nextReviewAt : sk.mastery.nextReviewAt * 1000).toLocaleDateString() : "\u2014"}
                                </div>
                              )}
                              {/* Sources (V1 compat) */}
                              {!sk.masteryCriteria && sk.sources && sk.sources.length > 0 && (
                                <div style={{ fontSize: 11, color: T.txM, marginBottom: 4 }}>Sources: {sk.sources.slice(0, 3).join(", ")}{sk.sources.length > 3 ? "..." : ""}</div>
                              )}
                              {/* Concept key */}
                              {sk.conceptKey && <div style={{ fontSize: 10, color: T.txM, fontFamily: "monospace" }}>{sk.conceptKey}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>)}
      </div>
      </div>
    </div>
  </>);
}
