# Skill Update Notification — Development Log
**Date:** 2026-03-17
**Blueprint:** `knowledge/architecture/skill-update-notification-2026-03-17.md`
**UX Spec:** `knowledge/design/skill-update-notification-ux-2026-03-17.md`
**Build:** Verified clean (`npm run build` — 0 errors)

---

## Files Modified

### `src/lib/theme.jsx`
- **Updated `renderMd()`** (line 55): Added 4 streaming-safe regex passes after the existing 2:
  - `.replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")` — strips incomplete SKILL_UPDATE (no closing tag yet)
  - `.replace(/\[SKILL_UPDA[\s\S]*$/g, "")` — strips partial opening tag mid-stream
  - `.replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")` — strips incomplete UNLOCK_QUESTION
  - `.replace(/\[UNLOCK_QU[\s\S]*$/g, "")` — strips partial UNLOCK_QUESTION tag
- Eliminates raw `[SKILL_UPDATE]...` text flash during streaming

### `src/StudyContext.jsx`
- **Added `currentSkillNotif` state** (line 119): `useState(null)` — tracks currently displaying notification
- **Added `skillNotifQueue` ref** (line 135): `useRef([])` — holds pending notification items
- **Added queue-processing `useEffect`** (lines 251-262):
  - When `currentSkillNotif` is null and queue has items, pops next item
  - Sets phase `"in"` (fade-in), after 2300ms sets phase `"out"` (fade-out), after 2600ms clears (triggers next)
  - Cleanup returns clear both timers
- **Enqueue logic in `sendMessage()`** (after line ~1195):
  - After `parseSkillUpdates()` returns, maps up to 3 updates to `{ skillName, skillId, rating, facetCount }` objects
  - Resolves display name via `cachedSessionCtx.current.skills` lookup, falls back to `formatKey()`
  - Sets `skillNotifQueue.current = notifItems` and `setCurrentSkillNotif(null)` to trigger effect
- **Clear on new message** (at start of `sendMessage()`):
  - `skillNotifQueue.current = []; setCurrentSkillNotif(null);` — prevents stale notifications overlapping new response
- **Context value**: Added `currentSkillNotif` to exported value + useMemo deps

### `src/components/study/InputBar.jsx`
- **Removed static context label** (old lines 29-41): The `{(focusContext || sessionMode) && (...)}` block with HW/SK/XM badge + text
- **Removed unused destructured vars**: `focusContext, sessionMode` removed from `useStudy()` call
- **Added `currentSkillNotif`** to `useStudy()` destructuring
- **Added notification container** (new lines 33-58):
  - `maxHeight: 32` container with `transition: max-height 200ms ease`
  - Inner row: status dot (color-coded by rating), skill name (truncated at 200px), middle dot separator, rating label
  - `opacity` and `transform` driven by `currentSkillNotif.phase`: `"in"` → visible, `"out"` → faded
  - `role="status" aria-live="polite"` for screen reader accessibility
- **Added `ratingColor` map** at module level: `{ easy: T.gn, good: T.gn, hard: T.am, struggled: T.am }`

## Files NOT Modified
- `src/components/study/MessageList.jsx` — pills kept as-is for archival record
- `src/ScreenRouter.jsx` — no changes needed

## Key Design Decisions
1. Notifications are per-skill (not per-facet) — uses top-level `rating` from `parseSkillUpdates()`
2. Max 3 notifications per response to avoid notification fatigue
3. Queue cleared when user sends new message — prevents stale notifications from overlapping
4. `ratingColor` duplicated between InputBar and MessageList (both small inline maps, no need for shared utility)
5. Static context label permanently removed — users already know their selected focus
6. `currentSkillNotif` is null when no notification active — container fully hidden (conditional render)
