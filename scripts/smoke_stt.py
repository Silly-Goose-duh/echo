#!/usr/bin/env python3
"""Smoke: Faster-Whisper STT on a generated tone+tts wav or mic."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from server.app.stt import STTEngine
from server.app.tts import TTSEngine


def main() -> int:
    # Prefer existing TTS smoke wav; else synthesize one for STT input
    wav = ROOT / "scripts" / "_smoke_tts.wav"
    if not wav.is_file():
        print("no _smoke_tts.wav — synthesizing sample via Kokoro first")
        tts = TTSEngine()
        tts.load()
        ch = tts.synthesize("The quick brown fox jumps over the lazy dog.")
        import soundfile as sf

        sf.write(str(wav), ch.pcm_float32, ch.sample_rate)

    import soundfile as sf

    audio, sr = sf.read(str(wav), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    # resample to 16k if needed
    if sr != 16000:
        import scipy.signal as signal

        n = int(len(audio) * 16000 / sr)
        audio = signal.resample(audio, n).astype(np.float32)
        sr = 16000

    eng = STTEngine()
    t0 = time.perf_counter()
    eng.load()
    load_ms = (time.perf_counter() - t0) * 1000
    tr = eng.transcribe_pcm16(audio, sample_rate=sr)
    print(
        f"load_ms={load_ms:.0f} backend={tr.backend} "
        f"stt_ms={tr.latency_ms:.0f} text={tr.text!r}"
    )
    ok = bool(tr.text.strip())
    print("PASS" if ok else "FAIL: empty transcript")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
