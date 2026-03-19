# Development: AI Context Integration + Emit/Parse Protocol
**Date:** 2026-03-19
**Status:** Complete
**Step:** 5 — Image catalog in context, system prompt instructions, tag parser, tag stripping

---

## Changes Made

### 1. `src/lib/study.js` — `buildImageCatalog` (NEW internal function)

Added before `buildFocusedContext`. Queries `MaterialImages.getByCourse(courseId)` and formats as a structured text block:

```
AVAILABLE VISUALS:
  img_abc12345: slide 3 — "Algorithm 2: Evaluating infix" (Lecture-5-Stacks.pptx)
  img_def67890: page 15 (Textbook-Ch2.pdf)
```

**Design decisions:**
- Queries all images for the course, capped at 20 entries (~200-300 tokens overhead)
- Uses short ID prefix: `img_` + first 8 chars of UUID (unique enough, token-efficient)
- Includes material name in parentheses for AI context
- Wrapped in try/catch returning `''` — graceful if `material_images` table doesn't exist yet (pre-migration 7)
- Returns empty string if no images exist — backward compatible, no impact on image-free courses

### 2. `src/lib/study.js` — `buildFocusedContext` injection

Added image catalog call at the end of the function, after all three focus type branches (`assignment`, `skill`, `exam`) complete:

```js
var imageCatalog = await buildImageCatalog(courseId, materials);
if (imageCatalog) ctx += imageCatalog;
```

This ensures every focus type gets the image catalog. Placed after domain proficiency context but before return — the AI sees it regardless of focus type.

### 3. `src/lib/study.js` — `buildSystemPrompt` IMAGE DISPLAY section

Appended after the ASSESSMENT PROTOCOL section. Instructions for the AI:

- Only use image IDs from AVAILABLE VISUALS — never invent IDs
- Show images when referencing visual content in teaching
- Include verbal description alongside the image
- Don't show images the student already has open
- Maximum 2 images per response
- If no matching visual exists, describe verbally — never say "I can't show the image"

### 4. `src/lib/study.js` — `parseImageTags` (NEW export)

```js
export const parseImageTags = (response) => {
  const tags = [];
  const regex = /\[SHOW_IMAGE\]\s*(img_[a-f0-9]+)\s*\[\/SHOW_IMAGE\]/g;
  let m;
  while ((m = regex.exec(response)) !== null) {
    tags.push({ imageId: m[1], position: m.index });
  }
  return tags;
};
```

- Follows same pattern as `parseSkillUpdates` and `parseQuestionUnlock`
- Returns `{ imageId, position }` objects for MessageList rendering
- Regex allows whitespace around the image ID for robustness
- Does not interfere with other tag parsers — different tag patterns

### 5. `src/lib/study.js` — Import update

Added `MaterialImages` to the db.js import on line 1.

### 6. `src/lib/theme.jsx` — `renderMd` tag stripping

Added 3 regexes to the existing tag-stripping chain in `renderMd`:

```js
.replace(/\[SHOW_IMAGE\][\s\S]*?\[\/SHOW_IMAGE\]/g, "")  // Complete tags
.replace(/\[SHOW_IMAGE\][\s\S]*$/g, "")                    // Partial during streaming
.replace(/\[SHOW_IM[\s\S]*$/g, "")                          // Partial prefix during streaming
```

Placed after `[UNLOCK_QUESTION]` complete-tag stripping (complete tags first) and after all other partial-tag stripping. Images are rendered separately by MessageList — the markdown renderer just strips the tags clean.

## Build Verification
- Vite build: PASS (built in ~1.8s, no errors)
- Cargo check: PASS (no changes to Rust, still clean)

## Backward Compatibility
- `buildImageCatalog` returns `''` for courses with no images — context identical to pre-image behavior
- `buildImageCatalog` try/catches DB errors — works even if migration 007 hasn't run
- `parseImageTags` returns `[]` for messages with no image tags
- `renderMd` tag stripping is additive — existing tag patterns unaffected
- System prompt IMAGE DISPLAY section only activates when AVAILABLE VISUALS is present in context
- No existing function signatures or return shapes changed

## Token Budget
- Image catalog: ~10-15 tokens per entry × 20 entries max = ~200-300 tokens
- System prompt addition: ~150 tokens (fixed cost, always present)
- Total overhead for image-enabled courses: ~350-450 tokens
- For image-free courses: 0 additional tokens (catalog returns empty, system prompt section is inert)
