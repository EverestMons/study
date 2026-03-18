# study — MaterialsScreen Staging UX Redesign
## Execution Plan
**Date:** 2026-03-17
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Redesign the MaterialsScreen staging area from a narrow left-aligned file list into a centered, visually distinct intake zone using the grouped-grid-with-expand pattern

---

## Feature Summary

The current MaterialsScreen has two sections: a **staging area** (where uploaded files await processing) and a **materials dashboard** (committed materials in a 3-column grouped grid). The staging area is currently a narrow 280px left-aligned vertical list with per-file classification dropdowns. This redesign:

1. **Widens and centers** the staging area to match the 900px container width
2. **Applies the grouped-grid pattern** to staged files — same 3-column layout as committed materials
3. **Moves classification to inline card interaction** — unclassified cards show 7 classification buttons directly on the card face; clicking one instantly classifies and animates the file into its group
4. **Creates visual distinction** between the staging zone (lifted `T.sf` background, bordered container) and the materials dashboard below
5. **Shows the "Add to Course" button only** when all staged files are classified

This reuses patterns established in the materials-grid-redesign (March 11) and follows the "grouped-grid-with-expand" pattern documented in that architecture blueprint.

---

## CEO Decisions (Locked In)

1. **Upload zone width:** 280px, centered — the upload zone remains a compact target within the wider staging container
2. **Inline classify interaction model:** Option (a) — classification buttons directly on the card face. Unclassified cards are taller to accommodate 7 pills in 2 rows. One click classifies and animates the file to its group.

---

## What Already Exists

### Source Files
- `src/screens/MaterialsScreen.jsx` (~592 lines) — current implementation with staging file list and committed materials grid
- `src/StudyContext.jsx` — `files` state array (staging), `active.materials` (committed)
- `src/lib/classify.js` — `CLS` constants, `autoClassify()` function, `CLS_ABBR` mappings

### Existing Patterns (from materials-grid-redesign)
- 3-column CSS grid: `gridTemplateColumns: "repeat(3, 1fr)"`, `gap: 10`
- Grouped sections with collapsible headers (▶/▼ toggle, group name + count)
- `expandedCard` state for expand-in-place detail
- `gridColumn: "1 / -1"` for full-width expanded cards
- Compact card anatomy: type badge top-left, title with 2-line clamp, status dot
- `CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR` constants
- `collapsedGroups` Set state

### Relevant State (current in MaterialsScreen.jsx)
- `files` — staging array from context
- `expandedStaged` — currently unused, can repurpose for staged card expansion
- `collapsedGroups` — for committed materials grid, will need separate state for staged groups

### UX Design Direction
- `knowledge/design/materials-staging-ux-2026-03-13.md` — full UX spec with visual layouts, token usage, animation specs

---

## Execution Steps

### Step 1 — Architecture: Staged Grid Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `knowledge/design/materials-staging-ux-2026-03-13.md` (UX direction)
- `knowledge/architecture/materials-grid-redesign-2026-03-11.md` (pattern reference)
- `src/screens/MaterialsScreen.jsx` lines 1-100 (current state structure)
**Task:** Design the architecture for the staged files grid:
1. Define new state variables needed (`stagedCollapsedGroups`, reclassification expansion state)
2. Define the unclassified card component structure (taller card with classification buttons)
3. Define the classification animation sequence (fade-out from Unclassified, fade-in to target group)
4. Define the "Add to Course" button visibility logic (derived from `files.every(f => f.classification)`)
5. Define the staging container component structure and styling props
**Constraints:**
- Reuse existing `CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR` from classify.js
- Do NOT modify `files` state structure — classification is already a field on each file object
- The staging grid and committed materials grid are separate — different `collapsedGroups` states
**Output deposit:** `knowledge/architecture/materials-staging-grid-2026-03-17.md`
**Depends on:** None (parallel)

---

### Step 2 — Development: Implement Staging Grid
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- Step 1 output (`knowledge/architecture/materials-staging-grid-2026-03-17.md`)
- `knowledge/design/materials-staging-ux-2026-03-13.md` (UX specs for tokens, spacing)
- `src/screens/MaterialsScreen.jsx` (current implementation)
- `src/lib/classify.js` (classification constants)
**Task:** Implement the staging area redesign in MaterialsScreen.jsx:
1. Wrap the staging area in a container with `T.sf` background, border, padding, margin
2. Replace the current file list with a grouped-grid (Unclassified group pinned at top)
3. Implement unclassified card component with 7 classification buttons (2 rows of pills)
4. Wire `classify(idx, type)` to classification button clicks
5. Implement CSS transitions for classification animation (opacity/scale fade-out, fade-in)
6. Add separate `stagedCollapsedGroups` state for staged file groups (Unclassified never collapses)
7. Implement "Add to Course" button that appears only when all files are classified
8. Keep upload zone at 280px centered within the staging container
9. Implement reclassification: clicking a classified staged card expands it to show classification buttons
**Constraints:**
- Do NOT modify StudyContext.jsx or db.js — all changes are UI-only in MaterialsScreen
- Do NOT break existing committed materials grid functionality
- Use existing `classify()` handler from context — do not create new classification logic
- All CSS animations must use existing theme tokens
**Output deposit:** `knowledge/development/materials-staging-grid-2026-03-17.md`
**Depends on:** Step 1 (SA blueprint)

---

### Step 3 — QA: Test Staging Grid
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- Step 2 output (`knowledge/development/materials-staging-grid-2026-03-17.md`)
- `knowledge/design/materials-staging-ux-2026-03-13.md` (expected behavior)
- `src/screens/MaterialsScreen.jsx` (implementation)
**Task:** Test the staging area redesign:
1. **Classification flow:** Upload 3 files → verify they appear in Unclassified group → click classify buttons → verify animation and group placement → verify "Add to Course" appears when all classified
2. **Edge cases:** 0 files staged, 1 file, 10+ files; all same classification; all different classifications
3. **Reclassification:** Classify a file → click to expand → reclassify → verify it moves to new group
4. **Auto-classification interaction:** Upload files with subfolder hints → verify they auto-classify → verify they appear in correct groups (not Unclassified)
5. **Committed grid untouched:** Verify existing materials grid still works (expand, collapse groups, filter tabs)
6. **State persistence:** Navigate away and back → verify staging state (if any files are staged, they persist)
7. **Build verification:** `npm run build` passes with no errors or new warnings
**Constraints:**
- Test on actual running app, not just code review
- Report severity levels per specialist template (Critical/Minor/Advisory)
**Output deposit:** `knowledge/qa/materials-staging-grid-qa-2026-03-17.md`
**Depends on:** Step 2 (DEV implementation)

