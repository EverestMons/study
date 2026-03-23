# Chunk Relationships — Blueprint
**Date:** 2026-03-22 | **Agent:** Study Systems Analyst | **Step:** 1

---

## 1. Migration 009 — `chunk_similarities` + `chunk_prerequisites`

### File: `src-tauri/migrations/009_chunk_relationships.sql`

```sql
-- Persistent MinHash similarity pairs (above 0.5 threshold)
CREATE TABLE IF NOT EXISTS chunk_similarities (
    chunk_a_id TEXT NOT NULL,
    chunk_b_id TEXT NOT NULL,
    similarity REAL NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(chunk_a_id, chunk_b_id),
    FOREIGN KEY (chunk_a_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (chunk_b_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunk_sim_a ON chunk_similarities(chunk_a_id);
CREATE INDEX IF NOT EXISTS idx_chunk_sim_b ON chunk_similarities(chunk_b_id);

-- Chunk-level prerequisite ordering
CREATE TABLE IF NOT EXISTS chunk_prerequisites (
    chunk_id TEXT NOT NULL,
    prerequisite_chunk_id TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(chunk_id, prerequisite_chunk_id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunk_prereq_chunk ON chunk_prerequisites(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_prereq_prereq ON chunk_prerequisites(prerequisite_chunk_id);
```

**Canonical ordering for similarities:** `chunk_a_id < chunk_b_id` (alphabetically). The `createBatch` method enforces this before insert.

**Source values for prerequisites:** `"document_order"` or `"skill_link"`.

---

## 2. DB Methods

### `ChunkSimilarities` (in db.js)

```javascript
const ChunkSimilarities = {
  async createBatch(pairs) {
    // pairs: [{ chunkAId, chunkBId, similarity }]
    // Enforce canonical ordering: a < b
    const db = await getDb();
    await db.execute('BEGIN TRANSACTION');
    try {
      for (const p of pairs) {
        const [a, b] = p.chunkAId < p.chunkBId ? [p.chunkAId, p.chunkBId] : [p.chunkBId, p.chunkAId];
        await db.execute(
          'INSERT OR IGNORE INTO chunk_similarities (chunk_a_id, chunk_b_id, similarity, created_at) VALUES (?, ?, ?, ?)',
          [a, b, p.similarity, Math.floor(Date.now() / 1000)]
        );
      }
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  },

  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM chunk_similarities WHERE chunk_a_id = ? OR chunk_b_id = ? ORDER BY similarity DESC',
      [chunkId, chunkId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      `SELECT cs.* FROM chunk_similarities cs
       JOIN chunks ca ON cs.chunk_a_id = ca.id
       WHERE ca.course_id = ?
       ORDER BY cs.similarity DESC`,
      [courseId]
    );
  },
};
```

### `ChunkPrerequisites` (in db.js)

```javascript
const ChunkPrerequisites = {
  async create(chunkId, prereqChunkId, source) {
    const db = await getDb();
    await db.execute(
      'INSERT OR IGNORE INTO chunk_prerequisites (chunk_id, prerequisite_chunk_id, source, created_at) VALUES (?, ?, ?, ?)',
      [chunkId, prereqChunkId, source, Math.floor(Date.now() / 1000)]
    );
  },

  async createBatch(records) {
    // records: [{ chunkId, prereqChunkId, source }]
    const db = await getDb();
    await db.execute('BEGIN TRANSACTION');
    try {
      for (const r of records) {
        await db.execute(
          'INSERT OR IGNORE INTO chunk_prerequisites (chunk_id, prerequisite_chunk_id, source, created_at) VALUES (?, ?, ?, ?)',
          [r.chunkId, r.prereqChunkId, r.source, Math.floor(Date.now() / 1000)]
        );
      }
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  },

  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select(
      `SELECT cp.*, c.label AS prereq_label, c.section_path AS prereq_section_path
       FROM chunk_prerequisites cp
       JOIN chunks c ON cp.prerequisite_chunk_id = c.id
       WHERE cp.chunk_id = ?`,
      [chunkId]
    );
  },

  async getByMaterial(materialId) {
    const db = await getDb();
    return db.select(
      `SELECT cp.* FROM chunk_prerequisites cp
       JOIN chunks c ON cp.chunk_id = c.id
       WHERE c.material_id = ?`,
      [materialId]
    );
  },
};
```

---

## 3. MinHash Similarity Persistence

### Insertion point

In `src/lib/skills.js`, the `findNearDuplicates()` call is at line ~540 inside the extraction pipeline. Currently the results are used only for the dedup decision. The persistence step should be added **immediately after** `findNearDuplicates()` returns, before the dedup decision logic.

### Modified flow (skills.js, ~line 540)

```javascript
const dupMatches = findNearDuplicates(newFingerprints, existingFps, 0.7);

// NEW: Persist all similarity pairs >= 0.5 (broader than dedup threshold)
try {
  // Re-run comparison at lower threshold for persistence
  const allSimilarities = findNearDuplicates(newFingerprints, existingFps, 0.5);
  if (allSimilarities.length > 0) {
    await ChunkSimilarities.createBatch(
      allSimilarities.map(m => ({ chunkAId: m.newChunkId, chunkBId: m.existingChunkId, similarity: m.similarity }))
    );
  }
} catch (e) {
  console.warn('[MinHash] Similarity persistence failed:', e);
}

// Existing dedup logic continues unchanged...
const dupChunkIds = new Set(dupMatches.map(m => m.newChunkId));
```

**Why a second `findNearDuplicates` call?** The existing call uses threshold 0.7 (dedup). We want to persist pairs >= 0.5 (broader — captures "related but not duplicate"). The second call with lower threshold captures these additional pairs. The cost is negligible — it's pure in-memory comparison, no API calls.

**Alternative (single call):** Modify `findNearDuplicates` to accept a lower threshold and filter client-side. But this changes the existing interface. The second-call approach is safer for a first implementation.

---

## 4. Section Path Parser

### Function: `parseSectionPath(path)`

Location: `src/lib/study.js` (utility section, near other chunk helpers)

```javascript
function parseSectionPath(path) {
  if (!path || typeof path !== 'string' || !path.trim()) {
    return { parts: [], depth: 0, parent: null, isRoot: true };
  }
  const parts = path.split(' > ').map(p => p.trim()).filter(Boolean);
  return {
    parts,
    depth: parts.length,
    parent: parts.length > 1 ? parts.slice(0, -1).join(' > ') : null,
    isRoot: parts.length <= 1,
  };
}
```

**Edge cases:**
- `null` / `""` → `{ parts: [], depth: 0, parent: null, isRoot: true }`
- `"Chapter 5"` → `{ parts: ["Chapter 5"], depth: 1, parent: null, isRoot: true }`
- `"Chapter 5 > Section 5.1"` → `{ parts: ["Chapter 5", "Section 5.1"], depth: 2, parent: "Chapter 5", isRoot: false }`
- `"Chapter 5 > Section 5.1 > Subsection 5.1.1"` → `{ parts: ["Chapter 5", "Section 5.1", "Subsection 5.1.1"], depth: 3, parent: "Chapter 5 > Section 5.1", isRoot: false }`

### Function: `getChunkTree(materialId)`

Location: `src/lib/study.js`

```javascript
async function getChunkTree(materialId) {
  const chunks = await Chunks.getMetadataByMaterial(materialId);
  const root = { label: null, chunkId: null, children: [] };

  for (const ch of chunks) {
    const parsed = parseSectionPath(ch.section_path);
    let node = root;
    for (let i = 0; i < parsed.parts.length; i++) {
      const part = parsed.parts[i];
      let child = node.children.find(c => c.label === part);
      if (!child) {
        child = { label: part, chunkId: null, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    // Leaf node gets the chunk ID
    node.chunkId = ch.id;
  }

  return root;
}
```

**Algorithm:** For each chunk, split its `section_path` into parts. Walk the tree from root, creating nodes as needed. The final node gets the chunk's ID. This produces a tree where:
- `root.children` = top-level sections (e.g., chapters)
- Each chapter node's `children` = its sections
- Each section node's `children` = its subsections
- Nodes without chunks (pure structural parents) have `chunkId: null`

### Function: `buildOutline(tree, maxTokens = 200)`

Renders the tree as a compact indented outline for the tutor context.

```javascript
function buildOutline(tree, maxTokens) {
  const lines = [];
  function walk(node, depth) {
    if (node.label) {
      lines.push('  '.repeat(depth) + node.label);
    }
    for (const child of node.children) {
      walk(child, node.label ? depth + 1 : depth);
    }
  }
  walk(tree, 0);

  // Estimate tokens (~1.3 tokens per word, ~4 words per line)
  let result = '';
  let estTokens = 0;
  for (const line of lines) {
    const lineTokens = Math.ceil(line.split(/\s+/).length * 1.3);
    if (estTokens + lineTokens > maxTokens) {
      result += '  ... (' + (lines.length - result.split('\n').length + 1) + ' more sections)\n';
      break;
    }
    result += line + '\n';
    estTokens += lineTokens;
  }
  return result;
}
```

---

## 5. Context Format Changes

### Current format (per chunk)

```
--- Section 5.1: Basic Integration ---
[chunk content]
```

### New format (per chunk)

```
--- Section 5.1: Basic Integration [5/12, Chapter 5 > Section 5.1] ---
[chunk content]
```

Format: `--- [label] [[ordering]/[total], [section_path]] ---`

If chunk has prerequisites (from Step 4):
```
--- Section 5.2: Integration by Parts [6/12, Chapter 5 > Section 5.2 | builds on: Section 5.1: Basic Integration] ---
[chunk content]
```

### DOCUMENT STRUCTURE block

Added at the top of the SOURCE MATERIAL section, before chunks:

```
DOCUMENT STRUCTURE (Calculus Textbook):
  Chapter 1: Limits
    Section 1.1: Introduction to Limits
    Section 1.2: One-Sided Limits
  Chapter 2: Derivatives
    Section 2.1: Definition of Derivative
    ... (8 more sections)
```

This gives the tutor a table-of-contents view, enabling references like "as covered in Section 1.2" or "this leads into Section 2.1".

### Implementation location

In `loadFacetBasedContent()` (study.js:983-986), change the chunk formatting loop:

```javascript
// Before:
ctx += '\n--- ' + ch.label + ' ---\n' + ch.content + '\n';

// After (with metadata):
var posInfo = ch.ordering != null ? (ch.ordering + 1) + '/' + totalChunks : '';
var secInfo = ch.section_path || '';
var meta = [posInfo, secInfo].filter(Boolean).join(', ');
var prereqInfo = ch._prereqLabel ? ' | builds on: ' + ch._prereqLabel : '';
ctx += '\n--- ' + ch.label + (meta || prereqInfo ? ' [' + meta + prereqInfo + ']' : '') + ' ---\n' + ch.content + '\n';
```

The `totalChunks` count and `_prereqLabel` need to be attached to chunks during loading.

---

## 6. Prerequisite Inference Algorithm

### Function: `inferChunkPrerequisites(materialId, courseId)`

Location: `src/lib/skills.js` (after `wireCrossChapterPrereqs`)

```javascript
async function inferChunkPrerequisites(materialId, courseId) {
  const chunks = await Chunks.getByMaterial(materialId);
  if (chunks.length < 2) return;

  const records = [];

  // --- Method A: Document order heuristic ---
  // For each chunk, get its facets. Group facets by parent skill.
  // If two chunks share facets under the same parent skill and
  // chunk A has lower ordering, then A is prerequisite to B.

  const chunkFacets = {};  // chunkId → [{ facetId, skillId }]
  for (const ch of chunks) {
    const bindings = await ChunkFacetBindings.getByChunk(ch.id);
    chunkFacets[ch.id] = bindings.map(b => ({ facetId: b.facet_id || b.id, skillId: b.skill_id }));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chA = chunks[i];
    const facetsA = chunkFacets[chA.id] || [];
    const skillsA = new Set(facetsA.map(f => f.skillId).filter(Boolean));

    for (let j = i + 1; j < chunks.length; j++) {
      const chB = chunks[j];
      const facetsB = chunkFacets[chB.id] || [];
      const skillsB = new Set(facetsB.map(f => f.skillId).filter(Boolean));

      // Check if they share at least one parent skill
      let shared = false;
      for (const sk of skillsA) { if (skillsB.has(sk)) { shared = true; break; } }

      if (shared) {
        records.push({ chunkId: chB.id, prereqChunkId: chA.id, source: 'document_order' });
      }
    }
  }

  // --- Method B: Skill prerequisite transitivity ---
  // If facet P (on chunk A) has a prerequisite link to facet Q (on chunk B),
  // then chunk A (with the prerequisite facet) is prerequisite to chunk B.

  const allFacetIds = new Set();
  for (const ch of chunks) {
    for (const f of (chunkFacets[ch.id] || [])) allFacetIds.add(f.facetId);
  }

  if (allFacetIds.size > 0) {
    const links = await FacetConceptLinks.getByFacetBatch([...allFacetIds]);
    const prereqLinks = links.filter(l => l.link_type === 'prerequisite');

    // Build facet → chunk map
    const facetToChunks = {};
    for (const ch of chunks) {
      for (const f of (chunkFacets[ch.id] || [])) {
        if (!facetToChunks[f.facetId]) facetToChunks[f.facetId] = [];
        facetToChunks[f.facetId].push(ch.id);
      }
    }

    for (const link of prereqLinks) {
      // In a prerequisite link, facet_a is prerequisite to facet_b (or vice versa)
      // The chunk with the prerequisite facet comes first
      const chunksA = facetToChunks[link.facet_a_id] || [];
      const chunksB = facetToChunks[link.facet_b_id] || [];
      for (const ca of chunksA) {
        for (const cb of chunksB) {
          if (ca !== cb) {
            records.push({ chunkId: cb, prereqChunkId: ca, source: 'skill_link' });
          }
        }
      }
    }
  }

  // Store (INSERT OR IGNORE for idempotency)
  if (records.length > 0) {
    await ChunkPrerequisites.createBatch(records);
  }
}
```

### Hook point

In `skills.js`, after `wireCrossChapterPrereqs` (the last extraction step), add:

```javascript
try {
  await inferChunkPrerequisites(materialId, courseId);
} catch (e) {
  console.warn('[ChunkPrereqs] Prerequisite inference failed:', e);
}
```

This is wrapped in try/catch so failure never blocks extraction.

---

## 7. How to Verify

### Schema
- `PRAGMA table_info(chunk_similarities)` — should show chunk_a_id, chunk_b_id, similarity, created_at
- `PRAGMA table_info(chunk_prerequisites)` — should show chunk_id, prerequisite_chunk_id, source, created_at

### MinHash persistence
- After extracting any material: `SELECT COUNT(*) FROM chunk_similarities` should be > 0 (if there are existing chunks to compare against)
- `SELECT * FROM chunk_similarities WHERE similarity < 0.5` should return 0 rows

### Section path parser
- `parseSectionPath(null)` → `{ parts: [], depth: 0, parent: null, isRoot: true }`
- `parseSectionPath("Chapter 5 > Section 5.1")` → `{ parts: ["Chapter 5", "Section 5.1"], depth: 2, parent: "Chapter 5", isRoot: false }`

### Chunk tree
- `getChunkTree(materialId)` for multi-chunk material → tree with correct hierarchy

### Context format
- Read study.js context building — chunk headers should include `[ordering/total, section_path]`
- DOCUMENT STRUCTURE outline present, under 200 tokens

### Prerequisite inference
- `SELECT COUNT(*) FROM chunk_prerequisites` > 0 after extraction
- For "document_order" records, both chunks share a parent skill

### Context annotation
- Chunks with prerequisites show `builds on: [label]` in header

---

## Output Receipt

**Agent:** Study Systems Analyst
**Step:** 1
**Status:** Complete

### What Was Done
Designed 4 chunk relationship improvements: MinHash similarity persistence (new table + insertion into extraction pipeline), section path tree parsing (utility + tree builder + outline renderer), context format enhancement (position metadata + document structure outline), and chunk-level prerequisite ordering (document order heuristic + skill link transitivity).

### Files Deposited
- `study/knowledge/architecture/chunk-relationships-blueprint-2026-03-22.md`

### Files Created or Modified (Code)
- None (blueprint only)

### Decisions Made
- MinHash persistence uses a second `findNearDuplicates` call at 0.5 threshold rather than modifying the existing interface
- Section path separator is ` > ` (matching existing data format)
- Context outline capped at 200 tokens with truncation indicator
- Prerequisite inference is conservative — document order heuristic only links chunks sharing parent skills
- Prerequisite inference failure never blocks extraction (try/catch wrapped)
- Canonical ordering for similarities (a < b) enforced in createBatch, not at call site

### Flags for CEO
- None

### Flags for Next Step
- Step 2 (DEV) should implement migration 009, DB methods, and MinHash persistence only
- Step 3 (DEV) handles section tree + context format
- Step 4 (DEV) handles prerequisite ordering
- `getChunkTree` needs `Chunks.getMetadataByMaterial` which already exists in db.js
- The `ChunkFacetBindings.getByChunk` method already returns `skill_id` — verify this at implementation time
