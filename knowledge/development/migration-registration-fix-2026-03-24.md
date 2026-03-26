# Migration Registration Fix — 2026-03-24

## Bug
`no such column: unified_into` on schedule screen and all skill queries.

## Root Cause
Migrations 008, 009, and 010 SQL files existed in `src-tauri/migrations/` but were never registered in the Rust migration runner at `src-tauri/src/lib.rs`. The `tauri-plugin-sql` migration runner only applies migrations listed in the `migrations` vec.

## Fix Applied
Added 3 `Migration` entries to the vec in `src-tauri/src/lib.rs` (lines 55-72):

| Version | Description | SQL File | What it adds |
|---------|-------------|----------|--------------|
| 8 | skill_courses | 008_skill_courses.sql | `skill_courses` table + `unified_into` column on `sub_skills` |
| 9 | chunk_relationships | 009_chunk_relationships.sql | `chunk_relationships` table |
| 10 | session_exchanges | 010_session_exchanges.sql | `session_exchanges` table |

## Files Changed
- `src-tauri/src/lib.rs` — 18 lines added (3 Migration structs)

## Commit
`d04dc04` — `fix: register migrations 008-010 in lib.rs — unified_into, chunk_relationships, session_exchanges`

## Verification
On next `npm run tauri:dev`, the Rust backend rebuilds and `tauri-plugin-sql` will auto-apply migrations 8-10 to the live DB. After launch, `PRAGMA table_info(sub_skills)` should show `unified_into` as column 20, and tables `skill_courses`, `chunk_relationships`, `session_exchanges` should exist.

## Lesson
SQL migration files in `src-tauri/migrations/` are NOT auto-discovered. Each must be manually registered in `src-tauri/src/lib.rs`. This is now the second time this pattern has caused a bug — should be added to a pre-commit checklist.
