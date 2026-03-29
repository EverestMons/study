# Assignment Teaching Flow Blueprint
**Date:** 2026-03-29
**Author:** Systems Analyst
**Migration Impact:** None — no schema changes. All state is in-memory React state and existing FSRS tables.

---

## Change 1 — Data-Driven Unlock Gate

### Problem
`parseQuestionUnlock()` extracts `[UNLOCK_QUESTION]qN[/UNLOCK_QUESTION]` from AI responses and StudyContext (line ~1372) honors it unconditionally. The AI's judgment is the only gate — there is no programmatic check that the student's FSRS mastery actually supports the unlock.

### Design

#### Threshold constant
```js
// StudyContext.jsx or a shared constants location
const UNLOCK_MASTERY_THRESHOLD = 0.6; // 60% average facet retrievability
```

#### Where required skills live
Each question in `asgnWork.questions` has `requiredSkills` — an array of concept keys or skill IDs. These are set at boot time in `bootWithFocus()` (StudyContext.jsx:1194-1197):
```js
var qs = (focus.assignment.questions || []).map(q => ({
  id: q.id, description: q.description, difficulty: q.difficulty,
  requiredSkills: q.requiredSkills || [],
  unlocked: false, answer: "", done: false
}));
```

#### How to compute average facet retrievability per skill
Use the existing `computeFacetReadiness()` from `study.js` (line 770-808). This function:
1. Takes an array of skill IDs
2. For each skill, loads its facets via `Facets.getBySkill(skillId)`
3. Loads facet mastery via `FacetMastery.getByFacets(facetIds)`
4. Computes `currentRetrievability()` from `fsrs.js` for each facet with mastery data
5. Returns a `Map<skillId, averageRetrievability>`

The function already handles:
- Skills with no facets (returns empty map — skill absent from result)
- Facets with no mastery records (skipped — only facets with `fm.stability` are counted)
- Graceful error handling (try/catch around the whole operation)

#### Gate logic (StudyContext.jsx, replacing lines ~1372-1383)

Current code:
```js
const unlockId = parseQuestionUnlock(response);
if (unlockId && asgnWork) {
  setAsgnWork(prev => {
    if (!prev) return prev;
    var updated = { ...prev, questions: prev.questions.map(q =>
      q.id === unlockId ? { ...q, unlocked: true } : q
    )};
    var idx = updated.questions.findIndex(q => q.id === unlockId);
    if (idx >= 0) updated.currentIdx = idx;
    return updated;
  });
}
```

New code:
```js
const unlockId = parseQuestionUnlock(response);
if (unlockId && asgnWork) {
  // Data-driven unlock gate: check FSRS mastery before honoring
  var targetQ = asgnWork.questions.find(q => q.id === unlockId);
  var unlockAllowed = true;
  var rejectionReason = null;

  if (targetQ && targetQ.requiredSkills.length > 0) {
    // Resolve skill IDs from concept keys
    var resolvedSkillIds = targetQ.requiredSkills.map(function(sid) {
      var sk = cachedSessionCtx.current?.skills?.find(
        s => s.id === sid || s.conceptKey === sid
      );
      return sk ? sk.id : null;
    }).filter(Boolean);

    if (resolvedSkillIds.length > 0) {
      var readinessMap = await computeFacetReadiness(resolvedSkillIds);

      for (var rsid of resolvedSkillIds) {
        var readiness = readinessMap.get(rsid);
        if (readiness === undefined) {
          // No facet data for this skill — conservative: block unlock
          var skName = cachedSessionCtx.current?.skills?.find(s => s.id === rsid)?.name || rsid;
          unlockAllowed = false;
          rejectionReason = skName + " has no mastery data yet";
          break;
        }
        if (readiness < UNLOCK_MASTERY_THRESHOLD) {
          var skName2 = cachedSessionCtx.current?.skills?.find(s => s.id === rsid)?.name || rsid;
          unlockAllowed = false;
          rejectionReason = skName2 + " is at " + Math.round(readiness * 100) + "% mastery, below the " + Math.round(UNLOCK_MASTERY_THRESHOLD * 100) + "% threshold";
          break;
        }
      }
    }
  }

  if (unlockAllowed) {
    setAsgnWork(prev => {
      if (!prev) return prev;
      var updated = { ...prev, questions: prev.questions.map(q =>
        q.id === unlockId ? { ...q, unlocked: true } : q
      )};
      var idx = updated.questions.findIndex(q => q.id === unlockId);
      if (idx >= 0) updated.currentIdx = idx;
      return updated;
    });
  } else {
    // Inject rejection into conversation so AI knows to continue teaching
    // Append a system-role message that only the AI sees on next turn
    unlockRejectionRef.current = "Unlock rejected for " + unlockId + " — " + rejectionReason + ". Continue teaching the required skills. Do not attempt to unlock again until the student demonstrates stronger mastery.";
  }
}
```

#### How to inject the rejection message back to the AI
Add a `useRef` to hold the rejection:
```js
const unlockRejectionRef = useRef(null);
```

In `sendMessage()`, when building the messages array for the API call (line ~1280), check for a pending rejection and prepend it:
```js
var chatMsgs = newMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

// Inject unlock rejection as a system-context user message if pending
if (unlockRejectionRef.current) {
  chatMsgs.push({ role: "user", content: "[SYSTEM NOTE — not from student] " + unlockRejectionRef.current });
  unlockRejectionRef.current = null;
}
```

This appears as a user-role message tagged `[SYSTEM NOTE]` so the AI sees it in the next turn. It's cleared after injection. The student never sees it (it's injected into the API payload, not the displayed `msgs` state).

**Alternative approach:** Instead of a fake user message, append the rejection to the context string in `cachedSessionCtx.current.ctx`. This is cleaner but requires modifying the cached context. The ref approach is simpler and avoids mutation.

#### Default for skills with no facet data
**Locked (conservative).** If `computeFacetReadiness` returns no entry for a skill (the skill has no facets or no mastery data), the unlock is rejected. Rationale: if there's no mastery data, the system cannot verify the student demonstrated understanding. The AI continues teaching and triggering SKILL_UPDATE ratings, which will create facet mastery entries via the existing `applySkillUpdates` pipeline. Once facet mastery exists and exceeds the threshold, the next unlock attempt will succeed.

#### Import requirements
StudyContext.jsx must import `computeFacetReadiness` from `study.js` (it's already exported).

---

## Change 2 — Answer Submission Assessment Flow

### Problem
When a question is unlocked, the student writes in a textarea and clicks "Mark done" which unconditionally sets `q.done = true`. No assessment of the answer quality occurs, and no FSRS mastery signal is generated from the student's actual answer.

### Design

#### New question states in `asgnWork`
Add a `status` field to each question object. Replace the current `done` boolean:

```js
// In bootWithFocus, replace the question initialization:
var qs = (focus.assignment.questions || []).map(q => ({
  id: q.id, description: q.description, difficulty: q.difficulty,
  requiredSkills: q.requiredSkills || [],
  unlocked: false,
  answer: "",
  status: "locked",  // locked → unlocked → submitted → accepted
                      // submitted can transition back to unlocked (revision needed)
}));
```

State machine:
```
locked ──[AI UNLOCK_QUESTION]──> unlocked
unlocked ──[student submits]──> submitted
submitted ──[AI ANSWER_ACCEPTED]──> accepted (terminal)
submitted ──[AI feedback]──> unlocked (revision needed, student can edit and resubmit)
```

Backward compat: The existing `q.done` check should be replaced with `q.status === "accepted"` and `q.unlocked` should be replaced with `q.status === "unlocked" || q.status === "submitted"` in rendering logic.

#### UI states in AssignmentPanel.jsx

Four visual states (replacing current three):

**1. Locked (`status === "locked"`):** Unchanged — faded card, "Locked -- building skills".

**2. Unlocked (`status === "unlocked"`):** Active card with answer textarea and "Submit for Review" button (replaces "Mark done"). Button is enabled only when answer has content.

**3. Submitted (`status === "submitted"`):** Active card showing the submitted answer text (read-only), a "Reviewing..." indicator, and a subtle loading state. The textarea becomes non-editable. The student sees their answer is being assessed.

**4. Accepted (`status === "accepted"`):** Collapsed green card (like current "done" state). Shows "Accepted" badge and answer preview.

**Revision flow:** When the AI responds with feedback instead of `[ANSWER_ACCEPTED]`, the question transitions back to `status: "unlocked"` so the student can edit their answer and resubmit. The AI's feedback appears in the chat.

#### How the submitted answer gets into the conversation

When the student clicks "Submit for Review", AssignmentPanel dispatches an action that:
1. Sets `q.status = "submitted"`
2. Calls `sendMessage()` with a specially formatted message:

```js
// In AssignmentPanel's submit handler:
sendMessage("[ANSWER_SUBMISSION q=\"" + q.id + "\"]\n" + q.answer.trim() + "\n[/ANSWER_SUBMISSION]");
```

This injects the answer into the conversation as a user message. The AI sees it and knows to assess it.

**Implementation note:** `sendMessage` in StudyContext currently reads from `input` state and the textarea ref. The AssignmentPanel submit needs a way to send a specific message. Options:
- (a) Set `input` to the formatted string and trigger `sendMessage()` — fragile, may flash in the input box
- (b) Add an optional `overrideContent` parameter to `sendMessage(overrideContent)` — cleaner
- (c) Have AssignmentPanel directly add to `msgs` and trigger the API call — too invasive

**Recommendation:** Option (b). Add `sendMessage(overrideContent)` so AssignmentPanel can pass the formatted answer submission without touching the input state. `sendMessage` already has access to `msgs`, `setMsgs`, and the API call pipeline.

#### New parsing function — `parseAnswerResult()` (study.js)

```js
export const parseAnswerResult = (response) => {
  var match = response.match(/\[ANSWER_ACCEPTED\]\s*([\w-]+)\s*\[\/ANSWER_ACCEPTED\]/);
  return match ? match[1].trim() : null;
};
```

Follows the exact pattern of `parseQuestionUnlock()` (study.js:1798-1801).

#### StudyContext handling (after receiving AI response)

After existing `parseQuestionUnlock` handling (line ~1383), add:

```js
const acceptedId = parseAnswerResult(response);
if (acceptedId && asgnWork) {
  setAsgnWork(prev => {
    if (!prev) return prev;
    return { ...prev, questions: prev.questions.map(q =>
      q.id === acceptedId ? { ...q, status: "accepted" } : q
    )};
  });
} else if (asgnWork) {
  // If the AI responded without accepting, and a question is in "submitted" state,
  // transition it back to "unlocked" for revision
  setAsgnWork(prev => {
    if (!prev) return prev;
    var hasSubmitted = prev.questions.some(q => q.status === "submitted");
    if (!hasSubmitted) return prev;
    return { ...prev, questions: prev.questions.map(q =>
      q.status === "submitted" ? { ...q, status: "unlocked" } : q
    )};
  });
}
```

Logic: if the AI's response contains `[ANSWER_ACCEPTED]`, mark the question accepted. If a question is in "submitted" state but the AI didn't accept it, transition back to "unlocked" (the AI's response is teaching feedback).

#### System prompt additions for answer assessment

Add to the QUESTION VISIBILITY RULES section in the `modeHint` (StudyContext.jsx:1201), after the existing FLOW steps:

```
ANSWER ASSESSMENT:
When you receive [ANSWER_SUBMISSION q="qN"]...[/ANSWER_SUBMISSION], assess the student's answer:
1. Compare against the question's required skills and your knowledge of correct answers.
2. Emit SKILL_UPDATE ratings for the relevant facets based on answer quality.
3. If the answer demonstrates sufficient understanding:
   - Respond with [ANSWER_ACCEPTED]qN[/ANSWER_ACCEPTED]
   - Give brief positive feedback (1-2 sentences, specific to what they got right).
4. If the answer is incomplete or incorrect:
   - Do NOT include [ANSWER_ACCEPTED]. Do NOT reveal the correct answer.
   - Identify the specific gap or misconception.
   - Ask a targeted question to guide the student toward the fix.
   - The student can revise and resubmit.
5. Never write the answer for the student. Even if they're close, guide them to the last step themselves.
```

---

## Change 3 — Prompt Hardening

### Problem
The existing Answer Doctrine and Question Visibility Rules may not be sufficient when the AI faces persistent pressure — e.g., after 2+ wrong attempts, the AI may cave and reveal the answer. The current prompt doesn't address the specific scenario of repeated student failure.

### Exact prompt text changes

#### Addition 1: Append to THE ANSWER DOCTRINE section (study.js:buildSystemPrompt)

After the existing "When overwhelmed: shrink the problem" line, add:

```
ESCALATION RESISTANCE:

After 2+ wrong attempts by the student on the same concept:
- Do NOT reveal the answer. Do NOT say "the answer is..." or "you should have..."
- Do NOT gradually give away the answer by narrowing hints until the answer is obvious.
- Instead: CHANGE ANGLE. Teach the underlying concept from a different direction.
  - Switch from abstract to concrete (or vice versa).
  - Use an analogy the student hasn't seen.
  - Break the problem into a smaller sub-problem they CAN solve, then build back up.
- If the student has failed 3+ times on a specific sub-problem, explicitly name the prerequisite concept they're missing: "I think the gap is in [X]. Let's back up and make sure that's solid." Then teach [X] directly before returning to the original problem.
- The student's frustration is real. Acknowledge it: "This is a hard one. Let's try a completely different angle." But never use their frustration as a reason to give away the answer.

The test: if you removed your response and showed it to the professor, would they say "you taught the student" or "you gave them the answer"? Only the first is acceptable.
```

#### Addition 2: Modify QUESTION VISIBILITY RULES FLOW step 4 (in modeHint, StudyContext.jsx:1201)

Current step 4:
```
4. After unlocking, the student sees the question in their answer panel. Guide their thinking without writing their answer.
```

Replace with:
```
4. After unlocking, the student sees the question and a text box for their answer. They will submit their answer for your review.
   - NEVER state the answer to the assignment question, even as a "check" or "for reference."
   - NEVER say "the correct answer is..." or "you should write..." or similar.
   - If they ask what to write: "What do you think, based on what we just covered?"
   - Guide their THINKING, not their writing. Help them reason toward the answer, not transcribe yours.
```

#### Addition 3: Add a new section after ANSWER ASSESSMENT in the modeHint

```
ANSWER REVISION PROTOCOL:
When a submitted answer is incorrect or incomplete:
- Your feedback should identify WHAT is wrong or missing, not WHAT the answer should be.
- BAD: "You need to add X to your answer."
- GOOD: "Look at your second step — what assumption are you making about [concept]?"
- After 2+ revision cycles on the same question, DO NOT escalate detail. Instead:
  - Step back to the prerequisite concept.
  - Ask a diagnostic question about the underlying principle.
  - Once they demonstrate the principle, redirect them back to their answer.
- Maximum 4 revision cycles. After 4, tell the student: "Let's move on and come back to this one later with fresh eyes." Leave the question unlocked but move teaching to the next question's skills.
```

---

## Dependency Graph

```
Change 1 (unlock gate)     — standalone, no dependency on Changes 2 or 3
Change 2 (answer assessment) — depends on Change 3 (prompt text references ANSWER_SUBMISSION)
Change 3 (prompt hardening)  — standalone prompt changes, but includes ANSWER ASSESSMENT text for Change 2
```

**Recommended implementation order:** Change 3 → Change 1 → Change 2

Change 3 is pure prompt text (lowest risk, immediate effect). Change 1 is a code gate with no UI changes. Change 2 is the most complex (UI state machine + new message flow + new parser).

---

## Files Modified

| File | Changes |
|---|---|
| `src/StudyContext.jsx` | UNLOCK_MASTERY_THRESHOLD constant, unlock gate logic (~1372), unlockRejectionRef, rejection injection in sendMessage, `sendMessage(overrideContent)` parameter, answer assessment handling (parseAnswerResult), `asgnWork` status field initialization |
| `src/lib/study.js` | `parseAnswerResult()` function, prompt text additions to `buildSystemPrompt()` |
| `src/components/study/AssignmentPanel.jsx` | 4-state rendering (locked/unlocked/submitted/accepted), "Submit for Review" button, read-only submitted state, revision flow |
| `src/StudyContext.jsx` (modeHint in bootWithFocus) | ANSWER ASSESSMENT instructions, ANSWER REVISION PROTOCOL, modified FLOW step 4 |

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** Step 1
**Status:** Complete

### What Was Done
Blueprinted three changes to the assignment teaching flow: (1) data-driven unlock gate using `computeFacetReadiness()` with 60% threshold, (2) answer submission assessment flow with 4-state question lifecycle and `[ANSWER_SUBMISSION]`/`[ANSWER_ACCEPTED]` tags, (3) prompt hardening with escalation resistance, answer revision protocol, and strengthened step 4.

### Files Deposited
- `knowledge/architecture/assignment-teaching-flow-blueprint-2026-03-29.md` — full blueprint for all three changes

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- 60% retrievability threshold for unlock gate (constant, easily adjustable)
- Conservative default: skills with no facet data block unlock
- Rejection injected via ref + `[SYSTEM NOTE]` user-role message (simpler than context mutation)
- `sendMessage(overrideContent)` pattern for AssignmentPanel answer submission
- 4-state question lifecycle: locked → unlocked → submitted → accepted (with revision loop)
- Max 4 revision cycles before AI suggests moving on
- Implementation order: Change 3 → Change 1 → Change 2

### Flags for CEO
- None

### Flags for Next Step
- `computeFacetReadiness` is already exported from study.js — just needs import in StudyContext.jsx
- The `sendMessage` function needs an optional parameter addition — verify it doesn't break existing callers
- The `q.done` boolean is used in AssignmentPanel, StudyContext, and export logic — all instances must be migrated to `q.status === "accepted"`
- The `q.unlocked` boolean is used in buildFocusedContext and AssignmentPanel — must be migrated to status checks
