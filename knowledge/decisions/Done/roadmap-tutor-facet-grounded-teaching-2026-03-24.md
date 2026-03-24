# study — AI Tutor Facet-Grounded Teaching Roadmap
**Date:** 2026-03-24 | **Type:** Roadmap

## Vision

The AI tutor currently uses chunks for context loading — it pulls relevant content into the prompt — but there is no feedback loop from tutor interactions back to chunk quality or facet mastery at the exchange level. Tutor sessions are ephemeral: what was taught, which facet was practiced, and whether mastery improved all disappear when the session ends. This roadmap closes that loop across four phases, ending with Forge ingesting tutor session data to systematically improve chunk-to-facet teaching effectiveness.

---

## Current State

- Facets exist as independently tracked FSRS entities with their own mastery state
- The tutor applies FSRS updates at the skill level and distributes them uniformly across all facets under that skill — no per-facet differentiation during a session
- `chunk_facet_bindings` has a `teaching_effectiveness` column that is never written to
- Tutor sessions generate a journal entry at session end but exchanges are not persisted with facet metadata
- Forge has no visibility into tutor session quality or chunk effectiveness

---

## Phase Structure

### Phase 1 — Facet-Level FSRS Updates During Tutoring
**The tutor should know which specific facet it is teaching at each exchange and update only that facet's FSRS state.**

Current behavior: `parseSkillUpdates()` extracts `[SKILL_UPDATE]` tags at skill level, `applySkillUpdates()` distributes the same rating to every facet under the skill uniformly.

Target behavior: The AI prompt identifies the active facet being practiced at each exchange. `parseSkillUpdates()` extracts the facet_id. `applySkillUpdates()` updates only that specific facet's FSRS state.

Changes:
- Update the stealth assessment prompt block (`buildFacetAssessmentBlock()` in `study.js`) to instruct the AI to emit `[SKILL_UPDATE]` tags with an explicit `facet_id` field alongside the skill rating
- Update `parseSkillUpdates()` to extract `facet_id` from the tag when present
- Update `applySkillUpdates()` to route to the specific facet when `facet_id` is present, rather than distributing uniformly across all facets under the skill
- Preserve fallback: if no `facet_id` is present, existing uniform distribution continues (backward compatible)

**Scope:** SA blueprint → DEV → QA → UXV

---

### Phase 2 — Session Exchange Logging with Facet Metadata
**Persist each tutor exchange with the facet being practiced and the FSRS state before and after.**

Current behavior: session journal entry generated at end of session with aggregate data. Individual exchanges are not persisted.

Target behavior: Each exchange where a facet FSRS update occurs is logged to a new `session_exchanges` table with: `session_id`, `facet_id`, `practice_tier` (Predict/Fill/Write/Debug/Combine/Apply), `chunk_ids_used` (JSON array of chunk IDs that were in context for this exchange), `mastery_before` (FSRS retrievability snapshot), `mastery_after`, `rating` (again/hard/good/easy), `exchange_timestamp`.

Changes:
- New migration `009_session_exchanges.sql` — `session_exchanges` table
- `db.js` — `SessionExchanges` module with `log()` and `getBySession()` methods
- `study.js` — call `SessionExchanges.log()` after each `applySkillUpdates()` call that produces a facet-level update
- `chunk_ids_used` populated from the current context window's active chunk IDs (already tracked in the context builder)

**Scope:** SA blueprint → DEV → QA

---

### Phase 3 — Chunk Teaching Effectiveness Feedback
**Write to `teaching_effectiveness` on `chunk_facet_bindings` based on session exchange outcomes.**

Current behavior: `teaching_effectiveness` column exists but is never written.

Target behavior: After a session ends, for each exchange where mastery improved (rating good or easy, mastery_after > mastery_before), increment `teaching_effectiveness` on the `chunk_facet_bindings` rows for the chunks that were in context during that exchange. For exchanges where mastery did not improve (again/hard), decrement or leave unchanged. Aggregate over time to produce a reliable effectiveness signal per chunk-facet pair.

Changes:
- New function `updateChunkEffectiveness(sessionId)` in `study.js` — runs at session end, reads `session_exchanges` for the session, updates `chunk_facet_bindings.teaching_effectiveness` for each chunk-facet pair
- The context builder (`loadFacetBasedContent()`) already sorts by `quality_rank` — update the sort to weight `teaching_effectiveness` alongside `quality_rank` so higher-effectiveness chunks are preferred for future sessions on the same facet

**Scope:** SA blueprint → DEV → QA

---

### Phase 4 — Forge Ingestion of Tutor Session Data
**Export session exchange data as a Forge-readable markdown summary for pattern analysis.**

Current behavior: No tutor session data reaches Forge.

Target behavior: After each session, study appends a summary entry to `study/knowledge/research/tutor-sessions/tutor-session-summary.md` — one H2 section per session containing: session_id, course, facets practiced, chunks used, mastery deltas, practice tiers used, and any facets where mastery did not improve. Forge ingests this file as `tutor_response` chunks.

Changes:
- `study.js` — `_updateTutorSessionSummary()` called at session end, writes/updates the markdown summary file via Tauri `@tauri-apps/plugin-fs`
- Forge `config.py` — add `tutor_response` ChunkType and classification rule for `tutor-session-summary.md`
- Forge `scanner.py` — `_chunk_tutor_session()` splits on H2 session headers

**Scope:** SA blueprint → DEV (study) → FORGE DEV (scanner) → QA

---

## Decisions (Pre-Locked)

| Decision | Resolution |
|---|---|
| Facet identification in tutor | AI emits facet_id in `[SKILL_UPDATE]` tag — no separate detection needed |
| Fallback when facet_id absent | Uniform distribution preserved — backward compatible |
| Session exchange granularity | Per-exchange logging (not per-session) — enables chunk-level effectiveness analysis |
| Chunk effectiveness signal | Incremental update at session end, not real-time — avoids mid-session noise |
| Forge transport mechanism | Markdown summary file via plugin-fs — same pattern as IP validation quality pipeline |
| Phase ordering | Must be sequential — Phase 2 depends on Phase 1 (facet_id in updates), Phase 3 depends on Phase 2 (session_exchanges table), Phase 4 depends on Phase 3 (effectiveness data worth exporting) |

---

## Relationship to Existing Architecture

- `buildFacetAssessmentBlock()` in `study.js` — Phase 1 modifies the prompt block it generates
- `parseSkillUpdates()` / `applySkillUpdates()` in `study.js` — Phase 1 modifies both
- `chunk_facet_bindings.teaching_effectiveness` — Phase 3 first write to this column
- `loadFacetBasedContent()` in `study.js` — Phase 3 modifies sort weighting
- Migration 008 already applied (skill_courses) — Phase 2 adds migration 009
- Forge taxonomy redesign (2026-03-24) added chunk type infrastructure — Phase 4 adds `tutor_response`
