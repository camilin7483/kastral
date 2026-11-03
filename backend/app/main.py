import asyncio
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import settings
from .security import (
    sanitize_filename,
    verify_magic_bytes,
    create_isolated_task_dir,
    cleanup_expired_directories,
)
from .processors import (
    process_pdf_compression,
    process_audio_or_video_ffmpeg,
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API REST para validación, conversión y compresión segura de archivos de Kastral.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Semáforo para limitar el procesamiento concurrente y proteger la memoria RAM
concurrency_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_TASKS)


class TaskResponse(BaseModel):
    taskId: str
    status: str = Field(..., description="queued | processing | completed | failed")
    progress: int
    originalName: str
    originalSize: int
    outputFilename: Optional[str] = None
    outputSize: Optional[int] = None
    outputMimeType: Optional[str] = None
    downloadUrl: Optional[str] = None
    error: Optional[str] = None


TASKS_DB: Dict[str, Dict[str, Any]] = {}


@app.get("/api/v1/health")
async def health_check():
    cleaned = cleanup_expired_directories(settings.TEMP_ROOT, settings.TEMP_CLEANUP_MINUTES)
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "limits": {
            "maxFileSizeMB": settings.MAX_FILE_SIZE_MB,
            "maxConcurrentTasks": settings.MAX_CONCURRENT_TASKS,
            "taskTimeoutSeconds": settings.TASK_TIMEOUT_SECONDS,
            "tempCleanupMinutes": settings.TEMP_CLEANUP_MINUTES,
        },
        "expiredDirectoriesCleaned": cleaned,
    }


@app.post("/api/v1/process", response_model=TaskResponse)
async def process_file_endpoint(
    file: UploadFile = File(...),
    toolSlug: str = Form(...),
    targetFormat: str = Form(...),
    params: str = Form("{}"),
):
    cleanup_expired_directories(settings.TEMP_ROOT, settings.TEMP_CLEANUP_MINUTES)

    content = await file.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo enviado está vacío (0 bytes).")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"El archivo supera el límite máximo de {settings.MAX_FILE_SIZE_MB} MB.",
        )

    safe_orig = sanitize_filename(file.filename or "archivo")
    ext = safe_orig.split(".")[-1].lower() if "." in safe_orig else "*"

    valid_magic, reason = verify_magic_bytes(content, ext)
    if not valid_magic:
        raise HTTPException(status_code=400, detail=reason)

    try:
        parsed_params = json.loads(params) if params else {}
    except json.JSONDecodeError:
        parsed_params = {}

    task_id, work_dir = create_isolated_task_dir(settings.TEMP_ROOT)
    input_path = work_dir / f"input.{ext}"
    input_path.write_bytes(content)

    async with concurrency_semaphore:
        try:
            if toolSlug == "comprimir-pdf":
                out_path, mime = await asyncio.to_thread(
                    process_pdf_compression,
                    input_path,
                    work_dir,
                    parsed_params,
                    settings.TASK_TIMEOUT_SECONDS,
                )
                out_ext = "pdf"
            elif toolSlug in ("convertir-audio", "extraer-audio-video", "convertir-video", "comprimir-video"):
                out_path, mime = await asyncio.to_thread(
                    process_audio_or_video_ffmpeg,
                    toolSlug,
                    input_path,
                    work_dir,
                    targetFormat,
                    parsed_params,
                    settings.TASK_TIMEOUT_SECONDS,
                )
                out_ext = targetFormat.lower()
            else:
                raise HTTPException(status_code=400, detail=f"Herramienta no soportada: {toolSlug}")

            # Eliminar archivo de entrada tras completar el procesamiento
            input_path.unlink(missing_ok=True)

            if not out_path.exists() or out_path.stat().st_size == 0:
                raise RuntimeError("El archivo de salida no se generó correctamente.")

            base_stem = safe_orig.rsplit(".", 1)[0] if "." in safe_orig else safe_orig
            out_filename = f"{base_stem}-kastral.{out_ext}"
            out_size = out_path.stat().st_size

            TASKS_DB[task_id] = {
                "taskId": task_id,
                "status": "completed",
                "progress": 100,
                "originalName": safe_orig,
                "originalSize": len(content),
                "outputFilename": out_filename,
                "outputFilePath": str(out_path),
                "outputSize": out_size,
                "outputMimeType": mime,
            }

            return TaskResponse(
                taskId=task_id,
                status="completed",
                progress=100,
                originalName=safe_orig,
                originalSize=len(content),
                outputFilename=out_filename,
                outputSize=out_size,
                outputMimeType=mime,
                downloadUrl=f"/api/v1/download/{task_id}",
            )
        except HTTPException:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise
        except Exception as exc:
            shutil.rmtree(work_dir, ignore_errors=True)
            cause = str(exc).strip()[:300] or "error desconocido del motor"
            raise HTTPException(
                status_code=422,
                detail=f"No se pudo procesar el archivo ({toolSlug} → {targetFormat}): {cause}",
            )


@app.get("/api/v1/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(task_id: str):
    task = TASKS_DB.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada o expirada.")
    return TaskResponse(
        taskId=task["taskId"],
        status=task["status"],
        progress=task["progress"],
        originalName=task["originalName"],
        originalSize=task["originalSize"],
        outputFilename=task.get("outputFilename"),
        outputSize=task.get("outputSize"),
        outputMimeType=task.get("outputMimeType"),
        downloadUrl=f"/api/v1/download/{task_id}" if task["status"] == "completed" else None,
    )


@app.get("/api/v1/download/{task_id}")
async def download_task_output(task_id: str):
    task = TASKS_DB.get(task_id)
    if not task or task.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Archivo no disponible.")
    file_path = Path(task["outputFilePath"])
    if not file_path.exists():
        raise HTTPException(status_code=410, detail="El archivo temporal ya fue limpiado.")
    return FileResponse(
        path=str(file_path),
        media_type=task.get("outputMimeType", "application/octet-stream"),
        filename=sanitize_filename(task.get("outputFilename", "resultado")),
    )
