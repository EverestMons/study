# Clean Navigation Routes — Full Diagnostic
**Date:** 2026-03-22

---

## 1. Screen State Management

**File:** `StudyContext.jsx:64-65`
```javascript
const [screen, setScreen] = useState("home");
const [previousScreen, setPreviousScreen] = useState("courseHome");
```

- **No navigation stack.** Only a single `previousScreen` value — one level of history.
- `previousScreen` is set by `enterStudy()` (line 890: `setPreviousScreen(screen)`) and `bootWithFocus()` (line 1132: `if (screen !== "study") setPreviousScreen(screen)`).
- Used only by StudyScreen and SessionSummary to return to the origin screen after a study session ends.

### Screen enum (from ScreenRouter.jsx:81-91)
| Value | Component | Requires `active` |
|---|---|---|
| `home` | HomeScreen | No |
| `courseHome` | CourseHomepage | Yes |
| `profile` | ProfileScreen | No |
| `upload` | UploadScreen | No |
| `manage` | ManageScreen | Yes |
| `materials` | MaterialsScreen | Yes |
| `skills` | SkillsScreen | Yes |
| `schedule` | ScheduleScreen | Yes |
| `curriculum` | CurriculumScreen | Yes |
| `notifs` | NotifsScreen | No |
| `study` | StudyScreen | Yes |

Settings is a **modal overlay** (`showSettings` state → `<SettingsModal />`), not a screen value.

---

## 2. All `setScreen()` Call Sites — Complete Navigation Graph

### Main Menu Level
| From | To | Trigger | File:Line |
|---|---|---|---|
| HomeScreen | `courseHome` | Click course card | HomeScreen.jsx:52 |
| HomeScreen | `profile` | TopBarButtons "View Profile" | TopBarButtons.jsx:11 |
| HomeScreen | `notifs` | TopBarButtons "Notifications" | TopBarButtons.jsx:17 |
| ErrorDisplay | `home` | "Back to Home" button | ErrorDisplay.jsx:49 |

### Course Level
| From | To | Trigger | File:Line |
|---|---|---|---|
| CourseHomepage | `home` | "< Back" button | CourseHomepage.jsx:152 |
| CourseHomepage | `curriculum` | "Curriculum" card click | CourseHomepage.jsx:131 |
| CourseHomepage | `materials` | "Materials" card click | CourseHomepage.jsx:137 |
| CourseHomepage | `schedule` | "Schedule" card click | CourseHomepage.jsx:143 |
| CourseHomepage | `study` | "Skill Development" card → `enterStudy()` | CourseHomepage.jsx:125 |
| CourseHomepage | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| CourseHomepage | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |

### Course Options Level
| From | To | Trigger | File:Line |
|---|---|---|---|
| MaterialsScreen | `courseHome` | "< Back" button | MaterialsScreen.jsx:395 |
| MaterialsScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| MaterialsScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |
| ScheduleScreen | `courseHome` | "< Back" button | ScheduleScreen.jsx:364 |
| ScheduleScreen | `curriculum` | "View Curriculum" button | ScheduleScreen.jsx:394 |
| ScheduleScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| ScheduleScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |
| CurriculumScreen | `courseHome` | "< Back" button | CurriculumScreen.jsx:185 |
| CurriculumScreen | `materials` | "Go to Materials" button (empty state) | CurriculumScreen.jsx:206 |
| CurriculumScreen | `schedule` | "Go to Schedule" button (empty state) | CurriculumScreen.jsx:488 |
| CurriculumScreen | `materials` | "Materials" button (empty state) | CurriculumScreen.jsx:492 |
| CurriculumScreen | `study` | `bootWithFocus()` — study a skill | CurriculumScreen via StudyContext:1133 |
| CurriculumScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| CurriculumScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |
| SkillsScreen | `courseHome` | "< Back" button | SkillsScreen.jsx:95 |
| SkillsScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| SkillsScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |
| ManageScreen | `courseHome` | "< Back" button | ManageScreen.jsx:21 |
| ManageScreen | `materials` | "Materials" button | ManageScreen.jsx:35 |
| ManageScreen | `skills` | "Skills" button | ManageScreen.jsx:46 |
| ManageScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| ManageScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |

### Study Screen
| From | To | Trigger | File:Line |
|---|---|---|---|
| StudyScreen | `previousScreen` (fallback: `courseHome`) | Exit session (no msgs) | StudyScreen.jsx:48 |
| StudyScreen | `previousScreen` (fallback: `courseHome`) | Exit session (short) | StudyScreen.jsx:67 |
| StudyScreen | `previousScreen` (fallback: `courseHome`) | Back to origin | StudyScreen.jsx:76 |
| StudyScreen | `profile` | TopBarButtons (pre-session only) | TopBarButtons.jsx:11 |
| StudyScreen | `notifs` | TopBarButtons (pre-session only) | TopBarButtons.jsx:17 |
| SessionSummary | `previousScreen` (fallback: `courseHome`) | "Done" button | SessionSummary.jsx:185 |

### Overlay Screens
| From | To | Trigger | File:Line |
|---|---|---|---|
| ProfileScreen | `home` | "< Back" button (top-level view) | ProfileScreen.jsx:113 |
| ProfileScreen | `upload` | "Go to Upload" (empty state) | ProfileScreen.jsx:457 |
| ProfileScreen | `study` | "Practice This Skill" → `enterStudy()` | ProfileScreen.jsx:409 |
| ProfileScreen | `study` | "Review Due Skills" → `enterStudy()` | ProfileScreen.jsx:207 |
| ProfileScreen | `profile` | TopBarButtons (self) | TopBarButtons.jsx:11 |
| ProfileScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |
| NotifsScreen | `home` | "< Back" button | NotifsScreen.jsx:17 |
| NotifsScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| NotifsScreen | `notifs` | TopBarButtons (self) | TopBarButtons.jsx:17 |
| UploadScreen | `home` | "< Back" button | UploadScreen.jsx:41 |
| UploadScreen | `profile` | TopBarButtons | TopBarButtons.jsx:11 |
| UploadScreen | `notifs` | TopBarButtons | TopBarButtons.jsx:17 |

### System-Initiated Navigation
| From | To | Trigger | File:Line |
|---|---|---|---|
| (any) | `materials` | After addMats Phase 1 completes | StudyContext.jsx:692 |
| (any) | `materials` | ExtractionProgress click (floating bar) | ExtractionProgress.jsx:19 |
| (any) | `home` | After deleting the active course | StudyContext.jsx:1385 |

---

## 3. Top Bar / Header Navigation

**Component:** `TopBarButtons.jsx` — rendered on **every screen** (13 screens include it).

Three buttons always accessible:
1. **View Profile** → `loadProfile(); setScreen("profile")` — navigates from ANY screen to profile
2. **Notifications** → `setScreen("notifs"); setLastSeenNotif(Date.now())` — navigates from ANY screen to notifs
3. **Settings** → `setShowSettings(true)` — opens modal overlay (not a screen transition)

**Gating:** TopBarButtons is hidden during active study sessions (`!inSession && <TopBarButtons />` at StudyScreen.jsx:104). On all other screens, it is always visible and always functional.

---

## 4. Back Button Behavior

**No universal back button.** Each screen hard-codes its own back destination:

| Screen | Back goes to | Mechanism |
|---|---|---|
| CourseHomepage | `home` | Hard-coded `setScreen("home")` |
| MaterialsScreen | `courseHome` | Hard-coded `setScreen("courseHome")` |
| ScheduleScreen | `courseHome` | Hard-coded `setScreen("courseHome")` |
| CurriculumScreen | `courseHome` | Hard-coded `setScreen("courseHome")` |
| SkillsScreen | `courseHome` | Hard-coded `setScreen("courseHome")` |
| ManageScreen | `courseHome` | Hard-coded `setScreen("courseHome")` |
| UploadScreen | `home` | Hard-coded `setScreen("home")` |
| NotifsScreen | `home` | Hard-coded `setScreen("home")` |
| ProfileScreen | `home` | Hard-coded `setScreen("home")` (or back to profile top-level if in domain drill-down) |
| StudyScreen | `previousScreen` or `courseHome` | Uses `previousScreen` state |
| SessionSummary | `previousScreen` or `courseHome` | Uses `previousScreen` state |

**Settings** closes its modal with `setShowSettings(false)` — returns to whatever screen was underneath. This is correct inward-path behavior.

**Key finding:** Only StudyScreen/SessionSummary use `previousScreen`. All other screens have hard-coded back targets. This means navigating Profile → Home always goes to Home, even if the user came from a course option screen.

---

## 5. Screen Hierarchy Violations

### CEO's intended hierarchy:
```
Main Menu (home)
  └→ Course Level (courseHome)
       └→ Course Options (materials, schedule, curriculum, study)

Inward-only: settings, notifications, profile
(go back to where you came from, don't jump to different screens)
```

### Violations found:

#### V1: TopBarButtons allows jumping from ANY screen to Profile or Notifications
- **Severity:** High
- **Example path:** Materials → Profile (via TopBarButtons) → Home (via Profile's back button)
  - User was in course-level Materials, ends up at Home, losing course context
- **Example path:** Schedule → Notifications (TopBarButtons) → Home (Notifs back button)
  - Same issue — user loses course context
- **Root cause:** Profile and Notifs have hard-coded back → `home`, but the user could have come from any screen

#### V2: Profile can launch study sessions for any course
- **Severity:** Medium
- **Example path:** Home → Profile → "Practice This Skill" → Study (for course X)
  - User jumps directly into a course's study session without going through course selection
  - `enterStudy()` sets `previousScreen` to "profile", so exiting study goes back to Profile (correct)
  - But this bypasses the Main Menu → Course → Study hierarchy

#### V3: Profile has "Go to Upload" button
- **Severity:** Low
- **Example path:** Profile (empty state) → Upload → Home
  - Crosses hierarchy levels: profile is inward-only, but navigates to upload

#### V4: Notifications and Profile back buttons always go to `home`
- **Severity:** High (core violation)
- If user is on CourseHomepage → clicks Notifications → clicks Back, they go to `home` instead of back to CourseHomepage
- If user is on Materials → clicks Profile → clicks Back, they go to `home` instead of Materials
- These screens should return to `previousScreen`, not hard-coded `home`

#### V5: Cross-navigation between course option screens
- **Severity:** Low-Medium
- CurriculumScreen → `materials` (line 206, 492), `schedule` (line 488) — lateral jumps between course options
- ScheduleScreen → `curriculum` (line 394) — lateral jump
- ManageScreen → `materials` (line 35), `skills` (line 46) — lateral jumps
- These are contextual ("Go to Materials" when materials needed) rather than arbitrary, but they break strict hierarchy

#### V6: ExtractionProgress floating bar → `materials` from any screen
- **Severity:** Low
- Clicking the floating progress bar navigates to materials regardless of current screen
- System-initiated, contextual — user expects this to go to materials

#### V7: addMats completion → `materials` from any screen
- **Severity:** Low
- After uploading materials, user is navigated to materials screen (line 692)
- System-initiated, expected behavior

---

## 6. Current Screen Categories

### (a) Main Menu screens
- `home` — course list, entry point

### (b) Course-level screens
- `courseHome` — course dashboard with option cards
- `upload` — add materials (currently accessible from home, not course-level)

### (c) Course option screens (require `active`)
- `materials` — material management
- `schedule` — weekly schedule
- `curriculum` — assignments and skill readiness
- `study` — tutoring/practice session
- `manage` — sub-menu (links to materials + skills)
- `skills` — skill tree view

### (d) Overlay/inward screens (should be inward-only)
- `profile` — skill profile (currently navigates to `home` on back)
- `notifs` — notifications (currently navigates to `home` on back)
- Settings — modal overlay (correctly returns to underlying screen)

### Screens that don't fit the hierarchy:
- **`upload`** — accessible from `home` (not course-gated) and from Profile empty state. Straddles main menu and course level.
- **`manage`** — a sub-menu under course options that navigates to `materials` and `skills`. Could be folded into courseHome.
- **`skills`** — only reachable from ManageScreen. No direct card on CourseHomepage.

---

## Summary

### Navigation graph edges: 40+ transitions
### Hard-coded back targets: 9 screens (only StudyScreen uses `previousScreen`)
### Critical violations:
1. **TopBarButtons on every screen** — Profile/Notifications accessible from anywhere, but their back buttons always go to `home`, losing context
2. **No navigation stack** — only `previousScreen` (single value, only used by StudyScreen)
3. **Cross-navigation between course options** — lateral jumps (Curriculum→Materials, Schedule→Curriculum) bypass courseHome

### To implement strict hierarchy, the fix would need to:
1. Make Profile and Notifications use `previousScreen` for their back button (or a proper nav stack)
2. Either remove TopBarButtons from course option screens, or make Profile/Notifs "inward" overlays (like Settings)
3. Decide whether cross-navigation between course options (Curriculum↔Materials↔Schedule) is allowed or must go through courseHome
