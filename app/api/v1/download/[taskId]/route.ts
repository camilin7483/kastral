import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { taskRegistry } from '@/lib/server-processors';
import { sanitizeFilename } from '@/lib/file-utils';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params;
  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ error: 'Identificador de tarea no válido.' }, { status: 400 });
  }

  const task = taskRegistry.get(taskId);
  if (!task || task.status !== 'completed' || !task.outputFilePath) {
    return NextResponse.json(
      { error: 'El archivo solicitado no está disponible o ya expiró.' },
      { status: 404 }
    );
  }

  if (!existsSync(task.outputFilePath)) {
    return NextResponse.json(
      { error: 'El archivo temporal ya fue eliminado por el servicio de limpieza.' },
      { status: 410 }
    );
  }

  const fileBuffer = await fs.readFile(task.outputFilePath);
  const safeName = sanitizeFilename(task.outputFilename || 'resultado');

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': task.outputMimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(fileBuffer.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
