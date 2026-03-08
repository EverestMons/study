# IES Practice Guide Implementation Spec

## Overview

This spec maps the 7 recommendations from the IES Practice Guide "Organizing Instruction and Study to Improve Student Learning" (2007) to concrete features in Study. The guide is peer-reviewed, evidence-graded, and authored by leading researchers (Pashler, Koedinger, McDaniel, Graesser, et al.).

Most educational software ignores this research. Study's goal is to be the exception.

**Reference**: `ED498555.pdf` in project files

---

## Current State Assessment

| Rec | Description | Evidence | Study Status |
|-----|-------------|----------|--------------|
| 1 | Space learning over time | Moderate | **Partial** -- decay system exists, no UI surface |
| 2 | Interleave worked examples with problems | Moderate | **Weak** -- feedback exists, no pre-problem examples |
| 3 | Combine graphics with verbal | Moderate | **Missing** -- text-only |
| 4 | Connect abstract and concrete | Moderate | **Missing** -- no structured fading |
| 5a | Pre-questions before new topics | Low | **Missing** |
| 5b | Quizzing for retrieval | Strong | **Strong** -- Practice Mode |
| 6a | Delayed judgment of learning | Low | **Missing** -- no self-assessment |
| 6b | Use quizzes to identify gaps | Low | **Partial** -- AI tracks, not surfaced to student |
| 7 | Deep explanatory questions | Strong | **Strong** -- Socratic method |

---

## Phase 1: Low Complexity / High Impact

### 1.1 Spaced Review Surface (Rec 1)

**Problem**: Study calculates `nextReviewDate()` but never shows it to students.

**IES Evidence**: "Delayed re-exposure to course material often markedly increases the amount of information that students remember... 16-week-delayed review group performed almost twice as well as the 1-week-delayed review group."

**Implementation**:

1. On course boot, calculate which skills are due/overdue for review
2. In boot message, AI mentions: "3 skills are due for review: [X], [Y], [Z]"
3. In skill picker, add visual indicator (color/icon) for due skills
4. Optional: Add "Review" as third entry point alongside "Learn" and "Practice"

**Data needed**:
- `nextReviewDate(skillData)` -- already exists
- Compare against current date
- Filter skills where `nextReviewDate <= today`

**UI Changes**:
- Boot prompt modification
- Skill picker visual indicator
- (Optional) Review mode entry point

---

### 1.2 Pre-Questions (Rec 5a)

**Problem**: When a student starts learning a skill, the AI jumps straight to teaching.

**IES Evidence**: "When students are given pre-questions to answer prior to reading... they learn more from the text than when they do not respond to such pre-questions."

**Implementation**:

1. When entering Learn mode for a skill, AI asks 1-2 diagnostic questions FIRST
2. Student answers (or says "I don't know")
3. AI uses answers to calibrate teaching depth and starting point
4. This is distinct from the current "ask first, teach second" -- it's a structured pre-assessment phase

**Prompt Addition** (to buildSystemPrompt):
```
PRE-QUESTION PHASE:
When a student begins learning a new skill (first encounter or returning after decay),
start with 1-2 brief diagnostic questions BEFORE any teaching. Examples:
- "Before we dig in -- what does [term] mean to you?"
- "Quick check: can you explain [concept] in your own words?"

Use their answers to identify:
- Whether they have any prior knowledge
- Specific misconceptions to address
- Where to pitch the instruction

If they say "I don't know" -- that's useful data. Start from foundations.
```

**No code change needed** -- pure prompt engineering.

---

### 1.3 Concreteness Fading (Rec 4)

**Problem**: AI doesn't systematically move from concrete to abstract.

**IES Evidence**: "Learning with concrete objects supports initial understanding... but does not support the transfer of that knowledge to novel contexts." The solution is "concreteness fading" -- start concrete, progressively abstract.

**Implementation**:

Add to system prompt:
```
CONCRETENESS FADING:
When introducing abstract concepts, follow this progression:

1. CONCRETE FIRST: Start with a specific, tangible example the student can visualize
   - Use real objects, scenarios, or situations
   - Reference things from course materials when possible

2. BRIDGE: Connect the concrete example to the underlying principle
   - "Notice how [concrete] works? That's because [principle]"

3. ABSTRACT: State the general rule or formula
   - Now the abstraction has a mental hook

4. VARY: Give a different concrete example to show the principle transfers
   - Prevents students from over-fitting to one context

When student demonstrates understanding of concrete, shift toward abstract.
When they struggle with abstract, return to concrete.
```

**No code change needed** -- pure prompt engineering.

---

### 1.4 Gap Identification Surface (Rec 6b)

**Problem**: Study tracks skill strength internally, but doesn't explicitly surface gaps to students.

**IES Evidence**: "Quizzes may help students identify which items are not well learned, and thus enable more effective allocation of study time."

**Implementation**:

1. In boot message, explicitly name weak skills: "You're solid on [X] and [Y], but [Z] needs work."
2. After Practice Mode session, summarize: "You passed Tier 3, but struggled with [specific aspect]. Worth revisiting."
3. In skill picker, show strength percentage or tier level for each skill

**Boot prompt modification**:
```
When greeting returning students, explicitly identify:
- Skills with strength > 0.7: "solid"
- Skills with strength 0.4-0.7: "developing"
- Skills with strength < 0.4: "needs work"
- Skills that have decayed significantly since last practice

Be direct: "Your weakest area right now is [X]. That's where I'd focus."
```

**Code change**: Pass skill strength data to boot prompt (may already be there via profile).

---

## Phase 2: Medium Complexity

### 2.1 Worked Example Interleaving (Rec 2)

**Problem**: Practice Mode gives problems but no worked examples before attempting.

**IES Evidence**: "Students learn more by alternating between studying examples of worked-out problem solutions and solving similar problems on their own... students in the interleaved example/problem treatment condition not only took less time to complete the eight problems, but also performed better on the post-test."

**Implementation**:

Modify Practice Mode flow:

**Tiers 1-3** (novice):
1. Show worked example with annotation
2. Student studies it
3. Present similar (not identical) problem
4. Student attempts
5. Feedback
6. Repeat

**Tiers 4-6** (developing expertise):
- Reduce example frequency (every other problem, then every third)
- "As students develop greater expertise, decreased example use and correspondingly increased problem solving appears to improve learning"

**Data model change**:
```javascript
// In problem generation, also generate a worked example
{
  id: "p1",
  workedExample: {
    problem: "similar problem statement",
    solution: "step-by-step solution with annotations",
    keyInsight: "what principle this demonstrates"
  },
  problem: {
    prompt: "the actual problem for student to solve",
    // ... existing fields
  }
}
```

**UI change**:
- New "Example" view before problem view
- "Study Example" -> "Try Problem" flow
- Timer or acknowledgment before allowing problem attempt

---

### 2.2 Self-Assessment Calibration (Rec 6a)

**Problem**: Students have "illusion of knowing" -- they think they understand when they don't.

**IES Evidence**: "Most learners cannot accurately judge what they do and don't know, and typically overestimate how well they have mastered material... the 'illusion of knowing' is reflected in the assertion that many students make after they receive a poor grade on a test: 'But I studied so hard.'"

**Implementation**:

Before each Practice Mode problem:
1. Show problem prompt (no input yet)
2. Ask: "How confident are you that you can solve this? (1-5)"
3. Student rates confidence
4. Student attempts problem
5. After evaluation, show calibration: "You rated 4/5 confidence but got it wrong. Your calibration is off on this type of problem."

Track over time:
- `calibrationScore = correlation(confidenceRatings, actualResults)`
- Surface to student: "Your confidence tends to be [higher/lower/accurate] compared to your actual performance"

**Data model addition**:
```javascript
// Per problem attempt
{
  confidenceRating: 1-5,
  passed: boolean,
  calibrationDelta: confidenceRating - (passed ? 5 : 1)
}

// Per skill
{
  calibrationHistory: [...],
  averageCalibration: number // positive = overconfident, negative = underconfident
}
```

**Why this matters**: Students who learn to accurately self-assess study more efficiently. They stop wasting time on material they've mastered and focus on actual gaps.

---

## Phase 3: Larger Lifts

### 3.1 Graphics + Verbal (Rec 3)

**Problem**: Study is entirely text-based.

**IES Evidence**: "Adding relevant graphical presentations to text descriptions can lead to better learning than text alone... students learn more when the verbal description is presented in audio form rather than in written text."

**Options**:

1. **Punt**: Accept limitation, revisit in Tauri version
2. **ASCII/Text diagrams**: For simple concepts, use monospace art
3. **Mermaid integration**: If artifact can render Mermaid, use for flowcharts/diagrams
4. **External links**: AI can reference diagrams in course materials by page/figure number

**Recommendation**: Punt for now. This is a fundamental modality limitation. Note in teaching prompts:
```
When a concept would benefit from visualization, reference specific figures
or diagrams in the course materials: "Check Figure 3.2 in your textbook --
it shows this process step by step."
```

---

## Implementation Order

1. **1.2 Pre-Questions** -- prompt change only, immediate
2. **1.3 Concreteness Fading** -- prompt change only, immediate
3. **1.4 Gap Identification** -- boot prompt + minor data passing
4. **1.1 Spaced Review Surface** -- boot prompt + skill picker UI
5. **2.1 Worked Example Interleaving** -- Practice Mode restructure
6. **2.2 Self-Assessment Calibration** -- new interaction pattern + data model

---

## Success Metrics

How do we know these work?

1. **Spacing**: Students return to review due skills (track in journal)
2. **Pre-questions**: AI asks diagnostic questions before teaching (observable in chat)
3. **Concreteness fading**: AI uses concrete->abstract progression (observable)
4. **Gap identification**: Students focus practice on weak skills (track in journal)
5. **Worked examples**: Practice Mode completion rate improves
6. **Self-assessment**: Calibration accuracy improves over time

---

## References

- IES Practice Guide: "Organizing Instruction and Study to Improve Student Learning" (2007)
- Authors: Pashler, Bain, Bottge, Graesser, Koedinger, McDaniel, Metcalfe
- Document: `ED498555.pdf` in project files
