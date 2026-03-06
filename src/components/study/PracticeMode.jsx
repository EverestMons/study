import React from "react";
import { T } from "../../lib/theme.jsx";
import { DB } from "../../lib/db.js";
import {
  TIERS, evaluateAnswer, completeTierAttempt,
  loadPracticeMaterialCtx, generateProblems,
  applySkillUpdates,
} from "../../lib/study.js";
import { useStudy } from "../../StudyContext.jsx";

export default function PracticeMode() {
  const {
    active,
    practiceMode, setPracticeMode,
    addNotif,
  } = useStudy();

  if (!practiceMode) return null;

  // Generating indicator
  if (practiceMode.generating) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: T.txD, marginBottom: 8 }}>Generating practice problems...</div>
          <div style={{ fontSize: 12, color: T.txD }}>Tier {practiceMode?.set?.currentTier || "?"}: {TIERS[practiceMode?.set?.currentTier]?.name || "..."}</div>
        </div>
      </div>
    );
  }

  if (!practiceMode.set) return null;

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
                  var matCtx2 = await loadPracticeMaterialCtx(active.id, active.materials, pm.skill);
                  var updated2 = await generateProblems(pset, pm.skill, active.name, matCtx2);
                  await DB.savePractice(active.id, pm.skill.id, updated2);
                  setPracticeMode({ set: updated2, skill: pm.skill, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
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
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {/* IES Rec 2: Worked Example (Tiers 1-3 only, before attempting problem) */}
            {tier <= 3 && problem.workedExample && !problem.exampleViewed && problem.passed === null ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: T.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>1</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Study This Example First</div>
                </div>
                <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: T.ac, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Example Problem</div>
                  <div style={{ fontSize: 15, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{problem.workedExample.problem}</div>
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
                <div style={{ fontSize: 15, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{problem.prompt}</div>

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

                          // Derive FSRS rating from practice performance
                          var practiceRating;
                          if (tierResult.attemptNum === 1 && tierResult.passCount >= 4) practiceRating = 'easy';
                          else if (tierResult.attemptNum <= 2 && tierResult.passCount >= 4) practiceRating = 'good';
                          else if (tierResult.passCount >= 4) practiceRating = 'hard';
                          else practiceRating = 'struggled';

                          await applySkillUpdates(active.id, [{
                            skillId: pm.skill.id,
                            rating: practiceRating,
                            reason: "Practice Tier " + tier + " (" + tierResult.tierName + ") - " + tierResult.passCount + "/5 on attempt " + tierResult.attemptNum,
                            source: 'practice',
                            context: 'guided',
                          }]);

                          // Increment practice attempts for fitness tracking
                          try {
                            const { SubSkills } = await import("../../lib/db.js");
                            await SubSkills.incrementPracticeAttempts(pm.skill.id);
                          } catch (e) { /* non-critical */ }

                          if (tierResult.points > 0) {
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
}
