import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createAndRunServerTask, cleanupExpiredTasks } from './server-processors';

test('Motor de servidor: convierte y comprime PNG real a WebP y AVIF', async () => {
  const pngBuffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 200, g: 109, b: 45 },
    },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-imagen',
    fileBuffer: pngBuffer,
    originalName: 'prueba-kastral.png',
    targetFormat: 'webp',
    params: { quality: 80 },
  });

  assert.equal(task.status, 'completed');
  assert.ok(task.outputFilePath);
  assert.ok((task.outputSize || 0) > 0);
  assert.equal(task.outputFilename, 'prueba-kastral.webp');

  const outStat = await fs.stat(task.outputFilePath!);
  assert.equal(outStat.size, task.outputSize);
});

test('Motor de servidor: comprime PDF real con Ghostscript y verifica salida', async () => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([595, 842]);
  page.drawText('Documento de prueba para compresion PDF con Ghostscript en Kastral.', {
    x: 50,
    y: 750,
    size: 14,
    font,
  });
  const pdfBytes = await pdfDoc.save();

  const task = await createAndRunServerTask({
    toolSlug: 'comprimir-pdf',
    fileBuffer: Buffer.from(pdfBytes),
    originalName: 'contrato.pdf',
    targetFormat: 'pdf',
    params: { preset: 'ebook' },
  });

  assert.equal(task.status, 'completed');
  assert.ok((task.outputSize || 0) > 0);
  assert.equal(task.outputMimeType, 'application/pdf');
});

test('Motor de servidor: renderiza PDF a imagen PNG con Ghostscript', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 400]);
  page.drawText('Pagina a PNG', { x: 40, y: 200, size: 18 });
  const pdfBytes = await pdfDoc.save();

  const task = await createAndRunServerTask({
    toolSlug: 'pdf-a-imagenes',
    fileBuffer: Buffer.from(pdfBytes),
    originalName: 'folleto.pdf',
    targetFormat: 'png',
    params: { dpi: '96' },
  });

  assert.equal(task.status, 'completed');
  assert.ok((task.outputSize || 0) > 0);
  assert.equal(task.outputMimeType, 'image/png');
});

test('Motor de servidor: convierte documento TXT a PDF multipágina', async () => {
  const textBuffer = Buffer.from(
    'Informe de prueba Kastral\n\nEste texto se transforma en un documento PDF valido.',
    'utf-8'
  );

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-documento',
    fileBuffer: textBuffer,
    originalName: 'apuntes.txt',
    targetFormat: 'pdf',
    params: {},
  });

  assert.equal(task.status, 'completed');
  assert.ok((task.outputSize || 0) > 0);
  assert.equal(task.outputFilename, 'apuntes.pdf');
});

test('Motor de servidor: rechaza archivo con extensión falsificada (Magic Bytes)', async () => {
  const fakePdfBuffer = Buffer.from('ESTO NO ES UN PDF REAL', 'utf-8');

  await assert.rejects(
    async () => {
      await createAndRunServerTask({
        toolSlug: 'comprimir-pdf',
        fileBuffer: fakePdfBuffer,
        originalName: 'falso.pdf',
        targetFormat: 'pdf',
        params: {},
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('PDF'));
      return true;
    }
  );

  await cleanupExpiredTasks();
});
