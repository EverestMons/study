# Skill-to-Facet Coverage Gap — Diagnostic Findings
**Date:** 2026-03-29

---

## Part A — Code Tracing (Extraction Pipeline)

### Q1: How are skills and facets written to DB after extraction?

**Extraction flow:** `runExtractionV2()` (skills.js:581) → `extractCourse()` (extraction.js:1074) → per-chapter `extractChapter()` → LLM call → `postProcessChapterSkills()` → DB save transaction.

The DB save transaction (extraction.js:1132-1234):
```
1. SubSkills.createBatch(skillRecords)        ← ALWAYS runs for all skills
2. for each skill:
   if (facetRecords.length > 0):              ← CONDITIONAL guard
     Facets.createBatch(facetRecords)          ← only if facets exist
     FacetMastery.upsert() for each facet      ← FSRS defaults: stability=1.0, retrievability=1.0
3. ChunkFacetBindings.createBatch()           ← chunk bindings for facets
4. ChunkSkillBindings.createBatch()           ← backward-compat skill-level bindings
```

**Key finding:** Skills and facets are NOT atomically coupled. The `if (facetRecords.length > 0)` guard at line 1183 means a skill CAN be created without facets if the LLM returns an empty `facets` array. The prompt instructs "Each skill MUST have 2-6 facets" (line 407), but there's no code-level enforcement.

### Q2: What does the LLM response look like? Can a skill have zero facets?

The extraction prompt (`buildInitialExtractionPrompt`, extraction.js:289) requests:
```
TARGET: Extract N-M skills, each with 2-6 facets.
```

Expected schema includes `facets` as a nested array under each skill. The code handles the LLM response at line 945-953:
```js
rawSkills = parsed.subSkills || [];  // or Array.isArray(parsed) or parsed.subSkills
```

`rawSkills` elements are expected to have a `.facets` array, but the code accesses it defensively: `(s.facets || [])` at line 1136 and `(skill.facets || [])` at line 1173. If the LLM returns a skill with `facets: []` or missing `facets`, the skill is created without facets.

`postProcessChapterSkills()` (extraction.js:544) does NOT validate facet presence — it only processes mastery criteria, circular deps, and deduplication.

**Conclusion:** The LLM is instructed to always generate facets, but neither the parser nor post-processor enforces it. A facetless skill passes through silently.

### Q3: `decomposeAssignments` — how are `requiredSkills` matched?

Two modes depending on facet availability (skills.js:303):

**Facet mode** (`useFacets = courseFacets.length > 0`):
- LLM maps questions to facet IDs from `AVAILABLE FACETS` list
- `resolveFacetId()` (db.js:1053) resolves by: exact ID → conceptKey → name (case-insensitive)
- Writes to `assignment_question_facets`, then DERIVES skill from `facet.skill_id` → `assignment_question_skills`
- A question's `requiredSkills` is thus always linked through facets → guaranteed facet coverage

**Skill mode** (fallback when no facets exist):
- LLM maps questions to skill conceptKeys from `AVAILABLE SKILLS` list
- `resolveSkillId()` resolves by conceptKey or name match
- Writes to `assignment_question_skills` only — no facet linkage
- **These skills may or may not have facets**

**Runtime loading:** `loadAssignmentsCompat()` (StudyContext.jsx:42) transforms skill objects to strings:
```js
requiredSkills: (q.requiredSkills || []).map(s => s.conceptKey || s.name || String(s.subSkillId))
```

The unlock gate at line 1402 resolves these strings back to skill objects via `cachedSessionCtx.current.skills.find(s => s.id === sid || s.conceptKey === sid)`. This works correctly since `sid` is a string conceptKey.

### Q4: Is there a DB constraint ensuring every skill has facets?

**NO.** There is no foreign key, CHECK constraint, or trigger enforcing facet presence. The `facets` table has `skill_id` referencing `sub_skills`, but the relationship is optional — a skill can exist with zero facet rows. Enforcement is purely application-level (LLM prompt instruction + defensive code).

### Q5: `chunk_facet_bindings` — created alongside facets?

**Yes, during extraction.** After facets are created, `resolveChunkBindingsDirect()` builds bindings from the LLM's `sourceChunks` references, and `ChunkFacetBindings.createBatch()` writes them (extraction.js:1207-1208).

A facet CAN exist with zero bindings if:
- The LLM didn't provide `sourceChunks` for that facet
- The referenced chunk IDs didn't resolve to valid chunks in the chapter
- The facet was created via a different code path (e.g., `enrichFromMaterial`, `extractChaptersOnly`)

---

## Part B — Live DB Audit

### Q6: Total skills
```
679 skills in sub_skills table
```

### Q7: Skills with ZERO facets
```
0 skills with zero facets
```

Every skill in the DB has at least one facet. The extraction prompt's "2-6 facets" instruction has held in practice.

### Q8: Skills with lowest facet counts

| Skill | Facet Count |
|---|---|
| Implementing Generic Collections with Type Parameters | 1 |
| Create UML Diagrams for Classes | 1 |
| Abstract Class Instantiation | 1 |
| Understand Dual Evolution Paths of Computer Networking | 1 |
| Network Repeaters and Signal Regeneration | 1 |
| Network Hubs and Multi-Port Repeaters | 1 |
| Network Switches and Point-to-Point Connections | 1 |
| Network Bridges and Network Segmentation | 1 |
| Network Gateways and Protocol Translation | 1 |
| Order of Magnitude Calculation | 1 |
| Understand Storage Device Types and Characteristics | 1 |
| Understand Magnetic Tape Storage | 1 |
| SCSI Arbitration and Multi-Device Bus Management | 1 |
| Storage System Failure Recovery and Redundancy | 1 |
| Understanding Indirect Recursion | 1 |
| Binary Tree Subtree and Traversal Components | 1 |
| Reverse-Engineer Assembly Code to C | 1 |

**17 skills have only 1 facet** (below the 2-6 target). Many are narrow networking/hardware concepts that the LLM likely judged atomic enough for a single facet.

### Q9: Assignment questions → facets → skills

Assignment questions ARE properly mapped through `assignment_question_facets` → `facets` → `sub_skills`. Sample:
```
"In a MOV instruction, identify source/dest operand" →
  facet 889 → skill 284 (MOV Instruction Operand Semantics)
  facet 576 → skill 188 (Data Transfer with MOV Instruction)
```

Questions map to multiple facets across multiple skills. The facet-mode decomposition is working correctly.

### Q10: Orphan facets (no chunk bindings)
```
51 facets have NO chunk_facet_bindings
```

Out of 2,100 total active facets, 51 (2.4%) are orphans with no associated source content. These facets exist in the FSRS system but have no teaching material linked. This means:
- `buildFocusedContext()` won't find source chunks for these facets
- The AI will need to teach them without material context

Total counts: 2,100 active facets, 2,148 chunk_facet_bindings.

---

## Summary

| Check | Status | Notes |
|---|---|---|
| Skills always created with facets? | **Code: No, DB: Yes** | Guard at line 1183 allows facetless skills, but LLM hasn't produced any |
| DB constraint enforcing facets? | **No** | Purely prompt-level enforcement |
| Assignment requiredSkills point to skills with facets? | **Yes** | All assignment-linked skills have 1+ facets (min: 1 facet) |
| `computeFacetReadiness` safe for all skills? | **Yes (currently)** | 0 facetless skills in DB, but no code-level guarantee |
| Facets have chunk bindings? | **97.6%** | 51/2,100 orphan facets (2.4%) have no source content |
| Single-facet skills | **17 skills** | Below 2-facet target; FSRS works but readiness is single-point |

### Risks

1. **No code-level facet enforcement**: If the LLM ever returns a skill without facets (model degradation, edge case), the skill will be created, `computeFacetReadiness` will return `undefined` for it, and any assignment question requiring that skill will be permanently locked.

2. **51 orphan facets**: Teaching sessions for these facets will lack source material context. Not a blocking issue but reduces teaching quality.

3. **17 single-facet skills**: FSRS readiness for these is a single point estimate — one rating determines unlock eligibility. Less reliable than multi-facet averaging.
