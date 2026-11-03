'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';

// El tema vive en la clase del <html>; este store externo evita setState dentro de un efecto.
const THEME_STATE_EVENT = 'kastral-theme-state';

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_STATE_EVENT, callback);
  return () => window.removeEventListener(THEME_STATE_EVENT, callback);
}

function readThemeIsDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function Header() {
  const pathname = usePathname();
  const dark = useSyncExternalStore(subscribeToTheme, readThemeIsDark, () => true);

  useEffect(() => {
    // Limpiar cachés antiguos de versiones previas para evitar colisiones de chunks Webpack y actualizar Service Worker local
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches
        .keys()
        .then((keys) => {
          keys.forEach((key) => {
            if (key !== 'kastral-offline-v3') {
              caches.delete(key).catch(() => {});
            }
          });
        })
        .catch(() => {});
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {});
    }

    const saved = localStorage.getItem('kastral-theme');
    const shouldBeDark = saved !== 'light';
    document.documentElement.classList.toggle('dark', shouldBeDark);
    window.dispatchEvent(new Event(THEME_STATE_EVENT));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('kastral-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new Event(THEME_STATE_EVENT));
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[#DCD5CB] dark:border-[#222228] bg-[#F3EFEA]/90 dark:bg-[#0B0B0D]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title + Geometric Origami Bird Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D] rounded-lg"
        >
          <img
            src="/assets/aistudio/image_8099a79d.png"
            alt="Logo de Kastral"
            width={34}
            height={34}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover border border-amber-500/30 shrink-0 shadow-xs"
          />
          <span>Kastral</span>
        </Link>

        {/* Zone 2: 6 Single-Line Navigation Links (1:1 con categorías del catálogo) */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-5 text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          <Link
            href="/?categoria=imagen#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('imagen')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            Imágenes
          </Link>
          <Link
            href="/?categoria=pdf#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('pdf')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            PDF
          </Link>
          <Link
            href="/?categoria=documentos#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('documento') || pathname?.includes('hoja-calculo')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            Documentos
          </Link>
          <Link
            href="/?categoria=audio#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('audio')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            Audio
          </Link>
          <Link
            href="/?categoria=video#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('video')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            Vídeo
          </Link>
          <Link
            href="/?categoria=archivos#explorar-herramientas"
            className={`hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              pathname?.includes('zip')
                ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-[#C86D2D] decoration-2'
                : ''
            }`}
          >
            Comprimidos
          </Link>
        </nav>

        {/* Zone 3: Theme Switcher & Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Cambiar a tema claro cálido' : 'Cambiar a tema oscuro carbón'}
            className="p-2 rounded-xl text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white bg-white/70 dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D] transition-colors cursor-pointer"
          >
            {dark ? <Sun className="w-4 h-4 text-[#DF7B35]" /> : <Moon className="w-4 h-4" />}
          </button>

          <Link
            href="/#explorar-herramientas"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#C86D2D] hover:bg-[#AD581D] rounded-xl transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            Todas las herramientas
          </Link>
        </div>
      </div>
    </header>
  );
}
