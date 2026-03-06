import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { loadSkillsV2 } from "../lib/skills.js";
import { migrateV1ToV2 } from "../lib/migrate.js";
import GlobalLockOverlay from "../components/GlobalLockOverlay.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function SkillsScreen() {
  const {
    active, globalLock, setGlobalLock, busy, setBusy, status, setStatus,
    skillViewData, setSkillViewData, expandedCats, setExpandedCats,
    setScreen, setShowSettings, addNotif,
  } = useStudy();

  return (<>
    {globalLock && <GlobalLockOverlay />}
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => setScreen("manage")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>&lt; Back</button>
        <button onClick={() => setShowSettings(true)}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.sfH}
          onMouseLeave={e => e.currentTarget.style.background = T.sf}>
          Settings
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Skills</h1>
        <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 24 }}>{active.name}</p>

        {/* V1->V2 Migration Banner */}
        {skillViewData && !skillViewData.isV2 && skillViewData.skills?.length > 0 && (
          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ac, marginBottom: 6 }}>Upgrade available</div>
            <div style={{ fontSize: 13, color: T.txD, marginBottom: 12 }}>This course uses v1 skills. Migrate to v2 for richer mastery criteria, Bloom's levels, and prerequisite tracking. All existing progress is preserved.</div>
            <button disabled={!!globalLock} onClick={async () => {
              if (globalLock) return;
              setGlobalLock({ message: "Migrating skills to v2..." });
              setBusy(true); setStatus("Starting migration...");
              try {
                var result = await migrateV1ToV2(active.id, {
                  onProgress: setStatus,
                });
                if (result.migrated > 0) {
                  addNotif("success", "Migrated " + result.migrated + " skills, " + result.mastery + " mastery records.");
                  var sk = await loadSkillsV2(active.id);
                  setSkillViewData({ skills: sk, isV2: true });
                } else {
                  addNotif("warn", "Migration returned 0 skills. " + (result.issues?.[0]?.type || "Unknown issue."));
                }
              } catch (e) {
                console.error("Migration failed:", e);
                addNotif("error", "Migration failed: " + e.message);
              } finally {
                setGlobalLock(null); setBusy(false); setStatus("");
              }
            }} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: T.ac, color: "#0F1115", fontWeight: 600, fontSize: 13, cursor: globalLock ? "not-allowed" : "pointer", opacity: globalLock ? 0.5 : 1 }}>Migrate to v2</button>
          </div>
        )}

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
          if (!skills.length) return <div style={{ color: T.txD, textAlign: "center", padding: 40 }}>No skills yet. Upload materials to get started.</div>;

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
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{isExpanded ? "\u25BE" : "\u25B8"} {cat}</span>
                      <span style={{ fontSize: 12, color: T.txD }}>{catSkills.length}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ marginTop: 8, marginLeft: 16 }}>
                        {catSkills.map(sk => (
                          <div key={sk.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, flex: 1 }}>{sk.name}</div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                {sk.bloomsLevel && <span style={{ fontSize: 10, color: T.ac, background: T.acS || "rgba(99,102,241,0.1)", padding: "2px 6px", borderRadius: 4 }}>{sk.bloomsLevel}</span>}
                                {sk.skillType && <span style={{ fontSize: 10, color: T.txM, background: T.bg, padding: "2px 6px", borderRadius: 4 }}>{sk.skillType}</span>}
                              </div>
                            </div>
                            {sk.description && <div style={{ fontSize: 13, color: T.txD, marginBottom: 8 }}>{sk.description}</div>}
                            {/* V2: mastery criteria */}
                            {sk.masteryCriteria && sk.masteryCriteria.length > 0 && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: T.txM, marginBottom: 4 }}>Mastery criteria:</div>
                                {sk.masteryCriteria.map((c, ci) => (
                                  <div key={ci} style={{ fontSize: 12, color: T.txD, paddingLeft: 8, marginBottom: 2 }}>
                                    {typeof c === "string" ? c : c.text}
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* V2: prerequisites with names */}
                            {sk.prerequisites && sk.prerequisites.length > 0 && (
                              <div style={{ fontSize: 12, color: T.txD, marginBottom: 4 }}>
                                Prerequisites: {sk.prerequisites.map(p => typeof p === "string" ? p : (p.name || p.conceptKey || p.id)).join(", ")}
                              </div>
                            )}
                            {/* V2: mastery state */}
                            {sk.mastery && (
                              <div style={{ fontSize: 11, color: T.gn || "#22C55E", marginTop: 4 }}>
                                Reviewed {sk.mastery.reps}x | Next: {sk.mastery.nextReviewAt ? new Date(sk.mastery.nextReviewAt).toLocaleDateString() : "\u2014"}
                              </div>
                            )}
                            {/* V1 compat: sources */}
                            {!sk.masteryCriteria && sk.sources && sk.sources.length > 0 && (
                              <div style={{ fontSize: 11, color: T.txM }}>Sources: {sk.sources.slice(0, 3).join(", ")}{sk.sources.length > 3 ? "..." : ""}</div>
                            )}
                            {sk.conceptKey && <div style={{ fontSize: 10, color: T.txM, marginTop: 4, fontFamily: "monospace" }}>{sk.conceptKey}</div>}
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
    </div>
  </>);
}
