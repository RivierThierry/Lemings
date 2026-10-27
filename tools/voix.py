"""Génère les répliques des bestioles (sons/*.mp3) : voix de synthèse Piper rendue très aiguë,
avec une mélodie par réplique (montée de joie, descente d'inquiétude, cri qui chute…)
et plusieurs prises différentes de chaque réplique pour éviter la voix monocorde.

Prérequis : pip install piper-tts numpy ; ffmpeg ; la voix fr_FR-siwis-medium (.onnx + .onnx.json).
    python tools/voix.py chemin/vers/fr_FR-siwis-medium.onnx
"""
import os
import random
import subprocess
import sys
import tempfile
import wave

import numpy as np

MODEL = sys.argv[1] if len(sys.argv) > 1 else 'fr_FR-siwis-medium.onnx'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sons')
BASE = 2.0  # hauteur de base : deux fois plus aigu que la voix d'origine

# nom, textes (une prise par texte), durée des phonèmes, mélodie
LINES = [
    ('partir', ["C'est parti !", "C'est partiii !"], 0.85, 'bounce'),
    ('youpi', ['Youpi !', 'Youpiii !', 'Youpi !'], 0.85, 'up'),
    ('hourra', ['Hourra !'], 0.85, 'up'),
    ('ohnon', ['Oh non !', 'Oh nooon !', 'Oh non !'], 1.0, 'down'),
    ('aaah', ['Aaaaah !', 'Aaaaaaah !', 'Waaaah !'], 1.15, 'scream'),
]


def contour(kind, u, rnd):
    """Décalage de hauteur en demi-tons selon la position u (0 → 1) dans la réplique."""
    if kind == 'up':  # joie : ça monte, avec un petit rebond
        return -2 + 12 * u ** 1.5 + 1.2 * np.sin(np.pi * u) * rnd
    if kind == 'down':  # inquiétude : ça part haut et ça retombe
        return 3.5 - 7 * u ** 0.8 + 0.8 * np.sin(2 * np.pi * u)
    if kind == 'scream':  # cri qui s'éloigne en tombant, avec un trémolo
        return 6 - 8 * u ** 1.3 + 0.7 * np.sin(2 * np.pi * 7 * u * (0.8 + rnd * 0.4))
    if kind == 'bounce':  # enthousiaste : ça sautille et finit haut
        return 8 * u ** 1.3 + 1.5 * np.sin(np.pi * 3 * u)
    return 0 * u


def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return x, sr


def trim(x, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - 200): idx[-1] + 800]


def varispeed(x, kind, rnd):
    """Rééchantillonnage à vitesse variable : la hauteur suit la mélodie (voix de dessin animé)."""
    n = len(x)
    u = np.arange(n) / max(1, n - 1)
    rate = BASE * 2 ** (contour(kind, u, rnd) / 12)
    t_out = np.concatenate([[0], np.cumsum(1 / rate[:-1])])
    grid = np.arange(0, t_out[-1], 1.0)
    pos = np.interp(grid, t_out, np.arange(n))
    return np.interp(pos, np.arange(n), x)


def main():
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()
    random.seed(7)
    for name, texts, length, kind in LINES:
        for i, text in enumerate(texts, 1):
            raw = os.path.join(tmp, f'{name}{i}.wav')
            subprocess.run(['piper', '-m', MODEL, '-f', raw, '--length-scale', str(length),
                            '--noise-scale', str(round(random.uniform(0.85, 1.0), 2)),
                            '--noise-w-scale', str(round(random.uniform(1.0, 1.3), 2))],
                           input=text.encode(), check=True, capture_output=True)
            x, sr = read_wav(raw)
            y = varispeed(trim(x), kind, random.random())
            y = y / (np.abs(y).max() or 1) * 0.9
            mid = os.path.join(tmp, f'{name}{i}-v.wav')
            with wave.open(mid, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes((y * 32767).astype(np.int16).tobytes())
            # on rallonge sans changer la hauteur pour garder les mots compréhensibles
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', mid, '-af',
                            'atempo=0.72,apad=pad_dur=0.04,highpass=f=200,equalizer=f=3200:t=q:w=1:g=3,'
                            'loudnorm=I=-14:TP=-1.5:LRA=9', '-ac', '1', '-ar', '44100',
                            '-c:a', 'libmp3lame', '-b:a', '64k', os.path.join(OUT, f'{name}{i}.mp3')], check=True)
            print(name + str(i), text)


main()
