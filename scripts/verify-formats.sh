#!/usr/bin/env bash
# Format-matrix harness for Kastral POST /api/v1/process.
# Usage: ./scripts/verify-formats.sh [--list]
#   no args: build minimal fixtures, run all 33 cases against
#            ${BASE_URL:-http://localhost:3000}, print PASS/FAIL, exit 0 iff all pass.
#   --list:  print "toolSlug|inputExt|targetFormat" per case, make no requests.
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ENDPOINT="$BASE/api/v1/process"

# NOTE: convertir-hoja-calculo (xlsx/xls/csv/ods -> csv,json,html,xlsx) is 100%
# browser-only (engine: browser, SheetJS in-page). No server API covers it,
# so it is intentionally excluded from this server harness.
CASES=(
  "convertir-imagen|png|webp"
  "convertir-imagen|png|jpg"
  "convertir-imagen|png|tiff"
  "convertir-imagen|png|heic"
  "convertir-imagen|png|bmp"
  "convertir-imagen|png|avif"
  "comprimir-imagen|jpg|webp"
  "redimensionar-imagen|png|jpg"
  "convertir-video|mp4|webm"
  "convertir-video|mp4|mkv"
  "convertir-video|mp4|mov"
  "convertir-video|mp4|avi"
  "convertir-video|mp4|flv"
  "convertir-video|avi|mp4"
  "comprimir-video|mp4|mp4"
  "extraer-audio-video|mp4|mp3"
  "extraer-audio-video|mp4|wav"
  "extraer-audio-video|mp4|ogg"
  "extraer-audio-video|mp4|opus"
  "extraer-audio-video|mp4|m4a"
  "extraer-audio-video|mp4|aac"
  "extraer-audio-video|mp4|flac"
  "extraer-audio-video|mp4|aiff"
  "convertir-audio|mp3|ogg"
  "convertir-audio|mp3|opus"
  "convertir-audio|mp3|m4a"
  "convertir-audio|wav|flac"
  "convertir-documento|md|pdf"
  "convertir-documento|md|html"
  "convertir-documento|md|epub"
  "convertir-documento|txt|pdf"
  "comprimir-pdf|pdf|pdf"
  "pdf-a-imagenes|pdf|png"
)

if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Uso: $0 [--list]"
  exit 0
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/kastral-verify-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta dependencia: $1" >&2; exit 2; }; }
need curl; need ffmpeg; need python3

# --- fixtures (reuse /tmp/opencode/kastral when usable, else generate) ---
SEED="/tmp/opencode/kastral"
FX_PNG="$TMP/fixture.png"; FX_JPG="$TMP/fixture.jpg"
FX_MP4="$TMP/fixture.mp4"; FX_AVI="$TMP/fixture.avi"
FX_MP3="$TMP/fixture.mp3"; FX_WAV="$TMP/fixture.wav"
FX_MD="$TMP/fixture.md";   FX_TXT="$TMP/fixture.txt"; FX_PDF="$TMP/fixture.pdf"

if [[ -f "$SEED/foto.png" ]] && [[ -s "$SEED/foto.png" ]]; then cp "$SEED/foto.png" "$FX_PNG"
else ffmpeg -y -v error -f lavfi -i "testsrc=size=320x240:duration=1:rate=10" -frames:v 1 "$FX_PNG"; fi

ffmpeg -y -v error -i "$FX_PNG" -q:v 3 "$FX_JPG"

ffmpeg -y -v error -f lavfi -i "testsrc=size=320x240:duration=2:rate=15" \
  -f lavfi -i "sine=frequency=440:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "$FX_MP4"

if [[ -f "$SEED/prueba.avi" ]] && [[ -s "$SEED/prueba.avi" ]]; then cp "$SEED/prueba.avi" "$FX_AVI"
else
  ffmpeg -y -v error -f lavfi -i "testsrc=size=320x240:duration=2:rate=15" \
    -f lavfi -i "sine=frequency=440:duration=2" \
    -c:v mpeg4 -c:a pcm_s16le -shortest "$FX_AVI"
fi

ffmpeg -y -v error -f lavfi -i "sine=frequency=440:duration=2" -c:a libmp3lame -b:a 128k "$FX_MP3"
ffmpeg -y -v error -f lavfi -i "sine=frequency=440:duration=2" -c:a pcm_s16le "$FX_WAV"

printf '# Kastral fixture\n\nTexto minimo para convertir-documento.\n' > "$FX_MD"
printf 'Kastral fixture texto plano.\nSegunda linea.\n' > "$FX_TXT"

python3 - "$FX_PDF" <<'PY'
import sys
out = sys.argv[1]
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    c = canvas.Canvas(out, pagesize=A4)
    c.drawString(72, 800, "Kastral fixture PDF")
    c.drawString(72, 780, "Linea dos para comprimir-pdf y pdf-a-imagenes.")
    c.showPage(); c.save()
except Exception:
    # minimal valid 1-page PDF fallback (no extra deps)
    pdf = ("%PDF-1.4\n1 0 obj<<>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
           "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj\n"
           "4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 800 Td (Kastral) Tj ET\nendstream endobj\n"
           "trailer<</Root 2 0 R>>\n%%EOF\n")
    open(out, "w").write(pdf)
PY

for f in "$FX_PNG" "$FX_JPG" "$FX_MP4" "$FX_AVI" "$FX_MP3" "$FX_WAV" "$FX_MD" "$FX_TXT" "$FX_PDF"; do
  [[ -s "$f" ]] || { echo "No se pudo generar fixture: $f" >&2; exit 2; }
done

fixture_for() { # $1=inputExt -> path
  case "$1" in
    png) echo "$FX_PNG";; jpg|jpeg) echo "$FX_JPG";;
    mp4) echo "$FX_MP4";; avi) echo "$FX_AVI";;
    mp3) echo "$FX_MP3";; wav) echo "$FX_WAV";;
    md) echo "$FX_MD";; txt) echo "$FX_TXT";; pdf) echo "$FX_PDF";;
    *) echo "";;
  esac
}

params_for() { # $1=toolSlug -> JSON params
  case "$1" in
    convertir-imagen) echo '{"quality":80}';;
    comprimir-imagen) echo '{"quality":75}';;
    redimensionar-imagen) echo '{"width":160,"quality":80}';;
    convertir-video|comprimir-video) echo '{"crf":"28","resolution":"original"}';;
    convertir-audio|extraer-audio-video) echo '{"bitrate":"128k"}';;
    comprimir-pdf) echo '{"preset":"ebook"}';;
    pdf-a-imagenes) echo '{"dpi":"96"}';;
    *) echo '{}';;
  esac
}

ext_match() { # $1=outputFilename $2=expectedExt -> 0 if match (jpg==jpeg)
  local got="${1##*.}" exp="$2"
  got="$(printf '%s' "$got" | tr '[:upper:]' '[:lower:]')"
  exp="$(printf '%s' "$exp" | tr '[:upper:]' '[:lower:]')"
  if [[ "$exp" == "jpg" || "$exp" == "jpeg" ]]; then [[ "$got" == "jpg" || "$got" == "jpeg" ]]
  else [[ "$got" == "$exp" ]]; fi
}

pass=0; fail=0; failed_cases=()
echo "verify-formats: ${#CASES[@]} casos contra $ENDPOINT"

for spec in "${CASES[@]}"; do
  IFS='|' read -r slug in_ext exp <<< "$spec"
  input="$(fixture_for "$in_ext")"
  resp="$TMP/resp.json"; : > "$resp"
  http="$(curl -s -o "$resp" -w '%{http_code}' --max-time 120 \
    -F "file=@${input};filename=fixture.${in_ext}" \
    -F "toolSlug=${slug}" -F "targetFormat=${exp}" \
    -F "params=$(params_for "$slug")" "$ENDPOINT" 2>/dev/null || echo 000)"
  status="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('status',''))" "$resp" 2>/dev/null || echo "")"
  outname="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('outputFilename',''))" "$resp" 2>/dev/null || echo "")"
  outsize="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('outputSize',0))" "$resp" 2>/dev/null || echo 0)"
  reason=""
  [[ "$http" == "200" ]] || reason="HTTP $http"
  [[ "$status" == "completed" ]] || reason="${reason:+$reason; }status=$status"
  if ! ext_match "$outname" "$exp"; then reason="${reason:+$reason; }output=$outname (esperado .$exp)"; fi
  if ! [[ "$outsize" =~ ^[0-9]+$ ]] || [[ "$outsize" -le 0 ]]; then reason="${reason:+$reason; }outputSize=$outsize"; fi
  if [[ -z "$reason" ]]; then pass=$((pass+1)); echo "PASS $spec -> $outname ($outsize B)"
  else fail=$((fail+1)); failed_cases+=("$spec"); echo "FAIL $spec -> $reason"
    head -c 300 "$resp" 2>/dev/null | tr -d '\n'; echo
  fi
done

echo "----"
echo "PASS: $pass  FAIL: $fail  TOTAL: ${#CASES[@]}"
exit $(( fail == 0 ? 0 : 1 ))
