# study + forge — Tutor Phase 4 Blueprint: Forge Ingestion of Tutor Session Data
**Date:** 2026-03-24 | **Agent:** Study Systems Analyst | **Output Receipt:** Complete

---

## Overview

Three changes across two repositories. Study app writes a tutor session summary markdown file to `$APPDATA/tutor-sessions/` at session end. Forge gains a new `TUTOR_RESPONSE` chunk type, classification rule, and chunker. Forge's scanner gains an `EXTRA_SCAN_PATHS` config to discover files outside Git repos.

---

## Change 1 — capabilities/default.json (study)

Add `$APPDATA/tutor-sessions/**` to `fs:allow-write-file` and `fs:allow-mkdir`:

```json
{
  "identifier": "fs:allow-write-file",
  "allow": [
    { "path": "$APPDATA/images/**" },
    { "path": "$APPDATA/tmp/**" },
    { "path": "$APPDATA/tutor-sessions/**" }
  ]
},
{
  "identifier": "fs:allow-mkdir",
  "allow": [
    { "path": "$APPDATA/images/**" },
    { "path": "$APPDATA/tmp/**" },
    { "path": "$APPDATA/tutor-sessions/**" }
  ]
},
```

Also add to `fs:allow-read-file` (already `**` — no change needed) and `fs:allow-exists`:

```json
{
  "identifier": "fs:allow-exists",
  "allow": [
    { "path": "$APPDATA/images/**" },
    { "path": "$APPDATA/tmp/**" },
    { "path": "$APPDATA/tutor-sessions/**" }
  ]
},
```

---

## Change 2 — study.js `_updateTutorSessionSummary()` + StudyContext wiring

### 2a. New function in study.js

```javascript
export const _updateTutorSessionSummary = async (sessionEntry, courseId, sessionId) => {
  if (!sessionEntry || !sessionId) return;
  const { mkdir, writeTextFile, readTextFile } = await import('@tauri-apps/plugin-fs');
  const { appDataDir } = await import('@tauri-apps/api/path');

  const dataDir = await appDataDir();
  const dir = dataDir + 'tutor-sessions/';
  const filePath = dir + 'tutor-session-summary.md';

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Read existing content (empty string if file doesn't exist)
  var existing = '';
  try { existing = await readTextFile(filePath); } catch { /* file not found — start fresh */ }

  // Build new H2 section
  var date = new Date().toISOString().split('T')[0];
  var section = '\n## Session ' + sessionId + ' — ' + date + '\n\n';
  section += '**Course:** ' + courseId + '\n\n';

  if (sessionEntry.facetsAssessed) {
    section += '**Facets Practiced:** ' + sessionEntry.facetsAssessed + '\n\n';
  }
  if (sessionEntry.skillsUpdated && sessionEntry.skillsUpdated.length > 0) {
    section += '**Skills Updated:**\n';
    for (var su of sessionEntry.skillsUpdated) { section += '- ' + su + '\n'; }
    section += '\n';
  }
  if (sessionEntry.topicsDiscussed && sessionEntry.topicsDiscussed.length > 0) {
    section += '**Topics:** ' + sessionEntry.topicsDiscussed.slice(0, 8).join(', ') + '\n\n';
  }
  if (sessionEntry.masteryEvents && sessionEntry.masteryEvents.length > 0) {
    section += '**Mastery Events:**\n';
    for (var me of sessionEntry.masteryEvents) {
      section += '- ' + me.skillName + ' (Lv ' + me.levelBefore + '→' + me.levelAfter + ', ' + me.facetCount + ' facets)\n';
    }
    section += '\n';
  }
  if (sessionEntry.struggles && sessionEntry.struggles.length > 0) {
    section += '**Struggles:**\n';
    for (var st of sessionEntry.struggles) { section += '- "' + st.substring(0, 100) + '"\n'; }
    section += '\n';
  }
  section += '**Messages:** ' + sessionEntry.messageCount + '\n';

  // Append and write
  var updated = existing + section;
  await writeTextFile(filePath, updated);
};
```

**Pattern notes:**
- Lazy `import()` for `@tauri-apps/plugin-fs` and `@tauri-apps/api/path` — same pattern as imageStore.js
- `mkdir` with `recursive: true` before every write — handles first-run case
- `readTextFile` with try/catch for file-not-found — starts with empty string
- `writeTextFile` writes the full accumulated content (append by read + concat + write)
- Each H2 section is one Forge chunk boundary (`## Session {id} — {date}`)

**Location:** After `updateChunkEffectiveness` export in study.js.

### 2b. StudyContext.jsx wiring

In `saveSessionToJournal` (line 383), after the Phase 3 `updateChunkEffectiveness` call:

```javascript
const saveSessionToJournal = useCallback(async () => {
  if (!active || msgs.length <= sessionStartIdx.current + 1) return;
  try {
    const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
    if (!entry) return;
    await JournalEntries.create({ sessionId: chatSessionId.current, courseId: active.id, intent: 'v1_compat', entryData: entry });
    try { await updateChunkEffectiveness(chatSessionId.current); } catch { /* non-critical */ }
    try { await _updateTutorSessionSummary(entry, active.id, chatSessionId.current); } catch { /* non-critical */ }
    sessionStartIdx.current = msgs.length;
    sessionSkillLog.current = [];
  } catch (e) { console.error("Journal save failed:", e); }
}, [active, msgs]);
```

**Import:** Add `_updateTutorSessionSummary` to the study.js import in StudyContext.jsx (line 22).

---

## Change 3 — Forge config.py + scanner.py

### 3a. config.py — ChunkType enum

Add after `AGENT_TASK_CONSOLIDATION`:

```python
TUTOR_RESPONSE = "tutor_response"
```

### 3b. config.py — CLASSIFICATION_RULES

Add before the final knowledge subdirectory rules:

```python
("tutor-sessions/", ChunkType.TUTOR_RESPONSE),
```

Insert at position after `("validation-quality-summary.md", ...)` and before `("knowledge/architecture/", ...)`.

### 3c. config.py — EXTRA_SCAN_PATHS

**Architecture gap identified:** Forge's `discover_files()` only scans `project_dir / "knowledge" / KNOWLEDGE_SUBDIRS`. The `$APPDATA/tutor-sessions/` directory is NOT inside any Git repo — Forge has no mechanism to discover it.

**Solution:** Add a new config list for extra scan paths that live outside the standard project directory structure:

```python
# Extra scan paths outside standard project directories.
# These are absolute paths to directories containing .md files that
# should be scanned alongside project knowledge bases.
# On macOS, Tauri's AppData resolves to ~/Library/Application Support/{identifier}/
EXTRA_SCAN_PATHS: list[tuple[str, str, Path]] = [
    # (project_name, subdir_name, absolute_path)
    ("study", "tutor-sessions", Path.home() / "Library" / "Application Support" / "com.everestmons.study" / "tutor-sessions"),
]
```

**Tauri identifier:** `com.everestmons.study` (from `src-tauri/tauri.conf.json` line 5: `"identifier": "com.everestmons.study"`). On macOS, `$APPDATA` resolves to `~/Library/Application Support/{identifier}/`.

**Note for DEV:** The exact path should be verified at runtime. The one-time `console.log` in `_updateTutorSessionSummary` will confirm the actual path. If it differs, the Forge config must be updated accordingly.

### 3d. scanner.py — `_chunk_tutor_session(text)`

```python
def _chunk_tutor_session(text: str) -> list[dict]:
    """
    Split a tutor session summary on ## Session headers.
    Each H2 section is one session = one chunk.
    """
    return _chunk_knowledge_file(text, ChunkType.TUTOR_RESPONSE.value)
```

Uses the existing `_chunk_knowledge_file` helper which splits on H2 headers — same boundary as the markdown file's `## Session {id}` sections.

### 3e. scanner.py — `chunk_file()` dispatch

Add before the knowledge sub-type block:

```python
elif chunk_type == ChunkType.TUTOR_RESPONSE.value:
    return _chunk_tutor_session(text)
```

### 3f. scanner.py — `discover_files()` extension

Add after the agents directory scan (line ~76):

```python
# Scan extra paths (e.g., $APPDATA files for study tutor sessions)
for extra_project, extra_subdir, extra_path in EXTRA_SCAN_PATHS:
    if extra_project == project_name and extra_path.is_dir():
        for md_file in extra_path.rglob("*.md"):
            if md_file.name.startswith("."):
                continue
            file_path = str(md_file)
            files.append({
                "path": file_path,
                "project": project_name,
                "file_type": classify_file(file_path),
            })
```

This adds extra scan paths that are project-scoped but live outside the Git repo. The `classify_file` function uses path substring matching — `"tutor-sessions/"` in the absolute path will match the new classification rule.

---

## What Does NOT Change

- `generateSessionEntry()` — unchanged (entry object already has all needed fields)
- `updateChunkEffectiveness()` — unchanged
- `saveSessionToJournal` structure — unchanged (only adds one more try/catch line)
- Existing Forge scan paths — unchanged (extra paths are additive)
- No study migration needed
- No Forge migration needed (chunk_type is a text field, new values are just strings)

---

## Data Flow

```
Session End → saveSessionToJournal()
  ├─ JournalEntries.create() (existing — DB)
  ├─ updateChunkEffectiveness() (Phase 3 — DB)
  └─ _updateTutorSessionSummary() (Phase 4 — filesystem)
       └─ writes $APPDATA/tutor-sessions/tutor-session-summary.md
            └─ Forge scanner discovers via EXTRA_SCAN_PATHS
                 └─ classify_file() → "tutor_response"
                      └─ _chunk_tutor_session() → H2-split chunks
                           └─ Forge DB: pattern analysis, effectiveness insights
```
