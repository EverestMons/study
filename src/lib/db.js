// ============================================================
// DB Layer v2 — SQLite via @tauri-apps/plugin-sql
//
// Clean API for v2 schema tables. Includes v1 compatibility
// shims (marked V1_COMPAT) so existing App.jsx keeps working
// during incremental migration.
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
    // CASCADE handles children, but be explicit for safety
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
      questionCount: r.question_count,
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

      for (const q of qRows) {
        questions.push({
          id: q.id, questionRef: q.question_ref, description: q.description,
          difficulty: q.difficulty, ordering: q.ordering,
          requiredSkills: skillsByQ[q.id] || [],
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

    return qRows.map(q => ({
      id: q.id, questionRef: q.question_ref, description: q.description,
      difficulty: q.difficulty, ordering: q.ordering,
      requiredSkills: skillsByQ[q.id] || [],
    }));
  },

  async saveQuestions(assignmentId, courseId, questions) {
    return withTransaction(async (db) => {
      // Delete existing questions (CASCADE removes skill mappings)
      await db.execute('DELETE FROM assignment_questions WHERE assignment_id = ?', [assignmentId]);

      if (!Array.isArray(questions) || questions.length === 0) return;

      // Load course skills for ID resolution
      const courseSkills = await db.select(
        'SELECT id, name, concept_key FROM sub_skills WHERE source_course_id = ? AND is_archived = 0',
        [courseId]
      );

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const result = await db.execute(
          `INSERT INTO assignment_questions (assignment_id, question_ref, description, difficulty, ordering)
           VALUES (?, ?, ?, ?, ?)`,
          [assignmentId, q.id || q.questionRef || `q${i + 1}`, q.description || null, q.difficulty || null, i]
        );
        const questionId = result.lastInsertId;

        // Resolve and insert skill mappings
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
    });
  },

  // --- Placeholder Matching ---

  async getPlaceholders(courseId) {
    const db = await getDb();
    const rows = await db.select(
      "SELECT * FROM assignments WHERE course_id = ? AND source = 'syllabus' AND material_id IS NULL ORDER BY due_date ASC",
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
// Sub-Skills
// ============================================================

export const SubSkills = {
  async getByParent(parentSkillId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM sub_skills WHERE parent_skill_id = ? AND is_archived = 0', [parentSkillId]
    );
  },

  async getByCourse(courseId) {
    const db = await getDb();
    return db.select(
      'SELECT * FROM sub_skills WHERE source_course_id = ? AND is_archived = 0', [courseId]
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
      'SELECT * FROM sub_skills WHERE concept_key = ? AND is_archived = 0', [conceptKey]
    );
    return rows[0] || null;
  },

  async getAllConceptKeys() {
    const db = await getDb();
    return db.select(
      'SELECT id, concept_key, name, category, mastery_criteria, evidence, parent_skill_id FROM sub_skills WHERE is_archived = 0'
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

  async getDueForReview(beforeTimestamp = null) {
    const db = await getDb();
    const ts = beforeTimestamp || now();
    return db.select(
      `SELECT ssm.*, ss.name as skill_name, ss.parent_skill_id
       FROM sub_skill_mastery ssm
       JOIN sub_skills ss ON ssm.sub_skill_id = ss.id
       WHERE ssm.next_review_at IS NOT NULL AND ssm.next_review_at <= ?
         AND ss.is_archived = 0
       ORDER BY ssm.next_review_at`, [ts]
    );
  },

  async upsert(subSkillId, { difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints }) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO sub_skill_mastery (sub_skill_id, difficulty, stability, retrievability, reps, lapses, last_review_at, next_review_at, total_mastery_points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sub_skill_id) DO UPDATE SET
         difficulty = excluded.difficulty,
         stability = excluded.stability,
         retrievability = excluded.retrievability,
         reps = excluded.reps,
         lapses = excluded.lapses,
         last_review_at = excluded.last_review_at,
         next_review_at = excluded.next_review_at,
         total_mastery_points = excluded.total_mastery_points,
         updated_at = excluded.updated_at`,
      [subSkillId, difficulty, stability, retrievability, reps, lapses, lastReviewAt, nextReviewAt, totalMasteryPoints, now()]
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
// Hard Reset
// ============================================================

export const resetAll = async ({ confirmed = false } = {}) => {
  if (!confirmed) throw new Error('resetAll requires explicit confirmation');
  const db = await getDb();

  // Count what we're about to destroy (for UI confirmation + logging)
  const counts = {};
  for (const table of ['courses', 'sub_skills', 'sub_skill_mastery', 'chunks', 'sessions']) {
    const rows = await db.select(`SELECT COUNT(*) as c FROM ${table}`);
    counts[table] = rows[0].c;
  }

  // Order matters for FK constraints
  const tables = [
    'assignment_question_skills', 'assignment_questions', 'assignments',
    'practice_sets', 'journal_entries', 'session_events', 'session_skills',
    'messages', 'sessions', 'sub_skill_mastery', 'skill_prerequisites',
    'concept_links', 'chunk_skill_bindings', 'chunk_fingerprints',
    'chunk_media', 'chunks', 'materials', 'course_assessments',
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


// ============================================================
// V1 COMPAT — Shims so existing App.jsx keeps working
//
// These map old v1 method signatures to v2 tables.
// They're intentionally imperfect — just enough to not crash.
// Remove as App.jsx is migrated to use v2 APIs directly.
// ============================================================

export const DB = {
  // V1_COMPAT: getCourses — returns courses with nested materials and chunks
  async getCourses() {
    const db = await getDb();
    const courses = await db.select('SELECT * FROM courses ORDER BY created_at DESC');
    for (const course of courses) {
      // Map v2 column names to v1 shape
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
  },

  // V1_COMPAT: saveCourses — upserts courses with nested materials and chunks
  async saveCourses(courses) {
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
  },

  // V1_COMPAT: saveDoc — stores chunk content
  async saveDoc(cid, chunkId, doc) {
    const db = await getDb();
    const content = typeof doc === 'string' ? doc : JSON.stringify(doc);
    await db.execute('UPDATE chunks SET content = ? WHERE id = ? AND course_id = ?', [content, chunkId, cid]);
    return true;
  },

  // V1_COMPAT: getDoc — retrieves chunk content
  async getDoc(cid, chunkId) {
    const db = await getDb();
    const rows = await db.select('SELECT content FROM chunks WHERE id = ? AND course_id = ?', [chunkId, cid]);
    if (rows.length > 0 && rows[0].content) {
      try { return JSON.parse(rows[0].content); } catch { return { content: rows[0].content }; }
    }
    return null;
  },

  // V1_COMPAT: chunk skills — getChunkSkills still used in App.jsx section panel
  async getChunkSkills(cid, chunkId) {
    const db = await getDb();
    const rows = await db.select(
      "SELECT value FROM settings WHERE key = ?", [`v1_chunk_skills:${cid}:${chunkId}`]
    );
    if (rows.length === 0) return null;
    return jsonParse(rows[0].value);
  },

  // V1_COMPAT: deleteChunk
  async deleteChunk(cid, chunkId) {
    const db = await getDb();
    await db.execute("DELETE FROM settings WHERE key = ?", [`v1_chunk_skills:${cid}:${chunkId}`]);
    await db.execute('DELETE FROM chunks WHERE id = ? AND course_id = ?', [chunkId, cid]);
    return true;
  },

  // V1_COMPAT: course-level data blobs (skills, taxonomy, validation, assignments)
  // Stored in settings table as key-value since v2 has no course_data table
  async _saveCourseData(cid, type, data) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [`v1_course_data:${cid}:${type}`, JSON.stringify(data)]
    );
    return true;
  },

  async _getCourseData(cid, type) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT value FROM settings WHERE key = ?', [`v1_course_data:${cid}:${type}`]
    );
    if (rows.length === 0) return null;
    return jsonParse(rows[0].value);
  },

  // saveSkills removed (v1 dead code)
  async getSkills(cid) { return this._getCourseData(cid, 'skills'); }, // used by migrate.js
  // saveRefTaxonomy, saveValidation, getValidation removed (v1 dead code)
  async getRefTaxonomy(cid) { return this._getCourseData(cid, 'reftax'); }, // used by App.jsx + migrate.js
  // saveAsgn, getAsgn removed — assignments now use Assignments module + 003 tables

  // V1_COMPAT: profile — mapped to settings blob
  async saveProfile(cid, p) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [`v1_profile:${cid}`, JSON.stringify(p)]
    );
    return true;
  },

  async getProfile(cid) {
    const db = await getDb();
    const rows = await db.select('SELECT value FROM settings WHERE key = ?', [`v1_profile:${cid}`]);
    if (rows.length > 0) return jsonParse(rows[0].value, { skills: {}, sessions: 0 });
    return { skills: {}, sessions: 0 };
  },

  // V1_COMPAT: chat — uses sessions under the hood
  async saveChat(cid, messages) {
    return withTransaction(async (db) => {
      // Find or create a compat session for this course
      let sessionId;
      const existing = await db.select(
        "SELECT value FROM settings WHERE key = ?", [`v1_chat_session:${cid}`]
      );
      if (existing.length > 0) {
        sessionId = existing[0].value;
      } else {
        sessionId = uuid();
        await db.execute(
          'INSERT INTO sessions (id, course_id, intent, status, started_at) VALUES (?, ?, \'explore\', \'active\', ?)',
          [sessionId, cid, now()]
        );
        await db.execute(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          [`v1_chat_session:${cid}`, sessionId]
        );
      }
      // Clear and rewrite messages
      await db.execute('DELETE FROM messages WHERE session_id = ?', [sessionId]);
      for (const msg of messages) {
        await db.execute(
          'INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
          [sessionId, msg.role, msg.content,
           JSON.stringify({ thinking: msg.thinking, skills: msg.skills }),
           now()]
        );
      }
      return true;
    });
  },

  async getChat(cid) {
    const db = await getDb();
    const existing = await db.select(
      "SELECT value FROM settings WHERE key = ?", [`v1_chat_session:${cid}`]
    );
    if (existing.length === 0) return [];
    const sessionId = existing[0].value;
    const rows = await db.select(
      'SELECT role, content, metadata FROM messages WHERE session_id = ? ORDER BY id', [sessionId]
    );
    return rows.map(r => {
      const meta = jsonParse(r.metadata, {});
      return { role: r.role, content: r.content, ...meta };
    });
  },

  // V1_COMPAT: journal — uses journal_entries with compat session
  async saveJournal(cid, entries) {
    return withTransaction(async (db) => {
      // Resolve session_id
      let sessionId;
      const existing = await db.select(
        "SELECT value FROM settings WHERE key = ?", [`v1_chat_session:${cid}`]
      );
      if (existing.length > 0) {
        sessionId = existing[0].value;
      } else {
        sessionId = uuid();
        await db.execute(
          'INSERT INTO sessions (id, course_id, intent, status, started_at) VALUES (?, ?, \'explore\', \'completed\', ?)',
          [sessionId, cid, now()]
        );
        await db.execute(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          [`v1_chat_session:${cid}`, sessionId]
        );
      }
      await db.execute(
        "DELETE FROM journal_entries WHERE course_id = ? AND intent = 'v1_compat'", [cid]
      );
      for (const entry of entries) {
        await db.execute(
          `INSERT INTO journal_entries (session_id, course_id, intent, entry_data, created_at)
           VALUES (?, ?, 'v1_compat', ?, ?)`,
          [sessionId, cid, JSON.stringify(entry), entry.timestamp || now()]
        );
      }
      return true;
    });
  },

  async getJournal(cid) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT entry_data FROM journal_entries WHERE course_id = ? ORDER BY id', [cid]
    );
    return rows.map(r => jsonParse(r.entry_data)).filter(Boolean);
  },

  // V1_COMPAT: practice sets
  async savePractice(cid, skillId, data) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [`v1_practice:${cid}:${skillId}`, JSON.stringify(data)]
    );
    return true;
  },

  async getPractice(cid, skillId) {
    const db = await getDb();
    const rows = await db.select(
      'SELECT value FROM settings WHERE key = ?', [`v1_practice:${cid}:${skillId}`]
    );
    if (rows.length === 0) return null;
    return jsonParse(rows[0].value);
  },

  // V1_COMPAT: deleteCourse
  async deleteCourse(cid) {
    const db = await getDb();
    // Clean up v1 compat keys from settings
    await db.execute("DELETE FROM settings WHERE key LIKE ?", [`v1_%:${cid}%`]);
    // CASCADE handles the rest
    await db.execute('DELETE FROM courses WHERE id = ?', [cid]);
    return true;
  },

  // V1_COMPAT: resetAll
  async resetAll() {
    return resetAll({ confirmed: true });
  },
};
