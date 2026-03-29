# Assignment Mode Teaching Flow — Diagnostic Findings
**Date:** 2026-03-29

---

## 1. buildFocusedContext() — Assignment Branch (study.js:1456-1549)

The assignment branch builds context with:

### INSTRUCTOR PLANNING section (lines 1460-1467)
```
ASSIGNMENT QUESTIONS — INSTRUCTOR PLANNING ONLY (never reveal to student):
  q1: [full question text] [difficulty]
    Required skills: skill1, skill2
```
Full question descriptions and required skills are exposed to the AI for planning. This is labeled "never reveal to student."

### STUDENT VIEW section (lines 1469-1479)
Uses `focus.unlocked` (a map of question ID → boolean) to show locked/unlocked status:
```
STUDENT VIEW:
  q1: [LOCKED] — requires: skill1, skill2
  q2: [UNLOCKED] — student is working on this
```

The lock status is passed from `asgnWork` state in StudyContext (lines 1263-1266, 1347-1350), which reads the in-memory `unlocked` field on each question object.

### Source material
Loads facet-based content for required skills and assignment question facets (lines 1497-1538). Falls back to keyword-based chunk loading.

### Key answer:
The context tells the AI which questions are locked/unlocked and lists required skills with current strength percentages. **It does NOT explicitly instruct the AI to withhold answers or teach first** — that behavior is driven by the system prompt (see section 2).

---

## 2. buildSystemPrompt() — Answer-Giving & Boundary Rules (study.js:1793-1794)

The system prompt is a single large string. Relevant sections:

### THE ANSWER DOCTRINE (exact text):
```
THE ANSWER DOCTRINE:

You do not give answers to assignment or homework questions. Hard rule, no exceptions.

When a student asks for an answer: redirect with purpose. "What do you think the first step is?"

When they say "just tell me, I'm running out of time": hold firm, accelerate. "Fastest path -- tell me what [X] is and we'll get there in two minutes."

When they say "I already know this": test them. "Walk me through it." They'll either prove it or see the gap.

When frustrated: stay steady. "I hear you. Let me come at this differently." Switch angles.

When overwhelmed: shrink the problem. "Forget the full question. Just this one piece."
```

### ASSIGNMENT-FIRST PRIORITY (exact text):
```
ASSIGNMENT-FIRST PRIORITY:

Every session starts from the same question: what does this student need to turn in, and can they do it?

Check the assignment list and deadlines. Check which skills each assignment requires. Check the student's skill profile. That's your opening diagnostic -- not "what do you want to learn today" but "here's what's coming up and here's what you need to be able to do."

The student picks which assignment to work on. You orient them. If they have something due tomorrow, you flag it. Once they pick, you reverse-engineer it: what skills are required, which has the student demonstrated, which are gaps. Then start on the gaps.

When all assignments are handled, shift to mastery mode. Find skills where they struggled or scraped by. Go back and build real depth.
```

### QUESTION VISIBILITY RULES (in modeHint, StudyContext.jsx:1201):
```
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
   [UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]
4. After unlocking, the student sees the question in their answer panel. Guide their thinking without writing their answer.
5. When the student completes a question, move to the next locked question's required skills.
```

**Key answer:** The system prompt has extensive answer-withholding instructions (Answer Doctrine + Question Visibility Rules). The unlock mechanism is AI-driven: the AI emits `[UNLOCK_QUESTION]qN[/UNLOCK_QUESTION]` when it judges the student is ready.

---

## 3. bootWithFocus() — Assignment Mode Data (StudyContext.jsx:1145-1209)

When assignment mode starts, `bootWithFocus` (line 1193-1201):

1. Maps questions into `asgnWork` state:
   ```js
   var qs = (focus.assignment.questions || []).map(q => ({
     id: q.id, description: q.description, difficulty: q.difficulty,
     requiredSkills: q.requiredSkills || [],
     unlocked: false, answer: "", done: false
   }));
   setAsgnWork({ questions: qs, currentIdx: 0 });
   ```
   **All questions start LOCKED** (`unlocked: false`), with empty answers and not done.

2. Sets user message: `"I want to work on: " + focus.assignment.title`

3. Sets `modeHint` with the full QUESTION VISIBILITY RULES and FLOW instructions (see section 2).

4. Passes `focus` to `buildFocusedContext()` which loads skills, facets, source material.

**Key answer:** Yes, it includes assignment questions (descriptions, difficulties, required skills) and initializes them all as locked with no completion status from DB — it's all in-memory.

---

## 4. AssignmentPanel.jsx — Lock/Unlock UI (lines 1-120)

Three visual states per question, driven by `q.done` and `q.unlocked`:

### Completed (`q.done === true`, line 49-57):
- Collapsed green card, opacity 0.7, shows "Done" badge and answer preview

### Unlocked (`q.unlocked === true && !q.done`, line 58-86):
- Active card with blue accent border
- Shows full `q.description` text
- Textarea for writing answer
- "Mark done" button (appears when answer has content)

### Locked (`!q.unlocked && !q.done`, line 87-92):
- Faded card (opacity 0.4), shows question ID only
- Text: "Locked -- building skills"
- **No interaction possible** — no textarea, no button

**Unlock mechanism:** The AI emits `[UNLOCK_QUESTION]qN[/UNLOCK_QUESTION]` in its response. `parseQuestionUnlock()` (study.js:1798-1801) extracts the ID. StudyContext (lines 1372-1383) then sets `q.unlocked = true` in `asgnWork` state and moves `currentIdx` to the unlocked question.

**Key answer:** The student CANNOT fill in an answer until the AI unlocks the question. There is no manual unlock — it's entirely AI-driven based on the AI's judgment that the student has demonstrated competence.

---

## 5. CurriculumScreen.jsx — Assignment Question Display (lines 287-340)

CurriculumScreen shows assignments and questions in a different context — the curriculum overview, not the study session. Here:

- Questions show `q.questionRef`, truncated `q.description`, `q.difficulty`, and `q.readiness` percentage
- **No locked/unlocked state** — all questions are always visible in the curriculum view
- A "Study Question" button navigates to skill mode (`handleStudyQuestion` calls `bootWithFocus({ type: "skill", skill: weakest })`) — note: this goes to **skill mode, not assignment mode**
- Each question shows its required skills with strength percentages and readiness colors
- Students can expand questions to see required skills and drill into chunks

**Key answer:** CurriculumScreen has no lock/unlock visual. Students can see question descriptions freely in the curriculum overview. The lock mechanism only exists within the AssignmentPanel during an active study session.

---

## 6. DB Schema — assignment_questions Table (db.js:953-955)

```sql
INSERT INTO assignment_questions (assignment_id, question_ref, description, difficulty, ordering)
VALUES (?, ?, ?, ?, ?)
```

**Columns:** `assignment_id`, `question_ref`, `description`, `difficulty`, `ordering`

**No lock/unlock/status columns.** There is no `locked`, `unlocked`, `ready_to_answer`, `answered`, `status`, or similar field in the DB schema. The lock state is entirely in-memory (`asgnWork` React state), initialized to `unlocked: false` at session start, and modified by AI unlock tags during the session.

**This means:** Lock state does not persist across sessions. If a student leaves and comes back, all questions reset to locked. Answered text is also lost (only persisted if exported to DOCX).

---

## 7. Summary: Current Flow vs. Expected Flow

### Current Flow (implemented):

1. Student selects an assignment → all questions start **LOCKED** in `asgnWork` state
2. AI sees full questions in INSTRUCTOR PLANNING section + STUDENT VIEW with lock status
3. AI is instructed to teach prerequisite skills for the first locked question
4. AI assesses via stealth diagnostic questions (facet-level SKILL_UPDATE)
5. When AI judges readiness, it emits `[UNLOCK_QUESTION]qN[/UNLOCK_QUESTION]`
6. UI unlocks the question → student sees description + answer textarea
7. Student writes answer, marks done, AI moves to next locked question
8. Student can export answers to DOCX

### Expected Flow (from plan description):
> AI teaches toward understanding → student demonstrates mastery via stealth assessment → question unlocks → student fills in their own answer.

### Gap Analysis:

**The current flow matches the expected flow.** The mechanism is fully wired:
- Teaching before unlocking: enforced by prompt instructions (FLOW steps 1-3)
- Stealth assessment: SKILL_UPDATE with facet-level ratings + context tags
- AI-triggered unlock: `[UNLOCK_QUESTION]` tag parsed by `parseQuestionUnlock()`
- Student writes own answer: textarea only appears after unlock

### Potential weaknesses (not bugs — design observations):

1. **Unlock is AI judgment, not data-driven.** The AI decides when to unlock based on its assessment of the conversation, not on actual FSRS mastery thresholds. The prompt says "below 50% strength, teach first" but doesn't enforce a minimum skill level for unlocking.

2. **No persistence.** Lock state and answers live only in React state. Session restart = full reset. The student's answer work is lost unless exported.

3. **CurriculumScreen leaks questions.** The curriculum view shows full question descriptions to students outside of the study session. The lock mechanism only hides descriptions inside AssignmentPanel during active sessions.

4. **Skill mode bypass.** CurriculumScreen's "Study Question" button boots into **skill mode** (not assignment mode), which doesn't have the lock/unlock flow at all. A student could study the required skill without the assignment guardrails.

5. **No completion feedback to FSRS.** Answering a question (marking done) doesn't trigger any mastery update — the mastery signal comes only from conversational SKILL_UPDATE tags during teaching. The act of correctly answering the assignment question itself isn't captured.
