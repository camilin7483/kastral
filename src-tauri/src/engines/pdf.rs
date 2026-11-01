//! PDF engines via Ghostscript: compression and PDF-to-images.
//! Mirrors the presets/DPI rules of `lib/server-processors.ts`.

use std::fs::File;
use std::io::Write;
use std::path::Path;

use serde_json::Value;

use super::{
    build_output_filename, find_bin, run_bin, str_param, user_error_from_stderr, EngineOutput,
};

pub(crate) fn resolve_preset(params: &Value) -> &'static str {
    match str_param(params, "preset").as_deref() {
        Some("screen") => "screen",
        Some("printer") => "printer",
        _ => "ebook",
    }
}

pub fn compress(
    input: &Path,
    original_name: &str,
    original_size: u64,
    params: &Value,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let preset = resolve_preset(params);
    let gs = find_bin("gs")?;
    let out_path = workdir.join("output-pdf.pdf");
    let args: Vec<String> = vec![
        "-sDEVICE=pdfwrite".into(),
        "-dCompatibilityLevel=1.4".into(),
        format!("-dPDFSETTINGS=/{preset}"),
        "-dNOPAUSE".into(),
        "-dQUIET".into(),
        "-dBATCH".into(),
        "-dSAFER".into(),
        format!("-sOutputFile={}", out_path.to_string_lossy()),
        input.to_string_lossy().into_owned(),
    ];
    if let Err(stderr) = run_bin(&gs, &args, workdir) {
        return Err(user_error_from_stderr(
            &stderr,
            "El motor PDF no pudo generar el documento comprimido.",
        ));
    }
    let size = std::fs::metadata(&out_path)
        .map_err(|_| String::from("El motor PDF no pudo generar el documento comprimido."))?
        .len();
    if size == 0 {
        return Err(String::from(
            "El motor PDF no pudo generar el documento comprimido.",
        ));
    }
    // Ghostscript output bigger than the original (tiny text-only PDFs):
    // keep the original instead, like the server does.
    if size >= original_size && original_size > 0 {
        let keep_path = workdir.join("output-pdf-keep.pdf");
        std::fs::copy(input, &keep_path)
            .map_err(|_| String::from("No se pudo conservar el documento original."))?;
        return Ok(EngineOutput {
            path: keep_path,
            filename: build_output_filename(original_name, "pdf", Some("optimizado")),
            mime: String::from("application/pdf"),
            details: String::from(
                "El PDF ya estaba optimizado: se conserva el original sin perder calidad",
            ),
        });
    }
    Ok(EngineOutput {
        path: out_path,
        filename: build_output_filename(original_name, "pdf", Some("comprimido")),
        mime: String::from("application/pdf"),
        details: format!("Perfil Ghostscript /{preset}"),
    })
}

pub(crate) fn resolve_dpi(params: &Value) -> &'static str {
    match str_param(params, "dpi").as_deref() {
        Some("96") => "96",
        Some("300") => "300",
        _ => "150",
    }
}

pub fn to_images(
    input: &Path,
    original_name: &str,
    target_format: &str,
    params: &Value,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let fmt = if target_format.to_lowercase() == "jpg" {
        "jpg"
    } else {
        "png"
    };
    let device = if fmt == "jpg" { "jpeg" } else { "png16m" };
    let dpi = resolve_dpi(params);

    let gs = find_bin("gs")?;
    let pattern = workdir.join(format!("pagina-%03d.{fmt}"));
    let args: Vec<String> = vec![
        format!("-sDEVICE={device}"),
        format!("-r{dpi}"),
        "-dFirstPage=1".into(),
        "-dLastPage=30".into(),
        "-dNOPAUSE".into(),
        "-dQUIET".into(),
        "-dBATCH".into(),
        "-dSAFER".into(),
        format!("-sOutputFile={}", pattern.to_string_lossy()),
        input.to_string_lossy().into_owned(),
    ];
    if let Err(stderr) = run_bin(&gs, &args, workdir) {
        return Err(user_error_from_stderr(
            &stderr,
            "No se pudieron renderizar páginas desde el archivo PDF.",
        ));
    }

    let mut pages: Vec<String> = std::fs::read_dir(workdir)
        .map_err(|_| String::from("No se pudieron renderizar páginas desde el archivo PDF."))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|f| f.starts_with("pagina-") && f.ends_with(&format!(".{fmt}")))
        .collect();
    pages.sort();
    if pages.is_empty() {
        return Err(String::from(
            "No se pudieron renderizar páginas desde el archivo PDF.",
        ));
    }
    let mime = if fmt == "jpg" {
        "image/jpeg"
    } else {
        "image/png"
    };
    if pages.len() == 1 {
        let single = workdir.join(&pages[0]);
        let size = std::fs::metadata(&single).map(|m| m.len()).unwrap_or(0);
        if size == 0 {
            return Err(String::from(
                "El archivo generado está vacío (0 bytes). Operación cancelada.",
            ));
        }
        return Ok(EngineOutput {
            path: single,
            filename: build_output_filename(original_name, fmt, Some("p1")),
            mime: mime.to_string(),
            details: format!("1 página renderizada a {dpi} DPI"),
        });
    }
    // Multiple pages: single ZIP like the server.
    let zip_path = workdir.join("output-paginas.zip");
    let file = File::create(&zip_path)
        .map_err(|_| String::from("No se pudieron empaquetar las páginas renderizadas."))?;
    let mut zip = zip::ZipWriter::new(file);
    for page in &pages {
        let data = std::fs::read(workdir.join(page))
            .map_err(|_| String::from("No se pudieron empaquetar las páginas renderizadas."))?;
        zip.start_file(page, zip::write::SimpleFileOptions::default())
            .map_err(|_| String::from("No se pudieron empaquetar las páginas renderizadas."))?;
        zip.write_all(&data)
            .map_err(|_| String::from("No se pudieron empaquetar las páginas renderizadas."))?;
    }
    zip.finish()
        .map_err(|_| String::from("No se pudieron empaquetar las páginas renderizadas."))?;
    Ok(EngineOutput {
        path: zip_path,
        filename: build_output_filename(original_name, "zip", Some("imagenes")),
        mime: String::from("application/zip"),
        details: format!(
            "{} páginas exportadas a {} ({dpi} DPI)",
            pages.len(),
            fmt.to_uppercase()
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal valid 1-page PDF built in-test (offsets computed, no assets).
    fn minimal_pdf() -> Vec<u8> {
        let stream = "BT /F1 12 Tf 50 150 Td (Hola) Tj ET\n";
        let objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".to_string(),
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n".to_string(),
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n".to_string(),
            format!(
                "4 0 obj\n<< /Length {} >>\nstream\n{stream}endstream\nendobj\n",
                stream.len()
            ),
        ];
        let mut out = b"%PDF-1.4\n".to_vec();
        let mut offsets = Vec::new();
        for o in &objs {
            offsets.push(out.len());
            out.extend_from_slice(o.as_bytes());
        }
        let xref = out.len();
        out.extend_from_slice(format!("xref\n0 {}\n", objs.len() + 1).as_bytes());
        out.extend_from_slice(b"0000000000 65535 f \n");
        for off in &offsets {
            out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
        }
        out.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF",
                objs.len() + 1
            )
            .as_bytes(),
        );
        out
    }

    fn workdir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("kastral-pdf-test-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn whitelists_match_server() {
        assert_eq!(resolve_preset(&serde_json::json!({})), "ebook");
        assert_eq!(
            resolve_preset(&serde_json::json!({"preset": "screen"})),
            "screen"
        );
        assert_eq!(
            resolve_preset(&serde_json::json!({"preset": "boss"})),
            "ebook"
        );
        assert_eq!(resolve_dpi(&serde_json::json!({"dpi": "72"})), "150");
        assert_eq!(resolve_dpi(&serde_json::json!({"dpi": 300})), "300");
    }

    #[test]
    fn compresses_generated_pdf() {
        find_bin("gs").expect("Ghostscript necesario para este test");
        let dir = workdir("compress");
        let input = dir.join("in.pdf");
        let bytes = minimal_pdf();
        std::fs::write(&input, &bytes).unwrap();
        let out = compress(
            &input,
            "in.pdf",
            bytes.len() as u64,
            &serde_json::json!({"preset": "screen"}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "application/pdf");
        assert!(out.path.is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn renders_generated_pdf_to_png() {
        find_bin("gs").expect("Ghostscript necesario para este test");
        let dir = workdir("render");
        let input = dir.join("in.pdf");
        std::fs::write(&input, minimal_pdf()).unwrap();
        let out = to_images(
            &input,
            "in.pdf",
            "png",
            &serde_json::json!({"dpi": "96"}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "image/png");
        assert!(out.details.contains("1 página"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
