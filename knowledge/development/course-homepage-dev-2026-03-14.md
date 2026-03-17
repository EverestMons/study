# Course Homepage + App-Level Notifications — Development Log

**Date**: 2026-03-14
**Step**: 2 of 4 (Course Homepage Restructure)

## Output Receipt

### Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `src/screens/CourseHomepage.jsx` | ~170 | 3x2 card grid: Assignment Work, Exam Review, Skill Development, Curriculum, Materials, Schedule |
| `src/components/TopBarButtons.jsx` | ~25 | Shared Notifications + Settings button pair for top bar |

### Files Modified
| File | Change |
|------|--------|
| `src/ScreenRouter.jsx` | Added CourseHomepage import + route, removed `&& active` guard from notifs route, added screen transition fade (`key={screen}` + fadeIn) |
| `src/StudyContext.jsx` | `enterStudy(course, initialMode)` — optional second param calls `selectMode(initialMode)` after session creation |
| `src/screens/HomeScreen.jsx` | Full simplification: removed state machine (`getCourseState`), summaries state, data loading effects. All courses click → courseHome. Animated Add Course form. TopBarButtons. |
| `src/screens/NotifsScreen.jsx` | Made app-level: back → "home", removed active.name, TopBarButtons |
| `src/lib/theme.jsx` | Added `button:active` CSS for press feedback (scale 0.97 + purple tint) |
| `src/screens/StudyScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/MaterialsScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/ScheduleScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/CurriculumScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/ProfileScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/UploadScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/ManageScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |
| `src/screens/SkillsScreen.jsx` | Replaced Settings button with TopBarButtons, removed `setShowSettings` from destructure |

### Architecture Decisions
1. **TopBarButtons as shared component** — All 10 screens now render `<TopBarButtons />` instead of individual Settings buttons. Component handles Notifications + Settings internally via `useStudy()`.
2. **App-level notifications** — Notifs route no longer requires `active` course. Back navigates to "home". Unread count computed from `lastSeenNotif` timestamp.
3. **enterStudy initialMode** — Backward-compatible optional param. CourseHomepage cards pass "assignment"/"exam"/"skills" to pre-select study mode.
4. **Screen transition fades** — `<div key={screen}>` triggers React remount with `fadeIn` CSS animation on each navigation.
5. **Add Course polish** — Animated expand input with CSS transitions (opacity + translateX). Escape/blur collapses.

### Build Verification
- `npx vite build --mode development` — passes (177 modules, 3.56s)
- No new warnings beyond pre-existing chunk size and dynamic import advisories

### What's NOT in this step
- ModePicker elimination (Step 3)
- Recap/explore removal (Step 3)
- study.js changes (Step 3)
