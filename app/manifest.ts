import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Kastral — Conversión y Compresión de Archivos',
    short_name: 'Kastral',
    description:
      'Convierte, comprime y optimiza imágenes, PDF, documentos, audio, vídeo y archivos ZIP directamente desde el navegador.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F9F8F6',
    theme_color: '#C86D2D',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
