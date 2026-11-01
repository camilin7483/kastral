'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ArrowUpRight } from 'lucide-react';
import {
  KASTRAL_TOOLS,
  CATEGORY_LABELS,
  ToolCategory,
} from '@/lib/tools-catalog';

const CATEGORIES: { id: 'all' | ToolCategory; label: string }[] = [
  { id: 'all', label: 'Todas las herramientas' },
  { id: 'imagen', label: 'Imágenes' },
  { id: 'pdf', label: 'PDF' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Vídeo' },
  { id: 'archivos', label: 'Comprimidos' },
];

export function ToolCatalogSection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ToolCategory>('all');

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return KASTRAL_TOOLS.filter((tool) => {
      const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.shortTitle.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.acceptedExtensions.some((ext) => ext.toLowerCase().includes(q)) ||
        tool.outputFormats.some((fmt) => fmt.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  return (
    <section id="explorar-herramientas" className="space-y-8 pt-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#DCD5CB] dark:border-[#27272D] pb-6">
        <div className="space-y-2 max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Catálogo de Herramientas Especializadas
          </h2>
          <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300">
            Cada herramienta funciona directamente desde tu navegador con ajustes específicos de formato y sin registro.
          </p>
        </div>

        {/* Buscador en tiempo real */}
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="w-4 h-4 text-zinc-500 dark:text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar formato (ej. webp, pdf, mp3, zip)..."
            aria-label="Buscar herramienta por nombre o formato"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
          />
        </div>
      </div>

      {/* Controles interactivos de filtrado por categoría */}
      <div
        role="tablist"
        aria-label="Filtrar herramientas por categoría"
        className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#EAE4DC] dark:bg-[#141417] rounded-xl w-fit border border-[#DCD5CB] dark:border-[#27272D]"
      >
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#C86D2D] text-white shadow-xs'
                  : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Anclas de categoría para navegación directa */}
      <div id="catalogo-imagen" className="sr-only" />
      <div id="catalogo-pdf" className="sr-only" />
      <div id="catalogo-documentos" className="sr-only" />
      <div id="catalogo-multimedia" className="sr-only" />
      <div id="catalogo-archivos" className="sr-only" />

      {filteredTools.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-2xl space-y-3">
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            No encontramos herramientas que coincidan con &ldquo;{searchQuery}&rdquo;
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Prueba buscando una extensión como PDF, WebP, DOCX, CSV, MP3, MP4 o ZIP.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-[#C86D2D] rounded-xl cursor-pointer"
          >
            Mostrar las {KASTRAL_TOOLS.length} herramientas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/herramientas/${tool.slug}`}
              className="group p-5 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] hover:border-[#C86D2D] dark:hover:border-[#DF7B35] rounded-2xl transition-colors flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                  <span>
                    <strong className="text-[#C86D2D] dark:text-[#DF7B35]">{tool.categoryLabel}</strong> · {tool.engineBadge}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-zinc-400 group-hover:text-[#C86D2D] dark:group-hover:text-[#DF7B35] transition-colors shrink-0" />
                </div>

                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-[#C86D2D] dark:group-hover:text-[#DF7B35] transition-colors">
                  {tool.shortTitle}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <div className="pt-3 border-t border-[#EAE4DC] dark:border-[#222228] flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                <span className="truncate max-w-[70%]">
                  Entrada: {tool.acceptedExtensions.slice(0, 4).join(', ')}
                </span>
                <span>Límite: {tool.maxFileSizeMB} MB</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Resumen por categoría */}
      <div className="pt-8 border-t border-[#DCD5CB] dark:border-[#27272D] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {(Object.keys(CATEGORY_LABELS) as ToolCategory[]).map((catKey, idx) => (
          <div key={catKey} className="space-y-1.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              0{idx + 1}. {CATEGORY_LABELS[catKey].name}
            </h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {CATEGORY_LABELS[catKey].description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
