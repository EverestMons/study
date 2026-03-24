# study — Tutor Phase 4 Diagnostic: Prerequisite Audit
**Date:** 2026-03-24 | **Agent:** Study Developer | **Output Receipt:** Complete

---

## Finding 1: `@tauri-apps/plugin-fs` Permissions

**Source:** `src-tauri/capabilities/default.json`

### Configured permissions:

| Permission | Allowed Paths |
|---|---|
| `fs:allow-read-dir` | `**` (unrestricted) |
| `fs:allow-read-file` | `**` (unrestricted) |
| `fs:allow-copy-file` | `$APPDATA/*` |
| `fs:allow-write-file` | `$APPDATA/images/**`, `$APPDATA/tmp/**` |
| `fs:allow-mkdir` | `$APPDATA/images/**`, `$APPDATA/tmp/**` |
| `fs:allow-exists` | `$APPDATA/images/**`, `$APPDATA/tmp/**` |
| `fs:allow-remove` | `$APPDATA/study.db.backup.*`, `$APPDATA/images/**`, `$APPDATA/tmp/**` |

### Write capability analysis:

- **`fs:allow-write-file` is sandboxed** — only permits writes to `$APPDATA/images/**` and `$APPDATA/tmp/**`
- **Cannot write to arbitrary absolute paths** — no `$DOCUMENT`, `$RESOURCE`, or `**` write permission
- **Cannot write to the project/knowledge directory** — the knowledge base is on the filesystem at a user-specified path (not under `$APPDATA`)
- **To write a tutor session summary file to `knowledge/research/`**, the capability would need to be expanded. Options:
  - Add `{ "path": "$APPDATA/tutor-sessions/**" }` to `fs:allow-write-file` and `fs:allow-mkdir` — keeps it sandboxed under APPDATA
  - Add a broader write permission for the project directory — breaks sandboxing
  - Use the existing `$APPDATA/tmp/**` path as a staging area and move via a different mechanism

### Existing `@tauri-apps/plugin-fs` usage in codebase:

| File | Usage |
|---|---|
| `src/lib/imageStore.js` | `writeFile`, `mkdir`, `exists`, `remove` — writes to `$APPDATA/images/` |
| `src/lib/imageExtractor.js` | `writeFile`, `remove`, `exists`, `mkdir`, `readFile` — writes to `$APPDATA/tmp/` |
| `src/lib/db.js` | `copyFile`, `readDir`, `remove` — database backup operations |
| `src/lib/folderImport.js` | `readDir`, `readFile` — reads user-selected directories |

**No existing code writes to `knowledge/` or any project-relative directory.** All writes go to `$APPDATA`.

---

## Finding 2: `generateSessionEntry()` and Session End Handler

### `generateSessionEntry()` signature (study.js line 1731):

```javascript
export const generateSessionEntry = (messages, startIdx, skillUpdatesLog, masteryEventsLog, facetUpdatesLog) => {
```

5 parameters: `messages`, `startIdx`, `skillUpdatesLog`, `masteryEventsLog`, `facetUpdatesLog`. Returns a journal entry object or null.

### Session end handler (`saveSessionToJournal` in StudyContext.jsx lines 383-393):

```javascript
const saveSessionToJournal = useCallback(async () => {
  if (!active || msgs.length <= sessionStartIdx.current + 1) return;
  try {
    const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
    if (!entry) return;
    await JournalEntries.create({ sessionId: chatSessionId.current, courseId: active.id, intent: 'v1_compat', entryData: entry });
    try { await updateChunkEffectiveness(chatSessionId.current); } catch { /* non-critical */ }
    sessionStartIdx.current = msgs.length;
    sessionSkillLog.current = [];
  } catch (e) { console.error("Journal save failed:", e); }
}, [active, msgs]);
```

**Key observations:**
- `updateChunkEffectiveness(chatSessionId.current)` was added in Phase 3 at line 389
- `chatSessionId.current` is the active session ID (available in this scope)
- `active.id` is the course ID (also available)
- The `generateSessionEntry` call here only passes 3 of 5 params (masteryEventsLog and facetUpdatesLog omitted)
- This is the canonical single convergence point for all session-end paths

### Other `generateSessionEntry` call sites:

| Location | Context |
|---|---|
| StudyScreen.jsx line 51 | `handleExitSession` — passes all 5 params for session summary display |
| StudyContext.jsx line 927 | `enterStudy` — stale session capture with 3 params (empty skillUpdatesLog) |

---

## Finding 3: `@tauri-apps/plugin-fs` Dependency

**Source:** `package.json` line 31

```json
"@tauri-apps/plugin-fs": "^2.4.5",
```

Confirmed: dependency present and available for import.

---

## Finding 4: Forge `ChunkType` Enum and `CLASSIFICATION_RULES`

**Source:** `forge/src/config.py`

### ChunkType enum (18 types):

| Value | Name |
|---|---|
| `feedback_entry` | FEEDBACK_ENTRY |
| `feedback_pattern` | FEEDBACK_PATTERN |
| `decision_step` | DECISION_STEP |
| `diagnostic_step` | DIAGNOSTIC_STEP |
| `knowledge_deposit` | KNOWLEDGE_DEPOSIT |
| `governance_rule` | GOVERNANCE_RULE |
| `agent_definition` | AGENT_DEFINITION |
| `copilot_extraction` | COPILOT_EXTRACTION |
| `validation_quality` | VALIDATION_QUALITY |
| `architecture_blueprint` | ARCHITECTURE_BLUEPRINT |
| `dev_log` | DEV_LOG |
| `qa_report` | QA_REPORT |
| `design_spec` | DESIGN_SPEC |
| `agent_task_dev` | AGENT_TASK_DEV |
| `agent_task_qa` | AGENT_TASK_QA |
| `agent_task_sa` | AGENT_TASK_SA |
| `agent_task_uxd` | AGENT_TASK_UXD |
| `agent_task_doc` | AGENT_TASK_DOC |
| `agent_task_consolidation` | AGENT_TASK_CONSOLIDATION |

### CLASSIFICATION_RULES (13 rules, first-match wins):

```python
CLASSIFICATION_RULES: list[tuple[str, ChunkType]] = [
    ("agents/", ChunkType.AGENT_DEFINITION),
    ("agent-prompt-feedback.md", ChunkType.FEEDBACK_ENTRY),
    ("decisions/Done/diagnostic-", ChunkType.DIAGNOSTIC_STEP),
    ("decisions/diagnostic-", ChunkType.DIAGNOSTIC_STEP),
    ("decisions/Done/", ChunkType.DECISION_STEP),
    ("decisions/", ChunkType.DECISION_STEP),
    ("copilot-extraction-quality.md", ChunkType.COPILOT_EXTRACTION),
    ("validation-quality-summary.md", ChunkType.VALIDATION_QUALITY),
    ("knowledge/architecture/", ChunkType.ARCHITECTURE_BLUEPRINT),
    ("knowledge/development/", ChunkType.DEV_LOG),
    ("knowledge/qa/", ChunkType.QA_REPORT),
    ("knowledge/design/", ChunkType.DESIGN_SPEC),
]
```

**No `tutor_response` or `tutor_session` ChunkType exists.** No classification rule matches `knowledge/research/` or any tutor session file pattern.

### Knowledge subdirs scanned:

```python
KNOWLEDGE_SUBDIRS = ["architecture", "decisions", "design", "development", "qa", "research"]
```

`research` IS in the scan list — files placed there would be scanned, but would fall through all classification rules (no match) and likely be classified as a generic `KNOWLEDGE_DEPOSIT` fallback or skipped.

---

## Summary of Key Findings

| Item | Status | Implications for Phase 4 |
|---|---|---|
| `fs:allow-write-file` | Sandboxed to `$APPDATA/images/**` + `$APPDATA/tmp/**` | Cannot write to `knowledge/research/`. Need new capability path (e.g., `$APPDATA/tutor-sessions/**`) or expand permissions. |
| `@tauri-apps/plugin-fs` | Dependency present (^2.4.5) | Available for import. Existing pattern: lazy `import()` inside functions. |
| `generateSessionEntry()` | 5 params, returns journal entry object | Available data at session end: messages, skill updates, mastery events, facet updates. |
| Session end convergence | `saveSessionToJournal` in StudyContext.jsx | Phase 3's `updateChunkEffectiveness` already wired here. Phase 4 write would go in same location. |
| Forge `ChunkType` | 18 types, no `tutor_response` | New enum value needed. |
| Forge `CLASSIFICATION_RULES` | 13 rules, no tutor session pattern | New rule needed (e.g., `("tutor-sessions/", ChunkType.TUTOR_RESPONSE)`). |
| `knowledge/research/` scanning | In KNOWLEDGE_SUBDIRS list | Files placed under `knowledge/research/tutor-sessions/` would be scanned by Forge. But classification would miss without a new rule. |
| Write path architecture | All existing writes go to `$APPDATA` | The roadmap's plan to write to `knowledge/research/` conflicts with the current sandbox model. Alternative: write to `$APPDATA/tutor-sessions/` and add that path to Forge's scan config. |
