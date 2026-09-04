# CLI Backend QA Report — 2026-09-03

**Plan:** executable-584 — Add local Claude Code CLI as selectable model backend
**Branch:** bellows-wt/584
**CLI version:** 2.1.178 (matches diagnostic 583 pin)

## Deliverable verification

| Deliverable | Expected | Status | Evidence |
|---|---|---|---|
| toolchain.txt | Step 1 deposit with claude 2.1.178 | ✅ | evidence-cli-backend-2026-09-03/toolchain.txt |
| src-tauri/src/lib.rs | 5 commands + all in generate_handler! | ✅ | claude_cli_discover, claude_cli_probe, claude_cli_invoke, claude_cli_stream, claude_cli_cancel |
| src/lib/claudeCli.js | JS backend module | ✅ | resolveCliPath, discoverCliPath, testCliConnection, flattenMessages, parseResultJson, callClaudeCLI, callClaudeStreamCLI |
| src/lib/db.js | 4 new helpers | ✅ | getModelBackend, setModelBackend, getCliPath, setCliPath |
| src/lib/api.js | 2 CLI branches | ✅ | callClaude + callClaudeStream both check getModelBackend() |
| src/components/SettingsModal.jsx | CLI controls | ✅ | Backend toggle, CLI path input, Discover button, Test button |

## Mechanical checks

| Check | Result | Evidence |
|---|---|---|
| npm run build | ✅ pass (built in <2s) | evidence-cli-backend-2026-09-03/build.txt |
| npx eslint src/ | ✅ 118 problems, all pre-existing | evidence-cli-backend-2026-09-03/eslint.txt |
| cargo test | ✅ 1 passed, 0 failed | evidence-cli-backend-2026-09-03/cargo_test.txt |

ESLint note: 101 errors and 17 warnings are all pre-existing in files untouched by this plan (StudyContext.jsx, ScheduleScreen.jsx, etc.). Verified by stashing 584 changes and re-running eslint in a prior session — identical error set.

## Canary 1 — Buffered invoke

Exact `claude_cli_invoke` args from lib.rs: `-p --system-prompt <system> --tools "" --no-session-persistence --model haiku --output-format json`

- `is_error`: false ✅
- `result` field present with JSON content ✅
- `stop_reason`: "end_turn" ✅
- `extractJSON` parses the `result` field successfully ✅

Evidence: evidence-cli-backend-2026-09-03/canary_buffered.txt

## Canary 2 — Streaming invoke

Exact `claude_cli_stream` args from lib.rs: `-p --system-prompt <system> --tools "" --no-session-persistence --model haiku --output-format stream-json --include-partial-messages --verbose`

- text_delta count: 6 (>1 required for incremental streaming) ✅
- Accumulated text (2191 chars) matches terminal `result` field exactly ✅
- Stream is incremental — chat will receive progressive updates ✅

Evidence: evidence-cli-backend-2026-09-03/canary_stream.txt, canary_stream_raw.txt (129 lines NDJSON)

## Canary 3 — Environment isolation (diagnostic 583 invariant)

All three parts use `ANTHROPIC_API_KEY=sk-ant-bogus-key-12345` set INLINE (never exported).

| Part | What it tests | Result | Evidence |
|---|---|---|---|
| Part 1: cargo test | cli_env removes ANTHROPIC_API_KEY from child env | ✅ test passed | env_isolation.txt |
| Part 2: positive control | CLI reads bogus key and gets 401 (proves variable was set) | ✅ 401 received | env_isolation.txt |
| Part 3: end-to-end | With env removal (env -u mirrors cli_env), CLI falls back to subscription auth | ✅ is_error: false | env_isolation.txt |

The three parts together prove: the variable IS present (part 2 fails), cli_env removes it (part 1 passes), and the full pipeline succeeds when env removal is applied (part 3 passes).

Evidence: evidence-cli-backend-2026-09-03/env_isolation.txt

## Regression checks

- **api.js HTTP path**: diff shows only 4 line insertions (2 imports + 2 CLI branches) and 1 MODEL_SONNET substitution. All HTTP request code, headers, error handling byte-for-byte unchanged. ✅
- **capabilities/default.json**: `git diff --stat main` reports no changes — untouched as expected (finding 3: #[tauri::command] not gated by shell ACL). ✅

## Residual risks

1. **HTTP API path not live-tested.** The HTTP code path is verified by diff inspection and a successful build, NOT by a live API call, because QA does not hold the CEO's API key. The diff confirms the HTTP code is unchanged, but this is an argument from code review, not a measurement from execution.

2. **Settings UI not exercised.** The Settings modal (backend selector, CLI path input, Discover button, Test button) is verified only by eslint and a successful build. Nothing in this plan drives the modal — the selector, the Discover action, and the Test action are unexercised until the CEO opens Settings. This is a deliberate choice for a local-only, single-user feature rather than an oversight. The mitigating design fact is that `model_backend` defaults to `api` and the HTTP code path is unchanged, so an install that never touches the new setting behaves exactly as before — but that is an argument, not a measurement, and should not be read as equivalent to a test.

## Probe budget

| Call | Model | Purpose |
|---|---|---|
| 1 | haiku | Canary 1 — buffered invoke |
| 2 | haiku | Canary 2 — streaming invoke |
| 3 | haiku | Canary 3 part 2 — positive control (bogus key, 401) |
| 4 | haiku | Canary 3 part 3 — end-to-end with env removal |

4 of 6 budget used.

## verification

```
============================================================
Rule 20 — QA Self-Check Results
============================================================
PASSED — SELF-CHECK PASSED — all evidence files present, no hedging keywords found.
Evidence folder: /Users/marklehn/Developer/GitHub/study/.bellows-worktrees/584/knowledge/qa/evidence-cli-backend-2026-09-03/
Files verified: 7
```
