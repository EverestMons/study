# Batch D — Session Data Path Testing
**Date:** 2026-03-08
**Role:** Study Security & Testing Analyst
**Scope:** Steps D.1–D.2 (DB.getChat, DB.saveChat, DB.getJournal, DB.saveJournal)
**Method:** Static trace analysis — code path tracing through all modified call sites

---

## Verdict: PASS — 0 Critical, 1 Medium, 1 Low, 1 Informational

---

## Test Scenarios

### T1 — Chat persistence: Send messages, close app, reopen — messages are there

**Trace (send):**
1. `enterStudy(course)` (line 592): `Sessions.getOrCreateCompat(course.id)` → finds/creates active session → `Sessions.end(oldSid)` → `Sessions.create({courseId, intent: 'explore'})` → stores in `chatSessionId.current`
2. `bootWithFocus` (line 875): After AI response → `Messages.appendBatch(chatSessionId.current, [{role: "user", content}, {role: "assistant", content}])` → INSERT into messages table
3. `sendMessage` (line 959): After AI response → `Messages.appendBatch(chatSessionId.current, [{role: "user", content, inputMode}, {role: "assistant", content}])` → INSERT into messages table

**Trace (close/reopen):**
4. App closes → `beforeunload` fires → `saveSessionToJournal()` (line 317) → creates journal entry if messages exist. Messages already persisted incrementally — no additional chat save needed.
5. App reopens → `enterStudy(course)` again → `Sessions.getOrCreateCompat(course.id)` → finds the active session created in step 1 → `Messages.getBySession(sid)` → loads all messages → archives to journal → ends session → creates fresh session

**Issue found — see F1:** Messages are loaded in `enterStudy` only for journal archiving. They are NOT restored into `setMsgs()` for the UI. The UI always starts with `setMsgs([])` (line 582). This matches the OLD behavior — `DB.getChat` was also only used for archiving, then `DB.saveChat(course.id, [])` cleared them. The user always starts a fresh chat. **Not a regression.**

**Result:** PASS — messages persist in DB. UI intentionally starts fresh each session (same as before).

### T2 — Chat across course switches: Switch course A → B → A — correct messages per course

**Trace:**
1. `enterStudy(courseA)` → `Sessions.getOrCreateCompat(courseA.id)` → session for course A
2. Chat with course A → messages appended to session A
3. Navigate away (no explicit exit handler — visibility change may trigger `saveSessionToJournal`)
4. `enterStudy(courseB)` → `Sessions.getOrCreateCompat(courseB.id)` → session for course B. Different `course_id` → different session. `chatSessionId.current` now points to course B's session.
5. Chat with course B → messages appended to session B
6. `enterStudy(courseA)` → `Sessions.getOrCreateCompat(courseA.id)` → finds course A's active session (or the new one created after archiving) → loads course A's messages for archiving

**Isolation check:** `Sessions.getOrCreateCompat` queries `WHERE course_id = ? AND status = 'active'`. Each course gets its own session. Messages are FK'd to session_id. No cross-contamination possible.

**Subtle issue:** When switching from A to B (step 4), the old session for course A is ended (`Sessions.end(oldSid)`) and a new one is created. But `chatSessionId.current` is immediately overwritten to course B's session. The empty session for course A exists but has no messages — harmless.

**Result:** PASS

### T3 — Journal accumulation: Two sessions → both journal entries exist

**Trace (session 1):**
1. `enterStudy(course)` → creates session, `chatSessionId.current = sid1`
2. Chat → messages appended
3. `saveSessionToJournal` (on unload/visibility) → `generateSessionEntry(msgs, 0, [])` → `JournalEntries.create({sessionId: sid1, courseId, intent: 'v1_compat', entryData: entry})` → single INSERT

**Trace (session 2):**
4. `enterStudy(course)` again → loads messages from sid1's session → archives to journal via `JournalEntries.create(...)` → ends sid1 → creates sid2
5. Chat → messages appended to sid2
6. `saveSessionToJournal` → `JournalEntries.create(...)` → another INSERT

**Accumulation check:**
- Old behavior: `DB.saveJournal` did `DELETE FROM journal_entries WHERE course_id = ? AND intent = 'v1_compat'` then reinserted ALL entries. Risk of data loss if called concurrently.
- New behavior: Each `JournalEntries.create(...)` is a single INSERT. No DELETE. Entries accumulate permanently.

**Double-archive risk — see F2:** If `saveSessionToJournal` fires on visibility-hidden (step 3), AND then `enterStudy` loads the same messages for archiving (step 4), the same session content gets two journal entries. The old code had this same risk — `DB.saveJournal` would rewrite all entries, so the duplicate was overwritten. With append-only, both entries persist.

**Result:** PASS (with F2 Low finding)

### T4 — Session continuity: Enter → chat → exit → re-enter → previous messages archived

**Trace:**
1. `enterStudy(course)` → `Sessions.getOrCreateCompat` → gets/creates active session S1 → archives any existing messages → ends S1 → creates S2 → `chatSessionId.current = S2`
2. Chat → boot + send → messages appended to S2 via `Messages.appendBatch`
3. Exit (navigate away, `saveSessionToJournal` fires via visibility change)
4. Re-enter → `Sessions.getOrCreateCompat(course.id)` → finds S2 (status: 'active') → `Messages.getBySession(S2)` → loads messages → archives to journal → `Sessions.end(S2)` → creates S3

**Session lifecycle:** Each `enterStudy` call: load old session → archive → end → create new. Clean lifecycle.

**Result:** PASS

### T5 — New course: Create course, start chatting — session created automatically

**Trace:**
1. `quickCreateCourse` → `Courses.create({name})` → `loadCoursesNested()` → course exists in state
2. `enterStudy(newCourse)` → `Sessions.getOrCreateCompat(newCourse.id)`:
   - `SELECT id FROM sessions WHERE course_id = ? AND status = 'active'` → 0 rows
   - Creates new session: `INSERT INTO sessions (id, course_id, intent, status, started_at) VALUES (?, ?, 'explore', 'active', ?)`
   - Returns new session ID
3. `Messages.getBySession(newSid)` → 0 rows → `savedMsgs = []` → `savedMsgs.length > 1` = false → skip archiving
4. `Sessions.end(newSid)` → ends the just-created empty session
5. `Sessions.create({courseId, intent: 'explore'})` → creates the actual session for chatting
6. `chatSessionId.current = actualSessionId`

**Note:** Two sessions created for a brand-new course on first enter — one immediately ended (empty), one active. Harmless — the empty session has no messages and status 'completed'.

**Result:** PASS

### T6a — Edge case: Course with no chat history

**Trace:**
1. `enterStudy(course)` → `Sessions.getOrCreateCompat(course.id)`:
   - No active session → creates one → returns its ID
2. `Messages.getBySession(sid)` → 0 rows
3. `savedMsgs = []` → `savedMsgs.length > 1` = false → skip archiving
4. `Sessions.end(sid)` → ends empty session
5. `Sessions.create(...)` → creates fresh session
6. `chatSessionId.current` set → ready for chat

**Result:** PASS

### T6b — Edge case: Course with very long chat history

**Trace:**
1. `enterStudy(course)` → `Sessions.getOrCreateCompat(course.id)` → finds active session
2. `Messages.getBySession(sid)` → returns ALL messages (no LIMIT). With 1000+ messages, this is a potentially large SELECT.
3. Messages mapped to `{role, content, ...meta}` — all in memory for `generateSessionEntry`
4. Journal entry created → session ended → fresh session created

**Old behavior:** `DB.getChat` also loaded all messages (no LIMIT). `DB.saveChat` truncated to 100 on write. Now with append-only, the session can grow unbounded.

**Performance concern:** `Messages.getBySession` has no LIMIT. For sessions with 1000+ messages, this query returns a lot of data just for journal archiving. However, `generateSessionEntry` only uses the messages for summary generation, and `sendMessage` already uses `newMsgs.slice(-40)` for the AI context window. The DB load is the only concern.

**Mitigation:** `Messages.getLastN(sessionId, n)` exists but is not used here. Could be used as optimization if needed.

**Result:** PASS (informational note about unbounded message load)

### T7 — Build verification

- `npm run build` PASS (1.31s)
- No new static imports — `Sessions`, `Messages`, `JournalEntries` already exported from db.js
- `chatSessionId` ref initialized to `null` — safe default

**Result:** PASS

---

## Findings

### F1 — chatSessionId.current null if enterStudy errors (Medium)

**Location:** `enterStudy` lines 592-608

**Issue:** The try/catch wrapping the session setup means if `Sessions.getOrCreateCompat` or `Sessions.create` throws, `chatSessionId.current` remains `null` from the previous value (or from init). Subsequent calls to `Messages.appendBatch(null, ...)` and `JournalEntries.create({sessionId: null, ...})` would attempt to INSERT with `session_id = null`.

**Trace:**
- `Messages.appendBatch(null, msgs)` → `INSERT INTO messages (session_id, ...) VALUES (null, ...)` — if `session_id` has a NOT NULL constraint, this throws and the message is silently lost (caught by sendMessage's try/catch). If nullable, the message is orphaned.
- `JournalEntries.create({sessionId: null, ...})` → same issue.

**Impact:** Medium. If the session setup in `enterStudy` fails, all subsequent chat saves silently fail or produce orphaned rows. The user can still chat (messages appear in UI state) but nothing persists.

**Old behavior comparison:** The old `DB.saveChat` resolved its own session internally, so a failure in `enterStudy`'s try/catch wouldn't affect subsequent saves. The new code front-loads session resolution.

**Recommendation:** Set a fallback in the catch block:
```js
} catch (e) {
  console.error("Journal capture on enter:", e);
  try { chatSessionId.current = await Sessions.create({ courseId: course.id, intent: 'explore' }); } catch {}
}
```

### F2 — Double journal archiving on close-then-reenter (Low)

**Location:** `saveSessionToJournal` (line 317) + `enterStudy` archive (line 600)

**Issue:** If user is chatting, then closes the app (triggers `saveSessionToJournal` via `beforeunload`), then reopens and enters the same course (`enterStudy` loads the same messages and archives again), two journal entries are created for the same session content.

**Old behavior:** The old `DB.saveJournal` did a full clear-and-rewrite, so the duplicate was implicitly deduplicated. With append-only `JournalEntries.create`, both entries persist.

**Impact:** Low. Journal entries are used for `formatJournal` which formats the last 10 entries for the AI system prompt. A duplicate entry means one session takes 2 of the 10 slots — slightly less history coverage but functionally harmless.

**Recommendation:** Could add a guard in `enterStudy` to check if a journal entry already exists for the old session before creating another. Or accept the minor duplication.

### F3 — Empty sessions accumulate (Informational)

**Location:** `enterStudy` lines 593-607

**Issue:** Every `enterStudy` call creates and immediately ends a session if no active session exists, then creates a second session. For a new course, this means 2 sessions on first enter (1 empty + 1 active). Switching courses rapidly creates many empty completed sessions.

**Impact:** Informational. Empty sessions waste minimal storage and are never loaded for any purpose. `Sessions.getOrCreateCompat` only finds `status = 'active'` sessions, so old completed sessions don't interfere.

---

## Coverage Matrix

| Scenario | V1 Method Replaced | New Call | Traced | Result |
|---|---|---|:--:|:--:|
| Chat load on enter | `DB.getChat(cid)` | `Sessions.getOrCreateCompat` + `Messages.getBySession` | Yes | PASS |
| Chat clear on enter | `DB.saveChat(cid, [])` | `Sessions.end(sid)` + `Sessions.create(...)` | Yes | PASS |
| Boot message save | `DB.saveChat(cid, [u, a])` | `Messages.appendBatch(ref, [u, a])` | Yes | PASS |
| Send message save | `DB.saveChat(cid, all.slice(-100))` | `Messages.appendBatch(ref, [u, a])` | Yes | PASS |
| Session-to-journal save | `DB.saveChat(cid, msgs.slice(-100))` | Removed (already persisted) | Yes | PASS |
| Journal save (session) | `DB.getJournal` + push + `DB.saveJournal` | `JournalEntries.create(...)` | Yes | PASS |
| Journal save (enter) | Same load-push-rewrite | Same single create | Yes | PASS |
| Journal load (boot) | `DB.getJournal(cid)` | `JournalEntries.getByCourse` + reverse + parse | Yes | PASS |
| Journal load (send) | `DB.getJournal(cid)` | Same reverse + parse | Yes | PASS |
| Course switch isolation | — | `course_id` FK on sessions | Yes | PASS |
| New course first chat | — | `getOrCreateCompat` auto-creates | Yes | PASS |
| No history edge case | — | Empty results handled | Yes | PASS |
| Long history edge case | — | No LIMIT (see T6b note) | Yes | PASS |
| Build | — | — | Yes | PASS |
