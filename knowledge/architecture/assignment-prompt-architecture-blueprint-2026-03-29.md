# Assignment Mode Prompt Architecture — Blueprint
**Date:** 2026-03-29 | **Type:** Architecture Blueprint
**Migration Impact:** None — prompt assembly and prompt text changes only. No schema changes, no new migrations.

---

## Problem Statement

The AI never emits `[SKILL_UPDATE]` tags during assignment mode teaching. Four root causes (from diagnostic `assignment-facet-assessment-context-diagnostic-2026-03-29.md`):

1. **Boot prompt has no SKILL_UPDATE instructions.** `bootWithFocus()` builds a custom system prompt that excludes `buildSystemPrompt()` content.
2. **Assignment FLOW never mentions SKILL_UPDATE.** The teach→unlock loop says "when the student demonstrates competence, unlock" without instructing the AI to report that competence via tags.
3. **Subsequent messages lose the assignment modeHint.** `sendMessage()` uses `buildSystemPrompt()` which includes SKILL_UPDATE but excludes the assignment FLOW/UNLOCK/ANSWER ASSESSMENT instructions.
4. **SKILL_UPDATE only mentioned for ANSWER ASSESSMENT.** The modeHint says "emit SKILL_UPDATE ratings for the relevant facets based on answer quality" — only after a student submits an answer, not during the pre-unlock teaching phase.

The result is a deadlock: the AI teaches without rating → FSRS stays at 0% → unlock gate always rejects → student can never attempt questions.

---

## Design Principles

1. **Single source of truth.** One prompt assembly path for both boot and subsequent messages. No divergent system prompts.
2. **Mode instructions reference general capabilities.** The assignment FLOW must use the vocabulary of SKILL_UPDATE and FACET ASSESSMENT already defined in the general sections.
3. **AI understands the data loop.** The AI must know its SKILL_UPDATE tags drive the mastery score, and the mastery score gates unlock. Without this understanding, the AI has no incentive to rate consistently.

---

## Change 1 — Unified System Prompt

### Current state

Two divergent prompt paths:

```
bootWithFocus():
  "You are Study..." + ctx + journal + studentContext + modeHint + "Respond concisely..."

sendMessage():
  buildSystemPrompt(active.name, ctx, journal)
  // includes SKILL_UPDATE, FACET ASSESSMENT, etc.
  // excludes modeHint, studentContext
```

### Target state

Both paths use `buildSystemPrompt()` as the base:

```
bootWithFocus():
  buildSystemPrompt(active.name, ctx, journal, modeHint) + studentContext + "\n\nRespond concisely..."

sendMessage():
  buildSystemPrompt(active.name, ctx, journal, cachedSessionCtx.current.modeHint)
```

### Signature change — `buildSystemPrompt()` (study.js:1804)

```js
// BEFORE:
export const buildSystemPrompt = (courseName, context, journal) => {

// AFTER:
export const buildSystemPrompt = (courseName, context, journal, modeHint = "") => {
```

### Injection point for `modeHint`

Insert `modeHint` at the **end** of the system prompt, after all general instructions (ASSESSMENT PROTOCOL, IMAGE DISPLAY, INPUT MODE CONTROL). Rationale: the mode-specific FLOW references SKILL_UPDATE and facet concepts — the AI must have already read those sections.

```js
// At the end of the buildSystemPrompt return string, before the closing semicolon:
+ (modeHint ? "\n\n---\n\nSESSION MODE INSTRUCTIONS:\n" + modeHint : "")
```

### Assembly order (final)

```
1.  Identity + CONTENT SAFETY
2.  COURSE: name
3.  [context from buildFocusedContext — includes assignment questions, skills, facet block, source material]
4.  SESSION HISTORY (journal)
5.  MATERIAL FIDELITY DOCTRINE
6.  ASSIGNMENT-FIRST PRIORITY
7.  PRE-QUESTION PHASE
8.  GAP TARGETING
9.  TEACHING METHOD (ASK FIRST, TEACH SECOND)
10. CONCRETENESS FADING
11. ANSWER DOCTRINE + ESCALATION RESISTANCE
12. HOW YOU SPEAK
13. READING THE STUDENT
14. DEEP QUESTIONS
15. SKILL STRENGTH TRACKING + CONTEXT TAGS
16. FACET-LEVEL ASSESSMENT
17. ASSESSMENT PROTOCOL
18. IMAGE DISPLAY
19. INPUT MODE CONTROL
20. SESSION MODE INSTRUCTIONS (modeHint — assignment FLOW, or skill mastery, or exam prep)
```

The AI reads general capabilities first (1–19), then mode-specific instructions (20) that reference those capabilities. When the FLOW says "emit a [SKILL_UPDATE] tag," the AI has already learned the exact format, context tags, and facet-level syntax.

### `bootWithFocus()` assembly (StudyContext.jsx:1221)

```js
// BEFORE:
const bootSystem = "You are Study -- a master teacher.\n\nCOURSE: " + active.name
  + "\n\n" + ctx + "\n\nSESSION HISTORY:\n" + formatJournal(journal)
  + studentContext + modeHint + "\n\nRespond concisely...";

// AFTER:
const sysPrompt = buildSystemPrompt(active.name, ctx, journal, modeHint);
const bootSystem = sysPrompt + studentContext
  + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";
```

### `sendMessage()` assembly (StudyContext.jsx:1295)

```js
// BEFORE:
const sysPrompt = buildSystemPrompt(active.name, ctx, journal);

// AFTER:
const sysPrompt = buildSystemPrompt(active.name, ctx, journal, cachedSessionCtx.current?.modeHint || "");
```

---

## Change 2 — Revised Assignment FLOW with SKILL_UPDATE Integration

### Current FLOW text (in modeHint, StudyContext.jsx:1211)

```
FLOW:
1. Look at the FIRST locked question's required skills. Check the student's strength.
2. If ANY required skill is below 50% strength, teach that skill first. Ask diagnostic
   questions about the CONCEPT, not about the assignment task.
3. When the student demonstrates competence on ALL skills needed for the question, unlock it:
   [UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]
4. After unlocking, the student sees the question...
5. When the student completes a question, move to the next locked question's required skills.
```

### New FLOW text

Replace the FLOW section in `modeHint` with:

```
FLOW:
1. Look at the FIRST locked question's required skills. Check the student's
   strength on those skills in the REQUIRED SKILLS section.
2. If ANY required skill is below 50% strength, teach that skill first. Ask
   diagnostic questions about the CONCEPT, not about the assignment task. Mix
   retrieval practice with elaborative interrogation — ask 'why does this work?'
   and 'what would happen if we changed X?'
3. After EVERY teaching exchange where the student demonstrates (or fails to
   demonstrate) understanding, emit a [SKILL_UPDATE] tag rating what they showed.
   Use the facet keys from the FACETS section if available, otherwise rate at
   skill level. This is CRITICAL: your [SKILL_UPDATE] ratings are the ONLY way
   the system tracks mastery. The unlock gate reads your ratings to compute a
   mastery score. If you do not rate, the score stays at 0% and questions can
   NEVER be unlocked — no matter how well the student performs.
4. When you believe the student has demonstrated competence on ALL skills needed
   for the question, attempt to unlock it:
   [UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]
   The system checks the mastery score (requires ≥60% average retrievability).
   If the score is still too low, the unlock will be REJECTED and you will
   receive a system note explaining which skill fell short. Continue teaching
   that skill, emit more [SKILL_UPDATE] ratings as the student improves, then
   try unlocking again.
5. After unlocking, the student sees the question and a text box for their answer.
   They will submit their answer for your review.
   - NEVER state the answer to the assignment question, even as a "check" or
     "for reference."
   - NEVER say "the correct answer is..." or "you should write..." or similar.
   - If they ask what to write: "What do you think, based on what we just covered?"
   - Guide their THINKING, not their writing.
6. When the student completes a question, move to the next locked question's
   required skills. Start from step 1 for the new question.
```

### Key changes from current FLOW:

| Current | New |
|---|---|
| No mention of SKILL_UPDATE in teaching | Step 3 explicitly requires SKILL_UPDATE after every teaching exchange |
| "demonstrates competence → unlock" (AI judgment only) | "emit SKILL_UPDATE → system computes score → attempt unlock → may be rejected" (data-driven) |
| No explanation of WHY to rate | "your ratings are the ONLY way the system tracks mastery... score stays at 0%" |
| No mention of rejection handling | Step 4 explains rejection flow and what to do about it |
| Steps 4-5 conflated unlock and answer | Steps 5-6 clearly separate post-unlock from next-question progression |

### ANSWER ASSESSMENT section revision

The current ANSWER ASSESSMENT text (also in modeHint) already says "Emit SKILL_UPDATE ratings" — this is fine. One small change to reinforce the pattern:

```
ANSWER ASSESSMENT:
When you receive [ANSWER_SUBMISSION q="qN"]...[/ANSWER_SUBMISSION], assess:
1. Compare against the question's required skills and your knowledge of correct answers.
2. Emit a [SKILL_UPDATE] tag rating the relevant skills/facets based on answer quality.
   (Same format as during teaching — this updates the student's mastery score.)
```

The "(Same format as during teaching — this updates the student's mastery score.)" clause links the answer assessment SKILL_UPDATE to the teaching SKILL_UPDATE, reinforcing that they're the same mechanism.

---

## Change 3 — Persist modeHint Across Messages

### Approach: store in `cachedSessionCtx.current`

**Option (b) is cleaner**: make `buildSystemPrompt()` accept a `modeHint` parameter (already designed in Change 1). The wiring stores `modeHint` in the session cache so `sendMessage()` can pass it.

### Wiring

**In `bootWithFocus()` (StudyContext.jsx), after building `modeHint`:**

```js
// BEFORE (line 1174):
cachedSessionCtx.current = { ctx, skills, journal, focus, chunkIds: ctxResult.chunkIds };

// AFTER:
cachedSessionCtx.current = { ctx, skills, journal, focus, chunkIds: ctxResult.chunkIds, modeHint: modeHint || "" };
```

**In `sendMessage()` (StudyContext.jsx:1295):**

```js
// BEFORE:
const sysPrompt = buildSystemPrompt(active.name, ctx, journal);

// AFTER:
const sysPrompt = buildSystemPrompt(active.name, ctx, journal, cachedSessionCtx.current?.modeHint || "");
```

**In the cache refresh block within `sendMessage()` (StudyContext.jsx:1383):**

The cache refresh at line 1383 rebuilds `cachedSessionCtx.current` with updated skills and context. Ensure `modeHint` is preserved:

```js
// BEFORE (line 1383):
cachedSessionCtx.current = { ...cachedSessionCtx.current, skills: updatedSkills, ctx: updatedCtx, chunkIds: updatedCtxResult.chunkIds };

// AFTER:
cachedSessionCtx.current = { ...cachedSessionCtx.current, skills: updatedSkills, ctx: updatedCtx, chunkIds: updatedCtxResult.chunkIds };
// modeHint is already preserved by the spread operator — no change needed
```

Since the spread `...cachedSessionCtx.current` already carries `modeHint` forward, and the subsequent properties don't overwrite it, the `modeHint` is preserved automatically. No additional code needed in the cache refresh block.

---

## Verification Checklist

After implementation, verify:

| Check | How to verify |
|---|---|
| Boot prompt includes SKILL_UPDATE section | Add `console.log(bootSystem.includes("SKILL STRENGTH TRACKING"))` in bootWithFocus — must be `true` |
| Boot prompt includes assignment FLOW | Add `console.log(bootSystem.includes("SESSION MODE INSTRUCTIONS"))` — must be `true` for assignment mode |
| Subsequent prompt includes FLOW | Add `console.log(sysPrompt.includes("SESSION MODE INSTRUCTIONS"))` in sendMessage — must be `true` when in assignment mode |
| Subsequent prompt includes SKILL_UPDATE | Already true (buildSystemPrompt always has it) |
| modeHint persisted in cache | `console.log(cachedSessionCtx.current.modeHint?.substring(0, 50))` after boot — must show FLOW text |
| FLOW text mentions SKILL_UPDATE | Grep the modeHint string for "SKILL_UPDATE" — must appear in step 3 |
| FLOW text mentions 60% threshold | Grep for "60%" — must appear in step 4 |
| FLOW text mentions rejection | Grep for "REJECTED" — must appear in step 4 |

### Functional test

1. Start an assignment session with a HW9 assignment
2. Teach a prerequisite skill (e.g., shift operations)
3. Verify the AI emits `[SKILL_UPDATE]` tags during teaching (before any unlock attempt)
4. Verify `facet_mastery` records get updated (`reps > 0`, `last_review_at` not null)
5. After sufficient teaching, verify the AI attempts `[UNLOCK_QUESTION]` and the gate allows it

---

## Files to Modify

| File | Changes |
|---|---|
| `src/lib/study.js` | `buildSystemPrompt()`: add `modeHint` parameter, append to end of return string |
| `src/StudyContext.jsx` | `bootWithFocus()`: use `buildSystemPrompt()` as base instead of custom string; store `modeHint` in `cachedSessionCtx.current` |
| `src/StudyContext.jsx` | `sendMessage()`: pass `cachedSessionCtx.current.modeHint` to `buildSystemPrompt()` |
| `src/StudyContext.jsx` | `modeHint` string (assignment branch): replace FLOW text with new version integrating SKILL_UPDATE |

No other files affected. `buildFocusedContext`, `parseSkillUpdates`, `applySkillUpdates`, and the unlock gate are unchanged.

---

## Token Budget Consideration

The unified prompt is larger than either the old boot prompt or the old subsequent prompt alone. Estimate:

- Old boot prompt: ~context + modeHint (~1,500 tokens of instructions)
- Old subsequent prompt: ~context + buildSystemPrompt (~4,000 tokens of instructions)
- New unified prompt: ~context + buildSystemPrompt + modeHint (~4,500 tokens of instructions)

Net increase: ~500 tokens per API call for assignment mode. For non-assignment modes (skill mastery, exam prep), the modeHint is much shorter (~50-100 tokens), so the increase is negligible.

The ~500 token increase is acceptable given the context window (200K) and the criticality of the fix. The FLOW text itself is ~400 tokens, and the "SESSION MODE INSTRUCTIONS:" wrapper adds ~10 tokens.

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** Step 1
**Status:** Complete

### What Was Done
Designed a unified prompt architecture that ensures both boot and subsequent messages include the full system prompt (SKILL_UPDATE, FACET ASSESSMENT, ASSESSMENT PROTOCOL) AND the mode-specific instructions (assignment FLOW, UNLOCK, ANSWER ASSESSMENT). Rewrote the assignment FLOW to explicitly integrate SKILL_UPDATE as the mechanism that drives the mastery gate.

### Files Deposited
- `knowledge/architecture/assignment-prompt-architecture-blueprint-2026-03-29.md` — Full architecture blueprint with 3 changes, exact code diffs, and verification checklist

### Files Created or Modified (Code)
- None (blueprint only — implementation is next step)

### Decisions Made
- `modeHint` injected at the END of `buildSystemPrompt` output (after all general instructions), not in the middle — so the AI reads general capabilities before mode-specific instructions that reference them
- `modeHint` persisted via `cachedSessionCtx.current.modeHint` (spread operator preserves it through cache refreshes) rather than a separate ref — cleaner, no additional state management
- Assignment FLOW explicitly teaches the AI about the 60% mastery threshold and rejection flow — the AI needs to understand the data loop, not just be told to rate
- `studentContext` remains boot-only — the REQUIRED SKILLS section in `buildFocusedContext` already provides skill strength data on every call

### Flags for CEO
- None

### Flags for Next Step
- The `buildSystemPrompt` function is a single ~4KB string concatenation. The `modeHint` parameter should be appended at the very end, just before the closing `";` of the return statement. The developer should search for the INPUT MODE CONTROL section (the last section) and append the modeHint injection after it.
- The modeHint text for assignment mode (StudyContext.jsx:1211) is a single long string with `\n` escapes. The developer should replace the FLOW section within this string (from `"FLOW:\n1."` through the end of step 5) while keeping the surrounding QUESTION VISIBILITY RULES and ANSWER REVISION PROTOCOL text intact.
- `MAX_SKILLS = 3` limit in `buildFacetAssessmentBlock` means only 3 of 13 assignment skills get full facet details. The new FLOW text accounts for this ("Use the facet keys from the FACETS section if available, otherwise rate at skill level"). No change needed to the limit for now — the uniform distribution path in `applySkillUpdates` handles skill-level ratings correctly.
