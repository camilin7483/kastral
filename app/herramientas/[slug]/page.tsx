import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { KASTRAL_TOOLS, getToolBySlug } from '@/lib/tools-catalog';
import { FileWorkbench } from '@/components/FileWorkbench';
import { AdSenseSlot } from '@/components/AdSenseSlot';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

export function generateStaticParams() {
  return KASTRAL_TOOLS.map((tool) => ({
    slug: tool.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) {
    return {
      title: 'Herramienta no encontrada',
    };
  }

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    alternates: {
      canonical: `/herramientas/${tool.slug}`,
    },
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      url: `/herramientas/${tool.slug}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
  };
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) {
    notFound();
  }

  const relatedTools = tool.relatedSlugs
    .map((s) => getToolBySlug(s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tool.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  const outputLabel = tool.outputFormats
    .map((f) => (f === 'keep' ? 'mismo formato' : f === 'extract' ? 'archivos sueltos' : f.toUpperCase()))
    .join(' · ');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Breadcrumb y Cabecera de la Herramienta */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </Link>
          <span aria-hidden="true">/</span>
          <span>{tool.categoryLabel}</span>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-900 dark:text-zinc-200 font-medium">{tool.shortTitle}</span>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-[#C86D2D] dark:text-[#DF7B35]">
          {tool.categoryLabel} · Salida: {outputLabel}
        </p>

        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 [text-wrap:balance]">
          {tool.title}
        </h1>

        <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {tool.description}
        </p>
      </div>

      {/* Área de Procesamiento Principal */}
      <FileWorkbench initialTool={tool} allowToolSwitch={false} />

      {/* Espacio publicitario discreto separado del botón de descarga */}
      <AdSenseSlot slotId={`tool-${tool.slug}`} format="horizontal" />

      {/* Instrucciones paso a paso y especificaciones técnicas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-6 border-t border-[#DCD5CB] dark:border-[#27272D]">
        <div className="lg:col-span-7 space-y-6">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Cómo utilizar {tool.shortTitle}
          </h2>
          <ol className="space-y-4">
            {tool.steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3.5">
                <span className="font-mono tabular-nums text-xs font-bold text-[#C86D2D] pt-0.5">
                  0{index + 1}.
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {step}
                </p>
              </li>
            ))}
          </ol>

          {tool.limitations.length > 0 && (
            <div className="pt-4 space-y-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Consideraciones técnicas y límites reales
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 list-disc pl-5">
                {tool.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Ficha de Especificaciones Técnicas */}
        <div className="lg:col-span-5 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-xl p-6 space-y-4 h-fit">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Especificaciones de la Herramienta
          </h2>
          <dl className="divide-y divide-[#E4DEC6] dark:divide-[#27272D] text-xs sm:text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Categoría</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">{tool.categoryLabel}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Motor de ejecución</dt>
              <dd className="font-medium text-emerald-700 dark:text-emerald-400 text-right">{tool.engineBadge}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Formatos admitidos</dt>
              <dd className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100 text-right">
                {tool.acceptedExtensions.join(', ')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Formatos de salida</dt>
              <dd className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100 text-right">
                {tool.outputFormats.map((f) => f.toUpperCase()).join(', ')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Tamaño máximo por archivo</dt>
              <dd className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {tool.maxFileSizeMB} MB
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-300">Archivos por lote</dt>
              <dd className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                Hasta {tool.maxBatchFiles}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Preguntas Frecuentes (FAQ) */}
      {tool.faqs.length > 0 && (
        <section className="pt-8 border-t border-[#DCD5CB] dark:border-[#27272D] space-y-6">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Preguntas Frecuentes sobre {tool.shortTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tool.faqs.map((faq, idx) => (
              <div
                key={idx}
                className="p-5 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-xl space-y-2"
              >
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {faq.question}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Enlaces internos a herramientas relacionadas */}
      {relatedTools.length > 0 && (
        <section className="pt-8 border-t border-[#DCD5CB] dark:border-[#27272D] space-y-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Herramientas Relacionadas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {relatedTools.map((rel) => (
              <Link
                key={rel.slug}
                href={`/herramientas/${rel.slug}`}
                className="group p-4 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] hover:border-[#C86D2D] rounded-xl transition-colors flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{rel.categoryLabel}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:text-[#C86D2D]" />
                </div>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-[#C86D2D]">
                  {rel.shortTitle}
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2">
                  {rel.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
