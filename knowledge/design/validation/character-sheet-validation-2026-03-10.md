# UX Validation: Character Sheet Hero Screen

**Date:** 2026-03-10
**Status:** Validated with recommendations
**Design:** `knowledge/design/character-sheet-profile-2026-03-10.md`
**Implementation:** `src/screens/ProfileScreen.jsx` lines 394-499 (hero view)

---

## What the Student Sees

Opening the profile from the home screen:

```
← Back                                Settings

Skill Profile
Your knowledge across all courses

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│    12    │ │     8    │ │     6    │ │     4    │
│Skill Area│ │Sub-skills│ │Total Lvl │ │Due Review│
└──────────┘ └──────────┘ └──────────┘ └──────────┘

TOP SKILLS
┌──────────────────┐ ┌──────────────────┐
│               7  │ │               6  │
│ Calculus         │ │ Linear Algebra   │
│ ████████░░  73%  │ │ █████░░░░  52%   │
└──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐
│               5  │ │               3  │
│ Mechanics        │ │ Probability      │
│ ██░░░░░░░  85%   │ │ ███████░░  41%   │
└──────────────────┘ └──────────────────┘

⚡ 4 skills due for review

DOMAINS
┌──────────────────────────────────────┐
│ Mathematics          Lv 16    68%  › │
│ 3 skills · 42 sub-skills             │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Physics              Lv 5     55%  › │
│ 1 skill · 18 sub-skills · 2 due     │
└──────────────────────────────────────┘
```

---

## Validation 1: Can a Student Identify Their Strongest Skill in <3 Seconds?

**Grade: Strong**

### What works

- **Level numbers are 32px, bold, accent blue, top-right corner.** They dominate each card visually. A student's eye is immediately drawn to the largest number in the grid. The 2×2 layout means all 4 numbers are visible without scrolling on any reasonable viewport.
- **Sort order is pre-determined.** The top-left card is always the strongest (highest level). Students learn this instantly — "my best skill is top-left." No scanning required after the first visit.
- **Skill name is below the number.** The reading order is: see the number → read the name → understand "Calculus is my strongest at level 7." This takes ~1.5 seconds.

### What could be stronger

- **No visual hierarchy between the 4 cards.** All 4 cards have identical styling — same border, same background, same level number size. The #1 skill doesn't look different from #4. A subtle visual cue (slightly larger card, brighter border, or a "★" badge on the top skill) would make the strongest skill pop even faster.
  - **Impact: Low.** The sort order + top-left position is sufficient. The student reads left-to-right, top-to-bottom, and the first card they see is the strongest.
  - **Suggestion for future:** Consider a very subtle accent border (`border: 1px solid T.ac` instead of `T.bd`) on the #1 card only. No structural change needed — just a conditional border color.

### Verdict

A student can identify their strongest skill in under 2 seconds. The large numbers, consistent positioning, and level-descending sort make this effortless. No action needed.

---

## Validation 2: Is the Progress Bar Meaningful?

**Grade: Adequate — one interpretation concern**

### What works

- **Progress bar shows level progress, not readiness.** This is the correct choice — readiness is already shown as a percentage text next to the bar. Using the bar for level progress gives two distinct pieces of information per card.
- **Accent blue color is neutral.** Unlike green/amber/red readiness, the progress bar doesn't carry a "good/bad" judgment. It simply says "you're X% of the way to the next level." This avoids discouragement.
- **Short bars feel achievable.** When `progressPct` is 10%, the student sees a short fill and thinks "I need to study more to level up." When it's 85%, they think "I'm almost there." Both are motivating in different ways.

### Interpretation concern

- **"What does this bar mean?"** The progress bar has no label or tooltip. A student seeing a 30% blue bar next to "73%" green text might wonder: "73% of what? And what's the bar showing?" The 73% is readiness (recall probability). The bar is level progress (points toward next level). These are unrelated metrics displayed adjacently without labels.
  - **Impact: Medium on first visit, Low after.** Once a student understands the layout, the dual-metric design is powerful. But the first time, confusion is likely.
  - **Suggestion:** Add a tiny label below the progress bar on the hero cards: `"Lv 7 → 8"` in `fontSize: 10, color: T.txM`. This makes the bar's meaning immediately obvious: "I'm progressing from level 7 to level 8." This is a ~1-line change per card — adding a span below the progress bar row.

### Does it discourage?

- **Low progress (5-15%):** Student sees a nearly empty bar. But the level number above is the primary visual — "I'm level 7" is the dominant message, not "I'm only 5% to level 8." The bar is secondary. Not discouraging.
- **High progress (80-95%):** Motivating. "I'm almost level 8!" The near-full bar creates anticipation.
- **Just leveled up (0-5%):** The bar is nearly empty, but the level number just increased. The number change is the reward, not the bar fill.

### Verdict

The progress bar is motivating at both extremes and neutral in the middle. The only gap is first-visit interpretation — a tiny "Lv N → N+1" label would resolve this. Not a blocker.

---

## Validation 3: Is the Domain List Scannable?

**Grade: Strong**

### What works

- **Domain rows are full-width cards with consistent layout.** Name left, stats right. The eye naturally scans down the left edge reading domain names.
- **Sorted by aggregate level.** The student's most-studied domain is first. This matches their mental model — "Mathematics is my main subject, it should be at the top."
- **Level and readiness are right-aligned.** The student can scan the right edge to compare domains: "Mathematics Lv 16 68%, Physics Lv 5 55%." Quick comparative assessment.
- **Due count in amber.** Domains with due skills have a `· 2 due` tag that draws attention. The student can spot which domains need attention.
- **Chevron (`›`) signals tappability.** Combined with `cursor: pointer` and hover background change, the affordance is clear.

### Scaling

- **1-3 domains:** Clean, fits above the fold. Typical case.
- **5-7 domains:** Requires scrolling past the TOP SKILLS section. The DOMAINS header stays visible as the student scrolls. Manageable.
- **10+ domains:** Long list, but each row is only ~60px. 10 domains = ~600px. With TOP SKILLS (~220px) + summary stats (~80px) + banner (~50px), total page height is ~950px. Most of it is below the fold, but domains are the last section so scrolling to see them is natural.

### Finding a specific domain

- **By position:** If the student knows their domain is high-level, it's near the top. If low-level, scroll down. The sort order is predictable.
- **By name scan:** Domain names are `fontSize: 15, fontWeight: 600, color: T.tx` — prominent and easy to read. Scanning 5-7 names takes ~2 seconds.
- **No search/filter:** For 10+ domains, a search input would help, but this is an extreme edge case (most students have 2-5 domains). Not needed now.

### Verdict

Domain list is highly scannable. Sort order, consistent layout, and visual hierarchy make it easy to find and compare domains. No action needed.

---

## Validation 4: Is the "Due for Review" Callout Noticeable Without Being Intrusive?

**Grade: Strong**

### What works

- **Amber background + amber text + ⚡ icon.** The callout stands out from the surrounding blue/gray palette. Amber is the app's established "attention needed" color (used for due counts, urgency badges throughout).
- **Positioned between TOP SKILLS and DOMAINS.** It interrupts the visual flow just enough to be noticed, but doesn't block access to domain navigation below.
- **Compact single-line.** "⚡ 4 skills due for review" — no paragraph, no call-to-action button, no animation. The student sees it, notes it, and moves on.
- **Hidden when 0 due.** No "0 skills due for review" or empty placeholder. The banner simply doesn't exist when everything is up to date. Clean.

### Not intrusive?

- **No animation.** Unlike the ModePicker nudge banner (which has a dismiss action), this is static. It doesn't blink, slide, or demand interaction.
- **No action button.** The banner is informational only. It doesn't push the student to do anything — they choose when to review. This respects autonomy.
- **Consistent with FSRS philosophy.** FSRS reviews are suggestions, not mandates. The banner mirrors this by being noticeable but not urgent.

### What could be different

- **No click action.** The banner is not clickable. A student who sees "4 skills due" might want to immediately review them. Currently they'd need to find the domain(s) with due skills → drill down → expand the parent → click "Review Due Skills."
  - **Impact: Low for now.** The domain rows show due counts, so finding the right domain is easy. A direct "Review now" action could be added in a future iteration.

### Verdict

The callout hits the right balance — visible without being aggressive. Matches the app's existing visual language for urgency. No action needed.

---

## Validation 5: Does Navigation Feel Natural?

**Grade: Strong — one minor gap**

### Hero → Domain drill-down

- **Click domain row → domain view appears.** No page transition, no loading state. The view switches instantly because all data is already computed.
- **Domain header shows context.** "Mathematics — Lv 16 · 42 sub-skills · 68% ready" immediately orients the student: "I'm looking at my Mathematics skills."
- **Parent skill cards are familiar.** They use the same progress ring + name + metadata layout as the original ProfileScreen. No visual learning curve.

### Domain → Hero

- **"← Back to Profile" button** in the same position as the regular "← Back" button. Consistent placement. The label change from "← Back" to "← Back to Profile" clarifies the destination.
- **Clears sub-skill expansion.** `setExpandedSubSkill(null)` ensures no stale detail panel on the next domain visit. Correct.

### Hero → HomeScreen

- **"← Back" on the hero** goes to HomeScreen. Same as before. No behavior change.

### Minor gap

- **No breadcrumb trail.** When in a domain drill-down, the student sees "← Back to Profile" but doesn't see a breadcrumb like "Profile > Mathematics". For a two-level navigation, this is fine — the student knows they're one level deep. But if Phase 2 or 3 adds deeper nesting (e.g., sub-skill detail as a third level), breadcrumbs would become important.
  - **Impact: None for current implementation.** Two levels (hero → domain) is simple enough that a single back button is sufficient.

### Verdict

Navigation is natural and consistent. The two-level model (hero → domain) is simple enough that users won't get lost. The back button behavior is predictable.

---

## Validation 6: Does the Empty State Guide the Student?

**Grade: Strong**

### What the student sees (no skills extracted):

```
┌──────────────────────────────────────┐
│                                      │
│  Upload course materials to start    │
│  building your skill profile         │
│                                      │
│          [Go to Upload]              │
│                                      │
└──────────────────────────────────────┘
```

### What works

- **Clear message.** "Upload course materials to start building your skill profile" tells the student exactly what to do and why. No jargon, no ambiguity.
- **Direct action button.** "Go to Upload" with accent blue styling matches the app's primary action button pattern. One click reaches the upload screen.
- **No confusing empty grid.** The TOP SKILLS section, due banner, and DOMAINS section are all hidden when there's no data. The student only sees the message + button. No "0 Skill Areas / 0 Sub-skills / 0 Total Level / 0 Due" stats cluttering the view.
- **Consistent styling.** The empty state card uses the same `background: T.sf, border: T.bd, borderRadius: 14` as data cards. It looks intentional, not broken.

### Verdict

The empty state is clear, actionable, and uncluttered. A new student immediately understands the next step. No action needed.

---

## Summary

| Question | Grade | Issue | Action |
|----------|-------|-------|--------|
| Strongest skill in <3s? | Strong | All 4 cards same styling | Consider accent border on #1 (future) |
| Progress bar meaningful? | Adequate | No label explaining bar vs % | Consider "Lv N → N+1" label (future) |
| Domain list scannable? | Strong | No search for 10+ | Not needed for typical usage |
| Due callout balanced? | Strong | No click action | Informational is appropriate for now |
| Navigation natural? | Strong | No breadcrumb | Two-level is simple enough |
| Empty state guides? | Strong | — | No issues |

**Overall: No blockers. The hero screen is immediately scannable, the navigation is intuitive, and all edge cases are handled gracefully.**

The two suggestions (accent border on #1 skill, "Lv N → N+1" label) are minor polish items suitable for a future UX-refinement pass. Neither is a blocker for Phase 1 completion.

---

## Phase 1 Checkpoint

- [x] **1.1 UXD:** Design deposited (`knowledge/design/character-sheet-profile-2026-03-10.md`)
- [x] **1.2 SA:** Architecture deposited (`knowledge/architecture/character-sheet-profile-2026-03-10.md`)
- [x] **1.3 DEV:** ProfileScreen refactored (409 → 507 lines), hero + domain drill-down, dev log deposited
- [x] **1.4 QA:** 12 tests, all PASS, no bugs found (`knowledge/qa/character-sheet-testing-2026-03-10.md`)
- [x] **1.5 UXV:** Validation complete, no blockers, 2 minor future-polish items
- [x] Build verified — clean (10.78s)
- [x] Hero screen shows top 4 skills + domain list + due-for-review banner

### Knowledge Artifacts

| Report | Location |
|--------|----------|
| UX Design | `knowledge/design/character-sheet-profile-2026-03-10.md` |
| Architecture | `knowledge/architecture/character-sheet-profile-2026-03-10.md` |
| Dev Log | `knowledge/development/phase1-character-sheet-2026-03-10.md` |
| QA | `knowledge/qa/character-sheet-testing-2026-03-10.md` |
| UX Validation | `knowledge/design/validation/character-sheet-validation-2026-03-10.md` |
