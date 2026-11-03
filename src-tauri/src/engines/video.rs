//! Video conversion / compression via ffmpeg.
//! Mirrors the CRF/resolution whitelist of `lib/server-processors.ts`.

use std::path::Path;

use serde_json::Value;

use super::{
    build_output_filename, find_bin, run_bin, str_param, unsupported_codec_error,
    user_error_from_stderr, EngineOutput,
};

pub(crate) fn resolve(fmt_in: &str) -> &'static str {
    match fmt_in.to_lowercase().as_str() {
        "mp4" => "mp4",
        "webm" => "webm",
        "mkv" => "mkv",
        _ => "mp4",
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
    } else {
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
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
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
    let fmt = resolve(target_format);
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
        assert_eq!(resolve("AVI"), "mp4");
        assert_eq!(resolve_crf(&serde_json::json!({"crf": "99"})), "28");
        assert_eq!(
            resolve_res(&serde_json::json!({"resolution": "720"})),
            "original"
        );
        let args = build_args("webm", "28", "1280", "in.mp4", "out.webm");
        assert!(args.contains(&"libvpx-vp9".to_string()));
        assert!(args.iter().any(|a| a.contains("min(1280,iw)")));
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
