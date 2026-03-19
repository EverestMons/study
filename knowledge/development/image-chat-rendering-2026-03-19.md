# Development: Chat Image Rendering (MessageList Enhancement)
**Date:** 2026-03-19
**Status:** Complete
**Step:** 6 — InlineChatImage component, MessageList integration, MaterialsScreen indicators

---

## Changes Made

### 1. `src/components/study/MessageList.jsx` — `InlineChatImage` component (NEW inline)

Stateful component defined above `MessageList` in the same file. Handles:

- **Asset URL loading:** Lazy-imports `getImageUrl` from `imageStore.js` via `useEffect`. Converts `file_path` (relative) to a Tauri asset protocol URL.
- **Loading state:** 160px height shimmer placeholder (reuses `@keyframes shimmer` from CSS). Shimmer gradient: `rgba(108,156,252,0.06)`.
- **Error state:** 80px height, centered "Image unavailable" text in `T.txM`.
- **Image display:** `width: 100%`, `maxWidth: 440px`, `maxHeight: 280px` collapsed with `object-fit: cover`. Expanded: no max-height, `object-fit: contain`.
- **Click-to-expand:** Toggled by click. `canExpand` state computed on `onLoad` — checks if rendered height at 440px width would exceed 280px: `nh / nw * 440 > 280`.
- **Hover indicator:** Translucent pill at bottom-center: "Click to expand" / "Click to collapse". Only shown when `canExpand && loaded && hovering`.
- **Caption bar:** Below image, `borderTop: 1px solid T.bd`, `background: T.sf`. Left: type label ("Slide 5", "Page 12", "Figure 3"). Right: caption text (ellipsis overflow, max 60% width).
- **Frame:** `background: T.bg`, `border: 1px solid T.bd`, `borderRadius: 10`, `overflow: hidden`, `margin: 12px 0`.
- **Accessibility:** `tabIndex: 0`, `role: "button"`, `aria-label`, Enter/Space keyboard handler when expandable. Alt text from caption or type+number label.

**Props:** `{ imageId, imageMap }` where `imageId` is `img_` + 8-char UUID prefix and `imageMap` is the course-wide lookup map.

### 2. `src/components/study/MessageList.jsx` — `renderMessageWithImages` helper (NEW)

Replaces direct `renderMd(m.content)` for assistant messages. Logic:

1. If `imageMap` is empty, falls back to `renderMd(content)` (backward compatible)
2. Scans content with `IMG_TAG_RE` regex for `[SHOW_IMAGE]img_xxx[/SHOW_IMAGE]` tags
3. If no tags found, falls back to `renderMd(content)`
4. Caps at 3 images per message (hard limit per UX spec)
5. Splits content around tag positions, renders text segments with `renderMd()` and injects `<InlineChatImage>` between them
6. Remaining text after last tag rendered with `renderMd()`

This approach keeps `renderMd` in `theme.jsx` unchanged — image rendering is handled entirely at the MessageList level.

### 3. `src/components/study/MessageList.jsx` — Image map loading

- Added `active` to `useStudy()` destructuring
- Added `imageMap` state (initially `{}`)
- Added `useEffect` that fires on `active?.id` change: calls `MaterialImages.getByCourse(active.id)`, builds short-ID map (`img_` + first 8 chars of UUID → full image record), sets state
- Cleanup function cancels async operation on unmount/course change

### 4. `src/components/study/MessageList.jsx` — Imports

- Added `parseImageTags` to `study.js` import (alongside existing `parseSkillUpdates`)
- Added `MaterialImages` from `db.js`

### 5. `src/screens/MaterialsScreen.jsx` — Image count indicators

**Compact card badge:**
- Below the material title, when `imageCounts[mat.id] > 0`
- Shows `▣` (U+25A3) icon + count + contextual label: "slides" for slides classification, "pages" for textbook, "images" for anything else
- `fontSize: 10`, `color: T.txM`, subtle metadata styling

**Expanded card stats row:**
- Added between "words" and OCR badge in the `renderExpandedDetail` function
- Same dot separator pattern, `fontSize: 12`, `color: T.txD`
- Only shown when `isReady && imageCounts[mat.id] > 0`

**Data loading:**
- Added `imageCounts` state (initially `{}`)
- Added `useEffect` on `active?.id` and `active?.materials?.length`: calls `MaterialImages.getCountsByCourse(active.id)`
- Wrapped in try/catch for pre-migration 7 compatibility
- Added `MaterialImages` to `db.js` import

## Build Verification
- Vite build: PASS (built in ~1.8s, no errors)

## Backward Compatibility
- `renderMessageWithImages` returns `renderMd(content)` when imageMap is empty — identical to pre-image behavior
- All existing `renderMd` call sites unaffected (no signature change to `renderMd`)
- `InlineChatImage` shows error state gracefully if image record not found or file missing
- `imageCounts` defaults to `{}` — MaterialsScreen renders identically when no images exist
- DB queries wrapped in try/catch for databases without migration 007

## Architecture Decision: No `renderMd` Signature Change

The UX spec suggested adding an `imageMap` parameter to `renderMd`. Instead, image rendering is handled entirely in MessageList via `renderMessageWithImages`, which splits content around image tags and delegates text segments to the unchanged `renderMd`. This avoids coupling the generic markdown renderer (theme.jsx) to the image system and keeps the rendering logic colocated with the image components.
