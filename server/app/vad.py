"""Silero VAD helpers for end-of-utterance detection."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import torch


@dataclass
class VADState:
    triggered: bool = False
    silence_ms: float = 0.0
    speech_ms: float = 0.0
    ring: list[np.ndarray] = field(default_factory=list)


class SileroVAD:
    """Streaming-ish wrapper: feed 16 kHz float32 mono chunks (~30ms+)."""

    def __init__(
        self,
        sample_rate: int = 16000,
        threshold: float = 0.5,
        min_speech_ms: float = 250.0,
        max_silence_ms: float = 500.0,
    ) -> None:
        if sample_rate not in (8000, 16000):
            raise ValueError("Silero VAD supports 8k or 16k")
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.min_speech_ms = min_speech_ms
        self.max_silence_ms = max_silence_ms
        self._model = None
        self.state = VADState()
        # Silero expects fixed window: 512 samples @16k
        self.window = 512 if sample_rate == 16000 else 256
        self._carry = np.zeros(0, dtype=np.float32)

    def load(self) -> None:
        if self._model is not None:
            return
        from silero_vad import load_silero_vad

        self._model = load_silero_vad()
        self._model.eval()

    def reset(self) -> None:
        self.state = VADState()
        self._carry = np.zeros(0, dtype=np.float32)
        if self._model is not None and hasattr(self._model, "reset_states"):
            self._model.reset_states()

    def _prob(self, chunk: np.ndarray) -> float:
        self.load()
        t = torch.from_numpy(chunk)
        with torch.no_grad():
            p = self._model(t, self.sample_rate)
        return float(p)

    def feed(self, pcm_f32: np.ndarray) -> tuple[bool, np.ndarray | None]:
        """
        Feed audio. Returns (utterance_complete, audio_or_None).
        When complete, audio is the buffered speech float32 mono.
        """
        x = np.asarray(pcm_f32, dtype=np.float32).reshape(-1)
        if x.size == 0:
            return False, None
        self._carry = np.concatenate([self._carry, x])
        completed_audio: np.ndarray | None = None
        done = False

        while self._carry.size >= self.window:
            win = self._carry[: self.window]
            self._carry = self._carry[self.window:]
            ms = 1000.0 * self.window / self.sample_rate
            prob = self._prob(win)
            speech = prob >= self.threshold

            if speech:
                self.state.speech_ms += ms
                self.state.silence_ms = 0.0
                self.state.ring.append(win.copy())
                if self.state.speech_ms >= self.min_speech_ms:
                    self.state.triggered = True
            else:
                if self.state.triggered:
                    self.state.ring.append(win.copy())
                    self.state.silence_ms += ms
                    if self.state.silence_ms >= self.max_silence_ms:
                        completed_audio = np.concatenate(self.state.ring)
                        done = True
                        self.reset()
                        break
                else:
                    # keep a tiny pre-roll
                    self.state.ring.append(win.copy())
                    if len(self.state.ring) > 10:
                        self.state.ring = self.state.ring[-10:]
                    self.state.speech_ms = 0.0

        return done, completed_audio
