'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Menu, X } from 'lucide-react';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Ajuste durante el render (patrón recomendado por React): cierra el panel
  // al navegar sin usar setState dentro de un efecto.
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMenuOpen(false);
  }

  // Cierra el menú móvil con la tecla Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Cierra el panel al cruzar el breakpoint de escritorio.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (media.matches) setMenuOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // El Service Worker versionado se encarga de purgar cachés antiguas en
    // su evento `activate`; limpiarlas aquí podía borrar la caché activa.
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
          <Image
            src="/assets/brand/image_8099a79d.png"
            alt="Logo de Kastral"
            width={34}
            height={34}
            priority
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover border border-amber-500/30 shrink-0 shadow-xs"
          />
          <span>Kastral</span>
        </Link>

        {/* Zone 2: 6 Single-Line Navigation Links (1:1 con categorías del catálogo) */}
        <nav
          aria-label="Navegación principal"
          className="hidden lg:flex items-center gap-5 text-sm font-medium text-zinc-700 dark:text-zinc-300"
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
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="navegacion-movil"
            aria-label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            className="lg:hidden p-2 rounded-xl text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white bg-white/70 dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D]"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Cambiar a tema claro cálido' : 'Cambiar a tema oscuro carbón'}
            className="p-2 rounded-xl text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white bg-white/70 dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D]"
          >
            {dark ? <Sun className="w-4 h-4 text-[#DF7B35]" /> : <Moon className="w-4 h-4" />}
          </button>

          <Link
            href="/por-que-kastral"
            className="hidden lg:block px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D] rounded-lg"
          >
            Por qué Kastral
          </Link>
          <Link
            href="/#explorar-herramientas"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#C86D2D] hover:bg-[#AD581D] rounded-xl transition-colors whitespace-nowrap shrink-0 shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D]"
          >
            Todas las herramientas
          </Link>
        </div>
      </div>

      {/* Panel móvil con las 6 categorías más los enlaces secundarios */}
      {menuOpen && (
        <nav
          id="navegacion-movil"
          aria-label="Navegación móvil"
          className="lg:hidden absolute inset-x-0 top-full w-full border-b border-[#DCD5CB] dark:border-[#222228] bg-[#F3EFEA] dark:bg-[#0B0B0D] shadow-lg"
        >
          <ul className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {[
              { href: '/?categoria=imagen#explorar-herramientas', label: 'Imágenes' },
              { href: '/?categoria=pdf#explorar-herramientas', label: 'PDF' },
              { href: '/?categoria=documentos#explorar-herramientas', label: 'Documentos' },
              { href: '/?categoria=audio#explorar-herramientas', label: 'Audio' },
              { href: '/?categoria=video#explorar-herramientas', label: 'Vídeo' },
              { href: '/?categoria=archivos#explorar-herramientas', label: 'Comprimidos' },
              { href: '/por-que-kastral', label: 'Por qué Kastral' },
              { href: '/#explorar-herramientas', label: 'Todas las herramientas' },
            ].map((link) => (
              <li key={link.href + link.label}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block py-2.5 border-b border-[#DCD5CB]/60 dark:border-[#222228]/60 last:border-0 hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D] rounded-lg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
