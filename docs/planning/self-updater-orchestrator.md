# Self-Updating macOS App — Orchestrator Plan
**Date:** 2026-03-13
**Project:** study
**Requested By:** CEO
**Status:** Ready for Execution

---

## Goal

Eliminate the `tauri dev` workflow entirely. Build study into a standalone `.app` installed on the CEO's Mac. Code changes are pushed to GitHub and tagged for release. The app checks GitHub Releases for updates and pulls them down when a new version is available. This establishes the update infrastructure for future users.

---

## Decisions Made

- **Per-app update model** — no centralized update platform
- **Manual version tagging** — releases happen when the CEO decides, not on every push
- **macOS aarch64 only** — no Intel build needed
- **Local builds** — `cargo tauri build` runs on the CEO's machine, not GitHub Actions
- **GitHub Releases as distribution endpoint** — already configured in `tauri.conf.json`

---

## Current State

| Component | Status | Location |
|---|---|---|
| `tauri-plugin-updater` dependency | ✅ Done | `src-tauri/Cargo.toml` |
| Updater plugin initialized in Rust | ✅ Done | `src-tauri/src/lib.rs` (.setup block) || Updater config in tauri.conf.json | ⚠️ Partial — pubkey is placeholder | `src-tauri/tauri.conf.json` |
| `createUpdaterArtifacts: true` | ✅ Done | `src-tauri/tauri.conf.json` bundle config |
| Capabilities (updater + process restart) | ✅ Done | `src-tauri/capabilities/default.json` |
| GitHub Actions release workflow | ✅ Exists but not needed for now | `.github/workflows/release.yml` |
| Signing keypair | ❌ Not generated | — |
| Release script | ❌ Not created | — |
| Update UI in frontend | ❌ Not created | — |
| First release build | ❌ Not done | — |

---

## Architecture

```
Developer's Mac                          GitHub
┌─────────────────┐                     ┌──────────────────────┐
│ Code changes     │──── git push ─────▶│ main branch          │
│                  │                     │                      │
│ cargo tauri build│                     │                      │
│ (aarch64 only)  │                     │                      │
│       │         │                     │                      │
│       ▼         │                     │                      │
│ .app + .tar.gz  │                     │                      │
│ + latest.json   │── release.sh ──────▶│ GitHub Releases      │
│ (signed)        │   (gh CLI upload)   │  ├── latest.json     │
└─────────────────┘                     │  ├── Study.app.tar.gz│
                                        │  └── Study.app.tar.gz│
                                        │       .sig            │
                                        └──────────┬───────────┘
                                                   │                                        ┌──────────┴───────────┐
                                        │ Installed Study.app   │
                                        │ checks endpoint ──────┘
                                        │ downloads + verifies
                                        │ signature → restarts
                                        └──────────────────────┘
```

**Update endpoint (already configured):**
`https://github.com/EverestMons/study/releases/latest/download/latest.json`

The Tauri updater checks this URL, compares the version in `latest.json` against the running app version, and if newer, downloads the `.tar.gz`, verifies the signature against the embedded public key, extracts, and relaunches.

---

## Execution Steps

### Step 1 — Generate Signing Keypair
**Agent:** Study Developer
**Depends on:** Nothing

Generate a Tauri updater signing keypair.

Tasks:
1. Run `npx tauri signer generate -w ~/.tauri/study.key`
2. Record the public key string from stdout
3. Replace `"REPLACE_WITH_PUBLIC_KEY"` in `src-tauri/tauri.conf.json` with the actual public key
4. Commit the updated `tauri.conf.json`
5. Provide the CEO with instructions for storing the private key safely
**CEO action required:** Decide on a password for the keypair (or empty for simplicity). Back up `~/.tauri/study.key` somewhere safe — if this is lost, existing installations can't verify updates signed with a new key.

**Output:** Updated `tauri.conf.json` with real public key. Private key at `~/.tauri/study.key`.

---

### Step 2 — Tauri Config Cleanup
**Agent:** Study Developer
**Depends on:** Nothing (parallel with Step 1)

Update `tauri.conf.json` and the build configuration for aarch64-only local builds.

Tasks:
1. In `tauri.conf.json`, change `"targets": "all"` to `"targets": ["dmg", "updater"]` under `bundle` — we only need the macOS DMG for installation and the updater artifacts for the update flow
2. Verify the updater endpoint URL is correct: `https://github.com/EverestMons/study/releases/latest/download/latest.json`
3. Confirm `createUpdaterArtifacts` is `true`
4. Add a `.cargo/config.toml` at the `src-tauri` level (if not already present) to default the build target:
   ```toml
   [build]
   target = "aarch64-apple-darwin"
   ```

**Output:** Clean config targeting aarch64 macOS only.

---

### Step 3 — Release Script
**Agent:** Study Developer
**Depends on:** Nothing (parallel with Steps 1-2)
Create `release.sh` at project root. The script handles the full release flow: version bump → commit → tag → push → local build → upload to GitHub Releases.

**Prerequisites the script should check:**
- `gh` CLI is installed and authenticated
- `TAURI_SIGNING_PRIVATE_KEY` environment variable is set (or the script reads from `~/.tauri/study.key`)
- No uncommitted changes (other than what the script is about to modify)
- Cargo and Node toolchains are available

**The script should:**
1. Take a version number as argument: `./release.sh 0.2.0`
2. Validate semver format
3. Update `version` in `src-tauri/tauri.conf.json`
4. Update `version` in `src-tauri/Cargo.toml`
5. Update `version` in `package.json` (if present)
6. Run `npm run build` (Vite frontend build)
7. Run `cargo tauri build --target aarch64-apple-darwin` with the signing key
8. Commit: `git add -A && git commit -m "release: v{version}"`
9. Tag: `git tag v{version}`
10. Push: `git push && git push --tags`
11. Create a GitHub Release using `gh release create v{version}` and upload:
    - The `.tar.gz` updater bundle from `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/`
    - The `.tar.gz.sig` signature file
    - The `latest.json` manifest
    - The `.dmg` (for fresh installs)

**Important:** The `latest.json` file needs to be uploaded as a release asset named exactly `latest.json` so the endpoint URL resolves correctly.

**Output:** `release.sh` at project root, executable, documented with usage instructions in a comment header.
---

### Step 4 — Update UI Component
**Agent:** Study Developer
**Depends on:** Nothing (parallel with Steps 1-3)

Create an update checker in the React frontend.

Implementation:
1. Import from Tauri updater and process plugins:
   ```js
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';
   ```
2. On app launch, check for updates (with a try/catch — must not crash if offline or endpoint unreachable)
3. If an update is available, show a banner/toast with:
   - Current version → new version
   - "Update Now" button
   - "Later" dismiss
4. On "Update Now": download with progress indication, then `relaunch()`
5. Add a manual "Check for Updates" option accessible from the UI
6. If already on latest version, show brief "Up to date" confirmation
7. If check fails (offline, endpoint down), fail silently on auto-check, show error on manual check

Keep it minimal — a banner at the top of the screen is fine.

**Output:** Update component integrated into the app. Receipt listing files created/modified.

---

### Step 5 — First Release Build (CEO)
**Agent:** CEO (manual)
**Depends on:** Steps 1-4 all complete
1. Ensure all changes from Steps 1-4 are committed and pushed
2. Install `gh` CLI if not already present: `brew install gh && gh auth login`
3. Set the signing key environment variable:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/study.key)
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""  # or your password
   ```
4. Run `./release.sh 0.1.0`
5. Wait for the build to complete
6. Go to GitHub → Releases → confirm the release and assets are published
7. Download the `.dmg` from the release (or find it locally in `src-tauri/target/`)
8. Install the app on your Mac
9. Launch → confirm it runs

**Output:** Study.app installed and running.

---

### Step 6 — Verify Update Cycle
**Agent:** Study Security & Testing Analyst
**Depends on:** Step 5 complete

End-to-end test of the update flow:

1. With v0.1.0 installed, make a trivial visible change (e.g., update a version display string)
2. Run `./release.sh 0.2.0`
3. Open the installed app (still on v0.1.0)
4. Verify the update check detects v0.2.0
5. Trigger the update and verify download + install + relaunch
6. Verify the app is now running v0.2.0 with the visible change
Test matrix:
- Auto-check on launch detects new version
- Manual "Check for Updates" works
- Already on latest → shows "up to date"
- Offline / endpoint unreachable → fails gracefully, no crash
- Signature verification → tampered artifact should be rejected

**Output:** QA report deposited to `/knowledge/qa/`.

---

## Execution Order

```
Step 1 (signing keypair) ──┐
Step 2 (config cleanup) ───┼── All parallel
Step 3 (release script) ───┤
Step 4 (update UI) ────────┘
         │
         ▼
Step 5 (first release build) — CEO manual
         │
         ▼
Step 6 (QA full cycle)
```

Steps 1-4 can be executed by the Dev agent sequentially in one or two sessions.

---

## Future Enhancements (Not in Scope)

- **GitHub Actions builds** — when you want to stop building locally, re-enable the workflow. The existing `release.yml` just needs the matrix trimmed to aarch64 only and the signing secrets added.
- **Auto-update without user prompt** — currently requires user to click "Update Now". Silent background updates could be added later.
- **Multi-platform builds** — add Windows/Linux targets when the user base requires it.
---

## Open Questions

None. All CEO decisions resolved.

---

## Risk Notes

- **First local `cargo tauri build` will be slow** — full release profile compilation with LTO. Subsequent builds benefit from incremental compilation for Rust and cached Vite output.
- **Private key must not be lost.** Back up `~/.tauri/study.key`. If lost, you'd generate a new keypair, update the pubkey in config, and cut a fresh release that all users install manually (the old app can't verify updates from a new key).
- **`latest.json` naming matters.** The updater endpoint expects the file at exactly `https://github.com/EverestMons/study/releases/latest/download/latest.json`. The release script must upload it with that exact filename.