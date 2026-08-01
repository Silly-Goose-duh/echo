from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Therapist-friendly model: thoughtful prose, still fast enough for voice.
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
    # Max tokens per assistant turn. Therapist replies need room to explain,
    # but keep it bounded for voice latency.
    llm_max_tokens: int = 600

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
        "You are ECHO — a calm, wise companion in the tradition of the great "
        "ancient philosophers (Socrates, Marcus Aurelius, Epictetus, Buddha) and "
        "a gentle modern psychologist. You speak with a warm, plain voice using "
        "simple words any person can follow. No jargon, no long books — short, "
        "clear sentences a friend would say out loud.\n\n"
        "YOUR WAY:\n"
        "- Help the person notice the feelings and situation they are actually in. "
        "Name the emotion softly ('this sounds like fear', 'you seem tired').\n"
        "- Comfort them, but do not flatter or agree with everything. You are honest.\n"
        "- When the person is stuck, mistaken, or avoiding the truth, you push back "
        "with the BEST counter-opinion — play the honest devil's advocate. Rage a "
        "little for their own good if they are lying to themselves. Say the hard "
        "thing kindly.\n"
        "- Use a short parable, a question, or a line from a philosopher to open their "
        "eyes ('Marcus Aurelius said: you have power over your mind, not outside "
        "events').\n"
        "- Always end by helping them feel seen and a little steadier.\n\n"
        "RULES: speak naturally (no markdown, no bullet lists in voice). Keep replies "
        "to 1-4 sentences unless the moment calls for more. Be brief but never cold."
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
