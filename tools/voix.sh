#!/bin/sh
# Régénère les répliques des bestioles (sons/*.mp3) avec Piper et ffmpeg.
# Prérequis : pip install piper-tts ; voix fr_FR-siwis-medium (.onnx et .onnx.json) dans le dossier courant.
#   sh tools/voix.sh chemin/vers/fr_FR-siwis-medium.onnx
set -e
MODEL=${1:-fr_FR-siwis-medium.onnx}
OUT=$(dirname "$0")/../sons
TMP=$(mktemp -d)
while IFS='|' read -r n txt ls; do
  echo "$txt" | piper -m "$MODEL" -f "$TMP/$n.wav" --length-scale "$ls" 2>/dev/null
  # plus aigu et plus vif (voix de dessin animé), sans blancs, volume homogène
  ffmpeg -nostdin -v error -y -i "$TMP/$n.wav" -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.04,asetrate=22050*1.3,aresample=44100,atempo=0.88,highpass=f=180,equalizer=f=3000:t=q:w=1:g=3,loudnorm=I=-14:TP=-1.5:LRA=7" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k "$OUT/$n.mp3"
done <<'LIST'
partir|C'est parti !|0.9
onyva|On y va !|0.9
youpi|Youpi !|0.9
hourra|Hourra !|0.9
ohnon|Oh non !|1
aaah|Aaaah !|1.1
hop|Hop !|0.9
hein|Hein ?|1
stop|Stop !|0.9
ouille|Ouille !|0.9
aie|Aïe !|0.9
glouglou|Glou glou !|1
wouah|Wouah !|1
sauve|Sauve qui peut !|0.9
LIST
