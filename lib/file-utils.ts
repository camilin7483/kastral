/**
 * Formatea un tamaño en bytes a una cadena legible (B, KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : dm)} ${sizes[i]}`;
}

/**
 * Calcula el porcentaje real de reducción de tamaño entre el archivo original y el procesado.
 * Devuelve null si no hubo reducción (o si el archivo resultante es igual o mayor),
 * cumpliendo la regla de mostrar el porcentaje de reducción solo cuando corresponda y sea real.
 */
export function calculateReductionPercentage(originalBytes: number, finalBytes: number): number | null {
  if (!Number.isFinite(originalBytes) || !Number.isFinite(finalBytes)) return null;
  if (originalBytes <= 0 || finalBytes <= 0) return null;
  if (finalBytes >= originalBytes) return null;

  const reduction = ((originalBytes - finalBytes) / originalBytes) * 100;
  const rounded = Math.round(reduction * 10) / 10;
  return rounded > 0 ? rounded : null;
}

/**
 * Sanea un nombre de archivo eliminando rutas (Path Traversal), caracteres de control
 * y secuencias peligrosas como "../" o barras.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'archivo';
  }
  // Eliminar separadores de directorio tanto Unix como Windows
  const base = rawName.replace(/\\/g, '/').split('/').pop() || 'archivo';
  // Eliminar caracteres no seguros y secuencias de puntos dobles
  const cleaned = base
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._\-\sáéíóúÁÉÍÓÚñÑ]/g, '_')
    .trim();

  // Evitar nombres ocultos que empiecen por punto o vacíos
  const withoutLeadingDot = cleaned.replace(/^\.+/, '');
  return withoutLeadingDot.slice(0, 120) || 'archivo';
}

/**
 * Verifica que una ruta interna de un archivo comprimido (ZIP/TAR) no intente
 * escapar del directorio de extracción (prevención de Zip Slip / Path Traversal).
 */
export function isSafeArchiveEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') return false;
  if (entryPath.includes('\0')) return false;

  const normalized = entryPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }

  const segments = normalized.split('/');
  let depth = 0;
  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    // Solo el segmento exacto ".." es traversal; nombres legítimos como
    // "backup..2024.bat" o "v1..0" deben pasar (el backend usa este mismo criterio).
    if (seg === '..') {
      return false;
    }
    depth += 1;
  }

  return depth > 0;
}

/**
 * Parsea una cadena de rangos de páginas PDF (ej: "1, 3-5, 8") y devuelve
 * los índices basados en 0 verificados contra el número total de páginas.
 */
export function parsePdfPageRanges(rangeStr: string, totalPages: number): { pages: number[]; error?: string } {
  if (!rangeStr || !rangeStr.trim()) {
    return { pages: [], error: 'Introduce al menos un número o rango de página (ej. 1, 3-5).' };
  }
  if (totalPages <= 0) {
    return { pages: [], error: 'El documento no contiene páginas válidas.' };
  }

  const parts = rangeStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { pages: [], error: 'Formato de rango vacío.' };
  }

  const result: number[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const pageNum = parseInt(part, 10);
      if (pageNum < 1 || pageNum > totalPages) {
        return {
          pages: [],
          error: `La página ${pageNum} está fuera del rango del documento (1 a ${totalPages}).`,
        };
      }
      const zeroIdx = pageNum - 1;
      if (!seen.has(zeroIdx)) {
        seen.add(zeroIdx);
        result.push(zeroIdx);
      }
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [startRaw, endRaw] = part.split('-').map((s) => parseInt(s.trim(), 10));
      if (startRaw < 1 || endRaw < 1 || startRaw > totalPages || endRaw > totalPages) {
        return {
          pages: [],
          error: `El rango ${part} supera el límite de páginas del documento (1 a ${totalPages}).`,
        };
      }
      if (startRaw > endRaw) {
        return {
          pages: [],
          error: `En el rango ${part}, la página inicial no puede ser mayor que la final.`,
        };
      }
      for (let p = startRaw; p <= endRaw; p++) {
        const zeroIdx = p - 1;
        if (!seen.has(zeroIdx)) {
          seen.add(zeroIdx);
          result.push(zeroIdx);
        }
      }
    } else {
      return {
        pages: [],
        error: `Formato no válido en "${part}". Usa números o rangos separados por comas (ej. 1, 3-5).`,
      };
    }
  }

  return { pages: result };
}

/**
 * Inspecciona los primeros bytes (Magic Bytes / Firma binaria) de un archivo
 * para validar que el archivo no esté vacío ni falsifique su extensión real.
 */
export function verifyMagicBytes(buffer: Uint8Array, expectedExtension: string): { valid: boolean; detectedType: string; reason?: string } {
  if (!buffer || buffer.byteLength === 0) {
    return { valid: false, detectedType: 'empty', reason: 'El archivo está vacío (0 bytes).' };
  }

  const ext = expectedExtension.toLowerCase().replace(/^\./, '');

  // Si acepta cualquier archivo (ej. crear-zip)
  if (ext === '*') {
    return { valid: true, detectedType: 'any' };
  }

  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (ext === 'pdf') {
    const isPdf = b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46;
    return isPdf
      ? { valid: true, detectedType: 'application/pdf' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una cabecera PDF válida (%PDF).' };
  }

  // PNG: 89 50 4E 47
  if (ext === 'png') {
    const isPng = b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47;
    return isPng
      ? { valid: true, detectedType: 'image/png' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una firma binaria PNG válida.' };
  }

  // JPG / JPEG: FF D8 FF
  if (ext === 'jpg' || ext === 'jpeg') {
    const isJpg = b0 === 0xff && b1 === 0xd8 && b2 === 0xff;
    return isJpg
      ? { valid: true, detectedType: 'image/jpeg' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una firma binaria JPEG válida.' };
  }

  // GIF: GIF87a o GIF89a (47 49 46 38)
  if (ext === 'gif') {
    const isGif = b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38;
    return isGif
      ? { valid: true, detectedType: 'image/gif' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una cabecera GIF válida.' };
  }

  // BMP: 42 4D ("BM")
  if (ext === 'bmp') {
    const isBmp = b0 === 0x42 && b1 === 0x4d;
    return isBmp
      ? { valid: true, detectedType: 'image/bmp' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una cabecera BMP válida.' };
  }

  // WEBP: RIFF....WEBP
  if (ext === 'webp') {
    const isRiff = b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46;
    const isWebp = buffer.byteLength >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp
      ? { valid: true, detectedType: 'image/webp' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo no tiene una cabecera RIFF/WEBP válida.' };
  }

  // AVI: RIFF....AVI  (contenedor de vídeo; la validación profunda del códec la hace FFmpeg)
  if (ext === 'avi') {
    const isRiff = b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46;
    const isAvi =
      buffer.byteLength >= 12 && buffer[8] === 0x41 && buffer[9] === 0x56 && buffer[10] === 0x49 && buffer[11] === 0x20;
    return isRiff && isAvi
      ? { valid: true, detectedType: 'video/x-msvideo' }
      : { valid: false, detectedType: 'unknown', reason: 'El archivo .avi no tiene una cabecera RIFF/AVI válida.' };
  }

  // ZIP / DOCX / XLSX / ODS (basados en contenedor PK\x03\x04)
  if (['zip', 'docx', 'xlsx', 'ods'].includes(ext)) {
    const isPkZip = b0 === 0x50 && b1 === 0x4b && (b2 === 0x03 || b2 === 0x05);
    return isPkZip
      ? { valid: true, detectedType: 'application/zip-container' }
      : { valid: false, detectedType: 'unknown', reason: `El archivo .${ext} no contiene una estructura comprimida PKZIP válida.` };
  }

  // TXT / CSV / MD / RTF: verificar que no contenga bytes nulos masivos de un ejecutable binario
  if (['txt', 'csv', 'md', 'rtf'].includes(ext)) {
    const sampleSize = Math.min(buffer.byteLength, 512);
    let nullCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0x00) nullCount++;
    }
    if (nullCount > 2) {
      return {
        valid: false,
        detectedType: 'binary',
        reason: 'El archivo parece ser un binario ejecutable o corrupto en lugar de un documento de texto.',
      };
    }
    return { valid: true, detectedType: 'text/plain' };
  }

  // Para otros formatos multimedia (MP4, MP3, WAV, FLAC, OGG, AVIF, MKV, WEBM)
  // verificamos que tenga al menos 16 bytes de cabecera y delegamos la validación profunda a FFmpeg/Sharp
  if (buffer.byteLength < 12) {
    return { valid: false, detectedType: 'corrupt', reason: 'El archivo es demasiado pequeño o está truncado.' };
  }

  return { valid: true, detectedType: `media/${ext}` };
}

/**
 * Construye el nombre del archivo de salida reemplazando la extensión de forma segura.
 */
export function buildOutputFilename(originalName: string, targetExt: string, suffix?: string): string {
  const safeOriginal = sanitizeFilename(originalName);
  const lastDot = safeOriginal.lastIndexOf('.');
  const baseName = lastDot > 0 ? safeOriginal.slice(0, lastDot) : safeOriginal;
  const cleanExt = targetExt.replace(/^\./, '').toLowerCase();
  const extra = suffix ? `-${suffix}` : '';
  return `${baseName}${extra}.${cleanExt}`;
}
