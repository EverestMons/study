# study — Assignment Mode Prompt Architecture Fix
**Date:** 2026-03-29 | **Type:** Diagnostic (SA blueprint request)

---

## STEP 1 — SA

---

> You are the Study Systems Analyst. Read your specialist file at `study/agents/STUDY_SYSTEMS_ANALYST.md` and the domain glossary at `study/knowledge/research/domain-glossary.md`. Read the diagnostic at `study/knowledge/research/assignment-facet-assessment-context-diagnostic-2026-03-29.md` for the full current-state findings. Also read `study/knowledge/research/hw9-unlock-state-diagnostic-2026-03-29.md` and `study/knowledge/research/assignment-fsrs-update-flow-diagnostic-2026-03-29.md` for additional context on the unlock gate and FSRS flow.
>
> **Blueprint a fix for the assignment mode prompt architecture.** The diagnostic identified 4 root causes for why the AI never emits `[SKILL_UPDATE]` tags during assignment teaching: (1) boot prompt has NO SKILL_UPDATE instructions, (2) assignment FLOW never mentions SKILL_UPDATE, (3) subsequent messages lose the assignment modeHint entirely when `buildSystemPrompt()` replaces the boot prompt, (4) SKILL_UPDATE is only mentioned in the ANSWER ASSESSMENT section, not the teaching phase.
>
> **The fix must address all 4 root causes with a unified prompt assembly architecture:**
>
> **Change 1 — Unified system prompt.** The boot prompt and subsequent-message prompt must contain the SAME instructions. Currently `bootWithFocus()` builds a custom boot prompt string that includes `modeHint` but excludes `buildSystemPrompt()` content. Then `sendMessage()` uses `buildSystemPrompt()` which includes the SKILL_UPDATE/FACET ASSESSMENT instructions but excludes `modeHint`. **Design a single prompt assembly path** that includes both: the general teaching instructions (SKILL_UPDATE, FACET ASSESSMENT, ASSESSMENT PROTOCOL, ESCALATION RESISTANCE, ANSWER DOCTRINE) AND the mode-specific instructions (assignment FLOW, UNLOCK_QUESTION, ANSWER ASSESSMENT). Both boot and subsequent messages must use the same assembly. Blueprint the exact assembly order. Consider: should `modeHint` be injected into `buildSystemPrompt()`, or should `bootWithFocus()` use `buildSystemPrompt()` as its base?
>
> **Change 2 — Add SKILL_UPDATE to assignment FLOW.** The FLOW steps must explicitly instruct the AI to emit `[SKILL_UPDATE]` tags during the pre-unlock teaching phase. Currently step 2 says "teach that skill first" and step 3 says "when the student demonstrates competence, unlock." There is no step saying "emit SKILL_UPDATE after each teaching exchange to record the student's demonstrated competence." The AI needs to know that SKILL_UPDATE is HOW the system tracks whether the student has reached the 60% threshold — without it, the unlock gate will always reject. **Write the exact new FLOW text** including the SKILL_UPDATE integration. The AI should understand: "Your SKILL_UPDATE ratings are what drive the mastery score. The system will only allow unlock when the mastery score reaches 60%. If you don't rate, the student can never progress."
>
> **Change 3 — Persist modeHint across messages.** Currently `modeHint` is only in the boot prompt and lost on subsequent messages. Either: (a) store `modeHint` in `cachedSessionCtx.current` and inject it into `buildSystemPrompt()` on every call, or (b) make `buildSystemPrompt()` accept a `modeHint` parameter. Blueprint which approach is cleaner and specify the exact wiring.
>
> **Constraints:** Do not change `buildFocusedContext()` — the context building is fine. Do not change `parseSkillUpdates()` or `applySkillUpdates()` — the processing pipeline is fine. Do not change the unlock gate logic — the 60% threshold is correct. The fix is entirely in prompt assembly and prompt text. The `buildSystemPrompt()` function signature can change if needed. `bootWithFocus()` assembly can change. `sendMessage()` assembly can change.
>
> **Deposit blueprint** to `knowledge/architecture/assignment-prompt-architecture-blueprint-2026-03-29.md` using `with open("/Users/marklehn/Desktop/GitHub/study/knowledge/architecture/assignment-prompt-architecture-blueprint-2026-03-29.md", "w") as f: f.write(content)`. Standard prompt feedback protocol → `knowledge/research/agent-prompt-feedback.md`.
