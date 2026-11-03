import React from 'react';
import Link from 'next/link';
import { KASTRAL_TOOLS } from '@/lib/tools-catalog';

export function Footer() {
  const popularTools = KASTRAL_TOOLS.filter((t) => t.popular).slice(0, 6);

  return (
    <footer className="border-t border-[#DCD5CB] dark:border-[#222228] bg-[#EAE4DC]/60 dark:bg-[#0B0B0D] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand Column */}
          <div className="md:col-span-4 space-y-4">
            <Link href="/" className="flex items-center gap-3 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              <img
                src="/assets/brand/image_a3e77aab.png"
                alt="Icono de Kastral con inicial K"
                width={36}
                height={36}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover border border-amber-500/30"
              />
              <span>Kastral</span>
            </Link>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Convierte. Comprime. Simplifica.
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-sm">
              Plataforma gratuita de conversión, compresión y optimización de archivos. La mayoría de las herramientas se ejecutan en tu navegador; las que necesitan Ghostscript o FFmpeg usan un directorio temporal en el servidor.
            </p>
          </div>

          {/* Herramientas principales */}
          <div className="md:col-span-4 space-y-3">
            <h2 className="text-xs font-bold tracking-wider text-zinc-900 dark:text-zinc-100">
              Herramientas Destacadas
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              {popularTools.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={`/herramientas/${tool.slug}`}
                    className="hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors"
                  >
                    {tool.shortTitle}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Información Legal y Transparencia */}
          <div className="md:col-span-4 space-y-3">
            <h2 className="text-xs font-bold tracking-wider text-zinc-900 dark:text-zinc-100">
              Arquitectura, Seguridad y Legal
            </h2>
            <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <li>
                <Link href="/como-funciona" className="hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors">
                  Cómo funciona y seguridad de archivos
                </Link>
              </li>
              <li>
                <Link href="/privacidad" className="hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors">
                  Política de privacidad y cookies
                </Link>
              </li>
              <li>
                <Link href="/condiciones" className="hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors">
                  Condiciones de uso y límites del servicio
                </Link>
              </li>
              <li>
                <Link href="/contacto" className="hover:text-[#C86D2D] dark:hover:text-[#DF7B35] transition-colors">
                  Contacto y soporte técnico
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-[#DCD5CB] dark:border-[#222228] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600 dark:text-zinc-300">
          <p>
            © 2026 Kastral · Por <span className="font-semibold text-zinc-800 dark:text-zinc-200">Andres Guerrero</span>. Herramientas gratuitas de archivos sin registro.
          </p>
          <p>
            Las herramientas de navegador funcionan sin conexión; las de servidor requieren Internet.
          </p>
        </div>
      </div>
    </footer>
  );
}
