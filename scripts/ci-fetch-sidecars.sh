#!/usr/bin/env bash
# Fetch Tauri sidecar binaries for Linux CI.
# Downloads a static ffmpeg build (johnvansickle, fallback BtbN) and places it
# as src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu.
# Ghostscript is NOT a sidecar on Linux: it must come from the system
# (workflow installs it via apt); the app resolves it through PATH.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu"
mkdir -p src-tauri/binaries
TMP="$(mktemp -d /tmp/kastral-sidecars.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "ci-fetch-sidecars: ERROR: $*" >&2; exit 1; }

JOHN="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"

ARCHIVE="$TMP/ffmpeg.tar.xz"
if curl -fsSL --retry 3 -o "$ARCHIVE" "$JOHN"; then
  BIN="$(tar -tf "$ARCHIVE" | grep -E '/ffmpeg$' | head -n1)"
  [ -n "$BIN" ] || fail "johnvansickle archive has no ffmpeg binary"
  tar -xJf "$ARCHIVE" -C "$TMP" "$BIN"
  cp "$TMP/$BIN" "$OUT"
elif curl -fsSL --retry 3 -o "$ARCHIVE" "$BTBN"; then
  BIN="$(tar -tf "$ARCHIVE" | grep -E '/bin/ffmpeg$' | head -n1)"
  [ -n "$BIN" ] || fail "BtbN archive has no bin/ffmpeg binary"
  tar -xJf "$ARCHIVE" -C "$TMP" "$BIN"
  cp "$TMP/$BIN" "$OUT"
else
  fail "could not download static ffmpeg from johnvansickle ($JOHN) nor BtbN ($BTBN). Check network access and update URLs."
fi

chmod +x "$OUT"
[ -s "$OUT" ] || fail "downloaded ffmpeg is empty ($OUT)"
"$OUT" -version >/dev/null 2>&1 || fail "downloaded ffmpeg does not run ($OUT -version failed)"
echo "ci-fetch-sidecars: OK -> $OUT ($(du -h "$OUT" | cut -f1))"
command -v gs >/dev/null 2>&1 || echo "ci-fetch-sidecars: WARNING: 'gs' (Ghostscript) not in PATH; install it (apt install ghostscript) or PDF features will fail at runtime." >&2
