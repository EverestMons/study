# Skill Profile View — Redesign Spec

## Design Philosophy

The profile is the student's **knowledge map**. It should be satisfying to look at, immediately legible, and rewarding to see grow. Every data point we store should be visible somewhere. The current profile is a summary dashboard; it needs to become a deep, explorable view of everything the student has learned.

The structure borrows from progression systems — levels, progress bars, clear next steps — but the substance is educational. The student should walk away understanding *what they know*, *how well they know it*, and *what to do next*. Not because a game told them to, but because the data is transparent and actionable.

The three-tier hierarchy (Domain → Parent Skill → Sub-skill) maps directly to progressive disclosure:
- **Domain level** — the broadest view, visible at a glance. "Where does my knowledge live?"
- **Parent skill level** — the subject areas. Click in and see depth. "How far have I gotten in Digital Logic?"
- **Sub-skill level** — the individual competencies. Full detail on demand. "What exactly does mastering half adders require?"

---

## Layout: Three Depth Levels

### Level 0: Domain Overview (top of profile)

The very first thing the student sees. A horizontal row or grid of their active CIP domains, each as a compact card. This answers: "What kind of student am I?"

**Each domain card shows:**
- Domain name (from CIP 2-digit family, e.g. "Engineering")
- Aggregate level across all parent skills in that domain
- Number of parent skills / sub-skills within
- A single readiness indicator (average retrievability across all sub-skills in domain)

**Feel:** Compact, glanceable. A student with 3 active domains sees 3 cards. A student with 8 sees 8. The immediate read should be "where is my knowledge concentrated?"

---

### Level 1: Parent Skill Cards (current view, enhanced)

Clicking a domain expands to show its parent skills. This is close to what exists now, but with additions.

**Each parent skill card shows (currently):**
- Level badge (sqrt of mastery points) ✓
- Name ✓
- Sub-skill count + reviewed count ✓
- Readiness bar ✓

**Add:**
- **Progress to next level.** The level badge is satisfying but static. Show a circular or bar progress indicator around/below the level number: "Level 5 — 73% to Level 6." Computed from: `nextLevelThreshold = (level + 1)² mastery points`, current progress = `totalPoints - level²`, percentage = `(current / ((level+1)² - level²)) * 100`.
- **CIP code subtitle.** Small, muted text below the name: "CIP 14.10 — Electrical Engineering." Gives the student a sense that their skills are mapped to a real-world taxonomy.
- **Streak or activity indicator.** If the student has practiced/studied skills in this parent within the last 7 days, show a subtle "active" indicator. If not, show days since last activity. This is the gentle nudge toward spaced review without being punishing.
- **Skills due for review count.** Badge or small counter: "3 skills due for review." Computed from `nextReviewAt <= now` across sub-skills. Always gives the student a clear next action.

---

### Level 2: Sub-skill Detail (the new part)

Expanding a parent skill currently shows a flat list of sub-skill names with readiness dots. This needs to become the detailed ability view.

**Sub-skill list enhancements:**

Group sub-skills by **category** (the `category` field from extraction), not just as a flat list. Each category is a collapsible section header within the parent skill card. This gives structure to what could be 30+ sub-skills in a single parent.

**Each sub-skill row shows (collapsed, single line):**
- Readiness dot (green/yellow/red) — current
- Name — current
- Readiness % — current
- **Bloom's level badge.** Tiny pill/tag: "Apply" or "Analyze." One word, color-coded by Bloom's tier. Gives the student a sense of cognitive complexity without explanation.
- **Skill type tag.** "Conceptual" / "Procedural" / "Analytical" — small muted text. Helps students understand what kind of thinking this skill requires.

**Each sub-skill expanded (click to open) shows a detail panel:**

Everything we know about this skill, laid out clearly.

**Section 1: Identity**
- Full name
- Description (the 1-2 sentence mastery description)
- Concept key (small, muted — this is the unique identifier)
- Bloom's level + skill type (larger than in the row)

**Section 2: Mastery Criteria**
This is the most important section. The mastery criteria are the specific testable things the student needs to demonstrate. Display as a checklist-style list — not interactive checkboxes, but reference items that make the standard of mastery concrete and visible.

Each criterion is a single line. If there are 4+ criteria, this section is scrollable.

**Section 3: Readiness & Memory**
The learning science behind how well this skill is retained.

- **Retrievability** — percentage with color bar. "How well you can recall this right now."
- **Stability** — days. "How long this memory lasts before fading." Higher = more durable. A freshly learned skill might have stability of 1 day; a well-practiced one might have 30+ days.
- **Difficulty** — FSRS difficulty parameter. Not directly shown as a number — instead, translate to a label: Easy / Moderate / Hard / Very Hard based on thresholds. "How challenging this skill is for you."
- **Reps** — total review count. "Times practiced."
- **Lapses** — times the student got it wrong after previously getting it right. "Times forgotten." A high lapse count signals a stubborn skill.
- **Next review** — date/relative time. "Review in 3 days" or "Due now" or "Not yet reviewed." Color-coded: green if not due, yellow if due soon, red if overdue.
- **Total mastery points** — cumulative points earned on this skill.

**Section 4: Prerequisites**
List prerequisite skills with their own readiness indicators. Each prerequisite is a clickable link that scrolls to / expands that skill's detail panel. This creates a navigable skill graph within the profile.

Format: "Requires: Boolean Algebra (87%), Number Systems (92%)"

If a prerequisite is weak (below 50%), highlight it — this tells the student where their foundation is shaky.

**Section 5: Evidence & Sources**
- **Anchor terms** — key vocabulary associated with this skill. Displayed as small tags/pills.
- **Definitions** — if the extraction captured definitions, show them.
- **Source material** — which course materials this skill was extracted from. "From: Digital Logic Textbook, Ch. 3" — these could link back to the material in the course view.

**Section 6: Fitness**
The fitness counters tell us how well-validated this skill is. Display as a simple stat group:
- "Diagnosed X times" (diagnostic_count)
- "Practiced X times" (practice_count)
- "Referenced in tutoring X times" (tutor_mention_count)
- "Decayed X times" (decay_events)

A skill with high practice count but zero diagnostic count hasn't been properly tested. A skill with high decay events is one the student keeps forgetting. These are subtle signals for the motivated student who wants to understand their learning patterns.

---

## Interaction Model

**Progressive disclosure, always.** The default view is Level 0 (domain cards) → Level 1 (parent skill cards). Sub-skills only appear when a parent is expanded. Sub-skill detail only appears when a sub-skill is clicked. This keeps the profile scannable for the student who just wants to check their levels, while rewarding the student who wants to dig deep.

**Navigation within the profile:**
- Clicking a prerequisite in a sub-skill detail panel should scroll to and expand that skill, even if it's in a different parent skill or category. This makes the prerequisite graph navigable.
- A "back to top" or breadcrumb should exist so the student can always orient themselves: "Engineering > Digital Logic > Category: Combinational Circuits > Half Adder Design"

**Actions from the profile:**
- **Practice this skill** — button in the sub-skill detail panel. Launches practice mode for that specific skill.
- **Review due skills** — button on the parent skill card when skills are due. Launches a practice session targeting all overdue skills in that parent.

---

## Data Mapping

Every field listed above already exists in the v2 schema and is loaded by `loadSkillsV2`. The `loadProfile` function needs to be updated to pass through the full sub-skill objects rather than just the summary stats.

| UI Element | Source |
|---|---|
| Domain name | `CIP_DOMAINS[cipCode.substring(0,2)]` |
| Parent skill name | `parent_skills.name` |
| Parent level | `floor(sqrt(totalMasteryPoints))` |
| Progress to next level | Computed from level thresholds |
| Sub-skill name | `sub_skills.name` |
| Description | `sub_skills.description` |
| Concept key | `sub_skills.concept_key` |
| Category | `sub_skills.category` |
| Skill type | `sub_skills.skill_type` |
| Bloom's level | `sub_skills.blooms_level` |
| Mastery criteria | `sub_skills.mastery_criteria` (JSON array) |
| Evidence / anchor terms | `sub_skills.evidence` (JSON object) |
| Fitness counters | `sub_skills.fitness` (JSON object) |
| Retrievability | Computed via `currentRetrievability()` from FSRS params |
| Stability | `mastery.stability` |
| Difficulty | `mastery.difficulty` |
| Reps | `mastery.reps` |
| Lapses | `mastery.lapses` |
| Next review | `mastery.next_review_at` |
| Total mastery points | `mastery.total_mastery_points` |
| Prerequisites | `skill_prerequisites` table, resolved names |
| Source material | `evidence.sources` or chunk bindings |

---

## What This Does NOT Include (yet)

- **Visual skill graph / tree visualization.** A node graph of the prerequisite network would be compelling, but it's a significant UI effort. The navigable list with clickable prerequisites is the pragmatic v1.
- **Achievements / milestones.** "First Level 10 skill area!" or "Mastered all prerequisites for Assignment 3." Worth exploring later as a separate feature.
- **Comparison / history.** "Your Digital Logic was Level 3 last month, now Level 5." Requires historical snapshots. Worth building later.
- **Leaderboards / social.** Out of scope for a personal learning tool.
