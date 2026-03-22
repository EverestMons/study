# IES Full Implementation Status Diagnostic
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## Audit: All 7 IES Practice Guide Recommendations

### Summary Table

| Rec | Description | Spec Status | Actual Status | Where Implemented | Gap Remaining |
|-----|-------------|-------------|---------------|-------------------|---------------|
| 1 | Spaced review surface | Partial — decay exists, no UI surface | **Implemented** (prompt + UI) | System prompt ASSESSMENT PROTOCOL ("DUE FOR REVIEW"); SkillPicker.jsx:115,130,211,274,284 (isDue filter + banner + per-group/per-skill DUE badges); CurriculumScreen.jsx:421,453-459 (due banner + isDue badges); ScheduleScreen.jsx (overdue indicators) | No separate "Review" entry point (optional per spec) |
| 2 | Worked example interleaving | Weak — no pre-problem examples | **Implemented** (prompt + UI) | System prompt TEACHING METHOD ("demonstrate with a worked example, ask student to solve similar problem"); PracticeMode.jsx:133-164 (worked example display for Tiers 1-3); study.js:1806-1810 (workedExample generation in problem prompt) | Tiers 4-6 omit examples intentionally per IES guidance |
| 3 | Graphics + verbal | Missing — text-only | **Partial** (prompt + infrastructure) | System prompt IMAGE DISPLAY section (SHOW_IMAGE tags); image extraction pipeline exists (img_ IDs); PHANTOM VISUAL GUARD prevents referencing unavailable visuals | Still text-primary; can show extracted images from materials but no diagram generation. Spec recommends punt — this is the punt. |
| 4 | Concreteness fading | Missing — no structured fading | **Implemented** (prompt) | System prompt section CONCRETENESS FADING: 4-step progression (concrete → bridge → abstract → vary) | None |
| 5a | Pre-questions | Missing | **Implemented** (prompt) | System prompt section PRE-QUESTION PHASE: 1-2 diagnostic questions before teaching, with examples and delayed self-assessment for returning skills | None |
| 5b | Quizzing for retrieval | Strong — Practice Mode | **Strong** (prompt + UI) | PracticeMode.jsx: full 6-tier system (Predict, Fill, Write, Debug, Combine, Apply); AI-generated problem sets; AI evaluation of answers | None |
| 6a | Delayed judgment of learning | Missing — no self-assessment | **Implemented** (prompt + UI) | System prompt PRE-QUESTION PHASE: "For returning skills: ask 'How confident are you that you still remember [concept] from last time?'"; PracticeMode.jsx:177-200 (1-5 confidence rating UI before each problem); study.js:1840 (confidenceRating field in data model) | No calibration tracking over time (spec Phase 2 suggestion — not yet built) |
| 6b | Gap identification | Partial — AI tracks, not surfaced | **Implemented** (prompt + UI) | System prompt ASSIGNMENT-FIRST PRIORITY ("what skills are required, which demonstrated, which are gaps"); System prompt READING THE STUDENT (adapts by strength level); SkillPicker.jsx due banner + per-skill DUE badges; CurriculumScreen.jsx isDue badges; ScheduleScreen.jsx overdue indicators | Boot message doesn't explicitly name "your weakest area is X" (spec suggestion) |
| 7 | Deep explanatory questions | Strong — Socratic method | **Strong** (prompt) | System prompt DEEP QUESTIONS: full Bloom's taxonomy matching (remember/understand → apply → analyze → evaluate → create); facet-level blooms tags drive question depth | None |

---

## Detailed Findings

### Rec 1 — Spaced Review Surface

**Spec said:** `nextReviewDate()` exists but is never shown to students.

**Actual:** Fully surfaced at multiple levels.

- **System prompt** (ASSESSMENT PROTOCOL): "If skills are flagged DUE FOR REVIEW in student status, weave 1-2 brief recall questions about those skills into the session naturally."
- **SkillPicker.jsx**: `isDue` function (line 130) checks `reviewDate === "now"` or overdue. `dueSkills` filter (line 115) collects all due skills. Due skills banner (line 211) shown at top. Per-group due count badge (line 274). Per-skill DUE indicator (line 284).
- **CurriculumScreen.jsx**: Due review banner (line 421). Per-skill isDue check with "DUE" badge (lines 453-459).
- **ScheduleScreen.jsx**: Overdue indicators and due review counts displayed.
- **Mastery.getDueForReview()** (db.js:1938): Query that powers all due skill surfaces.

**Status:** Implemented at both prompt level (AI weaves due skills into sessions) and UI level (visual indicators across 3+ screens).

### Rec 2 — Worked Example Interleaving

**Spec said:** Practice Mode gives problems but no worked examples before attempting.

**Actual:** Full interleaving implemented.

- **System prompt** (TEACHING METHOD): "explain the principle, demonstrate with a worked example showing step-by-step reasoning, ask the student to solve a similar but different problem."
- **Problem generation** (study.js:1806-1810): Every generated problem includes a `workedExample` object with `problem`, `solution`, and `keyInsight` fields.
- **PracticeMode.jsx** (lines 133-164): For Tiers 1-3, shows worked example BEFORE the problem. Step 1: "Study This Example First" with example problem, annotated solution, and key insight. Step 2: "Now Try This One" after clicking "Got It - Show Me the Problem."
- **Tiers 4-6**: No worked examples shown — matching IES guidance that "decreased example use and correspondingly increased problem solving appears to improve learning" for developing expertise.
- **Data model**: `exampleViewed` boolean tracks whether student studied the example.

### Rec 3 — Graphics + Verbal

**Spec said:** Text-only. Recommendation: punt for now.

**Actual:** Punt implemented with infrastructure for future expansion.

- **System prompt** (IMAGE DISPLAY): Full SHOW_IMAGE tag system for displaying extracted images from course materials inline during teaching.
- **PHANTOM VISUAL GUARD**: Prevents the AI from referencing visuals it can't display — describes concepts verbally instead.
- **Image extraction pipeline**: Images extracted from uploaded materials get `img_` prefixed IDs and are available in the AVAILABLE VISUALS context section.

This is the punt the spec recommended — text-primary but can reference extracted figures when available.

### Rec 4 — Concreteness Fading

**Already confirmed in previous diagnostic.** System prompt section CONCRETENESS FADING implements the full 4-step progression: concrete first → bridge → abstract → vary.

### Rec 5a — Pre-Questions

**Already confirmed in previous diagnostic.** System prompt section PRE-QUESTION PHASE implements diagnostic questions before teaching, with delayed self-assessment for returning skills.

### Rec 5b — Quizzing for Retrieval

**Spec said:** Strong — Practice Mode exists.

**Actual:** Confirmed strong.

- PracticeMode.jsx: Full 6-tier system with AI-generated problems at increasing difficulty.
- Tiers: Predict → Fill → Write → Debug → Combine → Apply (study.js:1718-1726).
- Problems test recall and application without aids — student must produce answers, not just recognize them.
- Tier advancement requires 4/5 correct, with point multiplier decay for retries.

### Rec 6a — Delayed Judgment of Learning

**Spec said:** Missing — no self-assessment.

**Actual:** Implemented at two levels.

- **Prompt level** (PRE-QUESTION PHASE): "For returning skills (not brand new): before teaching, ask 'How confident are you that you still remember [concept] from last time?' This delayed self-assessment after time away is more accurate than immediate confidence ratings."
- **UI level** (PracticeMode.jsx:177-200): Before each practice problem, a 1-5 confidence rating UI appears: "Before you start: How confident are you?" Student must rate before answering.
- **Data model** (study.js:1840): `confidenceRating` field stored per problem for future calibration analysis.

**Remaining gap:** The spec's Phase 2 suggestion (calibration tracking — showing "Your confidence tends to be [higher/lower/accurate]") is not yet built. The data is captured but not analyzed or surfaced.

### Rec 6b — Gap Identification Surface

**Spec said:** AI tracks gaps internally but doesn't surface them to students.

**Actual:** Gaps surfaced at multiple levels.

- **Prompt level** (ASSIGNMENT-FIRST PRIORITY): "reverse-engineer it: what skills are required, which has the student demonstrated, which are gaps. Then start on the gaps." AI explicitly identifies and communicates gaps.
- **Prompt level** (READING THE STUDENT): Adapts behavior based on skill level — pushes harder on moderate, tests edge cases on high, builds confidence on low.
- **UI level**: SkillPicker due banner + DUE badges, CurriculumScreen isDue indicators, ScheduleScreen overdue counts — all surface which skills need attention.

**Remaining gap:** Boot message doesn't use the specific phrasing "Your weakest area right now is [X]" that the spec suggested. The AI identifies gaps through its teaching flow, but there's no explicit "here's your weak spot" opening statement.

### Rec 7 — Deep Explanatory Questions

**Spec said:** Strong — Socratic method.

**Actual:** Confirmed strong with structured Bloom's taxonomy integration.

- **System prompt** (DEEP QUESTIONS): Maps question types to Bloom's levels — remember/understand → apply → analyze → evaluate → create.
- **Facet-level tags**: Each facet carries a `blooms` level tag that the AI uses to calibrate question depth.
- **Progression guidance**: "start with recall to verify foundation. Escalate to 'why' and 'how' once basics are solid. Push to 'what-if' only when they handle analysis."

---

## Summary

**5 of 7 recommendations were listed as Missing or Weak in the spec but are now Implemented.** The spec's Current State Assessment table is significantly outdated.

| Rec | Spec Listed As | Actual Status |
|-----|----------------|---------------|
| 1 | Partial | **Implemented** |
| 2 | Weak | **Implemented** |
| 3 | Missing | **Partial** (punt, as spec recommended) |
| 4 | Missing | **Implemented** |
| 5a | Missing | **Implemented** |
| 5b | Strong | **Strong** (confirmed) |
| 6a | Missing | **Implemented** |
| 6b | Partial | **Implemented** |
| 7 | Strong | **Strong** (confirmed) |

**Remaining gaps (non-blocking):**
1. No separate "Review" entry point in mode picker (Rec 1, optional)
2. No diagram generation capability (Rec 3, punted per spec)
3. No calibration tracking over time for confidence ratings (Rec 6a, Phase 2 suggestion)
4. No explicit "your weakest area is X" opening statement in boot message (Rec 6b, minor phrasing)

**Recommendation:** Update the IES implementation spec's Current State Assessment table to reflect actual status. All 7 recommendations are at least partially addressed; 6 of 7 are fully implemented.

---

## Output Receipt
**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Audited all 7 IES Practice Guide recommendations against the live codebase. Investigated system prompt sections, PracticeMode.jsx, SkillPicker.jsx, CurriculumScreen.jsx, ScheduleScreen.jsx, study.js problem generation, and db.js query surfaces.

### Files Deposited
- `study/knowledge/research/ies-full-status-diagnostic-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- No code changes needed — all 7 IES recommendations are at least partially implemented.
- The IES implementation spec's status table should be updated to reflect current reality.

### Flags for CEO
- The IES implementation spec (`docs/planning/ies-implementation-spec.md`) is significantly outdated — 5 recommendations listed as Missing/Weak are now Implemented. Consider updating the spec or archiving it with a note.
