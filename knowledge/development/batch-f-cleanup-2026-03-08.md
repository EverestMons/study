# Batch F — V1 Compat Cleanup
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (1.29s) — 86 modules (down from 87)

---

## Summary

Deleted the entire V1 compat shim layer (`export const DB = {...}`, ~285 lines) from db.js, removed all migration code (migrate.js deleted, ~410 lines), cleaned up v1 settings key cleanup function, and removed the V1→V2 migration banner from SkillsScreen. Init effect simplified to: seed CIP → load courses → load API key.

---

## Steps

### F.1 — Remove the DB Compat Object

| Location | Before | After |
|----------|--------|-------|
| `db.js` lines 1690–1975 | `export const DB = { getCourses, saveCourses, saveDoc, getDoc, getChunkSkills, deleteChunk, _saveCourseData, _getCourseData, getSkills, getRefTaxonomy, saveProfile, getProfile, saveChat, getChat, saveJournal, getJournal, savePractice, getPractice, deleteCourse, resetAll }` (~285 lines) | Deleted entirely |
| `App.jsx` import | `import { DB } from "./lib/db.js"` | `import { resetAll } from "./lib/db.js"` |
| `App.jsx` handleHardReset | `await DB.resetAll()` | `await resetAll({ confirmed: true })` |
| `ErrorDisplay.jsx` import | `import { DB } from "../lib/db.js"` | `import { resetAll } from "../lib/db.js"` |
| `ErrorDisplay.jsx` handleAsyncHardReset | `await DB.resetAll()` | `await resetAll({ confirmed: true })` |
| `StudyContext.jsx` re-exports | `DB` in context value | Removed |
| `migrate.js` import | `import { DB, ... } from './db.js'` | `DB` removed; added 3 local v1 helpers |
| `migrate.js` call sites | `DB.getSkills`, `DB.getProfile`, `DB.getRefTaxonomy` | `getV1Skills`, `getV1Profile`, `getV1RefTaxonomy` (local functions) |

### F.2 — Clean Up V1 Settings Keys

| Location | Before | After |
|----------|--------|-------|
| `db.js` | — | Added `cleanupV1SettingsKeys()` export |
| `StudyContext.jsx` import | — | Added `cleanupV1SettingsKeys` |
| `StudyContext.jsx` init effect | — | Added call after v1 migration block |

**Note:** F.2 additions were subsequently removed in F.3 (migration code deleted, cleanup no longer needed).

### F.3 — Remove Migration Code

| Location | Before | After |
|----------|--------|-------|
| `src/lib/migrate.js` | 410 lines (migrateV1ToV2, needsV1Migration, migrateAssignmentBlobs, 8 helpers) | **File deleted** |
| `db.js` cleanupV1SettingsKeys | 10 lines | Removed (no callers) |
| `StudyContext.jsx` import | `migrateV1ToV2, needsV1Migration, migrateAssignmentBlobs` from migrate.js; `cleanupV1SettingsKeys` from db.js | Both import lines removed |
| `StudyContext.jsx` init effect | seed CIP → load courses → migrate assignment blobs → migrate v1 skills → cleanup v1 keys → load API key | seed CIP → load courses → load API key |
| `StudyContext.jsx` re-exports | `migrateV1ToV2` | Removed |
| `SkillsScreen.jsx` import | `import { migrateV1ToV2 } from "../lib/migrate.js"` | Removed |
| `SkillsScreen.jsx` V1→V2 banner | 28-line migration banner UI block | Removed |

---

## Total Lines Removed (Batch F)

| Source | Lines |
|--------|------:|
| db.js V1 compat object (F.1) | ~285 |
| migrate.js (F.3, file deleted) | ~410 |
| StudyContext.jsx init blocks (F.3) | ~15 |
| SkillsScreen.jsx migration banner (F.3) | ~30 |
| db.js cleanupV1SettingsKeys (F.2 added, F.3 removed) | net 0 |
| **Total** | **~740** |

---

## Bundle Impact

| Metric | Before F.1 | After F.3 |
|--------|-----------|-----------|
| Modules | 87 | 86 |
| Main chunk | 1,026.64 kB | 1,019.00 kB |
| Gzip | 292.28 kB | 289.86 kB |
| Reduction | — | -7.6 kB / -2.4 kB gzip |

---

## Verification

- `npm run build` PASS (1.29s)
- `grep -rn 'DB\.' src/ --include='*.js' --include='*.jsx'` → 0 code references (2 JSDoc comments only)
- `grep -rn 'migrate.js' src/` → 0 results
- `grep -rn 'migrateV1ToV2\|needsV1Migration\|migrateAssignmentBlobs' src/` → 0 results
- `grep -rn 'cleanupV1SettingsKeys' src/` → 0 results
