# study — Project Status
**Maintained By:** Study Product Analyst
**Last Updated:** 2026-03-22
**Updated By:** Documentation Analyst (doc sync — PROJECT_BRIEF v2.0 + PROJECT_STATUS refresh)
**Overall Status:** Active

---

## Current Sprint / Focus

Closing IES Practice Guide alignment gaps and polishing the study experience. Core app is feature-complete — 5 study modes, facet-level FSRS mastery, 3-tier skill hierarchy, curriculum dashboard, character sheet profile, cross-course skill unification, concept links, deadline intelligence, OCR, folder import, self-updater. Current work focuses on evidence-based teaching enhancements (gap targeting, calibration feedback, metacognitive tools) and materials staging UX redesign.

---

## Department Status

| Department | Status | Last Activity | Notes |
|---|---|---|---|
| Research | Active | 2026-03-22 | IES Practice Guide full implementation audit. Previous: facet-level assessment best practices. |
| Systems Architecture | Active | 2026-03-22 | IES gaps + open flags blueprint (gap targeting, mastery wiring, level guard, calibration tracking). Previous: facet assessment pipeline, cross-course skill unification. |
| Development | Active | 2026-03-22 | IES batch: gap identification prompt, PracticeMode mastery event wiring, level decrease display guard, confidence calibration tracking. Materials staging UX redesign. Chunk metadata enrichment. Cross-course skill unification (3 phases). |
| Security & Testing | Active | 2026-03-22 | IES gaps + open flags QA: 7/7 PASS. Previous: cross-course unification QA, facet mastery QA. |
| Design & Experience | Active | 2026-03-22 | IES gaps + open flags UXV: 5/5 PASS (tone, celebration, honesty, phrasing, metacognitive overhead). Previous: cross-course unification UXV, materials staging UXV. |
| Data & Analytics | Idle | — | No usage data to analyze yet |
| Documentation | Active | 2026-03-22 | PROJECT_BRIEF v2.0 rewrite + PROJECT_STATUS refresh |
| Engineering & Physical Design | N/A | — | No physical components |

---

## What Is Working (Implemented & Live)

| Feature | Notes |
|---|---|
| Material upload + auto-extraction | PDF, DOCX, EPUB, PPTX, TXT; auto-classification; state-aware cards; 7-state processing transparency |
| OCR for scanned PDFs | tesseract.js v7 WASM, 10 languages, confidence tracking, quality badges |
| Chunking pipeline | Bundled JSZip, zip bomb defense, stack-based XML, sentence/char split fallbacks |
| Content-hash dedup + MinHash LSH | Prevents re-extraction of identical and near-duplicate chunks |
| v2 skill extraction pipeline | Weighted mastery, context tags, source tracking, concept keys, Bloom's taxonomy |
| Faceted extraction pipeline | Nested skill→facet output, direct chunk ID bindings, binding type classification, quality scoring |
| 3-tier skill hierarchy | parent_skill → sub_skill → facet; CIP taxonomy seeding (416 entries, 42 domains) |
| FSRS facet-level tracking | Per-facet FSRS schedule, aggregate skill readiness, mastery transfer via concept links |
| Facet-level stealth assessment | AI assesses facets during teaching; per-facet FSRS routing; mastery threshold detection |
| Session mastery summary | Inline mastery cards, facet progress pills, session summary with mastered/practiced/facets sections |
| Assignment decomposition | Auto-decomposes to required skills; maps questions to facets |
| Practice mode | 6-tier system with worked examples, confidence ratings, calibration feedback |
| 5 study modes | Assignment, skills, exam prep, recap, explore — each with picker UI + focused context |
| Graph-traversal context builder | Facet→binding→chunk traversal; quality-ranked sources; cross-domain chunks via concept links |
| Gap identification prompt | AI surfaces weakest skill area with student agency; escape clause for equal strengths |
| Confidence calibration | Per-tier calibration feedback (well-calibrated / overconfident / underconfident); 0.15 threshold, 3-sample min |
| Chat / tutoring UI | Timestamps, session summaries, code input mode, break reminders, streaming |
| Curriculum dashboard | Assignment/question/skill hierarchy, readiness bars, study actions, submission management |
| Schedule screen | Temporal sections, expandable cards, FSRS readiness %, skill drill-down |
| Deadline intelligence | Nudge banner, deadline-aware AI context, skill priority boost, exam auto-scope |
| Character sheet profile | Hero view with XP, domain grouping, drill-down to facets, cross-course aggregation |
| Cross-course skill unification | Automatic detection + merge of equivalent skills, shared FSRS, multi-course attribution |
| Concept links | Cross-skill similarity via Haiku, mastery transfer, profile display, AI context integration |
| Folder import | Native OS picker, 17 extensions, subfolder grouping, auto-classification, search/filter |
| Syllabus parsing | Auto-extracts schedule, grading, exams, placeholder assignments via Haiku |
| Materials staging + grid layout | 3-column grid, grouped by type, expand-in-place, status filter tabs, batch retry |
| DOCX export | Assignment submission export |
| SQLite-only storage | WAL mode, transaction serialization, 10 migrations (001–010) |
| Security hardening | CSP, prompt injection defense, database backup, stream truncation markers |
| Performance optimization | Context value memoization, batch profile queries, request dedup, extractJSON repair cap |
| Error safety net | ErrorBoundary + async listeners + 3s mount-failure fallback + StrictMode guard |
| Self-updater | GitHub Releases with signing keypair, in-app update UI, release.sh script |
| Custom DatePicker | Dark-themed calendar popover, portal-rendered, month navigation |

---

## What Is Specified But Not Yet Built

| Feature | Priority | Notes |
|---|---|---|
| Python sidecar (Unstructured) | Low | Deprioritized — PDF + OCR handled client-side |
| Cross-course skill unification | Done | ✅ Implemented — automatic detection, merge engine, multi-course attribution |
| Local Whisper transcription | Low | Audio/video lecture transcription |

---

## Migration Status

| Migration | Status | Notes |
|---|---|---|
| 001 — v2 schema | Applied | parent_skills, sub_skills, chunks, sessions, mastery |
| 002 — Skill extraction v2 | Applied | concept_key, category, blooms_level, evidence, soft-delete |
| 003 — Assignment tables | Applied | 3 tables, 8 indexes; V1 blob migration complete |
| 004 — last_rating column | Applied | V1 skill migration run; migration code deleted |
| 005 — Facet architecture | Applied | 5 new tables (facets, facet_mastery, chunk_facet_bindings, facet_concept_links, assignment_question_facets) |
| 006 — Assignment activation | Applied | study_active column + partial index |
| 007 — Material images | Applied | Image storage for materials |
| 008 — Skill courses | Applied | skill_courses junction table + unified_into column for cross-course unification |
| 009 — Chunk relationships | Applied | chunk_relationships table for inter-chunk connections |
| 010 — Session exchanges | Applied | session_exchanges table for per-facet exchange logging with mastery deltas |

---

## Tauri Migration Progress

| Milestone | Status |
|---|---|
| Create Tauri project with React frontend | Complete |
| Implement SQLite DB module | Complete |
| Remove localStorage / browser storage | Complete |
| All screens render correctly | Complete |
| PDF support | Complete (pdfjs-dist) |
| OCR support | Complete (tesseract.js v7 WASM) |
| File system watcher | Replaced (one-shot folder import) |
| Bundle Python sidecar | Not started (deprioritized) |
| Local Whisper transcription | Not started |

---

## Recent Development Activity

| Date | Work |
|---|---|
| 2026-03-24 | **Tutor Phase 4 — Forge Ingestion:** `_updateTutorSessionSummary()` writes to `$APPDATA/tutor-sessions/tutor-session-summary.md` at session end. Forge `tutor_response` chunk type added. Classification rule and chunker wired in Forge scanner. `EXTRA_SCAN_PATHS` config enables Forge to discover files outside Git repos. Full tutor feedback loop complete: facet assessment → session logging → chunk effectiveness → Forge ingestion. SA blueprint → STUDY DEV (3 files) → FORGE DEV (2 files) → QA 8/8 PASS. |
| 2026-03-24 | **Tutor Phase 3 — Chunk Teaching Effectiveness:** `updateChunkEffectiveness()` writes `teaching_effectiveness` on `chunk_facet_bindings` at session end. `getByFacetRanked()` now orders by `teaching_effectiveness DESC NULLS LAST` as secondary sort key. Higher-effectiveness chunks surface first for facets with accumulated session data. SA blueprint → DEV (3 files, +53 lines) → QA 7/7 PASS. |
| 2026-03-24 | **Tutor Phase 2 — Session Exchange Logging:** `session_exchanges` table (migration 010), `SessionExchanges` db module (`log()`, `getBySession()`), `loadFacetBasedContent()` returns `{ctx, chunkIds}`, per-facet exchange logging with mastery_before/after, practice_tier, and chunk_ids_used. SA blueprint → DEV (4 files modified, 1 created, +108 lines) → QA 7/7 PASS. |
| 2026-03-24 | **Tutor Phase 1 — Facet Assessment in All Modes:** Facet assessment block added to general context builder (`buildContext()`) — all 5 study modes now expose facets to the AI for per-facet FSRS routing during tutoring. SA audit → DEV (1 file, +7 lines) → QA → UXV. |
| 2026-03-22 | **Materials Staging UX Redesign:** SA blueprint → DEV (grouped 3-column grid, inline classify buttons, centered upload zone, progressive reveal, classification animation) → QA 7/7 PASS → UXV 7/7 PASS. **Chunk Metadata Enrichment:** Diagnostic (8 gaps identified) → SA blueprint → DEV (3 files: htmlToMarkdown.js, chunker.js, extraction.js) → QA 5/5 PASS. **Cross-Course Skill Unification (3 phases):** CEO scoping → SA blueprint (migration 008, merge engine) → DEV Phase 1 (migration, DB module, merge engine) → QA Phase 1 → DEV Phase 2 (extraction hook) → DEV Phase 3 (display filters, ProfileScreen attribution, AI context) → QA Full 7/7 PASS → UXV 5/5 PASS. **Self-Updater:** Confirmed fully operational. **IES Diagnostics:** Prompt enhancement audit + full implementation status audit (mapped all 7 IES recommendations to codebase). **IES Gaps + Open Flags Batch:** SA blueprint (5 changes across 2 lanes) → DEV Lane A (gap identification prompt in study.js, PracticeMode mastery event wiring, level decrease display guard in MessageList + SessionSummary) → DEV Lane B (confidence calibration tracking with `computeCalibration()` in PracticeMode, review mode closed as addressed) → QA 7/7 PASS → UXV 5/5 PASS. |
| 2026-03-21 | **Bugfix Batch:** 3 diagnostics + executable plan — (1) black screen from MaterialsScreen skill study, (2) PPTX phantom slide references, (3) assignment decomposition gap for new materials. |
| 2026-03-14 | **Facet-Level Mastery Assessment (Steps 1-8):** Full pipeline from research to UX validation. `buildFacetAssessmentBlock()` context builder, stealth assessment protocol, `parseSkillUpdates` rewrite with facet sub-lines, `applySkillUpdates` expansion with per-facet FSRS routing, mastery threshold detection, enhanced MessageList pills (3 modes), inline MasteryCard, SessionSummary rewrite, NotifPanel mastery type. 22 QA scenarios all PASS. 6 files modified, +556 lines. |
| 2026-03-12 | **Assignment Curriculum Dashboard (Phases 3-4):** CurriculumScreen 12 enhancements + HomeScreen course-level state machine routing. |
| 2026-03-11 | **Materials Grid Redesign + Icon Update:** MaterialsScreen rewrite with 3-column grid, grouped by type, expand-in-place. App icon replaced. `getMaterialState` queued state fix. |
| 2026-03-10 | **Security/Performance/Stability Hardening (Batches A–D):** CSP, prompt injection defense, useMemo, batch queries, request dedup, extractJSON cap, isApiError audit, database backup, stream truncation. **OCR Support (Phases 1-4):** tesseract.js v7, auto-detect scanned PDFs, 10 languages, confidence tracking. **Materials Status Tabs + Batch Retry.** **Folder Import (Phases 1-3).** **Character Sheet Profile (Phases 1-3).** **Concept Links (Phases 1-3).** **MinHash LSH near-dedup.** |
| 2026-03-08 | **V1→V2 Data Unification (Batches A–F):** All data paths migrated, V1 compat layer deleted (~285 lines), migrate.js deleted (~410 lines). **Extraction Retry Rework.** **CIP Taxonomy Seeding.** **Custom DatePicker.** **Deadline Intelligence.** **Schedule UI.** **Due Dates + Picker Sort.** **Syllabus Parsing.** **Assignment Table Migration.** |
| 2026-03-06 | **Codebase Decomposition (Phases 1-4):** 4,416-line App.jsx → 42 files. **Stability Hardening (S1-S5).** **PDF support.** |

---

## Codebase Summary

| Metric | Value |
|---|---|
| Frontend | React 18.2.0 + Vite 5.0.0 |
| Desktop | Tauri 2.10.0 |
| Database | SQLite via @tauri-apps/plugin-sql |
| AI | Claude API via @tauri-apps/plugin-http |
| OCR | tesseract.js ^7.0.0 (WASM) |
| File system | @tauri-apps/plugin-dialog + @tauri-apps/plugin-fs |
| Source files | 64 JS/JSX files |
| Total LOC | ~23,200 |
| Design docs | 39 MD files in docs/ |
| Knowledge base | 222 MD files in knowledge/ |
| Git commits | 174 |
| Version | 0.2.17 |

### Source File Breakdown

| Layer | Files | LOC | Key Files |
|---|---|---|---|
| Entry | 2 | ~138 | App.jsx (129), main.jsx (9) |
| State & Routing | 2 | ~1,731 | StudyContext.jsx (1,625), ScreenRouter.jsx (106) |
| Screens | 10 | ~3,100 | MaterialsScreen (746), ProfileScreen (548), CurriculumScreen (503), ScheduleScreen (434), HomeScreen (~212), SkillsScreen (~190), CourseHomepage (~193), StudyScreen (~145), UploadScreen (~70), ManageScreen (~64) |
| Shared Components | 6 | ~850 | FolderPickerModal (~237), DatePicker (189), SettingsModal (~139), GlobalLockOverlay (~131), DupPromptModal, ExtractionProgress |
| Study Sub-Components | 12 | ~2,800 | PracticeMode (427), SkillPicker (~230), SkillsPanel (~258), MaterialsPanel (~201), SessionSummary (193), MessageList (~179), ChunkPicker (~149), InputBar (~115), AssignmentPanel (~120), NotifPanel (~83), CodeEditor, ExamScopePicker |
| Libraries | 23 | ~14,500 | db.js (3,170), extraction.js (2,231), study.js (1,949), skills.js (697), parsers, chunker, api, fsrs, conceptLinks, minhash, cipData, etc. |

---

## Open Flags

| Flag | Source | Severity | Description |
|---|---|---|---|
| Premature confidence from single-session mastery | Facet Mastery UXV | Low | All facets can be rated good/easy in a single session. FSRS scheduling mitigates by resurfacing. Monitor for student confusion about "mastered" skills reappearing. Consider minimum stability requirement if overconfidence pattern emerges. |
| Session summary leans "report card" | Facet Mastery UXV | Advisory | What's Next section is minimal. Could be strengthened with assignment-awareness and estimated next-session scope. |
| ~~PracticeMode mastery events not wired~~ | Facet Mastery QA | ~~Minor~~ | ✅ **Resolved 2026-03-22** — mastery event return value captured, wired to session refs + toast notification (IES gaps batch, commit 7b5e0a7). |
| ~~Level decrease display edge case~~ | Facet Mastery QA | ~~Minor~~ | ✅ **Resolved 2026-03-22** — display clamped via `Math.max(levelAfter, levelBefore)` in MessageList + SessionSummary (IES gaps batch, commit 7b5e0a7). |

---

## Active Blockers

None currently identified.

---

## CEO Decisions Pending

None currently pending. All historical decisions resolved (session intent UX, Python sidecar bundling, urgency thresholds, schedule UI defaults, nudge banner treatment, parent skill visualization, cross-course unification approach).
