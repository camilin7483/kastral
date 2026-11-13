#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engines;

/// Longitud máxima del base64 de entrada: 4/3 del límite de bytes más
/// margen para padding y saltos de línea. Se rechaza ANTES de decodificar
/// para no reservar memoria desproporcionada ante entradas hostiles.
const MAX_B64_LEN: usize = 4 * engines::MAX_INPUT_BYTES / 3 + 4096;

/// Los resultados generados pueden ser mayores que la entrada (por ejemplo,
/// un ZIP de varios archivos). El guardado nativo admite hasta 100 MB.
const MAX_SAVE_BYTES: usize = 100 * 1024 * 1024;
const MAX_SAVE_B64_LEN: usize = 4 * MAX_SAVE_BYTES / 3 + 4096;

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
    if data_b64.len() > MAX_B64_LEN {
        return json_failed(
            "El archivo supera el límite de 50 MB permitido en la aplicación de escritorio.",
        );
    }
    let workdir = engines::make_workdir();
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            kastral_process,
            kastral_save_output
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Devuelve una ruta dentro de `dir` sin colisionar: `archivo.ext`,
/// luego `archivo (1).ext`, `archivo (2).ext`, ... hasta 999; después
/// añade una marca de tiempo para garantizar progreso.
fn unique_output_path(dir: &std::path::Path, filename: &str) -> std::path::PathBuf {
    let (stem, ext) = match filename.rfind('.') {
        Some(i) if i > 0 => (&filename[..i], Some(&filename[i + 1..])),
        _ => (filename, None),
    };
    let first = dir.join(filename);
    if !first.exists() {
        return first;
    }
    for n in 1..=999 {
        let name = match ext {
            Some(e) => format!("{stem} ({n}).{e}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let name = match ext {
        Some(e) => format!("{stem}-{nanos}.{e}"),
        None => format!("{stem}-{nanos}"),
    };
    dir.join(name)
}

/// Lógica del guardado sin depender de Tauri: valida, decodifica,
/// sanea el nombre, elige ruta única dentro de `dir` y escribe.
/// `dir` debe ser la carpeta de Descargas ya creada por el llamador.
fn kastral_save_output_inner(dir: &std::path::Path, file_name: &str, data_b64: &str) -> String {
    if data_b64.len() > MAX_SAVE_B64_LEN {
        return json_failed(
            "El resultado supera el límite de 100 MB permitido para guardar en la aplicación de escritorio.",
        );
    }
    let data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data_b64.trim()) {
            Ok(d) if !d.is_empty() => d,
            _ => return json_failed("No se pudo leer el archivo recibido."),
        };
    let mut safe = engines::sanitize_filename(file_name);
    if safe.is_empty() {
        safe = String::from("kastral-resultado.bin");
    }
    let target = unique_output_path(dir, &safe);
    if std::fs::write(&target, &data).is_err() {
        return json_failed("No se pudo guardar el archivo en la carpeta de Descargas.");
    }
    let filename = target
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or(safe);
    serde_json::json!({
        "status": "completed",
        "path": target.to_string_lossy(),
        "filename": filename,
        "size": data.len(),
    })
    .to_string()
}

/// Guarda el resultado en la carpeta de Descargas del SO y devuelve
/// un JSON con la ruta final. Nunca escribe fuera de Descargas.
#[tauri::command]
fn kastral_save_output(app: tauri::AppHandle, file_name: String, data_b64: String) -> String {
    use tauri::Manager;
    let dir = match app.path().download_dir() {
        Ok(d) => d,
        Err(_) => return json_failed("No se pudo localizar la carpeta de Descargas."),
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return json_failed("No se pudo preparar la carpeta de Descargas.");
    }
    kastral_save_output_inner(&dir, &file_name, &data_b64)
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
    fn rechaza_b64_sobredimensionado_antes_de_decodificar() {
        let too_big = "A".repeat(super::MAX_B64_LEN + 1);
        let out = super::kastral_process(
            "comprimir-pdf".into(),
            "doc.pdf".into(),
            "pdf".into(),
            "{}".into(),
            too_big,
        );
        let v: serde_json::Value = serde_json::from_str(&out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "failed");
        let msg = v["error"].as_str().unwrap_or("");
        assert!(msg.contains("50 MB"), "mensaje: {msg}");
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

    fn temp_test_dir(tag: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "kastral-save-test-{}-{}-{nanos}",
            std::process::id(),
            tag
        ));
        std::fs::create_dir_all(&dir).expect("crear dir temporal de test");
        dir
    }

    #[test]
    fn unique_path_respeta_colisiones_y_extension() {
        let dir = temp_test_dir("colision");
        assert_eq!(
            super::unique_output_path(&dir, "archivo.pdf"),
            dir.join("archivo.pdf")
        );
        std::fs::write(dir.join("archivo.pdf"), b"x").unwrap();
        assert_eq!(
            super::unique_output_path(&dir, "archivo.pdf"),
            dir.join("archivo (1).pdf")
        );
        std::fs::write(dir.join("archivo (1).pdf"), b"x").unwrap();
        assert_eq!(
            super::unique_output_path(&dir, "archivo.pdf"),
            dir.join("archivo (2).pdf")
        );
        std::fs::write(dir.join("nota"), b"x").unwrap();
        assert_eq!(
            super::unique_output_path(&dir, "nota"),
            dir.join("nota (1)")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_saneado_no_escapa_de_descargas() {
        let dir = temp_test_dir("escape");
        let safe = engines::sanitize_filename("../../etc/passwd");
        assert_eq!(safe, "passwd");
        let target = super::unique_output_path(&dir, &safe);
        assert_eq!(target.parent(), Some(dir.as_path()));
        assert!(target.starts_with(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_rechaza_base64_invalido_en_espanol() {
        let dir = temp_test_dir("invalido");
        let out = super::kastral_save_output_inner(&dir, "salida.pdf", "!!!no-es-base64!!!");
        let v: serde_json::Value = serde_json::from_str(&out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "failed");
        let msg = v["error"].as_str().unwrap_or("");
        assert!(!msg.is_empty(), "mensaje vacío");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_rechaza_b64_sobredimensionado_antes_de_decodificar() {
        let dir = temp_test_dir("grande");
        let too_big = "A".repeat(super::MAX_SAVE_B64_LEN + 1);
        let out = super::kastral_save_output_inner(&dir, "salida.pdf", &too_big);
        let v: serde_json::Value = serde_json::from_str(&out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "failed");
        let msg = v["error"].as_str().unwrap_or("");
        assert!(msg.contains("100 MB"), "mensaje: {msg}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_exito_escribe_dentro_del_dir() {
        let dir = temp_test_dir("exito");
        let payload = b"hola kastral".to_vec();
        let out = super::kastral_save_output_inner(&dir, "hola.txt", &b64(&payload));
        let v: serde_json::Value = serde_json::from_str(&out).expect("respuesta JSON válida");
        assert_eq!(v["status"], "completed", "respuesta: {out}");
        let path = v["path"].as_str().expect("path presente");
        let name = v["filename"].as_str().expect("filename presente");
        assert_eq!(v["size"].as_u64().unwrap_or(0), payload.len() as u64);
        let written = std::path::PathBuf::from(path);
        assert!(written.starts_with(&dir), "fuera del dir: {path}");
        assert_eq!(written.file_name().unwrap().to_string_lossy(), name);
        assert_eq!(std::fs::read(&written).unwrap(), payload);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
