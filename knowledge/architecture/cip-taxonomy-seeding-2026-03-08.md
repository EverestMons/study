# CIP Taxonomy Seeding & Extraction Integration — Architecture Blueprint
**Date:** 2026-03-08
**Project:** study
**Assigned By:** CEO
**Status:** Draft

---

## Overview

The `parent_skills` and `parent_skill_aliases` tables exist in the schema (migration 001) but are only populated reactively by the extraction pipeline. This blueprint defines how to pre-seed those tables with the full CIP 2020 4-digit taxonomy and update the extraction pipeline to match against the seeded data instead of creating parent skills from scratch.

## Current State

### What exists:
- `parent_skills` table with columns: id, cip_code, name, description, embedding, is_custom, created_at, updated_at
- `parent_skill_aliases` table with columns: id, parent_skill_id, alias (unique index)
- `ParentSkills` DB module with full CRUD + `findOrCreateByCip` + alias lookup via `findByName`
- Extraction pipeline (`extraction.js`) calls `ParentSkills.findOrCreateByCip(cipCode, parentDisplayName)` during first-chapter extraction
- `CIP_DOMAINS` constant in `App.jsx` — a static 2-digit code → label map (~30 entries) used only for display grouping in ProfileScreen
- `loadProfile()` in `StudyContext.jsx` already computes parent-level aggregation: `level = floor(sqrt(totalPoints))`, average readiness, due-for-review count
- ProfileScreen already renders parent skill cards with Level badges, progress rings, readiness bars, CIP codes, and sub-skill drill-down

### What doesn't work:
- `parent_skills` table only has entries created reactively by extraction — no pre-seeded taxonomy
- No CIP seed data file exists
- Extraction LLM invents parent skill names rather than picking from a canonical list
- `parent_skill_aliases` is never populated — no fragmentation prevention
- `findOrCreateByCip` creates a new row with the LLM's display name if no CIP match exists, even if a close match would be better

## Design Decisions

### D1. CIP code is the canonical identity
The CIP 4-digit code determines the parent skill name. If the seeded entry for `11.07` says "Computer Science", that's the name. If the LLM returns `cipCode: "11.07"` with `parentDisplayName: "Introduction to Computer Science"`, the system finds the existing seeded entry and uses it. The LLM's display name becomes an alias.

### D2. Full CIP 2020 4-digit taxonomy
Seed all ~380 CIP 4-digit codes from the 2020 classification. More entries = more precise matching = less chance of needing custom parent skills.

### D3. Seeder is idempotent, skip-on-conflict
The seeder runs at app startup (after migrations, before course loading). For each CIP entry:
- If a `parent_skills` row already exists with that `cip_code`, skip it (don't overwrite the name)
- If no row exists, create one with `is_custom = 0`
- Aliases are added via `INSERT OR IGNORE` — safe to re-run

### D4. Extraction picks from seeded list
The first-chapter extraction prompt includes a condensed CIP list (code + name pairs, ~380 entries). The LLM picks from the list rather than inventing a code. Fallback: if the LLM returns a code not in the list, create a custom parent skill (`is_custom = 1`).

### D5. CIP_DOMAINS constant becomes derived
The current `CIP_DOMAINS` constant in `App.jsx` (30 entries, 2-digit codes) is replaced by deriving the 2-digit domain name from the seeded data. This removes the hardcoded constant.

## Implementation Spec

### Component 1: CIP Seed Data File

**File:** `src/lib/cipData.js`

A JS module exporting ~380 CIP 4-digit entries:
```js
export const CIP_TAXONOMY = [
  { code: "01.00", name: "Agriculture, General", domain: "01", domainName: "Agricultural/Animal/Plant/Veterinary Science", aliases: ["agriculture", "ag"] },
  { code: "11.07", name: "Computer Science", domain: "11", domainName: "Computer & Information Sciences", aliases: ["cs", "comp sci", "compsci"] },
  // ... ~380 entries
];

export const CIP_DOMAINS = Object.fromEntries(
  [...new Map(CIP_TAXONOMY.map(e => [e.domain, e.domainName]))]
);
```

**Data source:** CIP 2020 from NCES (https://nces.ed.gov/ipeds/cipcode/browse.aspx?y=56). The Research Analyst compiles all 4-digit entries with canonical names and common aliases.

**Alias strategy:** Each entry includes 2-5 common abbreviations/variations: standard abbreviations ("CS", "Econ"), common catalog patterns ("Intro to X"), discipline nicknames ("Orgo").

### Component 2: Seeder Function

**File:** `src/lib/cipSeeder.js`

Idempotent function that runs at app startup after migrations. For each CIP entry: check if `parent_skills` row exists for that `cip_code`; if yes, skip (still add missing aliases); if no, create the row with `is_custom = 0` and add all aliases.

Returns `{ seeded, skipped, aliases }` for logging.

### Component 3: Startup Integration

**File:** `src/StudyContext.jsx` — init effect

Add `seedCipTaxonomy()` call after migrations run and before course loading. Log count if any were seeded.

### Component 4: Extraction Prompt Update

**File:** `src/lib/extraction.js` — first-chapter extraction prompt

Current behavior: The LLM is asked to return a `cipCode` and `parentDisplayName` from its own knowledge.

New behavior: The prompt includes a condensed list of CIP codes and names (~3-4KB). The LLM selects from the list. If no code fits, return `cipCode: "custom"`.

### Component 5: findOrCreateByCip Update

**File:** `src/lib/db.js` — `ParentSkills.findOrCreateByCip`

Updated flow:
1. Try exact CIP code match → use it, add LLM's display name as alias if different
2. Try alias match on the display name → catches abbreviations
3. Create new custom parent skill only if neither match succeeds

### Component 6: CIP_DOMAINS Replacement

**File:** `src/App.jsx`

Replace hardcoded `CIP_DOMAINS` constant with import from `cipData.js`. ProfileScreen import path updates accordingly.

## Files Changed

| File | Change | New/Modified |
|------|--------|-------------|
| `src/lib/cipData.js` | CIP taxonomy data + derived CIP_DOMAINS | New |
| `src/lib/cipSeeder.js` | Seeder function | New |
| `src/lib/db.js` | Update `findOrCreateByCip` to prefer seeded entries, add alias on match | Modified |
| `src/lib/extraction.js` | Update first-chapter prompt to include CIP list | Modified |
| `src/StudyContext.jsx` | Add `seedCipTaxonomy()` call in init effect | Modified |
| `src/App.jsx` | Replace hardcoded CIP_DOMAINS with import from cipData.js | Modified |

## What This Does NOT Change

- `loadProfile()` — already handles parent-level aggregation correctly
- ProfileScreen — already displays parent skills with levels, readiness, CIP domains
- FSRS algorithm — completely untouched
- Sub-skill extraction logic — only the parent skill assignment changes
- Schema — no migration needed, tables already exist

## Risks

1. **CIP list size in extraction prompt:** ~380 entries at ~20 chars each = ~7.6KB. Added to first-chapter prompt only. Monitor token count.
2. **Seeder performance on first run:** ~380 inserts + ~1000 alias inserts via serialized write queue. May take 5-10 seconds. Acceptable one-time cost.
3. **Existing parent skills:** Seeder skips existing CIP codes — existing data is safe. Existing LLM-generated names are preserved.

## Open Questions

None — all CEO decisions made in planning conversation.
