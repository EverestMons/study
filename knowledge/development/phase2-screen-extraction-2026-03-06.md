# Phase 2: Screen & Component Extraction — Development Log
**Date:** 2026-03-06
**Developer:** Study Developer
**Blueprint:** `knowledge/architecture/app-jsx-decomposition-2026-03-06.md`
**Predecessor:** `knowledge/development/phase1-context-extraction-2026-03-06.md`

---

## What Was Done

Extracted 4 screens and 3 shared components from `src/ScreenRouter.jsx` into separate files:

### Screens Extracted

| File | Lines | Role |
|---|---|---|
| `src/screens/HomeScreen.jsx` | 88 | Course list, add course form, profile link |
| `src/screens/UploadScreen.jsx` | 162 | File drop zone, classification flow, course creation |
| `src/screens/ManageScreen.jsx` | 63 | Course management hub (materials + skills navigation) |
| `src/screens/NotifsScreen.jsx` | 76 | Notification list, extraction error display |

### Shared Components Extracted

| File | Lines | Role |
|---|---|---|
| `src/components/ErrorDisplay.jsx` | 63 | Async error screen with copy-to-clipboard and reset options |
| `src/components/GlobalLockOverlay.jsx` | 44 | Full-screen overlay during long operations (extraction, etc.) |
| `src/components/SettingsModal.jsx` | 82 | API key configuration, skill data reset |

### ScreenRouter.jsx Changes

- **Before:** 3,375 lines (all screens inline)
- **After:** 2,854 lines (4 screens + 3 components extracted)
- **Delta:** -521 lines moved to component files (+578 lines in new files, overhead from imports/exports)

### Import Cleanup

Removed from ScreenRouter.jsx imports (no longer used directly):
- `getApiKey`, `setApiKey`, `getDb` from db.js
- `testApiKey` from api.js

Removed from ScreenRouter.jsx destructure (only used by extracted components):
- `showAsyncNuclear`, `setShowAsyncNuclear`
- `apiKeyInput`, `setApiKeyInput`, `keyVerifying`, `setKeyVerifying`, `keyError`, `setKeyError`
- `apiKeyLoaded`, `setApiKeyLoaded`
- `cName`, `setCName`
- `createCourse`, `quickCreateCourse`, `loadProfile`, `delCourse`

## Architecture

```
ScreenRouter.jsx (2,854 lines)
  ├─ if asyncError → <ErrorDisplay />
  ├─ if !ready → loading spinner (inline, 3 lines)
  ├─ if showSettings → <SettingsModal />
  ├─ if home → <HomeScreen />
  ├─ if profile → inline (326 lines, complex — Phase 3 candidate)
  ├─ if upload → <UploadScreen />
  ├─ if manage → <ManageScreen />
  ├─ if materials → inline (677 lines, complex — Phase 3 candidate)
  ├─ if skills → inline (170 lines — Phase 3 candidate)
  ├─ if notifs → <NotifsScreen />
  ├─ if study → inline (~1,760 lines, most complex — Phase 3+)
  ├─ if globalLock → <GlobalLockOverlay />
  └─ return null
```

## Design Decisions

1. **Each extracted component calls `useStudy()` directly** — no prop drilling. Components destructure only the state/handlers they need.

2. **GlobalLockOverlay used as component, not variable** — the original `lockOverlay` was a local JSX variable conditionally included with `{globalLock && lockOverlay}`. Now each screen renders `{globalLock && <GlobalLockOverlay />}` instead. The component handles its own `if (!globalLock) return null` guard.

3. **ManageScreen imports GlobalLockOverlay directly** — since it wraps the overlay around its content.

4. **SettingsModal imports db/api directly** — `getApiKey`, `setApiKey`, `getDb`, `testApiKey` are imported directly in the component rather than going through context. This matches the original pattern where these were called inline in JSX event handlers.

## Build Verification

- `npm run build` passes with no errors
- Bundle size: 904.77 KB main chunk (was 904.88 KB — marginal decrease)
- No new warnings introduced

## Screens NOT Extracted (Phase 3 Candidates)

| Screen | Lines | Reason for Deferral |
|---|---|---|
| ProfileScreen | ~326 | Complex skill profile with CIP domain grouping, sub-skill expansion, practice set launching |
| MaterialsScreen | ~677 | Full material management: file upload, classification, extraction controls, chunk picker modal, error log modal |
| SkillsScreen | ~170 | Moderate complexity with skill tree display, extraction triggering |
| StudyScreen | ~1,760 | Most complex: chat, practice mode, mode picker, assignment panel, session summary, etc. |

## Files Created
- `src/screens/HomeScreen.jsx`
- `src/screens/UploadScreen.jsx`
- `src/screens/ManageScreen.jsx`
- `src/screens/NotifsScreen.jsx`
- `src/components/ErrorDisplay.jsx`
- `src/components/GlobalLockOverlay.jsx`
- `src/components/SettingsModal.jsx`

## Files Modified
- `src/ScreenRouter.jsx` — replaced inline JSX with component imports
