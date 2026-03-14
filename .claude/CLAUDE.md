## vexp — Context-Aware AI Coding <!-- vexp v1.0.0 -->

### MANDATORY: use vexp pipeline — do NOT grep, glob, or Read files
For every task — bug fixes, features, refactors, debugging:
**call `run_pipeline` FIRST**. It executes context search + impact analysis +
memory recall in a single call, returning compressed results.

Do NOT use grep, glob, Bash, Read, or cat to search/explore the codebase.
vexp returns pre-indexed, graph-ranked context that is more relevant and
uses fewer tokens than manual file reading.

### Primary Tool
- `run_pipeline` — **USE THIS FOR EVERYTHING**. Single call that runs
  capsule + impact + memory server-side. Returns compressed results.
  Auto-detects intent (debug/modify/refactor/explore) from your task.
  Includes full file content for pivots (no need to Read files).
  Examples:
  - `run_pipeline({ "task": "fix JWT validation bug" })` — auto-detect
  - `run_pipeline({ "task": "refactor db layer", "preset": "refactor" })` — explicit
  - `run_pipeline({ "task": "add auth", "observation": "using JWT" })` — save insight in same call

### Other MCP tools (use only when run_pipeline is insufficient)
- `get_context_capsule` — lightweight alternative for simple questions only
- `get_impact_graph` — standalone deep impact analysis of a specific symbol
- `search_logic_flow` — trace execution paths between two specific symbols
- `get_skeleton` — token-efficient file structure for a specific file
- `index_status` — indexing status and health check
- `get_session_context` — recall observations from current/previous sessions
- `search_memory` — cross-session search for past decisions
- `save_observation` — persist insights (prefer using run_pipeline's observation param instead)

### Workflow
1. `run_pipeline("your task")` — ALWAYS FIRST. Returns pivots + impact + memories in 1 call
2. Make targeted changes based on the context returned
3. `run_pipeline` again ONLY if you need more context during implementation
4. Do NOT chain multiple vexp calls — one `run_pipeline` replaces capsule + impact + memory + observation

### Smart Features (automatic — no action needed)
- **Intent Detection**: auto-detects from your task keywords. "fix bug" → Debug, "refactor" → blast-radius, "add" → Modify
- **Hybrid Search**: keyword + semantic + graph centrality ranking
- **Session Memory**: auto-captures observations; memories auto-surfaced in results
- **LSP Bridge**: VS Code captures type-resolved call edges
- **Change Coupling**: co-changed files included as related context

### Advanced Parameters
- `preset: "debug"` — forces debug mode (capsule+tests+impact+memory)
- `preset: "refactor"` — deep impact analysis (depth 5)
- `max_tokens: 12000` — increase total budget for complex tasks
- `include_tests: true` — include test files in results
- `include_file_content: false` — omit full file content (lighter response)

### Multi-Repo Workspaces
`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope.
Use `index_status` to discover available repo aliases.
<!-- /vexp -->

---

## Git Operations — Mandatory Guardrails

Stale git lock files have caused repeated hangs, escalating workarounds, and corrupted index state across Eluvian projects. These rules are mandatory for all git operations.

### Before ANY git command
Check for and remove stale lock files first:
```bash
rm -f .git/index.lock .git/"index "*.lock .git/"index "[0-9]* 2>/dev/null
```
Run this before `git add`, `git commit`, `git status`, or `git push`. No exceptions.

### Sequential execution only
- Never chain git commands with `&&`. Run each command separately and verify it completed before running the next.
- Never run a second git command while the first is still executing.
- Wait for `git add` to finish before running `git commit`. Wait for `git commit` to finish before running `git push`.

### Environment flags
Always use `GIT_TERMINAL_PROMPT=0` to prevent git from hanging on credential prompts:
```bash
GIT_TERMINAL_PROMPT=0 git push
```

### Timeout handling
- If a git command takes more than 15 seconds, it is likely stuck. Kill it and check for lock files.
- Never escalate to plumbing commands (`git write-tree`, `git update-ref`) to work around a stuck commit. Fix the root cause (stale locks) instead.

### If git operations fail repeatedly
1. Kill all git processes: `pkill -f git`
2. Remove all lock files: `rm -f .git/index.lock .git/"index "*.lock .git/"index "[0-9]*`
3. Verify index health: `git status`
4. Then retry the operation