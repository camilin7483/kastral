import { NextRequest, NextResponse } from 'next/server';
import { taskRegistry } from '@/lib/server-processors';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params;
  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ error: 'Identificador de tarea no válido.' }, { status: 400 });
  }

  const task = taskRegistry.get(taskId);
  if (!task) {
    return NextResponse.json(
      { error: 'La tarea no existe o sus archivos temporales ya expiraron.' },
      { status: 404 }
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
    error: task.error,
    downloadUrl: task.status === 'completed' ? `/api/v1/download/${task.taskId}` : undefined,
  });
}
