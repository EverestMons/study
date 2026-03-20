# IES Prompt Enhancements — Development Log
**Date:** 2026-03-19
**Agent:** Study Developer
**Task:** Implement 6 prompt-only IES teaching principle enhancements

---

## Changes Made

### Change 1 — DEEP QUESTIONS section (Rec 7, HIGH priority)
**File:** `src/lib/study.js` — `buildSystemPrompt()`
**Location:** New section inserted between READING THE STUDENT and SKILL STRENGTH TRACKING

Added Bloom's→question type mapping that leverages existing `[blooms: level]` tags on facets. Six levels mapped to specific question stems. Includes "explain your reasoning" instruction.

### Change 2 — Example-Problem Alternation (Rec 2, HIGH priority)
**File:** `src/lib/study.js` — `buildSystemPrompt()`, YOUR TEACHING METHOD section
**Location:** Appended after the 60/30/10 ratio instruction

Added 3-step teaching pattern: explain → demonstrate worked example → student tries similar problem. Instructs proactive examples rather than reactive.

### Change 3 — Within-Session Interleaved Review (Rec 1 + 5b, MEDIUM priority)
**File:** `src/lib/study.js` — `buildSystemPrompt()`, ASSESSMENT PROTOCOL section
**Location:** Appended after "never announce assessment mode"

Instructs the AI to circle back to earlier concepts before closing, and to weave recall questions about DUE FOR REVIEW skills into active sessions.

### Change 4 — Delayed Judgment of Learning (Rec 6a, MEDIUM priority)
**File:** `src/lib/study.js` — `buildSystemPrompt()`, PRE-QUESTION PHASE section
**Location:** Appended after "Pre-questions happen at the START"

Adds delayed confidence self-assessment for returning skills (not brand new). Extends pre-question behavior to include metacognitive calibration.

### Change 5 — Shallow→Deep Scaffolding (Rec 7, MEDIUM priority)
**File:** `src/lib/study.js` — `buildSystemPrompt()`, DEEP QUESTIONS section (from Change 1)
**Location:** Included in the DEEP QUESTIONS section

Provides within-skill escalation ladder: recall → why/how → what-if/design. Instructs stepping back when student struggles at deeper level.

### Change 6 — Elaborative Interrogation for All Modes (Rec 7, LOW priority)
**File:** `src/StudyContext.jsx` — `bootWithFocus()`
**Locations:** Skill mode hint (line ~1113), Assignment mode hint (line ~1110, step 2 of FLOW)

Added "Mix retrieval practice with elaborative interrogation" to both skill and assignment mode hints. Previously only present in exam mode.

---

## Word Count

Approximate additions to system prompt:
- DEEP QUESTIONS section (Changes 1+5): ~100 words
- YOUR TEACHING METHOD addition (Change 2): ~45 words
- ASSESSMENT PROTOCOL addition (Change 3): ~40 words
- PRE-QUESTION PHASE addition (Change 4): ~30 words
- bootWithFocus hints (Change 6): ~40 words (across 2 locations)
- **Total: ~255 words**

---

## Verification

- `npm run build` — succeeds cleanly (no errors, same chunk warnings as before)
- No schema changes, no UI changes, no new dependencies
- All changes are additive — existing prompt sections preserved intact

---

## Output Receipt
**Agent:** Study Developer
**Step:** Step 1
**Status:** Complete

### What Was Done
Implemented 6 prompt-only enhancements to `buildSystemPrompt()` and `bootWithFocus()` addressing IES recommendations 1, 2, 5b, 6a, and 7. Added ~255 words of prompt text across 2 files. Build verified clean.

### Files Deposited
- `knowledge/development/ies-prompt-enhancements-2026-03-19.md` — This development log

### Files Created or Modified (Code)
- `src/lib/study.js` — Added DEEP QUESTIONS section, extended YOUR TEACHING METHOD, ASSESSMENT PROTOCOL, and PRE-QUESTION PHASE
- `src/StudyContext.jsx` — Added elaborative interrogation to skill and assignment mode hints in `bootWithFocus()`

### Decisions Made
- Placed DEEP QUESTIONS section after READING THE STUDENT (since READING THE STUDENT sets up skill-level awareness that DEEP QUESTIONS builds on)
- Kept each addition concise per word budget (~255 words total vs. 200-250 target — slightly over due to Bloom's mapping needing all 6 levels)
- Combined Changes 1 and 5 into a single DEEP QUESTIONS section (cleaner than two separate insertions)

### Flags for CEO
- None. All changes are prompt-only, additive, and within specialist authority.

### Flags for Next Step
- QA should verify that the AI actually follows the new instructions by testing: (1) a skill session with an analyze-level facet — does the AI ask "why" questions?, (2) a returning skill session — does the AI ask delayed confidence?, (3) a session with DUE FOR REVIEW skills — does the AI weave in recall questions?
