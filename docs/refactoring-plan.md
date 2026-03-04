# Plan: Split App.jsx into Modules

## Context
`src/App.jsx` is a 5,876-line monolith containing the entire app — database layer, API client, file parsers, skill extraction pipeline, practice engine, context builders, and all UI screens. We're splitting it into clean modules so each concern is isolated, testable, and navigable.

## Approach
Extract the ~2,700 lines of **pure utility functions** (defined outside the React component) into 7 service modules under `src/lib/`. The React component (`StudyInner`) stays in `App.jsx` with its state and UI — no React Context, no premature component extraction.

## New Files

| File | Lines from App.jsx | What it contains |
|------|-------------------|------------------|
| `src/lib/theme.js` | ~120 lines | `T` (colors), `CSS`, `renderMd`, `inl` |
| `src/lib/classify.js` | ~40 lines | `CLS`, `autoClassify`, `parseFailed` |
| `src/lib/db.js` | ~390 lines | `getApiKey`, `setApiKey`, `hasApiKey`, `DB` object, SQLite init |
| `src/lib/parsers.js` | ~510 lines | `readFile` + all format parsers (EPUB, DOCX, PPTX, Excel, etc.) |
| `src/lib/api.js` | ~195 lines | `callClaude`, `callClaudeStream`, `extractJSON`, model constants |
| `src/lib/skills.js` | ~700 lines | Skill extraction pipeline, verification, taxonomy, validation, assignment decomposition |
| `src/lib/study.js` | ~670 lines | Context building, journal, system prompt, skill calcs, practice engine |

**Result:** App.jsx shrinks from ~5,876 to ~3,200 lines (just the React component + ErrorBoundary).

## Dependency Graph (clean DAG, no cycles)
```
theme.js      (no deps)
classify.js   (no deps)
db.js         (@tauri-apps/plugin-sql)
parsers.js    (mammoth)
api.js        → db.js
skills.js     → db.js, api.js
study.js      → db.js, api.js, skills.js
App.jsx       → all of the above
```

## Execution Order (each step leaves the app working)

1. **Extract `theme.js` + `classify.js`** — leaf nodes, zero risk
2. **Extract `db.js`** — foundation module, no upstream deps
3. **Extract `parsers.js`** — standalone, no DB/API deps
4. **Extract `api.js`** — depends only on db.js
5. **Extract `skills.js`** — largest module, depends on db + api
6. **Extract `study.js`** — depends on db + api + skills
7. **Clean up App.jsx** — remove dead code, verify imports

## What We're NOT Doing
- No React Context — state lives in one component, context would add complexity for zero benefit
- No screen component extraction yet — each screen touches 10-30 state vars, prop drilling would be worse
- No barrel `index.js` — direct imports are clearer
- No function renames — pure move operation to minimize risk

## Verification
After each step: run `npm run tauri:dev`, verify the app loads, navigate all screens, test the affected functionality (upload files, create course, chat, practice mode).
