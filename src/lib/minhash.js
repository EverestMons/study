// ============================================================
// MinHash Near-Duplicate Detection
//
// Pure algorithm module — zero internal dependencies.
// Uses 5-word shingling + 128 MinHash functions for
// cheap Jaccard similarity estimation between text chunks.
// ============================================================

// --- FNV-1a 32-bit hash ---
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

// --- Constants ---
const DEFAULT_NUM_HASHES = 128;
const SHINGLE_K = 5;
const MIN_TEXT_LENGTH = 50;
const MERSENNE_PRIME = 0x7FFFFFFF; // 2^31 - 1

// --- Deterministic hash family generation (seeded LCG) ---
// LCG: next = (a * prev + c) mod 2^32
const LCG_A = 1664525;
const LCG_C = 1013904223;

/**
 * Generate deterministic (a, b) coefficient pairs for MinHash functions.
 * Uses a seeded LCG — NOT Math.random() — so signatures are comparable
 * across runs and across machines.
 *
 * @param {number} numHashes — number of hash functions to generate
 * @param {number} seed — fixed seed (default 42)
 * @returns {Array<{a: number, b: number}>} — coefficient pairs
 */
export function hashFamily(numHashes = DEFAULT_NUM_HASHES, seed = 42) {
  const coeffs = [];
  let state = seed >>> 0;
  for (let i = 0; i < numHashes; i++) {
    state = (Math.imul(LCG_A, state) + LCG_C) >>> 0;
    const a = state | 1; // ensure odd (coprime to MERSENNE_PRIME)
    state = (Math.imul(LCG_A, state) + LCG_C) >>> 0;
    const b = state;
    coeffs.push({ a, b });
  }
  return coeffs;
}

// Pre-compute coefficients at module level (deterministic, stable)
const COEFFICIENTS = hashFamily(DEFAULT_NUM_HASHES);

/**
 * Normalize text: lowercase, strip punctuation, collapse whitespace.
 *
 * @param {string} text — raw text
 * @returns {string} — normalized text
 */
export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // strip punctuation
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim();
}

/**
 * Generate k-word shingles (sliding window) from text.
 *
 * @param {string} text — raw text (will be normalized internally)
 * @param {number} k — window size in words (default 5)
 * @returns {Set<string>} — set of shingle strings
 */
export function shingle(text, k = SHINGLE_K) {
  const words = normalize(text).split(' ').filter(w => w.length > 0);
  const shingles = new Set();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Compute a MinHash signature for the given text.
 *
 * @param {string} text — raw text content
 * @param {number} numHashes — number of hash functions (default 128)
 * @returns {{ signature: Uint32Array, shingleCount: number } | null}
 *   null if text is too short (< 50 chars) or produces no shingles
 */
export function computeMinHash(text, numHashes = DEFAULT_NUM_HASHES) {
  if (!text || text.length < MIN_TEXT_LENGTH) return null;

  const shingles = shingle(text);
  if (shingles.size === 0) return null;

  // Hash each shingle with FNV-1a once
  const shingleHashes = [];
  for (const s of shingles) {
    shingleHashes.push(fnv1a32(s));
  }

  // Use pre-computed coefficients when using default size, otherwise generate
  const coeffs = numHashes === DEFAULT_NUM_HASHES ? COEFFICIENTS : hashFamily(numHashes);

  const signature = new Uint32Array(numHashes);
  signature.fill(0xFFFFFFFF); // Initialize to max

  for (const h of shingleHashes) {
    for (let i = 0; i < numHashes; i++) {
      const { a, b } = coeffs[i];
      // h_i(x) = (a_i * x + b_i) mod p
      const hashed = ((Math.imul(a, h) >>> 0) + b) % MERSENNE_PRIME;
      if (hashed < signature[i]) {
        signature[i] = hashed;
      }
    }
  }

  return { signature, shingleCount: shingles.size };
}

/**
 * Estimate Jaccard similarity between two MinHash signatures.
 *
 * @param {Uint32Array} sigA — signature array
 * @param {Uint32Array} sigB — signature array
 * @returns {number} — estimated Jaccard index [0.0, 1.0]
 */
export function estimateJaccard(sigA, sigB) {
  if (!sigA || !sigB) return 0;
  const len = Math.min(sigA.length, sigB.length);
  if (len === 0) return 0;
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (sigA[i] === sigB[i]) matches++;
  }
  return matches / len;
}

/**
 * Find near-duplicates by comparing each new fingerprint against all existing ones.
 *
 * @param {Array<{chunk_id: string, minhash_sig: Uint32Array}>} newFingerprints
 * @param {Array<{chunk_id: string, minhash_sig: Uint32Array}>} existingFingerprints
 * @param {number} threshold — minimum Jaccard similarity (default 0.7)
 * @returns {Array<{newChunkId: string, existingChunkId: string, similarity: number}>}
 *   All (new, existing) pairs above threshold
 */
export function findNearDuplicates(newFingerprints, existingFingerprints, threshold = 0.7) {
  if (!newFingerprints?.length || !existingFingerprints?.length) return [];
  const matches = [];
  for (const nf of newFingerprints) {
    for (const ef of existingFingerprints) {
      const sim = estimateJaccard(nf.minhash_sig, ef.minhash_sig);
      if (sim >= threshold) {
        matches.push({ newChunkId: nf.chunk_id, existingChunkId: ef.chunk_id, similarity: sim });
      }
    }
  }
  return matches;
}

/** Number of hash functions used in default signatures. */
export const SIGNATURE_SIZE = DEFAULT_NUM_HASHES;
