# UX Design Spec: Skill Update Notification System
**Date:** 2026-03-17
**Project:** study
**Status:** Planned

---

## Overview
Relocate skill update notifications from inline message pills to a transient fade-in/fade-out animation in the InputBar context bar area. Simultaneously fix the raw `[SKILL_UPDATE]` tag text flash that occurs during streaming, and remove the static assignment/skill context label from the input bar.

## CEO Decisions (locked)
1. **Skill update notifications move to input bar area** — progress shown as fade-in/fade-out animation in the context bar above the text input, replacing the current assignment/skill label temporarily.
2. **Remove assignment context label from input bar** — the `[HW] Assignment: Homework 7...` / `[SK] Skill: ...` label is permanently removed. The context bar space is used exclusively for transient skill update notifications.

## Current State

### What exists today
- **`InputBar.jsx` lines 29-41** — "Mode context bar" renders a persistent label showing focus type badge (`HW`/`SK`/`XM`) and context text (assignment title, skill name, etc.) based on `focusContext` from `useStudy()`.
- **`MessageList.jsx` lines 73-123** — After each assistant message renders, `parseSkillUpdates(m.content)` extracts skill pill data. Pills render inline below the message with color-coded badges (green for easy/good, amber for hard/struggled), dot indicators for facet ratings, and tree-structure layouts for multi-facet updates.
- **`theme.jsx` line 55** — `renderMd()` strips `[SKILL_UPDATE]...[/SKILL_UPDATE]` via regex: `/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g`. This only matches when BOTH opening and closing tags are present. During streaming, partial text like `[SKILL_UPDATE]skill: good` appears because the closing tag has not arrived yet.
- **`StudyContext.jsx` lines 1056-1095** — After streaming completes, `parseSkillUpdates(response)` extracts updates, `applySkillUpdates()` persists them to DB, mastery events are generated, and `addNotif()` fires toast notifications.

### Problems
1. **Raw tag flash** — During streaming, partial `[SKILL_UPDATE` text is visible to the user for 1-3 seconds before the closing tag arrives and `renderMd()` can strip it.
2. **Notification placement** — Skill update pills are buried inline in the chat, below potentially long AI responses. Users may not scroll down to see them.
3. **Context bar clutter** — The static `[HW] Assignment: Homework 7...` label provides information the user already knows (they selected the focus themselves). It occupies space that could serve a more dynamic purpose.

---

## Design Direction

### 1. Context Bar Removal

**Remove the static context label entirely** from `InputBar.jsx` (lines 29-41). The `focusContext` and `sessionMode` conditional block is deleted. The context bar area becomes an empty container that is only visible when a skill update notification is animating.

```
Before:  [HW] Assignment: Homework 7 — Chapter 3 Review
After:   (empty / hidden — no static label)
```

### 2. Skill Update Notification — Visual Design

When skill updates arrive after an AI response completes, a transient notification fades into the context bar area above the text input.

#### Layout
```
+----------------------------------------------------------------+
|  [dot] Quadratic Formula  ·  good                    (fade-in) |
+----------------------------------------------------------------+
| [text input area]                                    [</>] [->] |
+----------------------------------------------------------------+
```

#### Element Specification

| Element | Spec |
|---|---|
| **Container** | `height: 24px`, `overflow: hidden`, `maxWidth: 640px`, `margin: 0 auto`, `marginBottom: 8px` |
| **Inner row** | `display: flex`, `alignItems: center`, `gap: 8px`, `fontSize: 12`, `fontWeight: 500` |
| **Status dot** | `width: 6px`, `height: 6px`, `borderRadius: 50%`, color-coded by rating |
| **Skill name** | `color: T.tx` (#E8EAF0), `fontSize: 12`, truncated with ellipsis at 200px max-width |
| **Separator** | Middle dot `·`, `color: T.txM` (#64748B) |
| **Rating label** | `fontSize: 11`, `fontWeight: 600`, color-coded by rating, lowercase |

#### Color Coding

| Rating | Dot + Label Color | Semantic |
|---|---|---|
| `easy` | `T.gn` (#34D399) | Strong mastery |
| `good` | `T.gn` (#34D399) | Solid understanding |
| `hard` | `T.am` (#FBBF24) | Needs more practice |
| `struggled` | `T.am` (#FBBF24) | Significant difficulty |

These colors match the existing `ratingColor` mapping in `MessageList.jsx` line 16.

#### Animation Timing

| Phase | Duration | CSS Property |
|---|---|---|
| **Fade in** | 300ms | `opacity: 0 -> 1`, `transform: translateY(4px) -> translateY(0)` |
| **Hold** | 2000ms | Fully visible |
| **Fade out** | 300ms | `opacity: 1 -> 0`, `transform: translateY(0) -> translateY(-2px)` |
| **Total per notification** | 2600ms | |

Use CSS `transition: opacity 300ms ease, transform 300ms ease` driven by a state variable toggling an `opacity`/`transform` style. The container uses `visibility: hidden` + `height: 0` when no notification is active, collapsing to zero height so it does not consume vertical space.

### 3. Multiple Updates — Sequential Queue

When a single AI response contains multiple skill updates (common: 2-5 facet-level updates grouped under 1-2 skills), the notifications display sequentially:

#### Strategy: Skill-Level Summary (not per-facet)

Show one notification per **skill** (not per facet). `parseSkillUpdates()` already groups facets under their parent skill with a top-level `rating`. This is the value shown in the notification.

Example: If the AI reports:
```
[SKILL_UPDATE]
quadratic-formula: good
  factoring: good
  completing-the-square: hard
  discriminant: easy
linear-systems: good
  substitution: good
  elimination: good
[/SKILL_UPDATE]
```

The notification queue is:
1. `Quadratic Formula · good` (2.6s)
2. `Linear Systems · good` (2.6s)

#### Queue Behavior

- Notifications are enqueued when `parseSkillUpdates()` returns results in `sendMessage()` (StudyContext line 1061).
- A `skillNotifQueue` ref holds pending notifications. A `currentSkillNotif` state variable holds the currently displaying one.
- A `useEffect` processes the queue: pop first item, set it as current (triggers fade-in), wait 2600ms, clear current (triggers fade-out), wait 300ms (fade-out completes), then process next item.
- If the user sends a new message while notifications are still queued, the queue is cleared — new response takes priority.

#### Timing for N updates

| Updates | Total notification time |
|---|---|
| 1 skill | 2.6s |
| 2 skills | 5.5s (2.6 + 0.3 gap + 2.6) |
| 3 skills | 8.4s |
| 4+ skills | Show first 3, skip remainder (avoid fatigue) |

The 300ms gap between notifications is the fade-out duration of the previous one — the next notification fades in as the previous finishes fading out, creating a smooth crossfade feel without overlap.

### 4. Inline Pills in MessageList — Retained as Secondary Record

The existing pill rendering in `MessageList.jsx` (lines 73-123) is **kept unchanged**. Pills serve as a permanent historical record in the chat scrollback. The InputBar notification is the primary real-time feedback; pills are the archival reference.

No visual changes to pills. They continue to render with `ratingColor`, `ratingBg`, dot indicators, and tree-structure layouts for multi-facet updates.

### 5. Raw Tag Flash Fix — Streaming Suppression

#### Problem
`renderMd()` in `theme.jsx` (line 55) uses this regex:
```js
/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g
```
This requires both opening and closing tags. During streaming, only the opening tag and partial content arrive first, so the regex does not match, and raw text like `[SKILL_UPDATE]quadratic-formula: good` renders visibly.

#### Solution: Eager Prefix Stripping

Add a **second** regex pass in `renderMd()` that strips any text starting with `[SKILL_UPDATE` through the end of the string, even without a closing tag:

```js
// Existing: strip complete tag pairs
.replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "")
// New: strip incomplete/streaming tag (no closing tag yet)
.replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")
// Also strip if the opening tag itself is still arriving character by character
.replace(/\[SKILL_UPDA[\s\S]*$/g, "")
```

The third regex handles the edge case where the opening tag itself is mid-stream (e.g., `[SKILL_UPDA` has arrived but `TE]` has not).

Similarly, apply the same pattern for `[UNLOCK_QUESTION]`:
```js
.replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")
.replace(/\[UNLOCK_QU[\s\S]*$/g, "")
```

#### Why not buffering?
A buffering approach (hold back text if the last line starts with `[`) would delay rendering of legitimate content that starts with `[` (e.g., citations, markdown links). The eager stripping approach is simpler, has no false positives for natural text (the prefix `[SKILL_UPDA` does not occur in normal prose), and requires only a change to `renderMd()` — no changes to the streaming callback.

#### Complete updated `renderMd` first line:
```js
const clean = text
  .replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "")
  .replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "")
  .replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")
  .replace(/\[SKILL_UPDA[\s\S]*$/g, "")
  .replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")
  .replace(/\[UNLOCK_QU[\s\S]*$/g, "")
  .trim();
```

### 6. Context Bar Behavior — State Machine

```
State: HIDDEN (default)
  -> Container has height: 0, visibility: hidden, no content
  -> No space consumed above text input

Trigger: sendMessage() completes, parseSkillUpdates() returns updates
  -> Enqueue notifications
  -> Transition to ANIMATING

State: ANIMATING
  -> Container expands to height: 24px
  -> Current notification fades in (300ms)
  -> Holds for 2000ms
  -> Fades out (300ms)
  -> If queue has more items: next notification fades in
  -> If queue is empty: transition to HIDDEN

State: HIDDEN
  -> Container collapses back to height: 0
```

The container height transition should use `max-height: 0` / `max-height: 32px` with `transition: max-height 200ms ease` to smoothly expand/collapse rather than popping in.

---

## Implementation Plan

### Files to Modify

| File | Changes |
|---|---|
| **`src/lib/theme.jsx`** | Update `renderMd()` — add streaming-safe tag stripping (section 5) |
| **`src/components/study/InputBar.jsx`** | Remove static context label (lines 29-41). Add notification container with fade animation. Consume new `skillNotif` state from `useStudy()` |
| **`src/StudyContext.jsx`** | Add `skillNotifQueue` ref, `currentSkillNotif` state, queue processing `useEffect`. Enqueue notifications in `sendMessage()` after `parseSkillUpdates()` returns. Expose `currentSkillNotif` via context |

### New State in StudyContext

```js
// Ref: queue of pending notifications
const skillNotifQueue = useRef([]);

// State: currently displaying notification (or null)
const [currentSkillNotif, setCurrentSkillNotif] = useState(null);

// Effect: process queue
useEffect(() => {
  if (!currentSkillNotif && skillNotifQueue.current.length > 0) {
    const next = skillNotifQueue.current.shift();
    setCurrentSkillNotif({ ...next, phase: "in" }); // triggers fade-in

    const holdTimer = setTimeout(() => {
      setCurrentSkillNotif(prev => prev ? { ...prev, phase: "out" } : null); // triggers fade-out
    }, 2300); // 300ms fade-in + 2000ms hold

    const clearTimer = setTimeout(() => {
      setCurrentSkillNotif(null); // triggers next queue item via this effect re-running
    }, 2600); // + 300ms fade-out

    return () => { clearTimeout(holdTimer); clearTimeout(clearTimer); };
  }
}, [currentSkillNotif]);
```

### Notification Data Shape
```js
{
  skillName: "Quadratic Formula",   // resolved display name
  skillId: "quadratic-formula",     // raw ID from parseSkillUpdates
  rating: "good",                   // overall skill rating
  facetCount: 3,                    // number of facets (informational)
  phase: "in" | "out"              // animation phase (set by effect)
}
```

### InputBar Notification Rendering
```jsx
{/* Skill update notification — transient */}
{currentSkillNotif && (
  <div style={{
    maxHeight: 32, overflow: "hidden",
    transition: "max-height 200ms ease",
    marginBottom: 8,
  }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 12, fontWeight: 500,
      opacity: currentSkillNotif.phase === "in" ? 1 : 0,
      transform: currentSkillNotif.phase === "in"
        ? "translateY(0)" : "translateY(-2px)",
      transition: "opacity 300ms ease, transform 300ms ease",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: ratingColor[currentSkillNotif.rating] || T.ac,
        flexShrink: 0,
      }} />
      <span style={{ color: T.tx, maxWidth: 200, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {currentSkillNotif.skillName}
      </span>
      <span style={{ color: T.txM }}>·</span>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: ratingColor[currentSkillNotif.rating] || T.ac,
      }}>
        {currentSkillNotif.rating}
      </span>
    </div>
  </div>
)}
```

Where `ratingColor` is defined locally (same as MessageList):
```js
const ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };
```

### Enqueue Logic in sendMessage()

In `StudyContext.jsx`, after `parseSkillUpdates(response)` returns (line 1061), before or alongside the existing `addNotif()` calls (lines 1091-1094):

```js
// Enqueue InputBar skill notifications (max 3)
const notifUpdates = updates.slice(0, 3).map(u => {
  const sk = skills.find(s => s.id === u.skillId || s.conceptKey === u.skillId);
  return {
    skillName: sk?.name || formatKey(u.skillId),
    skillId: u.skillId,
    rating: u.rating,
    facetCount: u.facets?.length || 0,
  };
});
skillNotifQueue.current = notifUpdates;
setCurrentSkillNotif(null); // trigger effect to start processing
```

The `formatKey` helper (capitalize hyphenated words) should be extracted to a shared utility or duplicated since it currently only exists in `MessageList.jsx`.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| **No skill updates in response** | Context bar stays hidden. No notification. |
| **User sends new message while notifications queued** | Clear queue: `skillNotifQueue.current = []; setCurrentSkillNotif(null);` — prevents stale notifications from overlapping with new response. |
| **Mastery event (level-up)** | Mastery events already have their own celebration card in MessageList (lines 124-139) and toast via `addNotif("mastery", ...)`. The InputBar notification shows the regular skill rating; the mastery card is the primary celebration. No special handling needed. |
| **Practice mode active** | `InputBar` returns `null` when `practiceMode` is true (line 15). No notification renders. This is acceptable — practice mode has its own progress tracking UI. |
| **No messages yet** | `InputBar` returns `null` when `msgs.length === 0` (line 15). No notification renders. Correct — no skill updates possible without messages. |
| **Very long skill name** | Truncated with ellipsis at `maxWidth: 200px`. |
| **Unknown rating value** | Falls back to `T.ac` (blue accent) via `ratingColor[rating] || T.ac`. |

## Accessibility

- The notification container should have `role="status"` and `aria-live="polite"` so screen readers announce skill updates without interrupting the user.
- The fade animation uses `transform` and `opacity` only — no layout-thrashing properties. Respects `prefers-reduced-motion` by checking `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and setting transitions to `0ms` if true.

## Assumptions

- The typical AI response contains 0-3 skill updates. More than 3 is rare and capped.
- Users benefit more from a brief celebratory flash than from persistent static labels they already know.
- The existing toast notification system (`addNotif`) continues to fire alongside the InputBar animation. The toast notifications may be removed in a future iteration once the InputBar notification proves sufficient, but that is out of scope for this spec.
- `parseSkillUpdates()` data shape is stable and does not need modification.
