# UX Validation: Domain Drill-Down View

**Date:** 2026-03-10
**Status:** Validated with one recommendation
**Design:** `knowledge/design/domain-drilldown-2026-03-10.md`
**Implementation:** `src/screens/ProfileScreen.jsx` lines 120-401 (domain view)

---

## What the Student Sees

After tapping "Mathematics & Statistics" on the hero screen:

```
<- Back to Profile                  Settings

Mathematics & Statistics
Lv 21 . 42 sub-skills . 68% ready

[Level]  Weakest first

+------------------------------------------------------+
| (===ring===)  Calculus                            [V] |
|     7         CIP 27.0301                             |
|               12 skills . 8 reviewed . 2 due . active |
|               From: Intro to Calculus, Advanced Math  |
|               [============================]     73%  |
+------------------------------------------------------+

+------------------------------------------------------+
| (===ring===)  Linear Algebra                      [V] |
|     6         CIP 27.0101                             |
|               9 skills . 5 reviewed                   |
|               From: MATH 202                          |
|               [========================]         85%  |
+------------------------------------------------------+

(click Calculus to expand...)

+------------------------------------------------------+
| (===ring===)  Calculus                            [^] |
|     7         CIP 27.0301                             |
|               12 skills . 8 reviewed . 2 due . active |
|               From: Intro to Calculus, Advanced Math  |
|               [============================]     73%  |
|------------------------------------------------------|
|  [Review 2 Due Skills]                                |
|                                                       |
|  DERIVATIVES                                          |
|   . Chain Rule                  apply  [=====]   82%  |
|   . Product Rule                apply  [===]     65%  |
|   . L'Hopital's Rule                          New     |
|                                                       |
|  INTEGRATION                                          |
|   . Integration by Parts       apply  [==]       45%  |
|   . Substitution Method        apply  [=======]  91%  |
+------------------------------------------------------+
```

---

## Validation 1: Is Drill-Down Navigation Clear? Does the Student Know They're "Inside" a Domain?

**Grade: Strong**

### What works

- **Domain name as h1 (28px, bold, white).** It's the largest text on screen. The student immediately reads "Mathematics & Statistics" and understands the scope. This replaces the hero's "Skill Profile" h1 — the visual weight is identical but the content changes, clearly signaling a different context.

- **Aggregate stats subtitle (14px, muted).** "Lv 21 . 42 sub-skills . 68% ready" immediately below the domain name. This orients the student: "I'm looking at a domain, here are its numbers." The subtitle format matches the hero's subtitle ("Your knowledge across all courses") in position and styling, creating a familiar layout pattern.

- **Back button label change.** The header switches from "Back" (on hero) to "Back to Profile" (on domain view). The destination-specific label removes ambiguity — the student knows exactly where they'll land. The button is in the same position (top-left), consistent with the hero's back button.

- **No page transition or loading state.** Tapping a domain row on the hero instantly replaces the content. The header bar stays fixed (no flicker). The scroll position resets to top. The student perceives this as "drilling deeper" rather than "going to a new page."

- **Sort toggle provides context.** The "Level" / "Weakest first" pills only appear in the domain view. Their presence is a subtle cue: "I'm in a view that has sortable content" — different from the hero, which has no sort controls.

### Could be stronger

- **No breadcrumb.** The student sees "Back to Profile" but no persistent indicator like "Profile > Mathematics." For a two-level hierarchy, the h1 domain name is sufficient as the location indicator. If Phase 3 adds a third level (e.g., sub-skill detail as its own page), breadcrumbs would become necessary.
  - **Impact: None for current implementation.** Two levels is simple enough.

### Verdict

The student unambiguously knows they're inside a domain. The h1, subtitle, and back-button label provide three redundant orientation cues. No action needed.

---

## Validation 2: Is the Parent Skill Card Design Distinct from Sub-Skill Rows? (Visual Hierarchy)

**Grade: Strong**

### Parent skill cards (lines 158-194)

| Property | Value |
|----------|-------|
| Container | `background: T.sf (#1A1D24), border: 1px solid T.bd, borderRadius: 14, padding: 20` |
| Left element | 52x52 SVG progress ring with level number (18px bold accent blue) |
| Name | 16px, fontWeight 600, white |
| Metadata | 12px, muted — skill count, reviewed, due, activity, course attribution |
| Readiness bar | 5px tall, full-width, color-coded |
| Interaction | Click toggles expand/collapse (chevron indicator) |
| Spacing | 12px marginBottom between cards |

### Sub-skill rows (lines 236-248)

| Property | Value |
|----------|-------|
| Container | No background (transparent), no border (1px transparent), padding: 7px 8px |
| Left element | 7px colored dot |
| Name | 13px, regular weight, white |
| Right elements | Bloom's badge (10px) + 52px mini readiness bar (4px tall) or confidence label |
| Interaction | Click expands detail panel below |
| Spacing | 2px marginBottom between rows |

### Visual distinction analysis

The hierarchy is communicated through **five simultaneous cues**:

1. **Scale.** Parent cards are large (52px ring + 20px padding + metadata rows = ~100px height). Sub-skill rows are compact (~30px). The size difference is immediately apparent.

2. **Background.** Parent cards have `T.sf` (#1A1D24) background — a dark surface card. Sub-skill rows have transparent background — they blend into the parent's card background. The parent card is a container; sub-skills are items within it.

3. **Left element.** Parent: 52px SVG ring with animated progress arc and bold level number. Sub-skill: 7px colored dot. The visual weight difference is dramatic — the ring draws the eye to parents, the dot is subordinate.

4. **Typography.** Parent name: 16px, fontWeight 600. Sub-skill name: 13px, regular weight. The parent is a heading; the sub-skill is body text.

5. **Nesting.** Sub-skills only appear when a parent is expanded. They're visually indented by the parent's padding (20px) plus the category header's own layout. The border-top separator (1px solid T.bd at line 198) creates a clear division between the parent header and its children.

### Does the student confuse them?

No. The parent card is a tappable panel with a ring, name, stats, and readiness bar. The sub-skill is a compact row with a dot, name, and mini bar. They share the same general "name + readiness" structure, but the scale, background, and left-element differences make them visually distinct at every viewport size.

### Expanded sub-skill detail panel (lines 252-391)

When a sub-skill row is clicked, its detail panel has `background: T.bg (#0F1115)` — the darkest background, even darker than the parent card. This creates a three-tier visual depth:
- Domain page: `T.bg` (#0F1115)
- Parent card: `T.sf` (#1A1D24) — slightly lighter
- Sub-skill detail: `T.bg` (#0F1115) again, but inset with a border

The detail panel uses `borderTop: "none", borderRadius: "0 0 8px 8px"` to seamlessly attach below the sub-skill row, creating an accordion-like effect.

### Verdict

The visual hierarchy is clear across all three levels (domain > parent > sub-skill). Five simultaneous cues (scale, background, left element, typography, nesting) make confusion between parent and sub-skill very unlikely. No action needed.

---

## Validation 3: Is Course Attribution Useful or Cluttery?

**Grade: Adequate — useful, not cluttery, one minor concern**

### What works

- **Distinct from metadata row.** Course attribution is on its own line below the metadata row, styled differently: `fontSize: 11, color: T.txM (#64748B)` — the most muted text color. It reads as a footnote, not a primary data point. This is correct: course source is contextual information, not something the student acts on frequently.

- **"From:" prefix is clear.** The student reads "From: Intro to Calculus, Advanced Math" and immediately understands "this skill's sub-skills came from those courses." No ambiguity.

- **Truncation prevents clutter.** The 3-name limit with "+N more" ensures the attribution line never wraps excessively. For the typical case (1-2 courses), the line is short.

- **Hidden when zero courses.** If no sub-skills have a `sourceCourseId`, the attribution line doesn't render. No "From:" with nothing after it.

### Is it useful?

- **Yes, for multi-course students.** A student taking both "Intro to Calculus" and "Advanced Mathematics" sees both courses contributing to their "Calculus" parent skill. This is genuinely informative — they understand why this skill area has more sub-skills than expected (it's drawing from two courses).

- **Less useful for single-course parents.** If all sub-skills come from one course, the attribution reads "From: Introduction to Calculus" — the student already knows this because they uploaded that course. It's not actively harmful, but it's low-value information.

### Minor concern

- **Course names can be long.** If a student names their course "Introduction to Differential Equations and Dynamical Systems," the attribution line reads: "From: Introduction to Differential Equations and Dynamical Systems" — wrapping onto two lines. Combined with the metadata row above it and the readiness bar below, the parent card header area becomes tall.
  - **Impact: Low.** Long course names are user-chosen and affect all parts of the app. The `maxWidth: 680` container constrains the wrap. The extra height is at most one additional line of 11px text — adding ~15px to a card that's already ~100px. Not disruptive.
  - **Not actionable now.** Truncating course names would lose information. The current behavior (natural wrapping) is the correct trade-off.

### Is it cluttery?

No. The attribution line is:
- Smallest font size on the card (11px, matching CIP code)
- Most muted color (`T.txM` — barely visible against the dark card)
- On its own line (not competing with metadata)
- Below the metadata row (reading order: name → CIP → stats → courses → readiness bar — a natural hierarchy)

A student who doesn't care about course sources will barely notice the line. A student who does care will find it immediately.

### Verdict

Course attribution is useful for multi-course parents and unobtrusive for single-course parents. The muted styling, separate line, and truncation prevent clutter. No action needed.

---

## Validation 4: Does the Back Button Feel Right? Would Swipe-Back Be Expected?

**Grade: Strong**

### Back button behavior

| From | Button | Label | Action | Destination |
|------|--------|-------|--------|-------------|
| Domain view | Top-left | "Back to Profile" | `setProfileView(null); setExpandedSubSkill(null)` | Hero view |
| Hero view | Top-left | "Back" | `setScreen("home")` | HomeScreen |

### What works

- **Consistent position.** The back button is always top-left, always styled the same (no border, muted text, hover highlight). The student builds muscle memory: "top-left goes back."

- **Label communicates destination.** "Back to Profile" on the domain view tells the student they'll land on the profile hero, not the home screen. "Back" on the hero is more ambiguous but consistent with other screens in the app (all use "Back" to go home).

- **Instant transition.** Both navigations are state changes (`setProfileView(null)` and `setScreen("home")`). No loading, no flicker. The student perceives forward-back as symmetric.

- **Expansion state cleanup.** `setExpandedSubSkill(null)` is cleared on both back actions. The student won't see a stale expanded sub-skill when re-entering a domain. `expandedProfile` persists (parents stay expanded), which is helpful — the student re-enters and sees where they left off.

### Would swipe-back be expected?

- **This is a Tauri desktop app**, not a mobile web app. Desktop users expect click-based navigation, not swipe gestures.

- **Browser back button / keyboard shortcut:** This app doesn't use browser history (`window.history`). The "back" button in the header bar is the only back affordance. On desktop, students won't instinctively press Alt+Left or Cmd+[ to navigate back within the profile, because the URL doesn't change. This is standard for single-page apps without a router.

- **If the app ever ships on mobile/tablet:** Swipe-back would be expected on iOS. The current `setProfileView` state-based navigation doesn't integrate with the native back gesture. This would need to be addressed with a gesture handler or by pushing to browser history. Not a concern for the current desktop-only platform.

### Could be different

- **Keyboard shortcut.** Escape key to go back would be a natural desktop affordance. Currently no keyboard handling exists. This is a global UX improvement, not specific to the domain drill-down.
  - **Impact: None for current scope.** Future polish item.

### Verdict

The back button is correctly positioned, clearly labeled, and behaves predictably. No swipe-back is expected on this desktop platform. No action needed.

---

## Summary

| Question | Grade | Issue | Action |
|----------|-------|-------|--------|
| Is drill-down navigation clear? | Strong | No breadcrumb (acceptable for 2 levels) | None |
| Is parent/sub-skill hierarchy visual? | Strong | No confusion — 5 distinct visual cues | None |
| Is course attribution useful or cluttery? | Adequate | Long course names can add height | None (natural wrapping is correct) |
| Does back button feel right? | Strong | No keyboard shortcut (future polish) | None |

**Overall: No blockers. The domain drill-down is clearly scoped, the visual hierarchy is well-defined, course attribution adds value without clutter, and navigation is intuitive for a desktop app.**

---

## Phase 2 Checkpoint

- [x] **2.1 UXD:** Design deposited (`knowledge/design/domain-drilldown-2026-03-10.md`)
- [x] **2.2 DEV:** Sort toggle + course attribution + empty guard implemented, dev log deposited (`knowledge/development/phase2-domain-drilldown-2026-03-10.md`)
- [x] **2.3 QA:** 12 tests, all PASS, 1 low-severity issue (domainSort not reset on domain change), no critical bugs (`knowledge/qa/domain-drilldown-testing-2026-03-10.md`)
- [x] **2.4 UXV:** Validation complete, no blockers, 0 action items
- [x] Build verified — clean (1.36s)
- [x] Domain view shows parent skills with course attribution and full sub-skill drill-down

### Knowledge Artifacts

| Report | Location |
|--------|----------|
| UX Design | `knowledge/design/domain-drilldown-2026-03-10.md` |
| Dev Log | `knowledge/development/phase2-domain-drilldown-2026-03-10.md` |
| QA | `knowledge/qa/domain-drilldown-testing-2026-03-10.md` |
| UX Validation | `knowledge/design/validation/domain-drilldown-validation-2026-03-10.md` |
