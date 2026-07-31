from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    llm_model: str = "anthropic/claude-haiku-4.5"
    llm_api_key: str = ""

    stt: Literal["faster_whisper", "faster-whisper", "parakeet"] = "faster_whisper"
    stt_model: str = "large-v3-turbo"
    stt_compute: str = "float16"
    parakeet_model: str = "nvidia/parakeet-tdt-0.6b-v3"

    tts_voice: str = "af_heart"
    tts_lang: str = "a"

    device: str = "cuda"
    # Stream TTS per sentence as soon as the first sentence is available.
    stream_tts_early: bool = True
    # Allow a new client message (audio/text/end_utt) to interrupt an
    # in-flight turn (server-side barge-in).
    barge_in_enabled: bool = True
    ws_host: str = "0.0.0.0"
    ws_port: int = 8787
    sample_rate_in: int = 16000
    system_prompt: str = (
        "You are Echo, a concise helpful voice assistant. "
        "Keep replies short (1-3 sentences) unless asked for detail. "
        "No markdown, no bullet lists — speak naturally."
    )

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
