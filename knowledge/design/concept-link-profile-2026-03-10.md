# Concept Link Profile Display — UX Design

**Date:** 2026-03-10
**Status:** Design (awaiting CEO decision on visual treatment)

## Overview

Surface concept links in the ProfileScreen so students can see how their knowledge connects across courses and skill domains. Two display levels: connections on individual sub-skill cards, and cross-course coverage on parent skill cards.

---

## 1. Sub-Skill Detail Panel — "CONNECTIONS" Section

### Placement

Insert after the existing PREREQUISITES section (ProfileScreen.jsx line 263) and before KEY TERMS (line 266). This positions connections logically — prerequisites are "what you need before this skill", connections are "what else this skill relates to".

**Section order after change:**
1. Identity (description, conceptKey, badges)
2. MASTERY CRITERIA
3. READINESS & MEMORY
4. PREREQUISITES
5. **CONNECTIONS** (new)
6. KEY TERMS
7. EVIDENCE
8. Source course / Practice button

### Visual Treatment — Option A: Compact List (Recommended)

Follows the exact same pattern as the existing PREREQUISITES section — consistent, lightweight, no new visual paradigm.

```
CONNECTIONS
  ↔  Power Rule Application in PHYS 201          85%
  →  Chain Rule Applications in MATH 301          41%
  ↔  Epsilon-Delta Proofs in MATH 301             60%
```

**Per-row layout:**
```
[arrow] [dot:color] [linked skill name] in [course name]  [pct%]
```

- **Arrow:** `↔` for same_concept/related (bidirectional), `→` for prerequisite (directional)
- **Dot:** 6px circle, same color logic as existing sub-skill dots:
  - `> 0.8` → T.gn (green)
  - `> 0.5` → #F59E0B (amber)
  - `> 0` → T.rd (red)
  - No mastery → T.txM (muted)
- **Skill name:** T.ac color, clickable
- **Course name:** T.txD color, inline after "in"
- **Percentage:** Right-aligned, colored same as dot
- **Link type badge:** Small 10px tag next to arrow — `same` in T.gn+18, `prereq` in T.ac+18, `related` in T.txD+18

**Interaction:** Clicking a linked skill:
- If the linked skill is under the same parent → `setExpandedSubSkill(linkedId)` (scrolls to it)
- If the linked skill is under a different parent → expand that parent first, then expand the sub-skill:
  ```
  setExpandedProfile(p => ({ ...p, [linkedParentId]: true }));
  setExpandedSubSkill(linkedId);
  ```
  This reuses existing ProfileScreen expansion state — no new navigation needed.

**Sort order:** same_concept first, prerequisite second, related third. Within each type, higher mastery first.

**Empty state:** Section entirely hidden when no connections exist (same as Prerequisites).

### Visual Treatment — Option B: Mini Graph (CEO Decision Needed)

A small node-link diagram showing the current skill as a central node with connections radiating outward. Each linked node shows the skill name and a mastery ring.

```
                    [PHYS 201: Power Rule App]
                           ↕ 85%
   [MATH 301: Chain Rule] → [THIS SKILL] ↔ [MATH 301: Epsilon-Delta]
                                              60%
```

**Implementation:** SVG-based, ~150 lines of layout code.

**Pros:** Visually striking, makes cross-domain connections tangible, could become a "wow" feature.

**Cons:**
- ~4x more code than Option A (~150 vs ~40 lines)
- Layout complexity: needs force-directed positioning or manual radial layout
- Doesn't match the existing list-based visual language of the profile panel
- Harder to make interactive (click targets on small SVG nodes)
- Diminishing returns: most skills have 0-3 connections, so the graph is trivial

**Recommendation:** Start with Option A (compact list). It's consistent, implementable in ~40 lines, and handles the common case (0-5 connections) well. Graph visualization could be a future enhancement for a dedicated "Knowledge Map" screen.

---

## 2. Parent Skill Card — Cross-Course Coverage

### Placement

In the parent card metadata line (ProfileScreen.jsx line 128-136), after the existing stats. Only shown when the parent has sub-skills from multiple courses.

### Current metadata line:
```
47 skills · 32 reviewed · 5 due · active
```

### With cross-course info:
```
47 skills · 32 reviewed · 5 due · active · 3 courses
```

**Implementation:** Count distinct `sourceCourseId` values across `subSkills` in the parent. If > 1, append the course count.

**Style:** Same as existing stats — `fontSize: 12, color: T.txD`, with dot separator.

### Optional enhancement: Course breakdown on expand

When the parent card is expanded, before the sub-skill categories, show a small course breakdown:

```
COURSES CONTRIBUTING
  MATH 201 — 28 skills (62% ready)
  PHYS 201 — 14 skills (45% ready)
  MATH 301 — 5 skills (80% ready)
```

**Style:** Same as category headers — `fontSize: 11, fontWeight: 600, color: T.txD, textTransform: uppercase`. Each course row is `fontSize: 12, color: T.txD`.

This is optional and can be deferred if the metadata line is sufficient.

---

## 3. Data Loading

### What needs to change in `loadProfile` (StudyContext.jsx)

Currently `loadProfile` loads per sub-skill:
- Mastery (via `Mastery.getBySkills`)
- Prerequisites (via `SkillPrerequisites.getForSkill`)

**Add:** Concept links loading per parent group.

**Approach — batch per parent:**
```
const allSubIds = subs.map(s => s.id);
const linkRows = await ConceptLinks.getBySkillBatch(allSubIds);
```

This is a single query for all sub-skills under a parent. `getBySkillBatch` already exists (added in Phase 3A, db.js:1421).

**Enrichment per sub-skill:**
For each sub-skill, filter `linkRows` to those touching `sub.id`, resolve the "other side" skill name and course, look up mastery from the existing `masteryMap` (for same-parent links) or load on-demand (for cross-parent links).

**Add to enrichedSubs return object:**
```js
connections: subLinks.map(l => ({
  linkedId: ...,
  linkedName: ...,
  linkedCourseId: ...,
  linkedCourseName: courseNames[linkedCourseId] || '...',
  linkType: l.link_type,
  strength: ...,  // retrievability of linked skill
})),
```

**Performance:** 1 extra DB query per parent (batch). Mastery for cross-parent linked skills may require a second `Mastery.getBySkills(crossParentIds)` call. Total additional queries: ~2 per parent group — negligible.

---

## 4. Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/StudyContext.jsx` | Load concept links in `loadProfile`, enrich sub-skill objects | ~25 new |
| `src/screens/ProfileScreen.jsx` | CONNECTIONS section in sub-skill detail panel | ~35 new |
| `src/screens/ProfileScreen.jsx` | Cross-course count in parent card metadata | ~5 new |

**Total:** ~65 new lines across 2 files

No new files. No new dependencies. No migrations.

---

## 5. Escalation to CEO

**Decision needed: Visual treatment for concept links on sub-skill cards.**

| | Option A: Compact List | Option B: Mini Graph |
|--|----------------------|---------------------|
| Visual | List rows with arrows, dots, percentages | SVG node-link diagram |
| Consistency | Matches existing PREREQUISITES pattern exactly | New visual paradigm |
| Code | ~35 lines in ProfileScreen | ~150 lines + SVG layout logic |
| Handles 0-3 links | Clean, lightweight | Graph looks sparse/trivial |
| Handles 10+ links | Scrollable list, easy to scan | Crowded, hard to read |
| Interaction | Click row → expand linked skill | Click node → expand (smaller targets) |
| Timeline | 1 step | 2-3 steps |

**Recommendation:** Option A. It's consistent with the existing visual language, handles common cases well, and ships in a single DEV step. A dedicated "Knowledge Map" screen with graph visualization could be a separate future feature.

---

## 6. Interaction Details

### Click a same-parent linked skill
```
setExpandedSubSkill(linkedId)
```
Skill is already visible in the current expanded parent — just switches the expanded detail panel.

### Click a different-parent linked skill
```
setExpandedProfile(p => ({ ...p, [linkedParentId]: true }));
setExpandedSubSkill(linkedId);
```
Opens the linked parent's card and expands the linked sub-skill. User may need to scroll to see it — consider `scrollIntoView` with `{ behavior: 'smooth' }` via a ref callback.

### Click a linked skill from a different course (but same parent domain)
Same as different-parent — the ProfileScreen groups by parent domain, which already aggregates sub-skills across courses. The linked skill should already be visible under the same parent card.

### Edge: linked skill is archived
The `getBySkillBatch` query JOINs `sub_skills` but doesn't filter `is_archived`. Archived skills should be hidden from connections.

**Fix:** Either filter in JS after loading (`linkRows.filter(l => !archivedSet.has(linkedId))`) or add `AND sa.is_archived = 0 AND sb.is_archived = 0` to the batch query. JS filtering is simpler and keeps the query general-purpose.

---

## 7. Verification Criteria

1. Sub-skill with concept links → CONNECTIONS section visible with correct data
2. Sub-skill without concept links → no CONNECTIONS section (no empty header)
3. Click a same-parent linked skill → detail panel switches to that skill
4. Click a different-parent linked skill → parent expands, skill detail opens
5. Parent with skills from multiple courses → "N courses" shows in metadata
6. Parent with skills from one course → no "N courses" in metadata
7. Mastery percentages match actual retrievability of linked skills
8. Build passes, no new warnings
