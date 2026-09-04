# Walk register — `cli-backend-exec-2026-09-03` (study)

**schema_version:** `0.3`

**Plan:** `scratchpad/draft-executable-cli-backend-2026-09-03.md` (stable slug; deposits to `study/knowledge/decisions/` as `ready-executable-draft-<HHMMSS>.md`)
**Tier:** T1 — firing triggers T-1 (four files across the Rust, JS-lib and UI subsystems), T-3 (the app spawns a local CLI process — an execution environment nothing in study has run in), T-8 (novel pattern). T-5/T-6 do NOT fire (additive, no deletion, no doctrine edit) → **Panel: none.** T-2 does not fire: the new settings are rows in the existing `settings` table, no migration.
**Opened:** 2026-09-03
**Implements:** diagnostic 583 (`study/knowledge/research/claude-cli-backend-feasibility-2026-09-03.md`)

---

## Walk 0 — context pin (REAL, measured 2026-09-03)

**CEO direction, verbatim:** "accept slowdown. eventually we can mechanize some of this extraction so that it's not pure ai work. don't worry about importing any previous course material. let's just build this for me right now. don't worry about shipping out."

That resolves all three of diagnostic 583's forks:
- **Fork 2 → ACCEPT the slowdown.** No hybrid. One backend at a time. The "mechanize some extraction" remark is a FUTURE arc, explicitly not this plan's scope — it is filed forward, not built.
- **Fork 3 → local only.** No release gating, no build-time flag, no `capabilities/default.json` differentiation, and no effort spent on the released-build security posture.
- **Fork 1 → resolved by the Planner as ADDITIVE, and the reasoning is stated because it is a judgement call.** "Build this for me / don't worry about shipping out" removes the argument FOR a toggle (keeping released builds working for others) but does not by itself say "delete the API path." Removing it is strictly MORE work than leaving it, and it destroys the only fallback if the CLI path misbehaves. So: add the CLI backend behind a setting, leave the API code untouched, and let the CEO flip it. The setting DEFAULTS to `api` — an existing install's behaviour does not change until the CEO chooses, which is the zero-risk default for a plan whose whole subject is re-routing where the app's requests go.

**Findings inherited from diagnostic 583 (Rule 27 — cited, not re-derived):**

1. **The seam.** `callClaude` (`src/lib/api.js:39`), `callClaudeStream` (`:80`), `testApiKey` (`:181`) are the only model egress; `api.anthropic.com` at `:45`, `:89`, `:184` only. 13 call sites, 7 files, all sequential.
2. **Auth (load-bearing, measured).** The CLI prefers `ANTHROPIC_API_KEY` over OAuth **even without `--bare`**: a bogus key returns `is_error: true, api_error_status: 401` with no OAuth fallback. Clean, `claude auth status` reports `authMethod: "claude.ai"`, `subscriptionType: "max"`. **The child environment must be constructed with the variable REMOVED.**
3. **Transport.** Rust `#[tauri::command]` over `std::process::Command`, NOT `@tauri-apps/plugin-shell`. The disqualifier is measured from `src-tauri/gen/schemas/desktop-schema.json`: the shell scope's `cmd` is a plain string (no glob, no runtime interpolation from user settings) and `Command.create`'s `env` option MERGES with the inherited environment — there is no `env_remove`. Only `std::process::Command::env_remove` definitively prevents the inherited-key failure in (2). Consequence: **`capabilities/default.json` needs no change at all** — a `#[tauri::command]` is not gated by the shell ACL.
4. **Binary discovery.** `launchctl getenv PATH` is **empty**; a Finder-launched `.app` does not see `/opt/homebrew/bin`. `claude` lives at `/opt/homebrew/bin/claude` → `/opt/homebrew/Caskroom/claude-code/2.1.178/claude`. What PATH a packaged `.app` sees at runtime is **INCONCLUSIVE** in 583 (no release bundle existed). Therefore the plan must NOT depend on PATH: an explicit configured absolute path is the primary mechanism, a candidate probe list is the convenience.
5. **JSON survives the CLI.** All three reconstructed extraction prompts returned valid JSON wrapped in ```` ```json ```` fences, which `extractJSON` already strips. `--json-schema` was evaluated and rejected: it requires `--input-format=stream-json` as well, which is protocol complexity for no gain.
6. **Model mapping.** Pass aliases `--model sonnet` / `--model haiku`, not pinned ids. `callClaudeStream` hardcodes `"claude-sonnet-4-20250514"` inline at `:98` instead of `MODEL_SONNET` — a pre-existing inconsistency this plan fixes in passing since it is editing that function anyway.
7. **Cost, accepted.** ~9,807 `cache_creation_input_tokens` fixed overhead per call; the cache covers only the CLI's own prefix, never the app's system prompt. ~35 calls / ~13.4 min for a full course import versus ~1.2-2.3 min on the API. CEO has accepted this.

**⚠️ PLANNER CORRECTION to diagnostic 583, with its own evidence.** 583's V5 verification block and its Q5 streaming invocation are **wrong in effect**, and shipping them would produce a tutor chat that does not stream. 583's recommended streaming command omits `--include-partial-messages`. Measured by the Planner at authoring, on the exact command 583 recommends:

```
$ claude -p "Count slowly from 1 to 12…" --tools "" --no-session-persistence \
    --output-format stream-json --verbose --model haiku
→ assistant#1 len=0
  assistant#2 len=26  ('1\n2\n…\n12')
  total assistant events: 2
```

Two `assistant` events: one empty, one complete. The text arrives in **one lump at the end** — that is not streaming, and 583's "cumulative content" phrasing obscures it. Adding the flag:

```
$ claude … --output-format stream-json --include-partial-messages --verbose --model haiku
  (200-word generation)
→ stream_event.content_block_delta events; text_delta count: 12; total chars 1357
  first delta: '# Tide Pools: Miniature Worlds Between the Waves\n\nWhen the tide retre'
```

Real incremental deltas. **The correct streaming envelope is `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}}`.** This is a Planner correction backed by two probes the Planner ran, not a paraphrase of 583 — it is called out as a correction precisely because Rule 27 forbids silently drifting from a diagnostic's evidence. The DEV step re-verifies it.

8. **A gift from the correction:** the existing `callClaudeStream` ALREADY parses `content_block_delta` / `text_delta` (`api.js` SSE loop). Only the envelope changes — SSE `data:` lines become NDJSON lines carrying a `stream_event` wrapper. The delta-accumulation logic transfers.
9. **Non-streaming contract (583 V3/V6, unchanged):** `--output-format json` returns one object; assistant text in `result`; `is_error`, `api_error_status`, `stop_reason`, `session_id`, `duration_ms`, `usage`, `total_cost_usd` alongside. `--verbose` is REQUIRED for `stream-json` under `-p` (583 V4, measured: it errors without it).
10. **Multi-turn (583 Q7).** Only `StudyContext.jsx:1314` passes history (`chatMsgs`, up to 40 messages). Recommendation adopted: flatten into one prompt string; the system prompt already establishes the tutor role. `--session-id`/`--resume` rejected — it would make the CLI, not the app's `Messages` table, the owner of conversation state.
11. **Study has no test suite.** No pytest, no vitest; `package.json` scripts are `dev`/`build`/`preview`/`tauri*`, and eslint is configured. QA's mechanical evidence is therefore `npm run build` plus eslint, and correctness rests on a **live canary** — a real `claude -p` round trip asserting the delta parsing — not on synthetic fixtures. The V5 error above is exactly why: a synthetic fixture built from 583's stated event shape would have passed while the real UI never streamed.

⚠️ Walk 0 carries no fold rows. Walks 1+ appended AFTER the draft exists, from real passes.

---

## Walk 1 — five-lens sequential walk (post-draft, real)

Pre-walk mechanical pass caught two authoring FAILs before any lens ran: `pause_for_verdict: after_step_4` is not in the accepted vocabulary (`after_qa_step` is), and `plan_lint` check (c) requires both Rule-20 template literals present in the plan. Both fixed; per-step `**Scope:**` blocks added so the scope gate has something to bind. Recorded here as mechanical conformance, not as lens findings.

| id | walk | lens | sub_question | origin | finding | pre_fold_text | resolution |
|---|---|---|---|---|---|---|---|
| w1-1 | 1 | Vulnerabilities | does the transport survive the largest real input, not the test input? | pre-existing | the plan passed the prompt as a command-line argument (`-p <prompt>`). Study's extraction prompts carry whole document chunks — `extraction.js` sub-batches at 30,000 characters of formatted content — and an argument that size runs at the OS argument-length limit (macOS `ARG_MAX`, shared between args AND environment). It would pass every small test and then fail on exactly the large materials the feature exists to process, with an error that looks nothing like its cause | `**claude_cli_invoke(path, system, prompt, model)** — buffered. Args: -p <prompt> --system-prompt <system> --tools "" --no-session-persistence --output-format json --model <model>.` | folded: the prompt now goes on STDIN with a bare `-p` and no positional argument; only the flags stay in argv. The Planner had already verified this form works at authoring (`echo "…" \| claude -p --tools "" --model sonnet --system-prompt "…" --output-format json` returned a normal result), and that evidence is cited in the step |
| w1-2 | 1 | Weak spots | can the QA step actually run the check it is asked to run? | pre-existing | Canary 3 said "run the CLI backend's own spawn path" with a bogus key exported — but that spawn path is Rust inside a Tauri app, and a QA agent in a Bellows worktree has no running app. The agent would either retype an approximation of the command (testing something other than the shipping code) or skip the plan's single load-bearing invariant | `Run the CLI backend's own spawn path with ANTHROPIC_API_KEY=sk-ant-bogus-key-12345 exported in the parent environment and assert the call SUCCEEDS — proving .env_remove stripped it.` | folded: Step 1 must factor argument/environment construction into a function a `#[cfg(test)]` test can call; Canary 3 became three labelled parts — a `cargo test` that builds a Command through the REAL builder, points it at `/usr/bin/env` and asserts the variable is absent; the bogus-key positive control that must be seen failing; and an end-to-end invoke. Part 2 is marked not-optional with the reason, and a stop condition added if the control does not fail |
| w1-3 | 1 | Destruction | what does this plan risk in the CEO's working app, and does the QA report say so honestly? | pre-existing | `api.js` is the hot path for all thirteen call sites, so a bad edit stops study working — yet Step 4 verified the HTTP path only by diff and build, and the report would have read as full coverage. QA cannot make a live API call: it does not hold the CEO's key. Separately the canaries had no spend ceiling on the CEO's own subscription quota | `**Regression check on the API path.** Confirm by reading the diff that` | folded: a six-call probe budget for all of Step 4, and a required one-sentence residual-risk statement — the HTTP path is verified by diff and build, NOT by a live call — with the `model_backend` default-to-`api` mitigation explicitly labelled an argument rather than a measurement |
| — | 1 | Integration-record | — | — | DRY — `qa_steps: 4` matches the single QA step; "no SQL migration" is stated in both the Context and Step 2 and contradicted nowhere; the Test Scope header, the QA step's no-suite statement and the evidence list agree; the walk-register reference is absolute so it resolves at both the drafting and deposit paths | — | no fold |
| w1-4 | 1 | ACID | is a partial landing safe, and is that by design or by luck? | pre-existing | the four steps commit separately, so Step 2 can land without Step 3. That state is actually safe — `model_backend` defaults to `api`, so a backend with no UI to select it changes nothing — but the plan never said so, leaving a real property of the design undocumented and indistinguishable from an oversight. Record-class: no agent behaviour changes either way | (no statement existed) | folded: the default-to-`api` safety property stated in Step 4's residual-risk clause, where it also does the work of qualifying the regression claim |

**Walk 1 total: 4 findings (instruction 3 / record 1), 0 of 4 fold-introduced. All folded; each anchor asserted == 1 before write. `plan_lint` 12 PASS / 0 FAIL. Direction verdict: PROCEED — the four-step shape (Rust transport → JS backend + branching → Settings UI → QA) held under all five lenses; w1-1 changed a mechanism inside it, not the shape. Bar NOT met (3 instruction-class).**

---

## Walk 2 — five-lens sequential walk (real)

| id | walk | lens | sub_question | origin | finding | pre_fold_text | resolution |
|---|---|---|---|---|---|---|---|
| w2-1 | 2 | Weak spots | does the fold reach every place its reason applies? | fold-introduced (by w1-1) | w1-1 moved the prompt to stdin for `claude_cli_invoke`, but `claude_cli_stream` said only "same args plus …". "Same args" reads as the flag list, not the stdin discipline — so the streaming path, which carries the tutor's whole course context, would have kept the argv form and failed on exactly the long conversations it exists to serve | `**claude_cli_stream(app, path, system, prompt, model, request_id)** — same args plus --output-format stream-json --include-partial-messages --verbose, and NOT --output-format json. Spawn with Stdio::piped(), read stdout line by line with a BufReader on a spawned thread` | folded: the stdin discipline restated explicitly for the streaming command, with "same args means the flags" spelled out, and `Stdio::piped()` named on stdin AND stdout |
| w2-2 | 2 | Weak spots | can the new mechanism hang? | fold-introduced (by w1-1) | writing a large prompt to a child's stdin while nothing drains its stdout deadlocks once both pipe buffers fill. Like the `ARG_MAX` problem it fires only on large inputs, and a hang is worse than an error — the UI's 30-second stall timer would fire and the user would see a timeout with no cause. Nothing in the plan addressed stdin draining or EOF | (no statement existed) | folded: a dedicated clause — write stdin from its own thread (or write and drop before reading stdout), close stdin explicitly so the child sees EOF, applies to BOTH spawning commands |
| w2-3 | 2 | Vulnerabilities | does the fix cover the whole of the input, or only the half that was noticed? | fold-introduced (by w1-1) | w1-1 moved the PROMPT to stdin but left the SYSTEM PROMPT in argv — and study's tutor system prompt carries course context into the tens of kilobytes. It shares the same `ARG_MAX` budget, so the fix addressed one half of one limit and the plan read as though the class were closed | `with a bare -p and no positional prompt. The Planner verified this form works: echo "..." \| claude -p --tools "" --model sonnet --system-prompt "..." --output-format json returned a normal result. Spawn with Stdio::piped() on stdin as well as stdout.` | (verbatim-ellipsis: the pre-fold cell quotes a shell example containing a literal `"..."`) folded: the system prompt named as the other half of the same class, with a concrete rule — confirm `--system-prompt-file` exists at the installed version and use it above 100,000 characters, else keep argv and say so |
| w2-4 | 2 | ACID | do the step boundaries agree on what crosses them? | pre-existing | the plan said "build four commands" while naming FIVE (`discover`, `probe`, `invoke`, `stream`, `cancel`), and Step 4 told QA to verify "four commands present AND all four in `generate_handler`". A QA agent counting to four and stopping would pass a build missing a command, and an unregistered command fails at runtime rather than at compile time. The same miscount also appeared as "four files" in the tier line (five: `lib.rs`, `claudeCli.js`, `api.js`, `db.js`, `SettingsModal.jsx`) and as "the invariant that governs all four" — where the honest answer is not a count at all, since only the three spawning commands build a `Command` | `**Build four commands in src-tauri/src/lib.rs and register every one of them in .invoke_handler(tauri::generate_handler![...]) alongside the existing greet (:91).**` | (verbatim-ellipsis: the pre-fold cell quotes `generate_handler![...]` verbatim) folded: all four sites corrected — five commands named explicitly in Step 1 and again in Step 4's deliverable check, five files in the tier line, and the env invariant re-expressed by PROPERTY (every command that spawns: probe, invoke, stream) rather than by a count that can drift again |
| — | 2 | Destruction | — | — | DRY — every step is additive; the `#[cfg(test)]` block w1-2 added is new code in a file with no existing tests; Step 4's spend is capped at six calls | — | no fold |
| — | 2 | Integration-record | — | — | DRY — deposits, scope blocks and the Test Scope header agree; `qa_steps: 4` matches; the command names used in Step 2 match the names Step 1 defines, checked one by one | — | no fold |

**Walk 2 total: 4 findings (instruction 4 / record 0), 3 of 4 fold-introduced. All folded across seven substitution sites, each anchor asserted == 1. Bar NOT met. ⚠️ Instruction-class yield rose 3 → 4: walk 1 was shallow on the transport mechanism, and three of walk 2's four findings are damage from w1-1's own fold. No restructuring fold.**

---
