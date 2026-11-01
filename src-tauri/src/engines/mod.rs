//! Shared helpers for the desktop media engines.
//! Mirrors the user-facing messages (Spanish) of `lib/server-processors.ts`.

pub mod audio;
pub mod document;
pub mod images;
pub mod pdf;
pub mod video;

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

/// Successful engine result: file written inside the task workdir.
#[derive(Debug)]
pub struct EngineOutput {
    pub path: PathBuf,
    pub filename: String,
    pub mime: String,
    pub details: String,
}

/// Replica of `buildOutputFilename` from `lib/file-utils.ts`.
pub fn build_output_filename(
    original_name: &str,
    target_ext: &str,
    suffix: Option<&str>,
) -> String {
    let safe = sanitize_filename(original_name);
    let base = match safe.rfind('.') {
        Some(i) if i > 0 => &safe[..i],
        _ => safe.as_str(),
    };
    let ext = target_ext.trim_start_matches('.').to_lowercase();
    match suffix {
        Some(s) => format!("{base}-{s}.{ext}"),
        None => format!("{base}.{ext}"),
    }
}

/// Keeps only the file name, dropping any directory components.
pub fn sanitize_filename(raw: &str) -> String {
    let normalized = raw.replace('\\', "/");
    let base = normalized.rsplit('/').next().unwrap_or(raw);
    let clean: String = base.chars().filter(|c| !c.is_control()).collect();
    let clean = clean.trim();
    if clean.is_empty() || clean == "." || clean == ".." {
        return String::from("archivo");
    }
    clean.to_string()
}

/// Maximum accepted input size: 50 MB (mirrors the desktop tool limits).
pub const MAX_INPUT_BYTES: usize = 50 * 1024 * 1024;

/// Crea el directorio de trabajo de una tarea: nombre aleatorio de 128 bits
/// generado por el RNG del SO, creación exclusiva (falla si ya existe) y
/// modo 0o700 en Unix. Espeja el aislamiento del servidor
/// (`crypto.randomUUID()` + `mkdir 0o700` en `lib/server-processors.ts`).
pub fn make_workdir() -> PathBuf {
    for _ in 0..16 {
        let mut rnd = [0u8; 16];
        if getrandom::fill(&mut rnd).is_err() {
            break;
        }
        let hex: String = rnd.iter().map(|b| format!("{b:02x}")).collect();
        let dir = std::env::temp_dir().join(format!("kastral-tauri-{hex}"));
        #[cfg(unix)]
        let created = {
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new().mode(0o700).create(&dir)
        };
        #[cfg(not(unix))]
        let created = std::fs::create_dir(&dir);
        // `create` (no `create_all`) es exclusiva: si el nombre ya existe se
        // reintenta con otro valor aleatorio en lugar de reutilizarlo.
        if created.is_ok() {
            return dir;
        }
    }
    // Fallback si el RNG falla (no debería ocurrir): nombre único no
    // aleatorio; el llamador valida con `create_dir_all`.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("kastral-tauri-{}-{nanos}", std::process::id()))
}

/// Port of `verifyMagicBytes` from `lib/file-utils.ts`: rejects empty,
/// oversized, or spoofed files before any temp file is written.
/// All errors are user-facing Spanish messages.
pub fn validate_input(data: &[u8], file_name: &str) -> Result<(), String> {
    if data.is_empty() {
        return Err(String::from("El archivo está vacío (0 bytes)."));
    }
    if data.len() > MAX_INPUT_BYTES {
        return Err(String::from(
            "El archivo supera el límite de 50 MB permitido en la aplicación de escritorio.",
        ));
    }
    let ext = file_name
        .rsplit('.')
        .next()
        .filter(|_| file_name.contains('.'))
        .unwrap_or("")
        .to_lowercase();
    if ext.is_empty() {
        return Ok(()); // Sin extensión: como '*' en el servidor.
    }
    let b = |i: usize| *data.get(i).unwrap_or(&0);
    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if ext == "pdf" {
        let ok = b(0) == 0x25 && b(1) == 0x50 && b(2) == 0x44 && b(3) == 0x46;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una cabecera PDF válida (%PDF)."));
    }
    // PNG: 89 50 4E 47
    if ext == "png" {
        let ok = b(0) == 0x89 && b(1) == 0x50 && b(2) == 0x4E && b(3) == 0x47;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una firma binaria PNG válida."));
    }
    // JPG / JPEG: FF D8 FF
    if ext == "jpg" || ext == "jpeg" {
        let ok = b(0) == 0xFF && b(1) == 0xD8 && b(2) == 0xFF;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una firma binaria JPEG válida."));
    }
    // GIF: GIF87a o GIF89a
    if ext == "gif" {
        let ok = b(0) == 0x47 && b(1) == 0x49 && b(2) == 0x46 && b(3) == 0x38;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una cabecera GIF válida."));
    }
    // BMP: "BM"
    if ext == "bmp" {
        let ok = b(0) == 0x42 && b(1) == 0x4D;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una cabecera BMP válida."));
    }
    // WEBP: RIFF....WEBP
    if ext == "webp" {
        let ok = data.len() >= 12
            && b(0) == 0x52
            && b(1) == 0x49
            && b(2) == 0x46
            && b(3) == 0x46
            && b(8) == 0x57
            && b(9) == 0x45
            && b(10) == 0x42
            && b(11) == 0x50;
        return ok
            .then_some(())
            .ok_or_else(|| String::from("El archivo no tiene una cabecera RIFF/WEBP válida."));
    }
    // ZIP / DOCX / XLSX / ODS (contenedor PK)
    if ["zip", "docx", "xlsx", "ods"].contains(&ext.as_str()) {
        let ok = b(0) == 0x50 && b(1) == 0x4B && (b(2) == 0x03 || b(2) == 0x05);
        return ok.then_some(()).ok_or_else(|| {
            format!("El archivo .{ext} no contiene una estructura comprimida PKZIP válida.")
        });
    }
    // TXT / CSV / MD / RTF: rechaza binarios con nulos masivos.
    if ["txt", "csv", "md", "rtf"].contains(&ext.as_str()) {
        let nulls = data.iter().take(512).filter(|&&c| c == 0x00).count();
        if nulls > 2 {
            return Err(String::from(
                "El archivo parece ser un binario ejecutable o corrupto en lugar de un documento de texto.",
            ));
        }
        return Ok(());
    }
    // Otros formatos multimedia: cabecera mínima; FFmpeg valida a fondo.
    if data.len() < 12 {
        return Err(String::from(
            "El archivo es demasiado pequeño o está truncado.",
        ));
    }
    Ok(())
}

/// Locate `ffmpeg` / `gs` in PATH (or next to the executable for future sidecars).
/// Never leaks internal paths: the error is a plain user-facing message.
pub fn find_bin(name: &str) -> Result<PathBuf, String> {
    let missing = |n: &str| {
        if n == "gs" {
            String::from("Falta el motor Ghostscript en esta instalación.")
        } else {
            String::from("Falta el motor FFmpeg en esta instalación.")
        }
    };
    // Sibling of the current executable (Tauri sidecars live there).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [name.to_string(), format!("{name}.exe")] {
                let p = dir.join(candidate);
                if p.is_file() {
                    return Ok(p);
                }
            }
        }
    }
    // PATH lookup without extra crates.
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            for candidate in [name.to_string(), format!("{name}.exe")] {
                let p = dir.join(candidate);
                if p.is_file() {
                    return Ok(p);
                }
            }
        }
    }
    Err(missing(name))
}

/// Run an external binary and return stdout; on failure return the raw
/// stderr so each engine can map it to a short user-facing message in
/// Spanish with no internal paths (mirrors `summarizeToolError`).
pub fn run_bin(bin: &Path, args: &[String], cwd: &Path) -> Result<String, String> {
    let out = Command::new(bin)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|_| String::from("No se pudo iniciar el motor de conversión."))?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
    }
    Err(String::from_utf8_lossy(&out.stderr).into_owned())
}

fn looks_like_path(tok: &str) -> bool {
    (tok.starts_with('/') && tok.contains('/')) || tok.contains(":\\") || tok.contains(":/")
}

/// Variant that masks on token level (keeps ffmpeg's "key=value: ..." hints).
pub fn user_error_from_stderr(stderr: &str, fallback: &str) -> String {
    let last = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .next_back()
        .unwrap_or(fallback);
    let masked: Vec<&str> = last.split_whitespace().collect();
    let masked: Vec<String> = masked
        .into_iter()
        .map(|t| {
            if looks_like_path(t) || t.contains("kastral-tauri-") {
                String::from("[archivo]")
            } else {
                t.to_string()
            }
        })
        .collect();
    let mut msg = masked.join(" ");
    if msg.is_empty() {
        msg = fallback.to_string();
    }
    if msg.len() > 300 {
        msg = format!("{}...", &msg[..297]);
    }
    msg
}

pub fn str_param(params: &Value, key: &str) -> Option<String> {
    params.get(key).and_then(|v| {
        v.as_str()
            .map(|s| s.to_string())
            .or_else(|| v.as_u64().map(|n| n.to_string()))
    })
}

pub fn num_param(params: &Value, keys: &[&str]) -> i64 {
    for k in keys {
        if let Some(v) = params.get(*k) {
            if let Some(n) = v.as_i64() {
                return n;
            }
            if let Some(s) = v.as_str() {
                if let Ok(n) = s.parse::<i64>() {
                    return n;
                }
            }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_pdf_and_rejects_spoofed() {
        let pdf = b"%PDF-1.4\n1 0 obj\n".to_vec();
        assert!(validate_input(&pdf, "doc.pdf").is_ok());
        let fake = b"hola mundo, soy texto plano".to_vec();
        let err = validate_input(&fake, "doc.pdf").unwrap_err();
        assert!(err.contains("cabecera PDF"));
    }

    #[test]
    fn rejects_png_spoof() {
        let fake = b"esto no es una imagen png".to_vec();
        let err = validate_input(&fake, "foto.png").unwrap_err();
        assert!(err.contains("PNG"));
        let real = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        assert!(validate_input(&real, "foto.png").is_ok());
    }

    #[test]
    fn accepts_zip_container() {
        let zip = [0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(validate_input(&zip, "arch.zip").is_ok());
        let err = validate_input(b"texto plano sin pk", "arch.zip").unwrap_err();
        assert!(err.contains("PKZIP"));
    }

    #[test]
    fn accepts_mp3_header_and_rejects_truncated() {
        let mp3 = *b"ID3\x04\x00\x00\x00\x00\x01\x02\x03\x04\x05";
        assert!(validate_input(&mp3, "tema.mp3").is_ok());
        let err = validate_input(b"ID3\x04", "tema.mp3").unwrap_err();
        assert!(err.contains("truncado"));
    }

    #[test]
    fn accepts_xlsx_container() {
        let xlsx = [0x50, 0x4B, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 0, 0];
        assert!(validate_input(&xlsx, "tabla.xlsx").is_ok());
    }

    #[test]
    fn rejects_empty_and_oversized() {
        let err = validate_input(&[], "doc.pdf").unwrap_err();
        assert!(err.contains("vacío"));
        let big = vec![0x25u8; MAX_INPUT_BYTES + 1];
        let err = validate_input(&big, "doc.pdf").unwrap_err();
        assert!(err.contains("50 MB"));
    }

    #[test]
    fn workdir_is_exclusive_and_private() {
        let a = make_workdir();
        let b = make_workdir();
        assert_ne!(a, b);
        assert!(a.is_dir() && b.is_dir());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(a.metadata().unwrap().permissions().mode() & 0o777, 0o700);
        }
        std::fs::remove_dir(&a).unwrap();
        std::fs::remove_dir(&b).unwrap();
    }
}
