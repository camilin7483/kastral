# Kastral — Convierte. Comprime. Simplifica.

Plataforma gratuita de conversión, compresión y optimización de archivos: **19 herramientas** que procesan imágenes, PDF, documentos, hojas de cálculo, audio, vídeo y ZIP. Arquitectura honesta *navegador primero, servidor solo cuando hace falta*, con app de escritorio **Tauri 2** para Linux y Windows.

> **Por qué Kastral en vez de ILovePDF / SmallPDF / Convertio:** tus archivos se procesan en tu propio dispositivo siempre que es técnicamente posible (privacidad real, no promesas), la app de escritorio funciona sin cuentas ni telemetría, y cada límite (tamaños, tiempos, formatos) está documentado abajo en vez de descubrirlo con un error de pago.

## Cómo funciona

| Dónde se procesa | Herramientas |
|---|---|
| 100 % en tu navegador (offline) | Combinar PDF, Dividir PDF, Girar PDF, Marca de agua PDF, Extraer páginas, Imágenes a PDF, Crear/Extraer ZIP, XLSX a CSV/JSON, TXT/MD a PDF/HTML, Convertir imagen (PNG/JPG/WebP), Redimensionar |
| Servidor local o comandos Tauri (FFmpeg, Ghostscript, Sharp) | Comprimir PDF, PDF a imágenes, Convertir/Comprimir vídeo, Convertir audio, Extraer audio, AVIF |

- **Web (`app/`, `components/`, `lib/`)**: Next.js 15 (App Router), React 19, TypeScript estricto, Tailwind. Las herramientas pesadas usan rutas `/api/v1/*` (Sharp, Ghostscript, FFmpeg, Mammoth, pdf-lib).
- **Escritorio (`src-tauri/`)**: Tauri 2. Las mismas 6 herramientas pesadas corren como comandos Rust (`kastral_process`) que invocan sidecars FFmpeg/Ghostscript; el resto corre igual que en la web. Sin cuentas, sin telemetría.
- **Backend opcional (`backend/`)**: FastAPI + Pydantic con los mismos motores (execFile sin shell, semáforo de concurrencia). Solo para despliegues web con servidor dedicado.

## Estructura

```text
├── app/                          # Next.js: home, herramientas/[slug] (19 fichas SSG), legales, contacto
│   └── api/v1/                   # health, process, tasks/[taskId], download/[taskId] (solo web)
├── components/                   # FileWorkbench (navegador → servidor → Tauri), toasts, catálogo, Header/Footer
├── lib/                          # tools-catalog (19 tools), browser/server-processors, download-manager, tauri-engine
├── src-tauri/                    # App Tauri: main.rs, engines/{images,audio,video,pdf,document}.rs
│   ├── binaries/                 # Sidecars por plataforma (gitignored; ver README interno)
│   └── tauri.conf.json           # bundle NSIS (win) + deb/AppImage (linux)
├── scripts/                      # export-tauri.mjs (export estático), ci-fetch-sidecars.*
├── backend/                      # FastAPI opcional (app/{main,processors,security,config}.py + tests)
└── .github/workflows/           # ci.yml (lint+tests+build en ubuntu/windows), release.yml (tags v*)
```

## Desarrollo web

Requisitos: **bun 1.4+**, **Node 20+**, **FFmpeg** y **Ghostscript** (para los 6 motores de servidor).

```bash
bun install                    # dependencias
cp .env.example .env.local      # variables (ver tabla)
bun run dev                    # http://localhost:3000
bun test lib/                  # 74 tests (motores navegador, contratos del catálogo, descargas y versiones)
python3 -m pytest backend -q   # 8 tests (FastAPI)
bun run lint                   # 0 errores
bun run build                  # standalone (.next/standalone/server.js)
```

## App de escritorio (Tauri)

Requisitos extra: **Rust estable**, dependencias WebKit (`webkit2gtk` en Linux; WebView2 en Windows 10/11) y FFmpeg/Ghostscript en PATH para desarrollo.

```bash
bun run build:tauri            # exportación estática a out/ (mueve app/api y la restaura)
cargo tauri dev                # ventana de escritorio contra http://localhost:3000
cargo tauri build --bundles appimage,deb   # instaladores Linux (.deb válido, AppImage)
cargo test --manifest-path src-tauri/Cargo.toml   # 54 tests Rust (motores + validación + guardado nativo + contrato IPC)
```

Notas:

- El export estático usa `KASTRAL_EXPORT=1`; el build por defecto sigue siendo `standalone`.
- `src-tauri/binaries/` está gitignored: la CI descarga FFmpeg/Ghostscript por plataforma (ver `binaries/README.md`). En Linux el `.deb` incluye FFmpeg y espera `ghostscript` del sistema; en Windows el NSIS incluye ambos.
- `kastral_process(tool_slug, file_name, target_format, params_json, data_b64)` replica el contrato de `/api/v1/process` (mismos whitelists, mismos mensajes en español).
- `kastral_save_output(file_name, data_b64)` escribe el resultado en la carpeta de Descargas del sistema con nombres libres de colisiones (`archivo (1).ext`) y devuelve la ruta absoluta.

## Descargas con ubicación

Cada descarga muestra una notificación con el nombre, el peso y **dónde quedó el archivo**:

- **App de escritorio (Tauri):** se guarda en la carpeta de Descargas nativa y la notificación incluye la ruta absoluta, con un botón **Mostrar en carpeta**.
- **Navegador (Chrome/Edge):** se abre el selector nativo de guardado, así que la ubicación la eliges tú; la notificación confirma la acción.
- **Navegadores sin selector de archivos:** descarga clásica en la carpeta de descargas del navegador, indicada de forma honesta (el navegador no expone la ruta del sistema por privacidad).
- El historial **Descargas de esta sesión** conserva las últimas seis descargas con su ubicación y hora.

## Variables de entorno

| Variable | Efecto |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL canónica (SEO/sitemap). Por defecto `http://localhost:3000` |
| `NEXT_PUBLIC_DISABLE_ADS` | `true` oculta AdSense (recomendado en desktop) |
| `NEXT_PUBLIC_ADSENSE_APPROVED`, `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Activan AdSense en web tras la aprobación de Google |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Buzón del formulario de contacto (abre el correo del usuario, nada se envía solo) |
| `MAX_FILE_SIZE_MB` / `MAX_CONCURRENT_TASKS` | Límite por archivo (25–100 MB según herramienta) y tareas simultáneas (2) |
| `TASK_TIMEOUT_SECONDS` / `TEMP_CLEANUP_MINUTES` | Timeout por tarea (60 s) y retención del temporal (15 min) |

## CI y releases

- **CI** (`ci.yml`): `tsc` + `eslint` + tests bun/python + `next build`, en `ubuntu-latest` y `windows-latest` (con FFmpeg/Ghostscript instalados en el runner).
- **Release** (`release.yml`): al pushear un tag `v*` compila NSIS (Windows) y deb/AppImage (Linux) con sidecars y los publica en GitHub Releases con SHA256SUMS.

```bash
git tag v0.2.0 && git push origin v0.2.0   # dispara el release
```

## ⚠️ Límites honestos (léeme antes de procesar)

| Herramienta | Límite real verificado |
|---|---|
| Imágenes (subida) | 35 MB por archivo; redimensionar rechaza lados > 8000 px |
| PDF | 50 MB; Ghostscript ebook tarda ~2 s en 20 MB |
| PDF a imágenes | 40 MB; DPI 96/150/300 |
| Audio / Vídeo | 50 MB por archivo; timeout 60 s por tarea |
| AVIF (19 MP) | ~2 min de codificación (lento, pero completa) |
| Vídeo 38 MB→MP4 | ~6 s; se conserva la pista de audio |
| Documentos | 25 MB; DOCX→PDF reconstruye texto/encabezados, no diseños complejos, macros ni fuentes incrustadas; DOC binario antiguo necesita LibreOffice |
| ZIP | 100 MB; sin cifrado ni multivolumen; se bloquea Zip Slip |

- Ghostscript es AGPL: se invoca como binario separado, no se enlaza. En desktop Linux se espera del sistema; el instalador Windows lo incluye descargado de la fuente oficial en CI.
- Concurrencia del servidor: 2 tareas simultáneas; el resto espera en cola FIFO.

## Despliegue web (standalone)

```bash
bun run build && bun run start   # http://localhost:3000, sin telemetría
```

`output: 'standalone'` genera un servidor Node autocontenido (`.next/standalone/server.js`). Variables críticas en producción: `NEXT_PUBLIC_SITE_URL` (canónica), `MAX_FILE_SIZE_MB`, `MAX_CONCURRENT_TASKS=2`, `TASK_TIMEOUT_SECONDS=60`, `TEMP_CLEANUP_MINUTES=15` (purga de temporales). El backend FastAPI (`backend/`) solo tiene sentido si sirves la web a terceros desde un servidor dedicado: replica los mismos motores con `ALLOWED_ORIGINS` restringido a tu dominio y mismos límites.

## Comparativa honesta (Kastral frente a ILovePDF / SmallPDF / Convertio)

| Aspecto | Kastral | Terceros |
|---|---|---|
| Procesamiento en tu dispositivo cuando es posible | ✔ 13 herramientas con modo navegador (`lib/tools-catalog.ts`, `app/como-funciona`) | ≈/varía (centrado en servidor) |
| Registro para uso básico | ✔ Sin registro (`app/privacidad`) | ≈/varía según plan |
| App de escritorio sin conexión | ✔ Tauri, sin cuentas ni telemetría (`src-tauri/`) | ≈/varía |
| Límites publicados por herramienta | ✔ 25–100 MB (`app/condiciones`, fichas) | ≈/varía según plan |
| Marcas de agua | ✔ Sin marcas de agua | ≈/varía según plan |
| Amplitud de formatos | ≈ 19 herramientas de uso común | ✔ Convertio: catálogo más amplio |
| OCR / firma electrónica / API pública | ✘ No disponibles | ≈/varía según plan |

Ver detalle y matices en [`app/por-que-kastral/page.tsx`](./app/por-que-kastral/page.tsx).

## Licencia (MIT)

Kastral se distribuye bajo licencia MIT — ver [LICENSE](./LICENSE). © 2026 Andres Guerrero. Soporte: formulario de `/contacto` (abre tu correo a la dirección configurada).
