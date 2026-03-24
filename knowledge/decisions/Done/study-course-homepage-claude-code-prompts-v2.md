# study — Course Homepage Restructure (REVISED) — Claude Code Prompts

Run each step as a separate Claude Code session in order.

---

## Step 1 — Architecture: Course Homepage + ModePicker Elimination Blueprint

```
You are the Study Systems Analyst. Read your agent file at study/agents/STUDY_SYSTEMS_ANALYST.md.

Before starting, read these files:
- study/knowledge/decisions/course-homepage-plan-2026-03-14.md
- src/screens/HomeScreen.jsx
- src/ScreenRouter.jsx
- src/screens/StudyScreen.jsx
- src/components/study/ModePicker.jsx (being eliminated — sub-pickers preserved)
- src/StudyContext.jsx (lines 707-740 for enterStudy, lines 913-1000 for bootWithFocus, lines 1041-1060 for sendMessage)
- src/lib/study.js (lines 1031-1200 for buildFocusedContext, lines 1415-1420 for buildSystemPrompt)
- src/components/study/InputBar.jsx
- src/screens/NotifsScreen.jsx

TASK:

Blueprint the course homepage, ModePicker elimination, and app-level notifications:

1. CourseHomepage.jsx design:
   - 3x2 card grid (CSS Grid), 6 cards: Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule
   - Each card: icon/emoji, title, contextual subtitle (e.g., "3 active · 1 overdue", "Exam in 5 days · 68% ready", "12 skills · 4 due", "8 materials", "2 overdue")
   - Card sizing: fit 3x2 grid without scrolling on ~700px viewport height
   - Back button to app home
   - Data loading: parallel queries for card subtitle data
   - Card routing:
     - Assignment Work → enterStudy with mode "assignment" → study screen shows assignment picker directly
     - Exam Review → enterStudy with mode "exam" → study screen shows exam scope picker directly
     - Skill Development → enterStudy with mode "skills" → study screen shows skill picker directly
     - Curriculum → setScreen("curriculum")
     - Materials → setScreen("materials")
     - Schedule → setScreen("schedule")

2. ModePicker elimination:
   - ModePicker.jsx (662 lines) is deleted as a component
   - Identify and preserve the sub-pickers it contains: assignment picker, skill picker, exam scope picker
   - Define where sub-pickers live post-elimination: standalone components (AssignmentPicker.jsx, SkillPicker.jsx, ExamScopePicker.jsx) rendered in StudyScreen based on sessionMode? Or inlined in StudyScreen? Recommend one approach.
   - Deadline nudge banner from ModePicker — where does it go? Card subtitles on CourseHomepage, banner on CourseHomepage, or eliminated?

3. StudyScreen.jsx modification:
   - Currently renders ModePicker when no session, MessageList + InputBar during session
   - New flow: renders the appropriate sub-picker when sessionMode is set but no focusContext, then MessageList + InputBar once focus is selected
   - Define state flow: courseHome card → enterStudy with mode → StudyScreen shows sub-picker → user picks → bootWithFocus → AI session

4. HomeScreen simplification:
   - Remove getCourseState() state machine
   - All course clicks → setActive(course); setScreen("courseHome")
   - Simplify course cards

5. Recap + Explore removal reference map:
   - Full list of every file/line referencing recap or explore
   - What to remove vs modify for each

6. App-level notifications:
   - "Notifications" text button next to settings gear on every screen that has settings
   - IMPORTANT: Do NOT use a bell icon or image — use a text button matching the Settings button style. Previous attempts to render bell icons caused issues.
   - Unread count shown as "(3)" suffix on button text
   - Click behavior (sheet, modal, or navigate to NotifsScreen)
   - NotifsScreen: show all notifs across all courses (app-level, not course-scoped)
   - Button appears on every screen that has the Settings button

CONSTRAINTS:
- No data model changes, FSRS untouched
- Sub-pickers must work identically to how they work inside ModePicker today
- CourseHomepage must not scroll on standard viewport
- Notifications button on every screen that has settings

When complete, write your output to study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 2 — Development: CourseHomepage + Routing + App-Level Notifications

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md
- src/screens/HomeScreen.jsx
- src/ScreenRouter.jsx
- src/screens/NotifsScreen.jsx
- src/StudyContext.jsx

TASK:

1. Create src/screens/CourseHomepage.jsx:
   - 3x2 card grid, 6 cards (Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule)
   - Contextual subtitles with live data per blueprint
   - Card routing per blueprint
   - Back button, no scrolling, generous spacing

2. Add "courseHome" route to ScreenRouter.jsx

3. Simplify HomeScreen.jsx:
   - Remove getCourseState() state machine
   - All courses → setActive(course); setScreen("courseHome")
   - Remove curriculum summary row
   - Simplify course cards to name + material count + urgency signals

4. App-level notifications:
   - Add "Notifications" text button next to settings gear on every screen that has settings
   - IMPORTANT: Do NOT use a bell icon or image — use a text button matching the Settings button style. Previous attempts to render bell icons caused issues.
   - Show unread count as "(3)" suffix on button text
   - Click → show notifications per blueprint
   - Notifications now app-level, not per-course

5. Screen transition fades:
   - Wrap ScreenRouter content in a container with key={screen} so React remounts on navigation
   - Apply the existing fadeIn animation from theme.jsx (@keyframes fadeIn from opacity:0 translateY(6px) to opacity:1 translateY(0))
   - This gives all screen transitions a subtle fade+slide — small change to ScreenRouter.jsx

6. Button press feedback:
   - Add global CSS :active state for all buttons in theme.jsx CSS array
   - Subtle scale-down (transform: scale(0.97)) + a slight purple tint (background: rgba(139, 92, 246, 0.08)) on press
   - Purple #8B5CF6 is from the app's logo palette (used in loading animation)
   - One CSS line in the CSS array: "button:active{transform:scale(0.97);background-color:rgba(139,92,246,0.08) !important;transition:transform 0.1s}"

7. Add Course interaction polish on HomeScreen:
   - Default state: centered "Add Course" button below the course list, no text input visible
   - On click: text input fades/slides in from the left of the button, button shifts right to its current position
   - Use a showAddForm state toggle with CSS transition (opacity + translateX) on the input
   - On Enter or button click with text: create course, reset — input fades out, button re-centers
   - On blur with empty input or Escape: collapse back to centered button

8. Verify build passes: npx vite build --mode development

CONSTRAINTS:
- Do NOT modify ModePicker or study.js yet (that's Step 3)
- Do NOT remove recap/explore yet (that's Step 3)
- CourseHomepage data loading must not block render

When complete, write your development log to study/knowledge/development/course-homepage-dev-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 3 — Development: ModePicker Elimination + Recap/Explore Removal

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md (ModePicker elimination plan + recap/explore reference map)
- study/knowledge/development/course-homepage-dev-2026-03-14.md
- src/components/study/ModePicker.jsx (being deleted)
- src/screens/StudyScreen.jsx
- src/components/study/InputBar.jsx
- src/StudyContext.jsx
- src/lib/study.js

TASK:

1. Extract sub-pickers from ModePicker (per blueprint):
   - Assignment picker, skill picker, exam scope picker → standalone components or inlined per blueprint recommendation
   - Preserve all picker functionality (readiness %, strength display, auto-scope, deadline badges)

2. Modify StudyScreen.jsx:
   - When sessionMode is set but no focusContext: render the appropriate sub-picker
   - When focusContext is set: render MessageList + InputBar (AI session)
   - No ModePicker wrapper

3. Delete ModePicker.jsx after sub-pickers are extracted

4. Remove recap and explore from everywhere:
   - StudyContext: bootWithFocus branches, intent weights, session state
   - study.js: buildFocusedContext branches, buildSystemPrompt (5 → 3 modes), buildDeadlineContext
   - InputBar: mode labels (remove RC, XP)

5. Wire CourseHomepage cards to study screen:
   - Assignment Work → enterStudy with mode "assignment" → StudyScreen shows assignment picker
   - Exam Review → enterStudy with mode "exam" → StudyScreen shows exam scope picker
   - Skill Development → enterStudy with mode "skills" → StudyScreen shows skill picker

6. Verify build passes: npx vite build --mode development

7. Grep for remaining "recap", "explore", "ModePicker" references — clean up all

CONSTRAINTS:
- Sub-pickers must work identically to today
- Assignment, skills, exam modes unaffected
- FSRS untouched, no data model changes

When complete, write your development log to study/knowledge/development/modepicker-elimination-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 4 — QA: Full Feature Verification

```
You are the Study Security & Testing Analyst. Read your agent file at study/agents/STUDY_SECURITY_TESTING_ANALYST.md.

Before starting, read these files:
- study/knowledge/architecture/course-homepage-blueprint-2026-03-14.md
- study/knowledge/development/course-homepage-dev-2026-03-14.md
- study/knowledge/development/modepicker-elimination-2026-03-14.md
- All modified source files referenced in dev logs

TASK:

Test the following scenarios:

Course Homepage:
1. Click course from home → lands on CourseHomepage (not study/curriculum/schedule)
2. 6 cards visible in 3x2 grid, no scrolling
3. Cards show contextual subtitles with live data
4. Back button returns to home

Card Routing:
5. Assignment Work → study screen with assignment picker (no ModePicker)
6. Exam Review → study screen with exam scope picker (no ModePicker)
7. Skill Development → study screen with skill picker (no ModePicker)
8. Curriculum → CurriculumScreen
9. Materials → MaterialsScreen
10. Schedule → ScheduleScreen

ModePicker Elimination:
11. ModePicker.jsx no longer exists in codebase
12. No "select a mode" intermediate screen anywhere
13. Sub-pickers work identically to before
14. Deadline nudge handled per blueprint

Mode Removal:
15. No recap or explore references in source files (grep verify)
16. System prompt documents 3 modes only
17. Intent weights: only assignment, exam, skills
18. buildFocusedContext: only assignment, skill, exam branches

App-Level Notifications:
19. "Notifications" text button visible next to settings on HomeScreen (NOT a bell icon)
20. "Notifications" text button visible next to settings on CourseHomepage
21. "Notifications" text button visible on study screen if settings accessible
22. Unread count shows as "(N)" suffix on button text
23. Click notifications button → shows notifications
24. Notifications are app-level (all courses)

Session Integrity:
25. Assignment flow end-to-end
26. Skills flow end-to-end
27. Exam flow end-to-end
28. FSRS integrity unaffected

Regression:
29. All screens accessible from CourseHomepage
30. ProfileScreen accessible from app home
31. Build passes: npx vite build --mode development
32. No console errors

Classify: 🔴 Critical / 🟡 Minor / 🔵 Advisory

When complete, write your output to study/knowledge/qa/course-homepage-qa-2026-03-14.md and include an Output Receipt at the bottom.
```
