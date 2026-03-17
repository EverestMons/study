# study — Course Homepage Restructure (REVISED)
## Execution Plan
**Date:** 2026-03-14
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Unified course homepage with 3×2 card grid, ModePicker elimination, recap/explore removal, app-level notifications
**Scope Tier:** Medium (SA Blueprint → DEV → QA)

---

## Feature Summary

When a user clicks a course from the app home screen, they always land on a Course Homepage — a 3×2 card grid with generous spacing, no scrolling. Six cards: Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule. Each card routes directly to the relevant experience — no ModePicker intermediate step.

The ModePicker component is eliminated. Study-mode cards (Assignment Work, Exam Review, Skill Development) go straight to their respective sub-pickers (assignment picker, skill picker, exam scope picker) within the study screen.

"Recap Last Session" and "Explore Topic" modes are removed entirely. Session intent goes from 5 modes to 3: assignment, exam, skills.

Notifications become app-level (universal) — a bell icon next to the settings gear on every screen where settings appears, not scoped per-course.

## CEO Decisions (Locked In)

1. **Always land on Course Homepage** — no state machine, clicking a course = course homepage
2. **3×2 card grid (6 cards)** — Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule
3. **No scrolling** — generous spacing, everything visible
4. **ModePicker eliminated** — study-mode cards skip straight to sub-pickers
5. **Remove Recap mode** — gone everywhere
6. **Remove Explore mode** — gone everywhere
7. **Session intent: 3 modes** — assignment, exam, skills
8. **Notifications are app-level** — text button "Notifications" (not an icon/image) next to settings gear on every page that has settings, not per-course

## What Already Exists

### Routing (HomeScreen → ScreenRouter)
- `HomeScreen.jsx` (212 lines) — `getCourseState()` state machine routes to curriculum/schedule/materials/study. **Replaced: all courses → courseHome.**
- `ScreenRouter.jsx` (70 lines) — maps screen state to components. **Needs new courseHome route.**
- `enterStudy()` in StudyContext.jsx (line 707) — resets session state, enters study. **Still used but reached from CourseHomepage cards, not HomeScreen.**

### ModePicker.jsx (662 lines) — BEING ELIMINATED
- 5 mode buttons: assignment, recap, skills, exam, explore
- Sub-pickers: assignment picker, skill picker, exam scope picker, explore topic input
- Deadline nudge banner
- Spaced repetition fallback
- **The sub-pickers (assignment picker, skill picker, exam scope) need to be preserved and moved into the study screen directly. The mode selection wrapper around them is removed.**

### StudyScreen.jsx (111 lines)
- Layout shell that renders ModePicker (when no session) or MessageList + InputBar (during session)
- **Needs modification: instead of showing ModePicker, shows the appropriate sub-picker based on how the user entered (which card they clicked)**

### Session Intent System
- `sessionMode`: "assignment" | "recap" | "skills" | "exam" | "explore" → becomes "assignment" | "skills" | "exam"
- Intent weights: { assignment: 1.0, exam: 0.8, skills: 1.0, recap: 0.4, explore: 0.2 } → remove recap/explore
- `bootWithFocus()`: handles all 5 focus types → remove recap/explore branches
- `buildFocusedContext()`: branches for assignment, skill, exam, explore, recap → remove recap/explore

### Notifications
- `addNotif(type, text)` in StudyContext
- `notifs` state array, `showNotifs` state, `lastSeenNotif` state
- `NotifsScreen.jsx` (73 lines) — currently accessed from within a course
- Notification bell currently only appears in course context
- **Needs to become app-level: bell icon on every screen next to settings gear**

### Settings Gear
- Appears on HomeScreen and some course screens
- `showSettings` state toggle in StudyContext
- **Notification bell will sit adjacent to this**

---

## Execution Steps

### Step 1 — Architecture: Course Homepage + ModePicker Elimination Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SYSTEMS_ANALYST.md`
- This execution plan (all sections)
- `src/screens/HomeScreen.jsx`
- `src/ScreenRouter.jsx`
- `src/screens/StudyScreen.jsx`
- `src/components/study/ModePicker.jsx` (being eliminated — sub-pickers preserved)
- `src/StudyContext.jsx` lines 707-740 (enterStudy), 913-1000 (bootWithFocus), 1041-1060 (sendMessage)
- `src/lib/study.js` lines 1031-1200 (buildFocusedContext), 1415-1420 (buildSystemPrompt)
- `src/components/study/InputBar.jsx`
- `src/screens/NotifsScreen.jsx`

**Task:**

1. **CourseHomepage.jsx design:**
   - 3×2 card grid (CSS Grid), 6 cards: Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule
   - Each card: icon/emoji, title, contextual subtitle (e.g., "3 active · 1 overdue", "Exam in 5 days · 68% ready", "12 skills · 4 due", etc.)
   - Card sizing: fit 3×2 grid without scrolling on ~700px viewport height
   - Back button → app home
   - Data loading: parallel queries for card subtitle data
   - Card click routing:
     - Assignment Work → `enterStudy(course)` with pre-set mode "assignment", study screen shows assignment picker directly
     - Exam Review → `enterStudy(course)` with pre-set mode "exam", study screen shows exam scope picker directly
     - Skill Development → `enterStudy(course)` with pre-set mode "skills", study screen shows skill picker directly
     - Curriculum → `setScreen("curriculum")`
     - Materials → `setScreen("materials")`
     - Schedule → `setScreen("schedule")`

2. **ModePicker elimination:**
   - ModePicker.jsx (662 lines) is deleted as a component
   - The sub-pickers it contains must be identified and preserved:
     - Assignment picker (the list of assignments with readiness %)
     - Skill picker (the list of skills with strength %)
     - Exam scope picker (exam selection with material auto-scope)
   - Define where these sub-pickers live post-elimination:
     - Option A: Extract into standalone components (AssignmentPicker.jsx, SkillPicker.jsx, ExamScopePicker.jsx), render in StudyScreen based on sessionMode
     - Option B: Inline them in StudyScreen.jsx with conditional rendering
   - Recommend one approach. Option A is cleaner but more files.
   - The deadline nudge banner from ModePicker — does it move to CourseHomepage cards (as subtitle data) or is it eliminated?

3. **StudyScreen.jsx modification:**
   - Currently renders ModePicker when no session, MessageList + InputBar during session
   - Post-elimination: renders the appropriate sub-picker when `sessionMode` is set but no `focusContext` yet, then MessageList + InputBar once a focus is selected and AI boots
   - Define the new state flow: courseHome card click → enterStudy with mode → StudyScreen shows sub-picker → user picks → bootWithFocus → AI session

4. **HomeScreen simplification:**
   - Remove getCourseState() state machine
   - All course clicks → `setActive(course); setScreen("courseHome")`
   - Remove curriculum summary row
   - Simplify course cards

5. **Recap + Explore removal reference map:**
   - Full list of every file/line referencing recap or explore
   - What to remove vs modify for each

6. **App-level notifications:**
   - Current: notifs only accessible from within course context
   - New: text button "Notifications" next to settings gear on every screen that has settings
   - IMPORTANT: Do NOT use a bell icon or image — use a text button matching the Settings button style. Previous attempts to use bell icons caused issues.
   - Define: where does the button appear? Every screen that has the Settings button
   - Define: how does the notification count work? (unread count as "(3)" suffix on the button text)
   - Define: what happens on click? (show NotifsScreen as a sheet/modal? navigate to notifs?)
   - NotifsScreen should show all notifs across all courses (app-level, not course-scoped)

**Constraints:**
- No data model changes, FSRS untouched
- Sub-pickers must work identically to how they work inside ModePicker today
- CourseHomepage must not scroll
- Notification bell must appear on every screen that has settings

**Output deposit:** `study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md`
**Depends on:** None

---

### Step 2 — Development: CourseHomepage + Routing + App-Level Notifications
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: `study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md`
- `src/screens/HomeScreen.jsx`
- `src/ScreenRouter.jsx`
- `src/screens/NotifsScreen.jsx`
- `src/StudyContext.jsx`

**Task:**
1. Create `src/screens/CourseHomepage.jsx`:
   - 3×2 card grid, 6 cards per blueprint
   - Contextual subtitles with live data
   - Card routing per blueprint
   - Back button, no scrolling
2. Add "courseHome" route to ScreenRouter.jsx
3. Simplify HomeScreen.jsx:
   - Remove getCourseState() state machine
   - All courses → courseHome
   - Simplify course cards
4. App-level notifications:
   - Add "Notifications" text button next to settings gear on every screen that has settings
   - IMPORTANT: Do NOT use a bell icon/image — use a text button matching the Settings button style
   - Show unread count as "(3)" suffix on button text
   - Click → show notifications (per blueprint — sheet, modal, or navigate)
   - Notifications now app-level, not per-course
5. Screen transition fades:
   - Wrap ScreenRouter content in a container with `key={screen}` so React remounts on navigation
   - Apply the existing `fadeIn` animation from theme.jsx (`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`)
   - This gives all screen transitions a subtle fade+slide — approximately a 3-line change to ScreenRouter.jsx
6. Button press feedback:
   - Add global CSS `:active` state for all buttons in theme.jsx CSS array
   - Subtle scale-down (`transform: scale(0.97)`) + a slight purple tint (`background: rgba(139, 92, 246, 0.08)`) on press
   - Purple `#8B5CF6` is from the app's logo color palette (already used in loading animation books)
   - One CSS line: `"button:active{transform:scale(0.97);background-color:rgba(139,92,246,0.08) !important;transition:transform 0.1s}"`
   - The `!important` is intentional — it overrides inline styles briefly on press, then releases
7. Add Course interaction polish:
   - Default state: centered "Add Course" button below the course list, no text input visible
   - On click: text input fades/slides in from the left of the button, button shifts right to its current position
   - Uses a `showAddForm` state toggle with CSS transition (opacity + translateX) on the input
   - On Enter or button click (with text): create course, reset — input fades back out, button re-centers
   - On blur with empty input or Escape: collapse back to centered button
8. Verify build passes

**Constraints:**
- Do NOT modify ModePicker or study.js yet (that's Step 3)
- Do NOT remove recap/explore yet (that's Step 3)
- CourseHomepage data loading must not block render

**Output deposit:** `study/knowledge/development/course-homepage-dev-2026-03-14.md`
**Depends on:** Step 1

---

### Step 3 — Development: ModePicker Elimination + Recap/Explore Removal
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 1 deposit: blueprint (ModePicker elimination plan + recap/explore reference map)
- Step 2 deposit: dev log
- `src/components/study/ModePicker.jsx` (being deleted)
- `src/screens/StudyScreen.jsx`
- `src/components/study/InputBar.jsx`
- `src/StudyContext.jsx`
- `src/lib/study.js`

**Task:**
1. **Extract sub-pickers from ModePicker** (per blueprint):
   - Assignment picker, skill picker, exam scope picker → standalone components or inlined in StudyScreen
   - Preserve all picker functionality (readiness %, strength display, auto-scope, deadline badges)
2. **Modify StudyScreen.jsx:**
   - When sessionMode is set but no focusContext: render the appropriate sub-picker
   - When focusContext is set: render MessageList + InputBar (AI session)
   - No ModePicker wrapper
3. **Delete ModePicker.jsx** after sub-pickers are extracted
4. **Remove recap and explore from everywhere:**
   - StudyContext: bootWithFocus branches, intent weights, session state
   - study.js: buildFocusedContext branches, buildSystemPrompt (5→3 modes)
   - InputBar: mode labels (remove RC, XP)
   - buildDeadlineContext: remove "explore excluded" comment
5. **Wire CourseHomepage cards to study screen:**
   - Assignment Work → enterStudy with mode "assignment" → StudyScreen shows assignment picker
   - Exam Review → enterStudy with mode "exam" → StudyScreen shows exam scope picker
   - Skill Development → enterStudy with mode "skills" → StudyScreen shows skill picker
6. Verify build passes
7. Grep for remaining "recap", "explore", "ModePicker" references

**Constraints:**
- Sub-pickers must work identically to today
- Assignment, skills, exam modes unaffected
- FSRS untouched
- No data model changes

**Output deposit:** `study/knowledge/development/modepicker-elimination-2026-03-14.md`
**Depends on:** Step 2

---

### Step 4 — QA: Full Feature Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
- Step 1 deposit: blueprint
- Steps 2-3 deposits: dev logs
- All modified source files

**Task:**

**Course Homepage:**
1. Click course from home → lands on CourseHomepage (not study/curriculum/schedule)
2. 6 cards visible in 3×2 grid, no scrolling
3. Cards show contextual subtitles with live data
4. Back button returns to home

**Card Routing:**
5. Assignment Work → study screen with assignment picker (no ModePicker)
6. Exam Review → study screen with exam scope picker (no ModePicker)
7. Skill Development → study screen with skill picker (no ModePicker)
8. Curriculum → CurriculumScreen
9. Materials → MaterialsScreen
10. Schedule → ScheduleScreen

**ModePicker Elimination:**
11. ModePicker.jsx no longer exists in codebase
12. No "select a mode" intermediate screen anywhere in the flow
13. Sub-pickers (assignment, skill, exam) work identically to before
14. Deadline nudge handled per blueprint

**Mode Removal:**
15. No recap or explore references in source files (grep verify)
16. System prompt documents 3 modes only
17. Intent weights: only assignment, exam, skills
18. buildFocusedContext: only assignment, skill, exam branches

**App-Level Notifications:**
19. Bell icon visible next to settings gear on HomeScreen
20. Bell icon visible next to settings gear on CourseHomepage
21. Bell icon visible on study screen (if settings accessible)
22. Unread count badge displays correctly
23. Click bell → shows notifications
24. Notifications are app-level (not course-scoped)

**Session Integrity:**
25. Assignment flow end-to-end (pick → AI teaches → skill updates)
26. Skills flow end-to-end
27. Exam flow end-to-end
28. FSRS integrity unaffected

**Regression:**
29. All screens accessible from CourseHomepage
30. ProfileScreen accessible from app home
31. Build passes: `npx vite build --mode development`
32. No console errors

Classify: 🔴 Critical / 🟡 Minor / 🔵 Advisory

**Output deposit:** `study/knowledge/qa/course-homepage-qa-2026-03-14.md`
**Depends on:** Steps 2, 3

---

## Dependency Chain

```
Step 1 (SA Blueprint) → Step 2 (DEV: CourseHomepage + Notifications) → Step 3 (DEV: ModePicker Elimination + Mode Removal) → Step 4 (QA)
```

---

## Knowledge Base Deposits (Expected)

| Step | File | Location |
|---|---|---|
| 1 | Course homepage blueprint | `study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md` |
| 2 | CourseHomepage + notifications dev log | `study/knowledge/development/course-homepage-dev-2026-03-14.md` |
| 3 | ModePicker elimination dev log | `study/knowledge/development/modepicker-elimination-2026-03-14.md` |
| 4 | QA report | `study/knowledge/qa/course-homepage-qa-2026-03-14.md` |

---

## Open Questions for CEO During Execution

1. **Deadline nudge banner:** ModePicker currently has a nudge banner showing the most urgent deadline. Where does this go? Options: (a) becomes subtitle text on the relevant card on CourseHomepage, (b) becomes a banner at the top of CourseHomepage, (c) eliminated since card subtitles already surface urgency. SA will recommend.

2. **Sub-picker extraction approach:** SA will recommend whether to extract assignment/skill/exam pickers into standalone component files or inline them in StudyScreen. Both work; it's a code organization choice.

3. **Notification scope expansion:** Currently notifications are generated during study sessions (skill updates, mastery events). With app-level notifications, should ingestion/extraction notifications also appear? Or keep it to study session events only?
