# Extraction Granularity Audit
**Date:** 2026-03-12
**Phase:** 0 — Facet Architecture
**Status:** Complete

---

## 1. Current Extraction Output Structure

### Skill Schema (as extracted by LLM)

Each chapter extraction produces an array of skills with this structure:

```json
{
  "name": "Skill Name",
  "conceptKey": "category/kebab-skill-name",
  "description": "One sentence describing what the student can do",
  "masteryCriteria": ["Testable statement 1", "Testable statement 2"],
  "category": "Chapter Topic",
  "skillType": "procedural|conceptual|recall|synthesis",
  "bloomsLevel": "remember|understand|apply|analyze|evaluate|create",
  "prerequisites": ["concept-key-of-prereq"],
  "evidence": {
    "anchorTerms": ["term1", "term2"],
    "definitionsFound": ["definition text..."],
    "examplesInSource": 2,
    "equationPresence": true,
    "figureReferences": ["Figure 3.15"]
  },
  "sourceChunkLabels": ["Section heading that contains this skill"]
}
```

### Post-Processing Transforms (extraction.js:434-558)

After LLM extraction, each skill undergoes 7 deterministic checks:

1. **Mastery criteria wrapping**: `"text"` → `{text, source: materialLabel, addedAt: ISO}`
2. **Prerequisite validation**: Removes self-refs, invalid keys, circular deps (DFS)
3. **Duplicate detection**: Normalized name comparison, keeps first occurrence
4. **Prerequisite cap**: Warns if >8 prereqs per skill
5. **Skill count sanity**: Warns if below `min × 0.5` or above `max × 2`
6. **Evidence check**: Flags missing anchorTerms or definitionsFound
7. **Mastery criteria minimum**: Warns if <2 criteria per skill

### Storage Schema (sub_skills table, after migration 002)

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| parent_skill_id | TEXT FK | → parent_skills (CIP domain) |
| name | TEXT | Skill display name |
| description | TEXT | One-sentence description |
| concept_key | TEXT | Identity key for matching: `category/kebab-name` |
| category | TEXT | Chapter topic grouping |
| skill_type | TEXT | procedural/conceptual/recall/synthesis |
| blooms_level | TEXT | Bloom's taxonomy |
| mastery_criteria | TEXT (JSON) | Array of `{text, source, addedAt}` |
| evidence | TEXT (JSON) | `{anchorTerms, definitionsFound, examplesInSource, equationPresence, figureReferences}` |
| fitness | TEXT (JSON) | `{practiceAttempts, practiceSuccesses, diagnosticCount, tutoringReferences, assignmentMappings, decayEvents, lastUsed}` |
| extraction_model | TEXT | e.g., `claude-haiku-4-5` |
| schema_version | INTEGER | Currently 2 |
| merged_from | TEXT (JSON) | Array of absorbed skill IDs |
| is_archived | INTEGER | Soft delete |
| uuid | TEXT | Unique identifier |
| source_course_id | TEXT FK | → courses |

---

## 2. Where Mastery Criteria Contain Multiple Independently-Testable Facets

### Problem Statement

The current prompt requests "2-4 testable statements per skill" as `masteryCriteria`. In practice, these criteria often describe **independent sub-capabilities** that warrant their own FSRS schedule.

### Analysis of the Extraction Prompt

The prompt instructs the LLM (extraction.js:280-288):
```
Each bold term is a candidate concept. Confirm it as a skill, merge it
with related terms, or reject it.
```

And the three quality tests (extraction.js:283-286):
- **DIAGNOSTIC TEST**: Can you ask ONE question to check this?
- **PRACTICE TEST**: Can you generate 5 different problems?
- **DECAY TEST**: Can a student forget THIS independently?

These tests are applied at the **skill level**, not at the mastery criteria level. The result is skills that are appropriately sized for the diagnostic and practice tests, but whose mastery criteria describe **2-4 independently-forgettable facets**.

### Concrete Example Patterns

Given a textbook chapter on "Binary Search Trees":

**Current extraction (single skill):**
```json
{
  "name": "BST Operations",
  "conceptKey": "data-structures/bst-operations",
  "masteryCriteria": [
    "Can insert a node into a BST maintaining the BST property",
    "Can delete a node (all three cases: leaf, one child, two children)",
    "Can search for a value and determine if it exists",
    "Can perform in-order traversal to get sorted output"
  ]
}
```

**Problem:** A student who masters insertion but forgets the three-case deletion algorithm gets the entire skill's FSRS schedule affected. The system cannot:
- Schedule targeted review of just deletion
- Credit the student for knowing insertion
- Track which specific capability the student struggles with

**What facet extraction would produce:**
```
Skill: "BST Operations"
  Facet: "BST Insertion" — criteria: ["Maintains BST property", "Handles duplicate keys"]
  Facet: "BST Deletion" — criteria: ["Handles leaf case", "Handles one-child case", "Handles two-child successor replacement"]
  Facet: "BST Search" — criteria: ["Recursive search", "Iterative search"]
  Facet: "BST In-Order Traversal" — criteria: ["Produces sorted output", "Can trace traversal steps"]
```

### Where This Problem Is Most Acute

| Skill Type | Facet Explosion Risk | Example |
|---|---|---|
| **Procedural** | HIGH — each procedure step is independently forgettable | "Matrix Operations" → multiply, invert, transpose, determinant |
| **Synthesis** | HIGH — combines multiple sub-capabilities | "Circuit Analysis" → KVL, KCL, Thevenin, Norton |
| **Conceptual** | MEDIUM — concepts may be linked but independently testable | "Market Structures" → perfect competition, monopoly, oligopoly |
| **Recall** | LOW — definitions are usually atomic enough | "Vocabulary: Photosynthesis" → usually one thing to remember |

### Estimated Impact

For a typical textbook chapter extracting 5-10 skills with 2-4 criteria each:
- **Current**: 5-10 FSRS-tracked units per chapter
- **After facets**: 15-30 FSRS-tracked units per chapter (2-3× increase)
- **Benefit**: Precision review scheduling, targeted weakness identification

---

## 3. Chunk Binding Accuracy Assessment

### Current Binding Resolution (extraction.js:560-618)

The `resolveChunkBindings()` function uses a three-tier matching strategy:

```
Tier 1: Exact heading match        → confidence 1.0
Tier 2: Substring (case-insensitive) → confidence 0.9
Tier 3: FALLBACK to ALL chapter chunks → confidence 0.5
```

### How Labels Are Generated

The LLM outputs `sourceChunkLabels` as section headings it believes contain the skill (extraction.js:336):
```json
"sourceChunkLabels": ["Section heading that contains this skill"]
```

However, the LLM **never sees chunk IDs or exact heading text**. It only receives:
1. The chapter structure summary (section heading list) in the system prompt
2. The raw chapter content (chunks joined with `---` separators) in the user message

The content is sent as (extraction.js:693-695):
```javascript
const chapterContent = chapterGroup.chunks
    .map(c => c.content || '')
    .join('\n\n---\n\n');
```

**Critical gap**: Chunk boundaries are invisible to the LLM. It sees a wall of text with `---` dividers, not labeled chunks with IDs. The section headings listed in the system prompt may not exactly match the chunk labels from the chunker.

### Failure Modes

| Failure | Cause | Result |
|---|---|---|
| **Heading mismatch** | LLM paraphrases section heading vs. chunker's exact label | Falls to Tier 2 (substring) or Tier 3 (all-chapter fallback) |
| **Cross-chunk skill** | Skill spans multiple chunks, LLM lists one heading | Missing bindings for additional chunks |
| **Merged chunks** | Chunker merged small sections (MIN_CHUNK=2000), label only reflects first section | LLM labels don't match merged heading |
| **Split chunks** | Chunker split oversized sections, creating "Section N" labels | LLM doesn't know these synthetic labels exist |
| **No heading** | Chunk has no heading_level, gets `Section {sectionPath}` label | LLM won't output "Section 2.3" as a sourceChunkLabel |

### Estimated Fallback Rate

Based on the mismatch surface area:
- **Tier 1 (exact match)**: ~40-60% of bindings — only when LLM happens to reproduce exact heading text
- **Tier 2 (substring)**: ~20-30% — when LLM uses a shorter/longer version of the heading
- **Tier 3 (all-chapter fallback)**: ~15-30% — when labels completely fail to match

A Tier 3 fallback for a 10-chunk chapter binds ONE skill to ALL 10 chunks at 0.5 confidence, creating **9 false-positive bindings** per fallback skill. For a chapter with 8 skills and 3 falling back, that's **27 false-positive bindings**.

### Impact on Downstream Systems

1. **Context builder** (study.js): Doesn't use chunk_skill_bindings at all — uses keyword matching on recent messages. The binding accuracy problem is **currently masked** because the context builder ignores bindings entirely.

2. **Future context builder** (planned): Will traverse facet → chunk_facet_bindings. False-positive bindings will cause the wrong chunks to be loaded, wasting tokens and confusing the tutor.

3. **Assignment question mapping**: `assignment_question_skills` maps questions → skills, not questions → chunks. Bindings are unused here.

---

## 4. Enrichment Pass Binding Behavior

### Current Enrichment (extraction.js:951+)

When a second material is uploaded for the same course:

1. Existing skills loaded via `SubSkills.getByCourse(courseId)`
2. New material chunked and sent to enrichment prompt
3. LLM returns `{enrichments, newSkills, unmatchedExisting}`
4. Enrichments update existing skill criteria and evidence
5. New skills get created with full schema

**Binding behavior during enrichment**: New chunk bindings are created for new skills and for enriched existing skills. However:
- Old bindings from the original extraction **persist unchanged**
- No quality ranking or preference signal between old and new bindings
- A skill enriched from lecture slides gets bindings to slide chunks alongside original textbook chunk bindings, but the context builder has no way to know which is the better teaching source

---

## 5. Concept Link Coverage Gaps

### Current Scope (conceptLinks.js:60-79)

Concept links are generated **within the same parent_skill_id** (CIP domain). The flow:

1. Group new skills by `parent_skill_id`
2. For each parent: load ALL existing skills under that parent (across ALL courses)
3. LLM compares new vs. existing within that parent

### Cross-Domain Blind Spot

Skills from different CIP domains are **never compared**. This misses connections like:
- "Statistical Hypothesis Testing" (Statistics) ↔ "Experimental Design" (Biology)
- "Linear Algebra" (Mathematics) ↔ "Quantum State Representation" (Physics)
- "Database Normalization" (CS) ↔ "Set Theory" (Mathematics)

### Duplicate Non-Detection

Same concept extracted from different materials in different courses may get **different CIP codes** (e.g., textbook classified as "Computer Science" vs. supplementary notes classified as "Information Systems"). Since concept links only compare within the same parent, these duplicates are never detected.

### No Pre-Merge Step

The plan calls for deterministic pre-merge by `concept_key` before LLM comparison. Currently:
- Two skills with `concept_key: "data-structures/binary-search-tree"` from different materials are only connected if the concept link LLM call happens to pair them
- No programmatic check for concept_key collisions before the LLM call

---

## 6. Context Builder Analysis

### Current Context Building (study.js:461-593, 596-760)

The `buildContext` and `buildFocusedContext` functions **do not use chunk_skill_bindings at all**.

**How chunks are currently selected for context:**

1. **General context** (buildContext):
   - Extract keywords from last 6 messages
   - Match keywords against skill names → get relevant skill IDs
   - Match skill.sources against material names → get neededDocs
   - For multi-chunk materials: show chunk index, then load up to 3 chunks where label/preview matches keywords
   - For single-chunk materials: load if material name matches needed docs

2. **Focused context** (buildFocusedContext):
   - Assignment focus: Get required skill IDs → match skill.sources → load matching material chunks by label substring
   - Skill focus: Get skill.sources → load matching material chunks by label substring
   - Recap focus: No materials loaded
   - Exam focus: Load ALL chunks from selected materials

### Key Finding

**chunk_skill_bindings are a dead asset**. They're created during extraction but never queried by the context builder. The context builder uses a completely separate keyword-based heuristic to select chunks. This means:
- The entire binding resolution system (exact match → substring → fallback) has no consumer
- Binding confidence values (1.0, 0.9, 0.5) are never used for ranking
- The extraction_context field is never read

**Implication for facets**: The new `chunk_facet_bindings` table must be the PRIMARY input to the context builder. Building it correctly from the start — with direct IDs, typed bindings, quality ranks, and content ranges — is critical because it will actually be used.

---

## 7. Summary: Gaps That Facet Architecture Must Address

| # | Gap | Severity | Solution |
|---|---|---|---|
| 1 | Mastery criteria bundle 2-4 independently-forgettable capabilities | **HIGH** | Promote to facets with own FSRS |
| 2 | Chunk IDs not in LLM prompt → heading-label fuzzy matching | **HIGH** | Send chunk index with IDs, LLM outputs IDs directly |
| 3 | Content is bulk-joined, chunk boundaries invisible to LLM | **HIGH** | Format chunks with `[CHUNK chunk_id: "label"]...[/CHUNK]` markers |
| 4 | Fallback binds skill to ALL chapter chunks at 0.5 | **MEDIUM** | With direct IDs, fallback can be "unbound" instead of "bound to everything" |
| 5 | No binding type (teaches vs. references vs. prerequisite_for) | **MEDIUM** | Add binding_type to prompt output schema |
| 6 | No quality ranking between sources of same skill | **MEDIUM** | Add quality_rank, context builder loads best first |
| 7 | No content range — whole chunk loaded even when only 20% relevant | **MEDIUM** | Add content_range annotation per binding |
| 8 | chunk_skill_bindings never used by context builder | **HIGH** | Rework context builder to traverse facet → binding graph |
| 9 | Concept links only within same CIP domain | **LOW** (deferred) | Facet concept links allow cross-domain comparison |
| 10 | No pre-merge of concept_key duplicates | **LOW** | Deterministic pre-merge before LLM concept link call |
| 11 | Enrichment doesn't update binding quality | **MEDIUM** | Quality ranking on insert, re-ranking on enrichment |
