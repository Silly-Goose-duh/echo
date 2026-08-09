"""TTS facade: Fish Audio S2-Pro primary, Kokoro fallback.

Backends (selected via ECHO_TTS=fish|kokoro):
  fish  – try in this order, first success wins:
            1) local fish_speech + checkpoints/s2-pro (needs ~24GB VRAM)
            2) HTTP fish-speech API (ECHO_FISH_URL)
            3) Fish Audio cloud SDK (FISH_API_KEY / ECHO_FISH_API_KEY)
          On total failure when allow_fallback=True → Kokoro.
  kokoro – always Kokoro-82M (local, light).

Interface stays stable for the orchestrator:
  TTSEngine.synthesize(text, voice=None) -> AudioChunk
"""

from __future__ import annotations

import io
import os
import time
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Literal

import numpy as np

from .config import Settings, get_settings

BackendName = Literal["fish", "kokoro", "fish_local", "fish_http", "fish_cloud"]


@dataclass
class AudioChunk:
    pcm_float32: np.ndarray  # mono float32
    sample_rate: int
    latency_ms: float
    text: str


def _empty(text: str, sample_rate: int) -> AudioChunk:
    return AudioChunk(
        pcm_float32=np.zeros(0, dtype=np.float32),
        sample_rate=sample_rate,
        latency_ms=0.0,
        text=text,
    )


def _pcm_from_wav_bytes(data: bytes) -> tuple[np.ndarray, int]:
    """Decode WAV bytes → float32 mono + sample rate."""
    with wave.open(io.BytesIO(data), "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())
    if sw == 2:
        arr = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        arr = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sw == 1:
        arr = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError(f"unsupported WAV sample width: {sw}")
    if ch > 1:
        arr = arr.reshape(-1, ch).mean(axis=1)
    return arr.astype(np.float32, copy=False), int(sr)


def _pcm_from_audio_bytes(data: bytes, preferred_sr: int = 44100) -> tuple[np.ndarray, int]:
    """Decode WAV/MP3/etc. Prefer soundfile, then stdlib wave, then raw int16."""
    if not data:
        return np.zeros(0, dtype=np.float32), preferred_sr
    # WAV magic
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        try:
            return _pcm_from_wav_bytes(data)
        except Exception:
            pass
    try:
        import soundfile as sf

        pcm, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
        pcm = np.asarray(pcm, dtype=np.float32)
        if pcm.ndim > 1:
            pcm = pcm.mean(axis=1)
        return pcm, int(sr)
    except Exception:
        pass
    # Assume little-endian PCM16 mono
    arr = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    return arr, preferred_sr


class _Backend(ABC):
    name: str = "base"
    sample_rate: int = 24000

    @abstractmethod
    def load(self) -> None: ...

    @abstractmethod
    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk: ...


class KokoroBackend(_Backend):
    name = "kokoro"
    sample_rate = 24000

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._pipeline: Any = None

    def load(self) -> None:
        if self._pipeline is not None:
            return
        t0 = time.perf_counter()
        from kokoro import KPipeline

        self._pipeline = KPipeline(lang_code=self.settings.tts_lang)
        print(f"[tts] kokoro loaded in {(time.perf_counter()-t0)*1000:.0f}ms")

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        # Single fixed warm voice when multi-voice is disabled; still honor
        # explicit override for backward compatibility / ECHO_TTS=kokoro.
        voice = voice or self.settings.tts_voice
        text = (text or "").strip()
        if not text:
            return _empty(text, self.sample_rate)

        t0 = time.perf_counter()
        pieces: list[np.ndarray] = []
        for _gs, _ps, audio in self._pipeline(text, voice=voice):
            if audio is None:
                continue
            pieces.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        pcm = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
        ms = (time.perf_counter() - t0) * 1000
        return AudioChunk(
            pcm_float32=pcm,
            sample_rate=self.sample_rate,
            latency_ms=ms,
            text=text,
        )


class FishLocalBackend(_Backend):
    """In-process fish_speech + fishaudio/s2-pro checkpoints.

    Official docs require ~24GB VRAM. On 8GB cards this will OOM; Echo then
    falls back. Also needs `fish_speech` importable and checkpoint dir present.
    """

    name = "fish_local"
    sample_rate = 44100

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._engine: Any = None
        self._ServeTTSRequest: Any = None

    @staticmethod
    def available(settings: Settings) -> tuple[bool, str]:
        try:
            import fish_speech  # noqa: F401
        except Exception as e:
            return False, f"fish_speech not importable: {e}"
        ckpt = Path(settings.fish_checkpoint_dir)
        if not ckpt.is_dir():
            return False, f"checkpoint dir missing: {ckpt}"
        # codec + at least one weight file
        has_weight = any(ckpt.glob("*.pth")) or any(ckpt.glob("*.safetensors"))
        if not has_weight and not (ckpt / "config.json").exists():
            return False, f"no model weights under {ckpt}"
        return True, "ok"

    def load(self) -> None:
        if self._engine is not None:
            return
        ok, reason = self.available(self.settings)
        if not ok:
            raise RuntimeError(f"fish local unavailable: {reason}")

        t0 = time.perf_counter()
        import torch
        from fish_speech.inference_engine import TTSInferenceEngine
        from fish_speech.models.dac.inference import load_model as load_decoder_model
        from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
        from fish_speech.utils.schema import ServeTTSRequest

        self._ServeTTSRequest = ServeTTSRequest
        device = self.settings.device if self.settings.device != "auto" else (
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        # Prefer bf16; half on request for older GPUs
        precision = torch.float16 if self.settings.fish_half else torch.bfloat16
        ckpt = Path(self.settings.fish_checkpoint_dir)
        codec = Path(self.settings.fish_codec_path) if self.settings.fish_codec_path else (
            ckpt / "codec.pth"
        )

        print(f"[tts] fish_local loading llama from {ckpt} on {device}…")
        llama_queue = launch_thread_safe_queue(
            checkpoint_path=ckpt,
            device=device,
            precision=precision,
            compile=False,
        )
        print(f"[tts] fish_local loading codec from {codec}…")
        decoder_model = load_decoder_model(
            config_name=self.settings.fish_decoder_config,
            checkpoint_path=str(codec),
            device=device,
        )
        self._engine = TTSInferenceEngine(
            llama_queue=llama_queue,
            decoder_model=decoder_model,
            compile=False,
            precision=precision,
        )
        # Warmup (also establishes sample_rate from decoder)
        list(
            self._engine.inference(
                ServeTTSRequest(
                    text="Hello.",
                    references=[],
                    reference_id=None,
                    max_new_tokens=64,
                    chunk_length=200,
                    top_p=0.7,
                    repetition_penalty=1.5,
                    temperature=0.7,
                    format="wav",
                )
            )
        )
        if hasattr(decoder_model, "sample_rate"):
            self.sample_rate = int(decoder_model.sample_rate)
        elif hasattr(decoder_model, "spec_transform"):
            self.sample_rate = int(decoder_model.spec_transform.sample_rate)
        print(
            f"[tts] fish_local ready in {(time.perf_counter()-t0)*1000:.0f}ms "
            f"sr={self.sample_rate}"
        )

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        text = (text or "").strip()
        if not text:
            return _empty(text, self.sample_rate)

        # Optional single fixed reference voice (folder id or ignored).
        ref_id = voice or self.settings.tts_voice or None
        if ref_id in ("", "default", "echo", "af_heart"):
            # af_heart is Kokoro; treat as "no reference → model default timbre"
            ref_id = self.settings.fish_reference_id or None

        t0 = time.perf_counter()
        req = self._ServeTTSRequest(
            text=text,
            references=[],
            reference_id=ref_id,
            max_new_tokens=self.settings.fish_max_new_tokens,
            chunk_length=200,
            top_p=0.7,
            repetition_penalty=1.5,
            temperature=0.7,
            format="wav",
        )
        pcm: np.ndarray | None = None
        sr = self.sample_rate
        err: Exception | None = None
        for result in self._engine.inference(req):
            if result.code == "error":
                err = result.error if isinstance(result.error, Exception) else RuntimeError(
                    str(result.error)
                )
                break
            if result.code == "final" and result.audio is not None:
                sr, segment = result.audio
                pcm = np.asarray(segment, dtype=np.float32).reshape(-1)
        if err is not None:
            raise err
        if pcm is None:
            raise RuntimeError("fish_local produced no audio")
        self.sample_rate = int(sr)
        ms = (time.perf_counter() - t0) * 1000
        return AudioChunk(
            pcm_float32=pcm, sample_rate=int(sr), latency_ms=ms, text=text
        )


class FishHTTPBackend(_Backend):
    """Talk to a fish-speech API server (tools/api_server.py) via HTTP."""

    name = "fish_http"
    sample_rate = 44100

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._url = (settings.fish_url or "").rstrip("/")
        self._ready = False

    @staticmethod
    def available(settings: Settings) -> tuple[bool, str]:
        url = (settings.fish_url or "").strip()
        if not url:
            return False, "ECHO_FISH_URL not set"
        return True, "ok"

    def load(self) -> None:
        if self._ready:
            return
        ok, reason = self.available(self.settings)
        if not ok:
            raise RuntimeError(f"fish_http unavailable: {reason}")
        import httpx

        # Health-ish probe — server may not have /health; hit base.
        base = self._url
        tts_url = base if base.endswith("/tts") else f"{base}/v1/tts"
        if base.endswith("/v1/tts"):
            tts_url = base
        self._tts_url = tts_url
        # Lightweight GET to see if host is up (ignore 4xx)
        try:
            with httpx.Client(timeout=5.0) as client:
                client.get(base.replace("/v1/tts", "").rstrip("/") or base, timeout=5.0)
        except Exception as e:
            # Still allow load — synthesize will fail clearly if down.
            print(f"[tts] fish_http probe warning: {e}")
        self._ready = True
        print(f"[tts] fish_http ready → {self._tts_url}")

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        text = (text or "").strip()
        if not text:
            return _empty(text, self.sample_rate)

        import httpx

        ref_id = voice or self.settings.fish_reference_id or None
        if ref_id in ("", "default", "echo", "af_heart"):
            ref_id = self.settings.fish_reference_id or None

        payload: dict[str, Any] = {
            "text": text,
            "format": "wav",
            "streaming": False,
            "max_new_tokens": self.settings.fish_max_new_tokens,
            "chunk_length": 200,
            "top_p": 0.7,
            "repetition_penalty": 1.5,
            "temperature": 0.7,
        }
        if ref_id:
            payload["reference_id"] = ref_id

        headers = {"Content-Type": "application/json"}
        if self.settings.fish_api_key:
            headers["Authorization"] = f"Bearer {self.settings.fish_api_key}"

        t0 = time.perf_counter()
        with httpx.Client(timeout=120.0) as client:
            r = client.post(self._tts_url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.content
        pcm, sr = _pcm_from_audio_bytes(data, preferred_sr=self.sample_rate)
        self.sample_rate = sr
        ms = (time.perf_counter() - t0) * 1000
        return AudioChunk(pcm_float32=pcm, sample_rate=sr, latency_ms=ms, text=text)


class FishCloudBackend(_Backend):
    """Fish Audio hosted API via official fish-audio-sdk (model s2-pro / s2.1-pro)."""

    name = "fish_cloud"
    sample_rate = 44100

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None

    @staticmethod
    def available(settings: Settings) -> tuple[bool, str]:
        key = settings.fish_api_key or os.environ.get("FISH_API_KEY", "")
        if not key:
            return False, "FISH_API_KEY / ECHO_FISH_API_KEY not set"
        try:
            import fishaudio  # noqa: F401
        except Exception as e:
            return False, f"fish-audio-sdk not installed: {e}"
        return True, "ok"

    def load(self) -> None:
        if self._client is not None:
            return
        ok, reason = self.available(self.settings)
        if not ok:
            raise RuntimeError(f"fish_cloud unavailable: {reason}")
        from fishaudio import FishAudio

        key = self.settings.fish_api_key or os.environ.get("FISH_API_KEY", "")
        self._client = FishAudio(api_key=key)
        print(
            f"[tts] fish_cloud ready model={self.settings.fish_cloud_model}"
        )

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        text = (text or "").strip()
        if not text:
            return _empty(text, self.sample_rate)

        ref_id = voice or self.settings.fish_reference_id or None
        if ref_id in ("", "default", "echo", "af_heart"):
            ref_id = self.settings.fish_reference_id or None

        t0 = time.perf_counter()
        model = self.settings.fish_cloud_model or "s2-pro"
        # convert() → bytes; prefer wav for easy decode
        data = self._client.tts.convert(
            text=text,
            model=model,
            format="wav",
            reference_id=ref_id,
            latency="balanced",
        )
        if not isinstance(data, (bytes, bytearray)):
            if hasattr(data, "read"):
                data = data.read()
            else:
                data = b"".join(bytes(c) for c in data)
        data = bytes(data)

        pcm, sr = _pcm_from_audio_bytes(data, preferred_sr=self.sample_rate)
        self.sample_rate = sr
        ms = (time.perf_counter() - t0) * 1000
        return AudioChunk(pcm_float32=pcm, sample_rate=sr, latency_ms=ms, text=text)


class FishBackend(_Backend):
    """Composite Fish backend: local → HTTP → cloud."""

    name = "fish"
    sample_rate = 44100

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._inner: _Backend | None = None

    def _candidates(self) -> list[tuple[str, type[_Backend], tuple[bool, str]]]:
        s = self.settings
        return [
            ("fish_local", FishLocalBackend, FishLocalBackend.available(s)),
            ("fish_http", FishHTTPBackend, FishHTTPBackend.available(s)),
            ("fish_cloud", FishCloudBackend, FishCloudBackend.available(s)),
        ]

    def probe(self) -> list[str]:
        lines = []
        for name, _cls, (ok, reason) in self._candidates():
            lines.append(f"{name}: {'available' if ok else 'no'} ({reason})")
        return lines

    def load(self) -> None:
        if self._inner is not None:
            return
        errors: list[str] = []
        for name, cls, (ok, reason) in self._candidates():
            if not ok:
                errors.append(f"{name}: {reason}")
                continue
            try:
                backend = cls(self.settings)
                backend.load()
                self._inner = backend
                self.name = backend.name
                self.sample_rate = backend.sample_rate
                print(f"[tts] fish using backend={backend.name}")
                return
            except Exception as e:
                errors.append(f"{name}: load failed: {e}")
                print(f"[tts] fish candidate {name} failed: {e}")
        raise RuntimeError(
            "no fish backend available. "
            + "; ".join(errors)
            + ". S2-Pro local needs ~24GB VRAM + fish_speech + checkpoints/s2-pro. "
            "Or set ECHO_FISH_URL / FISH_API_KEY. Falling back requires ECHO_TTS=kokoro "
            "or auto-fallback."
        )

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        assert self._inner is not None
        chunk = self._inner.synthesize(text, voice=voice)
        self.sample_rate = chunk.sample_rate
        return chunk


class TTSEngine:
    """Public TTS entry used by Orchestrator / smokes."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._backend: _Backend | None = None
        self.sample_rate = 24000
        self.backend_name: str = "unloaded"

    def _build(self, choice: str) -> _Backend:
        choice = (choice or "fish").strip().lower()
        if choice == "kokoro":
            return KokoroBackend(self.settings)
        if choice in ("fish", "fish_local", "fish_http", "fish_cloud", "s2-pro", "s2"):
            if choice == "fish_local":
                return FishLocalBackend(self.settings)
            if choice == "fish_http":
                return FishHTTPBackend(self.settings)
            if choice == "fish_cloud":
                return FishCloudBackend(self.settings)
            return FishBackend(self.settings)
        raise ValueError(f"unknown ECHO_TTS backend: {choice!r} (use fish|kokoro)")

    def load(self) -> None:
        if self._backend is not None:
            return
        requested = (self.settings.tts or "fish").strip().lower()
        allow_fb = bool(self.settings.tts_fallback_kokoro)
        try:
            backend = self._build(requested)
            backend.load()
            self._backend = backend
        except Exception as e:
            if requested != "kokoro" and allow_fb:
                print(
                    f"[tts] backend={requested!r} failed ({e}); "
                    "falling back to kokoro"
                )
                backend = KokoroBackend(self.settings)
                backend.load()
                self._backend = backend
            else:
                raise
        self.backend_name = self._backend.name
        self.sample_rate = self._backend.sample_rate
        print(f"[tts] active backend={self.backend_name} sr={self.sample_rate}")

    def synthesize(self, text: str, voice: str | None = None) -> AudioChunk:
        self.load()
        assert self._backend is not None
        # Single fixed voice mode: ignore client multi-voice picker for fish;
        # Kokoro still accepts settings.tts_voice as the one warm voice.
        if self._backend.name.startswith("fish"):
            voice = self.settings.fish_reference_id or None
        else:
            voice = voice or self.settings.tts_voice
        return self._backend.synthesize(text, voice=voice)

    def synthesize_stream(
        self, sentences: Iterator[str], voice: str | None = None
    ) -> Iterator[AudioChunk]:
        for sent in sentences:
            yield self.synthesize(sent, voice=voice)
