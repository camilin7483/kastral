# Tauri sidecar binaries

Place per-platform sidecar binaries in this directory. Tauri resolves
`bundle.externalBin` entries (`binaries/ffmpeg`, `binaries/gs`) by appending
the target triple (and `.exe` on Windows) at bundle time.

Expected filenames:

- `ffmpeg-x86_64-pc-windows-msvc.exe` / `gs-x86_64-pc-windows-msvc.exe`
- `ffmpeg-x86_64-unknown-linux-gnu` / `gs-x86_64-unknown-linux-gnu`
- Add further triples (e.g. `aarch64-apple-darwin`) following the same pattern
  if macOS targets are enabled later.

Where to download builds:

- ffmpeg: gyan.dev (Windows static builds) / johnvansickle.com (Linux static builds).
- Ghostscript: ghostscript.com (official releases).

In dev (`cargo tauri dev`), sidecars are resolved via PATH: install `ffmpeg`
and `gs` on the system so the app can shell out to them without bundled binaries.
