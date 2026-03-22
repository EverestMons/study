# study — Project Brief
**Maintained By:** CEO (Mark Lehn)
**Last Updated:** 2026-03-22
**Version:** 2.0

---

## What This Project Is

Study is a Tauri desktop app that functions as an AI-powered study assistant for college students. It ingests course materials (textbooks, syllabi, assignments, lecture slides, EPUBs, scanned PDFs), extracts skills using a deterministic-first + LLM-validation pipeline, tracks mastery at the facet level using FSRS-based spaced repetition, and tutors students using session-based AI conversations with five distinct study modes.

This is a personal project built for Mark's own CS coursework and extended as a general-purpose student tool.

---

## The Problem It Solves

Students have course materials spread across multiple formats and no systematic way to turn them into a study plan. Generic AI chat lacks academic context. Flashcard apps lack depth. Study bridges this — it reads your actual course materials, extracts what you need to know, tracks how well you know it over time, and tutors you toward mastery with session-scoped AI conversations.

---

## Current State (v0.2.17)

The app is fully functional with all core features implemented:

- **5 study modes** — assignment, skills, exam prep, recap, explore — each with focused context building and AI tutoring strategy
- **3-tier skill hierarchy** — parent skills (CIP taxonomy) → sub-skills → facets, each facet independently tracked by FSRS
- **Material ingestion** — PDF (pdfjs-dist), DOCX (mammoth), EPUB (JSZip), PPTX, TXT; OCR for scanned PDFs (tesseract.js); folder import via native OS picker
- **Faceted extraction pipeline** — nested skill→facet output, direct chunk ID bindings, binding type classification (teaches/references/prerequisite_for), quality scoring
- **Practice mode** — 6-tier system (Predict, Fill, Write, Debug, Combine, Apply) with worked examples, confidence ratings, and calibration feedback
- **Curriculum dashboard** — assignment/question/skill hierarchy, FSRS-based readiness bars, study actions, review tracking, submission management
- **Character sheet profile** — hero view with XP, domain grouping (42 CIP domains), drill-down to individual facets, cross-course mastery aggregation
- **Cross-course skill unification** — automatic detection and merge of equivalent skills across courses, shared FSRS schedule
- **Concept links** — cross-skill similarity detection via Haiku, mastery transfer between linked facets, profile display with click-to-navigate
- **Deadline intelligence** — urgency nudges, deadline-aware AI context, skill priority boost, exam auto-scope
- **Syllabus parsing** — auto-extracts schedule, grading, exams, placeholder assignments from uploaded syllabi
- **Self-updater** — GitHub Releases with signing keypair, in-app update UI

### What Is NOT Yet Built
- **Local Whisper transcription** — audio/video lecture transcription (low priority)
- **Python sidecar** — deprioritized; PDF and OCR now handled client-side

---

## Tech Stack

- **Frontend:** React 18 + Vite 5
- **Desktop framework:** Tauri v2
- **Backend:** Rust (Tauri commands)
- **Database:** SQLite via `@tauri-apps/plugin-sql`
- **Document parsing:** pdfjs-dist (PDF), mammoth (DOCX), JSZip (EPUB), custom parsers (PPTX, TXT)
- **OCR:** tesseract.js v7 (WASM, 10 languages)
- **AI:** Claude API via `@tauri-apps/plugin-http`
- **Spaced repetition:** Custom FSRS implementation in `src/lib/fsrs.js`
- **Tauri plugins:** dialog (folder picker), fs (file reading), updater (self-update), process (restart)

---

## Architecture Overview

```
React UI
├── App.jsx (shell: ErrorBoundary + StudyProvider)
├── StudyContext.jsx (all state, effects, handlers)
├── ScreenRouter.jsx (routing + transitions)
├── screens/ (10 screen components)
└── components/study/ (12 sub-components)
    ↓
lib/ (23 modules)
├── study.js (context building, system prompt, FSRS mastery updates)
├── db.js (SQLite layer: 15+ table modules)
├── skills.js (extraction pipeline)
├── extraction.js (facet extraction)
├── fsrs.js (spaced repetition algorithm)
└── ... (parsers, classify, api, conceptLinks, minhash, etc.)
    ↓
SQLite via Tauri plugin-sql (8 migrations)
    ↓
Tauri v2 Rust backend
```

| Metric | Value |
|---|---|
| Source files | 64 JS/JSX |
| Total LOC | ~23,200 |
| Migrations | 8 (001–008) |
| Design docs | 39 MD files in docs/ |
| Knowledge base | 222 MD files in knowledge/ |
| Git commits | 174 |

---

## Key Concepts

### 3-Tier Skill Hierarchy
Skills are organized as parent_skill → sub_skill → facet. Parent skills are seeded from the CIP 2020 taxonomy (416 entries, 42 academic domains). Sub-skills are extracted from course materials by the LLM. Facets are the atomic learning units — each has its own FSRS schedule, chunk bindings, and mastery tracking.

### FSRS Mastery Model
Facets are tracked with FSRS (Free Spaced Repetition Scheduler) — Difficulty, Stability, Retrievability. The display model separates **Level** (always increases, RPG-style) from **Readiness** (current retrievability, can decay). Mastery events fire when all facets for a skill are rated good/easy. Do not change FSRS logic without CEO approval.

### Session Intent System
Five study modes — assignment (tutor with boundary), skills (focused teaching), exam prep (auto-scoped review), recap (spaced repetition), explore (open-ended). Each mode has its own picker UI, focused context builder, and AI teaching strategy.

### Stealth Assessment
The AI continuously assesses individual facets during teaching without announcing it. Facets with mastery state are exposed in the system prompt. The AI rates facets through natural conversation, and ratings are routed to per-facet FSRS updates.

---

## Current Priorities

1. **IES alignment** — implementing evidence-based teaching strategies from IES Practice Guide recommendations (gap targeting, calibration feedback, metacognitive tools)
2. **Materials staging redesign** — improving the upload-to-extraction flow UX
3. **Polish and stability** — continuing to harden edge cases based on real usage

---

## Constraints

- **Personal project:** No corporate security restrictions. Any tool or library is fair game.
- **Local-first:** All data stays on the user's machine. No server, no cloud sync.
- **Open source intent:** All dependencies must be open source compatible (AGPL is acceptable).
- **Single user:** Designed for one student at a time. No multi-user architecture needed.
- **Cross-platform target:** macOS primary (Mac Mini M2), Windows and Linux eventual.

---

## Related Files

- `docs/skill-architecture-redesign.md` — primary architectural reference
- `PROJECT_STATUS.md` — current department activity and development history
- `knowledge/KNOWLEDGE_INDEX.md` — index of all knowledge base files
- `agents/` — specialist agent MD files
