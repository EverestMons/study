#!/usr/bin/env bash
# release.sh — Build and publish a Study release to GitHub Releases.
#
# Usage:
#   ./release.sh <version>
#
# Example:
#   ./release.sh 0.2.0
#
# What it does:
#   1. Validates prerequisites (gh, cargo, node, signing key, clean tree)
#   2. Bumps version in package.json, Cargo.toml, tauri.conf.json
#   3. Builds the app (Vite frontend + Tauri native)
#   4. Commits, tags, and pushes
#   5. Creates a draft GitHub Release with DMG + updater artifacts
#
# The signing key is read from ~/.tauri/study.key unless
# TAURI_SIGNING_PRIVATE_KEY is already set in the environment.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
error() { echo -e "${RED}[release]${NC} $*" >&2; }
die()   { error "$@"; exit 1; }

# ── Argument validation ──────────────────────────────────────────────
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  die "Usage: ./release.sh <version>  (e.g. ./release.sh 0.2.0)"
fi

# Validate semver (major.minor.patch, optional pre-release)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  die "Invalid semver: $VERSION (expected format: X.Y.Z or X.Y.Z-beta.1)"
fi

TAG="v${VERSION}"

# ── Prerequisites ────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v gh    >/dev/null 2>&1 || die "gh CLI not found. Install: brew install gh"
command -v cargo >/dev/null 2>&1 || die "cargo not found. Install Rust: https://rustup.rs"
command -v node  >/dev/null 2>&1 || die "node not found. Install Node.js"
command -v npm   >/dev/null 2>&1 || die "npm not found."
command -v jq    >/dev/null 2>&1 || die "jq not found. Install: brew install jq"

gh auth status >/dev/null 2>&1 || die "gh CLI not authenticated. Run: gh auth login"

# Signing key
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="$HOME/.tauri/study.key"
  if [[ ! -f "$KEY_FILE" ]]; then
    die "Signing key not found at $KEY_FILE and TAURI_SIGNING_PRIVATE_KEY not set.\nGenerate with: npx tauri signer generate -w ~/.tauri/study.key"
  fi
  export TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  info "Loaded signing key from $KEY_FILE"
fi

# Empty password (key was generated without one)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

# Clean working tree (allow untracked files — we only care about tracked changes)
if [[ -n "$(git diff --name-only)" ]] || [[ -n "$(git diff --cached --name-only)" ]]; then
  die "Working tree has uncommitted changes. Commit or stash them first."
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "Tag $TAG already exists. Delete it first or choose a different version."
fi

# ── Version bump ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

info "Bumping version to $VERSION..."

# package.json
jq --arg v "$VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json

# src-tauri/Cargo.toml — update the first version = "..." under [package]
sed -i '' -E '1,/^version = "[^"]*"/ s/^version = "[^"]*"/version = "'"$VERSION"'"/' src-tauri/Cargo.toml

# src-tauri/tauri.conf.json
jq --arg v "$VERSION" '.version = $v' src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp && mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json

# Verify all three match
PKG_V="$(jq -r '.version' package.json)"
CARGO_V="$(grep -m1 '^version' src-tauri/Cargo.toml | sed -E 's/version = "(.*)"/\1/')"
TAURI_V="$(jq -r '.version' src-tauri/tauri.conf.json)"

if [[ "$PKG_V" != "$VERSION" ]] || [[ "$CARGO_V" != "$VERSION" ]] || [[ "$TAURI_V" != "$VERSION" ]]; then
  die "Version mismatch after bump:\n  package.json: $PKG_V\n  Cargo.toml: $CARGO_V\n  tauri.conf.json: $TAURI_V"
fi

info "Versions updated: package.json=$PKG_V, Cargo.toml=$CARGO_V, tauri.conf.json=$TAURI_V"

# ── Build ────────────────────────────────────────────────────────────
info "Installing npm dependencies..."
npm ci --silent

info "Building app (this will take a while)..."
npx tauri build --target aarch64-apple-darwin

# ── Locate artifacts ─────────────────────────────────────────────────
BUNDLE_DIR="src-tauri/target/aarch64-apple-darwin/release/bundle"

# DMG
DMG="$(find "$BUNDLE_DIR/dmg" -name '*.dmg' -print -quit 2>/dev/null || true)"
[[ -f "$DMG" ]] || die "DMG not found in $BUNDLE_DIR/dmg/"

# Updater .tar.gz and .sig
UPDATER_GZ="$(find "$BUNDLE_DIR/macos" -name '*.tar.gz' ! -name '*.sig' -print -quit 2>/dev/null || true)"
[[ -f "$UPDATER_GZ" ]] || die "Updater .tar.gz not found in $BUNDLE_DIR/macos/"

UPDATER_SIG="${UPDATER_GZ}.sig"
[[ -f "$UPDATER_SIG" ]] || die "Signature file not found: $UPDATER_SIG"

info "Artifacts found:"
info "  DMG:        $DMG"
info "  Updater:    $UPDATER_GZ"
info "  Signature:  $UPDATER_SIG"

# ── Generate latest.json ────────────────────────────────────────────
# The Tauri updater expects this format at the endpoint URL.
UPDATER_GZ_NAME="$(basename "$UPDATER_GZ")"
SIGNATURE="$(cat "$UPDATER_SIG")"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DOWNLOAD_URL="https://github.com/EverestMons/study/releases/download/${TAG}/${UPDATER_GZ_NAME}"

LATEST_JSON="$BUNDLE_DIR/latest.json"
cat > "$LATEST_JSON" <<EOF
{
  "version": "${VERSION}",
  "notes": "Study v${VERSION}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": "${SIGNATURE}",
      "url": "${DOWNLOAD_URL}"
    }
  }
}
EOF

info "Generated latest.json"

# ── Git commit + tag + push ──────────────────────────────────────────
info "Committing version bump..."
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
if git diff --cached --quiet; then
  info "Version already at $VERSION — no commit needed"
else
  git commit -m "release: v${VERSION}"
fi
git tag "$TAG"

info "Pushing to origin..."
git push
git push --tags

# ── Create GitHub Release ────────────────────────────────────────────
info "Creating draft release ${TAG}..."
gh release create "$TAG" \
  --draft \
  --title "Study ${TAG}" \
  --notes "## Study ${TAG}

### Installation
Download **$(basename "$DMG")** and drag Study to Applications.

### Update
Existing installations will detect this update automatically." \
  "$DMG" \
  "$UPDATER_GZ" \
  "$UPDATER_SIG" \
  "${LATEST_JSON}#latest.json"

info "Done! Draft release created: ${TAG}"
info ""
info "Next steps:"
info "  1. Review the draft at: https://github.com/EverestMons/study/releases"
info "  2. Publish when ready — the app will detect the update automatically"
