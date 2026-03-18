# Architecture Blueprint: Skill Update Notification
**Date:** 2026-03-17
**UX Spec:** `knowledge/design/skill-update-notification-ux-2026-03-17.md`
**Status:** Ready for implementation

---

## Overview
Three changes: (1) fix raw `[SKILL_UPDATE]` tag flash during streaming, (2) add transient fade-in/fade-out skill notification in InputBar, (3) remove static context label from InputBar.

## Files to Modify

| File | Changes |
|---|---|
| `src/lib/theme.jsx` | Add streaming-safe tag stripping to `renderMd()` |
| `src/StudyContext.jsx` | Add `skillNotifQueue` ref, `currentSkillNotif` state, queue-processing `useEffect`, enqueue in `sendMessage()`, clear on new message send, export via context |
| `src/components/study/InputBar.jsx` | Remove static context label (lines 29-41), add notification container consuming `currentSkillNotif` |

## Files NOT Modified
- `src/components/study/MessageList.jsx` — pills kept unchanged as archival record
- `src/ScreenRouter.jsx` — no changes needed

---

## 1. Streaming Fix — `renderMd()` in `theme.jsx`

**Problem:** Line 55 regex `/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g` requires both tags. During streaming, partial `[SKILL_UPDATE]...` text renders visibly.

**Fix:** Add 4 additional regex passes after the existing 2:

```js
const clean = text
  .replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "")   // existing
  .replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "") // existing
  .replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")     // incomplete SKILL_UPDATE (no closing tag)
  .replace(/\[SKILL_UPDA[\s\S]*$/g, "")         // partial opening tag still arriving
  .replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")  // incomplete UNLOCK_QUESTION
  .replace(/\[UNLOCK_QU[\s\S]*$/g, "")          // partial UNLOCK_QUESTION tag
  .trim();
```

No false positives: `[SKILL_UPDA` and `[UNLOCK_QU` don't occur in natural prose.

## 2. New State in StudyContext

### State + Ref (add after `bgExtraction` state, line 118)
```js
const [currentSkillNotif, setCurrentSkillNotif] = useState(null);
```

### Ref (add after `extractionCancelledRef`, line 133)
```js
const skillNotifQueue = useRef([]);
```

### Queue Processing Effect
```js
useEffect(() => {
  if (!currentSkillNotif && skillNotifQueue.current.length > 0) {
    const next = skillNotifQueue.current.shift();
    setCurrentSkillNotif({ ...next, phase: "in" });
    const holdTimer = setTimeout(() => {
      setCurrentSkillNotif(prev => prev ? { ...prev, phase: "out" } : null);
    }, 2300);
    const clearTimer = setTimeout(() => {
      setCurrentSkillNotif(null);
    }, 2600);
    return () => { clearTimeout(holdTimer); clearTimeout(clearTimer); };
  }
}, [currentSkillNotif]);
```

Place after the existing `lockElapsed` timer effect, before any handler functions.

### Notification Data Shape
```js
{ skillName: string, skillId: string, rating: string, facetCount: number, phase: "in"|"out" }
```

## 3. Enqueue Logic in `sendMessage()`

After `parseSkillUpdates(response)` returns results (line 1144), after the existing notification loop (line 1176), add:

```js
// Enqueue InputBar skill notifications (max 3)
const formatKey = (k) => k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const notifItems = updates.slice(0, 3).map(u => {
  const allSk = cachedSessionCtx.current?.skills || [];
  const sk = allSk.find(s => s.id === u.skillId || s.conceptKey === u.skillId);
  return { skillName: sk?.name || formatKey(u.skillId), skillId: u.skillId, rating: u.rating, facetCount: u.facets?.length || 0 };
});
skillNotifQueue.current = notifItems;
setCurrentSkillNotif(null); // triggers effect to start processing
```

### Clear on New Message Send
At the start of `sendMessage()`, before processing the user message:
```js
skillNotifQueue.current = [];
setCurrentSkillNotif(null);
```

## 4. InputBar Changes

### Remove
Lines 29-41: the `{(focusContext || sessionMode) && ( ... )}` block (static context label).

### Add — Notification Container
Before the text input row, render:
```jsx
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
      transform: currentSkillNotif.phase === "in" ? "translateY(0)" : "translateY(-2px)",
      transition: "opacity 300ms ease, transform 300ms ease",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ratingColor, flexShrink: 0 }} />
      <span style={{ color: T.tx, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentSkillNotif.skillName}</span>
      <span style={{ color: T.txM }}>·</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: ratingColor }}>{currentSkillNotif.rating}</span>
    </div>
  </div>
)}
```

Where `ratingColor` is a local map: `{ easy: T.gn, good: T.gn, hard: T.am, struggled: T.am }`.

### New Context Destructuring
Add `currentSkillNotif` to InputBar's `useStudy()` destructuring.

## 5. Context Value Export

Add to `useMemo` return object:
```js
currentSkillNotif,
```

Add to `useMemo` deps array:
```js
currentSkillNotif,
```

## Edge Cases
- **No updates in response**: Context bar stays hidden (currentSkillNotif = null)
- **New message during queue**: Queue cleared at start of sendMessage
- **Practice mode**: InputBar returns null — no notification renders
- **4+ skills**: Capped at 3 notifications
- **Long skill name**: Truncated at 200px with ellipsis
- **Unknown rating**: Falls back to T.ac via `|| T.ac`
