# Facet Context Builder + System Prompt Reform — Development Log
**Date:** 2026-03-14
**Agent:** Study Developer
**Step:** Step 4
**Blueprint:** `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md`

---

## What Was Implemented

### 1. `buildFacetAssessmentBlock(skillIds, allSkills)` — New Export in study.js

**Location:** `src/lib/study.js` lines 1031–1094 (new function, inserted before `buildFocusedContext`)

**Behavior:**
- Accepts an array of skill IDs (numeric or concept keys) and the loaded skills array
- For each skill (up to 3 max), loads facets via `Facets.getBySkill()` and mastery via `FacetMastery.getByFacets()`
- Formats a structured text block per the blueprint specification:
  ```
  FACETS FOR Power Rule Application (power-rule-application):
    basic-differentiation: Basic Differentiation [mastery: 72%] [blooms: apply]
      Demonstrates: Differentiate polynomial terms; Apply power rule to negative exponents
    chain-rule-combo: Chain Rule Combination [mastery: untested]
  ```
- Returns `""` if no skills have facets (backward compatible)
- Caps at 3 skills; appends `"[N more skills with facets -- rate by skill-level]"` for truncated skills
- Mastery % computed via `currentRetrievability()` from the existing FSRS utility
- Mastery criteria parsed from JSON if stored as string, formatted as semicolon-separated text

**Token budget:** Per facet ~25-40 tokens. 3 skills x 8 facets = ~400-600 tokens worst case.

### 2. Context Builder Injection — Two Points in `buildFocusedContext`

**Assignment-focused sessions** (after REQUIRED SKILLS loop, before SOURCE MATERIAL):
- Collects skill IDs from `requiredSkillIds` Set, resolves to numeric IDs
- Calls `buildFacetAssessmentBlock(asgnSkillIdsArr, allSkills)`
- Injects result into context if non-empty

**Skill-focused sessions** (after prerequisites block, before SOURCE MATERIAL):
- Calls `buildFacetAssessmentBlock([skill.id], allSkills)` for the single focus skill
- Injects result into context if non-empty

**Recap and exam sessions:** Not injected — these are broad-scope contexts not suited for facet-level assessment.

### 3. System Prompt Additions — Two New Sections Appended

**Location:** End of the `buildSystemPrompt()` return string, after SKILL STRENGTH TRACKING section.

**FACET-LEVEL ASSESSMENT section (~460 chars):**
- Instructs AI to rate individual facets when context includes a FACETS section
- Shows the exact format: skill-level line + indented facet sub-lines
- Clarifies partial rating is OK (only rate observed facets)
- Falls back to skill-level only when no FACETS section present

**ASSESSMENT PROTOCOL section (~280 chars):**
- Continuous stealth assessment — each exchange is evidence
- No end-of-session announcement of assessment
- Synthesis question for unassessed facets near session end
- Never iterate facets one-by-one; never announce assessment mode

**Total addition: ~740 characters** (within the 800-char constraint).

---

## Files Modified

| File | Lines Changed | Nature |
|---|---|---|
| `src/lib/study.js` | +64 (new function), +7 (assignment injection), +4 (skill injection), +4 (system prompt) | New function + 3 surgical insertions |

No other files modified. No UI changes. No FSRS changes. No parser/applySkillUpdates changes.

---

## Build Verification

```
npx vite build --mode development
✓ 175 modules transformed.
✓ built in 1m 34s
```

No new errors or warnings. Existing dynamic import warnings for db.js and extraction.js unchanged.

---

## Deviations from Blueprint

1. **System prompt character count:** Blueprint estimated ~910 chars. Actual implementation is ~740 chars — under the 800-char constraint. Achieved by:
   - Tightening the FACET-LEVEL ASSESSMENT section (removed some redundant sentences)
   - Using the shortened ASSESSMENT PROTOCOL variant from the blueprint
   - Using `--` instead of em dashes to stay consistent with the existing prompt style

2. **`currentRetrievability` usage in facet block:** The blueprint specified `currentRetrievability(facetMastery)` but the actual function signature requires `{ stability, lastReviewAt }`. Implementation passes `{ stability: fm.stability, lastReviewAt: fm.last_review_at }` which matches the existing usage pattern throughout the codebase.

3. **Truncation check optimization:** The blueprint didn't specify how to count remaining skills with facets after the cap. Implementation queries `Facets.getBySkill()` for each remaining skill — this could be slow with many skills, but in practice assignment contexts have 3-8 skills total, so the cap rarely triggers.

---

## Output Receipt
**Agent:** Study Developer
**Step:** Step 4
**Status:** Complete

### What Was Done
Implemented `buildFacetAssessmentBlock()` helper in study.js, injected it into `buildFocusedContext` for skill-focused and assignment-focused sessions, and added FACET-LEVEL ASSESSMENT and ASSESSMENT PROTOCOL sections to the system prompt. Build passes.

### Files Deposited
- `study/knowledge/development/facet-context-prompt-2026-03-14.md` — This development log

### Files Created or Modified (Code)
- `src/lib/study.js` — New `buildFacetAssessmentBlock` export (lines 1031-1094), injection into assignment context (lines 1136-1141), injection into skill context (lines 1213-1215), system prompt additions (appended to `buildSystemPrompt` return)

### Decisions Made
- Shortened system prompt additions to ~740 chars (under 800 constraint) without losing critical instructions
- Used `--` style dashes in prompt text to match existing prompt style consistency
- Did not inject facet block into recap or exam sessions per blueprint specification

### Flags for CEO
- None — all implementation follows blueprint specification

### Flags for Next Step
- **For Step 5 (Parsing + FSRS):** The facet block is now injected into context. The AI will see facet keys and may start emitting facet sub-lines in `[SKILL_UPDATE]` blocks. `parseSkillUpdates` needs to be modified to parse these sub-lines (blueprint Section 4). `applySkillUpdates` needs per-facet routing (blueprint Section 5). These are the Step 5 deliverables — do not modify them in Step 4.
- **`buildFacetAssessmentBlock` is exported** and available for use in other contexts if needed. No other code currently imports it besides the two injection points in `buildFocusedContext`.
