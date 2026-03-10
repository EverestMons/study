# Domain Drill-Down View — UX Design

**Date:** 2026-03-10
**Status:** Design complete
**Phase:** 2 of Character Sheet Profile
**Hero design:** `knowledge/design/character-sheet-profile-2026-03-10.md`
**Implementation:** `src/screens/ProfileScreen.jsx` lines 119-389 (current)

---

## Overview

The domain drill-down is the second level of the character sheet navigation. When a student taps a domain row on the hero screen, they see all parent skills within that domain — each expandable to show sub-skills with full mastery detail. The drill-down already exists in ProfileScreen; this design documents the target state and specifies two enhancements: **course attribution on parent cards** and **sort toggle**.

---

## 1. Screen Structure

```
+------------------------------------------+
|  <- Back to Profile              Settings |  <- Header bar
+------------------------------------------+
|                                          |
|  Mathematics & Statistics                |  <- Domain name (h1)
|  Lv 21 . 42 sub-skills . 68% ready      |  <- Domain subtitle
|                                          |
|  [Sort: Level v] [Sort: Weakest first]   |  <- Sort toggle (new)
|                                          |
|  +--------------------------------------+|
|  | [===16===]  Calculus             Lv 7 ||  <- Parent card (progress ring)
|  |  12 skills . 8 reviewed . 2 due       ||
|  |  From: MATH 201, MATH 301            ||  <- Course attribution (new)
|  |  [=============================] 73%  ||  <- Readiness bar
|  |                               [V]    ||  <- Expand toggle
|  +--------------------------------------+|
|                                          |
|  +--------------------------------------+|
|  | [===8====]  Linear Algebra       Lv 6 ||
|  |  9 skills . 5 reviewed               ||
|  |  From: MATH 202                       ||
|  |  [========================] 85%       ||
|  |                               [V]    ||
|  +--------------------------------------+|
|                                          |
|  (expanded parent shows sub-skills...)   |
|                                          |
+------------------------------------------+
```

---

## 2. Header Bar

Shared with the hero view. Back button behavior changes:

| View | Left button | Label | Action |
|------|-------------|-------|--------|
| Hero | `<-` | "Back" | `setScreen("home")` |
| Domain | `<-` | "Back to Profile" | `setProfileView(null); setExpandedSubSkill(null)` |

Right button unchanged: `Settings` -> `setShowSettings(true)`.

Already implemented in ProfileScreen lines 102-114. No changes needed.

---

## 3. Domain Header

Appears at the top of the scroll area when a domain is selected.

```
Mathematics & Statistics
Lv 21 . 42 sub-skills . 68% ready
```

**Domain name (h1):**
```js
{
  fontSize: 28,
  fontWeight: 700,
  color: T.tx,    // #E8EAF0
  margin: 0,
  marginBottom: 4,
}
```

**Subtitle:**
```js
{
  fontSize: 14,
  color: T.txD,   // #8B95A5
  margin: 0,
  marginBottom: 24,
}
```

Content: `Lv {totalLevel} . {totalSubs} sub-skills . {readiness}% ready`

Readiness only shown if > 0. Uses weighted average: `readinessSum / readinessCount` where each parent's readiness is weighted by its sub-skill count.

**Data source:** `selectedDomain = byDomain[profileView.domKey]`
- `selectedDomain.name` — CIP domain display name from `CIP_DOMAINS[domKey]`
- `selectedDomain.totalLevel` — sum of parent levels
- `selectedDomain.totalSubs` — sum of parent sub-skill counts
- `selectedDomain.readinessSum / selectedDomain.readinessCount` — weighted readiness

Already implemented at ProfileScreen lines 124-128. No changes needed.

---

## 4. Sort Toggle (Enhancement)

**NEW** — not in current implementation.

Two sort modes for parent skill cards within the domain:

| Mode | Label | Sort | Default |
|------|-------|------|---------|
| Level | "Level" | `level` descending, ties broken by `totalPoints` | Yes |
| Weakest | "Weakest first" | `readiness` ascending, ties broken by `dueForReview` descending | No |

**Layout:** Inline row of two pill-buttons below the domain subtitle.

```
[Level]  [Weakest first]
```

**Active pill:**
```js
{
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 6,
  background: T.ac,     // #6C9CFC
  color: T.bg,           // #0F1115
  border: "none",
  cursor: "pointer",
}
```

**Inactive pill:**
```js
{
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 6,
  background: "transparent",
  color: T.txD,          // #8B95A5
  border: "1px solid " + T.bd,  // #2A2F3A
  cursor: "pointer",
}
```

**State:**
```js
const [domainSort, setDomainSort] = React.useState("level");
// "level" | "weakest"
```

Component-local. Resets when navigating to a different domain (or back to hero) because `profileView` change triggers the sort to apply to the new domain's items.

**Sorted items:**
```js
const sortedItems = [...selectedDomain.items].sort((a, b) => {
  if (domainSort === "weakest") {
    return a.readiness - b.readiness || b.dueForReview - a.dueForReview;
  }
  return b.level - a.level || b.totalPoints - a.totalPoints;
});
```

**Placement:** Between domain subtitle and first parent card, with `marginBottom: 16`.

**Container:**
```js
{
  display: "flex",
  gap: 6,
  marginBottom: 16,
}
```

---

## 5. Parent Skill Cards

Each parent skill within the domain gets a card. Cards are expandable — clicking toggles sub-skill visibility.

### Card Layout

```
+------------------------------------------------------+
|  [progress ring]  Calculus                        [V] |
|                   CIP 27.0101                         |
|                   12 skills . 8 reviewed . 2 due      |
|                   . active . 2 courses                |
|                   From: MATH 201, MATH 301            |
|                   [=============================] 73% |
+------------------------------------------------------+
```

### Card Container

```js
{
  background: T.sf,      // #1A1D24
  border: "1px solid " + T.bd,  // #2A2F3A
  borderRadius: 14,
  padding: 20,
  marginBottom: 12,
}
```

### Progress Ring (Level Badge)

SVG circle, 52x52px. Background track in `T.bd`, progress arc in `T.ac`.

```js
// Ring
<svg width="52" height="52" viewBox="0 0 52 52">
  <circle cx="26" cy="26" r="23" fill="none" stroke={T.bd} strokeWidth="3" />
  <circle cx="26" cy="26" r="23" fill="none" stroke={T.ac} strokeWidth="3"
    strokeDasharray={2 * Math.PI * 23}
    strokeDashoffset={2 * Math.PI * 23 * (1 - progressPct / 100)}
    transform="rotate(-90 26 26)"
    style={{ transition: "stroke-dashoffset 0.3s" }} />
</svg>
// Level number centered inside
{ fontSize: 18, fontWeight: 700, color: T.ac }
```

`progressPct = progressNeeded > 0 ? Math.min(100, Math.round((progressToNext / progressNeeded) * 100)) : 0`

Already implemented at ProfileScreen lines 149-159. No changes needed.

### Skill Name + CIP Code

```js
// Name
{ fontSize: 16, fontWeight: 600, color: T.tx }

// CIP code (shown if present)
{ fontSize: 11, color: T.txM, marginTop: 1 }
// e.g., "CIP 27.0101"
```

Already implemented at ProfileScreen lines 161-162. No changes needed.

### Metadata Row

```js
{ fontSize: 12, color: T.txD, marginTop: 4 }
```

Content segments separated by ` . `:
- `{subCount} skill(s)` — always shown
- `{reviewedCount} reviewed` — always shown
- `{dueForReview} due` — amber `#F59E0B`, only if > 0
- `active` or `{N}d ago` — green if active (<=7 days), muted if old, hidden if no activity
- `{N} courses` — muted `T.txD`, only if > 1 course contributes

Already implemented at ProfileScreen lines 163-171. No changes needed.

### Course Attribution (Enhancement)

**NEW** — currently the card shows "N courses" but not which ones. The spec requires explicit course names.

```
From: MATH 201, MATH 301
```

**Placement:** Below the metadata row, before the readiness bar.

**Style:**
```js
{
  fontSize: 11,
  color: T.txM,     // #64748B
  marginTop: 3,
}
```

**Data:**
```js
const courseIds = new Set();
for (const sub of subSkills) {
  if (sub.sourceCourseId) courseIds.add(sub.sourceCourseId);
}
const courseLabels = [...courseIds]
  .map(id => courseNames[id])
  .filter(Boolean);
```

**Display rules:**
- 0 courses identified: hidden
- 1 course: `From: {name}` — simple attribution
- 2-3 courses: `From: {name1}, {name2}` — comma-separated
- 4+ courses: `From: {name1}, {name2} +{N} more` — truncated to avoid wrapping

**Truncation logic:**
```js
const MAX_SHOWN = 3;
const shown = courseLabels.slice(0, MAX_SHOWN);
const extra = courseLabels.length - MAX_SHOWN;
const text = "From: " + shown.join(", ") + (extra > 0 ? " +" + extra + " more" : "");
```

This replaces the inline "N courses" count in the metadata row. Remove the old `cs.size > 1` span and replace with the dedicated attribution line.

### Readiness Bar

Full-width bar below the metadata, with readiness % right-aligned.

```js
// Bar container
{ flex: 1, height: 5, background: T.bd, borderRadius: 3, overflow: "hidden" }

// Bar fill
{ width: Math.round(readiness * 100) + "%", height: "100%", background: readinessColor, borderRadius: 3, transition: "width 0.3s" }

// Readiness text
{ fontSize: 11, color: readinessColor, flexShrink: 0 }
```

**Readiness color thresholds (domain drill-down):**
```js
const readinessColor = readiness > 0.8 ? T.gn : readiness > 0.5 ? "#F59E0B" : T.rd;
```

Note: Domain drill-down uses 0.8/0.5 thresholds (existing behavior). Hero view uses 0.7/0.4 (CEO spec). This intentional difference: the hero is a summary (more forgiving), the drill-down is detailed (stricter standards).

Already implemented at ProfileScreen lines 173-178. No changes needed.

### Expand/Collapse Toggle

Chevron icon right-aligned: `V` (expanded) or `>` (collapsed).

```js
{ color: T.txD, fontSize: 11, flexShrink: 0 }
// Content: isExpanded ? "^" : "v"
```

Click handler toggles `expandedProfile[parent.id]`:
```js
onClick={() => setExpandedProfile(p => ({ ...p, [parent.id]: !p[parent.id] }))
```

Already implemented at ProfileScreen line 147 + 180. No changes needed.

---

## 6. Review Due Skills Button

When a parent has `dueForReview > 0` and is expanded, an amber action button appears at the top of the expanded content.

```
+------------------------------------------------------+
| Review 2 Due Skills                                   |
+------------------------------------------------------+
```

**Style:**
```js
{
  width: "100%",
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #F59E0B",
  background: "rgba(251,191,36,0.08)",
  color: "#F59E0B",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  marginBottom: 14,
}
```

**Action:** Enters study mode with the first due sub-skill for practice. Finds the source course, creates a practice set, enters practice mode.

Already implemented at ProfileScreen lines 186-214. No changes needed.

---

## 7. Sub-Skill List (Expanded Parent)

When a parent is expanded, sub-skills appear grouped by category.

### Category Groups

```
CALCULUS FUNDAMENTALS
  . Chain Rule                         apply  [====] 82%
  . Integration by Parts              apply  [==]   45%
  . L'Hopital's Rule                           New

SERIES & SEQUENCES
  . Taylor Series                     analyze [===]  67%
  . Convergence Tests                 apply         New
```

**Category header:**
```js
{
  fontSize: 11,
  fontWeight: 600,
  color: T.txD,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}
```

**Sub-skill row:**
```js
{
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px",
  borderRadius: 8,
  cursor: "pointer",
  background: isSubExpanded ? T.bg : "transparent",
  border: isSubExpanded ? "1px solid " + T.bd : "1px solid transparent",
}
```

Each row shows:
- **Status dot** (7px circle): `subColor` if mastery exists, `T.bd` if not
- **Name**: `fontSize: 13, color: T.tx`, truncated with ellipsis
- **Bloom's level** badge: colored background from `bloomsColors`, `fontSize: 10`
- **Readiness bar** (52px wide, 4px tall) if mastery exists, or confidence label if not

Sub-skill readiness color thresholds: `>0.8 green, >0.5 amber, else red` (same as parent cards).

Already implemented at ProfileScreen lines 218-236. No changes needed.

---

## 8. Sub-Skill Detail Panel

When a sub-skill row is clicked, the full detail panel expands below it.

### Panel Container

```js
{
  background: T.bg,
  border: "1px solid " + T.bd,
  borderTop: "none",
  borderRadius: "0 0 8px 8px",
  padding: 16,
  marginBottom: 4,
}
```

### Panel Sections (in order)

| Section | Shows | Condition |
|---------|-------|-----------|
| Description | `sub.description` text | Always if present |
| Concept key | `sub.conceptKey` in monospace | Always if present |
| Badges | Skill type + Bloom's level + Confidence | Always |
| Mastery criteria | Checklist with verified/unverified marks | `masteryCriteria.length > 0` |
| Readiness & memory | 2-col grid: recall, stability, difficulty, reviews, lapses, next review, points | `sub.mastery` exists |
| Prerequisites | Clickable list with readiness dots | `prerequisites.length > 0` |
| Connections | Concept links with arrows, course attribution, readiness | `connectionCache[sub.id]` loaded and non-empty |
| Key terms | Tag pills from `evidence.anchorTerms` | Terms or definitions exist |
| Evidence | Diagnostic/practice/tutoring/decay counts | Any fitness metric > 0 |
| Course attribution | `From: {courseName}` | `sourceCourseId` present |
| Practice button | Full-width accent button | `sourceCourseId` present |

All sections already implemented at ProfileScreen lines 240-376. No changes needed.

### Concept Links (Connections Section)

Lazy-loaded via `connectionCache` effect (lines 59-93). When a sub-skill is expanded, its concept links are fetched from the database, enriched with retrievability from mastery data, and sorted by link type priority (same_concept > prerequisite > related) then by retrievability.

Each connection row shows:
- Arrow icon: `->` for prerequisite, `<->` for same_concept/related
- Status dot with retrievability color
- Linked skill name (clickable — navigates to that sub-skill)
- Source course name
- Retrievability % if > 0

Clicking a connection:
1. Finds the parent skill that contains the linked sub-skill
2. Expands that parent (`setExpandedProfile`)
3. Expands the linked sub-skill (`setExpandedSubSkill`)

This handles cross-parent navigation within the domain view. If the linked skill is in a different domain, the navigation still works — the user may need to go back to the hero and select the other domain to see full context.

Already implemented at ProfileScreen lines 295-321. No changes needed.

### Course Attribution on Sub-Skills

```
From: MATH 201
```

```js
{ fontSize: 11, color: T.txM, marginTop: 8 }
```

Already implemented at ProfileScreen lines 346-348. No changes needed.

---

## 9. Empty Domain State

If `selectedDomain.items.length === 0` (domain exists in `byDomain` but has no parent skills — shouldn't happen in practice since domains are created from parent grouping):

```
No skills in this domain yet.
```

```js
{
  textAlign: "center",
  padding: "32px 20px",
  color: T.txD,
  fontSize: 14,
}
```

This is a defensive guard. In practice, domains are only created when at least one parent skill maps to that CIP domain, so this state is unreachable. But the guard prevents a blank screen if data is somehow inconsistent.

Not currently implemented. Add as a minor defensive check.

---

## 10. Sorting Behavior Detail

### Default sort (Level)

```js
selectedDomain.items.sort((a, b) => b.level - a.level || b.totalPoints - a.totalPoints)
```

This matches the hero's Top 4 logic. The strongest skill is first. Students see "what I'm best at" in this domain.

### Weakest-first sort

```js
selectedDomain.items.sort((a, b) => a.readiness - b.readiness || b.dueForReview - a.dueForReview)
```

The least-ready skill is first. Skills with due reviews float up within the same readiness tier. This is for review-focused students who want to address weaknesses.

### Sort state lifecycle

- `domainSort` is component-local state, not persisted
- Defaults to `"level"` on every domain entry
- Changing sort does NOT affect `expandedProfile` — expanded parents stay expanded
- Navigating back to hero and re-entering resets to `"level"`

---

## 11. Course Attribution on Parent Cards — Design Detail

### Current behavior (to replace)

Line 171: `cs.size > 1 ? <span>. {cs.size} courses</span> : null`

Shows "2 courses" but not which courses. Only appears for multi-course parents.

### New behavior

Replace the inline course count with a dedicated attribution line below the metadata row:

```
From: Introduction to Calculus, Advanced Mathematics
```

**Rules:**
| Courses | Display |
|---------|---------|
| 0 | Hidden (no sub-skills have sourceCourseId) |
| 1 | `From: {name}` |
| 2-3 | `From: {name1}, {name2}` |
| 4+ | `From: {name1}, {name2} +{N} more` |

**Style:** Same as sub-skill course attribution: `fontSize: 11, color: T.txM, marginTop: 3`.

**Placement:** After the metadata row (skills/reviewed/due/active), before the readiness bar.

---

## 12. What Changes from Current Implementation

| Element | Current (lines) | Change needed |
|---------|-----------------|---------------|
| Domain header | 124-128 | None |
| Parent card container | 146 | None |
| Progress ring | 149-159 | None |
| Name + CIP | 160-162 | None |
| Metadata row | 163-171 | Remove inline "N courses" span |
| Course attribution line | — | **Add** below metadata row |
| Readiness bar | 173-178 | None |
| Expand toggle | 180 | None |
| Review due button | 186-214 | None |
| Category groups | 215-217 | None |
| Sub-skill rows | 218-236 | None |
| Sub-skill detail panel | 239-377 | None |
| Concept link effect | 59-93 | None |
| **Sort toggle** | — | **Add** between subtitle and first card |
| **Sort state** | — | **Add** `domainSort` useState |
| **Empty domain guard** | — | **Add** defensive check |

**Net: 3 additions (sort toggle + course attribution + empty guard), 1 removal (inline course count). ~25 new lines.**

---

## 13. Navigation Model (Complete)

```
HomeScreen
  |
  v  "View Profile" -> loadProfile() -> setScreen("profile")
  |
ProfileScreen (profileView = null)
  = Character Sheet Hero
  |
  |  Click domain row -> setProfileView({ domKey })
  v
ProfileScreen (profileView = { domKey: "27" })
  = Domain Drill-Down
  |
  |  Click parent card -> toggles expandedProfile[parentId]
  |  Click sub-skill -> toggles expandedSubSkill
  |  Click connection -> navigates to linked sub-skill (within same view)
  |  Click "Practice This Skill" -> enterStudy + practice mode
  |  Click "Review Due Skills" -> enterStudy + practice mode (first due)
  |
  |  "<- Back to Profile" -> setProfileView(null); setExpandedSubSkill(null)
  v
ProfileScreen (profileView = null)
  = Character Sheet Hero (returned)
```

All navigation is `profileView` state changes. No ScreenRouter involvement.

---

## 14. Responsive Behavior

- `maxWidth: 680` — same as hero. All content within centered container.
- Sort toggle pills wrap naturally at narrow widths (flexbox).
- Parent cards are full-width within the container.
- Sub-skill names truncate with ellipsis.
- Detail panel sections stack vertically, no horizontal overflow.
- Course attribution text wraps naturally (long course names).

---

## 15. Verification Criteria

1. Domain header shows correct name, aggregate level, sub-skill count, readiness %
2. Parent cards show correct level (ring), name, sub-count, reviewed, due count
3. Parent cards show course attribution: "From: ..." with correct course names
4. Sort toggle defaults to "Level", switches to "Weakest first" on click
5. "Weakest first" sort puts lowest-readiness parent first
6. Expanding a parent shows sub-skills grouped by category
7. Sub-skill detail panel shows all sections (mastery, prerequisites, connections, evidence, practice)
8. Concept links load lazily on sub-skill expansion
9. "Practice This Skill" button enters practice mode for that sub-skill
10. "Review Due Skills" button enters practice mode for first due sub-skill
11. Back button returns to hero view, clears expanded sub-skill state
12. Connection click navigates to linked sub-skill within the domain view
13. Empty domain shows fallback message (defensive)
14. All existing functionality preserved — no regressions from Phase 1

---

## Handoff to DEV

**Files to modify:** `src/screens/ProfileScreen.jsx` only.

**Changes:**
1. Add `domainSort` state: `const [domainSort, setDomainSort] = React.useState("level");`
2. Add sort toggle UI between domain subtitle and first parent card (~15 lines)
3. Sort `selectedDomain.items` based on `domainSort` before `.map()`
4. Replace inline "N courses" span in metadata row with dedicated "From: ..." line (~8 lines)
5. Add empty domain guard (~3 lines)

**Estimated impact:** ~25 new lines, ~5 removed. ProfileScreen 507 -> ~527 lines.
