# Spike Tauri — nota de viabilidad de exportación

Experimento realizado en `/tmp/opencode/kastral-export-probe` (copia del repo
sin `node_modules`, `.next` ni `.git`, con `output: 'standalone'` cambiado a
`output: 'export'`). El repo real no se modificó para esta prueba.

## Primer error de exportación (verbatim)

```text
Error: export const dynamic = "force-static"/export const revalidate not configured on route "/robots.txt" with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export
```

La compilación (`bun run build`) se detiene en la recolección de datos de página.
Conclusión: la app **no** es exportable a HTML estático tal cual está.

## Cobertura de `generateStaticParams`

Sí cubre todas las rutas dinámicas: `app/herramientas/[slug]/page.tsx`
genera los 17 slugs desde `KASTRAL_TOOLS` (verificado en la compilación
standalone: `/herramientas/[slug]` aparece como SSG con sus 17 rutas).
Esa parte no es un obstáculo.

## Qué debe resolver la migración completa

1. Las rutas API (`app/api/v1/health`, `process`, `tasks/[taskId]`,
   `download/[taskId]`) no existen en una exportación estática: hay que
   reimplementarlas como comandos Tauri (p. ej. `kastral_health` ya existe
   como prueba) y cambiar `FileWorkbench`/llamadas `fetch` al backend.
2. `app/robots.ts` y `app/sitemap.ts` (rutas de servidor) necesitan
   `force-static` o generarse fuera de Next para el modo `export`.
3. El `frontendDist` de `tauri.conf.json` apunta a `../out` (inexistente):
   solo funcionará cuando la compilación estática tenga éxito.
4. El icono `icons/icon.png` es un marcador temporal de 32x32: sustituirlo
   por el icono real antes de cualquier `tauri build`.
5. No ejecutar `tauri dev` (GUI) ni `tauri build`: quedan como paso siguiente.
