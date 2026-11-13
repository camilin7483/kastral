'use client';

import { formatBytes, sanitizeFilename } from './file-utils';
import { isTauri, saveOutputOnTauri } from './tauri-engine';

export type DownloadMode = 'desktop' | 'picker' | 'browser';

export interface DownloadRecord {
  id: string;
  filename: string;
  size: number;
  mode: DownloadMode;
  /** Absolute path on desktop or a human label for the browser location. */
  location: string;
  /** Present only when the platform reports an absolute path (Tauri). */
  path?: string;
  createdAt: number;
}

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  name: string;
  createWritable(): Promise<WritableLike>;
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileHandleLike>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  aiff: 'audio/aiff',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  zip: 'application/zip',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  epub: 'application/epub+zip',
  rtf: 'application/rtf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const BROWSER_LOCATION = 'la carpeta de descargas de tu navegador';
const PICKER_LOCATION = 'la ubicación que elegiste';

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

/** Picker type filter derived from the output extension; empty means "any file". */
export function pickerTypeFor(
  filename: string
): Array<{ description: string; accept: Record<string, string[]> }> {
  const ext = extensionOf(filename);
  const mime = MIME_BY_EXTENSION[ext];
  if (!ext || !mime) return [];
  return [{ description: `Archivo ${ext.toUpperCase()}`, accept: { [mime]: [`.${ext}`] } }];
}

/** Short, honest sentence describing where the browser/desktop put the file. */
export function describeDownloadLocation(
  record: Pick<DownloadRecord, 'mode' | 'location'>
): string {
  if (record.mode === 'desktop') return record.location;
  if (record.mode === 'picker') return PICKER_LOCATION;
  return BROWSER_LOCATION;
}

export interface DownloadToastCopy {
  title: string;
  message: string;
  detail: string;
}

/** Toast copy that always answers "where did my file go?". */
export function buildDownloadToast(record: DownloadRecord): DownloadToastCopy {
  const saved = record.mode === 'desktop' || record.mode === 'picker';
  return {
    title: saved ? 'Archivo guardado' : 'Descarga iniciada',
    message: `${record.filename} · ${formatBytes(record.size)}`,
    detail:
      record.mode === 'desktop'
        ? `Guardado en ${record.location}`
        : record.mode === 'picker'
          ? `Guardado en ${describeDownloadLocation(record)}`
          : `Se está guardando en ${describeDownloadLocation(record)}`,
  };
}

function createId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Safari/WebKit needs the URL alive until the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'AbortError';
}

/**
 * Saves a generated file and reports exactly where it landed:
 * - Tauri desktop: native command writes to the OS Downloads folder and
 *   returns the absolute path (the only place a real path is knowable).
 * - Chromium browsers: native save picker, so the user chooses the folder.
 * - Everything else: anchor download into the browser's download folder.
 * Returns `null` when the user cancels the picker.
 */
export async function saveGeneratedFile(blob: Blob, filename: string): Promise<DownloadRecord | null> {
  const safeName = sanitizeFilename(filename);
  const now = Date.now();

  if (isTauri()) {
    const saved = await saveOutputOnTauri(blob, safeName);
    return {
      id: createId(),
      filename: saved.filename,
      size: saved.size || blob.size,
      mode: 'desktop',
      location: saved.path,
      path: saved.path,
      createdAt: now,
    };
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const types = pickerTypeFor(safeName);
      const handle = await picker({
        suggestedName: safeName,
        ...(types.length > 0 ? { types } : {}),
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {
        id: createId(),
        filename: handle.name || safeName,
        size: blob.size,
        mode: 'picker',
        location: PICKER_LOCATION,
        createdAt: now,
      };
    } catch (error) {
      // Cancel is a valid outcome: no toast, no fallback, no surprise.
      if (isAbortError(error)) return null;
      // Permission/availability failures fall through to the classic download.
    }
  }

  triggerAnchorDownload(blob, safeName);
  return {
    id: createId(),
    filename: safeName,
    size: blob.size,
    mode: 'browser',
    location: BROWSER_LOCATION,
    createdAt: now,
  };
}
