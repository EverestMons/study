/**
 * fsrs.js — FSRS-4.5 spaced repetition algorithm
 *
 * Pure functions implementing the Free Spaced Repetition Scheduler.
 * Based on the DSR (Difficulty, Stability, Retrievability) memory model.
 *
 * References:
 *   - https://github.com/open-spaced-repetition/fsrs4anki
 *   - https://borretti.me/article/implementing-fsrs-in-100-lines
 *   - IES Practice Guide: "Organizing Instruction and Study to Improve Student Learning"
 *
 * Rating mapping from Study's rating system:
 *   struggled → Again (1)  — forgot / couldn't recall
 *   hard      → Hard  (2)  — recalled with significant effort
 *   good      → Good  (3)  — recalled correctly
 *   easy      → Easy  (4)  — recalled instantly
 */

// --- FSRS-4.5 default parameters (19 weights) ---
// Trained on millions of Anki reviews. Good defaults for most learners.
const W = [
  0.40255, 1.18385, 3.173, 15.69105, // w0-w3: initial stability per grade
  7.1949,  0.5345,  1.4604, 0.0046,   // w4-w7: initial difficulty params
  1.54575, 0.1192,  1.01925, 1.9395,  // w8-w11: stability update params
  0.11,    0.29605, 2.2698,            // w12-w14: failure stability params
  0.2315,  2.9898,                     // w15-w16: hard penalty / easy bonus
  0.51655, 0.6621,                     // w17-w18: same-day review (unused here)
];

// Forgetting curve shape constants
const F = 19 / 81;
const C = -0.5;

// Desired retention: probability threshold for scheduling next review.
// 0.9 = review when there's a 90% chance of recall.
// This aligns with IES spaced repetition recommendations.
const DESIRED_RETENTION = 0.9;

// Max interval cap (days). ~1 year for course-based learning.
const MAX_INTERVAL = 365;

// --- Rating constants ---
export const Rating = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

// Map Study's string ratings to FSRS numeric grades
const RATING_MAP = {
  struggled: Rating.AGAIN,
  hard: Rating.HARD,
  good: Rating.GOOD,
  easy: Rating.EASY,
};

export const mapRating = (studyRating) =>
  RATING_MAP[studyRating] || Rating.GOOD;

// --- Retrievability ---
// R(t, S) = (1 + F * t/S)^C
// Probability of recall at time t (days) given stability S.
export const retrievability = (t, s) => {
  if (!s || s <= 0 || !t || t <= 0) return s > 0 ? 1.0 : 0.0;
  return Math.pow(1 + F * (t / s), C);
};

// --- Interval ---
// Given desired retention and stability, when should the next review be?
// I(R_d, S) = S/F * (R_d^(1/C) - 1)
const interval = (s) => {
  const days = (s / F) * (Math.pow(DESIRED_RETENTION, 1 / C) - 1);
  return Math.max(1, Math.min(Math.round(days), MAX_INTERVAL));
};

// --- Initial stability (first review) ---
// S_0(G) = W[G-1]
const s0 = (grade) => W[grade - 1];

// --- Initial difficulty (first review) ---
// D_0(G) = w4 - e^(w5 * (G-1)) + 1
const d0 = (grade) => clampD(W[4] - Math.exp(W[5] * (grade - 1)) + 1);

const clampD = (d) => Math.min(10, Math.max(1, d));

// --- Stability after successful recall (G >= 2) ---
// S' = S * alpha, where alpha = 1 + t_d * t_s * t_r * h * b * e^w8
const sSuccess = (d, s, r, grade) => {
  const td = 11 - d;                                    // difficulty penalty
  const ts = Math.pow(s, -W[9]);                         // stability saturation
  const tr = Math.exp(W[10] * (1 - r)) - 1;             // retrievability saturation
  const h = grade === Rating.HARD ? W[15] : 1.0;        // hard penalty
  const b = grade === Rating.EASY ? W[16] : 1.0;        // easy bonus
  const c = Math.exp(W[8]);                              // learned scale factor
  const alpha = 1 + td * ts * tr * h * b * c;
  return s * alpha;
};

// --- Stability after failure (G = 1, forgot) ---
// S_f = min(d_f * s_f * r_f * w11, S)
const sFail = (d, s, r) => {
  const df = Math.pow(d, -W[12]);                        // difficulty factor
  const sf = Math.pow(s + 1, W[13]) - 1;                // stability factor
  const rf = Math.exp(W[14] * (1 - r));                 // retrievability factor
  const cf = W[11];                                      // learned scale
  return Math.min(df * sf * rf * cf, s);
};

// --- Difficulty update after review ---
// D' = w7 * D_0(3) + (1 - w7) * (D - w6 * (G - 3))
// Mean reversion toward D_0(3) — the "average" difficulty.
const nextDifficulty = (d, grade) => {
  const delta = -W[6] * (grade - 3);
  return clampD(W[7] * d0(Rating.GOOD) + (1 - W[7]) * (d + delta));
};

// --- Core: create initial card state ---
export const initCard = () => ({
  difficulty: 0,   // no difficulty until first review
  stability: 0,    // no stability until first review
  reps: 0,
  lapses: 0,
});

// --- Core: review a card and return updated state + scheduling ---
/**
 * @param {object} card - { difficulty, stability, reps, lapses, lastReviewAt }
 * @param {number} grade - 1-4 (Again/Hard/Good/Easy)
 * @param {Date|string} [now] - current timestamp (default: now)
 * @returns {{ card: object, interval: number }} - updated card state + days until next review
 */
export const reviewCard = (card, grade, now) => {
  const nowDate = now ? new Date(now) : new Date();
  const nowMs = nowDate.getTime();

  // First review: initialize from scratch
  if (card.reps === 0) {
    const s = s0(grade);
    const d = d0(grade);
    const ivl = interval(s);
    const nextReview = new Date(nowMs + ivl * 86400000);

    return {
      card: {
        difficulty: d,
        stability: s,
        reps: 1,
        lapses: grade === Rating.AGAIN ? 1 : 0,
        lastReviewAt: nowDate.toISOString(),
        nextReviewAt: nextReview.toISOString(),
      },
      interval: ivl,
      retrievability: 1.0,
    };
  }

  // Subsequent review: compute elapsed time and current retrievability
  const lastReview = card.lastReviewAt ? new Date(card.lastReviewAt) : nowDate;
  const elapsedDays = Math.max(0, (nowMs - lastReview.getTime()) / 86400000);
  const r = retrievability(elapsedDays, card.stability);

  // Update stability
  let newS;
  if (grade === Rating.AGAIN) {
    newS = sFail(card.difficulty, card.stability, r);
  } else {
    newS = sSuccess(card.difficulty, card.stability, r, grade);
  }
  // Ensure stability never drops below a small positive number
  newS = Math.max(0.1, newS);

  // Update difficulty
  const newD = nextDifficulty(card.difficulty, grade);

  // Calculate next interval
  const ivl = interval(newS);
  const nextReview = new Date(nowMs + ivl * 86400000);

  return {
    card: {
      difficulty: newD,
      stability: newS,
      reps: card.reps + 1,
      lapses: card.lapses + (grade === Rating.AGAIN ? 1 : 0),
      lastReviewAt: nowDate.toISOString(),
      nextReviewAt: nextReview.toISOString(),
    },
    interval: ivl,
    retrievability: r,
  };
};

// --- Convenience: compute current retrievability for a card ---
/**
 * @param {object} card - must have .stability and .lastReviewAt
 * @param {Date|string} [now]
 * @returns {number} 0-1 probability of recall
 */
export const currentRetrievability = (card, now) => {
  if (!card || !card.stability || !card.lastReviewAt) return 0;
  const nowMs = (now ? new Date(now) : new Date()).getTime();
  // lastReviewAt may be epoch seconds (from DB/loadSkillsV2) or ISO string.
  // Epoch seconds are < 10^10; epoch ms are >= 10^12.
  var rawLr = card.lastReviewAt;
  var lrMs = typeof rawLr === 'number'
    ? (rawLr < 1e11 ? rawLr * 1000 : rawLr)   // seconds → ms
    : new Date(rawLr).getTime();                // ISO string → ms
  const elapsed = Math.max(0, (nowMs - lrMs) / 86400000);
  return retrievability(elapsed, card.stability);
};
