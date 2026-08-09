"""Turn orchestrator: STT → LLM stream → sentence TTS, with barge-in support."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from .config import Settings, get_settings
from .llm import build_messages, sentence_chunks, stream_chat
from .stt import STTEngine, Transcript
from .tts import AudioChunk, TTSEngine


@dataclass
class TurnResult:
    user_text: str
    assistant_text: str
    stt: Transcript | None
    tts_chunks: list[AudioChunk] = field(default_factory=list)
    llm_first_token_ms: float = 0.0
    tts_first_audio_ms: float = 0.0
    total_ms: float = 0.0
    interrupted: bool = False


# ("audio", AudioChunk) streamed per sentence, then ("done", TurnResult).
TurnEvent = tuple[str, Any]


class Orchestrator:
    def __init__(
        self,
        settings: Settings | None = None,
        stt: STTEngine | None = None,
        tts: TTSEngine | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.stt = stt or STTEngine(self.settings)
        self.tts = tts or TTSEngine(self.settings)
        self.history: list[dict[str, str]] = []
        # TTS voice for this session. Defaults to the server-side TTS_VOICE
        # setting; the client may override it per-session with
        # {"type":"config","voice":"af_heart"} over the websocket.
        self.current_voice: str = self.settings.tts_voice
        # Informational: client streams continuously and runs its own VAD.
        self.open_mic: bool = False

    def load(self) -> None:
        self.stt.load()
        self.tts.load()

    def set_voice(self, voice: str) -> str:
        """Set the session TTS voice; returns the voice actually in effect."""
        voice = (voice or "").strip()
        if voice:
            self.current_voice = voice
        return self.current_voice

    def reset(self) -> None:
        self.history.clear()

    def handle_pcm(self, pcm: bytes, sample_rate: int | None = None) -> TurnResult:
        t_wall = time.perf_counter()
        tr = self.stt.transcribe_pcm16(pcm, sample_rate=sample_rate)
        return self.handle_text(tr.text, stt=tr, t_wall=t_wall)

    def handle_text(
        self,
        user_text: str,
        *,
        stt: Transcript | None = None,
        t_wall: float | None = None,
    ) -> TurnResult:
        """Blocking convenience wrapper over run_turn (scripts / handle_pcm)."""
        result: TurnResult | None = None
        for kind, payload in self.run_turn(user_text, stt=stt, t_wall=t_wall):
            if kind == "done":
                result = payload
        assert result is not None
        return result

    def run_turn(
        self,
        user_text: str,
        *,
        stt: Transcript | None = None,
        t_wall: float | None = None,
        cancel: threading.Event | None = None,
    ) -> Iterator[TurnEvent]:
        """Stream a turn: yield ("audio", AudioChunk) per sentence as soon as
        it is synthesized, then ("done", TurnResult) with full metrics.

        `cancel` (threading.Event) aborts the turn between tokens/sentences —
        used for server-side barge-in.
        """
        t0 = t_wall if t_wall is not None else time.perf_counter()
        user_text = (user_text or "").strip()
        if not user_text:
            yield (
                "done",
                TurnResult(
                    user_text="",
                    assistant_text="",
                    stt=stt,
                    total_ms=(time.perf_counter() - t0) * 1000,
                ),
            )
            return

        def cancelled() -> bool:
            return cancel is not None and cancel.is_set()

        messages = build_messages(self.history, user_text, settings=self.settings)
        t_llm = time.perf_counter()
        first_token_ms = 0.0
        collected: list[str] = []

        def token_iter() -> Iterator[str]:
            nonlocal first_token_ms
            for tok in stream_chat(messages, settings=self.settings):
                if cancelled():
                    return
                if first_token_ms == 0.0:
                    first_token_ms = (time.perf_counter() - t_llm) * 1000
                collected.append(tok)
                yield tok

        if self.settings.stream_tts_early:
            sentences: Iterator[str] = sentence_chunks(token_iter())
        else:
            # Buffer the whole response, then synthesize once.
            sentences = sentence_chunks(iter(["".join(token_iter())]))

        tts_chunks: list[AudioChunk] = []
        tts_first = 0.0
        for sentence in sentences:
            if cancelled():
                break
            # Stream text early so the UI can caption before audio arrives.
            yield ("text", sentence)
            chunk = self.tts.synthesize(sentence, voice=self.current_voice)
            if tts_first == 0.0 and chunk.pcm_float32.size:
                tts_first = (time.perf_counter() - t0) * 1000
            tts_chunks.append(chunk)
            if cancelled():
                break
            yield ("audio", chunk)

        assistant = "".join(collected).strip()
        if user_text and assistant:
            self.history.append({"role": "user", "content": user_text})
            self.history.append({"role": "assistant", "content": assistant})
            # Therapy benefits from longer memory (keep ~20 turns).
            if len(self.history) > 40:
                self.history = self.history[-40:]

        yield (
            "done",
            TurnResult(
                user_text=user_text,
                assistant_text=assistant,
                stt=stt,
                tts_chunks=tts_chunks,
                llm_first_token_ms=first_token_ms,
                tts_first_audio_ms=tts_first,
                total_ms=(time.perf_counter() - t0) * 1000,
                interrupted=cancelled(),
            ),
        )
