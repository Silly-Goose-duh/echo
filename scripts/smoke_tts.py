#!/usr/bin/env python3
"""Smoke: TTS synthesize + write wav (Fish primary, Kokoro fallback)."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from server.app.tts import TTSEngine


def _out_path() -> Path:
    # Prefer /tmp on Unix; AppData Local Temp on Windows.
    for candidate in (
        Path(os.environ.get("TEMP", "")),
        Path(os.environ.get("TMP", "")),
        Path("/tmp"),
        ROOT / "scripts",
    ):
        if candidate and str(candidate) not in (".", "") and candidate.exists():
            return candidate / "echo_smoke_tts.wav"
    return ROOT / "scripts" / "_smoke_tts.wav"


def main() -> int:
    out = _out_path()
    # Also keep legacy path for smoke_stt consumers
    legacy = ROOT / "scripts" / "_smoke_tts.wav"

    eng = TTSEngine()
    t0 = time.perf_counter()
    eng.load()
    load_ms = (time.perf_counter() - t0) * 1000
    chunk = eng.synthesize(
        "Hello from Echo. This is a local TTS smoke test."
    )
    dur = chunk.pcm_float32.size / max(chunk.sample_rate, 1)
    print(
        f"backend={eng.backend_name} load_ms={load_ms:.0f} "
        f"synth_ms={chunk.latency_ms:.0f} sr={chunk.sample_rate} "
        f"samples={chunk.pcm_float32.size} shape={chunk.pcm_float32.shape} "
        f"dur_s={dur:.2f}"
    )
    if chunk.pcm_float32.size == 0:
        print("FAIL: empty audio")
        return 1
    try:
        import soundfile as sf

        sf.write(str(out), chunk.pcm_float32, chunk.sample_rate)
        print(f"wrote {out}")
        if legacy != out:
            sf.write(str(legacy), chunk.pcm_float32, chunk.sample_rate)
            print(f"wrote {legacy}")
    except Exception as e:
        print(f"warn: could not write wav: {e}")
    peak = float(np.max(np.abs(chunk.pcm_float32)))
    print(f"peak_abs={peak:.3f}")
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
