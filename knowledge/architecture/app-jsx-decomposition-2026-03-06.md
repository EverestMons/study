# App.jsx Decomposition — Architecture Blueprint
**Date:** 2026-03-06
**Project:** study
**Assigned By:** CEO
**Status:** Draft

---

## Overview

App.jsx is currently 4,416 lines containing a single god-component (`StudyInner`) that holds all application state (~60 useState hooks, 8 refs), all business logic (10 handler functions, 12 effects), and all UI rendering (8 screen views with inline JSX). This architecture blueprint defines a decomposition into a context provider, screen components, and shared sub-components — preserving identical behavior while making the codebase maintainable for upcoming feature work (parent skill layer, concept links).

## Design Decisions

### 1. Single Context Provider
**Decision:** One `StudyContext` with a `useStudy()` hook, not multiple split contexts.
**Reasoning:** Screens are mutually exclusive (only one renders at a time due to if-return pattern). A single context means any state change triggers re-render on all consumers, but since only one screen is mounted this has zero performance cost. Splitting contexts adds complexity for no gain at this stage. If the app moves to a tabbed/multi-panel layout in the future, context splitting becomes relevant — note it then.

### 2. Context Owns All State, Handlers, and Effects
**Decision:** StudyContext.jsx contains all useState, useRef, useEffect, useCallback declarations and all handler functions (createCourse, sendMessage, bootWithFocus, selectMode, etc.).
**Reasoning:** Handlers have deep interdependencies — `sendMessage` reads `focusContext`, `cachedSessionCtx`, `sessionSkillLog`, `msgs`, `active`, `sessionMode` and writes to `msgs`, `busy`, `notifs`, `asgnWork`, `practiceMode`. Moving handlers into screen files would create circular dependency nightmares. The context is the single source of truth.

### 3. Screens as Pure Consumers
**Decision:** Screen components call `useStudy()` and render JSX. They contain no state declarations or handler logic — only destructuring from context and rendering.
**Reasoning:** This makes screens trivially replaceable, testable, and readable. A screen file should be answerable by the question "what does this screen look like?" without scrolling through business logic.

### 4. Chat Sub-Components as Context Consumers (Not Prop Recipients)
**Decision:** Sub-components within the Chat screen (PracticeMode, ModePicker, InputBar, etc.) also consume context directly via `useStudy()`, not via props from StudyScreen.
**Reasoning:** StudyScreen's sub-components need access to 30+ state variables. Prop-drilling would create unreadable component signatures. Since all sub-components share the same context and only one study session runs at a time, direct context access is cleaner.

### 5. ErrorBoundary and CIP_DOMAINS Stay in App.jsx
**Decision:** `StudyErrorBoundary`, `ErrorContext`, and `CIP_DOMAINS` constant remain in App.jsx.
**Reasoning:** ErrorBoundary wraps the entire app and is a class component — it can't use hooks/context. CIP_DOMAINS is a static constant used in multiple places — it could go in a shared constants file, but moving it is trivial and can be done later. Keep App.jsx as the entry composition: ErrorBoundary → StudyProvider → ScreenRouter.

---

## Target File Structure

```
src/
├── App.jsx                      (~150 lines)
│   ErrorBoundary, ErrorContext, CIP_DOMAINS
│   StudyProvider wrapper
│   Screen router (if/else chain)
│
├── StudyContext.jsx              (~500 lines)
│   All useState (60+), useRef (8), useEffect (12)
│   All handlers: createCourse, quickCreateCourse, loadProfile,
│     enterStudy, selectMode, bootWithFocus, sendMessage,
│     delCourse, addMats, removeMat
│   Utilities: addNotif, getMaterialState, computeTrustSignals,
│     timeAgo, refreshMaterialSkillCounts, filterDuplicates,
│     onDrop, onSelect, classify, removeF, saveSessionToJournal
│   Exports: StudyProvider, useStudy()
│
├── screens/
│   ├── HomeScreen.jsx           (~85 lines)
│   ├── ProfileScreen.jsx        (~330 lines)
│   ├── UploadScreen.jsx         (~160 lines)
│   ├── ManageScreen.jsx         (~55 lines)
│   ├── MaterialsScreen.jsx      (~540 lines)
│   ├── SkillsScreen.jsx         (~140 lines)
│   ├── NotifsScreen.jsx         (~65 lines)
│   └── StudyScreen.jsx          (~250 lines: layout + sub-component composition)
│
├── components/
│   ├── SettingsModal.jsx        (~80 lines)
│   ├── GlobalLockOverlay.jsx    (~35 lines)
│   ├── ConfirmDialog.jsx        (~30 lines)
│   ├── ErrorDisplay.jsx         (~65 lines)
│   └── study/
│       ├── PracticeMode.jsx     (~370 lines)
│       ├── ModePicker.jsx       (~370 lines: mode selection + all picker sub-UIs)
│       ├── MessageList.jsx      (~90 lines)
│       ├── InputBar.jsx         (~120 lines)
│       ├── AssignmentPanel.jsx  (~110 lines)
│       ├── SessionSummary.jsx   (~95 lines)
│       ├── MaterialsPanel.jsx   (~170 lines: sidebar materials in study view)
│       ├── SkillsPanel.jsx      (~130 lines: sidebar skills viewer in study view)
│       ├── NotifPanel.jsx       (~75 lines)
│       └── ChunkPicker.jsx      (~130 lines)
│
├── lib/                         (unchanged — 16 modules)
└── main.jsx                     (unchanged)
```

---

## State-to-Screen Dependency Map

This documents which state variables and handlers each screen requires from context. The Study Developer should use this as the extraction reference.

### HomeScreen
**State:** screen, courses, active, cName, pendingConfirm, showSettings
**Handlers:** setScreen, setCName, quickCreateCourse, loadProfile, enterStudy, delCourse, setShowSettings, setPendingConfirm

### ProfileScreen
**State:** screen, active, profileData, expandedProfile, expandedSubSkill, showSettings, practiceMode, sessionMode
**Handlers:** setScreen, setExpandedProfile, setExpandedSubSkill, setPracticeMode, setSessionMode, setShowSettings, enterStudy, loadProfile

### UploadScreen
**State:** screen, cName, files, drag, parsing, showSettings
**Handlers:** setScreen, setCName, setDrag, setFiles, setShowSettings, onDrop, onSelect, classify, removeF

### ManageScreen
**State:** screen, active, showSettings, skillViewData
**Handlers:** setScreen, setShowSettings, setSkillViewData

### MaterialsScreen
**State:** screen, active, courses, files, drag, busy, status, globalLock, showSettings, showSkills, skillViewData, pendingConfirm, processingMatId, expandedMaterial, materialSkillCounts, chunkPicker, focusContext, sessionMode, errorLogModal
**Handlers:** setScreen, setActive, setCourses, setDrag, setBusy, setGlobalLock, setShowSettings, setShowSkills, setSkillViewData, setPendingConfirm, setProcessingMatId, setExpandedMaterial, setChunkPicker, setFocusContext, setSessionMode, setStatus, setErrorLogModal, addMats, removeMat, enterStudy, onDrop, onSelect, addNotif, getMaterialState, computeTrustSignals, refreshMaterialSkillCounts

### SkillsScreen
**State:** screen, active, busy, globalLock, showSettings, skillViewData, expandedCats, status
**Handlers:** setScreen, setBusy, setGlobalLock, setShowSettings, setSkillViewData, setExpandedCats, setStatus

### NotifsScreen
**State:** screen, active, notifs, extractionErrors, showSettings
**Handlers:** setScreen, setNotifs, setExtractionErrors, setShowSettings

### StudyScreen (+ all sub-components)
**State:** (nearly everything — 32+ setters observed)
**Handlers:** (nearly everything — selectMode, bootWithFocus, sendMessage, addMats, removeMat, and many more)
**Note:** This is why context is essential. Listing individual props would be impractical.

---

## Shared Components

### SettingsModal
**Source lines:** 1201–1280
**State needed:** apiKeyInput, keyVerifying, keyError, apiKeyLoaded
**Handlers:** setApiKeyInput, setKeyVerifying, setKeyError, setShowSettings, setApiKeyLoaded

### GlobalLockOverlay
**Source lines:** 1165–1200
**State needed:** globalLock, lockElapsed, status

### ConfirmDialog
**State needed:** pendingConfirm
**Handlers:** setPendingConfirm
**Note:** This is the `pendingConfirm && (...)` pattern used across screens.

### ErrorDisplay (Async Error)
**Source lines:** 1094–1157
**State needed:** asyncError
**Handlers:** setAsyncError

---

## Chat Sub-Component Boundaries

| Component | Source Lines | Primary State/Handler Dependencies |
|---|---|---|
| MaterialsPanel | 2697–2859 | active, files, drag, processingMatId, materialSkillCounts, expandedMaterial, onDrop, addMats, removeMat, getMaterialState, computeTrustSignals |
| SkillsPanel | 2860–3048 | showSkills, skillViewData, expandedCats |
| PracticeMode | 3049–3420 | practiceMode, setPracticeMode, codeMode, setCodeMode, input, setInput, sendMessage |
| NotifPanel | 3422–3498 | showNotifs, notifs, extractionErrors, lastSeenNotif |
| ChunkPicker | 3499–3628 | chunkPicker, setChunkPicker, booting, bootWithFocus |
| ModePicker | 3629–4003 | sessionMode, pickerData, chunkPicker, booting, selectMode, bootWithFocus |
| MessageList | 4004–4093 | msgs, booting, status, sessionElapsed, breakDismissed, processingMatId, timeAgo, renderMd, endRef |
| AssignmentPanel | 4094–4201 | asgnWork, setAsgnWork, sidebarCollapsed, setSidebarCollapsed, active, exporting, generateSubmission |
| InputBar | 4202–4319 | msgs, input, setInput, codeMode, setCodeMode, busy, sendMessage, practiceMode, taRef |
| SessionSummary | 4320–4413 | sessionSummary, setSessionSummary, setScreen, setSessionMode, enterStudy |

---

## Migration Impact
**Migration Impact:** None. This is a pure refactor of frontend component structure. No database tables, queries, schema, or migration files are affected.

---

## Assumptions

- The if-return screen routing pattern will be preserved (not replaced with React Router or similar). This keeps the refactor behavioral-identical.
- `theme.jsx` exports (T, CSS, renderMd) continue to be imported directly by each screen/component that needs them — they are not routed through context.
- `lib/` imports (db.js, skills.js, etc.) are used directly by StudyContext.jsx handlers. Screen components should NOT import from lib/ — all data access goes through context.
- CIP_DOMAINS can be imported by screens that need it from App.jsx or moved to a constants file — either is acceptable.

## Open Questions / Flags

- ~~**ModePicker granularity:**~~ **RESOLVED by CEO (2026-03-06):** One file. Split later if any picker grows past 150 lines.
- ~~**Long handler extraction:**~~ **RESOLVED by CEO (2026-03-06):** Leave in context. Handlers stay inline in StudyContext.jsx.

---

## Output Receipt
**Agent:** Planner (producing architecture blueprint on behalf of Study Systems Analyst)
**Step:** Pre-execution architecture deposit
**Status:** Complete

### What Was Done
Architecture blueprint for App.jsx decomposition. Documents target file structure, context design, state-to-screen dependency map, chat sub-component boundaries, and design rationale.

### Files Deposited
- `study/knowledge/architecture/app-jsx-decomposition-2026-03-06.md` — this file

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- Single context provider (CEO approved)
- Chat sub-components in same pass (CEO approved)
- Phased execution sequence (CEO approved)

### Flags for CEO
- ModePicker granularity question (one file vs per-picker files) — recommendation included
- Handler extraction question (inline in context vs lib/) — recommendation included

### Flags for Next Step
- Study Developer should read this blueprint completely before starting Phase 1
- Study Developer should verify app builds cleanly (`npm run dev`) before any changes
