# Facet-Level Mastery Assessment — Full Feature QA Report
**Date:** 2026-03-14
**Agent:** Study Security & Testing Analyst
**Step:** Step 7
**Scope:** Steps 4 (Context + Prompt), 5 (Parsing + Routing), 6 (Session Mastery Summary UI)

---

## Build Verification

```
npx vite build --mode development
✓ 175 modules transformed.
✓ built in 1m 14s
Main bundle: 1,176.63 kB (unchanged from Step 6 baseline)
```

No new errors or warnings. Existing warnings (dynamic import of statically imported db.js, htmlToMarkdown.js, extraction.js) are pre-existing and unrelated.

---

## Test Scenarios

### Context + Prompt (Step 4)

#### T1: `buildFacetAssessmentBlock` generates correct text
**File:** `src/lib/study.js:1223-1283`
**Status:** PASS

- Caps at `MAX_SKILLS = 3` skills per block (token budget control)
- Resolves both numeric ID and conceptKey via `s.id === sid || s.conceptKey === sid`
- Skills without facets in DB are silently skipped (`if (!facets.length) continue`)
- Each facet shows mastery as `"untested"` or `"N%"` (computed via `currentRetrievability`)
- Mastery criteria displayed when present: `"Demonstrates: criterion1; criterion2"`
- Truncation note appended when skills exceed cap: `"[N more skills with facets -- rate by skill-level]"`
- All DB calls wrapped in try/catch (graceful degradation if facets table doesn't exist yet)

#### T2: `buildFocusedContext` injects facet block for skill focus
**File:** `src/lib/study.js:1401-1402`
**Status:** PASS

```js
var skillFacetBlock = await buildFacetAssessmentBlock([skill.id], allSkills);
if (skillFacetBlock) ctx += "\n" + skillFacetBlock + "\n";
```

Injection point: after skill description, mastery criteria, and prerequisite status — before source material. Correct position for the AI to see facets before teaching begins.

#### T3: `buildFocusedContext` injects facet block for assignment focus
**File:** `src/lib/study.js:1321-1326`
**Status:** PASS

Collects all required skill IDs from assignment questions, resolves to numeric IDs, passes to `buildFacetAssessmentBlock`. Block appears after "REQUIRED SKILLS FOR THIS ASSIGNMENT" section, before source material loading.

#### T4: System prompt includes FACET-LEVEL ASSESSMENT section
**File:** `src/lib/study.js:1690-1692` (end of `buildSystemPrompt`)
**Status:** PASS

Full section present:
```
FACET-LEVEL ASSESSMENT:
When the context includes a FACETS section for a skill, rate individual facets...
```

Includes correct format example with indented facet lines under skill-level line. Correctly instructs AI to only rate facets when context contains FACETS section (conditional on `buildFacetAssessmentBlock` having been injected).

#### T5: System prompt includes ASSESSMENT PROTOCOL section
**File:** `src/lib/study.js:1690-1692` (end of `buildSystemPrompt`)
**Status:** PASS

Section present with three key directives:
1. "Assess facets continuously during teaching — each exchange is evidence"
2. "Do NOT save assessment for the end or announce you are assessing"
3. "If unassessed facets remain, introduce them through a synthesis question"
4. "Never iterate through facets one-by-one and never announce assessment mode"

#### T6: Facet mastery state appears in context
**File:** `src/lib/study.js:1248-1256`
**Status:** PASS

Each facet displays its mastery state:
- New/untested: `"[mastery: untested]"`
- Previously assessed: `"[mastery: N%]"` where N = `currentRetrievability(...)` * 100

Bloom's level tag appended when present: `"[blooms: apply]"`

---

### Parsing + Routing (Step 5)

#### T7: `parseSkillUpdates` parses facet sub-lines
**File:** `src/lib/study.js:1706-1720`
**Status:** PASS

Facet sub-line regex: `/^(?:\s+|>)\s*([\w-]+):\s*(struggled|hard|good|easy)\s*\|?\s*(.*)/i`

- Matches lines indented with spaces or prefixed with `>`
- Only parses if `currentSkill` exists (facet line must follow a skill line)
- Extracts facetKey, rating, reason, context tag, and criteria tag
- Each parsed facet pushed to `currentSkill.facets[]`
- Context defaults to `'guided'` if not specified
- All regex extraction (context, criteria) is consistent with skill-level parsing

Verified format compatibility:
```
concept-key: good | reason | context:diagnostic
  facet-key-1: easy | reason | context:diagnostic
  facet-key-2: good | reason | context:guided
```

#### T8: `parseSkillUpdates` handles zero facet sub-lines (backward compat)
**File:** `src/lib/study.js:1741`
**Status:** PASS

Skill-level parsing creates: `{ skillId, rating, reason, context, criteria, source: 'tutor', facets: [] }`

Empty `facets` array is the default. All downstream code guards with `u.facets && u.facets.length > 0` or `facetUpdates.length > 0`, so empty arrays flow to the uniform distribution or skill-level fallback paths correctly.

#### T9: `applySkillUpdates` per-facet FSRS routing
**File:** `src/lib/study.js:316-417`
**Status:** PASS

When `facetUpdates.length > 0`:
1. Each facet matched by `concept_key` against DB facets
2. Individual FSRS card loaded/created per facet
3. `reviewCard()` called with facet-specific grade
4. Stability gain modulated by `fuContextMult * fuSourceWeight`
5. Mastery transfer from concept links (first interaction only, grade >= 3)
6. Facet-specific Bloom's multiplier used if available (falls back to skill's)
7. Points computed per-facet: `MAX(1, ROUND(basePts * contextMult * bloomsMult * sourceWeight * decayBonus * intentWeight))`
8. `FacetMastery.upsert()` persists per-facet FSRS state
9. Lines 419-438: Unmentioned facets' existing mastery loaded for aggregate computation

#### T10: `applySkillUpdates` uniform distribution fallback
**File:** `src/lib/study.js:439-534`
**Status:** PASS

When AI provides no facet sub-lines but skill has facets in DB:
- All facets receive the skill-level rating
- Each facet gets independent FSRS transition (not shared state)
- Same mastery transfer logic as per-facet path
- Weighted points use skill-level rating for all facets

This preserves backward compatibility: pre-Step 5 AI responses (no facet sub-lines) still update facet-level mastery uniformly.

#### T11: `applySkillUpdates` skill-level aggregate computation
**File:** `src/lib/study.js:536-558`
**Status:** PASS

Aggregation from `facetResults[]`:
| Metric | Aggregation | Rationale |
|---|---|---|
| retrievability | average | Overall recall probability |
| stability | min | Bottleneck facet determines review timing |
| difficulty | average | Overall difficulty |
| reps | max | Most-practiced facet count |
| lapses | max | Worst-case lapse count |
| lastReviewAt | max | Most recent review |
| nextReviewAt | min | Earliest due facet drives next review |
| totalMasteryPoints | sum | Cumulative across all facets |

Written to skill-level `Mastery` table via `Mastery.upsert()` — maintains backward compatibility for CurriculumScreen, ProfileScreen, and other consumers that read skill-level mastery.

#### T12: Mastery threshold detection
**File:** `src/lib/study.js:561-603`
**Status:** PASS

Logic trace:
1. Skip if `sessionMasteredSkills.has(u.skillId)` — deduplication
2. Load post-update facet mastery rows from DB
3. `allAssessed = postFacetRows.length === facets.length` — every facet has a mastery row
4. `allGoodPlus = allAssessed && every(fm => last_rating === 'good' || 'easy')` — all facets pass threshold
5. `wasAlreadyMastered = facets.every(f => preFacetRatings[f.id] === 'good' || 'easy')` — transition guard (only fires on new mastery, not re-confirmation)
6. If all pass and it's a new transition → create mastery event

Edge case verified: Multi-interaction mastery accumulation. If 2/3 facets are good in interaction 1 and the 3rd becomes good in interaction 2, mastery correctly triggers in interaction 2 (postFacetRows has all 3, wasAlreadyMastered is false because facet 3 was not previously good).

#### T13: Mastery event data structure completeness
**File:** `src/lib/study.js:581-599`
**Status:** PASS

```js
{
  skillId,           // numeric skill ID
  skillName,         // human-readable name (from DB or fallback to skillId)
  conceptKey,        // string concept key
  facets: [{         // array of ALL facets (not just newly rated ones)
    id, name, rating, isNew
  }],
  levelBefore,       // _pointsToLevel(old skill-level points)
  levelAfter,        // _pointsToLevel(sum of post-update facet points)
  nextReviewDays,    // Math.ceil(min stability across all facets)
  messageIndex: null, // set by sendMessage to assistant message index
  timestamp,         // Date.now()
}
```

All fields consumed by:
- `MessageList.jsx` MasteryCard: `skillName`, `levelBefore`, `levelAfter`, `facets[].name`, `facets[].rating`, `nextReviewDays`, `messageIndex`
- `SessionSummary.jsx` Skills Mastered: `skillName`, `levelBefore`, `levelAfter`, `facets.length`
- `StudyContext.jsx` notification: `skillName`, `levelAfter`
- `study.js` journal: `skillName`, `levelBefore`, `levelAfter`, `facets.length`

No missing fields. All consumers verified.

#### T14: PracticeMode backward compatibility
**File:** `src/components/study/PracticeMode.jsx:287-293`
**Status:** PASS

```js
await applySkillUpdates(active.id, [{
  skillId: pm.skill.id,
  rating: practiceRating,
  reason: "Practice Tier ...",
  source: 'practice',
  context: 'guided',
}]);
```

- No `facets` property → `u.facets` is `undefined`
- `applySkillUpdates` line 313: `facetUpdates = []` (guard: `u.facets && u.facets.length > 0`)
- If skill has DB facets → uniform distribution path (all facets get practiceRating)
- If no DB facets → skill-level fallback
- `intentWeight` not passed → defaults to 1.0 (line 245)
- `sessionMasteredSkills` not passed → defaults to `new Set()` (line 563)
- Return value (potential mastery events) not captured — see T14-NOTE below

#### T15: `sessionMasteredSkills` deduplication
**File:** `src/StudyContext.jsx:1070` + `src/lib/study.js:564`
**Status:** PASS

- `sendMessage` (line 1070): `sessionMasteredSkills.current.add(me.skillId)` after each mastery event
- `applySkillUpdates` (line 564): `if (!masteredSet.has(u.skillId))` — skips mastery check for already-mastered skills
- Prevents duplicate mastery celebration for the same skill in one session
- Both `skillId` and `conceptKey` added to `masteredSkillIds` (line 1071-1072) for notification dedup

---

### UI (Step 6)

#### T16: MessageList — no facets path
**File:** `src/components/study/MessageList.jsx:80-86`
**Status:** PASS

Guard: `var hasFacets = sp.facets && sp.facets.length > 0;`
When `!hasFacets`: renders original inline pill with `ratingBg[sp.rating]` background, `ratingColor[sp.rating]` text. Identical to pre-Step 6 behavior.

#### T17: MessageList — single facet path
**File:** `src/components/study/MessageList.jsx:87-95`
**Status:** PASS

When `sp.facets.length === 1`: minimal pill with:
- Filled 6px circle in `ratingColor[f.rating]`
- Facet name via `formatKey(f.facetKey)` (kebab → Title Case)
- Rating text in `ratingColor`
- Subtle styling: `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 8`

#### T18: MessageList — multi-facet path
**File:** `src/components/study/MessageList.jsx:97-120`
**Status:** PASS

When `sp.facets.length >= 2`: expanded card with:
- Skill name (12px bold) + rating on right
- Facet rows: tree connector (`├` / `└` for last), facet name, 5-dot indicator, rating text
- Mini dots: `RATING_DOTS[f.rating]` (easy=5, good=4, hard=2, struggled=1) filled, rest `T.bd`
- Styling: `background: T.sf`, `border: 1px solid T.bd`, `borderRadius: 10`

#### T19: Inline mastery celebration cards
**File:** `src/components/study/MessageList.jsx:125-151`
**Status:** PASS

- Rendered after each assistant message: `sessionMasteryEvents.current.filter(me => me.messageIndex === i)`
- `messageIndex` correctly set in `sendMessage` (line 1068): `me.messageIndex = newMsgs.length` — matches assistant message index
- Non-modal, non-blocking: centered in chat flow (`maxWidth: "80%"`, `margin: "20px auto"`)
- Green border: `border: "1px solid " + T.gn`
- Conditional level display: hidden when `levelBefore === levelAfter`
- Facet checklist: green `✓` + name + rating
- Next review text: "well locked in" when `nextReviewDays > 14`
- `animation: "fadeIn 0.3s"` — reuses existing keyframe

#### T20: SessionSummary — Skills Mastered section
**File:** `src/components/study/SessionSummary.jsx:72-96`
**Status:** PASS

- Only rendered when `masteryEvents.length > 0`
- Green-tinted container: `rgba(52,211,153,0.06)` bg, `rgba(52,211,153,0.2)` border
- Each event: `✓` + skill name + `Lv N→M` (conditional)
- Facet count: `me.facets.length/me.facets.length facets demonstrated`
- Multiple events separated by subtle green internal border
- Skills Practiced section (line 99) correctly filters: `nonMasteredSkills = skillChanges.filter(sc => !masteredIds.has(sc.skillId))`
- Third stat card ("mastered" with `T.gn`) only appears when mastery events exist

#### T21: SessionSummary — Facets Assessed section
**File:** `src/components/study/SessionSummary.jsx:117-137`
**Status:** PASS

- Deduplication: `facetMap.set(fa.facetKey, fa)` (last rating wins)
- Shows first 5 facets, `+ N more` button for rest
- `facetsExpanded` state toggles full list
- Each facet: name via `formatKey(fa.facetKey)`, rating with color

#### T22: NotifPanel mastery type
**File:** `src/components/study/NotifPanel.jsx:64-65`
**Status:** PASS

- `typeColor`: `n.type === "mastery" ? T.gn : ...` — green, distinct from skill purple
- `typeIcon`: `n.type === "mastery" ? "★" : ...` — star, distinct from skill `^`
- Renders with left-border pattern consistent with all notification types

---

## Additional Findings

### 🟡 M1: PracticeMode mastery events silently dropped
**Severity:** Minor
**Files:** `src/components/study/PracticeMode.jsx:287-293`

PracticeMode calls `applySkillUpdates()` without capturing the return value and without passing `sessionMasteredSkills`. If a practice tier completion triggers mastery (all facets now good/easy), the mastery event is returned but discarded. No mastery celebration card, no SessionSummary mastery section, no journal mastery entry for practice-triggered mastery.

**Impact:** Low. PracticeMode has its own tier completion UX and operates outside the chat flow. Mastery celebrations are designed for the conversational study context. However, practice is the highest-fidelity evidence source (`source: 'practice'`), so mastery triggered by practice IS meaningful.

**Recommendation:** Wire `applySkillUpdates` return value to a practice-specific mastery notification in a future step.

### 🟡 M2: Level comparison may show decrease after facet extraction
**Severity:** Minor
**Files:** `src/lib/study.js:576-578`

When mastery events compute level change:
- `levelBefore = _pointsToLevel(pointsBefore)` — from skill-level `Mastery` row (accumulated pre-facet)
- `levelAfter = _pointsToLevel(postTotalPts)` — sum of facet mastery points (new)

If a skill accumulated significant points before facets were extracted (e.g., 50 pts = Lv 3) and facets start fresh, the first mastery event could show a level *decrease* (Lv 3 → Lv 1) in the celebration card.

**Impact:** Low — edge case requiring specific sequence (pre-facet accumulation → extraction → immediate all-good rating). The MasteryCard correctly hides the level section when `levelBefore === levelAfter`, but shows confusing data when they differ in the wrong direction.

**Recommendation:** Consider clamping `levelAfter = Math.max(levelBefore, levelAfter)` in the mastery event construction, or seeding facet mastery points proportionally when facets are first extracted.

### 🔵 A1: Facet assessment only available in assignment/skill focus modes
**Severity:** Advisory
**Files:** `src/lib/study.js:1285-1625`

`buildFacetAssessmentBlock` is only injected by:
- `focus.type === "assignment"` (line 1325)
- `focus.type === "skill"` (line 1401)

Not injected for:
- `focus.type === "exam"` — loads full chunks, token budget concern
- `focus.type === "explore"` — lightweight context
- `focus.type === "recap"` — skill summary only
- `buildContext` (unfocused) — keyword-based content loading

The system prompt correctly conditions facet assessment: "When the context includes a FACETS section..." — so the AI falls back to skill-level rating in non-injected modes. By design, but worth documenting: facet-level assessment is scoped to focused study sessions.

### 🔵 A2: `formatKey` function duplicated
**Severity:** Advisory
**Files:** `src/components/study/MessageList.jsx:19`, `src/components/study/SessionSummary.jsx:6`

Both files independently define:
```js
const formatKey = (k) => k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
```

Not a bug. Could be extracted to `theme.jsx` or `study.js` if more consumers appear.

### 🔵 A3: Facet display names differ between pills and mastery cards
**Severity:** Advisory
**Files:** MessageList.jsx (pills) vs mastery card (events)

- **Facet pills** (from `parseSkillUpdates`): Display `formatKey(facetKey)` — converts kebab-case to Title Case
- **Mastery cards** (from `applySkillUpdates`): Display `me.facets[].name` — actual DB facet name

The DB name and the formatted key may differ (e.g., DB: "Applying L'Hôpital's Rule" vs formatted: "Applying L Hopital S Rule"). Minor visual inconsistency between inline pills and celebration cards.

### 🔵 A4: `sessionFacetUpdates` doesn't include parent skill name
**Severity:** Advisory
**File:** `src/StudyContext.jsx:1059`

```js
sessionFacetUpdates.current.push({ facetKey: fu.facetKey, skillId: u.skillId, rating: fu.rating });
```

The SessionSummary "Facets Assessed" section shows facets without their parent skill context. Users see facet names but can't immediately tell which skill they belong to. Minor UX gap.

### 🔵 A5: Explore mode doesn't inject facet assessment block but does load facet-based content
**Severity:** Advisory
**File:** `src/lib/study.js:1563-1581`

Explore mode uses `loadFacetBasedContent` for source material loading (leveraging facet→chunk bindings) but doesn't add the `buildFacetAssessmentBlock` section that tells the AI about individual facets. This means facets influence WHAT content the AI sees, but the AI can't rate them individually. Consistent with the lightweight design of explore mode.

---

## Backward Compatibility Matrix

| Scenario | Behavior | Verified |
|---|---|---|
| Session with zero mastery events | SessionSummary renders identically to pre-Step 6 (2 stat cards, no mastery/facet sections) | ✓ |
| Messages without facet data | Skill pills render as original inline pill (no facets path) | ✓ |
| AI response with no SKILL_UPDATE block | `parseSkillUpdates` returns `[]`, no updates applied | ✓ |
| AI response with skill-level only rating (no facet sub-lines) | Uniform distribution to facets if they exist in DB, or skill-level fallback | ✓ |
| PracticeMode `applySkillUpdates` call | No `facets` property → uniform distribution or skill-level fallback | ✓ |
| `generateSessionEntry` with 3 args (legacy callers) | 4th/5th params default to `undefined`, handled by `(masteryEventsLog \|\| [])` | ✓ |
| Existing notification types | `error`, `warn`, `skill`, `success` unchanged in ternary chain | ✓ |
| Skills without facets in DB | `applySkillUpdates` takes skill-level fallback path (line 605-678) | ✓ |
| CurriculumScreen reading skill mastery | Reads from `Mastery` table, which is updated by aggregate computation | ✓ |
| ProfileScreen reading skill mastery | Same — `Mastery` table backward compat maintained | ✓ |

---

## Data Flow Verification

### sendMessage → mastery event lifecycle
```
1. callClaudeStream(sysPrompt, chatMsgs) → response text
2. parseSkillUpdates(response) → updates[] with facets[]
3. applySkillUpdates(courseId, updates, intentWeight, sessionMasteredSkills)
   → Per-facet or uniform FSRS routing
   → Skill-level aggregate written to Mastery table
   → Mastery threshold check → masteryEvents[]
4. sendMessage receives masteryEvents:
   a. me.messageIndex = newMsgs.length (assistant message index)
   b. sessionMasteryEvents.current.push(me)
   c. sessionMasteredSkills.current.add(me.skillId)
   d. addNotif("mastery", skillName + " → Lv " + levelAfter)
5. Facet updates accumulated: sessionFacetUpdates.current.push(...)
6. Regular skill notifs: skip skills in masteredSkillIds set
```

### Session exit → summary lifecycle
```
1. StudyScreen back button:
   a. generateSessionEntry(msgs, startIdx, skillLog, masteryEvents, facetUpdates)
   b. saveSessionToJournal()
   c. setSessionSummary({ entry, skillChanges, duration, courseName, asgnWork,
      masteryEvents: sessionMasteryEvents.current.slice(),
      facetsAssessed: sessionFacetUpdates.current.slice() })
2. SessionSummary renders from sessionSummary state (plain arrays, not refs)
3. Done button resets all refs:
   sessionMasteryEvents.current = []
   sessionFacetUpdates.current = []
   sessionMasteredSkills.current = new Set()
```

### Session init resets
```
enterStudy() (StudyContext.jsx:708-718):
  sessionMasteryEvents.current = []
  sessionFacetUpdates.current = []
  sessionMasteredSkills.current = new Set()
```

---

## Summary

| Category | Pass | Minor | Advisory |
|---|---|---|---|
| Context + Prompt (T1-T6) | 6 | 0 | 0 |
| Parsing + Routing (T7-T15) | 9 | 0 | 0 |
| UI (T16-T22) | 7 | 0 | 0 |
| Additional Findings | — | 2 | 5 |
| **Total** | **22/22** | **2** | **5** |

**All 22 test scenarios pass.** No critical issues found. Two minor issues (M1: PracticeMode mastery events not wired, M2: potential level decrease display after facet extraction) and five advisory notes. Build verified clean.

---

## Output Receipt
**Agent:** Study Security & Testing Analyst
**Step:** Step 7
**Status:** Complete

### What Was Done
Comprehensive QA verification of the Facet-Level Mastery Assessment feature across all 3 implementation steps (4, 5, 6). Verified 22 test scenarios covering context building, system prompt, parsing, FSRS routing, mastery detection, UI rendering, session lifecycle, and backward compatibility. All scenarios pass.

### Files Deposited
- `study/knowledge/qa/facet-mastery-qa-2026-03-14.md` — This QA report

### Files Created or Modified (Code)
- None

### Decisions Made
- Classified PracticeMode mastery event gap as Minor (M1) rather than Critical — PracticeMode has its own completion UX and mastery celebrations are designed for conversational study context
- Classified level decrease display as Minor (M2) rather than Critical — edge case requiring specific sequence, non-harmful display
- Confirmed facet assessment scoping to assignment/skill focus modes is by-design, not a bug (A1)

### Flags for CEO
- None — no critical issues

### Flags for Next Step
- **M1** (PracticeMode mastery events): If Step 8+ includes PracticeMode enhancements, consider wiring mastery events from practice completions
- **M2** (Level decrease on extraction): Consider seeding facet mastery points proportionally when facets are first extracted for a skill with existing mastery — this would prevent confusing level display in mastery cards
