# Tauri sidecar binaries

Place per-platform sidecar binaries in this directory. Tauri resolves
`bundle.externalBin` entries by appending the target triple (and `.exe`
on Windows) at bundle time. This directory is gitignored: binaries are
large and differ per target — CI downloads them per platform, never commit.

Current policy (v0.1.0):
- `binaries/ffmpeg` → BUNDLED (declared in tauri.conf `externalBin`).
  Linux: static build (e.g. imageio-ffmpeg's `ffmpeg-linux-x86_64`
  or johnvansickle.com). Windows: gyan.dev static build.
- `binaries/gs` (Ghostscript) → NOT bundled, resolved via system PATH.
  Linux users need `ghostscript` installed (`sudo pacman -S ghostscript`
  / `sudo apt install ghostscript`); the app shows an honest error
  ("Falta el motor Ghostscript en esta instalación") when missing.
  Windows bundles add the official ghostscript.com binary in CI.

Expected filenames:

- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffmpeg-x86_64-unknown-linux-gnu`
- Add `gs-<triple>` here AND to `externalBin` only when a platform
  decides to bundle Ghostscript (then update this README).

In dev (`cargo tauri dev`), sidecars are resolved via PATH: install `ffmpeg`
and `gs` on the system so the app can shell out to them without bundled binaries.
