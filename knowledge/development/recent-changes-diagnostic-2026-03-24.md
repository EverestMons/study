# Recent Changes Diagnostic — 2026-03-24

## Command 1: `git log --oneline --since="2 days ago"`

```
4315573 chore: commit outstanding knowledge artifacts
5a3bbca chore: Bump version to v0.2.19
8c66d8a chore: move session-wrap plan to Done
f52f029 docs: PROJECT_STATUS.md session wrap 2026-03-24 — tutor feedback loop phases 1-4
7008fe4 chore: tutor phase 4 QA complete — move plan to Done, QA report, prompt feedback
1a541cc feat: tutor phase 4 — session summary writer, $APPDATA/tutor-sessions/ capability, _updateTutorSessionSummary()
46ef9fb docs: tutor phase 4 diagnostic complete
d3c33ac chore: status update + move tutor-phase3 plan to Done
a26a8d7 feat: tutor phase 3 — chunk teaching effectiveness feedback loop, updateChunkEffectiveness(), getByFacetRanked ordering update
2caed79 docs: tutor phase 3 diagnostic complete
cdafc10 chore: status update + move tutor-phase2 plan to Done
febf064 feat: tutor phase 2 — session_exchanges table, SessionExchanges module, loadFacetBasedContent returns chunkIds, per-facet exchange logging
8ca1ed0 chore: status update + move tutor-phase1 plan to Done
229bfee feat: tutor facet assessment block added to general context builder (recap + explore modes)
ec312ca chore: Bump version to v0.2.18
6f75931 chore: continue feature complete
0da617c feat: Continue Studying button on CourseHomepage — prerequisite-aware next skill
a2e31e5 docs: continue feature diagnostic
30e3976 chore: chunk relationships system complete
1f9193a feat: chunk prerequisite ordering — document order + skill link inference
12b0bde feat: section tree parsing + chunk position metadata in tutor context
a5d4595 feat: chunk relationships schema + MinHash similarity persistence
3066970 docs: chunk relationships SA blueprint
42c21a1 docs: chunk relationships diagnostic
7fec379 chore: token optimization complete
c99d357 feat: token optimization — model downgrades + batching + truncation + pre-filter
5ac62e0 docs: token usage diagnostic for extraction pipeline
6bdeb3d chore: clean navigation routes complete
a99bfda feat: navigation stack — strict hierarchy with back-always-pops
```

**Total: 29 commits in 2 days**

---

## Command 2: `git log --since="2 days ago" --stat --no-merges`

### commit 4315573 — Tue Mar 24 14:06:09 2026 -0500
**chore: commit outstanding knowledge artifacts**
```
 knowledge/KNOWLEDGE_INDEX.md                       |   42 +
 .../clean-routes-blueprint-2026-03-22.md           |  298 ++++
 ...ross-course-unification-blueprint-2026-03-22.md |  492 ++++++
 .../tutor-phase1-blueprint-2026-03-24.md           |  102 ++
 .../tutor-phase2-blueprint-2026-03-24.md           |  246 +++
 .../tutor-phase4-blueprint-2026-03-24.md           |  248 +++
 .../Done/diagnostic-chunk-metadata-2026-03-22.md   |   17 +
 .../Done/diagnostic-clean-routes-2026-03-22.md     |   17 +
 .../Done/diagnostic-continue-feature-2026-03-22.md |   17 +
 .../Done/diagnostic-dynamic-input-2026-03-22.md    |   17 +
 .../diagnostic-profile-skill-saving-2026-03-22.md  |   17 +
 .../Done/diagnostic-token-usage-2026-03-22.md      |   17 +
 ...xecutable-ies-prompt-enhancements-2026-03-22.md |   35 +
 .../Done/executable-study-doc-sync-2026-03-22.md   |   17 +
 ...ble-tutor-phase1-facet-assessment-2026-03-24.md |   48 +
 .../Done/facet-mastery-claude-code-prompts.md      |  391 +++++
 ...aterials-staging-ux-orchestration-2026-03-13.md |  245 +++
 .../roadmap-cross-course-unification-2026-03-22.md |  120 ++
 ...map-tutor-facet-grounded-teaching-2026-03-24.md |  107 ++
 .../decisions/Done/self-updater-orchestrator.md    |  263 ++++
 ...study-course-homepage-claude-code-prompts-v2.md |  260 ++++
 .../Done/study-skill-picker-redesign-prompts.md    |  150 ++
 .../executable-material-skills-menu-2026-03-22.md  |   44 -
 .../validation/tutor-phase1-uxv-2026-03-24.md      |   55 +
 .../development/tutor-phase1-dev-2026-03-24.md     |   59 +
 .../development/tutor-phase2-dev-2026-03-24.md     |   72 +
 .../tutor-phase2-diagnostic-2026-03-24.md          |  167 ++
 .../development/tutor-phase4-dev-2026-03-24.md     |   63 +
 knowledge/qa/tutor-phase1-qa-2026-03-24.md         |   48 +
 knowledge/research/ED498555.pdf                    |  Bin 0 -> 969465 bytes
 .../artifact-white-screen-debugging-guide.md       |  142 ++
 knowledge/research/prototype-v2.jsx                |  754 +++++++++
 .../research/review-of-elementary-search.pptx      |  Bin 0 -> 146833 bytes
 knowledge/research/study.jsx                       | 1614 ++++++++++++++++++++
 34 files changed, 6140 insertions(+), 44 deletions(-)
```

### commit 5a3bbca — Tue Mar 24 13:59:59 2026 -0500
**chore: Bump version to v0.2.19**
```
 package.json              | 2 +-
 src-tauri/Cargo.toml      | 2 +-
 src-tauri/tauri.conf.json | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)
```

### commit 8c66d8a — Tue Mar 24 13:59:02 2026 -0500
**chore: move session-wrap plan to Done**
```
 .../Done/executable-session-wrap-2026-03-24.md     | 30 ++++++++++++++++++++++
 1 file changed, 30 insertions(+)
```

### commit f52f029 — Tue Mar 24 13:58:32 2026 -0500
**docs: PROJECT_STATUS.md session wrap 2026-03-24 — tutor feedback loop phases 1-4**
```
 PROJECT_STATUS.md                                | 23 ++++++++++++++---------
 knowledge/development/session-wrap-2026-03-24.md | 19 +++++++++++++++++++
 knowledge/research/agent-prompt-feedback.md      | 17 +++++++++++++++++
 3 files changed, 50 insertions(+), 9 deletions(-)
```

### commit 7008fe4 — Tue Mar 24 13:51:32 2026 -0500
**chore: tutor phase 4 QA complete — move plan to Done, QA report, prompt feedback**
```
 PROJECT_STATUS.md                                  |  1 +
 ...able-tutor-phase4-forge-ingestion-2026-03-24.md | 48 +++++++++++++++++
 knowledge/qa/tutor-phase4-qa-2026-03-24.md         | 30 +++++++++++
 knowledge/research/agent-prompt-feedback.md        | 62 ++++++++++++++++++++++
 4 files changed, 141 insertions(+)
```

### commit 1a541cc — Tue Mar 24 13:25:06 2026 -0500
**feat: tutor phase 4 — session summary writer, $APPDATA/tutor-sessions/ capability, _updateTutorSessionSummary()**
```
 src-tauri/capabilities/default.json |  9 ++++--
 src/StudyContext.jsx                |  3 +-
 src/lib/study.js                    | 55 +++++++++++++++++++++++++++++++++++++
 3 files changed, 63 insertions(+), 4 deletions(-)
```

### commit 46ef9fb — Tue Mar 24 13:09:35 2026 -0500
**docs: tutor phase 4 diagnostic complete**
```
 .../Done/diagnostic-tutor-phase4-2026-03-24.md     |  30 ++++
 .../tutor-phase4-diagnostic-2026-03-24.md          | 169 +++++++++++++++++++++
 knowledge/research/agent-prompt-feedback.md        |  18 +++
 3 files changed, 217 insertions(+)
```

### commit d3c33ac — Tue Mar 24 13:03:17 2026 -0500
**chore: status update + move tutor-phase3 plan to Done**
```
 PROJECT_STATUS.md                                  |   1 +
 .../tutor-phase3-blueprint-2026-03-24.md           | 172 +++++++++++++++++++++
 ...-tutor-phase3-chunk-effectiveness-2026-03-24.md |  39 +++++
 .../development/tutor-phase3-dev-2026-03-24.md     |  72 +++++++++
 knowledge/qa/tutor-phase3-qa-2026-03-24.md         |  33 ++++
 knowledge/research/agent-prompt-feedback.md        |  43 ++++++
 6 files changed, 360 insertions(+)
```

### commit a26a8d7 — Tue Mar 24 13:00:47 2026 -0500
**feat: tutor phase 3 — chunk teaching effectiveness feedback loop, updateChunkEffectiveness(), getByFacetRanked ordering update**
```
 src/StudyContext.jsx |  3 ++-
 src/lib/db.js        | 22 ++++++++++++++++++++++
 src/lib/study.js     | 29 +++++++++++++++++++++++++++++
 3 files changed, 53 insertions(+), 1 deletion(-)
```

### commit 2caed79 — Tue Mar 24 12:42:46 2026 -0500
**docs: tutor phase 3 diagnostic complete**
```
 .../Done/diagnostic-tutor-phase3-2026-03-24.md     |  30 ++++
 .../tutor-phase3-diagnostic-2026-03-24.md          | 182 +++++++++++++++++++++
 knowledge/research/agent-prompt-feedback.md        |  17 ++
 3 files changed, 229 insertions(+)
```

### commit cdafc10 — Tue Mar 24 12:30:10 2026 -0500
**chore: status update + move tutor-phase2 plan to Done**
```
 PROJECT_STATUS.md                                  |   5 +-
 ...able-tutor-phase2-session-logging-2026-03-24.md |  39 +++++++
 knowledge/qa/tutor-phase2-qa-2026-03-24.md         |  29 ++++++
 knowledge/research/agent-prompt-feedback.md        | 116 +++++++++++++++++++++
 4 files changed, 188 insertions(+), 1 deletion(-)
```

### commit febf064 — Tue Mar 24 12:22:40 2026 -0500
**feat: tutor phase 2 — session_exchanges table, SessionExchanges module, loadFacetBasedContent returns chunkIds, per-facet exchange logging**
```
 src-tauri/migrations/010_session_exchanges.sql | 21 +++++++++
 src/StudyContext.jsx                           | 22 +++++++---
 src/lib/db.js                                  | 27 ++++++++++++
 src/lib/study.js                               | 60 +++++++++++++++++++-------
 4 files changed, 108 insertions(+), 22 deletions(-)
```

### commit 8ca1ed0 — Tue Mar 24 11:45:43 2026 -0500
**chore: status update + move tutor-phase1 plan to Done**
```
 PROJECT_STATUS.md | 1 +
 1 file changed, 1 insertion(+)
```

### commit 229bfee — Tue Mar 24 11:42:05 2026 -0500
**feat: tutor facet assessment block added to general context builder (recap + explore modes)**
```
 src/lib/study.js | 7 +++++++
 1 file changed, 7 insertions(+)
```

### commit ec312ca — Mon Mar 23 08:26:46 2026 -0500
**chore: Bump version to v0.2.18**
```
 package.json              | 2 +-
 src-tauri/Cargo.toml      | 2 +-
 src-tauri/tauri.conf.json | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)
```

### commit 6f75931 — Mon Mar 23 08:17:10 2026 -0500
**chore: continue feature complete**
```
 .../Done/executable-continue-feature-2026-03-22.md | 26 ++++++++
 knowledge/qa/continue-feature-qa-2026-03-22.md     | 69 ++++++++++++++++++++++
 2 files changed, 95 insertions(+)
```

### commit 0da617c — Mon Mar 23 08:16:01 2026 -0500
**feat: Continue Studying button on CourseHomepage — prerequisite-aware next skill**
```
 src/screens/CourseHomepage.jsx | 83 +++++++++++++++++++++++++++++++++++++++---
 1 file changed, 77 insertions(+), 6 deletions(-)
```

### commit a2e31e5 — Mon Mar 23 03:10:10 2026 -0500
**docs: continue feature diagnostic**
```
 .../continue-feature-diagnostic-2026-03-22.md      | 242 +++++++++++++++++++++
 1 file changed, 242 insertions(+)
```

### commit 30e3976 — Mon Mar 23 03:04:36 2026 -0500
**chore: chunk relationships system complete**
```
 .../executable-chunk-relationships-2026-03-22.md   | 53 ++++++++++++
 knowledge/qa/chunk-relationships-qa-2026-03-22.md  | 96 ++++++++++++++++++++++
 2 files changed, 149 insertions(+)
```

### commit 1f9193a — Mon Mar 23 03:02:12 2026 -0500
**feat: chunk prerequisite ordering — document order + skill link inference**
```
 src/lib/skills.js | 84 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/lib/study.js  | 20 +++++++++++--
 2 files changed, 100 insertions(+), 4 deletions(-)
```

### commit 12b0bde — Mon Mar 23 02:58:02 2026 -0500
**feat: section tree parsing + chunk position metadata in tutor context**
```
 src/lib/study.js | 144 ++++++++++++++++++++++++++++++++++++++++++++++++-------
 1 file changed, 126 insertions(+), 18 deletions(-)
```

### commit a5d4595 — Mon Mar 23 02:54:52 2026 -0500
**feat: chunk relationships schema + MinHash similarity persistence**
```
 src-tauri/migrations/009_chunk_relationships.sql | 25 +++++++
 src/lib/db.js                                    | 85 ++++++++++++++++++++++++
 src/lib/skills.js                                | 15 ++++-
 3 files changed, 124 insertions(+), 1 deletion(-)
```

### commit 3066970 — Mon Mar 23 02:48:23 2026 -0500
**docs: chunk relationships SA blueprint**
```
 .../chunk-relationships-blueprint-2026-03-22.md    | 502 +++++++++++++++++++++
 1 file changed, 502 insertions(+)
```

### commit 42c21a1 — Mon Mar 23 02:36:12 2026 -0500
**docs: chunk relationships diagnostic**
```
 .../Done/diagnostic-chunk-relationships-2026-03-22.md |  17 ++
 .../chunk-relationships-diagnostic-2026-03-22.md      | 198 +++++++++++++++++++++
 2 files changed, 215 insertions(+)
```

### commit 7fec379 — Mon Mar 23 02:28:49 2026 -0500
**chore: token optimization complete**
```
 .../executable-token-optimization-2026-03-22.md    | 26 +++++++++++
 knowledge/qa/token-optimization-qa-2026-03-22.md   | 53 ++++++++++++++++++++++
 2 files changed, 79 insertions(+)
```

### commit c99d357 — Mon Mar 23 02:24:27 2026 -0500
**feat: token optimization — model downgrades + batching + truncation + pre-filter**
```
 src/components/study/SkillsPanel.jsx |  2 +-
 src/lib/conceptLinks.js              | 12 +++++++++---
 src/lib/skills.js                    | 15 +++++++++++++--
 src/lib/study.js                     |  2 +-
 4 files changed, 24 insertions(+), 7 deletions(-)
```

### commit 5ac62e0 — Mon Mar 23 02:15:36 2026 -0500
**docs: token usage diagnostic for extraction pipeline**
```
 knowledge/research/agent-prompt-feedback.md        |  17 ++
 .../research/token-usage-diagnostic-2026-03-22.md  | 294 +++++++++++++++++++++
 2 files changed, 311 insertions(+)
```

### commit 6bdeb3d — Mon Mar 23 02:12:54 2026 -0500
**chore: clean navigation routes complete**
```
 .../Done/executable-clean-routes-2026-03-22.md     | 35 +++++++++
 knowledge/qa/clean-routes-qa-2026-03-22.md         | 86 ++++++++++++++++++++++
 src/screens/CurriculumScreen.jsx                   | 21 ++----
 src/screens/ManageScreen.jsx                       | 25 +------
 src/screens/ScheduleScreen.jsx                     | 14 +---
 5 files changed, 134 insertions(+), 47 deletions(-)
```

### commit a99bfda — Mon Mar 23 02:10:06 2026 -0500
**feat: navigation stack — strict hierarchy with back-always-pops**
```
 src/StudyContext.jsx                    | 30 +++++++++++++++++++++---------
 src/components/ErrorDisplay.jsx         |  4 ++--
 src/components/ExtractionProgress.jsx   |  4 ++--
 src/components/TopBarButtons.jsx        |  6 +++---
 src/components/study/SessionSummary.jsx |  7 +++----
 src/screens/CourseHomepage.jsx          | 10 +++++-----
 src/screens/CurriculumScreen.jsx        | 10 +++++-----
 src/screens/HomeScreen.jsx              |  4 ++--
 src/screens/ManageScreen.jsx            |  8 ++++----
 src/screens/MaterialsScreen.jsx         |  4 ++--
 src/screens/NotifsScreen.jsx            |  4 ++--
 src/screens/ProfileScreen.jsx           |  6 +++---
 src/screens/ScheduleScreen.jsx          |  6 +++---
 src/screens/SkillsScreen.jsx            |  4 ++--
 src/screens/StudyScreen.jsx             | 13 +++++--------
 src/screens/UploadScreen.jsx            |  4 ++--
 16 files changed, 66 insertions(+), 58 deletions(-)
```

---

## Summary

| Category | Count | Key commits |
|----------|-------|-------------|
| **feat** (code changes) | 12 | navigation stack, token optimization, chunk relationships (3), continue button, tutor phases 1-4 |
| **docs** (diagnostics, blueprints) | 8 | chunk relationships, continue feature, token usage, tutor phase 2-4 diagnostics |
| **chore** (version bumps, plan moves, QA) | 9 | v0.2.18 bump, v0.2.19 bump, session wrap, plan archival |

### Source files changed (non-knowledge)
| File | Commits touching it | Net change |
|------|-------------------|------------|
| `src/lib/study.js` | 7 | +422/-50 |
| `src/StudyContext.jsx` | 4 | +31/-17 |
| `src/lib/db.js` | 3 | +134/+0 |
| `src/lib/skills.js` | 3 | +114/-4 |
| `src/screens/CourseHomepage.jsx` | 2 | +87/-11 |
| `src/lib/conceptLinks.js` | 1 | +12/-3 |
| `src/components/study/SkillsPanel.jsx` | 1 | +2/-1 |
| `src-tauri/migrations/009_chunk_relationships.sql` | 1 | +25 (new) |
| `src-tauri/migrations/010_session_exchanges.sql` | 1 | +21 (new) |
| `src-tauri/capabilities/default.json` | 1 | +9/-4 |
| 16 screen/component files | 1 (navigation) | +66/-58 |
| 3 screens (lateral jump removal) | 1 | +134/-47 |

### Version progression
- v0.2.17 → v0.2.18 (Mon Mar 23 08:26) → v0.2.19 (Tue Mar 24 13:59)
- **v0.2.18 has no GitHub Release** (tag exists, no release created)
- **v0.2.19 is a Draft release** (not yet published)
- **v0.2.17 remains the latest published release**
