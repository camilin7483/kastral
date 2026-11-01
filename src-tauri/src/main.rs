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
}
