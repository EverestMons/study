# Assignment Mode Facet Assessment Context — Diagnostic Findings
**Date:** 2026-03-29

---

## Q1: Is `buildFacetAssessmentBlock()` called for assignment mode?

**YES.** At `study.js:1513`:

```js
var asgnFacetBlock = await buildFacetAssessmentBlock(asgnSkillIdsArr, allSkills);
if (asgnFacetBlock) ctx += "\n" + asgnFacetBlock + "\n";
```

`asgnSkillIdsArr` is built from `requiredSkillIds` (all skills required by the assignment's questions), resolved to numeric IDs. The block IS generated and appended to the context.

**Note:** `buildFacetAssessmentBlock` has `MAX_SKILLS = 3` (study.js:1363). For an assignment requiring 13+ skills, only the first 3 get full facet details; the rest get a truncation note: `[N more skills with facets -- rate by skill-level]`.

For skills 204 and 676, the output would look like (assuming they're within the first 3):

```
FACETS FOR Shift and Rotate Instructions (integer-arithmetic/shift-rotate-instructions):
  integer-arithmetic/logical-shift-operations: Logical Shift Operations [mastery: untested] [blooms: apply]
    Demonstrates: ...
  integer-arithmetic/arithmetic-shift-operations: Arithmetic Shift Operations [mastery: untested] [blooms: apply]
    Demonstrates: ...
  integer-arithmetic/rotate-operations: Rotate Operations with and without Carry [mastery: untested] [blooms: apply]
    Demonstrates: ...
  integer-arithmetic/double-operand-shift: Double-Operand Shift Operations [mastery: untested] [blooms: apply]
    Demonstrates: ...

FACETS FOR Bit Shift and Rotate Instructions (integer-arithmetic/bit-shift-rotate-instructions):
  integer-arithmetic/execute-left-shift: Execute Left Shift Instructions [mastery: untested]
    Demonstrates: ...
  integer-arithmetic/execute-right-shift: Execute Right Shift Instructions [mastery: untested]
    Demonstrates: ...
  integer-arithmetic/execute-rotate: Execute Rotate Instructions [mastery: untested]
    Demonstrates: ...
```

All mastery values show "untested" because `last_review_at` is NULL → `currentRetrievability()` returns 0 → falls through to `untested` (line 1387-1390: `if (fm && fm.stability)` → true, but `currentRetrievability` returns 0, so `masteryStr = "0%"` — actually it would show "0%", not "untested").

**Correction**: Since `stability = 1.0` (truthy), the code enters the if-block and computes `r = currentRetrievability(...)` which returns 0. So `masteryStr = "0%"`, not "untested". "untested" only appears when `fm` is null or `fm.stability` is falsy.

---

## Q2: SKILL_UPDATE instructions in `buildSystemPrompt()`

The SKILL_UPDATE instructions are in `buildSystemPrompt()` (study.js:1804) as hardcoded text in the system prompt string. They are **included unconditionally — no mode guard**. Exact text:

```
SKILL STRENGTH TRACKING:

After meaningful teaching exchanges, rate how the student performed on the skill:
[SKILL_UPDATE]
skill-id: struggled|hard|good|easy | reason
[/SKILL_UPDATE]

Ratings -- based on what the student DEMONSTRATED, not what you taught:
- struggled: Could not answer diagnostic questions. Needed heavy guidance. Still shaky.
- hard: Got there with significant help. Answered partially. Needed multiple attempts.
- good: Answered correctly with minor nudges. Applied the concept to the problem.
- easy: Nailed it cold. Handled variations. Connected it to other concepts unprompted.

Only rate when the student actually engaged with the skill. Don't rate for just listening.
One rating per skill per exchange. Be honest -- struggled is useful data, not a failure.
```

Followed by CONTEXT TAGS, FACET-LEVEL ASSESSMENT, and ASSESSMENT PROTOCOL sections.

**However: `buildSystemPrompt()` is NOT used at session boot.** See Q4.

---

## Q3: Assignment `modeHint` — does it mention SKILL_UPDATE?

The `modeHint` (StudyContext.jsx:1211) mentions `SKILL_UPDATE` **exactly once**, in the ANSWER ASSESSMENT section only:

```
ANSWER ASSESSMENT:
When you receive [ANSWER_SUBMISSION q="qN"]...[/ANSWER_SUBMISSION], assess the student's answer:
1. Compare against the question's required skills and your knowledge of correct answers.
2. Emit SKILL_UPDATE ratings for the relevant facets based on answer quality.   ← HERE
3. If the answer demonstrates sufficient understanding: ...
```

The modeHint's FLOW section (the core teaching loop) **does NOT mention SKILL_UPDATE at all**:

```
FLOW:
1. Look at the FIRST locked question's required skills. Check the student's strength.
2. If ANY required skill is below 50% strength, teach that skill first.
3. When the student demonstrates competence on ALL skills needed for the question, unlock it:
   [UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]
4. After unlocking, the student sees the question...
5. When the student completes a question, move to the next locked question's required skills.
```

Step 3 says "when the student demonstrates competence" → unlock. No mention of emitting SKILL_UPDATE to record that competence. The AI is told to assess competence and unlock, but never told to report its assessment via SKILL_UPDATE during the teaching phase.

---

## Q4: Full prompt assembly — the critical split

**TWO DIFFERENT SYSTEM PROMPTS are used at different stages:**

### Boot (first message) — `bootWithFocus()` line 1221:

```js
const bootSystem = "You are Study -- a master teacher.\n\nCOURSE: " + active.name
  + "\n\n" + ctx                    // buildFocusedContext output (includes facet block)
  + "\n\nSESSION HISTORY:\n" + formatJournal(journal)
  + studentContext                   // STUDENT SKILL STATUS
  + modeHint                         // Assignment FLOW + UNLOCK + ANSWER ASSESSMENT
  + "\n\nRespond concisely...";
```

**What's PRESENT at boot:**
- Assignment context (questions, skills, facet assessment block)
- Assignment FLOW instructions (teach → unlock → answer assessment)
- One mention of SKILL_UPDATE (in ANSWER ASSESSMENT section only)

**What's MISSING at boot:**
- SKILL STRENGTH TRACKING section
- CONTEXT TAGS section
- FACET-LEVEL ASSESSMENT section
- ASSESSMENT PROTOCOL section
- All the general teaching instructions (ASK FIRST, CONCRETENESS FADING, etc.)

### Subsequent messages — `sendMessage()` line 1295:

```js
const sysPrompt = buildSystemPrompt(active.name, ctx, journal);
```

**What's PRESENT on subsequent messages:**
- Full system prompt with ALL instructions (teaching method, SKILL_UPDATE, FACET ASSESSMENT, etc.)
- Updated context from `buildFocusedContext` (refreshed skills, facet block)

**What's MISSING on subsequent messages:**
- The assignment `modeHint` (FLOW, UNLOCK_QUESTION, ANSWER ASSESSMENT instructions)
- The `studentContext` block

**This is the critical gap.** The AI sees two different prompts:
1. **Boot**: Knows it's in assignment mode, has the FLOW, but has NO skill tracking instructions
2. **Subsequent**: Has full skill tracking instructions, but has NO assignment FLOW/UNLOCK instructions

The assignment FLOW is preserved only in chat history (the boot system prompt was the system parameter for the first API call, not a user message — it's gone on subsequent calls).

---

## Q5: `buildContext()` vs `buildFocusedContext()` — facet block comparison

Both call `buildFacetAssessmentBlock`:

| | `buildContext()` | `buildFocusedContext()` (assignment) |
|---|---|---|
| Call site | study.js:1274 | study.js:1513 |
| Skill selection | `relevantSkillIds` (keyword-matched from recent messages) | `asgnSkillIdsArr` (all required skills for assignment) |
| Placement | After STUDENT PROFILE section | After REQUIRED SKILLS section |
| Max skills | 3 | 3 |

The facet block format is identical in both cases — same function, same output structure. The difference is which skills are selected (keyword-matched vs. assignment-required).

**Key difference**: In `buildContext()`, the facet block appears alongside the full system prompt (which includes SKILL_UPDATE instructions). In `buildFocusedContext()` assignment branch, the facet block appears, but:
- At boot: no SKILL_UPDATE instructions in the system prompt
- On subsequent messages: SKILL_UPDATE instructions ARE in the system prompt, but the facet block may have different skills because the context is rebuilt

---

## Q6: `parseSkillUpdates()` regex and assignment mode examples

**Regex** (study.js:1821):
```js
/\[SKILL_UPDATE\]([\s\S]*?)\[\/SKILL_UPDATE\]/
```

Expected format:
```
[SKILL_UPDATE]
concept-key: struggled|hard|good|easy | reason | context:tag
  facet-key: rating | reason | context:tag
[/SKILL_UPDATE]
```

**Does the assignment modeHint show examples of SKILL_UPDATE during teaching?**

**NO.** The modeHint only mentions SKILL_UPDATE in ANSWER ASSESSMENT step 2: "Emit SKILL_UPDATE ratings for the relevant facets based on answer quality." No format example is shown. No mention of emitting SKILL_UPDATE during the teaching/diagnostic phase before unlock.

The FLOW says "teach skill → student demonstrates competence → unlock" — but never instructs the AI to report that demonstrated competence via SKILL_UPDATE tags.

---

## Key Question Answer

**The problem is (b): the facet assessment instructions ARE present (on subsequent messages via `buildSystemPrompt`), but the assignment-specific FLOW instructions don't reference them, creating a disconnect.**

Specifically:

1. **At boot**: The AI receives assignment FLOW instructions (modeHint) that describe a teach→unlock loop WITHOUT mentioning SKILL_UPDATE. The AI's first response establishes its mental model of the assignment workflow: teach prerequisites, assess competence internally, emit UNLOCK_QUESTION when ready.

2. **On subsequent messages**: The AI receives `buildSystemPrompt` which includes SKILL_UPDATE/FACET ASSESSMENT instructions. BUT:
   - The assignment FLOW (modeHint) is gone from the system prompt
   - The SKILL_UPDATE instructions are generic ("after meaningful teaching exchanges") — they don't reference the assignment unlock flow
   - The AI's behavioral pattern was already established at boot: teach → unlock, without SKILL_UPDATE

3. **The disconnect**: The assignment FLOW says "when the student demonstrates competence, unlock" but doesn't say "emit SKILL_UPDATE to record that competence." The AI treats competence assessment as internal judgment, not something it needs to report via tags. The SKILL_UPDATE instructions exist in a separate section of the prompt that doesn't reference the assignment workflow.

4. **Even if SKILL_UPDATE tags were emitted**, the FLOW tells the AI to unlock when competence is demonstrated — but the code requires FSRS readiness ≥ 60%. The AI has no visibility into the 60% threshold or the FSRS math. It will attempt unlock based on its own competence judgment, which may not align with the computed readiness.

### Root causes (ordered by impact):

1. **Boot prompt lacks SKILL_UPDATE instructions entirely** — the AI's first response (and its behavioral framing for the session) is set without any knowledge of SKILL_UPDATE tags
2. **Assignment FLOW doesn't reference SKILL_UPDATE** — the teach→unlock loop has no step saying "emit SKILL_UPDATE after each teaching exchange"
3. **Subsequent prompts lose the assignment FLOW** — the full system prompt replaces the boot prompt but doesn't include the modeHint, so the AI may forget it's in assignment mode
4. **SKILL_UPDATE mentioned only for ANSWER ASSESSMENT** — the modeHint says to emit SKILL_UPDATE when assessing submitted answers, NOT during the pre-unlock teaching phase
