from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .persona import THERAPIST_SYSTEM_PROMPT

# Fast enough for short spoken replies.
DEFAULT_LLM_MODEL = "anthropic/claude-haiku-4.5"

# Resolve repo root: server/app/config.py -> parents[2] == echo/
_REPO_ROOT = Path(__file__).resolve().parents[2]

# Authoritatively load .env into the process environment so both
# pydantic-settings and os.environ see the same values (works on Windows too).
load_dotenv(_REPO_ROOT / ".env", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        # Also accept OPENROUTER_API_KEY / ANTHROPIC_API_KEY as the key source.
        env_prefix="",
    )

    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = DEFAULT_LLM_MODEL
    llm_api_key: str = ""
    # Keep replies very short for voice — understanding, not monologues.
    llm_max_tokens: int = 140
    llm_temperature: float = 0.65
    # Lightweight local RAG (markdown chunks; no Supabase required).
    rag_enabled: bool = True
    rag_top_k: int = 3

    # env_prefix is "" so bare names work; the ECHO_* aliases match .env.example.
    stt: Literal["faster_whisper", "faster-whisper", "parakeet"] = Field(
        default="faster_whisper",
        validation_alias=AliasChoices("ECHO_STT", "STT", "stt"),
    )
    stt_model: str = Field(
        default="large-v3-turbo",
        validation_alias=AliasChoices("ECHO_STT_MODEL", "STT_MODEL", "stt_model"),
    )
    stt_compute: str = Field(
        default="float16",
        validation_alias=AliasChoices(
            "ECHO_STT_COMPUTE", "STT_COMPUTE", "stt_compute"
        ),
    )
    parakeet_model: str = Field(
        default="nvidia/parakeet-tdt-0.6b-v3",
        validation_alias=AliasChoices(
            "ECHO_PARAKEET_MODEL", "PARAKEET_MODEL", "parakeet_model"
        ),
    )

    # TTS backend: edge (natural neural, slow) | fish (S2-Pro) | kokoro (local light).
    # Default edge — most human on this box without heavy VRAM.
    tts: Literal[
        "edge", "fish", "kokoro", "fish_local", "fish_http", "fish_cloud"
    ] = Field(
        default="edge",
        validation_alias=AliasChoices("ECHO_TTS", "TTS", "tts"),
    )
    tts_fallback_kokoro: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "ECHO_TTS_FALLBACK_KOKORO", "TTS_FALLBACK_KOKORO", "tts_fallback_kokoro"
        ),
    )
    # Kokoro single warm voice (used when backend=kokoro or as last fallback).
    tts_voice: str = Field(
        default="af_heart",
        validation_alias=AliasChoices("ECHO_TTS_VOICE", "TTS_VOICE", "tts_voice"),
    )
    tts_lang: str = Field(
        default="a",
        validation_alias=AliasChoices("ECHO_TTS_LANG", "TTS_LANG", "tts_lang"),
    )
    # Microsoft Edge neural TTS (human, free, no GPU). Slow + soft by default.
    edge_voice: str = Field(
        default="en-US-AriaNeural",
        validation_alias=AliasChoices("ECHO_EDGE_VOICE", "EDGE_VOICE", "edge_voice"),
    )
    edge_rate: str = Field(
        default="-22%",
        validation_alias=AliasChoices("ECHO_EDGE_RATE", "EDGE_RATE", "edge_rate"),
    )
    edge_pitch: str = Field(
        default="-4Hz",
        validation_alias=AliasChoices("ECHO_EDGE_PITCH", "EDGE_PITCH", "edge_pitch"),
    )
    # --- Fish Audio S2-Pro ---
    # Local checkpoints (hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro)
    fish_checkpoint_dir: str = Field(
        default=str(_REPO_ROOT / "checkpoints" / "s2-pro"),
        validation_alias=AliasChoices(
            "ECHO_FISH_CHECKPOINT_DIR", "FISH_CHECKPOINT_DIR", "fish_checkpoint_dir"
        ),
    )
    fish_codec_path: str = Field(
        default="",
        validation_alias=AliasChoices(
            "ECHO_FISH_CODEC_PATH", "FISH_CODEC_PATH", "fish_codec_path"
        ),
    )
    fish_decoder_config: str = Field(
        default="modded_dac_vq",
        validation_alias=AliasChoices(
            "ECHO_FISH_DECODER_CONFIG", "FISH_DECODER_CONFIG", "fish_decoder_config"
        ),
    )
    fish_half: bool = Field(
        default=False,
        validation_alias=AliasChoices("ECHO_FISH_HALF", "FISH_HALF", "fish_half"),
    )
    # Optional local/remote fish-speech API (tools/api_server.py), e.g. http://127.0.0.1:8080
    fish_url: str = Field(
        default="",
        validation_alias=AliasChoices("ECHO_FISH_URL", "FISH_URL", "fish_url"),
    )
    # Hosted Fish Audio API key (also accepts FISH_API_KEY).
    fish_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "ECHO_FISH_API_KEY", "FISH_API_KEY", "fish_api_key"
        ),
    )
    # Cloud model id (s2-pro / s2.1-pro depending on account).
    fish_cloud_model: str = Field(
        default="s2-pro",
        validation_alias=AliasChoices(
            "ECHO_FISH_CLOUD_MODEL", "FISH_CLOUD_MODEL", "fish_cloud_model"
        ),
    )
    # Fixed single reference voice id (local ref folder name or cloud voice id).
    # Empty → model default timbre (no multi-voice picker).
    fish_reference_id: str = Field(
        default="",
        validation_alias=AliasChoices(
            "ECHO_FISH_REFERENCE_ID", "FISH_REFERENCE_ID", "fish_reference_id"
        ),
    )
    fish_max_new_tokens: int = Field(
        default=1024,
        validation_alias=AliasChoices(
            "ECHO_FISH_MAX_NEW_TOKENS", "FISH_MAX_NEW_TOKENS", "fish_max_new_tokens"
        ),
    )

    device: str = "cuda"
    # Stream TTS per sentence as soon as the first sentence is available.
    stream_tts_early: bool = True
    # Allow a new client message (audio/text/end_utt) to interrupt an
    # in-flight turn (server-side barge-in).
    barge_in_enabled: bool = True
    ws_host: str = "0.0.0.0"
    ws_port: int = 8787
    sample_rate_in: int = 16000
    system_prompt: str = THERAPIST_SYSTEM_PROMPT

    def resolve_api_key(self) -> str:
        for candidate in (
            self.llm_api_key,
            os.environ.get("ECHO_LLM_API_KEY", ""),
            os.environ.get("OPENROUTER_API_KEY", ""),
            os.environ.get("ANTHROPIC_API_KEY", ""),
        ):
            if candidate:
                return candidate
        return ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
