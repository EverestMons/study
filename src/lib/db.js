// --- DB Layer (SQLite only) ---
import Database from '@tauri-apps/plugin-sql';

let sqliteDb = null;

const initSqlite = async () => {
  if (sqliteDb) return sqliteDb;
  sqliteDb = await Database.load('sqlite:study.db');
  console.log('SQLite initialized');
  return sqliteDb;
};

// Initialize on load
const dbReady = initSqlite();

// Helper to ensure DB is ready before any operation
const getDb = async () => {
  await dbReady;
  if (!sqliteDb) throw new Error('SQLite failed to initialize');
  return sqliteDb;
};

// --- API Key Management (async, stored in settings table) ---
export const getApiKey = async () => {
  const db = await getDb();
  const rows = await db.select("SELECT value FROM settings WHERE key = 'api_key'");
  return rows.length > 0 ? rows[0].value : "";
};

export const setApiKey = async (key) => {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)",
    [key]
  );
};

export const hasApiKey = async () => {
  const key = await getApiKey();
  return !!key;
};

export const DB = {
  // --- Courses ---
  async getCourses() {
    const db = await getDb();
    const courses = await db.select('SELECT * FROM courses ORDER BY created DESC');
    for (const course of courses) {
      const mats = await db.select('SELECT * FROM materials WHERE course_id = ?', [course.id]);
      for (const mat of mats) {
        mat.name = mat.name || mat.label;
        mat.type = mat.type || mat.file_type;
        mat.chunks = await db.select(
          'SELECT id, label, char_count as charCount, status, error_info as errorInfo, fail_count as failCount FROM chunks WHERE material_id = ?',
          [mat.id]
        );
        mat.chunks = mat.chunks.map(ch => ({
          ...ch,
          errorInfo: ch.errorInfo ? JSON.parse(ch.errorInfo) : null
        }));
      }
      course.materials = mats;
    }
    return courses;
  },

  async saveCourses(courses) {
    const db = await getDb();
    for (const course of courses) {
      await db.execute(
        'INSERT OR REPLACE INTO courses (id, name, created, updated) VALUES (?, ?, ?, ?)',
        [course.id, course.name, course.created || course.createdAt, Date.now()]
      );
      for (const mat of (course.materials || [])) {
        await db.execute(
          'INSERT OR REPLACE INTO materials (id, course_id, label, classification, file_type, active, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [mat.id, course.id, mat.name || mat.label, mat.classification, mat.type || mat.fileType, mat.active !== false ? 1 : 0, mat.created || Date.now()]
        );
        for (const ch of (mat.chunks || [])) {
          await db.execute(
            'INSERT OR REPLACE INTO chunks (id, material_id, course_id, label, char_count, status, error_info, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [ch.id, mat.id, course.id, ch.label, ch.charCount || 0, ch.status || 'pending', ch.errorInfo ? JSON.stringify(ch.errorInfo) : null, ch.failCount || 0]
          );
        }
      }
    }
    return true;
  },

  // --- Documents (chunk content) ---
  async saveDoc(cid, chunkId, doc) {
    const db = await getDb();
    const content = typeof doc === 'string' ? doc : JSON.stringify(doc);
    // Try UPDATE first (chunk row may already exist)
    const result = await db.execute('UPDATE chunks SET content = ? WHERE id = ? AND course_id = ?', [content, chunkId, cid]);
    // If no row matched, INSERT a placeholder chunk so content isn't lost
    if (result.rowsAffected === 0) {
      await db.execute(
        'INSERT OR IGNORE INTO chunks (id, material_id, course_id, label, content, char_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [chunkId, '', cid, '', content, content.length, 'pending']
      );
    }
    return true;
  },

  async getDoc(cid, chunkId) {
    const db = await getDb();
    const rows = await db.select('SELECT content FROM chunks WHERE id = ? AND course_id = ?', [chunkId, cid]);
    if (rows.length > 0 && rows[0].content) {
      try {
        return JSON.parse(rows[0].content);
      } catch {
        return { content: rows[0].content };
      }
    }
    return null;
  },

  // --- Chunk-level skills ---
  async saveChunkSkills(cid, chunkId, skills) {
    const db = await getDb();
    await db.execute('DELETE FROM chunk_skills WHERE chunk_id = ? AND course_id = ?', [chunkId, cid]);
    await db.execute(
      'INSERT INTO chunk_skills (chunk_id, course_id, skill_data) VALUES (?, ?, ?)',
      [chunkId, cid, JSON.stringify(skills)]
    );
    return true;
  },

  async getChunkSkills(cid, chunkId) {
    const db = await getDb();
    const rows = await db.select('SELECT skill_data FROM chunk_skills WHERE chunk_id = ? AND course_id = ?', [chunkId, cid]);
    return rows.length > 0 ? JSON.parse(rows[0].skill_data) : null;
  },

  // --- Course-level data (skills, taxonomy, validation, assignments) ---
  async _saveCourseData(cid, type, data) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO course_data (course_id, data_type, data, updated) VALUES (?, ?, ?, ?)',
      [cid, type, JSON.stringify(data), Date.now()]
    );
    return true;
  },

  async _getCourseData(cid, type) {
    const db = await getDb();
    const rows = await db.select('SELECT data FROM course_data WHERE course_id = ? AND data_type = ?', [cid, type]);
    return rows.length > 0 ? JSON.parse(rows[0].data) : null;
  },

  async saveSkills(cid, s) { return await this._saveCourseData(cid, 'skills', s); },
  async getSkills(cid) { return await this._getCourseData(cid, 'skills'); },

  async saveRefTaxonomy(cid, t) { return await this._saveCourseData(cid, 'reftax', t); },
  async getRefTaxonomy(cid) { return await this._getCourseData(cid, 'reftax'); },

  async saveValidation(cid, v) { return await this._saveCourseData(cid, 'valid', v); },
  async getValidation(cid) { return await this._getCourseData(cid, 'valid'); },

  async saveAsgn(cid, a) { return await this._saveCourseData(cid, 'asgn', a); },
  async getAsgn(cid) { return await this._getCourseData(cid, 'asgn'); },

  // --- Profile ---
  async saveProfile(cid, p) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO profiles (course_id, skills, sessions, updated) VALUES (?, ?, ?, ?)',
      [cid, JSON.stringify(p.skills || {}), p.sessions || 0, Date.now()]
    );
    return true;
  },

  async getProfile(cid) {
    const db = await getDb();
    const rows = await db.select('SELECT skills, sessions FROM profiles WHERE course_id = ?', [cid]);
    if (rows.length > 0) {
      return { skills: JSON.parse(rows[0].skills), sessions: rows[0].sessions };
    }
    return { skills: {}, sessions: 0 };
  },

  // --- Chat ---
  async saveChat(cid, messages) {
    const db = await getDb();
    await db.execute('DELETE FROM messages WHERE course_id = ?', [cid]);
    for (const msg of messages) {
      await db.execute(
        'INSERT INTO messages (course_id, role, content, metadata, created) VALUES (?, ?, ?, ?, ?)',
        [cid, msg.role, msg.content, JSON.stringify({ thinking: msg.thinking, skills: msg.skills }), Date.now()]
      );
    }
    return true;
  },

  async getChat(cid) {
    const db = await getDb();
    const rows = await db.select('SELECT role, content, metadata FROM messages WHERE course_id = ? ORDER BY id', [cid]);
    return rows.map(r => {
      const meta = JSON.parse(r.metadata || '{}');
      return { role: r.role, content: r.content, ...meta };
    });
  },

  // --- Journal ---
  async saveJournal(cid, entries) {
    const db = await getDb();
    await db.execute('DELETE FROM journal_entries WHERE course_id = ?', [cid]);
    for (const entry of entries) {
      await db.execute(
        'INSERT INTO journal_entries (course_id, entry_data, created) VALUES (?, ?, ?)',
        [cid, JSON.stringify(entry), entry.timestamp || Date.now()]
      );
    }
    return true;
  },

  async getJournal(cid) {
    const db = await getDb();
    const rows = await db.select('SELECT entry_data FROM journal_entries WHERE course_id = ? ORDER BY id', [cid]);
    return rows.map(r => JSON.parse(r.entry_data));
  },

  // --- Practice Sets ---
  async savePractice(cid, skillId, data) {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO practice_sets (course_id, skill_id, data, updated) VALUES (?, ?, ?, ?)',
      [cid, skillId, JSON.stringify(data), Date.now()]
    );
    return true;
  },

  async getPractice(cid, skillId) {
    const db = await getDb();
    const rows = await db.select('SELECT data FROM practice_sets WHERE course_id = ? AND skill_id = ?', [cid, skillId]);
    return rows.length > 0 ? JSON.parse(rows[0].data) : null;
  },

  // --- Delete Course ---
  async deleteCourse(cid) {
    const db = await getDb();
    // CASCADE should handle most, but be explicit
    await db.execute('DELETE FROM practice_sets WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM journal_entries WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM messages WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM profiles WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM course_data WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM chunk_skills WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM chunks WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM materials WHERE course_id = ?', [cid]);
    await db.execute('DELETE FROM courses WHERE id = ?', [cid]);
    return true;
  },

  // --- Hard Reset (drop all data) ---
  async resetAll() {
    const db = await getDb();
    await db.execute('DELETE FROM practice_sets');
    await db.execute('DELETE FROM journal_entries');
    await db.execute('DELETE FROM messages');
    await db.execute('DELETE FROM profiles');
    await db.execute('DELETE FROM course_data');
    await db.execute('DELETE FROM chunk_skills');
    await db.execute('DELETE FROM chunks');
    await db.execute('DELETE FROM materials');
    await db.execute('DELETE FROM courses');
    await db.execute('DELETE FROM settings');
    return true;
  }
};
