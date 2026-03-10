# study — Knowledge Index
**Maintained By:** Study Documentation Analyst
**Last Updated:** 2026-03-10 (post Character Sheet Profile Phases 1-3)

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
| `extraction-retry-rework-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Extraction retry rework blueprint — 5 confirmed bugs (B1–B5), 3-phase fix plan (DB layer, extraction pipeline, UI). `markFailed`/`markFailedBatch`, `getMaterialState` rework, `extractChaptersOnly`, `runExtractionV2` rework, MaterialsScreen state updates. |
| `extraction-retry-validation-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Extraction retry validation — blueprint review with 6 amendments (A2–A7). A2: `getAlreadyExtractedChapters` for first-extraction retry. A6: `isFirstChapter=false` always for retry. A7: replace all `updateStatusBatch('error')` with `markFailedBatch`. APPROVED WITH AMENDMENTS. |
| `concept-link-generation-2026-03-10.md` | 2026-03-10 | Study Systems Analyst | Concept link generation blueprint — `ConceptLinks` DB module (7 methods), `conceptLinks.js` generator, extraction hook via pre/post snapshot diff. Per-parent Haiku comparison, confidence filtering, canonical ID ordering. |
| `concept-link-ai-context-2026-03-10.md` | 2026-03-10 | Study Systems Analyst | Concept link AI context + mastery transfer architecture — `buildCrossSkillContext()` spec, 5 insertion points, mastery transfer formula (threshold > 0.7, stability 1.4x, difficulty -1.0). |
| `minhash-near-dedup-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | MinHash LSH near-dedup architecture — signature generation, LSH banding, approximate Jaccard similarity for chunk-level dedup. |
| `v1-v2-unification-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | V1→V2 data unification architecture — batch migration strategy (A through F), contract replacement pattern, dependency ordering. |
| `profile-removal-audit-2026-03-08.md` | 2026-03-08 | Study Systems Analyst | Profile blob removal audit — traces all v1 profile read/write paths, confirms safe deletion. |
| `character-sheet-profile-2026-03-10.md` | 2026-03-10 | Study Systems Analyst | Character sheet profile architecture — hero view layout (XP bar, top-3 parents, domain grouping), domain drill-down (parent cards, sub-skill expansion, category headers), data flow from existing FSRS mastery. |
| `parent-level-ai-context-2026-03-10.md` | 2026-03-10 | Study Systems Analyst | Parent-level AI context blueprint — `buildDomainProficiency()` helper spec, 6 integration points in buildContext/buildFocusedContext, cross-course aggregation, top-8 cap, ~80-120 token budget, performance analysis. |

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
| `extraction-retry-rework-2026-03-08.md` | 2026-03-08 | Study Developer | Extraction retry rework dev log — 3 phases (A: DB + state, B: pipeline, C: UI). 5 files modified, +257 lines. `markFailed`/`markFailedBatch` (db.js), `getMaterialState` rework (StudyContext), `enrichFromMaterial` fixes + `extractChaptersOnly` (extraction.js), `runExtractionV2` rework + `getAlreadyExtractedChapters` (skills.js), MaterialsScreen badges/percentage/messaging. |
| `migration-004-wiring-2026-03-08.md` | 2026-03-08 | Study Developer | Migration 004 — wired v1→v2 skill migration (`migrateV1ToV2`) into app startup in StudyContext.jsx init effect. 1 file modified, +12 lines. |
| `v2-module-methods-2026-03-08.md` | 2026-03-08 | Study Developer | Batch B — v2 module foundation. Added 5 new v2 module methods (`Chunks.saveContent`, `Chunks.getContent`, `Chunks.delete`, `Sessions.getOrCreateCompat`, `Messages.appendBatch`) and 2 utility functions (`loadCoursesNested`, `saveCoursesNested`) to db.js as v2 replacements for contract phase. |
| `v2-contract-c2-savedoc-2026-03-08.md` | 2026-03-08 | Study Developer | Batch B/C — replaced all `DB.saveDoc`/`DB.getDoc` calls in skills.js with `Chunks.saveContent`/`Chunks.getContent` v2 module equivalents. Removed `DB` import from skills.js. |
| `batch-c-course-data-2026-03-08.md` | 2026-03-08 | Study Developer | Batch C — course data path migration. Replaced all v1 compat course CRUD calls across 6 files (StudyContext, ManageScreen, MaterialsScreen, UploadScreen, ChunkPicker, MaterialsPanel) with v2 modules (`loadCoursesNested`, `saveCoursesNested`, `Courses.delete`, `Chunks.saveContent`/`getContent`/`delete`). 4 v1 methods eliminated. |
| `batch-d-sessions-2026-03-08.md` | 2026-03-08 | Study Developer | Batch D — session data path migration. Replaced v1 chat/journal calls in StudyContext.jsx with v2 modules (`Sessions`, `Messages`, `JournalEntries`). Switched from bulk-rewrite (`saveChat`) to incremental append (`Messages.appendBatch`), and from array journal save to single-entry `JournalEntries.create`. `DB.getChunkSkills` replaced with `ChunkSkillBindings.getByChunk`. |
| `batch-e-mastery-practice-2026-03-08.md` | 2026-03-08 | Study Developer | Batch E — mastery & practice replacement. Removed v1 profile blob dual-write from `applySkillUpdates`. Added `last_rating` column (migration 004). Replaced `DB.getProfile`/`DB.saveProfile` (4 sites) with `s.mastery?.lastRating` and `Sessions.countByCourse`. Replaced `DB.getPractice`/`DB.savePractice` (8 sites) with `PracticeSets.get`/`PracticeSets.upsert` across ModePicker, PracticeMode, ProfileScreen. 13 call sites total. |
| `batch-f-cleanup-2026-03-08.md` | 2026-03-08 | Study Developer | Batch F — V1 compat cleanup. F.1: deleted `export const DB = {...}` (~285 lines from db.js), updated App.jsx/ErrorDisplay.jsx to import `resetAll` directly, inlined v1 readers in migrate.js. F.2: added `cleanupV1SettingsKeys`. F.3: deleted migrate.js (~410 lines), removed migration init blocks from StudyContext, removed V1→V2 banner from SkillsScreen. ~740 lines removed, bundle -7.6 kB. |
| `phase2-concept-links-2026-03-10.md` | 2026-03-10 | Study Developer | Concept Links Phase 1 — `ConceptLinks` DB module (db.js, ~70 lines, 7 methods), `conceptLinks.js` generator (~132 lines), extraction hook in skills.js (~20 lines). Phase 2 — `buildCrossSkillContext()` in study.js (~80 lines, 5 call sites), mastery transfer in `applySkillUpdates` (~28 lines). Phase 3 — ProfileScreen CONNECTIONS section (~70 lines), lazy loading, cross-course count, click-to-navigate. |
| `phase1-character-sheet-2026-03-10.md` | 2026-03-10 | Study Developer | Character Sheet Phase 1 — ProfileScreen hero view + domain drill-down. Refactored from 409 → 507 lines. XP bar, top-3 parents, domain grouping, expandable parent cards, sub-skill detail panels. |
| `phase2-domain-drilldown-2026-03-10.md` | 2026-03-10 | Study Developer | Character Sheet Phase 2 — domain drill-down enhancements. Sort toggle (Level / Weakest first), course attribution, empty domain guard. +12 lines. 2 QA fixes (domainSort reset, cross-domain navigation). |
| `phase3-parent-ai-context-2026-03-10.md` | 2026-03-10 | Study Developer | Character Sheet Phase 3 — `buildDomainProficiency()` helper (~30 lines) + 6 insertion points in study.js. `ParentSkills` import added. Cross-course aggregation, top-8 cap, ~10-20ms overhead. |

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
| `extraction-retry-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Extraction retry rework QA — 6 test scenarios (fresh creation, partial failure, terminal failure, enrichment path, state accuracy, regression). A7 compliance verified. FSRS/practice mode unaffected. PASS, 5 findings (F1–F5, 0 critical). |
| `migration-004-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Migration 004 QA — 8 test scenarios (migration runs, FSRS conversion, idempotency, no-op courses, chunk bindings, parent skill resolution, app boot, edge cases). Correctness confirmed for v1→v2 skill/mastery/prerequisite/binding migration. PASS, 0 critical, 2 low, 1 informational. |
| `batch-c-course-data-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Batch C QA — static trace of course CRUD operations across all modified call sites. Verified `loadCoursesNested`/`saveCoursesNested` equivalence, chunk content save/load, course deletion, field mapping. PASS, 1 low, 1 informational. |
| `batch-d-sessions-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Batch D QA — static trace of chat and journal persistence across modified call sites. Verified incremental message append, journal single-entry insert, session lifecycle, ChunkSkillBindings substitution. PASS, 1 medium (journal intent label), 1 low, 1 informational. |
| `batch-e-mastery-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Batch E QA — heavy test scope: FSRS integrity (8 fields mathematically identical), AI prompt context (6 lastRating + 2 session count sites), practice mode full flow, profile screen, skill updates from chat, deadline intelligence regression, edge cases. PASS, 0 critical, 1 low (session count semantic change), 2 informational. |
| `batch-f-final-testing-2026-03-08.md` | 2026-03-08 | Study Security & Testing Analyst | Batch F final QA — clean startup (no v1 calls in init), no orphaned data writers (zero `v1_*` key writers), no compat references (grep verified), full regression (10 paths: course creation, upload, extraction, study session, practice, profile, schedule, deadline, skills screen, error recovery), release build (86 modules, 1.28s). PASS, 0 critical, 4 informational. |
| `concept-link-generation-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Concept link generation QA — 9 test categories (prompt construction, response parsing, confidence filtering, canonical ordering, batch write, skip conditions, error isolation, extraction hook, build). PASS, 0 critical. |
| `concept-link-ai-context-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Concept link AI context QA — 9 test categories (data loading, deduplication, mastery resolution, formatting, char budget, injection points, empty/error cases, effectiveStrength regression, build). PASS, 1 bug fixed (snake_case mastery fields). |
| `mastery-transfer-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Mastery transfer QA — 11 test categories (fires once, FSRS integrity, no transfer without link, threshold, cross-course, same-course, grade gate, multiple links, null timestamps, stability modifier interaction, build). PASS, 1 bug fixed (threshold 0.5→0.7). |
| `concept-link-profile-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Concept link profile display QA — 9 test categories (correct display, no empty sections, cross-course data, lazy loading, performance <200ms, cross-course count, navigation, effect dependencies, build). PASS, 0 bugs. |
| `minhash-near-dedup-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | MinHash LSH near-dedup QA — signature generation, LSH banding, integration with extraction pipeline. PASS. |
| `character-sheet-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Character Sheet Phase 1 QA — hero view rendering, domain grouping, drill-down navigation, sub-skill expansion, data accuracy. PASS. |
| `domain-drilldown-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Character Sheet Phase 2 QA — sort toggle, course attribution, empty domain guard, cross-domain navigation. 12 tests, all PASS. 2 bugs found and fixed (domainSort reset, cross-domain concept link click). |
| `phase3-parent-ai-context-testing-2026-03-10.md` | 2026-03-10 | Study Security & Testing Analyst | Character Sheet Phase 3 QA — buildDomainProficiency helper, early return, cross-course aggregation, level formula, readiness calculation, output format, all 6 insertion points, performance. 13 tests, all PASS. |

## Design

| File | Date | Author | Summary |
|---|---|---|---|
| `assignment-due-date-ux-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 3 — due date UX design. Date picker interaction, urgency color system, relative/absolute format, overdue card treatment. |
| `schedule-ui-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 4 — schedule UI + HomeScreen info bar design. Temporal sections, expandable cards, info bar signals, exam readiness. 4 CEO escalations (all resolved with defaults). |
| `deadline-intelligence-ux-2026-03-08.md` | 2026-03-08 | Study UX Designer | Assignment scheduler Phase 5 — deadline intelligence UX design. Nudge banner, skill picker badges, mode auto-suggestion. 1 CEO escalation (E1: subtle treatment — resolved). |
| `concept-link-profile-2026-03-10.md` | 2026-03-10 | Study UX Designer | Concept link profile display design — CONNECTIONS section placement, compact list visual treatment (Option A), per-row layout, interaction (click-to-navigate), parent card cross-course count. Option B (mini graph) deferred. |
| `near-dedup-ux-2026-03-10.md` | 2026-03-10 | Study UX Designer | MinHash LSH near-dedup UX design — user-facing near-duplicate detection presentation. |
| `character-sheet-profile-2026-03-10.md` | 2026-03-10 | Study UX Designer | Character sheet profile UX design — hero view layout (XP bar, top-3 parents, domain grouping), domain drill-down (sort toggle, course attribution, sub-skill detail). |
| `domain-drilldown-2026-03-10.md` | 2026-03-10 | Study UX Designer | Character Sheet Phase 2 domain drill-down design — sort toggle enhancement, course attribution on parent cards, empty domain guard. 3 enhancements specified. |

## Design — Validation

| File | Date | Author | Summary |
|---|---|---|---|
| `phase4-study-screen-decomposition-2026-03-06.md` | 2026-03-06 | Study UX Validator | Decomposition Phase 4 UX validation — PASS. All screen transitions, 5-state material cards, practice mode, assignment sidebar, session summary verified identical. |
| `phase3-due-date-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 3 UX validation — APPROVED. Sort order and urgency colors rated strong. 2 non-blocking recommendations (R1 discoverability, R2 threshold alignment). |
| `phase4-schedule-ui-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 4 UX validation — APPROVED. Temporal sections, info bars, exam drill-down. 2 non-blocking recommendations (R1 schedule entry without urgency, R2 readiness threshold). |
| `phase5-deadline-intelligence-validation-2026-03-08.md` | 2026-03-08 | Study UX Validator | Assignment scheduler Phase 5 UX validation — APPROVED. Nudge banner helpful not annoying, skill badges non-distracting, exam auto-scope trustworthy, learning science risk SAFE. 2 non-blocking recommendations. |
| `concept-link-profile-validation-2026-03-10.md` | 2026-03-10 | Study UX Validator | Concept link profile display UX validation — 3 areas assessed: meaningfulness (adequate, vague header), overwhelm (acceptable, edge case 10+), discoverability (consistent, no scrollIntoView). No blockers. 3 minor polish items deferred. |
| `near-dedup-ux-validation-2026-03-10.md` | 2026-03-10 | Study UX Validator | MinHash near-dedup UX validation — near-duplicate detection presentation assessment. |
| `character-sheet-validation-2026-03-10.md` | 2026-03-10 | Study UX Validator | Character Sheet Phase 1 UX validation — hero view layout, domain grouping, drill-down navigation. APPROVED. |
| `domain-drilldown-validation-2026-03-10.md` | 2026-03-10 | Study UX Validator | Character Sheet Phase 2 UX validation — drill-down navigation clarity, parent/sub-skill hierarchy, course attribution utility, back button behavior. 4 areas, all Strong/Adequate. No blockers. |

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
