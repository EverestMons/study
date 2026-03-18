# study — Background Extraction + Assignment Practice Fix
## Orchestration Plan
**Date:** 2026-03-17
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Features:** (A) Non-blocking background extraction, (B) Assignment skill practice button fix, (C) Study session focus mode, (D) Skill update notification redesign

---

## Feature Summary

**Feature A — Background Extraction:** The extraction pipeline currently locks the entire UI behind a full-screen modal (`GlobalLockOverlay`) for the duration of skill extraction — which can take 50+ minutes for a large textbook. The data layer already commits skills per-chapter to SQLite, so skills are independently queryable as soon as each chapter transaction commits. The fix removes the UI lock during extraction, replaces it with a non-blocking progress indicator, and lets the user study previously-extracted content (including chapter-progressive new content) while extraction runs in the background.

**Feature B — Assignment Skill Practice:** On the Curriculum screen, expanding an assignment → question → skill reveals a "Study This Skill" button. Clicking it calls `handleStudySkill` → `bootWithFocus({ type: "skill", skill })`, which loads context and starts a streaming AI conversation — but the screen never transitions to the study view. The button needs to reliably navigate the user into a focused skill study session.

**Feature C — Study Session Focus Mode:** When the user is in an active study session, the UI should strip all navigation except a single exit button. Currently the StudyScreen top bar shows `< Back`, a session timer, and full `TopBarButtons` (View Profile, Notifications, Settings) — these are distractions that pull the user out of learning flow. The exit button should: (1) save session progress and update the skill profile, (2) return the user to whichever screen they were on before entering the study session (not hardcoded to courseHome). This requires tracking the "previous screen" on study entry.

**Feature D — Skill Update Notification Redesign:** During study sessions, the AI includes `[SKILL_UPDATE]...[/SKILL_UPDATE]` tags in responses to report skill progress. Currently: (1) the raw tag text flashes briefly during streaming because `renderMd` only strips the tags when both opening and closing tags are present — during streaming, partial text like `[SKILL_UPDATE]skill: good` shows before the closing tag arrives; (2) after streaming completes, skill update "pills" render inline below the message. The redesign: suppress the raw text flash entirely during streaming, and instead show a brief fade-in/fade-out notification in the mode context bar area above the text input (where it currently shows e.g. "HW Assignment: Homework 7..."). Remove the current assignment/skill label from that bar — the skill update animation replaces it temporarily.

---

## CEO Decisions (Locked In)

1. **Chapter-progressive availability (Option B):** Skills become studyable as each chapter commits, not gated on full material completion. Cross-chapter prerequisite wiring runs after all chapters finish — the only consequence of studying mid-extraction is the scheduler may present a later-chapter skill slightly "too early" in pedagogical ordering. No data integrity risk.
2. **GlobalLock removed for extraction:** The full-screen `GlobalLockOverlay` is only used during the fast Phase 1 (document storage, syllabus parsing). It is NOT used during Phase 2 (skill extraction).
3. **Non-blocking progress indicator:** A persistent but unobtrusive element (banner or pill) shows extraction status when the user navigates away from MaterialsScreen.
4. **Retry flow gets same treatment:** The retry button in MaterialsScreen currently also uses `globalLock` — it gets the same background treatment.
5. **Study session is distraction-free:** During an active study session, only an exit button is visible — no View Profile, Notifications, Settings, or other navigation. Everything is hidden to encourage focus.
6. **Exit returns to previous screen:** The exit button saves session progress (journal + skill updates), then returns the user to whatever screen they were on before entering the study session. This requires a `previousScreen` state variable set on study entry.
7. **Profile intentionally excludes unstudied skills:** The profile only shows skills the user has made progress on. This is by design — not a bug.
8. **Skill update notifications move to input bar area:** The `[SKILL_UPDATE]` raw text flash during streaming must be suppressed. Skill progress is shown as a fade-in/fade-out animation in the context bar above the text input, replacing the current assignment/skill label temporarily.
9. **Remove assignment context label from input bar:** The current "HW Assignment: Homework 7..." label above the text input is removed — the skill update notification takes its place when updates occur.

---

## What Already Exists

### Extraction Pipeline (no changes needed)
- `extraction.js` — `extractCourse()` iterates chapter groups, commits skills/facets/bindings/mastery in per-chapter `withTransaction` blocks, fires `onChapterComplete` callback after each, 2s rate-limit between chapters
- `skills.js` — `runExtractionV2()` wraps `extractCourse`, handles dedup checks, concept link generation (post-extraction, non-critical)
- `db.js` — All DB modules (`SubSkills`, `Facets`, `FacetMastery`, `Chunks`, etc.) operate independently per record

### UI Lock Mechanism (needs modification)
- `StudyContext.jsx` — `globalLock` state + `setGlobalLock()`, `lockElapsed` timer, `extractionCancelledRef`
- `GlobalLockOverlay.jsx` — Full-screen fixed overlay (`position: fixed, inset: 0, zIndex: 2000, pointerEvents: all`), renders spinner + cancel + force-unlock buttons. Also handles `dupPrompt` (near-duplicate user decision)
- `ScreenRouter.jsx` — Renders `GlobalLockOverlay` when `globalLock` is truthy (line 55-56)

### Course Creation Flow (needs modification)
- `StudyContext.jsx` `createCourse()` (line 452-576) — One monolithic async function: `setGlobalLock` → store docs → save courses → parse syllabus → extract skills (sequential `for` loop with `await runExtractionV2`) → `setGlobalLock(null)` in finally block

### Retry Flow (needs modification)
- `MaterialsScreen.jsx` (line 230-242) — Retry button: `setGlobalLock({ message: "Retrying extraction..." })` → `await Chunks.resetForRetry` → `runExtractionV2` → `setGlobalLock(null)` in finally

### Assignment Practice (needs modification)
- `CurriculumScreen.jsx` — `handleStudySkill(sk)` resolves full skill from `skills` array, calls `bootWithFocus({ type: "skill", skill: fullSkill || sk })`
- `StudyContext.jsx` `bootWithFocus()` (line 939-1030) — Loads skills, builds context, constructs system prompt, starts streaming conversation. For `type: "skill"`, sets `focusContext`, `msgs`, calls `callClaudeStream`. Does NOT appear to call `setScreen("study")`.

### Study Session UI (needs modification)
- `StudyScreen.jsx` — Top bar contains `< Back` button, session timer, AND `<TopBarButtons />` (View Profile, Notifications, Settings). The `< Back` button has complex logic: if picker/session active → clear and go to courseHome; if messages exist → save journal, show sessionSummary; otherwise → save journal, clear, go to courseHome. Always navigates to `courseHome` — does not track where the user came from.
- `StudyContext.jsx` `enterStudy()` (line 730) — Sets `active`, calls `setScreen("study")`, clears all session state, loads saved messages. Does NOT record what screen the user was on before.
- `StudyContext.jsx` `bootWithFocus()` (line 939) — Another entry point to study. Also does NOT record previous screen or call `setScreen("study")`.
- `TopBarButtons.jsx` — Rendered inside StudyScreen's top bar, providing View Profile, Notifications, Settings buttons that navigate away from the study session.

### Skill Update Display (needs modification)
- `theme.jsx` `renderMd()` (line 55) — Strips `[SKILL_UPDATE]...[/SKILL_UPDATE]` and `[UNLOCK_QUESTION]...[/UNLOCK_QUESTION]` via regex AFTER full text is available. During streaming, partial tags are NOT stripped because the closing tag hasn't arrived yet, causing raw text flash.
- `MessageList.jsx` (lines 80-130) — After full render, parses `skillPills` via `parseSkillUpdates(m.content)` and renders colored pills/cards below the message. Also renders inline mastery celebration cards from `sessionMasteryEvents`.
- `InputBar.jsx` (lines 34-44) — "Mode context bar" above text input shows `[HW] Assignment: Homework 7...` or `[SK] Skill: ...` based on `focusContext`. This is the area where skill update notifications should appear.
- `StudyContext.jsx` `sendMessage()` (lines 1056-1076) — After streaming completes, calls `parseSkillUpdates(response)` and feeds results to `applySkillUpdates()`. The parsed updates are available at this point for triggering the notification animation.

---

## Execution Steps

### Step 1 — SA: Architecture Blueprint for Background Extraction
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- This orchestration plan
- `src/StudyContext.jsx` (lines 85-110 for state, lines 450-580 for createCourse)
- `src/components/GlobalLockOverlay.jsx`
- `src/screens/MaterialsScreen.jsx` (lines 230-245 for retry flow)
- `src/ScreenRouter.jsx`
**Task:**
Design the state model and control flow for background extraction:
1. Define new state variables to replace `globalLock` during extraction (e.g., `extractionQueue` or `backgroundExtraction` — array of `{ materialId, materialName, status, chaptersTotal, chaptersComplete }`).
2. Specify exactly where `createCourse` splits into Phase 1 (blocking) and Phase 2 (non-blocking). Phase 1 ends after syllabus parsing + assignment chunk marking. Phase 2 begins with the `extractable` for-loop.
3. Define the Phase 2 fire-and-forget pattern: the extraction promise runs unblocked, updates state via callbacks (`onChapterComplete`, `onStatus`), and clears itself on completion or error.
4. Specify how the `dupPrompt` (near-duplicate decision) works without GlobalLockOverlay — it currently renders inside GlobalLockOverlay when `dupPrompt` is truthy. It needs a new home (inline modal on MaterialsScreen, or a standalone modal component).
5. Define the non-blocking progress indicator component spec: what it shows, where it renders (likely in ScreenRouter as a fixed-bottom or fixed-top banner), when it's visible (whenever `backgroundExtraction` is non-empty and user is NOT on MaterialsScreen), click behavior (navigate to MaterialsScreen).
6. Specify the retry flow changes in MaterialsScreen — same pattern: no `globalLock`, inline progress.
7. Address the `busy` state: currently `setBusy(true)` is set during extraction. Determine if `busy` should remain true (blocking message send) or if busy should only apply to the chat, not the whole app.
**Constraints:**
- Do NOT change `extraction.js` or `skills.js` — the data layer is correct
- The `extractionCancelledRef` mechanism must still work for cancellation
- `dupPrompt` must still be a blocking decision (user must choose skip/extract before extraction continues for that material) — but it should not block the entire app
- MaterialsScreen must show per-material inline progress when extraction is running (reuse existing `processingMatId` + `status` state, just without the overlay)
**Output deposit:** `study/knowledge/architecture/background-extraction-2026-03-17.md`

---

### Step 2 — SA: Architecture Blueprint for Assignment Practice Fix
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- This orchestration plan
- `src/screens/CurriculumScreen.jsx` (full file — handleStudySkill, handleStudyQuestion, handleStudyWeakest, handleStartReview)
- `src/StudyContext.jsx` (lines 938-1030 for bootWithFocus, lines 40-45 for screen state)
- `src/ScreenRouter.jsx` (lines 62-73 for screen routing)
**Task:**
Diagnose why `bootWithFocus({ type: "skill" })` doesn't navigate the user to the study screen, and design the fix:
1. Trace the full call chain from `handleStudySkill` → `bootWithFocus` → expected screen transition. Identify what's missing (likely `setScreen("study")` is never called).
2. Determine when in the `bootWithFocus` flow the screen transition should happen — before streaming starts (user sees loading state on StudyScreen) or after first response arrives.
3. Check if `booting` state is supposed to trigger the transition (does StudyScreen render when `booting` is true?) or if an explicit `setScreen("study")` is needed.
4. Verify that `handleStudyQuestion` and `handleStudyWeakest` have the same issue (they also call `bootWithFocus`).
5. Spec the fix — likely a single `setScreen("study")` call at the right point in `bootWithFocus`.
**Constraints:**
- Do NOT change the `bootWithFocus` context-building logic — only the screen transition mechanism
- The fix must work for all three focus types: skill, assignment, exam
- Existing study session entry points (from CourseHomepage, ModePicker) must not be affected
**Output deposit:** `study/knowledge/architecture/assignment-practice-fix-2026-03-17.md`

---

### Steps 1, 2, 2b, and 2c are all parallel. No dependencies between them.

---

### Step 2c — UXD: Skill Update Notification Design
**Agent:** Study UX Designer
**Specialist file:** `study/agents/STUDY_UX_DESIGNER.md`
**Reads:**
- This orchestration plan
- `src/components/study/InputBar.jsx` (full file — mode context bar area)
- `src/components/study/MessageList.jsx` (lines 80-130 — current skill pill rendering)
- `src/lib/theme.jsx` (line 55 — renderMd tag stripping)
**Task:**
Design the skill update notification that replaces the current raw text flash and inline pills:
1. Specify the visual design of the fade-in/fade-out notification in the InputBar context bar area. What does it show? Skill name + rating? Color coding (green for good/easy, amber for hard/struggled)? Duration of animation (e.g., 3s visible, 300ms fade-in, 300ms fade-out)?
2. Specify what happens when multiple skill updates arrive in a single response (common with faceted assessment — could be 3-5 facet updates at once). Sequential animation? Stacked? Only show the overall skill rating?
3. Specify whether the existing inline skill pills in MessageList should be kept (as a permanent record in the chat) or removed entirely in favor of the notification. Recommendation: keep the pills as a subtle permanent record, but make the notification the primary user-facing feedback.
4. Specify the transition: when no notification is active, should the context bar show the assignment/skill label (current behavior), nothing, or something else?
5. Escalate to CEO: should the context bar (showing current assignment/focus) be removed entirely, or only replaced during notification animations?
**Constraints:**
- The notification must feel celebratory but brief — not modal, not blocking
- Must work for all focus types (assignment, skill, exam)
- Animation must not distract from reading the AI's response in the chat above
**Output deposit:** `study/knowledge/design/skill-update-notification-ux-2026-03-17.md`

---

### Step 2b — SA: Architecture Blueprint for Study Session Focus Mode
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- This orchestration plan
- `src/screens/StudyScreen.jsx` (full file — top bar structure, Back button logic)
- `src/StudyContext.jsx` (lines 730-750 for `enterStudy`, lines 938-1030 for `bootWithFocus`, lines 40-55 for screen/session state)
- `src/components/TopBarButtons.jsx`
**Task:**
Design the study session focus mode:
1. Define a `previousScreen` state variable in StudyContext. Identify all entry points to the study screen (`enterStudy`, `bootWithFocus`, any `setScreen("study")` calls) and specify where `previousScreen` gets set at each.
2. Spec the stripped-down StudyScreen top bar: only an "Exit Session" button (no TopBarButtons, no session timer during active chat — timer can appear but navigation buttons must not).
3. Spec the exit flow: (a) save session journal (existing `saveSessionToJournal`), (b) update skill profile data (call `loadProfile` or equivalent so profileData is current), (c) navigate to `previousScreen` (fallback to `courseHome` if null).
4. Address the session summary: currently the `< Back` button shows a `sessionSummary` in-screen before navigating. Should this be preserved? The summary shows skill changes, duration, facets assessed. CEO decision needed — recommend keeping it as a brief interstitial before returning to previousScreen.
5. Address edge cases: what if the user refreshes during a study session (previousScreen is lost)? What if they entered from a screen that requires `active` but `active` was cleared?
**Constraints:**
- The exit button must be the ONLY navigation path out of study mode — no other buttons or links should navigate away
- Session data (messages, mastery updates, journal) must all be saved before navigation
- The focus mode applies whenever the user is on the study screen with an active session (messages exist). The mode picker / initial state before a session starts can still show TopBarButtons.
**Output deposit:** `study/knowledge/architecture/study-focus-mode-2026-03-17.md`

---

### Step 3 — DEV: Implement Background Extraction
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/knowledge/architecture/background-extraction-2026-03-17.md` (Step 1 output)
- `src/StudyContext.jsx`
- `src/components/GlobalLockOverlay.jsx`
- `src/screens/MaterialsScreen.jsx`
- `src/ScreenRouter.jsx`
**Depends on:** Step 1 complete
**Task:**
Implement the background extraction architecture:
1. Add new state variables per the SA blueprint.
2. Refactor `createCourse` into Phase 1 (blocking) and Phase 2 (non-blocking). Phase 1 keeps `globalLock`. Phase 2 fires extraction promises without `globalLock`, updates `backgroundExtraction` state via callbacks.
3. Modify `GlobalLockOverlay.jsx` — it should NOT render during extraction. May need to extract `dupPrompt` handling into its own component or render it as a modal on MaterialsScreen.
4. Create the non-blocking progress indicator component (banner/pill). Wire it into ScreenRouter so it shows when extraction is active and user is not on MaterialsScreen.
5. Update MaterialsScreen inline progress: when `backgroundExtraction` contains entries for materials in the active course, show per-material progress inline (chapter X/Y, status text) without the overlay.
6. Refactor the retry flow in MaterialsScreen to use the same non-blocking pattern.
7. Ensure `extractionCancelledRef` still cancels correctly.
8. Verify the app builds cleanly (`npm run dev`).
**Constraints:**
- Do NOT modify `extraction.js`, `skills.js`, or `db.js`
- Phase 1 GlobalLock must still work (document storage + syllabus parsing should still show the lock — these are fast and the user shouldn't interact during them)
- The `dupPrompt` must still block extraction for THAT material but not the entire app
- All existing study/navigation flows must remain functional
**Output deposit:** `study/knowledge/development/background-extraction-2026-03-17.md`

---

### Step 4 — DEV: Implement Assignment Practice Fix
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/knowledge/architecture/assignment-practice-fix-2026-03-17.md` (Step 2 output)
- `src/StudyContext.jsx`
- `src/screens/CurriculumScreen.jsx`
**Depends on:** Step 2 complete
**Task:**
Implement the assignment practice fix per the SA blueprint:
1. Add the missing screen transition (likely `setScreen("study")`) at the correct point in `bootWithFocus`.
2. Verify all three callers work: `handleStudySkill`, `handleStudyQuestion`, `handleStudyWeakest`, `handleStartReview`.
3. Test that existing study entry points (from CourseHomepage mode picker) are not affected.
4. Verify the app builds cleanly.
**Constraints:**
- Minimal change — this should be a 1-5 line fix
- Do NOT refactor `bootWithFocus` beyond adding the screen transition
- Existing session resumption logic must not be affected
**Output deposit:** `study/knowledge/development/assignment-practice-fix-2026-03-17.md`

---

### Steps 3, 4, 4b, and 3d are parallel. No dependencies between them. Each depends on its respective design/SA step.

Note: Lane D has an extra step (2c UXD → 3d SA → 4d DEV) because it starts with UX Design before architecture.

---

### Step 3d — SA: Architecture Blueprint for Skill Update Notification
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- This orchestration plan
- `study/knowledge/design/skill-update-notification-ux-2026-03-17.md` (Step 2c output)
- `src/components/study/InputBar.jsx`
- `src/components/study/MessageList.jsx`
- `src/lib/theme.jsx` (renderMd function)
- `src/StudyContext.jsx` (lines 1056-1076 — sendMessage skill update parsing)
**Depends on:** Step 2c complete
**Task:**
Design the state model and rendering changes for skill update notifications:
1. Spec a new state variable (e.g., `skillUpdateNotif: { skillName, rating, facets?, timestamp }`) in StudyContext that InputBar reads for the notification animation.
2. Spec the streaming fix: modify `renderMd` to also strip partial/incomplete `[SKILL_UPDATE` tags during streaming (e.g., match `\[SKILL_UPDATE\][\s\S]*$` when no closing tag exists — the tag is mid-stream).
3. Spec how `sendMessage` sets `skillUpdateNotif` after parsing updates, and how InputBar reads it + auto-clears after the animation duration.
4. Spec whether the existing skill pills in MessageList are kept, simplified, or removed per UXD direction.
**Constraints:**
- Do NOT change skill update parsing logic (`parseSkillUpdates`) or FSRS routing (`applySkillUpdates`)
- The streaming fix must not strip legitimate user text that happens to contain brackets
**Output deposit:** `study/knowledge/architecture/skill-update-notification-2026-03-17.md`

---

### Step 4b — DEV: Implement Study Session Focus Mode
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/knowledge/architecture/study-focus-mode-2026-03-17.md` (Step 2b output)
- `src/screens/StudyScreen.jsx`
- `src/StudyContext.jsx`
- `src/components/TopBarButtons.jsx`
**Depends on:** Step 2b complete
**Task:**
Implement the study session focus mode per the SA blueprint:
1. Add `previousScreen` state to StudyContext. Set it at all study entry points (`enterStudy`, `bootWithFocus`, any direct `setScreen("study")` calls) by capturing the current `screen` value before transitioning.
2. Modify StudyScreen top bar: when an active session exists (messages.length > 0 or booting), hide `<TopBarButtons />` and replace `< Back` with an "Exit Session" button.
3. Implement the exit flow: save journal → update profile → show session summary (if applicable) → navigate to `previousScreen`.
4. When no active session (mode picker / initial state), TopBarButtons can remain visible.
5. Verify the app builds cleanly.
**Constraints:**
- The exit button is the ONLY way out of an active study session
- All session data must be saved before navigation
- `previousScreen` defaults to `courseHome` if not set
- Existing session summary display behavior should be preserved as a step before final navigation
**Output deposit:** `study/knowledge/development/study-focus-mode-2026-03-17.md`

---

### Step 4d — DEV: Implement Skill Update Notification
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/knowledge/design/skill-update-notification-ux-2026-03-17.md` (Step 2c output)
- `study/knowledge/architecture/skill-update-notification-2026-03-17.md` (Step 3d output)
- `src/StudyContext.jsx`
- `src/components/study/InputBar.jsx`
- `src/components/study/MessageList.jsx`
- `src/lib/theme.jsx`
**Depends on:** Step 3d complete
**Task:**
1. Fix the streaming flash: update `renderMd` in theme.jsx to strip partial `[SKILL_UPDATE` tags (incomplete — no closing tag yet during streaming).
2. Add `skillUpdateNotif` state to StudyContext. Set it in `sendMessage` after `parseSkillUpdates` returns updates.
3. Implement the fade-in/fade-out notification in InputBar's mode context bar area per the UXD + SA specs. The notification temporarily replaces the current assignment/skill label.
4. Add CSS keyframe animations for the notification (fadeIn, hold, fadeOut). Auto-clear after animation completes.
5. Update or simplify MessageList skill pills per the design direction — keep as subtle permanent record in chat but make the InputBar notification the primary feedback.
6. Verify the app builds cleanly.
**Constraints:**
- Do NOT change `parseSkillUpdates` or `applySkillUpdates` logic
- Notification must not steal focus from the text input
- Animation must use CSS transitions/keyframes, not JS intervals
**Output deposit:** `study/knowledge/development/skill-update-notification-2026-03-17.md`

---

### Step 5 — QA: Security & Testing for Background Extraction
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/knowledge/architecture/background-extraction-2026-03-17.md` (Step 1 output)
- `study/knowledge/development/background-extraction-2026-03-17.md` (Step 3 output)
- All modified source files
**Depends on:** Step 3 complete
**Task:**
Test the background extraction implementation:
1. **Race condition audit:** User navigates between screens while extraction runs — verify state updates don't corrupt. User starts a study session while extraction is active — verify no DB contention (SQLite WAL should handle this, but verify).
2. **Cancellation audit:** User cancels extraction mid-chapter — verify partial state is cleaned up correctly (chunks marked as error, not left in limbo).
3. **dupPrompt flow:** Near-duplicate detection still works, user decision still blocks THAT material's extraction, but app remains navigable.
4. **GlobalLock regression:** Phase 1 (doc storage + syllabus) still shows the lock. Phase 2 does not. Verify the lock clears correctly if Phase 1 errors.
5. **Retry flow:** Retry from MaterialsScreen works without lock, shows inline progress, handles errors gracefully.
6. **Progress indicator:** Shows/hides correctly based on extraction state and current screen. Click navigates to MaterialsScreen.
7. **Multi-material extraction:** If course has 3 extractable materials, they process sequentially (existing behavior), progress updates correctly for each.
8. **Build verification:** `npm run dev` passes.
**Output deposit:** `study/knowledge/qa/background-extraction-qa-2026-03-17.md`

---

### Step 6 — QA: Testing for Assignment Practice Fix
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/knowledge/architecture/assignment-practice-fix-2026-03-17.md` (Step 2 output)
- `study/knowledge/development/assignment-practice-fix-2026-03-17.md` (Step 4 output)
- Modified source files
**Depends on:** Step 4 complete
**Task:**
Test the assignment practice fix:
1. **Direct skill practice:** From CurriculumScreen → expand assignment → expand question → click "Study This Skill" → verify screen transitions to study view with focused skill session.
2. **Question study:** "Study Question" button → verify it navigates to study screen targeting the weakest skill in that question.
3. **Assignment study:** "Study Weakest" button → verify it navigates to study screen targeting the weakest skill across the assignment.
4. **Review start:** "Start Review" button → verify it navigates to study screen targeting the first due skill.
5. **Regression:** Existing study entry from CourseHomepage (mode picker) still works. Session resumption still works.
6. **Edge case:** Click practice on a skill that has no mastery record yet (new/untested). Verify it starts a fresh diagnostic session.
**Output deposit:** `study/knowledge/qa/assignment-practice-qa-2026-03-17.md`

---

### Steps 5, 6, 6b, and 5d are parallel. No dependencies between them.

---

### Step 6b — QA: Testing for Study Session Focus Mode
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/knowledge/architecture/study-focus-mode-2026-03-17.md` (Step 2b output)
- `study/knowledge/development/study-focus-mode-2026-03-17.md` (Step 4b output)
- Modified source files
**Depends on:** Step 4b complete
**Task:**
Test the study session focus mode:
1. **Focus enforcement:** During active study session (messages exist), verify TopBarButtons are NOT rendered. Only exit button visible.
2. **Pre-session state:** Before a session starts (mode picker / initial state), verify TopBarButtons ARE visible.
3. **Previous screen tracking — from CourseHomepage:** Enter study from CourseHomepage → exit → verify returns to CourseHomepage.
4. **Previous screen tracking — from CurriculumScreen:** Enter study via "Study This Skill" → exit → verify returns to CurriculumScreen.
5. **Previous screen tracking — from MaterialsScreen:** Enter study via "Study with these skills" → exit → verify returns to MaterialsScreen.
6. **Exit saves data:** Exit session → verify journal entry created, skill mastery updated, session ended in DB.
7. **Session summary preserved:** Exit after meaningful session → verify session summary appears before final navigation.
8. **Edge case — refresh:** Refresh during study session → verify app doesn't crash, falls back to courseHome if previousScreen lost.
9. **Edge case — no active course:** Verify exit doesn't navigate to a screen that requires `active` if `active` is somehow null.
10. **Regression:** Existing entry from CourseHomepage mode picker still works. Practice mode still works.
**Output deposit:** `study/knowledge/qa/study-focus-mode-qa-2026-03-17.md`

---

### Step 7 — UXV: UX Validation for Background Extraction
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/knowledge/architecture/background-extraction-2026-03-17.md` (Step 1 output)
- `study/knowledge/development/background-extraction-2026-03-17.md` (Step 3 output)
- `study/knowledge/qa/background-extraction-qa-2026-03-17.md` (Step 5 output)
- Modified source files
**Depends on:** Step 5 complete
**Task:**
Validate the background extraction UX:
1. **Non-blocking feels natural:** Does the transition from Phase 1 lock to Phase 2 non-blocking feel smooth? Any jarring moment?
2. **Progress indicator visibility:** Is it noticeable enough that the user knows extraction is happening? Is it subtle enough that it doesn't distract from studying?
3. **MaterialsScreen inline progress:** Does the per-material progress (chapter X/Y) give sufficient information? Is it visually consistent with existing material card states?
4. **Navigation confidence:** When the user leaves MaterialsScreen during extraction, do they feel confident the work is still happening?
5. **Completion notification:** When extraction finishes in the background, does the user know? (via notif, progress indicator disappearing, etc.)
6. **Learning science:** Does chapter-progressive availability risk confusing the user (some skills visible, others appearing over time)? Or is it transparent enough?
**Output deposit:** `study/knowledge/design/validation/background-extraction-uxv-2026-03-17.md`

---

### Step 8 — UXV: UX Validation for Assignment Practice Fix
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/knowledge/development/assignment-practice-fix-2026-03-17.md` (Step 4 output)
- `study/knowledge/qa/assignment-practice-qa-2026-03-17.md` (Step 6 output)
- Modified source files
**Depends on:** Step 6 complete
**Task:**
Validate the assignment practice fix UX:
1. **Transition smoothness:** Does clicking "Study This Skill" feel like a natural navigation? Is there a loading indicator during context building?
2. **Return path:** After studying a skill, can the user easily return to the curriculum screen?
3. **Context continuity:** Does the study session feel contextually connected to the assignment they came from?
**Output deposit:** `study/knowledge/design/validation/assignment-practice-uxv-2026-03-17.md`

---

### Step 5d — QA: Testing for Skill Update Notification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/knowledge/design/skill-update-notification-ux-2026-03-17.md` (Step 2c output)
- `study/knowledge/architecture/skill-update-notification-2026-03-17.md` (Step 3d output)
- `study/knowledge/development/skill-update-notification-2026-03-17.md` (Step 4d output)
- Modified source files
**Depends on:** Step 4d complete
**Task:**
1. **Streaming flash fix:** Verify `[SKILL_UPDATE` partial text never appears during streaming. Test with multi-facet updates that produce long tag blocks.
2. **Notification fires correctly:** After an assistant response with skill updates, verify the InputBar notification animates (fade-in, hold, fade-out) with correct skill name and rating.
3. **Multiple updates in one response:** Verify behavior when 3-5 facet updates arrive in a single response — notification handles them per UXD spec (sequential? stacked?).
4. **No updates in response:** Verify notification does NOT fire when the response has no `[SKILL_UPDATE]` tags. InputBar context bar shows normal label.
5. **Focus preservation:** Verify the notification animation does not steal focus from the text input or cause the textarea to lose cursor position.
6. **MessageList pills:** Verify skill pills in the chat are either kept as subtle records or removed per design direction.
7. **CSS animation:** Verify animation uses CSS keyframes (not JS timers). Test with rapid consecutive messages — animations should not stack or conflict.
8. **Build verification:** `npm run dev` passes.
**Output deposit:** `study/knowledge/qa/skill-update-notification-qa-2026-03-17.md`

---

### Steps 7, 8, 8b, and 8d are parallel. No dependencies between them.

---

### Step 8b — UXV: UX Validation for Study Session Focus Mode
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/knowledge/architecture/study-focus-mode-2026-03-17.md` (Step 2b output)
- `study/knowledge/development/study-focus-mode-2026-03-17.md` (Step 4b output)
- `study/knowledge/qa/study-focus-mode-qa-2026-03-17.md` (Step 6b output)
- Modified source files
**Depends on:** Step 6b complete
**Task:**
Validate the study session focus mode UX:
1. **Focus vs trapped:** Does the stripped-down UI feel focused and intentional, or does it feel like the user is trapped? Is the exit button clearly labeled and easy to find?
2. **Transition in:** Is the transition from full-nav UI to focus mode smooth when a session starts? Any jarring change?
3. **Transition out:** Does the return to the previous screen feel natural? Does the session summary (if shown) provide useful closure before navigating back?
4. **Return context:** When the user returns to the previous screen, is the state preserved (e.g., if they were looking at a specific assignment on CurriculumScreen, are they still on that assignment)?
5. **Learning science:** Does the focus mode support sustained attention? Would a timer or minimal session info (skill being studied, time elapsed) help or hurt focus?
**Output deposit:** `study/knowledge/design/validation/study-focus-mode-uxv-2026-03-17.md`

---

### Step 8d — UXV: UX Validation for Skill Update Notification
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/knowledge/design/skill-update-notification-ux-2026-03-17.md` (Step 2c output)
- `study/knowledge/development/skill-update-notification-2026-03-17.md` (Step 4d output)
- `study/knowledge/qa/skill-update-notification-qa-2026-03-17.md` (Step 5d output)
- Modified source files
**Depends on:** Step 5d complete
**Task:**
1. **Celebratory but not distracting:** Does the notification feel like a genuine moment of progress without pulling attention from the AI's response in the chat?
2. **Animation timing:** Is the fade-in/hold/fade-out duration well-calibrated? Too fast = missed; too slow = annoying.
3. **Multiple updates:** When several facet updates arrive, does the presentation feel clean or cluttered?
4. **Context bar transition:** Is the swap between assignment label and notification smooth? Does the label return naturally after the notification fades?
5. **Streaming cleanliness:** Confirm no raw `[SKILL_UPDATE]` text is ever visible to the user at any point during streaming.
6. **Learning science:** Does the notification reinforce a growth mindset ("you're making progress") without creating performance anxiety?
**Output deposit:** `study/knowledge/design/validation/skill-update-notification-uxv-2026-03-17.md`

---

## Dependency Chain

```
Step 1  (SA: Background Extraction) ──→ Step 3  (DEV) ──→ Step 5  (QA) ──→ Step 7  (UXV)
Step 2  (SA: Practice Fix)          ──→ Step 4  (DEV) ──→ Step 6  (QA) ──→ Step 8  (UXV)
Step 2b (SA: Focus Mode)            ──→ Step 4b (DEV) ──→ Step 6b (QA) ──→ Step 8b (UXV)
Step 2c (UXD: Notif Design) ─→ Step 3d (SA) ─→ Step 4d (DEV) ─→ Step 5d (QA) ─→ Step 8d (UXV)

Lane A (Background Extraction): 1  → 3  → 5  → 7
Lane B (Practice Fix):          2  → 4  → 6  → 8
Lane C (Focus Mode):            2b → 4b → 6b → 8b
Lane D (Skill Notification):    2c → 3d → 4d → 5d → 8d

All four lanes are fully independent — parallel execution.
Lane D has 5 steps (UXD → SA → DEV → QA → UXV) because it starts with UX Design.
```

---

## How to Execute in Claude Code

Each step is a Claude Code session. Assemble the prompt from the step's fields:

**Template:**
```
You are the [Agent name]. Read your specialist file at [specialist file path].

Then read these files:
- [each item from Reads list]

Your assignment: [Task content]

Constraints: [Constraints content]

Deposit your output to: [Output deposit path]

Include an Output Receipt at the end of your deposit file per the format in your specialist file.
```

**Example for Step 1:**
```
You are the Study Systems Analyst. Read your specialist file at study/agents/STUDY_SYSTEMS_ANALYST.md.

Then read these files:
- study/knowledge/decisions/background-extraction-orchestration-2026-03-17.md
- src/StudyContext.jsx (lines 85-110 for state, lines 450-580 for createCourse)
- src/components/GlobalLockOverlay.jsx
- src/screens/MaterialsScreen.jsx (lines 230-245 for retry flow)
- src/ScreenRouter.jsx

Your assignment: Design the state model and control flow for background extraction...
[full task from Step 1]

Constraints: [full constraints from Step 1]

Deposit your output to: study/knowledge/architecture/background-extraction-2026-03-17.md
```

---

## Knowledge Base Deposits (Expected)

| Step | Path | Summary |
|---|---|---|
| 1 | `knowledge/architecture/background-extraction-2026-03-17.md` | State model, control flow, component specs for background extraction |
| 2 | `knowledge/architecture/assignment-practice-fix-2026-03-17.md` | Diagnosis and fix spec for practice button screen transition |
| 2b | `knowledge/architecture/study-focus-mode-2026-03-17.md` | Focus mode architecture: stripped UI, previousScreen tracking, exit flow |
| 3 | `knowledge/development/background-extraction-2026-03-17.md` | Implementation log for background extraction |
| 4 | `knowledge/development/assignment-practice-fix-2026-03-17.md` | Implementation log for practice button fix |
| 4b | `knowledge/development/study-focus-mode-2026-03-17.md` | Implementation log for study session focus mode |
| 5 | `knowledge/qa/background-extraction-qa-2026-03-17.md` | QA results for background extraction |
| 6 | `knowledge/qa/assignment-practice-qa-2026-03-17.md` | QA results for practice button fix |
| 6b | `knowledge/qa/study-focus-mode-qa-2026-03-17.md` | QA results for study session focus mode |
| 7 | `knowledge/design/validation/background-extraction-uxv-2026-03-17.md` | UX validation for background extraction |
| 8 | `knowledge/design/validation/assignment-practice-uxv-2026-03-17.md` | UX validation for practice button fix |
| 8b | `knowledge/design/validation/study-focus-mode-uxv-2026-03-17.md` | UX validation for study session focus mode |
| 2c | `knowledge/design/skill-update-notification-ux-2026-03-17.md` | UX design for skill update notification animation |
| 3d | `knowledge/architecture/skill-update-notification-2026-03-17.md` | State model + streaming fix for skill notifications |
| 4d | `knowledge/development/skill-update-notification-2026-03-17.md` | Implementation log for skill update notification |
| 5d | `knowledge/qa/skill-update-notification-qa-2026-03-17.md` | QA results for skill update notification |
| 8d | `knowledge/design/validation/skill-update-notification-uxv-2026-03-17.md` | UX validation for skill update notification |

---

## Open Questions for CEO During Execution

1. **Progress indicator placement:** The SA will propose a location (bottom banner vs top bar vs nav pill). If the CEO has a strong preference, flag it before Step 3.
2. **dupPrompt relocation:** The near-duplicate decision modal currently lives inside GlobalLockOverlay. The SA will propose where it moves (standalone modal? inline on MaterialsScreen?). CEO may have a preference.
3. **Extraction completion notification:** Should it be a notif toast only, or should the progress indicator flash/animate briefly before disappearing? Minor UX decision.
4. **Practice button behavior on no-skill match:** If `skills.find(s => s.id === sk.id)` returns null (e.g., skill was extracted but not yet loaded), should the button show an error, silently fail, or force-reload skills?
5. **Session summary on exit:** Currently the `< Back` button shows a session summary (skill changes, duration, facets assessed) before navigating away. Should the focus mode exit preserve this as a brief interstitial before returning to the previous screen, or skip straight to navigation?
6. **Timer visibility in focus mode:** Should the session elapsed timer remain visible during focus mode (provides awareness without distraction), or should it be hidden too?
