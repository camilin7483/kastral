#!/usr/bin/env bash
# Fetch Tauri sidecar binaries for Linux CI.
# Downloads ONE pinned BtbN FFmpeg-Builds static build (no `latest` fallback:
# reproducible sidecars) and places it as
# src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu.
# Ghostscript is NOT a sidecar on Linux: it must come from the system
# (workflow installs it via apt); the app resolves it through PATH.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu"
mkdir -p src-tauri/binaries
TMP="$(mktemp -d /tmp/kastral-sidecars.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "ci-fetch-sidecars: ERROR: $*" >&2; exit 1; }

# Pinned build (verify it still exists if CI starts failing):
# BtbN tag autobuild-2026-11-01-12-49, asset ffmpeg-n8.1.3-29-gad3b795b72-linux64-gpl-8.1.tar.xz
BTBN_TAG="autobuild-2026-11-01-12-49"
BTBN_ASSET="ffmpeg-n8.1.3-29-gad3b795b72-linux64-gpl-8.1.tar.xz"
BTBN_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/${BTBN_TAG}/${BTBN_ASSET}"

ARCHIVE="$TMP/ffmpeg.tar.xz"
curl -fsSL --retry 3 -o "$ARCHIVE" "$BTBN_URL" \
  || fail "could not download pinned static ffmpeg ($BTBN_URL). Check network access or update the pinned tag/asset."

BIN="$(tar -tf "$ARCHIVE" | grep -E '/bin/ffmpeg$' | head -n1)"
[ -n "$BIN" ] || fail "pinned BtbN archive has no bin/ffmpeg binary (layout changed?)"
tar -xJf "$ARCHIVE" -C "$TMP" "$BIN"
cp "$TMP/$BIN" "$OUT"

chmod +x "$OUT"
[ -s "$OUT" ] || fail "downloaded ffmpeg is empty ($OUT)"
"$OUT" -version >/dev/null 2>&1 || fail "downloaded ffmpeg does not run ($OUT -version failed)"
echo "ci-fetch-sidecars: OK -> $OUT ($(du -h "$OUT" | cut -f1))"
command -v gs >/dev/null 2>&1 || echo "ci-fetch-sidecars: WARNING: 'gs' (Ghostscript) not in PATH; install it (apt install ghostscript) or PDF features will fail at runtime." >&2
