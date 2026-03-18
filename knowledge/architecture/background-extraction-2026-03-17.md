# Background Extraction — Architecture Blueprint
**Date:** 2026-03-17
**Status:** Ready for implementation
**Depends on:** Orchestration plan (Feature A)

---

## 1. New State Model

### Replace `globalLock` usage during extraction

Currently `globalLock` is used for two purposes:
1. **Phase 1** — document storage + syllabus parsing (fast, ~5–30s)
2. **Phase 2** — skill extraction loop (slow, 5–60+ min)

We split these: Phase 1 keeps `globalLock` (blocking is appropriate for fast setup). Phase 2 uses a new non-blocking state.

### New state variables in `StudyContext.jsx`

```js
// Replaces globalLock for Phase 2 extraction
const [bgExtraction, setBgExtraction] = useState(null);
// Shape when active:
// {
//   courseId: number,
//   materials: [
//     { id: number, name: string, status: 'pending'|'extracting'|'done'|'error'|'skipped'|'awaiting_decision',
//       chaptersTotal: number|null, chaptersComplete: number, error: string|null }
//   ],
//   startedAt: number,  // Date.now()
// }
// null when no extraction is running.
```

**No new refs needed.** `extractionCancelledRef` continues to serve as the cancellation signal.

### State removed from extraction path

- `globalLock` — NOT set during Phase 2
- `lockElapsed` — no longer ticking during extraction (timer only runs when `globalLock` is truthy)

### State retained

- `busy` — **scoped to chat only.** NOT set during background extraction. `busy` guards `sendMessage` (line 1026) and disables the send button in `InputBar`. It should only be true when the AI is actively streaming a response. During extraction, the user can freely chat about previously-extracted skills.
- `status` — continues to hold the latest extraction progress string (e.g. "Chapter 3: 12 skills"). Read by the progress indicator.
- `processingMatId` — continues to track which material is actively extracting. Read by `MaterialsScreen` for inline progress.

---

## 2. Phase Split in `createCourse`

### Phase 1 — Blocking (keeps `globalLock`)

Lines 452–517 of current `createCourse`:

1. `setGlobalLock({ message: "Creating course..." })`
2. Create course row, store documents as chunks
3. Save courses nested, flush pending docs, compute fingerprints
4. Parse syllabi, mark assignment chunks as extracted
5. `setGlobalLock(null)` — **Phase 1 ends here**
6. Navigate to MaterialsScreen: `setScreen("materials")`

### Phase 2 — Non-blocking (fire-and-forget)

Lines 519–566 of current `createCourse`:

1. Build `extractable` array (materials that aren't assignments/syllabi)
2. If none, show "course created" notification and return
3. Initialize `bgExtraction` state with all extractable materials
4. **Fire and forget:** launch `runBackgroundExtraction(courseId, extractable)` — do NOT await
5. `createCourse` returns immediately after launching Phase 2

### Pseudocode for the split

```js
const createCourse = async () => {
  // ... validation ...
  setGlobalLock({ message: "Creating course..." });
  try {
    // === PHASE 1 (blocking) ===
    const courseId = await Courses.create({ name: cName.trim() });
    // ... store docs, parse syllabi, mark assignment chunks ...

    setGlobalLock(null);  // Unblock UI
    setCourses(updated); setActive(newCourse); setFiles([]); setCName("");
    setScreen("materials");

    // === PHASE 2 (non-blocking) ===
    const extractable = mats.filter(m =>
      m.classification !== "assignment" && m.classification !== "syllabus"
      && (m.chunks || []).length > 0
    );
    if (extractable.length > 0) {
      addNotif("success", "Course created. Extracting skills in the background...");
      extractionCancelledRef.current = false;
      setBgExtraction({
        courseId,
        materials: extractable.map(m => ({
          id: m.id, name: m.name, status: 'pending',
          chaptersTotal: null, chaptersComplete: 0, error: null,
        })),
        startedAt: Date.now(),
      });
      // Fire-and-forget — no await
      runBackgroundExtraction(courseId, extractable);
    } else {
      addNotif("success", "Course created with " + mats.length + " material(s).");
    }
  } catch (err) {
    console.error("Course creation failed:", err);
    addNotif("error", "Course creation failed: " + err.message);
    setGlobalLock(null);
  } finally {
    setBusy(false); setStatus("");
  }
};
```

---

## 3. Background Extraction Runner

New function `runBackgroundExtraction` in `StudyContext.jsx`, defined inside `StudyProvider` (has access to state setters and refs):

```js
const runBackgroundExtraction = async (courseId, extractable) => {
  // Helper to update a single material's status in bgExtraction
  const updateMat = (matId, patch) => {
    setBgExtraction(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        materials: prev.materials.map(m =>
          m.id === matId ? { ...m, ...patch } : m
        ),
      };
    });
  };

  for (let i = 0; i < extractable.length; i++) {
    const mat = extractable[i];

    // Check cancellation between materials
    if (extractionCancelledRef.current) {
      // Mark remaining as skipped
      for (let j = i; j < extractable.length; j++) {
        updateMat(extractable[j].id, { status: 'skipped' });
      }
      addNotif("warn", "Extraction cancelled.");
      break;
    }

    updateMat(mat.id, { status: 'extracting' });
    setProcessingMatId(mat.id);
    setStatus("Extracting: " + mat.name + "...");

    try {
      const result = await runExtractionV2(courseId, mat.id, {
        onStatus: setStatus,
        onNotif: addNotif,
        onChapterComplete: (ch, cnt) => {
          updateMat(mat.id, { chaptersComplete: prev => prev + 1 });
          setStatus(mat.name + " — " + ch + ": " + cnt + " skills");
        },
      });

      if (result?.needsUserDecision) {
        // Pause this material — await user decision
        updateMat(mat.id, { status: 'awaiting_decision' });
        setDupPrompt({
          materialName: mat.name,
          dupSummary: result.dupSummary,
          resolve: null, // will be set by promise
        });

        const decision = await new Promise(resolve => {
          setDupPrompt(prev => ({ ...prev, resolve }));
        });
        setDupPrompt(null);

        if (decision === 'extract') {
          updateMat(mat.id, { status: 'extracting' });
          await runExtractionV2(courseId, mat.id, {
            onStatus: setStatus, onNotif: addNotif,
            onChapterComplete: (ch, cnt) => setStatus(mat.name + " — " + ch + ": " + cnt + " skills"),
          }, { skipNearDedupCheck: true });
          updateMat(mat.id, { status: 'done' });
        } else {
          const skippedIds = [...new Set(result.nearDuplicates.map(m => m.newChunkId))];
          await Chunks.updateStatusBatch(skippedIds, 'extracted');
          updateMat(mat.id, { status: 'skipped' });
          addNotif("info", "Skipped \"" + mat.name + "\" — matched existing content.");
        }
      } else {
        updateMat(mat.id, { status: 'done' });
      }
    } catch (e) {
      console.error("Background extraction failed for", mat.name, e);
      updateMat(mat.id, { status: 'error', error: e.message });
      // Error notification (same API detection logic as current)
      const errMsg = e.message || String(e);
      if (/API\s*(429|529|500|503)|overloaded|rate.?limit|service.?unavailable|failed.?to.?fetch|connection|ECONNREFUSED|timeout/i.test(errMsg)) {
        addNotif("error", "Claude API unavailable — " + mat.name + " was not processed.");
      } else {
        addNotif("warn", "Could not extract skills from " + mat.name + ": " + errMsg.substring(0, 120));
      }
    }
  }

  // Cleanup
  setProcessingMatId(null);
  setStatus("");
  const refreshed = await loadCoursesNested();
  const rc = refreshed.find(c => c.id === courseId);
  if (rc) { setCourses(refreshed); setActive(rc); }
  await refreshMaterialSkillCounts(courseId);

  // Clear bgExtraction after a brief delay (let UI show "done" state)
  setTimeout(() => setBgExtraction(null), 3000);
  addNotif("success", "Extraction complete.");
};
```

### Cancellation

The for-loop checks `extractionCancelledRef.current` between materials. Within a single material, the extraction pipeline runs to completion (current behavior). This is acceptable because:
- Each material's extraction is atomic (per-chapter transactions commit independently)
- Partial extraction of a material leaves it in a retryable state
- True mid-chapter cancellation would require threading the ref through `extraction.js`, which the orchestration plan prohibits modifying

### Error resilience

Each material is wrapped in its own try/catch. A failure on material N does NOT prevent material N+1 from being attempted. This is an improvement over the current sequential approach where a thrown error in the for-loop skips all remaining materials.

---

## 4. DupPrompt Without GlobalLockOverlay

### Current behavior
When `dupPrompt` is truthy AND `globalLock` is truthy, `GlobalLockOverlay` renders the dup decision UI instead of the spinner. The entire screen is replaced.

### New behavior
`dupPrompt` becomes a **standalone modal** — not dependent on `globalLock`. Two options:

**Option A (recommended): Render in `ScreenRouter` as a standalone overlay**

Add after line 77 in `ScreenRouter.jsx`:

```jsx
{dupPrompt && <DupPromptModal />}
```

Extract the dup decision UI from `GlobalLockOverlay.jsx` into a new component `DupPromptModal.jsx` (or inline in `GlobalLockOverlay.jsx` as a named export). It renders the same `position: fixed` overlay with the decision card, but is independent of `globalLock`.

This is preferred because:
- The dup decision IS blocking for that specific material (the extraction loop `await`s the promise)
- But it does NOT block the rest of the app — the user can still see MaterialsScreen behind the semi-transparent overlay
- The extraction of OTHER materials pauses at the `await` (sequential), which is correct — we need the decision before proceeding

**Option B: Inline in MaterialsScreen**

Render the dup decision as an inline card within the material's card on MaterialsScreen. Rejected because: the user may not be on MaterialsScreen when the prompt appears (they may have navigated to CurriculumScreen to study already-extracted skills).

### `GlobalLockOverlay` cleanup

After this change, `GlobalLockOverlay` only needs:
1. The spinner UI (for Phase 1 blocking)
2. The cancel + force-unlock buttons

Remove all `dupPrompt` rendering from `GlobalLockOverlay.jsx`. It becomes purely a "please wait" overlay for Phase 1.

---

## 5. Non-Blocking Progress Indicator

### Component: `ExtractionProgress`

A fixed-position banner/pill that shows extraction status. Renders in `ScreenRouter`.

### Where it renders

In `ScreenRouter.jsx`, after `UpdateBanner`:

```jsx
return (
  <>
    {updateInfo && <UpdateBanner />}
    {bgExtraction && screen !== "materials" && <ExtractionProgress />}
    <div key={screen} style={{ animation: "fadeIn 0.25s ease" }}>{content}</div>
  </>
);
```

**Visibility rule:** shown when `bgExtraction` is non-null AND the user is NOT on MaterialsScreen. When on MaterialsScreen, the inline per-material progress (existing `processingMatId` + `status`) provides the same information with more detail — no need for the banner.

### What it shows

```
┌──────────────────────────────────────────────────────────────┐
│  ⟳ Extracting skills: "Calc Textbook Ch3" (2/5 materials)   │  ← click to go to Materials
│  ████████░░░░░░░░  Chapter 4: 12 skills                     │
└──────────────────────────────────────────────────────────────┘
```

Fields:
- Material name (from `bgExtraction.materials.find(m => m.status === 'extracting')?.name`)
- Material progress: `completedCount / totalCount materials`
- Current status text (from `status` state)
- A thin progress bar (chapters complete / chapters total for current material, or materials complete / total)

### Styling

- `position: fixed`, `bottom: 16px`, `left: 50%`, `transform: translateX(-50%)`
- `zIndex: 100` (below modals at 2000, above content)
- Dark background with blur: `background: rgba(15,17,21,0.92)`, `backdropFilter: blur(8px)`
- Compact: `padding: "10px 20px"`, `borderRadius: 12`, `maxWidth: 480`
- Click handler: `onClick={() => setScreen("materials")}` — navigate to MaterialsScreen for full detail
- Cancel button (small "×" or "Cancel"): sets `extractionCancelledRef.current = true`

### Minimized state (optional, future)

For now, the banner is always shown at full size. A future enhancement could add a minimize toggle to collapse it to a small pill showing just "Extracting... (2/5)".

---

## 6. MaterialsScreen Retry Flow

### Current (lines 230–243)

```js
setGlobalLock({ message: "Retrying extraction..." });
// ... extraction ...
setGlobalLock(null);
```

### New

Replace with the same background pattern:

```js
onClick={async () => {
  if (bgExtraction || processingMatId) return;  // Already extracting
  extractionCancelledRef.current = false;
  setProcessingMatId(mat.id);
  setStatus("Retrying...");
  setBgExtraction({
    courseId: active.id,
    materials: [{ id: mat.id, name: mat.name, status: 'extracting',
                  chaptersTotal: null, chaptersComplete: 0, error: null }],
    startedAt: Date.now(),
  });
  try {
    await Chunks.resetForRetry(mat.id);
    const result = await runExtractionV2(active.id, mat.id, {
      onStatus: setStatus, onNotif: addNotif,
      onChapterComplete: (ch, cnt) => setStatus(mat.name + " — " + ch + ": " + cnt + " skills"),
    });
    const refreshed = await loadCoursesNested();
    const uc = refreshed.find(c => c.id === active.id);
    if (uc) { setCourses(refreshed); setActive(uc); }
    refreshMaterialSkillCounts(active.id);
    addNotif(result.success ? "success" : "warn",
      "Retry complete." + (result.totalSkills > 0 ? " " + result.totalSkills + " skills." : ""));
  } catch (e) { addNotif("error", "Retry failed: " + e.message); }
  finally {
    setProcessingMatId(null); setStatus("");
    setTimeout(() => setBgExtraction(null), 2000);
  }
}}
disabled={!!bgExtraction || !!processingMatId}
```

Key changes:
- No `globalLock` — user stays on MaterialsScreen with inline progress
- No `setBusy(true)` — chat remains available
- `bgExtraction` is set so the progress banner shows if user navigates away
- Button is disabled when any extraction is running (either background or retry)

### MaterialsScreen inline progress (already exists)

The existing progress display keyed on `processingMatId` + `status` continues to work. No changes needed to the progress bar, section count, or cancel button already in MaterialsScreen lines 220–252.

---

## 7. `busy` State Scope

### Decision: `busy` is chat-only

`busy` should only be `true` when the AI is actively streaming a response (set in `sendMessage`/`bootWithFocus`/`callClaudeStream`). It should NOT be set during extraction.

### Current violations to fix

1. **`createCourse` line 456:** `setBusy(true)` → remove this (Phase 2 is no longer blocking chat)
2. **`createCourse` finally line 571:** `setBusy(false)` → remove (was never set)
3. **Retry flow line 233:** `setBusy(true)` → remove
4. **Retry flow finally line 242:** `setBusy(false)` → remove

After these changes, `busy` is only toggled by:
- `sendMessage` (line 1026–1076) — set true before stream, false after
- `bootWithFocus` — set true during initial conversation setup
- Components that trigger inline extraction in study session (ChunkPicker, SkillPicker) — these correctly set `busy` because they block the chat while extracting within a study session

---

## 8. Summary of File Changes

| File | Changes |
|------|---------|
| `StudyContext.jsx` | Add `bgExtraction`/`setBgExtraction` state. Split `createCourse` into Phase 1 + Phase 2. Add `runBackgroundExtraction` function. Remove `setBusy` from extraction paths. Export `bgExtraction`, `setBgExtraction` in context value. |
| `GlobalLockOverlay.jsx` | Remove all `dupPrompt` rendering. Keep only spinner + cancel + force-unlock. |
| `ScreenRouter.jsx` | Import + render `ExtractionProgress` banner (when `bgExtraction && screen !== "materials"`). Import + render `DupPromptModal` (when `dupPrompt`). Remove the `if (globalLock) return <GlobalLockOverlay />` early return — instead render it as an overlay alongside content so Phase 1 lock still works but doesn't replace the screen. |
| `MaterialsScreen.jsx` | Retry flow: replace `globalLock` with `bgExtraction` pattern. Remove `setBusy`. Disable button on `bgExtraction \|\| processingMatId`. |
| **New:** `components/ExtractionProgress.jsx` | Fixed-bottom banner showing extraction status. Click navigates to MaterialsScreen. Cancel button. |
| **New:** `components/DupPromptModal.jsx` | Standalone modal for near-duplicate decision. Extracted from GlobalLockOverlay. |

### Files NOT changed (per constraints)
- `extraction.js` — data pipeline unchanged
- `skills.js` — `runExtractionV2` unchanged
- `db.js` — all DB modules unchanged

---

## 9. Edge Cases

### User creates another course while extraction is running
- `bgExtraction` tracks a single extraction session (one courseId). Creating a new course while extraction is running should be blocked — the upload screen should show "Extraction in progress" and disable the Create button when `bgExtraction` is non-null.

### User switches active course during extraction
- The extraction runs against a fixed `courseId`. Switching `active` course doesn't affect it. The progress banner remains visible regardless of which course is active. When the user navigates to MaterialsScreen for a DIFFERENT course, the banner still shows (because the banner checks `bgExtraction` not `processingMatId`).

### App refresh / crash during extraction
- On reload, `bgExtraction` is null (React state resets). The extraction promise is lost. However, the DB state is consistent — each chapter committed independently. The user can see partial extraction on MaterialsScreen and use the Retry button for unfinished sections. No special recovery logic needed.

### Multiple dupPrompt decisions
- Can only occur if multiple materials have near-duplicates. The sequential for-loop ensures only one `dupPrompt` is active at a time. The `await` in the loop pauses until the user decides.

### `extractionCancelledRef` race condition
- The ref is checked between materials (not mid-chapter). If the user cancels, the current material finishes its current chapter, then the loop breaks. This is acceptable — partial chapter data is committed independently.
