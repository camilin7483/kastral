# Fetch Tauri sidecar binaries for Windows CI.
# ffmpeg comes from ONE pinned gyan.dev release zip (no `latest` fallback:
# reproducible sidecars); gswin64c.exe comes from the choco-installed
# Ghostscript (workflow pins it with --version). Both are copied into
# src-tauri/binaries/ with the target-triple names Tauri expects.
# NOTE: for the gs sidecar to actually bundle, "binaries/gs" must be added
# to bundle.externalBin in tauri.conf.json (currently only ffmpeg is declared).
$ErrorActionPreference = 'Stop'

$OutDir = Join-Path $PSScriptRoot '..' 'src-tauri' 'binaries'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Fail([string]$Message) {
  throw "ci-fetch-sidecars: ERROR: $Message"
}

# Pinned ffmpeg release (verify it still exists if CI starts failing).
$ffmpegVersion = '8.1.2'
$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-$ffmpegVersion-essentials_build.zip"
$ffmpegZip = Join-Path ([System.IO.Path]::GetTempPath()) "ffmpeg-$ffmpegVersion-essentials_build.zip"

curl.exe -fsSL --retry 3 -o $ffmpegZip $ffmpegUrl
if ($LASTEXITCODE -ne 0) {
  Fail "could not download pinned ffmpeg $ffmpegVersion from gyan.dev ($ffmpegUrl). Check network access or update the pinned version."
}
if (-not ((Test-Path $ffmpegZip) -and ((Get-Item $ffmpegZip).Length -gt 0))) {
  Fail "ffmpeg zip missing or empty after download ($ffmpegZip)."
}

$extractDir = Join-Path ([System.IO.Path]::GetTempPath()) "kastral-ffmpeg-$ffmpegVersion"
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
try {
  Expand-Archive -Path $ffmpegZip -DestinationPath $extractDir -Force
} catch {
  Fail "could not extract pinned ffmpeg zip ($ffmpegZip): $($_.Exception.Message)"
}
$ffmpegSrc = Get-ChildItem $extractDir -Recurse -Filter 'ffmpeg.exe' |
  Where-Object { $_.FullName -match '\\bin\\' } |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $ffmpegSrc) {
  Fail "pinned gyan.dev zip has no bin/ffmpeg.exe (layout changed?)."
}

# Ghostscript: installed by the workflow with a pinned choco version.
$chocoLib = if ($env:ChocolateyInstall) { $env:ChocolateyInstall } else { 'C:\ProgramData\chocolatey' }
$gsCandidates = @(
  (Join-Path $chocoLib 'lib\ghostscript\tools\gs*\bin\gswin64c.exe'),
  'C:\Program Files\gs\gs*\bin\gswin64c.exe',
  (Get-Command gswin64c.exe -ErrorAction SilentlyContinue).Source
) | ForEach-Object {
  if ($_ -and $_.Contains('*')) { Get-ChildItem $_ -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
  elseif ($_ -and (Test-Path $_ -PathType Leaf)) { $_ }
}
$gsSrc = $gsCandidates | Select-Object -First 1
if (-not $gsSrc) {
  Fail "could not locate gswin64c.exe. Ensure 'choco install ghostscript --version <pinned> -y' ran successfully."
}

$ffmpegDst = Join-Path $OutDir 'ffmpeg-x86_64-pc-windows-msvc.exe'
$gsDst = Join-Path $OutDir 'gs-x86_64-pc-windows-msvc.exe'
Copy-Item $ffmpegSrc $ffmpegDst -Force
Copy-Item $gsSrc $gsDst -Force

foreach ($f in @($ffmpegDst, $gsDst)) {
  if (-not ((Test-Path $f) -and ((Get-Item $f).Length -gt 0))) {
    Fail "sidecar missing or empty after copy: $f"
  }
}
function Test-SidecarRuns([string]$Binary, [string]$VersionArg) {
  try {
    & $Binary $VersionArg | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "sidecar does not run: $Binary $VersionArg (exit $LASTEXITCODE)" }
  } catch {
    Fail "sidecar does not run: $Binary ${VersionArg}: $($_.Exception.Message)"
  }
}
Test-SidecarRuns $ffmpegDst '-version'
Test-SidecarRuns $gsDst '--version'
Write-Host "ci-fetch-sidecars: OK -> $ffmpegDst, $gsDst"
