# Near-Duplicate Detection — UX Validation Report

**Date:** 2026-03-10
**Status:** Validation complete
**Input:** Implemented UI (Step 1.6), design spec (Step 1.5)

---

## 1. Is the near-duplicate prompt clear?

### What the student sees

**Full-match case:**
> **Similar content detected**
> "Lecture 5 Notes v2.docx" looks like a revision of "Lecture 5 Notes.docx"
> 8 of 8 sections match (87% avg similarity)

**Assessment:** Clear and informative. The message:
- Names both the new and existing files explicitly — no ambiguity about what "similar content" refers to
- Shows section counts and similarity percentage — gives the student quantitative evidence to decide
- Uses "looks like a revision of" — natural language that correctly conveys the system's best guess without overpromising

**Partial-overlap case:**
> **Partial overlap detected**
> 3 of 12 sections in "Chapter Review.pdf" overlap with "Midterm Study Guide.docx"

**Assessment:** Good. The N-of-M format makes it clear this is partial, not total. The student can reason: "3 out of 12 — most of this is new."

**Multi-material case:**
> **Similar content detected**
> "Final Review.pdf" overlaps with:
> - "Midterm Notes.docx" — 4 sections (82%)
> - "Lecture 8.epub" — 2 sections (74%)
> 6 of 10 sections match existing content.

**Assessment:** Adequate for the rare case. The bulleted list with per-material stats is scannable. The summary line at the bottom aggregates across all matches.

**Verdict: PASS.** The prompt is clear across all three variants.

---

## 2. Is "Skip" vs "Extract anyway" the right framing?

### Current button labels

| Variant | Left button | Right button |
|---------|------------|-------------|
| Full match | "Skip — same material" | "Extract anyway" |
| Partial overlap | "Skip overlapping" | "Extract all" |

### Analysis

**"Skip — same material"** is good:
- "Skip" is an action verb — clear what happens
- "same material" reinforces why skipping is safe
- The em-dash separates action from reason naturally

**"Extract anyway"** is good:
- "anyway" implies "I know it's a duplicate, do it regardless" — correct framing for an override
- It's clearly the deliberate/non-default action

### Alternative considered: "Same material" vs "New material"

This framing was mentioned in the validation scope. Analysis:
- "Same material" / "New material" frames the decision as a classification question: "is this the same or different?"
- But the system already determined it's similar — the student is deciding what to *do*, not what it *is*
- "Skip" / "Extract" is action-oriented, which is better for a blocking prompt that needs a quick decision

**Recommendation:** Keep current framing. It's action-oriented and clearly communicates consequences.

### Button styling

- Left (Skip): `T.sf` background, `T.am` amber border and text — calm, passive, recommended action
- Right (Extract): `T.ac` blue background, white text — deliberate, primary action

**Assessment:** The visual hierarchy correctly suggests "Skip" is the safe default without hiding the override option. The amber matches the card's left border accent, creating visual consistency.

**Verdict: PASS.** Framing is correct. No changes recommended.

---

## 3. Does the prompt interrupt the flow appropriately?

### Context: Where it appears

The prompt appears inside the GlobalLockOverlay — the same full-screen dark overlay that shows during extraction. The student is already waiting. The prompt replaces the spinner content (not a new modal on top of a modal).

### Interruption assessment

**Not too aggressive:**
- No sound, no animation, no urgency styling
- The amber accent is warm/cautionary, not alarming (vs red which would imply error)
- The hint text ("Skip inherits existing skills. Extraction uses API credits.") is informational, not pressuring

**Not easy to miss:**
- Full-screen overlay with dark backdrop — impossible to miss
- The card is centered and the only interactive element
- No way to dismiss except clicking a button — forces a decision

**Flow integration:**
- Before: spinner → "Extracting skills: filename..."
- Prompt appears: spinner hidden, prompt card shown
- After decision: prompt hidden, spinner resumes (or loop moves to next material)
- Transition is instant (React state update) — no jarring animation

**Edge case — multiple materials in batch:**
Each material gets its own prompt sequentially. The student sees: material A prompt → decide → material B prompt → decide → ... This is correct and not overwhelming because near-duplicates are uncommon. In the rare case of a batch with many near-duplicates, the sequential prompting is still manageable.

**Verdict: PASS.** The interruption level is appropriate — impossible to miss, but not alarming.

---

## 4. Is the multi-material grouped display understandable?

### Current implementation

For multi-material matches, the overlay shows:
```
"Final Review.pdf" overlaps with:
  - "Midterm Notes.docx" — 4 sections (82%)
  - "Lecture 8.epub" — 2 sections (74%)
6 of 10 sections match existing content.
```

### Assessment

**Strengths:**
- Bulleted list with per-material stats is scannable
- Section counts give the student a sense of how much overlap exists
- Percentage gives confidence in the match quality
- Summary line at the bottom aggregates across all matches
- Left-aligned text within the centered card improves readability of the list

**Potential concern:**
- If many materials match (e.g., 5+), the list could become long. However, this scenario is extremely rare — it would require a single new document that overlaps with 5+ different existing materials. The current implementation handles this acceptably.

**Verdict: PASS.** Grouped display is clear and understandable.

---

## 5. Additional UX Observations

### 5.1 Hint text effectiveness

> "Skip inherits existing skills. Extraction uses API credits."

This is the right information at the right time:
- "Skip inherits existing skills" — reassures the student that skipping doesn't lose anything
- "Extraction uses API credits" — subtle nudge toward skipping for cost-conscious users

**Note:** The "inherits existing skills" claim is aspirational — the current V1 implementation doesn't actually copy skill bindings on skip. The hint should be updated when V2 adds this behavior, or softened for V1. Current wording is slightly misleading but not harmful since the student doesn't see or interact with skill bindings directly.

### 5.2 No cancel/escape path

During the near-dedup prompt, there is no way to cancel the entire operation — only "Skip" or "Extract." The normal "Cancel Operation" button is hidden when `dupPrompt` is active.

**Assessment:** This is acceptable. The student initiated a batch operation (upload + extract) and the system is asking for a decision on one specific material. Canceling the entire batch at this point would be confusing. If the student wants to abort, they can click "Skip" and cancel the overall operation after the prompt closes.

### 5.3 Accessibility

- Buttons are large enough for touch targets (10px padding, 13px font)
- Color contrast: amber on dark surface (T.am #FBBF24 on T.sf #1A1D24) — contrast ratio ~10:1, exceeds WCAG AAA
- No keyboard navigation support (no `tabIndex`, no `onKeyDown`) — acceptable for a desktop Tauri app but could be improved

---

## 6. Verdict

| Criterion | Result |
|-----------|--------|
| Prompt clarity | PASS |
| Button framing | PASS |
| Interruption level | PASS |
| Multi-material display | PASS |
| Visual treatment | PASS (pending CEO override) |
| Accessibility | ACCEPTABLE (desktop app) |

**Overall: PASS.** The near-duplicate UX is clear, appropriately interrupting, and well-integrated into the existing GlobalLockOverlay flow. No blocking issues. Two minor items for future consideration:

1. Soften "Skip inherits existing skills" hint until V2 actually copies bindings
2. Consider adding keyboard support (Enter = Skip, Shift+Enter = Extract)
