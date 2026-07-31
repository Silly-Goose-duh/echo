#!/usr/bin/env python3
"""Smoke: Kokoro TTS synthesize + write wav."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from server.app.tts import TTSEngine


def main() -> int:
    out = ROOT / "scripts" / "_smoke_tts.wav"
    eng = TTSEngine()
    t0 = time.perf_counter()
    eng.load()
    load_ms = (time.perf_counter() - t0) * 1000
    chunk = eng.synthesize("Hello from Echo. This is a local Kokoro smoke test.")
    print(
        f"load_ms={load_ms:.0f} synth_ms={chunk.latency_ms:.0f} "
        f"sr={chunk.sample_rate} samples={chunk.pcm_float32.size} "
        f"dur_s={chunk.pcm_float32.size / max(chunk.sample_rate,1):.2f}"
    )
    if chunk.pcm_float32.size == 0:
        print("FAIL: empty audio")
        return 1
    try:
        import soundfile as sf

        sf.write(str(out), chunk.pcm_float32, chunk.sample_rate)
        print(f"wrote {out}")
    except Exception as e:
        print(f"warn: could not write wav: {e}")
    peak = float(np.max(np.abs(chunk.pcm_float32)))
    print(f"peak_abs={peak:.3f}")
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
