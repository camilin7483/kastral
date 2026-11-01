# Task 7a — Reporte de parches de auditoría

## Qué se hizo

1. **Sidecars con versión fija** (sin fallback a `latest`)
   - `scripts/ci-fetch-sidecars.sh`: una sola URL fijada de BtbN
     (`autobuild-2026-11-01-12-49` /
     `ffmpeg-n8.1.3-29-gad3b795b72-linux64-gpl-8.1.tar.xz`, verificada con
     HTTP 206 por rangos). Fallo explícito si la descarga falla; verifica
     que el binario ejecuta (`-version`).
   - `scripts/ci-fetch-sidecars.ps1`: ffmpeg desde el zip versionado de
     gyan.dev (`packages/ffmpeg-8.1.2-essentials_build.zip`, verificado con
     HTTP 206); Ghostscript desde choco (el workflow lo fija con
     `--version 10.5.1`). Ambos sidecars se verifican ejecutándolos
     (`-version` / `--version`); cualquier fallo es explícito.
   - `release.yml` (Windows): `choco install ghostscript --version 10.5.1 -y`
     (se elimina el `ffmpeg` sin fijar de choco; ffmpeg Windows ahora viene
     solo del zip versionado de gyan).
2. **release.yml — SHA256SUMS**: pasos `Generate SHA256SUMS` en ambos jobs
   (pwsh `Get-FileHash` en Windows, `sha256sum` en Linux) y `SHA256SUMS`
   añadido a los `files` de `softprops/action-gh-release` en cada release.
   Sin cambios en jobs/strategy.
3. **xlsx**: `xlsx@^0.18.5` sustituido por el tarball oficial
   `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` vía `bun add`
   (cierra CVE-2023-30533 y CVE-2024-22363). `tsc` + `bun test lib/` pasan
   sin cambios: `lib/browser-processors.ts` NO se tocó (API `read`,
   `utils.*`, `write` compatible). Se eliminó además una clave `xlsx`
   duplicada/stale (`^0.18.5`) que `bun add` dejó en `bun.lock`.
4. **main.rs**: `kastral_process` rechaza ANTES de decodificar si
   `data_b64.len() > 4*MAX_INPUT_BYTES/3 + 4096`, con error honesto en
   español ("…límite de 50 MB…"). Comando muerto `kastral_health` eliminado
   (función + registro en `generate_handler`); verificado que nada lo
   invoca (`grep` en `app/ lib/ components/ hooks/` y `src-tauri` sin
   resultados fuera de su definición).
5. **engines/mod.rs `make_workdir`**: nombre aleatorio de 128 bits vía
   `getrandom` (RNG del SO, nueva dep directa `getrandom = "0.3"`,
   reutiliza la 0.3.4 ya fijada en `Cargo.lock`), creación exclusiva
   (`create`, no `create_all`, con reintento) y modo `0o700` en Unix
   (`DirBuilderExt`), espejando el servidor (`randomUUID` + `mkdir 0o700`).
   `main.rs` ahora usa `engines::make_workdir()`.

## Validación

- `cargo test` (crate completo): **30 passed, 0 failed** (incl. 2 tests
  nuevos: `workdir_is_exclusive_and_private`,
  `rechaza_b64_sobredimensionado_antes_de_decodificar`).
- `cargo fmt --check`: OK.
- `bunx tsc --noEmit`: OK.
- `bun test lib/`: **19 pass, 0 fail**.
- `bunx eslint lib/`: 0 problemas. `bun run lint` (repo completo) sigue
  fallando SOLO en artefactos generados preexistentes bajo
  `src-tauri/target/...` (parse errors binarios) + 2 warnings
  preexistentes en `components/` — fuera del alcance permitido, sin tocar.
- `bash -n` del `.sh`: OK. YAML de `release.yml`: parse OK.
- No se ejecutó `tauri dev/build` ni el dev server (según lo ordenado).

## Riesgos / no verificado

- `.ps1` no verificado en ejecución (sin `pwsh` en este entorno); solo
  revisión manual. El glob de Ghostscript bajo `lib\ghostscript\tools`
  puede no existir según el paquete choco, pero hay fallback a
  `C:\Program Files\gs\...` y a `PATH` con fallo explícito si no aparece.
- Los pins (BtbN autobuild, gyan 8.1.2, choco 10.5.1/ffmpeg 7.0.2) son
  válidos hoy (verificados por HTTP/API el 2026-11-01); si un host rota o
  elimina el asset, el CI fallará explícitamente y habrá que re-fijar.
- `src-tauri/target/` contiene artefactos de build dentro del worktree;
  `eslint .` los intenta lintar (ruido preexistente, no causado por este
  cambio).
