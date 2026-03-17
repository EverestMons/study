# Course Homepage + ModePicker Elimination Blueprint

**Date:** 2026-03-14
**Agent:** Study Systems Analyst
**Step:** Step 1
**Blueprint for:** `study/knowledge/decisions/course-homepage-plan-2026-03-14.md`

---

## 1. CourseHomepage.jsx Design

### Overview

New screen component: `src/screens/CourseHomepage.jsx`. Reached via `setScreen("courseHome")` after `setActive(course)` from HomeScreen. Renders a 3×2 CSS Grid of cards — no scrolling.

### Screen Layout

```
┌──────────────────────────────────────────────────────┐
│  < Back                              Notifications Settings │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Course Name                                         │
│  subtitle (material count)                           │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ 📋          │  │ 📝          │  │ 💪          │  │
│  │ Assignment  │  │ Exam        │  │ Skill       │  │
│  │ Work        │  │ Review      │  │ Development │  │
│  │ 3 active ·  │  │ Exam in 5d  │  │ 12 skills · │  │
│  │ 1 overdue   │  │ 68% ready   │  │ 4 due       │  │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  │
│  │ 📚          │  │ 📄          │  │ 📅          │  │
│  │ Curriculum  │  │ Materials   │  │ Schedule    │  │
│  │             │  │             │  │             │  │
│  │ 5 active ·  │  │ 8 materials │  │ Week 6 of   │  │
│  │ 28 skills   │  │ 124 sections│  │ 14          │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### CSS Grid Spec

```css
display: grid;
grid-template-columns: repeat(3, 1fr);
grid-template-rows: repeat(2, 1fr);
gap: 12px;
max-width: 640px;
margin: 0 auto;
```

- Card height is driven by grid row height, which auto-distributes remaining space after header.
- Target: fits within ~700px viewport height. Header (~90px) + grid padding (32px top + 16px bottom) leaves ~560px for 2 rows → ~274px per row, plenty for card content.

### Card Specification

Each card is a `<button>` with:
- `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 14`
- `padding: 20px`, `cursor: pointer`, `textAlign: left`
- Hover: `background: T.sfH`, `borderColor: T.acB`
- Transition: `all 0.2s`

Card content (top to bottom):
1. **Icon** — emoji character, `fontSize: 24`
2. **Title** — `fontSize: 16, fontWeight: 600, color: T.tx`
3. **Subtitle** — `fontSize: 12, color: T.txD, marginTop: 4`
4. **Urgency signal** (optional) — `fontSize: 11`, colored per urgency

### Card Definitions

| Card | Icon | Title | Subtitle Pattern | Urgency Signal | Click Action |
|---|---|---|---|---|---|
| Assignment Work | 📋 | Assignment Work | `"{active} active · {overdue} overdue"` or `"No active assignments"` | Red if any overdue | `enterStudy(active)` then `selectMode("assignment")` |
| Exam Review | 📝 | Exam Review | `"Exam in {N} days · {readiness}% ready"` or `"No upcoming exams"` | Amber <7 days, Red <2 days | `enterStudy(active)` then `selectMode("exam")` |
| Skill Development | 💪 | Skill Development | `"{total} skills · {due} due for review"` or `"No skills yet"` | Amber if due > 0 | `enterStudy(active)` then `selectMode("skills")` |
| Curriculum | 📚 | Curriculum | `"{active} active · {totalSkills} skills"` or `"No assignments"` | — | `setScreen("curriculum")` |
| Materials | 📄 | Materials | `"{count} materials · {sections} sections"` | — | `setScreen("materials")` |
| Schedule | 📅 | Schedule | `"Week {N} of {total}"` or `"No schedule"` | — | `setScreen("schedule")` |

### Data Loading

On mount (`useEffect` with `[active?.id]`), fire parallel queries:

```js
const [asgn, skills, schedule, curSum] = await Promise.all([
  Assignments.getByCourse(active.id),
  loadSkillsV2(active.id),
  CourseSchedule.getByCourse(active.id),
  Assignments.getCurriculumSummary(active.id),
]);
```

Post-process:
- **Assignment card**: count active (status !== "completed"), count overdue (`dueDate < now`)
- **Exam card**: parse exam dates from `schedule[].exams` JSON, find nearest future exam, compute days. Readiness = average `effectiveStrength` of all skills (reuse from ModePicker nudge logic)
- **Skills card**: `skills.length` for total, count due via `nextReviewDate(s) <= today`
- **Curriculum card**: `curSum.activeCount`, `curSum.totalSkills`
- **Materials card**: `active.materials.length`, sum extracted chunk counts
- **Schedule card**: `schedule.length` for total weeks, compute current week from dates

Store computed subtitle data in a single `useState` object. While loading, render cards with empty subtitles (no blocking).

### Card Routing

The three study cards (Assignment Work, Exam Review, Skill Development) need to enter the study screen AND pre-select the appropriate mode so the picker shows directly. The routing is:

1. `enterStudy(active)` — resets all study state, switches to study screen
2. Immediately after: `selectMode("assignment"|"exam"|"skills")`

**Problem:** `enterStudy` is async (saves journal, creates session). `selectMode` must wait for it.

**Solution:** Modify `enterStudy` to accept an optional `initialMode` parameter:

```js
const enterStudy = async (course, initialMode) => {
  // ... existing reset logic ...
  // At the end, after session creation:
  if (initialMode) {
    selectMode(initialMode);
  }
};
```

This keeps the change minimal. The three study cards call:
- `enterStudy(active, "assignment")`
- `enterStudy(active, "exam")`
- `enterStudy(active, "skills")`

The non-study cards call:
- `setScreen("curriculum")` / `setScreen("materials")` / `setScreen("schedule")`

### Back Button

Top-left `< Back` button: `setScreen("home")`. Same style as other screen back buttons.

### Top Bar

Standard top bar with:
- `< Back` (left)
- `Notifications` text button + `Settings` button (right)

---

## 2. ModePicker Elimination

### Current ModePicker Structure (662 lines)

ModePicker.jsx contains:

1. **Nudge calculation effect** (lines 64-175) — loads assignments, skills, exams; finds urgent items; sets `nudgeItem`/`suggestedMode`
2. **Mode selection buttons** (lines 190-318) — 5 mode cards + course management + notifications buttons
3. **Empty picker fallback** (lines 326-396) — "no skills yet" / "no assignments" messages with extraction trigger
4. **Assignment picker** (lines 397-515) — assignment list with readiness %, skill breakdown, date picker, practice buttons
5. **Exam scope picker** (lines 517-561) — material checklist with auto-selection
6. **Explore topic input** (lines 563-589) — free-text input
7. **Skill picker** (lines 590-658) — skill list with strength %, learn/practice buttons, deadline tags

### Recommendation: Extract sub-pickers into standalone component files

**Option A (recommended): Standalone components.**

Extract into three files:
- `src/components/study/AssignmentPicker.jsx` — lines 397-515 + empty fallback for assignment mode
- `src/components/study/SkillPicker.jsx` — lines 590-658 + empty fallback for skills mode
- `src/components/study/ExamScopePicker.jsx` — lines 517-561 + empty fallback for exam mode

**Rationale:**
- Each picker is self-contained (50-120 lines each) with distinct data dependencies
- StudyScreen.jsx stays clean: just a conditional render based on `sessionMode`
- Easier to test/modify individual pickers in isolation
- The explore topic input (lines 563-589) is deleted — explore mode is removed entirely

### What Each Picker Needs from ModePicker

**AssignmentPicker** needs:
- `useStudy()`: `active, pickerData, setPickerData, bootWithFocus, addNotif, setPracticeMode, setSessionMode, globalLock, setGlobalLock, setBusy, setStatus, extractionCancelledRef, setActive, setCourses`
- Imports: `Assignments, loadCoursesNested` from db.js, `runExtractionV2, loadSkillsV2, decomposeAssignments` from skills.js, `effectiveStrength, strengthToTier, TIERS, createPracticeSet, generateProblems, loadPracticeMaterialCtx, computeFacetReadiness` from study.js, `DatePicker`, `PracticeSets` from db.js
- Helper functions: `getUrgencyLevel`, `URGENCY_COLORS`, `formatNudgeDate` — move to top of file or a shared util

**SkillPicker** needs:
- `useStudy()`: `active, pickerData, setPickerData, bootWithFocus, addNotif, setPracticeMode, setSessionMode`
- Imports: `PracticeSets` from db.js, `strengthToTier, TIERS, effectiveStrength, createPracticeSet, generateProblems, loadPracticeMaterialCtx` from study.js

**ExamScopePicker** needs:
- `useStudy()`: `pickerData, setPickerData, bootWithFocus, setSessionMode`
- No additional imports beyond `T` and `useStudy`

### Empty/Error State

Each picker renders `pickerData.empty` case (the "No skills yet" / "No assignments" fallback with Extract/Retry button). The empty state rendering from ModePicker lines 326-396 is shared across assignment and skills modes. Rather than duplicating, each picker handles its own empty state since the messages differ per mode and the extraction trigger is only relevant for non-assignment modes.

### Deadline Nudge Banner

**Recommendation: Eliminate as a standalone banner. Surface urgency via card subtitles.**

The nudge banner exists because users could enter ModePicker without knowing their deadline status. With CourseHomepage, every user sees card subtitles ("1 overdue", "Exam in 2 days") before entering any study mode. The information the nudge provided is now front-and-center.

The nudge's "Work on it" / "Start prep" quick-action is replaced by the card itself — clicking "Assignment Work" when it shows "1 overdue" achieves the same effect.

No banner needed on CourseHomepage or StudyScreen.

---

## 3. StudyScreen.jsx Modification

### Current Flow

```
HomeScreen → enterStudy → StudyScreen
  → ModePicker (mode selection) → selectMode → pickerData
  → ModePicker (sub-picker) → bootWithFocus → focusContext
  → MessageList + InputBar (AI session)
```

### New Flow

```
HomeScreen → CourseHomepage (card grid)
  → Card click → enterStudy(active, "assignment"|"exam"|"skills")
  → StudyScreen
    → If sessionMode but no focusContext and no msgs: render sub-picker
    → User selects focus → bootWithFocus → focusContext
    → MessageList + InputBar (AI session)
```

### State Flow Diagram

```
enterStudy(course, "assignment")
  → screen = "study"
  → sessionMode = null (reset)
  → selectMode("assignment") called at end of enterStudy
    → sessionMode = "assignment"
    → pickerData = { mode: "assignment", items: [...] }

StudyScreen renders:
  if (!sessionMode) → nothing (shouldn't happen with new flow)
  if (sessionMode && pickerData && !focusContext && msgs.length <= 1) → sub-picker
  if (focusContext || msgs.length > 1) → MessageList + InputBar
```

### StudyScreen.jsx New Structure

```jsx
export default function StudyScreen() {
  // ... existing destructure ...

  // Determine what to show in the main content area
  const showPicker = sessionMode && !focusContext && msgs.length <= 1 && !booting;
  const showSession = focusContext || msgs.length > 1 || booting;

  return (
    <div style={{ ... }}>
      {/* Top bar — unchanged */}
      <MaterialsPanel />
      <SkillsPanel />
      <PracticeMode />
      {!practiceMode && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <NotifPanel />
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", order: 1 }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <ChunkPicker />
              {/* Sub-pickers replace ModePicker */}
              {showPicker && sessionMode === "assignment" && <AssignmentPicker />}
              {showPicker && sessionMode === "skills" && <SkillPicker />}
              {showPicker && sessionMode === "exam" && <ExamScopePicker />}
              {/* Break reminder + Messages */}
              {showSession && <>
                {/* break banner ... */}
                <MessageList />
              </>}
            </div>
          </div>
          <AssignmentPanel />
        </div>
      )}
      <InputBar />
      <SessionSummary />
    </div>
  );
}
```

### Back Button Behavior Change

StudyScreen's `< Back` button currently has a 3-branch handler:
1. If sessionMode/pickerData/chunkPicker/practiceMode → clear them (back to ModePicker)
2. If msgs > 1 → generate session summary
3. Else → go to home

With ModePicker eliminated:
1. If sessionMode + pickerData but no focusContext → `setScreen("courseHome")` (back to CourseHomepage). Also clear state.
2. If focusContext + msgs > 1 → generate session summary (unchanged)
3. If focusContext + msgs ≤ 1 (booting or just started) → `setScreen("courseHome")` + clear state
4. Else → `setScreen("courseHome")`

Key change: back goes to `"courseHome"` instead of clearing to ModePicker or going to `"home"`.

---

## 4. HomeScreen Simplification

### Remove

- `getCourseState()` function (lines 7-17) — entirely deleted
- `summaries` state + `curriculumSummaries` state + the `useEffect` that computes them (lines 25-73)
- `formatExamProximity()` helper (lines 75-79)
- Schedule signal rendering in course cards (lines 124-163)
- Curriculum summary line in course cards (lines 164-174)
- State machine nudge label (lines 175-180)

### Modify

- `handleCourseClick`: replace state machine routing with:
  ```js
  function handleCourseClick() {
    setActive(c);
    setScreen("courseHome");
  }
  ```
- Course card subtitle: simplify to just `"{N} materials · {types}"` (already there at line 148)

### Keep

- Header with "Study" title, version badge, "View Profile" button
- Course list with names, material counts, delete buttons
- "Add Course" form at bottom
- Settings button in top bar
- Notifications button in top bar (new — see section 6)

### Estimated Impact

HomeScreen shrinks from ~212 lines to ~110 lines. The `getCurriculumSummary`, `getByCourse`, schedule parsing all move to CourseHomepage where they're actually needed.

---

## 5. Recap + Explore Removal Reference Map

### Files to Modify

#### `src/StudyContext.jsx`

| Line | Content | Action |
|---|---|---|
| 738 | `intent: 'explore'` in Sessions.create | Change to `intent: 'general'` or keep `'explore'` (benign — just a DB string for old sessions). **Recommend: change to `'study'`** |
| 745-748 | `if (mode === "recap") { bootWithFocus({ type: "recap" }); return; }` | **Delete** these 4 lines |
| 911-912 | `} else if (mode === "explore") { setPickerData({ mode, exploreTopic: "" }); }` | **Delete** these 2 lines |
| 969-971 | `if (focus.type === "recap") { ... modeHint = "MODE: RECAP..."; }` | **Delete** this branch (3 lines) |
| 988-990 | `} else if (focus.type === "explore") { ... modeHint = "MODE: OPEN EXPLORATION..."; }` | **Delete** this branch (3 lines) |
| 1032 | `focusContext.type === "explore"` in sendMessage guard | **Remove** `|| focusContext.type === "explore"` from condition |
| 1050 | `intentWeights = { assignment: 1.0, exam: 0.8, skills: 1.0, recap: 0.4, explore: 0.2 }` | **Remove** `recap: 0.4, explore: 0.2` → `{ assignment: 1.0, exam: 0.8, skills: 1.0 }` |

#### `src/lib/study.js`

| Line | Content | Action |
|---|---|---|
| 890 | `if (mode === 'explore' \|\| mode === 'exam')` in loadFacetBasedContent | **Remove** `mode === 'explore' \|\|` → `if (mode === 'exam')` |
| 1434-1455 | `} else if (focus.type === "recap") { ... }` block in buildFocusedContext | **Delete** entire recap branch (22 lines) |
| 1547-1621 | `} else if (focus.type === "explore") { ... }` block in buildFocusedContext | **Delete** entire explore branch (75 lines) |
| 1691 | System prompt text contains "5 modes" references | **Verify** — current prompt text doesn't explicitly list 5 modes, but the intent weights change above handles the behavioral impact |

#### `src/components/study/ModePicker.jsx`

| Action | Note |
|---|---|
| **Delete entire file** | After sub-pickers extracted. All recap/explore code inside is eliminated with the file. |

#### `src/components/study/InputBar.jsx`

| Line | Content | Action |
|---|---|---|
| 32 | `focusContext?.type === "recap" ? "RC" : ... "explore" ? "XP"` | **Remove** recap and explore branches from the ternary chain |
| 37 | `: focusContext?.type === "recap" ? "Session Recap"` | **Remove** this branch |
| 39 | `: focusContext?.type === "explore" ? "Explore: " + ...` | **Remove** this branch |

#### `src/screens/StudyScreen.jsx`

| Line | Content | Action |
|---|---|---|
| 10 | `import ModePicker from ...` | **Delete** import |
| 90 | `<ModePicker />` | **Replace** with sub-picker conditionals |

#### `src/lib/db.js`

| Line | Content | Action |
|---|---|---|
| 1981 | `intent, 'explore'` in Sessions.create | **No change** — this is the default intent for new sessions. Could rename to `'study'` but it's benign. |

### Files that Reference "explore" but Need No Changes

- `src/lib/db.js` line 1981 — default session intent string in SQL, not behavioral
- `loadFacetBasedContent` in study.js line 890 — remove `'explore'` from the condition (noted above)

---

## 6. App-Level Notifications

### Current State

- `notifs` array lives in StudyContext (in-memory, resets on reload)
- `lastSeenNotif` timestamp in StudyContext
- `addNotif(type, msg)` generates notifications during study sessions
- `NotifsScreen.jsx` shows notifications — currently scoped per-course (`active.name` in header)
- Notification access: only via ModePicker's "Notifications" button card (lines 304-315) or `setScreen("notifs")` in ModePicker

### New: Text Button on Every Screen with Settings

**Button placement:** Adjacent to the Settings button in the top bar, on the left side of Settings.

**Button style:** Matches Settings button exactly:
```js
{
  background: T.sf,
  border: "1px solid " + T.bd,
  borderRadius: 8,
  padding: "8px 14px",
  color: T.txD,
  cursor: "pointer",
  fontSize: 13,
  transition: "all 0.15s ease"
}
```

**Button text:** `"Notifications"` + unread count suffix if any:
- No unread: `"Notifications"`
- 3 unread: `"Notifications (3)"`

The `(3)` suffix uses `color: T.rd` for visibility while the rest of the text stays `T.txD`.

**Unread calculation:** `notifs.filter(n => n.time.getTime() > lastSeenNotif).length`

### Click Behavior

**Navigate to NotifsScreen:** `setScreen("notifs"); setLastSeenNotif(Date.now());`

NotifsScreen needs one modification: make it **app-level** (not course-scoped):
- Remove `active.name` subtitle from header
- Change back button to `setScreen("home")` (or back to previous screen — but `"home"` is simplest since notifications are app-level)
- Remove `&& active` guard from ScreenRouter's notifs route (line 70)

### Screens That Get the Button

Every screen that currently has a Settings button (confirmed via grep):

| Screen | Settings Button Line | Gets Notifications Button |
|---|---|---|
| HomeScreen | Line 87 | Yes |
| **CourseHomepage** (new) | — | Yes |
| StudyScreen | Line 72 | Yes |
| NotifsScreen | Line 19 | No (already on this screen) |
| MaterialsScreen | Line 347 | Yes |
| ScheduleScreen | Line 368 | Yes |
| CurriculumScreen | Line 189 | Yes |
| ProfileScreen | Line 115 | Yes |
| UploadScreen | Line 43 | Yes |
| ManageScreen | Line 26 | Yes |
| SkillsScreen | Line 23 | Yes |

### Implementation Pattern

To avoid duplicating the button markup in 10+ screens, extract a helper component or a render function. Two options:

**Option A: TopBarButtons component**
```jsx
// src/components/TopBarButtons.jsx
export default function TopBarButtons() {
  const { setShowSettings, setScreen, setLastSeenNotif, notifs, lastSeenNotif } = useStudy();
  const unread = notifs.filter(n => n.time.getTime() > lastSeenNotif).length;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => { setScreen("notifs"); setLastSeenNotif(Date.now()); }} style={...}>
        Notifications{unread > 0 ? <span style={{ color: T.rd }}> ({unread})</span> : null}
      </button>
      <button onClick={() => setShowSettings(true)} style={...}>
        Settings
      </button>
    </div>
  );
}
```

**Option B: Inline in each screen** — duplicate 8 lines of button markup per screen.

**Recommendation: Option A.** Extract `TopBarButtons` component. Replace all individual Settings buttons with `<TopBarButtons />`. Single source of truth. ~20 lines, used in 10+ screens, prevents drift.

### NotifsScreen Modifications

1. Remove `active` dependency — notifications are app-level, don't filter by course
2. Remove `active.name` from header subtitle
3. Back button navigates to `"home"` (simplest universal back)
4. ScreenRouter: remove `&& active` guard from notifs route:
   ```js
   // Before: else if (screen === "notifs" && active) content = <NotifsScreen />;
   // After:  else if (screen === "notifs") content = <NotifsScreen />;
   ```

---

## 7. ScreenRouter Changes

### New Route

Add `"courseHome"` route:

```js
else if (screen === "courseHome" && active) content = <CourseHomepage />;
```

Add import:
```js
import CourseHomepage from "./screens/CourseHomepage.jsx";
```

### Modified Route

```js
// Remove `&& active` guard from notifs
else if (screen === "notifs") content = <NotifsScreen />;
```

---

## 8. enterStudy Modification

### Current Signature

```js
const enterStudy = async (course) => { ... }
```

### New Signature

```js
const enterStudy = async (course, initialMode) => { ... }
```

At the end of `enterStudy` (after session creation, line 739), add:

```js
if (initialMode) {
  selectMode(initialMode);
}
```

This triggers the picker data loading for the specified mode, so by the time StudyScreen renders, `pickerData` is being populated.

**Backward compatibility:** All existing `enterStudy(course)` calls (e.g., from ScheduleScreen, CurriculumScreen) pass no second argument → `initialMode` is `undefined` → no automatic mode selection → user lands on StudyScreen without a picker, which is fine because those flows use `bootWithFocus` directly.

Wait — actually, those flows call `bootWithFocus` themselves (e.g., CurriculumScreen's `handleStudySkill`). But with ModePicker eliminated, if someone calls `enterStudy(course)` without `initialMode`, the user would land on StudyScreen with no picker and no mode. This would be a blank state.

**Resolution:** For flows that call `enterStudy()` then `bootWithFocus()` separately (like CurriculumScreen), no change needed — `bootWithFocus` sets `focusContext`, so StudyScreen shows the session directly. The blank state only occurs if `enterStudy()` is called with no `initialMode` AND no subsequent `bootWithFocus()`. This doesn't happen in any current code path — HomeScreen will always go through CourseHomepage now.

---

## 9. State Summary

### New State

| State | Location | Purpose |
|---|---|---|
| `screen === "courseHome"` | ScreenRouter | Routes to CourseHomepage |
| `enterStudy(course, initialMode)` | StudyContext | Optional mode pre-selection |

### Removed State/Behavior

| Item | Location | Removed? |
|---|---|---|
| `getCourseState()` | HomeScreen | Yes — state machine eliminated |
| `summaries` + `curriculumSummaries` | HomeScreen | Yes — data loading moves to CourseHomepage |
| `ModePicker` component | ModePicker.jsx | Yes — entire file deleted |
| `nudgeItem` / `suggestedMode` / `nudgeDismissed` | ModePicker | Yes — deleted with component |
| `selectMode("recap")` / `selectMode("explore")` | StudyContext | Yes — branches removed |
| `bootWithFocus({ type: "recap" })` / `{ type: "explore" }` | StudyContext | Yes — branches removed |
| `buildFocusedContext` recap/explore branches | study.js | Yes — 97 lines removed |
| Intent weights for recap/explore | StudyContext sendMessage | Yes — removed from weights object |
| `"RC"` / `"XP"` mode labels | InputBar | Yes — removed from ternary |

### Unchanged

- FSRS (unchanged)
- All DB tables (unchanged)
- `applySkillUpdates` (unchanged)
- `buildSystemPrompt` (unchanged — never had mode-specific content)
- Practice mode (unchanged)
- Assignment panel (unchanged)

---

## 10. Migration Impact

**Migration Impact:** None. No schema changes. No new tables. No existing table modifications. This is a pure frontend restructure.

---

## 11. New/Modified Files Summary

| File | Action | Lines (est.) |
|---|---|---|
| `src/screens/CourseHomepage.jsx` | **Create** | ~180 |
| `src/components/study/AssignmentPicker.jsx` | **Create** (extract from ModePicker) | ~140 |
| `src/components/study/SkillPicker.jsx` | **Create** (extract from ModePicker) | ~90 |
| `src/components/study/ExamScopePicker.jsx` | **Create** (extract from ModePicker) | ~60 |
| `src/components/TopBarButtons.jsx` | **Create** | ~25 |
| `src/components/study/ModePicker.jsx` | **Delete** | -662 |
| `src/screens/HomeScreen.jsx` | **Simplify** | ~212 → ~110 |
| `src/screens/StudyScreen.jsx` | **Modify** (sub-picker rendering, back button) | ~113 → ~120 |
| `src/ScreenRouter.jsx` | **Modify** (add courseHome route, fix notifs guard) | +3 lines |
| `src/StudyContext.jsx` | **Modify** (enterStudy param, remove recap/explore) | Net -15 lines |
| `src/lib/study.js` | **Modify** (remove recap/explore branches) | Net -97 lines |
| `src/components/study/InputBar.jsx` | **Modify** (remove RC/XP labels) | Net -4 lines |
| `src/screens/NotifsScreen.jsx` | **Modify** (app-level, remove course scoping) | ~5 line changes |
| 10 screens with Settings button | **Modify** (replace Settings with TopBarButtons) | ~1-2 lines each |

**Net:** +5 new files, -1 deleted file. Net LOC change: approximately -200 (ModePicker elimination is large, new files are focused).

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** Step 1
**Status:** Complete

### What Was Done
Blueprinted the complete course homepage restructure: CourseHomepage 3×2 card grid design with data loading strategy, ModePicker elimination plan with sub-picker extraction into 3 standalone components, StudyScreen state flow redesign, HomeScreen simplification, recap/explore removal reference map (every file and line), and app-level notifications with TopBarButtons component. Includes ScreenRouter changes, enterStudy modification, and state summary.

### Files Deposited
- `study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md` — This blueprint

### Files Created or Modified (Code)
- None (architecture step — no code changes)

### Decisions Made
- **Sub-pickers: standalone components** (Option A) — AssignmentPicker.jsx, SkillPicker.jsx, ExamScopePicker.jsx extracted from ModePicker rather than inlined in StudyScreen
- **Deadline nudge banner: eliminated** — card subtitles on CourseHomepage already surface urgency, making a separate banner redundant
- **Notifications: TopBarButtons component** — extracted shared component rather than duplicating markup in 10+ screens
- **NotifsScreen back button: navigates to "home"** — simplest universal back for app-level notifications
- **enterStudy: optional `initialMode` parameter** — backward-compatible approach for pre-selecting study mode from CourseHomepage cards

### Flags for CEO
- **Notification scope expansion (Open Question #3 from plan):** Blueprint keeps notifications as study-session events only. If ingestion/extraction notifications should also appear app-wide, that's a separate decision that doesn't affect this architecture.
- **Session intent DB string:** `Sessions.create` currently writes `intent: 'explore'` for all new sessions. Recommend changing to `'study'` for clarity, but it's cosmetic — no behavioral impact.

### Flags for Next Step
- **Step 2 developer** must create CourseHomepage.jsx, TopBarButtons.jsx, add courseHome route to ScreenRouter, simplify HomeScreen, add notifications buttons to all screens. Do NOT modify ModePicker or study.js (that's Step 3).
- **Step 3 developer** must extract sub-pickers from ModePicker before deleting it. Use the reference map in Section 5 for recap/explore cleanup. The `enterStudy(course, initialMode)` change should be done in Step 2 (needed for CourseHomepage card routing) or Step 3 (needed for sub-picker flow).
- **Sub-picker extraction:** Each picker consumes `useStudy()` directly — no prop changes needed. The `getUrgencyLevel`, `URGENCY_COLORS`, `formatNudgeDate` helpers from ModePicker should be copied into AssignmentPicker.jsx.
- **TopBarButtons** replaces individual Settings buttons on every screen. Each screen's top bar layout may need minor adjustment to accommodate the extra button.
