# CIP Taxonomy Seeding — Systems Architecture Validation
**Date:** 2026-03-08
**Role:** Systems Analyst
**Input:** Blueprint (`cip-taxonomy-seeding-2026-03-08.md`) + Research deposit (`cip-2020-taxonomy-2026-03-08.md`) + current source (`db.js`, `extraction.js`, `App.jsx`, `001_v2_schema.sql`)

---

## 1. Data Structure Validation

### 1.1 Research Data → cipData.js Compatibility

The research deposit provides 416 entries with schema `{ code, name, domain, domainName, aliases }`. The blueprint's `cipData.js` spec expects identical fields. **Exact match — no transformation needed.**

```
Research schema:  { code, name, domain, domainName, aliases[] }
cipData.js spec:  { code, name, domain, domainName, aliases[] }
Status: ✅ COMPATIBLE
```

### 1.2 cipData.js → DB Schema Compatibility

The seeder must map research data to `parent_skills` and `parent_skill_aliases` tables:

| Research field | DB column | Mapping | Notes |
|---|---|---|---|
| `code` | `parent_skills.cip_code` | Direct | TEXT, indexed |
| `name` | `parent_skills.name` | Direct | TEXT NOT NULL |
| `domain` | — | Not stored in DB | Used only for `CIP_DOMAINS` derivation in JS |
| `domainName` | — | Not stored in DB | Same — display-only |
| `aliases[]` | `parent_skill_aliases.alias` | One row per alias | UNIQUE globally, lowercase |

Status: ✅ COMPATIBLE — no schema changes needed.

### 1.3 CIP_DOMAINS Derivation

Current `CIP_DOMAINS` in `App.jsx`: 28 domains (hardcoded).
Research data domains: 42 unique domains.
New domains not in current constant: `28, 29, 34, 36, 37, 39, 41, 46, 47, 48, 49` (military, trades, precision production — niche but complete).

The blueprint's derivation `Object.fromEntries([...new Map(CIP_TAXONOMY.map(e => [e.domain, e.domainName]))])` correctly produces a superset. **Last-wins behavior** in `Map` constructor is safe because all entries within a domain share the same `domainName`.

Status: ✅ COMPATIBLE

### 1.4 Entry Count

Blueprint estimated ~380. Actual NCES count: **416**. Delta of +36 mainly from:
- Series 30 (Interdisciplinary): 51 entries alone (many new 2020 additions like Data Science 30.70, Climate Science 30.35)
- Series 14 (Engineering): 41 entries
- Series 51 (Health): 31 entries

This is fine — "more entries = more precise matching" (per D2).

Status: ✅ ACCEPTABLE

---

## 2. Prompt Token Budget Analysis

### 2.1 Current First-Chapter Prompt Size

The extraction prompt (`buildInitialExtractionPrompt`, extraction.js:245-343) already includes:
- System prompt structure: ~600 tokens
- Bold terms list (up to 50): ~200 tokens
- Definitions (up to 30): ~300 tokens
- Skill schema + rules: ~400 tokens
- **Total existing system prompt: ~1,500 tokens**

Chapter content is sent as user message and varies (typically 2K-15K tokens).

The model used is **Haiku 4.5** with `max_tokens: 8192` for output.

### 2.2 CIP List Addition

Tested 4 prompt formats:

| Format | Characters | Est. Tokens |
|---|---|---|
| One per line (`01.00 Agriculture, General`) | 17,338 | ~4,334 |
| Compact CSV (`01.00=Agriculture, General, ...`) | 17,753 | ~4,438 |
| Grouped by domain | 18,297 | ~4,574 |
| Shortened names (strip ", General" etc.) | 16,757 | ~4,189 |

### 2.3 Assessment

**Haiku 4.5 context window: 200K tokens.** Adding ~4,300 tokens to a system prompt is well within budget. Even with a 15K-token chapter, total input is ~21K tokens — 10% of context.

**However, the blueprint's estimate of "~3-4KB / ~7.6KB" underestimates the actual size.** The actual condensed list is ~17KB (17,338 chars), which translates to ~4,300 tokens. This is larger than the "~380 entries at ~20 chars each = ~7.6KB" estimate because:
1. Actual count is 416, not ~380
2. Average name length is ~42 chars, not ~20 chars (many names are long: "Electrical, Electronics, and Communications Engineering")

### 2.4 Recommendation

**Use Format 4 (shortened names) at ~4,189 tokens.** Strip redundant suffixes (", General", ", Other", "and Related Fields/Services") from the prompt copy only (not from cipData.js canonical names). This saves ~145 tokens with no information loss — the LLM just needs the code and enough name to disambiguate.

**Alternatively**, since this runs only on the first chapter, 4,300 tokens is a completely acceptable cost. No optimization strictly necessary.

Status: ✅ APPROVED — within budget. Minor optimization available.

---

## 3. Alias Collision Risk

### 3.1 The Constraint

`parent_skill_aliases.alias` has a **UNIQUE index globally** (not per-parent-skill). This means each alias string can map to exactly ONE parent skill. The seeder uses `INSERT OR IGNORE`, so the first CIP entry seeded with a given alias wins; later entries with the same alias silently lose that alias.

### 3.2 Collision Analysis

**22 alias collisions found** across 1,429 total aliases (1.5% collision rate):

| Alias | Competing Codes | Assessment |
|---|---|---|
| `"cs"` | 11.01 vs 11.07 | **Fix needed**: remove from 11.01 (General CIS). "CS" universally means Computer Science (11.07). |
| `"computer science"` | 11.01 vs 11.07 | **Fix needed**: remove from 11.01. 11.07 IS Computer Science. |
| `"ece"` | 14.10 vs 14.47 | Acceptable: first-wins is fine since both are ECE-related. 14.47 (Electrical and Computer Engineering) is the better match — ensure it seeds first. |
| `"geo"` | 40.06 vs 45.07 | Acceptable: ambiguous term, first-wins is OK. |
| `"pharm"` | 26.10 vs 51.20 | **Fix needed**: 26.10 should use "pharmacology" only; "pharm" should go to 51.20 (Pharmacy). |
| `"plant bio"` | 01.11 vs 26.03 | Acceptable: 26.03 (Botany/Plant Biology) is the better match. |
| `"arch"` | 04.02 vs 45.03 | Acceptable: ambiguous, first-wins is OK. |
| `"criminology"` | 43.01 vs 45.04 | **Fix needed**: 45.04 IS Criminology; 43.01 (Criminal Justice) should use "cj" instead. |
| `"theology"` | 38.02 vs 39.06 | Acceptable: 39.06 is the better home. |
| `"dietetics"` | 19.05 vs 51.31 | Acceptable: 51.31 IS Dietetics; first-wins is fine if ordered correctly. |
| Other 12 | Various | Low-impact: niche fields, first-wins acceptable. |

### 3.3 Recommendation

**Resolve the 4 critical collisions** before seeding by editing the research data:
1. Remove `"cs"` and `"computer science"` from 11.01 (keep "cis", "computer information sciences")
2. Remove `"pharm"` from 26.10 (keep "pharmacology", "toxicology")
3. Remove `"criminology"` from 43.01 (keep "criminal justice", "cj", "corrections")
4. Ensure seed order places 14.47 before 14.10 for `"ece"` (or remove from 14.10)

The remaining 18 collisions are acceptable — they involve ambiguous terms where first-wins produces a reasonable result.

**Implementation note**: The seeder should process entries in code order (01.00, 01.01, ..., 54.01), which is the natural order of the array. The `INSERT OR IGNORE` ensures deterministic first-wins behavior.

Status: ⚠️ APPROVED WITH AMENDMENTS — fix 4 critical alias collisions in cipData.js.

---

## 4. Startup Performance

### 4.1 Current Startup Sequence

```
Rust: SQL migrations (001-003) ← automatic, before JS
JS init effect (StudyContext.jsx:236):
  1. DB.getCourses()
  2. migrateAssignmentBlobs(loaded)
  3. getApiKey()
  4. setReady(true)
```

### 4.2 Seeder Insertion

The blueprint adds `seedCipTaxonomy()` after migrations but before course loading. The seeder must:
- Check 416 `parent_skills` rows (SELECT by cip_code)
- Insert up to 416 parent skills (first run only)
- Insert up to 1,429 aliases (first run only)
- Total: up to **1,845 DB operations** on first run

### 4.3 Performance Assessment

The DB layer uses a serialized write queue (`withTransaction` / `_txQueue`). Each `INSERT` or `SELECT` goes through `await db.execute()` / `await db.select()`. With WAL mode and `busy_timeout = 5000ms`:

| Scenario | Operations | Est. Time |
|---|---|---|
| First run (cold) | 416 SELECTs + 416 INSERTs + 1,429 INSERTs = 2,261 | 3-8 seconds |
| Subsequent runs (all exist) | 416 SELECTs (all hit, skip) + ~0 alias INSERTs | < 1 second |

**3-8 seconds on first run is acceptable** — it's a one-time cost. However, it CAN be optimized:

### 4.4 Optimization: Batch Check

Instead of 416 individual `SELECT WHERE cip_code = ?` queries, do ONE query:
```sql
SELECT cip_code FROM parent_skills WHERE cip_code IN (?, ?, ...)
```
Then only insert the missing ones. This reduces first-run to ~416 SELECT + N INSERTs (N = missing count, usually 416 on first run) + 1,429 alias INSERTs ≈ 1,845 ops. But subsequent runs drop to **1 SELECT + 0 INSERTs** — near-instant.

Even simpler: check if ANY seeded entry exists first:
```sql
SELECT COUNT(*) FROM parent_skills WHERE is_custom = 0
```
If count ≥ 400, skip entirely. This makes warm startup O(1).

### 4.5 Recommendation

Implement the "count check" fast-path:
1. `SELECT COUNT(*) FROM parent_skills WHERE is_custom = 0`
2. If count ≥ 400 → skip seeding entirely (return `{ seeded: 0, skipped: count }`)
3. Else → run full seeder with batch cip_code lookup

This ensures:
- **First run**: 3-8 seconds (acceptable one-time cost)
- **Every subsequent startup**: < 10ms (single COUNT query)

Status: ✅ APPROVED with fast-path optimization recommended.

---

## 5. findOrCreateByCip Update Review

### 5.1 Current Implementation (db.js:202-206)

```javascript
async findOrCreateByCip(cipCode, displayName) {
  let parent = await this.findByCip(cipCode);
  if (parent) return parent.id;
  return this.create({ name: displayName, cipCode, isCustom: false });
}
```

**Problem**: If the seeded entry exists (e.g., `11.07 = "Computer Science"`), but the LLM returns `cipCode: "11.07"` with `parentDisplayName: "Introduction to Computer Science"`, the current code correctly finds the existing entry and returns its ID — BUT it does not add "Introduction to Computer Science" as an alias. The LLM's unique name is lost.

### 5.2 Blueprint's Updated Flow

1. Exact CIP code match → use it, add LLM's display name as alias if different
2. Alias match on display name → catches abbreviations
3. Create custom parent skill only if neither match

### 5.3 Assessment

The updated flow is correct but has a subtle design question: **should step 2 (alias match) happen before or after step 1 (CIP code match)?**

Current flow: CIP code first → alias second. This is correct because:
- The LLM is prompted to pick a CIP code from the list
- If the LLM picks code X, we trust the code even if the display name matches a different entry's alias
- Alias match is only the fallback for `cipCode: "custom"` or when the LLM returns a code not in the list

**Edge case**: LLM returns `cipCode: "custom"` with `parentDisplayName: "Computer Science"`. Step 2 catches this via alias lookup and maps to 11.07. Good.

**Edge case**: LLM returns `cipCode: "11.01"` (CIS General) with `parentDisplayName: "Computer Science"`. Step 1 finds 11.01, step adds "Computer Science" as alias to 11.01. This is slightly wrong — "Computer Science" should map to 11.07. But this is an LLM classification error, not a system error. The system correctly respects the code the LLM chose. Acceptable.

### 5.4 Recommendation

The updated flow is sound. One addition: **normalize the display name before alias insertion** (lowercase, trim). The `addAlias` function already lowercases. Check that trimming is also done.

Status: ✅ APPROVED

---

## 6. Extraction Prompt Update Review

### 6.1 Current Prompt (extraction.js:290-303)

```
FOR THE FIRST CHAPTER ONLY, also determine the academic classification:
Output a CIP (Classification of Instructional Programs) code that best describes
the subject. Format: "XX.XX" (e.g., "14.10" for Electrical Engineering,
"27.01" for Mathematics, "11.01" for Computer Science).
```

The LLM currently invents the CIP code from its own knowledge. This works surprisingly well (Haiku knows CIP codes) but produces inconsistent naming.

### 6.2 Updated Prompt Design

The blueprint says to include a condensed CIP list and have the LLM select from it. The prompt update should:

1. Replace the freeform CIP instruction with a constrained selection
2. Include the condensed list (416 entries, ~4,300 tokens)
3. Add a `"custom"` fallback instruction
4. Keep the response format identical (`cipCode`, `parentDisplayName`, `subSkills`)

### 6.3 Prompt Placement Decision

Two options:
- **A) Inline in system prompt**: Simple, but adds ~4,300 tokens to every first-chapter call
- **B) Separate user message**: Send CIP list as a second user message before the chapter content

**Recommendation: Option A (inline).** It's simpler, the token cost is acceptable, and this runs only once per material extraction. The system prompt is the right place for reference data the LLM should consult.

### 6.4 Instruction Wording

Suggested replacement for extraction.js lines 290-303:

```
FOR THE FIRST CHAPTER ONLY, also determine the academic classification.
Pick the CIP code from this list that BEST matches the subject:

[condensed CIP list here]

If nothing fits, use cipCode: "custom" and provide your own name.

RESPOND WITH ONLY a JSON object:
{
  "cipCode": "XX.XX",
  "parentDisplayName": "Display Name",
  "subSkills": [ ...array of skills... ]
}
```

Status: ✅ APPROVED

---

## 7. cipData.js File Size

### 7.1 Analysis

The full cipData.js with all 416 entries (code, name, domain, domainName, aliases) is estimated at **~83 KB**. This is a static data file — it:
- Is bundled into the Vite build (tree-shaken if unused exports exist)
- Adds ~83 KB to the JS bundle (gzip: ~15-20 KB)
- Has no runtime cost beyond initial parse

### 7.2 Assessment

The current `index` chunk is 949 KB (gzip: 278 KB). Adding 83 KB raw (~20 KB gzip) increases bundle by **~7%**. This is acceptable for a desktop app.

### 7.3 Consideration: Separate Chunk

If 83 KB feels heavy, Vite can code-split it via dynamic import. But since cipData.js is needed at startup (seeder), this would add async loading complexity for minimal benefit. Not worth it.

Status: ✅ ACCEPTABLE

---

## 8. Summary & Verdict

### Approved Items
| Component | Verdict | Notes |
|---|---|---|
| Data structure (Research → cipData.js → DB) | ✅ Approved | Perfect field alignment, no transforms needed |
| Prompt token budget | ✅ Approved | ~4,300 tokens, well within Haiku 200K context |
| Startup performance | ✅ Approved | Fast-path `COUNT(*)` check recommended |
| findOrCreateByCip update | ✅ Approved | Code-first, alias-fallback flow is correct |
| Extraction prompt update | ✅ Approved | Inline in system prompt, Option A |
| cipData.js bundle size | ✅ Acceptable | ~83 KB raw, ~20 KB gzip, 7% bundle increase |
| CIP_DOMAINS derivation | ✅ Approved | Map-based derivation, superset of current |

### Required Amendments (before implementation)

**A1. Fix 4 critical alias collisions in research data / cipData.js:**
1. `"cs"` and `"computer science"` — remove from 11.01, keep on 11.07
2. `"pharm"` — remove from 26.10, keep on 51.20
3. `"criminology"` — remove from 43.01, keep on 45.04
4. `"ece"` — remove from 14.10, keep on 14.47

**A2. Add fast-path startup check to seeder spec:**
```javascript
const count = (await db.select('SELECT COUNT(*) as n FROM parent_skills WHERE is_custom = 0'))[0].n;
if (count >= 400) return { seeded: 0, skipped: count, aliases: 0 };
```

### Non-Blocking Recommendations

**R1.** Blueprint risk section should update token estimate from "~7.6KB" to "~17KB / ~4,300 tokens" to reflect actual data.

**R2.** Consider adding the canonical `name` (lowercased) as an implicit alias during seeding — currently only the explicit `aliases[]` array is seeded, but a student searching "Computer Science" should match 11.07 even if it's not in the aliases list. The `findByName` function already checks `LOWER(name)`, so this may be unnecessary if the extraction pipeline always goes through `findByName` first. Verify the lookup chain covers this.

**R3.** The 18 remaining non-critical alias collisions should be logged during seeding so developers are aware of which aliases were dropped.

---

## Verdict: ✅ APPROVED WITH AMENDMENTS A1 + A2

The blueprint is architecturally sound. The research data structure is a direct match for the implementation spec. Token budget, performance, and bundle size are all within acceptable bounds. Apply amendments A1 (4 alias collision fixes) and A2 (fast-path startup check) during implementation.
