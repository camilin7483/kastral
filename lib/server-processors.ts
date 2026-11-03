import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  sanitizeFilename,
  verifyMagicBytes,
  buildOutputFilename,
} from './file-utils';

const execFileAsync = promisify(execFile);

export interface ServerTaskState {
  taskId: string;
  toolSlug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  originalName: string;
  originalSize: number;
  outputFilename?: string;
  outputFilePath?: string;
  outputSize?: number;
  outputMimeType?: string;
  details?: string;
  error?: string;
  createdAt: number;
  workDir: string;
}

const TEMP_ROOT = path.join(os.tmpdir(), 'kastral-tasks');
const MAX_CONCURRENT_TASKS = Number(process.env.MAX_CONCURRENT_TASKS || 2);
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_SECONDS || 60) * 1000;
const CLEANUP_AGE_MS = Number(process.env.TEMP_CLEANUP_MINUTES || 15) * 60 * 1000;

// Almacén en memoria (persistente entre recargas de módulo en el mismo proceso Node)
const globalForTasks = globalThis as unknown as {
  kastralTasks?: Map<string, ServerTaskState>;
  kastralActiveCount?: number;
  kastralTaskWaiters?: Array<() => void>;
};

if (!globalForTasks.kastralTasks) {
  globalForTasks.kastralTasks = new Map<string, ServerTaskState>();
}
if (typeof globalForTasks.kastralActiveCount !== 'number') {
  globalForTasks.kastralActiveCount = 0;
}
if (!globalForTasks.kastralTaskWaiters) {
  globalForTasks.kastralTaskWaiters = [];
}

export const taskRegistry = globalForTasks.kastralTasks;

/**
 * Semáforo real que limita cuántas tareas se ejecutan a la vez (MAX_CONCURRENT_TASKS).
 * Las solicitudes sobrantes esperan en cola FIFO en lugar de saturar la CPU o la memoria.
 */
async function acquireTaskSlot(): Promise<void> {
  const state = globalForTasks;
  if ((state.kastralActiveCount || 0) < MAX_CONCURRENT_TASKS) {
    state.kastralActiveCount = (state.kastralActiveCount || 0) + 1;
    return;
  }
  await new Promise<void>((resolve) => {
    (state.kastralTaskWaiters ||= []).push(resolve);
  });
}

function releaseTaskSlot(): void {
  const state = globalForTasks;
  const next = state.kastralTaskWaiters?.shift();
  if (next) {
    // El turno pasa al siguiente en cola: el contador se mantiene igual.
    next();
    return;
  }
  state.kastralActiveCount = Math.max(0, (state.kastralActiveCount || 1) - 1);
}

/**
 * Reduce el mensaje de error de un comando externo a su causa real,
 * sin exponer banners ni rutas internas del servidor.
 */
function summarizeToolError(message: string): string {
  const sanitized = message.replace(/\/tmp\/[^\s"']+/g, '[directorio-aislado]');
  const lines = sanitized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const reason = lines[lines.length - 1] || 'Error durante el procesamiento del archivo.';
  return reason.length > 300 ? `${reason.slice(0, 297)}...` : reason;
}

/**
 * Codificadores FFmpeg válidos para AV1/AVIF en imagen.
 * Ojo: `libaom-avif` NO existe (ese nombre erróneo tumbaba PNG→AVIF en
 * escritorio con "Unknown encoder"); el correcto es `libaom-av1`.
 */
const AVIF_VIDEO_ENCODERS = ['libaom-av1', 'libsvtav1', 'librav1e'] as const;

/**
 * Busca un codificador AV1/AVIF en la salida de `ffmpeg -encoders`.
 */
export function parseFfmpegEncodersForAvif(encodersOutput: string): string | undefined {
  return AVIF_VIDEO_ENCODERS.find((enc) => encodersOutput.includes(enc));
}

/**
 * Preflight: comprueba si un binario FFmpeg trae codificador AVIF antes de
 * procesar, para avisar con un mensaje honesto en lugar de un fallo genérico.
 */
export async function checkFfmpegAvifEncoder(ffmpegBin = 'ffmpeg'): Promise<{
  supported: boolean;
  encoder?: string;
  detail: string;
}> {
  let output: string;
  try {
    const res = await execFileAsync(ffmpegBin, ['-hide_banner', '-encoders'], {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    output = `${res.stdout}\n${res.stderr}`;
  } catch (err) {
    return {
      supported: false,
      detail: `No se pudo inspeccionar el binario FFmpeg ("${ffmpegBin}"): ${err instanceof Error ? summarizeToolError(err.message) : 'no disponible'}.`,
    };
  }
  const found = parseFfmpegEncodersForAvif(output);
  if (found) {
    return {
      supported: true,
      encoder: found,
      detail: `El binario FFmpeg incluye el codificador AVIF (${found}).`,
    };
  }
  return {
    supported: false,
    detail:
      'Esta instalación de FFmpeg no incluye codificador AVIF (ni libaom-av1, ni libsvtav1, ni librav1e). Elige WebP o PNG.',
  };
}

/**
 * Traduce un fallo de FFmpeg en vídeo a un error honesto (códec vs archivo dañado).
 */
function toHonestVideoError(err: unknown, originalName: string): Error {
  const raw = err instanceof Error ? err.message : '';
  if (/does not contain any stream|matches no streams|Output file is empty/i.test(raw)) {
    return new Error(
      `El archivo "${originalName}" no contiene pistas de vídeo o audio legibles: puede estar dañado o usar un códec no compatible.`
    );
  }
  if (/Unknown (decoder|encoder)|Decoder .* not found|could not find codec|not implemented/i.test(raw)) {
    return new Error(
      `El códec del archivo "${originalName}" no es compatible con este FFmpeg. Prueba con otro archivo o convierte a MP4 (H.264).`
    );
  }
  if (/Invalid data found|moov atom not found|corrupt|truncat/i.test(raw)) {
    return new Error(`El archivo "${originalName}" parece estar dañado o truncado y FFmpeg no pudo leerlo.`);
  }
  return err instanceof Error ? err : new Error(`FFmpeg no pudo procesar el vídeo "${originalName}".`);
}

/**
 * Limpia directorios temporales y registros de tareas que superen el tiempo de retención.
 */
export async function cleanupExpiredTasks(): Promise<number> {
  const now = Date.now();
  let removed = 0;
  for (const [taskId, task] of taskRegistry.entries()) {
    if (now - task.createdAt > CLEANUP_AGE_MS) {
      try {
        await fs.rm(task.workDir, { recursive: true, force: true });
      } catch {
        // Ignorar si ya fue eliminado
      }
      taskRegistry.delete(taskId);
      removed++;
    }
  }
  return removed;
}

/**
 * Ejecuta un comando externo de forma segura usando execFile (sin shell interpolation)
 * y con límite estricto de tiempo (timeout).
 */
async function runSafeCommand(bin: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  // En Windows, Ghostscript se instala como gswin64c.exe (sin alias `gs`):
  // se resuelve aquí para que el servidor funcione en ambas plataformas.
  const resolvedBin = bin === 'gs' && process.platform === 'win32' ? 'gswin64c' : bin;
  return execFileAsync(resolvedBin, args, {
    cwd,
    timeout: TASK_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
}

/**
 * Crea y encola una tarea de procesamiento en el servidor en un directorio aislado.
 */
export async function createAndRunServerTask(options: {
  toolSlug: string;
  fileBuffer: Buffer;
  originalName: string;
  targetFormat: string;
  params: Record<string, string | number | boolean>;
}): Promise<ServerTaskState> {
  await cleanupExpiredTasks();

  const taskId = crypto.randomUUID();
  const workDir = path.join(TEMP_ROOT, taskId);
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });

  const safeOriginal = sanitizeFilename(options.originalName);
  const ext = safeOriginal.split('.').pop()?.toLowerCase() || '';

  // Validar bytes mágicos antes de procesar
  const magicCheck = verifyMagicBytes(new Uint8Array(options.fileBuffer), ext || '*');
  if (!magicCheck.valid) {
    await fs.rm(workDir, { recursive: true, force: true });
    throw new Error(magicCheck.reason || 'El archivo no superó la verificación de formato binario.');
  }

  const inputFileName = `input-${crypto.randomBytes(6).toString('hex')}.${ext || 'bin'}`;
  const inputFilePath = path.join(workDir, inputFileName);
  await fs.writeFile(inputFilePath, options.fileBuffer);

  const taskState: ServerTaskState = {
    taskId,
    toolSlug: options.toolSlug,
    status: 'processing',
    progress: 10,
    originalName: safeOriginal,
    originalSize: options.fileBuffer.byteLength,
    createdAt: Date.now(),
    workDir,
  };

  taskRegistry.set(taskId, taskState);

  // Ejecutar con control de concurrencia
  await acquireTaskSlot();
  try {
    await executeServerTool(taskState, inputFilePath, options.targetFormat, options.params);
  } catch (err) {
    taskState.status = 'failed';
    taskState.progress = 0;
    const rawMsg = err instanceof Error ? err.message : 'Error durante el procesamiento del archivo.';
    // No revelar rutas internas ni volcados de herramientas al cliente
    taskState.error = summarizeToolError(rawMsg);
  } finally {
    releaseTaskSlot();
    // Eliminar el archivo de entrada una vez finalizado el procesamiento para ahorrar espacio
    try {
      await fs.rm(inputFilePath, { force: true });
    } catch {
      // ignore
    }
  }

  return taskState;
}

async function executeServerTool(
  task: ServerTaskState,
  inputPath: string,
  targetFormat: string,
  params: Record<string, string | number | boolean>
): Promise<void> {
  task.progress = 30;
  const slug = task.toolSlug;

  // 1. IMÁGENES EN SERVIDOR (Sharp: AVIF, WebP, PNG, JPEG, Redimensionado)
  if (['convertir-imagen', 'comprimir-imagen', 'redimensionar-imagen'].includes(slug)) {
    const origExt = task.originalName.split('.').pop()?.toLowerCase() || 'webp';
    const resolvedFmt =
      targetFormat === 'keep'
        ? origExt === 'jpeg'
          ? 'jpg'
          : ['png', 'jpg', 'webp', 'avif'].includes(origExt)
            ? origExt
            : 'webp'
        : targetFormat.toLowerCase();

    const quality = Math.min(100, Math.max(10, Number(params.quality ?? 80)));
    let pipeline = sharp(inputPath, { failOn: 'none' }).rotate();

    const width = Number(params.width || params.maxWidth || 0);
    const height = Number(params.height || 0);
    const fit = String(params.fit || 'inside') as 'inside' | 'cover' | 'fill';

    if (width > 0 || height > 0) {
      pipeline = pipeline.resize({
        width: width > 0 ? width : undefined,
        height: height > 0 ? height : undefined,
        fit,
        withoutEnlargement: slug === 'comprimir-imagen',
      });
    }

    if (resolvedFmt === 'avif') {
      pipeline = pipeline.avif({ quality });
    } else if (resolvedFmt === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else if (resolvedFmt === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, palette: quality < 90 });
    } else {
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
    }

    const outName = buildOutputFilename(task.originalName, resolvedFmt);
    const outPath = path.join(task.workDir, `output-${crypto.randomBytes(4).toString('hex')}.${resolvedFmt}`);
    let info;
    try {
      info = await pipeline.toFile(outPath);
    } catch (err) {
      const cause = err instanceof Error ? summarizeToolError(err.message) : 'error desconocido del motor';
      throw new Error(
        `No se pudo generar la imagen de salida en formato ${resolvedFmt.toUpperCase()} desde "${task.originalName}": ${cause}`
      );
    }

    await finalizeTaskOutput(task, outPath, outName, `image/${resolvedFmt === 'jpg' ? 'jpeg' : resolvedFmt}`, `${info.width}×${info.height} px`);
    return;
  }

  // 2. COMPRIMIR PDF (Ghostscript)
  if (slug === 'comprimir-pdf') {
    const allowedPresets = ['screen', 'ebook', 'printer'];
    const preset = allowedPresets.includes(String(params.preset)) ? String(params.preset) : 'ebook';
    const outPath = path.join(task.workDir, `compressed-${crypto.randomBytes(4).toString('hex')}.pdf`);

    task.progress = 55;
    await runSafeCommand(
      'gs',
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=/${preset}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dSAFER',
        `-sOutputFile=${outPath}`,
        inputPath,
      ],
      task.workDir
    );

    // Si Ghostscript generó un archivo mayor que el original (ocurre en PDFs diminutos de solo texto),
    // se conserva el original en lugar de entregar un resultado más pesado.
    const stat = await fs.stat(outPath);
    if (stat.size === 0) {
      throw new Error('El motor PDF no pudo generar el documento comprimido.');
    }

    if (stat.size >= task.originalSize) {
      const keepPath = path.join(task.workDir, `original-${crypto.randomBytes(4).toString('hex')}.pdf`);
      await fs.copyFile(inputPath, keepPath);
      await finalizeTaskOutput(
        task,
        keepPath,
        buildOutputFilename(task.originalName, 'pdf', 'optimizado'),
        'application/pdf',
        'El PDF ya estaba optimizado: se conserva el original sin perder calidad'
      );
      return;
    }

    const outName = buildOutputFilename(task.originalName, 'pdf', 'comprimido');
    await finalizeTaskOutput(task, outPath, outName, 'application/pdf', `Perfil Ghostscript /${preset}`);
    return;
  }

  // 3. PDF A IMÁGENES (Ghostscript -> PNG/JPEG)
  if (slug === 'pdf-a-imagenes') {
    const fmt = targetFormat === 'jpg' ? 'jpg' : 'png';
    const device = fmt === 'jpg' ? 'jpeg' : 'png16m';
    const allowedDpi = ['96', '150', '300'];
    const dpi = allowedDpi.includes(String(params.dpi)) ? String(params.dpi) : '150';

    const pagePattern = path.join(task.workDir, `pagina-%03d.${fmt}`);
    task.progress = 50;

    await runSafeCommand(
      'gs',
      [
        `-sDEVICE=${device}`,
        `-r${dpi}`,
        '-dFirstPage=1',
        '-dLastPage=30',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dSAFER',
        `-sOutputFile=${pagePattern}`,
        inputPath,
      ],
      task.workDir
    );

    const filesInDir = await fs.readdir(task.workDir);
    const renderedPages = filesInDir
      .filter((f) => f.startsWith('pagina-') && f.endsWith(`.${fmt}`))
      .sort();

    if (renderedPages.length === 0) {
      throw new Error('No se pudieron renderizar páginas desde el archivo PDF.');
    }

    if (renderedPages.length === 1) {
      const singlePath = path.join(task.workDir, renderedPages[0]);
      const outName = buildOutputFilename(task.originalName, fmt, 'p1');
      await finalizeTaskOutput(
        task,
        singlePath,
        outName,
        fmt === 'jpg' ? 'image/jpeg' : 'image/png',
        `1 página renderizada a ${dpi} DPI`
      );
      return;
    }

    const zip = new JSZip();
    for (const pageFile of renderedPages) {
      const data = await fs.readFile(path.join(task.workDir, pageFile));
      zip.file(pageFile, data);
    }

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const zipPath = path.join(task.workDir, `paginas-${crypto.randomBytes(4).toString('hex')}.zip`);
    await fs.writeFile(zipPath, zipBuf);

    const outName = buildOutputFilename(task.originalName, 'zip', 'imagenes');
    await finalizeTaskOutput(
      task,
      zipPath,
      outName,
      'application/zip',
      `${renderedPages.length} páginas exportadas a ${fmt.toUpperCase()} (${dpi} DPI)`
    );
    return;
  }

  // 4. CONVERTIR DOCUMENTO (DOCX / TXT / MD / RTF -> PDF / HTML / TXT)
  if (slug === 'convertir-documento') {
    const origExt = task.originalName.split('.').pop()?.toLowerCase() || 'txt';
    const outFmt = ['pdf', 'html', 'txt'].includes(targetFormat.toLowerCase())
      ? targetFormat.toLowerCase()
      : 'pdf';

    let plainText = '';
    let htmlBody = '';

    if (origExt === 'docx') {
      const rawTextResult = await mammoth.extractRawText({ path: inputPath });
      const htmlResult = await mammoth.convertToHtml({ path: inputPath });
      plainText = rawTextResult.value || '';
      htmlBody = htmlResult.value || '';
    } else {
      const rawContent = await fs.readFile(inputPath, 'utf-8');
      if (origExt === 'rtf') {
        plainText = rawContent
          .replace(/\\par[d]?/g, '\n')
          .replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
          .trim();
      } else {
        plainText = rawContent;
      }
      htmlBody = plainText
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`)
        .join('\n');
    }

    const outPath = path.join(task.workDir, `doc-${crypto.randomBytes(4).toString('hex')}.${outFmt}`);
    const outName = buildOutputFilename(task.originalName, outFmt);

    if (outFmt === 'txt') {
      await fs.writeFile(outPath, plainText, 'utf-8');
      await finalizeTaskOutput(task, outPath, outName, 'text/plain;charset=utf-8', 'Texto plano extraído');
      return;
    }

    if (outFmt === 'html') {
      const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${task.originalName}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.65; max-width: 48rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #18181b; }
  h1, h2, h3 { color: #09090b; line-height: 1.25; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #e4e4e7; padding: 0.5rem; text-align: left; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
      await fs.writeFile(outPath, fullHtml, 'utf-8');
      await finalizeTaskOutput(task, outPath, outName, 'text/html;charset=utf-8', 'Documento HTML5 semántico');
      return;
    }

    // Generar PDF multipágina limpio con pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const lineHeight = 16;
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const maxLineWidth = pageWidth - margin * 2;

    // Limpiar caracteres fuera de WinAnsi para StandardFonts
    const safeText = plainText.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, ' ');
    const paragraphs = safeText.split(/\r?\n/);

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    for (const para of paragraphs) {
      if (!para.trim()) {
        cursorY -= lineHeight * 0.75;
        if (cursorY < margin) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }
        continue;
      }

      const words = para.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width > maxLineWidth && currentLine) {
          currentPage.drawText(currentLine, {
            x: margin,
            y: cursorY,
            size: fontSize,
            font,
            color: rgb(0.08, 0.08, 0.09),
          });
          cursorY -= lineHeight;
          currentLine = word;
          if (cursorY < margin) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            cursorY = pageHeight - margin;
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        currentPage.drawText(currentLine, {
          x: margin,
          y: cursorY,
          size: fontSize,
          font,
          color: rgb(0.08, 0.08, 0.09),
        });
        cursorY -= lineHeight;
        if (cursorY < margin) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
    await finalizeTaskOutput(
      task,
      outPath,
      outName,
      'application/pdf',
      `PDF generado (${pdfDoc.getPageCount()} ${pdfDoc.getPageCount() === 1 ? 'página' : 'páginas'})`
    );
    return;
  }

  // 5. AUDIO Y EXTRACCIÓN DE AUDIO (FFmpeg)
  if (slug === 'convertir-audio' || slug === 'extraer-audio-video') {
    const allowedFormats: Record<string, { codec: string[]; mime: string }> = {
      mp3: { codec: ['-c:a', 'libmp3lame'], mime: 'audio/mpeg' },
      wav: { codec: ['-c:a', 'pcm_s16le'], mime: 'audio/wav' },
      aac: { codec: ['-c:a', 'aac'], mime: 'audio/aac' },
      flac: { codec: ['-c:a', 'flac'], mime: 'audio/flac' },
      ogg: { codec: ['-c:a', 'libvorbis'], mime: 'audio/ogg' },
    };

    const fmt = allowedFormats[targetFormat.toLowerCase()] ? targetFormat.toLowerCase() : 'mp3';
    const spec = allowedFormats[fmt];
    const allowedBitrates = ['64k', '128k', '192k', '320k'];
    const bitrate = allowedBitrates.includes(String(params.bitrate)) ? String(params.bitrate) : '192k';

    const outPath = path.join(task.workDir, `audio-${crypto.randomBytes(4).toString('hex')}.${fmt}`);
    const args = ['-y', '-i', inputPath, '-vn', ...spec.codec];

    if (['mp3', 'aac', 'ogg'].includes(fmt)) {
      args.push('-b:a', bitrate);
    }
    args.push(outPath);

    task.progress = 60;
    try {
      await runSafeCommand('ffmpeg', args, task.workDir);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      if (/does not contain any stream|matches no streams|Output file does not contain any stream/i.test(raw)) {
        throw new Error('El archivo no contiene una pista de audio que se pueda extraer.');
      }
      throw err;
    }

    const outName = buildOutputFilename(task.originalName, fmt);
    await finalizeTaskOutput(
      task,
      outPath,
      outName,
      spec.mime,
      `Audio ${fmt.toUpperCase()} (${['wav', 'flac'].includes(fmt) ? 'Sin pérdida PCM/FLAC' : bitrate})`
    );
    return;
  }

  // 6. VÍDEO: CONVERSIÓN Y COMPRESIÓN (FFmpeg)
  if (slug === 'convertir-video' || slug === 'comprimir-video') {
    const fmt = ['mp4', 'webm', 'mkv'].includes(targetFormat.toLowerCase())
      ? targetFormat.toLowerCase()
      : 'mp4';

    const allowedCrf = ['24', '28', '33'];
    const crf = allowedCrf.includes(String(params.crf)) ? String(params.crf) : '28';
    const allowedRes = ['original', '1920', '1280', '854'];
    const res = allowedRes.includes(String(params.resolution)) ? String(params.resolution) : 'original';

    const outPath = path.join(task.workDir, `video-${crypto.randomBytes(4).toString('hex')}.${fmt}`);
    const args = ['-y', '-i', inputPath];

    if (res !== 'original') {
      args.push('-vf', `scale='min(${res},iw)':-2`);
    }

    if (fmt === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '4', '-c:a', 'libvorbis');
    } else {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        crf,
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k'
      );
    }

    args.push(outPath);
    task.progress = 55;
    try {
      await runSafeCommand('ffmpeg', args, task.workDir);
    } catch (err) {
      throw toHonestVideoError(err, task.originalName);
    }

    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
    };

    const outName = buildOutputFilename(task.originalName, fmt, slug === 'comprimir-video' ? 'comprimido' : undefined);
    await finalizeTaskOutput(
      task,
      outPath,
      outName,
      mimeMap[fmt] || 'video/mp4',
      `Vídeo ${fmt.toUpperCase()} (CRF ${crf}${res !== 'original' ? `, ${res}p` : ''})`
    );
    return;
  }

  throw new Error(`La herramienta "${slug}" no tiene un motor asignado en el servidor.`);
}

/**
 * Verifica que el archivo de salida exista realmente en disco y tenga tamaño > 0
 * antes de marcar la tarea como completada (regla estricta de integridad).
 */
async function finalizeTaskOutput(
  task: ServerTaskState,
  outputPath: string,
  outputFilename: string,
  mimeType: string,
  details: string
): Promise<void> {
  if (!existsSync(outputPath)) {
    throw new Error('El motor finalizó pero no generó el archivo de salida esperado.');
  }
  const stat = await fs.stat(outputPath);
  if (stat.size <= 0) {
    throw new Error('El archivo generado está vacío (0 bytes). Operación cancelada.');
  }

  task.outputFilePath = outputPath;
  task.outputFilename = outputFilename;
  task.outputSize = stat.size;
  task.outputMimeType = mimeType;
  task.details = details;
  task.progress = 100;
  task.status = 'completed';
}
