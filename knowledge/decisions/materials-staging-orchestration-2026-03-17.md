# study — Materials Staging Area Redesign
## Orchestration Plan
**Date:** 2026-03-17
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Redesign materials staging area with grouped grid, inline classification, and centered layout

---

## Feature Summary

Transform the MaterialsScreen staging area (where users upload files before committing to a course) from a narrow left-aligned vertical list into a centered, visually distinct intake zone using the same grouped-grid pattern as the committed materials dashboard. Classification moves from per-card button rows to inline card interaction. The "Add to Course" button appears only when all files are classified.

---

## CEO Decisions (Locked In)

| Decision | Choice | Rationale |
|---|---|---|
| Upload zone width | 280px centered | Compact hit target, visually contained drop zone, precise feel |
| Inline classify interaction | Buttons directly on card face | One-click action, no expand/dropdown overhead for a simple 7-option choice |
| "Add to Course" button visibility | Appears only when all files classified | Prevents premature commits, surfaces remaining work |
| Staging container visual treatment | `T.sf` background, `T.bd` border, 16px radius, 24px padding | Lifts staging area as a distinct intake step |

---

## What Already Exists

### MaterialsScreen.jsx (current state)
- **Staging area:** `files` state array holds pending uploads; rendered as vertical list with classification dropdown per file
- **Committed materials:** Grouped 3-column grid (`groupedMats`, `groupOrder`) with compact cards, expand-in-place detail
- **Upload zone:** Drag-and-drop area + "Import from Folder" button; currently left-aligned at ~280px width
- **Classification constants:** `CLS_ORDER`, `CLS_LABELS`, `CLS_ABBR` already defined
- **State hooks:** `files`, `setFiles`, `classify`, `removeF`, `addMats` from StudyContext

### StudyContext.jsx (relevant handlers)
- `classify(index, classification)` — sets `files[index].classification`
- `removeF(index)` — removes file from staging
- `addMats()` — commits staged files to course (calls `storeAsChunks` for each)

### Theme tokens (all exist)
- `T.sf` (surface), `T.bd` (border), `T.ac` (accent), `T.acS` (accent soft), `T.txD` (text dim), `T.txM` (text muted)

---

## Execution Steps

### Step 1 — SA: Architecture Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `knowledge/design/materials-staging-ux-2026-03-13.md` (UX design direction)
- `src/screens/MaterialsScreen.jsx` lines 1-100 (current staging area structure)
- `src/StudyContext.jsx` lines 1130-1180 (`files` state, `classify`, `addMats` handlers)
**Task:**
Define the component architecture for the staging area redesign:
1. New state variables needed (`stagedCollapsedGroups`, if any)
2. Staging container structure (JSX skeleton)
3. Unclassified card component structure (taller card with classify buttons)
4. Classified compact card component (same as existing compact cards)
5. "Add to Course" button conditional rendering logic
6. Animation specs for classification transition (fade out → appear in new group)
7. Clarify which existing handlers change vs stay the same

**Constraints:**
- Do NOT modify StudyContext — all new state is component-local to MaterialsScreen
- Do NOT create new files — this is a refactor of MaterialsScreen.jsx
- Staging grid uses same `repeat(3, 1fr)` pattern as committed materials grid

**Depends on:** None (parallel lane start)
**Output deposit:** `knowledge/architecture/materials-staging-blueprint-2026-03-17.md`

---

### Step 2 — DEV: Implementation
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- Step 1 output: `knowledge/architecture/materials-staging-blueprint-2026-03-17.md`
- `src/screens/MaterialsScreen.jsx` (full file)
- `knowledge/design/materials-staging-ux-2026-03-13.md` (for visual token references)
**Task:**
Implement the staging area redesign in MaterialsScreen.jsx:
1. Refactor upload zone to be centered within a 900px container
2. Add staging container wrapper with `T.sf` background, border, padding
3. Implement 3-column grouped grid for staged files
4. Build unclassified card component (taller, with 7 classify buttons in 2 rows)
5. Implement classification click → animate card to new group
6. Add "Add to Course" button (full-width, prominent) that appears when all files classified
7. Ensure classified compact cards match existing compact card styling
8. Group order: Unclassified (pinned top, always expanded) → then `CLS_ORDER`

**Constraints:**
- All new state is component-local (`MaterialsScreen`)
- Do NOT break existing functionality — committed materials grid unchanged
- Do NOT introduce new dependencies
- Use existing animation keyframes where possible (`fadeIn`)
- Build verified before completion

**Depends on:** Step 1
**Output deposit:** `knowledge/development/materials-staging-implementation-2026-03-17.md`

---

### Step 3 — QA: Functional Testing
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- Step 2 output: `knowledge/development/materials-staging-implementation-2026-03-17.md`
- `src/screens/MaterialsScreen.jsx` (post-implementation)
**Task:**
Test the staging area redesign for functional correctness:
1. Upload single file → appears in Unclassified group
2. Upload multiple files → all appear in Unclassified group
3. Click classify button → file moves to correct group with animation
4. Reclassify (expand classified card → change classification) → file moves to new group
5. Remove file from staging → file removed, groups recount
6. "Add to Course" button hidden when unclassified files exist
7. "Add to Course" button appears when all files classified
8. Click "Add to Course" → files commit correctly, staging clears
9. Folder import → files appear in staging area correctly
10. Drag-and-drop → files appear in staging area correctly
11. Edge case: Stage 0 files → only upload zone visible
12. Edge case: Stage 10+ files → grid layout maintains integrity

**Severity Guide:**
- 🔴 Critical: Files lost, wrong course assignment, data corruption
- 🟡 Minor: Animation glitches, layout shifts, edge case display issues
- 🔵 Advisory: Polish opportunities, performance observations

**Depends on:** Step 2
**Output deposit:** `knowledge/qa/materials-staging-qa-2026-03-17.md`

---

### Step 4 — UXV: Usability Validation
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- Step 3 output: `knowledge/qa/materials-staging-qa-2026-03-17.md`
- `knowledge/design/materials-staging-ux-2026-03-13.md` (design direction)
- `src/screens/MaterialsScreen.jsx` (post-implementation)
**Task:**
Validate the staging area UX against design direction and usability standards:
1. **Clarity:** Is it obvious that Unclassified files need action? Does the button layout make sense?
2. **Speed:** Can a user classify 5 files in under 10 seconds? (one click each)
3. **Visual distinction:** Does the staging area feel like a distinct "intake step" vs the dashboard below?
4. **Feedback:** Is the classification animation smooth and informative?
5. **Discoverability:** Is the "Add to Course" button appearance clear and not surprising?
6. **Accessibility:** Are classify buttons keyboard-accessible? Sufficient color contrast?
7. **Error states:** What if a user uploads an unsupported file? Is the staging experience graceful?

**Depends on:** Step 3
**Output deposit:** `knowledge/design/validation/materials-staging-uxv-2026-03-17.md`

---

## Dependency Chain

```
Step 1 (SA) ─────┐
                 ├──► Step 2 (DEV) ──► Step 3 (QA) ──► Step 4 (UXV)
                 │
                 │    [No parallel lanes — this is a single-feature linear pipeline]
```

---

## How to Execute in Claude Code

Each step is executed as a separate Claude Code session. Assemble the prompt from the step fields:

### Step 1 Prompt Assembly
```
You are the Study Systems Analyst. Read your specialist file at study/agents/STUDY_SYSTEMS_ANALYST.md.

READS:
- knowledge/design/materials-staging-ux-2026-03-13.md
- src/screens/MaterialsScreen.jsx lines 1-100
- src/StudyContext.jsx lines 1130-1180

ASSIGNMENT:
[Copy the Task section from Step 1]

CONSTRAINTS:
[Copy the Constraints section from Step 1]

OUTPUT:
Deposit your architecture blueprint to knowledge/architecture/materials-staging-blueprint-2026-03-17.md
Include an Output Receipt at the end per your specialist file format.
```

### Step 2 Prompt Assembly
```
You are the Study Developer. Read your specialist file at study/agents/STUDY_DEVELOPER.md.

READS:
- knowledge/architecture/materials-staging-blueprint-2026-03-17.md (Step 1 output)
- src/screens/MaterialsScreen.jsx (full file)
- knowledge/design/materials-staging-ux-2026-03-13.md

ASSIGNMENT:
[Copy the Task section from Step 2]

CONSTRAINTS:
[Copy the Constraints section from Step 2]

OUTPUT:
Deposit your development log to knowledge/development/materials-staging-implementation-2026-03-17.md
Include an Output Receipt at the end per your specialist file format.
```

### Step 3 Prompt Assembly
```
You are the Study Security & Testing Analyst. Read your specialist file at study/agents/STUDY_SECURITY_TESTING_ANALYST.md.

READS:
- knowledge/development/materials-staging-implementation-2026-03-17.md (Step 2 output)
- src/screens/MaterialsScreen.jsx (post-implementation)

ASSIGNMENT:
[Copy the Task section from Step 3]

SEVERITY GUIDE:
[Copy the Severity Guide from Step 3]

OUTPUT:
Deposit your QA report to knowledge/qa/materials-staging-qa-2026-03-17.md
Include an Output Receipt at the end per your specialist file format.
```

### Step 4 Prompt Assembly
```
You are the Study UX Validator. Read your specialist file at study/agents/STUDY_UX_VALIDATOR.md.

READS:
- knowledge/qa/materials-staging-qa-2026-03-17.md (Step 3 output)
- knowledge/design/materials-staging-ux-2026-03-13.md
- src/screens/MaterialsScreen.jsx (post-implementation)

ASSIGNMENT:
[Copy the Task section from Step 4]

OUTPUT:
Deposit your validation report to knowledge/design/validation/materials-staging-uxv-2026-03-17.md
Include an Output Receipt at the end per your specialist file format.
```

---

## Knowledge Base Deposits (Expected)

| Step | Agent | File | Location |
|---|---|---|---|
| 1 | Study Systems Analyst | materials-staging-blueprint-2026-03-17.md | knowledge/architecture/ |
| 2 | Study Developer | materials-staging-implementation-2026-03-17.md | knowledge/development/ |
| 3 | Study Security & Testing Analyst | materials-staging-qa-2026-03-17.md | knowledge/qa/ |
| 4 | Study UX Validator | materials-staging-uxv-2026-03-17.md | knowledge/design/validation/ |

---

## Open Questions for CEO During Execution

| Question | When It May Surface | Default if Not Answered |
|---|---|---|
| Should the staging container collapse when empty? | SA blueprint design | Container always visible with upload zone (per UXD) |
| Reclassification: expand-in-place or popover? | DEV implementation | Expand-in-place (consistent with UXD) |
| Animation duration preferences | DEV implementation | 150ms fade (matches existing `fadeIn`) |

---

## Notes

- **UXD step is complete.** The design direction document (`materials-staging-ux-2026-03-13.md`) serves as the UXD output. This plan starts at SA.
- **No schema changes.** This is a pure frontend refactor — no migrations, no DB module changes.
- **Scope is limited to staging area.** Committed materials grid is untouched.
