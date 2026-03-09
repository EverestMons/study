# CIP Taxonomy Seeding — Development Log
**Date:** 2026-03-08
**Blueprint:** `knowledge/architecture/cip-taxonomy-seeding-2026-03-08.md`
**Validation:** `knowledge/architecture/cip-taxonomy-validation-2026-03-08.md`

---

## Components Implemented

### Component 1: cipData.js (NEW — 420 lines, 85 KB)

**File:** `src/lib/cipData.js`

Generated from research deposit (`knowledge/research/cip-2020-taxonomy-2026-03-08.md`) with A1 alias collision fixes applied:

| Fix | Code | Removed Alias | Kept On |
|-----|------|---------------|---------|
| A1.1 | 11.01 | `"cs"`, `"computer science"` | 11.07 |
| A1.2 | 26.10 | `"pharm"` | 51.20 |
| A1.3 | 43.01 | `"criminology"` | 45.04 |
| A1.4 | 14.10 | `"ece"` | 14.47 |

Exports:
- `CIP_TAXONOMY` — 416 entries, each with `{ code, name, domain, domainName, aliases }`
- `CIP_DOMAINS` — derived `Object.fromEntries(Map)`, 42 domains (superset of old 28)

Verified: Node.js import test confirms 416 entries, 42 domains, all 4 alias fixes correct.

### Component 2: cipSeeder.js (NEW — 54 lines)

**File:** `src/lib/cipSeeder.js`

Idempotent seeder with A2 fast-path optimization:
1. `SELECT COUNT(*) FROM parent_skills WHERE is_custom = 0` — if >= 400, return immediately
2. Batch-fetch existing CIP codes with single SELECT
3. For missing entries: INSERT parent skill + INSERT OR IGNORE aliases
4. For existing entries: skip parent skill, still add missing aliases

Returns `{ seeded, skipped, aliases }` for logging.

### Component 3: db.js findOrCreateByCip (MODIFIED — +10 lines)

**File:** `src/lib/db.js`, lines 202-216

Updated flow per blueprint:
1. **CIP code match** → use existing entry, add display name as alias if different from canonical name
2. **Alias/name match** → fallback via `findByName()` (checks `LOWER(name)` then `parent_skill_aliases`)
3. **Create custom** → `isCustom: true` (was `false` before — important distinction for seeder fast-path)

### Component 4: extraction.js prompt update (MODIFIED — +5 lines)

**File:** `src/lib/extraction.js`

- Added `import { CIP_TAXONOMY } from './cipData.js'`
- First-chapter prompt now builds condensed CIP list (`code + name` per line, 416 entries) and injects it into the system prompt
- Instruction changed from "Output a CIP code" to "Pick the CIP code from this list that BEST matches the subject"
- Added fallback: `If nothing fits, use cipCode: "custom" and provide your own name`
- Non-first-chapter path unchanged

Token impact: ~4,300 tokens added to first-chapter extraction only. Well within Haiku 4.5's 200K context.

### Component 5: StudyContext.jsx startup integration (MODIFIED — +5 lines)

**File:** `src/StudyContext.jsx`

- Added `import { seedCipTaxonomy } from "./lib/cipSeeder.js"`
- `seedCipTaxonomy()` call added at the TOP of the init effect, before `DB.getCourses()`
- Wrapped in try/catch (non-fatal — seeding failure doesn't block app startup)
- Console log on first run: `[Init] Seeded N CIP parent skills, M aliases`
- Subsequent startups: fast-path COUNT check returns immediately

### Component 6: App.jsx CIP_DOMAINS replacement (MODIFIED — -18 lines, +1 line)

**File:** `src/App.jsx`

- Removed hardcoded 28-entry `CIP_DOMAINS` constant (lines 10-27)
- Added `export { CIP_DOMAINS } from "./lib/cipData.js"` — re-export preserves the existing import path used by ProfileScreen (`import { CIP_DOMAINS } from "../App.jsx"`)
- No change needed in ProfileScreen.jsx — existing import chain works through the re-export

---

## Build Verification

```
npm run build → ✓ built in 1.31s
```

Bundle size impact:
- Raw: +78.5 KB (949 → 1,028 KB, +8.3%)
- Gzip: +14.4 KB (278 → 293 KB, +5.2%)
- Within SA-estimated range (~83 KB raw / ~15-20 KB gzip)

---

## Files Changed Summary

| File | Status | Lines Changed |
|------|--------|---------------|
| `src/lib/cipData.js` | **New** | 420 lines (85 KB) |
| `src/lib/cipSeeder.js` | **New** | 54 lines |
| `src/lib/db.js` | Modified | +10 lines (findOrCreateByCip) |
| `src/lib/extraction.js` | Modified | +6 lines (import + prompt) |
| `src/StudyContext.jsx` | Modified | +6 lines (import + seed call) |
| `src/App.jsx` | Modified | -17 lines, +1 line (re-export) |

**Total:** 2 new files, 4 modified files. ~490 lines added, ~17 removed.

---

## Dependency Graph Update

```
cipData.js              (no deps — pure data)
cipSeeder.js            → db.js, cipData.js
extraction.js           → db.js, api.js, cipData.js  (added cipData.js)
StudyContext.jsx         → cipSeeder.js  (added)
App.jsx                  → cipData.js  (re-export, replaces hardcoded constant)
```
