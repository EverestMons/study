# QA Report: Performance Verification (P1–P4)
**Date:** 2026-03-10
**Analyst:** Study Security & Testing Analyst

---

## Test Results: 4/4 PASS

### Test 1 — P1: Context Value Memoization
**PASS**

`src/StudyContext.jsx` lines 1223-1286:

- `useMemo` imported from React (line 1)
- Value object wrapped: `const value = useMemo(() => ({...}), [deps])`
- Dependency array: 29 state variables (no setters, refs, useCallback handlers, or lib re-exports)
- ESLint comment: `// eslint-disable-line react-hooks/exhaustive-deps -- setters, refs, callbacks, and lib re-exports are stable`

**Expected behavior:** Only components reading changed state values re-render. Toggling sidebar → only sidebar-dependent components update, not the entire tree.

---

### Test 2 — P2: Batch Profile Queries
**PASS**

**New bulk DB methods** (single query each):

| Method | File:Line | Query |
|--------|-----------|-------|
| `ParentSkills.getAll()` | db.js:140 | `SELECT * FROM parent_skills ORDER BY name` |
| `SubSkills.getAllActive()` | db.js:1026 | `SELECT * FROM sub_skills WHERE is_archived = 0 AND parent_skill_id IS NOT NULL` |
| `Mastery.getAll()` | db.js:1472 | `SELECT * FROM sub_skill_mastery` |
| `SkillPrerequisites.getAllWithNames()` | db.js:1332 | `SELECT sp.sub_skill_id, ... JOIN sub_skills ss ...` |

**`loadProfile` rewrite** (StudyContext.jsx:543-619):
- 4 bulk queries at top (lines 543-549)
- Hash map grouping with `||=` pattern (lines 551-557)
- Enrichment loop reads from maps, zero per-item DB calls

| Metric | Before | After |
|--------|--------|-------|
| SQLite queries (23 parents, 1103 subs) | ~1,150 | 4 |
| Tauri IPC round trips | ~1,150 | 4 |
| Expected time | 500ms+ | <100ms |

---

### Test 3 — P3: Request Deduplication
**PASS**

`src/lib/db.js` lines 1780-1787:

```js
let _pendingCoursesLoad = null;            // module-level sentinel

export const loadCoursesNested = () => {
  if (_pendingCoursesLoad) return _pendingCoursesLoad;  // return in-flight promise
  _pendingCoursesLoad = _loadCoursesNestedImpl()
    .finally(() => { _pendingCoursesLoad = null; });    // clear on resolve/reject
  return _pendingCoursesLoad;
};
```

- Original implementation renamed to `_loadCoursesNestedImpl`
- 3 rapid-fire calls → only 1 actual query executes; callers 2 & 3 share the same promise
- `.finally()` clears sentinel on both success and error → next call after completion starts fresh

---

### Test 4 — P4: extractJSON Repair Cap
**PASS**

`src/lib/api.js` — `extractJSON()`:

| Guard | Line | Code |
|-------|------|------|
| Fast path (valid JSON) | 197 | `try { return JSON.parse(text); } catch {}` — returns immediately, no repair |
| 50KB input cap | 211 | `if (jsonStr.length > 50000) jsonStr = jsonStr.substring(0, 50000)` |
| 100 object limit | 225 | `if (objects.length >= 100) break` |

**Expected behavior:** `extractJSON('{"valid":true}')` → returns `{valid:true}` on first line, repair loop never reached.

---

## Summary

| Fix | Status | Key Evidence |
|-----|--------|-------------|
| P1 — Context memoization | PASS | `useMemo` with 29 state deps, stable items excluded |
| P2 — Batch profile queries | PASS | 4 bulk queries + JS hash maps, ~1,150 → 4 queries |
| P3 — loadCoursesNested dedup | PASS | Module-level sentinel + `.finally()` cleanup |
| P4 — extractJSON repair cap | PASS | Fast path + 50KB + 100 object guards |
