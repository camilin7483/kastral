#!/usr/bin/env bash
# Bridge until /api routes are migrated to Tauri commands.
# Static export (`output: 'export'`) cannot include route handlers, so this
# script temporarily moves app/api aside, builds with KASTRAL_EXPORT=1, and
# always restores it via trap.
set -e

cd "$(dirname "$0")/.."

BACKUP_DIR="$(mktemp -d /tmp/kastral-api-backup.XXXXXX)"
MOVED=false

restore_api() {
  if [ "$MOVED" = true ] && [ -d "$BACKUP_DIR/api" ]; then
    mv "$BACKUP_DIR/api" app/api
    MOVED=false
  fi
  rmdir "$BACKUP_DIR" 2>/dev/null || true
}
trap restore_api EXIT

if [ -d app/api ]; then
  mv app/api "$BACKUP_DIR/api"
  MOVED=true
fi

if command -v next >/dev/null 2>&1; then
  KASTRAL_EXPORT=1 next build
else
  KASTRAL_EXPORT=1 bun run build
fi

test -f out/index.html || { echo "ERROR: out/index.html missing" >&2; exit 1; }

count="$(find out/herramientas -maxdepth 1 -name '*.html' | wc -l)"
if [ "$count" -ne 17 ]; then
  echo "ERROR: expected 17 tool slugs in out/herramientas, found $count" >&2
  exit 1
fi

restore_api
trap - EXIT

if [ -n "$(git status --porcelain -- app/api 2>/dev/null)" ]; then
  echo "ERROR: app/api not fully restored" >&2
  git status --porcelain -- app/api >&2
  exit 1
fi
# NOTE: out/ is the expected build artifact, not a leftover. It is NOT
# committed (commit only the files listed by the task). Upstream should add
# out/ to .gitignore (.gitignore is out of scope for this task).

echo "Tauri static export OK: out/index.html + $count tool pages."
