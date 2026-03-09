# study — Knowledge Index
**Maintained By:** Study Documentation Analyst
**Last Updated:** 2026-03-08

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
| `cip-2020-taxonomy-2026-03-08.md` | 2026-03-08 | Educational Research Analyst | Complete CIP 2020 4-digit taxonomy from NCES — 416 entries across 42 academic domains. Structured JSON with code, name, domain, domainName, aliases (2-5 student-oriented aliases per entry, ~1,429 total). Series 60-61 excluded per blueprint. |

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
| `assignment-table-migration-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Assignment scheduler Phase 1 — migration 003 architecture. 3 new tables (assignments, assignment_questions, assignment_question_skills), 8 indexes, blob migration strategy. |
| `syllabus-parser-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Assignment scheduler Phase 2 — syllabus parsing pipeline architecture. Haiku LLM extraction, deterministic validation, composite confidence scoring, 4 DB write targets. |
| `schedule-ui-data-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Assignment scheduler Phase 4 — schedule UI data architecture. Temporal sections, component-local data loading, FSRS readiness computation, HomeScreen info bars. |
| `deadline-intelligence-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Assignment scheduler Phase 5 — deadline intelligence architecture. `buildDeadlineContext()` spec, FSRS priority boost (±10% band), exam auto-scope, nudge computation, insertion points. |
| `cip-taxonomy-seeding-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | CIP taxonomy seeding blueprint — pre-seed `parent_skills`/`parent_skill_aliases` with CIP 2020 4-digit taxonomy, constrain extraction prompt, update `findOrCreateByCip`. 6 components specified. |
| `cip-taxonomy-validation-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | CIP taxonomy validation — data structure verification, alias collision analysis (22 found, 4 critical), prompt token budget (~4,300 tokens), seeder performance, bundle size impact. APPROVED WITH AMENDMENTS A1 + A2. |

## Development

| File | Date | Author | Summary |
|---|---|---|---|
| `phase1-context-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Decomposition Phase 1: StudyContext.jsx (929 lines) + App.jsx thin shell (147 lines) + ScreenRouter.jsx (3,375 lines) |
| `phase2-screen-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Decomposition Phase 2a: Extracted HomeScreen, UploadScreen, ManageScreen, NotifsScreen + ErrorDisplay, GlobalLockOverlay, SettingsModal |
| `phase2b-screen-extraction-2026-03-06.md` | 2026-03-06 | Study Developer | Decomposition Phase 2b: Extracted ProfileScreen, MaterialsScreen, SkillsScreen. ScreenRouter reduced from 2,854 to 1,860 lines |
| `phase4-study-decomposition-2026-03-06.md` | 2026-03-06 | Study Developer | Decomposition Phase 4: Study screen decomposed into 10 sub-components + layout shell. ScreenRouter reduced from 1,860 to 62 lines. |
| `stability-hardening-2026-03-06.md` | 2026-03-06 | Study Developer | Stability hardening dev log — S1–S5 fixes applied to StudyContext.jsx and main.jsx. No features, no schema changes. |
| `stability-hardening-build-verification-2026-03-06.md` | 2026-03-06 | Release Build Agent | Release build verification — `npx tauri build` passes, Study.app + .dmg produced, binary boots without white screen. |
| `phase1-assignment-migration-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 1: Migration 003 (3 tables, 8 indexes), Assignments DB module (13 methods), blob migration, `decomposeAssignments` rewrite, V1 dead code removal. |
| `phase1-assignments-db-module-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 1 supplement: Detailed Assignments DB module implementation — 13 CRUD methods, `normalizeAssignmentTitle`, `resolveSkillId`, `loadAssignmentsCompat`. |
| `phase2-syllabus-parser-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 2: `syllabusParser.js` (322 lines), Haiku LLM extraction, `validateSchedule` composite confidence, upload auto-trigger, exam scope enrichment. |
| `phase3-due-dates-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 3: `formatDueDate`, `getUrgencyLevel`, urgency colors, native date picker, soonest-first sort, overdue card treatment. |
| `phase4-schedule-ui-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 4: ScheduleScreen.jsx (289 lines), HomeScreen info bars, ScreenRouter schedule route. Temporal sections, expandable cards, FSRS readiness. |
| `phase5-deadline-intelligence-2026-03-08.md` | 2026-03-08 | Study Developer | Assignment scheduler Phase 5: Nudge banner (+255 lines ModePicker), `buildDeadlineContext()` (+101 lines study.js), skill priority boost + exam auto-scope (+107 lines StudyContext). FSRS untouched. |
| `cip-taxonomy-implementation-2026-03-08.md` | 2026-03-08 | Study Developer | CIP taxonomy seeding: `cipData.js` (420 lines, 85 KB), `cipSeeder.js` (54 lines), `findOrCreateByCip` update (+10 lines), extraction prompt update (+6 lines), StudyContext seed call (+6 lines), App.jsx re-export (-17/+1 lines). Build +14.4 KB gzip. |

## QA

| File | Date | Author | Summary |
|---|---|---|---|
| `phase4-security-testing-2026-03-06.md` | 2026-03-06 | Study Security & Testing Analyst | Decomposition Phase 4 regression testing — PASS. Session state persistence, global lock, error boundaries, stale state audit, FSRS unchanged. |
| `stability-hardening-testing-2026-03-06.md` | 2026-03-06 | Study Security & Testing Analyst | Stability hardening QA — all 5 fixes (S1–S5) verified via static analysis. PASS across the board. |
| `phase1-assignment-migration-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Assignment scheduler Phase 1 QA — migration integrity, Assignments DB module, blob migration, field mapping. PASS, no critical findings. |
| `phase2-syllabus-parsing-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Assignment scheduler Phase 2 QA — syllabus parsing failure modes, validation logic, confidence scoring, DB writes. PASS, 6 minor items. |
| `phase3-due-date-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Assignment scheduler Phase 3 QA — date formatting, urgency computation, sort order, date picker persistence. PASS, 3 minor items. |
| `phase4-schedule-ui-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Assignment scheduler Phase 4 QA — temporal sections, data accuracy, navigation, exam readiness. PASS, 4 minor items. |
| `phase5-deadline-intelligence-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Assignment scheduler Phase 5 QA — 23 scenarios: nudge accuracy, AI context, skill prioritization, exam auto-scope, FSRS integrity. PASS, 4 minor items. |
| `cip-taxonomy-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | CIP taxonomy seeding QA — 6 test categories (fresh DB, existing data, extraction integration, ProfileScreen, CIP_DOMAINS imports, startup performance), SQL injection analysis, write serialization, FK integrity. PASS, 3 minor items (M1–M3). |

## Design

| File | Date | Author | Summary |
|---|---|---|---|
| `assignment-due-date-ux-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 3 — due date UX design. Date picker interaction, urgency color system, relative/absolute format, overdue card treatment. |
| `schedule-ui-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 4 — schedule UI + HomeScreen info bar design. Temporal sections, expandable cards, info bar signals, exam readiness. 4 CEO escalations (all resolved with defaults). |
| `deadline-intelligence-ux-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 5 — deadline intelligence UX design. Nudge banner, skill picker badges, mode auto-suggestion. 1 CEO escalation (E1: subtle treatment — resolved). |

## Design — Validation

| File | Date | Author | Summary |
|---|---|---|---|
| `phase4-study-screen-decomposition-2026-03-06.md` | 2026-03-06 | Study UX Validator | Decomposition Phase 4 UX validation — PASS. All screen transitions, 5-state material cards, practice mode, assignment sidebar, session summary verified identical. |
| `phase3-due-date-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 3 UX validation — APPROVED. Sort order and urgency colors rated strong. 2 non-blocking recommendations (R1 discoverability, R2 threshold alignment). |
| `phase4-schedule-ui-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 4 UX validation — APPROVED. Temporal sections, info bars, exam drill-down. 2 non-blocking recommendations (R1 schedule entry without urgency, R2 readiness threshold). |
| `phase5-deadline-intelligence-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 5 UX validation — APPROVED. Nudge banner helpful not annoying, skill badges non-distracting, exam auto-scope trustworthy, learning science risk SAFE. 2 non-blocking recommendations. |

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
