#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engines;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
fn kastral_health() -> String {
    String::from(r#"{"status":"ok","engine":"tauri-spike"}"#)
}

fn json_failed(msg: &str) -> String {
    serde_json::json!({"status": "failed", "error": msg}).to_string()
}

/// Desktop processing entry point: decodes the input file, dispatches to the
/// Rust engine matching `tool_slug`, and returns the output as base64 JSON.
/// The temp workdir is always removed.
#[tauri::command]
fn kastral_process(
    tool_slug: String,
    file_name: String,
    target_format: String,
    params_json: String,
    data_b64: String,
) -> String {
    let workdir = make_workdir();
    if std::fs::create_dir_all(&workdir).is_err() {
        return json_failed("No se pudo preparar el espacio de trabajo temporal.");
    }
    let result = kastral_process_inner(
        &workdir,
        &tool_slug,
        &file_name,
        &target_format,
        &params_json,
        &data_b64,
    );
    let _ = std::fs::remove_dir_all(&workdir);
    result
}

fn make_workdir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("kastral-tauri-{}-{nanos}", std::process::id()))
}

fn kastral_process_inner(
    workdir: &std::path::Path,
    tool_slug: &str,
    file_name: &str,
    target_format: &str,
    params_json: &str,
    data_b64: &str,
) -> String {
    let params: serde_json::Value = if params_json.trim().is_empty() {
        serde_json::Value::Null
    } else {
        match serde_json::from_str(params_json) {
            Ok(v) => v,
            Err(_) => return json_failed("Los parámetros de la herramienta no son válidos."),
        }
    };
    let data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data_b64.trim()) {
            Ok(d) if !d.is_empty() => d,
            _ => return json_failed("No se pudo leer el archivo recibido."),
        };

    let safe_name = engines::sanitize_filename(file_name);
    if let Err(e) = engines::validate_input(&data, &safe_name) {
        return json_failed(&e);
    }
    let ext = safe_name
        .rsplit('.')
        .next()
        .filter(|_| safe_name.contains('.'))
        .unwrap_or("bin")
        .to_lowercase();
    let ext: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(10)
        .collect();
    let ext = if ext.is_empty() {
        String::from("bin")
    } else {
        ext
    };
    let input_path = workdir.join(format!("input.{ext}"));
    if std::fs::write(&input_path, &data).is_err() {
        return json_failed("No se pudo preparar el espacio de trabajo temporal.");
    }
    let original_size = data.len() as u64;

    let out: Result<engines::EngineOutput, String> = match tool_slug {
        "convertir-imagen" => engines::images::process(
            "convert",
            &input_path,
            &safe_name,
            target_format,
            &params,
            workdir,
        ),
        "comprimir-imagen" => engines::images::process(
            "compress",
            &input_path,
            &safe_name,
            target_format,
            &params,
            workdir,
        ),
        "redimensionar-imagen" => engines::images::process(
            "resize",
            &input_path,
            &safe_name,
            target_format,
            &params,
            workdir,
        ),
        "comprimir-pdf" => {
            engines::pdf::compress(&input_path, &safe_name, original_size, &params, workdir)
        }
        "pdf-a-imagenes" => {
            engines::pdf::to_images(&input_path, &safe_name, target_format, &params, workdir)
        }
        "convertir-audio" | "extraer-audio-video" => {
            engines::audio::process(&input_path, &safe_name, target_format, &params, workdir)
        }
        "convertir-video" => engines::video::process(
            "convert",
            &input_path,
            &safe_name,
            target_format,
            &params,
            workdir,
        ),
        "comprimir-video" => engines::video::process(
            "compress",
            &input_path,
            &safe_name,
            target_format,
            &params,
            workdir,
        ),
        "convertir-documento" => {
            engines::document::process(&input_path, &safe_name, target_format, workdir)
        }
        _ => {
            return json_failed(&format!(
                "La herramienta \"{tool_slug}\" no está disponible en la aplicación de escritorio."
            ))
        }
    };

    let out = match out {
        Ok(o) => o,
        Err(e) => return json_failed(&e),
    };
    let bytes = match std::fs::read(&out.path) {
        Ok(b) if !b.is_empty() => b,
        _ => return json_failed("El motor finalizó pero no generó el archivo de salida esperado."),
    };
    serde_json::json!({
        "status": "completed",
        "output_filename": out.filename,
        "output_size": bytes.len(),
        "output_mime_type": out.mime,
        "details": out.details,
        "data_b64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes),
    })
    .to_string()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![kastral_health, kastral_process])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::engines;

    #[test]
    fn output_naming_matches_server() {
        assert_eq!(
            engines::build_output_filename("Foto.PNG", "webp", None),
            "Foto.webp"
        );
        assert_eq!(
            engines::build_output_filename("doc.pdf", "pdf", Some("comprimido")),
            "doc-comprimido.pdf"
        );
        assert_eq!(engines::sanitize_filename("../../etc/passwd"), "passwd");
    }

    #[test]
    fn missing_binary_message_is_spanish() {
        let err = engines::find_bin("kastral-motor-inexistente").unwrap_err();
        assert!(err.contains("Falta el motor"));
    }

    /// 1x1 PNG built inline (no assets): decodes to real PNG magic bytes.
    const PNG_1PX_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    /// Minimal valid WAV (8 kHz mono silence) built in-test.
    fn minimal_wav() -> Vec<u8> {
        let samples: u32 = 8000;
        let mut out = Vec::with_capacity(44 + samples as usize * 2);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + samples * 2).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&8000u32.to_le_bytes());
        out.extend_from_slice(&16000u32.to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(samples * 2).to_le_bytes());
        out.extend(std::iter::repeat(0u8).take(samples as usize * 2));
        out
    }

    /// Minimal valid 1-page PDF built in-test (no assets).
    fn minimal_pdf() -> Vec<u8> {
        let stream = "BT /F1 12 Tf 50 150 Td (Hola) Tj ET\n";
        let objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".to_string(),
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n".to_string(),
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n".to_string(),
            format!("4 0 obj\n<< /Length {} >>\nstream\n{stream}endstream\nendobj\n", stream.len()),
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

    fn b64(data: &[u8]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
    }

    fn completed(out: &str) -> serde_json::Value {
        let v: serde_json::Value = serde_json::from_str(out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "completed", "respuesta: {out}");
        assert!(v["output_size"].as_u64().unwrap_or(0) > 0);
        let raw = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            v["data_b64"].as_str().unwrap_or(""),
        )
        .expect("data_b64 decodifica");
        assert!(!raw.is_empty());
        v
    }

    #[test]
    fn e2e_convertir_imagen_png_a_jpg() {
        engines::find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let out = super::kastral_process(
            "convertir-imagen".into(),
            "foto.png".into(),
            "jpg".into(),
            "{}".into(),
            PNG_1PX_B64.into(),
        );
        let v = completed(&out);
        assert_eq!(v["output_mime_type"], "image/jpeg");
    }

    #[test]
    fn e2e_convertir_audio_wav_a_mp3() {
        engines::find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let out = super::kastral_process(
            "convertir-audio".into(),
            "nota.wav".into(),
            "mp3".into(),
            "{}".into(),
            b64(&minimal_wav()),
        );
        let v = completed(&out);
        assert_eq!(v["output_mime_type"], "audio/mpeg");
    }

    #[test]
    fn e2e_comprimir_pdf() {
        engines::find_bin("gs").expect("Ghostscript necesario para este test");
        let out = super::kastral_process(
            "comprimir-pdf".into(),
            "doc.pdf".into(),
            "pdf".into(),
            "{}".into(),
            b64(&minimal_pdf()),
        );
        let v = completed(&out);
        assert_eq!(v["output_mime_type"], "application/pdf");
    }

    #[test]
    fn e2e_rechaza_pdf_falso_en_espanol() {
        let out = super::kastral_process(
            "comprimir-pdf".into(),
            "doc.pdf".into(),
            "pdf".into(),
            "{}".into(),
            b64(b"hola mundo, esto no es un pdf real"),
        );
        let v: serde_json::Value = serde_json::from_str(&out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "failed");
        let msg = v["error"].as_str().unwrap_or("");
        assert!(!msg.is_empty() && msg.contains("PDF"), "mensaje: {msg}");
    }
}
