# Update Cycle Verification — QA Report
**Date:** 2026-03-13
**Tester:** Study Security & Testing Analyst
**Scope:** Step 6 — End-to-end update flow verification
**App Version Installed:** v0.1.0
**Codebase Version:** v0.2.0 (tagged but not released)

---

## Executive Summary

**BLOCKER found:** The update endpoint returns **HTTP 404** because the repository is **private**. The Tauri updater cannot fetch `latest.json` from GitHub Releases without authentication. The entire update flow is non-functional until this is resolved. All other infrastructure components are correctly wired.

---

## Infrastructure Audit

### 1. Signing & Verification ✅
| Item | Status | Detail |
|---|---|---|
| Keypair generated | ✅ | Private key at `~/.tauri/study.key` |
| Public key in config | ✅ | `tauri.conf.json` → `plugins.updater.pubkey` — base64-encoded minisign pubkey |
| `createUpdaterArtifacts` | ✅ | `tauri.conf.json` → `bundle.createUpdaterArtifacts: true` |
| Signature in v0.1.0 release | ✅ | `Study.app.tar.gz.sig` present, signature embedded in `latest.json` |

### 2. Tauri Backend ✅
| Item | Status | Detail |
|---|---|---|
| `tauri-plugin-updater` dependency | ✅ | `Cargo.toml` line 22 |
| `tauri-plugin-process` dependency | ✅ | `Cargo.toml` line 23 |
| Updater plugin initialized | ✅ | `lib.rs:53` — `tauri_plugin_updater::Builder::new().build()` in `.setup()` |
| Process plugin initialized | ✅ | `lib.rs:60` — `tauri_plugin_process::init()` |
| Capabilities granted | ✅ | `default.json` — `"updater:default"` + `"process:allow-restart"` |

### 3. Frontend Integration ✅
| Item | Status | Detail |
|---|---|---|
| `updater.js` wrapper | ✅ | `src/lib/updater.js` — `checkForUpdate()` + `installUpdate()` |
| Version display | ✅ | `vite.config.js` defines `__APP_VERSION__` from `package.json` |
| Auto-check on launch | ✅ | `StudyContext.jsx:299-305` — 3-second delayed check, silent failure |
| Manual check button | ✅ | `SettingsModal.jsx:141` — "Check for Updates" with loading state |
| Update banner | ✅ | `ScreenRouter.jsx:18-37` — `UpdateBanner` component with version display, download button, dismiss |
| Install + relaunch | ✅ | `StudyContext.jsx:1300-1312` — `doInstallUpdate()` calls `installAppUpdate()` then `relaunch()` |
| Up-to-date notification | ✅ | `StudyContext.jsx:1291` — `addNotif("info", "You're on the latest version.")` |
| Error handling | ✅ | `StudyContext.jsx:1293-1296` — catch + `addNotif("error", ...)` |

### 4. Release Script ✅
| Item | Status | Detail |
|---|---|---|
| Version bump (3 files) | ✅ | `package.json`, `Cargo.toml`, `tauri.conf.json` |
| Version validation | ✅ | Semver regex check |
| Signing key loading | ✅ | `~/.tauri/study.key` fallback |
| `latest.json` generation | ✅ | Correct Tauri updater format with platform, signature, download URL |
| Artifact upload | ✅ | DMG + .tar.gz + .sig + latest.json |
| Draft release | ✅ | `--draft` flag — requires manual publish |

### 5. v0.1.0 Release Assets ✅
| Asset | Present |
|---|---|
| `latest.json` | ✅ |
| `Study.app.tar.gz` | ✅ |
| `Study.app.tar.gz.sig` | ✅ |
| `Study_0.1.0_aarch64.dmg` | ✅ |

### 6. Installed App ✅
- Location: `/Applications/Study.app`
- `CFBundleShortVersionString`: `0.1.0`

---

## Endpoint Verification

### Configured endpoint
```
https://github.com/EverestMons/study/releases/latest/download/latest.json
```

### Test result
```
HTTP/2 404 — Not Found
```

### Root cause
```
gh repo view EverestMons/study --json visibility → "PRIVATE"
```

GitHub does not serve release assets via the `/releases/latest/download/` URL pattern for **private** repositories. This URL only works for public repos. Authenticated `gh release download` succeeds, confirming the asset exists and is well-formed — the Tauri updater simply cannot reach it.

### `latest.json` content (verified via authenticated download)
```json
{
  "version": "0.1.0",
  "platforms": {
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/EverestMons/study/releases/download/v0.1.0/Study.app.tar.gz"
    }
  }
}
```

The JSON structure is correct. The `url` field also points to a GitHub Releases asset URL that will 404 for unauthenticated requests.

---

## Test Matrix Results

| Test Case | Result | Notes |
|---|---|---|
| Auto-check on launch detects new version | ❌ BLOCKED | Endpoint 404 → `check()` returns null or throws |
| Manual "Check for Updates" works | ❌ BLOCKED | Same endpoint issue |
| Already on latest → shows "up to date" | ⚠️ UNTESTABLE | Would work if endpoint were reachable (code path verified in source) |
| Offline / endpoint unreachable → graceful failure | ✅ PASS (by implication) | 404 is effectively "unreachable" — the app doesn't crash, error is caught silently on auto-check |
| Signature verification (tampered artifact rejected) | ⚠️ UNTESTABLE | Can't reach download phase |

---

## Findings

### BLOCKER: Private repo breaks update flow

**Severity:** Critical
**Impact:** Update detection and download are completely non-functional

The Tauri updater plugin makes unauthenticated HTTPS requests. Private GitHub repos return 404 for all release asset URLs unless the request includes a valid GitHub token.

**Resolution options (pick one):**

1. **Make the repo public** — simplest. The endpoint URL and all asset URLs immediately work. No code changes needed.

2. **Use a custom update server** — host `latest.json` and the `.tar.gz` on a public endpoint (e.g., S3 bucket, Cloudflare R2, your own server). Update `tauri.conf.json` → `plugins.updater.endpoints` to point there. Update `release.sh` to upload to the custom endpoint.

3. **Use Tauri's custom header support** — configure the updater with a GitHub token header:
   ```json
   "updater": {
     "endpoints": ["https://api.github.com/repos/EverestMons/study/releases/latest"],
     "headers": { "Authorization": "Bearer <token>" }
   }
   ```
   This leaks the token into the binary and requires a different `latest.json` format. Not recommended.

4. **GitHub Pages endpoint** — create a `gh-pages` branch, publish `latest.json` there (public by default even for private repos with Pages enabled). The `.tar.gz` download URL still needs to be publicly accessible, so this alone doesn't solve the artifact download step.

**Recommended:** Option 1 (make repo public) if acceptable, otherwise Option 2 (custom static host).

### MINOR: `latest.json` URL in release uses version-pinned path

The `url` field in `latest.json` points to `https://github.com/EverestMons/study/releases/download/v0.1.0/Study.app.tar.gz` — this is correct behavior since each release's `latest.json` references its own version's artifact. No issue here.

### MINOR: Version display shows "dev" in dev mode

`SettingsModal.jsx:148` — `typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"`. This is correct; Vite's `define` only injects the value at build time. No issue.

---

## Code Quality Assessment

The update infrastructure code is clean and well-structured:

- **`src/lib/updater.js`** (25 lines) — thin wrapper, clean separation of check vs. install
- **`UpdateBanner`** in `ScreenRouter.jsx` — minimal, correct state handling, dismiss works
- **`StudyContext.jsx`** update handlers — proper error handling, correct state transitions (`null → checking → null` and `null → downloading → installing → relaunch`)
- **`release.sh`** — robust validation, clean artifact handling, proper `latest.json` generation
- Silent auto-check with 3-second delay — good UX, won't block startup

---

## Conclusion

All code, configuration, and infrastructure components are correctly implemented. The **sole blocker** is that the GitHub repository is private, making release asset URLs inaccessible to the Tauri updater's unauthenticated HTTP client.

Once the repo is made public (or an alternative endpoint is configured), the update flow should work end-to-end. A re-test of the full matrix should be performed after the fix.

---

## Re-test Checklist (after fixing endpoint access)

- [ ] `curl https://github.com/EverestMons/study/releases/latest/download/latest.json` returns 200 with valid JSON
- [ ] Build and release v0.2.0 with `./release.sh 0.2.0`
- [ ] Publish the release (it's created as draft)
- [ ] Open installed v0.1.0 app → auto-check banner appears within ~5 seconds
- [ ] Click "Update Now" → download progress → install → relaunch
- [ ] App shows v0.2.0 after relaunch
- [ ] Open Settings → "Check for Updates" → "You're on the latest version"
- [ ] Disconnect network → "Check for Updates" → error notification, no crash
- [ ] Tamper test: download `.tar.gz`, modify a byte, re-upload → update should fail signature verification
