import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from backend.app.security import (
    sanitize_filename,
    is_safe_archive_path,
    verify_magic_bytes,
    create_isolated_task_dir,
    cleanup_expired_directories,
)
from backend.app.processors import (
    create_safe_zip_archive,
    validate_and_extract_zip,
    run_safe_subprocess,
)


class TestKastralBackendSecurityAndProcessors(unittest.TestCase):
    def test_sanitize_filename_prevents_traversal(self):
        self.assertEqual(sanitize_filename("../../etc/passwd"), "passwd")
        self.assertEqual(sanitize_filename("..\\..\\windows\\win.ini"), "win.ini")
        self.assertEqual(sanitize_filename("..."), "archivo")
        self.assertEqual(sanitize_filename("informe_2026.pdf"), "informe_2026.pdf")

    def test_verify_magic_bytes_detects_real_headers_and_rejects_fakes(self):
        valid_pdf, _ = verify_magic_bytes(b"%PDF-1.7\n...", "pdf")
        self.assertTrue(valid_pdf)

        fake_pdf, reason = verify_magic_bytes(b"NOT_A_PDF_FILE", "pdf")
        self.assertFalse(fake_pdf)
        self.assertIn("PDF", reason)

        empty_file, _ = verify_magic_bytes(b"", "png")
        self.assertFalse(empty_file)

    def test_isolated_task_dir_and_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp_root:
            task_id, task_dir = create_isolated_task_dir(tmp_root)
            self.assertTrue(task_dir.exists())
            self.assertIn(task_id, str(task_dir))
            # Limpieza con max_age_minutes = -1 elimina inmediatamente
            removed = cleanup_expired_directories(tmp_root, -1)
            self.assertEqual(removed, 1)
            self.assertFalse(task_dir.exists())

    def test_zip_creation_and_zip_slip_protection(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            work = Path(tmp_dir)
            zip_path, mime = create_safe_zip_archive(
                [("notas.txt", b"Hola Kastral"), ("../secreto.txt", b"Saneado")],
                work,
            )
            self.assertEqual(mime, "application/zip")
            self.assertTrue(zip_path.exists())

            extract_dir = work / "extracted"
            extract_dir.mkdir()
            extracted_files = validate_and_extract_zip(zip_path, extract_dir)
            self.assertEqual(len(extracted_files), 2)

            # Crear un ZIP con entrada maliciosa "../../evil.sh" y comprobar bloqueo
            malicious_zip = work / "malicious.zip"
            with zipfile.ZipFile(malicious_zip, "w") as zf:
                zf.writestr("../../evil.sh", b"echo pwned")

            with self.assertRaises(ValueError):
                validate_and_extract_zip(malicious_zip, extract_dir)

    def test_verify_magic_bytes_avi_riff_header(self):
        valid_avi = b"RIFF\x4e\x9e\x01\x00AVI " + b"\x00" * 16
        ok, mime = verify_magic_bytes(valid_avi, "avi")
        self.assertTrue(ok)
        self.assertEqual(mime, "video/x-msvideo")

        # Un WebP (también RIFF) no debe pasar como AVI
        fake_avi, reason = verify_magic_bytes(b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8, "avi")
        self.assertFalse(fake_avi)
        self.assertIn(".avi", reason)

    def test_validate_and_extract_zip_preserves_windows_subfolders(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            work = Path(tmp_dir)
            win_zip = work / "lote-bat-win.zip"
            with zipfile.ZipFile(win_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("scripts\\instalar.bat", "@echo off\r\necho Hola\r\n")
                zf.writestr("scripts\\utilidades\\limpiar.bat", "@echo off\r\ndel /q temp\r\n")
                zf.writestr("carpeta/sub/nested.bat", "echo nested\r\n")

            extract_dir = work / "extracted"
            extract_dir.mkdir()
            extracted = validate_and_extract_zip(win_zip, extract_dir)
            self.assertEqual(len(extracted), 3)
            rel = sorted(str(p.relative_to(extract_dir)) for p in extracted)
            self.assertIn(str(Path("scripts/instalar.bat")), rel)
            self.assertIn(str(Path("scripts/utilidades/limpiar.bat")), rel)
            self.assertIn(str(Path("carpeta/sub/nested.bat")), rel)

            # Sigue bloqueando traversal aunque use separadores Windows
            evil_zip = work / "evil.zip"
            with zipfile.ZipFile(evil_zip, "w") as zf:
                zf.writestr("..\\..\\evil.bat", b"echo pwned")
            with self.assertRaises(ValueError):
                validate_and_extract_zip(evil_zip, extract_dir)

    def test_run_safe_subprocess_keeps_real_cause(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            with self.assertRaises(RuntimeError) as ctx:
                run_safe_subprocess(
                    [sys.executable, "-c", "import sys; sys.stderr.write('fallo simulado del codec\\n'); sys.exit(1)"],
                    cwd=Path(tmp_dir),
                    timeout_sec=30,
                )
            self.assertIn("fallo simulado del codec", str(ctx.exception))

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg no disponible en este entorno")
    def test_process_avi_video_transcodes_with_ffmpeg(self):
        from backend.app.processors import process_audio_or_video_ffmpeg

        with tempfile.TemporaryDirectory() as tmp_dir:
            work = Path(tmp_dir)
            avi_path = work / "fixture.avi"
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-y",
                    "-f", "lavfi", "-i", "testsrc=size=64x64:duration=1:rate=10",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                    "-c:v", "mpeg4", "-c:a", "pcm_s16le", "-shortest",
                    str(avi_path),
                ],
                check=True,
                capture_output=True,
            )
            out_path, mime = process_audio_or_video_ffmpeg(
                "convertir-video", avi_path, work, "mp4", {"crf": "28"}, timeout_sec=60
            )
            self.assertTrue(out_path.exists())
            self.assertGreater(out_path.stat().st_size, 0)
            self.assertEqual(mime, "video/mp4")

            out_audio, audio_mime = process_audio_or_video_ffmpeg(
                "extraer-audio-video", avi_path, work, "mp3", {"bitrate": "128k"}, timeout_sec=60
            )
            self.assertTrue(out_audio.exists())
            self.assertEqual(audio_mime, "audio/mpeg")


if __name__ == "__main__":
    unittest.main()
