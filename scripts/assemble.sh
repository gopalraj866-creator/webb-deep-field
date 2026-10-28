#!/usr/bin/env bash
# Usage: scripts/assemble.sh <target: 4k|1080p|shorts> <segments_dir> <audio.m4a> <out.mp4>   (set FFMPEG to override the binary)
set -euo pipefail
T="$1"; SEGS="$2"; AUDIO="$3"; OUT="$4"; FF="${FFMPEG:-ffmpeg}"
LIST="$(mktemp)"
for f in $(ls "$SEGS"/${T}_*.mp4 | sort); do echo "file '$(realpath "$f")'" >> "$LIST"; done
mkdir -p "$(dirname "$OUT")"
"$FF" -y -loglevel error -f concat -safe 0 -i "$LIST" -i "$AUDIO" -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -shortest -movflags +faststart "$OUT"
echo "assembled $OUT"; ls -la "$OUT"
