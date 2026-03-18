# Background Extraction — UX Validation Report
**Date:** 2026-03-17
**Validator:** Study UX Validator (automated)
**Build:** v0.2.6 (post background-extraction implementation)
**Scope:** End-to-end learner experience during background skill extraction

---

## Summary Table

| # | Criterion | Rating |
|---|-----------|--------|
| 1 | Non-blocking feels natural | **Acceptable** |
| 2 | Progress indicator visibility (ExtractionProgress banner) | **Good** |
| 3 | MaterialsScreen inline progress | **Good** |
| 4 | Navigation confidence | **High** |
| 5 | Completion notification | **Adequate** |
| 6 | Learning science — progressive skill availability | **Acceptable** |

**Overall Verdict: Ship with notes**

---

## Detailed Analysis

### 1. Non-blocking feels natural
**Rating: Acceptable**

**Phase 1 to Phase 2 transition trace:**

1. `createCourse` sets `setGlobalLock({ message: "Creating course..." })` (line 580) — triggers `GlobalLockOverlay` as a full-screen return in `ScreenRouter` (line 59: `if (globalLock) return <GlobalLockOverlay />`).
2. Phase 1 work proceeds (store documents, parse syllabi, mark assignments).
3. `setGlobalLock(null)` (line 650) + `setScreen("materials")` (line 651) — overlay disappears, MaterialsScreen renders.
4. `setBgExtraction(...)` (line 658) initializes background tracking state.
5. `runBackgroundExtraction(courseId, extractable)` fires without `await` (line 666).

**Assessment:**

The transition itself is mechanically clean. The `globalLock` clearing and screen navigation happen in the same synchronous batch, so React will commit both in a single paint — no intermediate frame where neither the overlay nor MaterialsScreen is visible. The `fadeIn 0.25s ease` animation on the `<div key={screen}>` wrapper in ScreenRouter (line 81) provides a gentle visual transition.

However, there is a potential perceptual gap: the user goes from a full-screen "please wait" overlay (`GlobalLockOverlay` with 90% black background, centered card, pulsing dots) directly to the full MaterialsScreen. The immediate visual shift from "you're locked out" to "you're free to browse" is abrupt. There is no transitional message explaining what changed. The `addNotif("success", "Course created. Extracting skills in the background...")` (line 656) fires as a notification, but notifications in this app are stored in a list (`setNotifs`) — they don't appear as a transient toast overlay on the MaterialsScreen. The user would need to navigate to NotifsScreen or see the notification badge to understand the message.

The saving grace: when `bgExtraction` is active, the compact material cards on MaterialsScreen immediately show a pulsing animated status dot (via `processingMatId` driving `getMaterialState` to return `"reading"` or `"analyzing"` or `"extracting"`, which maps to a pulsing accent-colored dot). This visual cue signals that work is continuing. But it requires the user to notice the dot on the specific material card — there is no banner-level explanation on MaterialsScreen itself (the `ExtractionProgress` banner is hidden when `screen === "materials"`, per ScreenRouter line 83).

**Gap:** A first-time user completing course creation might not immediately understand that extraction is happening in the background. The Phase 1 lock disappears, they see MaterialsScreen, but the only cue is a small pulsing dot on a material card (which may be collapsed in a group by default — `collapsedGroups` is initialized to contain all groups, lines 75-80). If the material groups are all collapsed, the user sees zero indication of background work on MaterialsScreen.

### 2. Progress indicator visibility (ExtractionProgress banner)
**Rating: Good**

**Implementation analysis (`ExtractionProgress.jsx`):**

- Fixed positioning: `bottom: 16px`, centered horizontally (`left: 50%`, `translateX(-50%)`)
- Dark glass background: `rgba(15,17,21,0.92)` with `backdropFilter: blur(8px)` — visually distinct from page content
- Width: `maxWidth: 480`, `width: 90%` — prominent but not full-width
- zIndex: 100 — above content, below modals (2000)
- Entrance animation: `fadeIn 0.3s ease`

**Information density at a glance:**
- Pulsing accent-colored dot (8x8, `pulse 1.5s` animation) — immediately signals "active"
- Material name (truncated with ellipsis) — tells user what is being processed
- Progress count `(N/M)` — materials completed vs total
- Thin progress bar (3px) with smooth transition (`width 0.4s ease`)
- Status text below (font-size 11, muted color) — chapter-level detail like "Calc Textbook -- Chapter 4: 12 skills"
- Cancel button (red border, 11px font, `e.stopPropagation()` prevents navigation)

**Discoverability of click-to-navigate:**
The entire banner has `cursor: pointer` and `onClick={() => setScreen("materials")}`. However, there is no visual affordance (no arrow icon, no "View details" text, no hover state change) to indicate it is clickable. A user unfamiliar with the UI might not realize they can click it. The cursor change to pointer is the only hint.

**Distraction level during studying:**
The banner is positioned at the bottom, out of the main content flow. The 3px progress bar and 11px status text are subtle. The pulsing dot is the most attention-drawing element but is small (8px). During a study session (StudyScreen), the chat interface fills most of the viewport, and the banner would sit at the bottom without overlapping interactive elements. The `maxWidth: 480` keeps it compact.

However, on screens with bottom-aligned content (like a long scrollable list), the fixed banner could overlap the last item. There is no bottom padding adjustment on other screens to account for the banner's height (~60-70px including padding and status text).

**Completion state:**
When `allDone` is true: pulsing dot disappears, text changes to "Extraction complete", progress bar turns green (`T.gn`), Cancel button disappears, status text hidden. This is a clean terminal state before the 3s auto-clear.

### 3. MaterialsScreen inline progress
**Rating: Good**

**Per-material status rendering:**

The status system is driven by `getMaterialState(mat)` in StudyContext (lines 154-186), which produces states: `queued`, `reading`, `analyzing`, `extracting`, `ready`, `incomplete`, `partial`, `critical_error`.

On MaterialsScreen:
- **Compact card (collapsed):** Shows a colored status dot in the top-right corner. Active materials (`reading`/`analyzing`/`extracting`) get an animated pulsing dot with accent border. The `statusDot()` function maps states to colors (green=ready, accent=active, muted=queued, amber=incomplete, red=error).
- **Expanded card:** Shows a full badge with label ("Finding skills...", "Reading file...", etc.), progress bar, section count, and a Stop button.

**Chapter-level progress:**

Within the expanded card during `isProcessing` state, the progress bar shows `extracted.length / chunks.length * 100` percentage. The status text updates via the `onChapterComplete` callback, which fires `setStatus(mat.name + " -- " + ch + ": " + cnt + " skills")`. This appears in the `ExtractionProgress` banner (via `status` state), but on MaterialsScreen itself, the expanded card shows `"Extracting skills... N found"` (line 203) using `trust.skillCount`. The raw `status` string is NOT rendered inline on MaterialsScreen — it only appears in `ExtractionProgress`.

So chapter-by-chapter naming (e.g., "Chapter 4: 12 skills") is visible in the floating banner but NOT on MaterialsScreen's expanded card. The expanded card instead shows the cumulative skill count and section-level progress bar.

**Visual consistency:**
The badge system (`badges` object, lines 143-152) uses consistent colors and shapes across all states. Processing states get a pulsing dot + accent background. Error states get red. Incomplete gets amber. Ready gets green checkmark. This is consistent with the overall design language.

**Collapsed group issue:**
As noted in criterion 1, all material groups start collapsed (lines 75-80: `collapsedGroups` initialized to `new Set(groupOrder)`). A user arriving at MaterialsScreen after course creation would see only group headers (e.g., "Textbooks (3)") with no visible cards or progress indicators. They must manually expand a group to see the pulsing status dots.

### 4. Navigation confidence
**Rating: High**

**Banner appearance on navigation away:**

`ScreenRouter.jsx` line 83: `{bgExtraction && screen !== "materials" && <ExtractionProgress />}`

This is correct and comprehensive. The banner appears on every screen except MaterialsScreen when `bgExtraction` is non-null. The condition is checked on every render, so navigating from MaterialsScreen to CurriculumScreen immediately shows the banner (via React's state-driven rendering).

**Persistence:**
The banner remains visible for the entire duration of extraction. It only disappears when `bgExtraction` is set to `null`, which happens:
1. On extraction completion: `setTimeout(() => setBgExtraction(null), 3000)` (line 573)
2. On single-material retry completion: `setTimeout(() => setBgExtraction(null), 2000)` (MaterialsScreen line 247)

Between these events, the banner is always present regardless of screen navigation.

**Invisible extraction scenario check:**
- On MaterialsScreen with `bgExtraction` active: Banner hidden, but inline progress is visible via `processingMatId` driving `getMaterialState`. The pulsing dots on material cards indicate activity. **HOWEVER:** if all groups are collapsed, the inline progress is invisible. This is a gap — there is no banner and no visible card-level progress on MaterialsScreen when groups are collapsed.
- On any other screen: Banner is visible.
- During `dupPrompt` modal: The `DupPromptModal` renders at zIndex 2000, which is above the banner (zIndex 100). The banner remains rendered underneath but is partially obscured by the modal's full-screen `rgba(0,0,0,0.8)` backdrop. This is acceptable — the modal demands attention and the user understands extraction is paused for their decision.

**One edge case:** If `bgExtraction` is set but `screen === "materials"` AND all groups are collapsed AND the user has not expanded any card — extraction is running with zero visual indicators. This scenario is unlikely (the user would have just been sent to MaterialsScreen by `createCourse` and would likely explore), but it is technically possible.

### 5. Completion notification
**Rating: Adequate**

**End-of-extraction trace (`runBackgroundExtraction` lines 565-573):**

```js
// Cleanup
setProcessingMatId(null);
setStatus("");
const refreshed = await loadCoursesNested();
const rc = refreshed.find(c => c.id === courseId);
if (rc) { setCourses(refreshed); setActive(rc); }
await refreshMaterialSkillCounts(courseId);
addNotif("success", "Extraction complete.");
setTimeout(() => setBgExtraction(null), 3000);
```

**Sequence:**
1. `setProcessingMatId(null)` + `setStatus("")` — material cards update to their final state (ready/error/partial). The `ExtractionProgress` banner loses its status text.
2. Data refresh — courses reloaded, skill counts updated. Material cards reflect final extracted/failed status.
3. `addNotif("success", "Extraction complete.")` — notification added to the list. Not displayed as a toast; stored in `notifs` state array.
4. `setTimeout(() => setBgExtraction(null), 3000)` — banner persists for 3 seconds showing "Extraction complete" with green progress bar, then disappears.

**"Complete" state in banner:**
In `ExtractionProgress`, when `allDone` (all materials are done/skipped/error), the banner shows:
- No pulsing dot
- "Extraction complete" text
- Green progress bar at 100%
- No cancel button
- No status text

This is a clear visual terminal state. The 3-second window gives the user time to notice the completion before the banner fades. However, there is no explicit fade-out animation — the banner simply unmounts when `bgExtraction` becomes null. A fade-out would be smoother.

**Notification delivery:**
`addNotif("success", "Extraction complete.")` appends to the notification list. The user must check the NotifsScreen or notice the unread badge to see this message. There is no transient toast that appears on the current screen. If the user is on CurriculumScreen studying, they see the banner change to "complete" for 3 seconds, then it disappears. The notification badge on the nav may or may not be visible depending on the screen layout.

**3-second auto-clear assessment:**
Three seconds is sufficient for the user to register the completion if they are actively looking at the screen. However, if the user is reading content or focused elsewhere, they may miss the brief completion state entirely. Five seconds would be more forgiving, but 3s is defensible for a non-critical status indicator.

### 6. Learning science — progressive skill availability
**Rating: Acceptable**

**Incremental skill availability:**

As `runBackgroundExtraction` processes materials one by one, each material's chapters are extracted sequentially. The `onChapterComplete` callback fires after each chapter, and the data is committed to the database within `runExtractionV2`. Skills become queryable immediately after their chapter is committed.

On CurriculumScreen, skill data is loaded via `loadSkillsV2()` and `computeFacetReadiness()` (per memory notes). These load from the database, so they will reflect whatever has been extracted at the time of the query. If the user navigates to CurriculumScreen mid-extraction, they will see a partial skill set.

**Confusion risk:**

A student who uploads a 400-page textbook might see "15 skills" on CurriculumScreen while only Chapter 1-3 have been processed. They have no way to know that the textbook has 20 chapters and 150 skills total. The `ExtractionProgress` banner shows `(1/3 materials)` — material-level progress — but NOT chapter-level detail like "Chapter 3/20". The `status` text shows "Calc Textbook -- Chapter 4: 12 skills" but this is a transient status string, not a permanent indicator.

On MaterialsScreen, the expanded card shows section-level progress as a percentage bar (`extracted.length / chunks.length * 100%`), but this only appears when the card is expanded and only for the currently-processing material.

**Expectation setting:**

The `(N/M materials)` count in the banner sets expectations at the material level ("2 of 5 materials done") but not at the content level ("your textbook is 30% processed"). For a course with one large textbook, the banner would show `(0/1)` for the entire extraction duration, providing no sense of progress until it flips to `(1/1)`.

The `chaptersTotal` field in the `bgExtraction` material shape is initialized to `null` (line 661) and is populated via `onChapterComplete`. But `ExtractionProgress.jsx` does not render chapter-level progress — it only uses `doneCount / totalCount` (material-level). The chapter data is tracked in state but unused in the UI.

**Partial curriculum concerns:**

There is no UI message on CurriculumScreen or SkillsScreen saying "more skills are being extracted" or "extraction in progress." The `ExtractionProgress` banner is the only indicator, and it shows on non-MaterialsScreen pages. A student browsing their curriculum would see the banner at the bottom and could infer that more skills are coming, but there is no explicit connection between the banner and the skill list ("These are skills extracted so far — more arriving as extraction continues").

---

## Recommendations

### P0 (Should fix before shipping)

*None identified.* The implementation is functionally correct and safe. No data loss or blocking scenarios.

### P1 (Fix soon after shipping)

**P1-1: Auto-expand the currently-extracting material group on MaterialsScreen.**
When `bgExtraction` is active and the user is on MaterialsScreen, the group containing the currently-extracting material should be uncollapsed by default. Currently all groups start collapsed (line 75-80), which hides all progress indicators. This creates a dead zone where extraction runs with zero visual feedback on the one screen where users expect to see progress.

*Files:* `src/screens/MaterialsScreen.jsx` (lines 75-80, modify `collapsedGroups` initialization logic)

**P1-2: Add a fade-out animation to ExtractionProgress banner.**
The banner abruptly unmounts after the 3-second completion window. A 300ms fade-out before unmounting would provide a smoother visual exit. This could be implemented by adding a `fading` state that triggers an opacity transition before `setBgExtraction(null)`.

*Files:* `src/components/ExtractionProgress.jsx`, `src/StudyContext.jsx` (line 573, replace `setTimeout` with fade-triggered clear)

**P1-3: Show chapter-level progress in ExtractionProgress banner for single-material extractions.**
When `totalCount === 1` (only one material being extracted), the `(0/1)` material counter provides no useful information. In this case, the banner should show chapter-level progress (e.g., "Chapter 3/12") using the `chaptersComplete` and `chaptersTotal` data already tracked in `bgExtraction.materials[].chaptersComplete`. The data is collected but never rendered.

*Files:* `src/components/ExtractionProgress.jsx` (add conditional rendering when `totalCount === 1`)

### P2 (Nice to have)

**P2-1: Add a clickable hover state to ExtractionProgress banner.**
Currently the banner has `cursor: pointer` but no visual hover feedback. Adding a subtle border color change or background lightening on hover would make the click-to-navigate affordance more discoverable.

*Files:* `src/components/ExtractionProgress.jsx` (add `onMouseEnter`/`onMouseLeave` handlers)

**P2-2: Show an inline "extraction in progress" note on CurriculumScreen.**
When `bgExtraction` is active and `bgExtraction.courseId === active.id`, CurriculumScreen could show a small informational badge near the skill list header: "Skills are still being extracted from your materials." This would explicitly connect the floating banner to the partial skill list.

*Files:* `src/screens/CurriculumScreen.jsx` (add conditional rendering using `bgExtraction` from `useStudy()`)

**P2-3: Consider extending the completion banner to 5 seconds.**
The current 3-second window is tight. Users focused on reading or studying may miss the completion flash. Extending to 5 seconds (or making it dismissable via click) would improve the chance of the user noticing.

*Files:* `src/StudyContext.jsx` (line 573, change `3000` to `5000`)

**P2-4: Transient toast for extraction notifications.**
The `addNotif("success", "Course created. Extracting skills in the background...")` message is stored in the notification list but does not appear as a visible toast on the current screen. A brief (4-5 second) toast overlay for important notifications would ensure the user sees the Phase 1-to-Phase 2 transition message without needing to check NotifsScreen.

*Files:* Requires a new toast component or extending the notification system. Out of scope for this feature but would benefit the entire app.

---

## Overall Verdict

**Ship with notes.**

The background extraction implementation is architecturally sound. The Phase 1/Phase 2 split is clean, the `bgExtraction` state model is well-designed, and the per-material error isolation is a meaningful improvement over the previous sequential approach. The `ExtractionProgress` banner provides adequate visibility on non-MaterialsScreen pages, and the `DupPromptModal` correctly appears regardless of which screen the user is on.

The main UX gap is the MaterialsScreen dead zone when groups are collapsed (P1-1) — the user can land on MaterialsScreen with all groups collapsed and see zero indication of active extraction. This is the most important item to address. The remaining P1 and P2 items are polish improvements that would elevate the experience from "adequate" to "refined."

No data integrity issues. No blocking bugs. No states where extraction can silently fail without notification. The cancellation mechanism works between materials. The `dupPrompt` modal correctly blocks the extraction loop while leaving the app navigable. The feature is safe to ship.
