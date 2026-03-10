# Phase 2: Domain Drill-Down View — Dev Log

**Date:** 2026-03-10
**File:** `src/screens/ProfileScreen.jsx` (507 → 519 lines, +12 net)
**Design:** `knowledge/design/domain-drilldown-2026-03-10.md`

---

## What Changed

Three targeted enhancements to the existing domain drill-down view (lines 120-402):

### 1. Sort toggle — `domainSort` state + pill buttons

**New state (line 20):**
```js
const [domainSort, setDomainSort] = React.useState("level");
```

**Sort toggle UI (lines 131-139):**
Two pill buttons between domain subtitle and first parent card:
- "Level" (default) — sorts by `level` descending, ties broken by `totalPoints`
- "Weakest first" — sorts by `readiness` ascending, ties broken by `dueForReview` descending

Active pill: `background: T.ac, color: T.bg`. Inactive pill: `background: transparent, border: T.bd, color: T.txD`.

**Sort application (line 144):**
```js
[...selectedDomain.items].sort((a, b) =>
  domainSort === "weakest"
    ? (a.readiness - b.readiness || b.dueForReview - a.dueForReview)
    : (b.level - a.level || b.totalPoints - a.totalPoints)
).map(...)
```

Uses spread `[...items]` to avoid mutating the original array. Sort runs on every render — acceptable since domains typically have 1-10 parent skills.

### 2. Course attribution on parent cards

**Replaced (old line 171):**
```js
{(() => { var cs = new Set(); ... return cs.size > 1 ? <span>· {cs.size} courses</span> : null; })()}
```

**With (line 185):**
```js
{(() => {
  var cs = new Set();
  for (var s of subSkills) if (s.sourceCourseId) cs.add(s.sourceCourseId);
  var labels = [...cs].map(id => courseNames[id]).filter(Boolean);
  if (labels.length === 0) return null;
  var shown = labels.slice(0, 3);
  var extra = labels.length - 3;
  return <div style={{ fontSize: 11, color: T.txM, marginTop: 3 }}>
    From: {shown.join(", ")}{extra > 0 ? " +" + extra + " more" : ""}
  </div>;
})()}
```

- Shows actual course names instead of just a count
- Truncates to 3 names max with "+N more" suffix
- Always shown (1 course or more) instead of only for multi-course parents
- Dedicated line below metadata row instead of inline span

### 3. Empty domain guard

**New (lines 142-143):**
```js
{selectedDomain.items.length === 0 ? (
  <div style={{ textAlign: "center", padding: "32px 20px", color: T.txD, fontSize: 14 }}>No skills in this domain yet.</div>
) : [...selectedDomain.items].sort(...).map(...)}
```

Defensive check — prevents blank screen if domain somehow has 0 parent skills. In practice unreachable since `byDomain` is built from parent skill grouping.

---

## What Did NOT Change

- No StudyContext.jsx changes
- No ScreenRouter.jsx changes
- No new files
- No new imports
- No database queries
- Domain header (name, level, sub-skills, readiness) — unchanged
- Parent card layout (progress ring, name, CIP code, metadata, readiness bar, expand toggle) — unchanged
- Sub-skill expansion (category groups, detail panel, mastery, prerequisites, connections, evidence, practice) — unchanged
- Concept link lazy-loading effect — unchanged
- Review Due Skills button — unchanged
- Practice This Skill button — unchanged
- Hero view — unchanged

---

## Build Verification

```
✓ built in 1.36s
```

No compilation errors. No missing imports. 88 modules transformed.

---

## Line Count

| Section | Lines |
|---------|-------|
| Imports + hooks + shared computation | ~62 |
| Header bar | ~12 |
| Domain drill-down (sort toggle + empty guard + parent cards + sub-skill expansion) | ~282 |
| Hero view | ~108 |
| **Total** | ~519 |

Previous: 507 lines. Net increase: +12 lines.

- Sort toggle: +9 lines
- Course attribution: +1 line (replaced inline span with dedicated div)
- Empty domain guard: +2 lines
