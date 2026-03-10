# Concept Links & MinHash Near-Dedup — Orchestrator Plan

**Date:** 2026-03-10
**Project:** study
**Status:** Ready for execution
**CEO Authorization:** Standard feature development — no migration guardrails triggered.

---

## CEO Decisions (Resolved)

1. **Embedding approach for concept links:** **Use Claude API to judge similarity.** No new embedding dependency. One Claude call per parent skill per extraction, batching new skills against existing.
2. **MinHash priority:** **Build now.** Students re-upload similar content; near-dedup is needed.
3. **Concept link consumer priority:** **All three equally** — cross-course review suggestions, mastery transfer, profile display.

---

## Role Key

| Abbreviation | Agent | Department |
|---|---|---|
| **SA** | Study Systems Analyst | Systems Architecture |
| **DEV** | Study Developer | Development |
| **UXD** | Study UX Designer | Design & Experience |
| **UXV** | Study UX Validator | Design & Experience — Validation |
| **QA** | Study Security & Testing Analyst | Security & Testing |
| **PM** | Study Product Analyst | Product Management |

---

## Execution Overview

3 phases, executed sequentially:
- **Phase 1:** MinHash near-dedup (algorithmic JS, upload flow hook, dedup detection UI)
- **Phase 2:** Concept link generation (Claude-based similarity, post-extraction hook)
- **Phase 3:** Concept link consumers (AI context, mastery transfer, profile display)

Phase 1 and Phase 2 are independent — different tables, different triggers, different code paths. Phase 3 depends on Phase 2.

---

## Context for All Agents

### Existing Infrastructure

**Tables already in schema (from `001_v2_schema.sql`), currently empty:**

```sql
-- chunk_fingerprints — MinHash signatures for near-duplicate detection
CREATE TABLE IF NOT EXISTS chunk_fingerprints (
    chunk_id      TEXT PRIMARY KEY,
    minhash_sig   BLOB NOT NULL,          -- 128 × 4 bytes = 512 bytes
    shingle_count INTEGER,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- concept_links — cross-sub-skill similarity
CREATE TABLE IF NOT EXISTS concept_links (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_a_id   INTEGER NOT NULL,
    sub_skill_b_id   INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    link_type        TEXT NOT NULL,        -- 'same_concept', 'prerequisite', 'related'
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_a_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_skill_b_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_a_id < sub_skill_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_link_pair
    ON concept_links(sub_skill_a_id, sub_skill_b_id, link_type);
```

**No DB modules exist for either table.** Only referenced in `resetAll` delete list.

**No code references** to `concept_links`, `chunk_fingerprints`, `minhash`, `cosine`, or `embedding` anywhere in application code.

### Current Dedup: Exact Hash Only

The app already does exact content-hash dedup in two places:
1. **`Chunks.createBatch()`** — each chunk gets a `content_hash` (SHA-256 of normalized text) at creation time
2. **`runExtractionV2()`** — before extraction, checks if all chunk hashes already exist in another material for the same course. If so, skips with "Material Already Active" warning.

MinHash adds the near-duplicate layer on top of this.

### Extraction Flow (Hook Points)

Upload → `storeAsChunks()` → chunks created in DB → `runExtractionV2()` → per-chapter LLM extraction → skills saved → bindings created → done.

**MinHash hook:** After `storeAsChunks()` creates chunks, before `runExtractionV2()` runs. Compute fingerprints, check for near-matches, surface to user.

**Concept link hook:** After `runExtractionV2()` completes and new skills are saved. Gather newly created sub-skills, compare against existing under same parent, create links.

---

## Phase 1 — MinHash Near-Dedup

### Step 1.1 · SA · MinHash Architecture Blueprint

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/minhash-near-dedup-YYYY-MM-DD.md`

Design the MinHash near-duplicate detection system:

**Algorithm spec:**
- Shingling: normalize text (lowercase, strip whitespace/punctuation), generate 5-word overlapping windows (5-grams)
- MinHash: 128 hash functions using the standard `h(x) = (a*x + b) mod p` family with random coefficients. Store as 128 × uint32 = 512-byte BLOB.
- Jaccard estimation: `J(A,B) ≈ count(sig_A[i] == sig_B[i]) / 128`
- Threshold: 0.7 (from spec Q4). Candidates above 0.7 surface to user.
- No LSH indexing needed at this scale — pairwise comparison against all existing fingerprints for the same course is fast enough (dozens of chunks, not millions). If a material has 10 chunks and the course has 100 existing chunks, that's 1000 comparisons of 512-byte blobs — sub-millisecond. **Design LSH banding only if profiling shows this is slow.** Don't over-engineer.

**DB module spec:**
- `ChunkFingerprints.create(chunkId, minhashSig, shingleCount)` — insert fingerprint
- `ChunkFingerprints.createBatch(fingerprints)` — batch insert
- `ChunkFingerprints.getByCourse(courseId)` — all fingerprints for a course (join through chunks)
- `ChunkFingerprints.getByMaterial(materialId)` — fingerprints for a specific material
- `ChunkFingerprints.delete(chunkId)` — CASCADE handles this, but explicit method for clarity

**Integration spec:**
- Where fingerprints are computed: in `storeAsChunks()` or immediately after, once chunk content is available
- Where near-match check runs: in `runExtractionV2()` before extraction begins, as an enhancement to the existing exact-hash dedup check
- What happens on near-match detection: return match info to the caller with `{ nearDuplicates: [{ newChunkId, existingChunkId, existingMaterialLabel, similarity }] }`. The caller (StudyContext) decides how to surface this.

**UX integration spec:**
- What the user sees: a notification or inline warning during upload processing. "This content looks similar to [existing material name] (X% match). Same material or different?"
- User actions: "Same — skip" (marks chunks as extracted, inherits existing skills) or "Different — continue" (proceeds with extraction normally)
- Where this surfaces: during the auto-extraction phase in `addFiles` / `addMats` in StudyContext

**Resolved questions:**
- **Per-chunk fingerprinting confirmed (CEO decision).** More granular — catches partial overlaps when students upload overlapping chapters from different sources.
- **Non-structured file path timing:** `storeAsChunks()` has two code paths — structured (EPUB, DOCX, PDF) where content is available immediately after `Chunks.createBatch()`, and non-structured (TXT, PPTX, CSV) where content is flushed later via `Chunks.updateContent()`. Note: this is NOT a v1 compat issue — it's a parser capability difference that still exists post-unification. Fingerprinting in the structured path can happen inline. For non-structured files, fingerprinting must happen after the content flush in StudyContext. Document both timings in the blueprint.

**Migration Impact:** None — tables already exist in schema. Code-only changes.

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 1.2 · DEV · Implement MinHash Algorithm

**Agent:** Study Developer
**Create:** `src/lib/minhash.js`

Pure JavaScript implementation:
- `computeMinHash(text, numHashes = 128)` — normalize text, generate 5-grams, compute signature. Returns `{ signature: Uint32Array(128), shingleCount: number }`.
- `estimateJaccard(sigA, sigB)` — count matching positions, return similarity 0.0–1.0.
- `findNearDuplicates(newFingerprints, existingFingerprints, threshold = 0.7)` — compare each new fingerprint against all existing, return matches above threshold.
- Helper: `normalize(text)` — lowercase, strip punctuation, collapse whitespace.
- Helper: `shingle(text, k = 5)` — generate k-word windows as Set.
- Helper: `hashFamily(numHashes)` — generate random `(a, b, p)` coefficients. **Important:** coefficients must be deterministic (seeded) so that signatures are comparable across runs. Use a fixed seed, not `Math.random()`.

**No external dependencies.** This is ~100-150 lines of JavaScript math.

**Lines created:** ~150
**Files created:** 1 (`src/lib/minhash.js`)

### Step 1.3 · DEV · Add ChunkFingerprints DB Module

**Agent:** Study Developer
**Input:** DB module spec from Step 1.1
**File:** `src/lib/db.js`

Add `ChunkFingerprints` module with CRUD methods per blueprint. Fingerprint signatures stored as BLOBs — use `Uint8Array` for the Tauri SQL plugin's BLOB handling.

**Lines changed:** ~40

### Step 1.4 · DEV · Hook Fingerprinting into Upload Flow

**Agent:** Study Developer
**Input:** Integration spec from Step 1.1
**Files:** `src/lib/skills.js` (storeAsChunks or new helper), `src/StudyContext.jsx` (addFiles, addMats)

Two sub-tasks:

**A) Compute and store fingerprints after chunk creation:**
- In the **structured path** of `storeAsChunks()` (EPUB, DOCX, PDF — files with `_structured` output): after `Chunks.createBatch(chunks)` succeeds, compute `computeMinHash(chunk.content)` for each chunk with content, call `ChunkFingerprints.createBatch()`.
- In the **non-structured path** (TXT, PPTX, CSV — files without `_structured` output): chunk content isn't available until after `Chunks.updateContent()` flushes the `_pendingDocs` in StudyContext. Add a `computeAndStoreFingerprints(materialId)` helper that loads chunk content from DB and fingerprints it. Call this from StudyContext after the pending doc flush.

**B) Check for near-duplicates before extraction:**
- In `runExtractionV2()`: after the existing exact-hash dedup check, add a near-duplicate check. Load fingerprints for new chunks and all existing chunks in the course. Run `findNearDuplicates()`. If matches found, return early with `{ nearDuplicates: [...], success: false, needsUserDecision: true }`.
- The caller (StudyContext auto-extraction loop) checks for `needsUserDecision` and pauses to surface the choice.

**Lines changed:** ~60

### Step 1.5 · UXD · Near-Duplicate Detection UX

**Agent:** Study UX Designer
**Output:** `knowledge/design/near-dedup-ux-YYYY-MM-DD.md`

Design the user-facing near-duplicate prompt:
- **Where:** During the auto-extraction phase after upload. A blocking notification/modal before extraction proceeds.
- **What it shows:** "This content looks similar to [existing material name] ([X]% match)." For multi-chunk matches, summarize: "3 of 8 sections overlap with [material name]."
- **Actions:** "Same material — skip extraction" (mark matching chunks as extracted, optionally inherit skill bindings) vs "Different — continue with extraction" (proceed normally).
- **Visual treatment:** Inline within the processing status area, or a small modal. Not a full-screen interruption.
- **Edge case:** Multiple materials match different chunks. Show grouped by existing material.

**Escalate to CEO:** Visual treatment (aesthetic decisions)
**Handoff → DEV:** Design direction in `knowledge/design/`

### Step 1.6 · DEV · Implement Near-Dedup UI

**Agent:** Study Developer
**Input:** UX design from Step 1.5
**Files:** `src/StudyContext.jsx`, potentially a new component

Implement the user-facing prompt per UXD spec. Wire it into the auto-extraction loop:
- When `runExtractionV2` returns `needsUserDecision: true`, pause the extraction loop
- Show the near-duplicate prompt with match details
- On "Skip": mark matched chunks as extracted, copy skill bindings from matched chunks (if any), continue to next material
- On "Continue": re-call `runExtractionV2` with a `skipNearDedupCheck: true` flag to bypass the check

**Lines changed:** ~50-80

### Step 1.7 · QA · MinHash Near-Dedup Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps 1.2–1.6

Test scope:
- **Algorithm correctness:** Identical text → Jaccard 1.0. Completely different text → Jaccard ~0. 70% overlapping text → Jaccard near 0.7. Verify hash determinism (same text → same signature across runs).
- **Exact dedup still works:** Identical uploads still caught by the faster exact-hash path before MinHash runs.
- **Near-match detection:** Upload chapter, then upload slightly modified version (different headers, reformatted whitespace). Verify near-match detected.
- **User flow:** "Skip" correctly marks chunks as extracted and inherits bindings. "Continue" proceeds with normal extraction. Decision persists (re-opening the course doesn't re-prompt).
- **No false positives:** Upload genuinely different chapters from same textbook. Verify they are NOT flagged as near-duplicates.
- **Performance:** Measure fingerprint computation time for a typical chapter (should be <100ms). Measure comparison time for 100 existing fingerprints (should be <10ms).
- **Edge cases:** Empty chunks (no content to shingle). Very short chunks (<5 words, can't form a 5-gram). Chunks with only code/equations.
- **Build verification:** Release build passes.

**Output:** `knowledge/qa/minhash-near-dedup-testing-YYYY-MM-DD.md`

### Step 1.8 · UXV · Near-Dedup UX Validation

**Agent:** Study UX Validator
**Input:** Implemented UI from Step 1.6, design direction from Step 1.5

Validate:
- Is the near-duplicate prompt clear? Does the student understand what "similar content" means?
- Is "Skip" vs "Continue" the right framing? Would "Same material" vs "New material" be clearer?
- Does the prompt interrupt the flow appropriately? (Not too aggressive, not easy to miss)
- For multi-material matches, is the grouped display understandable?

**Output:** `knowledge/design/validation/near-dedup-ux-validation-YYYY-MM-DD.md`

### Phase 1 Checkpoint

- [ ] SA blueprint deposited
- [ ] DEV: minhash.js created, DB module added, upload flow hooked, UI implemented
- [ ] UXD design direction deposited
- [ ] QA: algorithm correctness verified, user flow tested, no false positives, performance acceptable
- [ ] UXV: validation report deposited
- [ ] Build verified

---

## Phase 2 — Concept Link Generation

### Step 2.1 · SA · Concept Link Architecture Blueprint

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/concept-link-generation-YYYY-MM-DD.md`

Design the concept link generation system:

**Similarity judgment approach:**
- After extraction completes for a material, gather all newly created/updated sub-skills from that extraction run.
- Group new skills by parent skill. For each parent skill group:
  - Load all existing sub-skills under the same parent (excluding the ones just created).
  - If existing skills count > 0, call Claude with a structured prompt:
    ```
    Given these NEW skills and these EXISTING skills under the same domain,
    identify pairs that represent the same underlying concept, prerequisite
    relationships, or strong topical relationships.
    
    Return JSON: { pairs: [{ newKey, existingKey, type, confidence, reason }] }
    Types: "same_concept" (>0.9 similarity), "prerequisite", "related"
    ```
  - Parse response, write to `concept_links` table.

**Cost analysis:**
- One Claude call per parent skill per extraction. Most extractions produce skills under 1-2 parent skills.
- Typical payload: 5-20 new skills × 20-100 existing skills = small prompt.
- Use Haiku for cost efficiency — this is structured comparison, not creative reasoning.

**When NOT to run:**
- First extraction for a course (no existing skills to compare against) — skip
- Only one parent skill with <2 sub-skills — skip
- Cross-course: only runs for skills under the SAME parent skill. Two skills under different parents are never compared (they're in different domains by definition).

**DB module spec:**
- `ConceptLinks.create({ subSkillAId, subSkillBId, similarityScore, linkType })` — enforce canonical ordering (a < b)
- `ConceptLinks.getBySkill(skillId)` — all links involving this skill (either side)
- `ConceptLinks.getByParent(parentSkillId)` — all links between skills under this parent
- `ConceptLinks.getByCourse(courseId)` — all links involving skills in this course (joins through sub_skills)
- `ConceptLinks.delete(linkId)` — standard delete
- `ConceptLinks.deleteBySkill(skillId)` — remove all links for a skill (CASCADE handles this, but explicit for cleanup)

**Integration point:**
- New function: `generateConceptLinks(courseId, newSkillIds)` in a new file `src/lib/conceptLinks.js`
- Called from `runExtractionV2()` return path, after extraction succeeds. Non-blocking — wrapped in try/catch, failures logged but don't fail the extraction.
- Also callable standalone for backfilling existing courses.

**Prompt design considerations:**
- The prompt must include skill names, descriptions, categories, and conceptKeys for both new and existing skills.
- Response format must be strictly JSON — use `extractJSON()` pattern from existing extraction code.
- Confidence threshold: only create links with confidence ≥ 0.7 from the LLM response.

**Migration Impact:** None — table already exists in schema.

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

### Step 2.2 · DEV · Add ConceptLinks DB Module

**Agent:** Study Developer
**Input:** DB module spec from Step 2.1
**File:** `src/lib/db.js`

Add `ConceptLinks` module with CRUD methods per blueprint. Canonical ordering enforced in `create()` (swap if a > b).

**Lines changed:** ~50

### Step 2.3 · DEV · Implement Concept Link Generator

**Agent:** Study Developer
**Input:** Architecture blueprint from Step 2.1
**Create:** `src/lib/conceptLinks.js`

Implement `generateConceptLinks(courseId, newSkillIds, options)`:
1. Load new skills by ID
2. Group by parent skill
3. For each parent, load existing skills under that parent (excluding new ones)
4. If no existing skills, skip
5. Build Claude prompt with structured skill data
6. Call Claude (Haiku) with prompt
7. Parse response with `extractJSON()`
8. Filter by confidence threshold (≥ 0.7)
9. Write to `ConceptLinks.create()` for each pair
10. Return `{ linksCreated, skipped, issues }`

Include the prompt template inline. Use `callClaude()` from `api.js`.

**Lines created:** ~120-150
**Files created:** 1 (`src/lib/conceptLinks.js`)

### Step 2.4 · DEV · Hook Concept Links into Extraction Flow

**Agent:** Study Developer
**Input:** Integration point from Step 2.1
**Files:** `src/lib/skills.js` (runExtractionV2), `src/lib/extraction.js` (extractCourse, enrichFromMaterial)

After extraction completes successfully (skills saved, bindings created), call `generateConceptLinks()` with the newly created skill IDs. Hook into three code paths:

**A) `runExtractionV2()` in skills.js:**
- After the successful `extractCourse()` or `extractChaptersOnly()` call, before returning.
- Collect all newly created skill IDs from the extraction result.
- Call `generateConceptLinks(courseId, newSkillIds)` in a try/catch. Log but don't fail.

**B) `extractCourse()` in extraction.js:**
- Return the list of created skill IDs in the result object so the caller can pass them to concept link generation.

**C) `enrichFromMaterial()` in extraction.js:**
- Same — return created skill IDs in the result.

**Lines changed:** ~30

**Output:** `knowledge/development/phase2-concept-links-YYYY-MM-DD.md` (covers Steps 2.2–2.4)

### Step 2.5 · QA · Concept Link Generation Testing

**Agent:** Study Security & Testing Analyst
**Input:** Completed Steps 2.2–2.4

Test scope:
- **Link creation:** Extract skills for two materials in the same course under the same parent skill. Verify concept links created between related skills.
- **Canonical ordering:** All links have `sub_skill_a_id < sub_skill_b_id`. No duplicate pairs.
- **Confidence filtering:** Links with LLM-reported confidence < 0.7 are not created.
- **Link types:** `same_concept`, `prerequisite`, and `related` types all work. Verify the LLM distinguishes them.
- **First extraction skip:** First material in a new course → no concept links generated (no existing skills to compare). Verify no errors, no empty API calls.
- **Cross-parent isolation:** Skills under different parent skills are never compared. Two skills — one under "Calculus", one under "Physics" — should never be linked, even if they have similar names.
- **Non-blocking:** Concept link generation failure does not fail the extraction. Verify extraction still succeeds if Claude API returns an error during link generation.
- **API cost sanity:** Log the prompt size for a typical link generation call. Verify it's reasonable (should be <2000 tokens for a typical batch).
- **Edge cases:** Course with only 1 sub-skill (nothing to link). Parent skill with 100+ existing skills (prompt might be large — verify truncation or batching).
- **Build verification.**

**Output:** `knowledge/qa/concept-link-generation-testing-YYYY-MM-DD.md`

### Phase 2 Checkpoint

- [ ] SA blueprint deposited
- [ ] DEV: DB module, generator, extraction hooks all implemented
- [ ] QA: link creation verified, ordering correct, non-blocking confirmed, cost reasonable
- [ ] Build verified
- [ ] Concept links populate after extraction for multi-material courses

---

## Phase 3 — Concept Link Consumers

Three independent sub-phases. Each adds a different consumer of the concept links data. Can be executed in any order.

### Phase 3A — Cross-Course Review in AI Context

#### Step 3A.1 · SA · AI Context Integration Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/concept-link-ai-context-YYYY-MM-DD.md`

Design how concept links inform the AI tutoring context:

- Where in the prompt: Add a `CROSS-SKILL CONNECTIONS` section after the existing `SKILL TREE` section in `buildContext()` and `buildFocusedContext()`.
- What it contains: For each active skill in the session, list any linked skills from other courses with their mastery state. Example: "Power Rule (this course) → linked to Power Rule Application in PHYS 201 (85% ready, Level 3)"
- When to include: Only when the active skill has at least one concept link. Don't clutter the prompt with zero-link skills.
- Token budget: Cap at ~500 tokens for the cross-skill section. Prioritize `same_concept` links over `related`.
- Data flow: `buildContext`/`buildFocusedContext` → load concept links for active skills → format as context string → insert into prompt.

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

#### Step 3A.2 · DEV · Implement AI Context Integration

**Agent:** Study Developer
**Input:** Architecture from Step 3A.1
**File:** `src/lib/study.js`

Add `buildConceptLinkContext(skills)` helper. Returns a formatted string for the prompt, or empty string if no links exist. Integrate into `buildContext()` and `buildFocusedContext()`.

**Lines changed:** ~40-60

#### Step 3A.3 · QA · AI Context Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- Prompt contains cross-skill connections when links exist
- Prompt does NOT contain the section when no links exist (no empty headers)
- Token count stays within budget
- Links from other courses correctly show that course's mastery data
- `same_concept` links prioritized over `related`

**Output:** `knowledge/qa/concept-link-ai-context-testing-YYYY-MM-DD.md`

### Phase 3B — Mastery Transfer

#### Step 3B.1 · SA · Mastery Transfer Architecture

**Agent:** Study Systems Analyst
**Output:** `knowledge/architecture/mastery-transfer-YYYY-MM-DD.md`

Design how concept links influence mastery:

- **Not automatic.** Mastery transfer should be a suggestion, not a silent write. When a student encounters a skill that has a `same_concept` link to a high-mastery skill in another course, the AI should acknowledge: "You've seen this concept in [other course] — let's see if you can apply it here."
- **Diagnostic-first.** When a linked skill is encountered for the first time, start with a diagnostic question at the linked skill's mastery level. If the student passes, credit partial mastery (spec says 0.3x weight). If they fail, start from scratch — the link was informational, not a mastery bypass.
- **Implementation:** In `applySkillUpdates()`, when processing a skill update, check if the skill has `same_concept` links. If linked skill has high mastery (retrievability > 0.7) and current skill has no mastery record, apply a transfer bonus: `initialDifficulty = linkedSkill.difficulty * 0.7` (easier start) and `initialStability = linkedSkill.stability * 0.3` (some stability credit).
- **One-time only.** Transfer bonus applies once — on first mastery record creation. After that, FSRS handles it normally.

**Handoff → DEV:** Blueprint in `knowledge/architecture/`

#### Step 3B.2 · DEV · Implement Mastery Transfer

**Agent:** Study Developer
**Input:** Architecture from Step 3B.1
**File:** `src/lib/study.js` (applySkillUpdates)

Add transfer bonus logic in `applySkillUpdates()` when `existing === null` (first interaction with a skill). Check for `same_concept` links, apply initial difficulty/stability bonus if linked skill has high mastery.

**Lines changed:** ~30

#### Step 3B.3 · QA · Mastery Transfer Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- **Transfer fires once:** First interaction with a linked skill gets the bonus. Second interaction does NOT re-apply.
- **FSRS integrity:** After transfer, subsequent FSRS updates work normally. The transferred initial state doesn't break the algorithm.
- **No transfer without link:** Skills without concept links get standard `initCard()` — no change.
- **Threshold:** Transfer only fires when linked skill retrievability > 0.7.
- **Cross-course:** Transfer works across courses (Calc skill boosts Physics skill).
- **Same-course:** Transfer also works within a course (if two skills in same course are linked).

**Output:** `knowledge/qa/mastery-transfer-testing-YYYY-MM-DD.md`

### Phase 3C — Profile Screen Display

#### Step 3C.1 · UXD · Concept Link Profile Display Design

**Agent:** Study UX Designer
**Output:** `knowledge/design/concept-link-profile-YYYY-MM-DD.md`

Design how concept links are surfaced in the ProfileScreen:

- **Where:** On individual sub-skill cards when expanded. A "Connections" section showing linked skills with their course name and mastery.
- **Visual:** Compact list — "Also appears in: PHYS 201 (72% ready), MATH 102 (91% ready)". Or a small graph/tree visualization.
- **Parent skill level:** If concept links exist, show how many courses contribute to this parent skill domain. "Calculus — 3 courses, 47 sub-skills"
- **Interaction:** Tapping a linked skill could navigate to that course's profile view or highlight the linked skill.

**Escalate to CEO:** Visual treatment, whether to include a graph visualization
**Handoff → DEV:** Design in `knowledge/design/`

#### Step 3C.2 · DEV · Implement Profile Display

**Agent:** Study Developer
**Input:** UXD design from Step 3C.1
**File:** `src/screens/ProfileScreen.jsx`

Add concept link display to expanded sub-skill cards. Load links lazily when a skill is expanded (not on profile load — would be too many queries).

**Lines changed:** ~40-60

#### Step 3C.3 · QA · Profile Display Testing

**Agent:** Study Security & Testing Analyst

Test scope:
- Links display correctly for skills that have them
- No links section shown for skills without links
- Cross-course links show correct course name and mastery
- Lazy loading: expanding a skill loads links without blocking the profile render
- Performance: expanding a skill with 10 links renders in <200ms

**Output:** `knowledge/qa/concept-link-profile-testing-YYYY-MM-DD.md`

#### Step 3C.4 · UXV · Profile Display Validation

**Agent:** Study UX Validator
**Input:** Implemented UI from Step 3C.2, design from Step 3C.1

Validate:
- Are connections meaningful? Does a student understand what "Also appears in PHYS 201" means?
- Is the display overwhelming for skills with many links?
- Is the interaction (tap to navigate) discoverable?

**Output:** `knowledge/design/validation/concept-link-profile-validation-YYYY-MM-DD.md`

### Phase 3 Checkpoint

- [ ] 3A: AI context includes cross-skill connections
- [ ] 3B: Mastery transfer fires on first encounter with linked skill, FSRS integrity verified
- [ ] 3C: Profile screen shows concept links on expanded skills
- [ ] All QA reports deposited — no 🔴 Critical
- [ ] All builds verified

---

## Final PM Status Update

**Agent:** Study Product Analyst

Update `PROJECT_STATUS.md`:
- Move "Concept links (cross-skill similarity)" from "Specified But Not Built" to "What Is Working"
- Move "MinHash LSH near-dedup" from "Specified But Not Built" to "What Is Working"
- Add entries for mastery transfer, AI context integration, profile display
- Update department activity dates
- Update codebase summary (new files: minhash.js, conceptLinks.js)

---

## Estimated Scope

| Phase | Steps | New Files | Lines Changed | Risk |
|---|---|---|---|---|
| 1 (MinHash) | 1.1–1.8 | 1 (minhash.js) | ~300 | Medium (UX flow) |
| 2 (Link gen) | 2.1–2.5 | 1 (conceptLinks.js) | ~250 | Medium (API cost) |
| 3A (AI context) | 3A.1–3A.3 | 0 | ~50 | Low |
| 3B (Transfer) | 3B.1–3B.3 | 0 | ~30 | Medium (FSRS) |
| 3C (Profile) | 3C.1–3C.4 | 0 | ~50 | Low |

**Total:** ~680 lines added, 2 new files.

---

## Knowledge Artifacts Produced

| Phase | Agent | Artifact | Location |
|---|---|---|---|
| 1 | SA | MinHash blueprint | `knowledge/architecture/minhash-near-dedup-YYYY-MM-DD.md` |
| 1 | UXD | Near-dedup UX design | `knowledge/design/near-dedup-ux-YYYY-MM-DD.md` |
| 1 | DEV | Phase 1 dev log | `knowledge/development/phase1-minhash-YYYY-MM-DD.md` |
| 1 | QA | MinHash test report | `knowledge/qa/minhash-near-dedup-testing-YYYY-MM-DD.md` |
| 1 | UXV | Near-dedup validation | `knowledge/design/validation/near-dedup-ux-validation-YYYY-MM-DD.md` |
| 2 | SA | Concept link blueprint | `knowledge/architecture/concept-link-generation-YYYY-MM-DD.md` |
| 2 | DEV | Phase 2 dev log | `knowledge/development/phase2-concept-links-YYYY-MM-DD.md` |
| 2 | QA | Link generation test report | `knowledge/qa/concept-link-generation-testing-YYYY-MM-DD.md` |
| 3A | SA | AI context blueprint | `knowledge/architecture/concept-link-ai-context-YYYY-MM-DD.md` |
| 3A | QA | AI context test report | `knowledge/qa/concept-link-ai-context-testing-YYYY-MM-DD.md` |
| 3B | SA | Mastery transfer blueprint | `knowledge/architecture/mastery-transfer-YYYY-MM-DD.md` |
| 3B | QA | Mastery transfer test report | `knowledge/qa/mastery-transfer-testing-YYYY-MM-DD.md` |
| 3C | UXD | Profile display design | `knowledge/design/concept-link-profile-YYYY-MM-DD.md` |
| 3C | DEV | Phase 3 dev log | `knowledge/development/phase3-concept-link-consumers-YYYY-MM-DD.md` |
| 3C | QA | Profile display test report | `knowledge/qa/concept-link-profile-testing-YYYY-MM-DD.md` |
| 3C | UXV | Profile display validation | `knowledge/design/validation/concept-link-profile-validation-YYYY-MM-DD.md` |

---

## Agent Involvement Per Phase

| Phase | SA | DEV | UXD | UXV | QA | PM |
|---|---|---|---|---|---|---|
| 1 — MinHash | Blueprint | Algorithm + DB + hooks + UI (5 steps) | Near-dedup prompt design | Validate prompt UX | Algorithm + flow + perf | — |
| 2 — Link gen | Blueprint | DB + generator + hooks (3 steps) | — | — | Link creation + cost | — |
| 3A — AI context | Blueprint | Prompt integration (1 step) | — | — | Prompt content | — |
| 3B — Transfer | Blueprint | FSRS integration (1 step) | — | — | FSRS integrity | — |
| 3C — Profile | — | Profile UI (1 step) | Connection display design | Validate display | Rendering + perf | — |
| Final | — | — | — | — | — | Status update |

---

## Post-Execution

After all phases complete, update `knowledge/KNOWLEDGE_INDEX.md` with all new files deposited during execution.
