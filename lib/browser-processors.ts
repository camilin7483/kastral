import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  sanitizeFilename,
  isSafeArchiveEntryPath,
  parsePdfPageRanges,
  buildOutputFilename,
} from './file-utils';

export interface ExtractedArchiveItem {
  name: string;
  size: number;
  blob: Blob;
}

export interface BrowserProcessResult {
  outputBlob: Blob;
  outputFilename: string;
  outputSize: number;
  mimeType: string;
  extractedItems?: ExtractedArchiveItem[];
  details?: string;
}

/**
 * Convierte, comprime o redimensiona una imagen en el navegador usando HTML5 Canvas.
 */
export async function processImageInBrowser(
  file: File,
  targetFormat: string,
  params: Record<string, string | number | boolean>,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(15);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const resolvedFormat =
    targetFormat === 'keep'
      ? ext === 'jpeg'
        ? 'jpg'
        : ['png', 'jpg', 'webp', 'avif'].includes(ext)
          ? ext
          : 'webp'
      : targetFormat.toLowerCase();

  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
  };

  const outMime = mimeMap[resolvedFormat] || 'image/webp';
  const qualityNum = Number(params.quality ?? 85);
  const quality = Math.min(1, Math.max(0.1, qualityNum / 100));

  const bitmap = await createImageBitmap(file);
  onProgress?.(40);

  let targetW = bitmap.width;
  let targetH = bitmap.height;

  const requestedWidth = Number(params.width || params.maxWidth || 0);
  const requestedHeight = Number(params.height || 0);
  const fit = String(params.fit || 'inside');

  if (requestedWidth > 0 && requestedHeight > 0) {
    if (fit === 'fill') {
      targetW = requestedWidth;
      targetH = requestedHeight;
    } else {
      const ratio = Math.min(requestedWidth / bitmap.width, requestedHeight / bitmap.height);
      targetW = Math.max(1, Math.round(bitmap.width * ratio));
      targetH = Math.max(1, Math.round(bitmap.height * ratio));
    }
  } else if (requestedWidth > 0) {
    if (params.maxWidth && bitmap.width <= requestedWidth) {
      targetW = bitmap.width;
      targetH = bitmap.height;
    } else {
      const ratio = requestedWidth / bitmap.width;
      targetW = requestedWidth;
      targetH = Math.max(1, Math.round(bitmap.height * ratio));
    }
  } else if (requestedHeight > 0) {
    const ratio = requestedHeight / bitmap.height;
    targetH = requestedHeight;
    targetW = Math.max(1, Math.round(bitmap.width * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('No se pudo inicializar el motor gráfico 2D del navegador.');
  }

  if (outMime === 'image/jpeg' || outMime === 'image/bmp') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();
  onProgress?.(75);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b && b.size > 0) {
          resolve(b);
        } else {
          // Si el navegador no soporta codificación AVIF nativa en canvas, hacer fallback a WebP
          canvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob && fallbackBlob.size > 0) resolve(fallbackBlob);
              else reject(new Error('El navegador no pudo codificar la imagen de salida.'));
            },
            'image/webp',
            quality
          );
        }
      },
      outMime,
      quality
    );
  });

  onProgress?.(100);
  const actualExt = blob.type === 'image/webp' && resolvedFormat === 'avif' ? 'webp' : resolvedFormat;
  const outName = buildOutputFilename(file.name, actualExt);

  return {
    outputBlob: blob,
    outputFilename: outName,
    outputSize: blob.size,
    mimeType: blob.type || outMime,
    details: `${targetW}×${targetH} px (Local)`,
  };
}

/**
 * Convierte documentos DOCX, TXT, MD y RTF a PDF, HTML o TXT 100 % en el navegador (Offline).
 */
export async function convertDocumentInBrowser(
  file: File,
  targetFormat: string,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(15);
  const origExt = file.name.split('.').pop()?.toLowerCase() || 'txt';
  const outFmt = ['pdf', 'html', 'txt'].includes(targetFormat.toLowerCase())
    ? targetFormat.toLowerCase()
    : 'pdf';

  let plainText = '';
  let htmlBody = '';

  if (origExt === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const rawRes = await mammoth.extractRawText({ arrayBuffer });
    const htmlRes = await mammoth.convertToHtml({ arrayBuffer });
    plainText = rawRes.value || '';
    htmlBody = htmlRes.value || '';
  } else {
    const rawContent = await file.text();
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
      .map(
        (p) =>
          `<p>${p
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>')}</p>`
      )
      .join('\n');
  }

  onProgress?.(60);
  const outName = buildOutputFilename(file.name, outFmt);

  if (outFmt === 'txt') {
    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
    onProgress?.(100);
    return {
      outputBlob: blob,
      outputFilename: outName,
      outputSize: blob.size,
      mimeType: 'text/plain',
      details: 'Texto plano extraído localmente',
    };
  }

  if (outFmt === 'html') {
    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${sanitizeFilename(file.name)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.65; max-width: 48rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #141413; }
  h1, h2, h3 { color: #141413; line-height: 1.25; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #d4d4d8; padding: 0.5rem; text-align: left; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    onProgress?.(100);
    return {
      outputBlob: blob,
      outputFilename: outName,
      outputSize: blob.size,
      mimeType: 'text/html',
      details: 'HTML5 semántico generado en navegador',
    };
  }

  // Generar PDF multipágina en el navegador
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = 16;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const maxLineWidth = pageWidth - margin * 2;

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
  onProgress?.(100);
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  return {
    outputBlob: blob,
    outputFilename: outName,
    outputSize: blob.size,
    mimeType: 'application/pdf',
    details: `PDF maquetado localmente (${pdfDoc.getPageCount()} pág.)`,
  };
}

/**
 * Combina múltiples archivos PDF en un único documento en el navegador.
 */
export async function mergePdfsInBrowser(
  files: File[],
  params: Record<string, string | number | boolean> = {},
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  if (files.length < 2) {
    throw new Error('Selecciona al menos 2 archivos PDF para combinarlos.');
  }

  const mergedPdf = await PDFDocument.create();
  let totalPages = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
    } catch {
      throw new Error(`El archivo "${file.name}" está cifrado con contraseña o dañado.`);
    }

    const indices = srcDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
      totalPages++;
    }
    onProgress?.(Math.round(((i + 1) / files.length) * 85));
  }

  const pdfBytes = await mergedPdf.save();
  onProgress?.(100);

  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const rawBaseName = String(params.outputFilename || 'documento-combinado');
  const outputFilename = `${sanitizeFilename(rawBaseName).replace(/\.pdf$/i, '')}.pdf`;

  return {
    outputBlob: blob,
    outputFilename,
    outputSize: blob.size,
    mimeType: 'application/pdf',
    details: `${files.length} documentos unidos · ${totalPages} páginas totales`,
  };
}

/**
 * Divide un PDF en documentos individuales de 1 página empaquetados en un archivo ZIP.
 */
export async function splitPdfInBrowser(
  file: File,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(10);
  const arrayBuffer = await file.arrayBuffer();
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(arrayBuffer);
  } catch {
    throw new Error(`No se pudo abrir "${file.name}". Verifica que sea un PDF válido sin contraseña.`);
  }

  const totalPages = srcDoc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento PDF no contiene páginas.');
  }

  const zip = new JSZip();
  const extractedItems: ExtractedArchiveItem[] = [];
  const baseName = sanitizeFilename(file.name).replace(/\.pdf$/i, '');

  for (let i = 0; i < totalPages; i++) {
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
    singleDoc.addPage(copiedPage);
    const bytes = await singleDoc.save();
    const pageNum = String(i + 1).padStart(3, '0');
    const pageName = `${baseName}-pagina-${pageNum}.pdf`;

    zip.file(pageName, bytes);
    extractedItems.push({
      name: pageName,
      size: bytes.byteLength,
      blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    });

    onProgress?.(10 + Math.round(((i + 1) / totalPages) * 75));
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  onProgress?.(100);

  return {
    outputBlob: zipBlob,
    outputFilename: `${baseName}-paginas.zip`,
    outputSize: zipBlob.size,
    mimeType: 'application/zip',
    extractedItems,
    details: `${totalPages} páginas separadas en ZIP`,
  };
}

/**
 * Extrae páginas específicas de un PDF según el rango indicado.
 */
export async function extractPdfPagesInBrowser(
  file: File,
  params: Record<string, string | number | boolean> | string = { pageRanges: '1' },
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(15);
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = srcDoc.getPageCount();

  const rangeStr =
    typeof params === 'string' ? params : String(params.pageRanges || '1');
  const parsed = parsePdfPageRanges(rangeStr, totalPages);
  if (parsed.error || parsed.pages.length === 0) {
    throw new Error(parsed.error || 'No se seleccionaron páginas válidas.');
  }

  onProgress?.(45);
  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(srcDoc, parsed.pages);
  for (const page of copiedPages) {
    outDoc.addPage(page);
  }

  const outBytes = await outDoc.save();
  onProgress?.(100);

  const blob = new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
  const outName = buildOutputFilename(file.name, 'pdf', 'extraido');

  return {
    outputBlob: blob,
    outputFilename: outName,
    outputSize: blob.size,
    mimeType: 'application/pdf',
    details: `${parsed.pages.length} de ${totalPages} páginas extraídas`,
  };
}

/**
 * Convierte una o varias imágenes (JPG, PNG, WebP) en un documento PDF multipágina.
 */
export async function imagesToPdfInBrowser(
  files: File[],
  params: Record<string, string | number | boolean>,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  const pdfDoc = await PDFDocument.create();
  const pageSizeMode = String(params.pageSize || 'a4');
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const MARGIN = 28;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let imgBytes: Uint8Array;
    let isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

    if (file.type === 'image/jpeg' || file.name.toLowerCase().match(/\.(jpg|jpeg)$/)) {
      imgBytes = new Uint8Array(await file.arrayBuffer());
      isPng = false;
    } else if (isPng) {
      imgBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const conv = await processImageInBrowser(file, 'jpg', { quality: 92 });
      imgBytes = new Uint8Array(await conv.outputBlob.arrayBuffer());
      isPng = false;
    }

    const embeddedImg = isPng
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);

    if (pageSizeMode === 'fit') {
      const page = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: embeddedImg.width,
        height: embeddedImg.height,
      });
    } else {
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const maxW = A4_WIDTH - MARGIN * 2;
      const maxH = A4_HEIGHT - MARGIN * 2;
      const scale = Math.min(maxW / embeddedImg.width, maxH / embeddedImg.height, 1);
      const drawW = embeddedImg.width * scale;
      const drawH = embeddedImg.height * scale;
      const x = (A4_WIDTH - drawW) / 2;
      const y = (A4_HEIGHT - drawH) / 2;

      page.drawImage(embeddedImg, {
        x,
        y,
        width: drawW,
        height: drawH,
      });
    }

    onProgress?.(Math.round(((i + 1) / files.length) * 90));
  }

  const pdfBytes = await pdfDoc.save();
  onProgress?.(100);

  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const baseName = files.length === 1 ? buildOutputFilename(files[0].name, 'pdf') : 'imagenes-combinadas.pdf';

  return {
    outputBlob: blob,
    outputFilename: baseName,
    outputSize: blob.size,
    mimeType: 'application/pdf',
    details: `${files.length} ${files.length === 1 ? 'imagen maquetada' : 'imágenes maquetadas'} en PDF`,
  };
}

/**
 * Crea un archivo ZIP a partir de múltiples archivos seleccionados en el navegador.
 */
export async function createZipInBrowser(
  files: File[],
  params: Record<string, string | number | boolean>,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    let entryName = sanitizeFilename(file.name);

    if (relPath && isSafeArchiveEntryPath(relPath)) {
      entryName = relPath
        .split('/')
        .map((seg) => sanitizeFilename(seg))
        .join('/');
    }

    if (usedNames.has(entryName)) {
      const dot = entryName.lastIndexOf('.');
      entryName =
        dot > 0
          ? `${entryName.slice(0, dot)}-${i + 1}${entryName.slice(dot)}`
          : `${entryName}-${i + 1}`;
    }
    usedNames.add(entryName);

    const buf = await file.arrayBuffer();
    zip.file(entryName, buf);
  }

  const level = Math.min(9, Math.max(1, Number(params.compressionLevel || 6)));
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level },
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );

  const rawZipName = String(params.zipFilename || 'archivos-kastral');
  const outName = `${sanitizeFilename(rawZipName).replace(/\.zip$/i, '')}.zip`;

  return {
    outputBlob: zipBlob,
    outputFilename: outName,
    outputSize: zipBlob.size,
    mimeType: 'application/zip',
    details: `${files.length} ${files.length === 1 ? 'archivo comprimido' : 'archivos comprimidos'} (DEFLATE Nivel ${level})`,
  };
}

/**
 * Extrae y verifica las entradas de un archivo ZIP en el navegador previniendo Zip Slip.
 */
export async function extractZipInBrowser(
  file: File,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(20);
  const buf = await file.arrayBuffer();
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('El archivo ZIP está dañado o tiene un formato no soportado.');
  }

  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (entries.length === 0) {
    throw new Error('El archivo ZIP no contiene archivos extraíbles.');
  }

  const extractedItems: ExtractedArchiveItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isSafeArchiveEntryPath(entry.name)) {
      throw new Error(`Se bloqueó una ruta insegura dentro del archivo ZIP: "${entry.name}".`);
    }

    const itemBlob = await entry.async('blob');
    const cleanName = entry.name
      .split('/')
      .map((s) => sanitizeFilename(s))
      .join('/');

    extractedItems.push({
      name: cleanName,
      size: itemBlob.size,
      blob: itemBlob,
    });
    onProgress?.(20 + Math.round(((i + 1) / entries.length) * 80));
  }

  const primaryItem = extractedItems[0];

  return {
    outputBlob: primaryItem.blob,
    outputFilename: primaryItem.name.split('/').pop() || 'extraido',
    outputSize: extractedItems.reduce((acc, item) => acc + item.size, 0),
    mimeType: primaryItem.blob.type || 'application/octet-stream',
    extractedItems,
    details: `${extractedItems.length} ${extractedItems.length === 1 ? 'archivo extraído' : 'archivos extraídos'}`,
  };
}

/**
 * Convierte hojas de cálculo (XLSX, XLS, CSV, ODS) a CSV, XLSX, JSON o HTML en el navegador.
 */
export async function convertSpreadsheetInBrowser(
  file: File,
  targetFormat: string,
  params: Record<string, string | number | boolean>,
  onProgress?: (percent: number) => void
): Promise<BrowserProcessResult> {
  onProgress?.(25);
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo de hoja de cálculo no contiene ninguna pestaña válida.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  onProgress?.(65);

  const fmt = targetFormat.toLowerCase();
  const outName = buildOutputFilename(file.name, fmt);

  if (fmt === 'csv') {
    const delimiter = String(params.delimiter || ',');
    const csvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: delimiter });
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' });
    onProgress?.(100);
    return {
      outputBlob: blob,
      outputFilename: outName,
      outputSize: blob.size,
      mimeType: 'text/csv',
      details: `Hoja "${firstSheetName}" exportada a CSV`,
    };
  }

  if (fmt === 'json') {
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    const jsonString = JSON.stringify(rows, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    onProgress?.(100);
    return {
      outputBlob: blob,
      outputFilename: outName,
      outputSize: blob.size,
      mimeType: 'application/json',
      details: `${rows.length} filas exportadas a JSON`,
    };
  }

  if (fmt === 'html') {
    const htmlTable = XLSX.utils.sheet_to_html(worksheet);
    const blob = new Blob([htmlTable], { type: 'text/html;charset=utf-8' });
    onProgress?.(100);
    return {
      outputBlob: blob,
      outputFilename: outName,
      outputSize: blob.size,
      mimeType: 'text/html',
      details: `Tabla HTML generada desde "${firstSheetName}"`,
    };
  }

  const xlsxOut = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([xlsxOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  onProgress?.(100);
  return {
    outputBlob: blob,
    outputFilename: outName,
    outputSize: blob.size,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    details: `Libro Excel XLSX generado`,
  };
}
