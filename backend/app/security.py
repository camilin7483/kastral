import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Tuple


def sanitize_filename(raw_name: str) -> str:
    """
    Elimina rutas relativas/absolutas (Path Traversal) y caracteres peligrosos.
    """
    if not raw_name or not isinstance(raw_name, str):
        return "archivo"
    base = raw_name.replace("\\", "/").split("/")[-1] or "archivo"
    cleaned = re.sub(r"\.\.+", ".", base)
    cleaned = re.sub(r"[^a-zA-Z0-9._\-\sáéíóúÁÉÍÓÚñÑ]", "_", cleaned).strip()
    cleaned = cleaned.lstrip(".")
    return (cleaned[:120]) or "archivo"


def is_safe_archive_path(entry_path: str, target_dir: Path) -> bool:
    """
    Previene ataques Zip Slip verificando que la ruta resuelta permanezca
    estrictamente dentro del directorio temporal autorizado.
    """
    if not entry_path or "\x00" in entry_path:
        return False
    normalized = entry_path.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[a-zA-Z]:", normalized):
        return False
    if ".." in normalized.split("/"):
        return False
    resolved_target = target_dir.resolve()
    candidate = (resolved_target / normalized).resolve()
    return str(candidate).startswith(str(resolved_target) + os.sep)


def verify_magic_bytes(data: bytes, expected_ext: str) -> Tuple[bool, str]:
    """
    Valida los primeros bytes (Magic Bytes) para rechazar archivos vacíos
    o con extensiones falsificadas.
    """
    if not data or len(data) == 0:
        return False, "El archivo está vacío (0 bytes)."

    ext = expected_ext.lower().lstrip(".")
    if ext == "*":
        return True, "ok"

    if ext == "pdf":
        if data[:4] == b"%PDF":
            return True, "application/pdf"
        return False, "El archivo no contiene una cabecera PDF válida (%PDF)."

    if ext == "png":
        if data[:4] == b"\x89PNG":
            return True, "image/png"
        return False, "El archivo no tiene una firma binaria PNG válida."

    if ext in ("jpg", "jpeg"):
        if data[:3] == b"\xff\xd8\xff":
            return True, "image/jpeg"
        return False, "El archivo no tiene una firma binaria JPEG válida."

    if ext == "gif":
        if data[:4] == b"GIF8":
            return True, "image/gif"
        return False, "El archivo no tiene una firma GIF válida."

    if ext == "webp":
        if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return True, "image/webp"
        return False, "El archivo no tiene una cabecera RIFF/WEBP válida."

    if ext in ("zip", "docx", "xlsx", "odt", "ods", "pptx"):
        if data[:2] == b"PK":
            return True, "application/zip"
        return False, f"El archivo .{ext} no tiene una estructura comprimida PKZIP válida."

    if len(data) < 8:
        return False, "El archivo es demasiado pequeño o está corrupto."

    return True, "ok"


def create_isolated_task_dir(temp_root: str) -> Tuple[str, Path]:
    """
    Crea un directorio temporal aislado con permisos 0700 para una única tarea.
    """
    task_id = str(uuid.uuid4())
    root = Path(temp_root)
    root.mkdir(parents=True, exist_ok=True)
    task_dir = root / task_id
    task_dir.mkdir(mode=0o700, exist_ok=False)
    return task_id, task_dir


def cleanup_expired_directories(temp_root: str, max_age_minutes: int) -> int:
    """
    Elimina directorios de tareas cuya antigüedad supere max_age_minutes.
    """
    root = Path(temp_root)
    if not root.exists():
        return 0
    now = time.time()
    max_age_sec = max_age_minutes * 60
    removed = 0
    for child in root.iterdir():
        if child.is_dir():
            try:
                mtime = child.stat().st_mtime
                if now - mtime > max_age_sec:
                    shutil.rmtree(child, ignore_errors=True)
                    removed += 1
            except OSError:
                pass
    return removed
