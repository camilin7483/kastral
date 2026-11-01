@echo off
REM ==============================================================================
REM KASTRAL — Lanzador de Aplicacion Local para Windows 10/11 (100% Sin Internet)
REM Desarrollado por Andres Guerrero
REM No requiere API keys, tokens, cuentas personales ni conexion a Internet.
REM ==============================================================================

SETLOCAL
cd /d "%~dp0\.."

SET NODE_ENV=production
SET NEXT_PUBLIC_DISABLE_ADS=true
SET NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
SET PORT=3000

IF NOT EXIST ".next" (
  echo [Kastral] Compilando la aplicacion local por primera vez...
  call npm run build
)

echo [Kastral] Iniciando Kastral en modo 100%% local (http://127.0.0.1:3000)...
start /B cmd /c "npx next start -H 127.0.0.1 -p 3000"

timeout /t 3 /nobreak >nul

REM Abrir como ventana nativa de escritorio usando Microsoft Edge (incluido en Windows 10/11)
start msedge --app=http://127.0.0.1:3000

echo.
echo Kastral esta ejecutandose localmente sin conexion a Internet.
echo Cierra esta ventana cuando termines de usar la aplicacion.
pause
