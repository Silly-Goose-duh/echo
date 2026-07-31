#!/usr/bin/env python3
"""Milestone 1: local mic → STT → LLM → TTS → speaker (no network UI).

Usage:
  python scripts/local_loop.py              # one push-to-talk style capture (Enter to stop)
  python scripts/local_loop.py --text "hi"  # skip mic
  python scripts/local_loop.py --seconds 4  # timed mic capture
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

# Pull OpenRouter key from Hermes if needed
hermes_env = Path(os.environ.get("USERPROFILE", "")) / "AppData/Local/hermes/.env"
if hermes_env.is_file() and not os.environ.get("OPENROUTER_API_KEY"):
    for line in hermes_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            os.environ["OPENROUTER_API_KEY"] = (
                line.split("=", 1)[1].strip().strip('"').strip("'")
            )
            break

from server.app.orchestrator import Orchestrator


def record_mic(seconds: float, sr: int = 16000) -> np.ndarray:
    import sounddevice as sd

    print(f"Recording {seconds:.1f}s @ {sr} Hz — speak now...")
    audio = sd.rec(int(seconds * sr), samplerate=sr, channels=1, dtype="float32")
    sd.wait()
    return audio.reshape(-1)


def record_until_enter(sr: int = 16000) -> np.ndarray:
    import sounddevice as sd
    import queue
    import sys as _sys
    import threading

    q: queue.Queue[np.ndarray] = queue.Queue()
    chunks: list[np.ndarray] = []

    def cb(indata, frames, time_info, status):  # noqa: ARG001
        q.put(indata.copy())

    stop = threading.Event()

    def waiter():
        input("Press Enter to stop recording...\n")
        stop.set()

    print("Recording — speak, then press Enter.")
    t = threading.Thread(target=waiter, daemon=True)
    t.start()
    with sd.InputStream(samplerate=sr, channels=1, dtype="float32", callback=cb):
        while not stop.is_set():
            try:
                chunks.append(q.get(timeout=0.1).reshape(-1))
            except queue.Empty:
                pass
    while not q.empty():
        chunks.append(q.get().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks)


def play(pcm: np.ndarray, sr: int) -> None:
    import sounddevice as sd

    if pcm.size == 0:
        return
    sd.play(pcm, sr)
    sd.wait()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", type=str, default="")
    ap.add_argument("--seconds", type=float, default=0.0)
    ap.add_argument("--skip-load-report", action="store_true")
    args = ap.parse_args()

    orch = Orchestrator()
    print("Loading models...")
    t0 = time.perf_counter()
    orch.load()
    print(f"models_ready_ms={(time.perf_counter()-t0)*1000:.0f}")

    if args.text:
        result = orch.handle_text(args.text)
    else:
        sr = orch.settings.sample_rate_in
        if args.seconds > 0:
            audio = record_mic(args.seconds, sr=sr)
        else:
            audio = record_until_enter(sr=sr)
        if audio.size < sr * 0.2:
            print("FAIL: capture too short")
            return 1
        # to pcm16 bytes
        pcm16 = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
        result = orch.handle_pcm(pcm16, sample_rate=sr)

    print("--- turn ---")
    print(f"user: {result.user_text}")
    print(f"assistant: {result.assistant_text}")
    if result.stt:
        print(f"stt_ms={result.stt.latency_ms:.0f} backend={result.stt.backend}")
    print(
        f"llm_first_token_ms={result.llm_first_token_ms:.0f} "
        f"tts_first_audio_ms={result.tts_first_audio_ms:.0f} "
        f"total_ms={result.total_ms:.0f}"
    )
    # play concatenated
    pieces = [c.pcm_float32 for c in result.tts_chunks if c.pcm_float32.size]
    if pieces:
        full = np.concatenate(pieces)
        sr_out = result.tts_chunks[0].sample_rate
        print(f"playing {full.size/sr_out:.2f}s audio...")
        play(full, sr_out)
    ok = bool(result.assistant_text)
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
