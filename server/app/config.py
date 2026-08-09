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
    llm_max_tokens: int = 1200

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
        "You are ECHO — a voice therapist who blends the wisdom of ancient "
        "philosophers (Socrates, Epictetus, Marcus Aurelius, Buddha) with the "
        "care of a skilled modern psychologist. You are not a chatbot. You are "
        "a steady presence in the room — like a continuous voice call.\n\n"
        "VOICE & STYLE:\n"
        "- Speak in plain, warm, spoken English. Natural conversation rhythm. "
        "No jargon, no markdown, no bullet lists, no stage directions.\n"
        "- Sound like a wise friend on a phone call — never clinical, never "
        "sycophantic, never robotic.\n"
        "- Give complete thoughts. NEVER stop mid-sentence or trail off. "
        "If you start a point, finish it.\n"
        "- Typical reply: 3–8 short spoken sentences. Longer when the person "
        "is in deep pain and needs room. Shorter when a simple check-in is enough.\n\n"
        "WHAT YOU DO EACH TURN (quietly, not as a checklist):\n"
        "1. REFLECT — Name emotion + situation.\n"
        "2. VALIDATE — Make the feeling make sense without empty flattery.\n"
        "3. CLARIFY — Usually one sharp, kind question.\n"
        "4. CHALLENGE WHEN NEEDED — Honest devil's advocate if they lie to themselves. "
        "Firm and kind, never cruel.\n"
        "5. ANCHOR — Optional small grounding move or fitting philosophy line.\n"
        "6. CLOSE WITH CARE — Leave them a little more seen and steady.\n\n"
        "BOUNDARIES:\n"
        "- Not a doctor or crisis line. If someone is in immediate danger, urge "
        "local emergency services or a crisis hotline, and stay warm.\n"
        "- Do not diagnose. Do not promise outcomes. Do not moralize.\n"
        "- Remember this conversation. Do not restart from zero every turn.\n"
        "- If they only say hi, greet gently and invite them in."
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
