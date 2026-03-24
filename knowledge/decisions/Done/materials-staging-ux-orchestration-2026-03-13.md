# study — Materials Staging UX Redesign
## Execution Plan
**Date:** 2026-03-13
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Compact the "add materials to course" flow on MaterialsScreen — grouped grid staging, inline classification, "Add to Course" button above staged files, visual distinction between staging and management modes

---

## Feature Summary

When a user adds materials to an existing course via MaterialsScreen, the current UX presents a long vertical list of pending files with a sequential one-at-a-time classification flow and an "Add Materials" button at the bottom. This redesign compacts the staging area into a grouped grid (mirroring the existing materials grid pattern), switches to inline classification on each card, renames the button to "Add to Course" and positions it above the staged files, and introduces a visual distinction between the staging mode and the management mode below it.

No data model, state management, or backend changes. Pure UI/layout restructure within MaterialsScreen.jsx.

---

## CEO Decisions (Locked In)

1. **Button label:** "Add to Course" (replaces "Add Materials")
2. **Button position:** Above the staged files grid (not below)
3. **Button visibility:** Option B — appears only once all files are classified (not always-visible-but-disabled)
4. **Staged files layout:** Grouped by classification, same 3-column grid pattern as existing materials grid. Unclassified files get an "Unclassified" group at the top.
5. **Classification interaction:** Inline on each card (replaces sequential one-at-a-time focused card)
6. **Visual distinction:** Staging area should feel like a focused intake step, distinct from the operational materials dashboard. UX Designer to propose the specific treatment, consistent with current design language.
7. **Better centering:** Staging area should be properly centered, not left-aligned at 280px.

---

## What Already Exists

### Theme & Design Tokens (`src/lib/theme.jsx`)
- `T.bg` (#0F1115), `T.sf` (#1A1D24), `T.sfH` (#22262F) — background hierarchy
- `T.bd` (#2A2F3A) — borders
- `T.ac` (#6C9CFC), `T.acS` (rgba 10%), `T.acB` (rgba 20%) — accent
- Font: DM Sans (loaded via Google Fonts CSS import)
- Existing animations: fadeIn, pulse, shimmer

### Classification Constants (`src/lib/classify.js`)
- 7 classification types: syllabus, lecture, slides, assignment, notes, textbook, reference
- `CLS` array with `{ v, l }` (value, label) pairs

### MaterialsScreen.jsx — Current Layout
- Upload drop zone: 280px wide, left-aligned within 900px max-width container
- Pending files: vertical list, each file gets classify buttons, "Add Materials" button at bottom
- Existing materials: grouped 3-col grid by classification, collapsible groups, compact cards with status dots, expand-in-place detail
- Classification groups defined inline: `CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR`
- State: `files` (pending), `active.materials` (committed), `expandedCard`, `collapsedGroups`, `materialFilter`

### Existing Grid Pattern (documented in `knowledge/architecture/materials-grid-redesign-2026-03-11.md`)
- 3-column CSS grid: `gridTemplateColumns: "repeat(3, 1fr)"`
- Compact cards: 72px min-height, type badge top-left, status dot top-right, title with 2-line clamp
- Collapsible groups with ▶/▼ toggle, group label + count
- Expand-in-place: selected card spans `gridColumn: "1 / -1"`

### Prior Design Reference
- `knowledge/design/materials-grid-ux-2026-03-11.md` — the original materials grid UX direction note

---

## Execution Steps

### Step 1 — UXD: Staging Area Layout Direction
**Agent:** Study UX Designer
**Specialist file:** `study/agents/STUDY_UX_DESIGNER.md`
**Reads:**
- `study/agents/STUDY_UX_DESIGNER.md` (own constraints)
- `study/knowledge/design/materials-grid-ux-2026-03-11.md` (existing grid UX direction — match this)
- `study/src/screens/MaterialsScreen.jsx` (current implementation)
- `study/src/lib/theme.jsx` (design tokens)
- `study/src/lib/classify.js` (classification types)
- This orchestration plan (CEO decisions section)
**Task:**
Produce a UX direction note for the MaterialsScreen staging area redesign. The direction must cover:

1. **Staging area layout** — How the grouped grid of pending files is structured. Must use the same grouped-grid-with-expand pattern as the existing materials grid (3-col, collapsible classification groups, compact cards). Define how unclassified files appear (their own "Unclassified" group at the top).

2. **Inline classification interaction** — How classification controls appear on each unclassified card. Options include: (a) classify buttons directly on the card face, (b) click card to reveal classify options in an expanded state, (c) a dropdown or popover. Recommend one approach with rationale. Cards should visually transition (animate/sort) into their classification group once classified.

3. **"Add to Course" button** — Positioned above the staged files grid. Appears only once all files are classified (Option B). Define the visual treatment: full-width vs. inline, emphasis level, how it animates into view.

4. **Visual distinction between staging and management** — The staging area (upload zone + pending files grid) should feel like a focused intake step, visually distinct from the materials dashboard below. Propose a treatment using existing design tokens only (no new colors or typefaces). Consider: container background, border treatment, vertical spacing/divider, subtle elevation. The treatment must feel cohesive with the current dark theme, not bolted-on.

5. **Centering** — The staging area should be centered within the 900px max-width container, not left-aligned at 280px.

6. **Upload zone** — Should it remain at 280px or widen to match the staging grid? Recommend with rationale.

**Constraints:**
- Use only existing design tokens from `theme.jsx`
- Must be implementable in inline React styles (no external CSS files)
- Must follow the grouped-grid-with-expand pattern documented in the materials grid redesign
- Do NOT make aesthetic/color choices beyond the existing token palette — escalate to CEO if you believe new tokens are needed
- Do NOT redesign the management section below — only the staging area

**Output deposit:** `study/knowledge/design/materials-staging-ux-2026-03-13.md`
**Depends on:** None

---

### Step 2 — DEV: Implement Staging Area Redesign
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md` (own constraints)
- `study/knowledge/design/materials-staging-ux-2026-03-13.md` (Step 1 output — UXD direction)
- `study/src/screens/MaterialsScreen.jsx` (file being modified)
- `study/src/lib/theme.jsx` (design tokens)
- `study/src/lib/classify.js` (classification types)
- This orchestration plan (CEO decisions section)
**Task:**
Implement the staging area redesign in MaterialsScreen.jsx per the UXD direction note from Step 1. Specifically:

1. **Replace the pending files vertical list** with a grouped grid matching the existing materials grid pattern. Reuse `CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR` constants already in the file. Add an "Unclassified" group that renders at the top for files without a classification.

2. **Replace the sequential classify card** (`{cur && (...)}` block) with inline classification on each unclassified card, per the UXD direction.

3. **Move and rename the commit button** from below the file list to above the staged files grid. Rename from "Add Materials" to "Add to Course". Show only when `files.length > 0 && files.every(f => f.classification)` (existing logic, same condition).

4. **Apply the visual distinction treatment** between staging area and management area per the UXD direction.

5. **Center the staging area** per the UXD direction. Remove the `maxWidth: 280` constraint on the upload zone if the UXD direction calls for it.

6. **Preserve all existing functionality** — `onDrop`, `onSelect`, `classify`, `removeF`, `addMats`, `importFromFolder` must all still work. The `files` state array structure is unchanged. No changes to StudyContext.jsx or any other file.

**Constraints:**
- Only modify `MaterialsScreen.jsx` — no other files
- Do not change any state management, data flow, or function signatures
- Do not remove or modify the existing materials grid below the staging area
- Do not change the upload drop zone's `accept` attribute or file handling logic
- Verify the build passes: `npx vite build --mode development`

**Output deposit:** `study/knowledge/development/materials-staging-redesign-2026-03-13.md`
**Depends on:** Step 1

---

### Step 3 — QA: Staging Area Regression Test
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SECURITY_TESTING_ANALYST.md` (own constraints)
- `study/knowledge/development/materials-staging-redesign-2026-03-13.md` (Step 2 output)
- `study/src/screens/MaterialsScreen.jsx` (modified file)
- This orchestration plan (CEO decisions section)
**Task:**
Static analysis regression test of the MaterialsScreen staging area changes. Test categories:

1. **File upload flow** — drag-and-drop, click-to-browse, and folder import all still trigger correctly
2. **Classification** — inline classify buttons work for all 7 types, classified files sort into correct groups, reclassification works, remove file works
3. **Commit button** — appears only when all files classified, triggers `addMats` correctly, label is "Add to Course"
4. **Grid layout** — grouped grid renders with correct column count, unclassified group at top, collapsible groups work
5. **Existing materials** — management section below staging area is untouched, all tab filters/expanded cards/retry/remove still functional
6. **No state leakage** — staging area state (`files`) is independent of materials state (`active.materials`), no cross-contamination
7. **Build** — `npx vite build --mode development` passes

**Constraints:**
- Static analysis only (no runtime testing)
- Do not modify any files
- Severity levels per org chart: 🔴 Critical (halt), 🟡 Minor (flag), 🔵 Advisory

**Output deposit:** `study/knowledge/qa/materials-staging-testing-2026-03-13.md`
**Depends on:** Step 2

---

### Step 4 — UXV: Staging Area UX Validation
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/agents/STUDY_UX_VALIDATOR.md` (own constraints)
- `study/knowledge/design/materials-staging-ux-2026-03-13.md` (Step 1 — original direction)
- `study/knowledge/development/materials-staging-redesign-2026-03-13.md` (Step 2 — what was built)
- `study/src/screens/MaterialsScreen.jsx` (implemented file)
- This orchestration plan (CEO decisions section)
**Task:**
Validate the implemented staging area against the UXD direction note and CEO decisions. Assess:

1. **Layout fidelity** — Does the implementation match the UXD direction? Grid structure, spacing, centering.
2. **Classification flow** — Is inline classification intuitive? Does the transition from unclassified → classified feel smooth?
3. **Button discoverability** — Is "Add to Course" easy to find and understand? Does Option B (appear on completion) feel natural or does it surprise the user?
4. **Visual distinction** — Does the staging area feel like a distinct intake step? Is the boundary between staging and management clear?
5. **Consistency** — Does the staging grid feel cohesive with the existing materials grid below?
6. **Edge cases** — Single file upload, 10+ file upload, all same classification, mix of classified/unclassified

**Constraints:**
- Do not modify any files
- Approval levels: APPROVED / APPROVED WITH RECOMMENDATIONS / BLOCKED (with specific issues)

**Output deposit:** `study/knowledge/design/validation/materials-staging-validation-2026-03-13.md`
**Depends on:** Step 2, Step 3 (parallel with QA is fine, but both should complete before closeout)

---

## Dependency Chain

```
Step 1 (UXD) ──→ Step 2 (DEV) ──→ Step 3 (QA)  ──→ Closeout
                                └──→ Step 4 (UXV) ──→ Closeout
```

Steps 3 and 4 can run in parallel after Step 2 completes.

---

## How to Execute in Claude Code

Each step becomes a Claude Code session. Assemble the prompt from the step's fields:

**Prompt template:**
```
You are the [Agent name]. Read your specialist file at [specialist file path].

Then read these files:
- [each file listed in Reads]

Your assignment:
[paste the Task section]

Constraints:
[paste the Constraints section]

When complete, deposit your output to: [output deposit path]

End your response with an Output Receipt per the format in your specialist file.
```

Run steps in dependency order. After Step 2, Steps 3 and 4 can run in separate Claude Code sessions simultaneously.

---

## Knowledge Base Deposits (Expected)

| Step | File | Location |
|---|---|---|
| 1 | Staging area UX direction | `study/knowledge/design/materials-staging-ux-2026-03-13.md` |
| 2 | Development log | `study/knowledge/development/materials-staging-redesign-2026-03-13.md` |
| 3 | QA test report | `study/knowledge/qa/materials-staging-testing-2026-03-13.md` |
| 4 | UX validation report | `study/knowledge/design/validation/materials-staging-validation-2026-03-13.md` |

---

## Open Questions for CEO During Execution

- **Upload zone width:** The UXD step will recommend whether to keep 280px or widen. If you disagree with their recommendation, override before Step 2.
- **Inline classify interaction model:** The UXD step will recommend one of three options (buttons on card, expand-to-classify, dropdown). If you have a strong preference, override before Step 2.
