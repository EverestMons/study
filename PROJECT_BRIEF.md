# study — Project Brief
**Maintained By:** CEO (Mark Lehn)
**Last Updated:** 2026-03-05
**Version:** 1.0

---

## What This Project Is

Study is a Tauri desktop app that functions as an AI-powered study assistant for college students. It ingests course materials (textbooks, syllabi, assignments, lecture slides, EPUBs), extracts skills using a deterministic-first + LLM-validation pipeline, tracks mastery using FSRS-based spaced repetition, and tutors students using session-based AI conversations.

This is a personal project built for Mark's own CS coursework and extended as a general-purpose student tool.

---

## The Problem It Solves

Students have course materials spread across multiple formats and no systematic way to turn them into a study plan. Generic AI chat lacks academic context. Flashcard apps lack depth. Study bridges this — it reads your actual course materials, extracts what you need to know, tracks how well you know it over time, and tutors you toward mastery with session-scoped AI conversations.

---

## Current State

The app is actively working. Recent commits (as of 2026-03-05) show:

- **Chat UX** is polished — timestamps, session summaries, visual hierarchy, smarter context building
- **Assignment decomposition** is functional — assignments auto-decompose into required skills, Practice button works with correct skill ID resolution
- **Skill extraction pipeline** (v2) is live — weighted mastery model, content-hash dedup, context tags, source tracking, evidence-quality weighting
- **FSRS mastery model** is implemented — practice mode, criteria tracking, confidence labels
- **Profile view** is complete — domain readiness display, activity indicator, concept key, action buttons
- **SQLite-only storage** — localStorage fully removed, all storage through Tauri plugin-sql
- **Material classification** — EPUB, DOCX, PPTX (lecture slides), assignment handling, separate classification paths

### What Is NOT Yet Built (from spec)
- **Session intent system** — the three-question session flow (course → intent → scope) is specified in `docs/skill-architecture-redesign.md` but not yet implemented. Current model is still open-ended chat by course.
- **Migration 002** — the new v2 schema tables (parent_skills, sub_skills, chunk_skill_bindings, sessions, etc.) are designed but not yet created as a formal migration
- **Python sidecar** — Unstructured document parsing is specified in `docs/study-tauri-architecture.md` but not built. Current parsing uses mammoth (DOCX), JSZip (EPUB), and browser-based parsers.
- **PDF support** — not yet implemented (Python sidecar is the planned path)
- **Parent skill / CIP taxonomy** — user-level parent skills and CIP-seeded taxonomy are designed but not implemented. Skills are currently course-scoped.

---

## Tech Stack

- **Frontend:** React 18 + Vite
- **Desktop framework:** Tauri v2
- **Backend:** Rust (Tauri commands)
- **Database:** SQLite via `@tauri-apps/plugin-sql`
- **Document parsing:** mammoth (DOCX), JSZip (EPUB), custom parsers
- **AI:** Claude API via `@tauri-apps/plugin-http`
- **Spaced repetition:** Custom FSRS implementation in `src/lib/fsrs.js`

---

## Architecture Overview

```
React UI (App.jsx)
    ↓
lib/ (skills.js, study.js, fsrs.js, classify.js, chunker.js)
    ↓
SQLite via Tauri plugin-sql (db.js, migrate.js)
    ↓
Tauri v2 Rust backend
    ↓ (future)
Python sidecar — Unstructured document parsing
```

---

## Key Concepts Every Agent Must Understand

### Skill Architecture Redesign
`docs/skill-architecture-redesign.md` is the most important technical document in this project. It defines the target architecture — parent skills, sub-skills, chunk-skill bindings, session intent system, FSRS mastery model, and a 4-phase migration plan. Many of its design decisions are resolved with citations. Read this before touching anything schema or skill-related.

**The gap:** The spec is ahead of the implementation. The current codebase has v2 skill extraction (weighted mastery, content hashing, chunk-skill bindings) but not the full session/intent/parent-skill architecture from the redesign. Development is incrementally closing this gap.

### FSRS Mastery Model
Skills are tracked with FSRS (Free Spaced Repetition Scheduler) — Difficulty, Stability, Retrievability. The display model separates **Level** (always increases, RPG-style) from **Readiness** (current retrievability, can decay). Do not change FSRS logic without CEO approval.

### Session Intent System (Planned)
The app will eventually ask "what are you here to do?" before each session — five intents (complete assignment, exam prep, learn new material, review, explore) — each routing to a different teaching strategy. This is not yet built. The current model is open-ended chat scoped to a course.

### Assignment Decomposition
Assignments are decomposed into required skills. The LLM maps each question to prerequisite skills from the course's extracted skill set. Practice mode uses these mappings to launch targeted skill review. Recent commits fixed skill ID resolution bugs in this pipeline.

---

## Current Priorities

1. **Session intent system**
   Implement the three-question session flow from `docs/skill-architecture-redesign.md`. This is the most important unbuilt feature — it's what makes the app's tutoring purposeful rather than open-ended.

2. **Parent skill / CIP taxonomy**
   Implement the user-level parent skill layer so mastery persists across courses. CIP-seeded taxonomy with alias table and similarity-gating for fragmentation prevention.

3. **PDF support**
   Students upload PDFs constantly. This is the most common document format and the biggest current gap. Path is the Python sidecar + pymupdf4llm three-tier extraction architecture from `docs/skill-architecture-redesign.md`.

4. **Stability and polish**
   The core chat, extraction, and practice flows are functional. Continue hardening edge cases and improving UX based on real usage.

---

## Constraints

- **Personal project:** No corporate security restrictions. Any tool or library is fair game.
- **Local-first:** All data stays on the user's machine. No server, no cloud sync.
- **Open source intent:** All dependencies must be open source compatible (AGPL is acceptable).
- **Single user:** Designed for one student at a time. No multi-user architecture needed.
- **Cross-platform target:** macOS primary (Mark's Mac Mini M2), Windows and Linux eventual.

---

## Active Development Challenges

### Spec-Implementation Gap
The `docs/` folder contains a detailed, well-researched architectural vision that is partially implemented. The biggest challenge is closing this gap incrementally without breaking what already works. The expand-and-contract migration pattern (migrations 001 → 002 → 003 → 004) is the intended path.

### Document Parsing Coverage
Current parsers handle DOCX (mammoth), EPUB (JSZip), PPTX (basic), and TXT. PDF is not supported. Scanned documents fail. The Python sidecar is designed to fix this but is not yet built.

---

## Open Questions

- What is the right UX for introducing the session intent system without disrupting the existing flow for current users?
- Should the Python sidecar be bundled with the Tauri app (requires build complexity) or run as a separate install step?
- How should parent skill level and readiness be displayed in the skill profile — the two-number model (Level + Readiness %) is designed, but the exact visualization is not settled.

---

## Related Files

- `docs/skill-architecture-redesign.md` — primary architectural reference (read first)
- `docs/study-tauri-architecture.md` — Tauri migration and Python sidecar spec
- `src/App.jsx` — main React component (most UI logic lives here)
- `src/lib/` — core library modules
- `PROJECT_STATUS.md` — current department activity and milestone progress
- `knowledge/KNOWLEDGE_INDEX.md` — index of all knowledge base files
- `agents/` — all specialist agent MD files
