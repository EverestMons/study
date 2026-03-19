# UX Design: Inline Image Display + Image Availability Indicators
**Date:** 2026-03-19
**Status:** Design Spec
**Depends on:** `knowledge/architecture/inline-image-display-2026-03-19.md`

---

## 1. Inline Image in Chat

### Placement: Inline at Tag Location

Images render **at the tag position within the message flow**, not as separate blocks below. The AI's message reads naturally top-to-bottom:

```
"Look at how the stack changes during evaluation:"

[IMAGE: Slide 5 — Stack Operations]

"Notice how each operator pops two operands..."
```

This keeps the image contextually anchored to the surrounding explanation, which is critical for teaching. Skill pills and mastery cards remain below the full message (they're metadata about the interaction), but images are **content** — they belong inline.

### Implementation in `renderMd`

The `renderMd` function in `theme.jsx` processes text line-by-line. Image tags (`[SHOW_IMAGE]img_abc12345[/SHOW_IMAGE]`) are detected during the line scan. When a line contains (or is) an image tag:

1. Strip the tag from text rendering (already handled by the regex additions from the architecture doc)
2. Instead, inject an `<InlineChatImage>` React element at that position in the `els` array

This means `renderMd` needs access to the image lookup map. **Approach:** Pass the image map as a second optional argument: `renderMd(text, imageMap)`. When `imageMap` is null/undefined (all existing call sites), image tags are just stripped. When provided (MessageList's assistant message rendering), they render as images.

### Sizing

- **Max width:** `min(100%, 440px)` — images should never be wider than the message column but also shouldn't stretch to fill it. 440px is ~75% of the message area on a typical window, leaving visual breathing room.
- **Max height (collapsed):** `280px` with `object-fit: cover` — tall images (full PDF pages) are cropped to show the most relevant portion. This prevents a single page image from dominating 3+ screens of scroll.
- **Aspect ratio preserved:** The container doesn't force a fixed aspect ratio. Wide slides render wider-than-tall. Tall figures render taller. But both are capped.

### Frame Treatment

```
Container:
  background: T.bg (#0F1115)       — darkest background, creates "mounted" look
  border: 1px solid T.bd (#2A2F3A) — consistent with all card borders in the app
  borderRadius: 10px               — matches expanded card radius in MaterialsScreen
  overflow: hidden                  — clips the image to the rounded corners
  margin: 12px 0                   — vertical spacing between text and image
```

The dark background serves as a fallback for images with transparent areas (diagrams, charts). No shadow — the app doesn't use shadows anywhere; the border is the containment signal.

### Click-to-Expand (Lightbox)

**Yes.** Clicking an image toggles between collapsed (280px max-height, `object-fit: cover`) and expanded (full resolution, `object-fit: contain`, no max-height). This is a simple **in-place expansion**, not a modal lightbox overlay.

**Behavior:**
- **Collapsed (default):** Image is cropped to fit within 280px height. A subtle indicator appears on hover (see below).
- **Expanded:** Image shows at natural dimensions (up to the 440px max-width). The container grows to accommodate. The chat scrolls if needed.
- **Toggle:** Click collapses back. No close button needed — the click target is the entire image.

**Expand indicator on hover:**
A small translucent pill appears at the bottom-center of the image on hover:
```
position: absolute, bottom: 8px, left: 50%, transform: translateX(-50%)
background: rgba(0, 0, 0, 0.6)
padding: 3px 10px, borderRadius: 12
fontSize: 10, color: #E8EAF0 (T.tx)
text: expanded ? "Click to collapse" : "Click to expand"
opacity: 0 → 1 on hover, transition: opacity 0.15s
```

Only shown when the image is actually cropped (natural height > 280px). If the image fits without cropping, no indicator and no expand behavior.

---

## 2. Image Caption / Label

### Caption Bar

A thin bar below the image, inside the frame container:

```
Container:
  padding: 6px 12px
  borderTop: 1px solid T.bd
  background: T.sf (#1A1D24)  — one step lighter than the image bg, subtle separation
  display: flex
  justifyContent: space-between
  alignItems: center
```

### Content Layout

**Left side:** Type + number label
```
"Slide 5" | "Page 12" | "Figure 3" | "Image 2"
fontSize: 11
fontWeight: 600
color: T.txD (#8B95A5)
```

**Right side:** Caption text (if available)
```
"Algorithm 2: Evaluating infix expressions"
fontSize: 11
fontWeight: 400
color: T.txM (#64748B)
overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap
maxWidth: 60% of container (prevents caption from pushing into label)
```

**Material name is NOT shown** in the caption. It would be redundant — the student is in a study session for a specific course, and the AI's surrounding text contextualizes which material. Keeping the caption minimal reduces visual noise.

If no caption exists (common for PDF page renders), only the left-side label shows. The right side is empty — no placeholder text.

---

## 3. Multiple Images in One Response

### Sequential Inline

Multiple images render **sequentially at their tag positions** in the message text. Since the AI places tags where they're contextually relevant, this naturally spreads images through the response:

```
"Compare these two approaches:"

[IMAGE: Slide 8 — Iterative Solution]

"versus the recursive version:"

[IMAGE: Slide 9 — Recursive Solution]

"Notice how the base case maps to..."
```

### Consecutive Images (No Text Between)

If the AI shows 2+ images with no text between them (rare but possible for comparison), they stack vertically with 8px gap between:

```
[IMAGE 1]
  8px gap
[IMAGE 2]
```

No grid layout. No side-by-side. Reasons:
1. Chat is a vertical flow — horizontal layouts break the reading pattern
2. Side-by-side would halve each image's width, making details unreadable
3. The AI is instructed to limit images per response (1-2), so stacking 3+ is an edge case that doesn't warrant a complex layout

### Hard Cap

The `parseImageTags` function returns all image IDs from a message, but the renderer caps at **3 images per message**. If more are parsed, only the first 3 render; the rest are silently dropped. This prevents runaway AI behavior from flooding the chat.

---

## 4. Materials Screen — Image Availability Indicator

### Compact Card Badge

On the compact (collapsed) material card in the 3-column grid, add an image count indicator below the title when images are available:

```
Current card layout:
  [Type badge: Sl]          [Status dot]
  Material Title (2 lines)

New card layout:
  [Type badge: Sl]          [Status dot]
  Material Title (2 lines)
  [image icon] 24 slides              ← NEW (only when images > 0)
```

**Styling:**
```
Container: display: flex, alignItems: center, gap: 4, marginTop: 2
Icon: a 10x10 inline SVG or unicode character — use "▣" (U+25A3) in T.txM color
Text: fontSize: 10, color: T.txM (#64748B), fontWeight: 400
Format:
  - Slides: "24 slides" (slides type)
  - PDF: "15 pages" (page type)
  - DOCX: "3 figures" (embedded type)
  - Mixed: "24 images" (generic fallback if multiple types)
```

This is intentionally subtle — it's metadata, not a call to action. Students don't interact with images from the materials screen; images surface during tutoring.

### Expanded Card Detail

In the expanded card view (the `renderExpandedDetail` function), add image count to the stats row alongside sections and words:

```
Current stats row:
  12 sections  ·  8,450 words  ·  Lecture Slides

New stats row:
  12 sections  ·  8,450 words  ·  24 slides  ·  Lecture Slides
                                   ^^^^^^^^^ NEW
```

Same dot separator pattern. Same fontSize 12, color T.txD. Appears between "words" and "type."

If images = 0 and the material type would normally have images (slides, PDF), show nothing — absence is the indicator. Don't show "0 slides" (see Section 5 for the LibreOffice case).

### Data Source

The image count per material comes from `MaterialImages.getCountByMaterial(materialId)`. This should be queried once when materials load (bulk query: `getCountsByCourse(courseId)` returning `{ materialId: count }` map) and cached in the course object or a ref, not queried per-render.

---

## 5. LibreOffice Missing State

### When It Matters

Only PPTX files require LibreOffice. If LibreOffice isn't installed and the user uploads `.pptx` files, text extraction works normally — only image extraction is skipped.

### Notification at Upload Time

When image extraction is skipped for a PPTX file due to missing LibreOffice, show a **one-time notification** (per app install, not per upload):

```
Type: "warn"
Text: "Slide previews require LibreOffice (free, libreoffice.org). Text extraction works without it."
```

This uses the existing `addNotif("warn", ...)` system. The notification appears in the standard notification area and auto-dismisses. The `libreoffice_warned` settings key prevents repeating this on future uploads.

### No Badge or Warning on Material Card

The compact card simply won't show the image count line (because images = 0). The expanded card shows sections and words but no image stat. This is intentionally low-key — missing images is a minor degradation, not an error state. The material still works for studying.

### No Settings Screen Entry

LibreOffice installation is not surfaced in settings. The notification at upload time is sufficient. If the user installs LibreOffice later and re-uploads slides, images will be extracted. There's no "re-extract images" button — that's future scope.

---

## 6. Loading State

### Shimmer Placeholder

When an image is loading from disk (brief — typically <100ms for local files, but can be 200-500ms for large PNGs):

```
Container: same frame as the loaded image (border, borderRadius, background)
Inner:
  width: 100%
  height: 160px (fixed placeholder height — we don't know dimensions until loaded)
  background: T.bg (#0F1115)
  position: relative
  overflow: hidden

Shimmer overlay:
  position: absolute
  top: 0, left: 0, right: 0, bottom: 0
  background: linear-gradient(90deg, transparent, rgba(108,156,252,0.06), transparent)
  animation: shimmer 1.5s ease-in-out infinite
```

This reuses the existing `@keyframes shimmer` animation defined in `CSS` (theme.jsx line 43), which is already used for the material processing progress bar. Consistent visual language.

### Transition to Loaded

Once the `<img>` fires `onLoad`:
- Shimmer container replaced by the actual image
- `animation: fadeIn 0.25s` on the `<img>` (reuses existing `@keyframes fadeIn`)
- No layout shift if possible — the container height transitions smoothly from 160px to the image's natural height

### Error State

If the image fails to load (`onError`):
- Show a muted placeholder with icon and text:
```
Container: same frame, height: 80px
Center: fontSize: 11, color: T.txM
Text: "Image unavailable"
```
- No retry button — this is a rare edge case (file deleted or corrupted). The AI's text still conveys the teaching content.

---

## 7. Accessibility

### Alt Text

Every `<img>` element gets an `alt` attribute:
- **If caption exists:** `alt={caption}` (e.g., "Algorithm 2: Evaluating infix expressions")
- **If no caption:** `alt={imageType + " " + pageOrSlideNumber}` (e.g., "Slide 5", "Page 12")
- Never `alt=""` — these images convey educational content, they're not decorative

### Keyboard Navigation

The expand/collapse toggle responds to Enter/Space when the image container has focus:
```
tabIndex: 0
role: "button"
aria-label: expanded ? "Collapse image" : "Expand image: " + (caption || label)
onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }
```

### Screen Reader Context

The caption bar content is rendered as visible text (not just title/aria attributes), so screen readers naturally read it after the alt text.

---

## 8. Aesthetic Decisions Escalated to CEO

The following choices use the app's existing design language and are documented here for CEO review:

1. **Image container border radius:** 10px (matches MaterialsScreen expanded cards) — vs 8px (compact cards) or 12px (staging area)
2. **Caption bar background:** T.sf (#1A1D24) — vs transparent or T.bg
3. **Max collapsed height:** 280px — vs 200px (more compact) or 360px (shows more of tall images)
4. **Max width:** 440px — vs 100% (full message width) or 360px (more compact)
5. **Expand indicator style:** Translucent pill on hover — vs a small icon in the caption bar, or no indicator (just make the cursor change)
6. **Loading placeholder height:** 160px fixed — vs aspect-ratio-aware (requires pre-known dimensions from DB, which we have)

---

## 9. Component Summary

### `InlineChatImage` (new component)
- **Props:** `{ image, imageMap }` where image is `{ id, filePath, caption, imageType, pageOrSlideNumber, width, height }`
- **State:** `expanded` (boolean), `loaded` (boolean), `error` (boolean)
- **Renders:** Frame container → shimmer/image/error → caption bar
- **Location:** Inline in `MessageList.jsx` or separate file `src/components/study/InlineChatImage.jsx`

### `renderMd` signature change
- **Current:** `renderMd(text)`
- **New:** `renderMd(text, imageMap?)` where `imageMap` is `Map<string, ImageRecord>` keyed by `img_` prefix
- **Backward compatible:** All existing call sites pass only text; image rendering only activates when imageMap is provided

### MaterialsScreen additions
- Compact card: conditional image count line
- Expanded card: image count in stats row
- Data: `imageCountsByMaterial` ref populated from bulk DB query on course load
