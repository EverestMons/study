import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function DupPromptModal() {
  const { dupPrompt } = useStudy();

  if (!dupPrompt) return null;

  const { materialName, dupSummary, resolve } = dupPrompt;
  const mats = dupSummary.materials || [];
  const isSingle = mats.length === 1;
  const isPartial = dupSummary.totalMatching < dupSummary.totalNew;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 2000, pointerEvents: "all"
    }}>
      <style>{CSS}</style>
      <div style={{
        background: T.sf, borderRadius: 16, padding: 32, maxWidth: 440, width: "90%",
        textAlign: "center", borderLeft: "4px solid " + T.am,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.tx, marginBottom: 12 }}>
          {isPartial ? "Partial overlap detected" : "Similar content detected"}
        </div>

        <div style={{ fontSize: 14, color: T.txD, marginBottom: 16, lineHeight: 1.5 }}>
          {isSingle && !isPartial && (
            <>
              "{materialName}" looks like a revision of "{mats[0].materialName}"
              <div style={{ fontSize: 13, color: T.txM, marginTop: 8 }}>
                {mats[0].matchingChunks} of {mats[0].totalNewChunks} sections match ({mats[0].avgSimilarity}% avg similarity)
              </div>
            </>
          )}
          {isSingle && isPartial && (
            <>
              {dupSummary.totalMatching} of {dupSummary.totalNew} sections in "{materialName}" overlap with "{mats[0].materialName}"
            </>
          )}
          {!isSingle && (
            <>
              "{materialName}" overlaps with:
              <div style={{ textAlign: "left", margin: "8px auto", maxWidth: 340 }}>
                {mats.map((m, i) => (
                  <div key={i} style={{ fontSize: 13, color: T.txD, marginBottom: 4 }}>
                    &bull; "{m.materialName}" — {m.matchingChunks} sections ({m.avgSimilarity}%)
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: T.txM }}>
                {dupSummary.totalMatching} of {dupSummary.totalNew} sections match existing content.
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => resolve("skip")}
            style={{
              padding: "10px 20px", background: T.sf, border: "1px solid " + T.am,
              borderRadius: 8, color: T.am, fontWeight: 600, cursor: "pointer", fontSize: 13,
            }}>
            {isPartial ? "Skip overlapping" : "Skip \u2014 same material"}
          </button>
          <button
            onClick={() => resolve("extract")}
            style={{
              padding: "10px 20px", background: T.ac, border: "none",
              borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13,
            }}>
            {isPartial ? "Extract all" : "Extract anyway"}
          </button>
        </div>

        <div style={{ fontSize: 12, color: T.txM }}>
          Skip inherits existing skills. Extraction uses API credits.
        </div>
      </div>
    </div>
  );
}
