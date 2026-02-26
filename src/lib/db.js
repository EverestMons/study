// --- API Key Management ---
export const getApiKey = () => localStorage.getItem("study-api-key") || "";
export const setApiKey = (key) => localStorage.setItem("study-api-key", key);
export const hasApiKey = () => !!getApiKey();

// --- DB Layer (SQLite with localStorage fallback) ---
import Database from '@tauri-apps/plugin-sql';

let sqliteDb = null;
let usingSqlite = false;

const initSqlite = async () => {
  if (sqliteDb) return sqliteDb;
  try {
    sqliteDb = await Database.load('sqlite:study.db');
    usingSqlite = true;
    console.log('SQLite initialized');
    return sqliteDb;
  } catch (e) {
    console.warn('SQLite not available, using localStorage:', e.message);
    return null;
  }
};

// Initialize on load
initSqlite();

export const DB = {
  // Low-level helpers for localStorage fallback
  async _lsGet(k) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    } catch (e) {
      console.error("localStorage get failed for", k, e);
      return null;
    }
  },
  async _lsSet(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      console.error("localStorage set failed for", k, e);
      return false;
    }
  },
  async _lsDel(k) {
    try {
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  },

  // --- Courses ---
  async getCourses() {
    if (usingSqlite && sqliteDb) {
      try {
        const courses = await sqliteDb.select('SELECT * FROM courses ORDER BY created DESC');
        if (courses.length > 0) {
          for (const course of courses) {
            const mats = await sqliteDb.select('SELECT * FROM materials WHERE course_id = ?', [course.id]);
            for (const mat of mats) {
              // Map SQL column names back to JS field names
              mat.name = mat.name || mat.label;
              mat.type = mat.type || mat.file_type;
              mat.chunks = await sqliteDb.select(
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
        }
        // SQLite empty — check localStorage for migrateable data
      } catch (e) {
        console.error('SQLite getCourses failed:', e);
      }
    }
    // Fallback to localStorage
    const raw = (await this._lsGet("study-courses")) || [];
    return raw.map(c => ({
      ...c,
      id: c.id || "orphan-" + Date.now(),
      name: c.name || "Untitled Course",
      materials: Array.isArray(c.materials) ? c.materials : [],
      created: c.created || Date.now()
    }));
  },

  async saveCourses(courses) {
    if (usingSqlite && sqliteDb) {
      try {
        for (const course of courses) {
          await sqliteDb.execute(
            'INSERT OR REPLACE INTO courses (id, name, created, updated) VALUES (?, ?, ?, ?)',
            [course.id, course.name, course.created || course.createdAt, Date.now()]
          );
          for (const mat of (course.materials || [])) {
            await sqliteDb.execute(
              'INSERT OR REPLACE INTO materials (id, course_id, label, classification, file_type, active, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [mat.id, course.id, mat.name || mat.label, mat.classification, mat.type || mat.fileType, mat.active !== false ? 1 : 0, mat.created || Date.now()]
            );
            for (const ch of (mat.chunks || [])) {
              await sqliteDb.execute(
                'INSERT OR REPLACE INTO chunks (id, material_id, course_id, label, char_count, status, error_info, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [ch.id, mat.id, course.id, ch.label, ch.charCount || 0, ch.status || 'pending', ch.errorInfo ? JSON.stringify(ch.errorInfo) : null, ch.failCount || 0]
              );
            }
          }
        }
        // Also save to localStorage as backup
        await this._lsSet("study-courses", courses);
        return true;
      } catch (e) {
        console.error('SQLite saveCourses failed:', e);
      }
    }
    return await this._lsSet("study-courses", courses);
  },

  // --- Documents (chunk content) ---
  async saveDoc(cid, chunkId, doc) {
    // Always save to localStorage (reliable, chunk row may not exist in SQLite yet)
    await this._lsSet("study-doc:" + cid + ":" + chunkId, doc);
    if (usingSqlite && sqliteDb) {
      try {
        const content = typeof doc === 'string' ? doc : JSON.stringify(doc);
        var result = await sqliteDb.execute('UPDATE chunks SET content = ? WHERE id = ? AND course_id = ?', [content, chunkId, cid]);
        // If chunk row doesn't exist yet (created later by saveCourses), UPDATE affects 0 rows — localStorage has it
      } catch (e) {
        console.error('SQLite saveDoc failed:', e);
      }
    }
    return true;
  },

  async getDoc(cid, chunkId) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT content FROM chunks WHERE id = ? AND course_id = ?', [chunkId, cid]);
        if (rows.length > 0 && rows[0].content) {
          try {
            return JSON.parse(rows[0].content);
          } catch {
            return { content: rows[0].content };
          }
        }
        // SQLite has no content — fall through to localStorage
      } catch (e) {
        console.error('SQLite getDoc failed:', e);
      }
    }
    return await this._lsGet("study-doc:" + cid + ":" + chunkId);
  },

  // --- Chunk-level skills ---
  async saveChunkSkills(cid, chunkId, skills) {
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute('DELETE FROM chunk_skills WHERE chunk_id = ? AND course_id = ?', [chunkId, cid]);
        await sqliteDb.execute(
          'INSERT INTO chunk_skills (chunk_id, course_id, skill_data) VALUES (?, ?, ?)',
          [chunkId, cid, JSON.stringify(skills)]
        );
        return true;
      } catch (e) {
        console.error('SQLite saveChunkSkills failed:', e);
      }
    }
    return await this._lsSet("study-cskills:" + cid + ":" + chunkId, skills);
  },

  async getChunkSkills(cid, chunkId) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT skill_data FROM chunk_skills WHERE chunk_id = ? AND course_id = ?', [chunkId, cid]);
        return rows.length > 0 ? JSON.parse(rows[0].skill_data) : null;
      } catch (e) {
        console.error('SQLite getChunkSkills failed:', e);
      }
    }
    return await this._lsGet("study-cskills:" + cid + ":" + chunkId);
  },

  // --- Course-level data (skills, taxonomy, validation, assignments) ---
  async _saveCourseData(cid, type, data) {
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute(
          'INSERT OR REPLACE INTO course_data (course_id, data_type, data, updated) VALUES (?, ?, ?, ?)',
          [cid, type, JSON.stringify(data), Date.now()]
        );
        return true;
      } catch (e) {
        console.error('SQLite _saveCourseData failed:', e);
      }
    }
    return await this._lsSet("study-" + type + ":" + cid, data);
  },

  async _getCourseData(cid, type) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT data FROM course_data WHERE course_id = ? AND data_type = ?', [cid, type]);
        return rows.length > 0 ? JSON.parse(rows[0].data) : null;
      } catch (e) {
        console.error('SQLite _getCourseData failed:', e);
      }
    }
    return await this._lsGet("study-" + type + ":" + cid);
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
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute(
          'INSERT OR REPLACE INTO profiles (course_id, skills, sessions, updated) VALUES (?, ?, ?, ?)',
          [cid, JSON.stringify(p.skills || {}), p.sessions || 0, Date.now()]
        );
        return true;
      } catch (e) {
        console.error('SQLite saveProfile failed:', e);
      }
    }
    return await this._lsSet("study-profile:" + cid, p);
  },

  async getProfile(cid) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT skills, sessions FROM profiles WHERE course_id = ?', [cid]);
        if (rows.length > 0) {
          return { skills: JSON.parse(rows[0].skills), sessions: rows[0].sessions };
        }
        return { skills: {}, sessions: 0 };
      } catch (e) {
        console.error('SQLite getProfile failed:', e);
      }
    }
    return (await this._lsGet("study-profile:" + cid)) || { skills: {}, sessions: 0 };
  },

  // --- Chat ---
  async saveChat(cid, messages) {
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute('DELETE FROM messages WHERE course_id = ?', [cid]);
        for (const msg of messages) {
          await sqliteDb.execute(
            'INSERT INTO messages (course_id, role, content, metadata, created) VALUES (?, ?, ?, ?, ?)',
            [cid, msg.role, msg.content, JSON.stringify({ thinking: msg.thinking, skills: msg.skills }), Date.now()]
          );
        }
        return true;
      } catch (e) {
        console.error('SQLite saveChat failed:', e);
      }
    }
    return await this._lsSet("study-chat:" + cid, messages);
  },

  async getChat(cid) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT role, content, metadata FROM messages WHERE course_id = ? ORDER BY id', [cid]);
        return rows.map(r => {
          const meta = JSON.parse(r.metadata || '{}');
          return { role: r.role, content: r.content, ...meta };
        });
      } catch (e) {
        console.error('SQLite getChat failed:', e);
      }
    }
    return (await this._lsGet("study-chat:" + cid)) || [];
  },

  // --- Journal ---
  async saveJournal(cid, entries) {
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute('DELETE FROM journal_entries WHERE course_id = ?', [cid]);
        for (const entry of entries) {
          await sqliteDb.execute(
            'INSERT INTO journal_entries (course_id, entry_data, created) VALUES (?, ?, ?)',
            [cid, JSON.stringify(entry), entry.timestamp || Date.now()]
          );
        }
        return true;
      } catch (e) {
        console.error('SQLite saveJournal failed:', e);
      }
    }
    return await this._lsSet("study-journal:" + cid, entries);
  },

  async getJournal(cid) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT entry_data FROM journal_entries WHERE course_id = ? ORDER BY id', [cid]);
        return rows.map(r => JSON.parse(r.entry_data));
      } catch (e) {
        console.error('SQLite getJournal failed:', e);
      }
    }
    return (await this._lsGet("study-journal:" + cid)) || [];
  },

  // --- Practice Sets ---
  async savePractice(cid, skillId, data) {
    if (usingSqlite && sqliteDb) {
      try {
        await sqliteDb.execute(
          'INSERT OR REPLACE INTO practice_sets (course_id, skill_id, data, updated) VALUES (?, ?, ?, ?)',
          [cid, skillId, JSON.stringify(data), Date.now()]
        );
        return true;
      } catch (e) {
        console.error('SQLite savePractice failed:', e);
      }
    }
    return await this._lsSet("study-practice:" + cid + ":" + skillId, data);
  },

  async getPractice(cid, skillId) {
    if (usingSqlite && sqliteDb) {
      try {
        const rows = await sqliteDb.select('SELECT data FROM practice_sets WHERE course_id = ? AND skill_id = ?', [cid, skillId]);
        return rows.length > 0 ? JSON.parse(rows[0].data) : null;
      } catch (e) {
        console.error('SQLite getPractice failed:', e);
      }
    }
    return await this._lsGet("study-practice:" + cid + ":" + skillId);
  },

  // --- Delete Course ---
  async deleteCourse(cid, materials = []) {
    if (usingSqlite && sqliteDb) {
      try {
        // CASCADE should handle most of this, but be explicit
        await sqliteDb.execute('DELETE FROM practice_sets WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM journal_entries WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM messages WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM profiles WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM course_data WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM chunk_skills WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM chunks WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM materials WHERE course_id = ?', [cid]);
        await sqliteDb.execute('DELETE FROM courses WHERE id = ?', [cid]);
        return true;
      } catch (e) {
        console.error('SQLite deleteCourse failed:', e);
      }
    }
    // Fallback localStorage cleanup
    for (const mat of materials) {
      if (mat.chunks) {
        for (const ch of mat.chunks) {
          await this._lsDel("study-doc:" + cid + ":" + ch.id);
          await this._lsDel("study-cskills:" + cid + ":" + ch.id);
        }
      }
      await this._lsDel("study-doc:" + cid + ":" + mat.id);
    }
    await this._lsDel("study-skills:" + cid);
    await this._lsDel("study-reftax:" + cid);
    await this._lsDel("study-valid:" + cid);
    await this._lsDel("study-asgn:" + cid);
    await this._lsDel("study-profile:" + cid);
    await this._lsDel("study-chat:" + cid);
    await this._lsDel("study-journal:" + cid);
    try {
      const prefix = "study-practice:" + cid + ":";
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) await this._lsDel(key);
      }
    } catch (e) { /* non-critical */ }
  }
};
