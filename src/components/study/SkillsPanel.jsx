import React from "react";
import { T } from "../../lib/theme.jsx";
import { callClaude, extractJSON } from "../../lib/api.js";
import { loadSkillsV2 } from "../../lib/skills.js";
import { useStudy } from "../../StudyContext.jsx";

export default function SkillsPanel() {
  const {
    active,
    busy, setBusy, setStatus,
    showSkills, skillViewData, setSkillViewData,
    expandedCats, setExpandedCats,
    addNotif,
  } = useStudy();

  if (!showSkills || !skillViewData) return null;

  return (
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
                                  if (typeof p === "object") return p.name || p.conceptKey || p.id;
                                  var dep = skillViewData.skills.find(s => s.id === p || s.conceptKey === p);
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
                              var refCtx = "";
                              var flagPrompt = "A student flagged this skill as potentially incorrect in their course skill tree.\n\nFLAGGED SKILL:\n" + JSON.stringify(sk, null, 2) + "\n\nFULL SKILL TREE CONTEXT (nearby skills):\n" + JSON.stringify(skillViewData.skills.filter(s => s.category === sk.category || (sk.prerequisites && sk.prerequisites.includes(s.id)) || (s.prerequisites && s.prerequisites.includes(sk.id))).slice(0, 15), null, 1) + refCtx + "\n\nRe-examine this skill. Check:\n1. Is the name accurate for what the source material actually teaches?\n2. Is the description specific and testable?\n3. Are the prerequisites correct and complete?\n4. Is it categorized correctly?\n5. Should it be split into multiple skills or merged with another?\n\nRespond with ONLY a JSON object:\n{\n  \"action\": \"keep|modify|split|merge\",\n  \"explanation\": \"why this action\",\n  \"correctedSkill\": { ...the skill with any fixes applied... },\n  \"splitInto\": [ ...if splitting, the new skills... ]\n}";
                              var result = await callClaude(flagPrompt, [{ role: "user", content: "Re-examine this flagged skill." }], 4096);
                              var parsed = extractJSON(result);
                              if (parsed && parsed.correctedSkill) {
                                // V2 skills: update in sub_skills table
                                if (sk.conceptKey) {
                                  const { SubSkills: SS } = await import("../../lib/db.js");
                                  if (parsed.action === "modify" || parsed.action === "keep") {
                                    var cs = parsed.correctedSkill;
                                    await SS.update(sk.id, {
                                      name: cs.name || sk.name,
                                      description: cs.description || sk.description,
                                      category: cs.category || sk.category,
                                      skill_type: cs.skillType || sk.skillType || null,
                                      blooms_level: cs.bloomsLevel || sk.bloomsLevel || null,
                                    });
                                  }
                                  // Reload v2 skills from DB
                                  var refreshed = await loadSkillsV2(active.id);
                                  setSkillViewData(prev => ({ ...prev, skills: refreshed }));
                                }
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
  );
}
