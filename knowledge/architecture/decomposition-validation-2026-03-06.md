# App.jsx Decomposition — Architecture Validation
**Date:** 2026-03-06
**Validator:** Study Systems Analyst
**Blueprint:** `app-jsx-decomposition-2026-03-06.md`
**Source:** `src/App.jsx` (4,427 lines at time of validation)

---

## Verdict: APPROVED with amendments

The blueprint is architecturally sound. The single-context design is correct for this if-return routing model. Five factual inaccuracies found and corrected below. Two architectural concerns flagged. No blockers for Phase 1.

---

## 1. Factual Corrections

### 1a. Hook counts are wrong
**Blueprint claims:** ~60 useState, 8 refs, 12 effects
**Actual:** 51 useState (including `_setShowManage`, `_setShowNotifs`), 9 useRef (added `extractionCancelledRef`), 11 useEffect

This matters for the StudyContext.jsx line estimate. 500 lines is still plausible but tight once all handlers are included.

### 1b. Missing state variables from dependency map

The blueprint's state-to-screen maps omit several variables that screens actually use:

- **HomeScreen** — missing `globalLock`, `lockOverlay` (rendered via `{globalLock && lockOverlay}` pattern). Also missing `apiKeyLoaded` (used in initial settings prompt logic).
- **ProfileScreen** — missing `active.materials` (used for material count display), `CIP_DOMAINS` (used to group skills by CIP domain at line 1376). Missing handler `refreshMaterialSkillCounts`.
- **ManageScreen** — missing `processingMatId` (disables back button at line 1860-1861), `globalLock`/`lockOverlay`, `busy`, `status`. Missing handlers: `addMats`, `removeMat`, `onDrop`, `onSelect`, `classify`, `removeF`, `files`, `drag`, `parsing`, `addNotif`, `enterStudy`. The manage screen is a full material management screen, not a simple navigation hub — the blueprint severely underestimates it at ~55 lines.
- **SkillsScreen** — missing `active.materials` (referenced in skill display), `addNotif`.
- **NotifsScreen** — missing `lastSeenNotif`.

### 1c. SettingsModal is an if-return, not a component
**Blueprint claims:** SettingsModal source lines 1201-1280
**Actual:** Lines 1202-1279. More importantly, `showSettings` uses the if-return pattern (line 1202: `if (showSettings) return (...)`) — it's a full-screen takeover that short-circuits all other screen rendering. Extracting it as a standalone component inside ScreenRouter is fine, but the developer must understand it runs _before_ all screen checks, not alongside them.

### 1d. GlobalLockOverlay is a variable, not a component
**Blueprint claims:** Source lines 1165-1200
**Actual:** Lines 1167-1199, declared as `const lockOverlay = globalLock ? (...) : null`. It's a local JSX variable referenced by `{globalLock && lockOverlay}` in multiple screens (manage, materials, skills, study), not a standalone rendered component. Extracting it is straightforward but the developer needs to know it's currently inlined as a variable and conditionally included per-screen.

### 1e. Sub-component line ranges have shifted
Due to recent commits (parsing spinner, error handling, PDF fix, global drop prevention), line numbers have shifted by ~10-15 lines from the blueprint's claimed ranges. The developer should use comment anchors (`{/* Materials Panel */}`, `{/* Practice Mode View */}`, etc.) rather than line numbers to locate boundaries. Actual anchors at time of validation:

| Component | Blueprint Lines | Actual Anchor Line | Actual Comment |
|---|---|---|---|
| MaterialsPanel | 2697-2859 | 2697 | `{/* Materials Panel (includes Add functionality) */}` |
| SkillsPanel | 2860-3048 | 2860 | `{/* Skills Viewer Panel */}` |
| PracticeMode | 3049-3420 | 3049 | `{/* Practice Mode View */}` |
| NotifPanel | 3422-3498 | 3422 | `{/* Notification Side Panel */}` — but starts at 3425 |
| ChunkPicker | 3499-3628 | 3499 | Inside study screen, follows NotifPanel |
| ModePicker | 3629-4003 | 3629 | Follows ChunkPicker |
| MessageList | 4004-4093 | 4004 | Follows ModePicker |
| AssignmentPanel | 4094-4201 | 4094 | `{/* Assignment Panel */}` |
| InputBar | 4202-4319 | 4202 | `{/* Input Bar */}` |
| SessionSummary | 4320-4413 | 4320 | `{/* Session Summary Overlay */}` |

Lines are close but not exact. Use anchors.

---

## 2. Architectural Concerns

### 2a. ManageScreen is mischaracterized
The blueprint estimates ManageScreen at ~55 lines and lists minimal state. In reality, the manage screen (line 1853-1907) navigates back to "study" not "home", contains a full material list with extraction controls, and renders the globalLock overlay. More critically, it shares the **exact same material management UI** as MaterialsScreen — files, drag, parsing, onDrop, addMats, removeMat, classify, etc. are all used.

**Recommendation:** Either merge ManageScreen into MaterialsScreen (they're nearly identical in state needs), or acknowledge ManageScreen needs the same ~25 state/handler dependencies as MaterialsScreen. The 55-line estimate should be ~200+.

### 2b. Rendering order matters for extraction
The current if-return chain has a strict priority order:
```
asyncError → !ready → showSettings → home → profile → upload → manage → materials → skills → notifs → study → globalLock fallback → null
```

`showSettings` short-circuits before any screen. `asyncError` and `!ready` short-circuit before settings. The ScreenRouter in the new App.jsx must preserve this exact ordering. If settings becomes a modal overlay instead of a full-screen takeover, the behavior changes — settings currently _blocks_ all screen rendering and interaction.

**Recommendation:** Document this priority chain explicitly in the blueprint. The developer should implement ScreenRouter as a direct translation of this if-return chain, not as a switch/case or route table.

---

## 3. Context Design Validation

### Single context: CONFIRMED CORRECT
Verified the mutual exclusivity of screens — only one `if (screen === "...")` block renders at a time. Re-render cost of a single context is zero since unmounted screens don't exist in the tree. The decision is sound.

### Handlers in context: CONFIRMED CORRECT
Verified interdependency example: `sendMessage` (line 885) reads `focusContext`, `cachedSessionCtx`, `sessionSkillLog`, `msgs`, `active`, `sessionMode`, `practiceMode`, `asgnWork`, `booting`, `input`, `codeMode` and writes to `msgs`, `busy`, `status`, `notifs`, `asgnWork`, `practiceMode`, `sessionSkillLog`. This confirms handlers cannot live in screen files.

### Theme/lib direct imports: CONFIRMED CORRECT
`T`, `CSS`, `renderMd`, `CLS` are pure constants/functions with no state. Direct import by screens is the right call — routing them through context would add unnecessary indirection.

---

## 4. Missing from Blueprint

### 4a. `extractionCancelledRef` not listed
Ref declared at line 231, used in globalLock overlay cancel button (line 1186) and extraction loops. Must be in context.

### 4b. `showManage` and `showNotifs` use private setters
Lines 204 and 210 use `_setShowManage` and `_setShowNotifs` — these are state variables with underscore-prefixed setters, suggesting they're only set internally. The developer should check if any handler exposes them or if they're toggled inline in JSX.

### 4c. `CIP_DOMAINS` used in ProfileScreen
Line 1376 references `CIP_DOMAINS` directly. The blueprint says it stays in App.jsx but ProfileScreen needs it. Either export it from App.jsx (awkward) or move it to a constants file during Phase 1.

### 4d. Two utility functions not listed
- `filterDuplicates` (line 404) — used by `onDrop` and `onSelect`
- `timeAgo` (line 313) — used in MessageList

Both belong in context.

---

## 5. Amended Estimates

| File | Blueprint Est. | Validated Est. | Notes |
|---|---|---|---|
| App.jsx | ~150 | ~160 | ErrorBoundary (154 lines) + router + wrapper |
| StudyContext.jsx | ~500 | ~650-700 | 51 useState + 9 refs + 11 effects + 14 handlers + 6 utilities. 500 is too tight. |
| ManageScreen.jsx | ~55 | ~200 | Full material management, not a simple nav |
| MaterialsScreen.jsx | ~540 | ~540 | Accurate |
| StudyScreen.jsx | ~250 | ~250 | Layout only, accurate |

All other screen/component estimates appear reasonable.

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** Architecture validation
**Status:** Complete — APPROVED with amendments

### Flags for Developer
1. Use comment anchors, not line numbers, to locate sub-component boundaries
2. StudyContext.jsx will be 650-700 lines, not 500 — plan accordingly
3. ManageScreen needs full material management state — do not underestimate
4. Preserve the if-return priority chain exactly in ScreenRouter
5. Move `CIP_DOMAINS` to a constants file in Phase 1 — ProfileScreen needs it
6. Include `filterDuplicates`, `timeAgo`, `extractionCancelledRef` in context
