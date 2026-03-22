import React, { useState } from "react";
import { T } from "../../lib/theme.jsx";
import { generateSubmission, downloadBlob } from "../../lib/export.js";
import { useStudy } from "../../StudyContext.jsx";

const formatKey = (k) => k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function SessionSummary() {
  const {
    msgs, setScreen,
    previousScreen, clearSessionState,
    exporting, setExporting,
    sessionSummary, setSessionSummary,
  } = useStudy();

  const [facetsExpanded, setFacetsExpanded] = useState(false);

  if (!sessionSummary) return null;

  const masteryEvents = sessionSummary.masteryEvents || [];
  const facetsRaw = sessionSummary.facetsAssessed || [];
  const masteredIds = new Set();
  for (var me of masteryEvents) { masteredIds.add(me.skillId); masteredIds.add(me.conceptKey); }
  var nonMasteredSkills = (sessionSummary.skillChanges || []).filter(function(sc) { return !masteredIds.has(sc.skillId); });

  // Deduplicate facets (last rating wins)
  var facetMap = new Map();
  for (var fa of facetsRaw) facetMap.set(fa.facetKey, fa);
  var uniqueFacets = [...facetMap.values()];

  // What's next
  var ratingVal = { struggled: 0, hard: 1, good: 2, easy: 3 };
  var weakest = (sessionSummary.skillChanges || []).reduce(function(w, sc) {
    if (!w || (ratingVal[sc.rating] ?? 2) < (ratingVal[w.rating] ?? 2)) return sc;
    return w;
  }, null);

  var ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 100, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }}>
      <div style={{ maxWidth: 500, width: "100%" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 24, textAlign: "center" }}>Session Complete</div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: T.sf, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.ac }}>{sessionSummary.duration || 0}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>minutes</div>
          </div>
          <div style={{ flex: 1, background: T.sf, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.ac }}>{sessionSummary.entry?.messageCount || msgs.length}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>messages</div>
          </div>
          {masteryEvents.length > 0 && (
            <div style={{ flex: 1, background: T.sf, borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.gn }}>{masteryEvents.length}</div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>mastered</div>
            </div>
          )}
        </div>

        {/* Skills Mastered */}
        {masteryEvents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.gn, marginBottom: 10 }}>Skills Mastered</div>
            <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, overflow: "hidden" }}>
              {masteryEvents.map(function(me, i) {
                return (
                  <div key={i} style={{ padding: "12px 16px", borderTop: i > 0 ? "1px solid rgba(52,211,153,0.15)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.gn, fontWeight: 600 }}>{"\u2713"}</span>
                        <span style={{ fontSize: 13, color: T.tx, fontWeight: 600 }}>{me.skillName}</span>
                      </div>
                      {(() => { var displayLevel = Math.max(me.levelAfter, me.levelBefore); return me.levelBefore !== displayLevel ? (
                        <span style={{ fontSize: 12, color: T.ac }}>Lv {me.levelBefore}{"\u2192"}{displayLevel}</span>
                      ) : null; })()}
                    </div>
                    <div style={{ fontSize: 11, color: T.txD, marginTop: 4, paddingLeft: 22 }}>
                      {me.facets.length}/{me.facets.length} facets demonstrated
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Skills practiced (non-mastered) */}
        {nonMasteredSkills.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 10 }}>Skills Practiced</div>
            {nonMasteredSkills.map(function(sc, i) {
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.sf, borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.tx }}>{sc.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: ratingColor[sc.rating] || T.am, fontWeight: 500 }}>{sc.rating}</span>
                    <span style={{ fontSize: 10, color: T.txD }}>{Math.round(sc.strength * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Facets Assessed */}
        {uniqueFacets.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 10 }}>Facets Assessed ({uniqueFacets.length})</div>
            <div style={{ background: T.sf, borderRadius: 10, padding: "10px 14px" }}>
              {(facetsExpanded ? uniqueFacets : uniqueFacets.slice(0, 5)).map(function(fa, i) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: T.txD }}>{formatKey(fa.facetKey)}</span>
                    <span style={{ color: ratingColor[fa.rating] || T.ac, fontSize: 11 }}>{fa.rating}</span>
                  </div>
                );
              })}
              {uniqueFacets.length > 5 && !facetsExpanded && (
                <button onClick={function() { setFacetsExpanded(true); }}
                  style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, padding: "4px 0", marginTop: 4 }}>
                  + {uniqueFacets.length - 5} more
                </button>
              )}
            </div>
          </div>
        )}

        {/* Topics covered */}
        {sessionSummary.entry?.topicsDiscussed?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 10 }}>Topics Covered</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sessionSummary.entry.topicsDiscussed.slice(0, 12).map(function(t, i) {
                return <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: T.acS, color: T.ac }}>{t}</span>;
              })}
            </div>
          </div>
        )}

        {/* Breakthroughs */}
        {sessionSummary.entry?.wins?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.gn, marginBottom: 10 }}>Breakthroughs</div>
            {sessionSummary.entry.wins.map(function(w, i) {
              return <div key={i} style={{ fontSize: 12, color: T.txD, padding: "6px 10px", background: T.gnS, borderRadius: 8, marginBottom: 4, fontStyle: "italic" }}>"{w}"</div>;
            })}
          </div>
        )}

        {/* What's Next */}
        {sessionSummary.skillChanges?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 8 }}>What's Next</div>
            <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.5 }}>
              {weakest && (weakest.rating === "struggled" || weakest.rating === "hard")
                ? "Suggested: " + weakest.name + " (needs more practice)"
                : "All practiced skills are in good shape."}
            </div>
          </div>
        )}

        {/* Export DOCX button — only if assignment work exists */}
        {sessionSummary.asgnWork?.questions?.some(function(q) { return q.done; }) && (
          <button disabled={exporting} onClick={async function() {
            setExporting(true);
            try {
              var title = sessionSummary.asgnWork.title || "Assignment";
              var blob = await generateSubmission(title, sessionSummary.asgnWork.questions, sessionSummary.courseName || "Course");
              if (blob) downloadBlob(blob, title.replace(/[^a-zA-Z0-9]/g, "_") + "_answers.docx");
            } finally {
              setExporting(false);
            }
          }}
            style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "1px solid " + T.bd, background: T.sf, color: T.tx, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, opacity: exporting ? 0.5 : 1 }}>
            {exporting ? "Exporting..." : "Export answers (.docx)"}
          </button>
        )}

        <button onClick={function() {
          clearSessionState();
          var safeScreen = (previousScreen && previousScreen !== "study") ? previousScreen : "courseHome";
          setScreen(safeScreen);
        }}
          style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: T.ac, color: "#0F1115", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
          Done
        </button>
      </div>
    </div>
  );
}
