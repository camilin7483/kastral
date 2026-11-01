import subprocess
import uuid
import zipfile
from pathlib import Path
from typing import Dict, Any, Tuple
from .security import sanitize_filename, is_safe_archive_path


def run_safe_subprocess(args: list[str], cwd: Path, timeout_sec: int = 60) -> None:
    """
    Ejecuta un binario externo sin shell (shell=False) para impedir inyección
    de comandos y aplica un límite estricto de tiempo.
    """
    result = subprocess.run(
        args,
        cwd=str(cwd),
        shell=False,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("El motor de procesamiento devolvió un código de error al transformar el archivo.")


def process_pdf_compression(input_path: Path, work_dir: Path, params: Dict[str, Any], timeout_sec: int) -> Tuple[Path, str]:
    preset = str(params.get("preset", "ebook"))
    if preset not in ("screen", "ebook", "printer"):
        preset = "ebook"

    out_path = work_dir / f"out-{uuid.uuid4().hex[:8]}.pdf"
    run_safe_subprocess(
        [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS=/{preset}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            "-dSAFER",
            f"-sOutputFile={out_path}",
            str(input_path),
        ],
        cwd=work_dir,
        timeout_sec=timeout_sec,
    )
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("Ghostscript no generó un archivo PDF válido.")
    return out_path, "application/pdf"


def process_audio_or_video_ffmpeg(
    slug: str,
    input_path: Path,
    work_dir: Path,
    target_format: str,
    params: Dict[str, Any],
    timeout_sec: int,
) -> Tuple[Path, str]:
    fmt = target_format.lower().strip()
    out_path = work_dir / f"media-{uuid.uuid4().hex[:8]}.{fmt}"

    if slug in ("convertir-audio", "extraer-audio-video"):
        allowed_audio = {
            "mp3": (["-c:a", "libmp3lame"], "audio/mpeg"),
            "wav": (["-c:a", "pcm_s16le"], "audio/wav"),
            "aac": (["-c:a", "aac"], "audio/aac"),
            "flac": (["-c:a", "flac"], "audio/flac"),
            "ogg": (["-c:a", "libvorbis"], "audio/ogg"),
        }
        if fmt not in allowed_audio:
            fmt = "mp3"
        codec_args, mime = allowed_audio[fmt]
        bitrate = str(params.get("bitrate", "192k"))
        if bitrate not in ("64k", "128k", "192k", "320k"):
            bitrate = "192k"

        cmd = ["ffmpeg", "-y", "-i", str(input_path), "-vn", *codec_args]
        if fmt in ("mp3", "aac", "ogg"):
            cmd.extend(["-b:a", bitrate])
        cmd.append(str(out_path))
        run_safe_subprocess(cmd, cwd=work_dir, timeout_sec=timeout_sec)
        return out_path, mime

    # Vídeo
    if fmt not in ("mp4", "webm", "mkv"):
        fmt = "mp4"
    crf = str(params.get("crf", "28"))
    if crf not in ("24", "28", "33"):
        crf = "28"
    res = str(params.get("resolution", "original"))
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    if res in ("1920", "1280", "854"):
        cmd.extend(["-vf", f"scale='min({res},iw)':-2"])

    if fmt == "webm":
        cmd.extend(["-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-c:a", "libvorbis"])
        mime = "video/webm"
    else:
        cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p", "-c:a", "aac"])
        mime = "video/mp4" if fmt == "mp4" else "video/x-matroska"

    cmd.append(str(out_path))
    run_safe_subprocess(cmd, cwd=work_dir, timeout_sec=timeout_sec)
    return out_path, mime


def create_safe_zip_archive(files: list[Tuple[str, bytes]], work_dir: Path) -> Tuple[Path, str]:
    out_path = work_dir / f"bundle-{uuid.uuid4().hex[:8]}.zip"
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for orig_name, content in files:
            safe_name = sanitize_filename(orig_name)
            zf.writestr(safe_name, content)
    return out_path, "application/zip"


def validate_and_extract_zip(zip_path: Path, extract_dir: Path) -> list[Path]:
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            if not is_safe_archive_path(member.filename, extract_dir):
                raise ValueError(f"Ruta insegura bloqueada dentro del archivo ZIP: {member.filename}")
            target_file = extract_dir / sanitize_filename(member.filename)
            with zf.open(member) as src, open(target_file, "wb") as dst:
                dst.write(src.read())
            extracted.append(target_file)
    return extracted
