# Near-Duplicate Detection UX

**Date:** 2026-03-10
**Status:** Design spec — ready for DEV handoff
**Escalated to CEO:** Visual treatment (amber vs yellow tint, card vs inline, icon choice)

---

## Context

When a user uploads a file that MinHash identifies as a near-duplicate of existing course material, the system must pause extraction and let the user decide. This happens inside the GlobalLockOverlay during the auto-extraction phase, so the prompt must integrate into that blocking processing flow.

## Trigger

`runExtractionV2` returns `{ needsUserDecision: true, nearDuplicates: [...] }`. The caller in StudyContext (both `createCourse` and `addMats` extraction loops) pauses to surface the choice.

## Where It Appears

**Inside the GlobalLockOverlay.** The overlay is already visible during extraction (full-screen, dark backdrop, centered card). The near-dedup prompt replaces the spinner content within that same card — no new modal layer, no separate component.

This means the user sees: processing spinner → near-dedup prompt → (user picks) → processing resumes or skips. Same overlay, just swapped content.

## What It Shows

### Single-material match (most common)

When all matching chunks point to one existing material:

```
┌─────────────────────────────────────────────┐
│                                             │
│  ⚠  Similar content detected               │
│                                             │
│  "Lecture 5 Notes v2.docx" looks like       │
│  a revision of "Lecture 5 Notes.docx"       │
│                                             │
│  8 of 8 sections match (87% avg similarity) │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  Skip — same    │  │  Extract anyway  │  │
│  │  material       │  │                  │  │
│  └─────────────────┘  └──────────────────┘  │
│                                             │
│  Skip inherits existing skills.             │
│                                             │
└─────────────────────────────────────────────┘
```

### Partial overlap

When only some chunks match:

```
  ⚠  Partial overlap detected

  3 of 12 sections in "Chapter Review.pdf"
  overlap with "Midterm Study Guide.docx"

  [ Skip overlapping ]  [ Extract all ]
```

### Multi-material match (rare)

When chunks match against different existing materials, group by material:

```
  ⚠  Similar content detected

  "Final Review.pdf" overlaps with:
  • "Midterm Notes.docx" — 4 sections (82%)
  • "Lecture 8.epub" — 2 sections (74%)

  6 of 10 sections match existing content.

  [ Skip matching ]  [ Extract all ]
```

## Data Flow

### 1. Enrich `nearDuplicates` with material names

Currently `runExtractionV2` returns `nearDuplicates: [{ newChunkId, existingChunkId, similarity }]`. To show material names, resolve `existingChunkId` → chunk row → `material_id` → material `label`.

**Option A (recommended):** Do the resolution in `runExtractionV2` before returning. Add a `Chunks.getById` lookup for each unique `existingChunkId`, then `Materials.getById` for each unique `material_id`. Return enriched shape:

```js
{
  needsUserDecision: true,
  nearDuplicates: [...],   // raw matches (keep for debug)
  dupSummary: {
    // Grouped by existing material
    materials: [
      {
        materialId: "abc",
        materialName: "Lecture 5 Notes.docx",
        matchingChunks: 8,    // how many new chunks match this material
        totalNewChunks: 8,    // total chunks in new material
        avgSimilarity: 0.87,  // average across matching pairs
      }
    ],
    totalMatching: 8,
    totalNew: 8,
  }
}
```

**Option B:** Do it in StudyContext after receiving the result. Downside: StudyContext already has `active.materials` loaded, but chunk-to-material resolution still needs DB calls.

→ **Recommend Option A.** Keeps the resolution close to the data.

### 2. State for the prompt

Add to StudyContext:

```js
const [dupPrompt, setDupPrompt] = useState(null);
// Shape: { materialName, dupSummary, resolve: (decision) => void }
```

In the extraction loop, when `exResult?.needsUserDecision`:

```js
if (exResult?.needsUserDecision) {
  const decision = await new Promise(resolve => {
    setDupPrompt({
      materialName: extractable[ei].name,
      dupSummary: exResult.dupSummary,
      resolve,
    });
  });
  setDupPrompt(null);

  if (decision === 'extract') {
    // Re-run extraction, bypassing dedup check
    await runExtractionV2(courseId, extractable[ei].id, {
      ...callbacks, skipDedupCheck: true
    });
  }
  // else: 'skip' — do nothing, move to next material
}
```

### 3. Rendering in GlobalLockOverlay

GlobalLockOverlay checks `dupPrompt`. If set, renders the prompt card instead of the spinner:

```jsx
if (dupPrompt) {
  // Render prompt card with dupPrompt.dupSummary
  // "Skip" button → dupPrompt.resolve('skip')
  // "Extract" button → dupPrompt.resolve('extract')
}
```

## Actions

### "Skip — same material" (left button, subtle/secondary style)
- Marks all matching new chunks as status `'skipped'` (new status value, or reuse `'extracted'`)
- Does **not** call Claude API
- Optionally: copy `chunk_skill_bindings` from matched existing chunks to new chunks (inherit skills). This is a V2 enhancement — for V1, just skip.
- Adds notification: "Skipped — [name] matched existing content"

### "Extract anyway" (right button, primary style)
- Proceeds with normal extraction
- `runExtractionV2` needs a `skipDedupCheck: true` option so the re-call doesn't loop back into the prompt
- Adds notification: "Extracting [name] despite similarity"

## Visual Treatment

**ESCALATED TO CEO** — aesthetic decisions:

1. **Card background:** Same `T.sf` as current GlobalLockOverlay card, or a slight amber tint (`rgba(251,191,36,0.05)`) to signal caution?
2. **Icon:** The `⚠` warning icon, or a custom duplicate-files icon?
3. **Button styles:** Primary/secondary distinction — `T.ac` for "Extract" (action), `T.sf` with border for "Skip" (passive)? Or reversed since "Skip" is the recommended action?
4. **Border accent:** `T.am` (amber `#FBBF24`) left border on the card, matching the warn notification style?

**Recommended defaults for DEV (pending CEO override):**
- Amber `T.am` left border on the prompt card (matches warn notifications)
- "Skip" button: `T.sf` background, `T.am` text — recommended action feels calm
- "Extract" button: `T.ac` background — deliberate action feels intentional
- Small text below buttons in `T.txM`: "Skip inherits existing skills." or "Extraction uses API credits."
- No custom icon — use text `⚠` for simplicity

## Edge Cases

| Case | Handling |
|------|----------|
| User closes/cancels overlay during prompt | Treat as "skip" — safe default |
| MinHash check fails (DB error) | Extraction proceeds normally (existing try/catch) |
| Only some chunks match | Show partial message, still offer choice |
| 100% match but different classification | Still prompt — user may have reclassified intentionally |
| Multiple materials in batch | Each material gets its own prompt sequentially |
| Fingerprints not yet stored (race) | No fingerprints → no matches → extraction proceeds |

## Implementation Checklist for DEV

### `src/lib/skills.js`
- [ ] In `runExtractionV2` near-dedup block: resolve `existingChunkId` → material name, build `dupSummary` object
- [ ] Add `skipDedupCheck` option to `runExtractionV2` so re-calls after "Extract anyway" skip the MinHash check

### `src/StudyContext.jsx`
- [ ] Add `dupPrompt` / `setDupPrompt` state
- [ ] In both extraction loops: `await` a Promise that resolves when user picks
- [ ] Export `dupPrompt` / `setDupPrompt` through context value

### `src/components/GlobalLockOverlay.jsx`
- [ ] Import `dupPrompt` from context
- [ ] When `dupPrompt` is set, render prompt card instead of spinner
- [ ] Wire "Skip" → `dupPrompt.resolve('skip')`, "Extract" → `dupPrompt.resolve('extract')`
- [ ] Handle single-material vs multi-material vs partial-overlap message variants

### `src/lib/db.js`
- [ ] No changes needed — existing `Chunks.getById` and `Materials.getById` sufficient

---

## Sequence Diagram

```
User uploads file
  → storeAsChunks (fingerprints stored)
  → GlobalLockOverlay shows "Extracting skills..."
  → runExtractionV2
      → SHA-256 exact check (pass)
      → MinHash check → all chunks match!
      → resolve chunk_id → material names
      → return { needsUserDecision: true, dupSummary }
  → StudyContext sets dupPrompt
  → GlobalLockOverlay swaps spinner → prompt card
  → User clicks "Skip" or "Extract"
  → Promise resolves
  → dupPrompt cleared → spinner resumes (or loop moves to next material)
```
