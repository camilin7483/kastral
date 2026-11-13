import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  calculateReductionPercentage,
  sanitizeFilename,
  isSafeArchiveEntryPath,
  parsePdfPageRanges,
  verifyMagicBytes,
  buildOutputFilename,
} from './file-utils';
import { KASTRAL_TOOLS, getToolBySlug } from './tools-catalog';

test('formatBytes formatea tamaños de archivo con precisión', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1048576 * 2.5), '2.5 MB');
});

test('calculateReductionPercentage devuelve porcentaje real solo cuando hay ahorro', () => {
  assert.equal(calculateReductionPercentage(1000, 250), 75);
  assert.equal(calculateReductionPercentage(1000, 1000), null);
  assert.equal(calculateReductionPercentage(1000, 1200), null);
  assert.equal(calculateReductionPercentage(0, 500), null);
});

test('sanitizeFilename previene path traversal y caracteres peligrosos', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
  assert.equal(sanitizeFilename('mi foto (final)!.png'), 'mi foto _final__.png');
  assert.equal(sanitizeFilename('...'), 'archivo');
});

test('sanitizeFilename conserva la extensión al truncar nombres largos', () => {
  const longName = `${'a'.repeat(140)}.pdf`;
  const safe = sanitizeFilename(longName);
  assert.equal(safe.length, 120);
  assert.ok(safe.endsWith('.pdf'));
  assert.equal(safe.replace(/\.pdf$/, '').length, 116);
  assert.equal(sanitizeFilename(`${'b'.repeat(130)}.muylarga`).length, 120);
});

test('isSafeArchiveEntryPath bloquea ataques Zip Slip', () => {
  assert.equal(isSafeArchiveEntryPath('documentos/informe.pdf'), true);
  assert.equal(isSafeArchiveEntryPath('foto.png'), true);
  assert.equal(isSafeArchiveEntryPath('../../etc/shadow'), false);
  assert.equal(isSafeArchiveEntryPath('carpeta/../../../ fuera.txt'), false);
  assert.equal(isSafeArchiveEntryPath('/ruta/absoluta.txt'), false);
  assert.equal(isSafeArchiveEntryPath('C:\\Windows\\win.ini'), false);
});

test('isSafeArchiveEntryPath acepta rutas Windows y nombres legítimos con puntos dobles', () => {
  assert.equal(isSafeArchiveEntryPath('scripts\\utilidades\\limpiar.bat'), true);
  assert.equal(isSafeArchiveEntryPath('carpeta/sub/instalar.bat'), true);
  assert.equal(isSafeArchiveEntryPath('respaldo..2024.bat'), true);
  // Traversal con segmento exacto ".." sigue bloqueado
  assert.equal(isSafeArchiveEntryPath('scripts/../../evil.sh'), false);
  assert.equal(isSafeArchiveEntryPath('a/..\\b.txt'), false);
});

test('parsePdfPageRanges valida rangos y páginas fuera de límite', () => {
  const ok = parsePdfPageRanges('1, 3-5, 8', 10);
  assert.deepEqual(ok.pages, [0, 2, 3, 4, 7]);
  assert.equal(ok.error, undefined);

  const outOfBounds = parsePdfPageRanges('1, 12', 10);
  assert.equal(outOfBounds.pages.length, 0);
  assert.ok(outOfBounds.error?.includes('fuera del rango'));

  const inverted = parsePdfPageRanges('6-3', 10);
  assert.equal(inverted.pages.length, 0);
  assert.ok(inverted.error?.includes('mayor que la final'));
});

test('verifyMagicBytes detecta cabeceras reales y rechaza archivos vacíos o falsos', () => {
  const empty = new Uint8Array(0);
  assert.equal(verifyMagicBytes(empty, 'pdf').valid, false);

  // Cabecera %PDF-1.7
  const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert.equal(verifyMagicBytes(validPdf, 'pdf').valid, true);
  assert.equal(verifyMagicBytes(validPdf, 'png').valid, false);

  // Cabecera PNG
  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(verifyMagicBytes(validPng, 'png').valid, true);
});

test('verifyMagicBytes valida cabecera RIFF/AVI y rechaza impostores', () => {
  const validAvi = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x4e, 0x9e, 0x01, 0x00, 0x41, 0x56, 0x49, 0x20,
  ]);
  const res = verifyMagicBytes(validAvi, 'avi');
  assert.equal(res.valid, true);
  assert.equal(res.detectedType, 'video/x-msvideo');

  // Un WebP (también RIFF) no debe pasar como AVI
  const webpAsAvi = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const fake = verifyMagicBytes(webpAsAvi, 'avi');
  assert.equal(fake.valid, false);
  assert.ok(fake.reason?.includes('.avi'));

  const tiny = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  assert.equal(verifyMagicBytes(tiny, 'avi').valid, false);
});

test('verifyMagicBytes cubre los formatos nuevos y rechaza con mensajes en español', () => {
  const ftyp = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
  assert.equal(verifyMagicBytes(ftyp, 'mov').valid, true);
  assert.equal(verifyMagicBytes(ftyp, 'm4v').valid, true);
  assert.equal(verifyMagicBytes(ftyp, '3gp').valid, true);
  assert.equal(verifyMagicBytes(ftyp, 'm4a').valid, true);
  assert.equal(verifyMagicBytes(ftyp, 'mp4').valid, true);

  const flv = new Uint8Array([0x46, 0x4c, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(verifyMagicBytes(flv, 'flv').valid, true);
  assert.equal(verifyMagicBytes(Buffer.from('texto plano') as unknown as Uint8Array, 'flv').valid, false);

  const asf = new Uint8Array([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xd1, 0x11]);
  assert.equal(verifyMagicBytes(asf, 'wmv').valid, true);
  assert.equal(verifyMagicBytes(asf, 'wma').valid, true);

  const mpeg = new Uint8Array([0x00, 0x00, 0x01, 0xba, 0x21, 0x00, 0x01, 0x00]);
  assert.equal(verifyMagicBytes(mpeg, 'mpg').valid, true);
  assert.equal(verifyMagicBytes(mpeg, 'mpeg').valid, true);

  const oggs = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
  assert.equal(verifyMagicBytes(oggs, 'ogv').valid, true);
  assert.equal(verifyMagicBytes(oggs, 'opus').valid, true);

  const aiff = new Uint8Array([0x46, 0x4f, 0x52, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46]);
  assert.equal(verifyMagicBytes(aiff, 'aiff').valid, true);

  const mp2 = new Uint8Array([0xff, 0xfd, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(verifyMagicBytes(mp2, 'mp2').valid, true);

  const tiffLE = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  assert.equal(verifyMagicBytes(tiffLE, 'tiff').valid, true);
  assert.equal(verifyMagicBytes(tiffLE, 'tif').valid, true);

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>');
  assert.equal(verifyMagicBytes(svg, 'svg').valid, true);

  const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  assert.equal(verifyMagicBytes(wav, 'wav').valid, true);

  const impostor = verifyMagicBytes(Buffer.from('no soy un vídeo avi real....') as unknown as Uint8Array, 'avi');
  assert.equal(impostor.valid, false);
  assert.ok(impostor.reason?.includes('.avi'));

  const fakeTiff = verifyMagicBytes(Buffer.from('finge ser tiff........') as unknown as Uint8Array, 'tiff');
  assert.equal(fakeTiff.valid, false);
  assert.ok(fakeTiff.reason);
});

test('buildOutputFilename genera nombres limpios con la extensión correcta', () => {
  assert.equal(buildOutputFilename('factura.enero.pdf', 'png', 'pag1'), 'factura.enero-pag1.png');
  assert.equal(buildOutputFilename('../retrato.jpeg', '.webp'), 'retrato.webp');
});

test('Catálogo de herramientas Kastral tiene slugs únicos y metadatos completos', () => {
  assert.ok(KASTRAL_TOOLS.length >= 12);
  const slugs = new Set<string>();
  for (const tool of KASTRAL_TOOLS) {
    assert.equal(slugs.has(tool.slug), false, `Slug duplicado: ${tool.slug}`);
    slugs.add(tool.slug);
    assert.ok(tool.metaTitle.length > 20);
    assert.ok(tool.metaDescription.length > 50);
    assert.ok(tool.steps.length >= 2);
  }
  assert.ok(getToolBySlug('comprimir-pdf'));
  assert.ok(getToolBySlug('crear-zip'));
});
