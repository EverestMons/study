# Migration 004 Wiring — Development Log
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (18.43s)

---

## Summary

Wired the existing `migrateV1ToV2` function (from `src/lib/migrate.js`) into the app startup sequence in `src/StudyContext.jsx`. This implements migration 004 — JS-level data migration of v1 skill blobs to v2 `sub_skills` rows.

---

## Files Modified

| File | Before | After | Delta | Changes |
|------|--------|-------|-------|---------|
| `src/StudyContext.jsx` | 1,143 | 1,155 | +12 | Added `needsV1Migration` import, added v1→v2 migration block in init effect |

**Total delta:** +12 lines in 1 file.

---

## Changes

### 1. Import update (StudyContext.jsx:12)

Added `needsV1Migration` to the existing migrate.js import:

```js
// Before:
import { migrateV1ToV2, migrateAssignmentBlobs } from "./lib/migrate.js";

// After:
import { migrateV1ToV2, needsV1Migration, migrateAssignmentBlobs } from "./lib/migrate.js";
```

### 2. Migration block (StudyContext.jsx:267–278)

Inserted after the assignment blob migration block (line 265) and before the API key load (line 279):

```js
// Migrate v1 skill blobs → v2 sub_skills tables (non-fatal)
try {
  for (const course of loaded) {
    const needs = await needsV1Migration(course.id);
    if (needs) {
      const result = await migrateV1ToV2(course.id);
      console.log(`[Init] V1→V2 skill migration for "${course.name}": ...`);
      if (result.issues.length > 0) console.warn('[Init] Migration issues:', result.issues);
    }
  }
} catch (e) { console.error("V1→V2 skill migration failed:", e); }
if (cancelled) return;
```

---

## Init Sequence (updated)

```
1. Seed CIP taxonomy (idempotent)
2. Load courses from DB
3. Migrate assignment blobs → tables (non-fatal)
4. Migrate v1 skill blobs → v2 sub_skills (non-fatal)  ← NEW
5. Load API key
6. setReady(true)
```

Each step has a `if (cancelled) return;` guard for StrictMode double-mount cleanup.

---

## Safety Properties

- **Non-fatal:** Wrapped in try/catch — migration failure doesn't block app startup
- **Idempotent:** `needsV1Migration` checks if v1 skills exist AND no v2 skills exist. `migrateV1ToV2` has the same guard internally (returns `{ type: 'already_migrated' }` if v2 skills exist)
- **StrictMode safe:** `if (cancelled) return;` guard after the block
- **No schema changes:** No new SQL migration files — uses existing v2 tables
- **Logging:** Console output for each migrated course (skill count, mastery records, prereqs, bindings) + warnings for any issues

## What Was NOT Changed

- `src/lib/migrate.js` — `migrateV1ToV2` and `needsV1Migration` functions unchanged
- No new migration SQL files
- No UI changes
- FSRS algorithm unchanged
- All other init steps unchanged
