# Session Mastery Summary — UX Design
**Date:** 2026-03-14
**Agent:** Study UX Designer
**Project:** study
**Learning Science Alignment:** All design decisions grounded in Step 1 research findings. Celebration calibrated to "tutor nodding approvingly" — brief, specific, non-blocking. Decay messaging deferred from celebration moment per research recommendation. Assessment visualization avoids creating exam-like pressure.

---

## Design Principles (from Research)

These constraints from the Step 1 research are non-negotiable:

1. **Assessment must feel like teaching, not testing.** No UI element should make the student feel they're being judged.
2. **Celebration must be brief (2-3 seconds), specific, non-blocking.** No modals, confetti, sound effects, or badges.
3. **No decay messaging at the moment of celebration.** Defer to profile screen and review reminders.
4. **Forward momentum.** Every celebration immediately suggests what's next.
5. **Extend existing patterns.** Build on skill pills, SessionSummary, and notification system — don't replace them.

---

## 1. In-Chat Facet Assessment Visualization

### Current State

When the AI rates a skill, `parseSkillUpdates` extracts `[SKILL_UPDATE]` tags and renders them as **skill pills** below the assistant message (MessageList.jsx lines 54-66):

```
┌──────────────────────────────────────────┐
│ [Assistant message content]              │
│                                          │
│  ┌─────────────┐ ┌──────────────────┐    │
│  │ Power Rule: good │ │ Chain Rule: hard │    │
│  └─────────────┘ └──────────────────┘    │
└──────────────────────────────────────────┘
```

These are small, colored (`T.gn`/`T.am`), pill-shaped badges. They appear once and are static.

### Design: Enhanced Facet Pills

**Keep the pill pattern** but add facet-level detail when facet updates are present. The pills expand from skill-level to show individual facet ratings underneath.

**When only skill-level updates are present (backward compat):**
Render exactly as today — no change.

**When facet-level updates are present:**

```
┌──────────────────────────────────────────────────────┐
│ [Assistant message about power rule application]     │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ Power Rule Application                  good  │    │
│  │  ├ Basic differentiation          ····●  easy │    │
│  │  ├ Chain rule combination         ···●·  good │    │
│  │  └ Negative/fractional exponents  ··●··  hard │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

**Specification:**

- **Outer container:** `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 10`, `padding: 10px 14px`, `marginTop: 8`
- **Skill name row:** `fontSize: 12`, `fontWeight: 600`, `color: T.tx`. Rating on the right: `color` based on rating (same as current pill colors: easy/good = `T.gn`, hard/struggled = `T.am`)
- **Facet rows:** indented with tree connector characters (`├` / `└`), `fontSize: 11`, `color: T.txD`
  - **Mini progress dots:** 5 dots in a row, filled up to rating level (easy=5, good=4, hard=2, struggled=1). Filled dots use the rating color, unfilled use `T.bd`. Dot size: 4px, gap: 2px.
  - **Rating label:** `fontSize: 10`, same color scheme as skill pills
- **When a facet has no prior mastery data (first assessment):** show a subtle `NEW` tag in `T.txM` instead of dots

**Interaction:** None — these are display-only. No click handlers, no expansion. The student sees what was assessed and moves on.

**Why not a progress bar or checklist?**
- A progress bar implies a linear path toward completion, which creates goal-seeking behavior (students optimize for filling the bar rather than learning). Research Step 1 specifically warned against this.
- A checklist creates exam-like pressure ("I need to check off all items"). The facet pills are informational, not actionable.
- The mini dots provide a sense of granularity without implying a completion target.

**When the AI rates a single facet (mid-conversation):**
Show a minimal single-facet pill — just the facet name and rating, no skill header. This keeps mid-conversation assessments subtle.

```
  ┌────────────────────────────────────┐
  │  ○ Basic differentiation      good │
  └────────────────────────────────────┘
```

- `fontSize: 11`, `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 8`, `padding: 6px 10px`
- Leading circle (`○`): filled with rating color, 6px diameter
- Only expand to the full skill-level card when multiple facets are rated in a single message

---

## 2. Skill Mastery Moment

### Trigger

When `applySkillUpdates` detects that all facets of a skill have crossed the mastery threshold (all rated "good" or better at least once, per research recommendation), it emits a `MasteryEvent`.

### Design: Inline Mastery Card

**Not a modal.** Not a banner. Not a notification toast. An inline card that appears in the chat flow, between the assistant message that triggered it and the next message. It occupies the same visual space as a message but is clearly distinct.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │     Power Rule Application                         │  │
│  │     ─────────────────────────                      │  │
│  │     Lv 2  →  Lv 3                                  │  │
│  │                                                    │  │
│  │     ✓ Basic differentiation               easy     │  │
│  │     ✓ Chain rule combination               good     │  │
│  │     ✓ Negative/fractional exponents        good     │  │
│  │                                                    │  │
│  │     Next review in 3 days                          │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Specification:**

- **Wrapper:** `maxWidth: "80%"`, `margin: "20px auto"`, centered in the chat flow
- **Card:** `background: T.sf`, `border: 1px solid T.gn` (green border — the only special visual treatment), `borderRadius: 14`, `padding: 20px 24px`
- **Entry animation:** `fadeIn` keyframe (already exists in CSS), 0.3s duration. No bouncing, no scaling, no particles.
- **Skill name:** `fontSize: 16`, `fontWeight: 700`, `color: T.tx`, `marginBottom: 4`
- **Divider:** 1px line, `background: T.bd`, `margin: 8px 0 12px`
- **Level change:** `fontSize: 20`, `fontWeight: 700`, `color: T.ac` for both numbers. Arrow `→` in `T.txD`. If no level change (rare — mastery without points), omit this row.
- **Facet checklist:**
  - Each row: `display: flex`, `gap: 8`, `padding: 4px 0`
  - Checkmark `✓`: `color: T.gn`, `fontSize: 13`, `fontWeight: 600`
  - Facet name: `fontSize: 13`, `color: T.tx`, `flex: 1`
  - Rating: `fontSize: 11`, `color` by rating (easy/good = `T.gn`)
- **Next review line:** `fontSize: 11`, `color: T.txM`, `marginTop: 12`. Framed as informational, not a warning. Uses `T.txM` (muted) so it doesn't compete with the achievement.
  - Text: `"Next review in [N] days"` — never "decay starts" or "you'll forget"
  - If next review is >14 days: `"Next review in [N] days — well locked in"`
  - If next review is 1-3 days: `"Next review in [N] days"` (neutral, no alarm)

**No dismiss button.** The card is part of the chat history — it scrolls with messages. It's a permanent record of the achievement, not a transient notification. This is intentional: the student can scroll back and see their mastery moments.

**Why inline, not modal?**
- Modals break flow and require a dismiss action (research: non-blocking)
- Modals are associated with interruptions and errors in desktop UX
- An inline card maintains conversation continuity — the student stays in the learning flow
- The card becomes part of the conversation record, reinforcing that mastery was earned through dialogue

**Why not a notification?**
- Notifications are also generated (see below), but the mastery moment deserves more visual weight than a notification toast
- The notification serves as a persistent record in the notification panel; the inline card is the in-context celebration

### Notification (Complementary)

In addition to the inline card, generate an enhanced notification:

```
addNotif("mastery", "Power Rule Application → Lv 3")
```

- New notification type `"mastery"` (distinct from `"skill"`)
- NotifPanel renders mastery notifications with `T.gn` background tint and `T.gn` text (vs. current skill notifications which use `T.ac`)
- This ensures the mastery event is recorded even if the student doesn't scroll to see the inline card

---

## 3. Session-End Summary

### Current State

`SessionSummary.jsx` renders a full-screen overlay (`position: absolute, inset: 0, zIndex: 100`) with:
- Duration + message count (two stat cards)
- Skills Practiced (list with name, rating, strength %)
- Topics Covered (pill tags)
- Breakthroughs (italic quotes in green background)
- DOCX export button (conditional)
- Done button

### Design: Enhanced Session Summary with Mastery Section

**Keep the existing overlay pattern.** The session summary is already full-screen and well-structured. Add a new section for mastery events, positioned prominently above the existing "Skills Practiced" section.

**New layout (top to bottom):**

```
┌────────────────────────────────────────────────┐
│              Session Complete                   │
│                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│   │    23    │  │    42    │  │     2    │    │
│   │ minutes  │  │ messages │  │ mastered │    │
│   └──────────┘  └──────────┘  └──────────┘    │
│                                                 │
│   SKILLS MASTERED                               │
│   ┌────────────────────────────────────────┐    │
│   │  ✓ Power Rule Application    Lv 2→3   │    │
│   │    3/3 facets demonstrated             │    │
│   ├────────────────────────────────────────┤    │
│   │  ✓ Integration Basics        Lv 1→2   │    │
│   │    4/4 facets demonstrated             │    │
│   └────────────────────────────────────────┘    │
│                                                 │
│   SKILLS PRACTICED (no mastery change)          │
│   ┌────────────────────────────────────────┐    │
│   │  Chain Rule          good       72%    │    │
│   │  L'Hôpital's Rule   hard       45%    │    │
│   └────────────────────────────────────────┘    │
│                                                 │
│   FACETS ASSESSED (8 total)                     │
│   ┌────────────────────────────────────────┐    │
│   │  Basic differentiation          easy   │    │
│   │  Chain rule combination         good   │    │
│   │  Negative exponents             good   │    │
│   │  Definite integrals             good   │    │
│   │  + 4 more                              │    │
│   └────────────────────────────────────────┘    │
│                                                 │
│   TOPICS COVERED                                │
│   [pill] [pill] [pill] [pill]                   │
│                                                 │
│   WHAT'S NEXT                                   │
│   3 skills ready for review · Suggested:        │
│   Chain Rule (weakest in session)               │
│                                                 │
│   [ Export answers (.docx) ]                    │
│   [        Done            ]                    │
└────────────────────────────────────────────────┘
```

**Specification — New/Modified Sections:**

### 3a. Stats Row (Modified)

Add a third stat card: **"mastered"** — count of skills that hit mastery threshold during this session.

- Only show the third card if `masteryEvents.length > 0`
- If 0 mastery events, keep the existing two-card layout (duration + messages)
- Third card: `fontSize: 24`, `fontWeight: 700`, `color: T.gn` (green, distinct from the blue `T.ac` of other stats)

### 3b. Skills Mastered Section (New)

**Only rendered if `masteryEvents.length > 0`.**

- Section header: `"SKILLS MASTERED"`, `fontSize: 13`, `fontWeight: 600`, `color: T.gn`, `marginBottom: 10`
- Each mastery event card:
  - `background: T.gnS` (green surface), `border: 1px solid rgba(52,211,153,0.2)`, `borderRadius: 10`, `padding: 12px 16px`
  - Row: checkmark `✓` (`T.gn`), skill name (`T.tx`, `fontWeight: 600`), level change `Lv N→M` (`T.ac`, `fontSize: 12`, right-aligned)
  - Sub-line: `"[N]/[N] facets demonstrated"`, `fontSize: 11`, `color: T.txD`
- Multiple mastery events separated by `borderTop: 1px solid rgba(52,211,153,0.15)` within the same card container, not separate cards

### 3c. Skills Practiced Section (Modified)

**Rename from "Skills Practiced" to show only non-mastered skills that were practiced.** If all practiced skills mastered, omit this section entirely.

- Header: `"SKILLS PRACTICED"`, same styling as current
- Each row: same as current (name, rating, strength %)
- Skills that mastered are excluded (they appear in the section above)

### 3d. Facets Assessed Section (New)

**Shows all individual facets that received FSRS updates during the session.**

- Header: `"FACETS ASSESSED ([N] total)"`, `fontSize: 13`, `fontWeight: 600`, `color: T.tx`, `marginBottom: 10`
- List of facets: `fontSize: 12`, `color: T.txD`, rating on the right with rating color
- If > 5 facets, show first 5 with a `"+ [N] more"` expander that reveals the rest on click
- `background: T.sf`, `borderRadius: 10`, `padding: 10px 14px`

### 3e. What's Next Section (New)

**Provides forward momentum per research recommendation.**

- Header: `"WHAT'S NEXT"`, `fontSize: 13`, `fontWeight: 600`, `color: T.tx`, `marginBottom: 8`
- Content: `fontSize: 12`, `color: T.txD`, `lineHeight: 1.5`
- Logic:
  - If skills are due for review: `"[N] skills ready for review"`
  - If session had weak skills (hard/struggled): `"Suggested: [weakest skill name] (needs more practice)"`
  - If all strong: `"All practiced skills are in good shape. Next review in [N] days."`
- No action buttons here — just text guidance. The "Done" button takes them back to home where they can act on it.

### 3f. Sessions With Zero Mastery Events

When no mastery events occurred (the common case), the summary looks very similar to the current design:
- Stats: duration + messages (two cards, no third)
- Skills Practiced: unchanged
- Facets Assessed: shows facets if any were individually assessed, omitted if none
- Topics Covered: unchanged
- Breakthroughs: unchanged
- What's Next: unchanged
- DOCX export: unchanged

---

## 4. Profile Screen Integration

### Current State

ProfileScreen.jsx already shows facets in the sub-skill detail panel (lines 292-318), with mastery bars, retrievability percentages, and "DUE" tags. Parent skill cards show level badges with progress rings.

### Design: Minimal Enhancement

**Do NOT add "New" badges, animations, or special highlighting for recently-mastered skills.** Rationale:

1. The profile screen is a reference view, not a celebration view. Adding transient "new" indicators creates visual noise on a dense screen.
2. The mastery celebration already happened in-chat and in the session summary. Re-celebrating on the profile screen is the "over-celebrating" risk identified in the research.
3. The level number in the progress ring badge already reflects the mastery event — the student will see their level is higher than before.

**One small addition:** When a skill's level changed in the current app session (since the app was opened), show the previous level in parentheses:

```
  ┌──────────────────────────────────────────┐
  │  ⟲ [3]  Power Rule Application          │
  │         (was Lv 2)                        │
  │         12 skills · 8 reviewed            │
  │         ▓▓▓▓▓▓▓▓▓▓▓▓░░░░ 85%            │
  └──────────────────────────────────────────┘
```

- **"(was Lv 2)"**: `fontSize: 11`, `color: T.txM`, displayed below the skill name for one session only (cleared when the app restarts or profile data reloads)
- This is a subtle, informational indicator — not a celebration

**Facet mastery display:** Already exists in ProfileScreen (lines 292-318). The facet rows with retrievability bars will automatically reflect the new FSRS data written by the assessment pipeline. No additional UI work needed.

---

## 5. Consistency with Existing Patterns

### Pattern Mapping

| Existing Pattern | Extension for Facet Assessment |
|---|---|
| Skill pills below assistant messages (MessageList) | Enhanced pills with facet sub-rows when facet updates present |
| Notification system (`addNotif`) | New `"mastery"` type with green tint for mastery events |
| SessionSummary overlay | New "Skills Mastered" section, facets assessed list, "What's Next" guidance |
| ProfileScreen facet display | No change — already shows facet mastery data |
| Rating colors (easy/good = green, hard/struggled = amber) | Same colors applied to facet ratings |

### What Is NOT Changed

- Prose message rendering — unchanged
- Assistant message rendering — unchanged (renderMd still handles code blocks, lists, headers)
- Existing skill pills for skill-level-only updates — unchanged
- SessionSummary layout structure — extended, not replaced
- Notification panel — extended with new type, not restructured
- Profile screen layout — one small addition only

### New Components Required

1. **`FacetPills`** — renders enhanced skill+facet pills below assistant messages. Could be a section within MessageList or extracted as a sub-component. Receives parsed facet updates from `parseSkillUpdates`.

2. **`MasteryCard`** — inline card rendered in the chat flow when a mastery event fires. Receives a `MasteryEvent` object. Lives in `src/components/study/`.

3. **SessionSummary modifications** — no new component, but SessionSummary.jsx needs new sections for mastery events, facets assessed, and "What's Next".

---

## Component Data Requirements

### FacetPills (MessageList enhancement)

**Input:** Array of skill update objects, each optionally containing facet-level updates:
```
{
  skillId: "concept-key",
  skillName: "Power Rule Application",  // resolved from skills array
  rating: "good",
  facets: [                              // optional — absent for skill-level-only updates
    { facetId: "facet-key", name: "Basic differentiation", rating: "easy", isNew: true },
    { facetId: "facet-key-2", name: "Chain rule combination", rating: "good", isNew: false },
  ]
}
```

**Behavior:**
- If `facets` array is absent or empty: render current skill pill (unchanged)
- If `facets` array has 1 item: render minimal single-facet pill
- If `facets` array has 2+ items: render expanded skill card with facet sub-rows

### MasteryCard (new component)

**Input:** `MasteryEvent` object from `applySkillUpdates`:
```
{
  skillId: "...",
  skillName: "Power Rule Application",
  facets: [
    { id: "...", name: "Basic differentiation", rating: "easy" },
    { id: "...", name: "Chain rule combination", rating: "good" },
    { id: "...", name: "Negative exponents", rating: "good" },
  ],
  levelBefore: 2,
  levelAfter: 3,
  nextReviewDays: 3,
}
```

**Placement:** Injected into the message list after the assistant message that triggered the mastery event. This requires the mastery event to be associated with a message index or timestamp so MessageList knows where to render it.

**Implementation approach:** Store mastery events in a session-level array (e.g., `sessionMasteryEvents` ref). Each event includes the message index it occurred after. MessageList checks this array while rendering and inserts `MasteryCard` components at the appropriate positions.

### SessionSummary (enhanced)

**Additional input:** `sessionSummary` object needs new fields:
```
{
  ...existing fields,
  masteryEvents: [MasteryEvent, ...],   // all mastery events from the session
  facetsAssessed: [                      // all facet-level updates from the session
    { facetName: "Basic differentiation", skillName: "Power Rule", rating: "easy" },
    ...
  ],
  nextSuggestion: {                      // computed from session data
    dueCount: 3,
    weakestSkill: "Chain Rule",
    nextReviewDays: 2,
  },
}
```

---

## Color & Style Reference

All colors from existing `T.*` palette — no new colors introduced.

| Element | Color | Source |
|---|---|---|
| Mastery card border | `T.gn` (#34D399) | Green = positive achievement |
| Mastery section header | `T.gn` | Consistent with "Breakthroughs" section |
| Mastery section background | `T.gnS` (rgba(52,211,153,0.1)) | Existing green surface |
| Facet rating: easy/good | `T.gn` | Existing rating color |
| Facet rating: hard/struggled | `T.am` (#FBBF24) | Existing rating color |
| Facet name text | `T.txD` (#8B95A5) | Secondary text |
| Skill name text | `T.tx` (#E8EAF0) | Primary text |
| Level numbers | `T.ac` (#6C9CFC) | Consistent with profile screen |
| "Next review" text | `T.txM` (#64748B) | Muted — informational, not warning |
| Mini dots (filled) | Rating color | Matches dot to rating |
| Mini dots (unfilled) | `T.bd` (#2A2F3A) | Border/background color |

---

## Interaction Flow Summary

```
Student is in a study session, chatting with AI tutor
│
├─ AI assesses a single facet mid-conversation
│  └─ Minimal facet pill appears below assistant message (subtle)
│
├─ AI assesses multiple facets in one response
│  └─ Expanded skill+facet card appears below assistant message
│
├─ All facets of a skill cross mastery threshold
│  ├─ MasteryCard appears inline in chat (green border, level change, facet list)
│  ├─ Notification generated: "Power Rule Application → Lv 3"
│  └─ Student continues chatting (no interruption)
│
├─ Student ends session (clicks End Session)
│  └─ SessionSummary overlay appears:
│     ├─ Stats: duration, messages, skills mastered (if any)
│     ├─ Skills Mastered section (if any)
│     ├─ Skills Practiced section (non-mastered)
│     ├─ Facets Assessed section
│     ├─ Topics Covered
│     ├─ What's Next guidance
│     └─ Done button → returns to home
│
└─ Student visits Profile screen
   └─ Level badges reflect new levels
      └─ "(was Lv 2)" shown for recently-changed skills
```

---

## Aesthetic Decisions (Flagged to CEO)

The following decisions have aesthetic implications and are flagged per specialist authority boundaries:

1. **Green border on MasteryCard** — using `T.gn` as the card border is the only special visual treatment for mastery events. This is subtle but distinct. CEO may prefer a different accent approach (e.g., left border only, background tint, or no special border).

2. **Mini dots for facet ratings** — the 5-dot rating indicator is a new visual pattern not used elsewhere in the app. CEO may prefer a different representation (small bar, text only, or no granularity indicator).

3. **"(was Lv 2)" on profile screen** — this is very minimal. CEO may want more or less emphasis on recent level changes.

4. **No confetti, no animation beyond fadeIn** — per research, celebrations are subdued. CEO may feel this undershoots and want slightly more visual emphasis (e.g., a brief green glow on the card border, or a 0.3s scale-up animation).

---

## Output Receipt
**Agent:** Study UX Designer
**Step:** Step 2
**Status:** Complete

### What Was Done
Designed the complete facet-level mastery assessment UX across four touchpoints: in-chat facet pills, inline mastery celebration card, enhanced session-end summary, and minimal profile screen integration. All designs extend existing patterns (skill pills, SessionSummary overlay, notification system) rather than introducing new paradigms. Designs are grounded in Step 1 research findings on celebration calibration, decay communication, and assessment framing.

### Files Deposited
- `study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md` — Complete UX design document with specifications, data requirements, interaction flows, and color references

### Files Created or Modified (Code)
- None (design only)

### Decisions Made
- **Inline card over modal** for mastery celebration (within specialist authority — interaction pattern selection grounded in research)
- **Enhanced pills over progress bar/checklist** for in-chat assessment (within authority — avoids exam-like pressure per research)
- **No profile screen "New" badges or animations** (within authority — avoids over-celebrating per research)
- **Extend SessionSummary overlay rather than creating new screen** (within authority — consistency with existing patterns)
- **Three new data structures** defined: FacetPills input, MasteryEvent, enhanced sessionSummary

### Flags for CEO
- **Green border on MasteryCard** — aesthetic decision: is `T.gn` border sufficient visual weight for a mastery event?
- **Mini dots rating indicator** — new visual pattern: approve 5-dot system or prefer alternative?
- **Profile screen "(was Lv 2)" text** — minimal approach: want more or less emphasis?
- **Celebration subdued by design** — per research, no confetti/animation/sound. CEO may want slightly more visual emphasis if this feels too understated in practice.

### Flags for Next Step
- **For Step 3 (Architecture):** MasteryEvent data structure defined — `{ skillId, skillName, facets: [{ id, name, rating }], levelBefore, levelAfter, nextReviewDays }`. The pipeline must produce this shape. MasteryCards need to be associated with a message index for placement in the chat flow. SessionSummary needs `masteryEvents`, `facetsAssessed`, and `nextSuggestion` fields added to the summary object.
- **For Step 3:** Facet pills require the parser to return facet-level updates with `facetId`, `name`, `rating`, and `isNew` (whether this is the first assessment of the facet). The `isNew` flag determines whether to show "NEW" tag vs. dots.
- **For Step 6 (UI Dev):** New components needed: `FacetPills` (or inline in MessageList), `MasteryCard`. SessionSummary.jsx modifications are additive. No new screens or modals.
