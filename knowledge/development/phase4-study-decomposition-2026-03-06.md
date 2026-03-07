# Phase 4: Study Screen Decomposition — Development Log
**Date:** 2026-03-06
**Developer:** Study Developer Agent
**Blueprint:** `knowledge/architecture/app-jsx-decomposition-2026-03-06.md`
**Build:** `npm run build` passes, no new warnings

---

## Summary

Extracted the Study/Chat screen (~1,755 lines inline in ScreenRouter.jsx) into a `StudyScreen.jsx` layout shell (116 lines) composing 10 sub-components in `src/components/study/`. ScreenRouter.jsx reduced from 1,860 to 62 lines — now a pure routing file. Pure refactor, no feature changes.

---

## Files Created (12)

### Layout Shell
| File | Lines | Role |
|---|---|---|
| `src/screens/StudyScreen.jsx` | 116 | Top bar (back/timer/settings) + layout grid composing 10 sub-components. Break reminder kept inline (~10 lines). |

### Sub-Components (`src/components/study/`)
| File | Lines | Source Lines (original ScreenRouter) | Key Imports |
|---|---|---|---|
| `NotifPanel.jsx` | 83 | 872–941 | T, useStudy |
| `InputBar.jsx` | 131 | 1649–1765 | T, useStudy |
| `MessageList.jsx` | 95 | 1451–1537 | T, renderMd, parseSkillUpdates, useStudy |
| `AssignmentPanel.jsx` | 120 | 1541–1644 | T, generateSubmission, downloadBlob, useStudy |
| `SessionSummary.jsx` | 104 | 1767–1848 | T, generateSubmission, downloadBlob, useStudy |
| `ChunkPicker.jsx` | 149 | 946–1074 | T, DB, runExtractionV2, loadSkillsV2, decomposeAssignments, useStudy |
| `SkillsPanel.jsx` | 204 | 307–494 | T, callClaude, extractJSON, loadSkillsV2, useStudy + dynamic SubSkills |
| `MaterialsPanel.jsx` | 185 | 144–305 | T, CLS, DB, runExtractionV2, useStudy |
| `PracticeMode.jsx` | 394 | 496–865 | T, DB, TIERS, evaluateAnswer, completeTierAttempt, applySkillUpdates, loadPracticeMaterialCtx, generateProblems, useStudy + dynamic SubSkills |
| `ModePicker.jsx` | 409 | 1076–1450 | T, DB, runExtractionV2, loadSkillsV2, decomposeAssignments, strengthToTier, TIERS, createPracticeSet, generateProblems, loadPracticeMaterialCtx, useStudy |

### File Modified
| File | Before | After | Change |
|---|---|---|---|
| `src/ScreenRouter.jsx` | 1,860 lines | 62 lines | Replaced inline Study block with `<StudyScreen />`, removed all lib imports, stripped destructure to 6 routing-only values |

---

## Execution Order

1. Created `src/components/study/` directory
2. Batch 1 (simple, no lib imports): NotifPanel, InputBar, MessageList, AssignmentPanel, SessionSummary
3. Batch 2 (moderate, lib imports): ChunkPicker, SkillsPanel, MaterialsPanel
4. Batch 3 (heavy, complex state): PracticeMode, ModePicker
5. Created StudyScreen.jsx layout shell
6. Rewrote ScreenRouter.jsx — replaced 1,798-line Study block with single import + render
7. `npm run build` — passed

---

## Bugs Found and Fixed

### S1: `setSessionElapsed` missing from context value (PRE-EXISTING)
- **Severity:** Medium
- **Introduced by:** Phase 2b (context extraction), NOT Phase 4
- **Affected:** SessionSummary.jsx:96 and StudyScreen.jsx:62
- **Symptom:** `setSessionElapsed(0)` throws TypeError in cleanup handlers
- **Fix:** Added `setSessionElapsed,` to StudyContext.jsx line 905 context value object
- **Status:** Fixed

### 6 Latent Import Bugs (PRE-EXISTING from Phase 1)
Functions used in the original Study screen code but never imported in ScreenRouter.jsx. All fixed by explicit imports in sub-components:

| Function | Fixed In | Import Source |
|---|---|---|
| `callClaude` | SkillsPanel | api.js |
| `extractJSON` | SkillsPanel | api.js |
| `applySkillUpdates` | PracticeMode | study.js |
| `parseSkillUpdates` | MessageList | study.js |
| `decomposeAssignments` | ChunkPicker, ModePicker | skills.js |
| `SubSkills` | SkillsPanel, PracticeMode | db.js (dynamic import) |

---

## Cleanup Items Resolved

### C1: Unused imports in ModePicker.jsx — FIXED
Removed `effectiveStrength` (from study.js) and `currentRetrievability` (from fsrs.js). Neither was called in ModePicker's code paths — `selectMode` (which uses `effectiveStrength`) runs in StudyContext, not ModePicker.

### C2: Unused destructured values — FIXED
- **MaterialsPanel.jsx:** Removed `parsing` from context destructure (not referenced in JSX)
- **SkillsPanel.jsx:** Removed `status` from context destructure (only `setStatus` was used)

---

## Design Decisions

1. **Top bar stays in StudyScreen.jsx** — The back button has cross-cutting logic (session summary generation, full state cleanup across 20+ values). Extracting it would create a component with more context dependencies than the layout shell itself.

2. **Break reminder kept inline** — 10 lines, single condition, no interaction beyond dismiss button. Not worth a separate component.

3. **Sub-components handle their own gates** — Each returns `null` when inactive (e.g., `if (!showNotifs) return null`). StudyScreen doesn't gate them. This keeps the layout shell simple.

4. **No local state in sub-components** — All 10 components have zero `useState` calls. They're pure context consumers. This means unmounting/remounting any of them is safe — no local state to lose.

5. **Dynamic `SubSkills` import preserved** — SkillsPanel and PracticeMode use `await import("../../lib/db.js")` for SubSkills to avoid Vite circular dependency warnings. Matches the existing pattern from the original code.

---

## Open Flag: N1 — GlobalLockOverlay Position in ScreenRouter

**Status:** Flagged to CEO — requires decision

**Current behavior:** ScreenRouter checks `globalLock` at position 12 (line 59), after all screen checks. This means on non-study screens (home, materials, upload, etc.), the GlobalLockOverlay won't render when `globalLock` is active. The overlay only shows on the Study screen (via StudyScreen.jsx line 41). Handler guards (`if (globalLock) return`) prevent user-initiated operations on other screens.

**Proposed change:** Move `if (globalLock) return <GlobalLockOverlay />;` to position 3 (after `!ready` check, before `showSettings`). This would show the lock overlay on ALL screens during long operations (createCourse, addMats, extraction).

**Behavior change:** Yes. Currently during `createCourse`, the user sees the MaterialsScreen (empty/loading) while extraction runs. With the change, they'd see the GlobalLockOverlay modal instead. This is arguably better UX (user sees progress message, elapsed timer, cancel button), but it changes what the user sees.

**Recommendation:** Implement the move. The current behavior (showing a screen the user can't interact with) is confusing. Showing the lock overlay (with progress info and cancel) is more informative.

**Decision needed:** CEO approval required before implementing since this changes visible behavior.

---

## Metrics

| Metric | Before Phase 4 | After Phase 4 | Delta |
|---|---|---|---|
| ScreenRouter.jsx | 1,860 lines | 62 lines | -1,798 |
| New files | 0 | 12 | +12 |
| Total LOC (new files) | 0 | 2,106 | +2,106 |
| Net LOC change | — | — | +308 (imports, declarations, destructuring) |
| Context destructure in ScreenRouter | 55+ values | 6 values | -49 |
| Lib imports in ScreenRouter | 15+ | 0 | -15 |

---

## Validation

| Check | Result | Report |
|---|---|---|
| `npm run build` | Pass, no new warnings | — |
| UX validation (all flows) | Pass, all 10 components identical | `knowledge/design/validation/phase4-study-screen-decomposition-2026-03-06.md` |
| Security & testing audit | Pass, 5/5 areas verified | `knowledge/qa/phase4-security-testing-2026-03-06.md` |
| Bug S1 fix verified | Pass | `setSessionElapsed` now in context value |
| Cleanup C1/C2 | Fixed | Unused imports and destructures removed |
