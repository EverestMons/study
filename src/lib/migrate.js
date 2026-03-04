/**
 * V1 → V2 Skill Migration
 * 
 * Converts v1 skill blobs (stored in settings table) to v2 sub_skills rows.
 * Preserves mastery data by mapping v1 profile entries to sub_skill_mastery.
 * Generates conceptKeys from category/name so re-extraction can match later.
 */

import { DB, SubSkills, SkillPrerequisites, ChunkSkillBindings, Chunks, Mastery, ParentSkills } from './db.js';
import { effectiveStrength, DEFAULT_EASE } from './study.js';

// ============================================================
// Helpers
// ============================================================

/** Convert a name to kebab-case for conceptKey generation. */
function kebab(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generate a conceptKey from category + name (matches extraction format). */
function generateConceptKey(category, name) {
  const cat = kebab(category || 'general');
  const n = kebab(name);
  return `${cat}/${n}`;
}

/**
 * Map v1 ease factor (1.3–4.0) to FSRS difficulty (0–1, lower = easier).
 * ease 4.0 → difficulty 0.0 (easiest)
 * ease 1.3 → difficulty 1.0 (hardest)
 */
function easeToDifficulty(ease) {
  const e = Math.max(1.3, Math.min(4.0, ease || DEFAULT_EASE));
  return 1 - (e - 1.3) / (4.0 - 1.3);
}

/**
 * Estimate FSRS stability (days) from v1 strength + lastPracticed.
 * If strength = e^(-t/S), then S = -t / ln(strength).
 * Clamp to reasonable range [0.5, 365].
 */
function estimateStability(strength, lastPracticed) {
  if (!lastPracticed || !strength || strength <= 0 || strength >= 1) return 1.0;
  const daysSince = (Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1.0;
  const logStrength = Math.log(strength);
  if (logStrength >= 0) return 365; // strength >= 1, shouldn't happen
  const stability = -daysSince / logStrength;
  return Math.max(0.5, Math.min(365, stability));
}

/**
 * Estimate next review date from stability.
 * Next review when retrievability drops to 0.7.
 * R = e^(-t/S), so t = -S * ln(0.7)
 */
function estimateNextReview(stability, lastPracticed) {
  if (!lastPracticed) return null;
  const daysUntilReview = stability * -Math.log(0.7); // ~0.357 * S
  const nextDate = new Date(new Date(lastPracticed).getTime() + daysUntilReview * 86400000);
  return nextDate.toISOString();
}

// ============================================================
// Migration
// ============================================================

/**
 * Migrate a single course from v1 to v2 skill format.
 * 
 * @param {string} courseId
 * @param {object} [options]
 * @param {function} [options.onProgress] - Status callback
 * @param {boolean} [options.dryRun] - If true, report what would happen without writing
 * @returns {Promise<{ migrated: number, skipped: number, mastery: number, issues: Array }>}
 */
export async function migrateV1ToV2(courseId, options = {}) {
  const { onProgress, dryRun = false } = options;
  const issues = [];

  // --- Load v1 data ---
  onProgress?.('Loading v1 skills...');
  const v1Skills = await DB.getSkills(courseId);
  if (!Array.isArray(v1Skills) || v1Skills.length === 0) {
    return { migrated: 0, skipped: 0, mastery: 0, issues: [{ type: 'no_v1_skills' }] };
  }

  // Check if v2 skills already exist (avoid double migration)
  const existingV2 = await SubSkills.getByCourse(courseId);
  if (existingV2.length > 0) {
    onProgress?.(`Course already has ${existingV2.length} v2 skills. Skipping migration.`);
    return { migrated: 0, skipped: v1Skills.length, mastery: 0, issues: [{ type: 'already_migrated' }] };
  }

  const v1Profile = await DB.getProfile(courseId) || { skills: {}, sessions: 0 };
  const refTax = await DB.getRefTaxonomy(courseId);

  onProgress?.(`Found ${v1Skills.length} v1 skills, ${Object.keys(v1Profile.skills).length} profile entries.`);

  if (dryRun) {
    return {
      migrated: v1Skills.length,
      skipped: 0,
      mastery: Object.keys(v1Profile.skills).length,
      issues: [{ type: 'dry_run' }],
    };
  }

  // --- Determine parent skill ---
  let parentSkillId = null;
  if (refTax?.subject) {
    // Use ref taxonomy subject as parent skill name
    parentSkillId = await ParentSkills.findOrCreateByCip(
      'migrated-v1',
      refTax.subject + (refTax.level ? ` (${refTax.level})` : '')
    );
  }

  // --- Migrate skills ---
  onProgress?.('Creating v2 sub_skills...');
  const v1IdToV2Id = new Map(); // "skill-chunk-1" → integer ID
  const conceptKeys = new Set();

  for (const s of v1Skills) {
    let conceptKey = generateConceptKey(s.category, s.name);

    // Handle duplicates by appending a suffix
    let baseKey = conceptKey;
    let suffix = 2;
    while (conceptKeys.has(conceptKey)) {
      conceptKey = `${baseKey}-${suffix}`;
      suffix++;
    }
    conceptKeys.add(conceptKey);

    try {
      const newId = await SubSkills.create({
        parentSkillId,
        name: s.name,
        description: s.description || null,
        skillType: 'conceptual', // default — no structural signals in v1
        sourceCourseId: courseId,
        conceptKey,
        category: s.category || 'General',
        bloomsLevel: 'understand', // conservative default
        masteryCriteria: s.description
          ? [{ text: s.description, source: 'v1_migration', addedAt: new Date().toISOString() }]
          : [],
        evidence: {},
        fitness: {},
        extractionModel: 'v1_migration',
        schemaVersion: 1, // marks as migrated, not native v2
      });

      v1IdToV2Id.set(s.id, newId);
    } catch (e) {
      issues.push({ type: 'skill_create_failed', skillId: s.id, error: e.message });
    }
  }

  onProgress?.(`Created ${v1IdToV2Id.size} v2 skills.`);

  // --- Migrate prerequisites ---
  onProgress?.('Migrating prerequisites...');
  let prereqCount = 0;
  for (const s of v1Skills) {
    if (!s.prerequisites?.length) continue;
    const skillId = v1IdToV2Id.get(s.id);
    if (!skillId) continue;

    for (const prereqV1Id of s.prerequisites) {
      const prereqV2Id = v1IdToV2Id.get(prereqV1Id);
      if (prereqV2Id && prereqV2Id !== skillId) {
        try {
          await SkillPrerequisites.create(skillId, prereqV2Id, 'v1_migration');
          prereqCount++;
        } catch {
          // Duplicate or other issue — skip silently
        }
      }
    }
  }
  onProgress?.(`Migrated ${prereqCount} prerequisite links.`);

  // --- Best-effort chunk bindings ---
  onProgress?.('Creating chunk bindings...');
  let bindingCount = 0;
  const allChunks = await Chunks.getByCourse(courseId);
  const chunksByLabel = new Map();
  for (const ch of allChunks) {
    const label = (ch.label || '').toLowerCase();
    if (!chunksByLabel.has(label)) chunksByLabel.set(label, []);
    chunksByLabel.get(label).push(ch);
  }

  for (const s of v1Skills) {
    const v2Id = v1IdToV2Id.get(s.id);
    if (!v2Id || !s.sources?.length) continue;

    for (const src of s.sources) {
      const srcLower = src.toLowerCase();
      // Try exact match first, then partial
      let matchedChunks = chunksByLabel.get(srcLower) || [];
      if (matchedChunks.length === 0) {
        // Partial match: source label contained in chunk label or vice versa
        for (const [label, chunks] of chunksByLabel) {
          if (label.includes(srcLower) || srcLower.includes(label.substring(0, 15))) {
            matchedChunks = chunks;
            break;
          }
        }
      }

      for (const ch of matchedChunks) {
        try {
          await ChunkSkillBindings.create({
            chunkId: ch.id,
            subSkillId: v2Id,
            extractionContext: 'v1_migration',
            confidence: 0.6, // lower confidence for v1 best-effort match
          });
          bindingCount++;
        } catch {
          // Skip duplicates
        }
      }
    }
  }
  onProgress?.(`Created ${bindingCount} chunk bindings.`);

  // --- Migrate mastery data ---
  onProgress?.('Migrating mastery data...');
  let masteryCount = 0;
  for (const [v1Id, profileData] of Object.entries(v1Profile.skills)) {
    const v2Id = v1IdToV2Id.get(v1Id);
    if (!v2Id || !profileData) continue;

    const strength = effectiveStrength(profileData);
    const stability = estimateStability(
      profileData.strength || 0,
      profileData.lastPracticed
    );
    const reps = profileData.entries?.length || 0;
    const lapses = profileData.entries?.filter(
      e => e.rating === 'struggling' || e.rating === 'hard'
    ).length || 0;

    try {
      await Mastery.upsert(v2Id, {
        difficulty: easeToDifficulty(profileData.ease),
        stability,
        retrievability: strength,
        reps,
        lapses,
        lastReviewAt: profileData.lastPracticed || null,
        nextReviewAt: estimateNextReview(stability, profileData.lastPracticed),
        totalMasteryPoints: profileData.points || 0,
      });
      masteryCount++;
    } catch (e) {
      issues.push({ type: 'mastery_upsert_failed', skillId: v1Id, error: e.message });
    }
  }
  onProgress?.(`Migrated ${masteryCount} mastery records.`);

  return {
    migrated: v1IdToV2Id.size,
    skipped: v1Skills.length - v1IdToV2Id.size,
    mastery: masteryCount,
    prereqs: prereqCount,
    bindings: bindingCount,
    issues,
  };
}

/**
 * Check if a course needs v1→v2 migration.
 * Returns true if v1 skills exist and no v2 skills exist.
 */
export async function needsV1Migration(courseId) {
  const v1Skills = await DB.getSkills(courseId);
  if (!Array.isArray(v1Skills) || v1Skills.length === 0) return false;
  const v2Skills = await SubSkills.getByCourse(courseId);
  return v2Skills.length === 0;
}
