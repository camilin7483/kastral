# Spike Tauri — estado de la migración a escritorio

El experimento original se hizo en `/tmp/opencode/kastral-export-probe`
(copia sin `node_modules`, `.next` ni `.git`, con `output: 'standalone'`
cambiado a `output: 'export'`). Lo que entonces bloqueaba ya está resuelto
abajo; lo pendiente de verdad queda al final.

## Error original de exportación (verbatim, ya superado)

```text
Error: export const dynamic = "force-static"/export const revalidate not configured on route "/robots.txt" with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export
```

Se resolvió con `export const dynamic = 'force-static'` en `app/robots.ts`
y `app/sitemap.ts`.

## Exportación estática actual (OK)

- `next.config.ts` usa `output: 'export'` cuando `KASTRAL_EXPORT=1`.
- `scripts/export-tauri.sh` (y su espejo multiplataforma
  `scripts/export-tauri.mjs`, puro Node sin dependencias para Windows):
  aparta `app/api`, compila con `KASTRAL_EXPORT=1`, verifica
  `out/index.html` + una página HTML por slug del catálogo (17, contados
  dinámicamente desde `lib/tools-catalog.ts`) y restaura `app/api` siempre
  (`trap`/`finally`), comprobando con `git status` que quedó intacto.
- `generateStaticParams` cubre las 17 rutas de `app/herramientas/[slug]`.
- `out/` es artefacto de compilación y NO se commitea.
- `frontendDist` (`../out`) en `src-tauri/tauri.conf.json` funciona en
  cuanto la exportación tiene éxito.

## Comandos Tauri migrados

- `kastral_health` (prueba) y `kastral_process` (punto de entrada desktop:
  decodifica, delega al motor Rust según `tool_slug` y devuelve el
  resultado en base64; el workdir temporal siempre se elimina).
- Slugs disponibles en escritorio: `convertir-imagen`, `comprimir-imagen`,
  `redimensionar-imagen`, `comprimir-pdf`, `pdf-a-imagenes`,
  `convertir-audio`, `extraer-audio-video`, `convertir-video`,
  `comprimir-video` y `convertir-documento` (solo salida PDF; html/txt
  siguen en el navegador).
- Las herramientas 100 % de navegador (`combinar-pdf`, `dividir-pdf`,
  `extraer-paginas-pdf`, `imagenes-a-pdf`, `convertir-hoja-calculo`,
  `crear-zip`, `extraer-zip`) no necesitan comando: `FileWorkbench`
  las ejecuta en local y solo deriva a Tauri el resto.
- IPC endurecido en `lib/tauri-engine.ts`: límite previo por
  `maxFileSizeMB` del catálogo y decodificación base64 por tramos de
  64 KB sobre un buffer prealocado.
- El shim `lib/tauri-api.d.ts` se eliminó: el paquete real
  `@tauri-apps/api` ya es dependencia y `tsc --noEmit` pasa sin él.

## Iconos (resuelto)

Ya no hay marcador temporal: `src-tauri/icons/` contiene el juego real
(`icon.png`, `icon.ico`, `icon.icns`, `32x32.png`, `64x64.png`,
`128x128.png`, `128x128@2x.png`, iconos de tienda) y `tauri.conf.json`
apunta a ellos, con imágenes NSIS en `src-tauri/icons-src/`.

## Motores nativos

- FFmpeg viaja como sidecar (`bundle.externalBin: ["binaries/ffmpeg"]`,
  descargado en CI por `scripts/ci-fetch-sidecars.*`).
- Ghostscript NO es sidecar en ninguna plataforma: se resuelve por PATH
  (`find_bin("gs")`), así que el escritorio Linux/Windows necesita
  Ghostscript instalado en el sistema (ver instrucciones).

## Pendiente de verdad

1. Ejecutar `node scripts/export-tauri.mjs` (o el `.sh` en Linux) y
   después `tauri dev` / `tauri build`: verificación de extremo a extremo
   aún no realizada (paso siguiente explícito).
2. Comprobar el instalador resultante (NSIS/deb/AppImage) con Ghostscript
   presente y ausente para confirmar el mensaje de error en español.
