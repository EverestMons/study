# Facet-Level Mastery Assessment — Claude Code Prompts

Run each step as a separate Claude Code session in order. Wait for each step to complete before starting the next (except Step 1 which has no upstream dependency).

---

## Step 1 — Research: Facet-Level Assessment Best Practices

```
You are the Educational Research Analyst. Read your agent file at study/agents/EDUCATIONAL_RESEARCH_ANALYST.md.

Before starting, read these files:
- study/knowledge/decisions/facet-mastery-assessment-plan-2026-03-14.md (Feature Summary + What Already Exists sections)
- docs/skill-architecture-redesign.md (sections on mastery criteria and FSRS model)

TASK:

Research and document best practices for AI-tutored facet-level assessment:

1. Assessment timing: When should the AI assess a facet during teaching? After each exchange? Only after explicit demonstration? What does the learning science say about formative vs summative micro-assessment within a teaching conversation?

2. Assessment completion protocol: What's the pedagogically sound way to "wrap up" a skill teaching segment? Should there be a final diagnostic pass over all facets, or should assessment be cumulative from mid-conversation ratings? What are the risks of a final "test" feeling like an exam rather than teaching?

3. Mastery threshold: What retrievability/strength threshold should count as "mastered" for a facet? The app currently has no explicit threshold for declaring mastery. Is there a research-backed number, or should this be configurable?

4. Celebration and motivation: How should mastery events be presented to students? Research on gamification in learning — what makes a "level up" moment motivating without being distracting? Risk of over-celebrating (trivializing mastery) vs under-celebrating (no feedback loop)?

5. Decay communication: The FSRS decay model means mastery fades. How should the app communicate that the skill "will need review" without demoralizing the student at the moment of celebration?

CONSTRAINTS:
- Focus on CS education context (Mark's primary use case)
- Findings must be practical and implementable — not just theoretical
- This is research to inform design decisions, not design itself

When complete, write your output to study/knowledge/research/facet-assessment-research-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 2 — UX: Session Mastery Summary Design

```
You are the Study UX Designer. Read your agent file at study/agents/STUDY_UX_DESIGNER.md.

Before starting, read these files:
- study/knowledge/decisions/facet-mastery-assessment-plan-2026-03-14.md
- study/knowledge/research/facet-assessment-research-2026-03-14.md
- src/components/study/MessageList.jsx
- src/components/study/SessionSummary.jsx
- src/screens/ProfileScreen.jsx

TASK:

Design the session mastery summary experience:

1. In-chat assessment visualization: When the AI rates a facet, how does it appear in the chat? Current skill pills are small colored badges below assistant messages. Should facet ratings be more prominent? Progress bar that fills as facets are assessed? Inline "facet checklist" that updates live?

2. Skill mastery moment: When all facets of a skill cross the threshold, what happens? Options: modal overlay with celebration, inline card expansion in the chat, banner at the top of the chat area, notification + profile screen animation. Define the interaction — what information is shown (facet list with checkmarks, skill level before→after, "decay starts now" indicator)?

3. Session-end summary: When the student exits the study session, what aggregated view do they see? Per-skill breakdown of what was assessed, facets gained, skills leveled up. Should this be a modal before leaving, an inline summary in the chat, or an interstitial screen?

4. Profile screen integration: After a mastery event, should the profile screen highlight recently-mastered skills? "New" badges? Animation on the skill card?

5. Consistency with existing patterns: The app already has the skill pills in MessageList, the SessionSummary.jsx component, and the notification system. Design should extend these, not replace them.

CONSTRAINTS:
- Must match the app's dark theme (T.* palette)
- Celebration must feel earned but not over-the-top — learning science alignment from Step 1 research
- "Decay starts now" communication must be honest without being demoralizing
- Aesthetic decisions flagged to CEO

When complete, write your output to study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 3 — Architecture: Facet Assessment Pipeline Blueprint

```
You are the Study Systems Analyst. Read your agent file at study/agents/STUDY_SYSTEMS_ANALYST.md.

Before starting, read these files:
- study/knowledge/decisions/facet-mastery-assessment-plan-2026-03-14.md (especially the "What Already Exists" section)
- study/knowledge/research/facet-assessment-research-2026-03-14.md
- study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md
- src/lib/study.js lines 244-400 (applySkillUpdates), lines 1031-1200 (buildFocusedContext), lines 1415-1460 (buildSystemPrompt + parseSkillUpdates)
- src/StudyContext.jsx lines 1005-1060 (sendMessage handler)
- src/lib/db.js lines 2180-2330 (Facets + FacetMastery modules)
- src-tauri/migrations/005_facets.sql

TASK:

Design the complete facet assessment pipeline:

1. Context builder modification — buildFacetAssessmentBlock():
   - New helper that loads facets for the active skill(s) and formats a FACETS FOR THIS SKILL: block
   - Per facet: ID (or concept_key), name, current mastery state (from FacetMastery), what demonstrating it looks like (from mastery_criteria)
   - Injected into buildFocusedContext for skill-focused and assignment-focused sessions
   - Token budget: estimate per-facet cost, set a reasonable cap (skills typically have 3-8 facets)

2. System prompt additions:
   - FACET TRACKING section: instructs the AI to rate individual facets using their IDs/concept_keys
   - ASSESSMENT PROTOCOL section: when the AI believes the student has covered all facets of a skill, it should run a brief diagnostic pass (1-2 questions) on any facets not yet independently demonstrated, then emit a comprehensive rating block with per-facet ratings
   - Define the exact format. Options:
     - Option A: Keep [SKILL_UPDATE] but add facet sub-lines
     - Option B: New [FACET_UPDATE] tag alongside [SKILL_UPDATE]
     - Option C: Replace skill-level ratings entirely with facet-level ratings; skill mastery computed
   - Recommend one option with rationale. Flag tradeoffs to CEO.

3. parseSkillUpdates modification:
   - Parse whichever format is chosen in #2
   - Return both skill-level and facet-level updates
   - Backward compatible with existing skill-only format

4. applySkillUpdates modification:
   - When facet-level updates are present: route each facet rating to FacetMastery.upsert() individually with its own grade and evidence weight
   - When only skill-level updates are present (backward compat): keep current uniform distribution
   - After applying all updates: check if all facets of a skill now cross the mastery threshold → emit a mastery event

5. Mastery event system:
   - Define a MasteryEvent data structure: { skillId, skillName, facets: [{ id, name, rating, beforeState, afterState }], levelBefore, levelAfter, timestamp }
   - applySkillUpdates returns mastery events alongside the normal update log
   - These events drive the UI (session summary, celebration, notifications)

6. Session mastery aggregator:
   - Accumulate mastery events across the session (multiple sendMessage calls)
   - On session exit: format aggregated mastery events for the summary UI
   - Store in session journal entry for history

CONSTRAINTS:
- Must be backward compatible — skills without facets must still work
- FSRS algorithm must not be modified — only the routing of ratings to facets changes
- Token budget for facet context must be reasonable (~200-400 tokens per skill's facets)
- The system prompt is already long (~3,800 chars). Additions must be concise.
- Migration Impact: None — no schema changes. The facet tables already exist.

When complete, write your output to study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 4 — Development: Context Builder + System Prompt Reform

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md
- src/lib/study.js lines 1031-1200 (buildFocusedContext), lines 1415-1418 (buildSystemPrompt)
- src/lib/db.js lines 2180-2330 (Facets + FacetMastery)

TASK:

1. Implement buildFacetAssessmentBlock(skillIds) helper in study.js:
   - Load facets + mastery state for given skills
   - Format as structured text block with facet IDs, names, mastery %, and criteria
   - Return empty string if no facets exist (backward compat)

2. Inject into buildFocusedContext:
   - Skill-focused sessions: after the FOCUS SKILL block
   - Assignment-focused sessions: after REQUIRED SKILLS block

3. Modify buildSystemPrompt to add:
   - FACET TRACKING section (per blueprint)
   - ASSESSMENT PROTOCOL section (per blueprint)
   - Format specification for the new rating tags

4. Verify build passes with: npx vite build --mode development

CONSTRAINTS:
- Do NOT modify FSRS algorithm
- Do NOT modify applySkillUpdates or parseSkillUpdates (those are Step 5)
- Do NOT modify any UI components
- System prompt additions must be ≤800 characters to avoid bloating context
- Facet block must handle skills with 0 facets gracefully

When complete, write your development log to study/knowledge/development/facet-context-prompt-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 5 — Development: Parsing + FSRS Routing + Mastery Detection

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md
- study/knowledge/development/facet-context-prompt-2026-03-14.md
- src/lib/study.js lines 244-400 (applySkillUpdates), lines 1426-1465 (parseSkillUpdates)
- src/StudyContext.jsx lines 1041-1060 (sendMessage skill update handling)

TASK:

1. Modify parseSkillUpdates to parse facet-level ratings (per blueprint format):
   - Return updates with optional facetId / facetKey field
   - Backward compatible: updates without facet info still work

2. Modify applySkillUpdates:
   - When updates include facet-level ratings: route each to FacetMastery.upsert() individually
   - When updates are skill-level only: keep current uniform distribution
   - After all updates: check if all facets of any affected skill now cross mastery threshold
   - Return { updates, masteryEvents } instead of void (or add masteryEvents to a passed-in accumulator)

3. Modify sendMessage in StudyContext.jsx:
   - Capture mastery events from applySkillUpdates
   - Accumulate in sessionMasteryEvents ref across the session
   - Create enhanced notifications for mastery events vs normal skill updates

4. Verify build passes with: npx vite build --mode development

CONSTRAINTS:
- Do NOT modify FSRS core (reviewCard, initCard, etc.)
- applySkillUpdates return type change must not break PracticeMode (check all call sites)
- Mastery threshold value from research/blueprint — do not hardcode without SA specification

When complete, write your development log to study/knowledge/development/facet-parsing-routing-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 6 — Development: Session Mastery Summary UI

```
You are the Study Developer. Read your agent file at study/agents/STUDY_DEVELOPER.md.

Before starting, read these files:
- study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md
- study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md (MasteryEvent data structure)
- study/knowledge/development/facet-parsing-routing-2026-03-14.md (sessionMasteryEvents ref shape)
- src/components/study/MessageList.jsx
- src/components/study/SessionSummary.jsx
- src/StudyContext.jsx (session exit handlers)

TASK:

1. In-chat facet progress (per UX design):
   - Modify skill pill rendering in MessageList to show facet-level detail when facet updates are present
   - Live progress indicator for facets assessed during the session

2. Mastery celebration component:
   - New component (e.g., MasteryCard.jsx or integrated into existing flow) per UX design
   - Triggered when a mastery event fires
   - Shows: skill name, per-facet checklist with ratings, level before→after, "next review" date from FSRS

3. Session-end summary (per UX design):
   - Aggregate view of all mastery events and skill updates from the session
   - Shown on session exit (before returning to home/course screen)
   - Per-skill: facets assessed, ratings, mastery state change
   - Overall: skills leveled up count, total facets assessed, suggested next focus

4. Session journal enhancement:
   - Include mastery events in generateSessionEntry output
   - Per-facet breakdown stored in journal for history

5. Verify build passes with: npx vite build --mode development

CONSTRAINTS:
- Celebration must not block the UI — dismissable
- Session summary must be skippable (not a forced modal)
- Must work for sessions with zero mastery events (just show normal summary)
- Animations must not display when no active work is occurring (confirmed design principle)

When complete, write your development log to study/knowledge/development/facet-mastery-ui-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 7 — QA: Full Feature Verification

```
You are the Study Security & Testing Analyst. Read your agent file at study/agents/STUDY_SECURITY_TESTING_ANALYST.md.

Before starting, read these files:
- study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md
- study/knowledge/development/facet-context-prompt-2026-03-14.md
- study/knowledge/development/facet-parsing-routing-2026-03-14.md
- study/knowledge/development/facet-mastery-ui-2026-03-14.md
- All modified source files referenced in the dev logs above

TASK:

Test the following scenarios:

Context + Prompt (Step 4):
1. Skill-focused session: verify facet block appears in context with correct IDs, names, mastery %
2. Assignment-focused session: verify facets for required skills are included
3. Skill with 0 facets: verify no crash, graceful fallback to skill-level behavior
4. Token budget: measure actual facet block size for skills with 3, 5, 8 facets

Parsing + Routing (Step 5):
5. AI emits facet-level ratings: verify each facet gets individual FacetMastery.upsert
6. AI emits skill-level rating only (backward compat): verify uniform distribution still works
7. Mixed: some facets rated, skill also rated: verify correct routing
8. Mastery threshold detection: verify event fires when all facets cross threshold
9. Mastery threshold NOT met: verify no false positive when only some facets are strong
10. PracticeMode applySkillUpdates call: verify not broken by return type change

UI (Step 6):
11. Facet pills render correctly in chat messages
12. Mastery celebration card appears on skill mastery event
13. Celebration card is dismissable
14. Session-end summary shows correct aggregated data
15. Session with zero mastery events: summary shows normal content
16. Journal entry includes facet-level data
17. Notification system shows enhanced mastery notifications

Integration:
18. Full teaching session flow: enter course → pick skill → AI teaches → AI assesses facets → mastery event → celebration → exit → summary
19. FSRS integrity: verify facet mastery records have correct difficulty, stability, retrievability after assessment
20. Profile screen: verify skill readiness % reflects new facet mastery data
21. Build passes (npx vite build --mode development)
22. No console errors or warnings

Classify findings as:
- 🔴 Critical: mastery events don't fire, FSRS data corruption, build fails
- 🟡 Minor: visual polish, edge case formatting
- 🔵 Advisory: suggestions for future improvement

When complete, write your output to study/knowledge/qa/facet-mastery-qa-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 8 — UX Validation: Mastery Assessment Experience

```
You are the Study UX Validator. Read your agent file at study/agents/STUDY_UX_VALIDATOR.md.

Before starting, read these files:
- study/knowledge/research/facet-assessment-research-2026-03-14.md
- study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md
- study/knowledge/development/facet-context-prompt-2026-03-14.md
- study/knowledge/development/facet-parsing-routing-2026-03-14.md
- study/knowledge/development/facet-mastery-ui-2026-03-14.md
- study/knowledge/qa/facet-mastery-qa-2026-03-14.md

TASK:

Validate the implemented experience:

1. Assessment feels like teaching, not testing. Does the AI's assessment protocol feel natural within the teaching conversation, or does it feel like an abrupt exam at the end?

2. Celebration calibration. Is the mastery moment appropriately celebratory? Too much? Too little? Does it motivate continuing to the next skill?

3. Decay communication. Is the "your skill will need review" messaging honest without deflating the achievement?

4. Facet progress clarity. Can the student understand which facets they've demonstrated and which are still pending? Is the in-chat progress readable?

5. Session summary utility. Does the exit summary help the student know what to do next? Or is it just a report card?

6. Learning science risk assessment. Does the assessment protocol risk teaching to the test (students optimizing for checkmarks rather than understanding)?

When complete, write your output to study/knowledge/design/validation/facet-mastery-uxv-2026-03-14.md and include an Output Receipt at the bottom.
```

---

## Step 9 — Closeout: Status + Index Updates

```
You are the Study Product Analyst. Read your agent file at study/agents/STUDY_PRODUCT_ANALYST.md.

Before starting, read these files:
- All step deposits:
  - study/knowledge/research/facet-assessment-research-2026-03-14.md
  - study/knowledge/design/facet-mastery-summary-ux-2026-03-14.md
  - study/knowledge/architecture/facet-assessment-pipeline-2026-03-14.md
  - study/knowledge/development/facet-context-prompt-2026-03-14.md
  - study/knowledge/development/facet-parsing-routing-2026-03-14.md
  - study/knowledge/development/facet-mastery-ui-2026-03-14.md
  - study/knowledge/qa/facet-mastery-qa-2026-03-14.md
  - study/knowledge/design/validation/facet-mastery-uxv-2026-03-14.md
- study/PROJECT_STATUS.md
- study/knowledge/KNOWLEDGE_INDEX.md

TASK:

1. Update PROJECT_STATUS.md:
   - Add "Facet-Level Mastery Assessment" to "What Is Working" table
   - Add "Session Mastery Summary" to "What Is Working" table
   - Add development activity entries for all phases
   - Update system prompt section if relevant
   - Note new component files and LOC changes

2. Update knowledge/KNOWLEDGE_INDEX.md with all new files from Steps 1-8

3. Compile any open flags from step receipts into a summary for the CEO

Include an Output Receipt at the bottom of your response.
```
