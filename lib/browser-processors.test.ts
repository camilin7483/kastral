import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  mergePdfsInBrowser,
  splitPdfInBrowser,
  extractPdfPagesInBrowser,
  rotatePdfInBrowser,
  addWatermarkToPdfInBrowser,
  convertDocumentInBrowser,
  convertSpreadsheetInBrowser,
  createZipInBrowser,
  extractZipInBrowser,
} from './browser-processors';

async function createSamplePdfFile(name: string, pagesCount: number): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pagesCount; i++) {
    const page = doc.addPage([400, 400]);
    page.drawText(`Kastral Pagina ${i} en ${name}`, { x: 40, y: 200, size: 14, font });
  }
  const bytes = await doc.save();
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

test('Motor Local (Offline): combinar múltiples PDFs en un único documento', async () => {
  const pdf1 = await createSamplePdfFile('parte1.pdf', 2);
  const pdf2 = await createSamplePdfFile('parte2.pdf', 3);

  const result = await mergePdfsInBrowser([pdf1, pdf2]);
  assert.equal(result.mimeType, 'application/pdf');
  assert.ok(result.outputSize > 100);

  const loaded = await PDFDocument.load(await result.outputBlob.arrayBuffer());
  assert.equal(loaded.getPageCount(), 5);
});

test('Motor Local (Offline): dividir PDF en páginas individuales empaquetadas en ZIP', async () => {
  const pdf = await createSamplePdfFile('documento-3-paginas.pdf', 3);
  const result = await splitPdfInBrowser(pdf);

  assert.equal(result.mimeType, 'application/zip');
  assert.ok(result.extractedItems);
  assert.equal(result.extractedItems.length, 3);
});

test('Motor Local (Offline): extraer rango específico de páginas de un PDF', async () => {
  const pdf = await createSamplePdfFile('informe-completo.pdf', 4);
  const result = await extractPdfPagesInBrowser(pdf, '2-3');

  assert.equal(result.mimeType, 'application/pdf');
  const loaded = await PDFDocument.load(await result.outputBlob.arrayBuffer());
  assert.equal(loaded.getPageCount(), 2);
});

test('Motor Local (Offline): convertir documento TXT/Markdown a PDF, HTML y MD sin Internet', async () => {
  const content = '# Informe Técnico Kastral\n\nProcesamiento 100% local desarrollado por Andres Guerrero.\n- Punto 1\n- Punto 2';
  const txtFile = new File([content], 'informe.md', { type: 'text/markdown' });

  const pdfRes = await convertDocumentInBrowser(txtFile, 'pdf');
  assert.equal(pdfRes.mimeType, 'application/pdf');
  assert.ok(pdfRes.outputSize > 200);

  const htmlRes = await convertDocumentInBrowser(txtFile, 'html');
  assert.equal(htmlRes.mimeType, 'text/html');
  const htmlText = await htmlRes.outputBlob.text();
  assert.ok(htmlText.includes('Informe Técnico Kastral'));
});

test('Motor Local (Offline): convertir hoja de cálculo entre CSV, XLSX y JSON', async () => {
  const csvContent = 'Herramienta,Modo,Autor\nConvertir Imagen,100% Local,Andres Guerrero\nComprimir PDF,100% Local,Andres Guerrero';
  const csvFile = new File([csvContent], 'catalogo.csv', { type: 'text/csv' });

  const jsonRes = await convertSpreadsheetInBrowser(csvFile, 'json', {});
  assert.equal(jsonRes.mimeType, 'application/json');
  const parsed = JSON.parse(await jsonRes.outputBlob.text());
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].Autor, 'Andres Guerrero');

  const xlsxRes = await convertSpreadsheetInBrowser(csvFile, 'xlsx', {});
  assert.ok(xlsxRes.outputSize > 100);
  const wb = XLSX.read(await xlsxRes.outputBlob.arrayBuffer(), { type: 'array' });
  assert.ok(wb.SheetNames.length >= 1);
});

test('Motor Local (Offline): crear archivo ZIP y extraer su contenido de forma segura', async () => {
  const f1 = new File(['Contenido de prueba A'], 'nota-a.txt', { type: 'text/plain' });
  const f2 = new File(['Contenido de prueba B'], 'nota-b.txt', { type: 'text/plain' });

  const zipResult = await createZipInBrowser([f1, f2], { compressionLevel: 6 });
  assert.equal(zipResult.mimeType, 'application/zip');
  assert.ok(zipResult.outputSize > 50);

  const zipFile = new File([zipResult.outputBlob], 'lote.zip', { type: 'application/zip' });
  const extracted = await extractZipInBrowser(zipFile);
  assert.ok(extracted.extractedItems);
  assert.equal(extracted.extractedItems.length, 2);
});

test('Motor Local (Offline): extrae ZIP con .bat en subcarpetas y rutas Windows sin marcarlo dañado', async () => {
  const zip = new JSZip();
  zip.file('scripts/instalar.bat', '@echo off\r\necho Hola Kastral\r\n');
  zip.file('carpeta/sub/nested.bat', 'echo nested\r\n');
  // Nombre legítimo con puntos dobles: ya no se bloquea (se sanea a un punto, como el resto de nombres)
  zip.file('respaldo..2024.bat', 'echo nombre legitimo con puntos dobles\r\n');
  // Entrada tal como la escribe un ZIP creado en Windows (separador "\")
  zip.file('scripts\\utilidades\\limpiar-win.bat', '@echo off\r\ndel /q temp\r\n');
  const buf = await zip.generateAsync({ type: 'uint8array' });

  const zipFile = new File([buf as unknown as BlobPart], 'lote-bat-win.zip', {
    type: 'application/zip',
  });
  const extracted = await extractZipInBrowser(zipFile);

  assert.ok(extracted.extractedItems);
  assert.equal(extracted.extractedItems.length, 4);
  const names = extracted.extractedItems.map((i) => i.name).sort();
  assert.ok(names.includes('scripts/instalar.bat'), `falta instalar.bat: ${names}`);
  assert.ok(names.includes('carpeta/sub/nested.bat'), `falta nested.bat: ${names}`);
  assert.ok(
    names.includes('scripts/utilidades/limpiar-win.bat'),
    `la ruta Windows debe normalizarse preservando carpetas: ${names}`
  );
  assert.ok(names.includes('respaldo.2024.bat'), `nombre legítimo bloqueado: ${names}`);
});

test('Motor Local (Offline): bloquea Zip Slip real y reporta ZIP corrupto con honestidad', async () => {
  // JSZip neutraliza "../" con barras normales al recargar, así que el vector
  // realista (ZIP creado en Windows) usa separadores "\", que sí sobreviven.
  const evil = new JSZip();
  evil.file('..\\..\\evil.bat', 'echo pwned');
  const evilBuf = await evil.generateAsync({ type: 'uint8array' });
  const evilFile = new File([evilBuf as unknown as BlobPart], 'malicioso.zip', {
    type: 'application/zip',
  });
  await assert.rejects(extractZipInBrowser(evilFile), (err: Error) => {
    assert.ok(err.message.includes('insegura'));
    return true;
  });

  const corrupt = new File(['esto no es un zip aunque pese algo'], 'roto.zip', {
    type: 'application/zip',
  });
  await assert.rejects(extractZipInBrowser(corrupt), (err: Error) => {
    assert.ok(err.message.includes('dañado') || err.message.includes('soportado'));
    return true;
  });
});

test('Motor Local (Offline): girar páginas concretas de un PDF 180 grados', async () => {
  const pdf = await createSamplePdfFile('giro-prueba.pdf', 3);
  const result = await rotatePdfInBrowser(pdf, { angle: 180, pages: '1,3' });

  assert.equal(result.mimeType, 'application/pdf');
  assert.ok(result.outputFilename.endsWith('-girado.pdf'));

  const loaded = await PDFDocument.load(await result.outputBlob.arrayBuffer());
  assert.equal(loaded.getPageCount(), 3);
  assert.equal(loaded.getPage(0).getRotation().angle, 180);
  assert.equal(loaded.getPage(1).getRotation().angle, 0);
  assert.equal(loaded.getPage(2).getRotation().angle, 180);
});

test('Motor Local (Offline): girar PDF rechaza rangos inválidos y archivos no PDF', async () => {
  const pdf = await createSamplePdfFile('giro-invalido.pdf', 2);
  await assert.rejects(rotatePdfInBrowser(pdf, { angle: 90, pages: '9-12' }), (err: Error) => {
    assert.ok(err.message.length > 0);
    return true;
  });

  const falso = new File(['esto no es un pdf'], 'falso.pdf', { type: 'application/pdf' });
  await assert.rejects(rotatePdfInBrowser(falso, { angle: 90, pages: 'all' }), (err: Error) => {
    assert.ok(err.message.includes('PDF válido'));
    return true;
  });
});

test('Motor Local (Offline): girar PDF normaliza ángulos no admitidos a 90 grados', async () => {
  const pdf = await createSamplePdfFile('giro-normalizado.pdf', 1);
  const result = await rotatePdfInBrowser(pdf, { angle: 45, pages: 'all' });
  const loaded = await PDFDocument.load(await result.outputBlob.arrayBuffer());
  assert.equal(loaded.getPage(0).getRotation().angle, 90);
});

test('Motor Local (Offline): añadir marca de agua a un PDF de 2 páginas', async () => {
  const pdf = await createSamplePdfFile('informe-marca.pdf', 2);
  const result = await addWatermarkToPdfInBrowser(pdf, {
    text: 'CONFIDENCIAL',
    opacity: 30,
    fontSize: 48,
    position: 'diagonal',
  });

  assert.equal(result.mimeType, 'application/pdf');
  assert.ok(result.outputFilename.endsWith('-marca-agua.pdf'));
  assert.ok(result.outputSize > 0);

  const loaded = await PDFDocument.load(await result.outputBlob.arrayBuffer());
  assert.equal(loaded.getPageCount(), 2);
});

test('Motor Local (Offline): la marca de agua rechaza el texto vacío', async () => {
  const pdf = await createSamplePdfFile('marca-vacia.pdf', 1);
  await assert.rejects(addWatermarkToPdfInBrowser(pdf, { text: '   ' }), (err: Error) => {
    assert.ok(err.message.includes('vacío'));
    return true;
  });
});
