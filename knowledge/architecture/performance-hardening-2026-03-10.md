# Architecture Blueprint: Performance Hardening (P1–P4)
**Date:** 2026-03-10
**Analyst:** Study Systems Analyst

---

## P1 — Context Value Memoization

### Problem

`StudyContext.Provider` creates a new `value` object every render (line 1216). This object contains ~85 properties. Because React uses referential equality for context propagation, **every state change re-renders all 20+ consumers** — even if a consumer only reads `screen` and the change was to `lockElapsed`.

### Current Structure (lines 1216-1263)

```
const value = {
  // ~54 state values + setters (recreated every render)
  asyncError, setAsyncError, showAsyncNuclear, setShowAsyncNuclear,
  screen, setScreen, courses, setCourses, active, setActive, ready, ...

  // ~9 refs (stable — useRef never changes identity)
  endRef, taRef, fiRef, sessionStartIdx, ...

  // ~6 useCallback handlers (stable identity)
  refreshMaterialSkillCounts, saveSessionToJournal, onDrop, onSelect, ...

  // ~12 plain function handlers (UNSTABLE — recreated every render)
  addNotif, getMaterialState, computeTrustSignals, createCourse, ...

  // ~13 re-exports from lib (stable — module-level constants)
  CLS, getApiKey, loadSkillsV2, effectiveStrength, TIERS, ...
};
```

### Fix

Wrap the `value` object in `React.useMemo()` with a dependency array listing all 48 state variables.

**Why `useMemo` and not context splitting:**
- Context splitting (UIContext, DataContext, HandlerContext) is architecturally better long-term but requires updating every `useStudy()` consumer (20+ components)
- `useMemo` is a single-file change with zero consumer changes
- The two approaches are not mutually exclusive — `useMemo` now, split later if needed

**No handler changes needed.** The plain function handlers don't need `useCallback` wrapping. They close over current state, which is correct — they need fresh values. The `useMemo` factory recreates them when deps change.

### Dependency Array (48 state variables)

```js
const value = useMemo(() => ({
  // ... same properties as current value object ...
}), [
  asyncError, showAsyncNuclear,
  screen, courses, active, ready,
  showSettings, apiKeyLoaded, apiKeyInput, keyVerifying, keyError,
  files, cName, drag, parsing,
  msgs, input, codeMode, exporting, busy, booting,
  status, processingMatId, errorLogModal,
  globalLock, lockElapsed, dupPrompt,
  showManage, showSkills, skillViewData, expandedCats,
  pendingConfirm, notifs, showNotifs, lastSeenNotif,
  extractionErrors, sessionMode, focusContext,
  pickerData, chunkPicker, asgnWork, practiceMode,
  profileData, expandedProfile, expandedSubSkill,
  materialSkillCounts, expandedMaterial,
  sessionSummary, sessionElapsed, breakDismissed,
  sidebarCollapsed, folderImportData,
]);
```

**Excluded (stable, never change identity):** `useState` setters, `useRef` values, `useCallback` handlers, lib re-exports.

### Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing dependency | Medium | Exhaustive list derived from value object; ESLint warns on omissions |
| Stale closure | Low | Handlers recreated inside useMemo factory when deps change |
| Behavior change | None | Pure optimization — same value, same updates |

### Files

| File | Change | ~Lines |
|------|--------|--------|
| `src/StudyContext.jsx` | Wrap `value` in `useMemo` + 48-dep array | ~5 |

---

## P2 — Batch Profile Queries

### Problem

`loadProfile()` (StudyContext.jsx:543-634) executes queries in nested loops:

```
for (const parent of allParents) {               // N parents (e.g. 23)
  const subs = await SubSkills.getByParent(id);   // 1 query per parent
  const masteryRows = await Mastery.getBySkills(); // 1 query per parent
  for (const sub of subs) {                       // M subs per parent (avg ~48)
    const prereqs = await SkillPrerequisites.getForSkill(sub.id);  // 1 query per sub
  }
}
```

**For a typical profile (23 parents, 1,103 sub-skills):**
- `ParentSkills.getAll()` — 1 query
- `SubSkills.getByParent()` — 23 queries
- `Mastery.getBySkills()` — 23 queries
- `SkillPrerequisites.getForSkill()` — **1,103 queries**
- **Total: ~1,150 queries**

Each query has Tauri IPC overhead (~1-2ms per round trip), so this takes **1-2 seconds** even though the total data is small.

### Current DB Methods

```js
// db.js:1019 — one query per parent
SubSkills.getByParent(parentSkillId) {
  return db.select('SELECT * FROM sub_skills WHERE parent_skill_id = ? AND is_archived = 0', [parentSkillId]);
}

// db.js:1448 — one query per parent (batch within parent, but still N calls)
Mastery.getBySkills(subSkillIds) {
  return db.select('SELECT * FROM sub_skill_mastery WHERE sub_skill_id IN (?...)', subSkillIds);
}

// db.js:1316 — one query per sub-skill (worst offender)
SkillPrerequisites.getForSkill(subSkillId) {
  return db.select(
    'SELECT sp.prerequisite_id, ss.name, ss.concept_key, sp.source
     FROM skill_prerequisites sp JOIN sub_skills ss ON sp.prerequisite_id = ss.id
     WHERE sp.sub_skill_id = ? AND ss.is_archived = 0', [subSkillId]);
}
```

### Fix

Add 3 new "get all" DB methods. Replace the nested loops in `loadProfile` with 3 bulk queries + JavaScript grouping.

**New DB methods:**

```js
// SubSkills — load all non-archived sub-skills in one query
SubSkills.getAllActive() {
  return db.select('SELECT * FROM sub_skills WHERE is_archived = 0');
}

// Mastery — load all mastery records in one query
Mastery.getAll() {
  return db.select('SELECT * FROM sub_skill_mastery');
}

// SkillPrerequisites — load all with joined names in one query
SkillPrerequisites.getAllWithNames() {
  return db.select(
    `SELECT sp.sub_skill_id, sp.prerequisite_id, ss.name, ss.concept_key, sp.source
     FROM skill_prerequisites sp
     JOIN sub_skills ss ON sp.prerequisite_id = ss.id
     WHERE ss.is_archived = 0`
  );
}
```

**Rewritten `loadProfile`:**

```js
const loadProfile = async () => {
  try {
    // 3 bulk queries instead of ~1,150 individual queries
    const allParents = await ParentSkills.getAll();
    const allSubs = await SubSkills.getAllActive();
    const allMastery = await Mastery.getAll();
    const allPrereqs = await SkillPrerequisites.getAllWithNames();

    // Group in JavaScript (O(n) hash map builds)
    const subsByParent = {};
    for (const s of allSubs) {
      (subsByParent[s.parent_skill_id] ||= []).push(s);
    }
    const masteryBySkill = {};
    for (const m of allMastery) {
      masteryBySkill[m.sub_skill_id] = m;
    }
    const prereqsBySkill = {};
    for (const p of allPrereqs) {
      (prereqsBySkill[p.sub_skill_id] ||= []).push(p);
    }

    // Same enrichment logic, but using maps instead of queries
    const results = [];
    const now = new Date();
    for (const parent of allParents) {
      const subs = subsByParent[parent.id] || [];
      if (subs.length === 0) continue;
      // ... same enrichment as before, using masteryBySkill[sub.id] and prereqsBySkill[sub.id] ...
    }
    // ... same sort + setProfileData ...
  } catch (e) { ... }
};
```

### Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| SQLite queries | ~1,150 | 4 |
| Tauri IPC round trips | ~1,150 | 4 |
| Estimated time (23 parents, 1,103 subs) | 1-2s | <50ms |

### Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Large result set in memory | Low | 1,103 sub-skills × ~500 bytes = ~550KB — negligible |
| Behavior change | None | Same data, same enrichment, same output shape |

### Files

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/db.js` | Add `SubSkills.getAllActive`, `Mastery.getAll`, `SkillPrerequisites.getAllWithNames` | ~15 |
| `src/StudyContext.jsx` | Rewrite `loadProfile` to use bulk queries + JS grouping | ~20 |

---

## P3 — Request Deduplication for loadCoursesNested

### Problem

`loadCoursesNested()` is called from **13 call sites** across 5 files. Multiple rapid calls can fire concurrently — for example, when `retryAllFailed` completes and both the handler and a UI callback refresh courses simultaneously. Each call executes:

```js
// db.js:1759 — nested queries per course
const courses = await db.select('SELECT * FROM courses ...');
for (const course of courses) {
  const mats = await db.select('SELECT * FROM materials WHERE course_id = ?', [course.id]);
  for (const mat of mats) {
    mat.chunks = await db.select('SELECT ... FROM chunks WHERE material_id = ?', [mat.id]);
  }
}
```

For a student with 3 courses, 15 materials, and 150 chunks, each call is ~19 queries. Two concurrent calls = 38 queries for the same data.

### Fix

Simple dedup wrapper at the module level in `db.js`. If a load is already in flight, return its promise instead of starting a new one.

```js
let _pendingLoad = null;

export const loadCoursesNested = async () => {
  if (_pendingLoad) return _pendingLoad;
  _pendingLoad = _doLoadCoursesNested().finally(() => { _pendingLoad = null; });
  return _pendingLoad;
};

const _doLoadCoursesNested = async () => {
  // ... current implementation (unchanged) ...
};
```

**Behavior:**
- First caller: starts the query, stores the promise
- Second caller (while first is still running): gets the same promise, same result
- After completion: `_pendingLoad` cleared, next call starts fresh

### Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stale data from shared promise | Very Low | All callers want the same current state; the dedup window is <100ms |
| Error propagation | Low | `.finally()` clears `_pendingLoad` on error too, so next call retries fresh |

### Files

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/db.js` | Rename current to `_doLoadCoursesNested`, add dedup wrapper | ~8 |

---

## P4 — extractJSON Repair Optimization

### Problem

`extractJSON()` (api.js:189-228) has a truncated JSON repair loop that iterates character-by-character. For well-formed responses (the common case), the first `JSON.parse(text)` succeeds and the repair path never runs. But:

1. The regex matches (`text.match(/\[[\s\S]*\]/)`) still execute even when the first parse succeeds (they don't — there's an early return via `try/catch`)
2. When the repair **does** run (malformed LLM responses), the character loop is unbounded — a 200KB response iterates 200K characters
3. No early-exit for the common "clean JSON in code fence" case

### Current Code

```js
export const extractJSON = (text) => {
  try { return JSON.parse(text); } catch {}                    // Fast path: clean JSON
  const m1 = text.match(/```(?:json)?\s*([\s\S]*?)```/);       // Code fence
  if (m1) try { return JSON.parse(m1[1].trim()); } catch {}
  const m2 = text.match(/\[[\s\S]*\]/);                        // Bare array
  if (m2) try { return JSON.parse(m2[0]); } catch {}
  const m3 = text.match(/\{[\s\S]*\}/);                        // Bare object
  if (m3) try { return JSON.parse(m3[0]); } catch {}

  // Truncated JSON repair — O(n) character scan
  const arrayMatch = text.match(/\[\s*\{[\s\S]*/);
  if (arrayMatch) {
    let jsonStr = arrayMatch[0];
    for (let i = 0; i < jsonStr.length; i++) {   // unbounded
      // ... brace matching ...
    }
  }
  return null;
};
```

### Fix

Two targeted improvements:

**1. Cap the repair loop to 50KB.** Prevents edge cases with very large malformed responses.

```js
// Before repair loop
let jsonStr = arrayMatch[0];
if (jsonStr.length > 50000) jsonStr = jsonStr.substring(0, 50000);
```

**2. Early return comment.** The existing code already has an early return on line 190 (`try { return JSON.parse(text); } catch {}`). No code change needed — just a comment noting the fast path for clarity.

### Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Truncated valid JSON beyond 50KB | Very Low | LLM responses are typically 4-8KB; 50KB is generous |
| Behavior change | None for normal cases | Only affects malformed responses >50KB (essentially never happens) |

### Files

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/api.js` | Cap repair loop to 50KB | ~2 |

---

## Summary

| Fix | Impact | Queries Saved | Files | ~Lines |
|-----|--------|---------------|-------|--------|
| P1 — Context value memoization | Eliminates redundant re-renders across 20+ consumers | — | 1 | ~5 |
| P2 — Batch profile queries | ~1,150 → 4 queries for profile load | ~1,146 | 2 | ~35 |
| P3 — loadCoursesNested dedup | Prevents concurrent duplicate loads (13 call sites) | Variable | 1 | ~8 |
| P4 — extractJSON repair cap | Prevents O(n) loop on large malformed responses | — | 1 | ~2 |

**Total: ~50 lines across 4 files**

### Implementation Order

1. **P2 first** — highest impact, biggest query reduction, no risk to other code
2. **P3 second** — simple, self-contained, prevents a real concurrency issue
3. **P1 third** — single file change, verify no stale closures
4. **P4 last** — micro-optimization, trivial change
