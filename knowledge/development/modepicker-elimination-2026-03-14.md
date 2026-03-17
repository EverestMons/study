# ModePicker Elimination + Recap/Explore Removal — Development Log

**Date**: 2026-03-14
**Step**: 3 of 4 (ModePicker Elimination)

## Output Receipt

### Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `src/components/study/AssignmentPicker.jsx` | ~185 | Standalone assignment picker with urgency, readiness %, skill breakdown, date picker, practice buttons |
| `src/components/study/SkillPicker.jsx` | ~159 | Standalone skill picker with strength %, learn/practice, deadline tags, extraction trigger |
| `src/components/study/ExamScopePicker.jsx` | ~71 | Standalone exam scope picker with material checklist, section counts |

### Files Modified
| File | Change |
|------|--------|
| `src/screens/StudyScreen.jsx` | Replaced `ModePicker` import with 3 sub-picker imports. Conditional rendering: `sessionMode && !focusContext && !booting && msgs.length <= 1`. Back button navigates to `"courseHome"` instead of `"home"`. Added `booting` to destructure. |
| `src/StudyContext.jsx` | Changed session intent `'explore'` → `'study'`. Deleted recap branch in `selectMode` (4 lines). Deleted explore branch in `selectMode` (2 lines). Deleted recap branch in `bootWithFocus` (3 lines). Deleted explore branch in `bootWithFocus` (3 lines). Removed `"explore"` from `sendMessage` focusContext guard. Removed `recap: 0.4, explore: 0.2` from intent weights. |
| `src/lib/study.js` | Removed `mode === 'explore' ||` from `loadFacetBasedContent` condition. Deleted recap branch in `buildFocusedContext` (~22 lines). Deleted explore branch in `buildFocusedContext` (~75 lines). |
| `src/components/study/InputBar.jsx` | Removed `"RC"` (recap) and `"XP"` (explore) from mode badge ternary. Removed recap/explore label branches from context bar text. |
| `src/lib/db.js` | Changed hardcoded `'explore'` intent in `Sessions.getOrCreateCompat` to `'study'`. |

### Files Deleted
| File | Lines | Reason |
|------|-------|--------|
| `src/components/study/ModePicker.jsx` | 662 | Replaced by 3 standalone sub-pickers + CourseHomepage routing |

### Net LOC Change
- Created: ~415 lines (3 sub-pickers)
- Deleted: ~762 lines (ModePicker.jsx 662 + recap/explore branches ~100)
- **Net: -347 lines**

### Architecture Decisions
1. **Standalone sub-pickers** — Each picker consumes `useStudy()` directly. No prop drilling, no shared wrapper. Each is self-contained with its own empty state handling.
2. **Conditional rendering in StudyScreen** — `sessionMode && !focusContext && !booting && msgs.length <= 1` gates picker visibility. Once `bootWithFocus` fires, `focusContext` is set and pickers disappear.
3. **Back button → courseHome** — StudyScreen back always returns to CourseHomepage (not HomeScreen). Maintains course context.
4. **5 modes → 3 modes** — `recap` and `explore` fully removed. Remaining modes: `assignment`, `skills`, `exam`.
5. **Intent string cleanup** — Session intent changed from `'explore'` to `'study'` in both `enterStudy()` and `getOrCreateCompat()`.

### Grep Verification
- `ModePicker` — 0 references in `src/`
- `"recap"` — 0 references in `src/`
- `"explore"` — 0 references in `src/`
- `\brecap\b` — 0 references in `src/`
- `\bexplore\b` — 0 references in `src/`

### Build Verification
- `npx vite build --mode development` — passes (179 modules, 1.75s)
- No new warnings beyond pre-existing chunk size and dynamic import advisories

### What's NOT in this step
- CourseHomepage card wiring (already done in Step 2 via `enterStudy(course, initialMode)`)
- QA verification (Step 4)
