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
