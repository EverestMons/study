# QA Report: Stability Verification
**Date:** 2026-03-10
**Analyst:** Study Security & Testing Analyst

---

## Test Results: 3/3 PASS

### Test 1 — isApiError Helper + Call Site Audit
**PASS** — 9 call sites across 5 files, all protected

**Helper** (api.js:18-19):
```js
export const isApiError = (response) =>
  typeof response === 'string' && response.startsWith('Error:');
```

| # | File | Line | Function | Check | Error Handling |
|---|------|------|----------|-------|----------------|
| 1 | extraction.js | 641 | `wireCrossChapterPrereqs` | `isApiError(response)` | Returns `{ links: [], issues }` with `cross_chapter_api_error` |
| 2 | extraction.js | 714 | `extractChapter` | `isApiError(response)` | Throws → retry loop (up to MAX_RETRIES) |
| 3 | extraction.js | 997 | `enrichFromMaterial` | `isApiError(response)` | Marks chunks failed, returns issues array |
| 4 | study.js | 1096 | `generateProblems` | `isApiError(result)` | Throws original error message |
| 5 | study.js | 1153 | `evaluateAnswer` | `isApiError(result)` | Logs warning, returns `{passed:false}` fallback |
| 6 | skills.js | 235 | `verifyDocumentExtraction` | `isApiError(result)` | Logs warning, falls to existing fallback |
| 7 | skills.js | 286 | `decomposeAssignments` | `isApiError(result)` | Logs warning, returns early |
| 8 | conceptLinks.js | 84 | `buildConceptLinks` | `isApiError(response)` | Logs issue, continues loop |
| 9 | syllabusParser.js | 198 | `parseSyllabus` | `isApiError(result)` | Returns `{success:false, issues:[{type:'api_error'}]}` |

All 5 consumer files import `isApiError` from `./api.js`. No call site passes an error string to `extractJSON` or displays it as valid content.

---

### Test 2 — Database Backup Before resetAll
**PASS**

**`backupDatabase()`** (db.js:1862-1887):

| Check | Line | Status |
|-------|------|--------|
| Imports `appDataDir` from `@tauri-apps/api/path` | 1864 | PASS |
| Imports `copyFile`, `readDir`, `remove` from `@tauri-apps/plugin-fs` | 1865 | PASS |
| Backup filename: `study.db.backup.{ISO timestamp}` | 1868-1869 | PASS |
| Copies DB file to backup path | 1870 | PASS |
| Lists → sorts → deletes beyond 3 most recent | 1874-1883 | PASS |
| Entire function in try/catch, logs but doesn't throw | 1884-1886 | PASS |
| `resetAll` calls `await backupDatabase()` before DELETEs | 1895 | PASS |

**Tauri capabilities** (default.json:28-35):

| Permission | Scope | Status |
|------------|-------|--------|
| `fs:allow-copy-file` | `$APPDATA/*` | PASS |
| `fs:allow-remove` | `$APPDATA/study.db.backup.*` | PASS |

The `fs:allow-remove` scope is tightly restricted — can only delete backup files, nothing else.

---

### Test 3 — Stream Truncation Markers
**PASS** — All 4 truncation paths have visible indicators

| Path | File:Line | Marker Text |
|------|-----------|-------------|
| `callClaude` max_tokens | api.js:55-57 | `[Response may be incomplete — output limit reached]` |
| `callClaudeStream` 30s stall | api.js:116-117 | `[Response may be incomplete — connection timed out]` |
| `callClaudeStream` max_tokens | api.js:151-153 | `[Response may be incomplete — output limit reached]` |
| `callClaudeStream` 2-min abort | api.js:158-160 | `"Error: Request timed out. Please try again."` (handled by `isApiError`) |

**Downstream effects:**
- **Chat messages**: User sees `[Response may be incomplete ...]` appended to the response
- **JSON extraction**: Appended marker causes `extractJSON` to fail → returns `null` → callers hit their existing fallback/retry paths
- **No silent data loss**: Every truncation is visible to the user or triggers a graceful error path
