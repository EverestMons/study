// ============================================================
// unification.js — Cross-Course Skill Merge Engine
//
// Detects and merges equivalent sub_skills across courses.
// Uses concept_links (same_concept at ≥0.9 confidence) to find
// cross-course pairs, then merges them into a single skill with
// shared FSRS scheduling, unified chunk bindings, and multi-course
// attribution via the skill_courses junction table.
// ============================================================

import { getDb, withTransaction, SkillCourses } from './db.js';

const now = () => Math.floor(Date.now() / 1000);

/**
 * Unify two skills: absorb `absorbedId` into `survivorId`.
 *
 * Re-points chunk bindings, merges facets (optimistic FSRS merge for
 * matched concept_keys, transfers unique facets), re-points assignment
 * question mappings, inherits concept links, creates skill_courses
 * entries, and sets unified_into on the absorbed skill.
 *
 * All operations are idempotent. Uses withTransaction for serialization.
 *
 * @param {number} survivorId - The skill that survives the merge
 * @param {number} absorbedId - The skill that gets absorbed
 * @returns {Promise<object>} Merge result stats
 */
export async function unifySkills(survivorId, absorbedId) {
  const stats = { merged: false, facetsMerged: 0, facetsTransferred: 0, bindingsRepointed: 0 };

  return withTransaction(async (db) => {
    const ts = now();

    // --- Step 1: Validate ---
    const survivor = (await db.select('SELECT * FROM sub_skills WHERE id = ?', [survivorId]))[0];
    const absorbed = (await db.select('SELECT * FROM sub_skills WHERE id = ?', [absorbedId]))[0];
    if (!survivor || !absorbed) return stats;
    if (absorbed.unified_into != null) return stats; // already absorbed
    if (survivor.unified_into != null) return stats; // survivor was itself absorbed

    // --- Step 2: Re-point chunk_skill_bindings ---
    const bindResult = await db.execute(
      'UPDATE OR IGNORE chunk_skill_bindings SET sub_skill_id = ?, updated_at = ? WHERE sub_skill_id = ?',
      [survivorId, ts, absorbedId]
    );
    stats.bindingsRepointed = bindResult.rowsAffected || 0;
    // Delete remaining (duplicates that couldn't be updated)
    await db.execute('DELETE FROM chunk_skill_bindings WHERE sub_skill_id = ?', [absorbedId]);

    // --- Step 3: Merge facets ---
    const survivorFacets = await db.select(
      'SELECT * FROM facets WHERE skill_id = ? AND is_archived = 0', [survivorId]
    );
    const absorbedFacets = await db.select(
      'SELECT * FROM facets WHERE skill_id = ? AND is_archived = 0', [absorbedId]
    );

    // Build concept_key map for survivor facets
    const survivorByKey = new Map();
    for (const f of survivorFacets) {
      if (f.concept_key) survivorByKey.set(f.concept_key, f);
    }

    for (const af of absorbedFacets) {
      const matchedSurvivor = af.concept_key ? survivorByKey.get(af.concept_key) : null;

      if (matchedSurvivor) {
        // --- Matched facet: optimistic FSRS merge ---
        await mergeFacetMastery(db, matchedSurvivor.id, af.id, ts);
        await repointFacetBindings(db, matchedSurvivor.id, af.id);
        await repointFacetConceptLinks(db, matchedSurvivor.id, af.id);

        // Archive absorbed facet and delete its mastery
        await db.execute('DELETE FROM facet_mastery WHERE facet_id = ?', [af.id]);
        await db.execute('UPDATE facets SET is_archived = 1, updated_at = ? WHERE id = ?', [ts, af.id]);
        stats.facetsMerged++;
      } else {
        // --- Unique facet: transfer to survivor skill ---
        await db.execute('UPDATE facets SET skill_id = ?, updated_at = ? WHERE id = ?',
          [survivorId, ts, af.id]);
        stats.facetsTransferred++;
      }
    }

    // --- Step 4: Re-point assignment_question_skills ---
    await db.execute(
      'UPDATE OR IGNORE assignment_question_skills SET sub_skill_id = ? WHERE sub_skill_id = ?',
      [survivorId, absorbedId]
    );
    await db.execute('DELETE FROM assignment_question_skills WHERE sub_skill_id = ?', [absorbedId]);

    // --- Step 5: Inherit concept links ---
    await inheritConceptLinks(db, survivorId, absorbedId, ts);

    // --- Step 6: Create skill_courses entries ---
    await db.execute(
      `INSERT OR IGNORE INTO skill_courses (skill_id, course_id)
       SELECT ?, source_course_id FROM sub_skills WHERE id = ? AND source_course_id IS NOT NULL`,
      [survivorId, survivorId]
    );
    await db.execute(
      `INSERT OR IGNORE INTO skill_courses (skill_id, course_id)
       SELECT ?, source_course_id FROM sub_skills WHERE id = ? AND source_course_id IS NOT NULL`,
      [survivorId, absorbedId]
    );

    // --- Step 7: Set unified_into (done marker — must be last) ---
    await db.execute('UPDATE sub_skills SET unified_into = ?, updated_at = ? WHERE id = ?',
      [survivorId, ts, absorbedId]);

    stats.merged = true;
    return stats;
  });
}

/**
 * Optimistic FSRS merge for matched facets.
 * Takes higher stability, lower difficulty, better retrievability.
 */
async function mergeFacetMastery(db, survivorFacetId, absorbedFacetId, ts) {
  const sRows = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [survivorFacetId]);
  const aRows = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [absorbedFacetId]);

  const s = sRows[0];
  const a = aRows[0];

  if (!s && !a) return; // neither has mastery — nothing to merge

  if (!s && a) {
    // Only absorbed has mastery — copy to survivor facet
    await db.execute(
      `INSERT INTO facet_mastery (facet_id, difficulty, stability, retrievability, reps, lapses,
         last_review_at, next_review_at, last_rating, total_mastery_points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(facet_id) DO UPDATE SET
         difficulty = excluded.difficulty, stability = excluded.stability,
         retrievability = excluded.retrievability, reps = excluded.reps,
         lapses = excluded.lapses, last_review_at = excluded.last_review_at,
         next_review_at = excluded.next_review_at, last_rating = excluded.last_rating,
         total_mastery_points = excluded.total_mastery_points, updated_at = excluded.updated_at`,
      [survivorFacetId, a.difficulty, a.stability, a.retrievability, a.reps, a.lapses,
       a.last_review_at, a.next_review_at, a.last_rating, a.total_mastery_points, ts]
    );
    return;
  }

  if (s && !a) return; // only survivor has mastery — keep as-is

  // Both have mastery — optimistic merge
  const merged = {
    stability:          Math.max(s.stability, a.stability),
    difficulty:         Math.min(s.difficulty, a.difficulty),
    retrievability:     Math.max(s.retrievability, a.retrievability),
    reps:               Math.max(s.reps, a.reps),
    lapses:             Math.min(s.lapses, a.lapses),
    lastReviewAt:       Math.max(s.last_review_at || 0, a.last_review_at || 0) || null,
    nextReviewAt:       Math.max(s.next_review_at || 0, a.next_review_at || 0) || null,
    totalMasteryPoints: Math.max(s.total_mastery_points, a.total_mastery_points),
    lastRating:         (s.last_review_at || 0) >= (a.last_review_at || 0) ? s.last_rating : a.last_rating,
  };

  await db.execute(
    `UPDATE facet_mastery SET
       stability = ?, difficulty = ?, retrievability = ?, reps = ?, lapses = ?,
       last_review_at = ?, next_review_at = ?, last_rating = ?,
       total_mastery_points = ?, updated_at = ?
     WHERE facet_id = ?`,
    [merged.stability, merged.difficulty, merged.retrievability, merged.reps, merged.lapses,
     merged.lastReviewAt, merged.nextReviewAt, merged.lastRating,
     merged.totalMasteryPoints, ts, survivorFacetId]
  );
}

/**
 * Re-point chunk_facet_bindings and assignment_question_facets
 * from absorbed facet to survivor facet.
 */
async function repointFacetBindings(db, survivorFacetId, absorbedFacetId) {
  // Chunk facet bindings
  await db.execute(
    'UPDATE OR IGNORE chunk_facet_bindings SET facet_id = ? WHERE facet_id = ?',
    [survivorFacetId, absorbedFacetId]
  );
  await db.execute('DELETE FROM chunk_facet_bindings WHERE facet_id = ?', [absorbedFacetId]);

  // Assignment question facets
  await db.execute(
    'UPDATE OR IGNORE assignment_question_facets SET facet_id = ? WHERE facet_id = ?',
    [survivorFacetId, absorbedFacetId]
  );
  await db.execute('DELETE FROM assignment_question_facets WHERE facet_id = ?', [absorbedFacetId]);
}

/**
 * Re-point facet_concept_links from absorbed facet to survivor facet.
 * Maintains CHECK (facet_a_id < facet_b_id) constraint.
 */
async function repointFacetConceptLinks(db, survivorFacetId, absorbedFacetId) {
  // Delete self-referential links (survivor ↔ absorbed)
  const [lo, hi] = survivorFacetId < absorbedFacetId
    ? [survivorFacetId, absorbedFacetId] : [absorbedFacetId, survivorFacetId];
  await db.execute(
    'DELETE FROM facet_concept_links WHERE facet_a_id = ? AND facet_b_id = ?',
    [lo, hi]
  );

  // Transfer remaining absorbed links to survivor
  const links = await db.select(
    'SELECT * FROM facet_concept_links WHERE facet_a_id = ? OR facet_b_id = ?',
    [absorbedFacetId, absorbedFacetId]
  );
  for (const link of links) {
    const otherId = link.facet_a_id === absorbedFacetId ? link.facet_b_id : link.facet_a_id;
    const [newA, newB] = survivorFacetId < otherId
      ? [survivorFacetId, otherId] : [otherId, survivorFacetId];
    await db.execute(
      `INSERT OR IGNORE INTO facet_concept_links
         (facet_a_id, facet_b_id, similarity_score, link_type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newA, newB, link.similarity_score, link.link_type, link.reason, link.created_at]
    );
  }
  // Clean up all old absorbed links
  await db.execute(
    'DELETE FROM facet_concept_links WHERE facet_a_id = ? OR facet_b_id = ?',
    [absorbedFacetId, absorbedFacetId]
  );
}

/**
 * Inherit skill-level concept links from absorbed to survivor.
 * Maintains CHECK (sub_skill_a_id < sub_skill_b_id) constraint.
 */
async function inheritConceptLinks(db, survivorId, absorbedId, ts) {
  // Delete the same_concept link between survivor and absorbed
  const [lo, hi] = survivorId < absorbedId
    ? [survivorId, absorbedId] : [absorbedId, survivorId];
  await db.execute(
    'DELETE FROM concept_links WHERE sub_skill_a_id = ? AND sub_skill_b_id = ?',
    [lo, hi]
  );

  // Transfer remaining absorbed links to survivor
  const links = await db.select(
    'SELECT * FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?',
    [absorbedId, absorbedId]
  );
  for (const link of links) {
    const otherId = link.sub_skill_a_id === absorbedId ? link.sub_skill_b_id : link.sub_skill_a_id;
    if (otherId === survivorId) continue;
    const [newA, newB] = survivorId < otherId ? [survivorId, otherId] : [otherId, survivorId];
    await db.execute(
      `INSERT OR IGNORE INTO concept_links
         (sub_skill_a_id, sub_skill_b_id, similarity_score, link_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [newA, newB, link.similarity_score, link.link_type, link.created_at]
    );
  }
  // Clean up all old absorbed links
  await db.execute(
    'DELETE FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?',
    [absorbedId, absorbedId]
  );
}

/**
 * Scan for cross-course same_concept pairs and unify them.
 *
 * Finds concept_links where:
 * - link_type = 'same_concept' with confidence ≥ 0.9
 * - The two skills belong to different courses
 * - Neither skill has been absorbed (unified_into IS NULL)
 *
 * Determines survivor by facet_mastery review count (more reviews = better calibrated).
 * Ties broken by lower skill ID (stable, deterministic).
 *
 * @returns {Promise<object>} { pairsDetected, pairsUnified, errors }
 */
export async function detectAndUnify() {
  const db = await getDb();
  const stats = { pairsDetected: 0, pairsUnified: 0, errors: [] };

  // Find cross-course same_concept pairs
  const pairs = await db.select(
    `SELECT cl.sub_skill_a_id, cl.sub_skill_b_id, cl.similarity_score,
            sa.source_course_id AS course_a, sb.source_course_id AS course_b
     FROM concept_links cl
     JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
     JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
     WHERE cl.link_type = 'same_concept'
       AND cl.similarity_score >= 0.9
       AND sa.source_course_id IS NOT NULL
       AND sb.source_course_id IS NOT NULL
       AND sa.source_course_id != sb.source_course_id
       AND sa.unified_into IS NULL
       AND sb.unified_into IS NULL
       AND sa.is_archived = 0
       AND sb.is_archived = 0`
  );

  stats.pairsDetected = pairs.length;

  for (const pair of pairs) {
    try {
      // Re-check unified_into (may have changed from a prior iteration)
      const checkA = (await db.select(
        'SELECT unified_into FROM sub_skills WHERE id = ?', [pair.sub_skill_a_id]
      ))[0];
      const checkB = (await db.select(
        'SELECT unified_into FROM sub_skills WHERE id = ?', [pair.sub_skill_b_id]
      ))[0];
      if (!checkA || !checkB) continue;
      if (checkA.unified_into != null || checkB.unified_into != null) continue;

      // Determine survivor: more facet_mastery reviews wins
      const reviewsA = (await db.select(
        `SELECT COUNT(*) as cnt FROM facets f
         JOIN facet_mastery fm ON f.id = fm.facet_id
         WHERE f.skill_id = ? AND f.is_archived = 0 AND fm.reps > 0`,
        [pair.sub_skill_a_id]
      ))[0].cnt;

      const reviewsB = (await db.select(
        `SELECT COUNT(*) as cnt FROM facets f
         JOIN facet_mastery fm ON f.id = fm.facet_id
         WHERE f.skill_id = ? AND f.is_archived = 0 AND fm.reps > 0`,
        [pair.sub_skill_b_id]
      ))[0].cnt;

      let survivorId, absorbedId;
      if (reviewsA > reviewsB) {
        survivorId = pair.sub_skill_a_id;
        absorbedId = pair.sub_skill_b_id;
      } else if (reviewsB > reviewsA) {
        survivorId = pair.sub_skill_b_id;
        absorbedId = pair.sub_skill_a_id;
      } else {
        // Tie: lower ID wins (stable, deterministic)
        survivorId = Math.min(pair.sub_skill_a_id, pair.sub_skill_b_id);
        absorbedId = Math.max(pair.sub_skill_a_id, pair.sub_skill_b_id);
      }

      const result = await unifySkills(survivorId, absorbedId);
      if (result.merged) stats.pairsUnified++;
    } catch (e) {
      stats.errors.push({
        skillA: pair.sub_skill_a_id,
        skillB: pair.sub_skill_b_id,
        error: e.message,
      });
    }
  }

  return stats;
}
