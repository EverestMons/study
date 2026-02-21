# Study

An AI teaching companion that builds genuine understanding, not just homework completion.

## Philosophy

Most AI tutors give answers. Study teaches.

When you bring a homework problem, Study doesn't solve it for you. It decomposes the problem into prerequisite skills, diagnoses what you actually understand, fills the gaps through Socratic dialogue, and guides you to derive the solution yourself.

The goal: you finish your assignment **and** you understand the material deeply enough to not need help next time.

## How It Works

1. **Upload your course materials** — syllabi, textbooks, lecture transcripts, assignments
2. **Study extracts the skill tree** — what concepts the course teaches and how they connect
3. **Pick an assignment** — Study identifies which skills you need and checks if you have them
4. **Learn through dialogue** — Socratic method: questions first, teaching second
5. **Practice for mastery** — tiered problem sets that adapt to your level

## Key Features

### Assignment-First Architecture
Every session starts with: *what do you need to turn in, and can you do it?* Study prioritizes deadlines and works backward from assignments to skills.

### Material Fidelity
Study teaches your professor's course, not its own curriculum. All instruction references your actual course materials.

### Skill Strength Tracking
A spaced-repetition-inspired system tracks how well you know each skill and when you need to review.

### Practice Mode
Six-tier problem progression from prediction to application, with worked examples and confidence calibration.

## Learning Science

Study implements recommendations from the IES Practice Guide "Organizing Instruction and Study to Improve Student Learning" (2007):

| Recommendation | Implementation |
|----------------|----------------|
| Space learning over time | Decay model with review surfacing |
| Interleave worked examples | Examples shown before problems (Tiers 1-3) |
| Connect abstract and concrete | Concreteness fading in explanations |
| Pre-questions before teaching | Diagnostic questions before new skills |
| Quizzing for retrieval | Practice Mode with active recall |
| Help students self-assess | Confidence ratings with calibration feedback |
| Deep explanatory questions | Socratic teaching method |

## Tech Stack

- React (single-file artifact)
- Claude API for AI tutoring
- Browser-based persistent storage
- Open source only

## Usage

Study runs as a Claude artifact. Upload it to Claude and start a conversation with your course materials.

## Status

Active development. Core teaching loop works. Future plans include Tauri desktop app for native features.

## License

Open source. Built for learners.
