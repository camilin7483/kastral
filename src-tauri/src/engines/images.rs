//! Image conversion via ffmpeg (png/jpg/webp/avif in/out).
//! Mirrors the format/quality/resize rules of `lib/server-processors.ts`.

use std::path::Path;

use serde_json::Value;

use super::{
    build_output_filename, find_bin, num_param, run_bin, str_param, user_error_from_stderr,
    EngineOutput,
};

const FORMATS: [&str; 4] = ["png", "jpg", "webp", "avif"];

fn mime_of(fmt: &str) -> &'static str {
    match fmt {
        "jpg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "avif" => "image/avif",
        _ => "image/webp",
    }
}

pub(crate) fn resolve_format(input: &Path, target: &str) -> Result<String, String> {
    let t = target.to_lowercase();
    if t != "keep" {
        return if FORMATS.contains(&t.as_str()) {
            Ok(t)
        } else {
            Err(String::from(
                "El formato de imagen no es compatible. Usa PNG, JPG, WebP o AVIF.",
            ))
        };
    }
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webp")
        .to_lowercase();
    let ext = if ext == "jpeg" {
        "jpg".to_string()
    } else {
        ext
    };
    if FORMATS.contains(&ext.as_str()) {
        Ok(ext)
    } else {
        Ok(String::from("webp"))
    }
}

/// Build the ffmpeg scale filter from width/height/fit params.
pub(crate) fn scale_filter(width: i64, height: i64, fit: &str, compress: bool) -> Option<String> {
    if width <= 0 && height <= 0 {
        return None;
    }
    let w = if width > 0 {
        width.to_string()
    } else {
        String::from("-1")
    };
    let h = if height > 0 {
        height.to_string()
    } else {
        String::from("-1")
    };
    match fit {
        "cover" => Some(format!(
            "scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
        )),
        "fill" => Some(format!("scale={w}:{h}")),
        _ => {
            // "inside": never enlarge when compressing (mirrors withoutEnlargement),
            // otherwise allow enlarging for explicit resizes.
            if compress {
                Some(format!(
                    "scale={w}:{h}:force_original_aspect_ratio=decrease"
                ))
            } else {
                Some(format!("scale={w}:{h}"))
            }
        }
    }
}

pub fn process(
    mode: &str,
    input: &Path,
    original_name: &str,
    target_format: &str,
    params: &Value,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let fmt = resolve_format(input, target_format)?;
    let q = num_param(params, &["quality"]);
    let quality = if q == 0 { 80 } else { q.clamp(10, 100) };
    let width = num_param(params, &["width", "maxWidth"]);
    let height = num_param(params, &["height"]);
    let fit = str_param(params, "fit").unwrap_or_else(|| String::from("inside"));

    let ffmpeg = find_bin("ffmpeg")?;
    let out_name = build_output_filename(original_name, &fmt, None);
    let out_path = workdir.join(format!("output-img.{fmt}"));

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-frames:v".into(),
        "1".into(),
    ];
    if let Some(f) = scale_filter(width, height, &fit, mode == "compress") {
        args.push("-vf".into());
        args.push(f);
    }
    match fmt.as_str() {
        "png" => {
            args.push("-c:v".into());
            args.push("png".into());
        }
        "jpg" => {
            args.push("-c:v".into());
            args.push("mjpeg".into());
            args.push("-q:v".into());
            // Map quality 10-100 to mjpeg q 31-2 (lower is better).
            args.push((31 - (quality * 29 / 100)).to_string());
            args.push("-pix_fmt".into());
            args.push("yuv420p".into());
        }
        "webp" => {
            args.push("-c:v".into());
            args.push("libwebp".into());
            args.push("-quality".into());
            args.push(quality.to_string());
        }
        "avif" => {
            // AVIF se codifica con el encoder AV1 disponible (libaom-av1,
            // presente en el sidecar y en FFmpeg de escritorio); el muxer
            // avif se elige por la extensión .avif de salida.
            args.push("-c:v".into());
            args.push("libaom-av1".into());
            args.push("-crf".into());
            // Map quality 10-100 to CRF 32-8.
            args.push((32 - (quality * 24 / 100)).to_string());
        }
        _ => unreachable!(),
    }
    args.push(out_path.to_string_lossy().into_owned());

    let stderr = match run_bin(&ffmpeg, &args, workdir) {
        Ok(_) => String::new(),
        Err(e) => e,
    };
    if !out_path.is_file() {
        if stderr.contains("Unknown encoder") {
            return Err(String::from(
                "Esta compilación de FFmpeg no trae codificador AVIF. Elige WebP o PNG.",
            ));
        }
        if !stderr.is_empty() {
            return Err(user_error_from_stderr(
                &stderr,
                "FFmpeg no pudo procesar la imagen. Verifica que el archivo sea válido.",
            ));
        }
        return Err(String::from(
            "FFmpeg no pudo procesar la imagen. Verifica que el archivo sea válido.",
        ));
    }

    let size = std::fs::metadata(&out_path)
        .map_err(|_| {
            String::from("El motor finalizó pero no generó el archivo de salida esperado.")
        })?
        .len();
    if size == 0 {
        return Err(String::from(
            "El archivo generado está vacío (0 bytes). Operación cancelada.",
        ));
    }
    // Keep the original when compression made it bigger (mirrors the server rule).
    if mode == "compress" {
        if let Ok(orig) = std::fs::metadata(input) {
            if size >= orig.len() && orig.len() > 0 {
                let keep_path = workdir.join(format!("output-img-keep.{fmt}"));
                std::fs::copy(input, &keep_path)
                    .map_err(|_| String::from("No se pudo conservar la imagen original."))?;
                return Ok(EngineOutput {
                    path: keep_path,
                    filename: build_output_filename(original_name, &fmt, Some("optimizada")),
                    mime: mime_of(&fmt).to_string(),
                    details: String::from("La imagen ya estaba optimizada: se conserva la original sin perder calidad"),
                });
            }
        }
    }

    Ok(EngineOutput {
        path: out_path,
        filename: out_name,
        mime: mime_of(&fmt).to_string(),
        details: format!("Imagen {fmt} (calidad {quality})"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn rejects_unsupported_format() {
        let err = resolve_format(Path::new("f.png"), "bmp").unwrap_err();
        assert!(err.contains("no es compatible"));
    }

    #[test]
    fn converts_generated_png_to_jpg() {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let dir = std::env::temp_dir().join("kastral-img-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=32x32:duration=1:rate=1",
                "-frames:v",
                "1",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        let out = process(
            "convert",
            &input,
            "in.png",
            "jpg",
            &serde_json::json!({"quality": 70}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "image/jpeg");
        assert!(out.path.is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn converts_generated_png_to_avif() {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let dir = std::env::temp_dir().join("kastral-img-avif-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=32x32:duration=1:rate=1",
                "-frames:v",
                "1",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        let out = process(
            "convert",
            &input,
            "in.png",
            "avif",
            &serde_json::json!({"quality": 70}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "image/avif");
        assert!(out.path.is_file());
        // AVIF real: caja ftyp en los primeros bytes.
        let bytes = std::fs::read(&out.path).unwrap();
        assert!(bytes.len() > 12);
        assert_eq!(&bytes[4..8], b"ftyp");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
