# Homework 9 Unlock Gate State — Diagnostic Findings
**Date:** 2026-03-29

---

## Q1: Assignment Identification

Two HW9 assignments exist in the DB (course `4cc9adad`):

| ID | Title |
|---|---|
| `f2116163-6a97-4b11-9913-80a9fd12f8cd` | Homework 9: Integer Arithmetic and Advanced Procedures |
| `06508ed1-ac1b-470b-aa15-3c1d24765738` | Homework 9: Irvine Chapter 7-8 (Integer Arithmetic, Advanced Procedures) |

Both contain 12 questions (q1–q12) with overlapping but not identical facet mappings. The second (`06508ed1`) has richer facet coverage (includes skills 676, 677 from a later extraction).

---

## Q2: Questions and Required Skills

### Assignment `06508ed1` (more complete mapping)

| Q | Description | Skills Required |
|---|---|---|
| q1 | Shift bits left, highest→Carry, lowest position | 204 (Shift and Rotate) |
| q2 | Shift bits right, lowest→Carry, Carry→highest | 204 |
| q3a | SHR AL,1 on 0D4h | 676 (Bit Shift and Rotate) |
| q3b | SAR AL,1 on 0D4h | 204, 676 |
| q3c | SAR AL,4 on 0D4h | 204, 676 |
| q3d | ROL AL,1 on 0D4h | 204, 676 |
| q4 | Multiply EAX by 24 using shifts | 676, 209 (Bit Manipulation) |
| q5 | Why no overflow in MUL/IMUL | 205 (Mul/Div), 677 (Integer Mul) |
| q6 | DIV quotient register (EBX) | 205 |
| q7 | DIV quotient register (BX) | 205 |
| q8 | MUL result in EAX:EDX | 205, 677 |
| q9 | CDQ + DIV result | 205, 189 (Sign Extension) |
| q10 | C expression → assembly | 206 (Arithmetic Expr), 205 |
| q11 | C function with conditionals | 195 (Procedures), 200 (CMP), 199 (Conditional Jumps), 205, 190 (Arithmetic) |
| q12 | Reverse-engineer assembly → C | 195, 194 (Stack Push/Pop), 210 (Stack Frame), 205 |

**Distinct skills across all questions:** 204, 676, 205, 677, 209, 206, 195, 200, 199, 190, 194, 210, 189 (13 skills)

---

## Q3: Facet Mastery State

**ALL 56 facets across all 15 involved skills (both assignments combined) have identical default state:**

| Field | Value |
|---|---|
| stability | 1.0 (extraction default) |
| retrievability | 1.0 (extraction default, STALE) |
| last_review_at | NULL (never reviewed) |
| reps | 0 (never reviewed) |
| last_rating | NULL |

No facet for any HW9-related skill has EVER been reviewed. The stored `retrievability: 1.0` is the extraction-time default — NOT a live computation.

---

## Q4: Computed Readiness (what `computeFacetReadiness()` would return)

`computeFacetReadiness` computes LIVE retrievability using `currentRetrievability()`:

```js
// fsrs.js:195
if (!card || !card.stability || !card.lastReviewAt) return 0;
```

Since `last_review_at = NULL` for all facets, `currentRetrievability()` returns **0** for every facet.

**Per-skill readiness:**

| Skill ID | Skill Name | Facet Count | Computed Readiness | Passes 60% Gate? |
|---|---|---|---|---|
| 189 | Sign and Zero Extension | 2 | **0%** | NO |
| 190 | Arithmetic Operations and Status Flags | 7 | **0%** | NO |
| 194 | Stack Operations with PUSH and POP | 4 | **0%** | NO |
| 195 | Create and Call Procedures | 5 | **0%** | NO |
| 199 | Conditional Jump Instructions | 4 | **0%** | NO |
| 200 | CMP Instruction and Flag-Based Branching | 3 | **0%** | NO |
| 204 | Shift and Rotate Instructions | 4 | **0%** | NO |
| 205 | Multiplication and Division Instructions | 4 | **0%** | NO |
| 206 | Arithmetic Expression Implementation | 3 | **0%** | NO |
| 209 | Bit Manipulation and Application Patterns | 4 | **0%** | NO |
| 210 | Stack Frame Management | 5 | **0%** | NO |
| 286 | Arithmetic Instructions and Register State Tracking | 3 | **0%** | NO |
| 654 | Implement Conditional Logic with If-Else | 3 | **0%** | NO |
| 676 | Bit Shift and Rotate Instructions | 3 | **0%** | NO |
| 677 | Integer Multiplication | 2 | **0%** | NO |

**Every skill is at 0% readiness. No question can be unlocked.**

---

## Q5: Session Exchanges

```
Total rows in session_exchanges table: 0
```

**Zero session exchanges exist in the entire database.** Only 4 facet_mastery records in the entire DB have `reps > 0` (all for skill 656 — linked list operations, unrelated to HW9).

This confirms: the student has never studied the HW9-related skills through the tutor. The FSRS data is entirely at extraction defaults.

---

## Q6: Summary — First Question (q1) Unlock Gate State

**Question q1:** "Identify instruction that shifts bits left, copies highest bit into Carry flag and lowest bit position"

**Required skill (assignment `06508ed1`):** Skill 204 — Shift and Rotate Instructions

| Facet | Facet ID | Stability | Last Review | Live Retrievability |
|---|---|---|---|---|
| Logical Shift Operations | 638 | 1.0 | NULL | **0%** |
| Arithmetic Shift Operations | 639 | 1.0 | NULL | **0%** |
| Rotate Operations with/without Carry | 640 | 1.0 | NULL | **0%** |
| Double-Operand Shift Operations | 641 | 1.0 | NULL | **0%** |

**Computed readiness for skill 204:** avg(0, 0, 0, 0) = **0%**
**Gate threshold:** 60%
**Result: BLOCKED** — q1 cannot be unlocked.

### The unlock flow working as intended:

1. Student enters assignment mode → all questions start `status: "locked"`
2. AI teaches prerequisite skills → emits `[SKILL_UPDATE]` tags
3. `applySkillUpdates()` writes FSRS data (sets `stability`, `last_review_at`, `reps`)
4. AI attempts `[UNLOCK_QUESTION]q1[/UNLOCK_QUESTION]`
5. `computeFacetReadiness([204])` queries DB → now sees real `last_review_at` → computes non-zero retrievability
6. If avg retrievability ≥ 0.6 → unlock allowed

**The gate is working correctly.** The current 0% state is expected — no studying has occurred. Once the student studies and receives `[SKILL_UPDATE]` ratings, the FSRS data will be written, `last_review_at` will be set, and `currentRetrievability()` will return non-zero values.

### Key insight: extraction defaults don't count

The extraction pipeline sets `stability: 1.0, retrievability: 1.0` as defaults (extraction.js:1192-1196), but `computeFacetReadiness` ignores the stored `retrievability` column and computes it LIVE from `stability` and `last_review_at`. Since `last_review_at` is NULL at extraction time, the live retrievability is 0. This is correct — extracting a skill from a textbook doesn't mean the student has learned it.
