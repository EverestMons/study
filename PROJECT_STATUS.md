# study — Project Status
**Maintained By:** Study Product Analyst
**Last Updated:** 2026-03-06
**Updated By:** Development Team
**Overall Status:** 🟢 Active

---

## Current Sprint / Focus

Closing the gap between the spec (`docs/skill-architecture-redesign.md`) and the working app. Core extraction, practice, and chat flows are live. Session intent system is **complete** (5 modes: assignment, recap, skills, exam prep, explore). Material upload pipeline redesigned — auto-extraction, state-aware cards, and transparent processing replace the old manual activate→extract flow. Chunking pipeline hardened with bundled JSZip, safety limits, and stack-based XML parsing. **PDF support now live** via pdfjs-dist — no Python sidecar needed. Next priorities: parent skill layer, cross-skill concept links.

---

## Department Status

| Department | Status | Last Activity | Notes |
|---|---|---|---|
| Research | Idle | — | No knowledge deposited |
| Systems Architecture | Idle | — | No knowledge deposited; session intent + parent skill design needed |
| Development | Active | 2026-03-06 | 68 commits. Latest: material card redesign + auto-extraction + chunking hardening. Very active. |
| Security & Testing | Active | 2026-03-05 | Security review of chunking pipeline (JSZip bundling, zip bomb defense, XML parsing). |
| Design & Experience | Active | 2026-03-05 | Material upload transparency UX spec delivered and implemented. |
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
| Error safety net | ✅ Live | Unhandled error/rejection listeners in main.jsx + 3s mount-failure fallback in index.html |
| PDF support | ✅ Live | pdfjs-dist (lazy-loaded), heading detection via font size analysis, page-based fallback, metadata/outline extraction |
| File drag-and-drop | ✅ Live | Tauri native drop disabled so WebView receives drag events |
| DB Migrations 001 + 002 | ✅ Applied | v2 schema + skill extraction v2 (concept_key, category, blooms_level, evidence, soft-delete) |

---

## What Is Specified But Not Yet Built

| Feature | Spec Location | Priority | Notes |
|---|---|---|---|
| ~~Full session intent system~~ | ~~`docs/skill-architecture-redesign.md` §4~~ | ~~Done~~ | ✅ Implemented — 5 modes with picker UIs. Moved to "What Is Working." |
| Parent skill / CIP taxonomy layer | `docs/skill-architecture-redesign.md` §1, Q1 | 🔴 High | Schema tables exist (parent_skills, parent_skill_aliases) but not populated or used |
| ~~PDF support~~ | ~~`docs/study-tauri-architecture.md`~~ | ~~Done~~ | ✅ Implemented via pdfjs-dist — no sidecar needed. Moved to "What Is Working." |
| Python sidecar (Unstructured) | `docs/study-tauri-architecture.md` | 🟡 Medium | CEO decided: separate install. Deprioritized — PDF now handled client-side. |
| Migration 003 — Data migration (v1→v2) | `docs/skill-architecture-redesign.md` | 🟡 Medium | Migrate data from old tables to new v2 tables |
| Migration 004 — Cleanup | `docs/skill-architecture-redesign.md` | 🟡 Medium | Drop old tables after confirmed migration |
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
| 003 — Data migration (v1 to v2 tables) | 🔲 Not started | |
| 004 — Cleanup (drop old tables) | 🔲 Not started | |

---

## Recent Development Activity (Last 5 Days)

| Date | Work |
|---|---|
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
| Source files | ~20 JS/JSX files |
| Primary code | App.jsx (4,416 LOC), db.js (1,485), extraction.js (1,346), study.js (940) |
| Design docs | 26 MD files in docs/ |
| Git commits | 70 |
| Most recent commit | 2026-03-06 |

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

## Knowledge Base Status

All knowledge folders exist with correct structure. **All folders are empty.** No department has deposited any knowledge despite 64 commits of active development. All design decisions and implementation notes exist in git commit messages and the 26 documents in `docs/`. Agent files (10 specialists) are configured but the knowledge base system has not been adopted yet.
