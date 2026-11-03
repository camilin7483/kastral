import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
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

test('Motor de servidor: rechaza dimensiones absurdas sin reservar memoria', async () => {
  const pngBuffer = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'redimensionar-imagen',
    fileBuffer: pngBuffer,
    originalName: 'mini.png',
    targetFormat: 'jpg',
    params: { width: 99999999 },
  });

  assert.equal(task.status, 'failed');
  assert.match(task.error || '', /8000 px/);
});

async function generateMp4Fixture(dir: string): Promise<Buffer> {
  const outPath = path.join(dir, 'fixture.mp4');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=64x64:duration=1:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    outPath,
  ]);
  return fs.readFile(outPath);
}

async function generateWavFixture(dir: string): Promise<Buffer> {
  const outPath = path.join(dir, 'fixture.wav');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:a', 'pcm_s16le',
    outPath,
  ]);
  return fs.readFile(outPath);
}

test('Motor de servidor: convierte MP4 real a MOV (H.264+AAC)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-mov-'));
  try {
    const mp4 = await generateMp4Fixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-video',
      fileBuffer: mp4,
      originalName: 'clip.mp4',
      targetFormat: 'mov',
      params: { crf: '28', resolution: 'original' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'clip.mov');
    assert.equal(task.outputMimeType, 'video/quicktime');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(4, 8).toString(), 'ftyp');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte MP4 real a AVI (MPEG-4+MP3)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-avi-out-'));
  try {
    const mp4 = await generateMp4Fixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-video',
      fileBuffer: mp4,
      originalName: 'clip.mp4',
      targetFormat: 'avi',
      params: { crf: '28', resolution: 'original' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'clip.avi');
    assert.equal(task.outputMimeType, 'video/x-msvideo');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(0, 4).toString(), 'RIFF');
    assert.equal(out.subarray(8, 12).toString(), 'AVI ');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte MP4 real a FLV (H.264+MP3)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-flv-'));
  try {
    const mp4 = await generateMp4Fixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-video',
      fileBuffer: mp4,
      originalName: 'clip.mp4',
      targetFormat: 'flv',
      params: { crf: '28', resolution: 'original' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'clip.flv');
    assert.equal(task.outputMimeType, 'video/x-flv');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(0, 3).toString(), 'FLV');
    assert.equal(out[3], 0x01);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte WAV real a M4A (AAC en MP4)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-m4a-'));
  try {
    const wav = await generateWavFixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-audio',
      fileBuffer: wav,
      originalName: 'nota.wav',
      targetFormat: 'm4a',
      params: { bitrate: '128k' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'nota.m4a');
    assert.equal(task.outputMimeType, 'audio/mp4');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(4, 8).toString(), 'ftyp');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte WAV real a Opus (libopus)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-opus-'));
  try {
    const wav = await generateWavFixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-audio',
      fileBuffer: wav,
      originalName: 'nota.wav',
      targetFormat: 'opus',
      params: { bitrate: '128k' },
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'nota.opus');
    assert.equal(task.outputMimeType, 'audio/opus');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(0, 4).toString(), 'OggS');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte WAV real a AIFF (PCM 16-bit)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kastral-aiff-'));
  try {
    const wav = await generateWavFixture(dir);
    const task = await createAndRunServerTask({
      toolSlug: 'convertir-audio',
      fileBuffer: wav,
      originalName: 'nota.wav',
      targetFormat: 'aiff',
      params: {},
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.outputFilename, 'nota.aiff');
    assert.equal(task.outputMimeType, 'audio/aiff');
    assert.ok((task.outputSize || 0) > 0);
    const out = await fs.readFile(task.outputFilePath!);
    assert.equal(out.subarray(0, 4).toString(), 'FORM');
    assert.equal(out.subarray(8, 12).toString(), 'AIFF');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Motor de servidor: convierte PNG real a TIFF (LZW)', async () => {
  const pngBuffer = await sharp({
    create: { width: 128, height: 96, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-imagen',
    fileBuffer: pngBuffer,
    originalName: 'foto.png',
    targetFormat: 'tiff',
    params: { quality: 80 },
  });

  assert.equal(task.status, 'completed');
  assert.equal(task.outputFilename, 'foto.tiff');
  assert.equal(task.outputMimeType, 'image/tiff');
  assert.ok((task.outputSize || 0) > 0);
  const out = await fs.readFile(task.outputFilePath!);
  const magic = out.subarray(0, 4).toString('latin1');
  assert.ok(magic === 'II*\0' || magic === 'MM\0*');
});

test('Motor de servidor: convierte PNG real a BMP 24-bit', async () => {
  const pngBuffer = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 60, b: 30 } },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-imagen',
    fileBuffer: pngBuffer,
    originalName: 'foto.png',
    targetFormat: 'bmp',
    params: { quality: 80 },
  });

  assert.equal(task.status, 'completed');
  assert.equal(task.outputFilename, 'foto.bmp');
  assert.equal(task.outputMimeType, 'image/bmp');
  assert.ok((task.outputSize || 0) > 0);
  const out = await fs.readFile(task.outputFilePath!);
  assert.equal(out.subarray(0, 2).toString(), 'BM');
  const pixelOffset = out.readUInt32LE(10);
  const width = out.readInt32LE(18);
  const height = out.readInt32LE(22);
  const stride = Math.floor((width * 3 + 3) / 4) * 4;
  assert.equal(width, 64);
  assert.equal(height, 48);
  assert.equal(out.length, pixelOffset + stride * height);
});

test('Motor de servidor: convierte Markdown real a EPUB válido', async () => {
  const mdBuffer = Buffer.from('# Guía Kastral\n\nEste es el primer capítulo del libro de prueba.\n', 'utf-8');

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-documento',
    fileBuffer: mdBuffer,
    originalName: 'guia.md',
    targetFormat: 'epub',
    params: {},
  });

  assert.equal(task.status, 'completed');
  assert.equal(task.outputFilename, 'guia.epub');
  assert.equal(task.outputMimeType, 'application/epub+zip');
  assert.ok((task.outputSize || 0) > 0);
  const out = await fs.readFile(task.outputFilePath!);
  assert.equal(out.subarray(0, 2).toString(), 'PK');

  const zip = await JSZip.loadAsync(out);
  assert.deepEqual(Object.keys(zip.files)[0], 'mimetype');
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
  assert.ok(zip.file('META-INF/container.xml'));
  assert.ok(zip.file('OEBPS/content.opf'));
  const chapter = await zip.file('OEBPS/capitulo-1.xhtml')!.async('string');
  assert.ok(chapter.includes('Guía Kastral'));
});

test('Motor de servidor: rechaza formato inventado (.exe) sin acuñar MIME falso', async () => {
  const pngBuffer = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 9, g: 9, b: 9 } },
  })
    .png()
    .toBuffer();

  const task = await createAndRunServerTask({
    toolSlug: 'convertir-imagen',
    fileBuffer: pngBuffer,
    originalName: 'prueba.png',
    targetFormat: 'exe',
    params: {},
  });

  assert.equal(task.status, 'failed');
  assert.match(task.error || '', /no soportado/i);
});
