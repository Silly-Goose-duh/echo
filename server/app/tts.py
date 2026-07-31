"""Kokoro TTS wrapper with streaming-friendly sentence synthesis."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Iterator

import numpy as np

from .config import Settings, get_settings


@dataclass
class AudioChunk:
    pcm_float32: np.ndarray  # mono float32
    sample_rate: int
    latency_ms: float
    text: str


class TTSEngine:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._pipeline: Any = None
        self.sample_rate = 24000

    def load(self) -> None:
        if self._pipeline is not None:
            return
        t0 = time.perf_counter()
        from kokoro import KPipeline

        # lang_code 'a' = American English
        self._pipeline = KPipeline(lang_code=self.settings.tts_lang)
        print(f"[tts] kokoro loaded in {(time.perf_counter()-t0)*1000:.0f}ms")

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        voice = voice or self.settings.tts_voice
        text = (text or "").strip()
        if not text:
            return AudioChunk(
                pcm_float32=np.zeros(0, dtype=np.float32),
                sample_rate=self.sample_rate,
                latency_ms=0.0,
                text=text,
            )

        t0 = time.perf_counter()
        pieces: list[np.ndarray] = []
        # KPipeline yields (graphemes, phonemes, audio)
        for _gs, _ps, audio in self._pipeline(text, voice=voice):
            if audio is None:
                continue
            arr = np.asarray(audio, dtype=np.float32).reshape(-1)
            pieces.append(arr)
        pcm = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
        ms = (time.perf_counter() - t0) * 1000
        return AudioChunk(
            pcm_float32=pcm,
            sample_rate=self.sample_rate,
            latency_ms=ms,
            text=text,
        )

    def synthesize_stream(
        self, sentences: Iterator[str], voice: str | None = None
    ) -> Iterator[AudioChunk]:
        for sent in sentences:
            yield self.synthesize(sent, voice=voice)
