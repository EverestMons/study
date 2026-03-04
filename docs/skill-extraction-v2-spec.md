# Skill Extraction System v2 — Design Specification

**Date:** March 1, 2026
**Status:** Implementation Phase 2 complete (schema + data layer + extraction pipeline)
**Depends on:** v2 schema (001_v2_schema.sql), v2 parsers (epubParser, docxParser, chunker), db.js

### Implementation Progress

| Phase | Status | Files | Notes |
|---|---|---|---|
| 1. Schema & data layer | ✅ Done | `002_skill_extraction_v2.sql`, `db.js` | Migration adds 13 columns to sub_skills, skill_prerequisites table, chunk_skill_bindings relaxed. db.js: all 14 Section 16 items implemented. |
| 2. Extraction pipeline | ✅ Done | `extraction.js` (1,081 lines) | Steps 0-4 + orchestrator + enrichment. Pure functions are deterministic; only 3 LLM call sites (chapter extract, cross-chapter wiring, enrichment). |
| 3. Integration (UI wiring) | ✅ Done | `App.jsx`, `skills.js`, `db.js` | V2 extraction trigger, v2 skill display, context builders, deactivation guards. All DB.getSkills calls guarded. |
| 4. Re-extraction flow | ✅ Done | `extraction.js`, `skills.js`, `db.js` | matchExtractedSkills (3-tier: exact key, fuzzy prefix, normalized name), reExtractCourse orchestrator, runExtractionV2 auto-routes first/enrich/re-extract. |

**Key implementation decisions made during Phase 1-2:**
- `getDb` exported from db.js (needed for raw transaction control in extraction orchestrator)
- `getAllConceptKeys()` expanded to include `evidence` and `parent_skill_id` (enrichment prompt needs both)
- `enrichFromMaterial()` falls back to `extractCourse()` when no existing skills found (return shapes differ — caller must handle)
- 2-second delay between chapter extraction calls for rate limiting
- `resetAll()` now requires `{ confirmed: true }` parameter as safety guard

**Key implementation decisions made during Phase 3:**
- `loadSkillsV2()` in skills.js loads v2 skills with resolved prerequisites and FSRS mastery
- `loadSkillsAuto()` auto-detects v1/v2 and returns `{ skills, isV2 }` — primary entry point for all skill loading
- `runExtractionV2()` wraps `extractCourse`/`enrichFromMaterial` with UI callback integration
- `SubSkills.update()` added to db.js for skill flag/edit operations
- `buildContext`/`buildFocusedContext` in study.js already handled both v1/v2 shapes (using `s.conceptKey || s.id`, object prereqs)
- All 12 `DB.getSkills`/`DB.saveSkills` calls in App.jsx are guarded: v2 paths use `loadSkillsV2`/`loadSkillsAuto`, v1 paths only run when `hasV2Skills()` returns false
- Skill card rendering shows v2 fields (blooms level, skill type, mastery criteria, named prerequisites, FSRS review state)
- `runExtraction()` detects v2 materials via `isV2Material()` and delegates to `runExtractionV2` — v1 path unchanged
- Re-activation of v2 materials just re-sets chunk status (skills already in DB), no merging needed

---

## 1. Problem Statement

### What's wrong with current extraction

The current pipeline (`extractSkillTree` in skills.js) treats the LLM as a black box: send raw text, get skills back. It has no structural awareness, no granularity constraints, no concept of skill identity beyond an unstable auto-generated ID.

**Specific failures at v2 scale:**

- **373 API calls** for one EPUB textbook (one per section). ~$3.73 on Haiku, ~19 minutes wall time.
- **Merge bottleneck** — 1,000+ raw skills dumped into one merge prompt. Exceeds output token limits.
- **No skill identity** — re-extraction produces different names, different IDs. All student progress data is orphaned.
- **No structural awareness** — v2 parsers extract bold terms, definitions, heading hierarchy, equation indicators. Current extraction ignores all of it.
- **LLM validates its own output** — `validateSkillTree` is another LLM call that shares extraction's blind spots.
- **Unbounded granularity** — prompt says "be granular" with no target count. Same chapter can produce 5 or 50 skills depending on LLM mood.

### Why this matters commercially

Skill extraction is the value gate. The app is free; users pay for document processing (textbooks, assignments). Extraction quality directly determines:

- Whether Practice Mode generates useful problems (bad skills → bad problems → churn)
- Whether assignment decomposition maps correctly (missing skills → "this doesn't understand my course")
- Whether spaced review works (vague skills → meaningless decay tracking)
- Whether users trust incremental uploads (re-extraction destroys progress → users stop uploading)

### Design goals

1. **3-15 skills per chapter, 50-120 per course** — constrained granularity backed by structural evidence (typical chapters produce 3-8; dense chapters with many sections may produce up to 15)
2. **~$0.30-0.50 per textbook** — 10x cheaper than current pipeline
3. **~3 minutes per textbook** — 6x faster than current pipeline
4. **Incremental enrichment** — second upload grows existing skills, never destroys them
5. **Stable identity** — re-extraction matches existing skills by concept, preserving all progress data
6. **Empirical fitness** — skill quality validated by actual downstream use, not LLM self-assessment

---

## 2. Skill Model

### Schema

See Section 15 for the full migration SQL (`002_skill_extraction_v2.sql`). Key additions to `sub_skills`: `concept_key`, `category`, `blooms_level`, `mastery_criteria` (JSON), `evidence` (JSON), `fitness` (JSON), `extraction_model`, `schema_version`, `merged_from` (JSON), `is_archived`, `uuid`. A new `skill_prerequisites` table stores directed prerequisite relationships.

**Note on base schema dependency (verified against 001_v2_schema.sql):**
- `sub_skills.created_at` — exists in 001 ✓
- `sub_skills.updated_at` — NOT in 001, added by 002 migration
- `courses.updated_at` — exists in 001 ✓
- `materials.updated_at` — exists in 001 ✓
- `chunks.updated_at` — exists in 001 ✓
- `parent_skills.id` is TEXT (not auto-increment INTEGER) — `ParentSkills.create()` generates UUID, returns id string
- `chunk_skill_bindings.extraction_context` was NOT NULL in 001 — relaxed to nullable in 002 for fallback bindings

### Full skill object (JS representation)

```js
{
  // === Identity ===
  id: 47,                           // auto-increment, local FK only
  uuid: "a1b2c3d4-...",            // sync-safe global identity
  parentSkillId: "ps-digital-logic", // parent_skills FK (the RPG domain)
  conceptKey: "combinational-circuits/half-adder-design",
  name: "Half Adder Design",

  // === Rich description ===
  description: "Design a half adder circuit using AND and XOR gates",
  masteryCriteria: [
    {
      text: "Produce correct truth table for sum and carry outputs",
      source: "Mano Digital Design Ch.3",
      addedAt: "2026-09-01T..."
    },
    {
      text: "Draw gate-level diagram from specification",
      source: "Mano Digital Design Ch.3",
      addedAt: "2026-09-01T..."
    },
    {
      text: "Explain why half adder cannot handle carry-in",
      source: "Lecture Week 5 transcript",
      addedAt: "2026-10-03T..."
    }
  ],

  // === Classification ===
  category: "Combinational Circuits",
  skillType: "procedural",   // procedural | conceptual | recall | synthesis
  bloomsLevel: "apply",      // remember | understand | apply | analyze | evaluate | create

  // === Prerequisites (directed graph) ===
  // Stored in skill_prerequisites table, not on the skill directly.
  // Each row records: sub_skill_id (this skill), prerequisite_id, source ('within_chapter' | 'cross_chapter').
  // Queried via SkillPrerequisites.getForSkill(skillId) → [prerequisiteSkillId, ...]

  // === Source anchoring (mutable — grows with uploads) ===
  // Stored via chunk_skill_bindings table, not on the skill directly.
  // Each binding records: chunk_id, extraction_context, confidence, extracted_at.

  // === Structural evidence ===
  evidence: {
    anchorTerms: ["half adder", "sum bit", "carry bit"],
    definitionsFound: ["half adder: a combinational circuit that performs..."],
    examplesInSource: 2,
    equationPresence: true,
    figureReferences: ["Figure 3.15", "Figure 3.16"]
  },

  // === Downstream fitness (empirical, accumulated) ===
  fitness: {
    practiceAttempts: 0,
    practiceSuccesses: 0,
    tutoringReferences: 0,
    assignmentMappings: 0,
    lastUsed: null
  },

  // === Lifecycle ===
  isArchived: 0,             // soft-delete: 0 = active, 1 = archived

  // === Extraction metadata ===
  extractionModel: "claude-haiku-4-5",
  schemaVersion: 2,
  mergedFrom: [],   // IDs of skills absorbed during re-extraction
  sourceCourseId: "course-uuid"
}
```

### Field rationale

**conceptKey** — Normalized `{category}/{kebab-name}`. Stable across re-extractions. Generated by code from LLM output (lowercase, strip punctuation, kebab-case). Used as the primary matching key for incremental enrichment and re-extraction identity.

**masteryCriteria[]** — Array of testable criteria, each tagged with source document and timestamp. Additive: new uploads add criteria, never replace. Directly consumed by:
- Practice Mode problem generation ("generate a Tier 3 problem testing criterion 2")
- Pre-question diagnostics ("can you do criterion 1?")
- Self-assessment calibration ("rate confidence on each criterion")
- Assignment decomposition ("question 3b requires criteria 1 and 3")

**skillType** — Derived from structural signals during extraction:
- `procedural`: equation indicators > 5 OR worked examples > 0 OR "solve/calculate/design" in heading
- `conceptual`: definitions > 0 AND equations < 3 AND "explain/describe/compare" patterns
- `recall`: definitions > 2 AND no examples AND no equations (vocabulary-heavy sections)
- `synthesis`: "design/create/build/analyze" in heading OR combines concepts from multiple sections

**bloomsLevel** — Instructor-validated taxonomy level. Inferred from content signals:
- `remember`: recall skill type, definition-heavy, no application
- `understand`: conceptual skill type, explanatory content
- `apply`: procedural skill type with worked examples
- `analyze`: comparison/contrast content, multi-variable relationships
- `evaluate`: "compare approaches" or "which is better" content
- `create`: design/synthesis problems, open-ended specifications

**evidence** — Structural signals that anchored this skill. Used for:
- Auditing extraction quality (skill with no evidence is suspicious)
- Constraining LLM on re-extraction ("these terms already map to this skill")
- Informing practice problem generation (equations present → include calculation problems)

**fitness** — Empirical quality data accumulated over the skill's lifetime. NOT set at extraction time. See Section 5 (Downstream Integration → Fitness accumulation) for exactly which systems update which counters, and Section 10 (Fitness Validation) for flagging rules. Success rate is derived: `practiceSuccesses / practiceAttempts`.

**uuid** — Globally unique identifier for future cloud sync. The integer `id` remains for local FK performance. Phase 2 sync uses `uuid` as the sync key. Generated via `crypto.randomUUID()` on every insert.

**isArchived** — Soft-delete flag. Archived skills preserve all mastery data but are excluded from UI and tutoring context. Same pattern as document deactivation — nothing is ever hard-deleted.

---

## 3. Three-Tier Skill Hierarchy

### Architecture

```
Domain (CIP 2-digit family)          ← "Engineering" — static, ~50 options
  └── Parent Skill (CIP code)        ← "Electrical Engineering (14.10)" — created on first extraction
        └── Sub-skill (conceptKey)   ← "Half Adder Design" — extracted per chapter
```

### Domain tier: CIP two-digit families

Domains are a static lookup. The first two digits of any CIP code map to a domain. These never change and don't need a database table — just a constant.

```js
const CIP_DOMAINS = {
  "01": "Agriculture & Natural Resources",
  "03": "Natural Resources & Conservation",
  "04": "Architecture & Related Services",
  "05": "Area, Ethnic & Gender Studies",
  "09": "Communication & Journalism",
  "10": "Communications Technologies",
  "11": "Computer & Information Sciences",
  "12": "Culinary, Entertainment & Personal Services",
  "13": "Education",
  "14": "Engineering",
  "15": "Engineering Technologies",
  "16": "Foreign Languages & Linguistics",
  "19": "Family & Consumer Sciences",
  "22": "Legal Professions & Studies",
  "23": "English Language & Literature",
  "24": "Liberal Arts & General Studies",
  "25": "Library Science",
  "26": "Biological & Biomedical Sciences",
  "27": "Mathematics & Statistics",
  "29": "Military Technologies",
  "30": "Multi/Interdisciplinary Studies",
  "31": "Parks, Recreation & Fitness",
  "38": "Philosophy & Religious Studies",
  "40": "Physical Sciences",
  "41": "Science Technologies",
  "42": "Psychology",
  "43": "Homeland Security & Criminal Justice",
  "44": "Public Administration & Social Service",
  "45": "Social Sciences",
  "46": "Construction Trades",
  "47": "Mechanic & Repair Technologies",
  "48": "Precision Production",
  "49": "Transportation & Materials Moving",
  "50": "Visual & Performing Arts",
  "51": "Health Professions",
  "52": "Business, Management & Marketing",
  "54": "History",
};
```

### Parent skill tier: CIP code as identity

The `parent_skills` table already has `cip_code`. This becomes the stable identity — not mapped to CIP, but IS the CIP code.

**How it works:**
- First extraction for a course: LLM reads content and outputs `cipCode: "14.10"` alongside sub-skills
- System checks: does a parent skill with `cip_code = "14.10"` exist?
  - **No** → create parent skill: `{ cip_code: "14.10", name: "Electrical Engineering", is_custom: 0 }`
  - **Yes** → attach new sub-skills to existing parent
- Domain derived automatically: `cipCode.substring(0, 2)` → "14" → "Engineering"

**Cross-course aggregation:** Student takes "ECEN 2350 Digital Logic" and "ECEN 3250 Microprocessors." Both map to CIP 14.10. Sub-skills from both courses feed into the same parent. Parent skill level reflects mastery across both courses. This is the RPG payoff.

**Display name:** LLM suggests a display name during extraction (e.g., "Digital Logic Design"). The parent skill uses this as its `name` field. If the parent already exists from a previous course, the existing name is kept.

**User override:** If the LLM misclassifies (rare), user can reassign the CIP code with one click from a searchable list. Sub-skills follow the parent.

### Extraction prompt addition

CIP assignment is integrated directly into Section 4 Step 2's initial extraction prompt. On the FIRST chapter only, the LLM wraps its response in `{ cipCode, parentDisplayName, subSkills: [...] }`. Subsequent chapters respond with only the skills array and inherit the CIP assignment from the first chapter.

### Level computation

Parent skill level aggregates sub-skill mastery across all courses under that CIP:

```js
async function computeParentLevel(parentSkillId) {
  const db = await getDb();
  // Get all sub-skills under this parent, joined with mastery data
  const rows = await db.select(
    `SELECT ss.id, COALESCE(m.total_mastery_points, 0) as points
     FROM sub_skills ss
     LEFT JOIN sub_skill_mastery m ON m.sub_skill_id = ss.id
     WHERE ss.parent_skill_id = ? AND ss.is_archived = 0`,
    [parentSkillId]
  );
  
  const totalMastery = rows.reduce((sum, r) => sum + r.points, 0);
  
  // RPG curve: early levels fast, later levels require exponentially more
  return Math.floor(Math.sqrt(totalMastery / 10));
}
```

Target: Level 1-3 after first course, Level 5-8 after 2-3 courses in same domain, Level 10+ for deep specialization.

---

## 4. Extraction Pipeline

### Overview

```
Upload → Parse → Chunk → [Deterministic Pre-Processing] → [LLM Extraction] → [Post-Processing] → Save
                                    ↑                            ↑
                            structural_metadata           existing skills as context
                            from v2 chunker              (for incremental uploads)
```

Two modes:
1. **Initial extraction** — no existing skills for this course. Full extraction from scratch.
2. **Incremental enrichment** — existing skills present. Match new content to existing, add what's new.

Both modes use chapter-level batching.

### Step 0: Chapter grouping (code, instant)

Group chunks by chapter using `section_path`. All chunks whose `section_path` starts with the same top-level number belong to the same chapter group.

```
section_path "3.4.4" → chapter "3"
section_path "3.5"   → chapter "3"
section_path "12.1"  → chapter "12"
section_path "A.2"   → appendix group "A"
```

For each chapter group, aggregate:

```js
{
  chapter: "3",
  chunkIds: ["uuid-1", "uuid-2", ...],
  chunkCount: 42,
  totalChars: 187000,
  sectionHeadings: [
    "3.4.4 Kmap Simplification for Three Variables",
    "3.5 DIGITAL COMPONENTS",
    "3.6 COMBINATIONAL CIRCUITS",
    ...
  ],
  aggregateMetadata: {
    boldTerms: ["half adder", "full adder", ...],   // union across all chunks, deduped
    definitions: ["half adder: a combinational...", ...],
    definitionCount: 14,
    exampleCount: 8,
    equationIndicators: 47,
    tableCount: 6,
    imageCount: 12,
    codeBlockCount: 0
  },
  estimatedSkillRange: [6, 12]   // formula below
}
```

**Skill count estimation formula:**
```
base = max(sectionHeadings.length, ceil(definitionCount / 2))
floor = max(3, ceil(base * 0.7))
ceiling = min(15, max(base * 2, floor + 2))
estimatedSkillRange = [floor, max(ceiling, floor + 1)]
```

The final `max(ceiling, floor + 1)` guarantees the range is never inverted (min > max), which could happen with very large chapters where the floor exceeds the cap. In practice, chapters with 15+ distinct sections are rare — and if they occur, the chapter size split (below) kicks in first.

Rationale: each section with a distinct heading likely teaches at least one concept. Definitions are strong skill anchors. Floor prevents trivially small extraction; ceiling prevents explosion.

**Chapter size limit:** If a chapter group exceeds 80,000 chars, split at the highest-level section boundary (largest gap in heading_level) within the chapter. Each sub-group gets its own LLM call.

### Step 1: Deterministic pre-processing (code, instant)

For each chapter group, build a **structural profile** that constrains the LLM call.

```js
function buildChapterProfile(chapterGroup) {
  const { sectionHeadings, aggregateMetadata } = chapterGroup;
  const { boldTerms, definitions, exampleCount, equationIndicators } = aggregateMetadata;

  // Classify content type from structural signals
  const contentSignals = {
    procedural: equationIndicators > 5 || exampleCount > 0,
    conceptual: definitions.length > 2 && equationIndicators < 3,
    quantitative: equationIndicators > 10,
    referenceHeavy: aggregateMetadata.tableCount > 3,
    codeHeavy: aggregateMetadata.codeBlockCount > 2,
  };

  // Build candidate skill list from structural elements
  const candidates = [];

  // Bold terms as concept candidates
  for (const term of boldTerms) {
    candidates.push({
      term,
      source: 'bold_term',
      confidence: 'medium',
    });
  }

  // Definitions as strong skill anchors
  for (const def of definitions) {
    const term = def.split(':')[0].trim();
    // Upgrade confidence if this term is also bold
    const existing = candidates.find(c => c.term.toLowerCase() === term.toLowerCase());
    if (existing) {
      existing.confidence = 'high';
      existing.definition = def;
    } else {
      candidates.push({
        term,
        source: 'definition',
        confidence: 'high',
        definition: def,
      });
    }
  }

  return {
    contentSignals,
    candidates,
    estimatedSkillRange: chapterGroup.estimatedSkillRange,
    sectionHeadings: sectionHeadings,
  };
}
```

### Step 2: LLM extraction (Haiku, one call per chapter)

#### Initial extraction prompt

```
You are a curriculum analyst extracting skills from a textbook chapter.

CHAPTER STRUCTURE:
- Sections: {sectionHeadings.length}
{sectionHeadings as bulleted list with char counts}

STRUCTURAL ANALYSIS (from document parsing):
- Bold terms identified ({count}): {list}
- Definitions found ({count}): {list with first 80 chars each}
- Worked examples detected: {count}
- Equation/math content: {"heavy" | "moderate" | "light" | "none"}
- Tables: {count}
- Code blocks: {count}

TARGET: Extract {min}-{max} skills from this chapter.

CHAPTER CONTENT:
{full markdown text of all sections in this chapter}

INSTRUCTIONS:
1. Each bold term is a candidate concept. Confirm it as a skill, merge it with related terms, or reject it (not a standalone learnable concept).
2. Each definition anchors at least one skill.
3. Every skill must pass these tests:
   - DIAGNOSTIC TEST: Can you ask ONE question to check if a student knows this? If not, it's too vague.
   - PRACTICE TEST: Can you generate 5 different problems at varying difficulty? If not, it's too narrow.
   - DECAY TEST: Can a student forget THIS skill independently of other skills? If not, merge it.
4. Classify each skill:
   - skillType: procedural (has steps/calculations) | conceptual (understanding/explanation) | recall (definitions/facts) | synthesis (combining multiple concepts)
   - bloomsLevel: remember | understand | apply | analyze | evaluate | create

FOR THE FIRST CHAPTER ONLY, also determine the academic classification:
Output a CIP (Classification of Instructional Programs) code that best describes
the subject. Format: "XX.XX" (e.g., "14.10" for Electrical Engineering,
"27.01" for Mathematics, "11.01" for Computer Science).

RESPOND WITH ONLY a JSON object (first chapter) or array (subsequent chapters).

First chapter response format:
{
  "cipCode": "14.10",
  "parentDisplayName": "Digital Logic Design",
  "subSkills": [ ...array of skills below... ]
}

Subsequent chapters respond with ONLY the skills array.

Skill schema:
[{
  "name": "Half Adder Design",
  "conceptKey": "combinational-circuits/half-adder-design",
  "description": "Design a half adder circuit using AND and XOR gates",
  "masteryCriteria": [
    "Produce correct truth table for sum and carry outputs",
    "Draw gate-level diagram from specification",
    "Trace signal propagation through the circuit"
  ],
  "category": "{chapter topic}",
  "skillType": "procedural",
  "bloomsLevel": "apply",
  "prerequisites": ["concept-key-of-prereq"],
  "evidence": {
    "anchorTerms": ["half adder", "sum bit", "carry bit"],
    "definitionsFound": ["half adder: a combinational circuit..."],
    "examplesInSource": 2,
    "equationPresence": true,
    "figureReferences": ["Figure 3.15", "Figure 3.16"]
  },
  "sourceChunkLabels": ["3.6 COMBINATIONAL CIRCUITS"]
}]

RULES:
- Prerequisites reference concept keys of OTHER skills in this chapter (cross-chapter wired later).
- conceptKey format: kebab-case "{category}/{skill-name}". Must be deterministic — same content should always produce the same key.
- masteryCriteria: 2-4 testable statements per skill. Specific enough that each could be a test question.
- DO NOT extract skills for front matter, table of contents, or index entries.
- DO NOT create skills for individual vocabulary words unless they represent a distinct learnable concept.
- Sections with only worked examples may be practice material for a skill from an adjacent section — don't create a separate skill for them.
```

#### Incremental enrichment prompt (upload 2+)

```
You are a curriculum analyst. A student has uploaded new material for a course that already has extracted skills.

EXISTING SKILLS (all courses for this student):
{for each skill: conceptKey, name, category, masteryCriteria[], evidence.anchorTerms[]}

NEW MATERIAL — {materialLabel}:
{section headings list}

STRUCTURAL ANALYSIS:
{same as initial — bold terms, definitions, etc.}

NEW MATERIAL CONTENT:
{full text}

YOUR JOB:
1. For each concept in the new material, check if it matches an existing skill.
   Match by CONCEPT, not by exact wording. "K-map reduction" and "Karnaugh Map Simplification" are the same concept.
2. For MATCHING concepts:
   - Return the existing skill's conceptKey
   - Add any NEW mastery criteria the new material reveals (things the textbook didn't cover)
   - Add any new anchor terms or definitions
   - Do NOT duplicate existing criteria
3. For GENUINELY NEW concepts (not covered by any existing skill):
   - Create a new skill with full schema (same as initial extraction)
4. Apply the same quality tests: diagnostic, practice, decay.
5. For each NEW skill, include a `cipCode` and `parentDisplayName` so it can be assigned to the correct parent skill. Use the same CIP code as the course's existing skills unless the new concept belongs to a different discipline.

RESPOND WITH ONLY a JSON object:
{
  "enrichments": [
    {
      "existingConceptKey": "combinational-circuits/half-adder-design",
      "newCriteria": ["Explain why half adder cannot handle carry-in"],
      "newAnchorTerms": ["carry propagation"],
      "newDefinitions": [],
      "sourceLabel": "Lecture Week 5"
    }
  ],
  "newSkills": [
    {
      ...same skill schema as initial extraction...
      "cipCode": "14.10",
      "parentDisplayName": "Electrical Engineering"
    }
  ],
  "unmatchedExisting": ["concept-keys of existing skills NOT covered in new material"]
}
```

### Step 3: Post-processing (code, no LLM)

Run after each chapter extraction. All checks are deterministic.

**MasteryCriteria wrapping:** The LLM outputs `masteryCriteria` as an array of bare strings (e.g., `["Produce correct truth table..."]`). Post-processing wraps each into the storage format `{ text, source, addedAt }` where `source` is the material label (e.g., "Mano Digital Design Ch.3") and `addedAt` is the current timestamp. The same wrapping applies to `newCriteria` from the enrichment response.

**Chunk binding resolution:** The LLM outputs `sourceChunkLabels: ["3.6 COMBINATIONAL CIRCUITS"]` per skill. These are section headings, not chunk IDs. Post-processing resolves them to chunk IDs by matching against the chapter group's `sectionHeadings` list (from Step 0), then looking up the corresponding `chunkIds`. Each resolved chunk gets a `chunk_skill_bindings` row with `confidence = 1.0` and `extraction_context` set to the matched heading. Unresolved labels (typos, hallucinated headings) fall back to binding the skill to ALL chunks in the chapter group — the skill came from this chapter, we just can't pin it to a specific section.

**Prerequisite handling:** The LLM outputs `prerequisites: ["concept-key-of-prereq"]` per skill. After saving skills to `sub_skills`, resolve each concept key to a `sub_skill_id` and insert into `skill_prerequisites` with `source = 'within_chapter'`. Unresolved concept keys (typos, hallucinations) are logged and skipped — the cross-chapter wiring pass (Step 4) will add links the LLM missed.

**Note on `concept_links` table:** The existing `concept_links` table in the v2 schema stores *similarity/relatedness* between skills (bidirectional, with `CHECK (sub_skill_a_id < sub_skill_b_id)`). Prerequisites are *directed* (A must come before B), which is why they get their own `skill_prerequisites` table. `concept_links` remains available for future use (e.g., "these two skills are related but neither is a prerequisite of the other").

```js
function postProcessChapterSkills(skills, chapterProfile) {
  const issues = [];

  // 1. Circular dependency detection
  // Build directed graph from prerequisites, run topological sort.
  // Any cycle → remove the weakest edge (lowest confidence prereq).
  const cycles = detectCycles(skills);
  for (const cycle of cycles) {
    issues.push({ type: 'circular_dep', skills: cycle });
    // Auto-fix: remove the prerequisite link that creates the cycle
  }

  // 2. Duplicate name check
  // Exact match → merge (keep first, add second's criteria/evidence)
  // Normalized similarity > 0.85 within same category → flag for review
  // similarity = 1 - (levenshteinDistance / max(a.length, b.length))
  const dupes = findDuplicates(skills);
  for (const [a, b] of dupes) {
    if (a.name.toLowerCase() === b.name.toLowerCase()) {
      mergeSkills(a, b);
      issues.push({ type: 'exact_dupe_merged', kept: a.conceptKey, removed: b.conceptKey });
    } else {
      const dist = levenshtein(a.name, b.name);
      const sim = 1 - dist / Math.max(a.name.length, b.name.length);
      issues.push({ type: 'possible_dupe', a: a.conceptKey, b: b.conceptKey, similarity: sim });
    }
  }

  // 3. Prerequisite count cap
  for (const s of skills) {
    if (s.prerequisites.length > 8) {
      issues.push({ type: 'too_many_prereqs', skill: s.conceptKey, count: s.prerequisites.length });
    }
  }

  // 4. Skill count sanity
  const [min, max] = chapterProfile.estimatedSkillRange;
  if (skills.length < min * 0.5) {
    issues.push({ type: 'too_few_skills', expected: [min, max], got: skills.length });
  }
  if (skills.length > max * 2) {
    issues.push({ type: 'too_many_skills', expected: [min, max], got: skills.length });
  }

  // 5. Empty evidence check
  for (const s of skills) {
    if (!s.evidence?.anchorTerms?.length && !s.evidence?.definitionsFound?.length) {
      issues.push({ type: 'no_evidence', skill: s.conceptKey });
    }
  }

  // 6. MasteryCriteria minimum
  for (const s of skills) {
    if (!s.masteryCriteria || s.masteryCriteria.length < 2) {
      issues.push({ type: 'insufficient_criteria', skill: s.conceptKey, count: s.masteryCriteria?.length || 0 });
    }
  }

  return { skills, issues };
}
```

### Step 4: Cross-chapter prerequisite wiring (one Haiku call)

After all chapters extracted, one focused call. Input is skill names, concept keys, and chapter numbers. Not content, not descriptions.

Results are resolved to `sub_skill_id` pairs and inserted into `skill_prerequisites` with `source = 'cross_chapter'`. Unresolved concept keys (LLM hallucinations or typos) are logged and skipped, same as Step 3's within-chapter prerequisite handling.

```
Wire prerequisite links ACROSS chapters. Within-chapter prerequisites are already set.

SKILLS BY CHAPTER:
Chapter 1:
  - Boolean Algebra Basics (boolean-algebra/basics)
  - Truth Tables (boolean-algebra/truth-tables)
  - Logic Expressions (boolean-algebra/logic-expressions)
Chapter 2:
  - Logic Gate Behavior (logic-gates/gate-behavior)
  - Gate Combinations (logic-gates/gate-combinations)
  - Universal Gates (logic-gates/universal-gates)
Chapter 3:
  - Half Adder Design (combinational-circuits/half-adder-design)
  - Full Adder Design (combinational-circuits/full-adder-design)
  - Ripple Carry Adder (combinational-circuits/ripple-carry-adder)
  - Comparator Circuits (combinational-circuits/comparator-circuits)
...

For each skill, list which skills from EARLIER chapters are direct prerequisites.
Only add links where a student genuinely needs the earlier skill to learn the later one.
Do not add transitive links (if A→B→C, don't add A→C).

RESPOND WITH ONLY a JSON array:
[
  { "skill": "combinational-circuits/half-adder-design", "crossPrereqs": ["logic-gates/and-gate", "logic-gates/xor-gate"] },
  ...
]

Only include skills that HAVE cross-chapter prerequisites. Omit skills whose prerequisites are all within their own chapter.
```

---

## 5. Downstream Integration

### How the new skill model feeds existing systems

**Practice Mode** — `generateProblems()` currently receives `skill.name` and `skill.description`. New model provides:
- `masteryCriteria[]` → generate problems targeting specific criteria
- `skillType` → select appropriate problem formats (procedural → calculation, conceptual → explanation)
- `bloomsLevel` → calibrate tier difficulty (remember-level skill starts at Tier 1, apply-level can start at Tier 3)
- `evidence.examplesInSource` → if textbook has examples, AI can reference them as worked examples

**Spaced Review** — `nextReviewDate()` and `effectiveStrength()` work on `sub_skill_mastery` table, which is keyed by `sub_skill_id`. No change needed — the mastery system is already skill-ID-based. The improvement: skills are now fine-grained enough that decay is meaningful per-skill.

**Pre-Question Diagnostics** — `buildSystemPrompt()` includes skill descriptions. New model provides `masteryCriteria` which are directly usable as diagnostic questions: "Before we start — can you [criterion 1]?"

**Assignment Decomposition** — `decomposeAssignments()` maps questions to skill IDs. With `conceptKey` and `masteryCriteria`, mapping is more precise: "question 3b requires criteria 1 and 3 from skill-14."

**Boot Prompt / Context** — `buildContext()` serializes all skills with strength. With 50-120 skills (constrained by extraction targets), this fits comfortably in context. Each skill carries its category and criteria, giving the tutoring AI rich context without needing to load chunks.

**Fitness accumulation** — Each downstream system updates `fitness` via named atomic methods (see Section 16.4):
```js
// After Practice Mode generates problems:
await SubSkills.incrementPracticeAttempts(skillId);
await SubSkills.incrementPracticeSuccesses(skillId);

// After tutoring chat references a skill:
await SubSkills.incrementTutoringReferences(skillId);

// After assignment decomposition maps to a skill:
await SubSkills.incrementAssignmentMappings(skillId);
```

---

## 6. Re-extraction Safety

### Identity matching on re-extraction

When a user triggers re-extraction (re-uploads same textbook, or uploads new edition):

1. Load all existing skills for the course with their `conceptKey`s.
2. Run extraction normally (chapter grouping → LLM calls).
3. For each extracted skill, match by `conceptKey`:
   - **Exact match** → update description, add criteria, refresh evidence via `updateFromReextraction()` (16.14). Keep skill ID. All progress data preserved.
   - **No match** → create new skill. No progress data to preserve.
4. Clear and rebuild prerequisites: `SkillPrerequisites.deleteForSkill()` for all matched + new skills, then re-run within-chapter and cross-chapter wiring (Section 4, pipeline Steps 3-4). Old prerequisite links from a previous extraction may no longer be valid if the textbook structure changed.
5. For existing skills NOT matched by any new extraction:
   - **Do NOT delete.** Flag as `unmatched_in_reextraction`.
   - Surface to user: "These skills weren't found in the re-uploaded material. Remove them?"
   - Student decides. Progress data is only lost if they explicitly confirm removal.

### conceptKey stability

The `conceptKey` is generated by the LLM as part of extraction (`{category}/{kebab-name}`). The prompt explicitly instructs: "conceptKey must be deterministic — same content should produce the same key."

If the LLM generates a slightly different key on re-extraction (e.g., `combinational-circuits/half-adder` vs `combinational-circuits/half-adder-design`), the exact match fails. Fallback: normalized prefix matching within the same category, then LLM confirmation call if ambiguous.

The risk here is real but bounded. Over time, the conceptKey vocabulary stabilizes as the course accumulates extractions. And the worst case is a false negative (new skill created alongside the old one) which is recoverable by user-triggered merge — not a false positive (two different skills merged, corrupting both).

---

## 7. Incremental Enrichment Flow

### Key principle

Enrichment matches by **concept**, not by course. A sub-skill exists once in the student's profile regardless of how many courses or documents reference it.

### Sequence

1. Student uploads new material into a course.
2. Document is parsed and chunked (same as initial upload).
3. System loads ALL existing sub-skills across ALL courses and parent skills for this student.
4. LLM receives: existing sub-skills (conceptKey + name + category + masteryCriteria) + new document content.
5. LLM outputs: matches (existing conceptKey + new criteria/evidence) and genuinely new skills (with CIP assignment).
6. For each match:
   - Append new mastery criteria (tagged with source document + timestamp, wrapped per Step 3)
   - Create chunk_skill_bindings linking the enriched skill to ALL chunks from the new document. Unlike initial extraction (which resolves `sourceChunkLabels` to specific chunks), enrichment binds broadly because the LLM's `sourceLabel` is a document-level label, not a section-level one. Binding confidence is set to `0.8` (vs `1.0` for initial extraction) to reflect the coarser granularity.
   - Update evidence (new anchor terms, definitions)
   - All progress data untouched — same sub-skill ID, same mastery record
7. For each new skill:
   - Create sub-skill with conceptKey, assign to parent skill via CIP code
   - Create chunk_skill_bindings to ALL chunks from the new document (same broad binding as enrichment matches, confidence `0.8`)
   - Parent skill created if CIP code is new for this student
8. Sub-skills are never deleted by enrichment. Only created or enriched.
9. `unmatchedExisting` from the LLM response is logged for diagnostics but NOT acted on. Enrichment is additive — a lecture transcript not covering half the textbook skills is expected. This field differs from re-extraction's unmatched handling (Section 6) where unmatched skills are flagged for user review.

### Cross-course skill sharing

A single sub-skill can have chunk bindings from multiple courses. Example:

```
Sub-skill: "Binary Number Systems" (conceptKey: number-systems/binary)
  Parent: Mathematics & Statistics (CIP 27.01)
  Chunk bindings:
    - ECEN 2350 textbook, Ch.1 §1.3 (added Sept 2026)
    - CS 1300 lecture transcript, Week 2 (added Oct 2026)
    - ECEN 3250 textbook, Ch.2 §2.1 (added Jan 2027)
  Mastery criteria:
    - "Convert decimal to binary and back" (source: ECEN 2350 textbook)
    - "Explain positional notation" (source: CS 1300 lecture)
    - "Perform binary arithmetic including subtraction" (source: ECEN 3250 textbook)
```

One skill, three courses, accumulated criteria. The student's mastery of "Binary Number Systems" reflects all practice and tutoring across all three courses.

### CIP assignment is per sub-skill

A single course upload can produce sub-skills under different parent skills. "Introduction to Engineering" might produce:

```
CIP 14.10 (Electrical Engineering)
  └── Circuit Basics, Ohm's Law, ...
CIP 14.19 (Mechanical Engineering)  
  └── Free Body Diagrams, Stress-Strain, ...
CIP 11.01 (Computer Science)
  └── Algorithm Basics, Variables and Types, ...
```

The LLM determines each sub-skill's CIP based on its content, not the course it came from.

---

## 8. Migration Path

**Status: ✅ Implemented** — `src/lib/migrate.js` (291 lines). UI trigger on Skills screen.

### From v1 skills to v2

Existing courses have skills in the v1 format (stored as JSON blob in settings table). Migration:

1. Read v1 skills for each course.
2. For each v1 skill, create a `sub_skills` row with:
   - `conceptKey` generated from `category + name` (normalized)
   - `masteryCriteria` — convert v1 `description` into a single criterion
   - `skillType` — default to `conceptual` (no structural signals available)
   - `bloomsLevel` — default to `understand`
   - `evidence` — empty (no structural metadata in v1)
   - `fitness` — empty (no tracking existed)
3. Create `chunk_skill_bindings` from v1 `sources` field (best-effort match to existing chunks).
4. Migrate v1 `skill_progress` data to `sub_skill_mastery` table.
5. Mark migrated skills with `schemaVersion: 1` so they can be distinguished from v2 extractions.

Users can then re-extract with the v2 pipeline to get properly enriched skills. The identity matching will attempt to match v1 `conceptKey`s to v2 extractions, preserving progress where possible.

---

## 9. Readiness Engine

### Overview

The Readiness Engine is the layer between skill extraction and the student-facing UX. It consumes skills, mastery data, and deadlines to produce a single answer: **what should the student do right now?**

The student never picks skills, modes, or materials. They see a status and press Continue.

### Student statuses

At any point, a course is in one of three states:

**Studying** — An upcoming assignment or exam requires skills the student hasn't mastered. The system teaches those skills through Socratic dialogue and practice. The student sees which deadline they're studying toward and how many questions they're ready for.

**Assignment [N]** — The student is ready (all required skills above mastery threshold). The system guides them through the assignment using the teach-to-derive method. No answers given — the student works through each question with AI guidance.

**Studying for [Exam]** — Same as Studying, but scoped to exam coverage. Longer timeline, broader skill set, review emphasis.

**Caught Up** — No pending deadlines, all assignment skills mastered. The system suggests studying the weakest areas to deepen understanding and prepare for future work. This is optional — student can also use Focus mode (see Section 12).

### How "Continue" works

```js
// READY_THRESHOLD: fraction of questions that must be "ready" before the student
// can start the assignment. 1.0 = all questions ready. Per-skill readiness threshold
// is 0.7 (70% effective strength), defined inside computeReadiness().
const READY_THRESHOLD = 1.0;

function determineSessionIntent(courseId, studentId) {
  const deadlines = getUpcomingDeadlines(courseId);  // assignments + exams, sorted by date
  const mastery = getStudentMastery(studentId);

  for (const deadline of deadlines) {
    const readiness = computeReadiness(deadline, mastery);

    if (readiness.percent < READY_THRESHOLD) {
      // Not ready for nearest deadline — skill build
      return {
        status: "studying",
        target: deadline,
        readiness: readiness,
        focusSkills: readiness.weakest,  // sorted by priority
        display: `Assignment ${deadline.name} due ${deadline.dueDate}`,
        readyCount: `${readiness.readyQuestions} of ${readiness.totalQuestions} questions`
      };
    }

    if (readiness.percent >= READY_THRESHOLD && !deadline.completed) {
      // Ready — work on the assignment/exam
      return {
        status: "assignment",
        target: deadline,
        display: deadline.name,
        questions: deadline.questions
      };
    }
  }

  // No pending deadlines or all complete
  const weakSkills = getWeakestSkills(studentId, courseId);
  return {
    status: "caught_up",
    suggestedSkills: weakSkills,
    display: "Caught Up"
  };
}
```

### Deadline object shape

Both assignments and exams are represented as deadline objects from `getUpcomingDeadlines()`:

```js
{
  id: "deadline-uuid",
  name: "Assignment 5",
  type: "assignment" | "exam",
  dueDate: "2026-10-15",
  completed: false,
  questions: [              // from assignment decomposition (decomposeAssignments())
    {
      id: "q1",
      text: "Design a half adder circuit...",
      requiredSkills: [47, 23, 12],   // sub_skill IDs
      completed: false
    },
    ...
  ]
}
```

For exams, `questions` is populated from the exam's skill coverage (all skills under the covered chapters), with one synthetic "question" per skill group. For assignments without decomposition yet, `questions` is empty and readiness defaults to 0%.

### Readiness computation

For each question in a deadline:
- Get required skills (from assignment decomposition)
- Check student mastery on each (from sub_skill_mastery, accounting for decay)
- Question is "ready" if ALL required skills are above threshold (default 70%)

```js
function computeReadiness(deadline, mastery) {
  // No questions = not ready (assignment not yet decomposed)
  if (!deadline.questions || deadline.questions.length === 0) {
    return { percent: 0, readyQuestions: 0, totalQuestions: 0, weakest: [] };
  }

  // Build skill assessments from all skills required across all questions
  const allRequiredSkillIds = new Set(
    deadline.questions.flatMap(q => q.requiredSkills)
  );

  const skillAssessments = {};
  for (const skillId of allRequiredSkillIds) {
    const m = mastery[skillId];
    const strength = effectiveStrength(m);  // accounts for decay
    skillAssessments[skillId] = { skillId, strength, ready: strength >= 0.7 };
  }

  const readyQuestions = deadline.questions.filter(q =>
    q.requiredSkills.length > 0 &&
    q.requiredSkills.every(sid => skillAssessments[sid]?.ready)
  ).length;

  // Weakest skills sorted by: lowest strength first
  const weakest = Object.values(skillAssessments)
    .filter(s => !s.ready)
    .sort((a, b) => a.strength - b.strength);

  return {
    percent: readyQuestions / deadline.questions.length,
    readyQuestions,
    totalQuestions: deadline.questions.length,
    weakest
  };
}
```

### Skill building session flow

When status is "studying", the system:

1. Picks the highest-priority weak skill (lowest strength among skills needed for nearest deadline).
2. Runs pre-question diagnostic (IES Rec 5a): "Before we start — what do you know about [concept]?"
3. Based on diagnostic, teaches via Socratic method using the student's course materials as context.
4. After teaching, verifies understanding (IES Rec 5b).
5. Updates mastery. Checks if readiness changed.
6. If the student is now ready for the assignment: "You're ready for Assignment 5. Want to start it now?"
7. If not, moves to next priority skill.

The student never chooses which skill to study. The system always picks the one that moves the nearest deadline from "not ready" to "ready" fastest.

### Assignment session flow

When status is "assignment", the system:

1. Presents the first incomplete question.
2. Decomposes it: "This question needs [skill A] and [skill B]. Let's work through it."
3. Guides the student to derive the answer — never gives it directly.
4. After each question, marks it complete.
5. Progress saved per question — student can leave and resume.

### Exam prep session flow

When the nearest deadline is an exam:

1. System identifies all skills covered by the exam (from syllabus/material scope).
2. Computes readiness per skill.
3. Builds a study plan: prioritize by weakness × exam weight.
4. Sessions alternate between teaching weak skills and practice/review of developing skills (IES Rec 1: spaced review).
5. As exam approaches, shifts from deep teaching to rapid review.

### What this replaces

The entire current UX flow:
- ~~Skill picker~~ → system picks the skill
- ~~Learn/Practice mode selection~~ → system decides based on mastery level
- ~~Material activation/deactivation~~ → system loads relevant materials automatically
- ~~"What do you want to work on?"~~ → "Continue"
- ~~"Skill Building" jargon~~ → "Studying" — the word students already use

### Syllabus-driven deadline awareness

The syllabus enables proactive deadline management:
- Syllabus says "Assignment 6 due October 15" but student hasn't uploaded Assignment 6 → System prompts: "Assignment 6 is due in 3 days. Upload it so I can check if you're ready."
- Syllabus says "Midterm covers Chapters 1-6" → Readiness Engine scopes exam prep to those chapters' skills
- Syllabus says "Final project worth 30% of grade" → Readiness Engine prioritizes project-related skills higher

Without a syllabus, the system still works — it just can't proactively manage deadlines. Students manually indicate what's due when.

### Integration with extraction

The Readiness Engine depends on:
- **Sub-skills with mastery criteria** — to know what "mastery" means per skill
- **Assignment decomposition with skill mappings** — to know what each question requires
- **Mastery data with decay** — to know current student state
- **Deadlines from syllabus parsing** — to know what's due when

All of these are outputs of the extraction pipeline. The extraction quality directly determines the Readiness Engine's accuracy. Bad skill mapping → wrong readiness assessment → student works on the wrong thing → misses deadline → churn.

---

## 10. Fitness Validation

Each downstream system records when it uses a skill. No complex scoring — just counters.

```js
fitness: {
  practiceAttempts: 4,       // generateProblems() called for this skill
  practiceSuccesses: 4,      // valid problem sets returned
  tutoringReferences: 12,    // times AI issued SKILL_UPDATE for this skill
  assignmentMappings: 3,     // times this skill mapped to a hw question
  lastUsed: "2026-11-15"
}
```

**Who updates fitness:** See Section 5 (Downstream Integration → Fitness accumulation) for the exact method calls and which systems trigger them.

**When a skill gets flagged:**
1. **Never used.** All zeros after 30 days in the system. Probably too vague or too granular. Surface to user: "This skill hasn't been used. Merge or remove?"
2. **Practice failures.** practiceAttempts > 2 and practiceSuccesses < 50%. LLM can't generate good problems — skill is too vague. Flag for review.

---

## 11. Error Handling

**Core principle:** Save what works, retry what doesn't, never lose chunks.

- Extraction runs per-chapter. If Chapter 3 fails, Chapters 1-2 and 4-15 are still saved.
- Failed chapters get `status: "error"` with error reason stored in `error_info` (JSON). `fail_count` is incremented automatically by `Chunks.updateStatus()` and `updateStatusBatch()`. Retryable anytime without re-uploading.
- Up to 2 automatic retries with exponential backoff (3s → 10s → mark as error) before stopping. Chunks with `fail_count >= 3` are skipped on automatic retries but can still be retried manually.
- Malformed JSON → retry. Valid JSON with missing fields → save what's valid, flag incomplete skills.
- Cross-chapter wiring failure is non-critical — skills work without it, can retry independently.
- UI shows per-chapter progress: "12 of 15 chapters extracted (87 skills). Chapter 3 failed — retry?"
- Valid chunk statuses: `pending` (initial), `extracted` (success), `error` (failed, retryable).

---

## 12. User-Facing Skill View

Skills are read-only. The student never edits skills directly.

**Why:** Skills are derived from uploaded documents. If the documents are correct, the skills are correct. If something is wrong, the fix is at the document level — remove the document, upload the correct one, re-extract.

**What the student sees:** A "character sheet" view showing:
- Domain → Parent Skill → Sub-skills hierarchy
- Parent skill levels (RPG-style)
- Per sub-skill: name, strength percentage, mastery criteria, source documents
- Skills due for review highlighted

**What the student can do:**
- View the skill tree (read-only)
- Tap a skill to see its mastery criteria and source documents
- Manage documents (upload, deactivate/reactivate) — this is how they indirectly control skills
- Deselect chapters before extraction — this is how they skip irrelevant content

**No skill editor.** No rename, merge, split, or delete at the skill level. Document management is the user's control surface.

### Document lifecycle

Documents are never deleted. The paid upload is permanent. Students control what's *active*, not what exists.

- `materials.active = 1` → chunks are loaded for extraction, tutoring, practice
- `materials.active = 0` → chunks exist but are excluded from active context

**Deactivating a document:**
- Chunks remain in database
- Chunk-skill bindings remain intact
- Skills remain with all mastery data
- The document simply stops being included in tutoring context and new extractions

**Reactivating a document:**
- Everything resumes as if it was never deactivated
- No re-extraction needed — bindings are still there

**Focus mode:**
When status is "Caught Up" (or anytime the student wants to override the system), they can select specific documents for a freeform session. This scopes the tutoring context to just those materials without affecting the global active/inactive state.

**No document deletion in the UI.** If storage becomes an issue in the future, inactive documents older than N months could be archived — but that's an optimization, not a user-facing action.

### Cross-course skill survival

A sub-skill with chunk bindings from 3 courses survives when any one course's documents are deactivated. The skill only becomes a "zombie" (zero active bindings) if ALL documents referencing it are deactivated. Zombie skills:
- Still appear in the character sheet with their mastery data
- Are excluded from active tutoring context
- Reactivate automatically when any referencing document is reactivated
- Are never auto-deleted

---

## 13. Cost & Performance Targets

### Per-textbook extraction (15 chapters, ~300 sections)

| Step | API Calls | Cost (Haiku) | Wall Time |
|------|-----------|-------------|-----------|
| Chapter grouping | 0 | $0.00 | <100ms |
| Deterministic pre-processing | 0 | $0.00 | <200ms |
| LLM extraction (15 chapters) | 15 | ~$0.30 | ~2-3 min |
| Post-processing | 0 | $0.00 | <100ms |
| Cross-chapter wiring | 1 | ~$0.02 | ~5 sec |
| **Total** | **16** | **~$0.32** | **~3 min** |

### Per-incremental upload (lecture transcript, single document)

| Step | API Calls | Cost | Wall Time |
|------|-----------|------|-----------|
| Enrichment extraction | 1-3 | ~$0.02-0.06 | ~15-30 sec |
| Post-processing | 0 | $0.00 | <100ms |
| **Total** | **1-3** | **~$0.04** | **~20 sec** |

### Comparison with current pipeline

| Metric | Current (v1) | New (v2) | Improvement |
|--------|-------------|----------|-------------|
| API calls per textbook | ~375 | ~16 | 23x fewer |
| Cost per textbook | ~$3.73 | ~$0.32 | 12x cheaper |
| Wall time | ~19 min | ~3 min | 6x faster |
| Skill quality | Unbounded, LLM-mood-dependent | Constrained by structural evidence | Deterministic quality floor |
| Re-extraction safety | Destroys all progress | Preserves via conceptKey matching | No data loss |
| Incremental uploads | Not supported | Native enrichment | New capability |

---

## 14. Data Integrity & Persistence

### Backup strategy

The SQLite database is the student's entire learning history. Laptop dies = everything gone. For a paid feature, this is unacceptable.

**Phase 1 (Tauri launch):** Periodic auto-export of the database file to a user-chosen location (Desktop, iCloud Drive, Google Drive folder). The app prompts on first launch: "Where should I save backups?" Then silently exports a timestamped copy every 24 hours and on every app close. This is a file copy, not a sync — simple and reliable.

**Phase 2 (post-launch):** Cloud sync to a backend. Student creates an account, database syncs automatically. Multi-device access. This requires a backend service and is not part of v2 extraction spec — but the database schema should be designed with future sync in mind (timestamps on all rows, no auto-increment assumptions for primary keys across devices).

**Minimum viable guarantee:** The student can always export their database as a file and import it on a new device. This works from day 1 with zero backend infrastructure.

### Transaction safety

Every multi-step write is wrapped in a SQLite transaction. All-or-nothing.

**Extraction save (per chapter):**
```sql
BEGIN TRANSACTION;
  INSERT INTO sub_skills (...) VALUES (...);  -- all skills from this chapter
  INSERT INTO chunk_skill_bindings (...) VALUES (...);  -- all bindings
  UPDATE chunks SET status = 'extracted' WHERE id IN (...);  -- mark chunks done
COMMIT;
```
If any insert fails, the entire chapter rolls back. No half-committed skills.

**Enrichment save:**
```sql
BEGIN TRANSACTION;
  UPDATE sub_skills SET mastery_criteria = json(...) WHERE id = ?;  -- append criteria
  INSERT INTO chunk_skill_bindings (...) VALUES (...);  -- new binding
  UPDATE sub_skills SET evidence = json(...) WHERE id = ?;  -- update evidence
COMMIT;
```

**Mastery update after tutoring session:**
```sql
BEGIN TRANSACTION;
  UPDATE sub_skill_mastery SET ... WHERE sub_skill_id = ?;
  INSERT INTO session_events (...) VALUES (...);
  INSERT INTO journal_entries (...) VALUES (...);
COMMIT;
```

### Atomic fitness updates

Fitness counters must use atomic SQL updates (hardcoded JSON paths), never read-modify-write in JS. The named methods in Section 16.4 (`incrementPracticeAttempts`, `incrementPracticeSuccesses`, etc.) implement this pattern. Never bypass them with manual `json_set` calls or JS-side read-modify-write — the latter creates race conditions when multiple async operations touch the same skill simultaneously.

### Cascade audit — every path that destroys user data

The v2 schema uses `ON DELETE CASCADE` extensively. Every one of these chains is a loaded gun pointed at user data. This audit traces every FK chain and classifies each as safe, dangerous, or fatal.

**FATAL — single call destroys irreplaceable progress:**

```
Courses.delete(courseId)
  → materials        (CASCADE)  — all uploaded documents
    → chunks          (CASCADE)  — all parsed content
      → chunk_skill_bindings (CASCADE)  — skill-to-content links
      → chunk_media          (CASCADE)  — images/figures
      → chunk_fingerprints   (CASCADE)  — dedup signatures
  → sessions          (CASCADE)  — all tutoring sessions
    → messages          (CASCADE)  — entire conversation history
    → session_events     (CASCADE)  — raw FSRS mastery events
    → session_skills     (CASCADE)  — per-session skill tracking
    → journal_entries    (CASCADE)  — learning journal
  → course_schedule    (CASCADE)  — parsed syllabus
  → course_assessments (CASCADE)  — grading weights
  → sub_skills.source_course_id (SET NULL)  — orphans skills
```

One `DELETE FROM courses WHERE id = ?` destroys everything a student has built in that course. The `Courses.delete()` method exists in db.js today with no guard.

**DANGEROUS — destroys paid content:**

```
Materials.delete(materialId)
  → chunks          (CASCADE)  — all content from this document
    → chunk_skill_bindings (CASCADE)  — severs skill-content links
    → chunk_media          (CASCADE)  — images gone
    → chunk_fingerprints   (CASCADE)  — dedup signatures gone
```

`Materials.delete()` exists in db.js. The spec says documents are never deleted, but the method is one import away.

```
Chunks.delete(chunkId)
  → chunk_skill_bindings (CASCADE)  — severs skill links for this chunk
  → chunk_media          (CASCADE)  — images for this chunk
  → chunk_fingerprints   (CASCADE)  — fingerprint gone
```

`Chunks.delete()` and `DB.deleteChunk()` both exist in db.js.

**DANGEROUS — destroys mastery history:**

```
sub_skills hard delete (if it were possible)
  → sub_skill_mastery    (CASCADE)  — FSRS state gone
  → chunk_skill_bindings (CASCADE)  — all content links gone
  → session_skills       (CASCADE)  — session tracking gone
  → session_events       (CASCADE)  — mastery event log gone
  → skill_prerequisites  (CASCADE)  — prereq graph broken
  → concept_links        (CASCADE)  — similarity links gone
  → practice_sets        (CASCADE)  — practice data gone
```

No `SubSkills.delete()` method exists in db.js — good. But the schema allows it and CASCADE would fire. The `is_archived` soft-delete (Section 2) is the only safe path, but the CASCADE constraint is still live in the schema.

**SAFE — acceptable cascade behavior:**

```
parent_skills.delete
  → sub_skills (RESTRICT)  — blocked if any sub-skills exist. Correct.

parent_skills.delete
  → parent_skill_aliases (CASCADE)  — aliases are metadata. Safe.

sessions.delete
  → messages, session_events, session_skills, journal_entries (CASCADE)
  — Session data is tightly coupled. Deleting a session should clean up its children.
  — BUT: sessions cascade from courses.delete, which makes this dangerous in that chain.

practice_sets.session_id
  → sessions (SET NULL)  — practice set survives session deletion. Correct.
```

### Delete protection rules

**Rule 1: No hard deletes on user-facing entities.**

These db.js methods must be replaced:

| Current method | Replacement |
|---|---|
| `Courses.delete(id)` | `Courses.archive(id)` — set `is_archived = 1` (new column) |
| `Materials.delete(id)` | `Materials.setActive(id, false)` — see 16.8 |
| `Chunks.delete(id)` | **Remove entirely.** No code path should delete individual chunks. |
| `DB.deleteChunk(cid, chunkId)` | **Remove entirely.** V1 compat artifact. |
| `DB.deleteCourse(cid)` | `Courses.archive(id)` |
| `resetAll()` | Guarded version (see Rule 3) |

**Rule 2: Courses need soft-delete like sub_skills.**

Add to 002 migration:
```sql
ALTER TABLE courses ADD COLUMN is_archived INTEGER DEFAULT 0;
```

Archived courses:
- Hidden from main course list
- All materials, chunks, skills, mastery data preserved
- All sessions and messages preserved
- Can be un-archived at any time
- Show in a "Archived Courses" section if the student looks for them

The `Courses.delete()` method is replaced with:
```js
async archive(id) {
  const db = await getDb();
  await db.execute(
    'UPDATE courses SET is_archived = 1, updated_at = ? WHERE id = ?',
    [now(), id]
  );
},

async unarchive(id) {
  const db = await getDb();
  await db.execute(
    'UPDATE courses SET is_archived = 0, updated_at = ? WHERE id = ?',
    [now(), id]
  );
}
```

**Rule 3: `resetAll()` requires pre-export.**

`resetAll()` is a nuclear option. It should:
1. Trigger an automatic database backup before executing
2. Require the UI to show: "This will permanently delete X courses, Y skills, Z mastery records. Export backup first?"
3. Only execute after explicit confirmation
4. Log the reset event (timestamp, row counts) to a separate recovery file outside the database

```js
export const resetAll = async ({ confirmed = false, backupPath = null } = {}) => {
  if (!confirmed) throw new Error('resetAll requires explicit confirmation');
  const db = await getDb();

  // Count what we're about to destroy
  const counts = {};
  for (const table of ['courses', 'sub_skills', 'sub_skill_mastery', 'chunks', 'sessions']) {
    const rows = await db.select(`SELECT COUNT(*) as c FROM ${table}`);
    counts[table] = rows[0].c;
  }

  // Auto-backup if path provided
  if (backupPath) {
    await exportDatabase(backupPath); // Tauri file copy
  }

  // Execute reset — order matters for FK constraints
  const tables = [
    'practice_sets', 'journal_entries', 'session_events', 'session_skills',
    'messages', 'sessions', 'sub_skill_mastery', 'skill_prerequisites',
    'concept_links', 'chunk_skill_bindings', 'chunk_fingerprints',
    'chunk_media', 'chunks', 'materials', 'course_assessments',
    'course_schedule', 'courses', 'sub_skills', 'parent_skill_aliases',
    'parent_skills', 'settings'
  ];
  await db.execute('BEGIN');
  try {
    for (const t of tables) await db.execute(`DELETE FROM ${t}`);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }

  return { deleted: counts };
};
```

**Rule 4: The `sub_skill_mastery` CASCADE must be neutralized.**

The schema says `FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE`. SQLite cannot `ALTER CONSTRAINT`. Fix requires table recreation in the 002 migration:

```sql
-- Recreate sub_skill_mastery with RESTRICT instead of CASCADE
CREATE TABLE sub_skill_mastery_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id         INTEGER NOT NULL UNIQUE,
    difficulty           REAL NOT NULL DEFAULT 0.3,
    stability            REAL NOT NULL DEFAULT 1.0,
    retrievability       REAL NOT NULL DEFAULT 1.0,
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    last_review_at       INTEGER,
    next_review_at       INTEGER,
    total_mastery_points REAL NOT NULL DEFAULT 0.0,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE RESTRICT
);

INSERT INTO sub_skill_mastery_new SELECT * FROM sub_skill_mastery;
DROP TABLE sub_skill_mastery;
ALTER TABLE sub_skill_mastery_new RENAME TO sub_skill_mastery;

CREATE INDEX IF NOT EXISTS idx_mastery_skill ON sub_skill_mastery(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON sub_skill_mastery(next_review_at);
```

Now any attempt to hard-delete a sub_skill that has mastery data will fail with a foreign key violation. The only path is `is_archived = 1`.

### Missing timestamps for sync readiness

**`chunks.updated_at` is never set.** `Chunks.create()` doesn't set it and `Chunks.updateStatus()` doesn't update it. For backup diffing and future sync, every mutable row needs a timestamp showing when it last changed. Fix in `Chunks.updateStatus()`:

```js
async updateStatus(id, status, errorInfo = null) {
  const db = await getDb();
  await db.execute(
    `UPDATE chunks SET status = ?, error_info = ?, updated_at = ?,
     fail_count = CASE WHEN ? = 'error' THEN fail_count + 1 ELSE fail_count END
     WHERE id = ?`,
    [status, errorInfo ? JSON.stringify(errorInfo) : null, now(), status, id]
  );
}
```

**`chunk_skill_bindings` has no `updated_at`.** It has `extracted_at` but if enrichment updates confidence or context on an existing binding, there's no record of when. Add to 002 migration:

```sql
ALTER TABLE chunk_skill_bindings ADD COLUMN updated_at INTEGER;
```

### V1 compat progress migration

Section 8 (Migration Path) covers v1 skills → v2 sub_skills. But the V1 compat layer in db.js also stores progress data in the `settings` table as JSON blobs:

- `v1_course_data:{cid}:skills` — skill trees
- `v1_profile:{cid}` — `{ skills: { skillId: { strength, sessions, ... } }, sessions: N }`
- `v1_practice:{cid}:{skillId}` — practice set state
- `v1_chunk_skills:{cid}:{chunkId}` — per-chunk extraction results

If a student has been using the app in v1 mode, their mastery lives in `v1_profile:{cid}`, not in `sub_skill_mastery`. The migration in Section 8 step 4 ("Migrate v1 `skill_progress` data to `sub_skill_mastery`") must explicitly read from these settings keys:

```js
// In migration script
const profile = await DB.getProfile(courseId);
const v1Skills = await DB.getSkills(courseId); // v1 skill tree with categories
if (profile?.skills) {
  for (const [skillName, progress] of Object.entries(profile.skills)) {
    // Find the v1 skill object to get its category for conceptKey generation
    const v1Skill = v1Skills?.find(s => s.name === skillName || s.id === skillName);
    const category = v1Skill?.category || null;
    const matchedSkill = await SubSkills.findByConceptKey(
      generateConceptKey(skillName, category)
    );
    if (matchedSkill) {
      await Mastery.upsert(matchedSkill.id, {
        totalMasteryPoints: progress.strength * 100 || 0,
        reps: progress.sessions || 0,
        // ... map available v1 fields to FSRS state
      });
    }
  }
}
```

After migration, v1 settings keys should be kept (not deleted) for rollback safety. They can be cleaned up in a later release once v2 is stable.

### `source_course_id` column reassessment

`sub_skills.source_course_id` has `ON DELETE SET NULL`. If a course is deleted (or archived), the skill's course reference goes null. But cross-course skills don't need a single source course — they have bindings to chunks in multiple courses via `chunk_skill_bindings`. The column captures "which course triggered the original extraction" which is useful for debugging and display, but:

- It should NOT be treated as ownership. A skill belongs to the student, not to a course.
- It should NOT affect skill visibility when a course is archived. Skills with `is_archived = 0` stay visible regardless of their source course's state.
- The column is informational only. No logic should depend on `source_course_id` being non-null.

### Write-ahead logging

SQLite must be configured with WAL mode for crash safety:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```
WAL mode means a crash mid-write won't corrupt the database. The write completes or rolls back cleanly on next open.

---

## 15. Schema Migration SQL

Single source of truth for the 002 migration. The schema additions in Section 2 reference this.

```sql
-- 002_skill_extraction_v2.sql

-- New columns on sub_skills
ALTER TABLE sub_skills ADD COLUMN concept_key TEXT;
ALTER TABLE sub_skills ADD COLUMN category TEXT;
ALTER TABLE sub_skills ADD COLUMN blooms_level TEXT;
ALTER TABLE sub_skills ADD COLUMN mastery_criteria TEXT;    -- JSON array
ALTER TABLE sub_skills ADD COLUMN evidence TEXT;            -- JSON object
ALTER TABLE sub_skills ADD COLUMN fitness TEXT DEFAULT '{}'; -- JSON object
ALTER TABLE sub_skills ADD COLUMN extraction_model TEXT;
ALTER TABLE sub_skills ADD COLUMN schema_version INTEGER DEFAULT 2;
ALTER TABLE sub_skills ADD COLUMN merged_from TEXT;         -- JSON array
ALTER TABLE sub_skills ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE sub_skills ADD COLUMN uuid TEXT;

-- Course soft-delete
ALTER TABLE courses ADD COLUMN is_archived INTEGER DEFAULT 0;

-- Binding timestamps for sync
ALTER TABLE chunk_skill_bindings ADD COLUMN updated_at INTEGER;

-- Sub-skill indexes
CREATE INDEX IF NOT EXISTS idx_sub_skills_concept ON sub_skills(concept_key);
CREATE INDEX IF NOT EXISTS idx_sub_skills_category ON sub_skills(category);
CREATE INDEX IF NOT EXISTS idx_sub_skills_blooms ON sub_skills(blooms_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_skills_uuid ON sub_skills(uuid);

-- Skill prerequisites — directed graph (prerequisite → dependent)
-- Replaces concept_links for prerequisite relationships.
-- concept_links (existing) remains for similarity/relatedness links.
CREATE TABLE IF NOT EXISTS skill_prerequisites (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id       INTEGER NOT NULL,  -- the skill that has the prerequisite
    prerequisite_id    INTEGER NOT NULL,  -- the skill that must be learned first
    source             TEXT NOT NULL,     -- 'within_chapter' | 'cross_chapter'
    created_at         INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_id) REFERENCES sub_skills(id) ON DELETE CASCADE,
    CHECK (sub_skill_id != prerequisite_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prereq_pair ON skill_prerequisites(sub_skill_id, prerequisite_id);
CREATE INDEX IF NOT EXISTS idx_prereq_skill ON skill_prerequisites(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_prereq_dep ON skill_prerequisites(prerequisite_id);

-- Recreate sub_skill_mastery with RESTRICT instead of CASCADE
-- (SQLite cannot ALTER CONSTRAINT, so we recreate the table)
CREATE TABLE sub_skill_mastery_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_skill_id         INTEGER NOT NULL UNIQUE,
    difficulty           REAL NOT NULL DEFAULT 0.3,
    stability            REAL NOT NULL DEFAULT 1.0,
    retrievability       REAL NOT NULL DEFAULT 1.0,
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    last_review_at       INTEGER,
    next_review_at       INTEGER,
    total_mastery_points REAL NOT NULL DEFAULT 0.0,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (sub_skill_id) REFERENCES sub_skills(id) ON DELETE RESTRICT
);

INSERT INTO sub_skill_mastery_new SELECT * FROM sub_skill_mastery;
DROP TABLE sub_skill_mastery;
ALTER TABLE sub_skill_mastery_new RENAME TO sub_skill_mastery;

CREATE INDEX IF NOT EXISTS idx_mastery_skill ON sub_skill_mastery(sub_skill_id);
CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON sub_skill_mastery(next_review_at);
```

---

## 16. Implementation Gaps — Current Code vs Spec

These are concrete changes needed in existing files to support the spec.

### 16.1 SubSkills.create() needs new fields

`SubSkills.create()` in db.js currently accepts only `parentSkillId, name, description, skillType, sourceCourseId`. Must expand to accept all new columns:

```js
async create({ parentSkillId, name, description, skillType, sourceCourseId,
               conceptKey, category, bloomsLevel, masteryCriteria,
               evidence, fitness, extractionModel, schemaVersion, mergedFrom }) {
  const db = await getDb();
  const skillUuid = crypto.randomUUID();
  const result = await db.execute(
    `INSERT INTO sub_skills (parent_skill_id, name, description, skill_type,
       source_course_id, concept_key, category, blooms_level, mastery_criteria,
       evidence, fitness, extraction_model, schema_version, merged_from,
       is_archived, uuid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [parentSkillId, name, description || null, skillType || null,
     sourceCourseId || null, conceptKey || null, category || null,
     bloomsLevel || null,
     masteryCriteria ? JSON.stringify(masteryCriteria) : null,
     evidence ? JSON.stringify(evidence) : null,
     fitness ? JSON.stringify(fitness) : '{}',
     extractionModel || null, schemaVersion || 2,
     mergedFrom ? JSON.stringify(mergedFrom) : null,
     skillUuid, now()]
  );
  return result.lastInsertId;
}
```

Same expansion needed for `createBatch()`.

### 16.2 Transaction nesting for extraction save

`SubSkills.createBatch()` and `ChunkSkillBindings.createBatch()` each wrap in their own `BEGIN/COMMIT`. The spec requires a single outer transaction covering skills + bindings + chunk status updates.

**Fix:** Add an optional `externalTransaction` flag (default false). When true, skip the internal BEGIN/COMMIT — the caller manages the transaction.

```js
async createBatch(skills, { externalTransaction = false } = {}) {
  const db = await getDb();
  const ids = [];
  if (!externalTransaction) await db.execute('BEGIN');
  try {
    for (const s of skills) {
      const result = await db.execute(/* ... */);
      ids.push(result.lastInsertId);
    }
    if (!externalTransaction) await db.execute('COMMIT');
  } catch (e) {
    if (!externalTransaction) await db.execute('ROLLBACK');
    throw e;
  }
  return ids;
}
```

The extraction pipeline then does:
```js
const db = await getDb();
await db.execute('BEGIN');
try {
  const skillIds = await SubSkills.createBatch(skills, { externalTransaction: true });
  await ChunkSkillBindings.createBatch(bindings, { externalTransaction: true });
  await Chunks.updateStatusBatch(chunkIds, 'extracted', { externalTransaction: true });
  await db.execute('COMMIT');
} catch (e) {
  await db.execute('ROLLBACK');
  throw e;
}
```

### 16.3 ParentSkills needs findOrCreateByCip()

The spec says CIP code is the parent skill identity. No lookup method exists.

```js
// Add to ParentSkills in db.js
async findByCip(cipCode) {
  const db = await getDb();
  const rows = await db.select(
    'SELECT * FROM parent_skills WHERE cip_code = ?', [cipCode]
  );
  return rows[0] || null;
},

async findOrCreateByCip(cipCode, displayName) {
  let parent = await this.findByCip(cipCode);
  if (parent) return parent.id;
  return this.create({
    name: displayName,
    cipCode: cipCode,
    isCustom: false
  });
}
```

### 16.4 SubSkills needs conceptKey queries

The enrichment pipeline depends on matching by conceptKey.

```js
// Add to SubSkills in db.js
async findByConceptKey(conceptKey) {
  const db = await getDb();
  const rows = await db.select(
    'SELECT * FROM sub_skills WHERE concept_key = ? AND is_archived = 0', [conceptKey]
  );
  return rows[0] || null;
},

async getAllConceptKeys() {
  const db = await getDb();
  return db.select(
    'SELECT id, concept_key, name, category, mastery_criteria FROM sub_skills WHERE is_archived = 0'
  );
},

async incrementPracticeAttempts(skillId) {
  const db = await getDb();
  await db.execute(
    `UPDATE sub_skills SET fitness = json_set(fitness,
       '$.practiceAttempts', COALESCE(json_extract(fitness, '$.practiceAttempts'), 0) + 1,
       '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     ) WHERE id = ?`, [skillId]
  );
},

async incrementPracticeSuccesses(skillId) {
  const db = await getDb();
  await db.execute(
    `UPDATE sub_skills SET fitness = json_set(fitness,
       '$.practiceSuccesses', COALESCE(json_extract(fitness, '$.practiceSuccesses'), 0) + 1,
       '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     ) WHERE id = ?`, [skillId]
  );
},

async incrementTutoringReferences(skillId) {
  const db = await getDb();
  await db.execute(
    `UPDATE sub_skills SET fitness = json_set(fitness,
       '$.tutoringReferences', COALESCE(json_extract(fitness, '$.tutoringReferences'), 0) + 1,
       '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     ) WHERE id = ?`, [skillId]
  );
},

async incrementAssignmentMappings(skillId) {
  const db = await getDb();
  await db.execute(
    `UPDATE sub_skills SET fitness = json_set(fitness,
       '$.assignmentMappings', COALESCE(json_extract(fitness, '$.assignmentMappings'), 0) + 1,
       '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     ) WHERE id = ?`, [skillId]
  );
}
```

### 16.5 Chunks needs updateStatusBatch()

The extraction pipeline (Section 16.2) calls `Chunks.updateStatusBatch()` but only `Chunks.updateStatus()` (single chunk) exists.

```js
// Add to Chunks in db.js
async updateStatusBatch(ids, status, { externalTransaction = false } = {}) {
  if (ids.length === 0) return;
  const db = await getDb();
  if (!externalTransaction) await db.execute('BEGIN');
  try {
    for (const id of ids) {
      await db.execute(
        `UPDATE chunks SET status = ?, updated_at = ?,
         fail_count = CASE WHEN ? = 'error' THEN fail_count + 1 ELSE fail_count END
         WHERE id = ?`,
        [status, now(), status, id]
      );
    }
    if (!externalTransaction) await db.execute('COMMIT');
  } catch (e) {
    if (!externalTransaction) await db.execute('ROLLBACK');
    throw e;
  }
}
```

### 16.6 SkillPrerequisites needs CRUD methods

The new `skill_prerequisites` table has no db.js API yet.

```js
// Add to db.js
const SkillPrerequisites = {
  async create(subSkillId, prerequisiteId, source) {
    const db = await getDb();
    await db.execute(
      `INSERT OR IGNORE INTO skill_prerequisites (sub_skill_id, prerequisite_id, source, created_at)
       VALUES (?, ?, ?, ?)`,
      [subSkillId, prerequisiteId, source, now()]
    );
  },

  async createBatch(links, { externalTransaction = false } = {}) {
    const db = await getDb();
    if (!externalTransaction) await db.execute('BEGIN');
    try {
      for (const { subSkillId, prerequisiteId, source } of links) {
        await db.execute(
          `INSERT OR IGNORE INTO skill_prerequisites (sub_skill_id, prerequisite_id, source, created_at)
           VALUES (?, ?, ?, ?)`,
          [subSkillId, prerequisiteId, source, now()]
        );
      }
      if (!externalTransaction) await db.execute('COMMIT');
    } catch (e) {
      if (!externalTransaction) await db.execute('ROLLBACK');
      throw e;
    }
  },

  async getForSkill(subSkillId) {
    const db = await getDb();
    return db.select(
      `SELECT sp.prerequisite_id, ss.name, ss.concept_key, sp.source
       FROM skill_prerequisites sp
       JOIN sub_skills ss ON sp.prerequisite_id = ss.id
       WHERE sp.sub_skill_id = ? AND ss.is_archived = 0`,
      [subSkillId]
    );
  },

  async getDependents(prerequisiteId) {
    const db = await getDb();
    return db.select(
      `SELECT sp.sub_skill_id, ss.name, ss.concept_key, sp.source
       FROM skill_prerequisites sp
       JOIN sub_skills ss ON sp.sub_skill_id = ss.id
       WHERE sp.prerequisite_id = ? AND ss.is_archived = 0`,
      [prerequisiteId]
    );
  },

  async deleteForSkill(subSkillId) {
    const db = await getDb();
    await db.execute(
      'DELETE FROM skill_prerequisites WHERE sub_skill_id = ?',
      [subSkillId]
    );
  }
};
```

### 16.7 Mastery queries must filter by is_archived

Every query that joins sub_skills needs `AND ss.is_archived = 0`:

```sql
-- Mastery.getDueForReview() — current
SELECT ssm.*, ss.name ...
FROM sub_skill_mastery ssm
JOIN sub_skills ss ON ssm.sub_skill_id = ss.id
WHERE ssm.next_review_at <= ?

-- Fixed
SELECT ssm.*, ss.name ...
FROM sub_skill_mastery ssm
JOIN sub_skills ss ON ssm.sub_skill_id = ss.id
WHERE ssm.next_review_at <= ? AND ss.is_archived = 0
```

Affected methods: `Mastery.getDueForReview()`, `ChunkSkillBindings.getByChunk()`, `SessionSkills.getBySession()`, and any future queries that surface skills to the user.

### 16.8 Materials needs activation helpers and active-filtered chunk queries

The `materials.active` column exists but there's no convenience API.

```js
// Add to Materials in db.js
async setActive(id, active) {
  const db = await getDb();
  await db.execute(
    'UPDATE materials SET active = ?, updated_at = ? WHERE id = ?',
    [active ? 1 : 0, now(), id]
  );
},

async getActiveByCourse(courseId) {
  const db = await getDb();
  return db.select(
    'SELECT * FROM materials WHERE course_id = ? AND active = 1 ORDER BY created_at',
    [courseId]
  );
}
```

```js
// Add to Chunks in db.js
async getActiveByCourse(courseId) {
  const db = await getDb();
  return db.select(
    `SELECT c.* FROM chunks c
     JOIN materials m ON c.material_id = m.id
     WHERE c.course_id = ? AND m.active = 1
     ORDER BY c.ordering`,
    [courseId]
  );
}
```

### 16.9 Delete methods must be replaced or removed

Per Section 14 cascade audit, these db.js methods must change:

```js
// REMOVE these methods entirely:
// Courses.delete(id)    → replaced by Courses.archive(id) below
// Materials.delete(id)  → replaced by Materials.setActive(id, false) in 16.8
// Chunks.delete(id)     → no replacement. No code path should delete chunks.
// DB.deleteChunk()      → no replacement. V1 compat artifact.
// DB.deleteCourse()     → replaced by Courses.archive(id) below

// ADD to Courses in db.js:
async archive(id) {
  const db = await getDb();
  await db.execute(
    'UPDATE courses SET is_archived = 1, updated_at = ? WHERE id = ?',
    [now(), id]
  );
},

async unarchive(id) {
  const db = await getDb();
  await db.execute(
    'UPDATE courses SET is_archived = 0, updated_at = ? WHERE id = ?',
    [now(), id]
  );
},

async getAllActive() {
  const db = await getDb();
  return db.select(
    'SELECT * FROM courses WHERE is_archived = 0 ORDER BY created_at DESC'
  );
},

async getArchived() {
  const db = await getDb();
  return db.select(
    'SELECT * FROM courses WHERE is_archived = 1 ORDER BY updated_at DESC'
  );
}
```

All queries that list courses for the student must filter `WHERE is_archived = 0`. Specifically, `Courses.getAll()` in db.js currently returns all courses unfiltered. Replace its usage in the course picker and dashboard with `Courses.getAllActive()`. Keep `getAll()` available for admin/debug views but rename to `getAllIncludingArchived()` to make intent explicit.

### 16.10 WAL mode must be set on database init

```js
// In db.js, update initSqlite()
const initSqlite = async () => {
  if (sqliteDb) return sqliteDb;
  sqliteDb = await Database.load('sqlite:study.db');
  // Crash safety — writes complete or roll back, no corruption
  await sqliteDb.execute('PRAGMA journal_mode = WAL');
  await sqliteDb.execute('PRAGMA synchronous = NORMAL');
  console.log('[DB] SQLite initialized (WAL mode)');
  return sqliteDb;
};
```

### 16.11 Mastery.upsert() for V1 migration

The V1 compat migration in Section 14 calls `Mastery.upsert()` but no such method exists in db.js. The current `Mastery` object only has `create()` and `update()` with separate signatures.

```js
// Add to Mastery in db.js
async upsert(subSkillId, fields) {
  const db = await getDb();
  const existing = await db.select(
    'SELECT id FROM sub_skill_mastery WHERE sub_skill_id = ?', [subSkillId]
  );
  if (existing.length > 0) {
    const sets = [];
    const vals = [];
    // Convert camelCase keys to snake_case for SQL column names
    const snakeCase = (s) => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${snakeCase(k)} = ?`);
      vals.push(v);
    }
    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(subSkillId);
    await db.execute(
      `UPDATE sub_skill_mastery SET ${sets.join(', ')} WHERE sub_skill_id = ?`,
      vals
    );
  } else {
    await db.execute(
      `INSERT INTO sub_skill_mastery (sub_skill_id, total_mastery_points, reps, updated_at)
       VALUES (?, ?, ?, ?)`,
      [subSkillId, fields.totalMasteryPoints || 0, fields.reps || 0, now()]
    );
  }
}
```

### 16.12 ChunkSkillBindings.createBatch() needs externalTransaction flag

Section 16.2's extraction pipeline calls `ChunkSkillBindings.createBatch(bindings, { externalTransaction: true })` but the current `createBatch()` wraps its own transaction. Same fix pattern as `SubSkills.createBatch()` in 16.2:

```js
async createBatch(bindings, { externalTransaction = false } = {}) {
  const db = await getDb();
  if (!externalTransaction) await db.execute('BEGIN');
  try {
    for (const b of bindings) {
      await db.execute(
        `INSERT INTO chunk_skill_bindings (chunk_id, sub_skill_id, extraction_context,
           confidence, extracted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [b.chunkId, b.subSkillId, b.extractionContext || null,
         b.confidence || 1.0, now(), now()]
      );
    }
    if (!externalTransaction) await db.execute('COMMIT');
  } catch (e) {
    if (!externalTransaction) await db.execute('ROLLBACK');
    throw e;
  }
}
```

### 16.13 generateConceptKey() utility function

Referenced in V1 migration (Section 14) and conceptKey generation throughout. Normalizes a skill name into the `{category}/{kebab-name}` format.

```js
// Add to a utils module or top of db.js
function generateConceptKey(name, category = null) {
  const kebab = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // strip punctuation
    .trim()
    .replace(/\s+/g, '-');          // spaces to hyphens

  if (category) {
    const catKebab = category
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return `${catKebab}/${kebab}`;
  }
  return kebab;
}
```

Used by: V1 migration (Section 14), post-processing conceptKey validation (Step 3), and any future code that needs to normalize skill names to stable keys.

### 16.14 SubSkills.updateFromReextraction() for re-extraction identity matches

Section 6 says matched skills get updated description, added criteria, and refreshed evidence while keeping the skill ID and all progress data. No method exists for this.

```js
// Add to SubSkills in db.js
async updateFromReextraction(skillId, { description, masteryCriteria, evidence,
                                        bloomsLevel, skillType, materialLabel }) {
  const db = await getDb();
  const existing = await db.select(
    'SELECT mastery_criteria, evidence FROM sub_skills WHERE id = ?', [skillId]
  );
  if (!existing.length) return;

  // Merge criteria: keep existing, append new (deduplicated by text)
  const oldCriteria = JSON.parse(existing[0].mastery_criteria || '[]');
  const oldTexts = new Set(oldCriteria.map(c => c.text));
  const newWrapped = (masteryCriteria || []).filter(text => !oldTexts.has(text))
    .map(text => ({ text, source: materialLabel, addedAt: new Date().toISOString() }));
  const mergedCriteria = [...oldCriteria, ...newWrapped];

  // Merge evidence: union anchor terms, definitions, keep max counts
  const oldEvidence = JSON.parse(existing[0].evidence || '{}');
  const mergedEvidence = {
    anchorTerms: [...new Set([...(oldEvidence.anchorTerms || []), ...(evidence?.anchorTerms || [])])],
    definitionsFound: [...new Set([...(oldEvidence.definitionsFound || []), ...(evidence?.definitionsFound || [])])],
    examplesInSource: Math.max(oldEvidence.examplesInSource || 0, evidence?.examplesInSource || 0),
    equationPresence: oldEvidence.equationPresence || evidence?.equationPresence || false,
    figureReferences: [...new Set([...(oldEvidence.figureReferences || []), ...(evidence?.figureReferences || [])])],
  };

  await db.execute(
    `UPDATE sub_skills SET description = ?, mastery_criteria = ?, evidence = ?,
       blooms_level = COALESCE(?, blooms_level),
       skill_type = COALESCE(?, skill_type),
       updated_at = ?
     WHERE id = ?`,
    [description, JSON.stringify(mergedCriteria), JSON.stringify(mergedEvidence),
     bloomsLevel || null, skillType || null, now(), skillId]
  );
}
```

---

## 17. Resolved Design Questions

1. ~~**Parent skill auto-assignment.**~~ CIP code is parent skill identity, assigned by LLM on first extraction.
2. ~~**Embedding column.**~~ Leave column in schema, don't populate. 100-600 total skills is small enough to send directly to LLM.
3. ~~**Practice set migration.**~~ Clean break. v2 extraction produces new skills, practice sets start fresh.
4. ~~**Chunk selection UI.**~~ Keep it, display at chapter level (~15 checkboxes instead of ~373).
5. ~~**Rate limiting.**~~ Haiku Tier 1: 50 RPM, 50K ITPM. 2-second delays between calls. Exponential backoff on 429s.
6. ~~**Syllabi as extraction context.**~~ Syllabus feeds Readiness Engine, not extraction. Separation of concerns: textbook = what to learn, syllabus = when it's due.
7. ~~**Document deletion.**~~ Documents are never deleted, only deactivated. Paid upload is permanent.
8. ~~**Fitness field shape.**~~ Canonical: `practiceAttempts, practiceSuccesses, tutoringReferences, assignmentMappings, lastUsed`. Success rate derived.
9. ~~**sub_skills.id for sync.**~~ UUID column added alongside integer id. Integer stays for local FK performance, UUID used for future sync.
