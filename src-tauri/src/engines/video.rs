//! Video conversion / compression via ffmpeg.
//! Mirrors the CRF/resolution whitelist of `lib/server-processors.ts`.

use std::path::Path;

use serde_json::Value;

use super::{
    build_output_filename, find_bin, run_bin, str_param, unsupported_codec_error,
    user_error_from_stderr, EngineOutput,
};

pub(crate) fn resolve(fmt_in: &str) -> Result<&'static str, String> {
    match fmt_in.to_lowercase().as_str() {
        "mp4" => Ok("mp4"),
        "webm" => Ok("webm"),
        "mkv" => Ok("mkv"),
        "mov" => Ok("mov"),
        "avi" => Ok("avi"),
        "flv" => Ok("flv"),
        _ => Err(String::from(
            "El formato de vídeo no es compatible. Usa MP4, WebM, MKV, MOV, AVI o FLV.",
        )),
    }
}

pub(crate) fn resolve_crf(params: &Value) -> &'static str {
    match str_param(params, "crf").as_deref() {
        Some("24") => "24",
        Some("33") => "33",
        _ => "28",
    }
}

pub(crate) fn resolve_res(params: &Value) -> &'static str {
    match str_param(params, "resolution").as_deref() {
        Some("1920") => "1920",
        Some("1280") => "1280",
        Some("854") => "854",
        _ => "original",
    }
}

/// Calidad q:v para el encoder mpeg4 (AVI), que ignora -crf en silencio:
/// se mapea el CRF elegido a un q fijo para que "comprimir" sí cambie algo.
pub(crate) fn avi_q(crf: &str) -> &'static str {
    match crf {
        "24" => "2",
        "33" => "7",
        _ => "4",
    }
}

pub(crate) fn build_args(fmt: &str, crf: &str, res: &str, input: &str, out: &str) -> Vec<String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), input.to_string()];
    if res != "original" {
        args.push("-vf".to_string());
        args.push(format!("scale='min({res},iw)':-2"));
    }
    if fmt == "webm" {
        args.extend(
            [
                "-c:v",
                "libvpx-vp9",
                "-crf",
                crf,
                "-b:v",
                "0",
                "-deadline",
                "realtime",
                "-cpu-used",
                "4",
                "-c:a",
                "libvorbis",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
    } else if fmt == "avi" {
        // AVI: mpeg4 + mp3 (códecs del contrato); mpeg4 no entiende -crf.
        args.extend(
            [
                "-c:v",
                "mpeg4",
                "-q:v",
                avi_q(crf),
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
    } else if fmt == "flv" {
        // FLV: h264 + mp3 (códecs del contrato).
        args.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                crf,
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
    } else {
        // MP4/MKV/MOV: h264 + aac; MOV usa los mismos códecs que MP4.
        // `faststart` solo existe en el multiplexor mov/mp4 (con mkv falla).
        let mut combo: Vec<&str> = vec![
            "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p",
        ];
        if fmt == "mp4" || fmt == "mov" {
            combo.push("-movflags");
            combo.push("+faststart");
        }
        combo.extend(["-c:a", "aac", "-b:a", "128k"]);
        args.extend(combo.iter().map(|s| s.to_string()));
    }
    args.push(out.to_string());
    args
}

pub fn process(
    mode: &str,
    input: &Path,
    original_name: &str,
    target_format: &str,
    params: &Value,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let fmt = resolve(target_format)?;
    let crf = resolve_crf(params);
    let res = resolve_res(params);

    let ffmpeg = find_bin("ffmpeg")?;
    let suffix = if mode == "compress" {
        Some("comprimido")
    } else {
        None
    };
    let out_name = build_output_filename(original_name, fmt, suffix);
    let out_path = workdir.join(format!("output-vid.{fmt}"));
    let args = build_args(
        fmt,
        crf,
        res,
        &input.to_string_lossy(),
        &out_path.to_string_lossy(),
    );

    if let Err(stderr) = run_bin(&ffmpeg, &args, workdir) {
        if let Some(msg) = unsupported_codec_error(&stderr) {
            return Err(msg);
        }
        return Err(user_error_from_stderr(
            &stderr,
            "FFmpeg no pudo procesar el vídeo. Verifica que el archivo sea válido.",
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

    let mime = match fmt {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "flv" => "video/x-flv",
        _ => "video/x-matroska",
    };
    let res_tag = if res != "original" {
        format!(", {res}p")
    } else {
        String::new()
    };
    Ok(EngineOutput {
        path: out_path,
        filename: out_name,
        mime: mime.to_string(),
        details: format!("Vídeo {} (CRF {crf}{res_tag})", fmt.to_uppercase()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn whitelists_and_arg_shape_match_server() {
        assert_eq!(resolve("mov").unwrap(), "mov");
        assert_eq!(resolve("AVI").unwrap(), "avi");
        assert!(resolve("wmv").is_err());
        assert_eq!(resolve_crf(&serde_json::json!({"crf": "99"})), "28");
        assert_eq!(
            resolve_res(&serde_json::json!({"resolution": "720"})),
            "original"
        );
        assert_eq!(avi_q("24"), "2");
        assert_eq!(avi_q("33"), "7");
        let args = build_args("webm", "28", "1280", "in.mp4", "out.webm");
        assert!(args.contains(&"libvpx-vp9".to_string()));
        assert!(args.iter().any(|a| a.contains("min(1280,iw)")));
        let args = build_args("avi", "28", "original", "in.mp4", "out.avi");
        assert!(args.contains(&"mpeg4".to_string()));
        assert!(args.contains(&"libmp3lame".to_string()));
        let args = build_args("flv", "28", "original", "in.mp4", "out.flv");
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"libmp3lame".to_string()));
        let args = build_args("mkv", "28", "original", "in.mp4", "out.mkv");
        assert!(!args.contains(&"+faststart".to_string()));
        let args = build_args("mov", "28", "original", "in.mp4", "out.mov");
        assert!(args.contains(&"+faststart".to_string()));
    }

    /// Genera un MP4 válido (64x64, 1 s) con el FFmpeg del sistema.
    fn gen_mp4(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let input = dir.join(name);
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x64:duration=1:rate=5",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        input
    }

    fn convert_case(fmt: &str, mime: &str) {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let _ = ffmpeg;
        let dir = std::env::temp_dir().join(format!("kastral-vid-{fmt}-test"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = gen_mp4(&dir, "in.mp4");
        let out = process(
            "convert",
            &input,
            "in.mp4",
            fmt,
            &serde_json::json!({"crf": "28"}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, mime);
        assert!(out.path.is_file());
        assert!(out.path.extension().and_then(|e| e.to_str()) == Some(fmt));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn converts_generated_mp4_to_mov() {
        convert_case("mov", "video/quicktime");
    }

    #[test]
    fn converts_generated_mp4_to_mkv() {
        convert_case("mkv", "video/x-matroska");
    }

    #[test]
    fn converts_generated_mp4_to_avi() {
        convert_case("avi", "video/x-msvideo");
    }

    #[test]
    fn converts_generated_mp4_to_flv() {
        convert_case("flv", "video/x-flv");
    }

    #[test]
    fn converts_generated_mp4() {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let dir = std::env::temp_dir().join("kastral-vid-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.mp4");
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x64:duration=1:rate=5",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        let out = process(
            "compress",
            &input,
            "in.mp4",
            "mp4",
            &serde_json::json!({"crf": "33"}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "video/mp4");
        assert!(out.filename.contains("comprimido"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn converts_generated_avi_to_mp4() {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let dir = std::env::temp_dir().join("kastral-vid-avi-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.avi");
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x64:duration=1:rate=5",
                "-c:v",
                "mpeg4",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        let out = process(
            "convert",
            &input,
            "in.avi",
            "mp4",
            &serde_json::json!({"crf": "28"}),
            &dir,
        )
        .unwrap();
        assert_eq!(out.mime, "video/mp4");
        assert!(out.path.is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unsupported_codec_message_is_honest_spanish() {
        let err = unsupported_codec_error("Decoder (codec h264) not found")
            .expect("debe detectar códec ausente");
        assert!(err.contains("códec"));
        assert!(unsupported_codec_error("todo bien").is_none());
    }
}
