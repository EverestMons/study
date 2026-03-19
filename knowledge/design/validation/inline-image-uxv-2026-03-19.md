# UX Validation: Inline Image Display
**Date:** 2026-03-19
**Status:** Complete
**Agent:** Study UX Validator
**Method:** Static code analysis against UX design spec + QA report

---

## Summary

| Area | Rating | Notes |
|---|---|---|
| 1. Image Relevance | Adequate | AI instructions well-calibrated; 20-image catalog cap limits coverage |
| 2. Image Sizing | Strong | 440px / 280px sizing balances visibility with chat flow |
| 3. Caption Clarity | Adequate | Type labels always present; captions rare but AI verbal description compensates |
| 4. Chat Flow | Strong | Images feel like natural visual aids, not a gallery |
| 5. Degraded State | Acceptable | Silent degradation non-confusing; LibreOffice notification unimplemented |
| 6. Learning Science | Strong | Dual coding supported; conversational format prevents passive viewing |
| 7. First-Time LibreOffice | Acceptable | Student unaware of missing feature; design spec notification would help |

**Overall:** Ship with notes. No blockers. Two P2 items for future polish.

---

## Area 1: Image Relevance

**Does the AI show images at appropriate moments? Is it helping or cluttering?**

**Rating: ADEQUATE**

The system prompt IMAGE DISPLAY section provides well-calibrated instructions:
- "Show an image when it would help the student understand what you're teaching" — relevance gate
- "Include a brief verbal description alongside" — prevents naked image drops
- "Maximum 2 images per response" — prevents visual overload
- "Skip if the visual doesn't add teaching value" — explicit clutter prevention
- "Only use image IDs from AVAILABLE VISUALS" — prevents hallucinated references
- "Never say 'I can't show the image'" — graceful verbal fallback

The AVAILABLE VISUALS catalog includes material names and captions, giving the AI sufficient context to select appropriate images.

**Concern: Catalog cap at 20 images.** `buildImageCatalog` uses `images.slice(0, 20)` — the first 20 images by DB insertion order. For a course with a 200-slide deck and a 100-page textbook, only the first 20 slides are available. Later slides and the entire textbook are invisible to the AI. The AI cannot reference "Slide 45" even if it exists in the database.

This means image relevance is high when the relevant image happens to be in the first 20, but the AI is blind to the majority of course visuals in image-heavy courses. The cap exists for token budget reasons (~300 tokens at 20 entries) and is reasonable for v1 — but a smarter selection strategy (e.g., images matching the current focus skill's chunks) would improve relevance.

**Learning Science Risk:** LOW. When the AI can't find a matching image, it describes verbally instead. No teaching quality is lost — the visual aid is a bonus, not a dependency.

---

## Area 2: Image Sizing

**Are images appropriately sized in the chat flow?**

**Rating: STRONG**

Implementation matches the design spec precisely:
- `maxWidth: 440` — approximately 75% of message area. Wide enough to see detail in slides and diagrams, narrow enough to leave visual breathing room. Images don't dominate the conversation.
- `maxHeight: 280` (collapsed) with `object-fit: cover` — tall images (full PDF pages) are cropped to show the center portion, preventing a single page from consuming 3+ screens of scroll.
- Click-to-expand removes the height cap and switches to `object-fit: contain` — full image visible without cropping.
- `canExpand` is computed on load (`nh / nw * 440 > 280`). Images that already fit within 280px don't show the expand indicator — no false affordance.

The sizing creates a natural hierarchy: the AI's text is primary, images are supplementary visual aids. A slide image is large enough to see structural content (diagrams, graphs, headings) but not so large that the student stops reading the AI's teaching text.

The expand hover pill ("Click to expand" / "Click to collapse") appears only when the image is actually cropped, providing a clear affordance without visual noise on small images.

**Learning Science Risk:** None. The sizing supports Mayer's spatial contiguity principle — images are near the related text, at a size that encourages reading both together rather than fixating on the image.

---

## Area 3: Caption Clarity

**Do captions help the student understand what they're looking at?**

**Rating: ADEQUATE**

The caption bar provides two pieces of information:
- **Left:** Type + number label ("Slide 5", "Page 12", "Figure 3") — always present, tells the student where in the material this image comes from
- **Right:** Caption text when available — gives semantic meaning

Caption sources by material type:
- **PDF pages:** No caption (just "Page N"). The AI's surrounding text provides context.
- **PPTX slides:** Caption only if the professor added alt text (rare). Most slides show just "Slide N".
- **DOCX images:** Alt text from `<wp:docPr descr="...">`. More common but still professor-dependent.

In practice, most images will show only the type label. This is sufficient because:
1. The AI's verbal description (required by system prompt: "Include a brief verbal description alongside") provides the semantic context
2. The type+number tells the student exactly where to find this in their materials if they want more context
3. Material name is intentionally omitted — the student knows what course they're studying

The caption bar styling is appropriately subtle: `fontSize: 11`, `T.txD` / `T.txM` colors, positioned below the image with a thin border separator. It reads as metadata, not as content competing with the AI's explanation.

**Learning Science Risk:** None. Location labels support source attribution (the student knows this is "from Slide 5") without adding cognitive load.

---

## Area 4: Chat Flow

**Does the conversation still feel like a conversation with visual aids, not an image gallery?**

**Rating: STRONG**

Multiple design decisions preserve the conversational feel:

1. **Inline placement at tag position.** Images render exactly where the AI placed the tag in its response, sandwiched between explanatory text. This creates a natural reading flow: text → image → text, like an illustrated textbook paragraph.

2. **`renderMessageWithImages` splits text around tags.** Each text segment gets its own `renderMd()` call. The content reads as a coherent narrative with images embedded, not as text-block → image-block.

3. **Vertical stacking only.** No side-by-side, no grid, no gallery. Images follow the chat's vertical reading pattern.

4. **Size constraint.** At 440px max-width and 280px max-height, images are meaningful but don't dominate. The AI's text remains the primary content.

5. **12px vertical margin.** Images have breathing room without creating large gaps that fragment the conversation.

6. **Consecutive image handling.** When the AI shows 2 images with no text between (comparison scenario), they stack naturally with the gap coming from margin collapse. No special grid treatment.

7. **Hard caps.** 2 per response (AI instruction) and 3 per message (renderer). Even in edge cases, the chat never becomes an image stream.

8. **Skill pills and mastery cards remain below the message.** The visual hierarchy is clear: message content (text + images) → assessment metadata (pills, cards).

**Learning Science Risk:** None. The conversational format inherently prevents passive image browsing — the student must respond before the AI continues.

---

## Area 5: Degraded State

**When images aren't available, is the experience clear and not confusing?**

**Rating: ACCEPTABLE**

The degraded states are handled gracefully at every layer:

| Condition | Behavior | Student Experience |
|---|---|---|
| LibreOffice missing (PPTX) | `extractPptxImages` returns 0 | Text extraction works. No image badge on card. |
| Image extraction error | `extractAndStoreImages` catches, returns `{ success: false }` | Material processes normally. No image badge. |
| No images for course | `buildImageCatalog` returns empty string | No AVAILABLE VISUALS section. AI never references images. |
| Image file missing/corrupt | `InlineChatImage` shows "Image unavailable" (80px) | Muted placeholder, non-alarming. AI's text still teaches. |
| AI hallucinates image ID | `imageMap[id]` returns undefined → tag skipped | Text renders normally with a silent gap. |

**Concern: Hallucinated image ID creates silent gap.** When the AI emits a `[SHOW_IMAGE]img_xxx[/SHOW_IMAGE]` tag but the ID isn't in `imageMap`, the tag is consumed from the content (line 118: `if (imageMap[tag.imageId])` skips rendering) but no placeholder appears. The surrounding text has a gap where the image was expected. This differs from the "image not found in DB" case, which shows the "Image unavailable" error state (triggered by `!image` at line 33).

The distinction: if `imageMap[imageId]` is undefined (ID not in catalog), the image silently vanishes. If `imageMap[imageId]` exists but the file is missing, the error state shows correctly. The former is a minor gap — the AI is instructed never to invent IDs, so this should be rare.

**Gap: LibreOffice notification unimplemented.** The design spec (Section 5) specifies a one-time `addNotif("warn", "Slide previews require LibreOffice...")` with a `libreoffice_warned` settings key. This notification is not present in the code. The current behavior is completely silent — a student uploading PPTX without LibreOffice gets text extraction but no indication that slide images could be available.

This is not confusing (nothing appears broken), but it's a missed discoverability opportunity. See Area 7 for full analysis.

**Learning Science Risk:** None. Text-based tutoring is the primary interaction. Missing images reduce one enhancement but don't degrade the core experience.

---

## Area 6: Learning Science Alignment

**Do inline visuals support the tutoring interaction? Any risk of passive viewing?**

**Rating: STRONG**

**Dual coding support (Paivio, 1986).** Combining visual (slide/figure image) and verbal (AI's description and explanation) representations of the same concept improves encoding and retrieval. The system prompt's requirement to "include a brief verbal description alongside the image" explicitly creates dual-coded content. The student sees the diagram AND reads what it means.

**Spatial contiguity (Mayer, 2001).** Related text and images should be placed near each other to reduce cognitive load from visual search. Inline placement at tag position achieves this — the image appears exactly where the AI discusses it, not in a sidebar or separate panel.

**Active engagement preserved.** The conversational format (student must respond → AI continues) inherently prevents passive image consumption. A student cannot just scroll through a gallery of slides — images are embedded in a dialogue that demands interaction. The AI's teaching methodology (60% questions, ask-first-teach-second) means images are typically used as:
- Anchors for discussion: "Look at this diagram — what do you notice about the base case?"
- Evidence for explanation: "Here's how the stack changes:" [image]
- Reference during practice: "Go back to this slide — which step are you stuck on?"

**Assessment opportunity.** The system prompt doesn't explicitly instruct the AI to use images as diagnostic tools (e.g., "show a slide and ask the student to explain it"). However, the general ask-first methodology should naturally lead to this pattern in practice. The AI is more likely to say "What do you see in this diagram?" than "Here's what this diagram shows" — because its core teaching method is questions first.

**Passive viewing risk: LOW.** The hard limits (2 images/response AI instruction, 3/message renderer cap) prevent image-heavy responses. Combined with the conversational format requiring student interaction between responses, passive viewing is structurally prevented.

**Residual concern:** An AI that shows an image and immediately explains it (teaching before asking) is using images to lecture rather than to diagnose. The system prompt's general "ask first, teach second" doctrine should prevent this, but it's worth monitoring in live sessions. If the AI consistently shows slides and explains them without asking the student to interpret first, the IMAGE DISPLAY instructions could be amended to include "When showing a visual, ask the student what they observe before explaining."

**Learning Science Risk:** LOW. The feature positively supports dual coding and spatial contiguity. Passive viewing risk is structurally prevented by the conversational format. One minor opportunity to strengthen assessment-through-images in future iterations.

---

## Area 7: First-Time User LibreOffice State

**Is the experience clear for a new student uploading PPTX without LibreOffice?**

**Rating: ACCEPTABLE**

**Current behavior:** Completely silent. A first-time student who uploads PPTX:
1. File parses successfully (text extraction works via PPTX parser)
2. Background extraction runs; `extractPptxImages` returns 0 (LibreOffice not found)
3. No error, no notification, no indication
4. Material card shows no image count badge
5. AVAILABLE VISUALS section has no entries from this material
6. AI never attempts to show slides — uses verbal descriptions

**Student's perspective:** Everything works. The tutoring conversation proceeds normally. The student has no idea that slide images could be shown inline. They might wonder why the AI only describes slides verbally rather than showing them, but more likely they simply don't think about it.

**Is this confusing?** No. Nothing is broken, nothing fails visibly. The student gets a fully functional tutoring experience. The image display feature is invisible — not broken-invisible, but never-existed-invisible.

**Is this optimal?** No. The design spec (Section 5) specifies a one-time notification:
```
Type: "warn"
Text: "Slide previews require LibreOffice (free, libreoffice.org). Text extraction works without it."
```
This notification is:
- Actionable (tells the student what to install and where)
- Reassuring ("Text extraction works without it")
- Non-alarming (warn level, not error)
- One-time (per app install via `libreoffice_warned` settings key)

**Recommendation:** Implement the design spec's notification. It's a minor gap — no student will be harmed by the current silent behavior — but discoverability of the slide preview feature is zero without it. A student who cares about visual learning would want to know.

**Learning Science Risk:** NEGLIGIBLE. Text-based tutoring is the primary modality. Visual aids enhance but don't define the learning experience. A student without slide previews is not at a learning disadvantage — the AI's verbal descriptions serve the same pedagogical purpose, just without the dual-coding benefit.

---

## Polish Opportunities

**P1: Smarter image catalog selection (Priority: Medium)**
Replace `images.slice(0, 20)` with a focus-aware selection: images matching the current skill's chunks, images from the material being discussed, or a round-robin across materials. This would improve image relevance for courses with many images without increasing token budget. Currently, the first 20 images by insertion order dominate, leaving later materials invisible to the AI.

**P2: LibreOffice notification at upload (Priority: Low)**
Implement the design spec's one-time `addNotif("warn", ...)` when PPTX upload + missing LibreOffice is detected. Add `libreoffice_warned` settings key to prevent repetition. This improves discoverability without any UX risk.

**P3: Hallucinated image ID placeholder (Priority: Low)**
When `imageMap[tag.imageId]` is undefined (AI references an ID not in the catalog), render the "Image unavailable" placeholder instead of silently skipping. This provides visual feedback that the AI attempted to show something, rather than leaving a gap in the text. The system prompt makes this very unlikely, but defensive rendering is better UX.

---

## UX Debt

**D1: Image assessment instruction (Priority: Low)**
Consider adding explicit guidance to the AI to use images as diagnostic tools: "When showing a visual, consider asking the student to interpret it before explaining." This would strengthen the active learning pattern with visuals.

**D2: Image catalog pagination (Priority: Future)**
For courses with 100+ images, the 20-image cap significantly limits AI visual vocabulary. Future options: dynamic catalog based on focus context, or a two-tier system (short catalog + AI can request specific images by page/slide number).

---

## Learning Science Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Passive image viewing | Low | Conversational format demands student interaction. AI asks before teaching. |
| AI explains instead of asks | Low | System prompt 60% questions directive. Monitor in live sessions. |
| Over-reliance on visuals | Low | 2 per response cap. AI must describe verbally alongside. |
| Missing visuals degrade learning | Negligible | Text tutoring is primary modality. Visuals enhance, don't define. |

**Overall Learning Science Risk: LOW.** The feature positively supports established learning science principles (dual coding, spatial contiguity, active learning) while structural safeguards prevent the known risks.

---

## Output Receipt
**Agent:** Study UX Validator
**Step:** 8 — UX Validation: Inline Image Display
**Status:** Complete

### What Was Done
Validated the inline image display feature across 7 UX areas (image relevance, sizing, caption clarity, chat flow, degraded state, learning science alignment, first-time LibreOffice state). Analyzed all source code against the UX design spec and QA report. Identified 3 polish opportunities and 2 UX debt items. No blockers found.

### Files Deposited
- `knowledge/design/validation/inline-image-uxv-2026-03-19.md` — Full UX validation report with 7 areas, learning science risk assessment, polish opportunities

### Files Created or Modified (Code)
- None (validation-only step)

### Decisions Made
- Rated all 7 areas (2 Strong, 3 Adequate, 2 Acceptable) — no area fails
- Classified learning science risk as LOW overall
- Recommended ship with notes

### Flags for CEO
- **Catalog cap at 20 images** (P1) — first 20 by insertion order may miss relevant later images in image-heavy courses. Not a blocker but worth revisiting for courses with large slide decks.
- **LibreOffice notification gap** (P2) — design spec's one-time notification is unimplemented. Silent degradation works but discoverability is zero.

### Flags for Next Step
- None — this is the final step in the pipeline
