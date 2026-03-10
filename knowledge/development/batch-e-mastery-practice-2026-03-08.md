# Batch E — Mastery & Practice Replacement
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (1.30s) — both steps verified

---

## Summary

Removed the v1 profile blob dual-write and replaced all v1 practice set calls with v2 `PracticeSets` module. Profile is no longer loaded, accumulated, or saved in the runtime code path. Practice sets now stored in the `practice_sets` table instead of the `settings` table.

---

## Steps

### E.1 — Replace DB.getProfile / DB.saveProfile — Dual-Write Removal

**Schema migration:** `004_last_rating.sql` — `ALTER TABLE sub_skill_mastery ADD COLUMN last_rating TEXT`

| Location | Before | After |
|----------|--------|-------|
| `db.js` Mastery.upsert | No `lastRating` param | Accepts + stores `lastRating` in INSERT/UPDATE |
| `db.js` Sessions | — | Added `Sessions.countByCourse(courseId)` helper |
| `skills.js` loadSkillsV2 | mastery shape missing lastRating | Added `lastRating: mastery.last_rating \|\| null` |
| `study.js` import | `DB, Mastery, SubSkills, ...` | `Mastery, SubSkills, Sessions, ...` (DB removed) |
| `study.js` applySkillUpdates | Loads profile, accumulates entries, increments sessions, saves profile | Removed profile load/save, passes `lastRating: u.rating` to Mastery.upsert |
| `study.js` buildContext | `profile` param, reads `profile.skills[id].entries[-1].rating`, `profile.sessions` | No profile param, uses `s.mastery?.lastRating`, `Sessions.countByCourse` |
| `study.js` buildFocusedContext | Same profile reads in assignment/skill/recap/exam modes | Same v2 replacements (6 profile read sites) |
| `StudyContext.jsx` import | includes `DB` | `DB` removed |
| `StudyContext.jsx` selectMode | `DB.getProfile` + `profile.skills[id]` for lastRating | Uses `s.mastery?.lastRating` directly |
| `StudyContext.jsx` bootWithFocus | `DB.getProfile` → profile → buildFocusedContext | No profile, `buildFocusedContext` without profile param |
| `StudyContext.jsx` sendMessage | `DB.getProfile` (cache miss + post-update) | Removed, no profile in cache or rebuild |

**Key details:**
- `applySkillUpdates` no longer returns profile — return value was unused by callers
- `cachedSessionCtx.current` no longer includes `profile` key
- `last_rating` stored as the raw rating string (`struggled`/`hard`/`good`/`easy`)
- Session count derived from `Sessions.countByCourse` (COUNT query) instead of profile.sessions counter
- Last review date uses `s.mastery.lastReviewAt` (epoch → date string) instead of profile entries array

### E.2 — Replace DB.getPractice / DB.savePractice

| Location | Before | After |
|----------|--------|-------|
| `ModePicker.jsx` import | `DB, Assignments, CourseSchedule, loadCoursesNested` | `Assignments, CourseSchedule, PracticeSets, loadCoursesNested` |
| `ModePicker.jsx` assignment practice | `DB.getPractice(active.id, skillId)` | `PracticeSets.get(skillId)` → `.data` |
| `ModePicker.jsx` assignment practice save | `DB.savePractice(active.id, skillId, pset)` | `PracticeSets.upsert(skillId, pset)` |
| `ModePicker.jsx` skill practice | `DB.getPractice(active.id, s.id)` | `PracticeSets.get(s.id)` → `.data` |
| `ModePicker.jsx` skill practice save | `DB.savePractice(active.id, s.id, pset)` | `PracticeSets.upsert(s.id, pset)` |
| `ProfileScreen.jsx` import | `DB` | `PracticeSets` |
| `ProfileScreen.jsx` review due | `DB.savePractice(course.id, firstDue.id, pset)` | `PracticeSets.upsert(firstDue.id, pset)` |
| `ProfileScreen.jsx` practice skill | `DB.savePractice(course.id, sub.id, pset)` | `PracticeSets.upsert(sub.id, pset)` |
| `PracticeMode.jsx` import | `DB` | `PracticeSets` |
| `PracticeMode.jsx` tier advance/retry/submit/complete | 4× `DB.savePractice(active.id, pm.skill.id, data)` | 4× `PracticeSets.upsert(pm.skill.id, data)` |

**Key details:**
- `DB.getPractice` returned parsed JSON directly; `PracticeSets.get` returns `{ ...row, data: parsed }` — callers access `.data`
- `PracticeSets.upsert(subSkillId, data, sessionId = null)` — sessionId defaults to null (global practice set, not session-scoped)
- `DB` import fully removed from all 3 files

---

## V1 Methods Eliminated from Application Code

| V1 Method | Replacement | Call sites removed |
|---|---|:--:|
| `DB.getProfile(cid)` | `s.mastery?.lastRating`, `Sessions.countByCourse` | 4 |
| `DB.saveProfile(cid, profile)` | `Mastery.upsert` with `lastRating` param | 1 |
| `DB.getPractice(cid, skillId)` | `PracticeSets.get(skillId)` | 2 |
| `DB.savePractice(cid, skillId, data)` | `PracticeSets.upsert(skillId, data)` | 6 |

**Total:** 13 call sites replaced/removed.

**Remaining:** `DB.getProfile` in `migrate.js` (migration code, kept intentionally).

---

## Files Modified

| File | Lines changed |
|------|:--:|
| `src-tauri/migrations/004_last_rating.sql` | +5 (new) |
| `src/lib/db.js` | ~12 (Mastery.upsert lastRating, Sessions.countByCourse) |
| `src/lib/skills.js` | ~1 (lastRating in mastery shape) |
| `src/lib/study.js` | ~25 (applySkillUpdates profile removal, buildContext/buildFocusedContext profile→mastery, import) |
| `src/StudyContext.jsx` | ~15 (4 DB.getProfile removals, profile passthrough cleanup, import) |
| `src/components/study/ModePicker.jsx` | ~8 (import, 2 getPractice, 2 savePractice) |
| `src/screens/ProfileScreen.jsx` | ~3 (import, 2 savePractice) |
| `src/components/study/PracticeMode.jsx` | ~5 (import, 4 savePractice) |
