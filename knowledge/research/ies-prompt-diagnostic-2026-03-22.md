# IES Prompt Enhancement Diagnostic
**Date:** 2026-03-22 | **Agent:** Study Developer | **Step:** 1

---

## Finding: Both IES Enhancements Already Implemented

The IES implementation spec (`docs/planning/ies-implementation-spec.md`) lists Pre-Questions (Rec 5a) and Concreteness Fading (Rec 4) as "Missing." **Both are already present in the system prompt.** They were added in a previous implementation cycle.

---

## Investigation Results

### (1) `buildSystemPrompt()` Section Map

The system prompt is a single string literal at `src/lib/study.js:1634-1636`. It contains 17 sections separated by `---` dividers:

| # | Section | Approx char offset | Purpose |
|---|---------|-------------------|---------|
| 1 | Opening identity | 0 | "You are Study -- a master teacher" |
| 2 | CONTENT SAFETY | ~120 | Injection defense for uploaded material |
| 3 | COURSE + context + SESSION HISTORY | ~280 | Dynamic context injection (courseName, context, journal) |
| 4 | MATERIAL FIDELITY DOCTRINE | after context | Stay true to professor's curriculum |
| 5 | ASSIGNMENT-FIRST PRIORITY | after #4 | Check assignments/deadlines first |
| 6 | **PRE-QUESTION PHASE** | after #5 | **Already implemented** — diagnostic questions before teaching |
| 7 | YOUR TEACHING METHOD -- ASK FIRST, TEACH SECOND | after #6 | Core 5-step teaching loop + worked example interleaving |
| 8 | **CONCRETENESS FADING** | after #7 | **Already implemented** — concrete→bridge→abstract→vary |
| 9 | THE ANSWER DOCTRINE | after #8 | Never give answers to assignments |
| 10 | HOW YOU SPEAK | after #9 | Brevity rules, tone, no filler |
| 11 | READING THE STUDENT | after #10 | Adapt to mastery level |
| 12 | DEEP QUESTIONS | after #11 | Bloom's taxonomy question matching |
| 13 | SKILL STRENGTH TRACKING | after #12 | SKILL_UPDATE tag format + context tags |
| 14 | FACET-LEVEL ASSESSMENT | after #13 | Facet-level SKILL_UPDATE sub-lines |
| 15 | ASSESSMENT PROTOCOL | after #14 | Continuous assessment, recall, DUE FOR REVIEW |
| 16 | IMAGE DISPLAY | after #15 | SHOW_IMAGE tag format and rules |
| 17 | PHANTOM VISUAL GUARD | after #16 | Don't reference unavailable visuals |

**Teaching-strategy-relevant sections:** #5 (assignment-first), #6 (pre-questions), #7 (teaching method), #8 (concreteness fading), #9 (answer doctrine), #10 (how you speak), #11 (reading the student), #12 (deep questions), #15 (assessment protocol).

### (2) `buildFocusedContext` Branches

`buildFocusedContext` at `study.js:1313-1568` has 3 branches. **None include teaching strategy instructions — they only inject data context.**

| Branch | Lines | Context injected |
|--------|-------|-----------------|
| `assignment` | 1317-1409 | Assignment questions (instructor planning + student view), required skills with strength, facet assessment block, source material (facet-based + keyword fallback), deadline context, cross-skill connections, domain proficiency |
| `skill` | 1410-1470 | Focus skill details (name, strength, description, mastery criteria, prerequisites + status), facet assessment block, source material, deadline context, cross-skill connections, domain proficiency |
| `exam` | 1472-1560 | Exam scope materials, relevant skills filtered by source match, all chunks from selected materials, cross-domain references, deadline context, cross-skill connections, domain proficiency |

The general/explore case uses `buildContext` (line 1062-1182) which injects: skill tree, cross-skill connections, assignments, deadline context, student profile, domain proficiency, source material (facet-based + keyword fallback).

### (3) FACET-LEVEL ASSESSMENT and ASSESSMENT PROTOCOL

Both exist in the system prompt:

- **FACET-LEVEL ASSESSMENT** — instructs the AI to rate individual facets using indented sub-lines in SKILL_UPDATE blocks. Uses facet keys from the context's FACETS section.
- **ASSESSMENT PROTOCOL** — instructs continuous assessment (each exchange is evidence), no announcement of assessment mode, synthesis questions for unassessed facets, recall questions before closing, and weaving DUE FOR REVIEW skills into the session.

These coexist naturally with PRE-QUESTION PHASE — pre-questions happen at session start, assessment protocol runs continuously during teaching. No conflict.

### (4) First Message Behavior

The system prompt has **explicit first-message instructions** in two sections:

1. **ASSIGNMENT-FIRST PRIORITY**: "Every session starts from the same question: what does this student need to turn in, and can they do it? Check the assignment list and deadlines."

2. **PRE-QUESTION PHASE**: "When a student first engages with a skill -- whether starting fresh or returning after time away -- open with 1-2 quick diagnostic questions BEFORE any teaching."

The flow is: assignment-first orientation → student picks a skill/assignment → pre-question phase for that skill → teaching method loop.

### (5) Pre-Questions — Already Implemented

The PRE-QUESTION PHASE section is already in the system prompt (section #6). Full text:

> When a student first engages with a skill -- whether starting fresh or returning after time away -- open with 1-2 quick diagnostic questions BEFORE any teaching. This is research-backed: pre-questions activate prior knowledge and focus attention.
>
> Examples:
> - "Before we dig in -- what does [key term] mean to you?"
> - "Quick check: how would you explain [concept] in your own words?"
> - "What do you already know about [topic]?"
>
> Their answer tells you: Whether they have any foundation to build on, Specific misconceptions to address, Where to pitch the instruction.
>
> If they say "I don't know" or "I have no idea" -- that's useful data. It means start from the ground floor, no assumptions.
>
> This is distinct from ongoing diagnostic questions during teaching. Pre-questions happen at the START, before you've said anything substantive about the skill.
>
> For returning skills (not brand new): before teaching, ask "How confident are you that you still remember [concept] from last time?" This delayed self-assessment after time away is more accurate than immediate confidence ratings.

This matches the IES spec's recommendation exactly, including the delayed self-assessment for returning skills (Rec 6a).

### (6) Concreteness Fading — Already Implemented

The CONCRETENESS FADING section is already in the system prompt (section #8). Full text:

> When teaching abstract concepts, follow this research-backed progression:
>
> 1. CONCRETE FIRST. Start with a specific, tangible example the student can visualize or relate to. Use scenarios from the course materials when possible.
> 2. BRIDGE. Connect the concrete to the underlying principle.
> 3. ABSTRACT. Now state the general rule, formula, or concept. The abstraction now has a mental hook.
> 4. VARY. Give a different concrete example to show the principle transfers. This prevents students from over-fitting to one context.
>
> The trap: jumping straight to abstract definitions. Students can memorize abstractions without understanding them. Concrete-first builds genuine comprehension.
>
> When a student struggles with the abstract form, return to concrete. When they handle concrete easily, push toward abstract. Read their responses and adjust.

This matches the IES spec's recommendation exactly.

---

## Recommendation

**No code changes needed.** Both IES enhancements are already implemented in the system prompt at the correct locations:

- **Pre-questions** (section #6) sits between ASSIGNMENT-FIRST PRIORITY and TEACHING METHOD, which is the correct position — after orientation, before teaching.
- **Concreteness fading** (section #8) sits between TEACHING METHOD and ANSWER DOCTRINE, which is the correct position — as a sub-strategy within the teaching phase.

The IES implementation spec's "Current State Assessment" table should be updated:
- Rec 4 (Concreteness Fading): ~~Missing~~ → **Implemented** (prompt-level)
- Rec 5a (Pre-questions): ~~Missing~~ → **Implemented** (prompt-level)

---

## Output Receipt
**Agent:** Study Developer
**Step:** 1
**Status:** Complete

### What Was Done
Investigated the system prompt structure, buildFocusedContext branches, assessment protocol, first-message behavior, and IES enhancement insertion points. Found that both pre-questions (Rec 5a) and concreteness fading (Rec 4) are already implemented in the system prompt.

### Files Deposited
- `study/knowledge/research/ies-prompt-diagnostic-2026-03-22.md` — this report

### Files Created or Modified (Code)
- None (diagnostic only)

### Decisions Made
- No code changes needed — both IES enhancements already exist in the system prompt.

### Flags for CEO
- The IES implementation spec (`docs/planning/ies-implementation-spec.md`) lists Pre-Questions and Concreteness Fading as "Missing" but they are already implemented. The spec's status table should be updated.
