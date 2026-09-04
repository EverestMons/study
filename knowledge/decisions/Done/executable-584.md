# study — Local Claude Code CLI as a selectable model backend (additive, local-only)

**Date:** 2026-09-03 | **Tier:** Medium (feature) | **Dispatch Mode:** bellows | **cycle_tier:** T1 | **Test Scope:** study has no JS test suite (no pytest, no vitest; `package.json` exposes only dev/build/preview/tauri*) and this plan adds none — but Step 2 DOES add one Rust `#[cfg(test)]` test for the environment invariant, which Step 5 runs via `cargo test`. QA evidence is therefore `npm run build`, eslint, that one Rust test, and LIVE canary round trips against the real CLI | **Execution:** Steps 1-5 | **Priority:** 1

**qa_steps:** 5
**auto_close:** false
**pause_for_verdict:** after_qa_step

## Context

This plan **implements diagnostic 583** (`study/knowledge/research/claude-cli-backend-feasibility-2026-09-03.md`). It adds a second model backend to study: instead of `api.anthropic.com` with a stored API key, the app spawns the locally installed Claude Code CLI (`claude -p`), which authenticates against the CEO's claude.ai subscription.

**CEO direction (verbatim):** "accept slowdown. eventually we can mechanize some of this extraction so that it's not pure ai work. don't worry about importing any previous course material. let's just build this for me right now. don't worry about shipping out."

That resolves 583's three forks: **Fork 2 → accept the slowdown** (no hybrid; ~13.4 min for a full course import vs ~1.2-2.3 min on the API is accepted); **Fork 3 → local only** (no release gating, no build-time flag, no released-build security work). **Fork 1** the Planner resolved as **additive** and says so explicitly because it is a judgement call: "build this for me / don't worry about shipping out" removes the argument FOR a toggle but does not say "delete the API path," and deleting it is strictly more work than leaving it while destroying the only fallback if the CLI path misbehaves. So the API code is untouched and a setting selects the backend.

**Explicitly OUT of scope, and not to be re-scoped:** mechanizing any part of extraction so it is "not pure ai work" (a future arc the CEO named, deliberately not built here); importing or re-running any previously imported course material; any change to the extraction prompts, the FSRS scheduler, the PDF/OCR pipeline, or the API path's own behaviour; any release/packaging work.

**Findings this plan rests on (Rule 27 — cited from 583, not re-derived):**

1. **Seam.** `callClaude` (`src/lib/api.js:39`), `callClaudeStream` (`:80`), `testApiKey` (`:181`) are the only model egress; `api.anthropic.com` at `:45`, `:89`, `:184`. 13 call sites across 7 files, all sequential.
2. **Auth — the load-bearing finding.** The CLI prefers `ANTHROPIC_API_KEY` over OAuth **even without `--bare`**: with a bogus key it returns `is_error: true, api_error_status: 401` and does NOT fall back. Clean, `claude auth status` reports `authMethod: "claude.ai"`, `subscriptionType: "max"`. **Every spawn in this plan removes that variable from the child environment.** This is the single requirement whose omission silently defeats the entire feature.
3. **Transport.** Rust `#[tauri::command]` over `std::process::Command` — NOT `@tauri-apps/plugin-shell`. 583 disqualified the shell plugin from `src-tauri/gen/schemas/desktop-schema.json`: its scope `cmd` is a plain string (no glob, no interpolation from user settings) and `Command.create`'s `env` option MERGES with the inherited environment — there is no `env_remove`. **Consequence: `src-tauri/capabilities/default.json` needs NO change** — a `#[tauri::command]` is not gated by the shell ACL. Do not edit that file.
4. **Discovery.** `launchctl getenv PATH` is empty; a Finder-launched `.app` does not see `/opt/homebrew/bin`. What PATH a packaged `.app` sees at runtime was INCONCLUSIVE in 583. **Therefore nothing in this plan may depend on `PATH`** — always spawn an absolute path.
5. **JSON survives.** All three reconstructed extraction prompts returned valid JSON in ```` ```json ```` fences, which `extractJSON` already strips. `--json-schema` was evaluated and rejected (it also requires `--input-format=stream-json`).
6. **Models.** Pass aliases `--model sonnet` / `--model haiku`.

**⚠️ PLANNER CORRECTION to 583, carried with its own evidence.** 583's Q5 streaming invocation and its V5 verification block are **wrong in effect**: the command they recommend omits `--include-partial-messages`, which yields exactly two `assistant` events — one empty, one complete — so the text arrives in one lump and the tutor chat would not stream at all. Measured by the Planner at authoring on 583's own recommended command: `total assistant events: 2`. With `--include-partial-messages` added, a 200-word generation produced `text_delta count: 12`. **The correct streaming envelope is `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}}`.** This is flagged as a correction rather than folded in silently because Rule 27 forbids drifting from a diagnostic's stated evidence; Step 1 re-verifies it before building on it. A welcome consequence: `callClaudeStream` ALREADY accumulates `content_block_delta`/`text_delta`, so only the envelope changes (SSE `data:` lines → NDJSON with a `stream_event` wrapper) and the accumulation logic transfers.

**Known map (Planner claims — re-read at current HEAD and correct if wrong; never recall):** `src/lib/api.js` (`:22-23` model constants, `:39` `callClaude`, `:80` `callClaudeStream` with the sonnet id hardcoded inline at `:98`, `:181` `testApiKey`, plus `extractJSON` and `isApiError`); `src/lib/db.js:107` `getApiKey` / `:120` `hasApiKey`, and the `getSetting`/`setSetting` helpers alongside them; `src/components/SettingsModal.jsx` (API-key UI and its Test button, ~`:62-73`); `src/StudyContext.jsx:1234`/`:1314` (the two streaming callers, `:1314` passing `chatMsgs`); `src-tauri/src/lib.rs` (`:5` the sole `#[tauri::command]` `greet`, `:81` shell plugin init, `:91` `.invoke_handler(tauri::generate_handler![greet])`); `src-tauri/Cargo.toml:17`. Full measured pin: `study/knowledge/research/walk-register-cli-backend-exec-2026-09-03.md` § Walk 0.

## Drafting Cycle
**Tier:** T1 — triggers: T-1 (five files across the Rust, JS-lib and UI subsystems), T-3 (spawning a local CLI process is an execution environment nothing in study has run in), T-8 (novel pattern). T-5/T-6 do not fire (additive; no deletion, no doctrine edit) → no cold panel. T-2 does not fire: the two new settings are rows in the existing `settings` table, so **no SQL migration and no new file in `src-tauri/migrations/`**.
**Walk 0 (context pin):** `study/knowledge/research/walk-register-cli-backend-exec-2026-09-03.md` — eleven pins including the two Planner streaming probes that correct 583's V5. Clone-diff: the nearest same-class shipped work is the existing `api.js` HTTP backend itself, which this mirrors behind the same two function signatures; the highest-risk inheritance is `callClaudeStream`'s timeout/abort structure, which must become process-kill rather than `AbortController`.
**Walk register:** `/Users/marklehn/Developer/GitHub/study/knowledge/research/walk-register-cli-backend-exec-2026-09-03.md`
**Direction verdict (after walk 1):** **PROCEED** — the shape (Rust transport → JS backend + branching → Settings UI → QA) held under all five lenses; walk 1's findings changed a mechanism inside that shape, not the shape. It was four steps at walk 1 and is five now — walk 4 promoted a worktree-preparation step ahead of them, which is a restructuring recorded in the walk register, not a change of direction. No CEO fork is open: 583's three forks were all resolved by the CEO's direction, and Fork 1's additive reading is stated in the Context with its reasoning.
**Walks:** 12. ⚠️ Walks 5-10 each found one or two items that were damage from the previous walk's fold — the circling signature. From walk 11 the method changed: every finding is swept by CLASS across the whole artifact with post-sweep grep counts reported, rather than spot-fixed at the site where it was noticed. ⚠️ `cycle_check` returned `ESCALATE:yield-rising` after walk 2 (instruction 3 → 4); recorded, judged benign in kind (walk 1 was shallow on the transport mechanism and three of walk 2's four findings repaired w1-1's own fold), and continued under the CEO's standing go on the stated condition that a SECOND consecutive rise stops the cycle. Walk 3 fell to 3.
- **Weak spots (1.4):** w1 1 folded; w2 2 folded; w3 1 folded; w4 1 folded; w5 1 folded; w6 1 folded; w7 1 folded; w8 1 folded; w9 1 folded; w10 1 folded; w11 1 folded; w12 dry
- **Destruction (2.4):** w1 1 folded; w2 dry; w3 1 folded; w4 1 folded; w5 dry; w6 dry; w7 dry; w8 dry; w9 dry; w10 dry; w11 dry; w12 dry
- **Vulnerabilities (3.1):** w1 1 folded; w2 1 folded; w3 dry; w4 1 folded; w5 dry; w6 1 folded; w7 dry; w8 dry; w9 dry; w10 dry; w11 dry; w12 dry
- **Integration-record:** w1 dry; w2 dry; w3 1 folded; w4 1 folded; w5 1 folded; w6 1 folded; w7 1 folded; w8 1 folded; w9 dry; w10 dry; w11 1 folded; w12 1 folded
- **ACID (5.2):** w1 1 folded; w2 1 folded; w3 dry; w4 dry; w5 1 folded; w6 1 folded; w7 dry; w8 dry; w9 dry; w10 dry; w11 dry; w12 dry

Per-finding detail — sub-question, pre-fold text, origin and resolution — lives in the committed walk register named above; §3 keeps this log compact.

**Walk 1 STATUS:** 4 folded — instruction 3 / record 1
**Walk 2 STATUS:** 4 folded — instruction 4 / record 0 (3 of 4 fold-introduced by w1-1; yield rose because walk 1 was shallow on the transport mechanism)
**Walk 3 STATUS:** 3 folded — instruction 3 / record 0 (2 of 3 fold-introduced; yield fell, the escalation did not repeat)
**Walk 4 STATUS:** 4 folded — instruction 4 / record 0 (axis changed to the execution environment; contains a RESTRUCTURING fold — the Step 1 promotion — so the clock resets and this walk cannot meet the bar)
**Walk 5 STATUS:** 3 folded — instruction 3 / record 0 (first pass over the new arrangement; all 3 fold-introduced by walk 4, and w5-1 caught that the promoted step was numbered STEP 0, which bellows.py:1111 never executes)
**Walk 6 STATUS:** 4 folded — instruction 4 / record 0 (4 of 4 fold-introduced; w6-1 caught that the load-bearing env test could not have been written as specified, and w6-2 that its setup would have poisoned the other two canaries)
**Walk 7 STATUS:** 2 folded — instruction 2 / record 0 (yield fell 4 → 2; three of five lenses dry)
**Walk 8 STATUS:** 2 folded — instruction 2 / record 0 (both pre-existing gaps between the Rust and JS halves; three of five lenses dry)
**Walk 9 STATUS:** 1 folded — instruction 1 / record 0 (four of five lenses dry)
**Walk 10 STATUS:** 1 folded — instruction 1 / record 0 (four of five lenses dry)
**Walk 11 STATUS:** 2 folded — instruction 2 / record 0 (both fold-introduced; swept by class with post-sweep grep counts)
**Walk 12 STATUS:** 1 folded — instruction 0 / record 1 — BAR MET (four of five lenses dry; the single finding was a stale step-count in the direction verdict)
**Conflicts:** none.
**§5 Conformance (mechanical, at shape stability — walk 12):** `grep -c '^## STEP '` = **5**, matching `Execution: Steps 1-5` and the five headers numbered 1-5 (walk 5 caught these numbered 0-4, which `bellows.py:1111` would never have started). `plan_lint` exit 0 with 14 PASS / 0 FAIL, including `(a) pause_for_verdict — after_qa_step`, `(c) QA banner pair`, per-step `(b)` deposits (1/3/1/7) and `(d)` scopes. Residual WARNs, each judged and none a plan defect: two "mentions tests but declares no test scope" (the check looks for `test_*.py`/`tests/`, which this JavaScript project has none of — the Rust test this plan adds is not in that shape), and the `(o2)` Deposits-form warnings caused by `plan_lint`'s `KNOWN_PROJECTS` set omitting `study` (a tool gap; the runtime `deposit_exists` gate resolves the `study/`-prefixed form via its parent-relative strategy). `walk_register_lint`: **CONFORMANT** across all twelve walk tables. `fold_check`: clean, re-baselined twice for intended changes (w2-5's path prefixes, and the Closing-line addition). Class sweeps from walk 11 re-run at close: `shared argument-builder` = 0, leaking `cd <path> &&` = 0 (one intended subshell), `## STEP 0` = 0. Deposit path `study/knowledge/decisions/` holds only `Done/` — deposit-once.
**Closing:** walk 12 dry across Weak spots, Destruction, Vulnerabilities and ACID; its single finding was record-class — a stale "four-step shape" in the direction verdict that walk 4's step promotion had outdated, changing nothing an agent does. Bar MET: instruction 0 / record 1. No restructuring fold on the closing walk. ⚠️ **Reported rather than smoothed: `cycle_check` escalated `yield-rising` four times (after walks 2, 4, 6 and 11), and walks 5-11 were dominated by damage from prior walks' folds — the circling signature. The cycle closed on a method change, not on exhaustion: walk 11 began sweeping each finding by CLASS across the whole artifact with post-sweep grep counts, and walk 12 found no instruction-class residue. The escalations and the circling are in the CEO's report, not buried here.** Twelve walks, 27 findings, 25 instruction-class, 2 record-class. Deposit exactly once into `study/knowledge/decisions/` as `ready-executable-draft-<HHMMSS>.md`.

---

## STEP 1 — WORKTREE PREPARATION (DEV)

**Scope:**
- `knowledge/qa/`

**Deposits:**
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/toolchain.txt`

---

> **Identity:** You are preparing the build environment. **This step writes no SOURCE file** — its only commit is the one evidence file in item 3. It exists because every later step's verification depends on toolchain state that a Bellows worktree does not have.
>
> `study/.gitignore` excludes `node_modules/`, `dist/` and `src-tauri/target/`, and none of them are tracked (verified by the Planner: `git ls-files node_modules` and `git ls-files src-tauri/target` both return zero). **So a fresh worktree has no JS dependencies and no Rust build cache**, and `npm run build`, `npx eslint`, `cargo check` and `cargo test` — which Steps 2-5 all rely on — would fail or run cold.
>
> 1. If `node_modules/` is absent, run `npm ci` (a `package-lock.json` is committed, so `ci` is correct and reproducible). Expect a few minutes.
> 2. Warm the Rust build once: `cargo check --manifest-path src-tauri/Cargo.toml` — use the manifest flag rather than `cd src-tauri &&`, since a `cd` leaks into every later command in the session and has silently mis-targeted commands in this shop before. A cold Tauri dependency tree is a long compile — **this is the single longest operation in the plan**, and Bellows enforces `step_inactivity_timeout_seconds: 600` and `step_timeout_seconds: 2400`. Cargo prints progress continuously so the inactivity timer should not fire, but if this step times out, say so plainly rather than retrying blindly: the correct response is a re-dispatch, not a second cold build inside the same step.
> 3. Write the versions you have — `node --version`, `npm --version`, `cargo --version`, `claude --version` — as raw output to `knowledge/qa/evidence-cli-backend-2026-09-03/toolchain.txt`, creating that directory. **This is the step's only committed artifact and it exists on purpose:** a step that changes no tracked file leaves the deposit gate nothing to see and reads as a no-op, and the `claude --version` line is the pin every one of diagnostic 583's verification blocks hangs on — Step 5 compares against it.
>
> Change no source file. `git add` and `git commit` that one evidence file and nothing else; no `git push`.

---

## STEP 2 — RUST CLI TRANSPORT (DEV)

**Scope:**
- `src-tauri/src/lib.rs`

**Deposits:**
- `study/src-tauri/src/lib.rs`

---

> **Identity:** You are adding a Rust transport that lets the webview spawn the local Claude Code CLI. **This step touches `src-tauri/src/lib.rs` and nothing else.** Do NOT edit `capabilities/default.json` (finding 3 above: a `#[tauri::command]` is not gated by the shell ACL, so no capability change is needed and adding one would widen the surface for no reason). Do NOT add a Cargo dependency — `std::process` is stdlib. Every file:line below is a Planner CLAIM; re-read at current HEAD and correct it if wrong.
>
> **Pre-edit verification (run first and paste the output).** A version difference is NOT a stop — items 2-4 are how you re-establish the shapes for whatever version is installed. **Stop and report only if items 2-4 themselves disagree with what is described**, because then the invocation contract this plan is built on no longer holds and the plan needs rewriting rather than executing.
> 1. `claude --version` — 583's blocks are pinned to `2.1.178`. If it differs, say so and treat items 2-4 as re-measurement rather than confirmation; proceed on what you measure.
> 2. Buffered shape (run probes outside the repo so `CLAUDE.md` is not picked up — use a SUBSHELL, `(cd /tmp && …)`, so the directory change does not leak into your later commands): `(cd /tmp && claude -p "Say PONG" --system-prompt "Be terse." --tools "" --no-session-persistence --output-format json --model haiku)` → confirm one JSON object with the assistant text in `result`, plus `is_error`, `api_error_status`, `stop_reason`.
> 3. **Streaming shape (this is the Planner's correction to 583 — verify it yourself):** run the same call with `--output-format stream-json --include-partial-messages --verbose` and a prompt long enough to produce several hundred characters. Confirm you receive MULTIPLE lines of the form `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}}`. Then run it WITHOUT `--include-partial-messages` and confirm you get only two `assistant` events with no incremental text. If the flag turns out not to be required, say so and use the simpler form — but do not assume it.
> 4. `ANTHROPIC_API_KEY=sk-ant-bogus claude -p "Say PONG" --tools "" --no-session-persistence --output-format json --model haiku` → confirm `is_error: true`, `api_error_status: 401`. This is the behaviour `.env_remove` exists to defeat; see it once with your own eyes.
>
> **Build FIVE commands in `src-tauri/src/lib.rs` — `claude_cli_discover`, `claude_cli_probe`, `claude_cli_invoke`, `claude_cli_stream`, `claude_cli_cancel` — and register every one of them in `.invoke_handler(tauri::generate_handler![...])` alongside the existing `greet` (:91).** A command that is written but not registered is invisible to the webview and fails at runtime, not at compile time — check the handler list before you finish.
>
> **The invariant that governs every command that SPAWNS** (`claude_cli_probe`, `claude_cli_invoke`, `claude_cli_stream` — `claude_cli_discover` only stats paths and `claude_cli_cancel` only kills, so neither builds a Command)**:** every `std::process::Command` this step constructs calls `.env_remove("ANTHROPIC_API_KEY")` before spawning. Write it once in the shared ENVIRONMENT builder described below (not the argument builder — they are separate functions for the reason given there) so no future command can be added without it, and put a comment on that line naming diagnostic 583 as the reason. Also `.env_remove("ANTHROPIC_AUTH_TOKEN")` and `.env_remove("ANTHROPIC_BASE_URL")` on the same principle — a redirected base URL would defeat the subscription just as thoroughly as a key. Never rely on `PATH`: always spawn the absolute path the caller supplies (finding 4).
>
> **`claude_cli_discover() -> Option<String>`** — try, in order, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, and `$HOME/.claude/local/claude` (resolve `$HOME` in Rust via `std::env::var("HOME")`, not by shelling out). Return the first that exists and is executable. Return `None` rather than erroring when none is found.
>
> **`claude_cli_probe(path: String)`** — run `<path> --version`, then `<path> auth status`. Return a struct carrying the version string, whether login succeeded, the auth method, and the subscription type, plus a normalized `status` of exactly one of `ok` / `not_found` / `not_logged_in` / `error` with a human-readable message. Distinguish the three failure modes properly: a spawn failure with `ErrorKind::NotFound` is `not_found`; a successful spawn whose `auth status` reports not-logged-in is `not_logged_in`. `auth status` emits JSON — parse it if it parses, and degrade to the raw text rather than failing if it does not.
>
> **`claude_cli_invoke(path, system, prompt, model)`** — buffered. **The prompt goes on STDIN, never in argv.** Study's extraction prompts carry whole document chunks — the sub-batching in `extraction.js` splits at 30,000 characters of formatted content, and a chunk that size passed as a command-line argument runs at the OS argument-length limit (macOS `ARG_MAX`, shared by args AND environment); it would fail for large materials while working perfectly on every small test. So: write the prompt to the child's stdin and close it, and pass only `--system-prompt <system> --tools "" --no-session-persistence --output-format json --model <model>` as args, with a bare `-p` and no positional prompt. The Planner verified this form works: `echo "…" | claude -p --tools "" --model sonnet --system-prompt "…" --output-format json` returned a normal result. Spawn with `Stdio::piped()` on stdin as well as stdout. **The system prompt is the other half of the same input-size problem** — study's tutor system prompt carries course context and runs to tens of kilobytes, which is comfortably under the limit today but shares the same budget. `claude --help` documents a `--system-prompt-file` form; confirm it exists at the installed version, and use it when the system prompt exceeds 100,000 characters, keeping the plain `--system-prompt` argument below that. **That temp file holds the user's course material**, so create it in the OS temp directory (`std::env::temp_dir()`, never inside the repo or `$APPDATA`) with a unique name, and delete it on EVERY exit path — success, spawn failure, and cancellation alike. A residue file of someone's coursework left in a shared temp directory is a real cost for a feature whose entire point is keeping the work local. If the flag does not exist at this version, say so and keep argv. Return the child's raw stdout as a `String` and let JavaScript parse it (the JSON shape belongs in one place, and Step 3 owns it). On a non-zero exit with unparseable stdout, return `Err` carrying stderr, truncated to something sane.
>
> **`claude_cli_stream(app, path, system, prompt, model, request_id)`** — **the same STDIN discipline as `claude_cli_invoke`** (prompt on stdin, bare `-p`, no positional argument — "same args" means the flags, and the stdin rule applies here too), plus `--output-format stream-json --include-partial-messages --verbose`, and NOT `--output-format json`. Spawn with `Stdio::piped()` on stdin AND stdout, read stdout **line by line** with a `BufReader` on a spawned thread, and for each line emit a Tauri event the webview can listen to: carry the `request_id` in the payload so two concurrent calls cannot cross-talk. Emit the raw line and let JavaScript do the JSON parsing — again, one parser, in Step 3. Emit a distinct terminal event when the child exits, carrying the exit status, and a distinct error event on spawn failure. **Buffer boundaries are not line boundaries:** read with `lines()` over a `BufReader`, never a fixed-size read, or a delta will be split mid-JSON and silently dropped.
>
> **Factor construction into TWO functions, not one: an environment builder and an argument builder.** They must be separable, because Step 5 tests the environment invariant by applying the environment builder to a bare `/usr/bin/env` and asserting the variable is absent from its output — and `/usr/bin/env` given claude's own flags (`-p`, `--system-prompt`, …) would try to execute them and fail, so a single combined builder cannot be tested that way. Make both reachable from a `#[cfg(test)]` test: `fn cli_env(cmd: &mut Command)` applying every `env_remove` — this is the single place the invariant above lives — and a separate argument builder. All three spawning commands call both.
>
> **Do not deadlock on stdin.** Writing a large prompt to the child's stdin while nothing drains its stdout can block both processes once the pipe buffers fill — and like the `ARG_MAX` problem this only bites on the large inputs the feature exists to handle. Write stdin from a dedicated thread (or write and drop the handle before you begin reading stdout), and close stdin explicitly when the prompt is written; a child that never sees EOF on stdin will wait forever. This applies to BOTH `claude_cli_invoke` and `claude_cli_stream`.
>
> **`claude_cli_cancel(request_id)`** — kill the child for that id. Hold the children in a `Mutex<HashMap<String, Child>>` in Tauri managed state — and **register it with `.manage(...)` on the builder**. Like an unregistered command, unmanaged state compiles fine and fails at runtime when Tauri cannot resolve the `State<'_, …>` parameter; `grep -n '\.manage(' src/lib.rs` must return it. Remove each entry when its child exits so the map cannot grow without bound across a long session. Cancelling an id that is not present is a no-op returning `Ok`, not an error — the process may simply have finished first, and that is a race the UI will lose regularly.
>
> **Verify before reporting complete:** `cargo check --manifest-path src-tauri/Cargo.toml` passes with no errors; `grep -n 'generate_handler' src/lib.rs` shows all five new commands plus `greet`; `grep -c 'env_remove("ANTHROPIC_API_KEY")' src/lib.rs` is at least 1 and sits inside `cli_env`, not duplicated per command. Commit with `git add` and `git commit` only — no `git push`.

---

## STEP 3 — JS BACKEND MODULE AND api.js BRANCHING (DEV)

**Scope:**
- `src/lib/claudeCli.js`
- `src/lib/api.js`
- `src/lib/db.js`

**Deposits:**
- `study/src/lib/claudeCli.js`
- `study/src/lib/api.js`
- `study/src/lib/db.js`

---

> **Identity:** You are adding the JavaScript half of the CLI backend and branching the two existing entry points onto it. The API path's behaviour must be **byte-for-byte unchanged** when the backend setting is `api`. Every file:line below is a Planner CLAIM; re-read at current HEAD.
>
> **Settings (`src/lib/db.js`).** Two new keys in the existing `settings` table, using the `getSetting`/`setSetting` helpers that already live beside `getApiKey` (`:107`): `model_backend` (`"api"` | `"cli"`, **defaulting to `"api"` when unset**) and `claude_cli_path` (absolute path string, empty when unset). **No SQL migration and no new file in `src-tauri/migrations/`** — these are rows, not schema. Export `getModelBackend`/`setModelBackend` and `getCliPath`/`setCliPath` in the style of the existing helpers.
>
> **New module `src/lib/claudeCli.js`.** It owns the CLI JSON contract; `api.js` stays thin.
> - `resolveCliPath()` — the stored `claude_cli_path` if set, else `claude_cli_discover()`, else `null`.
> - **When `resolveCliPath()` yields nothing, or a spawn fails, RETURN an `"Error: "`-prefixed string — never throw.** All thirteen call sites consume a string and test it with `isApiError` (`api.js`), which matches that prefix; an exception takes a different path through every one of them and turns a configurable-settings problem into a crash. The message must be actionable — that the Claude CLI was not found and a path can be set in Settings — because it is what the user will actually see. The same rule applies to the streaming function: report the error through `onChunk`/the return value in the shape `callClaudeStream` already uses.
> - `flattenMessages(messages)` — 583 Q7's adopted mapping. A single-element array becomes the bare content string with no decoration. A multi-turn array becomes a `CONVERSATION HISTORY:` block of `User:`/`Assistant:` lines, a `---` separator, then `Current message: <latest user content>`. Only `StudyContext.jsx:1314` (`chatMsgs`, up to 40 messages) ever takes the second path — the other twelve sites pass one element, so the common path must stay undecorated or every extraction prompt gains a wrapper it never had.
> - `parseResultJson(stdout)` — parse the buffered object; return the `result` text. Preserve the existing truncation behaviour from `callClaude`: when `stop_reason === "max_tokens"`, append the same `"\n\n[Response may be incomplete — output limit reached]"` suffix the HTTP path appends, so downstream consumers see no difference. On `is_error: true`, return an `"Error: "`-prefixed string carrying `api_error_status` and the message — `isApiError` (`api.js`) tests that prefix and thirteen call sites depend on it.
> - `callClaudeCLI(system, messages, maxTokens, useHaiku)` — resolve the path, invoke `claude_cli_invoke`, map `useHaiku` to `--model haiku` else `--model sonnet` (aliases, not pinned ids), return the text. **`maxTokens` has no CLI equivalent and is accepted and ignored** — say so in a comment at the parameter, because a silently dropped argument is exactly the kind of thing that reads as a bug later.
> - `callClaudeStreamCLI(system, messages, onChunk, maxTokens)` — generate a `request_id` (`crypto.randomUUID()`), subscribe to the events Step 2 emits **filtered by that id**, **`await` the listener registration before invoking anything** — Tauri's `listen()` returns a Promise of an unlisten function, and invoking the command first means the earliest deltas are emitted before anyone is listening and are lost silently, which reads as a model that starts mid-sentence — then call `claude_cli_stream`, and for each line parse the NDJSON and accumulate: `type === "stream_event"` → `event.type === "content_block_delta"` → `delta.type === "text_delta"` → append `delta.text` and call `onChunk(full)` with the CUMULATIVE string, matching the existing HTTP contract exactly (`api.js` calls `onChunk(full)`, not `onChunk(delta)`). Ignore `system`, `assistant`, `rate_limit_event` and `result` lines for text purposes, but read `result` for the terminal `stop_reason` and apply the same max-tokens suffix. **Always unsubscribe the listener** — on success, on error, and on cancel — or a long session accumulates a listener per message sent.
> - Port both timeouts from `callClaudeStream`: the 2-minute overall abort and the 30-second stall timer. Both now call `claude_cli_cancel(request_id)` instead of `AbortController.abort()`, and both keep the existing user-visible strings so the UI reads identically.
> - `discoverCliPath()` — wraps the `claude_cli_discover` command so the UI never invokes a Rust command directly; returns the discovered absolute path or `null`.
> - `testCliConnection(path)` — wraps `claude_cli_probe`; returns `{valid, version, authMethod, subscriptionType, error}` shaped to mirror `testApiKey`'s `{valid, error}` so Step 4's UI can treat them alike.
>
> **`src/lib/api.js` branching.** At the top of `callClaude` (`:39`) and `callClaudeStream` (`:80`), read the backend setting and delegate to the CLI functions when it is `"cli"`; otherwise fall through to the existing HTTP code **unchanged**. Do not restructure the HTTP path, do not re-indent it, and do not "tidy" it — a diff that touches those lines makes the no-behaviour-change claim unverifiable. In CLI mode the `getApiKey` check must NOT run: an empty API key is not an error when the backend is the CLI, and leaving that guard in place would return `"Error: No API key set…"` before any CLI call happens. **One in-passing fix, licensed because this step is already editing the function:** `callClaudeStream` hardcodes `"claude-sonnet-4-20250514"` inline at `:98` instead of `MODEL_SONNET` (`:22`) — replace the literal with the constant. Change nothing else in that request body.
>
> **Verify before reporting complete:** `npx eslint src/lib/claudeCli.js src/lib/api.js src/lib/db.js` is clean; `npm run build` succeeds; `git diff src/lib/api.js` shows ONLY the branch insertions, the API-key-guard scoping and the one constant substitution — paste that diff in the receipt. Commit with `git add` and `git commit` only — no `git push`.

---

## STEP 4 — SETTINGS UI (DEV)

**Scope:**
- `src/components/SettingsModal.jsx`

**Deposits:**
- `study/src/components/SettingsModal.jsx`

---

> **Identity:** You are adding the backend selector and CLI path controls to the existing settings modal. This step touches `src/components/SettingsModal.jsx` only. Match the file's existing style — it is plain React with inline handlers and no component library; do not introduce one, and do not restyle the existing API-key section.
>
> **Add a "Model backend" selector** with two options, "Anthropic API key" and "Claude Code CLI (local subscription)", bound to `getModelBackend`/`setModelBackend`. The existing API-key field stays exactly as it is and remains usable regardless of the selection — it is the fallback, and hiding it would strand the CEO if the CLI path misbehaves.
>
> **When "Claude Code CLI" is selected, reveal:** a "CLI path" text input bound to `getCliPath`/`setCliPath`; a **Discover** action calling `discoverCliPath()` from `src/lib/claudeCli.js` — go through that module, never `invoke()` a Rust command straight from the component, so the CLI contract stays in one file — that fills the field with the first candidate found and says plainly when it finds none; and a **Test** action calling `testCliConnection(path)`, placed and styled to mirror the existing API-key Test button around `:62-73`. On success report the version, the auth method and the subscription type together — the CEO needs to see `claude.ai` rather than an API key, since that distinction is the entire point of the feature and a green tick alone would not show it. On failure show the message for the specific status: `not_found` → the path is wrong or `claude` is not installed; `not_logged_in` → found, but run `claude auth login` in a terminal; `error` → show what came back.
>
> **State the cost in the UI, once, next to the selector:** a short note that the CLI backend uses the local Claude subscription instead of API credits and that bulk extraction runs roughly 6-11x slower (diagnostic 583 measured ~13.4 min versus ~1.2-2.3 min for a full course import). This is not decoration — the CEO accepted that trade knowingly and the app should not make it look free.
>
> **Verify before reporting complete:** `npx eslint src/components/SettingsModal.jsx` is clean; `npm run build` succeeds. Commit with `git add` and `git commit` only — no `git push`.

---

## STEP 5 — QA (QA)

**Scope:**
- `knowledge/qa/`

**Deposits:**
- `study/knowledge/qa/cli-backend-qa-2026-09-03.md`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/build.txt`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/eslint.txt`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/canary_stream.txt`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/canary_buffered.txt`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/env_isolation.txt`
- `study/knowledge/qa/evidence-cli-backend-2026-09-03/cargo_test.txt`

---

> **Identity:** You are verifying this plan's deliverables. **Study has no automated test suite** — no pytest, no vitest; `package.json` exposes only dev/build/preview/tauri scripts, and eslint is configured. So there is no suite to regress and no coverage number to report; say that plainly rather than implying tests were run. Your evidence is a build, a lint, and **live canaries against the real CLI**. Every evidence file below holds RAW command output, pasted, never a summary.
>
> **Why a live canary and not fixtures.** Diagnostic 583's own V5 block asserted a streaming event shape that the Planner then measured as wrong — 583's recommended invocation yields two `assistant` events and no incremental text. A fixture built from a stated shape would have passed while the real UI never streamed. Assert against real CLI output or the check is worthless.
>
> **`toolchain.txt` is Step 1's deposit, not yours** — do not re-create it; verify it is present and read its `claude --version` line, which is the pin diagnostic 583's verification blocks hang on. If that version differs from `2.1.178`, re-run 583's blocks before trusting any invocation string in this plan.
>
> **Deliverable verification FIRST.** Read Steps 1-4's Output Receipts, list every file they claim to have created or modified, and verify each on disk: `src-tauri/src/lib.rs` (all five commands present — `claude_cli_discover`, `claude_cli_probe`, `claude_cli_invoke`, `claude_cli_stream`, `claude_cli_cancel` — AND all five present in the `generate_handler!` list), `src/lib/claudeCli.js`, `src/lib/api.js`, `src/lib/db.js`, `src/components/SettingsModal.jsx`. Output a table `| Deliverable | Expected | Status (✅/❌) | Evidence |`. **Every status cell holds exactly one token and nothing else** — a token with an appended note asserts nothing and is invisible to both gates. Any ❌ blocks closure.
>
> **Mechanical checks → evidence files.** `npm run build` → `build.txt`. `npx eslint src/` → `eslint.txt`. `cargo test --manifest-path src-tauri/Cargo.toml` → `cargo_test.txt` (manifest flag, not `cd`, for the reason Step 1 gives) (this is where Canary 3 part 1 runs). All three must be clean; a failure is a Critical finding, not a note. If `node_modules/` or `src-tauri/target/` is missing, Step 1 did not run or did not complete — re-run its two commands before concluding anything about the code.
>
> **Canary 1 — buffered → `canary_buffered.txt`.** Run the exact argument list `claude_cli_invoke` builds (read it out of `lib.rs`; do not retype it from this plan) against a prompt that asks for a small JSON object. Paste the raw stdout. Assert: one JSON object; assistant text in `result`; `is_error` false. Then feed that `result` string through `extractJSON` from `src/lib/api.js` (a tiny node harness is fine) and assert it parses — that is the whole reason finding 5 mattered.
>
> **Canary 2 — streaming → `canary_stream.txt`.** Run the exact argument list `claude_cli_stream` builds, with a prompt long enough to force several hundred characters of output. Paste the raw NDJSON. Assert **more than one** `text_delta` arrives — one delta means the stream is not incremental and the tutor chat will hang then dump, which is a Critical finding. Then reproduce `callClaudeStreamCLI`'s accumulation over those lines and assert the joined text equals the `result` field of the terminal `result` line. If they differ, the parser is dropping content: Critical.
>
> **Canary 3 — environment isolation → `env_isolation.txt`.** This verifies the plan's load-bearing invariant, and it must be verified through the REAL builder rather than a hand-typed command that merely resembles it. Three parts, all required:
> **Set the bogus key INLINE on each command that needs it — never `export` it.** An exported `ANTHROPIC_API_KEY` poisons every later command in the same shell, so Canaries 1 and 2 would fail with a 401 that has nothing to do with what they test, and the failure would look like a defect in the code. Every use below is of the form `ANTHROPIC_API_KEY=sk-ant-bogus-key-12345 <command>`.
> 1. **The mechanism, via `cargo test`.** Step 2 factors the environment construction into its own function. Run `ANTHROPIC_API_KEY=sk-ant-bogus-key-12345 cargo test`, with a test that applies that environment builder to a bare `/usr/bin/env`, spawns it, and asserts `ANTHROPIC_API_KEY` does NOT appear in the child's output. This tests the code that ships, not a retyped approximation, and needs no running Tauri app.
> 2. **The positive control.** With the same variable set inline, run a plain `claude -p` with no env removal and assert it FAILS with `api_error_status: 401`. **This half is not optional**: part 1 succeeding cannot distinguish "the variable was removed" from "the variable was never set in this shell," and that is exactly the inference diagnostic 583 exists to forbid. The control proves the variable was really there and really is read.
> 3. **End to end.** With the variable set inline, run the real `claude_cli_invoke` argument list with the environment builder applied, against a trivial prompt, and assert `is_error: false`.
>
> Paste all three raw outputs and label which is which. If part 2 does not fail, stop — your shell is not exporting what you think it is, and parts 1 and 3 prove nothing.
>
> **Probe budget.** The canaries spend the CEO's subscription quota; **six `claude -p` calls total across all of Step 5** is ample. Use `--model haiku` and short prompts everywhere except Canary 2, which needs a few hundred characters of output to show more than one delta.
>
> **Regression check on the API path — and its limit, stated.** Confirm by reading the diff that `src/lib/api.js`'s HTTP code is unchanged apart from the branch insertions, the API-key-guard scoping and the `MODEL_SONNET` substitution. Confirm `src-tauri/capabilities/default.json` is **untouched** (`git diff --stat` names it nowhere) — finding 3 says it needs no change, so any edit there is out of scope and a finding. **State BOTH residual risks explicitly in the QA report rather than implying full coverage, one sentence each.** (i) The HTTP path is verified by diff inspection and a successful build, NOT by a live API call, because that would require the CEO's API key which QA does not hold. (ii) **The Settings UI is verified only by eslint and a successful build** — nothing in this plan drives the modal, so the selector, the Discover action and the Test action are unexercised until the CEO opens Settings. That is a deliberate choice for a local-only, single-user feature rather than an oversight, and the report says so plainly instead of leaving a reader to assume the UI was tested. The mitigating design fact is that `model_backend` defaults to `api` and the HTTP code is unchanged, so an install that never touches the new setting behaves exactly as before — but that is an argument, not a measurement, and the report must not present it as one.
>
> **Rule 20 self-check.** Run the canonical block from `RULE_20_SELF_CHECK_BLOCK.md` at the governance root, with:
> - `plan_slug`: `cli-backend-2026-09-03`
> - `qa_report_path`: `/Users/marklehn/Developer/GitHub/study/knowledge/qa/cli-backend-qa-2026-09-03.md`
> - `evidence_dir`: `/Users/marklehn/Developer/GitHub/study/knowledge/qa/evidence-cli-backend-2026-09-03/`
> - `required_evidence_files`: `["toolchain.txt", "build.txt", "eslint.txt", "cargo_test.txt", "canary_stream.txt", "canary_buffered.txt", "env_isolation.txt"]`
>
> Include the literal stdout in the QA report under a heading containing the word "verification" — `gates.py` scopes its read to that section, so a differently-named heading makes your table invisible to the gate. The block's own output is what the gate reads: its banner line is `Rule 20 — QA Self-Check Results` and its success line is `PASSED — SELF-CHECK PASSED`. **Those two strings are reproduced here only to name what the block emits; do NOT type them into the report yourself.** Paste the block's actual stdout. If it prints `FAILED`, halt and report to the CEO rather than closing.
>
> **Ordering (Rule 23):** deliverable verification → mechanical checks → canaries → QA report and evidence deposited → ledger updates in the Output Receipt → final commit, in that order. The commit is your last operation. Do NOT run `git push`. Do NOT move this plan to Done — Bellows does that when it consumes the verdict.
