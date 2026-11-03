#!/usr/bin/env bash
# Falla si queda cualquier rastro del template de origen ("ai-studio", "applet")
# en el código fuente versionado. Uso: bun run check:branding (y en CI).
set -e
cd "$(dirname "$0")/.."

PATTERN='ai-studio|ai_studio|aistudio|applet'
# Rutas y artefactos que nunca son código fuente (ni deben auditarse).
# (este mismo script se autoexcluye: su trabajo es nombrar los patrones).
EXCLUDES='^(node_modules/|src-tauri/target/|\.next/|out/|coverage/|\.git/|public/assets/brand/|\.aistudio/|scripts/check-branding\.sh)'

hits=$(git grep -l -i -E "$PATTERN" -- . ':!bun.lock' ':!package-lock.json' 2>/dev/null | grep -v -E "$EXCLUDES" || true)

# .gitignore puede mencionar .aistudio/ como carpeta ignorada de tooling: no es rastro de template.
hits=$(echo "$hits" | grep -v -E '^(\.gitignore|instrucciones/)' || true)

if [ -n "$hits" ]; then
  echo "check-branding: FAIL — referencias residuales de template encontradas:" >&2
  echo "$hits" >&2
  git grep -n -i -E "$PATTERN" -- $hits 2>/dev/null | head -20 >&2 || true
  exit 1
fi
echo "check-branding: OK — sin rastros de template."
