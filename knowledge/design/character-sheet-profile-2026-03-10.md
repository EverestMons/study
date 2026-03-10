# Character Sheet Profile — UX Design

**Date:** 2026-03-10
**Status:** Design complete
**CEO Decisions Applied:** Top 4 by level, level + progress bar, separate domain drill-down, no character image

---

## Overview

Replace the current ProfileScreen with a D&D-inspired "character sheet" hero screen. The hero is a glanceable summary of the student's strongest skill areas and domain coverage. Drilling into a domain navigates to a separate screen (Phase 2). The current sub-skill detail panel (mastery criteria, prerequisites, connections, evidence, practice) moves to the domain drill-down.

---

## 1. Screen Structure

```
┌──────────────────────────────────────────┐
│  < Back                        Settings  │  ← Header bar (unchanged)
├──────────────────────────────────────────┤
│                                          │
│  Skill Profile                           │  ← Title
│  Your knowledge across all courses       │  ← Subtitle
│                                          │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐ │
│  │  12  │  │  8   │  │  6   │  │  4   │ │  ← Summary stats
│  │Skills│  │ Subs │  │Total │  │ Due  │ │
│  │Areas │  │      │  │Level │  │Review│ │
│  └──────┘  └──────┘  └──────┘  └──────┘ │
│                                          │
│  ╔══════════════════════════════════════╗ │
│  ║  TOP SKILLS                         ║ │
│  ║                                     ║ │
│  ║  ┌─────────────┐ ┌─────────────┐    ║ │
│  ║  │  7          │ │  6          │    ║ │  ← Level numbers (large)
│  ║  │ Calculus    │ │ Linear Alg  │    ║ │
│  ║  │ ████░░ 73%  │ │ █████░ 85%  │    ║ │  ← Progress bar + readiness
│  ║  └─────────────┘ └─────────────┘    ║ │
│  ║  ┌─────────────┐ ┌─────────────┐    ║ │
│  ║  │  5          │ │  3          │    ║ │
│  ║  │ Mechanics   │ │ Probability │    ║ │
│  ║  │ ███░░░ 62%  │ │ █░░░░░ 41%  │    ║ │
│  ║  └─────────────┘ └─────────────┘    ║ │
│  ╚══════════════════════════════════════╝ │
│                                          │
│  ┌──────────────────────────────────────┐ │
│  │  ⚡ 14 skills due for review         │ │  ← Due-for-review banner
│  └──────────────────────────────────────┘ │
│                                          │
│  DOMAINS                                 │
│                                          │
│  ┌──────────────────────────────────────┐ │
│  │  Mathematics        Lv 21    68%   >│ │  ← Domain row (tappable)
│  │  5 skills · 42 sub-skills           │ │
│  └──────────────────────────────────────┘ │
│  ┌──────────────────────────────────────┐ │
│  │  Physics            Lv 8     55%   >│ │
│  │  2 skills · 18 sub-skills           │ │
│  └──────────────────────────────────────┘ │
│  ┌──────────────────────────────────────┐ │
│  │  Computer Science   Lv 3     40%   >│ │
│  │  1 skill · 9 sub-skills             │ │
│  └──────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

---

## 2. Header Bar

Identical to current ProfileScreen (lines 83-90). No changes.

```
< Back                            Settings
```

- `< Back` → `setScreen("home")`
- `Settings` → `setShowSettings(true)`

---

## 3. Summary Stats Row

Same 4-stat row as current ProfileScreen (lines 97-109). No changes to data or layout.

| Stat | Source | Color |
|------|--------|-------|
| Skill Areas | `totalParents` | `T.ac` |
| Sub-skills | `totalSubs` | `T.ac` |
| Total Level | `overallLevel` | `T.ac` |
| Due for Review | `totalDue` | `#F59E0B` if > 0, else `T.txD` |

---

## 4. Top 4 Skills Section

The "ability scores" — the student's 4 highest-level parent skills.

### Data

```js
const top4 = (profileData || [])
  .filter(p => p.level > 0)
  .sort((a, b) => b.level - a.level || b.totalPoints - a.totalPoints)
  .slice(0, 4);
```

Only show parent skills with `level > 0` (at least 1 mastery point). Sort by level descending, break ties with totalPoints.

### Layout

2×2 grid. Each cell is a card.

```
display: "grid"
gridTemplateColumns: "1fr 1fr"
gap: 12
```

If fewer than 4 qualifying skills:
- 3 skills → 2×2 grid, 4th cell is an empty placeholder
- 2 skills → 2×2 grid, cells 3-4 are empty placeholders
- 1 skill → 2×2 grid, cells 2-4 are empty placeholders
- 0 skills → section hidden entirely

### Per-Card Design

```
┌──────────────────────┐
│                    7 │  ← Level number: fontSize 32, fontWeight 700, color T.ac
│                      │
│  Calculus            │  ← Skill name: fontSize 14, fontWeight 600, color T.tx
│  █████████░░░░  73%  │  ← Progress bar (to next level) + readiness %
└──────────────────────┘
```

**Card container:**
```js
{
  background: T.sf,
  border: "1px solid " + T.bd,
  borderRadius: 14,
  padding: "16px 16px 14px",
  position: "relative",
}
```

**Level number** — top-right corner:
```js
{
  position: "absolute",
  top: 14,
  right: 16,
  fontSize: 32,
  fontWeight: 700,
  color: T.ac,
  lineHeight: 1,
}
```

**Skill name** — bottom-left, below level:
```js
{
  fontSize: 14,
  fontWeight: 600,
  color: T.tx,
  marginTop: 28,  // push below the level number
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 50,  // avoid collision with level number
}
```

**Progress bar** — thin bar showing `progressToNext / progressNeeded`:
```js
// Container
{
  height: 4,
  background: T.bd,
  borderRadius: 2,
  overflow: "hidden",
  marginTop: 8,
  flex: 1,
}
// Fill
{
  width: progressPct + "%",
  height: "100%",
  background: T.ac,
  borderRadius: 2,
}
```

**Readiness %** — right-aligned next to progress bar:
```js
{
  fontSize: 11,
  color: readinessColor,  // green >0.7, amber 0.4-0.7, red <0.4
  flexShrink: 0,
  marginLeft: 8,
}
```

Readiness color thresholds (adjusted to match CEO's "green >70%, amber 40-70%, red <40%"):
```js
const readinessColor = readiness > 0.7 ? T.gn : readiness > 0.4 ? "#F59E0B" : T.rd;
```

Note: This differs from the current ProfileScreen thresholds (>0.8 green, >0.5 amber). The character sheet uses 0.7/0.4 as specified in the orchestrator plan. The domain drill-down (Phase 2) can keep the existing thresholds on parent cards for consistency with the current detailed view.

**Empty placeholder card:**
```js
{
  background: T.sf,
  border: "1px dashed " + T.bd,
  borderRadius: 14,
  padding: "16px 16px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: T.txM,
  fontSize: 13,
}
// Content: "—"
```

### Section Header

```
TOP SKILLS
```

```js
{
  fontSize: 11,
  fontWeight: 600,
  color: T.txD,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 10,
}
```

---

## 5. Due-for-Review Banner

Shown only when `totalDue > 0`. Positioned between Top 4 and Domains.

```
┌──────────────────────────────────────────┐
│  ⚡ 14 skills due for review              │
└──────────────────────────────────────────┘
```

**Design:**
```js
{
  background: "rgba(251,191,36,0.08)",
  border: "1px solid rgba(251,191,36,0.2)",
  borderRadius: 10,
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 24,
  cursor: "pointer",  // navigates to skills review
}
```

- Lightning bolt icon: rendered as text `⚡` or the existing amber dot pattern
- Text: `fontSize: 13, fontWeight: 500, color: "#F59E0B"`
- Click action: Navigate to study screen with skills mode. Implementation TBD — for now, just visual. Could scroll to the first domain with due skills, or open a filtered view.

If `totalDue === 0`, the banner is not rendered (no empty state for it).

---

## 6. Domain Summary Section

### Section Header

```
DOMAINS
```

Same styling as TOP SKILLS header: `fontSize: 11, fontWeight: 600, color: T.txD, uppercase`.

### Domain Row

Each domain is a tappable card that navigates to the Phase 2 domain drill-down.

```
┌──────────────────────────────────────────┐
│  Mathematics              Lv 21    68% >│
│  5 skills · 42 sub-skills               │
└──────────────────────────────────────────┘
```

**Container:**
```js
{
  background: T.sf,
  border: "1px solid " + T.bd,
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 8,
  cursor: "pointer",
  transition: "background 0.15s ease",
}
// Hover: background: T.sfH
```

**Top row** (flex, space-between):
```js
// Left: domain name
{ fontSize: 15, fontWeight: 600, color: T.tx }

// Right: level + readiness + chevron
// Level: fontSize: 13, color: T.txD, "Lv " + totalLevel
// Readiness %: fontSize: 13, color: readinessColor, marginLeft: 8
// Chevron: ">" in T.txM, fontSize: 11, marginLeft: 8
```

**Bottom row** (metadata):
```js
{ fontSize: 12, color: T.txD, marginTop: 4 }
// "{N} skills · {M} sub-skills"
// If dueCount > 0: append " · {K} due" in #F59E0B
```

**Data per domain:**
```js
const domainData = Object.entries(byDomain)
  .map(([domKey, dom]) => ({
    domKey,
    name: dom.name,
    totalLevel: dom.totalLevel,
    parentCount: dom.items.length,
    totalSubs: dom.totalSubs,
    readiness: dom.readinessCount > 0 ? dom.readinessSum / dom.readinessCount : 0,
    dueCount: dom.items.reduce((s, p) => s + p.dueForReview, 0),
  }))
  .sort((a, b) => b.totalLevel - a.totalLevel);
```

**Click action:**
```js
onClick={() => {
  setProfileView({ type: "domain", domKey });  // new state — see Phase 2 routing
}
```

Phase 2 will add `profileView` state to either ProfileScreen or StudyContext to handle the hero → domain navigation. For Phase 1, clicking a domain is a no-op (handler wired but target screen not yet built).

### Empty State (No Domains)

When `profileData` is empty or all parents have 0 sub-skills:

```
┌──────────────────────────────────────────┐
│                                          │
│  Upload course materials to start        │
│  building your skill profile             │
│                                          │
│          [Go to Upload]                  │
│                                          │
└──────────────────────────────────────────┘
```

```js
{
  textAlign: "center",
  padding: "48px 20px",
  color: T.txD,
  fontSize: 15,
  background: T.sf,
  borderRadius: 14,
  border: "1px solid " + T.bd,
}
```

The "Go to Upload" button:
```js
{
  marginTop: 12,
  padding: "8px 20px",
  borderRadius: 8,
  border: "1px solid " + T.ac,
  background: T.acS,
  color: T.ac,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
// onClick: setScreen("upload")
```

---

## 7. What Moves to Phase 2

The following current ProfileScreen elements are **removed from the hero screen** and will live in the Phase 2 domain drill-down:

| Element | Current Location | Phase 2 Location |
|---------|-----------------|------------------|
| Parent skill cards with progress rings | Lines 150-184 | Domain drill-down: parent list within a domain |
| Sub-skill category groups | Lines 220-397 | Domain drill-down: expanded parent |
| Sub-skill detail panel (mastery, prereqs, connections, evidence, practice) | Lines 244-393 | Domain drill-down: expanded sub-skill |
| "Review Due Skills" button per parent | Lines 191-219 | Domain drill-down: per-parent action |
| Concept link lazy-loading effect | Lines 42-78 | Domain drill-down: same effect |

The domain chip row (current lines 112-127) is replaced by the new Domain Summary section.

---

## 8. Navigation Model

```
HomeScreen → "Profile" → Character Sheet Hero (Phase 1)
                            ├── Domain card click → Domain Drill-Down (Phase 2)
                            │                        ├── Parent skill cards
                            │                        ├── Sub-skill detail
                            │                        └── "< Back to Profile"
                            └── "Due for Review" banner → TBD
```

**Routing approach:** Internal state in ProfileScreen rather than new ScreenRouter route.

```js
const [profileView, setProfileView] = React.useState(null);
// null → hero screen
// { type: "domain", domKey: "27" } → domain drill-down
```

This keeps the ScreenRouter unchanged (`screen === "profile"` → ProfileScreen). The ProfileScreen internally decides what to render based on `profileView`.

Phase 1 sets up the state but only renders the hero. Phase 2 adds the domain drill-down branch.

---

## 9. Responsive Behavior

- **maxWidth: 680** — same as current ProfileScreen. Content centered within.
- **Top 4 grid:** At very narrow widths (<400px), the 2×2 grid still works because each card is `1fr` and content wraps gracefully. No responsive breakpoint needed.
- **Domain rows:** Full width within the 680px container. Text truncates with ellipsis on very long domain names.
- **No horizontal scroll** anywhere.

---

## 10. Escalation to CEO

**Decision needed: Visual treatment of level numbers in Top 4 cards.**

| | Option A: Corner Number (Recommended) | Option B: Center Number |
|--|--------------------------------------|------------------------|
| Level placement | Top-right corner, large (32px) | Centered, very large (48px) |
| Skill name | Below, left-aligned | Below the number, centered |
| Progress bar | Bottom of card | Below name, centered |
| D&D feel | Ability score card — number in corner | More like a badge/emblem |
| Scannability | Eyes scan top-right for numbers, left for names | All content centered, slightly harder to compare |
| Space efficiency | Name gets full width minus number | Name shares space below large number |

**Recommendation:** Option A. Corner numbers are faster to scan — the eye naturally jumps from number to number across the 2×2 grid. Matches D&D character sheet where ability scores are in boxes with the number prominent but not dominating.

**Decision needed: Progress bar interpretation.**

The progress bar below each Top 4 card can show one of two things:

| | Option 1: Level Progress (Recommended) | Option 2: Readiness |
|--|---------------------------------------|---------------------|
| What it shows | `progressToNext / progressNeeded` — points toward next level | `readiness` — average retrievability across sub-skills |
| Color | Always `T.ac` (accent blue) | Green/amber/red based on readiness threshold |
| Student reads as | "How close am I to leveling up?" | "How well do I remember this?" |
| Redundancy | Readiness shown as % text separately | Level progress only visible here |

**Recommendation:** Option 1. The readiness % is already displayed as text next to the bar. Using the bar for level progress gives the student two distinct pieces of information per card (level progress + readiness) instead of showing readiness twice. The accent-blue bar also maintains visual consistency with the existing progress ring on parent cards.

---

## 11. Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/screens/ProfileScreen.jsx` | Replace body content with hero layout (Top 4 + banner + domains), add `profileView` state, keep header/data computation | ~150 rewritten, ~250 removed (moved to Phase 2) |

Phase 2 will add the domain drill-down rendering branch (~250 lines, largely the current parent/sub-skill code).

**Total Phase 1:** ~150 new lines replacing ~400 existing lines. Net reduction of ~250 lines (temporarily, until Phase 2 restores the drill-down).

No new files. No new dependencies. No migrations.

---

## 12. Verification Criteria

1. Top 4 cards show the 4 highest-level parent skills with correct level, name, progress bar, readiness %
2. Fewer than 4 qualifying skills → placeholder cards fill the grid
3. No qualifying skills (all level 0) → TOP SKILLS section hidden
4. Empty profile (no data) → empty state with upload link
5. Due-for-review banner shows when `totalDue > 0`, hidden otherwise
6. Domain rows show correct aggregate level, parent count, sub-skill count, readiness
7. Domain rows sorted by aggregate level descending
8. Domain rows with due skills show due count in amber
9. Clicking a domain row is wired (handler exists) but no-op until Phase 2
10. Header bar (Back, Settings) works identically to current
11. Build passes, no warnings
