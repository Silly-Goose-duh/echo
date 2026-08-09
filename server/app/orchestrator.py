"""Turn orchestrator: guardrails → STT → LLM stream → sentence TTS, barge-in."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from .config import Settings, get_settings
from .guardrails import check_message
from .llm import build_messages, sentence_chunks, stream_chat
from .rag import format_rag_context, retrieve
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
    guardrail: str | None = None  # crisis | diagnosis | med | None


# ("text", str) | ("audio", AudioChunk) | ("done", TurnResult)
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
        self.current_voice: str = (
            self.settings.fish_reference_id
            or self.settings.tts_voice
            or "echo"
        ).strip() or "echo"
        self.open_mic: bool = False

    def load(self) -> None:
        self.stt.load()
        self.tts.load()

    def set_voice(self, voice: str) -> str:
        """Single fixed warm voice — client picker disabled; keep stub for WS compat."""
        # Prefer configured fish reference / kokoro voice; ignore multi-voice ids.
        fixed = (self.settings.fish_reference_id or self.settings.tts_voice or "echo").strip()
        incoming = (voice or "").strip()
        # Only accept non-legacy explicit overrides that look like fish ref ids
        # (not old Kokoro pack names), when fish_reference_id is empty.
        if incoming and incoming not in (
            "af_heart",
            "af_alloy",
            "af_aoi",
            "af_nova",
            "af_sky",
            "am_michael",
            "bf_emma",
            "bm_george",
        ):
            if not self.settings.fish_reference_id and self.settings.tts in (
                "kokoro",
            ):
                self.current_voice = incoming
                return self.current_voice
        self.current_voice = fixed
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
        speak: bool = True,
    ) -> TurnResult:
        result: TurnResult | None = None
        for kind, payload in self.run_turn(
            user_text, stt=stt, t_wall=t_wall, speak=speak
        ):
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
        speak: bool = True,
    ) -> Iterator[TurnEvent]:
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

        # --- Hard guardrails BEFORE the persona LLM ---
        guard = check_message(user_text)
        if guard.blocked:
            msg = guard.message
            yield ("text", msg)
            if speak:
                # Speak crisis/safety replies calmly; keep TTS simple (one pass).
                chunk = self.tts.synthesize(msg, voice=self.current_voice)
                if chunk.pcm_float32.size:
                    yield ("audio", chunk)
            # Do not poison history with crisis scripts as "normal" persona turns,
            # but keep a light marker so the model knows care was given.
            self.history.append({"role": "user", "content": user_text})
            self.history.append(
                {
                    "role": "assistant",
                    "content": "[safety response delivered — stay supportive]",
                }
            )
            if len(self.history) > 40:
                self.history = self.history[-40:]
            yield (
                "done",
                TurnResult(
                    user_text=user_text,
                    assistant_text=msg,
                    stt=stt,
                    total_ms=(time.perf_counter() - t0) * 1000,
                    guardrail=guard.kind,
                ),
            )
            return

        # --- Lightweight RAG (local markdown; no Supabase) ---
        rag_context = ""
        if self.settings.rag_enabled:
            try:
                chunks = retrieve(user_text, top_k=self.settings.rag_top_k)
                rag_context = format_rag_context(chunks)
            except Exception:
                rag_context = ""

        messages = build_messages(
            self.history,
            user_text,
            settings=self.settings,
            rag_context=rag_context or None,
        )
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
            sentences = sentence_chunks(iter(["".join(token_iter())]))

        tts_chunks: list[AudioChunk] = []
        tts_first = 0.0
        for sentence in sentences:
            if cancelled():
                break
            yield ("text", sentence)
            if speak:
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
