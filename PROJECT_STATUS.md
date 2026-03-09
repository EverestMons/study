# study — Project Status
**Maintained By:** Study Product Analyst
**Last Updated:** 2026-03-08
**Updated By:** Product Analyst (post CIP Taxonomy Seeding)
**Overall Status:** 🟢 Active

---

## Current Sprint / Focus

Closing the gap between the spec (`docs/skill-architecture-redesign.md`) and the working app. Core extraction, practice, and chat flows are live. Session intent system is **complete** (5 modes: assignment, recap, skills, exam prep, explore). Material upload pipeline redesigned — auto-extraction, state-aware cards, and transparent processing replace the old manual activate→extract flow. Chunking pipeline hardened with bundled JSZip, safety limits, and stack-based XML parsing. **PDF support now live** via pdfjs-dist — no Python sidecar needed. **Codebase decomposition complete** — the original 4,416-line god-component has been split across 4 phases into a context provider, screen router, 8 screen components, 3 shared components, and 10 study sub-components (42 source files, ~12,960 LOC). This was a pure refactor with no feature changes. **Stability hardening complete** — 5 fixes (S1–S5) targeting white-screen crashes, data-loss race conditions, and duplicate error handlers. Release build verified, no regressions. **Assignment table migration (003) complete** — assignments now stored in normalized relational tables (3 tables, 8 indexes) instead of JSON blobs. Blob migration runs automatically on app startup. V1 `saveAsgn`/`getAsgn` dead code removed. **Syllabus parsing pipeline complete** — uploading a syllabus auto-extracts weekly schedule, grading breakdown, course metadata, and placeholder assignments via Haiku LLM. Deterministic validation with composite confidence scoring. Graceful degradation on partial data. QA: no critical findings. **Due dates + assignment picker sort (Phase 3) complete** — urgency-aware date display (relative when close, absolute when far), soonest-first sort, native date picker editing, overdue card treatment (red tint + border). UX validated: sort order and urgency colors rated strong; 2 minor discoverability recommendations deferred. **Schedule UI (Phase 4) complete** — ScheduleScreen shows assignments + exams in 5 temporal sections (Past Due, This Week, Next Week, Later, Not Yet Uploaded) with expandable cards, readiness percentages, and skill breakdowns. HomeScreen per-course info bars surface urgency signals (overdue, due this week, exam proximity) with one-click navigation to schedule. Component-local data loading — no StudyContext state added. QA: no critical findings. **Deadline intelligence (Phase 5) complete** — ModePicker nudge banner surfaces the single most urgent deadline (overdue/near-due assignments + exams) with urgency colors, readiness %, and one-click action. AI prompt pipeline includes `buildDeadlineContext()` inserting upcoming deadlines into all focus types. Skill picker sort promotes deadline-relevant skills within a ±10% strength band with urgency badges. Exam auto-scope pre-selects materials matching the nearest exam's covered weeks via fuzzy reading-to-material matching. FSRS algorithm completely untouched — all deadline intelligence is presentation-layer only. QA: PASS (23 scenarios, FSRS integrity confirmed). UXV: APPROVED (learning science risk assessed as SAFE). **Custom DatePicker (Phase 6) complete** — all native `<input type="date">` elements replaced with a dark-themed calendar popover (`DatePicker.jsx`) matching the app's design system. Portal-rendered with right-edge alignment, month navigation, today/selected highlights, clear action. `useLayoutEffect` + visibility gate prevents positioning flash. Integrated into ScheduleScreen and ModePicker. QA: PASS (17 test cases including leap year, month boundaries, epoch consistency). Build verified. **CIP Taxonomy Seeding complete** — pre-seeded `parent_skills` and `parent_skill_aliases` tables with the full CIP 2020 4-digit taxonomy (416 entries, ~1,412 aliases across 42 academic domains). Static data compiled from NCES, validated for alias collisions (4 critical fixes applied), bundled in `cipData.js` (85 KB). Idempotent seeder with fast-path optimization (single COUNT query on subsequent startups). Extraction prompt now constrains LLM to pick from canonical CIP list instead of inventing parent skill names. `findOrCreateByCip` upgraded to 3-step resolution (CIP match → alias fallback → custom creation). `CIP_DOMAINS` derived from taxonomy data (42 domains, replacing hardcoded 28). QA: PASS (6 test categories, 0 critical findings, 3 minor items). Build verified (+14.4 KB gzip). Next priorities: cross-skill concept links, migration 004.

---

## Department Status

| Department | Status | Last Activity | Notes |
|---|---|---|---|
| Research | Active | 2026-03-08 | CIP 2020 4-digit taxonomy compiled from NCES — 416 entries, 42 domains, 1,429 student-oriented aliases (`knowledge/research/cip-2020-taxonomy-2026-03-08.md`) |
| Systems Architecture | Active | 2026-03-08 | Architecture blueprints for decomposition, stability hardening, assignment table migration, syllabus parser, deadline intelligence, CIP taxonomy seeding (`knowledge/architecture/`) |
| Development | Active | 2026-03-08 | 74 commits. Latest: CIP taxonomy seeding — 2 new files (cipData.js 420 lines, cipSeeder.js 54 lines), 4 modified files (db.js, extraction.js, StudyContext.jsx, App.jsx). ~490 lines added, ~17 removed. |
| Security & Testing | Active | 2026-03-08 | CIP taxonomy seeding QA report — 6 test categories (fresh DB, existing data, extraction integration, ProfileScreen, CIP_DOMAINS imports, startup performance), security analysis. PASS, 3 minor items (`knowledge/qa/cip-taxonomy-testing-2026-03-08.md`). |
| Design & Experience | Active | 2026-03-08 | Phase 5 UX design (`knowledge/design/deadline-intelligence-ux-2026-03-08.md`) + UX validation report. APPROVED, 2 non-blocking recommendations (R1 FSRS review count badge, R2 formatNudgeDate dedup). |
| Data & Analytics | Idle | — | No usage data to analyze yet |
| Documentation | Idle | — | README is blank; 26 design docs exist in docs/ folder but no user-facing documentation |
| Engineering & Physical Design | N/A | — | No physical components |

---

## What Is Working (Implemented & Live)

| Feature | Status | Notes |
|---|---|---|
| Material upload + auto-extraction | ✅ Live | PDF, DOCX, EPUB, PPTX, TXT; auto-classification; auto-extract on upload; state-aware cards |
| Material processing transparency | ✅ Live | 5-state cards (reading/analyzing/extracting/ready/error), trust signals, retry/remove for stuck states |
| v2 skill extraction pipeline | ✅ Live | Weighted mastery, context tags, source tracking, concept keys, Bloom's taxonomy |
| Chunking pipeline hardening | ✅ Live | Bundled JSZip (no CDN), zip bomb defense, stack-based XML, sentence/char split fallbacks |
| Content-hash dedup | ✅ Live | Prevents re-extraction of identical chunks |
| Assignment decomposition | ✅ Live | Auto-decomposes; skill ID resolution fixed 2026-03-04 |
| Practice mode | ✅ Live | FSRS-based, criteria tracking, confidence labels, retrievability |
| Chat / tutoring UI | ✅ Live | Timestamps, session summaries, smarter context, code input mode, break reminders, SVG send button |
| Session intent system | ✅ Live | 5 modes: assignment, recap, skills, exam prep, explore. Each with picker UI + focused context + weighted mastery. |
| Profile view | ✅ Live | Domain readiness, activity indicator, concept key, inline progress bars |
| SQLite-only storage | ✅ Live | localStorage fully removed; WAL mode; transaction serialization |
| DOCX export | ✅ Live | Assignment submission export |
| Reset Skill Data (dev tool) | ✅ Live | Settings panel |
| Error safety net | ✅ Live | ErrorBoundary in App.jsx + async error listeners in StudyContext + 3s mount-failure fallback in index.html. Stability-hardened: StrictMode cancellation guard, coursesLoaded ref, auto-save gated on !asyncError. |
| PDF support | ✅ Live | pdfjs-dist (lazy-loaded), heading detection via font size analysis, page-based fallback, metadata/outline extraction |
| File drag-and-drop | ✅ Live | Tauri native drop disabled so WebView receives drag events |
| DB Migrations 001 + 002 + 003 | ✅ Applied | v2 schema + skill extraction v2 + assignment tables (3 tables, 8 indexes, full CASCADE) |
| Assignment table migration | ✅ Live | Assignments stored in normalized tables. Blob migration on startup. `saveAsgn`/`getAsgn` V1 compat removed. |
| Syllabus parsing pipeline | ✅ Live | Auto-triggered on syllabus upload. Haiku LLM extracts schedule, grading, metadata, exam scope. Deterministic validation (composite confidence). Populates `course_schedule`, `course_assessments`, course metadata, placeholder assignments. |
| Placeholder assignment system | ✅ Live | Syllabus-sourced assignments created with `source='syllabus'`, `material_id=NULL`. Due dates from schedule weeks. Idempotent via `findPlaceholderMatch`. Matched when real assignment materials are uploaded via `decomposeAssignments`. |
| Due date editing | ✅ Live | Custom dark-themed DatePicker on assignment cards (click date text → calendar popover). Portal-rendered, right-edge aligned, month navigation, today/selected highlights, clear action. `useLayoutEffect` + visibility gate prevents positioning flash. Optimistic UI update + SQLite persist via `Assignments.updateDueDate`. End-of-day epoch (`T23:59:59`) prevents premature overdue. Clear date sets NULL. |
| Assignment picker sort + urgency | ✅ Live | Soonest-first sort (nulls last, alphabetical tiebreak). Urgency colors: overdue/urgent (<48h) red, soon (<7d) amber, normal (>7d) blue, no date muted gray. Overdue cards get red-tinted background + border. Smart hybrid date format (relative when close, absolute when far). |
| HomeScreen info bars | ✅ Live | Per-course urgency signals below materials line: overdue count (red), due this week (amber), exam proximity (amber <7d, blue >7d). Click navigates to schedule screen. Zero-signal suppression (no bar if nothing to show). |
| Schedule screen | ✅ Live | ScheduleScreen.jsx — temporal sections (Past Due / This Week / Next Week / Later / Not Yet Uploaded), expandable cards for assignments + exams, FSRS-based readiness %, weakest-skills drill-down for exams (top 10 + expand), placeholder cards with dashed borders. Component-local data loading (no StudyContext state). |
| Deadline nudge banner | ✅ Live | ModePicker.jsx — surfaces single most urgent deadline (overdue/near-due assignments ≤3d, exams ≤7d) with urgency colors (red/amber), readiness %, one-click "Work on it" / "Start prep" action. Dismissible per session. Spaced repetition fallback highlights Skills mode when FSRS reviews are due. |
| Deadline-aware AI context | ✅ Live | `buildDeadlineContext()` in study.js — inserts nearest 3 upcoming deadlines with readiness % and weakest 3 skills into all focus types (assignment, skill, recap, exam). Explore focus intentionally excluded. |
| Skill picker priority boost | ✅ Live | Deadline-relevant skills promoted within ±10% strength band in skill picker sort. Urgency badges ("Needed for HW 5 (2d)") color-coded amber (<7d) / blue (7-14d). Display-only — FSRS algorithm completely untouched. |
| Exam auto-scope | ✅ Live | Nearest future exam's `coversWeeks` matched against schedule readings, fuzzy-matched to material names. Pre-selects matching materials in exam picker. Fully deselectable. Silent fallback to empty selection on failure. |
| Mode auto-suggestion | ✅ Live | Suggested study mode button gets subtle accent tint based on deadline analysis. No label, no "Recommended" text — purely visual hint. All modes remain equally accessible. |
| CIP taxonomy seeding | ✅ Live | 416 CIP 2020 4-digit entries + ~1,412 aliases pre-seeded into `parent_skills` and `parent_skill_aliases` at startup. Idempotent seeder with fast-path (COUNT ≥ 400 → skip, <10ms on subsequent runs). First run ~4-8s (one-time). Static data from NCES, bundled in `cipData.js` (85 KB). |
| CIP-constrained extraction | ✅ Live | First-chapter extraction prompt includes full CIP list (~4,300 tokens). LLM picks from canonical list instead of inventing names. Fallback: `cipCode: "custom"` for unmatched subjects. `findOrCreateByCip` 3-step resolution: CIP match → alias/name fallback → create custom (`is_custom=1`). Display name differences become aliases automatically. |
| CIP domain grouping (42 domains) | ✅ Live | `CIP_DOMAINS` derived from `CIP_TAXONOMY` data (42 domains, up from hardcoded 28). ProfileScreen domain grouping uses derived constant via re-export chain (`cipData.js → App.jsx → ProfileScreen.jsx`). |

---

## What Is Specified But Not Yet Built

| Feature | Spec Location | Priority | Notes |
|---|---|---|---|
| ~~Full session intent system~~ | ~~`docs/skill-architecture-redesign.md` §4~~ | ~~Done~~ | ✅ Implemented — 5 modes with picker UIs. Moved to "What Is Working." |
| ~~Parent skill / CIP taxonomy seeding~~ | ~~`knowledge/architecture/cip-taxonomy-seeding-2026-03-08.md`~~ | ~~Done~~ | ✅ Implemented — 416 CIP entries + ~1,412 aliases seeded at startup, extraction prompt constrained to canonical list, `findOrCreateByCip` 3-step resolution, `CIP_DOMAINS` derived (42 domains). Moved to "What Is Working." |
| ~~PDF support~~ | ~~`docs/study-tauri-architecture.md`~~ | ~~Done~~ | ✅ Implemented via pdfjs-dist — no sidecar needed. Moved to "What Is Working." |
| Python sidecar (Unstructured) | `docs/study-tauri-architecture.md` | 🟡 Medium | CEO decided: separate install. Deprioritized — PDF now handled client-side. |
| ~~Assignment table migration (003)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Migration 003 applied. Moved to "What Is Working." |
| ~~Syllabus parsing (Phase 2)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Implemented — `syllabusParser.js` + upload auto-trigger. Moved to "What Is Working." |
| ~~Due dates + picker sort (Phase 3)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Implemented — `formatDueDate`, urgency colors, soonest-first sort, native date picker. Moved to "What Is Working." |
| ~~Schedule UI (Phase 4)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Implemented — ScheduleScreen + HomeScreen info bars + ScreenRouter route. Moved to "What Is Working." |
| ~~Deadline intelligence (Phase 5)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Implemented — nudge banner, `buildDeadlineContext()`, skill priority boost, exam auto-scope, mode auto-suggestion. Moved to "What Is Working." |
| Migration 004 — v1 skill data migration | `docs/skill-architecture-redesign.md` | 🟡 Medium | JS-level migration in migrate.js |
| Migration 005 — Cleanup | `docs/skill-architecture-redesign.md` | 🟡 Medium | Drop old tables after confirmed migration |
| Concept links (cross-skill similarity) | `docs/skill-architecture-redesign.md` Q5 | 🟡 Medium | |
| MinHash LSH near-dedup | `docs/skill-architecture-redesign.md` Q4 | 🟡 Medium | |
| Cross-course skill unification | `docs/skill-architecture-redesign.md` §1 | 🟢 Low | |
| Local Whisper transcription | `docs/study-tauri-architecture.md` | 🟢 Low | |
| File system watcher | `docs/study-tauri-architecture.md` | 🟢 Low | |
| OCR support | `docs/study-tauri-architecture.md` | 🟢 Low | |

---

## Tauri Migration Progress
*(Based on checklist in `docs/study-tauri-architecture.md`)*

| Milestone | Status |
|---|---|
| Create Tauri project with React frontend | ✅ Complete |
| Implement SQLite DB module | ✅ Complete |
| Remove localStorage / browser storage | ✅ Complete |
| All screens render correctly | ✅ Complete |
| Bundle Unstructured Python sidecar | 🔲 Not started (CEO decided: separate install) |
| Replace browser parsers with native parsing | 🟡 Partial (mammoth for DOCX; rest browser-based) |
| PDF support | ✅ Complete (pdfjs-dist, client-side) |
| OCR support for scanned documents | 🔲 Not started |
| File system watcher for auto-import | 🔲 Not started |
| Local Whisper transcription | 🔲 Not started |

---

## Skill Architecture Redesign Progress
*(Based on migration sequence in `docs/skill-architecture-redesign.md`)*

| Migration | Status | Notes |
|---|---|---|
| 001 — v2 schema (parent_skills, sub_skills, chunks, sessions, mastery) | ✅ Applied | 001_v2_schema.sql (15,310 bytes) |
| 002 — Skill extraction v2 (concept_key, category, blooms_level, evidence, soft-delete) | ✅ Applied | 002_skill_extraction_v2.sql (6,032 bytes) |
| 003 — Assignment tables (assignments, questions, skill mappings) | ✅ Applied | 003_assignments.sql — 3 tables, 8 indexes. V1 blob migration via migrate.js. |
| 004 — Data migration (v1 skill blobs to v2 tables) | 🔲 Not started | Runs as JS-level migration in migrate.js, not a numbered SQL migration |
| 005 — Cleanup (drop old tables) | 🔲 Not started | |

---

## Recent Development Activity (Last 5 Days)

| Date | Work |
|---|---|
| 2026-03-08 | **CIP Taxonomy Seeding:** Pre-seeded `parent_skills` and `parent_skill_aliases` with full CIP 2020 4-digit taxonomy (416 entries, ~1,412 aliases, 42 domains). `cipData.js` (420 lines, 85 KB) — static NCES data with 4 alias collision fixes (A1). `cipSeeder.js` (54 lines) — idempotent seeder with fast-path optimization (A2). `findOrCreateByCip` upgraded to 3-step resolution (CIP match → alias fallback → custom). Extraction prompt now constrains LLM to canonical CIP list (~4,300 tokens, first chapter only). `CIP_DOMAINS` derived from taxonomy (42 domains, replacing hardcoded 28). 2 new files, 4 modified. +490/-17 lines. QA: PASS (6 categories, 3 minor items). Build verified (+14.4 KB gzip). |
| 2026-03-08 | **Custom DatePicker (Phase 6):** Replaced all native `<input type="date">` elements with `DatePicker.jsx` (186 lines) — dark-themed calendar popover using portal rendering, right-edge anchor alignment, month/year navigation, today ring + selected fill, adjacent-month muted days, clear date action. `useLayoutEffect` + `visibility: hidden` gate eliminates positioning flash. Integrated into ScheduleScreen.jsx (callback ref map + `openPicker` state) and ModePicker.jsx (same pattern). 3 files modified (+246/-31 lines). 1 new file. QA: PASS (17 test cases). Build verified. |
| 2026-03-08 | **Deadline intelligence (Phase 5):** Nudge banner on ModePicker — surfaces single most urgent deadline with urgency colors, readiness %, one-click action. `buildDeadlineContext()` in study.js — inserts nearest 3 deadlines into AI context for all focus types. Skill picker ±10% band priority boost + urgency badges. Exam auto-scope via fuzzy reading-to-material matching. Mode auto-suggestion (subtle accent tint). 3 files modified (+463 lines). No new files. FSRS completely untouched. QA: PASS (23 scenarios). UXV: APPROVED. |
| 2026-03-08 | **Schedule UI (Phase 4):** ScheduleScreen.jsx (289 lines) — 5 temporal sections, expandable cards for assignments + exams, FSRS-based readiness %, weakest-skills drill-down (top 10 + expand). HomeScreen info bars — per-course urgency signals (overdue, due this week, exam proximity) with click-to-schedule navigation. ScreenRouter schedule route. Component-local data loading (SA decided no StudyContext state). 4 CEO defaults approved. QA: PASS, 4 minor items. UXV: APPROVED, 2 non-blocking recommendations. |
| 2026-03-08 | **Due dates + assignment picker sort (Phase 3):** `formatDueDate` smart hybrid formatter (relative ≤14d, absolute >14d) in StudyContext.jsx. `getUrgencyLevel` + `URGENCY_COLORS` in ModePicker.jsx — 4-tier urgency (overdue/urgent/soon/normal) mapped to red/amber/blue. Overdue card treatment (red tint bg + border). Native `<input type="date">` with `showPicker()`, optimistic state update, end-of-day epoch. Soonest-first sort in both `selectMode` code paths. UX design + validation deposited. QA: PASS, 3 minor items. |
| 2026-03-08 | **Syllabus parsing pipeline (Phase 2):** `syllabusParser.js` (322 lines) — Haiku LLM extraction with JSON schema prompt, `validateSchedule` deterministic validation (composite: date 35% + week 35% + grading 30%), `parseSyllabus` pipeline writes to 4 DB targets (schedule, assessments, course metadata, placeholder assignments). Upload auto-trigger wired into both course creation and material add flows in StudyContext.jsx. Exam scope enrichment (`coversWeeks`/`coversTopics`). QA: PASS, 6 minor items. |
| 2026-03-08 | **Assignment table migration (Phase 1):** Migration 003 — 3 new tables (assignments, assignment_questions, assignment_question_skills). Assignments DB module with 13 methods + `normalizeAssignmentTitle` helper + `resolveSkillId` resolver. Blob-to-table migration (`migrateAssignmentBlobs`) wired into app startup. `decomposeAssignments` rewritten to use new tables with `scanForDueDate` regex + placeholder matching. `loadAssignmentsCompat` bridges old shape for consumers. V1 `saveAsgn`/`getAsgn` dead code removed. QA: PASS, no critical findings. |
| 2026-03-06 | **Stability hardening (S1–S5):** Fixed 5 stability issues — enterStudy unprotected await (S1), setReady outside try/catch (S2), StrictMode cancellation guard (S3), duplicate error listeners removed from main.jsx (S4), auto-save coursesLoaded ref guard (S5). No features, no schema changes. Release build verified — binary boots, no white screen. |
| 2026-03-06 | **Codebase decomposition (Phases 1–4):** Split 4,416-line App.jsx into 42 files. Phase 1: StudyContext extraction. Phase 2/2b: 8 screen components + 3 shared components. Phase 4: Study screen into 10 sub-components + layout shell, ScreenRouter reduced from 1,860 to 62 lines. Pure refactor, no feature changes. Bug S1 (`setSessionElapsed` missing from context) found and fixed. 6 latent import bugs from Phase 1 proactively fixed. UX validation + security/testing reports written. |
| 2026-03-06 | PDF support via pdfjs-dist, lazy-loading safety, mount-failure detection, file drop fix, material card redesign |
| 2026-03-05 | Chunking pipeline hardening (bundled JSZip, zip bomb defense, stack-based XML), UX polish |
| 2026-03-04 | Assignment decomposition skill ID resolution fix |
| 2026-03-03 | Session intent system (exam prep, explore modes) |
| 2026-03-02 | Code input mode, break reminders, session timer |

---

## Codebase Summary

| Metric | Value |
|---|---|
| Frontend | React 18.2.0 + Vite 5.0.0 |
| Desktop | Tauri 2.10.0 |
| Database | SQLite via @tauri-apps/plugin-sql |
| AI | Claude API via @tauri-apps/plugin-http |
| Source files | 49 JS/JSX files |
| Total LOC | ~15,290 |
| Design docs | 27 MD files in docs/ |
| Knowledge base | 37 MD files in knowledge/ (architecture, development, design, design/validation, QA, research) |
| Git commits | 74 |
| Most recent commit | 2026-03-08 |

### Source File Breakdown (post-decomposition)

| Layer | Files | LOC | Key Files |
|---|---|---|---|
| Entry | 2 | 140 | App.jsx (130), main.jsx (10) |
| State & Routing | 2 | 1,186 | StudyContext.jsx (1,120), ScreenRouter.jsx (66) |
| Screens | 9 | 1,921 | MaterialsScreen (555), ProfileScreen (339), ScheduleScreen (289), UploadScreen (169), SkillsScreen (153), HomeScreen (163), StudyScreen (116), NotifsScreen (73), ManageScreen (64) |
| Shared Components | 4 | 398 | DatePicker (186), SettingsModal (93), ErrorDisplay (73), GlobalLockOverlay (46) |
| Study Sub-Components | 10 | 2,349 | ModePicker (666), PracticeMode (394), SkillsPanel (205), MaterialsPanel (186), ChunkPicker (149), InputBar (131), AssignmentPanel (120), StudyScreen layout (116), SessionSummary (104), MessageList (95), NotifPanel (83) |
| Libraries | 20 | 9,790 | cipData (420), db.js (1,814), extraction.js (1,352), study.js (1,041), docxParser (633), htmlToMarkdown (502), epubParser (477), pdfParser (448), skills (467), chunker (427), parsers (416), migrate (388), syllabusParser (322), api (228), fsrs (206), export (143), theme (100), cipSeeder (54), classify (~40), pptxParser (~40) |

---

## Active Blockers

None currently identified. Development is proceeding on features that don't require pending decisions.

---

## Open Flags

None currently active. Knowledge base flags folder is empty.

---

## CEO Decisions Pending

- ~~Session intent UX introduction~~ — **RESOLVED: 5-mode picker implemented** (assignment, recap, skills, exam, explore)
- ~~Python sidecar bundling strategy~~ — **RESOLVED: separate install** to maintain stability and quality
- ~~Phase 3 urgency color thresholds + overdue treatment + section headers~~ — **RESOLVED: CEO approved defaults** (<48h red, <7d amber, >7d blue; red bg+border for overdue; sort-only, no section headers)
- ~~Phase 4 schedule UI design defaults~~ — **RESOLVED: CEO approved defaults** (info bar signals max 3 inline, temporal sections not calendar, exam readiness = all skills for v1, ★ prefix not separate exam section)
- ~~Phase 5 nudge banner visual treatment~~ — **RESOLVED: CEO approved default** (subtle approach — low-opacity tint with urgency color, no attention-grabbing animation or alert icon)
- **Parent skill level + readiness visualization approach** — Not yet designed

---

## Decomposition Status

The original monolithic `App.jsx` (4,416 lines) has been fully decomposed across 4 phases:

| Phase | Scope | Result | Validation |
|---|---|---|---|
| Phase 1 | Context extraction | `StudyContext.jsx` (929 lines) — all state, effects, handlers | Build pass |
| Phase 2 | Screen extraction (non-study) | 7 screen files + 3 shared components | Build pass + UX validation |
| Phase 2b | Study screen routing | `ScreenRouter.jsx` reduced to 1,860 lines | Build pass |
| Phase 4 | Study screen decomposition | 10 sub-components + `StudyScreen.jsx` layout shell; `ScreenRouter.jsx` reduced to 62 lines | Build pass + UX validation + Security/Testing report |

**Net result:** 1 file (4,416 LOC) -> 25 files (~5,030 LOC). Total LOC increased ~14% due to import statements, component declarations, and context destructuring in each file. No feature changes. All behavior verified identical.

**Bugs found during decomposition:**
- S1 (`setSessionElapsed` not in context value) — pre-existing from Phase 2b, **fixed**
- 6 latent import bugs from Phase 1 (functions used but never imported in ScreenRouter) — **fixed** by explicit imports in sub-components

**Knowledge artifacts:**
- `knowledge/architecture/app-jsx-decomposition-2026-03-06.md` — architecture blueprint
- `knowledge/architecture/decomposition-validation-2026-03-06.md` — Phase 2 validation
- `knowledge/development/phase1-context-extraction-2026-03-06.md` — Phase 1 dev log
- `knowledge/development/phase2-screen-extraction-2026-03-06.md` — Phase 2 dev log
- `knowledge/development/phase2b-screen-extraction-2026-03-06.md` — Phase 2b dev log
- `knowledge/development/phase4-study-decomposition-2026-03-06.md` — Phase 4 dev log
- `knowledge/design/validation/phase4-study-screen-decomposition-2026-03-06.md` — Phase 4 UX validation
- `knowledge/qa/phase4-security-testing-2026-03-06.md` — Phase 4 security & testing report

---

## Stability Hardening Status

5 stability fixes applied to StudyContext.jsx and main.jsx. No features, no schema changes.

| Fix | Severity | File | Description | Status |
|-----|----------|------|-------------|--------|
| S1 | Medium | StudyContext.jsx | `enterStudy` unprotected `await DB.saveChat` — moved inside try/catch | **Fixed** |
| S2 | High | StudyContext.jsx | `setReady(true)` outside try/catch — moved inside, error path gates auto-save | **Fixed** |
| S3 | Medium | StudyContext.jsx | No StrictMode cancellation guard — added `cancelled` flag + cleanup | **Fixed** |
| S4 | Low | main.jsx | Duplicate error listeners appending `<pre>` elements — removed (23→10 lines) | **Fixed** |
| S5 | High | StudyContext.jsx | Auto-save could write empty courses — `coursesLoaded` ref guard added | **Fixed** |

**Knowledge artifacts:**
- `knowledge/architecture/stability-hardening-2026-03-06.md` — blueprint (issue catalog + fix specs)
- `knowledge/development/stability-hardening-2026-03-06.md` — dev log
- `knowledge/development/stability-hardening-build-verification-2026-03-06.md` — release build verification
- `knowledge/qa/stability-hardening-testing-2026-03-06.md` — QA report (all 5 fixes PASS)
