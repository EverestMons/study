# Batch D — Session Data Path Replacement (Chat, Journal)
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (1.31s) — both steps verified

---

## Summary

Replaced all V1 compat chat and journal calls in `src/StudyContext.jsx` with v2 module equivalents. Chat persistence switched from destructive full-rewrite to incremental append. Journal persistence switched from clear-and-rewrite to single insert.

---

## Steps

### D.1 — Replace DB.saveChat / DB.getChat

**Behavioral change:** Destructive full-rewrite → incremental append.

| Location | Before | After |
|----------|--------|-------|
| Import | — | Added `Sessions, Messages` |
| Ref (line 125) | — | `chatSessionId = useRef(null)` |
| `enterStudy` | `DB.getChat(cid)` → archive → `DB.saveChat(cid, [])` | `Sessions.getOrCreateCompat(cid)` → `Messages.getBySession(sid)` → parse metadata → archive → `Sessions.end(sid)` → `Sessions.create(...)` → store in ref |
| `bootWithFocus` | `DB.saveChat(cid, [user, asst])` | `Messages.appendBatch(ref, [user, asst])` |
| `sendMessage` | `DB.saveChat(cid, finalMsgs.slice(-100))` | `Messages.appendBatch(ref, [user, asst])` — only 2 new messages |
| `saveSessionToJournal` | `DB.saveChat(cid, msgs.slice(-100))` | Removed — messages already persisted incrementally |

**Key details:**
- `chatSessionId` ref avoids re-resolving session on every save
- `enterStudy` ends the old session and creates a fresh one each time — clean session lifecycle
- `sendMessage` captures `inputMode: 'code'` for code-mode messages
- No more 100-message truncation — all messages persisted (v2 approach)

### D.2 — Replace DB.saveJournal / DB.getJournal

**Behavioral change:** Clear-and-rewrite → append-only.

| Location | Before | After |
|----------|--------|-------|
| Import | — | Added `JournalEntries` |
| `saveSessionToJournal` | `DB.getJournal` → push → `DB.saveJournal(cid, journal.slice(-50))` | `JournalEntries.create({ sessionId, courseId, intent: 'v1_compat', entryData: entry })` |
| `enterStudy` archive | Same load-push-rewrite pattern | Same single `JournalEntries.create(...)` append |
| `bootWithFocus` (read) | `DB.getJournal(active.id)` → parsed entries | `JournalEntries.getByCourse(active.id)` → reverse → parse `entry_data` JSON |
| `sendMessage` (read) | `DB.getJournal(active.id)` → parsed entries | Same reverse + parse pattern |

**Key details:**
- `JournalEntries.getByCourse` returns `ORDER BY created_at DESC`; old `DB.getJournal` returned `ORDER BY id ASC`. Applied `.reverse()` so `formatJournal`'s `.slice(-10)` still gets the most recent entries.
- No more 50-entry truncation — all entries preserved (v2 approach). `formatJournal` already limits display to last 10.
- Both save sites (saveSessionToJournal, enterStudy archive) now use `chatSessionId.current` or `oldSid` as the session reference.

---

## V1 Methods Eliminated from Application Code

| V1 Method | Replacement | Call sites removed |
|---|---|:--:|
| `DB.getChat(cid)` | `Sessions.getOrCreateCompat` + `Messages.getBySession` | 1 |
| `DB.saveChat(cid, msgs)` | `Messages.appendBatch(sid, newMsgs)` | 4 (1 removed entirely) |
| `DB.getJournal(cid)` | `JournalEntries.getByCourse(cid)` + parse | 4 |
| `DB.saveJournal(cid, entries)` | `JournalEntries.create(...)` | 2 |

**Total:** 11 call sites replaced/removed.

---

## File Modified

| File | Lines changed |
|------|:--:|
| `src/StudyContext.jsx` | ~25 (import, ref, 5 call site replacements, 1 removal) |
