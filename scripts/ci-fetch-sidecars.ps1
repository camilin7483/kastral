# Fetch Tauri sidecar binaries for Windows CI.
# Copies the choco-installed ffmpeg.exe and gswin64c.exe into
# src-tauri/binaries/ with the target-triple names Tauri expects.
# NOTE: for the gs sidecar to actually bundle, "binaries/gs" must be added
# to bundle.externalBin in tauri.conf.json (currently only ffmpeg is declared).
$ErrorActionPreference = 'Stop'

$OutDir = Join-Path $PSScriptRoot '..' 'src-tauri' 'binaries'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Find-FirstExisting([string[]]$Candidates, [string]$What) {
  foreach ($p in $Candidates) {
    if ($p -and (Test-Path $p -PathType Leaf)) { return $p }
  }
  throw "ci-fetch-sidecars: ERROR: could not locate $What. Tried:`n  - $($Candidates -join "`n  - ")`nEnsure 'choco install ffmpeg ghostscript' ran successfully."
}

$chocoLib = if ($env:ChocolateyInstall) { $env:ChocolateyInstall } else { 'C:\ProgramData\chocolatey' }
$ffmpegCmd = (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue).Source
$ffmpegSrc = Find-FirstExisting @(
  (Join-Path $chocoLib 'lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe'),
  $ffmpegCmd
) 'ffmpeg.exe'

$gsFromFs = Get-ChildItem 'C:\Program Files\gs\gs*\bin\gswin64c.exe' -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
$gsCmd = (Get-Command gswin64c.exe -ErrorAction SilentlyContinue).Source
$gsSrc = Find-FirstExisting @($gsFromFs, $gsCmd) 'gswin64c.exe'

$ffmpegDst = Join-Path $OutDir 'ffmpeg-x86_64-pc-windows-msvc.exe'
$gsDst = Join-Path $OutDir 'gs-x86_64-pc-windows-msvc.exe'
Copy-Item $ffmpegSrc $ffmpegDst -Force
Copy-Item $gsSrc $gsDst -Force

foreach ($f in @($ffmpegDst, $gsDst)) {
  if (-not ((Test-Path $f) -and ((Get-Item $f).Length -gt 0))) {
    throw "ci-fetch-sidecars: ERROR: sidecar missing or empty after copy: $f"
  }
}
Write-Host "ci-fetch-sidecars: OK -> $ffmpegDst, $gsDst"
