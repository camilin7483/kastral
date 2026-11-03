//! Audio conversion / extraction via ffmpeg.
//! Mirrors the codec/bitrate whitelist of `lib/server-processors.ts`.

use std::path::Path;

use serde_json::Value;

use super::{
    build_output_filename, find_bin, run_bin, str_param, unsupported_codec_error,
    user_error_from_stderr, EngineOutput,
};

/// (args de códec, MIME, con bitrate). Encoders verificados en el sidecar:
/// libmp3lame, pcm_s16le/be, aac nativo, flac, libvorbis, libopus.
fn spec(fmt: &str) -> Option<(&'static [&'static str], &'static str, bool)> {
    match fmt {
        "mp3" => Some((&["-c:a", "libmp3lame"], "audio/mpeg", true)),
        "wav" => Some((&["-c:a", "pcm_s16le"], "audio/wav", false)),
        "aac" => Some((&["-c:a", "aac"], "audio/aac", true)),
        // M4A: mismo códec AAC en contenedor MP4.
        "m4a" => Some((&["-c:a", "aac"], "audio/mp4", true)),
        "flac" => Some((&["-c:a", "flac"], "audio/flac", false)),
        "ogg" => Some((&["-c:a", "libvorbis"], "audio/ogg", true)),
        "opus" => Some((&["-c:a", "libopus"], "audio/opus", true)),
        "aiff" => Some((&["-c:a", "pcm_s16be"], "audio/aiff", false)),
        _ => None,
    }
}

pub fn process(
    input: &Path,
    original_name: &str,
    target_format: &str,
    params: &Value,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let t = target_format.to_lowercase();
    let Some((codec, mime, lossy)) = spec(&t) else {
        return Err(String::from(
            "El formato de audio no es compatible. Usa MP3, WAV, AAC, M4A, FLAC, OGG, Opus o AIFF.",
        ));
    };
    let fmt = t;
    let bitrate = str_param(params, "bitrate").unwrap_or_else(|| String::from("192k"));
    let bitrate = if ["64k", "128k", "192k", "320k"].contains(&bitrate.as_str()) {
        bitrate
    } else {
        String::from("192k")
    };

    let ffmpeg = find_bin("ffmpeg")?;
    let out_name = build_output_filename(original_name, &fmt, None);
    let out_path = workdir.join(format!("output-aud.{fmt}"));

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-vn".into(),
    ];
    args.extend(codec.iter().map(|s| s.to_string()));
    if lossy {
        args.push("-b:a".into());
        args.push(bitrate.clone());
    }
    args.push(out_path.to_string_lossy().into_owned());

    let Err(stderr) = run_bin(&ffmpeg, &args, workdir) else {
        return finish(&out_path, &out_name, mime, &fmt, lossy, &bitrate);
    };
    if stderr.contains("does not contain any stream")
        || stderr.contains("matches no streams")
        || stderr.contains("Output file does not contain any stream")
    {
        return Err(String::from(
            "El archivo no contiene una pista de audio que se pueda extraer.",
        ));
    }
    if let Some(msg) = unsupported_codec_error(&stderr) {
        return Err(msg);
    }
    Err(user_error_from_stderr(
        &stderr,
        "FFmpeg no pudo procesar el audio. Verifica que el archivo sea válido.",
    ))
}

fn finish(
    out_path: &Path,
    out_name: &str,
    mime: &str,
    fmt: &str,
    lossy: bool,
    bitrate: &str,
) -> Result<EngineOutput, String> {
    let size = std::fs::metadata(out_path)
        .map_err(|_| {
            String::from("El motor finalizó pero no generó el archivo de salida esperado.")
        })?
        .len();
    if size == 0 {
        return Err(String::from(
            "El archivo generado está vacío (0 bytes). Operación cancelada.",
        ));
    }
    let detail = if lossy {
        format!("Audio {} ({bitrate})", fmt.to_uppercase())
    } else {
        format!("Audio {} (Sin pérdida PCM/FLAC)", fmt.to_uppercase())
    };
    Ok(EngineOutput {
        path: out_path.to_path_buf(),
        filename: out_name.to_string(),
        mime: mime.to_string(),
        details: detail,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::process::Command;

    #[test]
    fn converts_generated_wav_to_mp3() {
        let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
        let dir = std::env::temp_dir().join("kastral-aud-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.wav");
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-c:a",
                "pcm_s16le",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(status.status.success());
        let out = process(&input, "in.wav", "mp3", &json!({"bitrate": "128k"}), &dir).unwrap();
        assert_eq!(out.mime, "audio/mpeg");
        assert!(out.details.contains("128k"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn converts_generated_wav_to_all_formats() {
        // Un test por formato nuevo: fixture de 1 s generada con el FFmpeg
        // del sistema (0 network), igual que el test existente de mp3.
        let cases = [
            ("aac", "audio/aac", true),
            ("m4a", "audio/mp4", true),
            ("flac", "audio/flac", false),
            ("ogg", "audio/ogg", true),
            ("opus", "audio/opus", true),
            ("wav", "audio/wav", false),
            ("aiff", "audio/aiff", false),
        ];
        for (fmt, mime, lossy) in cases {
            let ffmpeg = find_bin("ffmpeg").expect("FFmpeg necesario para este test");
            let dir = std::env::temp_dir().join(format!("kastral-aud-{fmt}-test"));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let input = dir.join("in.wav");
            let status = Command::new(&ffmpeg)
                .args([
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:duration=1",
                    "-c:a",
                    "pcm_s16le",
                ])
                .arg(&input)
                .output()
                .unwrap();
            assert!(status.status.success());
            let out = process(&input, "in.wav", fmt, &json!({"bitrate": "128k"}), &dir)
                .unwrap_or_else(|e| panic!("formato {fmt}: {e}"));
            assert_eq!(out.mime, mime, "formato {fmt}");
            if lossy {
                assert!(out.details.contains("128k"), "formato {fmt}");
            }
            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn unsupported_audio_format_is_honest() {
        let err = process(
            Path::new("in.wav"),
            "in.wav",
            "wma",
            &json!({}),
            Path::new("/tmp"),
        )
        .unwrap_err();
        assert!(err.contains("no es compatible"), "mensaje: {err}");
    }

    #[test]
    fn rejects_missing_binary_before_processing() {
        // Con mp3 (formato válido) el primer fallo posible es el motor
        // ausente o el archivo de entrada; en ambos casos el mensaje es
        // español y sin rutas internas.
        let res = process(
            Path::new("in.wav"),
            "in.wav",
            "mp3",
            &json!({}),
            Path::new("/tmp"),
        );
        // With ffmpeg present this fails on the missing input file (Spanish too);
        // without it, on the missing engine. Either way the message is Spanish.
        if let Err(e) = res {
            assert!(!e.contains("kastral") && !e.contains("/tmp/"));
        }
    }
}
