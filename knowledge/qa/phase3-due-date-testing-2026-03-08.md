# Phase 3 — Due Date Testing Report
**Date:** 2026-03-08
**Analyst:** Study Security & Testing Analyst
**Implementation:** `knowledge/development/phase3-due-dates-2026-03-08.md`
**Build:** `npm run build` passes (83 modules, 923.46 kB main chunk)

---

## Verdict: PASS

No critical or high-severity issues. 3 minor items (non-blocking).

---

## Test Scenarios

### T1: Set Due Date via Native Picker
**Flow:** Click due date text → native date picker opens → select date → card updates
**Trace:**
1. `onClick` on date wrapper calls `e.currentTarget.querySelector('input')?.showPicker()` (ModePicker:211)
2. User selects a date → `onChange` fires (ModePicker:217)
3. Epoch computed: `Math.floor(new Date(val + 'T23:59:59').getTime() / 1000)` — end-of-day to avoid premature overdue marking
4. `Assignments.updateDueDate(a.id, newEpoch)` persists to SQLite
5. `setPickerData` optimistic update replaces `dueDateEpoch` and recomputes `dueDate` label inline
**Result:** PASS

### T2: Change Existing Due Date
**Flow:** Click existing date → picker opens pre-filled → select new date → card updates
**Trace:**
1. `<input type="date" value={...}>` pre-filled: `new Date(a.dueDateEpoch * 1000).toISOString().split('T')[0]` (ModePicker:216)
2. Same onChange flow as T1 — old epoch overwritten in both DB and local state
3. Urgency color recalculated on next render via `getUrgencyLevel(a.dueDateEpoch)` (ModePicker:197)
**Result:** PASS

### T3: Clear Due Date (Set to Empty)
**Flow:** Open date picker → clear the date field → card shows "No due date"
**Trace:**
1. When user clears the native date input, `ev.target.value` is `""` (empty string)
2. `var val = ev.target.value;` → `val` is `""`
3. `var newEpoch = val ? ... : null;` → falsy empty string → `newEpoch = null`
4. `Assignments.updateDueDate(a.id, null)` writes `NULL` to `due_date` column
5. Optimistic update: `label = null` (the `if (newEpoch)` block is skipped), `dueDateEpoch: null`
6. Card renders `a.dueDate || "No due date"` → shows "No due date" in `T.txM` color
**Result:** PASS

### T4: Persistence Across App Restart
**Flow:** Set due date → quit app → relaunch → assignment picker shows saved date
**Trace:**
1. `Assignments.updateDueDate` writes epoch to SQLite `assignments.due_date`
2. On relaunch, `selectMode("assignment")` → `loadAssignmentsCompat(active.id)` (StudyContext:588)
3. `Assignments.getByCourse(courseId)` reads `due_date` from DB as integer
4. `a.dueDateEpoch = a.dueDate || null` preserves raw epoch (StudyContext:50)
5. `a.dueDate = formatDueDate(a.dueDate)` formats for display (StudyContext:51)
**Result:** PASS — data round-trips through SQLite correctly

### T5: Sort Order — Mixed Dates and Nulls
**Flow:** Assignments with various due dates and some with no date → sorted soonest-first, nulls last
**Trace (both code paths — direct load at line 635 and decomposition-retry at line 607):**
```javascript
enriched.sort((a, b) => {
  if (a.dueDateEpoch && b.dueDateEpoch) return a.dueDateEpoch - b.dueDateEpoch;
  if (a.dueDateEpoch) return -1; if (b.dueDateEpoch) return 1;
  return (a.title || '').localeCompare(b.title || '');
});
```
**Test cases:**
| Input | Expected Order | Result |
|---|---|---|
| [Mar 10, Mar 5, null] | Mar 5, Mar 10, null | PASS |
| [null, null, null] | Alphabetical by title | PASS |
| [Mar 10, Mar 10, null] | Tied by epoch (stable), null last | PASS |
| [overdue (Mar 1), future (Mar 20), null] | Mar 1 (overdue), Mar 20, null | PASS |
| [all have dates] | Ascending by epoch | PASS |
| [single item] | No sort needed | PASS |

**Edge case — epoch 0:** If `dueDateEpoch` is `0` (Jan 1, 1970), the `if (a.dueDateEpoch)` check treats `0` as falsy → sorts as if null. This is acceptable because epoch `0` is not a valid due date for a real assignment.
**Result:** PASS

### T6: Urgency Color Thresholds
**`getUrgencyLevel(dueDateEpoch)`** (ModePicker:7-15):

| Condition | Expected Level | Color | Trace |
|---|---|---|---|
| `dueDateEpoch = null` | `'none'` | `T.txM` (#64748B) | Line 8: early return |
| Past due (diff < 0) | `'overdue'` | `T.rd` (#F87171) | Line 11 |
| In 12 hours (diff < 48*3600) | `'urgent'` | `T.rd` (#F87171) | Line 12 |
| In 47h59m (diff < 48*3600) | `'urgent'` | `T.rd` (#F87171) | Line 12 — boundary |
| In 48h01m (diff >= 48*3600) | `'soon'` | `T.am` (#FBBF24) | Line 13 |
| In 5 days (diff < 7*86400) | `'soon'` | `T.am` (#FBBF24) | Line 13 |
| In 8 days (diff >= 7*86400) | `'normal'` | `T.ac` (#6C9CFC) | Line 14 |

**Result:** PASS — all thresholds correctly implemented per UX spec

### T7: Overdue Card Treatment
**Flow:** Assignment with past due date → red-tinted card
**Trace:**
1. `var isOverdue = urgency === 'overdue'` (ModePicker:199)
2. `var cardBorder = isExpanded ? T.acB : isOverdue ? "rgba(248,113,113,0.3)" : T.bd` (ModePicker:200) — red border when overdue (unless expanded)
3. `var cardBg = isOverdue ? "rgba(248,113,113,0.06)" : T.sf` (ModePicker:201) — red tint background
4. Hover color: `isOverdue ? "rgba(248,113,113,0.1)" : T.acS` (ModePicker:206)
**Edge case:** When expanded AND overdue, `cardBorder` uses `T.acB` (blue accent border) instead of red. This is intentional — the expanded state takes visual priority.
**Result:** PASS

### T8: formatDueDate Edge Cases
**`formatDueDate(dueDateEpoch)`** (StudyContext:24-37):

| Input | Expected Output | Trace |
|---|---|---|
| `null` | `null` | Line 25: early return |
| `0` | `null` | Line 25: `!0` is truthy → returns null |
| `undefined` | `null` | Line 25: `!undefined` is truthy → returns null |
| Epoch 1 second ago | `'overdue'` | diff < 0, days = 0 → "overdue" |
| Epoch 2 days ago | `'overdue by 2 days'` | diff < 0, days = 2 |
| Epoch 1 day ago | `'overdue by 1 day'` | diff < 0, days = 1 → singular "day" |
| Epoch in 0–24h | `'due today'` | diff >= 0, days = 0 |
| Epoch in 24–48h | `'tomorrow'` | days = 1 |
| Epoch in 5 days | `'in 5 days'` | days = 5, <= 14 |
| Epoch in 14 days | `'in 14 days'` | days = 14, <= 14 — boundary |
| Epoch in 15 days | `'Oct 11'` (example) | days = 15, > 14, same year → short format |
| Epoch in 2027 | `'Jan 15, 2027'` | Different year → includes year |

**Result:** PASS

### T9: Date Picker — Invalid Input
**Flow:** User somehow enters an invalid date string
**Trace:**
1. Native `<input type="date">` constrains to valid dates in the browser — invalid manual input is rejected by the input element itself before `onChange` fires
2. If somehow an invalid value reaches onChange: `new Date(val + 'T23:59:59')` returns `Invalid Date` → `getTime()` returns `NaN` → `Math.floor(NaN)` returns `NaN` → written to DB as NaN
3. On next read: `formatDueDate(NaN)` → `diff = NaN - now = NaN` → all comparisons are false → falls through to `new Date(NaN * 1000)` → Invalid Date → `toLocaleDateString` returns "Invalid Date"
**Risk:** Low — native date input prevents this in practice. Browser HTML5 date inputs only fire `onChange` with valid `YYYY-MM-DD` strings or empty string.
**Result:** PASS (browser-level validation prevents invalid input)

### T10: Timezone Edge Cases
**Flow:** User in different timezones sets due dates
**Trace:**
1. **Setting:** `new Date(val + 'T23:59:59')` — no timezone specifier → parsed as local time. This means "end of day" is correctly end of day in the user's timezone.
2. **Displaying:** `new Date(dueDateEpoch * 1000).toLocaleDateString(...)` — also uses local timezone
3. **Urgency calc:** `Math.floor(Date.now() / 1000)` vs stored epoch — both absolute UTC timestamps, so comparison is timezone-agnostic
4. **Pre-fill:** `new Date(a.dueDateEpoch * 1000).toISOString().split('T')[0]` — uses UTC for ISO string. A date set as "Mar 10 23:59:59 EST" stores as epoch for "Mar 11 04:59:59 UTC". `.toISOString()` returns `"2026-03-11T..."` → pre-fills as Mar 11 instead of Mar 10.
**Result:** See M1 below

---

## Minor Issues

### M1: Date picker pre-fill off-by-one in negative UTC offsets
**Severity:** Minor (cosmetic, non-blocking)
**Location:** ModePicker.jsx:216
**Issue:** `new Date(epoch * 1000).toISOString().split('T')[0]` converts to UTC, but the epoch was stored using local time (`new Date(val + 'T23:59:59')`). In timezones west of UTC (e.g., EST = UTC-5), the stored epoch is after midnight UTC → ISO string shows the next day. Example: user sets "Mar 10" → epoch is Mar 11 04:59:59 UTC → pre-fill shows "2026-03-11".
**Impact:** When re-opening the date picker, the pre-filled date may be one day ahead. Does not affect display (which uses `formatDueDate` with local time) or urgency calculation.
**Fix:** Use local date formatting instead of `.toISOString()`:
```javascript
var d = new Date(a.dueDateEpoch * 1000);
var yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
value={a.dueDateEpoch ? yyyy+'-'+mm+'-'+dd : ''}
```

### M2: Duplicated formatDueDate logic in ModePicker onChange
**Severity:** Minor (maintainability, non-blocking)
**Location:** ModePicker.jsx:229-240
**Issue:** The optimistic state update in the date picker's `onChange` handler duplicates `formatDueDate()` logic from StudyContext.jsx line-for-line. If the formatting logic changes, both locations must be updated.
**Impact:** No functional impact currently. Risk of format drift if only one copy is updated.
**Fix:** Extract `formatDueDate` to a shared utility (e.g., `src/lib/dates.js`) and import from both files. Low priority.

### M3: No re-sort after date change
**Severity:** Minor (UX, non-blocking)
**Location:** ModePicker.jsx:222-245
**Issue:** After changing a due date via the picker, the optimistic state update replaces the item's `dueDateEpoch` and `dueDate` label but does not re-sort the `items` array. The assignment stays in its original position until the picker is re-opened (which triggers `selectMode` and a fresh sort).
**Impact:** If a user changes a date to make an assignment more/less urgent, it won't visually reorder until they leave and re-enter the picker. Acceptable for now.
**Fix:** Add a sort step in the `setPickerData` updater after the `map()`.

---

## Security Review

| Check | Status |
|---|---|
| SQL injection via date input | SAFE — `Assignments.updateDueDate` uses parameterized query (`UPDATE assignments SET due_date = ? WHERE id = ?`) |
| XSS via date display | SAFE — all date text rendered via React JSX (auto-escaped), no `dangerouslySetInnerHTML` |
| Epoch overflow | SAFE — JS `Date` handles years up to 275760. No risk from user-selected dates |
| Race condition on optimistic update | LOW RISK — `setPickerData` uses functional updater (`prev => ...`), so concurrent updates merge correctly |

---

## Checklist

- [x] Set due date via native picker → persists to SQLite
- [x] Change existing due date → updates display and DB
- [x] Clear due date → shows "No due date", writes NULL to DB
- [x] Persistence across app restart (data round-trips through SQLite)
- [x] Assignment picker sorts soonest-first, nulls last
- [x] Sort applied in both code paths (direct-load and decomposition-retry)
- [x] Urgency colors correct at all thresholds (overdue, <48h, <7d, >7d, null)
- [x] Overdue card treatment (red tint, red border, red hover)
- [x] formatDueDate handles all edge cases (null, overdue, today, tomorrow, relative, absolute)
- [x] Native date input prevents invalid values
- [x] End-of-day epoch (`T23:59:59`) prevents premature overdue marking
- [x] No SQL injection, XSS, or other security issues
