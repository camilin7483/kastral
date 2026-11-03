'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ToolCatalogSection } from '@/components/ToolCatalogSection';
import type { ToolCategory } from '@/lib/tools-catalog';

const VALID_CATEGORIES: readonly ToolCategory[] = [
  'imagen',
  'pdf',
  'documentos',
  'audio',
  'video',
  'archivos',
];

function isValidCategory(value: string | null): value is ToolCategory {
  return value !== null && (VALID_CATEGORIES as readonly string[]).includes(value);
}

// Lee ?categoria= (p. ej. desde el Header), prefija el filtro del catálogo
// y desplaza la vista hasta él. Debe renderizarse dentro de <Suspense>.
export function HomeCatalog() {
  const searchParams = useSearchParams();
  const rawCategory = searchParams.get('categoria');
  const initialCategory: 'all' | ToolCategory = isValidCategory(rawCategory) ? rawCategory : 'all';

  useEffect(() => {
    if (isValidCategory(rawCategory)) {
      document.getElementById('explorar-herramientas')?.scrollIntoView();
    }
  }, [rawCategory]);

  return <ToolCatalogSection initialCategory={initialCategory} />;
}
