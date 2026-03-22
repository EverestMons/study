# Material Skills Menu — UX Validation
**Date:** 2026-03-22 | **QA ref:** `knowledge/qa/material-skills-menu-qa-2026-03-22.md` (8/8 PASS)

---

## 1. Discoverability

**Assessment: Good**

The entry point is the existing "Start Studying" button on material cards in MaterialsScreen. Users already click this button to begin studying — the change is what happens *after* the click, not whether they can find it. The transition from MaterialsScreen to the skill picker is the same page transition used everywhere else (dark overlay fade), so it feels consistent.

The button label "Start Studying" accurately describes the intent. No new UI elements need to be discovered to reach this flow.

**No issues.**

---

## 2. Single-Skill Confirmation

**Assessment: Good — purposeful, not a speed bump**

The card is minimal: material name (muted, 12px), skill name + strength dot + percentage, optional 2-line description, then Back/Start buttons. The max-width of 400px keeps it compact and centered. The `fadeIn 0.3s` animation gives visual continuity.

This is the right call for single-skill materials. Without confirmation, the user would jump from "Start Studying" straight into an AI session with no indication of *what* skill they're about to study. The card costs 1 click but provides orientation.

The strength dot + percentage gives immediate mastery context ("Am I reviewing something I know, or learning something new?"). The material name as a muted label above the card reinforces "this is from that specific material."

**No issues.**

---

## 3. Material-to-Skill Mental Model

**Assessment: Good with one note**

The material filter banner (`SkillPicker.jsx:254-263`) clearly communicates the filtered state:
- Filtered: `Showing skills from "[Material Name]"` — explicitly names the material
- Expanded: `Showing all course skills` — makes clear you've left the filtered view
- Toggle: `Show all skills →` / `Show material skills →` — accent-colored, right-aligned

The banner sits between the review status banner and the search bar, which is a natural scan position. The stats bar above it shows the count from the current view (filtered or all), which updates when toggling — this provides numeric reinforcement of the filter state.

**Note:** When `showingAll` is toggled to true, the review banner and due skill counts reflect all course skills, not just the material's skills. This is correct behavior (user asked to see all skills), but worth noting — the "Start Review" button in the banner will pick the most urgent skill across the whole course, which may not be from the original material. This is acceptable because the user explicitly expanded the view.

**Escape hatch discoverability:** The "Show all skills" link is right-aligned in a subtle banner. It's visible but not distracting. Users who want all skills will scan for it; users who don't won't be confused by it. Good balance.

---

## 4. Zero-Skill Handling

**Assessment: Adequate**

The message `No skills extracted from "[Material Name]" yet.` is clear and specific. The "yet" implies this is a temporary state that can be resolved.

The existing empty state also shows an "Extract skills" button (from the SkillPicker empty branch at line 87-130), which gives users a direct action to resolve the empty state. The Back button returns them to MaterialsScreen.

**Minor observation:** The extract button in the empty state triggers extraction for *all* extractable materials in the course, not just the one the user clicked. This is pre-existing behavior, not introduced by this feature. For a future iteration, scoping extraction to the specific material would be more intuitive, but this is out of scope.

---

## 5. Learning Science Risk

**Risk level: LOW**

This is a pure navigation enhancement. It does not change:
- How skills are presented (same enriched objects, same strength/deadline data)
- How skill sessions work (same `bootWithFocus` call)
- How mastery is tracked (no FSRS changes)
- What the AI tutor does (no prompt changes)

**Skill selection bias concern:** The filtered view narrows the choice set, which could reduce the chance that students encounter skills from other materials they need to review. However:
- The "Show all skills" escape hatch mitigates this
- The review banner still shows due skills from the visible set
- Students who enter from CourseHomepage or CurriculumScreen still see all skills
- The material-filtered view is one entry point among several, not the only path

**Net effect:** Positive. Students studying a specific textbook chapter can now quickly find relevant skills instead of scrolling through 50+ course skills. This reduces friction and increases the likelihood they actually start a study session.

---

## Summary

| Area | Rating |
|---|---|
| Discoverability | Good |
| Single-skill confirmation | Good |
| Material-to-skill mental model | Good |
| Zero-skill handling | Adequate |
| Learning science risk | LOW (positive net effect) |

**Overall: Approved.** No blocking issues. The feature is a clean navigation enhancement that reduces friction for material-centric study workflows.
