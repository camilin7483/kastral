'use client';

import React, { useState, useRef, useCallback, memo } from 'react';
import type { ExtractedArchiveItem } from '@/lib/browser-processors';
import {
  Upload,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  FolderArchive,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { KastralTool, KASTRAL_TOOLS } from '@/lib/tools-catalog';
import {
  formatBytes,
  calculateReductionPercentage,
  sanitizeFilename,
} from '@/lib/file-utils';
// Motores pesados (pdf-lib, jszip, xlsx, mammoth) solo bajo demanda:
// este import dinámico genera un chunk separado y no crece el First Load JS.
import { CustomSelect } from '@/components/CustomSelect';
import { isTauri, processOnTauri } from '@/lib/tauri-engine';

// Formats the canvas API cannot encode, so they always need the server engine (Sharp).
const SERVER_ONLY_FORMATS = new Set(['avif']);

export interface WorkbenchItem {
  id: string;
  file: File;
  originalName: string;
  originalSize: number;
  originalExt: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  outputFormat: string;
  outputFilename?: string;
  outputSize?: number;
  outputBlob?: Blob;
  details?: string;
  errorMessage?: string;
  extractedItems?: ExtractedArchiveItem[];
  // Archivos de origen de una fusión ya completada: permite
  // "Volver a procesar" sin exigir reselección (siguen en memoria).
  sourceFiles?: File[];
}

interface FileWorkbenchProps {
  initialTool: KastralTool;
  allowToolSwitch?: boolean;
}

// Fila memoizada: los avisos de progreso re-renderizan solo la fila activa,
// no toda la cola (evita tirones con lotes grandes).
const WorkbenchQueueRow = memo(function WorkbenchQueueRow({
  item,
  onRemove,
  onDownload,
}: {
  item: WorkbenchItem;
  onRemove: (id: string) => void;
  onDownload: (blob: Blob, filename: string) => void;
}) {
  const reduction =
    item.status === 'completed' && item.outputSize
      ? calculateReductionPercentage(item.originalSize, item.outputSize)
      : null;

  return (
    <div className="p-4 bg-[#F8F5F0] dark:bg-[#18181C] hover:bg-white dark:hover:bg-[#1E1E24] transition-colors space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#C86D2D] dark:text-[#DF7B35] shrink-0" />
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {item.originalName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
            <span>{item.originalExt}</span>
            <span aria-hidden="true">·</span>
            <span>Original: {formatBytes(item.originalSize)}</span>
            {item.status === 'completed' && typeof item.outputSize === 'number' && (
              <>
                <span aria-hidden="true">→</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  Final: {formatBytes(item.outputSize)}
                </span>
              </>
            )}
            {reduction !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  -{reduction}% de peso
                </span>
              </>
            )}
            {item.details && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-zinc-600 dark:text-zinc-400">{item.details}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {item.status === 'pending' && (
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Listo para procesar
            </span>
          )}

          {item.status === 'processing' && (
            <div className="flex items-center gap-2 text-xs font-bold text-[#C86D2D] dark:text-[#DF7B35] tabular-nums">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Procesando ({item.progress}%)</span>
            </div>
          )}

          {item.status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{item.errorMessage || 'Error'}</span>
            </div>
          )}

          {item.status === 'completed' && item.outputBlob && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Completado</span>
              </span>

              <button
                type="button"
                onClick={() => onDownload(item.outputBlob!, item.outputFilename || 'resultado')}
                title={item.outputFilename}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#C86D2D] hover:bg-[#AD581D] rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Descargar ({item.outputFilename?.split('.').pop()?.toUpperCase() || 'Archivo'})
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={item.status === 'processing'}
            aria-label={`Eliminar ${item.originalName}`}
            className="p-1.5 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {item.status === 'processing' && (
        <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C86D2D] transition-all duration-150"
            style={{ width: `${Math.min(100, Math.max(5, item.progress))}%` }}
          />
        </div>
      )}

      {item.extractedItems && item.extractedItems.length > 0 && (
        <div className="pt-2 pl-6 border-t border-[#DCD5CB] dark:border-[#27272D] space-y-2">
          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            Archivos individuales generados ({item.extractedItems.length}):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {item.extractedItems.map((sub, idx) => (
              <div
                key={`${sub.name}-${idx}`}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#2E2E36] text-xs"
              >
                <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                  {sub.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatBytes(sub.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDownload(sub.blob, sub.name)}
                    className="text-[#C86D2D] dark:text-[#DF7B35] hover:underline font-bold cursor-pointer"
                  >
                    Descargar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export function FileWorkbench({ initialTool, allowToolSwitch = false }: FileWorkbenchProps) {
  const [activeTool, setActiveTool] = useState<KastralTool>(initialTool);
  const [items, setItems] = useState<WorkbenchItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<string>(initialTool.defaultOutputFormat);
  const [params, setParams] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    for (const p of initialTool.parameters) {
      if (p.id !== 'executionMode') {
        initial[p.id] = p.defaultValue;
      }
    }
    return initial;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectTool = (slug: string) => {
    const found = KASTRAL_TOOLS.find((t) => t.slug === slug);
    if (!found) return;
    setItems([]);
    setActiveTool(found);
    setTargetFormat(found.defaultOutputFormat);
    const nextParams: Record<string, string | number | boolean> = {};
    for (const p of found.parameters) {
      if (p.id !== 'executionMode') {
        nextParams[p.id] = p.defaultValue;
      }
    }
    setParams(nextParams);
    setGlobalError(null);
  };

  const addFilesToQueue = useCallback(
    (incomingFiles: FileList | File[]) => {
      setGlobalError(null);
      const list = Array.from(incomingFiles);
      if (list.length === 0) return;

      const maxFiles = activeTool.maxBatchFiles;
      if (items.length + list.length > maxFiles) {
        setGlobalError(
          `Esta herramienta admite hasta ${maxFiles} ${
            maxFiles === 1 ? 'archivo por operación' : 'archivos por lote'
          }.`
        );
      }

      const sliceCount = Math.max(0, maxFiles - items.length);
      const filesToAdd = list.slice(0, sliceCount);

      const newItems: WorkbenchItem[] = [];
      for (const file of filesToAdd) {
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
        const maxBytes = activeTool.maxFileSizeMB * 1024 * 1024;

        let errorMessage: string | undefined;
        if (file.size === 0) {
          errorMessage = 'El archivo está vacío (0 bytes).';
        } else if (file.size > maxBytes) {
          errorMessage = `Supera el límite máximo de ${activeTool.maxFileSizeMB} MB.`;
        } else if (
          !activeTool.acceptedExtensions.includes('*') &&
          !activeTool.acceptedExtensions.includes(ext)
        ) {
          errorMessage = `Extensión ${ext} no admitida. Formatos válidos: ${activeTool.acceptedExtensions.join(', ')}`;
        }

        newItems.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          originalName: file.name,
          originalSize: file.size,
          originalExt: ext.replace(/^\./, '').toUpperCase() || 'ARCHIVO',
          status: errorMessage ? 'error' : 'pending',
          progress: 0,
          outputFormat: targetFormat,
          errorMessage,
        });
      }

      setItems((prev) => [...prev, ...newItems]);
    },
    [activeTool, items.length, targetFormat]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setGlobalError(null);
  }, []);

  const clearAll = () => {
    setItems([]);
    setGlobalError(null);
  };

  const updateItemState = (id: string, patch: Partial<WorkbenchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  /**
   * Envía el archivo a la ruta integrada /api/v1/process (Sharp, Ghostscript o FFmpeg)
   * y devuelve el resultado ya descargado como Blob.
   */
  const processOnServer = async (item: WorkbenchItem, slug: string, fmt: string) => {
    const onPct = (pct: number) => updateItemState(item.id, { progress: pct });
    onPct(15);

    const form = new FormData();
    form.append('file', item.file);
    form.append('toolSlug', slug);
    form.append('targetFormat', fmt);
    form.append('params', JSON.stringify(params));

    const response = await fetch('/api/v1/process', { method: 'POST', body: form });
    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
      downloadUrl?: string;
      outputFilename?: string;
      outputSize?: number;
      outputMimeType?: string;
      details?: string;
    };

    if (!response.ok || data.status === 'failed' || !data.downloadUrl) {
      throw new Error(data.error || 'El servidor no pudo procesar el archivo.');
    }

    onPct(80);
    const download = await fetch(data.downloadUrl);
    if (!download.ok) {
      throw new Error('El archivo se procesó pero no se pudo descargar el resultado.');
    }

    const blob = await download.blob();
    onPct(100);
    return {
      outputBlob: blob,
      outputFilename: data.outputFilename || item.originalName,
      outputSize: data.outputSize || blob.size,
      mimeType: data.outputMimeType || blob.type,
      details: data.details,
      extractedItems: undefined,
    };
  };

  /**
   * Envía el archivo al comando Tauri `kastral_process` (misma respuesta que el servidor)
   * y devuelve el resultado con el mismo shape que processOnServer.
   */
  const processTauriItem = async (item: WorkbenchItem, slug: string, fmt: string) => {
    updateItemState(item.id, { progress: 15 });
    const res = await processOnTauri(item.file, slug, fmt, params);
    updateItemState(item.id, { progress: 100 });
    return {
      outputBlob: res.outputBlob,
      outputFilename: res.outputFilename,
      outputSize: res.outputSize,
      mimeType: res.mimeType,
      details: res.details,
      extractedItems: undefined,
    };
  };

  /**
   * Ejecuta la herramienta en el motor correcto: en escritorio, además del
   * servidor y AVIF, la salida PDF de convertir-documento va al motor Tauri
   * (única capacidad exclusiva del desktop; html/txt siguen en el navegador).
   */
  const executeItem = async (item: WorkbenchItem, slug: string, fmt: string) => {
    const needsTauriPdf = slug === 'convertir-documento' && fmt.toLowerCase() === 'pdf';
    if (
      isTauri() &&
      (activeTool.engine === 'server' || SERVER_ONLY_FORMATS.has(fmt) || needsTauriPdf)
    ) {
      return processTauriItem(item, slug, fmt);
    }
    if (activeTool.engine === 'server' || SERVER_ONLY_FORMATS.has(fmt)) {
      return processOnServer(item, slug, fmt);
    }
    return executeItemLocallyInBrowser(item, slug, fmt);
  };

  /**
   * Ejecuta las herramientas disponibles sin servidor, 100 % en el navegador.
   */
  const executeItemLocallyInBrowser = async (item: WorkbenchItem, slug: string, fmt: string) => {
    const onPct = (pct: number) => updateItemState(item.id, { progress: pct });
    const processors = await import('@/lib/browser-processors');

    if (['convertir-imagen', 'comprimir-imagen', 'redimensionar-imagen'].includes(slug)) {
      return processors.processImageInBrowser(item.file, fmt, params, onPct);
    }
    if (slug === 'dividir-pdf') {
      return processors.splitPdfInBrowser(item.file, onPct);
    }
    if (slug === 'extraer-paginas-pdf') {
      return processors.extractPdfPagesInBrowser(item.file, params, onPct);
    }
    if (slug === 'convertir-documento') {
      return processors.convertDocumentInBrowser(item.file, fmt, onPct);
    }
    if (slug === 'convertir-hoja-calculo') {
      return processors.convertSpreadsheetInBrowser(item.file, fmt, params, onPct);
    }
    if (slug === 'extraer-zip') {
      return processors.extractZipInBrowser(item.file, onPct);
    }
    throw new Error('Operación no reconocida.');
  };

  const handleStartProcessing = async () => {
    setGlobalError(null);
    const validItems = items.filter((it) => it.status !== 'error');
    if (validItems.length === 0) {
      setGlobalError('Añade al menos un archivo válido antes de iniciar el procesamiento.');
      return;
    }

    setIsBatchProcessing(true);

    try {
      // Operaciones que fusionan múltiples archivos en una única salida en el navegador
      if (activeTool.mergesIntoSingleOutput) {
        const processors = await import('@/lib/browser-processors');
        const filesToMerge =
          validItems.length === 1 && (validItems[0].sourceFiles?.length ?? 0) > 0
            ? validItems[0].sourceFiles!
            : validItems.map((it) => it.file);
        for (const it of validItems) {
          updateItemState(it.id, { status: 'processing', progress: 10, errorMessage: undefined });
        }

        const onSharedProgress = (pct: number) => {
          for (const it of validItems) {
            updateItemState(it.id, { progress: pct });
          }
        };

        let mergedResult;
        if (activeTool.slug === 'combinar-pdf') {
          mergedResult = await processors.mergePdfsInBrowser(filesToMerge, params, onSharedProgress);
        } else if (activeTool.slug === 'imagenes-a-pdf') {
          mergedResult = await processors.imagesToPdfInBrowser(filesToMerge, params, onSharedProgress);
        } else if (activeTool.slug === 'crear-zip') {
          mergedResult = await processors.createZipInBrowser(filesToMerge, params, onSharedProgress);
        }

        if (mergedResult && mergedResult.outputSize > 0) {
          const totalOriginalSize = validItems.reduce((acc, it) => acc + it.originalSize, 0);
          const firstId = validItems[0].id;
          setItems([
            {
              id: firstId,
              file: validItems[0].file,
              originalName:
                validItems.length === 1
                  ? validItems[0].originalName
                  : `${validItems.length} archivos combinados (${validItems.map((v) => v.originalName).join(', ')})`,
              originalSize: totalOriginalSize,
              originalExt: activeTool.slug === 'crear-zip' ? 'LOTE' : 'PDF/IMG',
              status: 'completed',
              progress: 100,
              outputFormat: targetFormat,
              outputFilename: mergedResult.outputFilename,
              outputSize: mergedResult.outputSize,
              outputBlob: mergedResult.outputBlob,
              details: mergedResult.details,
              // Conserva los archivos de origen en memoria para "Volver a procesar".
              sourceFiles: filesToMerge,
            },
          ]);
        }
        setIsBatchProcessing(false);
        return;
      }

      // Procesamiento individual por archivo 100 % en el navegador
      for (const item of validItems) {
        updateItemState(item.id, {
          status: 'processing',
          progress: 5,
          errorMessage: undefined,
          outputFormat: targetFormat,
        });

        try {
          const localRes = await executeItem(item, activeTool.slug, targetFormat);
          updateItemState(item.id, {
            status: 'completed',
            progress: 100,
            outputFilename: localRes.outputFilename,
            outputSize: localRes.outputSize,
            outputBlob: localRes.outputBlob,
            extractedItems: localRes.extractedItems,
            details: localRes.details,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error al procesar el archivo.';
          updateItemState(item.id, {
            status: 'error',
            progress: 0,
            errorMessage: msg,
          });
        }
      }
    } catch (batchErr) {
      const msg =
        batchErr instanceof Error ? batchErr.message : 'No se pudo completar la operación.';
      setGlobalError(msg);
      setItems((prev) =>
        prev.map((it) =>
          it.status === 'processing' ? { ...it, status: 'error', errorMessage: msg } : it
        )
      );
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const loadVerifiedSampleFile = async () => {
    setGlobalError(null);
    const cat = activeTool.category;

    if (cat === 'imagen' || activeTool.slug === 'imagenes-a-pdf') {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#C86D2D';
        ctx.fillRect(0, 0, 960, 640);
        ctx.fillStyle = '#FAF5EE';
        ctx.beginPath();
        ctx.moveTo(220, 480);
        ctx.lineTo(480, 140);
        ctx.lineTo(740, 480);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#141413';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('KASTRAL SAMPLE IMAGE 960x640', 190, 560);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) {
        const sampleFile = new File([blob], 'muestra-kastral-alta-res.png', { type: 'image/png' });
        addFilesToQueue([sampleFile]);
      }
      return;
    }

    if (cat === 'pdf') {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      const imgCanvas = document.createElement('canvas');
      imgCanvas.width = 900;
      imgCanvas.height = 600;
      const imgCtx = imgCanvas.getContext('2d');
      if (imgCtx) {
        imgCtx.fillStyle = '#C86D2D';
        imgCtx.fillRect(0, 0, 900, 600);
        imgCtx.fillStyle = '#FAF5EE';
        imgCtx.fillRect(60, 60, 780, 480);
        imgCtx.fillStyle = '#141413';
        imgCtx.font = 'bold 38px sans-serif';
        imgCtx.fillText('KASTRAL PDF EMBEDDED GRAPHIC', 120, 310);
      }
      const pngBlob = await new Promise<Blob | null>((r) => imgCanvas.toBlob(r, 'image/png'));
      const embeddedImage = pngBlob
        ? await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()))
        : null;

      for (let p = 1; p <= 3; p++) {
        const page = doc.addPage([595.28, 841.89]);
        page.drawText(`Kastral — Documento PDF de Muestra (Pagina ${p} de 3)`, {
          x: 50,
          y: 760,
          size: 16,
          font,
          color: rgb(0.78, 0.42, 0.17),
        });
        page.drawText(
          `Este documento PDF contiene 3 paginas con graficos incrustados para probar compresion, division, combinacion o extraccion local.`,
          { x: 50, y: 720, size: 11, font, color: rgb(0.15, 0.15, 0.15) }
        );
        if (embeddedImage) {
          page.drawImage(embeddedImage, {
            x: 50,
            y: 340,
            width: 495,
            height: 330,
          });
        }
      }
      const bytes = await doc.save({ useObjectStreams: false });
      const file1 = new File([new Uint8Array(bytes)], 'informe-kastral-3paginas.pdf', {
        type: 'application/pdf',
      });
      if (activeTool.slug === 'combinar-pdf') {
        const file2 = new File([new Uint8Array(bytes)], 'anexo-kastral-3paginas.pdf', {
          type: 'application/pdf',
        });
        addFilesToQueue([file1, file2]);
      } else {
        addFilesToQueue([file1]);
      }
      return;
    }

    if (activeTool.slug === 'convertir-hoja-calculo') {
      const csvText =
        'Producto,Categoria,Peso_Original_KB,Peso_Optimizado_KB\nCatalogo_Anual.pdf,PDF,4200,1150\nPortada_Web.png,Imagen,1850,310\nEntrevista_Podcast.wav,Audio,24500,3200';
      const f = new File([csvText], 'metricas-optimizacion.csv', { type: 'text/csv' });
      addFilesToQueue([f]);
      return;
    }

    if (activeTool.slug === 'convertir-documento') {
      const txtContent = `KASTRAL — INFORME TECNICO DE ARQUITECTURA\n\n1. Resumen Ejecutivo\nKastral permite convertir y comprimir documentos, imagenes y archivos multimedia directamente desde el navegador sin conexion a Internet.\n\n2. Ejecucion 100% Local\nTodos los archivos procesados permanecen en la memoria de tu dispositivo.`;
      const f = new File([txtContent], 'memoria-tecnica-kastral.txt', { type: 'text/plain' });
      addFilesToQueue([f]);
      return;
    }

    if (activeTool.slug === 'extraer-zip') {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file('leeme-kastral.txt', 'Archivo de texto dentro del paquete ZIP de prueba.');
      zip.file('datos/configuracion.json', JSON.stringify({ plataforma: 'Kastral', offline: true }, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });
      const f = new File([blob], 'paquete-ejemplo-kastral.zip', { type: 'application/zip' });
      addFilesToQueue([f]);
      return;
    }

    if (activeTool.slug === 'crear-zip') {
      const f1 = new File(['Documento 1 de prueba para empaquetado ZIP en Kastral.'], 'notas-proyecto.txt', {
        type: 'text/plain',
      });
      const f2 = new File([JSON.stringify({ version: '1.0.0', motor: 'JSZip' }, null, 2)], 'manifiesto.json', {
        type: 'application/json',
      });
      addFilesToQueue([f1, f2]);
      return;
    }

    if (cat === 'audio') {
      const sampleRate = 44100;
      const numSamples = sampleRate * 1;
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);
      const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
      };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + numSamples * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, numSamples * 2, true);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * 440 * t) * 0.25;
        view.setInt16(44 + i * 2, sample * 32767, true);
      }
      const wavFile = new File([buffer], 'tono-referencia-440hz.wav', { type: 'audio/wav' });
      addFilesToQueue([wavFile]);
    }
  };

  const triggerDownloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const handleDownloadAllAsZip = async () => {
    const completed = items.filter((it) => it.status === 'completed');
    if (completed.length === 0) return;

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const item of completed) {
      const name = item.outputFilename || `resultado-${item.originalName}`;
      if (item.outputBlob) {
        zip.file(name, item.outputBlob);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    triggerDownloadBlob(zipBlob, `kastral-lote-${activeTool.slug}.zip`);
  };

  const completedCount = items.filter((it) => it.status === 'completed').length;

  // Filtrar parámetros para no mostrar selectores redundantes de servidor vs navegador
  const visibleParameters = activeTool.parameters.filter((p) => p.id !== 'executionMode');

  const toolSelectOptions = KASTRAL_TOOLS.map((t) => ({
    label: `${t.categoryLabel}: ${t.shortTitle}`,
    value: t.slug,
  }));

  const outputFormatOptions = activeTool.outputFormats.map((fmt) => ({
    label:
      fmt === 'keep'
        ? 'Mantener formato original optimizado'
        : fmt === 'extract'
          ? 'Extraer archivos individuales'
          : fmt.toUpperCase(),
    value: fmt,
  }));

  return (
    <section
      aria-label="Mesa de trabajo de archivos"
      className="w-full bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-2xl shadow-sm"
    >
      {/* Cabecera de la mesa de trabajo */}
      <div className="px-6 py-4 border-b border-[#DCD5CB] dark:border-[#27272D] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#EAE4DC]/70 dark:bg-[#1C1C21] rounded-t-2xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-bold text-[#C86D2D] dark:text-[#DF7B35]">
              {activeTool.categoryLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>{activeTool.engineBadge}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Máx. {activeTool.maxFileSizeMB} MB por archivo</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {activeTool.title}
          </h2>
        </div>

        {allowToolSwitch && (
          <div className="flex items-center gap-3 shrink-0 w-full lg:w-80">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              Herramienta:
            </span>
            <CustomSelect
              id="workbench-tool-select"
              value={activeTool.slug}
              options={toolSelectOptions}
              onChange={handleSelectTool}
              className="flex-1"
            />
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Zona Drag & Drop con alto contraste y superficie cálida/oscura */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              addFilesToQueue(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-11 text-center transition-all ${
            isDragging
              ? 'border-[#C86D2D] bg-[#C86D2D]/10'
              : 'border-[#C9C0B3] dark:border-[#2E2E36] hover:border-[#C86D2D] dark:hover:border-[#DF7B35] bg-[#F8F5F0] dark:bg-[#0E0E11]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={activeTool.supportsMultiple}
            accept={
              activeTool.acceptedExtensions.includes('*')
                ? undefined
                : activeTool.acceptedExtensions.join(',')
            }
            onChange={(e) => {
              if (e.target.files) {
                addFilesToQueue(e.target.files);
                e.target.value = '';
              }
            }}
            className="sr-only"
            id="kastral-file-input"
          />

          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#C86D2D]/15 text-[#C86D2D] dark:text-[#DF7B35] flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                Arrastra tus archivos aquí o selecciónalos desde tu dispositivo
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                Formatos admitidos: {activeTool.acceptedExtensions.join(', ')} · Máximo {activeTool.maxFileSizeMB} MB
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#C86D2D] hover:bg-[#AD581D] rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                Seleccionar archivos
              </button>

              {activeTool.category !== 'video' && (
                <button
                  type="button"
                  onClick={loadVerifiedSampleFile}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-[#1C1C21] border border-[#DCD5CB] dark:border-[#2E2E36] hover:border-[#C86D2D] dark:hover:border-[#DF7B35] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cargar archivo de prueba
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Configuración de Salida y Parámetros con CustomSelect estilizado */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-3 border-t border-[#DCD5CB]/70 dark:border-[#27272D]">
          {/* Selector de Formato de Salida */}
          <div className="md:col-span-4 space-y-2">
            <span
              id="output-format-select"
              className="block text-xs font-bold text-zinc-800 dark:text-zinc-200"
            >
              Formato de salida
            </span>
            {activeTool.outputFormats.length <= 1 ? (
              <p
                aria-labelledby="output-format-select"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-bold rounded-xl border border-[#D5CEC4] dark:border-[#2E2E36] bg-[#F8F5F0] dark:bg-[#18181B] text-zinc-900 dark:text-zinc-100"
              >
                <FileText className="w-4 h-4 text-[#C86D2D] dark:text-[#DF7B35] shrink-0" />
                <span>{outputFormatOptions[0]?.label ?? targetFormat.toUpperCase()}</span>
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  · único disponible
                </span>
              </p>
            ) : (
              <CustomSelect
                id="output-format-select"
                value={targetFormat}
                options={outputFormatOptions}
                onChange={setTargetFormat}
              />
            )}
          </div>

          {/* Parámetros específicos de la herramienta */}
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {visibleParameters.map((param) => (
              <div key={param.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`param-${param.id}`}
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#C86D2D] dark:text-[#DF7B35]" />
                    <span>{param.label}</span>
                  </label>
                  {param.type === 'range' && (
                    <span className="text-xs font-mono tabular-nums font-bold text-[#C86D2D] dark:text-[#DF7B35]">
                      {params[param.id]}
                      {param.unit || ''}
                    </span>
                  )}
                </div>

                {param.type === 'select' && param.options && (
                  <CustomSelect
                    id={`param-${param.id}`}
                    value={String(params[param.id] ?? param.defaultValue)}
                    options={param.options}
                    onChange={(val) => setParams((prev) => ({ ...prev, [param.id]: val }))}
                  />
                )}

                {param.type === 'range' && (
                  <div className="pt-1">
                    <input
                      id={`param-${param.id}`}
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={Number(params[param.id] ?? param.defaultValue)}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, [param.id]: Number(e.target.value) }))
                      }
                      className="w-full accent-[#C86D2D] cursor-pointer"
                    />
                  </div>
                )}

                {param.type === 'number' && (
                  <input
                    id={`param-${param.id}`}
                    type="number"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={Number(params[param.id] ?? param.defaultValue)}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [param.id]: Number(e.target.value) }))
                    }
                    className="w-full text-sm font-mono tabular-nums bg-white dark:bg-[#18181B] border border-zinc-300 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
                  />
                )}

                {param.type === 'text' && (
                  <input
                    id={`param-${param.id}`}
                    type="text"
                    value={String(params[param.id] ?? param.defaultValue)}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [param.id]: e.target.value }))
                    }
                    className="w-full text-sm bg-white dark:bg-[#18181B] border border-zinc-300 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
                  />
                )}

                {param.description && (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    {param.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Alerta de error general si aplica */}
        {globalError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center gap-2.5 text-xs sm:text-sm text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Cola de Archivos y Resultados */}
        {items.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                Archivos en cola ({items.length})
              </div>
              <div className="flex items-center gap-2">
                {completedCount > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAllAsZip}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-[#EAE4DC] dark:bg-[#222228] hover:bg-[#DCD5CB] dark:hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5 text-[#C86D2D]" />
                    <span>Descargar todo en ZIP ({completedCount})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={isBatchProcessing}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar lista</span>
                </button>
              </div>
            </div>

            <div className="border border-[#DCD5CB] dark:border-[#27272D] rounded-xl divide-y divide-[#DCD5CB] dark:divide-[#27272D] overflow-hidden">
              {items.map((item) => (
                <WorkbenchQueueRow
                  key={item.id}
                  item={item}
                  onRemove={removeItem}
                  onDownload={triggerDownloadBlob}
                />
              ))}
            </div>

            {/* Botón Principal de Ejecución */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {activeTool.engine === 'server' || SERVER_ONLY_FORMATS.has(targetFormat)
                  ? 'El archivo se procesa con los motores del servidor y se elimina del directorio temporal al terminar.'
                  : 'Procesamiento inmediato en tu dispositivo sin necesidad de conexión a Internet.'}
              </p>
              <button
                type="button"
                onClick={handleStartProcessing}
                disabled={isBatchProcessing || items.every((i) => i.status === 'error')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-[#C86D2D] hover:bg-[#AD581D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                {isBatchProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Procesando archivos...</span>
                  </>
                ) : completedCount > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Volver a procesar con ajustes actuales</span>
                  </>
                ) : (
                  <span>
                    {activeTool.mergesIntoSingleOutput
                      ? `Combinar y generar ${targetFormat.toUpperCase()}`
                      : `Procesar ${items.length === 1 ? 'archivo' : `${items.length} archivos`}`}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
