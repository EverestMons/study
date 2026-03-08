# study — Project Status
**Maintained By:** Study Product Analyst
**Last Updated:** 2026-03-08
**Updated By:** Product Analyst (post Phase 2 — Syllabus Parsing Pipeline)
**Overall Status:** 🟢 Active

---

## Current Sprint / Focus

Closing the gap between the spec (`docs/skill-architecture-redesign.md`) and the working app. Core extraction, practice, and chat flows are live. Session intent system is **complete** (5 modes: assignment, recap, skills, exam prep, explore). Material upload pipeline redesigned — auto-extraction, state-aware cards, and transparent processing replace the old manual activate→extract flow. Chunking pipeline hardened with bundled JSZip, safety limits, and stack-based XML parsing. **PDF support now live** via pdfjs-dist — no Python sidecar needed. **Codebase decomposition complete** — the original 4,416-line god-component has been split across 4 phases into a context provider, screen router, 8 screen components, 3 shared components, and 10 study sub-components (42 source files, ~12,960 LOC). This was a pure refactor with no feature changes. **Stability hardening complete** — 5 fixes (S1–S5) targeting white-screen crashes, data-loss race conditions, and duplicate error handlers. Release build verified, no regressions. **Assignment table migration (003) complete** — assignments now stored in normalized relational tables (3 tables, 8 indexes) instead of JSON blobs. Blob migration runs automatically on app startup. V1 `saveAsgn`/`getAsgn` dead code removed. **Syllabus parsing pipeline complete** — uploading a syllabus auto-extracts weekly schedule, grading breakdown, course metadata, and placeholder assignments via Haiku LLM. Deterministic validation with composite confidence scoring. Graceful degradation on partial data. QA: no critical findings. Next priorities: assignment scheduler UI (Phases 3–5), parent skill layer, cross-skill concept links.

---

## Department Status

| Department | Status | Last Activity | Notes |
|---|---|---|---|
| Research | Idle | — | No knowledge deposited |
| Systems Architecture | Active | 2026-03-08 | Architecture blueprints for decomposition, stability hardening, assignment table migration, syllabus parser (`knowledge/architecture/`) |
| Development | Active | 2026-03-08 | 69 commits. Latest: Syllabus parsing pipeline — `syllabusParser.js` (322 lines), upload auto-trigger wired in StudyContext.jsx. |
| Security & Testing | Active | 2026-03-08 | Phase 2 syllabus parsing QA report — no critical findings, 6 minor items documented (`knowledge/qa/`). |
| Design & Experience | Active | 2026-03-06 | Phase 4 UX validation report (`knowledge/design/validation/`). All flows verified identical. |
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

---

## What Is Specified But Not Yet Built

| Feature | Spec Location | Priority | Notes |
|---|---|---|---|
| ~~Full session intent system~~ | ~~`docs/skill-architecture-redesign.md` §4~~ | ~~Done~~ | ✅ Implemented — 5 modes with picker UIs. Moved to "What Is Working." |
| Parent skill / CIP taxonomy layer | `docs/skill-architecture-redesign.md` §1, Q1 | 🔴 High | Schema tables exist (parent_skills, parent_skill_aliases) but not populated or used |
| ~~PDF support~~ | ~~`docs/study-tauri-architecture.md`~~ | ~~Done~~ | ✅ Implemented via pdfjs-dist — no sidecar needed. Moved to "What Is Working." |
| Python sidecar (Unstructured) | `docs/study-tauri-architecture.md` | 🟡 Medium | CEO decided: separate install. Deprioritized — PDF now handled client-side. |
| ~~Assignment table migration (003)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Migration 003 applied. Moved to "What Is Working." |
| ~~Syllabus parsing (Phase 2)~~ | ~~`docs/planning/assignment-scheduler-spec.md`~~ | ~~Done~~ | ✅ Implemented — `syllabusParser.js` + upload auto-trigger. Moved to "What Is Working." |
| Assignment scheduler UI (Phases 3–5) | `docs/planning/assignment-scheduler-spec.md` | 🔴 High | Calendar panel, dashboard, notifications |
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
| Source files | 43 JS/JSX files |
| Total LOC | ~13,740 |
| Design docs | 26 MD files in docs/ |
| Knowledge base | 20 MD files in knowledge/ (architecture, development, design, QA) |
| Git commits | 69 |
| Most recent commit | 2026-03-08 |

### Source File Breakdown (post-decomposition)

| Layer | Files | LOC | Key Files |
|---|---|---|---|
| Entry | 2 | 157 | App.jsx (147), main.jsx (10) |
| State & Routing | 2 | 1,069 | StudyContext.jsx (1,007), ScreenRouter.jsx (62) |
| Screens | 8 | 1,563 | MaterialsScreen (555), ProfileScreen (339), UploadScreen (169), SkillsScreen (153), StudyScreen (116), HomeScreen (94), NotifsScreen (73), ManageScreen (64) |
| Shared Components | 3 | 212 | SettingsModal (93), ErrorDisplay (73), GlobalLockOverlay (46) |
| Study Sub-Components | 10 | 2,094 | ModePicker (411), PracticeMode (394), SkillsPanel (205), MaterialsPanel (186), ChunkPicker (149), InputBar (131), AssignmentPanel (120), StudyScreen layout (116), SessionSummary (104), MessageList (95), NotifPanel (83) |
| Libraries | 18 | 8,715 | db.js (1,804), extraction.js (1,346), study.js (940), docxParser (633), htmlToMarkdown (502), epubParser (477), pdfParser (448), skills (467), chunker (427), parsers (416), migrate (388), syllabusParser (322), api (228), fsrs (206), export (143), theme (100), classify (~40), pptxParser (~40) |

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
