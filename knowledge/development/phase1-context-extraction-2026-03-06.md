# Phase 1: Context Extraction — Development Log
**Date:** 2026-03-06
**Developer:** Study Developer
**Blueprint:** `knowledge/architecture/app-jsx-decomposition-2026-03-06.md`
**Validation:** `knowledge/architecture/decomposition-validation-2026-03-06.md`

---

## What Was Done

Decomposed the monolithic `src/App.jsx` (4,426 lines) into three files:

| File | Lines | Role |
|---|---|---|
| `src/App.jsx` | 147 | Thin shell: ErrorBoundary + ErrorContext + CIP_DOMAINS + StudyProvider wrapper |
| `src/StudyContext.jsx` | 929 | All state (51 useState, 9 useRef), all effects (11 useEffect), all handlers (14 functions), all utilities (6 helpers). Exports `StudyProvider` and `useStudy()` hook. |
| `src/ScreenRouter.jsx` | 3,375 | All screen rendering. Consumes `useStudy()` and renders the original if-return chain identically. |

**Total: 4,451 lines** (vs original 4,426 — delta is import/destructuring overhead)

## Architecture

```
App.jsx
  └─ StudyErrorBoundary (class component, stays in App.jsx)
      └─ ErrorContext.Provider
          └─ StudyProvider (from StudyContext.jsx — all state + logic)
              └─ ScreenRouter (from ScreenRouter.jsx — all rendering)
```

## Design Decisions

1. **Single ScreenRouter file** instead of per-screen files. The original if-return chain has strict ordering dependencies (asyncError → !ready → showSettings → home → profile → ... → study → globalLock fallback). Splitting into individual files risks breaking this priority chain. ScreenRouter preserves it exactly.

2. **Full destructure from context** at the top of ScreenRouter. This makes it clear what the rendering layer depends on and enables future splitting — each screen's dependencies are already documented in the validation report.

3. **Lib re-exports through context value.** Screen JSX directly calls functions like `loadSkillsV2`, `runExtractionV2`, `effectiveStrength` etc. in inline onClick handlers. Rather than import them separately in ScreenRouter AND StudyContext, ScreenRouter imports them directly from lib/. StudyContext also imports them for use in handlers.

4. **CIP_DOMAINS exported from App.jsx.** ScreenRouter imports it from App.jsx (used in ProfileScreen's domain grouping). Can move to a constants file later if preferred.

## Build Verification

- `npm run build` passes with no errors
- Bundle size: 904 KB main chunk (was 899 KB — marginal increase from module boundary overhead)
- No new warnings introduced

## Next Steps (Phase 2)

Split ScreenRouter.jsx into individual screen files:
- `screens/HomeScreen.jsx`
- `screens/ProfileScreen.jsx`
- `screens/UploadScreen.jsx`
- `screens/ManageScreen.jsx`
- `screens/MaterialsScreen.jsx`
- `screens/SkillsScreen.jsx`
- `screens/NotifsScreen.jsx`
- `screens/StudyScreen.jsx`

Each screen extracts its if-return block from ScreenRouter and becomes a standalone component consuming `useStudy()`. ScreenRouter becomes a thin switch that imports and renders the active screen.

## Files Created
- `src/StudyContext.jsx` — context provider with all state and logic
- `src/ScreenRouter.jsx` — all screen rendering consuming context

## Files Modified
- `src/App.jsx` — rewritten as thin shell (ErrorBoundary + provider + router)

## Files Unchanged
- `src/main.jsx`
- `src/lib/*` (all 16 modules)
- `index.html`
