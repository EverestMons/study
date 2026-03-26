# Schema Drift Diagnostic: `unified_into` — 2026-03-24

## Bug
`no such column: unified_into` on the schedule screen.

## Root Cause

**Migrations 008, 009, and 010 are NOT registered in the Rust migration runner (`src-tauri/src/lib.rs`).**

The migration files exist on disk:
- `008_skill_courses.sql` — adds `skill_courses` table + `ALTER TABLE sub_skills ADD COLUMN unified_into`
- `009_chunk_relationships.sql` — adds `chunk_relationships` table
- `010_session_exchanges.sql` — adds `session_exchanges` table

But `lib.rs` only registers migrations 1–7:
```rust
let migrations = vec![
    Migration { version: 1, description: "v2_full_schema", ... },
    Migration { version: 2, description: "skill_extraction_v2", ... },
    Migration { version: 3, description: "assignment_tables", ... },
    Migration { version: 4, description: "last_rating", ... },
    Migration { version: 5, description: "facet_architecture", ... },
    Migration { version: 6, description: "assignment_activation", ... },
    Migration { version: 7, description: "material_images", ... },
    // 008, 009, 010 — MISSING
];
```

The `_sqlx_migrations` table in the live DB confirms only 7 migrations have run:
```
1|v2_full_schema|2026-03-13
2|skill_extraction_v2|2026-03-13
3|assignment_tables|2026-03-13
4|last_rating|2026-03-13
5|facet_architecture|2026-03-13
6|assignment_activation|2026-03-13
7|material_images|2026-03-19
```

---

## (1) Migration 008 File — Present and Correct

`src-tauri/migrations/008_skill_courses.sql`:
```sql
CREATE TABLE IF NOT EXISTS skill_courses (
    skill_id  INTEGER NOT NULL REFERENCES sub_skills(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(skill_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_skill_courses_skill ON skill_courses(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_courses_course ON skill_courses(course_id);

ALTER TABLE sub_skills ADD COLUMN unified_into INTEGER REFERENCES sub_skills(id);
```

The `ALTER TABLE` is correct. The file just isn't being executed.

---

## (2) Live Database — Column Missing

`PRAGMA table_info(sub_skills)` output (20 columns, 0-indexed):
```
 0|id|INTEGER
 1|parent_skill_id|TEXT
 2|name|TEXT
 3|description|TEXT
 4|skill_type|TEXT
 5|embedding|BLOB
 6|source_course_id|TEXT
 7|created_at|INTEGER
 8|updated_at|INTEGER
 9|concept_key|TEXT
10|category|TEXT
11|blooms_level|TEXT
12|mastery_criteria|TEXT
13|evidence|TEXT
14|fitness|TEXT
15|extraction_model|TEXT
16|schema_version|INTEGER
17|merged_from|TEXT
18|is_archived|INTEGER
19|uuid|TEXT
```

**`unified_into` is NOT present.** Neither are the `skill_courses`, `chunk_relationships`, or `session_exchanges` tables (all verified missing).

---

## (3) Code References to `unified_into`

### db.js — 10 references across 7 methods in SubSkills + related modules

| Line | Method | Usage |
|------|--------|-------|
| 1560 | `getByParent()` | `WHERE ... AND unified_into IS NULL` |
| 1566 | `getAllActive()` | `WHERE ... AND unified_into IS NULL` |
| 1572 | `getByCourse()` | `WHERE ... AND unified_into IS NULL` |
| 1585 | `getByMaterial()` | `WHERE ss.unified_into IS NULL` |
| 1673 | `findByConceptKey()` | `WHERE ... AND unified_into IS NULL` |
| 1681 | `getAllConceptKeys()` | `WHERE ... AND unified_into IS NULL` |
| 2036 | `Mastery.getDueForReview()` | `WHERE ss.unified_into IS NULL` |
| 2365 | `Facets.getByCourse()` | `WHERE ss.unified_into IS NULL` |
| 2477 | `FacetMastery.getByCourseRaw()` | `WHERE ss.unified_into IS NULL` |
| 2499 | `FacetMastery.getDue()` | `WHERE ss.unified_into IS NULL` |

### unification.js — 8 references
- Lines 39-40: Guard checks (`absorbed.unified_into != null`, `survivor.unified_into != null`)
- Line 109: SET marker (`UPDATE sub_skills SET unified_into = ?`)
- Lines 296-297: Discovery query (`AND sa.unified_into IS NULL AND sb.unified_into IS NULL`)
- Lines 308, 311, 314: Re-check during iteration

### study.js — 0 references
### skills.js — 0 references

---

## (4) Runtime Migration Guard

**None exists.** There is no `_safe_add_column`, no runtime `ALTER TABLE`, no `PRAGMA table_info` check, and no try/catch around the `unified_into` queries in db.js. The code assumes the column exists.

The only runtime migration in db.js is `migrateFacets()` — a JS-side data migration for facet promotion (guarded by `settings.facet_migration_done`). It does not add columns.

---

## (5) Impact Scope

Every SubSkills query that filters `unified_into IS NULL` will throw `no such column: unified_into`. This affects:

- **Schedule screen** — calls `Mastery.getDueForReview()` (line 2036) or `FacetMastery.getDue()` (line 2499)
- **Any skill listing** — `SubSkills.getAllActive()`, `getByParent()`, `getByCourse()`, `getByMaterial()`
- **Skill lookup** — `findByConceptKey()`, `getAllConceptKeys()`
- **Facet loading** — `Facets.getByCourse()`, `FacetMastery.getByCourseRaw()`
- **Unification** — entire `unification.js` module

Additionally, migrations 009 and 010 are also unregistered:
- **009**: `chunk_relationships` table — used by chunk prerequisite ordering
- **010**: `session_exchanges` table — used by tutor phase 2 session logging

---

## Why This Worked in Dev

The developer's live DB at `~/Library/Application Support/com.everestmons.study/study.db` was likely created or reset BEFORE these migrations were added to the SQL files, and the `tauri-plugin-sql` migration runner applies them at app startup via the Rust `migrations` vec. Since the vec was never updated with 008-010, those migrations never ran.

However, the code that references `unified_into` was committed at the same time as (or after) migration 008. During development, the column may have been added manually via `sqlite3` or via a fresh DB that happened to have it.

---

## Fix Required (not applied — diagnostic only)

Add migrations 8, 9, and 10 to the `migrations` vec in `src-tauri/src/lib.rs`:
```rust
Migration { version: 8, description: "skill_courses", sql: include_str!("../migrations/008_skill_courses.sql"), kind: MigrationKind::Up },
Migration { version: 9, description: "chunk_relationships", sql: include_str!("../migrations/009_chunk_relationships.sql"), kind: MigrationKind::Up },
Migration { version: 10, description: "session_exchanges", sql: include_str!("../migrations/010_session_exchanges.sql"), kind: MigrationKind::Up },
```

This requires a Rust rebuild (`npm run tauri:dev` or `npm run tauri:build`).
