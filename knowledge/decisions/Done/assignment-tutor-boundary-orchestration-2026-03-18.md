# study — Assignment Tutor Question Boundary Fix
## Orchestration Plan
**Date:** 2026-03-18
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Fix AI tutor asking assignment questions directly instead of teaching prerequisite skills; tighten question visibility boundary in context and prompt

---

## Feature Summary

The AI tutor in assignment mode is asking the student assignment questions directly (or close paraphrases) as part of its "diagnostic" phase, even though the assignment answer panel is locked. The design intent is: teach the prerequisite skills first → unlock the question when the student is ready → student fills in the answer in the side panel. The tutor should never be the one posing the assignment question — that's what the panel is for.

The root cause is two-fold:
1. The full question text is in the AI's context (the `QUESTIONS:` block in `buildFocusedContext`), making it easy for the model to pattern-match the question into its diagnostics
2. The mode hint says "Do NOT show or describe the question yet" but doesn't clearly distinguish between "teaching prerequisite skills with your own diagnostic questions" and "asking the assignment question"

The fix uses two layers: restructure the context to mark question text as instructor-only planning notes, and tighten the prompt to explicitly prohibit asking the assignment question or close paraphrases.

## CEO Decisions (Locked In)

1. **AI keeps visibility of question text** — it needs to see the question to teach *toward* it intelligently. But the question text is moved to a clearly-marked instructor-only section.
2. **AI must never ask the assignment question or a close paraphrase.** It teaches the underlying *concepts* needed to answer the question. The question itself is only revealed via `[UNLOCK_QUESTION]`.
3. **Concrete examples in the prompt** — the mode hint must include a specific example of what NOT to do and what TO do, since abstract instructions aren't landing.

## What Already Exists

### Context builder (`study.js`, `buildFocusedContext`, assignment branch)
Currently outputs:
```
QUESTIONS:
  q1: What is the difference between... [medium]
    Required skills: concept-a, concept-b
```
All questions shown with full descriptions regardless of lock state.

### Mode hint (`StudyContext.jsx`, `bootWithFocus`, assignment branch)
Current text includes: "Questions are hidden from the student. You control when they see each question." and "Do NOT show or describe the question yet. Just begin with a skill-check question." — but the AI ignores this because the question text is right there in an undifferentiated context block.

### Unlock mechanism
AI emits `[UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]` → `parseQuestionUnlock()` in study.js → `setAsgnWork` sets `q.unlocked = true` → AssignmentPanel renders the answer textarea. Working correctly — the issue is purely in what the AI says *before* unlock.


## Execution Steps

### Step 1 — DEV: Context Restructure + Prompt Tightening
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- This orchestration plan
- `src/lib/study.js` — `buildFocusedContext` function, assignment branch (starts ~line 1288)
- `src/StudyContext.jsx` — `bootWithFocus` function, assignment mode hint (starts ~line 1088)
- `src/components/study/AssignmentPanel.jsx` — to understand the lock/unlock rendering
**Depends on:** None (single step)

**Task:**

**A. Context restructure (`study.js`, `buildFocusedContext`, assignment branch):**

Replace the current `QUESTIONS:` block with a two-section structure:

```
ASSIGNMENT QUESTIONS — INSTRUCTOR PLANNING ONLY (never reveal to student):
  q1: [full question text] [difficulty]
    Required skills: concept-a, concept-b
  q2: [full question text] [difficulty]
    Required skills: concept-c

STUDENT VIEW:
  q1: [LOCKED] — requires: concept-a, concept-b
  q2: [LOCKED] — requires: concept-c
```

After a question is unlocked (track via `asgnWork` state or pass unlock status into context), the STUDENT VIEW line changes:
```
  q1: [UNLOCKED] — student is working on this
```

Implementation: the `buildFocusedContext` function currently iterates `asgn.questions` and builds a single QUESTIONS block. Split this into two loops:
1. Instructor block: all questions with full descriptions (as currently)
2. Student view block: only question IDs + required skills + lock/unlock status

The instructor block label must be unambiguous: "INSTRUCTOR PLANNING ONLY (never reveal to student)".

**B. Mode hint rewrite (`StudyContext.jsx`, `bootWithFocus`, assignment branch):**

Replace the current `modeHint` string with:

```
MODE: ASSIGNMENT WORK.

QUESTION VISIBILITY RULES:
- The INSTRUCTOR PLANNING section shows full question text. This is for YOUR planning only.
- The student CANNOT see questions until you unlock them with [UNLOCK_QUESTION].
- NEVER ask the student the assignment question, restate it, or closely paraphrase it.
- Your job is to teach the prerequisite SKILLS so the student can handle the question when they see it.

BAD vs GOOD example:
  Assignment question: "Implement a binary search algorithm"
  BAD (asking the assignment question): "How would you implement binary search?"
  GOOD (teaching the prerequisite skill): "What property of a sorted array lets us skip checking every element?"

FLOW:
1. Look at the FIRST locked question's required skills. Check the student's strength on those skills.
2. If ANY required skill is below 50% strength, teach that skill first. Ask diagnostic questions about the CONCEPT, not about the assignment task.
3. When the student demonstrates competence on ALL skills needed for the question, unlock it:
   [UNLOCK_QUESTION]{first_question_id}[/UNLOCK_QUESTION]
4. After unlocking, the student sees the question in their answer panel. Guide their thinking without writing their answer.
5. When the student completes a question, move to the next locked question's required skills.

Start by checking the first question's prerequisite skills. Your opening question should test a CONCEPT — not describe or hint at the assignment task.

Question order: {question_ids}
Use the exact question ID in the unlock tag.
```

Where `{first_question_id}` and `{question_ids}` are interpolated from the actual question data (same as current implementation).

**Constraints:**
- Do not change the `[UNLOCK_QUESTION]` / `parseQuestionUnlock` mechanism — it works correctly
- Do not change AssignmentPanel.jsx — the lock/unlock rendering is correct
- Do not change FSRS or mastery tracking logic
- Do not change the facet assessment block injection — it should continue to work as-is
- The instructor planning block must contain the same data as the current QUESTIONS block (don't drop any fields the AI uses for planning)
- Existing tests must pass; if any test asserts on exact context format, update the assertion

**Output deposit:** `knowledge/development/assignment-tutor-boundary-2026-03-18.md`


### Step 2 — QA: Assignment Mode Behavior Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- This orchestration plan
- Step 1 deposit: `knowledge/development/assignment-tutor-boundary-2026-03-18.md`
- `src/lib/study.js` — updated `buildFocusedContext`
- `src/StudyContext.jsx` — updated mode hint
**Depends on:** Step 1

**Task:**
1. **Context format verification**: Inspect the output of `buildFocusedContext` for an assignment focus and verify:
   - Two distinct sections exist: "INSTRUCTOR PLANNING ONLY" and "STUDENT VIEW"
   - Instructor section contains full question descriptions
   - Student view section shows only question IDs, lock status, and required skills (no question text)
   - Unlocked questions show `[UNLOCKED]` in student view

2. **Mode hint verification**: Inspect the `modeHint` string in `bootWithFocus` and verify:
   - Contains the BAD vs GOOD example
   - Contains "NEVER ask the student the assignment question, restate it, or closely paraphrase it"
   - Contains the FLOW steps with `[UNLOCK_QUESTION]` instructions
   - Interpolates correct question IDs

3. **Unlock mechanism regression**: Verify `parseQuestionUnlock` still correctly extracts question IDs from AI responses and `setAsgnWork` still flips the `unlocked` flag.

4. **Build verification**: Run `npm run build` (or equivalent) and confirm clean build, no regressions.

**Constraints:**
- Do not test with real API calls — verify the context/prompt structure, not the AI's actual behavior (that requires live testing by the CEO)
- Do not modify any code

**Output deposit:** `knowledge/qa/assignment-tutor-boundary-qa-2026-03-18.md`

---

## Dependency Chain

```
Step 1 (DEV: Context + Prompt) → Step 2 (QA: Verification)
```

Single lane, two steps.

---

## How to Execute in Claude Code

**Step 1:**
```
You are the Study Developer. Read your specialist file at study/agents/STUDY_DEVELOPER.md.

Before starting, read:
- study/knowledge/decisions/assignment-tutor-boundary-orchestration-2026-03-18.md
- src/lib/study.js (buildFocusedContext function, assignment branch — starts around line 1288)
- src/StudyContext.jsx (bootWithFocus function, assignment mode hint — starts around line 1088)
- src/components/study/AssignmentPanel.jsx

[Task section from Step 1]
[Constraints section from Step 1]

Deposit your output to knowledge/development/assignment-tutor-boundary-2026-03-18.md
```

**Step 2:**
```
You are the Study Security & Testing Analyst. Read your specialist file at study/agents/STUDY_SECURITY_TESTING_ANALYST.md.

Before starting, read:
- study/knowledge/decisions/assignment-tutor-boundary-orchestration-2026-03-18.md
- study/knowledge/development/assignment-tutor-boundary-2026-03-18.md
- src/lib/study.js (updated buildFocusedContext)
- src/StudyContext.jsx (updated mode hint)

[Task section from Step 2]
[Constraints section from Step 2]

Deposit your output to knowledge/qa/assignment-tutor-boundary-qa-2026-03-18.md
```

---

## Knowledge Base Deposits (Expected)

| Step | File | Location |
|---|---|---|
| 1 | assignment-tutor-boundary-2026-03-18.md | knowledge/development/ |
| 2 | assignment-tutor-boundary-qa-2026-03-18.md | knowledge/qa/ |

---

## Open Questions for CEO During Execution

1. **Live behavior testing** — the prompt change can only be truly validated by running an assignment session and observing whether the AI asks concept questions vs assignment questions. QA can verify structure; only live testing verifies behavior. CEO should test after implementation.
