# Phase 2b: Screen Extraction — ProfileScreen, MaterialsScreen, SkillsScreen
**Date:** 2026-03-06
**Predecessor:** `knowledge/development/phase2-screen-extraction-2026-03-06.md` (Phase 2a)
**Blueprint:** `knowledge/architecture/app-jsx-decomposition-2026-03-06.md`

---

## What Was Done

Extracted the remaining 3 inline screens from `src/ScreenRouter.jsx` into separate component files:

### Screens Extracted

| File | Lines | Role |
|---|---|---|
| `src/screens/ProfileScreen.jsx` | 339 | CIP domain grouping, sub-skill expansion, practice set launching, review due buttons |
| `src/screens/MaterialsScreen.jsx` | 555 | File upload, classification, extraction controls, chunk picker modal, error log modal |
| `src/screens/SkillsScreen.jsx` | 153 | Skill tree display, v1→v2 migration, expanded categories |

### ScreenRouter.jsx Changes

- **Before (after Phase 2a):** 2,854 lines
- **After Phase 2b:** 1,860 lines
- **Delta:** -994 lines moved to component files (+1,047 lines in new files, overhead from imports/exports)

### Import Cleanup

Removed from ScreenRouter.jsx imports (no longer used directly):
- `CIP_DOMAINS` from `App.jsx` (only used by ProfileScreen)
- `migrateV1ToV2` from `migrate.js` (only used by SkillsScreen)

Added imports for new screen components:
- `ProfileScreen` from `./screens/ProfileScreen.jsx`
- `MaterialsScreen` from `./screens/MaterialsScreen.jsx`
- `SkillsScreen` from `./screens/SkillsScreen.jsx`

### Destructure Cleanup

Removed from ScreenRouter.jsx destructure (only used by extracted screens):
- `profileData`, `setProfileData`
- `expandedProfile`, `setExpandedProfile`
- `materialSkillCounts`, `expandedMaterial`, `setExpandedMaterial`
- `errorLogModal`, `setErrorLogModal`
- `getMaterialState`, `computeTrustSignals`, `refreshMaterialSkillCounts`

Kept (shared with Study screen):
- `expandedSubSkill`, `setExpandedSubSkill`
- `expandedCats`, `setExpandedCats`
- `showSkills`, `setShowSkills`
- `chunkPicker`, `setChunkPicker`
- `processingMatId`, `setProcessingMatId`

## Architecture

```
ScreenRouter.jsx (1,860 lines)
  ├─ if asyncError → <ErrorDisplay />
  ├─ if !ready → loading spinner (inline, 3 lines)
  ├─ if showSettings → <SettingsModal />
  ├─ if home → <HomeScreen />
  ├─ if profile → <ProfileScreen />        ← NEW
  ├─ if upload → <UploadScreen />
  ├─ if manage → <ManageScreen />
  ├─ if materials → <MaterialsScreen />     ← NEW
  ├─ if skills → <SkillsScreen />           ← NEW
  ├─ if notifs → <NotifsScreen />
  ├─ if study → inline (~1,760 lines — Phase 3 candidate)
  └─ return null
```

## Component Dependencies

### ProfileScreen.jsx
- **Imports:** `T, CSS` (theme), `DB` (db), `strengthToTier, createPracticeSet, generateProblems, loadPracticeMaterialCtx` (study), `CIP_DOMAINS` (App)
- **Context:** `courses, profileData, expandedProfile, setExpandedProfile, expandedSubSkill, setExpandedSubSkill, setScreen, setShowSettings, setSessionMode, setPracticeMode, enterStudy, addNotif`

### MaterialsScreen.jsx
- **Imports:** `T, CSS` (theme), `CLS` (classify), `DB` (db), `loadSkillsV2, runExtractionV2` (skills), `GlobalLockOverlay` (component)
- **Context:** 40+ destructured values — heaviest screen for state consumption
- Handles: file drop zone, classification, extraction pipeline, chunk picker modal, error log modal

### SkillsScreen.jsx
- **Imports:** `T, CSS` (theme), `loadSkillsV2` (skills), `migrateV1ToV2` (migrate), `GlobalLockOverlay` (component)
- **Context:** `active, globalLock, setGlobalLock, busy, setBusy, status, setStatus, skillViewData, setSkillViewData, expandedCats, setExpandedCats, setScreen, setShowSettings, addNotif`

## Design Decisions

1. **Each screen calls `useStudy()` directly** — consistent with Phase 2a pattern. No prop drilling.

2. **MaterialsScreen is the heaviest consumer** — 40+ values from context. This is expected as it manages file upload, classification, extraction, chunk picking, and error logging all in one screen.

3. **Shared variables kept in ScreenRouter destructure** — `expandedSubSkill`, `expandedCats`, `showSkills`, `chunkPicker`, and `processingMatId` are used by both extracted screens and the remaining inline Study screen.

4. **CIP_DOMAINS imported from App.jsx** by ProfileScreen — matches the existing export pattern from App.jsx.

## Build Verification

- `npm run build` passes with no new errors
- Bundle size: 904.91 KB main chunk (was 904.77 KB — trivial increase from 3 new import statements)
- Pre-existing Vite warning about db.js dynamic import unchanged

## What Remains (Phase 3)

| Screen | Lines | Notes |
|---|---|---|
| StudyScreen | ~1,760 | Most complex: chat, practice mode, mode picker, assignment panel, session summary, sidebar. Only remaining inline screen. |

## Files Created
- `src/screens/ProfileScreen.jsx`
- `src/screens/MaterialsScreen.jsx`
- `src/screens/SkillsScreen.jsx`

## Files Modified
- `src/ScreenRouter.jsx` — replaced inline JSX with component imports, cleaned up destructure and imports

## Cumulative Progress

| Phase | ScreenRouter Lines | Screens Extracted |
|---|---|---|
| Start | 3,375 | 0 |
| Phase 2a | 2,854 | 4 (Home, Upload, Manage, Notifs) + 3 components |
| Phase 2b | 1,860 | 7 (+ Profile, Materials, Skills) |
| Target (Phase 3) | ~100 | 8 (+ Study) |
