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
from backend.app.processors import create_safe_zip_archive, validate_and_extract_zip


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


if __name__ == "__main__":
    unittest.main()
