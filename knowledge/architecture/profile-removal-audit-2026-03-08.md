# Profile Removal Audit — v1 Profile Blob Field-by-Field Map
**Date:** 2026-03-08
**Role:** Study Systems Analyst
**Risk Level:** HIGH — profile feeds the AI system prompt; errors degrade teaching quality

---

## V1 Profile Blob Shape

```js
{
  skills: {
    [skillId]: {
      points: number,                    // cumulative weighted mastery points
      entries: [                          // per-review history log
        { date, rating, reason, context, source, weightedPts }
      ]
    }
  },
  sessions: number                       // total study session count
}
```

Stored in `settings` table as `v1_profile:{courseId}`.

---

## Profile Consumers — Complete Inventory

### 1. `study.js:applySkillUpdates()` (lines 159-303) — WRITE + READ

**What it does:** After AI rates a skill, this function:
1. Loads FSRS mastery from `Mastery.getBySkill()` → FSRS state transition → `Mastery.upsert()` **(already v2)**
2. Computes weighted points, updates fitness counters, verifies mastery criteria **(already v2)**
3. Loads profile blob → appends to `profile.skills[skillId].entries` → increments `profile.sessions` → saves profile blob **(still v1)**

**Field access:**
| Field | Line | Operation | Purpose | v2 Equivalent |
|-------|------|-----------|---------|---------------|
| `profile.skills[u.skillId]` | 292-295 | Read/Write | Get/create skill entry | `Mastery.getBySkill(id)` |
| `profile.skills[skillId].points` | 296 | Write | Accumulate weighted points | `mastery.total_mastery_points` (already written by Mastery.upsert line 238-247) |
| `profile.skills[skillId].entries` | 297-298 | Write | Push review history entry | **No v2 equivalent — CEO decision: DROP** |
| `profile.sessions` | 301 | Write | Increment session counter | `SELECT COUNT(*) FROM sessions WHERE course_id = ?` |

**Verdict:** Lines 291-303 are **fully redundant**. The FSRS mastery write (lines 238-247) already stores `total_mastery_points`. The entries array is dropped per CEO decision. The session counter can be derived from the sessions table. **This entire block can be removed**, along with the `DB.getProfile` and `DB.saveProfile` calls.

---

### 2. `study.js:buildContext()` (lines 330-453) — READ

**Field access:**
| Field | Line | Usage | v2 Replacement |
|-------|------|-------|----------------|
| `profile.skills[s.id]` or `profile.skills[s.conceptKey]` | 343 | Look up per-skill data | `mastery` already on v2 skill objects from `loadSkillsV2()` |
| `pd?.entries?.slice(-1)[0]?.rating` | 344 | Get last rating for skill tree display | `mastery.last_rating` (need to add) **OR** derive from most recent `session_skills` row |
| `profile.sessions` | 375 | "Total study sessions: N" in prompt | `SELECT COUNT(*) FROM sessions WHERE course_id = ?` |
| `pd?.entries?.length` | 384 | Check if skill has review history | `mastery.reps > 0` (already available) |
| `pd.entries[last].rating` | 385 | Last rating + date in STUDENT PROFILE section | Same as line 344 |
| `pd.entries[last].date` | 386 | Date of last review | `mastery.last_review_at` (epoch → date string) |

---

### 3. `study.js:buildFocusedContext()` (lines 457-650+) — READ

**Field access:**
| Field | Line | Usage | v2 Replacement |
|-------|------|-------|----------------|
| `profile.skills[sid]` | 482 | Assignment mode — per-skill lookup | Same as buildContext |
| `pd?.entries?.slice(-1)[0]?.rating` | 483 | Last rating for assignment skills | Same |
| `profile.skills[skill.id]` | 523 | Skill focus mode — per-skill lookup | Same |
| `pd?.entries?.slice(-1)[0]?.rating` | 524 | Last rating for focus skill | Same |
| `profile.sessions` | 582 | Recap mode — "Total sessions: N" | Session count query |
| `profile.skills[s.id]` | 629 | Exam mode — per-skill lookup | Same |
| `pd?.entries?.slice(-1)[0]?.rating` | 630 | Last rating for exam skills | Same |

---

### 4. `StudyContext.jsx` — 4 `DB.getProfile()` call sites — READ (passthrough)

| Line | Context | Usage |
|------|---------|-------|
| 620 | `selectMode` | Passes profile to `buildFocusedContext` |
| 807 | `bootWithFocus` | Passes profile to `buildFocusedContext` |
| 903 | `sendMessage` (cache miss) | Passes profile to `buildContext` or `buildFocusedContext` |
| 931 | `sendMessage` (after skill update) | Passes updated profile to `buildFocusedContext` for context refresh |

All 4 calls pass the profile directly to `buildContext`/`buildFocusedContext`. The profile is never read directly in StudyContext — it's a passthrough. **If we eliminate the profile parameter from build*Context, all 4 call sites can simply drop the `DB.getProfile` call.**

---

### 5. `migrate.js:migrateV1ToV2()` (line 101) — READ (migration only)

```js
const v1Profile = await DB.getProfile(courseId) || { skills: {}, sessions: 0 };
```

Reads profile to extract `points` and `entries` for mastery seeding during migration. **This is migration code — runs once per course, idempotent. Should keep reading from v1_profile settings key until v1 compat is fully removed.** No change needed.

---

### 6. `study.js:generateSessionEntry()` (lines 716-751) — NO PROFILE ACCESS

Confirmed: `generateSessionEntry` takes `(messages, startIdx, skillUpdatesLog)` only. Does not read profile. **No action needed.**

---

## Field-by-Field Replacement Map

| Profile Field | Used By | v2 Equivalent | Status |
|---|---|---|---|
| `profile.skills[id].points` | applySkillUpdates (write) | `mastery.total_mastery_points` | **Already written by Mastery.upsert** — profile write is redundant |
| `profile.skills[id].entries` | applySkillUpdates (write), buildContext/buildFocusedContext (read last entry) | **DROP** (CEO decision) | Write is redundant. Read sites need `last_rating` + `last_review_at` from mastery |
| `profile.skills[id].entries[-1].rating` | buildContext (×2), buildFocusedContext (×4) | **Need: store `last_rating` in Mastery.upsert** | Currently NOT stored — must add |
| `profile.skills[id].entries[-1].date` | buildContext (×1) | `mastery.last_review_at` → date string | Already stored as epoch |
| `profile.sessions` | applySkillUpdates (write), buildContext (×1), buildFocusedContext (×1) | `SELECT COUNT(*) FROM sessions WHERE course_id = ?` | Derivable — no storage needed |

---

## Missing v2 Field: `last_rating`

The `sub_skill_mastery` table does NOT currently store the last rating string (`struggled`/`hard`/`good`/`easy`). The v1 profile stores this in `entries[-1].rating`.

**This is used in 6 places** across `buildContext` and `buildFocusedContext` to show the AI tutor the student's most recent performance on each skill (e.g., `"last: good"`).

**Resolution options:**
1. **Add `last_rating TEXT` column to `sub_skill_mastery`** — set during `Mastery.upsert`. Requires schema migration.
2. **Pass last_rating through `Mastery.upsert` without schema change** — store in the existing `total_mastery_points` JSON or a new settings key. Awkward.
3. **Derive from session_skills/session_events** — complex query, slow.

**Recommendation:** Option 1 — add `last_rating` column. It's a single `ALTER TABLE` migration. `Mastery.upsert` already receives the rating context indirectly. The caller (`applySkillUpdates`) has `u.rating` available.

---

## CEO Escalation Required: NONE

All profile fields map to existing or easily-added v2 equivalents:
- `points` → already stored (`total_mastery_points`)
- `entries` → dropped per prior CEO decision
- `entries[-1].rating` → needs `last_rating` column (schema migration)
- `entries[-1].date` → already stored (`last_review_at`)
- `sessions` → derivable from sessions table count

No field is actively used without a v2 path. No escalation needed.

---

## Recommended Implementation Order

### Step E.1: Schema migration — add `last_rating` to `sub_skill_mastery`
- Migration 005: `ALTER TABLE sub_skill_mastery ADD COLUMN last_rating TEXT`
- Update `Mastery.upsert` to accept and store `lastRating`

### Step E.2: Update `applySkillUpdates` — remove profile blob
- Pass `u.rating` to `Mastery.upsert` as `lastRating`
- Remove lines 291-303 (profile.skills append, profile.sessions increment, DB.saveProfile)
- Remove `DB.getProfile` call (line 162)
- Return session count from sessions table if needed (currently return value is profile object — callers don't use profile.sessions from the return)

### Step E.3: Update `buildContext` / `buildFocusedContext` — remove profile parameter
- Replace `profile.skills[id].entries[-1].rating` → `s.mastery?.last_rating || "untested"`
- Replace `profile.skills[id].entries[-1].date` → format `s.mastery?.last_review_at` as date
- Replace `profile.sessions` → `await Sessions.countByCourse(courseId)` (add helper) or pass count as parameter
- Remove `profile` parameter from function signatures

### Step E.4: Update `StudyContext.jsx` — remove all `DB.getProfile` calls
- Drop all 4 `DB.getProfile` calls
- Stop passing `profile` to `buildContext`/`buildFocusedContext`

---

## Handoff to DEV

Audit complete. All profile fields have clear v2 equivalents. The only gap is `last_rating` which requires:
1. Schema migration 005 (`ALTER TABLE`)
2. `Mastery.upsert` update (1 new parameter)
3. `applySkillUpdates` passes `u.rating` through

After that, the profile blob can be fully removed from the runtime code path. The `DB.getProfile`/`DB.saveProfile` V1 compat shims and the `v1_profile:*` settings keys become dead code, removable in the final cleanup batch.
