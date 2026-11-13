import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDownloadToast,
  describeDownloadLocation,
  extensionOf,
  pickerTypeFor,
  type DownloadRecord,
} from './download-manager';
import { formatBytes } from './file-utils';

function desktopFixture(): DownloadRecord {
  return {
    id: 'dl-test-1',
    filename: 'informe.pdf',
    size: 2048,
    mode: 'desktop',
    location: '/home/olivia/Descargas/informe.pdf',
    path: '/home/olivia/Descargas/informe.pdf',
    createdAt: 1700000000000,
  };
}

function browserFixture(): DownloadRecord {
  return {
    id: 'dl-test-2',
    filename: 'foto.webp',
    size: 512000,
    mode: 'browser',
    location: 'la carpeta de descargas de tu navegador',
    createdAt: 1700000000000,
  };
}

test('download-manager: extensionOf lowercases and handles missing extensions', () => {
  assert.equal(extensionOf('informe.PDF'), 'pdf');
  assert.equal(extensionOf('sin-extension'), '');
});

test('download-manager: pickerTypeFor maps known extensions and rejects unknown ones', () => {
  const webp = pickerTypeFor('foto.webp');
  assert.equal(webp.length, 1);
  assert.deepEqual(webp[0].accept['image/webp'], ['.webp']);
  const epub = pickerTypeFor('libro.epub');
  assert.equal(epub.length, 1);
  assert.deepEqual(epub[0].accept['application/epub+zip'], ['.epub']);
  assert.deepEqual(pickerTypeFor('raro.xyz'), []);
});

test('download-manager: describeDownloadLocation answers where the file went', () => {
  const desktop = desktopFixture();
  assert.equal(describeDownloadLocation(desktop), desktop.location);
  assert.ok(
    describeDownloadLocation({ mode: 'picker', location: 'la ubicación que elegiste' }).includes('ubicación que elegiste'),
  );
  assert.ok(
    describeDownloadLocation({ mode: 'browser', location: 'la carpeta de descargas' }).includes('carpeta de descargas'),
  );
});

test('download-manager: buildDownloadToast for desktop shows the absolute path', () => {
  const record = desktopFixture();
  const toast = buildDownloadToast(record);
  assert.equal(toast.title, 'Archivo guardado');
  assert.ok(toast.detail.includes(record.location));
  assert.ok(toast.message.includes(record.filename));
  assert.ok(toast.message.includes(formatBytes(record.size)));
});

test('download-manager: buildDownloadToast for browser points at the downloads folder', () => {
  const record = browserFixture();
  const toast = buildDownloadToast(record);
  assert.equal(toast.title, 'Descarga iniciada');
  assert.ok(toast.detail.includes('carpeta de descargas'));
  assert.ok(toast.message.includes(record.filename));
  assert.ok(toast.message.includes(formatBytes(record.size)));
});
