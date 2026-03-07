# study — Knowledge Index
**Maintained By:** Study Documentation Analyst
**Last Updated:** 2026-03-06

---

## Folder Structure

```
knowledge/
├── research/           Educational Research Analyst
│   └── ux/             Study UX Research Analyst
├── architecture/       Study Systems Analyst
├── development/        Study Developer
├── qa/                 Study Security & Testing Analyst
├── design/             Study UX Designer
│   └── validation/     Study UX Validator
├── product/            Study Product Analyst
├── data/               Study Data Analyst
├── documentation/      Study Documentation Analyst
├── flags/              Any agent (consultations + halt flags)
├── decisions/          CEO (agents contribute drafts)
└── KNOWLEDGE_INDEX.md  This file
```

---

## Research

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Research — UX

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Architecture

| File | Date | Author | Summary |
|---|---|---|---|
| `app-jsx-decomposition-2026-03-06.md` | 2026-03-06 | Planner / Study Systems Analyst | Architecture blueprint for App.jsx decomposition — context design, file structure, state-to-screen dependency map, chat sub-component boundaries |
| `decomposition-validation-2026-03-06.md` | 2026-03-06 | Study Systems Analyst | Validation of blueprint — approved with amendments (hook count corrections, ManageScreen underestimate, rendering order concern, missing state vars) |
| `stability-hardening-2026-03-06.md` | 2026-03-06 | Study Systems Analyst | Stability hardening blueprint — 5 issues (S1–S5) cataloged with fix specs. Targets white-screen crashes, data-loss race conditions, duplicate error handlers. |

## Development

| File | Date | Author | Summary |
|---|---|---|---|
| `phase1-context-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Phase 1: StudyContext.jsx (929 lines) + App.jsx thin shell (147 lines) + ScreenRouter.jsx (3,375 lines) |
| `phase2-screen-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Phase 2a: Extracted HomeScreen, UploadScreen, ManageScreen, NotifsScreen + ErrorDisplay, GlobalLockOverlay, SettingsModal |
| `phase2b-screen-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Phase 2b: Extracted ProfileScreen, MaterialsScreen, SkillsScreen. ScreenRouter reduced from 2,854 to 1,860 lines |
| `phase4-study-decomposition-2026-03-06.md` | 2026-03-06 | Study Developer | Phase 4: Study screen decomposed into 10 sub-components + layout shell. ScreenRouter reduced from 1,860 to 62 lines. |
| `stability-hardening-2026-03-06.md` | 2026-03-06 | Study Developer | Stability hardening dev log — S1–S5 fixes applied to StudyContext.jsx and main.jsx. No features, no schema changes. |
| `stability-hardening-build-verification-2026-03-06.md` | 2026-03-06 | Release Build Agent | Release build verification — `npx tauri build` passes, Study.app + .dmg produced, binary boots without white screen. |

## QA

| File | Date | Author | Summary |
|---|---|---|---|
| `phase4-security-testing-2026-03-06.md` | 2026-03-06 | Study Security & Testing Analyst | Phase 4 regression testing — PASS. Session state persistence, global lock, error boundaries, stale state audit, FSRS unchanged. Confirmed pre-existing bug S1. |
| `stability-hardening-testing-2026-03-06.md` | 2026-03-06 | Study Security & Testing Analyst | Stability hardening QA — all 5 fixes (S1–S5) verified via static analysis. PASS across the board. Includes manual runtime test recommendations. |

## Design

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Design — Validation

| File | Date | Author | Summary |
|---|---|---|---|
| `phase4-study-screen-decomposition-2026-03-06.md` | 2026-03-06 | Study UX Validator | Phase 4 UX validation — PASS. All screen transitions, 5-state material cards, practice mode, assignment sidebar, session summary verified identical. 1 pre-existing bug found (S1). 6 latent import bugs fixed. |

## Product

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Data

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Documentation

| File | Date | Author | Summary |
|---|---|---|---|
| *(none yet)* | — | — | — |

## Flags

| File | Date | From | To | Status |
|---|---|---|---|---|
| *(none yet)* | — | — | — | — |

## Decisions

| File | Date | Decision | Made By |
|---|---|---|---|
| *(none yet)* | — | — | — |
