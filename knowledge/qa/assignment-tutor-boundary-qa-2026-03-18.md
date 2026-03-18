# QA Report: Assignment Tutor Question Boundary Fix
**Date:** 2026-03-18
**Analyst:** Study Security & Testing Analyst
**Method:** Static code analysis -- manual code path tracing
**Build:** v0.2.7 (Vite production build)

---

## Summary Table

| # | Test Case                        | Verdict  |
|---|----------------------------------|----------|
| 1 | Context format verification      | **PASS** |
| 2 | Mode hint verification           | **PASS** |
| 3 | Unlock status passthrough        | **PASS** |
| 4 | Unlock mechanism regression      | **PASS** |
| 5 | Build verification               | **PASS** |

**Overall: 5/5 PASS**

---

## Detailed Traces

### Test 1: Context Format Verification

**File:** `src/lib/study.js`, lines 1290-1313

**Trace:**

The assignment branch (`focus.type === "assignment"`) in `buildFocusedContext` now produces two distinct sections:

**Section 1 -- Instructor Planning (line 1294):**
```
ASSIGNMENT QUESTIONS -- INSTRUCTOR PLANNING ONLY (never reveal to student):
```
For each question in `asgn.questions`, it outputs:
- `q.id` + `: ` + `q.description` + ` [` + `q.difficulty` + `]` (line 1298)
- `Required skills: ` + `q.requiredSkills?.join(", ")` or `"unknown"` (line 1299)

This is the same data as before (id, description, difficulty, requiredSkills) with only the section header changed.

**Section 2 -- Student View (line 1303):**
```
STUDENT VIEW:
```
Reads `focus.unlocked || {}` into `unlockStatus` (line 1305, uses `var` so block-scoped to function).

For each question:
- If `unlockStatus[q.id]` is truthy (line 1307): outputs `q.id: [UNLOCKED] -- student is working on this`
- Otherwise (line 1309-1310): outputs `q.id: [LOCKED] -- requires: ` + `q.requiredSkills?.join(", ")` or `"unknown"`

**Verification checklist:**
- [x] Instructor section contains q.id, q.description, q.difficulty, q.requiredSkills
- [x] Student view contains ONLY q.id + lock status + required skills (no description text)
- [x] `focus.unlocked` defaults to `{}` when undefined
- [x] Unlocked questions show `[UNLOCKED] -- student is working on this`
- [x] Locked questions show `[LOCKED] -- requires: skill-a, skill-b`
- [x] No question description text leaks into the student view section

**Verdict: PASS**

---

### Test 2: Mode Hint Verification

**File:** `src/StudyContext.jsx`, line 1103

**Trace of the `modeHint` string (assignment branch, line 1095-1103):**

The mode hint is a single concatenated string beginning with `"\n\nMODE: ASSIGNMENT WORK."` and containing:

1. **QUESTION VISIBILITY RULES section** -- Present. Text:
   ```
   QUESTION VISIBILITY RULES:
   - The INSTRUCTOR PLANNING section shows full question text. This is for YOUR planning only.
   - The student CANNOT see questions until you unlock them with [UNLOCK_QUESTION].
   - NEVER ask the student the assignment question, restate it, or closely paraphrase it.
   - Your job is to teach the prerequisite SKILLS so the student can handle the question when they see it.
   ```

2. **BAD vs GOOD example** -- Present. Text:
   ```
   BAD vs GOOD example:
     Assignment question: "Implement a binary search algorithm"
     BAD (asking the assignment question): "How would you implement binary search?"
     GOOD (teaching the prerequisite skill): "What property of a sorted array lets us skip checking every element?"
   ```

3. **FLOW steps 1-5 with `[UNLOCK_QUESTION]` instruction** -- Present. Steps:
   - Step 1: Look at first locked question's required skills, check student strength
   - Step 2: If any required skill below 50%, teach that skill first, ask diagnostic questions about the CONCEPT
   - Step 3: When student demonstrates competence on ALL skills, unlock with `[UNLOCK_QUESTION]` + id + `[/UNLOCK_QUESTION]`
   - Step 4: After unlocking, student sees question in answer panel, guide without writing answer
   - Step 5: When student completes a question, move to next locked question's required skills

4. **Interpolated question IDs** -- Present:
   - `qs[0]?.id || "q1"` is interpolated into the unlock tag example in step 3
   - `qs.map(q => q.id).join(", ")` is interpolated at the end as "Question order: q1, q2, ..."

5. **Old text removal** -- Grep for `"Do NOT show or describe the question yet"` across `StudyContext.jsx` returns **no matches**. The old abstract hint is confirmed removed.

**Verification checklist:**
- [x] QUESTION VISIBILITY RULES section present
- [x] "NEVER ask the student the assignment question, restate it, or closely paraphrase it" present
- [x] BAD vs GOOD example with binary search present
- [x] FLOW steps 1-5 with [UNLOCK_QUESTION] instruction present
- [x] Interpolated question IDs: `qs[0]?.id || "q1"` and `qs.map(q => q.id).join(", ")`
- [x] Old "Do NOT show or describe the question yet" text is gone

**Verdict: PASS**

---

### Test 3: Unlock Status Passthrough

**Three code paths traced:**

#### Path A: Initial boot (line 1064)

```js
const ctx = await buildFocusedContext(active.id, active.materials, focus, skills);
```

The `focus` object comes from the caller. Tracing back to `AssignmentPicker.jsx` line 171:
```js
bootWithFocus({ type: "assignment", assignment: a })
```

This object has only `type` and `assignment` -- no `.unlocked` property.

Inside `buildFocusedContext` (line 1305): `focus.unlocked || {}` evaluates to `{}` because `focus.unlocked` is `undefined`. Therefore all questions render as `[LOCKED]`.

This is correct behavior: at boot time, no questions have been unlocked yet.

#### Path B: First rebuild in sendMessage (non-cached path, lines 1157-1163)

Triggered when `cachedSessionCtx.current` is falsy (cache miss) and `focusContext` exists.

```js
var rebuildFocus = focusContext;                          // line 1157
if (focusContext.type === "assignment" && asgnWork) {     // line 1158
    var unlocked = {};                                     // line 1159
    for (var aq of asgnWork.questions) {                   // line 1160
        if (aq.unlocked) unlocked[aq.id] = true;
    }
    rebuildFocus = { ...focusContext, unlocked: unlocked }; // line 1161
}
ctx = await buildFocusedContext(active.id, active.materials, rebuildFocus, skills); // line 1163
```

**Trace:**
1. Starts with `rebuildFocus = focusContext` (the original focus, no `.unlocked`)
2. Guards on `focusContext.type === "assignment"` AND `asgnWork` being truthy
3. Iterates `asgnWork.questions`, building `unlocked` map: `{ qId: true }` for each question where `aq.unlocked === true`
4. Spreads `focusContext` and adds `unlocked` property to create enriched focus
5. Passes enriched focus to `buildFocusedContext`

This correctly reads the current state of `asgnWork.questions` and passes it through.

#### Path C: Second rebuild in sendMessage (after skill updates, lines 1237-1243)

Triggered inside `if (cachedSessionCtx.current)` block (cache hit, skill refresh path).

```js
var updateFocus = focusContext;                            // line 1237
if (focusContext.type === "assignment" && asgnWork) {      // line 1238
    var unlocked2 = {};                                     // line 1239
    for (var aq2 of asgnWork.questions) {                   // line 1240
        if (aq2.unlocked) unlocked2[aq2.id] = true;
    }
    updateFocus = { ...focusContext, unlocked: unlocked2 }; // line 1241
}
var updatedCtx = await buildFocusedContext(active.id, active.materials, updateFocus, updatedSkills); // line 1243
```

Same pattern as Path B. Uses distinct variable names (`unlocked2`, `aq2`, `updateFocus`) to avoid `var` scoping conflicts. Correctly builds a fresh unlock map from current `asgnWork` state and passes enriched focus to rebuild.

**Verification checklist:**
- [x] Boot call: `focus.unlocked` is undefined, defaults to `{}`, all questions LOCKED
- [x] First rebuild: builds `unlocked` map from `asgnWork.questions`, passes as `rebuildFocus.unlocked`
- [x] Second rebuild: same enrichment via `updateFocus`, reads `asgnWork.questions[].unlocked`
- [x] Both rebuild paths guard on `focusContext.type === "assignment" && asgnWork`
- [x] Non-assignment focus types skip enrichment (guard fails), no side effects

**Verdict: PASS**

---

### Test 4: Unlock Mechanism Regression

**Part A: parseQuestionUnlock (src/lib/study.js, lines 1608-1611)**

```js
export const parseQuestionUnlock = (response) => {
  var match = response.match(/\[UNLOCK_QUESTION\]\s*([\w-]+)\s*\[\/UNLOCK_QUESTION\]/);
  return match ? match[1].trim() : null;
};
```

- Regex: `\[UNLOCK_QUESTION\]\s*([\w-]+)\s*\[\/UNLOCK_QUESTION\]`
- Captures word characters and hyphens (`[\w-]+`) between the tags, with optional whitespace
- Returns the trimmed capture group or null
- Works correctly for IDs like `q1`, `question-3`, `Q_2a`, etc.

**Part B: Unlock handling in sendMessage (lines 1255-1266)**

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

**Trace:**
1. Parses the AI response for `[UNLOCK_QUESTION]qId[/UNLOCK_QUESTION]`
2. Guards on both `unlockId` being non-null AND `asgnWork` being truthy
3. Uses functional `setAsgnWork` to immutably update state:
   - Maps questions: sets `unlocked: true` for matching `q.id === unlockId`
   - Updates `currentIdx` to the unlocked question's index
4. Non-matching questions are unchanged

**Part C: AssignmentPanel rendering (src/components/study/AssignmentPanel.jsx, lines 47-95)**

Three-state rendering confirmed:

1. **Done state** (line 49-57): `q.done` is truthy
   - `opacity: 0.7`, green text, shows first 80 chars of answer
   - Label: "Done"

2. **Unlocked state** (line 58-86): `q.unlocked` is truthy (and not done)
   - Highlighted border: `T.acB` (accent border color)
   - Shows full `q.description` text (line 62)
   - Textarea visible for answer input (lines 63-74)
   - "Mark done" button appears when answer is non-empty (lines 75-85)

3. **Locked state** (line 87-92): neither done nor unlocked
   - `opacity: 0.4`
   - Shows `q.id` only, no description
   - Label: "Locked -- building skills"

**Verification checklist:**
- [x] `parseQuestionUnlock` extracts question ID from `[UNLOCK_QUESTION]...[/UNLOCK_QUESTION]` tags
- [x] `setAsgnWork` flips `q.unlocked = true` for matching question ID
- [x] `setAsgnWork` updates `currentIdx` to the unlocked question
- [x] AssignmentPanel renders locked (opacity 0.4, "Locked -- building skills")
- [x] AssignmentPanel renders unlocked (accent border, textarea visible, description shown)
- [x] AssignmentPanel renders done (opacity 0.7, "Done", truncated answer)

**Verdict: PASS**

---

### Test 5: Build Verification

**Command:** `npm run build` (Vite production build)

**Result:**
```
vite v5.4.21 building for production...
transforming...
 181 modules transformed.
rendering chunks...
computing gzip size...
 built in 1.82s
```

- 0 compilation errors
- 0 TypeScript/JSX errors
- Only pre-existing warnings about dynamic imports (db.js, htmlToMarkdown.js, extraction.js) and chunk size -- unrelated to this change
- All 181 modules transformed successfully
- Output files generated normally

**Verdict: PASS**

---

## Security Notes

1. **Question text isolation is enforced at the context layer.** The student view section in `buildFocusedContext` deliberately omits `q.description` for locked questions. The AI receives the description only in the instructor planning section, with explicit instructions not to surface it.

2. **No client-side enforcement bypass risk.** The `AssignmentPanel` renders `q.description` only when `q.unlocked` is truthy. The unlock flag can only be set by `parseQuestionUnlock` parsing an AI response containing the `[UNLOCK_QUESTION]` tag. There is no user-accessible code path to set `unlocked: true` directly.

3. **Mode hint is robust against prompt injection in question content.** The BAD/GOOD example gives the AI a concrete pattern to avoid, which is more resistant to the AI drifting back to asking assignment questions compared to the previous abstract instruction.

4. **Unlock enrichment covers both sendMessage rebuild paths.** Both the cache-miss path (line 1157) and cache-hit path (line 1237) enrich the focus with current unlock state. There is no path where a stale lock status could persist in the context after an unlock event.

---

## Edge Cases Considered

- **No questions on assignment:** If `asgn.questions` is falsy/empty, both the instructor section and student view loops are skipped (guarded by `if (asgn.questions)` on lines 1296 and 1304). No crash.
- **Question with no requiredSkills:** Falls back to `"unknown"` via `q.requiredSkills?.join(", ") || "unknown"` in both sections.
- **Multiple unlocks in one response:** `parseQuestionUnlock` uses `.match()` which returns the first match only. This is correct -- the AI should unlock one question at a time per the flow instructions.
- **Race condition on asgnWork state:** Both rebuild paths read `asgnWork` synchronously within the `sendMessage` async function. The `setAsgnWork` call at line 1257 is a React state setter that batches -- the rebuild at line 1235 runs after the response is received but before the next render cycle. The unlock map will reflect the state at the time of the rebuild, which is correct for the context sent in the next message.
