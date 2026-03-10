# QA: Concept Link Generation Testing

**Date:** 2026-03-10
**Covers:** Steps 2.2 (DB module), 2.3 (generator), 2.4 (extraction hooks)
**Method:** Static code trace + build verification

---

## Test Results

### 1. Link Creation Flow — PASS

**Trace:** Second material for same course under same parent:
- `runExtractionV2` → `existingV2.length > 0` → `extractChaptersOnly()` → returns `createdSkillIds` (new skills only)
- `result.createdSkillIds?.length > 0` → lazy import `conceptLinks.js` → `generateConceptLinks(courseId, result.createdSkillIds)`
- Inside: `SubSkills.getByCourse(courseId)` loads all course skills → filters to new → groups by parent
- `SubSkills.getByParent(parentId)` loads ALL skills under parent (cross-course) → filters out new → existing found
- `buildPrompt()` → `callClaude()` Haiku → `extractJSON()` → validate → `ConceptLinks.createBatch()`
- Links written to `concept_links` table

**Verified:** Complete data path from extraction result to DB write.

### 2. Canonical Ordering — PASS

**`ConceptLinks.create` (db.js:1354):**
```js
const [a, b] = subSkillAId < subSkillBId ? [subSkillAId, subSkillBId] : [subSkillBId, subSkillAId];
```

**`ConceptLinks.createBatch` (db.js:1365):** Same swap logic per item.

**DB constraint (001_v2_schema.sql:274):** `CHECK (sub_skill_a_id < sub_skill_b_id)` — safety net.

**Duplicate prevention:** `INSERT OR IGNORE` + unique index `idx_concept_link_pair` on `(sub_skill_a_id, sub_skill_b_id, link_type)`. Same pair with same type silently skipped. Same pair with different type allowed (correct — a pair can be both "prerequisite" and "related").

**Verified:** All code paths enforce `a < b`. DB constraint catches any missed swaps. Idempotent re-runs safe.

### 3. Confidence Filtering — PASS

**Code (conceptLinks.js:104-106):**
```js
if (typeof pair.confidence !== 'number' || pair.confidence < 0.7) continue;
if (pair.type === 'same_concept' && pair.confidence < 0.9) continue;
```

**Thresholds:**
| Type | Minimum confidence |
|------|-------------------|
| `same_concept` | 0.9 |
| `prerequisite` | 0.7 |
| `related` | 0.7 |

**Prompt alignment:** Prompt tells LLM `confidence >= 0.7` (line 40) and `same_concept confidence >= 0.9` (line 34). Code enforces the same — defense in depth.

**Verified:** Non-numeric confidence values also filtered (typeof check).

### 4. Link Types — PASS

**Validation (conceptLinks.js:98):**
```js
const validTypes = new Set(['same_concept', 'prerequisite', 'related']);
```

Any LLM-hallucinated type (e.g. "similar", "depends_on") is silently filtered.

**Prompt defines all three types** with distinct descriptions:
- `same_concept` — Same underlying knowledge
- `prerequisite` — Directional dependency
- `related` — Topical connection

**Verified:** Only the three documented types accepted.

### 5. First Extraction Skip — PASS

**Trace:** New course, first material:
- `runExtractionV2` → `existingV2.length === 0` → `extractCourse()` → returns `createdSkillIds` (all new)
- `result.createdSkillIds?.length > 0` → `generateConceptLinks(courseId, [all IDs])`
- Inside: `newIdSet = Set(all IDs)` → `SubSkills.getByCourse(courseId)` → all skills are new → grouped by parent
- `SubSkills.getByParent(parentId)` → all skills under parent are in `newIdSet` (same extraction)
- `existingSkills = allParentSkills.filter(s => !newIdSet.has(s.id))` → **empty array**
- `existingSkills.length === 0` → `stats.skipped++` → **no API call**

**Exception:** If another course already has skills under the same parent domain, `getByParent` will return them as existing skills and the API call WILL fire. This is correct behavior — cross-course concept linking is intentional.

**Verified:** No empty API calls on first extraction (single-course scenario). No errors thrown.

### 6. Cross-Parent Isolation — PASS

**Grouping (conceptLinks.js:60-66):**
```js
const byParent = new Map();
for (const s of newSkills) {
  if (!s.parent_skill_id) continue;
  // ...groups by parent_skill_id
}
```

**Per-parent processing (conceptLinks.js:69-123):** Each parent group processed independently. `getByParent(parentId)` only returns skills with matching `parent_skill_id`.

**Verified:** A "Chain Rule" skill under parent "Calculus" (parent_skill_id=5) is NEVER compared to a "Newton's Laws" skill under parent "Physics" (parent_skill_id=8). Different parents = different prompt calls = no cross-contamination.

Skills with `parent_skill_id = null` are excluded (line 63: `if (!s.parent_skill_id) continue`).

### 7. Non-Blocking Behavior — PASS

**Outer guard (skills.js:566-571, 599-604):**
```js
if (result.createdSkillIds?.length > 0) {
  try {
    const { generateConceptLinks } = await import('./conceptLinks.js');
    const clResult = await generateConceptLinks(courseId, result.createdSkillIds);
    if (clResult.linksCreated > 0) console.log(`[ConceptLinks] ...`);
  } catch (e) { console.warn('[ConceptLinks] Generation failed (non-critical):', e); }
}
```

**Inner guard (conceptLinks.js:120-122):** Per-parent try/catch — individual parent failures recorded in `stats.issues`, loop continues.

**API error handling (conceptLinks.js:84-87):** `callClaude` returns `"Error: ..."` string → logged to issues, `continue` to next parent.

**Parse error handling (conceptLinks.js:90-93):** `extractJSON` returns `null` → logged, `continue`.

**Verified:** Three layers of error containment. Extraction always returns successfully regardless of concept link outcome.

### 8. API Cost Sanity — PASS

**Per-skill token estimate:**
- `buildSkillLine`: concept_key + name + description(120 chars, ~30 tokens) + category + skill_type + 3 criteria
- Approximate: ~60 tokens per skill

**Typical scenario (30 skills):**
- System prompt: ~30 tokens
- 10 new skills: 600 tokens
- 20 existing skills: 1200 tokens
- Output (30 pairs max): ~1200 tokens
- **Total: ~3030 tokens**
- **Cost: ~$0.006** (Haiku: $0.80/M input, $4.00/M output)

**Prompt cap:** `max 30 pairs` in prompt rules limits output tokens.

**`callClaude` maxTokens:** 4096 (conceptLinks.js:82) — appropriate ceiling.

**Verified:** Cost well under $0.01 per extraction run.

### 9. Edge Cases

**Course with 1 sub-skill — PASS:**
- 1 new skill → `byParent` has 1 group with 1 skill
- `getByParent` returns 1 skill → `existingSkills` empty (it's in `newIdSet`)
- `existingSkills.length === 0` → skipped, no API call

**Parent with 100+ existing skills — KNOWN LIMITATION (non-blocking):**
- 100 skills × ~60 tokens = ~6000 input tokens
- Within Haiku's 200k context window — no functional issue
- No truncation or batching implemented
- Description truncated at 120 chars (conceptLinks.js:8) limits per-skill size
- Prompt output capped at 30 pairs — output bounded
- **Assessment:** Works correctly but sub-optimal for very large domains. Acceptable for v1.

**Rolled-back transaction phantom IDs — PASS:**
- `extractCourse` populates `conceptKeyToId` inside `withTransaction`
- If transaction fails, Map has entries for non-existent skills
- Phantom IDs end up in `createdSkillIds`
- **Safe because:** `generateConceptLinks` loads `SubSkills.getByCourse(courseId)` which only returns persisted rows → `newIdSet.has(s.id)` filters phantom IDs out → no prompt, no writes for non-existent skills

**Skills with no parent_skill_id — PASS:**
- Line 63: `if (!s.parent_skill_id) continue` — orphan skills silently skipped

**Empty `pairs` array from LLM — PASS:**
- `parsed.pairs` is `[]` → `validLinks` stays empty → no `createBatch` call → `stats.linksCreated` stays 0

### 10. Build Verification — PASS

```
✓ built in 1.28s

dist/assets/conceptLinks-DNQyzAXz.js  2.58 kB │ gzip: 1.30 kB  (code-split chunk)
dist/assets/index-DiulsJwh.js      1,029.69 kB │ gzip: 292.70 kB (main bundle)
```

- No compilation errors or warnings (beyond pre-existing chunk size advisory)
- `conceptLinks.js` properly code-split via lazy `import()` — not in main bundle
- All static imports resolved: `SubSkills`, `ConceptLinks` from db.js, `callClaude`, `extractJSON` from api.js

---

## Static Trace Summary

| Test | Result | Notes |
|------|--------|-------|
| Link creation flow | PASS | Full path traced: extraction → IDs → grouping → API → DB |
| Canonical ordering | PASS | Code swap + DB CHECK + unique index |
| Confidence filtering | PASS | >= 0.7 base, >= 0.9 same_concept, typeof guard |
| Link types | PASS | Whitelist of 3 types, others silently filtered |
| First extraction skip | PASS | No existing skills → no API call (single-course) |
| Cross-parent isolation | PASS | Grouped by parent_skill_id, separate prompts |
| Non-blocking | PASS | 3 layers of try/catch, extraction never fails |
| API cost sanity | PASS | ~$0.006 per run, well under $0.01 |
| Edge: 1 skill | PASS | Skipped, no API call |
| Edge: 100+ skills | KNOWN LIMIT | Works but no batching — acceptable for v1 |
| Edge: phantom IDs | PASS | Filtered by DB reality check |
| Build verification | PASS | Clean build, proper code-splitting |

## Phase 2 Checkpoint

- [x] SA blueprint deposited (`knowledge/architecture/concept-link-generation-2026-03-10.md`)
- [x] DEV: DB module (`ConceptLinks` in db.js — 7 methods, ~70 lines)
- [x] DEV: Generator (`conceptLinks.js` — 127 lines, 1 export)
- [x] DEV: Extraction hooks (`extraction.js` — 3 functions return `createdSkillIds`, `skills.js` — both branches hooked)
- [x] QA: All 10 test categories verified
- [x] Build verified — clean, code-split
- [x] Concept links populate after extraction for multi-material courses (trace verified)
