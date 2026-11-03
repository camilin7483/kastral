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
