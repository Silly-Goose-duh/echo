#!/usr/bin/env python3
"""Smoke: Parakeet TDT STT backend on a generated tone/tts wav.

Loads the Parakeet backend explicitly (independent of ECHO_STT) and
transcribes scripts/_smoke_tts.wav, falling back to a synthesized sine
sweep when no wav is available. Reports SKIPPED (exit 0) instead of
crashing when the model or its deps are unavailable.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from server.app.config import get_settings
from server.app.stt import STTEngine


def _load_audio() -> tuple[np.ndarray, int]:
    """Prefer the TTS smoke wav; else synthesize a 1s sine so we still run."""
    for name in ("_smoke_test.wav", "_smoke_tts.wav"):
        wav = ROOT / "scripts" / name
        if wav.is_file():
            import soundfile as sf

            audio, sr = sf.read(str(wav), dtype="float32")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            print(f"audio={name} sr={sr} dur={len(audio)/sr:.2f}s")
            return audio.astype(np.float32), sr

    print("no smoke wav found — synthesizing a 1s 440Hz sine (expect empty text)")
    sr = 16000
    t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
    return (0.2 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32), sr


def main() -> int:
    settings = get_settings()
    # Force the parakeet path regardless of the configured default.
    settings = settings.model_copy(update={"stt": "parakeet"})
    print(f"parakeet_model={settings.parakeet_model} device={settings.device}")

    audio, sr = _load_audio()

    eng = STTEngine(settings)
    try:
        t0 = time.perf_counter()
        eng.load()
        load_ms = (time.perf_counter() - t0) * 1000
    except Exception as e:  # noqa: BLE001 - smoke script reports, never crashes
        print(f"SKIPPED: parakeet backend unavailable — {type(e).__name__}: {e}")
        return 0

    try:
        tr = eng.transcribe_pcm16(audio, sample_rate=sr)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: transcribe raised {type(e).__name__}: {e}")
        return 1

    # Second pass shows warm latency (first call includes CUDA graph warmup).
    warm = eng.transcribe_pcm16(audio, sample_rate=sr)

    print(
        f"load_ms={load_ms:.0f} backend={tr.backend} "
        f"cold_ms={tr.latency_ms:.0f} warm_ms={warm.latency_ms:.0f} "
        f"rtf={warm.latency_ms / (len(audio) / sr * 1000):.3f} "
        f"text={tr.text!r}"
    )
    if tr.backend != "parakeet":
        print(f"FAIL: expected backend 'parakeet', got {tr.backend!r}")
        return 1
    ok = bool(tr.text.strip())
    print("PASS" if ok else "FAIL: empty transcript")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
