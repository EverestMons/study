# Assignment Tutor Question Boundary Fix — Development Log
**Date:** 2026-03-18
**Build:** Verified clean (`npm run build` — 0 errors)

---

## Problem
The AI tutor in assignment mode was asking the student assignment questions directly (or close paraphrases) during its "diagnostic" phase, even though questions are supposed to be locked until the student demonstrates prerequisite skill competence. Root cause: undifferentiated `QUESTIONS:` block in context + weak mode hint.

## Files Modified

### `src/lib/study.js` — `buildFocusedContext`, assignment branch (line ~1294)
- **Renamed** `QUESTIONS:` block to `ASSIGNMENT QUESTIONS — INSTRUCTOR PLANNING ONLY (never reveal to student):`
  - Same data as before: q.id, q.description, q.difficulty, q.requiredSkills
  - Label change makes the AI treat this as planning-only reference material
- **Added** `STUDENT VIEW:` block after the instructor section
  - For each question, shows either `[LOCKED] — requires: skill-a, skill-b` or `[UNLOCKED] — student is working on this`
  - Lock status read from `focus.unlocked` map (defaults to `{}` = all locked)
  - Gives the AI a clear picture of what the student can/cannot see

### `src/StudyContext.jsx` — `bootWithFocus`, assignment mode hint (line ~1103)
- **Rewrote `modeHint`** with three improvements:
  1. **QUESTION VISIBILITY RULES** section: explicit prohibition — "NEVER ask the student the assignment question, restate it, or closely paraphrase it"
  2. **BAD vs GOOD example**: concrete example of what not to do vs what to do (binary search example)
  3. **Clearer FLOW**: "Ask diagnostic questions about the CONCEPT, not about the assignment task"
- Old hint said "Do NOT show or describe the question yet" (abstract, ignored)
- New hint gives a specific counterexample the AI can pattern-match against

### `src/StudyContext.jsx` — `sendMessage`, context rebuild paths (lines ~1157, ~1231)
- **Added unlock status enrichment** at both `buildFocusedContext` rebuild call sites
  - Reads current `asgnWork.questions` to build `unlocked` map: `{ qId: true }` for each unlocked question
  - Passes enriched focus object: `{ ...focusContext, unlocked: unlocked }`
  - Ensures STUDENT VIEW section stays current as questions are unlocked mid-session
- At boot time (line 1064), `focus.unlocked` is undefined → defaults to `{}` → all LOCKED (correct)

## Files NOT Modified
- `src/lib/study.js` — `parseQuestionUnlock()` — works correctly
- `src/components/study/AssignmentPanel.jsx` — lock/unlock rendering correct
- FSRS / mastery tracking — unchanged
- Facet assessment block injection — unchanged

## Key Design Decisions
1. AI retains full question visibility (instructor planning section) — needed to teach *toward* the question intelligently
2. Two-section structure creates a clear boundary: "this is for you" vs "this is what the student sees"
3. Concrete BAD/GOOD example in mode hint — abstract instructions weren't landing, specific examples give the model a pattern to avoid
4. Unlock status flows from `asgnWork` state into context rebuilds, keeping STUDENT VIEW current
