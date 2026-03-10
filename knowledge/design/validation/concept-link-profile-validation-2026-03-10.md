# UX Validation: Concept Link Profile Display

**Date:** 2026-03-10
**Status:** Validated with recommendations
**Design:** `knowledge/design/concept-link-profile-2026-03-10.md`
**Implementation:** `src/screens/ProfileScreen.jsx` lines 42-78 (effect), 175 (cross-course count), 305-332 (CONNECTIONS section)

---

## What the Student Sees

Expanding a sub-skill card (e.g., "Chain Rule" under the Calculus parent) shows this detail panel:

```
Differentiating composite functions using the chain rule
calculus/chain-rule
[procedural] [apply] [Practice recommended]

MASTERY CRITERIA
○ Apply chain rule to polynomial compositions
✓ Identify outer and inner functions

READINESS & MEMORY
Recall: 62%           Stability: 4d
Difficulty: Moderate   Reviews: 3

PREREQUISITES
● Derivative Rules                          85%
● Function Composition                      72%

CONNECTIONS
↔ ● Chain Rule Applications    in PHYS 201   72%
→ ● Advanced Integration       in MATH 301   41%
↔ ● Implicit Differentiation   in MATH 201   60%

KEY TERMS
[composite function] [outer function]

From: MATH 201
[Practice This Skill]
```

---

## Validation 1: Are Connections Meaningful?

**Grade: Adequate — minor clarity gap**

### What works

- **"in PHYS 201" is immediately clear.** A student expanding their Chain Rule skill and seeing "Chain Rule Applications in PHYS 201, 72%" instantly understands: "I know a related version of this in my Physics course." The course name provides essential context.
- **Mastery percentage is actionable.** Seeing "72%" next to a linked skill tells the student their knowledge is transferable. Seeing "0%" tells them the link exists but they haven't studied it yet.
- **Color-coded dots match the rest of the profile.** Green/amber/red dots are used everywhere in the profile panel. No new visual language to learn.

### What could be clearer

- **"CONNECTIONS" header is vague.** Compare with "PREREQUISITES" (every student knows what that means) and "MASTERY CRITERIA" (self-explanatory). "CONNECTIONS" doesn't tell the student *why* these skills are listed. A student encountering this for the first time may not understand its purpose.
  - **Suggestion:** Consider "RELATED IN OTHER COURSES" or keep "CONNECTIONS" but add a one-line subtitle on first view: `Skills covering similar concepts in your other courses` (fontSize: 11, color: T.txM, marginBottom: 4). This is a micro-copy enhancement, not a structural change.
- **Arrow semantics are unexplained.** `↔` (same_concept/related) vs `→` (prerequisite) carry meaning, but no legend or tooltip explains the distinction. A student seeing both arrows in the same list has no way to understand the difference.
  - **Impact: Low.** The practical distinction matters more for the AI tutor (which uses it in prompt context) than for the student viewing their profile. The key information — skill name, course, mastery — is clear regardless of arrow type.
- **Link type not shown as text.** The design doc specified a link type badge (`same`, `prereq`, `related`) but the implementation omits it. This is arguably the right call — adding 3 more badges per row would add visual noise for little student benefit.

### Verdict

The student understands the core message: "This skill appears in another course, and here's how well you know it there." The vague header is a minor issue addressable with micro-copy. No structural redesign needed.

---

## Validation 2: Is the Display Overwhelming for Skills with Many Links?

**Grade: Acceptable for typical usage — edge case gap**

### Typical case (0-3 links): Clean

Most skills have 0-3 concept links. At ~28px per row, 3 connections = ~84px. This is compact, well-proportioned relative to other sections (MASTERY CRITERIA is typically 60-120px, READINESS & MEMORY is ~110px). The CONNECTIONS section blends in naturally.

### Moderate case (5-7 links): Manageable

At 7 links, the section is ~196px. Still within comfortable scrolling distance. The sort order (same_concept first, highest mastery first) means the most relevant links are always visible at the top.

### Edge case (10+ links): Could be long

At 15 links, the CONNECTIONS section would be ~420px — larger than any other section in the detail panel. This pushes KEY TERMS, EVIDENCE, and the Practice button far below the fold.

**No cap implemented.** Unlike the AI context builder (which caps at ~2000 chars / ~20 links), the profile display renders ALL connections. The AI context has a token budget concern; the profile doesn't have that constraint, but it has a readability concern.

### Mitigation factors

- **10+ links is rare.** Concept links are generated per-parent-domain, and only `same_concept` (>= 0.9 confidence), `prerequisite` (>= 0.7), and `related` (>= 0.7) pass validation. Most skills have 0-5 links.
- **Sort order prioritizes relevance.** Even if the list is long, the top items are the most meaningful (same_concept with highest mastery).
- **No visual grouping.** A flat list of 10+ rows with mixed arrow types (↔, →) is harder to scan than a grouped list with subheaders. But adding subheaders for 1-2 items per type would look sparse.

### Suggestion for future iteration

If 10+ links becomes common, add a soft cap at 5 with a "Show N more connections" toggle:
```
↔ ● Chain Rule Applications    in PHYS 201   72%
→ ● Advanced Integration       in MATH 301   41%
↔ ● Implicit Differentiation   in MATH 201   60%
↔ ● Derivative Review          in MATH 102   91%
→ ● Applied Calculus           in ENGR 201   55%
    Show 3 more connections
```
This is not urgent — acceptable to defer until real usage data shows whether large link counts are common.

### Verdict

Not overwhelming for typical usage. The edge case of 10+ links exists but is rare and manageable with a future "show more" pattern. No immediate action needed.

---

## Validation 3: Is the Interaction (Tap to Navigate) Discoverable?

**Grade: Consistent with existing patterns — one gap**

### Discoverability signals present

| Signal | Implementation | Same as PREREQUISITES? |
|--------|---------------|----------------------|
| `cursor: pointer` | Yes (line 321) | Yes (line 294) |
| Accent blue text (`T.ac`) | Yes — skill name (line 324) | Yes — skill name (line 297) |
| `e.stopPropagation()` | Yes (line 318) | Yes (line 294) |

The CONNECTIONS interaction pattern is **identical** to the PREREQUISITES interaction pattern. A student who has clicked a prerequisite link will intuitively try the same with connections. The blue accent color (#6C9CFC) is the established "clickable" signifier throughout the app.

### What works

- **Same-parent navigation is seamless.** Clicking a linked skill under the same parent card instantly switches the expanded detail panel. The previous detail collapses and the new one opens in its place. Zero confusion.
- **Cross-parent navigation opens the target.** Clicking a linked skill under a different parent calls `setExpandedProfile` to open that parent, then `setExpandedSubSkill` to expand the linked skill. The target parent card opens and shows the detail panel.

### Gap: No scroll-to-target for cross-parent navigation

When the linked skill is under a different parent card further down (or up) the page, the parent opens and the detail panel expands, but the viewport doesn't scroll to show it. The student clicks a connection and nothing visibly changes if the target is off-screen. The design doc noted this: *"User may need to scroll to see it — consider `scrollIntoView`."*

**Impact: Medium.** For profiles with 2-3 parent domains (common), the target is usually on-screen or one scroll away. For profiles with 10+ parents, the target could be multiple screens away with no visual feedback.

**Fix (future):** Add a `ref` callback on the expanded sub-skill's detail panel that calls `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`. This is a ~5-line enhancement and doesn't require any structural changes.

### No hover effect

Connection rows don't change background on hover (unlike navigation buttons which use `onMouseEnter`/`onMouseLeave`). This matches the PREREQUISITES pattern, which also has no hover effect. Consistent, but both sections would benefit from a subtle `background: rgba(255,255,255,0.03)` on hover to reinforce clickability.

**Impact: Low.** The cursor change and blue text are sufficient signals.

### Verdict

Discoverable for anyone who has used the PREREQUISITES section. The lack of scrollIntoView is the only meaningful gap, and it's a minor enhancement for a future iteration.

---

## Summary

| Question | Grade | Issue | Action |
|----------|-------|-------|--------|
| Are connections meaningful? | Adequate | "CONNECTIONS" header is vague | Consider micro-copy subtitle (future) |
| Is the display overwhelming? | Acceptable | No cap for 10+ links | "Show more" toggle if needed (future) |
| Is the interaction discoverable? | Consistent | No scrollIntoView for cross-parent | ~5-line fix (future) |

**Overall: No blockers. Implementation matches design intent and is consistent with the existing profile panel UX patterns.**

All three issues identified are minor polish items suitable for a future UX-refinement pass, not blockers for Phase 3 completion.

---

## Phase 3 Checkpoint

- [x] **3A: AI context includes cross-skill connections** — `buildCrossSkillContext` in study.js, 5 call sites, QA verified
- [x] **3B: Mastery transfer fires on first encounter** — `applySkillUpdates` in study.js, threshold > 0.7, FSRS integrity verified
- [x] **3C: Profile screen shows concept links** — lazy-loaded CONNECTIONS section, cross-course count on parents, QA verified
- [x] All QA reports deposited — no Critical issues
- [x] All builds verified — clean
- [x] UX validation complete — no blockers, 3 minor future-polish items identified

### QA Reports

| Report | Location |
|--------|----------|
| Concept Link Generation | `knowledge/qa/concept-link-generation-testing-2026-03-10.md` |
| AI Context Integration | `knowledge/qa/concept-link-ai-context-testing-2026-03-10.md` |
| Mastery Transfer | `knowledge/qa/mastery-transfer-testing-2026-03-10.md` |
| Profile Display | `knowledge/qa/concept-link-profile-testing-2026-03-10.md` |

### Bug Fixes Applied During Phase 3

| Bug | Phase | Severity | Fix |
|-----|-------|----------|-----|
| snake_case mastery fields in `buildCrossSkillContext` | 3A QA | Medium | Mapped `last_review_at` to `lastReviewAt` in masteryMap |
| Transfer threshold too low (0.5 vs spec 0.7) | 3B QA | Medium | Changed to `bestStrength > 0.7` with scaled formula |
