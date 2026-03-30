# study — Assignment Mode Facet Assessment Context Diagnostic
**Date:** 2026-03-29 | **Type:** Diagnostic

---

## STEP 1 — DEV

---

> You are the Study Developer. Skip specialist file and glossary reads — this is a code-tracing task. **Investigate why the AI is not emitting `[SKILL_UPDATE]` tags during assignment mode tutoring.**
>
> (1) In `study.js:buildFocusedContext()`, trace the assignment branch. Is `buildFacetAssessmentBlock()` called? What does it output? Show the exact lines where it's called and what `asgnFacetBlock` contains for skills 204 and 676 (Shift and Rotate). If the block IS generated, paste the exact text that would appear in the AI context for those skills.
> (2) In `study.js:buildSystemPrompt()`, find the STEALTH ASSESSMENT / SKILL_UPDATE instructions. Paste the exact prompt text that tells the AI how and when to emit `[SKILL_UPDATE]` tags. Is this text included unconditionally, or is there a mode guard that excludes assignment mode?
> (3) Check the `modeHint` for assignment mode in `StudyContext.jsx:bootWithFocus()`. Does it mention `[SKILL_UPDATE]` anywhere? Does it tell the AI to assess facets during teaching? Or does it only talk about `[UNLOCK_QUESTION]` and `[ANSWER_SUBMISSION]`?
> (4) Trace what the AI actually sees at session boot for an assignment session. Build the full prompt assembly order: `buildSystemPrompt()` output + `buildFocusedContext()` output + `modeHint` + any other injected text. Identify where the stealth assessment instructions appear relative to the assignment-specific instructions. Could the assignment FLOW instructions be overriding or distracting from the assessment instructions?
> (5) Check `buildContext()` (the general context builder used for non-assignment modes). Does it include `buildFacetAssessmentBlock`? Compare how the facet assessment block is injected in `buildContext()` vs `buildFocusedContext()` assignment branch — is there a difference in placement, wording, or surrounding context that could cause the AI to ignore it in assignment mode?
> (6) Check `parseSkillUpdates()` in study.js — what exact format does it expect? Show the regex. Then check whether the assignment mode system prompt gives the AI any example of how to emit `[SKILL_UPDATE]` during assignment teaching, or does it only show examples for unlock and answer assessment?
>
> **Key question to answer:** Is the problem that (a) the facet assessment instructions aren't in the assignment context at all, (b) they're present but the AI is ignoring them because the assignment-specific instructions don't reference them, or (c) the instructions are present and referenced but the AI still doesn't comply?
>
> **Deposit findings** to `knowledge/research/assignment-facet-assessment-context-diagnostic-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/research/assignment-facet-assessment-context-diagnostic-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
