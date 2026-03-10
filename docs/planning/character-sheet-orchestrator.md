# Character Sheet Profile — Orchestrator Plan

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Standard feature development.

---

## CEO Decisions (Resolved)

1. **Hero section content:** Level number + progress bar to next level per skill.
2. **Hero skill count:** Top 4 by level (compact).
3. **Domain drill-down:** Separate view — hero is one screen, domains is another. Tap to navigate.
4. **No character image.** Data only.
5. **Parent skill level + readiness visualization approach** — this plan resolves the pending CEO decision from PROJECT_STATUS.md.

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **UXD** | Study UX Designer | Design & Experience |
| **UXV** | Study UX Validator | Design & Experience — Validation |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

3 phases, executed sequentially:
- **Phase 1:** Character sheet hero screen (new ProfileScreen replacing current)
- **Phase 2:** Domain drill-down screen (new screen, navigated to from hero)
- **Phase 3:** Parent skill level aggregation in AI context + data refinements

Phase 1 and 2 are the core UX work. Phase 3 is the data-layer integration that makes the character sheet inform the tutoring experience.

---

## Context for All Agents

### What Exists Today

**`loadProfile()` in StudyContext.jsx (lines 492-578)** already computes everything needed:

Per parent skill:
- `level` — `floor(sqrt(totalPoints))` across all sub-skills under this parent
- `progressToNext` — points accumulated toward next level
- `progressNeeded` — total points needed for next level
- `readiness` — average retrievability across sub-skills (0.0–1.0)
- `subCount` — number of sub-skills
- `reviewedCount` — sub-skills with at least one mastery record
- `dueForReview` — sub-skills with `nextReview <= now`
- `lastActivityDate` — most recent interaction
- `cipDomain` — 2-digit CIP domain code
- `subSkills` — enriched array with mastery, prerequisites, fitness, evidence

Per CIP domain (computed in ProfileScreen):
- `totalLevel` — sum of parent levels in domain
- `totalSubs` — sub-skill count across domain
- `readinessSum / readinessCount` — for domain-level readiness average

**ProfileScreen.jsx (339 lines)** — currently a single scrollable page grouped by CIP domain, with expandable parent skills showing sub-skill detail. Already has concept link display, practice actions, and mastery visualization per sub-skill.

### The Design Target

**D&D character sheet** — simplified. Reference image: ability scores prominent at top, skills list below, detail sections at bottom.

**Translated to Study:**
- **Ability scores** → Top 4 parent skills by level (e.g., "Calculus — Lvl 7 ████░░")
- **Skills list** → CIP domains with aggregate levels
- **Detail sections** → Parent skills within a domain → sub-skills within a parent (separate view)

---

## Phase 1 — Character Sheet Hero Screen

### Step 1.1 · UXD · Character Sheet Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/character-sheet-profile-YYYY-MM-DD.md`

Design the hero screen (replaces the current ProfileScreen as the default view):

**Header area:**
- "Your Profile" or student identifier
- Overall stats summary: total parent skills with mastery, total sub-skills, total skills due for review

**Top 4 skills section (the "ability scores"):**
- Show the 4 highest-level parent skills
- Each displays:
  - Skill name (e.g., "Calculus")
  - Level number — large, prominent (the D&D score)
  - Progress bar to next level — thin bar below the level showing `progressToNext / progressNeeded`
  - Readiness % — small text, color-coded (green >70%, amber 40-70%, red <40%)
- Layout: 2×2 grid. Dark themed, matching app design system.
- If fewer than 4 parent skills have any mastery, show what exists + empty slots styled as "—"

**Domain summary section (below the top 4):**
- List of CIP domains that have at least one parent skill with mastery
- Each domain row shows: domain name, aggregate level, number of parent skills, aggregate readiness
- Tappable — navigates to domain drill-down (Phase 2 screen)
- Sorted by aggregate level descending

**"Due for Review" callout:**
- If any skills are due for FSRS review, show a compact banner: "12 skills due for review"
- Positioned between top 4 and domain list

**Empty state:**
- No skills extracted yet: "Upload course materials to start building your skill profile"
- Link to upload screen

**Design constraints:**
- Must fit the existing dark theme (T.bg, T.bgS, T.ac, T.tx, T.txD color tokens)
- Must be scannable in <3 seconds
- No horizontal scroll
- Mobile-friendly within Tauri window

**Escalate to CEO:** Visual treatment of level numbers, progress bar style, grid layout for top 4
**Handoff → SA + DEV:** Design in `knowledge/design/`

### Step 1.2 · SA · Profile Screen Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/character-sheet-profile-YYYY-MM-DD.md`

Design the data flow and component architecture:

**Screen routing:**
- Single route with internal state: `profileView: "hero" | "domain"` + `selectedDomain`
- Back button sets `profileView` back to `"hero"`
- No changes to ScreenRouter.jsx

**Data flow:**
- `loadProfile()` already returns everything — no new queries
- Hero reads `profileData` from context (already sorted by level descending)
- Top 4: `profileData.slice(0, 4)`
- Domain grouping: move `byDomain` computation from ProfileScreen render into a `useMemo` or computed in `loadProfile`
- Domain view: filter `profileData` by `cipDomain === selectedDomain`

**Component structure:**
- `ProfileScreen.jsx` — container with `profileView` state
  - Hero view: top 4 cards + domain list + review callout
  - Domain view: domain header + parent cards + expandable sub-skills (current code, reorganized)
- Keep as one file with conditional rendering — the two views share state (`profileData`, `expandedProfile`, etc.)

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 1.3 · DEV · Implement Character Sheet Hero

**Agent:** Study Developer
**Input:** UXD design from Step 1.1, architecture from Step 1.2
**File:** `src/screens/ProfileScreen.jsx`

Refactor ProfileScreen:
- Add `profileView` / `selectedDomain` state
- Build hero section: header, top 4 cards with level + progress bar + readiness, domain list, review callout, empty state
- Wrap existing domain content in a conditional block (`profileView === "domain"`)
- Add back navigation from domain view to hero

**Lines changed:** ~150-200 (significant refactor of existing 339-line file)

**Output:** `knowledge/development/phase1-character-sheet-YYYY-MM-DD.md`

### Step 1.4 · QA · Character Sheet Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- **Data accuracy:** Top 4 match highest-level parents. Levels, readiness, progress bars correct.
- **Domain aggregation:** Domain levels sum correctly. Readiness averages correctly.
- **Navigation:** Tap domain → domain view. Back → hero.
- **Empty states:** No skills → message with upload link. Fewer than 4 parents → shows what exists.
- **Edge cases:** 1 parent skill. All skills level 0. No skills due for review. 100+ sub-skills.
- **Regression:** Practice mode, concept links, sub-skill expansion all still work in domain view.
- **Build verification.**

**Output:** `knowledge/qa/character-sheet-testing-YYYY-MM-DD.md`

### Step 1.5 · UXV · Character Sheet Validation

**Agent:** Study UX Validator

Validate:
- Can a student identify their strongest skill in <3 seconds?
- Is the progress bar motivating?
- Is the domain list scannable?
- Is the review callout noticeable without being intrusive?
- Is navigation to/from domain view natural?
- Does the empty state guide toward uploading?

**Output:** `knowledge/design/validation/character-sheet-validation-YYYY-MM-DD.md`

### Phase 1 Checkpoint

- [ ] UXD design deposited
- [ ] SA architecture deposited
- [ ] DEV implementation complete, dev log deposited
- [ ] QA: no 🔴 Critical
- [ ] UXV: validation deposited
- [ ] Build verified

---

## Phase 2 — Domain Drill-Down View

### Step 2.1 · UXD · Domain View Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/domain-drilldown-YYYY-MM-DD.md`

Design the domain drill-down:

**Header:** Domain name, aggregate level + readiness, back arrow, sub-skill count

**Parent skill cards:** Name, level, readiness %, progress bar, sub-skill count, due count. Tappable to expand.

**Sub-skill detail (on expand):** Existing behavior — mastery metrics, Bloom's, confidence, prereqs, concept links, practice button. Unchanged.

**Course attribution:** Each parent card shows contributing courses: "From: MATH 201, PHYS 101"

**Sorting:** Parents sorted by level descending. Consider option for readiness sort.

**Handoff → DEV:** Design in `knowledge/design/`

### Step 2.2 · DEV · Implement Domain Drill-Down

**Agent:** Study Developer
**Input:** UXD design from Step 2.1
**File:** `src/screens/ProfileScreen.jsx`

Build domain view within ProfileScreen container. Mostly reorganizing existing code — the sub-skill expansion, concept links, and practice actions are already built.

**Lines changed:** ~80

**Output:** `knowledge/development/phase2-domain-drilldown-YYYY-MM-DD.md`

### Step 2.3 · QA · Domain View Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- Correct domain filtering. Course attribution correct. Sub-skill expansion works. Practice action works. Back navigation works.

**Output:** `knowledge/qa/domain-drilldown-testing-YYYY-MM-DD.md`

### Step 2.4 · UXV · Domain View Validation

**Agent:** Study UX Validator

Validate: hierarchy clarity, course attribution usefulness, back navigation.

**Output:** `knowledge/design/validation/domain-drilldown-validation-YYYY-MM-DD.md`

### Phase 2 Checkpoint

- [ ] UXD + DEV + QA + UXV all deposited
- [ ] Build verified

---

## Phase 3 — Parent-Level AI Context

### Step 3.1 · SA · Parent-Level Context Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/parent-level-ai-context-YYYY-MM-DD.md`

Design how parent skill levels inform AI tutoring:
- Add "DOMAIN PROFICIENCY" block to prompt: top parent skill levels + readiness
- Always included (~100 tokens). Gives AI calibration on overall student capability.

### Step 3.2 · DEV · Implement Parent-Level AI Context

**Agent:** Study Developer
**File:** `src/lib/study.js`

Add `buildDomainProfileContext(courseId)` helper. Insert into `buildContext()` and `buildFocusedContext()`.

**Lines changed:** ~35

### Step 3.3 · QA · AI Context Testing

**Agent:** Study Security & Testing Analyst

Verify prompt content, correct levels, absent when no mastery, token budget.

**Output:** `knowledge/qa/parent-level-ai-context-testing-YYYY-MM-DD.md`

### Phase 3 Checkpoint

- [ ] SA + DEV + QA deposited
- [ ] Build verified

---

## Final PM Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "Cross-course skill unification" to "What Is Working"
- Resolve pending decision: "Parent skill level + readiness visualization approach — **Resolved: Character sheet with top-4 hero + domain drill-down**"
- Add character sheet, domain drill-down, parent-level AI context to "What Is Working"

---

## Estimated Scope

| Phase | Steps | Lines Changed | Risk |
|---|---|---|---|
| 1 (Hero) | 1.1–1.5 | ~200 | Medium (UX) |
| 2 (Domains) | 2.1–2.4 | ~80 | Low |
| 3 (AI context) | 3.1–3.3 | ~35 | Low |

**Total:** ~315 lines changed, 0 new files. Primarily a refactor of ProfileScreen.jsx.

---

## Knowledge Artifacts Produced

| Phase | Agent | Artifact | Location |
|---|---|---|---|
| 1 | UXD | Character sheet design | `knowledge/design/character-sheet-profile-YYYY-MM-DD.md` |
| 1 | SA | Profile architecture | `knowledge/architecture/character-sheet-profile-YYYY-MM-DD.md` |
| 1 | DEV | Phase 1 dev log | `knowledge/development/phase1-character-sheet-YYYY-MM-DD.md` |
| 1 | QA | Character sheet test report | `knowledge/qa/character-sheet-testing-YYYY-MM-DD.md` |
| 1 | UXV | Validation | `knowledge/design/validation/character-sheet-validation-YYYY-MM-DD.md` |
| 2 | UXD | Domain view design | `knowledge/design/domain-drilldown-YYYY-MM-DD.md` |
| 2 | DEV | Phase 2 dev log | `knowledge/development/phase2-domain-drilldown-YYYY-MM-DD.md` |
| 2 | QA | Domain test report | `knowledge/qa/domain-drilldown-testing-YYYY-MM-DD.md` |
| 2 | UXV | Validation | `knowledge/design/validation/domain-drilldown-validation-YYYY-MM-DD.md` |
| 3 | SA | AI context blueprint | `knowledge/architecture/parent-level-ai-context-YYYY-MM-DD.md` |
| 3 | QA | AI context test report | `knowledge/qa/parent-level-ai-context-testing-YYYY-MM-DD.md` |

---

## Agent Involvement Per Phase

| Phase | SA | DEV | UXD | UXV | QA | PM |
|---|---|---|---|---|---|---|
| 1 — Hero | Architecture | ProfileScreen refactor | Character sheet design | Validate glanceability | Data + navigation | — |
| 2 — Domains | — | Domain view | Drill-down design | Validate hierarchy | Filtering + actions | — |
| 3 — AI context | Blueprint | Prompt integration | — | — | Prompt content | — |
| Final | — | — | — | — | — | Status update |
