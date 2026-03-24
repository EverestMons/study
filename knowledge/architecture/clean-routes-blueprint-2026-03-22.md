# Clean Navigation Routes — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

**Migration Impact:** None — purely frontend state and UI changes. No schema or migration impact.

---

## 1. Navigation Stack — State & Functions

### State declaration (StudyContext.jsx)
```javascript
// Replace:
const [previousScreen, setPreviousScreen] = useState("courseHome");

// With:
const [navStack, setNavStack] = useState([]);
```

### `navigateTo(target)` — push current screen, switch to target
```javascript
const navigateTo = (target) => {
  if (target === screen) return; // no-op if already there
  setNavStack(prev => [...prev, screen]);
  setScreen(target);
};
```

### `goBack()` — pop stack, switch to popped screen
```javascript
const goBack = () => {
  setNavStack(prev => {
    if (prev.length === 0) {
      setScreen("home");
      return [];
    }
    var next = prev.slice(0, -1);
    setScreen(prev[prev.length - 1]);
    return next;
  });
};
```

### `resetNav(target)` — clear stack and go to target (for error recovery / course deletion)
```javascript
const resetNav = (target) => {
  setNavStack([]);
  setScreen(target || "home");
};
```

### Context value updates
- **Remove from context:** `previousScreen`, `setPreviousScreen`
- **Add to context:** `navigateTo`, `goBack`
- **Keep in context:** `screen` (read-only for components), `setScreen` (only for ScreenRouter page transition — NOT for direct navigation by components)

Note: `setScreen` remains exposed only because `ScreenRouter.jsx` reads `screen` for the fade transition. Components must NOT call `setScreen` directly — they use `navigateTo` or `goBack`.

---

## 2. Remove Lateral Jumps — Replacement Behavior

### CurriculumScreen
| Line | Current | Replacement |
|---|---|---|
| 206 | `setScreen("materials")` — "Go to Materials" button | **Remove button.** Replace with text: `"Upload materials from Course Home to enable assignment decomposition."` |
| 488 | `setScreen("schedule")` — "Go to Schedule" button | **Remove button entirely.** |
| 492 | `setScreen("materials")` — "Materials" button | **Remove button entirely.** |

The empty state prompt (line 202-211) currently has two call-to-action buttons. Replace both with a single informational message and a `goBack()` button labeled "Back to Course Home".

The bottom empty state (line 480-498) currently has "Go to Schedule" and "Materials" buttons. Replace with a single `goBack()` button labeled "Back to Course Home".

### ScheduleScreen
| Line | Current | Replacement |
|---|---|---|
| 394 | `setScreen("curriculum")` — "View Curriculum" button | **Remove button entirely.** The curriculum summary info bar remains (it's informational), but the navigation button is removed. |

### ManageScreen
| Line | Current | Replacement |
|---|---|---|
| 35 | `setScreen("materials")` — "Materials" button | **Remove button.** Replace with text hint: `"Access Materials and Skills from Course Home."` |
| 46 | `setScreen("skills")` — "Skills" button | **Remove button entirely.** |

ManageScreen becomes a placeholder. The DEV should assess whether it can be removed entirely (all its functionality is accessible from CourseHomepage), but that's out of scope for this plan — just remove the lateral navigation buttons.

---

## 3. Complete Migration Checklist

Every `setScreen()` call site mapped to its replacement. Grouped by file.

### StudyContext.jsx
| Line | Current | Replacement | Notes |
|---|---|---|---|
| 64 | `useState("home")` | `useState("home")` | **Keep** — initialization |
| 65 | `useState("courseHome")` (previousScreen) | `useState([])` (navStack) | **Replace** state |
| 692 | `setScreen("materials")` | `navigateTo("materials")` | After addMats Phase 1 |
| 890-891 | `setPreviousScreen(screen); setActive(course); setScreen("study")` | `setActive(course); navigateTo("study")` | `enterStudy()` — stack handles previous automatically |
| 1132-1133 | `if (screen !== "study") setPreviousScreen(screen); setScreen("study")` | `if (screen !== "study") navigateTo("study")` | `bootWithFocus()` — guard prevents pushing study on study |
| 1385 | `setActive(null); setScreen("home")` | `setActive(null); resetNav("home")` | Course deletion — clear stack (course context lost) |

### TopBarButtons.jsx
| Line | Current | Replacement |
|---|---|---|
| 11 | `await loadProfile(); setScreen("profile")` | `await loadProfile(); navigateTo("profile")` |
| 17 | `setScreen("notifs"); setLastSeenNotif(Date.now())` | `navigateTo("notifs"); setLastSeenNotif(Date.now())` |

### HomeScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 52 | `setActive(c); setScreen("courseHome")` | `setActive(c); navigateTo("courseHome")` |

### CourseHomepage.jsx
| Line | Current | Replacement |
|---|---|---|
| 131 | `setScreen("curriculum")` | `navigateTo("curriculum")` |
| 137 | `setScreen("materials")` | `navigateTo("materials")` |
| 143 | `setScreen("schedule")` | `navigateTo("schedule")` |
| 152 | `setScreen("home")` | `goBack()` |

Line 125 (`enterStudy(active, "skills")`) — no change needed; `enterStudy` internally calls `navigateTo("study")`.

### MaterialsScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 395 | `setScreen("courseHome")` | `goBack()` |

### ScheduleScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 364 | `setScreen("courseHome")` | `goBack()` |
| 394 | `setScreen("curriculum")` | **REMOVE** — lateral jump |

### CurriculumScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 185 | `setScreen("courseHome")` | `goBack()` |
| 206 | `setScreen("materials")` | **REMOVE** — lateral jump. Replace with text + `goBack()` button |
| 488 | `setScreen("schedule")` | **REMOVE** — lateral jump |
| 492 | `setScreen("materials")` | **REMOVE** — lateral jump |

Line ~(bootWithFocus calls) — no change needed; `bootWithFocus` internally calls `navigateTo("study")`.

### SkillsScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 95 | `setScreen("courseHome")` | `goBack()` |

### ManageScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 21 | `setScreen("courseHome")` | `goBack()` |
| 35 | `setScreen("materials")` | **REMOVE** — lateral jump |
| 46 | `setScreen("skills")` | **REMOVE** — lateral jump |

### UploadScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 41 | `setScreen("home")` | `goBack()` |

### NotifsScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 17 | `setScreen("home")` | `goBack()` |

### ProfileScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 113 | `setScreen("home")` | `goBack()` |
| 457 | `setScreen("upload")` | `navigateTo("upload")` |

Lines 207, 409 (`enterStudy(course)`) — no change needed; `enterStudy` internally calls `navigateTo("study")`.

### StudyScreen.jsx
| Line | Current | Replacement |
|---|---|---|
| 47-48 | `const safeScreen = ...; setScreen(safeScreen)` | `goBack()` |
| 66-67 | `const safeScreen = ...; setScreen(safeScreen)` | `goBack()` |
| 75-76 | `const safeScreen = ...; setScreen(safeScreen)` | `goBack()` |

Remove the `safeScreen` computation and `previousScreen` destructuring.

### SessionSummary.jsx
| Line | Current | Replacement |
|---|---|---|
| 184-185 | `var safeScreen = ...; setScreen(safeScreen)` | `goBack()` |

Remove the `safeScreen` computation and `previousScreen` destructuring.

### ExtractionProgress.jsx
| Line | Current | Replacement |
|---|---|---|
| 19 | `setScreen("materials")` | `navigateTo("materials")` |

### ErrorDisplay.jsx
| Line | Current | Replacement |
|---|---|---|
| 49 | `setAsyncError(null); setScreen("home")` | `setAsyncError(null); resetNav("home")` |

---

## 4. Profile Study Session Return

**Flow:** Profile → `enterStudy(course)` → `navigateTo("study")` → stack is `[..., profile]` → session ends → `goBack()` → pops to Profile.

This works automatically with the stack. No special handling needed. The `enterStudy` function pushes the current screen (Profile) onto the stack and navigates to Study. When the session ends, `goBack()` returns to Profile.

If the user entered Profile from Materials: stack = `[home, courseHome, materials, profile]`. After starting practice and completing it: `goBack()` → Profile. Then `goBack()` → Materials. Full history preserved.

---

## 5. System-Initiated Navigation

| Trigger | Current | Replacement | Stack behavior |
|---|---|---|---|
| addMats completion | `setScreen("materials")` | `navigateTo("materials")` | Pushes current screen, user can back out |
| ExtractionProgress click | `setScreen("materials")` | `navigateTo("materials")` | Pushes current screen |
| Course deletion | `setScreen("home")` | `resetNav("home")` | Clears stack — course context is gone |
| Error recovery | `setScreen("home")` | `resetNav("home")` | Clears stack — error state is cleared |

---

## 6. Upload Screen Hierarchy

Upload remains accessible from wherever via `navigateTo("upload")`. Currently reachable from:
- ProfileScreen empty state (line 457)
- HomeScreen (through the add course flow, which is in StudyContext)

The stack handles back correctly regardless of origin. No hierarchy change needed.

---

## 7. Remove `previousScreen`

After migration, `previousScreen` and `setPreviousScreen` are fully replaced by the stack. Remove:
- `StudyContext.jsx:65` — state declaration
- `StudyContext.jsx:890` — `setPreviousScreen(screen)` in `enterStudy()`
- `StudyContext.jsx:1132` — `setPreviousScreen(screen)` in `bootWithFocus()`
- `StudyContext.jsx:~1606` — `previousScreen, setPreviousScreen` from context value
- `StudyContext.jsx:~1656` — `previousScreen` from useMemo deps
- `StudyScreen.jsx:23` — `previousScreen` destructuring
- `StudyScreen.jsx:47,66,75` — `safeScreen` computation using `previousScreen`
- `SessionSummary.jsx:11` — `previousScreen` destructuring
- `SessionSummary.jsx:184` — `safeScreen` computation using `previousScreen`

---

## 8. How to Verify

### Stack trace tests (manual or QA):
1. **Home → CourseHome → Materials → Profile → Back** — should return to Materials (stack: `[home, courseHome, materials]`)
2. **Home → CourseHome → Schedule → Notifs → Back** — should return to Schedule
3. **Home → Profile → Practice Skill → Study → Done → Back** — should return to Profile
4. **Home → CourseHome → Curriculum → Back** — should return to CourseHome
5. **Empty stack: Back from Home** — should stay on Home (goBack fallback)
6. **Course deletion while deep in stack** — should reset to Home with empty stack

### Lateral jump removal:
- CurriculumScreen should have NO buttons navigating to materials or schedule
- ScheduleScreen should have NO "View Curriculum" button
- ManageScreen should have NO Materials or Skills navigation buttons

### No direct setScreen:
- `grep -rn 'setScreen(' src/` should only show:
  - `useState("home")` in StudyContext
  - `setScreen(target)` inside `navigateTo`, `goBack`, `resetNav`
  - `setDisplayScreen(screen)` in ScreenRouter (fade transition — not navigation)

---

## Output Receipt
**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Designed the navigation stack system replacing `previousScreen` with a full `navStack` array. Mapped every `setScreen()` call site (40+ transitions) to `navigateTo()`, `goBack()`, or `resetNav()`. Specified lateral jump removals and replacement UI.

### Files Deposited
- `study/knowledge/architecture/clean-routes-blueprint-2026-03-22.md` — complete navigation stack blueprint with migration checklist

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- `navigateTo` skips push if already on target screen (prevents duplicate stack entries)
- `resetNav` introduced for error recovery and course deletion (clears stack + navigates)
- ManageScreen lateral buttons replaced with text hints rather than removed entirely (ManageScreen structure preserved)
- Upload screen hierarchy unchanged — stack handles back correctly from any origin
- `setScreen` remains exposed for ScreenRouter fade transition only

### Flags for CEO
- None

### Flags for Next Step
- ManageScreen becomes nearly empty after lateral button removal — DEV should note this but not restructure it (out of scope)
- The `screen` state and `setScreen` remain in context but components should only use `navigateTo`/`goBack` — `setScreen` is for ScreenRouter internal use only
- `previousScreen`/`setPreviousScreen` should be fully removed from all files
