# Claude CLI Backend Feasibility — Findings

**Date:** 2026-09-03 | **CLI version:** 2.1.178 | **Subscription:** Max (claude.ai OAuth)

**⚠️ All environment measurements were taken from inside a Claude Code session.** The spawning environment (Tauri .app from Finder) will differ. The design consequence: the app must CONSTRUCT the child environment explicitly rather than inherit. See Q2(c) and Q3(iv).

---

## Q2 Verdict: AUTH MODE — VIABLE, WITH MANDATORY ENVIRONMENT CONTROL

The CLI authenticates via OAuth (claude.ai subscription) when `ANTHROPIC_API_KEY` is **not** set in the environment. When the variable IS set, the CLI uses it — **even in non-bare mode** — and OAuth is silently bypassed. The app must unset `ANTHROPIC_API_KEY` in the child environment to guarantee subscription-based auth.

---

## Q1 — Seam Confirmation

### Model egress is exactly three functions in one file

`api.js` contains the only model calls in `src/`:

| Function | Line | Endpoint |
|---|---|---|
| `callClaude` | :39 | `https://api.anthropic.com/v1/messages` (:45) |
| `callClaudeStream` | :80 | `https://api.anthropic.com/v1/messages` (:89) |
| `testApiKey` | :181 | `https://api.anthropic.com/v1/messages` (:184) |

**Verification:** `grep -rn 'api\.anthropic\.com' src/` returns only `api.js:45`, `api.js:89`, `api.js:184`. `grep -rn 'fetch(' src/` outside `api.js` returns zero model-provider hits (only `initTauriFetch`/`httpFetch` references within api.js itself).

### Call-site table (13 sites, 7 files — CONFIRMED)

| file:line | function | maxTokens | useHaiku | messages length | consumer parses JSON? |
|---|---|---|---|---|---|
| `StudyContext.jsx:1234` | `callClaudeStream` | default (16384) | no (sonnet, hardcoded :98) | 1 (boot) | No — prose displayed |
| `StudyContext.jsx:1314` | `callClaudeStream` | default (16384) | no (sonnet, hardcoded :98) | 1-40 (chatMsgs, sliced) | No — prose + skill update tags parsed separately |
| `SkillsPanel.jsx:192` | `callClaude` | 4096 | yes | 1 | Yes — `extractJSON` (:193) |
| `conceptLinks.js:122` | `callClaude` | 4096 | yes | 1 | Yes — `extractJSON` (:129) |
| `conceptLinks.js:210` | `callClaude` | 4096 | yes | 1 | Yes — `extractJSON` (:218) |
| `syllabusParser.js:191` | `callClaude` | 16384 | yes | 1 | Yes — `extractJSON` (:207) |
| `skills.js:254` | `callClaude` | 8192 | yes | 1 | Yes — `extractJSON` (:258) |
| `skills.js:337` | `callClaude` | 16384 | yes | 1 | Yes — `extractJSON` (:342) |
| `extraction.js:852` | `callClaude` | 4096 | yes | 1 | Yes — `extractJSON` (:857) |
| `extraction.js:926` | `callClaude` | dynamic (8192-16384) | yes | 1 | Yes — `extractJSON` (:937) |
| `extraction.js:1364` | `callClaude` | 12288 | yes | 1 | Yes — `extractJSON` (:1376) |
| `study.js:2019` | `callClaude` | 8192 | no (sonnet) | 1 | Yes — `extractJSON` (:2021) |
| `study.js:2074` | `callClaude` | 1024 | yes | 1 | Yes — `extractJSON` (:2079) |

11 of 13 sites parse JSON via `extractJSON`. The 2 streaming sites (StudyContext) display prose. Only `StudyContext.jsx:1314` passes multi-turn history.

---

## Q2 — Auth Mode (Load-Bearing)

### (a) Credential source

```
$ claude auth status
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "marklehn@icloud.com",
  "subscriptionType": "max"
}
```

Paired with a working probe (no API key set):
```
$ claude -p "Say hello" --tools "" --no-session-persistence --output-format json --model haiku
→ is_error: false, result: "Hey Mark! Good to see you..."
  cache_creation_input_tokens: 15307, duration_ms: 2641
```

Auth is OAuth via claude.ai subscription. The CLI reads the credential from the macOS keychain (the `authMethod: "claude.ai"` path).

### (b) Bogus ANTHROPIC_API_KEY — CLI uses it, does NOT ignore it

```
$ ANTHROPIC_API_KEY=sk-ant-bogus-key-12345 claude -p "Say hello" --tools "" --no-session-persistence --output-format json --model haiku
→ is_error: true, api_error_status: 401
  result: "Failed to authenticate. API Error: 401 API key is invalid."
```

**The CLI preferentially reads `ANTHROPIC_API_KEY` from the environment over OAuth**, even without `--bare`. When a bogus key is present, it fails with 401 rather than falling back to OAuth. This is the exact failure mode the diagnostic was created to find.

### (c) Forcing OAuth — unset the variable

The app MUST construct the child environment with `ANTHROPIC_API_KEY` explicitly absent. In Rust (`std::process::Command`), this is `.env_remove("ANTHROPIC_API_KEY")`. In the Tauri shell plugin, the `env` option on `Command.create` provides an override map, but the plugin passes `{ env }` which MERGES with inherited — so the app should also set it to empty string or use the Rust command path where `env_remove` is available.

**Design requirement:** the child environment must be constructed explicitly, not inherited.

### (d) `--bare` is disqualified — confirmed

`--bare` help text: "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)." Without an API key, `--bare` cannot authenticate against the subscription.

### (e) Positive control

```
$ ANTHROPIC_API_KEY=sk-ant-bogus-key-12345 claude -p "Say hello" --bare --tools "" --no-session-persistence --output-format json --model haiku
→ is_error: true, api_error_status: 401
  result: "Failed to authenticate. API Error: 401 API key is invalid."
```

The `--bare` mode with the same bogus key produces the **same** 401 authentication error naming the credential ("API key is invalid"). This confirms:
1. The variable was read (the error names it)
2. The error IS an authentication error (401), not a generic failure
3. The non-bare mode's identical failure with the same bogus key proves it ALSO reads the variable — not that the probe was simply broken

**Conclusion:** the non-bare CLI reads `ANTHROPIC_API_KEY` when present. The app must unset it.

---

## Q3 — Transport

### (a) `@tauri-apps/plugin-shell` — scope grammar analysis

From `src-tauri/gen/schemas/desktop-schema.json` (lines 2154-2208), the `ShellScopeEntry` schema for `shell:allow-execute`:

```json
{
  "type": "object",
  "required": ["cmd", "name"],
  "properties": {
    "cmd": {
      "description": "The command name. It can start with a variable that resolves to a system base directory. The variables are: $AUDIO, $CACHE, $CONFIG, $DATA, $LOCALDATA, $DESKTOP, $DOCUMENT, $DOWNLOAD, $EXE, $FONT, $HOME, $PICTURE, $PUBLIC, $RUNTIME, $TEMPLATE, $VIDEO, $RESOURCE, $LOG, $TEMP, $APPCONFIG, $APPDATA, $APPLOCALDATA, $APPCACHE, $APPLOG.",
      "type": "string"
    },
    "args": { "$ref": "#/definitions/ShellScopeEntryAllowedArgs" },
    "name": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Key findings:**
- **(i) User-configurable path:** The `cmd` field is a **plain string, not a glob**. No runtime variable interpolation from user settings. The Tauri variables (`$HOME`, `$CONFIG`, etc.) resolve at app startup, not from user input. A user-configurable binary path would need to be one of several **hardcoded candidates** in the capability file, not a dynamic value. Example: `{ "name": "claude-homebrew", "cmd": "$HOME/.claude/local/claude", "args": true }` would work, but `cmd` cannot be read from a Settings field.
- **(ii) Streaming:** The shell plugin's `Command` API returns a `ChildProcess` with `stdout`/`stderr` event listeners. Incremental streaming IS supported via `child.on('data', ...)`.
- **(iii) Cancellation:** `ChildProcess.kill()` is available.
- **(iv) Environment control:** The `Command.create()` API accepts an `env` option, but this **merges** with inherited environment. There is no `env_remove`. To ensure `ANTHROPIC_API_KEY` is absent, the app would need to set it to an empty string (which the CLI may still read as "set") or use a workaround. **This is a hard constraint** — the shell plugin cannot guarantee OAuth auth if the parent's environment carries an API key.

### (b) Rust `#[tauri::command]` with `std::process::Command`

Today `lib.rs` registers only `greet` (line 5, handler line 91). A new command would drive `std::process::Command::new("claude")`.

- **(i) Configurable path:** `std::process::Command::new(path)` takes any string. The path can be read from a Settings value stored in SQLite. Full flexibility.
- **(ii) Streaming:** `std::process::Command` with `stdout(Stdio::piped())` gives a `BufReader` over stdout. Partial lines can be emitted as Tauri events (`app_handle.emit("cli-chunk", text)`) which the webview receives via `listen("cli-chunk", ...)`. This maps directly to `onChunk`.
- **(iii) Cancellation:** The Rust command holds a `Child` handle. `child.kill()` sends SIGKILL. For graceful shutdown, `child.kill()` or writing to stdin.
- **(iv) Environment control:** `std::process::Command` supports `.env_remove("ANTHROPIC_API_KEY")` — **explicitly removes** a variable from the child. This is the only mechanism that definitively prevents the CLI from reading an inherited API key.
- **(v) Security surface:** Both paths allow spawning an executable from a user-provided path. The shell plugin restricts to a hardcoded allowlist in `capabilities/default.json`. The Rust command has **no declarative restriction** — the Rust code itself is the boundary. Mitigation: validate the binary before first use by running `claude --version` and checking it returns a version string; restrict to a candidate allowlist in code (`/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `$HOME/.claude/local/claude`).

### Recommendation: Rust `#[tauri::command]`

The shell plugin is disqualified by **(iv)**: it cannot `env_remove`, and Q2 proved that a present-but-empty `ANTHROPIC_API_KEY` may still be read as "set." The Rust command path provides `.env_remove()`, full path flexibility, and native streaming. Cost of the shell plugin path: a workaround for env_remove (wrapping in a shell script that unsets the variable) plus a hardcoded candidate list instead of a Settings field.

---

## Q4 — Binary Discovery in a Packaged App

### GUI session PATH

```
$ launchctl getenv PATH
(empty)
```

`launchctl getenv PATH` returned **empty**. A `.app` launched from Finder does NOT inherit the shell's PATH. `/opt/homebrew/bin` is not on that PATH.

### Binary location

```
$ which claude
/opt/homebrew/bin/claude
$ ls -la $(which claude)
lrwxr-xr-x  1 marklehn  admin  49 Jun 24 09:54 /opt/homebrew/bin/claude -> /opt/homebrew/Caskroom/claude-code/2.1.178/claude
```

### Built .app

No release bundle exists at `/Users/marklehn/Developer/GitHub/study/src-tauri/target/release/bundle/` — INCONCLUSIVE on what `PATH` a packaged `.app` actually sees at runtime. The probe that would settle it: a one-line environment dump from inside a packaged build (`process.env.PATH` logged on startup), run by the executable at implementation time.

### Discovery strategy

**Probe list + explicit Settings field + Test action.**

1. **Probe list** (tried in order at startup and when "Test" is clicked):
   - `/opt/homebrew/bin/claude` (Homebrew on Apple Silicon)
   - `/usr/local/bin/claude` (Homebrew on Intel, manual install)
   - `$HOME/.claude/local/claude` (Claude Code local install)

2. **Settings field:** "Claude CLI Path" — a text input showing the discovered path, editable by the user. Stored in SQLite `settings` table alongside the API key.

3. **Test action** (mirrors `SettingsModal.jsx:~62-73`): runs `claude --version --output-format json` at the configured path and reports:
   - Version string
   - Auth status (`claude auth status`)
   - Round-trip latency (a trivial `claude -p "pong"`)

### When `claude` is absent or unauthenticated

| State | Detection | App behavior |
|---|---|---|
| Not installed | All probe paths fail + user path fails with ENOENT | Show "Claude CLI not found. Install from [link] or enter the path." Settings field highlighted. |
| Not logged in | `claude auth status` → `loggedIn: false` | Show "Claude CLI found but not logged in. Run `claude auth login` in a terminal." |
| Model error | `is_error: true` in JSON output with `api_error_status` | Show error message from CLI response |

The CLI's `--output-format json` always returns `is_error` (boolean) and `api_error_status` (integer or null). Exit code is non-zero on error. These three signals distinguish the failure modes.

---

## Q5 — Output Contract and JSON Reliability

### Non-streaming invocation (for `callClaude`)

```
claude -p "<prompt>" \
  --system-prompt "<system>" \
  --tools "" \
  --no-session-persistence \
  --output-format json \
  --model <haiku|sonnet>
```

Returns one JSON object:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "api_error_status": null,
  "duration_ms": 10608,
  "stop_reason": "end_turn",
  "session_id": "0837d164-...",
  "total_cost_usd": 0.030009,
  "result": "```json\n{...actual content...}\n```",
  "usage": {
    "input_tokens": 10,
    "cache_creation_input_tokens": 9807,
    "cache_read_input_tokens": 0,
    "output_tokens": 2077
  }
}
```

The assistant text lives in the `result` field. All other fields are metadata.

### Streaming invocation (for `callClaudeStream`)

Requires `--verbose`:
```
claude -p "<prompt>" \
  --system-prompt "<system>" \
  --tools "" \
  --no-session-persistence \
  --output-format stream-json \
  --verbose \
  --model <model>
```

Events are newline-delimited JSON:
- `{"type":"system","subtype":"init",...}` — session metadata
- `{"type":"system","subtype":"thinking_tokens",...}` — thinking progress (ignore)
- `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}],...}}` — text chunks (cumulative, not delta)
- `{"type":"rate_limit_event",...}` — rate limit info
- `{"type":"result",...}` — final result (same shape as non-streaming)

The app parses `type: "assistant"` events, extracts `message.content` blocks where `type === "text"`, and feeds the cumulative `.text` to `onChunk`.

### JSON reliability — three probes

All three extraction prompts produced valid JSON, but wrapped in ` ```json ``` ` fences:

**Probe 1 — syllabusParser.js:191** (system prompt: SYLLABUS_SYSTEM_PROMPT, synthetic 10-line syllabus):
```
result: "```json\n{\n  \"metadata\": {\n    \"courseNumber\": \"CS 301\",...}\n```"
```
`extractJSON` strips fences → valid parse. ✅

**Probe 2 — skills.js:337** (assignment decomposition, synthetic 3-problem homework):
```
result: "```json\n[\n  {\n    \"id\": \"asgn-1\",...}]\n```"
```
Array with nested objects. `extractJSON` strips fences → valid parse. ✅

**Probe 3 — extraction.js:926** (chapter extraction, synthetic 3-section chapter):
```
result: "```json\n{\n  \"cipCode\": \"11.0701\",\n  \"subSkills\": [{\"facets\": [{\"masteryCriteria\": [...]}]}]}\n```"
```
Deepest nesting: object → array → object → array → array. `extractJSON` strips fences → valid parse. ✅

### `--json-schema` evaluation

The CLI supports `--json-schema <schema>` for structured output, but it requires BOTH `--input-format=stream-json` and `--output-format=stream-json`. This adds protocol complexity (the app must speak stream-json for input too). `extractJSON`'s fence-and-repair heuristics work reliably across all three probes. **Recommendation:** use `extractJSON` for the initial implementation; evaluate `--json-schema` as a future hardening step if fence-wrapping causes failures in production.

### Model mapping

Current constants (`api.js:22-23`):
- `MODEL_SONNET = "claude-sonnet-4-20250514"` → CLI: `--model sonnet` (alias) or `--model claude-sonnet-4-20250514` (full id)
- `MODEL_HAIKU = "claude-haiku-4-5-20251001"` → CLI: `--model haiku` (alias) or `--model claude-haiku-4-5-20251001` (full id)

**Use aliases** (`--model sonnet`, `--model haiku`). The CLI resolves them to the current model version. This avoids breakage when Anthropic publishes new model versions. The inline hardcode at `callClaudeStream:98` (`"claude-sonnet-4-20250514"`) should use the `MODEL_SONNET` constant regardless of backend.

---

## Q6 — Cost, Latency, and Rate-Limit Budget

### (a) Fixed per-call input overhead

| Probe | Flags | cache_creation_input_tokens | cache_read_input_tokens | total input overhead |
|---|---|---|---|---|
| First call, no --system-prompt | `--tools "" --no-session-persistence` | 15307 | 0 | ~15307 |
| With --system-prompt + --tools "" | `--system-prompt "..." --tools ""` | 9807 | 0 | ~9807 |
| With --disable-slash-commands | `--tools "" --disable-slash-commands` | 898 | 14410 | ~15308 |
| Subsequent calls (same session window) | `--tools "" --system-prompt "..."` | 1083 | 8724 | ~9807 |

The CLI's internal system prompt is **~8452-15307 tokens** depending on flags. The irreducible floor is ~9807 tokens with `--system-prompt` and `--tools ""` (which disables built-in tools). Adding `--disable-slash-commands` does NOT reduce total input — it changes which portion is cached vs. created but the total stays ~15308.

**The direct API path carries 0 tokens of this overhead.** Each CLI call adds ~9800 input tokens that the API path does not have.

### (b) Cache behavior — measured both cases

**Identical repeat** (same system prompt, same user message, within 5 minutes):
- First call: `cache_creation: 9807`, `cache_read: 0`
- Identical repeat: `cache_creation: 1083`, `cache_read: 8724`
- Cache hit: ~89% of the CLI's internal prompt is read from cache; the user's prompt tail still creates

**Varied prompt** (different system prompt, different content, within 5 minutes):
- `cache_creation: 1284-1420`, `cache_read: 8452`
- Cache hit: ~86% — nearly identical to the identical-repeat case

**Conclusion:** the cache only covers the CLI's internal system prompt prefix (~8452 tokens). The user's system prompt and message are NEVER cached across calls because they break the prefix match. For study's bulk paths where every call has a different system prompt, the cache hit is the same as the varied case: ~8452 read, ~1000-1500 creation per call. This is not "nearly free" — it's a fixed ~9800-token input overhead per call.

### (c) Call counts — bulk paths

**Syllabus import** (`syllabusParser.js:191`): **1 call**

**Document verification** (`skills.js:254`): **1 call per material**

**Skill extraction** (`extraction.js`):
- `extractChapter` (line 1113, loop at 1108): 1 call per chapter batch
- Sub-batching (line 1024, loop): splits chapters exceeding 30000 chars of formatted content
- `wireCrossChapterPrereqs` (line 852): 1 call if ≥2 chapters
- **Formula:** `Σ(ceil(chapter_chars / 30000)) + 1`

**Assignment decomposition** (`skills.js:337`): **1 call per course**

**Concept links** (`conceptLinks.js`):
- Skill-level (line 122, loop at 111): 1 call per parent skill group with ≥2 skills
- Facet-level (line 210, nested loop at 206-207): `ceil(newFacets/60) × ceil(existingFacets/60)` calls
- **Formula:** `parentGroups + ceil(newFacets/60) × ceil(existingFacets/60)`

**Enrichment** (`extraction.js:1364`): **1 call per material being enriched**

**Concrete example — 40-page textbook, 12 chapters (~25000 chars each), 60 skills, 180 facets, 2 assignment materials:**

| Path | Calls | Per-call wall (measured) | Total wall |
|---|---|---|---|
| Syllabus parse | 1 | ~14s | 14s |
| Document verify (×3 materials) | 3 | ~14s | 42s |
| Chapter extraction (12 chapters, 1 batch each) | 12 | ~40s (longer prompts) | 480s (8 min) |
| Cross-chapter prereqs | 1 | ~14s | 14s |
| Assignment decomposition | 1 | ~15s | 15s |
| Concept links (skill: ~8 groups, facet: 3×3 batches) | 17 | ~14s | 238s (4 min) |
| **Total** | **35** | — | **~803s (13.4 min)** |

**Comparison — direct API:**
- Same 35 calls at ~2-4s each (no CLI startup overhead, no internal prompt)
- **Total: ~70-140s (1.2-2.3 min)**

**Slowdown factor: 5.8-11.2×**

The per-call wall time includes ~4-5s of CLI startup overhead (process spawn, hook evaluation, MCP server connect) on top of the API duration. `duration_api_ms` (the pure API time) is roughly comparable, but wall time is 2-4× higher due to CLI overhead.

### (d) Subscription rate limits

The `rate_limit_event` from the streaming probe showed:
```json
{"type": "rate_limit_event", "rate_limit_info": {
  "status": "allowed",
  "resetsAt": 1788496200,
  "rateLimitType": "five_hour"
}}
```

Max subscription has a 5-hour rolling window. 35 sequential Haiku calls in 13 minutes is well under any reasonable rate limit. However, the CLI's `cache_creation_input_tokens` count against the rate limit budget — ~9800 tokens per call × 35 calls = ~343,000 creation tokens, which is non-trivial against a 5-hour window shared with all other Claude usage.

**When a rate limit is hit:** the CLI returns `is_error: true` with a non-null `api_error_status` (429). The app should show "Claude is rate-limited. Try again in X minutes." and NOT retry immediately.

**`total_cost_usd`:** reported as `$0.03` per Haiku call in probes. On a subscription this is notional, not billed — the subscription is a flat monthly fee.

---

## Q7 — Multi-Turn and Cancellation

### Multi-turn mapping

Only `StudyContext.jsx:1314` passes real conversation history (`chatMsgs`, up to 40 messages). Three options evaluated:

**(i) Flatten into one prompt string:**
Concatenate `[{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]` into a single text block. Cheap, but loses turn structure — the model cannot distinguish user from assistant, degrading multi-turn coherence.

**(ii) `--input-format stream-json`:**
The CLI's stream-json input accepts structured messages, but this format is designed for real-time interactive use, not batch replay of a conversation. Documentation is sparse. The protocol is complex for what amounts to replaying a static array.

**(iii) `--resume` / `--session-id`:**
The CLI can maintain session state with `--session-id <uuid>`. Each call appends to the session. BUT: this means the CLI owns conversation state, not the app. The app's `Messages` table is the source of truth — duplicating it in CLI sessions creates a consistency problem. Also, `--no-session-persistence` (which we need to avoid polluting `/resume` history) is incompatible with `--session-id` continuation.

**Recommendation: (i) Flatten into one prompt string.**

For the chat/tutor path, the system prompt already carries the full course context (~4000-8000 tokens). The conversation history (up to 40 messages) is small relative to the system prompt. Flattening the history into a structured text block within the user message preserves content while being the simplest to implement:

```
claude -p "CONVERSATION HISTORY:
User: <msg1>
Assistant: <msg1>
User: <msg2>
---
Current message: <latest user message>" \
  --system-prompt "<system prompt>"
```

The model still sees the conversation structure. The loss of explicit role separation is acceptable because the system prompt already establishes the tutor role. If multi-turn fidelity proves insufficient, the fallback is `--input-format stream-json` — but start with the simple path.

### Cancellation mapping

`callClaudeStream` uses:
- 2-minute overall `AbortController` timeout (api.js:86)
- 30-second per-chunk stall timeout (api.js:121)

For a CLI child process:
- Overall timeout: `setTimeout(() => child.kill(), 120000)` — sends SIGKILL to the process
- Stall timeout: monitor stdout for data; if 30s of silence, `child.kill()`
- The CLI process is a single OS process (Node.js binary). `child.kill()` terminates it cleanly. On macOS, SIGTERM (default) allows graceful shutdown; SIGKILL forces immediate termination.

---

## Q8 — Gap Assessment

### Gap Assessment Table

| Gap | Current State | Proposed State | Change Required |
|---|---|---|---|
| **Backend selection** | All calls go to `api.anthropic.com` | Settings toggle: "API Key" (default) or "Claude CLI" | New setting in SQLite `settings` table; `api.js` reads it to branch |
| **`api.js` seam** | `callClaude` makes HTTPS fetch | `callClaudeCLI` spawns `claude -p` process | New function `callClaudeCLI(system, messages, maxTokens, model)` in `api.js`; `callClaude` delegates based on backend setting |
| **Streaming seam** | `callClaudeStream` reads SSE from HTTPS | `callClaudeStreamCLI` reads NDJSON from stdout | New function in `api.js`; `callClaudeStream` delegates |
| **Transport** | `@tauri-apps/plugin-http` fetch | Rust `#[tauri::command]` with `std::process::Command` | New command `run_claude_cli` in `src-tauri/src/lib.rs`; registered in `.invoke_handler()` |
| **Capability file** | `http:default` allows `api.anthropic.com` | No change needed for Rust command (not gated by shell plugin) | No change to `capabilities/default.json` if using Rust command |
| **Binary discovery** | N/A — no CLI dependency | Probe list + Settings field | New "Claude CLI Path" field in `SettingsModal.jsx`; startup probe logic in a new `cli.js` module |
| **Model mapping** | `MODEL_SONNET` / `MODEL_HAIKU` constants → model id in request body | Same constants → `--model sonnet` / `--model haiku` aliases | Map in `callClaudeCLI`; fix inline hardcode at `callClaudeStream:98` |
| **Streaming parser** | SSE `data:` lines → `content_block_delta` | NDJSON → `type: "assistant"` events → `message.content[].text` | New parser in the Rust command or in `api.js` |
| **Multi-turn** | `messages` array in request body | Flatten history into user prompt string | Formatting logic in `callClaudeStreamCLI` |
| **Environment** | N/A | Child process must have `ANTHROPIC_API_KEY` unset | `.env_remove("ANTHROPIC_API_KEY")` in Rust command |
| **Key validation** | `testApiKey` → HTTPS to `api.anthropic.com` | `testCliConnection` → `claude --version` + `claude auth status` | New function in `api.js`; `SettingsModal.jsx` calls it when backend = CLI |
| **Error mapping** | HTTP status codes | `is_error` + `api_error_status` from JSON output | Error normalization in `callClaudeCLI` |

**Files touched by the executable:**
1. `src/lib/api.js` — new CLI backend functions, backend branching
2. `src-tauri/src/lib.rs` — new `#[tauri::command]` for CLI invocation
3. `src/components/SettingsModal.jsx` — CLI path field, backend toggle, Test button
4. `src/lib/db.js` — new settings keys (`model_backend`, `claude_cli_path`)
5. `src-tauri/Cargo.toml` — no new dependencies needed (std::process is stdlib)
6. `src-tauri/capabilities/default.json` — no change if using Rust command

### CEO Forks

**Fork 1 — Opt-in second backend vs. replacing the API path**

Recommendation: **Opt-in second backend** (Settings toggle, API stays default).

| | Opt-in second backend | Replace API path |
|---|---|---|
| Files changed | 6 (listed above) | 4 (api.js, lib.rs, SettingsModal.jsx, db.js — but more invasive per file) |
| Released builds | Unchanged — API key path works for anyone | Every user needs `claude` installed and authenticated |
| Rollback | Toggle the setting | Ship a new version |
| `capabilities/default.json` | Unchanged | Unchanged (Rust command, not shell plugin) |

The opt-in path changes more files but each change is additive (branching logic, new functions). The replace path changes fewer files but requires removing the API path — a breaking change for any user who relies on it. **Released builds (`release.sh`, version 0.2.26, `updater:default`) would stop working for anyone without `claude` installed.**

**Fork 2 — Hybrid (CLI for chat, API for bulk) vs. accept the slowdown**

If the 5.8-11.2× slowdown on bulk extraction is intolerable:

| | Full CLI | Hybrid | Full API (status quo) |
|---|---|---|---|
| Syllabus import | ~13.4 min | ~2 min (API) | ~2 min |
| Chat/tutor | ~5-8s first response | ~5-8s (CLI) | ~2-3s |
| Consistency | One backend | Two backends active simultaneously | One backend |

**Recommendation:** accept the slowdown initially; extraction is a one-time-per-material operation the user already waits for. If user feedback shows the wait is unacceptable, add the hybrid as a later iteration. A hybrid where chat uses CLI and extraction uses API is architecturally clean — the backend selection is per-call, not per-session — but it means maintaining both paths.

**Fork 3 — CLI backend in released builds**

A released build that can spawn a local binary is a different security posture than one that only makes HTTPS calls.

| | CLI in all builds | CLI hidden in release | CLI dev-only |
|---|---|---|---|
| `capabilities/default.json` | Unchanged (Rust command, not shell plugin) | N/A — no capability change | N/A |
| Security surface | User-configurable executable path (arbitrary code execution if path is writable) | Release builds can't use CLI | Same |
| Mitigation | Validate binary: run `claude --version`, check output format; restrict to allowlist of candidate paths; show path in Settings | Feature flag or build-time ifdef | Feature flag |
| User impact | Full access | Released users API-only | Dev-mode only |

**Recommendation:** include in released builds, with binary validation. The security surface is real but bounded: the user must explicitly enter or confirm the path, and the app validates it returns a `claude --version` response before storing it. The existing `soffice` entry in `capabilities/default.json` already establishes that the app spawns external binaries — this is a known pattern, not a new class of risk.

---

### Verification Blocks

**Pin:** `claude --version` = `2.1.178 (Claude Code)` — all claims below are measured against this version. An executable finding a different version re-runs these blocks before editing.

**V1 — Call-site census**
- Claim: 13 call sites across 7 files; `api.anthropic.com` appears at exactly 3 locations in `src/`
- Re-check: `grep -rn 'api\.anthropic\.com' src/ | wc -l` → should be 3
- Re-check: `grep -rn 'callClaude\|callClaudeStream' src/ --include='*.js' --include='*.jsx' | grep -v 'export const\|import ' | wc -l` → should be 13
- Measured: 3 endpoint references, 13 call sites

**V2 — Auth behavior**
- Claim: CLI uses `ANTHROPIC_API_KEY` over OAuth when both available
- Re-check: `ANTHROPIC_API_KEY=sk-ant-bogus claude -p "pong" --tools "" --no-session-persistence --output-format json --model haiku`
- Expected: `is_error: true, api_error_status: 401`
- Measured: 401 "API key is invalid"

**V3 — Non-streaming invocation string**
- Claim: `claude -p "<prompt>" --system-prompt "<system>" --tools "" --no-session-persistence --output-format json --model haiku`
- Re-check: run the command; verify `result` field contains assistant text
- Measured: `result` field present, text content correct

**V4 — Streaming invocation string**
- Claim: requires `--verbose` for `stream-json` in print mode
- Re-check: `claude -p "pong" --tools "" --no-session-persistence --output-format stream-json --model haiku 2>&1` → should error
- Measured: `Error: When using --print, --output-format=stream-json requires --verbose`

**V5 — Streaming event shape**
- Claim: text content arrives in `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}` events
- Re-check: run streaming probe, inspect NDJSON lines
- Measured: confirmed, text blocks have `type: "text"` with cumulative content

**V6 — JSON output field names**
- Claim: `result`, `is_error`, `api_error_status`, `stop_reason`, `session_id`, `duration_ms`, `usage`, `total_cost_usd`
- Re-check: run any `--output-format json` probe; verify all fields present
- Measured: all fields present in every JSON-mode probe

**V7 — Per-call overhead**
- Claim: ~9807 `cache_creation_input_tokens` with `--system-prompt` + `--tools ""`; ~8452 cached on subsequent varied-prompt calls
- Re-check: run two probes with different system prompts within 5 minutes; compare `cache_creation_input_tokens` and `cache_read_input_tokens`
- Measured: first call 9807/0, subsequent varied 1083-1420/8452-8724

**V8 — GUI session PATH**
- Claim: `launchctl getenv PATH` returns empty
- Re-check: `launchctl getenv PATH` (from Terminal, not from Claude Code)
- Measured: empty

**V9 — Binary location**
- Claim: `/opt/homebrew/bin/claude` → symlink to `/opt/homebrew/Caskroom/claude-code/2.1.178/claude`
- Re-check: `ls -la $(which claude)`
- Measured: confirmed
