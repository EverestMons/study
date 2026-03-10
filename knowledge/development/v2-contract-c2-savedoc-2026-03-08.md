# Step C.2 — Replace DB.saveDoc / DB.getDoc Calls
**Date:** 2026-03-08
**Role:** Study Developer
**Build:** `npm run build` PASS (1.30s)

---

## Summary

Replaced all `DB.saveDoc` and `DB.getDoc` call sites with v2 module equivalents (`Chunks.updateContent`, `Chunks.getContent`). Removed `DB` from `skills.js` import entirely.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/StudyContext.jsx` | Added `Chunks` to import. 2× `DB.saveDoc(cid, chunkId, doc)` → `Chunks.updateContent(chunkId, ...)` |
| `src/lib/skills.js` | Removed `DB` from import. 2× `DB.getDoc` → `Chunks.getContent` with JSON unwrap. 3× comment updates. |

---

## Detail

### StudyContext.jsx — addFiles + addMaterials (lines 413, 1003)

```js
// Before:
await DB.saveDoc(courseId, pd.chunkId, pd.doc);
// After:
await Chunks.updateContent(pd.chunkId, typeof pd.doc === 'string' ? pd.doc : JSON.stringify(pd.doc));
```

Both call sites flush `_pendingDocs` from the v1 storeAsChunks path. The v2 storeAsChunks path stores content inline via `Chunks.createBatch` — no `_pendingDocs` needed.

### skills.js — getMatContent v1 fallback (line 145)

```js
// Before:
const doc = await DB.getDoc(courseId, ch.id);
const text = doc?.content || "";
// After:
const raw = await Chunks.getContent(ch.id);
let text = raw || '';
if (text.startsWith('{')) {
  try { const parsed = JSON.parse(text); if (parsed.content) text = parsed.content; } catch { /* ignored */ }
}
```

`DB.getDoc` returned parsed JSON (`{content: "..."}`) → `doc?.content`. `Chunks.getContent` returns raw string, so we need the same JSON-unwrap logic already used in the v2 path (line 122-128).

### skills.js — getMatContent legacy flat doc (line 153)

```js
// Before:
const doc = await DB.getDoc(courseId, mat.id);
if (!doc) return { content: "", chunks: [] };
// After:
const raw = await Chunks.getContent(mat.id);
if (!raw) return { content: "", chunks: [] };
let doc;
try { doc = JSON.parse(raw); } catch { return { content: raw, chunks: [...] }; }
```

Legacy path handles materials with no chunks. `Chunks.getContent` returns raw string; parse attempt handles both JSON-wrapped (`{content:..., chapters:...}`) and plain text content.

### skills.js — import cleanup

`DB` removed from import — zero `DB.*` calls remain in this file.

---

## Remaining DB.saveDoc / DB.getDoc

Zero call sites remain in application code.
