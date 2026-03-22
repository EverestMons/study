// ============================================================
// DB Layer — SQLite via @tauri-apps/plugin-sql
//
// Normalized modules for all schema tables: Courses, Materials,
// Chunks, Sessions, Messages, JournalEntries, Mastery,
// PracticeSets, Assignments, CourseSchedule, etc.
// ============================================================

import Database from '@tauri-apps/plugin-sql';

let sqliteDb = null;

// Mutex to serialize all write batches — prevents "database is locked".
// Note: tauri-plugin-sql uses a connection pool, so manual BEGIN/COMMIT
// runs on different connections and breaks. We serialize instead and
// rely on each statement auto-committing.
let _txQueue = Promise.resolve();
export const withTransaction = (fn) => {
  const run = async () => {
    const db = await getDb();
    return fn(db);
  };
  const p = _txQueue.then(run, run);
  _txQueue = p.catch(() => {});
  return p;
};

const initSqlite = async () => {
  if (sqliteDb) return sqliteDb;
  sqliteDb = await Database.load('sqlite:study.db');
  // Crash safety — writes complete or roll back, no corruption
  await sqliteDb.execute('PRAGMA journal_mode = WAL');
  await sqliteDb.execute('PRAGMA synchronous = NORMAL');
  await sqliteDb.execute('PRAGMA busy_timeout = 5000');
  console.log('[DB] SQLite initialized (WAL mode)');
  return sqliteDb;
};

const dbReady = initSqlite();

export const getDb = async () => {
  await dbReady;
  if (!sqliteDb) throw new Error('SQLite failed to initialize');
  return sqliteDb;
};

// ============================================================
// Helpers
// ============================================================

const now = () => Math.floor(Date.now() / 1000); // Unix epoch seconds

const uuid = () => crypto.randomUUID();

const jsonParse = (str, fallback = null) => {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

/**
 * Normalize a skill name into a stable concept key: "{category}/{kebab-name}"
 * Used for identity matching across re-extractions and enrichments.
 */
export const generateConceptKey = (name, category = null) => {
  const kebab = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // strip punctuation
    .trim()
    .replace(/\s+/g, '-');          // spaces to hyphens
  if (category) {
    const catKebab = category
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return `${catKebab}/${kebab}`;
  }
  return kebab;
};

/**
 * Normalize an assignment title for placeholder matching.
 * Strips common prefixes (homework/hw/assignment/etc), punctuation,
 * and collapses whitespace. Used for matching uploaded assignments
 * to syllabus placeholders.
 */
export const normalizeAssignmentTitle = (title) => {
  if (!title) return '';
  let t = title.toLowerCase();
  // Strip common prefixes (greedy, order matters — longer first)
  t = t.replace(/^(problem\s*set|homework|assignment|project|quiz|exam|pset|asgn|lab|hw)\s*/i, '');
  // Strip leading punctuation and whitespace
  t = t.replace(/^[\s:.\-–—]+/, '');
  // Strip trailing punctuation and whitespace
  t = t.replace(/[\s:.\-–—]+$/, '');
  // Remove all non-alphanumeric except spaces
  t = t.replace(/[^a-z0-9\s]/g, '');
  // Collapse internal whitespace
  t = t.replace(/\s+/g, ' ');
  return t.trim();
};

// ============================================================
// Settings
// ============================================================

export const getApiKey = async () => {
  const db = await getDb();
  const rows = await db.select("SELECT value FROM settings WHERE key = 'api_key'");
  return rows.length > 0 ? rows[0].value : '';
};

export const setApiKey = async (key) => {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)", [key]
  );
};

export const hasApiKey = async () => !!(await getApiKey());

export const getSetting = async (key) => {
  const db = await getDb();
  const rows = await db.select('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length > 0 ? rows[0].value : null;
};

export const setSetting = async (key, value) => {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]
  );
};

// ============================================================
// Parent Skills
// ============================================================

export const ParentSkills = {
  async getAll() {
    const db = await getDb();
    return db.select('SELECT * FROM parent_skills ORDER BY name');
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM parent_skills WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByName(name) {
    const db = await getDb();
    // Check exact name match first
    let rows = await db.select(
      'SELECT * FROM parent_skills WHERE LOWER(name) = LOWER(?)', [name]
    );
    if (rows.length > 0) return rows[0];
    // Check aliases
    rows = await db.select(
      `SELECT ps.* FROM parent_skills ps
       JOIN parent_skill_aliases psa ON ps.id = psa.parent_skill_id
       WHERE LOWER(psa.alias) = LOWER(?)`, [name]
    );
    return rows[0] || null;
  },

  async create({ name, description = null, cipCode = null, isCustom = false }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO parent_skills (id, cip_code, name, description, is_custom, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, cipCode, name, description, isCustom ? 1 : 0, now()]
    );
    return id;
  },

  async addAlias(parentSkillId, alias) {
    const db = await getDb();
    await db.execute(
      'INSERT OR IGNORE INTO parent_skill_aliases (parent_skill_id, alias) VALUES (?, ?)',
      [parentSkillId, alias.toLowerCase()]
    );
  },

  async getAliases(parentSkillId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT alias FROM parent_skill_aliases WHERE parent_skill_id = ?', [parentSkillId]
    );
    return rows.map(r => r.alias);
  },

  async findByCip(cipCode) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM parent_skills WHERE cip_code = ?', [cipCode]
    );
    return rows[0] || null;
  },

  async findOrCreateByCip(cipCode, displayName) {
    // 1. Exact CIP code match — use it, add display name as alias if different
    let parent = await this.findByCip(cipCode);
    if (parent) {
      if (displayName && displayName.trim().toLowerCase() !== parent.name.toLowerCase()) {
        await this.addAlias(parent.id, displayName.trim());
      }
      return parent.id;
    }
    // 2. Alias/name match on the display name — catches abbreviations
    if (displayName) {
      parent = await this.findByName(displayName.trim());
      if (parent) {
        return parent.id;
      }
    }
    // 3. Create new custom parent skill
    return this.create({ name: displayName || cipCode, cipCode, isCustom: true });
  },
};

// ============================================================
// Courses
// ============================================================

export const Courses = {
  async getAll() {
    const db = await getDb();
    return db.select('SELECT * FROM courses ORDER BY created_at DESC');
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM courses WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ name, courseNumber = null, instructor = null, semester = null, credits = null, description = null }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO courses (id, name, course_number, instructor, semester, credits, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, courseNumber, instructor, semester, credits, description, now()]
    );
    return id;
  },

  async update(id, fields) {
    const db = await getDb();
    const allowed = ['name', 'course_number', 'instructor', 'semester', 'credits', 'description', 'syllabus_parsed'];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(id);
    await db.execute(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async delete(id) {
    const db = await getDb();
    // Clean up v1 compat keys from settings
    await db.execute("DELETE FROM settings WHERE key LIKE ?", [`v1_%:${id}%`]);
    // CASCADE handles children (materials, chunks, sessions, etc.)
    await db.execute('DELETE FROM courses WHERE id = ?', [id]);
  },

  async archive(id) {
    const db = await getDb();
    await db.execute(
      'UPDATE courses SET is_archived = 1, updated_at = ? WHERE id = ?',
      [now(), id]
    );
  },

  async unarchive(id) {
    const db = await getDb();
    await db.execute(
      'UPDATE courses SET is_archived = 0, updated_at = ? WHERE id = ?',
      [now(), id]
    );
  },

  async getAllActive() {
    const db = await getDb();
    return db.select(
      'SELECT * FROM courses WHERE is_archived = 0 ORDER BY created_at DESC'
    );
  },

  async getArchived() {
    const db = await getDb();
    return db.select(
      'SELECT * FROM courses WHERE is_archived = 1 ORDER BY updated_at DESC'
    );
  },
};

// ============================================================
// Course Schedule
// ============================================================

export const CourseSchedule = {
  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM course_schedule WHERE course_id = ? ORDER BY week_number, start_date', [courseId]
    );
  },

  async insert(courseId, entry) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO course_schedule (course_id, week_number, start_date, end_date, topics, readings, assignments_due, exams, parser_confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId, entry.weekNumber || null, entry.startDate || null, entry.endDate || null,
        JSON.stringify(entry.topics), entry.readings ? JSON.stringify(entry.readings) : null,
        entry.assignmentsDue ? JSON.stringify(entry.assignmentsDue) : null,
        entry.exams ? JSON.stringify(entry.exams) : null, entry.parserConfidence || 'medium'
      ]
    );
  },

  async clearForCourse(courseId) {
    const db = await getDb();
    await db.execute('DELETE FROM course_schedule WHERE course_id = ?', [courseId]);
  },
};

// ============================================================
// Course Assessments
// ============================================================

export const CourseAssessments = {
  async getByCourse(courseId) {
    const db = await getDb();
    return db.select('SELECT * FROM course_assessments WHERE course_id = ?', [courseId]);
  },

  async insert(courseId, { category, weight, count = null }) {
    const db = await getDb();
    await db.execute(
      'INSERT INTO course_assessments (course_id, category, weight, count) VALUES (?, ?, ?, ?)',
      [courseId, category, weight, count]
    );
  },

  async clearForCourse(courseId) {
    const db = await getDb();
    await db.execute('DELETE FROM course_assessments WHERE course_id = ?', [courseId]);
  },
};

// ============================================================
// Assignments
// ============================================================

export const Assignments = {
  // --- Core CRUD ---

  async getByCourse(courseId) {
    const db = await getDb();
    const rows = await db.select(
      `SELECT a.*, COUNT(aq.id) AS question_count
       FROM assignments a
       LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
       WHERE a.course_id = ?
       GROUP BY a.id
       ORDER BY CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END, a.due_date ASC, a.created_at ASC`,
      [courseId]
    );
    return rows.map(r => ({
      id: r.id, courseId: r.course_id, materialId: r.material_id,
      title: r.title, titleNormalized: r.title_normalized,
      dueDate: r.due_date, status: r.status, source: r.source,
      createdAt: r.created_at, updatedAt: r.updated_at,
      questionCount: r.question_count, studyActive: r.study_active || 0,
    }));
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM assignments WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const a = rows[0];

    // Load questions
    const qRows = await db.select(
      'SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY ordering, id', [id]
    );

    // Load skill mappings for all questions in one query
    const questions = [];
    if (qRows.length > 0) {
      const qIds = qRows.map(q => q.id);
      const placeholders = qIds.map(() => '?').join(',');
      const skillRows = await db.select(
        `SELECT aqs.question_id, aqs.sub_skill_id, ss.name, ss.concept_key
         FROM assignment_question_skills aqs
         JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
         WHERE aqs.question_id IN (${placeholders})`,
        qIds
      );

      // Group skills by question_id
      const skillsByQ = {};
      for (const sr of skillRows) {
        if (!skillsByQ[sr.question_id]) skillsByQ[sr.question_id] = [];
        skillsByQ[sr.question_id].push({
          subSkillId: sr.sub_skill_id, name: sr.name, conceptKey: sr.concept_key,
        });
      }

      // Load facet mappings (if table exists)
      let facetsByQ = {};
      try {
        const facetRows = await db.select(
          `SELECT aqf.question_id, aqf.facet_id, f.name, f.concept_key, f.skill_id, f.blooms_level
           FROM assignment_question_facets aqf
           JOIN facets f ON aqf.facet_id = f.id
           WHERE aqf.question_id IN (${placeholders}) AND f.is_archived = 0`,
          qIds
        );
        for (const fr of facetRows) {
          if (!facetsByQ[fr.question_id]) facetsByQ[fr.question_id] = [];
          facetsByQ[fr.question_id].push({
            facetId: fr.facet_id, name: fr.name, conceptKey: fr.concept_key,
            skillId: fr.skill_id, bloomsLevel: fr.blooms_level,
          });
        }
      } catch { /* facet table may not exist */ }

      for (const q of qRows) {
        questions.push({
          id: q.id, questionRef: q.question_ref, description: q.description,
          difficulty: q.difficulty, ordering: q.ordering,
          requiredSkills: skillsByQ[q.id] || [],
          requiredFacets: facetsByQ[q.id] || [],
        });
      }
    }

    return {
      id: a.id, courseId: a.course_id, materialId: a.material_id,
      title: a.title, dueDate: a.due_date, status: a.status, source: a.source,
      createdAt: a.created_at, updatedAt: a.updated_at,
      questions,
    };
  },

  async create({ courseId, materialId = null, title, dueDate = null, source = 'decomposition' }) {
    const id = uuid();
    const normalized = normalizeAssignmentTitle(title);
    return withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO assignments (id, course_id, material_id, title, title_normalized, due_date, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [id, courseId, materialId, title, normalized, dueDate, source, now()]
      );
      return id;
    });
  },

  async updateDueDate(id, dueDate) {
    const db = await getDb();
    await db.execute(
      'UPDATE assignments SET due_date = ?, updated_at = ? WHERE id = ?',
      [dueDate, now(), id]
    );
  },

  async updateStatus(id, status) {
    const db = await getDb();
    await db.execute(
      'UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?',
      [status, now(), id]
    );
  },

  async setStudyActive(id, active) {
    const db = await getDb();
    await db.execute(
      'UPDATE assignments SET study_active = ?, updated_at = ? WHERE id = ?',
      [active ? 1 : 0, now(), id]
    );
  },

  async bulkSetStudyActive(ids, active) {
    if (!ids.length) return;
    return withTransaction(async (db) => {
      const ts = now();
      const val = active ? 1 : 0;
      for (const id of ids) {
        await db.execute(
          'UPDATE assignments SET study_active = ?, updated_at = ? WHERE id = ?',
          [val, ts, id]
        );
      }
    });
  },

  async markSubmitted(id) {
    return withTransaction(async (db) => {
      const ts = now();
      await db.execute(
        "UPDATE assignments SET status = 'submitted', study_active = 0, updated_at = ? WHERE id = ?",
        [ts, id]
      );
    });
  },

  // --- Curriculum Queries ---

  async getCurriculum(courseId) {
    const db = await getDb();

    // Step 1: Active assignments
    const assignments = await db.select(
      `SELECT * FROM assignments WHERE course_id = ? AND study_active = 1
       ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC`,
      [courseId]
    );
    if (assignments.length === 0) return [];

    const result = [];
    for (const a of assignments) {
      // Step 2: Questions
      const qRows = await db.select(
        'SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY ordering, id',
        [a.id]
      );

      const enrichedQs = [];
      if (qRows.length > 0) {
        const qIds = qRows.map(q => q.id);
        const ph = qIds.map(() => '?').join(',');

        // Step 3: Skills per question
        const skillRows = await db.select(
          `SELECT aqs.question_id, aqs.sub_skill_id, ss.name, ss.concept_key
           FROM assignment_question_skills aqs
           JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
           WHERE aqs.question_id IN (${ph})`,
          qIds
        );
        const skillsByQ = {};
        const allSkillIds = new Set();
        for (const sr of skillRows) {
          if (!skillsByQ[sr.question_id]) skillsByQ[sr.question_id] = [];
          skillsByQ[sr.question_id].push({
            subSkillId: sr.sub_skill_id, name: sr.name, conceptKey: sr.concept_key,
          });
          allSkillIds.add(sr.sub_skill_id);
        }

        // Step 4: Skill mastery (batched)
        const sIds = [...allSkillIds];
        let masteryMap = {};
        if (sIds.length > 0) {
          const mph = sIds.map(() => '?').join(',');
          const mRows = await db.select(
            `SELECT * FROM sub_skill_mastery WHERE sub_skill_id IN (${mph})`, sIds
          );
          for (const m of mRows) {
            masteryMap[m.sub_skill_id] = {
              stability: m.stability, lastReviewAt: m.last_review_at,
              difficulty: m.difficulty, reps: m.reps, nextReviewAt: m.next_review_at,
            };
          }
        }

        // Step 5: Facets per question (optional)
        let facetsByQ = {};
        let facetMasteryMap = {};
        try {
          const fRows = await db.select(
            `SELECT aqf.question_id, aqf.facet_id, f.name, f.concept_key, f.skill_id, f.blooms_level
             FROM assignment_question_facets aqf
             JOIN facets f ON aqf.facet_id = f.id
             WHERE aqf.question_id IN (${ph}) AND f.is_archived = 0`,
            qIds
          );
          const allFacetIds = new Set();
          for (const fr of fRows) {
            if (!facetsByQ[fr.question_id]) facetsByQ[fr.question_id] = [];
            facetsByQ[fr.question_id].push({
              facetId: fr.facet_id, name: fr.name, conceptKey: fr.concept_key,
              skillId: fr.skill_id, bloomsLevel: fr.blooms_level,
            });
            allFacetIds.add(fr.facet_id);
          }

          // Step 6: Facet mastery (batched)
          const fIds = [...allFacetIds];
          if (fIds.length > 0) {
            const fph = fIds.map(() => '?').join(',');
            const fmRows = await db.select(
              `SELECT * FROM facet_mastery WHERE facet_id IN (${fph})`, fIds
            );
            for (const fm of fmRows) {
              facetMasteryMap[fm.facet_id] = {
                stability: fm.stability, lastReviewAt: fm.last_review_at,
                difficulty: fm.difficulty, reps: fm.reps, nextReviewAt: fm.next_review_at,
              };
            }
          }
        } catch { /* facet tables may not exist */ }

        // Assemble questions
        for (const q of qRows) {
          const qSkills = (skillsByQ[q.id] || []).map(s => ({
            ...s, mastery: masteryMap[s.subSkillId] || null,
          }));
          const qFacets = (facetsByQ[q.id] || []).map(f => ({
            ...f, mastery: facetMasteryMap[f.facetId] || null,
          }));
          enrichedQs.push({
            id: q.id, questionRef: q.question_ref, description: q.description,
            difficulty: q.difficulty, skills: qSkills, facets: qFacets,
          });
        }
      }

      result.push({
        id: a.id, title: a.title, dueDate: a.due_date, status: a.status, source: a.source,
        questions: enrichedQs,
      });
    }
    return result;
  },

  async getChunksForSkill(subSkillId) {
    const db = await getDb();
    // Primary: via facet bindings
    let chunks = [];
    try {
      const facets = await db.select(
        'SELECT id FROM facets WHERE skill_id = ? AND is_archived = 0', [subSkillId]
      );
      if (facets.length > 0) {
        const fIds = facets.map(f => f.id);
        const fph = fIds.map(() => '?').join(',');
        const rows = await db.select(
          `SELECT cfb.chunk_id, cfb.binding_type, cfb.confidence, cfb.quality_rank,
                  c.label AS chunk_label, c.char_count,
                  m.classification AS material_name
           FROM chunk_facet_bindings cfb
           JOIN chunks c ON cfb.chunk_id = c.id
           JOIN materials m ON c.material_id = m.id
           WHERE cfb.facet_id IN (${fph})
           ORDER BY
             CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
             cfb.quality_rank, cfb.confidence DESC`,
          fIds
        );
        // Deduplicate by chunk_id
        const seen = new Set();
        for (const r of rows) {
          if (!seen.has(r.chunk_id)) {
            seen.add(r.chunk_id);
            chunks.push({
              chunkId: r.chunk_id, label: r.chunk_label || 'Chunk',
              materialName: r.material_name || '', bindingType: r.binding_type || 'teaches',
              confidence: r.confidence, qualityRank: r.quality_rank,
            });
          }
        }
      }
    } catch { /* facet tables may not exist */ }

    // Fallback: direct skill bindings
    if (chunks.length === 0) {
      const rows = await db.select(
        `SELECT csb.chunk_id, c.label AS chunk_label
         FROM chunk_skill_bindings csb
         JOIN chunks c ON csb.chunk_id = c.id
         WHERE csb.sub_skill_id = ?`,
        [subSkillId]
      );
      chunks = rows.map(r => ({
        chunkId: r.chunk_id, label: r.chunk_label || 'Chunk ' + r.chunk_id.slice(0, 6),
        materialName: '', bindingType: 'teaches', confidence: null, qualityRank: null,
      }));
    }
    return chunks;
  },

  async getCompletedSkills(courseId) {
    const db = await getDb();
    const rows = await db.select(
      `SELECT DISTINCT ss.id AS sub_skill_id, ss.name, ss.concept_key,
              a.id AS assignment_id, a.title AS assignment_title,
              ssm.stability, ssm.last_review_at, ssm.difficulty, ssm.reps, ssm.next_review_at
       FROM assignments a
       JOIN assignment_questions aq ON aq.assignment_id = a.id
       JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
       JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
       LEFT JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
       WHERE a.course_id = ? AND a.status IN ('submitted', 'graded')
         AND ss.is_archived = 0
       ORDER BY ss.name`,
      [courseId]
    );
    return rows.map(r => ({
      subSkillId: r.sub_skill_id, name: r.name, conceptKey: r.concept_key,
      assignmentId: r.assignment_id, assignmentTitle: r.assignment_title,
      mastery: r.stability ? {
        stability: r.stability, lastReviewAt: r.last_review_at,
        difficulty: r.difficulty, reps: r.reps, nextReviewAt: r.next_review_at,
      } : null,
    }));
  },

  async getReviewDueSkills(courseId) {
    const db = await getDb();
    const rows = await db.select(
      `SELECT DISTINCT ss.id AS sub_skill_id, ss.name, ss.concept_key,
              a.id AS assignment_id, a.title AS assignment_title,
              ssm.next_review_at, ssm.stability, ssm.last_review_at
       FROM assignments a
       JOIN assignment_questions aq ON aq.assignment_id = a.id
       JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
       JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
       JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = ss.id
       WHERE a.course_id = ? AND a.status IN ('submitted', 'graded')
         AND ssm.next_review_at IS NOT NULL AND ssm.next_review_at <= ?
         AND ss.is_archived = 0
       ORDER BY ssm.next_review_at`,
      [courseId, now()]
    );
    return rows.map(r => ({
      subSkillId: r.sub_skill_id, name: r.name, conceptKey: r.concept_key,
      assignmentId: r.assignment_id, assignmentTitle: r.assignment_title,
      nextReviewAt: r.next_review_at, stability: r.stability, lastReviewAt: r.last_review_at,
    }));
  },

  async getCurriculumSummary(courseId) {
    const db = await getDb();

    // Active count
    const activeRows = await db.select(
      'SELECT COUNT(*) AS cnt FROM assignments WHERE course_id = ? AND study_active = 1',
      [courseId]
    );
    const activeCount = activeRows[0]?.cnt || 0;

    // Total distinct skills across active assignments
    let totalSkills = 0;
    let avgMastery = 0;
    if (activeCount > 0) {
      const skillRows = await db.select(
        `SELECT COUNT(DISTINCT aqs.sub_skill_id) AS cnt
         FROM assignments a
         JOIN assignment_questions aq ON aq.assignment_id = a.id
         JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
         WHERE a.course_id = ? AND a.study_active = 1`,
        [courseId]
      );
      totalSkills = skillRows[0]?.cnt || 0;

      // Average mastery of those skills
      const masteryRows = await db.select(
        `SELECT AVG(ssm.stability) AS avg_stab
         FROM sub_skill_mastery ssm
         WHERE ssm.sub_skill_id IN (
           SELECT DISTINCT aqs.sub_skill_id
           FROM assignments a
           JOIN assignment_questions aq ON aq.assignment_id = a.id
           JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
           WHERE a.course_id = ? AND a.study_active = 1
         ) AND ssm.stability > 0`,
        [courseId]
      );
      avgMastery = masteryRows[0]?.avg_stab || 0;
    }

    // Due review count from completed assignments
    const dueRows = await db.select(
      `SELECT COUNT(DISTINCT aqs.sub_skill_id) AS cnt
       FROM assignments a
       JOIN assignment_questions aq ON aq.assignment_id = a.id
       JOIN assignment_question_skills aqs ON aqs.question_id = aq.id
       JOIN sub_skill_mastery ssm ON ssm.sub_skill_id = aqs.sub_skill_id
       WHERE a.course_id = ? AND a.status IN ('submitted', 'graded')
         AND ssm.next_review_at IS NOT NULL AND ssm.next_review_at <= ?`,
      [courseId, now()]
    );
    const dueReviewCount = dueRows[0]?.cnt || 0;

    // Completed assignment count
    const compRows = await db.select(
      "SELECT COUNT(*) AS cnt FROM assignments WHERE course_id = ? AND status IN ('submitted', 'graded')",
      [courseId]
    );
    const completedCount = compRows[0]?.cnt || 0;

    return { activeCount, totalSkills, avgMastery, dueReviewCount, completedCount };
  },

  async linkMaterial(id, materialId) {
    const db = await getDb();
    await db.execute(
      "UPDATE assignments SET material_id = ?, source = 'decomposition', updated_at = ? WHERE id = ?",
      [materialId, now(), id]
    );
  },

  async delete(id) {
    const db = await getDb();
    await db.execute('DELETE FROM assignments WHERE id = ?', [id]);
  },

  // --- Schedule Queries ---

  async getUpcoming(dayRange = 14) {
    const db = await getDb();
    const start = now();
    const end = start + dayRange * 86400;
    const rows = await db.select(
      `SELECT a.*, c.name AS course_name, COUNT(aq.id) AS question_count
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
       WHERE a.due_date BETWEEN ? AND ?
         AND a.status = 'active'
       GROUP BY a.id
       ORDER BY a.due_date ASC`,
      [start, end]
    );
    return rows.map(r => ({
      id: r.id, courseId: r.course_id, materialId: r.material_id,
      title: r.title, dueDate: r.due_date, status: r.status, source: r.source,
      createdAt: r.created_at, updatedAt: r.updated_at,
      courseName: r.course_name, questionCount: r.question_count,
    }));
  },

  async getByDateRange(startEpoch, endEpoch) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM assignments WHERE due_date BETWEEN ? AND ? ORDER BY due_date ASC',
      [startEpoch, endEpoch]
    );
  },

  async getOverdue() {
    const db = await getDb();
    const rows = await db.select(
      `SELECT a.*, c.name AS course_name
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.due_date < ? AND a.status = 'active' AND a.due_date IS NOT NULL
       ORDER BY a.due_date ASC`,
      [now()]
    );
    return rows.map(r => ({
      id: r.id, courseId: r.course_id, materialId: r.material_id,
      title: r.title, dueDate: r.due_date, status: r.status, source: r.source,
      courseName: r.course_name,
    }));
  },

  // --- Questions ---

  async getQuestions(assignmentId) {
    const db = await getDb();
    const qRows = await db.select(
      'SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY ordering, id',
      [assignmentId]
    );
    if (qRows.length === 0) return [];

    const qIds = qRows.map(q => q.id);
    const placeholders = qIds.map(() => '?').join(',');

    // Load skill mappings (backward compat)
    const skillRows = await db.select(
      `SELECT aqs.question_id, aqs.sub_skill_id, ss.name, ss.concept_key
       FROM assignment_question_skills aqs
       JOIN sub_skills ss ON ss.id = aqs.sub_skill_id
       WHERE aqs.question_id IN (${placeholders})`,
      qIds
    );

    const skillsByQ = {};
    for (const sr of skillRows) {
      if (!skillsByQ[sr.question_id]) skillsByQ[sr.question_id] = [];
      skillsByQ[sr.question_id].push({
        subSkillId: sr.sub_skill_id, name: sr.name, conceptKey: sr.concept_key,
      });
    }

    // Load facet mappings (if table exists)
    let facetsByQ = {};
    try {
      const facetRows = await db.select(
        `SELECT aqf.question_id, aqf.facet_id, f.name, f.concept_key, f.skill_id, f.blooms_level
         FROM assignment_question_facets aqf
         JOIN facets f ON aqf.facet_id = f.id
         WHERE aqf.question_id IN (${placeholders}) AND f.is_archived = 0`,
        qIds
      );
      for (const fr of facetRows) {
        if (!facetsByQ[fr.question_id]) facetsByQ[fr.question_id] = [];
        facetsByQ[fr.question_id].push({
          facetId: fr.facet_id, name: fr.name, conceptKey: fr.concept_key,
          skillId: fr.skill_id, bloomsLevel: fr.blooms_level,
        });
      }
    } catch { /* facet table may not exist */ }

    return qRows.map(q => ({
      id: q.id, questionRef: q.question_ref, description: q.description,
      difficulty: q.difficulty, ordering: q.ordering,
      requiredSkills: skillsByQ[q.id] || [],
      requiredFacets: facetsByQ[q.id] || [],
    }));
  },

  async saveQuestions(assignmentId, courseId, questions, { useFacets = false, courseFacets = [] } = {}) {
    return withTransaction(async (db) => {
      // Delete existing questions (CASCADE removes skill mappings and facet mappings)
      await db.execute('DELETE FROM assignment_questions WHERE assignment_id = ?', [assignmentId]);

      if (!Array.isArray(questions) || questions.length === 0) return;

      // Load course skills for ID resolution (always needed for backward compat)
      const courseSkills = await db.select(
        'SELECT id, name, concept_key FROM sub_skills WHERE source_course_id = ? AND is_archived = 0',
        [courseId]
      );

      // Check if facet tables exist (for writing facet mappings)
      let hasFacetTable = false;
      try {
        await db.select('SELECT 1 FROM assignment_question_facets LIMIT 0');
        hasFacetTable = true;
      } catch { /* table doesn't exist */ }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const result = await db.execute(
          `INSERT INTO assignment_questions (assignment_id, question_ref, description, difficulty, ordering)
           VALUES (?, ?, ?, ?, ?)`,
          [assignmentId, q.id || q.questionRef || `q${i + 1}`, q.description || null, q.difficulty || null, i]
        );
        const questionId = result.lastInsertId;

        if (useFacets && q.requiredFacets && hasFacetTable) {
          // Facet-mode: resolve facet references, write to both tables
          const seenSkillIds = new Set();
          for (const facetRef of q.requiredFacets) {
            const resolved = resolveFacetId(courseFacets, facetRef);
            if (resolved) {
              // Write facet mapping
              await db.execute(
                'INSERT INTO assignment_question_facets (question_id, facet_id) VALUES (?, ?)',
                [questionId, resolved.id]
              );
              // Derive and write skill mapping (dedup by skill_id)
              if (!seenSkillIds.has(resolved.skill_id)) {
                seenSkillIds.add(resolved.skill_id);
                await db.execute(
                  'INSERT INTO assignment_question_skills (question_id, sub_skill_id) VALUES (?, ?)',
                  [questionId, resolved.skill_id]
                );
              }
            }
          }
        } else {
          // Skill-mode fallback: resolve skill references directly
          for (const skillRef of (q.requiredSkills || [])) {
            const resolved = resolveSkillId(courseSkills, skillRef);
            if (resolved) {
              await db.execute(
                'INSERT INTO assignment_question_skills (question_id, sub_skill_id) VALUES (?, ?)',
                [questionId, resolved]
              );
            }
          }
        }
      }
    });
  },

  // --- Placeholder Matching ---

  async getPlaceholders(courseId) {
    const db = await getDb();
    const rows = await db.select(
      "SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC",
      [courseId]
    );
    return rows;
  },

  async findPlaceholderMatch(courseId, title) {
    const normalized = normalizeAssignmentTitle(title);
    if (!normalized) return null;

    const placeholders = await this.getPlaceholders(courseId);
    if (placeholders.length === 0) return null;

    // Exact match
    const exact = placeholders.filter(p => p.title_normalized === normalized);
    if (exact.length === 1) return { match: exact[0], confidence: 'high' };
    if (exact.length > 1) return { matches: exact, confidence: 'ambiguous' };

    // Starts-with: upload title starts with placeholder's normalized title
    const startsWith = placeholders.filter(p => p.title_normalized && normalized.startsWith(p.title_normalized));
    if (startsWith.length === 1) return { match: startsWith[0], confidence: 'high' };
    if (startsWith.length > 1) return { matches: startsWith, confidence: 'ambiguous' };

    // Reverse starts-with: placeholder starts with upload's normalized title
    const reverseStarts = placeholders.filter(p => p.title_normalized && p.title_normalized.startsWith(normalized));
    if (reverseStarts.length === 1) return { match: reverseStarts[0], confidence: 'high' };
    if (reverseStarts.length > 1) return { matches: reverseStarts, confidence: 'ambiguous' };

    return null;
  },
};

/**
 * Resolve a skill reference string to a sub_skills.id.
 * Tries: exact id match → concept_key match → case-insensitive name match.
 * Returns the integer ID or null.
 */
function resolveSkillId(courseSkills, ref) {
  if (!ref || !courseSkills.length) return null;
  // Exact id match (v1 compat: skill IDs like "skill-chunk-3")
  const byId = courseSkills.find(s => String(s.id) === String(ref));
  if (byId) return byId.id;
  // Concept key match
  const byKey = courseSkills.find(s => s.concept_key === ref);
  if (byKey) return byKey.id;
  // Case-insensitive name match
  const refLower = ref.toLowerCase();
  const byName = courseSkills.find(s => s.name && s.name.toLowerCase() === refLower);
  if (byName) return byName.id;
  return null;
}

function resolveFacetId(facets, ref) {
  if (!ref || !facets.length) return null;
  // Exact id match
  const byId = facets.find(f => String(f.id) === String(ref));
  if (byId) return byId;
  // Concept key match
  const byKey = facets.find(f => f.concept_key === ref);
  if (byKey) return byKey;
  // Case-insensitive name match
  const refLower = ref.toLowerCase();
  const byName = facets.find(f => f.name && f.name.toLowerCase() === refLower);
  if (byName) return byName;
  return null;
}

// ============================================================
// Materials
// ============================================================

export const Materials = {
  async getByCourse(courseId) {
    const db = await getDb();
    return db.select('SELECT * FROM materials WHERE course_id = ? ORDER BY created_at', [courseId]);
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM materials WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ courseId, label, classification = null, fileType = null, filePath = null, originalFilename = null, parserOutput = null, parserConfidence = null }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO materials (id, course_id, label, classification, file_type, file_path, original_filename, parser_output, parser_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, courseId, label, classification, fileType, filePath, originalFilename,
       parserOutput ? JSON.stringify(parserOutput) : null, parserConfidence, now()]
    );
    return id;
  },

  async update(id, fields) {
    const db = await getDb();
    const allowed = ['label', 'classification', 'file_type', 'file_path', 'original_filename', 'active', 'parser_output', 'parser_confidence'];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(k === 'parser_output' && typeof v === 'object' ? JSON.stringify(v) : v);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(id);
    await db.execute(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async delete(id) {
    const db = await getDb();
    await db.execute('DELETE FROM materials WHERE id = ?', [id]);
  },

  async setActive(id, active) {
    const db = await getDb();
    await db.execute(
      'UPDATE materials SET active = ?, updated_at = ? WHERE id = ?',
      [active ? 1 : 0, now(), id]
    );
  },

  async getActiveByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM materials WHERE course_id = ? AND active = 1 ORDER BY created_at',
      [courseId]
    );
  },

  async findByFilename(courseId, filename) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM materials WHERE course_id = ? AND original_filename = ? ORDER BY created_at DESC LIMIT 1',
      [courseId, filename]
    );
    return rows[0] || null;
  },

  async deduplicateAll() {
    const db = await getDb();
    const dupes = await db.select(`
      SELECT course_id, original_filename, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
      FROM materials
      WHERE original_filename IS NOT NULL
      GROUP BY course_id, original_filename
      HAVING cnt > 1
    `);
    let removed = 0;
    for (const d of dupes) {
      const ids = d.ids.split(',');
      const keep = ids[0];
      const remove = ids.slice(1);
      for (const rid of remove) {
        await db.execute('DELETE FROM chunk_fingerprints WHERE chunk_id IN (SELECT id FROM chunks WHERE material_id = ?)', [rid]);
        await db.execute('DELETE FROM chunks WHERE material_id = ?', [rid]);
        await db.execute('DELETE FROM materials WHERE id = ?', [rid]);
        removed++;
      }
    }
    return { removed };
  },
};

// ============================================================
// Chunks
// ============================================================

export const Chunks = {
  async getByMaterial(materialId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM chunks WHERE material_id = ? ORDER BY ordering', [materialId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM chunks WHERE course_id = ? ORDER BY ordering', [courseId]
    );
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM chunks WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async getContent(id) {
    const db = await getDb();
    const rows = await db.select('SELECT content FROM chunks WHERE id = ?', [id]);
    return rows[0]?.content || null;
  },

  async updateContent(id, content) {
    const db = await getDb();
    const c = typeof content === 'string' ? content : JSON.stringify(content);
    await db.execute('UPDATE chunks SET content = ?, updated_at = ? WHERE id = ?', [c, now(), id]);
  },

  async create({ materialId, courseId, label = null, content, contentHash, charCount = null, sourceFormat = null, headingLevel = null, sectionPath = null, structuralMetadata = null, fidelity = 'full', pageStart = null, pageEnd = null, ordering = 0 }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO chunks (id, material_id, course_id, label, content, content_hash, char_count, source_format, heading_level, section_path, structural_metadata, fidelity, page_start, page_end, ordering, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [
        id, materialId, courseId, label, content, contentHash, charCount || (content ? content.length : 0),
        sourceFormat, headingLevel, sectionPath,
        structuralMetadata ? JSON.stringify(structuralMetadata) : null,
        fidelity, pageStart, pageEnd, ordering, now()
      ]
    );
    return id;
  },

  async createBatch(chunks) {
    return withTransaction(async (db) => {
      const ids = [];
      for (const ch of chunks) {
        const id = uuid();
        await db.execute(
          `INSERT INTO chunks (id, material_id, course_id, label, content, content_hash, char_count, source_format, heading_level, section_path, structural_metadata, fidelity, page_start, page_end, ordering, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
          [
            id, ch.materialId, ch.courseId, ch.label || null, ch.content, ch.contentHash,
            ch.charCount || (ch.content ? ch.content.length : 0), ch.sourceFormat || null,
            ch.headingLevel || null, ch.sectionPath || null,
            ch.structuralMetadata ? JSON.stringify(ch.structuralMetadata) : null,
            ch.fidelity || 'full', ch.pageStart || null, ch.pageEnd || null,
            ch.ordering || 0, now()
          ]
        );
        ids.push(id);
      }
      return ids;
    });
  },

  async updateStatus(id, status, errorInfo = null) {
    const db = await getDb();
    await db.execute(
      `UPDATE chunks SET status = ?, error_info = ?, updated_at = ?,
       fail_count = CASE WHEN ? = 'error' THEN fail_count + 1 ELSE fail_count END
       WHERE id = ?`,
      [status, errorInfo ? JSON.stringify(errorInfo) : null, now(), status, id]
    );
  },

  async updateStatusBatch(ids, status, { externalTransaction = false } = {}) {
    if (ids.length === 0) return;
    const work = async (db) => {
      for (const id of ids) {
        await db.execute(
          `UPDATE chunks SET status = ?, updated_at = ?,
           fail_count = CASE WHEN ? = 'error' THEN fail_count + 1 ELSE fail_count END
           WHERE id = ?`,
          [status, now(), status, id]
        );
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  async markFailed(id, errorInfo = null) {
    const db = await getDb();
    await db.execute(
      `UPDATE chunks SET
        fail_count = fail_count + 1,
        status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END,
        error_info = ?,
        updated_at = ?
      WHERE id = ?`,
      [errorInfo ? JSON.stringify(errorInfo) : null, now(), id]
    );
  },

  async markFailedBatch(ids, errorInfo = null) {
    if (ids.length === 0) return;
    const errorStr = errorInfo ? JSON.stringify(errorInfo) : null;
    await withTransaction(async (db) => {
      for (const id of ids) {
        await db.execute(
          `UPDATE chunks SET
            fail_count = fail_count + 1,
            status = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE 'error' END,
            error_info = ?,
            updated_at = ?
          WHERE id = ?`,
          [errorStr, now(), id]
        );
      }
    });
  },

  async resetForRetry(materialId) {
    const db = await getDb();
    await db.execute(
      `UPDATE chunks SET fail_count = 0, status = 'pending', error_info = NULL, updated_at = ?
       WHERE material_id = ? AND status = 'failed'`,
      [now(), materialId]
    );
  },

  async delete(id) {
    const db = await getDb();
    await db.execute('DELETE FROM chunks WHERE id = ?', [id]);
  },

  async getActiveByCourse(courseId) {
    const db = await getDb();
    return db.select(
      `SELECT c.* FROM chunks c
       JOIN materials m ON c.material_id = m.id
       WHERE c.course_id = ? AND m.active = 1
       ORDER BY c.ordering`,
      [courseId]
    );
  },

  async delete(id) {
    const db = await getDb();
    await db.execute('DELETE FROM chunks WHERE id = ?', [id]);
  },

  async findByHash(contentHash) {
    const db = await getDb();
    return db.select('SELECT * FROM chunks WHERE content_hash = ?', [contentHash]);
  },

  /** Get chunk metadata without content column (lightweight for listings) */
  async getMetadataByMaterial(materialId) {
    const db = await getDb();
    return db.select(
      `SELECT id, material_id, course_id, label, content_hash, char_count,
              source_format, heading_level, section_path, structural_metadata,
              fidelity, page_start, page_end, ordering, status, error_info, fail_count,
              created_at, updated_at
       FROM chunks WHERE material_id = ? ORDER BY ordering`,
      [materialId]
    );
  },

  /** Batch-load content for specific chunk IDs (max 500 per call) */
  async getContentBatch(chunkIds) {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) return [];
    const limited = chunkIds.slice(0, 500);
    const db = await getDb();
    const placeholders = limited.map(() => '?').join(',');
    return db.select(
      `SELECT id, content FROM chunks WHERE id IN (${placeholders})`,
      limited
    );
  },
};

// ============================================================
// Chunk Media
// ============================================================

export const ChunkMedia = {
  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select('SELECT * FROM chunk_media WHERE chunk_id = ?', [chunkId]);
  },

  async create({ chunkId, mediaHash, mediaType, sizeBytes, width = null, height = null, storageType, inlineBlob = null, externalPath = null, caption = null, altText = null, positionContext = null, pageNumber = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO chunk_media (chunk_id, media_hash, media_type, size_bytes, width, height, storage_type, inline_blob, external_path, caption, alt_text, position_context, page_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chunkId, mediaHash, mediaType, sizeBytes, width, height, storageType, inlineBlob, externalPath, caption, altText, positionContext, pageNumber, now()]
    );
  },
};

// ============================================================
// Chunk Fingerprints — MinHash signatures for near-duplicate detection
// ============================================================

/**
 * Convert Uint32Array → plain number array for BLOB storage.
 * Tauri SQL plugin accepts BLOB as Array<number> (byte values).
 */
const sigToBlob = (sig) => Array.from(new Uint8Array(sig.buffer));

/**
 * Convert BLOB (Array<number> from Tauri SQL) → Uint32Array.
 * Uses DataView to avoid alignment issues with Uint32Array on raw buffers.
 */
const blobToSig = (blob) => {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  const result = new Uint32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < result.length; i++) {
    result[i] = view.getUint32(i * 4, true); // little-endian
  }
  return result;
};

export const ChunkFingerprints = {
  async create(chunkId, minhashSig, shingleCount) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO chunk_fingerprints (chunk_id, minhash_sig, shingle_count, created_at) VALUES (?, ?, ?, ?)',
      [chunkId, sigToBlob(minhashSig), shingleCount || 0, now()]
    );
  },

  async createBatch(items) {
    if (!items.length) return;
    return withTransaction(async (db) => {
      for (const { chunkId, minhashSig, shingleCount } of items) {
        await db.execute(
          'INSERT OR REPLACE INTO chunk_fingerprints (chunk_id, minhash_sig, shingle_count, created_at) VALUES (?, ?, ?, ?)',
          [chunkId, sigToBlob(minhashSig), shingleCount || 0, now()]
        );
      }
    });
  },

  async getByCourse(courseId) {
    const db = await getDb();
    const rows = await db.select(
      `SELECT cf.chunk_id, cf.minhash_sig, cf.shingle_count
       FROM chunk_fingerprints cf
       JOIN chunks c ON cf.chunk_id = c.id
       JOIN materials m ON c.material_id = m.id
       WHERE m.course_id = ?`,
      [courseId]
    );
    return rows.map(r => ({
      chunk_id: r.chunk_id,
      minhash_sig: blobToSig(r.minhash_sig),
      shingle_count: r.shingle_count,
    }));
  },

  async getByMaterial(materialId) {
    const db = await getDb();
    const rows = await db.select(
      `SELECT cf.chunk_id, cf.minhash_sig, cf.shingle_count
       FROM chunk_fingerprints cf
       JOIN chunks c ON cf.chunk_id = c.id
       WHERE c.material_id = ?`,
      [materialId]
    );
    return rows.map(r => ({
      chunk_id: r.chunk_id,
      minhash_sig: blobToSig(r.minhash_sig),
      shingle_count: r.shingle_count,
    }));
  },

  async delete(chunkId) {
    const db = await getDb();
    await db.execute('DELETE FROM chunk_fingerprints WHERE chunk_id = ?', [chunkId]);
  },
};

// ============================================================
// Sub-Skills
// ============================================================

export const SubSkills = {
  async getByParent(parentSkillId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM sub_skills WHERE parent_skill_id = ? AND is_archived = 0 AND unified_into IS NULL', [parentSkillId]
    );
  },

  async getAllActive() {
    const db = await getDb();
    return db.select('SELECT * FROM sub_skills WHERE is_archived = 0 AND parent_skill_id IS NOT NULL AND unified_into IS NULL');
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM sub_skills WHERE source_course_id = ? AND is_archived = 0 AND unified_into IS NULL', [courseId]
    );
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM sub_skills WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async update(id, fields) {
    const db = await getDb();
    const allowed = ['name', 'description', 'skill_type', 'category', 'blooms_level',
      'mastery_criteria', 'evidence', 'fitness', 'is_archived', 'concept_key'];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(['mastery_criteria', 'evidence', 'fitness'].includes(k) && typeof v === 'object'
          ? JSON.stringify(v) : v);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(id);
    await db.execute(`UPDATE sub_skills SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async create({ parentSkillId, name, description, skillType, sourceCourseId,
                 conceptKey, category, bloomsLevel, masteryCriteria,
                 evidence, fitness, extractionModel, schemaVersion, mergedFrom }) {
    const db = await getDb();
    const skillUuid = crypto.randomUUID();
    const result = await db.execute(
      `INSERT INTO sub_skills (parent_skill_id, name, description, skill_type,
         source_course_id, concept_key, category, blooms_level, mastery_criteria,
         evidence, fitness, extraction_model, schema_version, merged_from,
         is_archived, uuid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [parentSkillId, name, description || null, skillType || null,
       sourceCourseId || null, conceptKey || null, category || null,
       bloomsLevel || null,
       masteryCriteria ? JSON.stringify(masteryCriteria) : null,
       evidence ? JSON.stringify(evidence) : null,
       fitness ? JSON.stringify(fitness) : '{}',
       extractionModel || null, schemaVersion || 2,
       mergedFrom ? JSON.stringify(mergedFrom) : null,
       skillUuid, now()]
    );
    return result.lastInsertId;
  },

  async createBatch(skills, { externalTransaction = false } = {}) {
    const work = async (db) => {
      const ids = [];
      for (const s of skills) {
        const skillUuid = crypto.randomUUID();
        const result = await db.execute(
          `INSERT INTO sub_skills (parent_skill_id, name, description, skill_type,
             source_course_id, concept_key, category, blooms_level, mastery_criteria,
             evidence, fitness, extraction_model, schema_version, merged_from,
             is_archived, uuid, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [s.parentSkillId, s.name, s.description || null, s.skillType || null,
           s.sourceCourseId || null, s.conceptKey || null, s.category || null,
           s.bloomsLevel || null,
           s.masteryCriteria ? JSON.stringify(s.masteryCriteria) : null,
           s.evidence ? JSON.stringify(s.evidence) : null,
           s.fitness ? JSON.stringify(s.fitness) : '{}',
           s.extractionModel || null, s.schemaVersion || 2,
           s.mergedFrom ? JSON.stringify(s.mergedFrom) : null,
           skillUuid, now()]
        );
        ids.push(result.lastInsertId);
      }
      return ids;
    };
    if (externalTransaction) { return work(await getDb()); }
    return withTransaction(work);
  },

  // --- ConceptKey queries (16.4) ---

  async findByConceptKey(conceptKey) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM sub_skills WHERE concept_key = ? AND is_archived = 0 AND unified_into IS NULL', [conceptKey]
    );
    return rows[0] || null;
  },

  async getAllConceptKeys() {
    const db = await getDb();
    return db.select(
      'SELECT id, concept_key, name, category, mastery_criteria, evidence, parent_skill_id FROM sub_skills WHERE is_archived = 0 AND unified_into IS NULL'
    );
  },

  // --- Fitness atomic increments (16.4) ---

  async incrementPracticeAttempts(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.practiceAttempts', COALESCE(json_extract(fitness, '$.practiceAttempts'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  async incrementPracticeSuccesses(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.practiceSuccesses', COALESCE(json_extract(fitness, '$.practiceSuccesses'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  async incrementTutoringReferences(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.tutoringReferences', COALESCE(json_extract(fitness, '$.tutoringReferences'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  async incrementAssignmentMappings(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.assignmentMappings', COALESCE(json_extract(fitness, '$.assignmentMappings'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  async incrementDiagnosticCount(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.diagnosticCount', COALESCE(json_extract(fitness, '$.diagnosticCount'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  async incrementDecayEvents(skillId) {
    const db = await getDb();
    await db.execute(
      `UPDATE sub_skills SET fitness = json_set(fitness,
         '$.decayEvents', COALESCE(json_extract(fitness, '$.decayEvents'), 0) + 1,
         '$.lastUsed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       ) WHERE id = ?`, [skillId]
    );
  },

  // --- Re-extraction identity match update (16.14) ---

  async updateFromReextraction(skillId, { description, masteryCriteria, evidence,
                                          bloomsLevel, skillType, materialLabel }) {
    const db = await getDb();
    const existing = await db.select(
      'SELECT mastery_criteria, evidence FROM sub_skills WHERE id = ?', [skillId]
    );
    if (!existing.length) return;

    // Merge criteria: keep existing, append new (deduplicated by text)
    const oldCriteria = jsonParse(existing[0].mastery_criteria, []);
    const oldTexts = new Set(oldCriteria.map(c => c.text));
    const newWrapped = (masteryCriteria || []).filter(text => !oldTexts.has(text))
      .map(text => ({ text, source: materialLabel, addedAt: new Date().toISOString() }));
    const mergedCriteria = [...oldCriteria, ...newWrapped];

    // Merge evidence: union anchor terms, definitions, keep max counts
    const oldEvidence = jsonParse(existing[0].evidence, {});
    const mergedEvidence = {
      anchorTerms: [...new Set([...(oldEvidence.anchorTerms || []), ...(evidence?.anchorTerms || [])])],
      definitionsFound: [...new Set([...(oldEvidence.definitionsFound || []), ...(evidence?.definitionsFound || [])])],
      examplesInSource: Math.max(oldEvidence.examplesInSource || 0, evidence?.examplesInSource || 0),
      equationPresence: oldEvidence.equationPresence || evidence?.equationPresence || false,
      figureReferences: [...new Set([...(oldEvidence.figureReferences || []), ...(evidence?.figureReferences || [])])],
    };

    await db.execute(
      `UPDATE sub_skills SET description = ?, mastery_criteria = ?, evidence = ?,
         blooms_level = COALESCE(?, blooms_level),
         skill_type = COALESCE(?, skill_type),
         updated_at = ?
       WHERE id = ?`,
      [description, JSON.stringify(mergedCriteria), JSON.stringify(mergedEvidence),
       bloomsLevel || null, skillType || null, now(), skillId]
    );
  },
};

// ============================================================
// Chunk-Skill Bindings
// ============================================================

export const ChunkSkillBindings = {
  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select(
      `SELECT csb.*, ss.name as skill_name, ss.parent_skill_id
       FROM chunk_skill_bindings csb
       JOIN sub_skills ss ON csb.sub_skill_id = ss.id
       WHERE csb.chunk_id = ? AND ss.is_archived = 0`, [chunkId]
    );
  },

  async getBySkill(subSkillId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM chunk_skill_bindings WHERE sub_skill_id = ?', [subSkillId]
    );
  },

  async create({ chunkId, subSkillId, extractionContext = null, confidence = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO chunk_skill_bindings (chunk_id, sub_skill_id, extraction_context, confidence, extracted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [chunkId, subSkillId, extractionContext, confidence, now(), now()]
    );
  },

  async createBatch(bindings, { externalTransaction = false } = {}) {
    const work = async (db) => {
      for (const b of bindings) {
        await db.execute(
          `INSERT INTO chunk_skill_bindings (chunk_id, sub_skill_id, extraction_context, confidence, extracted_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [b.chunkId, b.subSkillId, b.extractionContext || null, b.confidence || null, now(), now()]
        );
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  // Delete all bindings for a set of chunk IDs (used in re-extraction)
  async deleteByChunkIds(chunkIds, { externalTransaction = false } = {}) {
    if (!chunkIds.length) return;
    const work = async (db) => {
      for (const cid of chunkIds) {
        await db.execute('DELETE FROM chunk_skill_bindings WHERE chunk_id = ?', [cid]);
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },
};

// ============================================================
// Skill Prerequisites
// ============================================================

export const SkillPrerequisites = {
  async create(subSkillId, prerequisiteId, source) {
    const db = await getDb();
    await db.execute(
      `INSERT OR IGNORE INTO skill_prerequisites (sub_skill_id, prerequisite_id, source, created_at)
       VALUES (?, ?, ?, ?)`,
      [subSkillId, prerequisiteId, source, now()]
    );
  },

  async createBatch(links, { externalTransaction = false } = {}) {
    const work = async (db) => {
      for (const { subSkillId, prerequisiteId, source } of links) {
        await db.execute(
          `INSERT OR IGNORE INTO skill_prerequisites (sub_skill_id, prerequisite_id, source, created_at)
           VALUES (?, ?, ?, ?)`,
          [subSkillId, prerequisiteId, source, now()]
        );
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  async getForSkill(subSkillId) {
    const db = await getDb();
    return db.select(
      `SELECT sp.prerequisite_id, ss.name, ss.concept_key, sp.source
       FROM skill_prerequisites sp
       JOIN sub_skills ss ON sp.prerequisite_id = ss.id
       WHERE sp.sub_skill_id = ? AND ss.is_archived = 0`,
      [subSkillId]
    );
  },

  async getAllWithNames() {
    const db = await getDb();
    return db.select(
      `SELECT sp.sub_skill_id, sp.prerequisite_id, ss.name, ss.concept_key, sp.source
       FROM skill_prerequisites sp
       JOIN sub_skills ss ON sp.prerequisite_id = ss.id
       WHERE ss.is_archived = 0`
    );
  },

  async getDependents(prerequisiteId) {
    const db = await getDb();
    return db.select(
      `SELECT sp.sub_skill_id, ss.name, ss.concept_key, sp.source
       FROM skill_prerequisites sp
       JOIN sub_skills ss ON sp.sub_skill_id = ss.id
       WHERE sp.prerequisite_id = ? AND ss.is_archived = 0`,
      [prerequisiteId]
    );
  },

  async deleteForSkill(subSkillId) {
    const db = await getDb();
    await db.execute(
      'DELETE FROM skill_prerequisites WHERE sub_skill_id = ?',
      [subSkillId]
    );
  },
};

// ============================================================
// Concept Links — cross-sub-skill similarity
// ============================================================

export const ConceptLinks = {
  async create({ subSkillAId, subSkillBId, similarityScore, linkType }) {
    const db = await getDb();
    const [a, b] = subSkillAId < subSkillBId ? [subSkillAId, subSkillBId] : [subSkillBId, subSkillAId];
    await db.execute(
      `INSERT OR IGNORE INTO concept_links (sub_skill_a_id, sub_skill_b_id, similarity_score, link_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [a, b, similarityScore, linkType, now()]
    );
  },

  async createBatch(links) {
    await withTransaction(async (db) => {
      for (const { subSkillAId, subSkillBId, similarityScore, linkType } of links) {
        const [a, b] = subSkillAId < subSkillBId ? [subSkillAId, subSkillBId] : [subSkillBId, subSkillAId];
        await db.execute(
          `INSERT OR IGNORE INTO concept_links (sub_skill_a_id, sub_skill_b_id, similarity_score, link_type, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [a, b, similarityScore, linkType, now()]
        );
      }
    });
  },

  async getBySkill(skillId) {
    const db = await getDb();
    return db.select(
      `SELECT cl.*, sa.name AS name_a, sa.concept_key AS key_a, sb.name AS name_b, sb.concept_key AS key_b
       FROM concept_links cl
       JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
       JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
       WHERE cl.sub_skill_a_id = ? OR cl.sub_skill_b_id = ?`,
      [skillId, skillId]
    );
  },

  async getByParent(parentSkillId) {
    const db = await getDb();
    return db.select(
      `SELECT cl.*, sa.name AS name_a, sa.concept_key AS key_a, sb.name AS name_b, sb.concept_key AS key_b
       FROM concept_links cl
       JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
       JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
       WHERE sa.parent_skill_id = ? OR sb.parent_skill_id = ?`,
      [parentSkillId, parentSkillId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      `SELECT cl.*, sa.name AS name_a, sa.concept_key AS key_a, sb.name AS name_b, sb.concept_key AS key_b
       FROM concept_links cl
       JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
       JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
       WHERE sa.source_course_id = ? OR sb.source_course_id = ?`,
      [courseId, courseId]
    );
  },

  async delete(linkId) {
    const db = await getDb();
    await db.execute('DELETE FROM concept_links WHERE id = ?', [linkId]);
  },

  async deleteBySkill(skillId) {
    const db = await getDb();
    await db.execute('DELETE FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?', [skillId, skillId]);
  },

  async getBySkillBatch(skillIds) {
    if (!skillIds.length) return [];
    const db = await getDb();
    const ph = skillIds.map(() => '?').join(',');
    return db.select(
      `SELECT cl.*, sa.name AS name_a, sa.concept_key AS key_a, sa.source_course_id AS course_a,
              sb.name AS name_b, sb.concept_key AS key_b, sb.source_course_id AS course_b
       FROM concept_links cl
       JOIN sub_skills sa ON cl.sub_skill_a_id = sa.id
       JOIN sub_skills sb ON cl.sub_skill_b_id = sb.id
       WHERE cl.sub_skill_a_id IN (${ph}) OR cl.sub_skill_b_id IN (${ph})`,
      [...skillIds, ...skillIds]
    );
  },
};

// ============================================================
// Sub-Skill Mastery (FSRS)
// ============================================================

export const Mastery = {
  async getBySkill(subSkillId) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM sub_skill_mastery WHERE sub_skill_id = ?', [subSkillId]);
    return rows[0] || null;
  },

  async getBySkills(subSkillIds) {
    if (subSkillIds.length === 0) return [];
    const db = await getDb();
    const placeholders = subSkillIds.map(() => '?').join(',');
    return db.select(
      `SELECT * FROM sub_skill_mastery WHERE sub_skill_id IN (${placeholders})`, subSkillIds
    );
  },

  async getAll() {
    const db = await getDb();
    return db.select('SELECT * FROM sub_skill_mastery');
  },

  async getDueForReview(beforeTimestamp = null) {
    const db = await getDb();
    const ts = beforeTimestamp || now();
    return db.select(
      `SELECT ssm.*, ss.name as skill_name, ss.parent_skill_id
       FROM sub_skill_mastery ssm
       JOIN sub_skills ss ON ssm.sub_skill_id = ss.id
       WHERE ssm.next_review_at IS NOT NULL AND ssm.next_review_at <= ?
         AND ss.is_archived = 0 AND ss.unified_into IS NULL
       ORDER BY ssm.next_review_at`, [ts]
    );
  },

  async upsert(subSkillId, { difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO sub_skill_mastery (sub_skill_id, difficulty, stability, retrievability, reps, lapses, last_review_at, next_review_at, total_mastery_points, last_rating, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sub_skill_id) DO UPDATE SET
         difficulty = excluded.difficulty,
         stability = excluded.stability,
         retrievability = excluded.retrievability,
         reps = excluded.reps,
         lapses = excluded.lapses,
         last_review_at = excluded.last_review_at,
         next_review_at = excluded.next_review_at,
         total_mastery_points = excluded.total_mastery_points,
         last_rating = excluded.last_rating,
         updated_at = excluded.updated_at`,
      [subSkillId, difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating, now()]
    );
  },
};

// ============================================================
// Sessions
// ============================================================

export const Sessions = {
  async getByCourse(courseId) {
    const db = await getDb();
    return db.select('SELECT * FROM sessions WHERE course_id = ? ORDER BY started_at DESC', [courseId]);
  },

  async countByCourse(courseId) {
    const db = await getDb();
    const rows = await db.select('SELECT COUNT(*) as cnt FROM sessions WHERE course_id = ?', [courseId]);
    return rows[0]?.cnt || 0;
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM sessions WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async getActive(courseId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM sessions WHERE course_id = ? AND status = \'active\' ORDER BY started_at DESC LIMIT 1',
      [courseId]
    );
    return rows[0] || null;
  },

  async create({ courseId, intent, scope = null }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      'INSERT INTO sessions (id, course_id, intent, scope, status, started_at) VALUES (?, ?, ?, ?, \'active\', ?)',
      [id, courseId, intent, scope ? JSON.stringify(scope) : null, now()]
    );
    return id;
  },

  async end(id, { status = 'completed', summary = null } = {}) {
    const db = await getDb();
    await db.execute(
      'UPDATE sessions SET status = ?, ended_at = ?, summary = ? WHERE id = ?',
      [status, now(), summary, id]
    );
  },

  async pause(id) {
    return this.end(id, { status: 'paused' });
  },

  async getOrCreateCompat(courseId) {
    const db = await getDb();
    const rows = await db.select(
      "SELECT id FROM sessions WHERE course_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
      [courseId]
    );
    if (rows.length > 0) return rows[0].id;
    const id = uuid();
    await db.execute(
      "INSERT INTO sessions (id, course_id, intent, status, started_at) VALUES (?, ?, 'study', 'active', ?)",
      [id, courseId, now()]
    );
    return id;
  },
};

// ============================================================
// Session Skills
// ============================================================

export const SessionSkills = {
  async getBySession(sessionId) {
    const db = await getDb();
    return db.select(
      `SELECT ss.*, s.name as skill_name, s.parent_skill_id, s.skill_type
       FROM session_skills ss
       JOIN sub_skills s ON ss.sub_skill_id = s.id
       WHERE ss.session_id = ? AND s.is_archived = 0`, [sessionId]
    );
  },

  async create({ sessionId, subSkillId, isTarget = true, preMastery = null }) {
    const db = await getDb();
    await db.execute(
      'INSERT INTO session_skills (session_id, sub_skill_id, is_target, pre_mastery) VALUES (?, ?, ?, ?)',
      [sessionId, subSkillId, isTarget ? 1 : 0, preMastery]
    );
  },

  async createBatch(sessionId, skills) {
    return withTransaction(async (db) => {
      for (const s of skills) {
        await db.execute(
          'INSERT INTO session_skills (session_id, sub_skill_id, is_target, pre_mastery) VALUES (?, ?, ?, ?)',
          [sessionId, s.subSkillId, s.isTarget !== false ? 1 : 0, s.preMastery || null]
        );
      }
    });
  },

  async updatePostMastery(sessionId, subSkillId, postMastery) {
    const db = await getDb();
    await db.execute(
      'UPDATE session_skills SET post_mastery = ? WHERE session_id = ? AND sub_skill_id = ?',
      [postMastery, sessionId, subSkillId]
    );
  },
};

// ============================================================
// Session Events
// ============================================================

export const SessionEvents = {
  async getBySession(sessionId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at', [sessionId]
    );
  },

  async create({ sessionId, subSkillId, eventType, score = null, intentWeight, context = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO session_events (session_id, sub_skill_id, event_type, score, intent_weight, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, subSkillId, eventType, score, intentWeight, context ? JSON.stringify(context) : null, now()]
    );
  },
};

// ============================================================
// Messages
// ============================================================

export const Messages = {
  async getBySession(sessionId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY id', [sessionId]
    );
  },

  async create({ sessionId, role, content, inputMode = null, metadata = null }) {
    const db = await getDb();
    await db.execute(
      'INSERT INTO messages (session_id, role, content, input_mode, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, role, content, inputMode, metadata ? JSON.stringify(metadata) : null, now()]
    );
  },

  async appendBatch(sessionId, messages) {
    return withTransaction(async (db) => {
      for (const msg of messages) {
        await db.execute(
          'INSERT INTO messages (session_id, role, content, input_mode, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [sessionId, msg.role, msg.content, msg.inputMode || null,
           msg.metadata ? (typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.metadata)) : JSON.stringify({ thinking: msg.thinking, skills: msg.skills }),
           now()]
        );
      }
    });
  },

  async getLastN(sessionId, n = 20) {
    const db = await getDb();
    // Get last N messages by querying in reverse, then re-sort
    const rows = await db.select(
      `SELECT * FROM (
         SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?
       ) sub ORDER BY id ASC`,
      [sessionId, n]
    );
    return rows;
  },
};

// ============================================================
// Journal Entries
// ============================================================

export const JournalEntries = {
  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM journal_entries WHERE course_id = ? ORDER BY created_at DESC', [courseId]
    );
  },

  async getBySession(sessionId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM journal_entries WHERE session_id = ?', [sessionId]
    );
    return rows[0] || null;
  },

  async create({ sessionId, courseId, intent, entryData, skillsPracticed = null, masteryChanges = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO journal_entries (session_id, course_id, intent, entry_data, skills_practiced, mastery_changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, courseId, intent,
        typeof entryData === 'string' ? entryData : JSON.stringify(entryData),
        skillsPracticed ? JSON.stringify(skillsPracticed) : null,
        masteryChanges ? JSON.stringify(masteryChanges) : null,
        now()
      ]
    );
  },
};

// ============================================================
// Practice Sets
// ============================================================

export const PracticeSets = {
  async get(subSkillId, sessionId = null) {
    const db = await getDb();
    const rows = sessionId
      ? await db.select('SELECT * FROM practice_sets WHERE sub_skill_id = ? AND session_id = ?', [subSkillId, sessionId])
      : await db.select('SELECT * FROM practice_sets WHERE sub_skill_id = ? AND session_id IS NULL', [subSkillId]);
    if (rows.length === 0) return null;
    return { ...rows[0], data: jsonParse(rows[0].data) };
  },

  async upsert(subSkillId, data, sessionId = null) {
    const db = await getDb();
    const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
    if (sessionId) {
      await db.execute(
        `INSERT INTO practice_sets (sub_skill_id, session_id, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(sub_skill_id, COALESCE(session_id, '')) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [subSkillId, sessionId, jsonData, now()]
      );
    } else {
      // For NULL session_id, check existence first since COALESCE trick may not match
      const existing = await db.select(
        'SELECT id FROM practice_sets WHERE sub_skill_id = ? AND session_id IS NULL', [subSkillId]
      );
      if (existing.length > 0) {
        await db.execute(
          'UPDATE practice_sets SET data = ?, updated_at = ? WHERE sub_skill_id = ? AND session_id IS NULL',
          [jsonData, now(), subSkillId]
        );
      } else {
        await db.execute(
          'INSERT INTO practice_sets (sub_skill_id, session_id, data, updated_at) VALUES (?, NULL, ?, ?)',
          [subSkillId, jsonData, now()]
        );
      }
    }
  },
};

// ============================================================
// Facets — atomic trackable learning units under sub_skills
// ============================================================

export const Facets = {
  async getBySkill(skillId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM facets WHERE skill_id = ? AND is_archived = 0 ORDER BY id', [skillId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      `SELECT f.* FROM facets f
       JOIN sub_skills ss ON f.skill_id = ss.id
       WHERE ss.source_course_id = ? AND ss.is_archived = 0 AND ss.unified_into IS NULL AND f.is_archived = 0
       ORDER BY f.skill_id, f.id`,
      [courseId]
    );
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM facets WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ skillId, name, description, conceptKey, skillType, bloomsLevel,
                 masteryCriteria, evidence }) {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO facets (skill_id, name, description, concept_key, skill_type, blooms_level,
         mastery_criteria, evidence, is_archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [skillId, name, description || null, conceptKey || null,
       skillType || null, bloomsLevel || null,
       masteryCriteria ? JSON.stringify(masteryCriteria) : null,
       evidence ? JSON.stringify(evidence) : null, now()]
    );
    return result.lastInsertId;
  },

  async createBatch(facets, { externalTransaction = false } = {}) {
    const work = async (db) => {
      const ids = [];
      for (const f of facets) {
        const result = await db.execute(
          `INSERT INTO facets (skill_id, name, description, concept_key, skill_type, blooms_level,
             mastery_criteria, evidence, is_archived, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [f.skillId, f.name, f.description || null, f.conceptKey || null,
           f.skillType || null, f.bloomsLevel || null,
           f.masteryCriteria ? JSON.stringify(f.masteryCriteria) : null,
           f.evidence ? JSON.stringify(f.evidence) : null, now()]
        );
        ids.push(result.lastInsertId);
      }
      return ids;
    };
    if (externalTransaction) { return work(await getDb()); }
    return withTransaction(work);
  },

  async update(id, fields) {
    const db = await getDb();
    const allowed = ['name', 'description', 'concept_key', 'skill_type', 'blooms_level',
      'mastery_criteria', 'evidence', 'is_archived'];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(['mastery_criteria', 'evidence'].includes(k) && typeof v === 'object'
          ? JSON.stringify(v) : v);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(id);
    await db.execute(`UPDATE facets SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async archive(id) {
    const db = await getDb();
    await db.execute('UPDATE facets SET is_archived = 1, updated_at = ? WHERE id = ?', [now(), id]);
  },

  async getAllActive() {
    const db = await getDb();
    return db.select('SELECT * FROM facets WHERE is_archived = 0 ORDER BY skill_id, id');
  },

  async findByConceptKey(conceptKey) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM facets WHERE concept_key = ? AND is_archived = 0', [conceptKey]
    );
    return rows[0] || null;
  },
};

// ============================================================
// Facet Mastery (FSRS)
// ============================================================

export const FacetMastery = {
  async get(facetId) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM facet_mastery WHERE facet_id = ?', [facetId]);
    return rows[0] || null;
  },

  async getByFacets(facetIds) {
    if (facetIds.length === 0) return [];
    const db = await getDb();
    const ph = facetIds.map(() => '?').join(',');
    return db.select(`SELECT * FROM facet_mastery WHERE facet_id IN (${ph})`, facetIds);
  },

  async getAll(courseId) {
    const db = await getDb();
    if (courseId) {
      return db.select(
        `SELECT fm.* FROM facet_mastery fm
         JOIN facets f ON fm.facet_id = f.id
         JOIN sub_skills ss ON f.skill_id = ss.id
         WHERE ss.source_course_id = ? AND ss.is_archived = 0 AND ss.unified_into IS NULL AND f.is_archived = 0`,
        [courseId]
      );
    }
    return db.select('SELECT * FROM facet_mastery');
  },

  async getDueForReview(courseId, beforeTimestamp = null) {
    const db = await getDb();
    const ts = beforeTimestamp || now();
    const params = [ts];
    let courseFilter = '';
    if (courseId) {
      courseFilter = 'AND ss.source_course_id = ?';
      params.push(courseId);
    }
    return db.select(
      `SELECT fm.*, f.name AS facet_name, f.skill_id, f.concept_key AS facet_key
       FROM facet_mastery fm
       JOIN facets f ON fm.facet_id = f.id
       JOIN sub_skills ss ON f.skill_id = ss.id
       WHERE fm.next_review_at IS NOT NULL AND fm.next_review_at <= ?
         AND f.is_archived = 0 AND ss.is_archived = 0 AND ss.unified_into IS NULL
         ${courseFilter}
       ORDER BY fm.next_review_at`, params
    );
  },

  async upsert(facetId, { difficulty, stability, retrievability, reps, lapses,
                          lastReviewAt, nextReviewAt, totalMasteryPoints, lastRating = null }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO facet_mastery (facet_id, difficulty, stability, retrievability, reps, lapses,
         last_review_at, next_review_at, last_rating, total_mastery_points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(facet_id) DO UPDATE SET
         difficulty = excluded.difficulty,
         stability = excluded.stability,
         retrievability = excluded.retrievability,
         reps = excluded.reps,
         lapses = excluded.lapses,
         last_review_at = excluded.last_review_at,
         next_review_at = excluded.next_review_at,
         last_rating = excluded.last_rating,
         total_mastery_points = excluded.total_mastery_points,
         updated_at = excluded.updated_at`,
      [facetId, difficulty, stability, retrievability, reps, lapses,
       lastReviewAt, nextReviewAt, lastRating, totalMasteryPoints, now()]
    );
  },

  async upsertBatch(records) {
    await withTransaction(async (db) => {
      for (const r of records) {
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
          [r.facetId, r.difficulty || 0.3, r.stability || 1.0, r.retrievability || 1.0,
           r.reps || 0, r.lapses || 0, r.lastReviewAt || null, r.nextReviewAt || null,
           r.lastRating || null, r.totalMasteryPoints || 0.0, now()]
        );
      }
    });
  },
};

// ============================================================
// Chunk-Facet Bindings — typed, ranked chunk-to-facet relationships
// ============================================================

export const ChunkFacetBindings = {
  async getByFacet(facetId, { type = null, minConfidence = null } = {}) {
    const db = await getDb();
    let sql = 'SELECT * FROM chunk_facet_bindings WHERE facet_id = ?';
    const params = [facetId];
    if (type) { sql += ' AND binding_type = ?'; params.push(type); }
    if (minConfidence != null) { sql += ' AND confidence >= ?'; params.push(minConfidence); }
    sql += ' ORDER BY quality_rank';
    return db.select(sql, params);
  },

  async getByFacetRanked(facetId) {
    const db = await getDb();
    return db.select(
      `SELECT cfb.*, c.label AS chunk_label, c.char_count,
              m.classification AS material_classification
       FROM chunk_facet_bindings cfb
       JOIN chunks c ON cfb.chunk_id = c.id
       JOIN materials m ON c.material_id = m.id
       WHERE cfb.facet_id = ?
       ORDER BY
         CASE cfb.binding_type WHEN 'teaches' THEN 0 WHEN 'prerequisite_for' THEN 1 ELSE 2 END,
         cfb.quality_rank,
         cfb.confidence DESC`,
      [facetId]
    );
  },

  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select(
      `SELECT cfb.*, f.name AS facet_name, f.concept_key AS facet_key, f.skill_id
       FROM chunk_facet_bindings cfb
       JOIN facets f ON cfb.facet_id = f.id
       WHERE cfb.chunk_id = ? AND f.is_archived = 0`,
      [chunkId]
    );
  },

  async create({ chunkId, facetId, extractionContext, confidence, bindingType,
                 qualityRank, contentRange }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO chunk_facet_bindings (chunk_id, facet_id, extraction_context, confidence,
         binding_type, quality_rank, content_range, extracted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chunkId, facetId, extractionContext || null, confidence || null,
       bindingType || 'teaches', qualityRank || 0,
       contentRange || null, now(), now()]
    );
  },

  async createBatch(bindings, { externalTransaction = false } = {}) {
    const work = async (db) => {
      for (const b of bindings) {
        await db.execute(
          `INSERT INTO chunk_facet_bindings (chunk_id, facet_id, extraction_context, confidence,
             binding_type, quality_rank, content_range, extracted_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.chunkId, b.facetId, b.extractionContext || null, b.confidence || null,
           b.bindingType || 'teaches', b.qualityRank || 0,
           b.contentRange || null, now(), now()]
        );
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  async deleteByFacetIds(facetIds, { externalTransaction = false } = {}) {
    if (!facetIds.length) return;
    const work = async (db) => {
      for (const fid of facetIds) {
        await db.execute('DELETE FROM chunk_facet_bindings WHERE facet_id = ?', [fid]);
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  async updateQualityRanks(facetId, rankings) {
    const db = await getDb();
    for (const { bindingId, qualityRank } of rankings) {
      await db.execute(
        'UPDATE chunk_facet_bindings SET quality_rank = ?, updated_at = ? WHERE id = ? AND facet_id = ?',
        [qualityRank, now(), bindingId, facetId]
      );
    }
  },
};

// ============================================================
// Facet Concept Links — cross-domain relationships between facets
// ============================================================

export const FacetConceptLinks = {
  async create({ facetAId, facetBId, similarityScore, linkType, reason }) {
    const db = await getDb();
    const [a, b] = facetAId < facetBId ? [facetAId, facetBId] : [facetBId, facetAId];
    await db.execute(
      `INSERT OR IGNORE INTO facet_concept_links (facet_a_id, facet_b_id, similarity_score, link_type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [a, b, similarityScore, linkType, reason || null, now()]
    );
  },

  async createBatch(links) {
    await withTransaction(async (db) => {
      for (const { facetAId, facetBId, similarityScore, linkType, reason } of links) {
        const [a, b] = facetAId < facetBId ? [facetAId, facetBId] : [facetBId, facetAId];
        await db.execute(
          `INSERT OR IGNORE INTO facet_concept_links (facet_a_id, facet_b_id, similarity_score, link_type, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [a, b, similarityScore, linkType, reason || null, now()]
        );
      }
    });
  },

  async getByFacet(facetId) {
    const db = await getDb();
    return db.select(
      `SELECT fcl.*, fa.name AS name_a, fa.concept_key AS key_a,
              fb.name AS name_b, fb.concept_key AS key_b
       FROM facet_concept_links fcl
       JOIN facets fa ON fcl.facet_a_id = fa.id
       JOIN facets fb ON fcl.facet_b_id = fb.id
       WHERE fcl.facet_a_id = ? OR fcl.facet_b_id = ?`,
      [facetId, facetId]
    );
  },

  async getByFacetBatch(facetIds) {
    if (!facetIds.length) return [];
    const db = await getDb();
    const ph = facetIds.map(() => '?').join(',');
    return db.select(
      `SELECT fcl.*, fa.name AS name_a, fa.concept_key AS key_a, fa.skill_id AS skill_a,
              fb.name AS name_b, fb.concept_key AS key_b, fb.skill_id AS skill_b
       FROM facet_concept_links fcl
       JOIN facets fa ON fcl.facet_a_id = fa.id
       JOIN facets fb ON fcl.facet_b_id = fb.id
       WHERE fcl.facet_a_id IN (${ph}) OR fcl.facet_b_id IN (${ph})`,
      [...facetIds, ...facetIds]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      `SELECT fcl.*, fa.name AS name_a, fa.concept_key AS key_a,
              fb.name AS name_b, fb.concept_key AS key_b
       FROM facet_concept_links fcl
       JOIN facets fa ON fcl.facet_a_id = fa.id
       JOIN facets fb ON fcl.facet_b_id = fb.id
       JOIN sub_skills sa ON fa.skill_id = sa.id
       JOIN sub_skills sb ON fb.skill_id = sb.id
       WHERE sa.source_course_id = ? OR sb.source_course_id = ?`,
      [courseId, courseId]
    );
  },

  async delete(linkId) {
    const db = await getDb();
    await db.execute('DELETE FROM facet_concept_links WHERE id = ?', [linkId]);
  },

  async deleteByFacet(facetId) {
    const db = await getDb();
    await db.execute(
      'DELETE FROM facet_concept_links WHERE facet_a_id = ? OR facet_b_id = ?',
      [facetId, facetId]
    );
  },
};

// ============================================================
// Assignment Question Facets
// ============================================================

export const AssignmentQuestionFacets = {
  async getByQuestion(questionId) {
    const db = await getDb();
    return db.select(
      `SELECT aqf.*, f.name AS facet_name, f.concept_key AS facet_key, f.skill_id
       FROM assignment_question_facets aqf
       JOIN facets f ON aqf.facet_id = f.id
       WHERE aqf.question_id = ? AND f.is_archived = 0`,
      [questionId]
    );
  },

  async getByFacet(facetId) {
    const db = await getDb();
    return db.select(
      `SELECT aqf.*, aq.question_ref, aq.description AS question_desc, aq.difficulty,
              a.title AS assignment_title, a.due_date
       FROM assignment_question_facets aqf
       JOIN assignment_questions aq ON aqf.question_id = aq.id
       JOIN assignments a ON aq.assignment_id = a.id
       WHERE aqf.facet_id = ?`,
      [facetId]
    );
  },

  async create({ questionId, facetId }) {
    const db = await getDb();
    await db.execute(
      'INSERT INTO assignment_question_facets (question_id, facet_id) VALUES (?, ?)',
      [questionId, facetId]
    );
  },

  async createBatch(mappings, { externalTransaction = false } = {}) {
    const work = async (db) => {
      for (const { questionId, facetId } of mappings) {
        await db.execute(
          'INSERT INTO assignment_question_facets (question_id, facet_id) VALUES (?, ?)',
          [questionId, facetId]
        );
      }
    };
    if (externalTransaction) { await work(await getDb()); }
    else { await withTransaction(work); }
  },

  async deleteByQuestion(questionId) {
    const db = await getDb();
    await db.execute('DELETE FROM assignment_question_facets WHERE question_id = ?', [questionId]);
  },
};

// ============================================================
// Skill Courses — junction table for many-to-many skill↔course
// ============================================================

export const SkillCourses = {
  async add(skillId, courseId) {
    const db = await getDb();
    await db.execute(
      'INSERT OR IGNORE INTO skill_courses (skill_id, course_id) VALUES (?, ?)',
      [skillId, courseId]
    );
  },

  async getBySkill(skillId) {
    const db = await getDb();
    return db.select(
      `SELECT sc.*, c.name AS course_name, c.course_number
       FROM skill_courses sc
       JOIN courses c ON sc.course_id = c.id
       WHERE sc.skill_id = ?`,
      [skillId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select('SELECT * FROM skill_courses WHERE course_id = ?', [courseId]);
  },

  async getAll() {
    const db = await getDb();
    return db.select('SELECT * FROM skill_courses');
  },

  async remove(skillId, courseId) {
    const db = await getDb();
    await db.execute(
      'DELETE FROM skill_courses WHERE skill_id = ? AND course_id = ?',
      [skillId, courseId]
    );
  },
};

/**
 * Backfill skill_courses from existing sub_skills.source_course_id values.
 * Idempotent via settings flag.
 */
export const backfillSkillCourses = async () => {
  const db = await getDb();
  const flag = await db.select(
    "SELECT value FROM settings WHERE key = 'skill_courses_backfilled'"
  );
  if (flag.length > 0 && flag[0].value === '1') return { skipped: true };

  const skills = await db.select(
    'SELECT id, source_course_id FROM sub_skills WHERE source_course_id IS NOT NULL'
  );
  for (const s of skills) {
    await db.execute(
      'INSERT OR IGNORE INTO skill_courses (skill_id, course_id) VALUES (?, ?)',
      [s.id, s.source_course_id]
    );
  }
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('skill_courses_backfilled', '1')"
  );
  return { skipped: false, backfilled: skills.length };
};

// ============================================================
// Material Images
// ============================================================

export const MaterialImages = {
  async getByMaterial(materialId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM material_images WHERE material_id = ? ORDER BY page_or_slide_number',
      [materialId]
    );
  },

  async getByChunk(chunkId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM material_images WHERE chunk_id = ? ORDER BY page_or_slide_number',
      [chunkId]
    );
  },

  async getByChunkIds(chunkIds) {
    if (!chunkIds.length) return [];
    const db = await getDb();
    const placeholders = chunkIds.map(() => '?').join(',');
    return db.select(
      'SELECT * FROM material_images WHERE chunk_id IN (' + placeholders + ') ORDER BY page_or_slide_number',
      chunkIds
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM material_images WHERE course_id = ? ORDER BY material_id, page_or_slide_number',
      [courseId]
    );
  },

  async getByMaterialAndPage(materialId, pageNum) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT * FROM material_images WHERE material_id = ? AND page_or_slide_number = ? LIMIT 1',
      [materialId, pageNum]
    );
    return rows[0] || null;
  },

  async getById(id) {
    const db = await getDb();
    const rows = await db.select('SELECT * FROM material_images WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ materialId, courseId, imageType, pageOrSlideNumber, caption, filePath, width, height, chunkId, fileSizeBytes }) {
    const db = await getDb();
    const id = uuid();
    await db.execute(
      `INSERT INTO material_images (id, material_id, course_id, image_type, page_or_slide_number, caption, file_path, width, height, chunk_id, file_size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, materialId, courseId, imageType, pageOrSlideNumber || null, caption || null,
       filePath, width || null, height || null, chunkId || null, fileSizeBytes || null, now()]
    );
    return id;
  },

  async createBatch(images) {
    return withTransaction(async (db) => {
      const ids = [];
      for (const img of images) {
        const id = uuid();
        await db.execute(
          `INSERT INTO material_images (id, material_id, course_id, image_type, page_or_slide_number, caption, file_path, width, height, chunk_id, file_size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, img.materialId, img.courseId, img.imageType, img.pageOrSlideNumber || null,
           img.caption || null, img.filePath, img.width || null, img.height || null,
           img.chunkId || null, img.fileSizeBytes || null, now()]
        );
        ids.push(id);
      }
      return ids;
    });
  },

  async updateChunkId(id, chunkId) {
    const db = await getDb();
    await db.execute(
      'UPDATE material_images SET chunk_id = ? WHERE id = ?',
      [chunkId, id]
    );
  },

  async deleteByMaterial(materialId) {
    const db = await getDb();
    await db.execute('DELETE FROM material_images WHERE material_id = ?', [materialId]);
  },

  async deleteByCourse(courseId) {
    const db = await getDb();
    await db.execute('DELETE FROM material_images WHERE course_id = ?', [courseId]);
  },

  async getCountByMaterial(materialId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT COUNT(*) as c FROM material_images WHERE material_id = ?',
      [materialId]
    );
    return rows[0]?.c || 0;
  },

  async getCountsByCourse(courseId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT material_id, COUNT(*) as c FROM material_images WHERE course_id = ? GROUP BY material_id',
      [courseId]
    );
    const map = {};
    for (const r of rows) map[r.material_id] = r.c;
    return map;
  },
};

// ============================================================
// Facet Data Migration — promote existing mastery_criteria to facets
// ============================================================

/**
 * One-time JS migration that runs on first boot after migration 005.
 * Promotes existing sub_skills.mastery_criteria into facet rows and
 * copies associated data (FSRS state, bindings, concept links, question mappings).
 *
 * Safe to re-run: checks settings.facet_migration_done flag.
 */
export const migrateFacets = async () => {
  const db = await getDb();

  // Check if already done
  const flag = await db.select("SELECT value FROM settings WHERE key = 'facet_migration_done'");
  if (flag.length > 0 && flag[0].value === '1') return { skipped: true };

  // Check if facets table exists (migration 005 ran)
  try {
    await db.select('SELECT 1 FROM facets LIMIT 1');
  } catch {
    return { skipped: true, reason: 'facets table not yet created' };
  }

  const stats = { facetsCreated: 0, masteryRecords: 0, bindings: 0, conceptLinks: 0, questionMappings: 0 };

  await withTransaction(async (db) => {
    // 1. Load all active sub_skills
    const skills = await db.select(
      'SELECT id, concept_key, name, description, skill_type, blooms_level, mastery_criteria, evidence FROM sub_skills WHERE is_archived = 0'
    );

    for (const skill of skills) {
      const criteria = jsonParse(skill.mastery_criteria, []);
      const evidence = jsonParse(skill.evidence, {});
      let facetIds = [];

      if (criteria.length <= 2) {
        // Single facet with all criteria
        const result = await db.execute(
          `INSERT INTO facets (skill_id, name, description, concept_key, skill_type, blooms_level,
             mastery_criteria, evidence, is_archived, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [skill.id, skill.name, skill.description,
           skill.concept_key ? skill.concept_key + '/core' : null,
           skill.skill_type, skill.blooms_level,
           JSON.stringify(criteria), JSON.stringify(evidence), now()]
        );
        facetIds.push(result.lastInsertId);
        stats.facetsCreated++;
      } else {
        // One facet per criterion
        for (let i = 0; i < criteria.length; i++) {
          const c = criteria[i];
          const text = typeof c === 'string' ? c : (c.text || '');
          // Generate a facet name from the criterion text (first ~60 chars)
          const facetName = text.length > 60 ? text.substring(0, 57) + '...' : text;
          const facetKey = skill.concept_key
            ? skill.concept_key + '/f' + (i + 1)
            : null;
          const result = await db.execute(
            `INSERT INTO facets (skill_id, name, description, concept_key, skill_type, blooms_level,
               mastery_criteria, evidence, is_archived, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [skill.id, facetName, text, facetKey,
             skill.skill_type, skill.blooms_level,
             JSON.stringify([c]), JSON.stringify(evidence), now()]
          );
          facetIds.push(result.lastInsertId);
          stats.facetsCreated++;
        }
      }

      // 2. Copy FSRS state from sub_skill_mastery to each facet
      const mastery = await db.select(
        'SELECT * FROM sub_skill_mastery WHERE sub_skill_id = ?', [skill.id]
      );
      if (mastery.length > 0) {
        const m = mastery[0];
        for (const fid of facetIds) {
          await db.execute(
            `INSERT OR IGNORE INTO facet_mastery (facet_id, difficulty, stability, retrievability,
               reps, lapses, last_review_at, next_review_at, last_rating, total_mastery_points, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [fid, m.difficulty, m.stability, m.retrievability,
             m.reps, m.lapses, m.last_review_at, m.next_review_at,
             m.last_rating, m.total_mastery_points, now()]
          );
          stats.masteryRecords++;
        }
      }

      // 3. Copy chunk_skill_bindings → chunk_facet_bindings for ALL facets of this skill
      const bindings = await db.select(
        'SELECT * FROM chunk_skill_bindings WHERE sub_skill_id = ?', [skill.id]
      );
      for (const b of bindings) {
        for (const fid of facetIds) {
          await db.execute(
            `INSERT INTO chunk_facet_bindings (chunk_id, facet_id, extraction_context, confidence,
               binding_type, quality_rank, content_range, extracted_at, updated_at)
             VALUES (?, ?, ?, ?, 'teaches', 0, NULL, ?, ?)`,
            [b.chunk_id, fid, b.extraction_context, b.confidence, b.extracted_at || now(), now()]
          );
          stats.bindings++;
        }
      }

      // 4. Copy concept_links → facet_concept_links
      //    For each concept link involving this skill, create links between ALL facets of both skills
      const links = await db.select(
        'SELECT * FROM concept_links WHERE sub_skill_a_id = ? OR sub_skill_b_id = ?',
        [skill.id, skill.id]
      );
      for (const link of links) {
        // Find facets of the OTHER skill in this link
        const otherSkillId = link.sub_skill_a_id === skill.id ? link.sub_skill_b_id : link.sub_skill_a_id;
        const otherFacets = await db.select(
          'SELECT id FROM facets WHERE skill_id = ? AND is_archived = 0', [otherSkillId]
        );
        // Only create links if the other skill's facets already exist (processed earlier)
        for (const myFid of facetIds) {
          for (const otherF of otherFacets) {
            const [a, b] = myFid < otherF.id ? [myFid, otherF.id] : [otherF.id, myFid];
            if (a === b) continue;
            await db.execute(
              `INSERT OR IGNORE INTO facet_concept_links (facet_a_id, facet_b_id, similarity_score, link_type, reason, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [a, b, link.similarity_score, link.link_type,
               'Migrated from skill-level concept link', now()]
            );
            stats.conceptLinks++;
          }
        }
      }

      // 5. Copy assignment_question_skills → assignment_question_facets
      const questionSkills = await db.select(
        'SELECT * FROM assignment_question_skills WHERE sub_skill_id = ?', [skill.id]
      );
      for (const qs of questionSkills) {
        for (const fid of facetIds) {
          await db.execute(
            'INSERT INTO assignment_question_facets (question_id, facet_id) VALUES (?, ?)',
            [qs.question_id, fid]
          );
          stats.questionMappings++;
        }
      }
    }

    // Mark migration as complete
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('facet_migration_done', '1')"
    );
  });

  console.log('[DB] Facet migration complete:', stats);
  return stats;
};

// ============================================================
// Nested Course Loader / Saver
// ============================================================

/**
 * Load all courses with nested materials and chunks.
 * Materials get v1-compat aliases (name, type, created) so existing consumers work.
 * Chunk content is NOT loaded (expensive) — use Chunks.getContent(id) on demand.
 * Deduped: concurrent calls return the same in-flight promise.
 */
let _pendingCoursesLoad = null;
export const loadCoursesNested = () => {
  if (_pendingCoursesLoad) return _pendingCoursesLoad;
  _pendingCoursesLoad = _loadCoursesNestedImpl().finally(() => { _pendingCoursesLoad = null; });
  return _pendingCoursesLoad;
};

const _loadCoursesNestedImpl = async () => {
  const db = await getDb();
  const courses = await db.select('SELECT * FROM courses ORDER BY created_at DESC');
  for (const course of courses) {
    course.created = course.created_at;
    const mats = await db.select('SELECT * FROM materials WHERE course_id = ?', [course.id]);
    for (const mat of mats) {
      mat.name = mat.label;
      mat.type = mat.file_type;
      mat.created = mat.created_at;
      mat.chunks = await db.select(
        `SELECT id, label, char_count as charCount, status, error_info as errorInfo, fail_count as failCount
         FROM chunks WHERE material_id = ? ORDER BY ordering`, [mat.id]
      );
      mat.chunks = mat.chunks.map(ch => ({
        ...ch,
        errorInfo: jsonParse(ch.errorInfo),
      }));
    }
    course.materials = mats;
  }
  return courses;
};

/**
 * Upsert courses with nested materials and chunks.
 * Accepts both v1 field names (name/type/created) and v2 field names (label/file_type/created_at).
 * Chunk content is NOT written — use Chunks.updateContent(id, content) separately.
 */
export const saveCoursesNested = async (courses) => {
  return withTransaction(async (db) => {
    for (const course of courses) {
      await db.execute(
        `INSERT INTO courses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
        [course.id, course.name, course.created || course.created_at || now(), now()]
      );
      for (const mat of (course.materials || [])) {
        await db.execute(
          `INSERT INTO materials (id, course_id, label, classification, file_type, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             label = excluded.label, classification = excluded.classification,
             file_type = excluded.file_type, active = excluded.active, updated_at = ?`,
          [mat.id, course.id, mat.name || mat.label, mat.classification,
           mat.type || mat.fileType, mat.active !== false ? 1 : 0,
           mat.created || mat.created_at || now(), now()]
        );
        for (const ch of (mat.chunks || [])) {
          await db.execute(
            `INSERT INTO chunks (id, material_id, course_id, label, content_hash, char_count, status, error_info, fail_count, ordering, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               label = excluded.label, char_count = excluded.char_count,
               status = excluded.status, error_info = excluded.error_info,
               fail_count = excluded.fail_count`,
            [ch.id, mat.id, course.id, ch.label,
             ch.contentHash || ch.content_hash || 'legacy-' + ch.id,
             ch.charCount || ch.char_count || 0,
             ch.status || 'pending',
             ch.errorInfo ? JSON.stringify(ch.errorInfo) : null,
             ch.failCount || ch.fail_count || 0,
             ch.ordering || 0, now()]
          );
        }
      }
    }
    return true;
  });
};

// ============================================================
// Database Backup
// ============================================================

const backupDatabase = async () => {
  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const { copyFile, readDir, remove } = await import('@tauri-apps/plugin-fs');
    const dataDir = await appDataDir();
    const dbPath = dataDir + 'study.db';
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);
    const backupName = 'study.db.backup.' + ts;
    await copyFile(dbPath, dataDir + backupName);
    console.log('[DB] Backup created:', backupName);

    // Keep last 3 backups, delete older ones
    const entries = await readDir(dataDir);
    const backups = entries
      .filter(e => e.name && e.name.startsWith('study.db.backup.'))
      .map(e => e.name)
      .sort()
      .reverse();
    for (const old of backups.slice(3)) {
      await remove(dataDir + old);
      console.log('[DB] Removed old backup:', old);
    }
  } catch (e) {
    console.error('[DB] Backup failed (continuing with reset):', e);
  }
};

// ============================================================
// Hard Reset
// ============================================================

export const resetAll = async ({ confirmed = false } = {}) => {
  if (!confirmed) throw new Error('resetAll requires explicit confirmation');
  await backupDatabase();
  const db = await getDb();

  // Count what we're about to destroy (for UI confirmation + logging)
  const counts = {};
  for (const table of ['courses', 'sub_skills', 'sub_skill_mastery', 'chunks', 'sessions']) {
    const rows = await db.select(`SELECT COUNT(*) as c FROM ${table}`);
    counts[table] = rows[0].c;
  }

  // Order matters for FK constraints — facet tables before their parents
  const tables = [
    'assignment_question_facets', 'assignment_question_skills',
    'assignment_questions', 'assignments',
    'facet_concept_links', 'chunk_facet_bindings', 'facet_mastery', 'facets',
    'practice_sets', 'journal_entries', 'session_events', 'session_skills',
    'messages', 'sessions', 'sub_skill_mastery', 'skill_prerequisites',
    'concept_links', 'chunk_skill_bindings', 'chunk_fingerprints',
    'chunk_media', 'material_images', 'chunks', 'materials', 'course_assessments',
    'course_schedule', 'courses', 'sub_skills', 'parent_skill_aliases',
    'parent_skills', 'settings'
  ];
  await withTransaction(async (db) => {
    for (const t of tables) {
      await db.execute(`DELETE FROM ${t}`);
    }
  });
  return { deleted: counts };
};


