import { SubSkills, ConceptLinks, Facets, FacetConceptLinks } from './db.js';
import { callClaude, extractJSON, isApiError } from './api.js';

// --- Skill-level prompt builder (backward compat) ---

function buildSkillLine(s) {
  const parts = [s.concept_key, `"${s.name}"`];
  if (s.description) parts.push(s.description.slice(0, 120));
  if (s.category) parts.push(s.category);
  if (s.skill_type) parts.push(s.skill_type);
  if (s.mastery_criteria) {
    try {
      const criteria = typeof s.mastery_criteria === 'string' ? JSON.parse(s.mastery_criteria) : s.mastery_criteria;
      if (Array.isArray(criteria)) parts.push(criteria.slice(0, 3).join('; '));
    } catch { /* ignored */ }
  }
  return `  - [${s.id}] ${parts.join(' | ')}`;
}

function buildPrompt(newSkills, existingSkills) {
  const newLines = newSkills.map(buildSkillLine).join('\n');
  const existLines = existingSkills.map(buildSkillLine).join('\n');

  const system = `You are a curriculum analyst identifying relationships between skills in the same academic domain.
Return ONLY valid JSON, no commentary.`;

  const user = `NEW SKILLS (just extracted):
${newLines}

EXISTING SKILLS (previously extracted):
${existLines}

Identify pairs where a NEW skill relates to an EXISTING skill. Classify:
- "same_concept": Same underlying knowledge (confidence >= 0.9)
- "prerequisite": Existing must be learned before new (directional)
- "related": Topically connected, shared vocabulary

Return JSON: { "pairs": [{ "newSkillId": int, "existingSkillId": int, "type": "same_concept"|"prerequisite"|"related", "confidence": 0.0-1.0, "reason": "..." }] }

Rules: use exact integer IDs from above, confidence >= 0.7, max 30 pairs, empty array if no relationships.`;

  return { system, user };
}

// --- Facet-level prompt builder ---

function buildFacetLine(f) {
  const parts = [f.concept_key || '(no key)', `"${f.name}"`];
  if (f.description) parts.push(f.description.slice(0, 120));
  if (f.skill_type) parts.push(f.skill_type);
  if (f.blooms_level) parts.push(`bloom:${f.blooms_level}`);
  if (f.mastery_criteria) {
    try {
      const criteria = typeof f.mastery_criteria === 'string' ? JSON.parse(f.mastery_criteria) : f.mastery_criteria;
      if (Array.isArray(criteria)) {
        const texts = criteria.slice(0, 3).map(c => typeof c === 'string' ? c : c.text || '');
        parts.push(texts.filter(Boolean).join('; '));
      }
    } catch { /* ignored */ }
  }
  return `  - [${f.id}] ${parts.join(' | ')}`;
}

function buildFacetPrompt(newFacets, existingFacets) {
  const newLines = newFacets.map(buildFacetLine).join('\n');
  const existLines = existingFacets.map(buildFacetLine).join('\n');

  const system = `You are a curriculum analyst identifying relationships between learning facets across academic domains.
Facets are atomic learning units — each represents a single testable skill or concept.
Return ONLY valid JSON, no commentary.`;

  const user = `NEW FACETS (just extracted):
${newLines}

EXISTING FACETS (from previous materials):
${existLines}

Identify pairs where a NEW facet relates to an EXISTING facet. Look for cross-domain connections — concepts that appear in different subjects often share deep relationships. Classify:
- "same_concept": Identical underlying knowledge, just different wording or context (confidence >= 0.9)
- "prerequisite": Existing facet must be mastered before new facet (directional)
- "related": Topically connected, shared terminology or overlapping application

Return JSON: { "pairs": [{ "newFacetId": int, "existingFacetId": int, "type": "same_concept"|"prerequisite"|"related", "confidence": 0.0-1.0, "reason": "brief explanation" }] }

Rules: use exact integer IDs from brackets above, confidence >= 0.7, max 40 pairs, empty array if no relationships.`;

  return { system, user };
}

// --- Skill-level entry point (backward compat) ---

export async function generateConceptLinks(courseId, newSkillIds, options = {}) {
  const newIdSet = new Set(newSkillIds);
  const stats = { linksCreated: 0, skipped: 0, issues: [] };

  const allCourseSkills = await SubSkills.getByCourse(courseId);
  const newSkills = allCourseSkills.filter(s => newIdSet.has(s.id));

  if (newSkills.length === 0) {
    stats.skipped++;
    return stats;
  }

  const byParent = new Map();
  for (const s of newSkills) {
    if (!s.parent_skill_id) continue;
    if (!byParent.has(s.parent_skill_id)) byParent.set(s.parent_skill_id, []);
    byParent.get(s.parent_skill_id).push(s);
  }

  for (const [parentId, parentNewSkills] of byParent) {
    try {
      const allParentSkills = await SubSkills.getByParent(parentId);
      const existingSkills = allParentSkills.filter(s => !newIdSet.has(s.id));

      if (existingSkills.length === 0 || (existingSkills.length + parentNewSkills.length) < 2) {
        stats.skipped++;
        continue;
      }

      const { system, user } = buildPrompt(parentNewSkills, existingSkills);
      const response = await callClaude(system, [{ role: 'user', content: user }], 4096, true);

      if (isApiError(response)) {
        stats.issues.push({ parentId, error: response });
        continue;
      }

      const parsed = extractJSON(response);
      if (!parsed || !Array.isArray(parsed.pairs)) {
        stats.issues.push({ parentId, error: 'Failed to parse response' });
        continue;
      }

      const validNewIds = new Set(parentNewSkills.map(s => s.id));
      const validExistIds = new Set(existingSkills.map(s => s.id));
      const validTypes = new Set(['same_concept', 'prerequisite', 'related']);

      const validLinks = [];
      for (const pair of parsed.pairs) {
        if (!validNewIds.has(pair.newSkillId) || !validExistIds.has(pair.existingSkillId)) continue;
        if (!validTypes.has(pair.type)) continue;
        if (typeof pair.confidence !== 'number' || pair.confidence < 0.7) continue;
        if (pair.type === 'same_concept' && pair.confidence < 0.9) continue;

        validLinks.push({
          subSkillAId: pair.newSkillId,
          subSkillBId: pair.existingSkillId,
          similarityScore: pair.confidence,
          linkType: pair.type,
        });
      }

      if (validLinks.length > 0) {
        await ConceptLinks.createBatch(validLinks);
        stats.linksCreated += validLinks.length;
      }
    } catch (e) {
      stats.issues.push({ parentId, error: e.message });
    }
  }

  return stats;
}

// --- Facet-level entry point (cross-domain) ---

const FACET_BATCH_SIZE = 60;

export async function generateFacetConceptLinks(courseId, newFacetIds, options = {}) {
  const newIdSet = new Set(newFacetIds);
  const stats = { linksCreated: 0, skipped: 0, batches: 0, issues: [] };

  if (newFacetIds.length === 0) {
    stats.skipped++;
    return stats;
  }

  // Load all course facets (cross-domain — not limited to a single parent)
  const allCourseFacets = await Facets.getByCourse(courseId);
  const newFacets = allCourseFacets.filter(f => newIdSet.has(f.id));
  const existingFacets = allCourseFacets.filter(f => !newIdSet.has(f.id));

  if (newFacets.length === 0) {
    stats.skipped++;
    return stats;
  }

  if (existingFacets.length === 0) {
    stats.skipped++;
    return stats;
  }

  // Batch both new and existing facets
  const newBatches = [];
  for (let i = 0; i < newFacets.length; i += FACET_BATCH_SIZE) {
    newBatches.push(newFacets.slice(i, i + FACET_BATCH_SIZE));
  }
  const existBatches = [];
  for (let i = 0; i < existingFacets.length; i += FACET_BATCH_SIZE) {
    existBatches.push(existingFacets.slice(i, i + FACET_BATCH_SIZE));
  }

  const validTypes = new Set(['same_concept', 'prerequisite', 'related']);

  for (const newBatch of newBatches) {
  for (const existBatch of existBatches) {
    try {
      const { system, user } = buildFacetPrompt(newBatch, existBatch);
      const response = await callClaude(system, [{ role: 'user', content: user }], 4096, true);
      stats.batches++;

      if (isApiError(response)) {
        stats.issues.push({ batch: stats.batches, error: response });
        continue;
      }

      const parsed = extractJSON(response);
      if (!parsed || !Array.isArray(parsed.pairs)) {
        stats.issues.push({ batch: stats.batches, error: 'Failed to parse response' });
        continue;
      }

      const validNewIds = new Set(newBatch.map(f => f.id));
      const validExistIds = new Set(existBatch.map(f => f.id));

      const validLinks = [];
      for (const pair of parsed.pairs) {
        if (!validNewIds.has(pair.newFacetId) || !validExistIds.has(pair.existingFacetId)) continue;
        if (!validTypes.has(pair.type)) continue;
        if (typeof pair.confidence !== 'number' || pair.confidence < 0.7) continue;
        if (pair.type === 'same_concept' && pair.confidence < 0.9) continue;
        if (pair.newFacetId === pair.existingFacetId) continue;

        validLinks.push({
          facetAId: pair.newFacetId,
          facetBId: pair.existingFacetId,
          similarityScore: pair.confidence,
          linkType: pair.type,
          reason: pair.reason || null,
        });
      }

      if (validLinks.length > 0) {
        await FacetConceptLinks.createBatch(validLinks);
        stats.linksCreated += validLinks.length;
      }
    } catch (e) {
      stats.issues.push({ batch: stats.batches, error: e.message });
    }
  }
  }

  return stats;
}
