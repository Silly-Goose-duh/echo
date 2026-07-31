"""Speech-to-text backends."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from .config import Settings, get_settings


@dataclass
class Transcript:
    text: str
    latency_ms: float
    backend: str


def _normalize_backend(name: str) -> str:
    """Accept faster_whisper / faster-whisper / parakeet (case-insensitive)."""
    n = (name or "").strip().lower().replace("-", "_")
    return "parakeet" if n == "parakeet" else "faster_whisper"


def _resolve_device(preferred: str) -> str:
    """Fall back to CPU when CUDA was asked for but is unavailable."""
    if preferred != "cuda":
        return preferred
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _resample(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    """Mono float32 resample; librosa if present, else linear interpolation."""
    if src_sr == dst_sr:
        return audio
    try:
        import librosa

        return librosa.resample(audio, orig_sr=src_sr, target_sr=dst_sr)
    except ImportError:
        n = int(round(len(audio) * dst_sr / src_sr))
        if n <= 0:
            return np.zeros(0, dtype=np.float32)
        x_old = np.linspace(0.0, 1.0, num=len(audio), endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=n, endpoint=False)
        return np.interp(x_new, x_old, audio).astype(np.float32)


class STTEngine:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.backend = _normalize_backend(self.settings.stt)
        self._model: Any = None
        self._processor: Any = None
        self._device = "cpu"
        self._dtype: Any = None

    def load(self) -> None:
        if self._model is not None:
            return
        if self.backend == "parakeet":
            self._load_parakeet()
        else:
            self._load_faster_whisper()

    def _load_faster_whisper(self) -> None:
        from faster_whisper import WhisperModel

        device = self.settings.device
        compute = self.settings.stt_compute
        if device == "cuda":
            try:
                import torch

                if not torch.cuda.is_available():
                    device = "cpu"
                    compute = "int8"
            except Exception:
                device = "cpu"
                compute = "int8"
        t0 = time.perf_counter()
        self._model = WhisperModel(
            self.settings.stt_model,
            device=device,
            compute_type=compute,
        )
        self._device = device
        self.backend = "faster_whisper"
        print(
            f"[stt] faster-whisper {self.settings.stt_model} on {device}/{compute} "
            f"loaded in {(time.perf_counter()-t0)*1000:.0f}ms"
        )

    def _load_parakeet(self) -> None:
        """Load Parakeet TDT via native transformers support (no NeMo needed).

        Requires transformers>=5 (ParakeetForTDT/ParakeetProcessor) plus
        librosa, which the ParakeetFeatureExtractor depends on.
        """
        try:
            import torch
            from transformers import ParakeetForTDT, ParakeetProcessor
        except ImportError as e:
            raise RuntimeError(
                "Parakeet requested but transformers>=5 with Parakeet support "
                "is not available. Install with: "
                "pip install 'transformers>=5' librosa. "
                "Or set ECHO_STT=faster_whisper."
            ) from e

        model_id = self.settings.parakeet_model
        device = _resolve_device(self.settings.device)
        dtype = torch.float16 if device == "cuda" else torch.float32
        t0 = time.perf_counter()
        try:
            self._processor = ParakeetProcessor.from_pretrained(model_id)
            model = ParakeetForTDT.from_pretrained(model_id, dtype=dtype)
        except ImportError as e:
            # ParakeetFeatureExtractor lazily requires librosa.
            raise RuntimeError(
                f"Parakeet deps missing while loading {model_id}: {e}. "
                "Install with: pip install librosa"
            ) from e
        self._model = model.to(device).eval()
        self._device = device
        self._dtype = dtype
        self.backend = "parakeet"
        print(
            f"[stt] parakeet {model_id} on {device}/{str(dtype).split('.')[-1]} "
            f"loaded in {(time.perf_counter()-t0)*1000:.0f}ms"
        )

    def transcribe_pcm16(
        self,
        pcm: bytes | np.ndarray,
        sample_rate: int | None = None,
    ) -> Transcript:
        self.load()
        sr = sample_rate or self.settings.sample_rate_in
        if isinstance(pcm, bytes):
            audio = (
                np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
            )
        else:
            audio = np.asarray(pcm, dtype=np.float32)
            if audio.dtype == np.int16 or audio.max() > 1.5:
                audio = audio.astype(np.float32) / 32768.0
        if audio.ndim > 1:
            audio = audio.mean(axis=-1)

        t0 = time.perf_counter()
        if self.backend == "parakeet":
            text = self._transcribe_parakeet(audio, sr)
        else:
            text = self._transcribe_fw(audio, sr)
        ms = (time.perf_counter() - t0) * 1000
        return Transcript(text=text.strip(), latency_ms=ms, backend=self.backend)

    def _transcribe_fw(self, audio: np.ndarray, sr: int) -> str:
        segments, _info = self._model.transcribe(
            audio,
            language="en",
            beam_size=1,
            vad_filter=True,
            without_timestamps=True,
        )
        parts = [s.text for s in segments]
        return " ".join(parts).strip()

    def _transcribe_parakeet(self, audio: np.ndarray, sr: int) -> str:
        import torch

        # Parakeet's feature extractor is fixed at 16 kHz mono float32.
        target_sr = 16000
        if sr != target_sr:
            audio = _resample(audio, sr, target_sr)
        audio = np.ascontiguousarray(audio, dtype=np.float32)

        inputs = self._processor(
            audio,
            sampling_rate=target_sr,
            return_tensors="pt",
        ).to(self._device, dtype=self._dtype)

        with torch.inference_mode():
            out = self._model.generate(**inputs)
        # TDT generate() returns ParakeetRNNTGenerateOutput; blank tokens are
        # emitted between real tokens, so skip_special_tokens is required.
        seqs = getattr(out, "sequences", out)
        decoded = self._processor.batch_decode(seqs, skip_special_tokens=True)
        if isinstance(decoded, (list, tuple)):
            return str(decoded[0]) if decoded else ""
        return str(decoded)
