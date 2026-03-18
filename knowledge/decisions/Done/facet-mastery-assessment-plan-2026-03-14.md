# study — Facet-Level Mastery Assessment & Session Summary
## Execution Plan
**Date:** 2026-03-14
**Planned By:** CEO + Planner (Claude Projects)
**Project:** study
**Feature:** Facet-level AI assessment protocol, per-facet FSRS tracking from tutor sessions, and session mastery summary UI with skill level-up celebration

---

## Feature Summary

Reform the AI teaching pipeline so the tutor assesses individual facets (not just skills) during teaching sessions, follows a structured assessment protocol when the student demonstrates mastery, and writes per-facet FSRS records that start the decay clock. Add a session mastery summary UI that shows the student exactly what changed — which facets were assessed, which skills leveled up, and what's next.

Currently, the AI says "you've mastered this" conversationally but doesn't reliably emit `[SKILL_UPDATE]` tags, doesn't know about facets, and the student sees no confirmation that anything was recorded. This feature closes all three gaps.

## CEO Decisions (Locked In)

1. **Option C** — Full facet-level assessment protocol (not just fixing skill-level emission)
2. **Mastery bar = all facets demonstrated** — a skill is "mastered" when all its facets cross a readiness threshold via individual assessment
3. **Session-end summary with celebration** — visible "lock-in" moment confirming FSRS records were written and decay clock started

## What Already Exists

### System Prompt (study.js buildSystemPrompt, line 1416)
- 3,800+ character system prompt. Includes SKILL STRENGTH TRACKING section instructing AI to emit `[SKILL_UPDATE]` tags.
- Rates at **skill level** using concept keys: `concept-key: struggled|hard|good|easy | reason | context:tag`
- Context tags: diagnostic, transfer, corrected, guided, scaffolded, explained
- Criteria tagging: `criteria:text` — but optional and rarely emitted
- **No knowledge of facets.** The AI doesn't know what facets exist under a skill, their IDs, or their mastery state.
- **No end-of-teaching assessment protocol.** Ratings happen mid-conversation only.

### SKILL_UPDATE Parsing (study.js parseSkillUpdates, line 1426)
- Parses `[SKILL_UPDATE]...[/SKILL_UPDATE]` blocks from AI responses
- Extracts: skillId (concept-key), rating, reason, context, criteria, source
- Returns array of update objects
- **Skill-level only** — no facet ID parsing

### applySkillUpdates (study.js, line 244)
- Takes skill-level updates, looks up facets via `Facets.getBySkill()`
- If facets exist: runs FSRS transition **on every facet uniformly** with the same rating
- Same stability modifier, same grade, same evidence weight applied to all facets
- Facet-level concept link mastery transfer on first interaction
- **Problem: a "good" rating on the skill applies "good" to every facet equally — no differentiation**

### sendMessage handler (StudyContext.jsx, line 1041)
- After each AI response: `parseSkillUpdates(response)` → `applySkillUpdates(courseId, updates, intentWeight)`
- Intent weights: assignment=1.0, exam=0.8, skills=1.0, recap=0.4, explore=0.2
- Creates notification per update: `addNotif("skill", ...)`
- Reloads skills and rebuilds cached context after updates
- **No session-end summary or aggregation**

### Context Builder (study.js buildFocusedContext, line 1031)
- For skill-focused sessions (lines 1111-1160): includes skill name, strength, description, mastery criteria, prerequisites
- Loads facets for chunk binding retrieval via `facetsForSkill()` → `loadFacetBasedContent()`
- **Facets used for chunk loading but NOT exposed to the AI as assessable units**
- Mastery criteria included as text but not linked to facet IDs

### Facets Schema (005_facets.sql)
- `facets` table: id, skill_id, name, description, concept_key, skill_type, blooms_level, mastery_criteria, evidence
- `facet_mastery` table: facet_id (unique), difficulty, stability, retrievability, reps, lapses, last_review_at, next_review_at, last_rating
- `Facets.getBySkill(skillId)` — returns all facets for a skill
- `FacetMastery.get(facetId)` — returns FSRS state for one facet
- `FacetMastery.upsert(facetId, fields)` — writes FSRS state

### Session Summary (study.js generateSessionEntry, line ~1340)
- Generates a journal entry at session end with: message count, topics discussed, skills updated, struggles, breakthroughs
- Written to `journal_entries` table
- **No per-facet breakdown, no mastery events, no "level up" detection**

### Notification System (StudyContext.jsx)
- `addNotif(type, text)` — creates a notification pill
- Skill updates generate notifications (line 1047)
- Notifications visible in NotifPanel
- **No special treatment for mastery events**

---

## Execution Steps

### Step 1 — Research: Facet-Level Assessment Best Practices
**Agent:** Educational Research Analyst
**Specialist file:** `study/agents/EDUCATIONAL_RESEARCH_ANALYST.md`
**Reads:**
- `study/agents/EDUCATIONAL_RESEARCH_ANALYST.md`
- This execution plan (Feature Summary + What Already Exists)
- `docs/skill-architecture-redesign.md` — sections on mastery criteria and FSRS model

**Task:**
Research and document best practices for AI-tutored facet-level assessment:

1. **Assessment timing:** When should the AI assess a facet during teaching? After each exchange? Only after explicit demonstration? What does the learning science say about formative vs summative micro-assessment within a teaching conversation?

2. **Assessment completion protocol:** What's the pedagogically sound way to "wrap up" a skill teaching segment? Should there be a final diagnostic pass over all facets, or should assessment be cumulative from mid-conversation ratings? What are the risks of a final "test" feeling like an exam rather than teaching?

3. **Mastery threshold:** What retrievability/strength threshold should count as "mastered" for a facet? The app currently has no explicit threshold for declaring mastery. Is there a research-backed number, or should this be configurable?

4. **Celebration and motivation:** How should mastery events be presented to students? Research on gamification in learning — what makes a "level up" moment motivating without being distracting? Risk of over-celebrating (trivializing mastery) vs under-celebrating (no feedback loop)?

5. **Decay communication:** The FSRS decay model means mastery fades. How should the app communicate that the skill "will need review" without demoralizing the student at the moment of celebration?

**Constraints:**
- Focus on CS education context (Mark's primary use case)
- Findings must be practical and implementable — not just theoretical
- This is research to inform design decisions, not design itself

**Output deposit:** `study/knowledge/research/facet-assessment-research-2026-03-14.md`
**Depends on:** None (parallel)

---

### Step 2 — UX: Session Mastery Summary Design
**Agent:** Study UX Designer
**Specialist file:** `study/agents/STUDY_UX_DESIGNER.md`
**Reads:**
- `study/agents/STUDY_UX_DESIGNER.md`
- This execution plan
- Step 1 deposit: `study/knowledge/research/facet-assessment-research-2026-03-14.md`
- `src/components/study/MessageList.jsx` (current chat message rendering)
- `src/components/study/SessionSummary.jsx` (existing session summary component — if it shows facet-level data)
- `src/screens/ProfileScreen.jsx` (current skill/facet display for consistency)

**Task:**
Design the session mastery summary experience:

1. **In-chat assessment visualization:** When the AI rates a facet, how does it appear in the chat? Current skill pills are small colored badges below assistant messages. Should facet ratings be more prominent? Progress bar that fills as facets are assessed? Inline "facet checklist" that updates live?

2. **Skill mastery moment:** When all facets of a skill cross the threshold, what happens? Options: modal overlay with celebration, inline card expansion in the chat, banner at the top of the chat area, notification + profile screen animation. Define the interaction — what information is shown (facet list with checkmarks, skill level before→after, "decay starts now" indicator)?

3. **Session-end summary:** When the student exits the study session, what aggregated view do they see? Per-skill breakdown of what was assessed, facets gained, skills leveled up. Should this be a modal before leaving, an inline summary in the chat, or an interstitial screen?

4. **Profile screen integration:** After a mastery event, should the profile screen highlight recently-mastered skills? "New" badges? Animation on the skill card?

5. **Consistency with existing patterns:** The app already has the skill pills in MessageList, the `SessionSummary.jsx` component, and the notification system. Design should extend these, not replace them.

**Constraints:**
- Must match the app's dark theme (T.* palette)
- Celebration must feel earned but not over-the-top — learning science alignment from Step 1
- "Decay starts now" communication must be honest without being demoralizing
- Aesthetic decisions flagged to CEO

**Output deposit:** `study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md`
**Depends on:** Step 1 (research findings inform design)

---

### Step 3 — Architecture: Facet Assessment Pipeline Blueprint
**Agent:** Study Systems Analyst
**Specialist file:** `study/agents/STUDY_SYSTEMS_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SYSTEMS_ANALYST.md`
- This execution plan (What Already Exists — all sections)
- Step 1 deposit: research findings
- Step 2 deposit: UX design
- `src/lib/study.js` lines 244-400 (applySkillUpdates), lines 1031-1200 (buildFocusedContext), lines 1415-1460 (buildSystemPrompt + parseSkillUpdates)
- `src/StudyContext.jsx` lines 1005-1060 (sendMessage handler)
- `src/lib/db.js` lines 2180-2330 (Facets + FacetMastery modules)
- `src-tauri/migrations/005_facets.sql`

**Task:**
Design the complete facet assessment pipeline:

1. **Context builder modification — `buildFacetAssessmentBlock()`:**
   - New helper that loads facets for the active skill(s) and formats a `FACETS FOR THIS SKILL:` block
   - Per facet: ID (or concept_key), name, current mastery state (from FacetMastery), what demonstrating it looks like (from mastery_criteria)
   - Injected into buildFocusedContext for skill-focused and assignment-focused sessions
   - Token budget: estimate per-facet cost, set a reasonable cap (skills typically have 3-8 facets)

2. **System prompt additions:**
   - `FACET TRACKING` section: instructs the AI to rate individual facets using their IDs/concept_keys
   - `ASSESSMENT PROTOCOL` section: when the AI believes the student has covered all facets of a skill, it should run a brief diagnostic pass (1-2 questions) on any facets not yet independently demonstrated, then emit a comprehensive `[SKILL_UPDATE]` block with per-facet ratings
   - Define the exact format. Options:
     - Option A: Keep `[SKILL_UPDATE]` but add facet sub-lines: `concept-key: good\n  facet-key-1: good\n  facet-key-2: easy`
     - Option B: New `[FACET_UPDATE]` tag alongside `[SKILL_UPDATE]`
     - Option C: Replace skill-level ratings entirely with facet-level ratings; skill mastery computed
   - Recommend one option with rationale. Flag tradeoffs to CEO.

3. **parseSkillUpdates modification:**
   - Parse whichever format is chosen in #2
   - Return both skill-level and facet-level updates
   - Backward compatible with existing skill-only format

4. **applySkillUpdates modification:**
   - When facet-level updates are present: route each facet rating to `FacetMastery.upsert()` individually with its own grade and evidence weight
   - When only skill-level updates are present (backward compat): keep current uniform distribution
   - After applying all updates: check if all facets of a skill now cross the mastery threshold → emit a mastery event

5. **Mastery event system:**
   - Define a `MasteryEvent` data structure: { skillId, skillName, facets: [{ id, name, rating, beforeState, afterState }], levelBefore, levelAfter, timestamp }
   - `applySkillUpdates` returns mastery events alongside the normal update log
   - These events drive the UI (session summary, celebration, notifications)

6. **Session mastery aggregator:**
   - Accumulate mastery events across the session (multiple sendMessage calls)
   - On session exit: format aggregated mastery events for the summary UI
   - Store in session journal entry for history

**Migration Impact:** None — no schema changes. The facet tables already exist. This is a pipeline behavior change.

**Constraints:**
- Must be backward compatible — skills without facets must still work
- FSRS algorithm must not be modified — only the routing of ratings to facets changes
- Token budget for facet context must be reasonable (~200-400 tokens per skill's facets)
- The system prompt is already long (~3,800 chars). Additions must be concise.

**Output deposit:** `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md`
**Depends on:** Steps 1, 2 (research + UX inform architecture decisions)

---

### Step 4 — Development: Context Builder + System Prompt Reform
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 3 deposit: `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md`
- `src/lib/study.js` lines 1031-1200 (buildFocusedContext), lines 1415-1418 (buildSystemPrompt)
- `src/lib/db.js` lines 2180-2330 (Facets + FacetMastery)

**Task:**
1. Implement `buildFacetAssessmentBlock(skillIds)` helper in study.js:
   - Load facets + mastery state for given skills
   - Format as structured text block with facet IDs, names, mastery %, and criteria
   - Return empty string if no facets exist (backward compat)
2. Inject into `buildFocusedContext`:
   - Skill-focused sessions: after the FOCUS SKILL block
   - Assignment-focused sessions: after REQUIRED SKILLS block
3. Modify `buildSystemPrompt` to add:
   - FACET TRACKING section (per blueprint)
   - ASSESSMENT PROTOCOL section (per blueprint)
   - Format specification for the new rating tags
4. Verify build passes

**Constraints:**
- Do NOT modify FSRS algorithm
- Do NOT modify applySkillUpdates or parseSkillUpdates (those are Step 5)
- Do NOT modify any UI components
- System prompt additions must be ≤800 characters to avoid bloating context
- Facet block must handle skills with 0 facets gracefully

**Output deposit:** `study/knowledge/development/facet-context-prompt-2026-03-14.md`
**Depends on:** Step 3 (blueprint defines format and content)

---

### Step 5 — Development: Parsing + FSRS Routing + Mastery Detection
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 3 deposit: architecture blueprint
- Step 4 deposit: development log (for any format adjustments)
- `src/lib/study.js` lines 244-400 (applySkillUpdates), lines 1426-1465 (parseSkillUpdates)
- `src/StudyContext.jsx` lines 1041-1060 (sendMessage skill update handling)

**Task:**
1. Modify `parseSkillUpdates` to parse facet-level ratings (per blueprint format)
   - Return updates with optional `facetId` / `facetKey` field
   - Backward compatible: updates without facet info still work
2. Modify `applySkillUpdates`:
   - When updates include facet-level ratings: route each to `FacetMastery.upsert()` individually
   - When updates are skill-level only: keep current uniform distribution
   - After all updates: check if all facets of any affected skill now cross mastery threshold
   - Return `{ updates, masteryEvents }` instead of void (or add masteryEvents to a passed-in accumulator)
3. Modify `sendMessage` in StudyContext.jsx:
   - Capture mastery events from applySkillUpdates
   - Accumulate in `sessionMasteryEvents` ref across the session
   - Create enhanced notifications for mastery events vs normal skill updates
4. Verify build passes

**Constraints:**
- Do NOT modify FSRS core (reviewCard, initCard, etc.)
- applySkillUpdates return type change must not break PracticeMode (check all call sites)
- Mastery threshold value from research/blueprint — do not hardcode without SA specification

**Output deposit:** `study/knowledge/development/facet-parsing-routing-2026-03-14.md`
**Depends on:** Step 4 (context + prompt must be in place before parsing changes make sense to test)

---

### Step 6 — Development: Session Mastery Summary UI
**Agent:** Study Developer
**Specialist file:** `study/agents/STUDY_DEVELOPER.md`
**Reads:**
- `study/agents/STUDY_DEVELOPER.md`
- Step 2 deposit: UX design
- Step 3 deposit: architecture blueprint (MasteryEvent data structure)
- Step 5 deposit: development log (sessionMasteryEvents ref shape)
- `src/components/study/MessageList.jsx`
- `src/components/study/SessionSummary.jsx`
- `src/StudyContext.jsx` (session exit handlers)

**Task:**
1. **In-chat facet progress** (per UX design):
   - Modify skill pill rendering in MessageList to show facet-level detail when facet updates are present
   - Live progress indicator for facets assessed during the session
2. **Mastery celebration component:**
   - New component (e.g., `MasteryCard.jsx` or integrated into existing flow) per UX design
   - Triggered when a mastery event fires
   - Shows: skill name, per-facet checklist with ratings, level before→after, "next review" date from FSRS
3. **Session-end summary** (per UX design):
   - Aggregate view of all mastery events and skill updates from the session
   - Shown on session exit (before returning to home/course screen)
   - Per-skill: facets assessed, ratings, mastery state change
   - Overall: skills leveled up count, total facets assessed, suggested next focus
4. **Session journal enhancement:**
   - Include mastery events in `generateSessionEntry` output
   - Per-facet breakdown stored in journal for history
5. Verify build passes

**Constraints:**
- Celebration must not block the UI — dismissable
- Session summary must be skippable (not a forced modal)
- Must work for sessions with zero mastery events (just show normal summary)
- Animations must not display when no active work is occurring (confirmed design principle)

**Output deposit:** `study/knowledge/development/facet-mastery-ui-2026-03-14.md`
**Depends on:** Step 5 (mastery events must be flowing before UI can consume them)

---

### Step 7 — QA: Full Feature Verification
**Agent:** Study Security & Testing Analyst
**Specialist file:** `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
**Reads:**
- `study/agents/STUDY_SECURITY_TESTING_ANALYST.md`
- Step 3 deposit: architecture blueprint
- Steps 4-6 deposits: development logs
- All modified source files

**Task:**
Test the following scenarios:

**Context + Prompt (Step 4):**
1. Skill-focused session: verify facet block appears in context with correct IDs, names, mastery %
2. Assignment-focused session: verify facets for required skills are included
3. Skill with 0 facets: verify no crash, graceful fallback to skill-level behavior
4. Token budget: measure actual facet block size for skills with 3, 5, 8 facets

**Parsing + Routing (Step 5):**
5. AI emits facet-level ratings: verify each facet gets individual FacetMastery.upsert
6. AI emits skill-level rating only (backward compat): verify uniform distribution still works
7. Mixed: some facets rated, skill also rated: verify correct routing
8. Mastery threshold detection: verify event fires when all facets cross threshold
9. Mastery threshold NOT met: verify no false positive when only some facets are strong
10. PracticeMode applySkillUpdates call: verify not broken by return type change

**UI (Step 6):**
11. Facet pills render correctly in chat messages
12. Mastery celebration card appears on skill mastery event
13. Celebration card is dismissable
14. Session-end summary shows correct aggregated data
15. Session with zero mastery events: summary shows normal content
16. Journal entry includes facet-level data
17. Notification system shows enhanced mastery notifications

**Integration:**
18. Full teaching session flow: enter course → pick skill → AI teaches → AI assesses facets → mastery event → celebration → exit → summary
19. FSRS integrity: verify facet mastery records have correct difficulty, stability, retrievability after assessment
20. Profile screen: verify skill readiness % reflects new facet mastery data
21. Build passes (`npx vite build --mode development`)
22. No console errors or warnings

**Output deposit:** `study/knowledge/qa/facet-mastery-qa-2026-03-14.md`
**Depends on:** Steps 4, 5, 6 (all development complete)

---

### Step 8 — UX Validation: Mastery Assessment Experience
**Agent:** Study UX Validator
**Specialist file:** `study/agents/STUDY_UX_VALIDATOR.md`
**Reads:**
- `study/agents/STUDY_UX_VALIDATOR.md`
- Step 1 deposit: research findings (learning science alignment)
- Step 2 deposit: UX design
- Steps 4-6 deposits: what was built
- Step 7 deposit: QA report

**Task:**
Validate the implemented experience:

1. **Assessment feels like teaching, not testing.** Does the AI's assessment protocol feel natural within the teaching conversation, or does it feel like an abrupt exam at the end?
2. **Celebration calibration.** Is the mastery moment appropriately celebratory? Too much? Too little? Does it motivate continuing to the next skill?
3. **Decay communication.** Is the "your skill will need review" messaging honest without deflating the achievement?
4. **Facet progress clarity.** Can the student understand which facets they've demonstrated and which are still pending? Is the in-chat progress readable?
5. **Session summary utility.** Does the exit summary help the student know what to do next? Or is it just a report card?
6. **Learning science risk assessment.** Does the assessment protocol risk teaching to the test (students optimizing for checkmarks rather than understanding)?

**Output deposit:** `study/knowledge/design/validation/facet-mastery-uxv-2026-03-14.md`
**Depends on:** Step 7 (QA must pass first)

---

### Step 9 — Closeout: Status + Index Updates
**Agent:** Study Product Analyst
**Specialist file:** `study/agents/STUDY_PRODUCT_ANALYST.md`
**Reads:**
- `study/agents/STUDY_PRODUCT_ANALYST.md`
- All step deposits (Steps 1-8)
- `study/PROJECT_STATUS.md` (to update)
- `study/knowledge/KNOWLEDGE_INDEX.md` (to update)

**Task:**
1. Update `PROJECT_STATUS.md`:
   - Add "Facet-Level Mastery Assessment" to "What Is Working" table
   - Add "Session Mastery Summary" to "What Is Working" table
   - Add development activity entries for all phases
   - Update system prompt section if relevant
   - Note new component files and LOC changes
2. Update `knowledge/KNOWLEDGE_INDEX.md` with all new files from Steps 1-8
3. Compile any open flags from step receipts into a summary for CEO

**Output deposit:** Updated `study/PROJECT_STATUS.md` and `study/knowledge/KNOWLEDGE_INDEX.md`
**Depends on:** Steps 7, 8 (all validation complete)

---

## Dependency Chain

```
Step 1 (Research) ─────────────┐
                                ├──→ Step 2 (UX Design) ──┐
                                │                          ├──→ Step 3 (Architecture) ──→ Step 4 (DEV: Context + Prompt)
                                │                          │                                       │
                                │                          │                                       ↓
                                │                          │                              Step 5 (DEV: Parsing + FSRS)
                                │                          │                                       │
                                │                          │                                       ↓
                                │                          │                              Step 6 (DEV: Summary UI)
                                │                          │                                       │
                                │                          │                                       ↓
                                │                          │                              Step 7 (QA) ──→ Step 8 (UXV) ──→ Step 9 (Closeout)
```

**Sequential chain (no parallel lanes):**
Steps 4 → 5 → 6 are sequential because each depends on the prior:
- Step 5 needs Step 4's format to parse
- Step 6 needs Step 5's mastery events to display

Step 1 (Research) can run in parallel with reading/planning time, but Steps 2 and 3 need its output.

---

## How to Execute in Claude Code

Each step is run as a separate Claude Code session. Assemble the prompt from:

1. **Agent identity:** "You are the [Specialist Name]. Read your agent file at `study/agents/[FILE].md`"
2. **Reads:** "Before starting, read these files: [list from step]"
3. **Task:** Copy the Task section verbatim from the step
4. **Constraints:** Copy the Constraints section verbatim
5. **Deposit instruction:** "When complete, write your output to [deposit path] and include an Output Receipt at the bottom"

**Example prompt for Step 4:**
```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md
- src/lib/study.js (lines 1031-1200 for buildFocusedContext, lines 1415-1418 for buildSystemPrompt)
- src/lib/db.js (lines 2180-2330 for Facets + FacetMastery)

[Paste Task section from Step 4]
[Paste Constraints section from Step 4]

When complete, write your development log to study/knowledge/development/facet-context-prompt-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Knowledge Base Deposits (Expected)

| Step | File | Location |
|---|---|---|
| 1 | Facet assessment research | `study/knowledge/research/facet-assessment-research-2026-03-14.md` |
| 2 | Session mastery summary UX | `study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md` |
| 3 | Facet assessment pipeline blueprint | `study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md` |
| 4 | Context + prompt reform dev log | `study/knowledge/development/facet-context-prompt-2026-03-14.md` |
| 5 | Parsing + FSRS routing dev log | `study/knowledge/development/facet-parsing-routing-2026-03-14.md` |
| 6 | Session mastery UI dev log | `study/knowledge/development/facet-mastery-ui-2026-03-14.md` |
| 7 | QA report | `study/knowledge/qa/facet-mastery-qa-2026-03-14.md` |
| 8 | UX validation report | `study/knowledge/design/validation/facet-mastery-uxv-2026-03-14.md` |
| 9 | Updated PROJECT_STATUS.md | `study/PROJECT_STATUS.md` |
| 9 | Updated KNOWLEDGE_INDEX.md | `study/knowledge/KNOWLEDGE_INDEX.md` |

---

## Open Questions for CEO During Execution

### 1. SKILL_UPDATE Format (Step 3 — SA decides, CEO approves)

The Systems Analyst will recommend one of three formats:

**Option A — Facet sub-lines under SKILL_UPDATE:**
```
[SKILL_UPDATE]
concept-key: good | reason | context:diagnostic
  facet-key-1: easy | answered cold | context:diagnostic
  facet-key-2: good | needed one hint | context:guided
[/SKILL_UPDATE]
```
Pro: Backward compatible, keeps skill-level rating as summary. Con: Parsing complexity, indentation ambiguity.

**Option B — Separate FACET_UPDATE tag:**
```
[SKILL_UPDATE]
concept-key: good | reason | context:diagnostic
[/SKILL_UPDATE]
[FACET_UPDATE]
facet-key-1: easy | context:diagnostic
facet-key-2: good | context:guided
[/FACET_UPDATE]
```
Pro: Clean separation, easy parsing. Con: Two tags the AI must remember to emit.

**Option C — Facet-only ratings, skill mastery computed:**
```
[FACET_UPDATE]
facet-key-1: easy | context:diagnostic
facet-key-2: good | context:guided
[/FACET_UPDATE]
```
Pro: Single source of truth, no redundancy. Con: Breaking change, no skill-level fallback for skills without facets.

The SA will recommend; CEO decides.

### 2. Mastery Threshold (Step 1 research → Step 3 specification)

What facet retrievability % counts as "demonstrated" for triggering the mastery celebration? The research step will recommend a value. Likely range: 0.5-0.7 for initial demonstration, with the expectation that FSRS will track ongoing retention.

### 3. Assessment Protocol Tone (Step 1 research → Step 4 prompt)

Should the AI's wrap-up assessment feel like:
- **A)** "Let me check you got this" — explicit diagnostic ("Before we move on, let me ask you about [facet] directly")
- **B)** "Let's make sure we covered everything" — collaborative review ("We talked about [facet-1] and [facet-2]. Want to try applying [facet-3] to see if it clicks?")
- **C)** Implicit — AI assesses through natural teaching questions without announcing an assessment

The research step will inform this; the system prompt language depends on the choice.

### 4. Scope of In-Chat Facet Visualization (Step 2 UX → Step 6 DEV)

How prominent should the facet progress be during the chat? Options range from:
- Subtle: small pills below messages (like current skill pills, but per-facet)
- Moderate: a persistent sidebar or header showing facet checklist
- Prominent: an inline progress card that updates live as facets are assessed

The UX Designer will recommend; CEO decides based on how much visual weight feels right.

### 5. Celebration vs. Distraction (Step 1 research → Step 2 UX → Step 8 UXV)

How much celebration is appropriate? The UX Validator will assess whether the implemented celebration helps motivation or becomes a distraction from learning flow. CEO may need to adjust if the implementation overshoots or undershoots.
