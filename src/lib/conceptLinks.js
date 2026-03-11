import { SubSkills, ConceptLinks } from './db.js';
import { callClaude, extractJSON, isApiError } from './api.js';

// --- Prompt builder ---

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

// --- Main entry point ---

export async function generateConceptLinks(courseId, newSkillIds, options = {}) {
  const newIdSet = new Set(newSkillIds);
  const stats = { linksCreated: 0, skipped: 0, issues: [] };

  // 1. Load all new skills by ID
  const allCourseSkills = await SubSkills.getByCourse(courseId);
  const newSkills = allCourseSkills.filter(s => newIdSet.has(s.id));

  if (newSkills.length === 0) {
    stats.skipped++;
    return stats;
  }

  // 2. Group new skills by parent_skill_id
  const byParent = new Map();
  for (const s of newSkills) {
    if (!s.parent_skill_id) continue;
    if (!byParent.has(s.parent_skill_id)) byParent.set(s.parent_skill_id, []);
    byParent.get(s.parent_skill_id).push(s);
  }

  // 3. For each parent group, compare new vs existing
  for (const [parentId, parentNewSkills] of byParent) {
    try {
      // Load ALL sub-skills under this parent (across all courses)
      const allParentSkills = await SubSkills.getByParent(parentId);
      const existingSkills = allParentSkills.filter(s => !newIdSet.has(s.id));

      // Skip if no existing skills to compare against, or too few total
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

      // Validate and filter pairs
      const validNewIds = new Set(parentNewSkills.map(s => s.id));
      const validExistIds = new Set(existingSkills.map(s => s.id));
      const validTypes = new Set(['same_concept', 'prerequisite', 'related']);

      const validLinks = [];
      for (const pair of parsed.pairs) {
        if (!validNewIds.has(pair.newSkillId) || !validExistIds.has(pair.existingSkillId)) continue;
        if (!validTypes.has(pair.type)) continue;
        if (typeof pair.confidence !== 'number' || pair.confidence < 0.7) continue;
        // For same_concept, enforce higher threshold matching prompt guidance
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
