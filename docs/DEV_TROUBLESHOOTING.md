# Study — Dev Environment Troubleshooting

**Last Updated:** 2026-03-08

---

## Fast Launch (Skip Tauri Build System)

If Tauri's build system is slow, stalled, or recompiling unnecessarily, bypass it entirely:

```bash
cd ~/Desktop/GitHub/study
npx vite &
sleep 2
./src-tauri/target/debug/study
```

This runs the Vite dev server and the pre-compiled Rust binary separately. JS hot-reload still works via Vite. Use this for testing frontend changes without waiting for Rust compilation.

**When to use:** Any time you're only changing JS/JSX/CSS files and the Rust binary hasn't changed.

**When NOT to use:** After changing `lib.rs`, `Cargo.toml`, or migration SQL files — those require a real `cargo tauri dev` or `cargo build` in `src-tauri/`.

---

## Port 5173 Already In Use

Vite doesn't always clean up when the app crashes. Kill the stale process:

```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null
```

This is also built into `npm run tauri:dev` (added 2026-03-08).

---

## Never `rm -rf target`

The `src-tauri/target` directory can be 5-10GB of small files. Deleting it with `rm -rf`:
- Takes minutes and hammers the disk
- Triggers Spotlight indexing on all new files during rebuild
- Causes filesystem I/O timeouts (`ETIMEDOUT: connection timed out, read`)
- Forces a full recompile of ~500 crates (20+ minutes)

**Instead use:** `cargo clean` (inside `src-tauri/`) — faster, cleaner, doesn't thrash the filesystem.

**If you already deleted it:** Wait for disk I/O to settle before doing anything else. Check with:
```bash
ps aux | grep -i "mds_stores\|mdworker" | grep -v grep
```
When `mds_stores` CPU is <1%, the disk has settled.

---

## Prevent Spotlight From Indexing Build Artifacts

```bash
touch ~/Desktop/GitHub/study/src-tauri/target/.metadata_never_index
sudo mdutil -i off ~/Desktop/GitHub/study
```

---

## Avoid Unnecessary Rust Recompilation

Things that trigger partial or full Rust recompiles:
- Changing `Cargo.toml` (features, dependencies)
- Changing `lib.rs`
- Changing migration SQL files (they're `include_str!` in lib.rs)
- The Tauri file watcher detecting changes in `src-tauri/`

Things that do NOT trigger Rust recompiles:
- Any JS/JSX/CSS file change (hot-reloaded by Vite)
- Changes to files outside `src-tauri/`

The `.taurignore` file (added 2026-03-08) tells the watcher to ignore `target/`, `gen/`, `dist/`, and `node_modules/`.

---

## Cargo Dev Profile (Cargo.toml)

Optimized for fast dev builds (added 2026-03-08):
- `opt-level = 0` — no optimization for your code
- `debug = 0` — skip debug symbols (faster linking)
- `[profile.dev.package."*"]` `opt-level = 2` — optimize dependencies (they don't change)

---

## sccache

`sccache` is configured as the Rust compiler wrapper (`.cargo/config.toml`). It caches compiled crates globally. After the first full build, subsequent builds reuse cached artifacts even after `cargo clean`.

Check cache stats: `sccache --show-stats`
