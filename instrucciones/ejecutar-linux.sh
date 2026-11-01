#!/usr/bin/env bash
# ==============================================================================
# KASTRAL — Lanzador de Aplicación Local para Linux (100 % Sin Internet)
# Desarrollado por Andres Guerrero
# No requiere API keys, tokens, cuentas personales ni conexión a Internet.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT=3000
APP_URL="http://127.0.0.1:${PORT}"

cd "$PROJECT_ROOT"

export NODE_ENV=production
export NEXT_PUBLIC_DISABLE_ADS=true
export NEXT_PUBLIC_SITE_URL="$APP_URL"

if [ ! -d ".next" ]; then
  echo "[Kastral] Compilando la aplicación local por primera vez..."
  npm run build
fi

echo "[Kastral] Iniciando motor local en ${APP_URL} (100 % Offline)..."
npx next start -H 127.0.0.1 -p "$PORT" &
SERVER_PID=$!

# Esperar a que el servidor local responda
for i in {1..30}; do
  if curl -s "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Abrir en modo ventana de aplicación nativa si hay un navegador basado en Chromium o Firefox
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --app="$APP_URL"
elif command -v chromium >/dev/null 2>&1; then
  chromium --app="$APP_URL"
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --app="$APP_URL"
elif command -v brave-browser >/dev/null 2>&1; then
  brave-browser --app="$APP_URL"
else
  xdg-open "$APP_URL"
fi

wait $SERVER_PID
