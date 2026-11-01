import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import {
  mergePdfsInBrowser,
  splitPdfInBrowser,
  extractPdfPagesInBrowser,
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
