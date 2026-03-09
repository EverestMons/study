// CIP Taxonomy Seeder — idempotent, runs at app startup after migrations.
// Seeds parent_skills and parent_skill_aliases from cipData.js.

import { getDb } from './db.js';
import { CIP_TAXONOMY } from './cipData.js';

const uuid = () => crypto.randomUUID();
const now = () => Math.floor(Date.now() / 1000);

export async function seedCipTaxonomy() {
  const db = await getDb();

  // A2 fast-path: if already seeded, skip entirely
  const countRow = (await db.select(
    'SELECT COUNT(*) as n FROM parent_skills WHERE is_custom = 0'
  ))[0];
  if (countRow.n >= 400) {
    return { seeded: 0, skipped: countRow.n, aliases: 0 };
  }

  // Batch-fetch existing CIP codes
  const existingRows = await db.select(
    'SELECT id, cip_code FROM parent_skills WHERE cip_code IS NOT NULL'
  );
  const existingMap = new Map(existingRows.map(r => [r.cip_code, r.id]));

  let seeded = 0;
  let skipped = 0;
  let aliasCount = 0;

  for (const entry of CIP_TAXONOMY) {
    let parentId = existingMap.get(entry.code);

    if (parentId) {
      skipped++;
    } else {
      // Create new parent skill
      parentId = uuid();
      await db.execute(
        `INSERT INTO parent_skills (id, cip_code, name, description, is_custom, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [parentId, entry.code, entry.name, null, now()]
      );
      seeded++;
    }

    // Add aliases (INSERT OR IGNORE handles duplicates)
    for (const alias of entry.aliases) {
      await db.execute(
        'INSERT OR IGNORE INTO parent_skill_aliases (parent_skill_id, alias) VALUES (?, ?)',
        [parentId, alias.toLowerCase()]
      );
      aliasCount++;
    }
  }

  return { seeded, skipped, aliases: aliasCount };
}
