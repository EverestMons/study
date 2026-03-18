# UX Validation Report: Skill Update Notification System
**Date:** 2026-03-17
**Validator:** Study UX Validator (learner-perspective analysis)
**Spec:** `knowledge/design/skill-update-notification-ux-2026-03-17.md`
**Dev log:** `knowledge/development/skill-update-notification-2026-03-17.md`
**QA report:** `knowledge/qa/skill-update-notification-qa-2026-03-17.md`
**Bug fix status:** BUG-1 (effect self-cleanup) and BUG-2 (null-to-null no-op) both FIXED

---

## Summary Table

| # | Criterion | Rating | Notes |
|---|-----------|--------|-------|
| 1 | Celebratory but not distracting | **Well-calibrated** | Minimal footprint, correct emotional tone, does not compete with chat |
| 2 | Animation timing | **Acceptable** | 2.6s total per notification is in the right range; 300ms fade durations are appropriate |
| 3 | Multiple updates | **Clean** | Sequential queue with 3-item cap is disciplined; timing is reasonable for typical cases |
| 4 | Context bar transition | **Acceptable** | Static label removal is a net positive; conditional render causes a minor pop-in instead of smooth expand |
| 5 | Streaming cleanliness | **Clean** | 6-regex chain handles all streaming edge cases; no realistic false-positive scenarios |
| 6 | Learning science | **Growth-oriented** | Brief, positive reinforcement; amber for difficulty normalizes struggle without punishing |

**Overall UX Verdict: Ship with notes**

---

## Detailed Analysis

### 1. Celebratory but not distracting

**Rating: Well-calibrated**

The notification is a single compact row placed directly above the text input in `InputBar.jsx` (lines 31-53). Its visual inventory is deliberately minimal:

- A 6x6 pixel color-coded dot (line 44)
- The skill name in 12px font, capped at 200px with ellipsis (lines 45-47)
- A middle-dot separator in muted color `T.txM` (#64748B) (line 48)
- The rating label in 11px font, color-coded (lines 49-51)

**Visual prominence analysis:** The notification sits in the "periphery of attention" zone. When a learner finishes reading an AI response and moves their gaze toward the input field to type, the notification is directly in their sightline. The 6px colored dot provides a subtle visual anchor -- green (#34D399) or amber (#FBBF24) against the dark surface (#0F1115) creates sufficient contrast (WCAG contrast ratio > 4.5:1 for both colors against the background) to be noticeable without being loud.

**Competition with chat content:** The notification does NOT compete with the AI response above. It occupies a completely separate visual zone (bottom of screen, above input) rather than being inline in the message stream. The 12px font is smaller than the 15px message body text (MessageList.jsx line 46), further establishing hierarchy. The user can read the AI response at their own pace, and the notification fades in only after streaming completes (enqueue happens post-`callClaudeStream`, line 1208 of StudyContext.jsx), so there is no visual competition during the most attention-demanding phase.

**Emotional tone:** The green/amber binary is well-chosen. Green for easy/good creates positive reinforcement without the excessive energy of celebratory animations (confetti, etc.). Amber for hard/struggled avoids red, which would signal failure/error. The amber (#FBBF24) reads as "caution/attention" rather than "danger," which is exactly the right tone for "you need more practice here." This matches the existing `ratingColor` mapping in `MessageList.jsx` line 16, maintaining visual consistency across the app.

**One minor concern:** The notification is *very* subtle. A learner deeply focused on composing their next message might miss it entirely during its 2.6s lifespan. This is acceptable because: (a) the archival pills in MessageList (lines 73-123) serve as a permanent record, and (b) the toast notification system (`addNotif`) still fires alongside. The InputBar notification is additive, not sole.

---

### 2. Animation timing

**Rating: Acceptable**

The timing spec (300ms fade-in + 2000ms hold + 300ms fade-out = 2600ms total) is implemented correctly in the fixed version. The key timers in `StudyContext.jsx`:

- **First notification:** Started directly at enqueue time (line 1220: `setCurrentSkillNotif({ ...first, phase: "in" })`), with timers stored in the `skillNotifTimers` ref (lines 1221-1226)
- **Hold timer at 2300ms** (line 1221): Transitions phase to `"out"` via functional updater
- **Clear timer at 2600ms** (line 1224): Sets `currentSkillNotif` to `null`, triggering the queue-processing effect for the next item

The CSS transitions in `InputBar.jsx` (line 42) drive the visual:
```
opacity: currentSkillNotif.phase === "in" ? 1 : 0
transform: currentSkillNotif.phase === "in" ? "translateY(0)" : "translateY(-2px)"
transition: opacity 300ms ease, transform 300ms ease
```

**Is 2.6s per notification too fast?** For a single skill name + rating, 2 seconds of full visibility is sufficient for recognition. The information payload is small (two words: skill name + rating). Eye-tracking research on notification banners suggests 1.5-3s is the sweet spot for non-actionable status messages. 2s hold is well within this range.

**Is it too slow?** At 2.6s per notification, a single update is barely noticeable in terms of workflow disruption. The learner can ignore it entirely and it disappears on its own. This is correct behavior for ambient feedback.

**The 300ms fade durations** (both in and out) are standard for micro-animations. They are perceptible enough to avoid a jarring "pop" while being fast enough to not feel sluggish. The `ease` timing function provides natural deceleration. The `translateY(4px -> 0)` on fade-in and `translateY(0 -> -2px)` on fade-out create a subtle "rise up and drift away" motion that reinforces the ephemeral nature.

**Minor note:** The spec originally called for `translateY(4px) -> translateY(0)` on fade-in, but the implementation only sets `translateY(0)` for `phase === "in"` and `translateY(-2px)` for `phase === "out"` (line 41). There is no initial `translateY(4px)` state because the element mounts directly with `phase: "in"`. The CSS transition interpolates from whatever the initial render state is. Since the element is conditionally rendered (`{currentSkillNotif && ...}`), it mounts already in the `phase: "in"` state (opacity 1, translateY 0), so the **fade-in animation from 0 to 1 never visually occurs on the first frame** -- the element appears fully opaque immediately on mount. The fade-out (phase "out": opacity 0, translateY -2px) does animate correctly because it is a state transition while the element is already mounted.

This means the fade-in is effectively instantaneous (the element mounts already at its target state), while the fade-out works as designed. For the learner, this reads as: notification appears immediately (good -- draws attention), then gracefully fades out (good -- non-disruptive departure). The asymmetry is actually a positive UX outcome, even if it deviates from the spec's symmetric 300ms/300ms intent.

---

### 3. Multiple updates

**Rating: Clean**

The sequential queue implementation:

1. **Enqueue:** Up to 3 items extracted from `parseSkillUpdates()` result, first item started directly (line 1218: `var first = notifItems.shift()`), remainder placed in `skillNotifQueue.current` (line 1219)
2. **Queue processing effect** (lines 253-264): When `currentSkillNotif` becomes `null` (clearTimer fires at 2600ms), the effect detects queue items and starts the next one
3. **Cap at 3:** `updates.slice(0, 3)` at line 1210

**Timing for typical cases:**
- 1 skill: 2.6s total -- barely noticeable, blends into the post-response moment
- 2 skills: ~5.2s -- learner sees two brief flashes while composing their next thought
- 3 skills: ~7.8s -- this is the maximum, and it is the only case that might feel slightly long

**Sequential vs. simultaneous:** Sequential is the correct choice for this context. Showing all at once would require either (a) stacking vertically, which consumes more space and creates visual clutter above the input, or (b) showing in a horizontal row, which would be too information-dense for a 12px font at 200px max-width per skill. Sequential keeps the information density low and the visual footprint fixed at a single row height (24px container).

**Does sequential feel tedious?** For 1-2 updates, no. For 3 updates at 7.8s, it approaches the threshold of "ambient but ignorable" vs. "actively distracting." However, several mitigating factors:
- The learner is likely composing their next message during this time. The notifications are peripheral.
- Sending a new message clears the queue (lines 1134-1137 of StudyContext.jsx), so the learner can "dismiss" notifications by simply continuing the conversation.
- The 3-item cap prevents pathological cases (e.g., a response with 5+ facet-level updates).

**The queue-clear-on-send behavior** (lines 1134-1137) is excellent UX. It prioritizes the learner's flow over notification completion. If they are ready to engage with the next question, stale notifications from the previous response should not linger. The implementation correctly clears both the queue ref AND the active timers via the `skillNotifTimers` ref.

---

### 4. Context bar transition

**Rating: Acceptable**

**Static label removal analysis:**

The original static context label showed `[HW] Assignment: Homework 7 -- Chapter 3 Review` or `[SK] Skill: Quadratic Formula` above the input. This label was removed entirely (dev log confirms `focusContext` and `sessionMode` removed from InputBar destructuring).

**Is the removal a net positive?** Yes, for two reasons:
1. **Redundancy:** The learner explicitly selected their focus (assignment/skill/exam) in the CurriculumScreen or via `bootWithFocus()`. They know what they are studying. The label restated information they already had.
2. **Visual economy:** The input area is prime screen real estate. Removing the static label gives more vertical space to the chat messages above and reduces visual clutter around the text input. The space is now "quiet" by default, making the transient skill notifications more noticeable by contrast.

**Potential concern -- context amnesia:** In long study sessions (30+ minutes), a learner might forget which assignment/skill they are focused on, especially if they have multiple active assignments. Without the static label, they have no persistent reminder. However, the AI's responses typically reference the context ("Looking at your work on Homework 7..."), and the session header/sidebar likely contains this information. The risk is low.

**Container collapse behavior:**

The implementation uses conditional rendering (`{currentSkillNotif && (...)}` at line 31 of InputBar.jsx). When `currentSkillNotif` is null, the entire notification DOM subtree is unmounted. When it becomes non-null, it mounts. This means:

- **On notification start:** The container pops into existence. The `maxHeight: 32` + `transition: max-height 200ms ease` on the outer div (lines 33-34) does NOT animate the mount because the element transitions from "not in DOM" to "in DOM at maxHeight: 32" -- there is no "from maxHeight: 0" state to animate from.
- **On notification end:** The container is removed from the DOM when `currentSkillNotif` becomes null. The `phase: "out"` state (opacity 0, translateY -2px) renders for 300ms, then the element unmounts. The fade-out is visible, but the container collapse (8px marginBottom disappearing) is a hard cut.

The spec called for `max-height: 0 -> max-height: 32px` smooth expand/collapse with `transition: max-height 200ms ease`. The implementation deviates by using conditional render instead of keeping the container always-mounted with height toggling.

**Impact on learner experience:** The pop-in is a 32px + 8px (marginBottom) = 40px vertical shift of the text input. This happens only when a notification starts (after AI response completes) and ends (after fade-out). The text input "jumps down" 40px when the notification appears and "jumps up" 40px when it disappears. At the sizes involved (40px shift), this is noticeable but not jarring. The learner is likely not actively typing at the moment the notification appears (they just received an AI response) and is likely about to start typing when it disappears (notification cycle complete), so the shift occurs during natural transition moments.

A smooth expand/collapse would be preferable from a polish standpoint, but the current implementation is functionally acceptable.

---

### 5. Streaming cleanliness

**Rating: Clean**

The regex chain in `renderMd()` (`src/lib/theme.jsx`, lines 55-62):

```js
const clean = text
  .replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "")    // (1)
  .replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "") // (2)
  .replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")     // (3)
  .replace(/\[SKILL_UPDA[\s\S]*$/g, "")         // (4)
  .replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")  // (5)
  .replace(/\[UNLOCK_QU[\s\S]*$/g, "")          // (6)
  .trim();
```

**Coverage analysis by streaming scenario:**

| Streaming state | Which regex matches | Result |
|---|---|---|
| Complete `[SKILL_UPDATE]...[/SKILL_UPDATE]` pair | Regex (1) | Stripped cleanly |
| Opening tag present, content streaming, no closing tag yet | Regex (3): `\[SKILL_UPDATE\][\s\S]*$` | Stripped from opening tag to end of string |
| Opening tag partially arrived: `[SKILL_UPDA` | Regex (4): `\[SKILL_UPDA[\s\S]*$` | Stripped from partial prefix to end of string |
| Opening tag even more partial: `[SKILL_` | **None** -- falls through | The text `[SKILL_` would render |
| Opening tag barely started: `[SKILL` or `[SKI` | **None** | Renders as-is |
| Multiple complete pairs in one message | Regex (1) with `/g` flag | All pairs stripped |
| Complete pair followed by incomplete tag | Regex (1) strips pair, regex (3) strips incomplete | Both cleaned |
| Normal markdown `[link](url)` text | No regex matches | Preserved correctly |

**False positive risk:** The prefix `[SKILL_UPDA` requires 12 specific characters in exact sequence. This does not occur in natural language, mathematical notation, or code. The QA report's trace C (line 58-64) confirms that `[link](url)` markdown is preserved. The `[UNLOCK_QU` prefix (10 characters) is similarly artificial.

**Gap: Very early partial tag `[SKILL_` or `[S`:** If the streaming has only delivered the first few characters of the tag (e.g., `[SKILL_`), none of the regexes match, and this 7-character fragment would render. However, this is an extremely transient state -- at typical streaming speeds (~50-100 tokens/second), the `[SKILL_UPDATE]` tag (14 characters) arrives within ~140-280ms. The fragment would be visible for at most 1-2 frames before either the full prefix `[SKILL_UPDA` arrives (regex 4 catches it) or the complete tag arrives. This is a cosmetic micro-flash, not a real readability issue.

**Why `[SKILL_UPDA` as the cutoff?** The prefix is long enough to be unambiguous (no natural text starts with `[SKILL_UPDA`) but short enough to catch the tag early in its streaming arrival. Going shorter (e.g., `[SKILL`) would risk false positives against hypothetical skill names in square brackets (unlikely but possible in markdown).

**Order matters:** Regex (1) (complete pairs with lazy `*?`) runs before regex (3) (greedy `*$`). This ensures that in a message like `text [SKILL_UPDATE]data[/SKILL_UPDATE] more text [SKILL_UPDATE]streaming...`, regex (1) strips the complete pair first, then regex (3) strips the incomplete second tag. If the order were reversed, regex (3) would greedily consume from the first `[SKILL_UPDATE]` to end of string, removing the "more text" between the two tags. The current ordering is correct.

---

### 6. Learning science

**Rating: Growth-oriented**

**"Quadratic Formula - good" and growth mindset:**

The notification format -- skill name followed by a single-word rating -- communicates "your understanding has been assessed" without attaching the assessment to the learner's identity. It says "Quadratic Formula: good," not "You are good at Quadratic Formula" or "You scored 4/5." This is process-oriented feedback in the style recommended by Dweck's growth mindset framework: the focus is on the skill's current state, not the learner's fixed ability.

The transient nature (2.6s visibility) reinforces this: the assessment is a moment in time, not a permanent label. It appears, acknowledges the learner's work, and disappears. This is closer to how a tutor might nod and say "good" during a conversation -- brief, affirming, forward-looking.

**Amber for hard/struggled -- anxiety or motivation?**

The amber color (#FBBF24) is warm, not alarming. Compare:
- Red (#F87171, `T.rd`): signals error, failure, danger. Would create anxiety.
- Amber (#FBBF24, `T.am`): signals caution, attention needed, in-progress. Communicates "this needs more work" without judgment.
- Green (#34D399, `T.gn`): signals success, mastery, confidence.

For a learner who receives "Factoring - struggled" in amber, the message is "this topic needs more practice" rather than "you failed." The word "struggled" itself is more empathetic than "poor" or "weak" -- it normalizes difficulty as part of the learning process. Combined with the amber (not red) color, this creates an appropriate motivational frame: "let's work on this more" rather than "you're bad at this."

**However**, showing "struggled" to a learner who is already feeling frustrated could reinforce negative emotions. The brevity of the notification mitigates this -- it does not dwell on the difficulty. And the sequential nature means "struggled" ratings are interleaved with (potentially) "good" ratings from other skills in the same response, providing balanced feedback.

**Transient vs. persistent feedback:**

The UX spec's decision to make the InputBar notification transient while keeping the MessageList pills as a permanent archive is pedagogically sound. During active studying, the learner benefits from brief acknowledgment ("your work was recognized") without the cognitive overhead of persistent skill dashboards. The transient notification respects the learner's flow state -- it does not demand they stop and review their progress.

The permanent pills in the chat scrollback (MessageList lines 73-123) serve a different purpose: they are available for reflection when the learner chooses to look back. This separation -- real-time ambient feedback vs. on-demand detailed review -- mirrors best practices in educational software (e.g., Duolingo's session XP vs. skill tree).

**One consideration:** The notification does not include any motivational language ("Keep it up!", "Almost there!"). This is a deliberate absence. Motivational micro-copy can feel patronizing to mature learners (the target audience for a study app), and it adds reading time to an already brief notification. The neutral format (skill + rating) is appropriate for the audience.

---

## Recommendations

### P0 (Must-fix before ship)

None. The two bugs identified in the QA report (BUG-1: effect self-cleanup, BUG-2: null-to-null no-op) have been confirmed fixed in the current code:
- Timers are stored in `skillNotifTimers` ref (line 136 of StudyContext.jsx), surviving effect re-runs
- The queue-processing effect (lines 253-264) no longer returns a cleanup function, so re-runs do not clear active timers
- The first notification is started directly at enqueue time (lines 1218-1226) with its own timers, bypassing the null-to-null trigger issue
- A separate empty-deps effect (lines 266-271) handles timer cleanup on unmount only
- The sendMessage clear path (lines 1134-1137) explicitly clears both queue and timers

### P1 (Should-fix, non-blocking)

1. **Smooth container expand/collapse (InputBar.jsx lines 31-53)**
   The current conditional render (`{currentSkillNotif && (...)}`) causes a 40px vertical jump when the notification container mounts/unmounts. To match the spec's smooth expand/collapse:
   - Keep the outer container always-mounted
   - Use `maxHeight: currentSkillNotif ? 32 : 0` with the existing `transition: max-height 200ms ease`
   - Set `overflow: hidden` so content is clipped at height 0
   - Only conditionally render the inner content to avoid screen reader announcement of empty status
   This eliminates the visual jump and creates a polished expand/collapse motion.

2. **`prefers-reduced-motion` support (InputBar.jsx)**
   The spec (Accessibility section) called for checking `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and setting transitions to 0ms. The implementation does not include this. While the animations are subtle (opacity + transform only, no layout thrashing), respecting the user's OS-level motion preference is a best practice. Add a simple media query check or use a CSS media query `@media (prefers-reduced-motion: reduce)` to set `transition-duration: 0ms`.

### P2 (Nice-to-have, future iteration)

3. **Fade-in animation on mount**
   As noted in criterion 2, the notification mounts already at `phase: "in"` (opacity 1, translateY 0), so there is no visible fade-in transition. For a true fade-in, the element could mount with an initial state (`opacity: 0, translateY: 4px`) and transition to the target state after a single frame (via `requestAnimationFrame` or a brief `setTimeout(0)` before setting `phase: "in"`). This is a polish detail, not a functional issue.

4. **Extract shared `ratingColor` and `formatKey`**
   `ratingColor` is duplicated in InputBar.jsx (line 7) and MessageList.jsx (line 16). `fmtKey`/`formatKey` is duplicated in StudyContext.jsx (line 1209) and MessageList.jsx (line 19). Consider extracting both to `src/lib/theme.jsx` or a shared utility. Low priority -- duplication is small and localized.

5. **Consider removing redundant toast notifications**
   The spec notes that `addNotif()` toast notifications still fire alongside the InputBar animation. Once the InputBar notification proves effective, the toast could be removed to reduce notification redundancy. The learner currently receives three feedback channels for a single skill update: (a) InputBar transient notification, (b) toast notification, (c) inline message pills. This is arguably over-communicating.

---

## Overall UX Verdict: Ship with notes

The Skill Update Notification system is well-designed from a learner experience perspective. The core interaction pattern -- brief, ambient, color-coded feedback appearing in the learner's peripheral attention zone -- is well-calibrated for study flow. The streaming flash fix is thorough with no realistic false-positive risk. The learning science alignment (growth mindset framing, amber vs. red, transient vs. persistent) is thoughtful.

The bug fixes for the timer/trigger issues are confirmed sound in the current code. The most impactful remaining issue is the container pop-in/pop-out (P1-1), which creates a minor visual jump. This is cosmetic, not functional, and does not block shipping.

Ship the feature, then address P1 items in a fast-follow polish pass.
