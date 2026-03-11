# Architecture Blueprint: Stability Hardening V2 — Error Handling
**Date:** 2026-03-10
**Analyst:** Study Systems Analyst

---

## T1 — callClaude Error Pattern Improvements

### Problem

`callClaude` and `callClaudeStream` (api.js) return error strings (`"Error: ..."`) instead of throwing. Callers must string-check responses to detect failures. Of 12 call sites across 7 files, only 3 do this correctly. The rest either silently degrade or — in 2 critical cases — display error messages to the user as if they were AI responses.

### Current Pattern

```js
// api.js — callClaude returns error as a string
export const callClaude = async (system, messages, maxTokens, useHaiku = false) => {
  // ...
  catch (e) {
    return "Error: " + e.message;   // ← string, not throw
  }
};
```

### Fix: `isApiError` Helper

Add a helper function to api.js that callers can import:

```js
export const isApiError = (response) =>
  typeof response === 'string' && response.startsWith('Error:');
```

**Why not change to throwing?** Too many call sites (12) to refactor safely in a hardening pass. The helper is additive — no existing behavior changes.

---

## Call Site Audit (12 sites, 7 files)

### ROBUST — Explicit `"Error:"` prefix check (3 sites)

| # | File | Line | Function | Pattern |
|---|------|------|----------|---------|
| 1 | extraction.js | 703 | `extractChapter` | Checks prefix → throws → retry loop (up to MAX_RETRIES) |
| 2 | extraction.js | 987 | `enrichFromMaterial` | Checks prefix → marks chunk failed → returns issues array |
| 3 | conceptLinks.js | 82 | `buildConceptLinks` | Checks prefix → logs issue → continues loop |

**No changes needed.** These can optionally import `isApiError` for consistency but behavior is correct.

### PARTIAL — Relies on `extractJSON` returning null (7 sites)

| # | File | Line | Function | Current Behavior | Consequence |
|---|------|------|----------|------------------|-------------|
| 4 | study.js | 1095 | `generateProblems` | `extractJSON` fails → throws "Failed to parse" | Propagates ✓ but loses original error message |
| 5 | study.js | 1149 | `evaluateAnswer` | `extractJSON` fails → returns fallback `{passed:false}` | Graceful ✓ but no logging |
| 6 | skills.js | 234 | `verifyDocumentExtraction` | `extractJSON` fails → returns fallback status | Graceful ✓ but no logging |
| 7 | skills.js | 282 | `decomposeAssignments` | `extractJSON` fails → if-block skipped | Silent — assignments missing, no indication |
| 8 | syllabusParser.js | 191 | `parseSyllabus` | `extractJSON` fails → returns `{success:false}` | Graceful ✓ |
| 9 | extraction.js | 640 | `wireCrossChapterPrereqs` | `extractJSON` fails → returns empty links | Silent — prereqs missing, no indication |
| 10 | SkillsPanel.jsx | 161 | `reExamineSkill` | `extractJSON` fails → if-block skipped | Silent — no user feedback at all |

**Fix:** Add `isApiError` check before `extractJSON` at each site. Log API errors and surface user-facing feedback where appropriate.

### CRITICAL — Error displayed as AI response (2 sites)

| # | File | Line | Function | Current Behavior |
|---|------|------|----------|------------------|
| 11 | StudyContext.jsx | 927 | `bootSession` | `callClaudeStream` error string → stored as assistant message → rendered in chat |
| 12 | StudyContext.jsx | 973 | `sendMessage` | `callClaudeStream` error string → stored as assistant message → passed to `parseSkillUpdates` |

**These are the highest-priority fixes.** Users see raw error messages like `"Error: API 429: rate limit exceeded"` displayed as if the AI said them.

---

## Fix Design Per Call Site

### Priority 1 — Critical (display errors as AI messages)

**Site 11 — `bootSession` (StudyContext.jsx:927)**

```js
// BEFORE:
const response = await callClaudeStream(bootSystem, [...], (partial) => { ... });
setMsgs([...prev, { role: "assistant", content: response, ts: asstTs }]);

// AFTER:
const response = await callClaudeStream(bootSystem, [...], (partial) => { ... });
if (isApiError(response)) {
  addNotif("error", "Could not start session: " + response.slice(7));
  setMsgs(m => m.filter(x => x.ts !== asstTs));  // remove placeholder
  return;
}
setMsgs([...prev, { role: "assistant", content: response, ts: asstTs }]);
```

**Site 12 — `sendMessage` (StudyContext.jsx:973)**

```js
// BEFORE:
const response = await callClaudeStream(sysPrompt, chatMsgs, (partial) => { ... });
const updates = parseSkillUpdates(response);

// AFTER:
const response = await callClaudeStream(sysPrompt, chatMsgs, (partial) => { ... });
if (isApiError(response)) {
  addNotif("error", "Message failed: " + response.slice(7));
  setMsgs(m => m.filter(x => x.ts !== asstTs));  // remove placeholder
  return;
}
const updates = parseSkillUpdates(response);
```

### Priority 2 — Silent failures (no user feedback)

**Site 10 — `reExamineSkill` (SkillsPanel.jsx:161)**

```js
// AFTER: Add error check + user notification
const response = await callClaude(flagPrompt, [...], 4096);
if (isApiError(response)) {
  addNotif("error", "Could not re-examine skill: " + response.slice(7));
  return;
}
const parsed = extractJSON(response);
```

**Site 7 — `decomposeAssignments` (skills.js:282)**

```js
// AFTER: Log error for diagnostics
const response = await callClaude(asgnPrompt, [...], 16384, true);
if (isApiError(response)) {
  console.error("[decomposeAssignments] API error:", response);
  return { assignments: [] };
}
const asgn = extractJSON(response);
```

**Site 9 — `wireCrossChapterPrereqs` (extraction.js:640)**

```js
// AFTER: Log + return with issue tracked
const response = await callClaude(prompt, [...], 4096, true);
if (isApiError(response)) {
  console.error("[wireCrossChapterPrereqs] API error:", response);
  return { links: [], issues: [{ type: 'api_error', error: response }] };
}
const parsed = extractJSON(response);
```

### Priority 3 — Improve error message fidelity

**Site 4 — `generateProblems` (study.js:1095)**

```js
// AFTER: Surface original API error instead of generic parse failure
const response = await callClaude(prompt, [...], 8192);
if (isApiError(response)) throw new Error(response);
const parsed = extractJSON(response);
```

**Sites 5, 6, 8 — `evaluateAnswer`, `verifyDocumentExtraction`, `parseSyllabus`**

These already degrade gracefully. Add a `console.warn` for diagnostics:

```js
const response = await callClaude(...);
if (isApiError(response)) {
  console.warn("[functionName] API error:", response);
  // existing fallback path continues
}
```

---

## Summary

| Priority | Sites | Fix | Impact |
|----------|-------|-----|--------|
| **P1 Critical** | 11, 12 (StudyContext.jsx) | Check `isApiError` → notify + remove placeholder | Users no longer see raw errors as AI messages |
| **P2 Silent** | 7, 9, 10 (skills.js, extraction.js, SkillsPanel.jsx) | Check `isApiError` → log + notify where possible | Failures visible in console; SkillsPanel notifies user |
| **P3 Fidelity** | 4, 5, 6, 8 (study.js, skills.js, syllabusParser.js) | Check `isApiError` → preserve original error in logs | Better diagnostics when API fails |
| **No change** | 1, 2, 3 (extraction.js, conceptLinks.js) | Already robust | — |

### Files to Modify

| File | Change | ~Lines |
|------|--------|--------|
| `src/lib/api.js` | Add `isApiError` export | 2 |
| `src/StudyContext.jsx` | Import `isApiError`, add checks at lines 927, 973 | 12 |
| `src/components/study/SkillsPanel.jsx` | Import `isApiError`, add check at line 161 | 5 |
| `src/lib/study.js` | Import `isApiError`, add checks at lines 1095, 1149 | 6 |
| `src/lib/skills.js` | Import `isApiError`, add checks at lines 234, 282 | 6 |
| `src/lib/extraction.js` | Import `isApiError`, add check at line 640 | 4 |
| `src/lib/syllabusParser.js` | Import `isApiError`, add check at line 191 | 3 |

**Total: ~38 lines across 7 files**

### Implementation Order

1. **api.js** — add `isApiError` helper (everything else depends on this)
2. **StudyContext.jsx** — fix the 2 critical sites (P1)
3. **SkillsPanel.jsx** — fix silent failure (P2)
4. **extraction.js, skills.js** — fix silent failures (P2)
5. **study.js, syllabusParser.js** — improve fidelity (P3)
