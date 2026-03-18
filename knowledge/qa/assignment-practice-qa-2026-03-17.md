# QA Report: Assignment Practice Fix (bootWithFocus Navigation)

**Date:** 2026-03-17
**Analyst:** Study Security & Testing Analyst
**Scope:** Static code-path trace of the `bootWithFocus` navigation fix
**Files reviewed:**
- `src/StudyContext.jsx` (1,515 lines) -- `bootWithFocus` at line 1038, `enterStudy` at line 827
- `src/screens/CurriculumScreen.jsx` (503 lines) -- all four handlers
- `src/screens/CourseHomepage.jsx` (193 lines) -- existing study entry
- `src/ScreenRouter.jsx` (87 lines) -- screen routing
- `src/lib/study.js` -- `effectiveStrength` (line 31), `buildFocusedContext` (line 1286)

---

## Summary Table

| # | Test Case | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | Direct skill practice (handleStudySkill) | **PASS** | Full path verified: CurriculumScreen -> bootWithFocus -> setScreen("study") -> StudyScreen renders |
| 2 | Question study (handleStudyQuestion) | **PASS** | Resolves weakest skill correctly, calls bootWithFocus which navigates |
| 3 | Assignment study (handleStudyWeakest) | **PASS** | Resolves weakest skill across all questions, calls bootWithFocus which navigates |
| 4 | Review start (handleStartReview) | **PASS** | Targets first due skill, calls bootWithFocus which navigates |
| 5 | Regression: CourseHomepage enterStudy | **PASS** | enterStudy sets screen independently; double setScreen("study") is harmless |
| 6 | Edge case: no mastery record | **PASS** | effectiveStrength returns 0 for null mastery; buildFocusedContext handles gracefully |

**Overall verdict: 6/6 PASS -- fix is correct and regression-free.**

---

## Detailed Traces

### Test Case 1: Direct Skill Practice (handleStudySkill)

**Scenario:** User on CurriculumScreen expands assignment, expands question, expands skill, clicks "Study This Skill".

**Trace:**

1. **Button click** -- `CurriculumScreen.jsx:383`
   ```jsx
   <button onClick={function () { handleStudySkill(sk); }}
   ```
   The `sk` object here comes from the question's enriched skill list (line 80-83), containing `{ id, name, conceptKey, strength }`.

2. **handleStudySkill** -- `CurriculumScreen.jsx:156-158`
   ```javascript
   function handleStudySkill(sk) {
     var fullSkill = skills.find(function (s) { return s.id === sk.id; });
     bootWithFocus({ type: "skill", skill: fullSkill || sk });
   }
   ```
   - Looks up the full skill object from `skills` state (loaded at line 65 via `loadSkillsV2`).
   - Falls back to the minimal `sk` object if not found (defensive).
   - Calls `bootWithFocus` with `{ type: "skill", skill: <fullSkillOrMinimal> }`.

3. **bootWithFocus** -- `StudyContext.jsx:1038-1122`
   ```javascript
   const bootWithFocus = async (focus) => {
     if (!active) return;                    // line 1039: guard
     if (screen !== "study") setPreviousScreen(screen);  // line 1040: save for back nav
     setScreen("study");                     // line 1041: NAVIGATE (the fix)
     setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");  // line 1042
   ```
   - `active` is set (user entered from CourseHomepage which called `setActive(course)` or `enterStudy`).
   - `screen` is `"curriculum"`, so `setPreviousScreen("curriculum")` fires first.
   - `setScreen("study")` fires synchronously -- React batches state updates, but the next render cycle will see `screen === "study"`.
   - `setBooting(true)` and `setStatus("Loading...")` ensure loading UI appears.

4. **ScreenRouter renders StudyScreen** -- `ScreenRouter.jsx:76`
   ```javascript
   else if (screen === "study" && active) content = <StudyScreen />;
   ```
   - Both conditions met. StudyScreen renders with `booting=true`, showing the loading indicator.

5. **Async boot completes** -- `StudyContext.jsx:1053-1121`
   - Loads skills, journal, builds focused context.
   - Calls `callClaudeStream` with the system prompt and user message.
   - Sets `msgs` with the streamed response.
   - Sets `booting(false)` at line 1121.

**Verdict: PASS**

**Notes:**
- The `setPreviousScreen(screen)` on line 1040 correctly preserves the "curriculum" screen for back navigation. This is a nice detail -- ensures the user can navigate back from StudyScreen to CurriculumScreen rather than an undefined previous screen.
- The `fullSkill || sk` fallback on line 158 is defensive but could result in a skill object missing `mastery`, `masteryCriteria`, `prerequisites`, etc. This is handled by Test Case 6.

---

### Test Case 2: Question Study (handleStudyQuestion)

**Scenario:** User expands assignment, expands question, clicks "Study Question" button.

**Trace:**

1. **Button click** -- `CurriculumScreen.jsx:320`
   ```jsx
   <button onClick={function () { handleStudyQuestion(q); }}
   ```
   The `q` object is an enriched question from `loadData()` (line 86): `{ id, questionRef, description, difficulty, readiness, skills: [{ id, name, conceptKey, strength }] }`.

2. **handleStudyQuestion** -- `CurriculumScreen.jsx:135-141`
   ```javascript
   function handleStudyQuestion(question) {
     var qSkills = question.skills || [];
     if (qSkills.length === 0) return;       // early exit if no skills
     var weakest = qSkills.reduce(function (w, x) { return x.strength < w.strength ? x : w; });
     var fullSkill = skills.find(function (s) { return s.id === weakest.id; });
     bootWithFocus({ type: "skill", skill: fullSkill || weakest });
   }
   ```
   - Extracts skills array from the question.
   - Guards against empty skills (returns early -- no crash).
   - Uses `reduce` to find the skill with the lowest `strength` value.
   - Looks up the full skill object from the component-level `skills` state.
   - Calls `bootWithFocus` with the resolved skill.

3. **bootWithFocus** -- same path as Test Case 1, lines 1038-1122.

**Verdict: PASS**

**Notes:**
- The `reduce` call on line 138 operates on at least one element (guarded by the `length === 0` check).
- If all skills have equal strength (e.g., all 0 for untested), the first skill is selected. This is acceptable behavior.
- The `type: "skill"` focus causes `bootWithFocus` to enter the skill mastery branch at line 1097-1099, generating the correct system prompt mode hint.

---

### Test Case 3: Assignment Study (handleStudyWeakest)

**Scenario:** User expands assignment, clicks "Study Weakest" button.

**Trace:**

1. **Button click** -- `CurriculumScreen.jsx:257`
   ```jsx
   <button onClick={function () { handleStudyWeakest(asgn); }}
   ```
   The `asgn` object is the fully enriched assignment from `loadData()` (line 96-99).

2. **handleStudyWeakest** -- `CurriculumScreen.jsx:126-133`
   ```javascript
   function handleStudyWeakest(assignment) {
     var allSkills = [];
     (assignment.questions || []).forEach(function (q) {
       (q.skills || []).forEach(function (s) { allSkills.push(s); });
     });
     if (allSkills.length === 0) return;     // guard
     var weakest = allSkills.reduce(function (w, x) { return x.strength < w.strength ? x : w; });
     var fullSkill = skills.find(function (s) { return s.id === weakest.id; });
     bootWithFocus({ type: "skill", skill: fullSkill || weakest });
   }
   ```
   - Flattens all skills across all questions in the assignment.
   - Guards against empty result.
   - Finds the globally weakest skill across the entire assignment.
   - Resolves full skill object and calls `bootWithFocus`.

3. **bootWithFocus** -- same path as Test Case 1.

**Verdict: PASS**

**Notes:**
- This handler collects skills from ALL questions (not just one), so it finds the true weakest skill across the assignment. This is correct behavior for "Study Weakest" at the assignment level.
- Potential duplicate skills across questions (same skill required by multiple questions) will appear multiple times in `allSkills`, but the `reduce` still correctly finds the minimum. No functional issue.

---

### Test Case 4: Review Start (handleStartReview)

**Scenario:** User sees "N skills due for review" banner, clicks "Start Review" button.

**Trace:**

1. **Button click** -- `CurriculumScreen.jsx:422`
   ```jsx
   <button onClick={handleStartReview}
   ```

2. **handleStartReview** -- `CurriculumScreen.jsx:143-148`
   ```javascript
   function handleStartReview() {
     if (dueReviews.length === 0) return;    // guard
     var due = dueReviews[0];                 // first due skill
     var fullSkill = skills.find(function (s) { return s.id === due.subSkillId; });
     if (fullSkill) bootWithFocus({ type: "skill", skill: fullSkill });
   }
   ```
   - Guards against empty review list.
   - Takes the first due skill from `dueReviews` (populated by `Assignments.getReviewDueSkills` at line 67).
   - Resolves full skill from `skills` state using `subSkillId` match.
   - Only calls `bootWithFocus` if `fullSkill` is found (line 147 guard).

3. **bootWithFocus** -- same path as Test Case 1.

**Verdict: PASS**

**Notes:**
- The `if (fullSkill)` guard on line 147 means that if the review-due skill is not found in the loaded skills array (orphaned mastery record?), the button silently does nothing. This is safer than crashing but could be confusing to the user -- they click "Start Review" and nothing happens. A notification or error message would improve UX here, but this is not a bug in the navigation fix.
- `dueReviews[0]` selects the first due skill, which is ordered by the DB query. The user reviews one skill at a time, which is consistent with the skill-focus study mode.

---

### Test Case 5: Regression -- CourseHomepage enterStudy

**Scenario:** User is on CourseHomepage, clicks "Assignment Work", "Exam Review", or "Skill Development" card.

**Trace:**

1. **Card click** -- `CourseHomepage.jsx:113` (Assignment Work example)
   ```javascript
   onClick: function () { enterStudy(active, "assignment"); },
   ```

2. **enterStudy** -- `StudyContext.jsx:827-863`
   ```javascript
   const enterStudy = async (course, initialMode) => {
     setPreviousScreen(screen);              // line 828: saves "courseHome"
     setActive(course); setScreen("study");  // line 829: NAVIGATES
     // ... clears session state (lines 830-842)
     try {
       // ... archives old session, creates new session (lines 843-858)
       chatSessionId.current = await Sessions.create({ courseId: course.id, intent: 'study' });  // line 858
     } catch (e) { /* ... */ }
     if (initialMode) {
       selectMode(initialMode);              // line 861: opens mode picker
     }
   };
   ```
   - `setScreen("study")` at line 829 navigates to StudyScreen.
   - Session lifecycle is handled: old session archived, new session created.
   - `chatSessionId.current` is set.
   - `selectMode("assignment")` loads the assignment picker.

3. **User picks a target in the mode picker** -- This eventually calls `bootWithFocus` from within StudyScreen (via AssignmentPicker, SkillPicker, or ExamScopePicker).

4. **bootWithFocus** -- `StudyContext.jsx:1038-1041`
   ```javascript
   if (!active) return;
   if (screen !== "study") setPreviousScreen(screen);  // screen IS "study", so this is skipped
   setScreen("study");  // already "study" -- React no-op
   ```
   - `screen` is already `"study"` because `enterStudy` set it.
   - `setScreen("study")` is a no-op (same value).
   - `setPreviousScreen` is correctly NOT called (screen is already "study"), preserving the original `previousScreen` value of `"courseHome"`.

**Verdict: PASS**

**Notes:**
- The `if (screen !== "study")` guard on line 1040 is important: it prevents overwriting `previousScreen` when `bootWithFocus` is called from within the study screen. Without this guard, `previousScreen` would be set to `"study"` and back navigation would loop.
- The double `setScreen("study")` (once in `enterStudy`, once in `bootWithFocus`) is harmless. React's `useState` setter with an identical value does not trigger a re-render.
- `chatSessionId.current` is set by `enterStudy` before `bootWithFocus` runs, so the `Messages.appendBatch` call at line 1116 has a valid session ID.

---

### Test Case 6: Edge Case -- bootWithFocus with No Mastery Record

**Scenario:** A skill exists in the DB but has never been studied -- no mastery row exists. User clicks "Study This Skill" on this untested skill.

**Trace:**

1. **Skill object shape** -- From `loadSkillsV2`, a skill with no mastery record will have:
   ```javascript
   { id: 123, name: "...", description: "...", conceptKey: "...", mastery: null, ... }
   ```

2. **handleStudySkill** -- `CurriculumScreen.jsx:156-158`
   ```javascript
   var fullSkill = skills.find(function (s) { return s.id === sk.id; });
   bootWithFocus({ type: "skill", skill: fullSkill || sk });
   ```
   - `fullSkill.mastery` is `null`. This is passed into `bootWithFocus`.

3. **bootWithFocus language detection** -- `StudyContext.jsx:1046-1048`
   ```javascript
   var lang2 = detectLanguage(active.name, focus.skill?.name || "", focus.skill?.description || "");
   ```
   - `focus.skill.name` and `focus.skill.description` are strings from the DB. Safe.

4. **loadSkillsV2** -- `StudyContext.jsx:1054`
   - Reloads all skills. The target skill still has `mastery: null`. No crash.

5. **buildFocusedContext** -- `study.js:1372-1432` (skill branch)
   ```javascript
   const skill = focus.skill;
   const str = effectiveStrength(skill);     // line 1374
   ```
   - `effectiveStrength` at `study.js:31-37`:
     ```javascript
     export const effectiveStrength = (skillOrMastery) => {
       if (!skillOrMastery) return 0;
       const m = skillOrMastery.mastery || skillOrMastery;
       if (!m.stability || !m.lastReviewAt) return 0;
       return currentRetrievability(m);
     };
     ```
   - `skill.mastery` is `null`, so `m = null || skill` = the skill object itself.
   - `skill.stability` is `undefined` (not a mastery record), so `!m.stability` is `true`.
   - Returns `0`. No crash.

6. **buildFocusedContext continued** -- `study.js:1376-1398`
   ```javascript
   const lastRating = skill?.mastery?.lastRating || "untested";  // line 1376: "untested"
   ```
   - Optional chaining handles `null` mastery correctly.
   ```javascript
   if (skill.masteryCriteria?.length) { ... }   // line 1380
   if (skill.prerequisites?.length) { ... }     // line 1386
   ```
   - Optional chaining protects against missing properties. Safe.

7. **System prompt construction** -- `StudyContext.jsx:1062-1085`
   ```javascript
   if (Array.isArray(skills) && skills.length > 0) {
     const dueForReview = skills.map(s => {
       const reviewDate = nextReviewDate(s);
       return { ...s, reviewDate, strength: effectiveStrength(s) };
     }).filter(s => s.reviewDate === "now" || (s.reviewDate && s.reviewDate <= today));
   ```
   - `nextReviewDate` at `study.js:40`: returns `null` for skills without mastery. Filtered out by the subsequent `.filter`.
   - `effectiveStrength` returns `0` for skills without mastery. They appear in `weakSkills` if `strength < 0.4 && strength > 0` -- but `0 > 0` is `false`, so truly untested skills are excluded from the "Needs work" list. This is correct behavior.

8. **User message and mode hint** -- `StudyContext.jsx:1097-1099`
   ```javascript
   userMsg = "I want to work on: " + focus.skill.name;
   modeHint = "\n\nMODE: SKILL MASTERY. ...";
   ```
   - `focus.skill.name` is a string from the DB. Safe.

9. **Stream and message storage** -- Lines 1109-1116
   ```javascript
   setMsgs([{ role: "user", content: userMsg, ts: userTs }, { role: "assistant", content: "", ts: userTs }]);
   const response = await callClaudeStream(bootSystem, [...], function(partial) { ... });
   // ...
   await Messages.appendBatch(chatSessionId.current, [...]);
   ```
   - `chatSessionId.current` must be set for `Messages.appendBatch` to work. This value is set by `enterStudy` (line 858). If `bootWithFocus` is called from CurriculumScreen, `enterStudy` MUST have been called previously to set up the session. (See Notes below for the fragility concern.)

10. **Error handling** -- Lines 1117-1120
    ```javascript
    } catch (err) {
      console.error("Boot failed:", err);
      addNotif("error", "Failed to start session: " + err.message);
    }
    setBooting(false); setStatus("");
    ```
    - If any async operation throws, the error is caught, a notification is shown, and `booting` is reset. The user sees an error message but the app does not crash.

**Verdict: PASS**

**Notes:**
- All null/undefined mastery paths are handled via optional chaining and defensive returns.
- `effectiveStrength(null)` returns `0`, `effectiveStrength({ mastery: null })` returns `0`. Both safe.
- `buildFocusedContext` correctly labels the skill as `"untested"` and `0%` strength.
- The Claude AI will see the skill at 0% strength and "untested", which is correct -- it will start with diagnostic questions as instructed by the mode hint.

---

## Additional Observations

### Session Lifecycle Fragility (Low Risk)

`bootWithFocus` assumes `chatSessionId.current` is already set by a prior `enterStudy` call. In the current codebase, the flow is always:

```
CourseHomepage -> enterStudy(active, mode) -> selectMode() -> [user picks target] -> bootWithFocus()
```

or from CurriculumScreen:

```
CourseHomepage -> enterStudy(active) -> [user navigates to curriculum] -> handleStudy*() -> bootWithFocus()
```

In both cases, `enterStudy` has been called, and `chatSessionId.current` is set at line 858. However, if a future code path calls `bootWithFocus` without a prior `enterStudy`, `Messages.appendBatch` at line 1116 would receive a stale or null session ID. This is noted in the architecture doc but remains a latent risk.

**Current risk level:** Low. All current call sites go through `enterStudy` first.

### previousScreen Guard (Positive Finding)

Line 1040:
```javascript
if (screen !== "study") setPreviousScreen(screen);
```

This guard is well-designed. It prevents `previousScreen` from being set to `"study"` when `bootWithFocus` is called from within StudyScreen sub-components (SkillPicker, AssignmentPicker, ExamScopePicker). Without it, back navigation from StudyScreen would loop to itself.

When called from CurriculumScreen, `screen` is `"curriculum"`, so `previousScreen` is correctly set to `"curriculum"`. This enables proper back navigation after the study session.

### Silent No-Op in handleStartReview (Minor UX Concern)

`handleStartReview` (line 143-148) silently returns if `fullSkill` is not found:
```javascript
if (fullSkill) bootWithFocus({ type: "skill", skill: fullSkill });
```

If the review-due skill returned by `Assignments.getReviewDueSkills` does not exist in the `loadSkillsV2` results (e.g., orphaned mastery record after skill deletion), the user clicks "Start Review" and nothing visible happens. A notification like "Could not find skill for review" would be more helpful. This is a pre-existing UX issue, not introduced by the fix.

### Duplicate Skill Entries in handleStudyWeakest (Cosmetic)

`handleStudyWeakest` flattens skills from all questions without deduplication (line 128). The same skill ID could appear multiple times if it is required by multiple questions. The `reduce` still correctly finds the minimum strength, so there is no functional issue. However, the intermediate array is larger than necessary.

---

## Conclusion

The one-line fix (`setScreen("study")` at `StudyContext.jsx:1041`) correctly resolves the navigation bug for all four CurriculumScreen handlers. The `previousScreen` guard on line 1040 prevents back-navigation issues when called from within StudyScreen. All existing entry points (CourseHomepage, SkillPicker, AssignmentPicker, ExamScopePicker) are unaffected because `setScreen("study")` is either a no-op or harmlessly redundant. The no-mastery edge case is fully handled by defensive coding in `effectiveStrength`, `buildFocusedContext`, and optional chaining throughout the boot path.

No regressions, no crashes, no security concerns identified.
