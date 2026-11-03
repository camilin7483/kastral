import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  createAndRunServerTask,
  cleanupExpiredTasks,
  checkFfmpegAvifEncoder,
  parseFfmpegEncodersForAvif,
} from './server-processors';

const execFileAsync = promisify(execFile);

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

test('Motor de servidor: convierte PNG real a AVIF con Sharp (quality 80)', async () => {
  const pngBuffer = await sharp({
    create: {
      width: 128,
      height: 96,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-imagen',
    fileBuffer: pngBuffer,
    originalName: 'foto-kastral.png',
    targetFormat: 'avif',
    params: { quality: 80 },
  });

  assert.equal(task.status, 'completed');
  assert.equal(task.outputMimeType, 'image/avif');
  assert.equal(task.outputFilename, 'foto-kastral.avif');
  assert.ok((task.outputSize || 0) > 0);
});

test('Preflight AVIF: el nombre de encoder erróneo no existe y el correcto sí', () => {
  // Salida realista de `ffmpeg -encoders` del binario empaquetado de escritorio
  const bundledOutput = ' V....D libaom-av1           libaom AV1 (codec av1)\n A....D wmav1';
  assert.equal(parseFfmpegEncodersForAvif(bundledOutput), 'libaom-av1');
  assert.equal(parseFfmpegEncodersForAvif(' V....D libx264\n A....D aac'), undefined);
});

test('Preflight AVIF: el FFmpeg del sistema trae codificador AV1', async () => {
  const res = await checkFfmpegAvifEncoder('ffmpeg');
  assert.equal(res.supported, true);
  assert.ok(res.encoder);
  assert.ok(res.detail.includes(res.encoder));
});

test('Preflight AVIF: binario inexistente devuelve error honesto', async () => {
  const res = await checkFfmpegAvifEncoder('ffmpeg-que-no-existe-kastral');
  assert.equal(res.supported, false);
  assert.ok(res.detail.includes('No se pudo inspeccionar'));
});

test('Preflight AVIF: el binario empaquetado de escritorio trae libaom-av1 (no libaom-avif)', async () => {
  const bundled = path.join(
    process.cwd(),
    'src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu'
  );
  try {
    await fs.access(bundled);
  } catch {
    return; // Sin binario empaquetado en este entorno: se omite la evidencia
  }
  const { stdout } = await execFileAsync(bundled, ['-hide_banner', '-encoders']);
  assert.ok(stdout.includes('libaom-av1'), 'el binario debe traer libaom-av1');
  assert.ok(!stdout.includes('libaom-avif'), 'libaom-avif no existe como encoder');
  // El nombre que pedía el motor de escritorio era inválido: causa raíz del fallo PNG→AVIF
  assert.equal(parseFfmpegEncodersForAvif(stdout), 'libaom-av1');
});

async function generateAviFixture(dir: string, withAudio: boolean): Promise<Buffer> {
  const outPath = path.join(dir, withAudio ? 'fixture-audio.avi' : 'fixture.avi');
  const lavfi = [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=64x64:duration=1:rate=10',
    ...(withAudio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'] : []),
    '-c:v', 'mpeg4',
    ...(withAudio ? ['-c:a', 'pcm_s16le', '-shortest'] : ['-an']),
    outPath,
  ];
  await execFileAsync('ffmpeg', ['-hide_banner', ...lavfi]);
  return fs.readFile(outPath);
}

test('Motor de servidor: convierte .avi real a MP4 (convertir-video)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-avi-'));
  try {
    const avi = await generateAviFixture(dir, false);
    assert.ok(avi.subarray(0, 4).toString() === 'RIFF');

    const task = await createAndRunServerTask({
      toolSlug: 'convertir-video',
      fileBuffer: avi,
      originalName: 'clip.avi',
      targetFormat: 'mp4',
      params: { crf: '28', resolution: 'original' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputMimeType, 'video/mp4');
    assert.equal(task.outputFilename, 'clip.mp4');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: comprimir-video acepta .avi y extrae audio de .avi', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-avi-'));
  try {
    const avi = await generateAviFixture(dir, true);

    const compressed = await createAndRunServerTask({
      toolSlug: 'comprimir-video',
      fileBuffer: avi,
      originalName: 'clip.avi',
      targetFormat: 'mp4',
      params: { crf: '28', resolution: 'original' },
    });
    assert.equal(compressed.status, 'completed');
    assert.equal(compressed.outputMimeType, 'video/mp4');

    const audio = await createAndRunServerTask({
      toolSlug: 'extraer-audio-video',
      fileBuffer: avi,
      originalName: 'clip.avi',
      targetFormat: 'mp3',
      params: { bitrate: '128k' },
    });
    assert.equal(audio.status, 'completed');
    assert.equal(audio.outputMimeType, 'audio/mpeg');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: .avi corrupto devuelve error honesto (no genérico)', async () => {
  const corruptAvi = Buffer.concat([
    Buffer.from('RIFF\x00\x00\x00\x00AVI '),
    Buffer.from('contenido-basura-que-no-es-video-real-'.repeat(20)),
  ]);

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-video',
    fileBuffer: corruptAvi,
    originalName: 'roto.avi',
    targetFormat: 'mp4',
    params: {},
  });

  assert.equal(task.status, 'failed');
  assert.ok(task.error);
  assert.ok(
    task.error.includes('roto.avi') || /dañado|truncado|códec|compatible/i.test(task.error),
    `error honesto esperado, recibido: ${task.error}`
  );
});
