# Database Migration Guide

## How Migrations Work

Tauri's `tauri-plugin-sql` runs all `.sql` files in `src-tauri/migrations/` in alphabetical order on first launch. It tracks which migrations have already been applied in an internal `_sqlx_migrations` table, so each migration only runs once.

## Conventions

- **Naming:** `001_description.sql`, `002_description.sql`, etc.
- **Current:** `001_v2_schema.sql` — the full v2 schema (21 tables, 35 indexes)
- **Never edit** an already-shipped migration after users have data. Write a new migration instead.

## Adding Columns (safe)

```sql
-- 002_add_foo_column.sql
ALTER TABLE chunks ADD COLUMN foo TEXT;
```

SQLite `ALTER TABLE ADD COLUMN` only supports adding nullable columns or columns with non-NULL defaults. This is always safe.

## Things SQLite Cannot Do

- `ALTER TABLE DROP COLUMN` (only in SQLite ≥ 3.35.0, and Tauri's bundled version may be older)
- `ALTER TABLE ALTER COLUMN` / `MODIFY COLUMN` — does not exist
- `ALTER TABLE RENAME COLUMN` (only in SQLite ≥ 3.25.0)

For these, you need the **copy-table dance:**

```sql
-- 1. Create new table with desired schema
CREATE TABLE chunks_new (...);
-- 2. Copy data
INSERT INTO chunks_new SELECT ... FROM chunks;
-- 3. Drop old table
DROP TABLE chunks;
-- 4. Rename new table
ALTER TABLE chunks_new RENAME TO chunks;
-- 5. Recreate indexes
CREATE INDEX ...;
```

This is destructive and requires careful testing. Avoid if possible by designing nullable/flexible columns upfront.

## Deprecation Over Deletion

If a column becomes obsolete, leave it in the schema and add a comment:
```sql
-- DEPRECATED: no longer used as of 003_*. Left for backward compat.
old_column TEXT,
```

This avoids the copy-table dance entirely.

## Foreign Key Behavior Reference

| Table | FK Target | On Delete |
|-------|-----------|-----------|
| sub_skills → parent_skills | parent_skill_id | **RESTRICT** (can't delete parent with children) |
| sub_skills → courses | source_course_id | SET NULL |
| chunks → materials | material_id | CASCADE |
| chunks → courses | course_id | CASCADE |
| Everything else | (parent table) | CASCADE |

## Pre-Data vs Post-Data

Right now (v2 initial), no users have real data. The migration file can still be edited directly. Once the app ships to real users, all changes must be new migration files.
