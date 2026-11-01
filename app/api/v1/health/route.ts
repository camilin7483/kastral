import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cleanupExpiredTasks, taskRegistry } from '@/lib/server-processors';

const execFileAsync = promisify(execFile);

async function checkBinary(bin: string, arg = '--version'): Promise<boolean> {
  try {
    await execFileAsync(bin, [arg], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const cleaned = await cleanupExpiredTasks();
  const [ffmpegAvailable, gsAvailable] = await Promise.all([
    checkBinary('ffmpeg', '-version'),
    checkBinary('gs', '--version'),
  ]);

  return NextResponse.json({
    status: 'healthy',
    service: 'kastral-processing-api',
    version: '1.0.0',
    engines: {
      sharp: true,
      ghostscript: gsAvailable,
      ffmpeg: ffmpegAvailable,
      mammothDocx: true,
      pdfLib: true,
    },
    limits: {
      maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB || 50),
      maxConcurrentTasks: Number(process.env.MAX_CONCURRENT_TASKS || 2),
      taskTimeoutSeconds: Number(process.env.TASK_TIMEOUT_SECONDS || 60),
      tempRetentionMinutes: Number(process.env.TEMP_CLEANUP_MINUTES || 15),
    },
    activeTasksInCache: taskRegistry.size,
    expiredTasksCleaned: cleaned,
  });
}
