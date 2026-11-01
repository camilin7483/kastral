import { NextRequest, NextResponse } from 'next/server';
import { createAndRunServerTask } from '@/lib/server-processors';
import { getToolBySlug } from '@/lib/tools-catalog';

const MAX_MB = Number(process.env.MAX_FILE_SIZE_MB || 50);

// Control básico de límite de tasa por IP en memoria
const ipRequestMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes en el último minuto. Espera unos segundos e inténtalo de nuevo.' },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const toolSlug = String(formData.get('toolSlug') || '').trim();
    const targetFormat = String(formData.get('targetFormat') || '').trim();
    const paramsRaw = String(formData.get('params') || '{}');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No se recibió ningún archivo válido en la solicitud.' },
        { status: 400 }
      );
    }

    const tool = getToolBySlug(toolSlug);
    if (!tool) {
      return NextResponse.json(
        { error: 'La herramienta solicitada no existe en el catálogo.' },
        { status: 400 }
      );
    }

    const maxBytes = (tool.maxFileSizeMB || MAX_MB) * 1024 * 1024;
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'El archivo subido está vacío (0 bytes).' },
        { status: 400 }
      );
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `El archivo supera el límite máximo permitido de ${tool.maxFileSizeMB || MAX_MB} MB para esta herramienta.`,
        },
        { status: 413 }
      );
    }

    let parsedParams: Record<string, string | number | boolean> = {};
    try {
      parsedParams = JSON.parse(paramsRaw);
    } catch {
      parsedParams = {};
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const task = await createAndRunServerTask({
      toolSlug,
      fileBuffer: buffer,
      originalName: file.name,
      targetFormat: targetFormat || tool.defaultOutputFormat,
      params: parsedParams,
    });

    if (task.status === 'failed') {
      return NextResponse.json(
        {
          taskId: task.taskId,
          status: 'failed',
          error: task.error || 'No se pudo completar el procesamiento del archivo.',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      originalName: task.originalName,
      originalSize: task.originalSize,
      outputFilename: task.outputFilename,
      outputSize: task.outputSize,
      outputMimeType: task.outputMimeType,
      details: task.details,
      downloadUrl: `/api/v1/download/${task.taskId}`,
    });
  } catch (err) {
    const safeMessage =
      err instanceof Error
        ? err.message.replace(/\/tmp\/[^\s"]+/g, '[directorio-temporal]')
        : 'Error interno al procesar la solicitud.';
    return NextResponse.json({ error: safeMessage }, { status: 400 });
  }
}
