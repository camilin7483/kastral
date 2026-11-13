import { getToolBySlug } from './tools-catalog';

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

interface TauriProcessResponse {
  status: string;
  output_filename?: string;
  output_size?: number;
  output_mime_type?: string;
  details?: string;
  error?: string;
  data_b64?: string;
}

// Decodifica base64 a bytes en tramos de 64 KB sobre un buffer prealocado:
// evita un atob() gigante de una sola vez que dispara picos de memoria.
const BASE64_CHUNK_CHARS = 64 * 1024; // múltiplo de 4: nunca parte un cuarteto

function decodeBase64Chunked(dataB64: string): Uint8Array<ArrayBuffer> {
  const clean = dataB64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length * 3) / 4 - padding);
  let pos = 0;
  for (let i = 0; i < clean.length; i += BASE64_CHUNK_CHARS) {
    const bin = atob(clean.slice(i, i + BASE64_CHUNK_CHARS));
    for (let j = 0; j < bin.length; j++) bytes[pos++] = bin.charCodeAt(j);
  }
  return bytes;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : url);
    };
    reader.readAsDataURL(file);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(new Error('No se pudo leer el archivo generado.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export interface TauriSaveResponse {
  path: string;
  filename: string;
  size: number;
}

// Debe coincidir con MAX_SAVE_BYTES de src-tauri/src/main.rs.
const MAX_SAVE_BYTES = 100 * 1024 * 1024;

/**
 * Guarda un resultado directamente en la carpeta de Descargas del sistema
 * (sin pasar por el diálogo del WebView) y devuelve la ruta absoluta para
 * que la interfaz pueda decir exactamente dónde quedó el archivo.
 */
export async function saveOutputOnTauri(blob: Blob, filename: string): Promise<TauriSaveResponse> {
  if (!isTauri()) {
    throw new Error('El guardado nativo solo está disponible en la aplicación de escritorio.');
  }
  if (blob.size > MAX_SAVE_BYTES) {
    throw new Error(
      'El resultado supera el límite de 100 MB permitido para guardar en la aplicación de escritorio.'
    );
  }
  const dataB64 = await blobToBase64(blob);
  const { invoke } = await import('@tauri-apps/api/core');
  const rawText = await invoke<string>('kastral_save_output', {
    file_name: filename,
    data_b64: dataB64,
  });
  let raw: { status?: string; path?: string; filename?: string; size?: number; error?: string };
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new Error('La aplicación de escritorio devolvió una respuesta inesperada.');
  }
  if (raw.status !== 'completed' || !raw.path) {
    throw new Error(raw.error || 'No se pudo guardar el archivo en tu equipo.');
  }
  return {
    path: raw.path,
    filename: raw.filename || filename,
    size: raw.size ?? blob.size,
  };
}

/** Abre el explorador de archivos del sistema con el resultado seleccionado. */
export async function revealDownloadOnTauri(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

export async function processOnTauri(
  file: File,
  toolSlug: string,
  targetFormat: string,
  params: Record<string, unknown>
): Promise<{
  outputBlob: Blob;
  outputFilename: string;
  outputSize: number;
  mimeType: string;
  details: string;
}> {
  const tool = getToolBySlug(toolSlug);
  if (tool && file.size > tool.maxFileSizeMB * 1024 * 1024) {
    throw new Error(`Supera el límite máximo de ${tool.maxFileSizeMB} MB.`);
  }
  const dataB64 = await fileToBase64(file);
  const { invoke } = await import('@tauri-apps/api/core');
  const rawText = await invoke<string>('kastral_process', {
    tool_slug: toolSlug,
    file_name: file.name,
    target_format: targetFormat,
    params_json: JSON.stringify(params),
    data_b64: dataB64,
  });
  const raw = JSON.parse(rawText) as TauriProcessResponse;
  if (raw.status === 'failed' || !raw.data_b64) {
    throw new Error(raw.error || 'Tauri no pudo procesar el archivo.');
  }
  const bytes = decodeBase64Chunked(raw.data_b64);
  const mimeType = raw.output_mime_type || 'application/octet-stream';
  const outputBlob = new Blob([bytes], { type: mimeType });
  return {
    outputBlob,
    outputFilename: raw.output_filename || file.name,
    outputSize: raw.output_size ?? outputBlob.size,
    mimeType,
    details: raw.details ?? '',
  };
}
