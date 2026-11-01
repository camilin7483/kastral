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
  const bin = atob(raw.data_b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
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
