# Updater Diagnostic — 2026-03-24

## Problem
App reports "You're on the latest version" when a newer release (v0.2.19) exists.

## Findings

### (a) Current app version
**v0.2.19** — consistent across all three version files:
- `package.json`: `"version": "0.2.19"`
- `src-tauri/tauri.conf.json`: `"version": "0.2.19"`
- `src-tauri/Cargo.toml`: (matches)

### (b) Updater endpoint
```
https://github.com/EverestMons/study/releases/latest/download/latest.json
```
Configured in `src-tauri/tauri.conf.json` → `plugins.updater.endpoints[0]`.

**How GitHub resolves this URL**: `/releases/latest/` redirects to the latest **published** (non-draft, non-prerelease) release. Currently that is **v0.2.17**.

So the endpoint currently serves: `v0.2.17/latest.json` → `{ "version": "0.2.17", ... }`

### (c) Version comparison logic

`src/lib/updater.js` (26 lines) is a thin wrapper:
```js
import { check } from "@tauri-apps/plugin-updater";
export async function checkForUpdate() {
  const update = await check();   // Tauri native plugin does the work
  if (!update) return null;
  return { version: update.version, notes: update.body || "", update };
}
```

**How `check()` works** (inside `@tauri-apps/plugin-updater`):
1. Fetches JSON from the configured endpoint
2. Reads the `version` field from the response
3. Compares it against the app's compiled-in version (`tauri.conf.json` → `0.2.19`)
4. Uses semver comparison: if remote version ≤ current version → returns `null` (no update)
5. Also checks the platform key matches (`darwin-aarch64` or `darwin-x86_64`)

**Why it returns "up to date"**: The endpoint serves `v0.2.17/latest.json` which says `version: "0.2.17"`. The app is v0.2.19. Since `0.2.17 < 0.2.19`, Tauri concludes no update is available and `check()` returns null.

In `StudyContext.jsx:1590-1604`:
```js
const info = await checkForUpdate();
if (info) {
  setUpdateInfo(info);
} else {
  addNotif("info", "You're on the latest version.");  // ← this fires
}
```

### (d) Release state on GitHub

| Release | Status | latest.json version |
|---------|--------|-------------------|
| v0.2.19 | **Draft** (not published) | 0.2.19 |
| v0.2.17 | **Latest** (published) | 0.2.17 |
| v0.2.16 | Published | - |
| v0.2.15 | Published | - |

**Root cause: v0.2.19 is still a draft.** GitHub's `/releases/latest/` only resolves to published releases. The updater never sees v0.2.19.

### (e) release.sh artifact production

`release.sh` correctly:
- Builds the app with `npx tauri build --target aarch64-apple-darwin`
- Locates `.tar.gz` + `.sig` in `bundle/macos/`
- Generates a `latest.json` with correct Tauri v2 format (`version`, `notes`, `pub_date`, `platforms.darwin-aarch64` with `signature` + `url`)
- Uploads DMG + `.tar.gz` + `.sig` + `latest.json` to a **draft** GitHub Release (`--draft` flag)
- Pushes the git tag

**However**, release.sh only builds `aarch64-apple-darwin` (Apple Silicon). The CI workflow (`.github/workflows/release.yml`) builds both `aarch64` and `x86_64`, and `tauri-apps/tauri-action@v0` generates a `latest.json` with all four platform keys (`darwin-aarch64`, `darwin-aarch64-app`, `darwin-x86_64`, `darwin-x86_64-app`).

The v0.2.19 draft was created by the CI workflow (has both architectures + CI-generated latest.json).

### (f) Static update manifest
No static `update-manifest.json` or equivalent exists in `src-tauri/`. The updater relies entirely on the GitHub release asset.

## Diagnosis Summary

**The updater logic and artifact format are both correct.** The problem is purely operational:

1. **v0.2.19 release is still in Draft state** — it was never published on GitHub
2. Both `release.sh` and the CI workflow create releases as drafts intentionally (requires manual publish)
3. Until published, GitHub's `/releases/latest/download/latest.json` continues serving v0.2.17's manifest
4. Any app running v0.2.17+ will see "up to date" because `0.2.17 ≤ current_version`

## Fix
Publish the v0.2.19 draft release on GitHub. Once published, `/releases/latest/` will resolve to v0.2.19 and the updater will offer it to users on older versions.

## Secondary observation
`release.sh` only produces aarch64 artifacts. If run locally (not via CI), x86_64 users would get a `latest.json` without their platform key, and the updater would report "up to date" even if the release is published. The CI workflow does not have this issue.
