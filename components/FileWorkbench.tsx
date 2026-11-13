'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
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
  FolderOpen,
  FileText,
  RefreshCw,
  History,
  MapPin,
} from 'lucide-react';
import { KastralTool, KASTRAL_TOOLS } from '@/lib/tools-catalog';
import {
  formatBytes,
  calculateReductionPercentage,
} from '@/lib/file-utils';
// Motores pesados (pdf-lib, jszip, xlsx, mammoth) solo bajo demanda:
// este import dinámico genera un chunk separado y no crece el First Load JS.
import { CustomSelect } from '@/components/CustomSelect';
import { useToast } from '@/components/Toast';
import { isTauri, processOnTauri, revealDownloadOnTauri } from '@/lib/tauri-engine';
import {
  buildDownloadToast,
  saveGeneratedFile,
  type DownloadRecord,
} from '@/lib/download-manager';

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
  // Última ubicación donde se guardó este resultado (ruta real en desktop,
  // etiqueta honesta en navegador). Se muestra en la fila tras descargar.
  lastSavedLocation?: string;
  lastSavedPath?: string;
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
  onReveal,
}: {
  item: WorkbenchItem;
  onRemove: (id: string) => void;
  onDownload: (item: WorkbenchItem, blob: Blob, filename: string) => void;
  onReveal: (path: string) => void;
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
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Completado</span>
              </span>

              <button
                type="button"
                onClick={() => onDownload(item, item.outputBlob!, item.outputFilename || 'resultado')}
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

      {item.lastSavedLocation && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 min-w-0">
          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate" title={item.lastSavedLocation}>
            Guardado en {item.lastSavedLocation}
          </span>
          {item.lastSavedPath && (
            <button
              type="button"
              onClick={() => onReveal(item.lastSavedPath!)}
              className="shrink-0 underline underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-300 cursor-pointer"
            >
              Mostrar
            </button>
          )}
        </div>
      )}

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
                    onClick={() => onDownload(item, sub.blob, sub.name)}
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
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [showDownloads, setShowDownloads] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const startProcessingRef = useRef<() => void>(() => {});
  const { toast } = useToast();

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

  const updateItemState = useCallback((id: string, patch: Partial<WorkbenchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  /**
   * Progreso vivo para tareas largas (servidor o Tauri): la petición es
   * atómica, así que la barra avanzaría a saltos (15 % → espera → 100 %).
   * En su lugar se anima con easing hacia un tope honesto (<100 %) mientras
   * se muestra la etapa real. Nunca finge finalización: el 100 % solo llega
   * con el resultado en mano.
   */
  const trackLongTask = (id: string, stage: string, cap = 90) => {
    updateItemState(id, { progress: 8, details: stage });
    const timer = setInterval(() => {
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id || it.status !== 'processing') return it;
          const next = it.progress + Math.max(0.4, (cap - it.progress) * 0.05);
          return { ...it, progress: Math.min(cap, next) };
        })
      );
    }, 500);
    return () => clearInterval(timer);
  };

  /**
   * Envía el archivo a la ruta integrada /api/v1/process (Sharp, Ghostscript o FFmpeg)
   * y devuelve el resultado ya descargado como Blob.
   */
  const processOnServer = async (item: WorkbenchItem, slug: string, fmt: string) => {
    const onPct = (pct: number) => updateItemState(item.id, { progress: pct });
    const stopTracking = trackLongTask(
      item.id,
      `Subiendo ${formatBytes(item.file.size)} al motor del servidor…`
    );

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
      stopTracking();
      throw new Error(data.error || 'El servidor no pudo procesar el archivo.');
    }

    updateItemState(item.id, {
      progress: 92,
      details: 'Procesando en el servidor… los vídeos y AVIF pueden tardar unos minutos.',
    });
    const download = await fetch(data.downloadUrl);
    if (!download.ok) {
      stopTracking();
      throw new Error('El archivo se procesó pero no se pudo descargar el resultado.');
    }

    const blob = await download.blob();
    stopTracking();
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
    const stopTracking = trackLongTask(
      item.id,
      'Procesando en el motor local… los vídeos y AVIF pueden tardar unos minutos.'
    );
    try {
      const res = await processOnTauri(item.file, slug, fmt, params);
      stopTracking();
      updateItemState(item.id, { progress: 100 });
      return {
        outputBlob: res.outputBlob,
        outputFilename: res.outputFilename,
        outputSize: res.outputSize,
        mimeType: res.mimeType,
        details: res.details,
        extractedItems: undefined,
      };
    } finally {
      stopTracking();
    }
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
    if (slug === 'girar-pdf') {
      return processors.rotatePdfInBrowser(item.file, params, onPct);
    }
    if (slug === 'marca-agua-pdf') {
      return processors.addWatermarkToPdfInBrowser(item.file, params, onPct);
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

  // Mantiene el atajo siempre apuntando a la última versión del handler.
  useEffect(() => {
    startProcessingRef.current = handleStartProcessing;
  });

  // Atajo Ctrl/Cmd + Enter para iniciar el lote sin ratón.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        startProcessingRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Arrastrar y soltar en cualquier parte de la página, y pegar archivos
  // desde el portapapeles (capturas, PDFs copiados, etc.).
  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (event.dataTransfer?.files?.length) {
        addFilesToQueue(event.dataTransfer.files);
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        addFilesToQueue(files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [addFilesToQueue]);

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

  /**
   * Guarda un resultado y lo notifica con la ubicación exacta:
   * - Escritorio Tauri: ruta absoluta dentro de Descargas.
   * - Navegador con selector nativo: la ubicación elegida por el usuario.
   * - Resto: la carpeta de descargas del navegador (mensaje honesto).
   */
  const handleSaveFile = useCallback(
    async (blob: Blob, filename: string): Promise<DownloadRecord | null> => {
      try {
        const record = await saveGeneratedFile(blob, filename);
        if (!record) return null;
        setDownloads((prev) => [record, ...prev].slice(0, 6));
        const copy = buildDownloadToast(record);
        const revealable = Boolean(record.path);
        toast({
          kind: 'success',
          title: copy.title,
          message: copy.message,
          detail: copy.detail,
          durationMs: revealable ? 10000 : 7000,
          actionLabel: revealable ? 'Mostrar en carpeta' : undefined,
          onAction: revealable
            ? () => {
                revealDownloadOnTauri(record.path!).catch(() => {
                  toast({
                    kind: 'error',
                    title: 'No se pudo mostrar el archivo',
                    message: 'Puede que se haya movido o eliminado de la carpeta de Descargas.',
                    durationMs: 8000,
                  });
                });
              }
            : undefined,
        });
        return record;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo guardar el archivo generado.';
        toast({
          kind: 'error',
          title: 'No se pudo guardar el archivo',
          message,
          durationMs: 10000,
        });
        return null;
      }
    },
    [toast]
  );

  const handleRowDownload = useCallback(
    async (item: WorkbenchItem, blob: Blob, filename: string) => {
      const record = await handleSaveFile(blob, filename);
      if (record) {
        updateItemState(item.id, {
          lastSavedLocation: record.location,
          lastSavedPath: record.path,
        });
      }
    },
    [handleSaveFile, updateItemState]
  );

  const handleReveal = useCallback(
    (path: string) => {
      revealDownloadOnTauri(path).catch(() => {
        toast({
          kind: 'error',
          title: 'No se pudo mostrar el archivo',
          message: 'Puede que se haya movido o eliminado de la carpeta de Descargas.',
          durationMs: 8000,
        });
      });
    },
    [toast]
  );

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
    await handleSaveFile(zipBlob, `kastral-lote-${activeTool.slug}.zip`);
  };

  const completedCount = items.filter((it) => it.status === 'completed').length;

  // Resumen real del lote: la entrada total refleja la cola completa, pero
  // el ahorro solo compara archivos ya completados (nunca mezcla pendientes).
  const batchStats = useMemo(() => {
    let originalBytes = 0;
    let completedInputBytes = 0;
    let outputBytes = 0;
    let completed = 0;
    for (const item of items) {
      originalBytes += item.originalSize;
      if (item.status === 'completed' && typeof item.outputSize === 'number') {
        completedInputBytes += item.originalSize;
        outputBytes += item.outputSize;
        completed += 1;
      }
    }
    const ratio =
      completedInputBytes > 0 && outputBytes > 0
        ? Math.round((1 - outputBytes / completedInputBytes) * 100)
        : null;
    return { originalBytes, outputBytes, completed, ratio };
  }, [items]);

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
        {/* Zona Drag & Drop con alto contraste y superficie cálida/oscura.
            El arrastre se escucha a nivel de página para que funcione en
            cualquier punto de la interfaz (ver overlay más abajo). */}
        <div
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

            {/* Resumen real del lote */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#F8F5F0] dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Archivos
                </p>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {items.length}
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {' '}
                    · {completedCount} listos
                  </span>
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F8F5F0] dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Entrada
                </p>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatBytes(batchStats.originalBytes)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F8F5F0] dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Salida
                </p>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {batchStats.completed > 0 ? formatBytes(batchStats.outputBytes) : '—'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F8F5F0] dark:bg-[#18181C] border border-[#DCD5CB] dark:border-[#27272D]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Ahorro total
                </p>
                <p
                  className={`text-sm font-bold tabular-nums ${
                    batchStats.ratio !== null && batchStats.ratio > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : batchStats.ratio !== null && batchStats.ratio < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {batchStats.ratio !== null
                    ? batchStats.ratio > 0
                      ? `-${batchStats.ratio}%`
                      : batchStats.ratio < 0
                        ? `+${Math.abs(batchStats.ratio)}%`
                        : '0%'
                    : '—'}
                </p>
              </div>
            </div>

            <div className="border border-[#DCD5CB] dark:border-[#27272D] rounded-xl divide-y divide-[#DCD5CB] dark:divide-[#27272D] overflow-hidden">
              {items.map((item) => (
                <WorkbenchQueueRow
                  key={item.id}
                  item={item}
                  onRemove={removeItem}
                  onDownload={handleRowDownload}
                  onReveal={handleReveal}
                />
              ))}
            </div>

            {/* Botón Principal de Ejecución */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {activeTool.engine === 'server' || SERVER_ONLY_FORMATS.has(targetFormat)
                  ? 'El archivo se procesa con los motores del servidor y se elimina del directorio temporal al terminar.'
                  : 'Procesamiento inmediato en tu dispositivo sin necesidad de conexión a Internet.'}{' '}
                <span className="text-zinc-500 dark:text-zinc-500">
                  Atajo: Ctrl/⌘ + Enter.
                </span>
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

        {/* Historial de descargas de la sesión: responde "¿dónde quedó?".
            Vive fuera de la cola para seguir visible al vaciar la lista. */}
        {downloads.length > 0 && (
          <div className="border border-[#DCD5CB] dark:border-[#27272D] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDownloads((value) => !value)}
              aria-expanded={showDownloads}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-[#F8F5F0] dark:bg-[#18181C] hover:bg-[#EAE4DC] dark:hover:bg-[#1E1E24] transition-colors cursor-pointer text-left"
            >
              <span className="inline-flex items-center gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                <History className="w-4 h-4 text-[#C86D2D] dark:text-[#DF7B35]" />
                Descargas de esta sesión ({downloads.length})
              </span>
              <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                {showDownloads ? 'Ocultar' : 'Mostrar'}
              </span>
            </button>
            {showDownloads && (
              <ul className="divide-y divide-[#DCD5CB] dark:divide-[#27272D] bg-white dark:bg-[#141417]">
                {downloads.map((record) => (
                  <li key={record.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {record.filename}{' '}
                        <span className="font-mono font-normal text-zinc-500 dark:text-zinc-400">
                          {formatBytes(record.size)}
                        </span>
                      </p>
                      <p
                        className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate"
                        title={record.location}
                      >
                        {record.mode === 'browser' ? 'En ' : 'Guardado en '}
                        {record.location}
                      </p>
                    </div>
                    <time className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                      {new Date(record.createdAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {record.path && (
                      <button
                        type="button"
                        onClick={() => handleReveal(record.path!)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C86D2D] dark:text-[#DF7B35] hover:underline cursor-pointer shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Abrir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Overlay de arrastre global: indica que se puede soltar en cualquier punto */}
      {isDragging && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4 sm:p-8"
        >
          <div className="absolute inset-0 bg-[#0B0B0D]/75 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl rounded-3xl border-2 border-dashed border-[#DF7B35] bg-[#141417]/95 p-10 sm:p-14 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-[#C86D2D]/20 text-[#DF7B35] flex items-center justify-center mx-auto mb-5">
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white">Suelta los archivos aquí</p>
            <p className="text-sm text-zinc-300 mt-2">
              Se añadirán a la cola de {activeTool.shortTitle}.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
