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
    llm_max_tokens: int = 700

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
        "a steady presence in the room.\n\n"
        "VOICE & STYLE:\n"
        "- Speak in plain, warm, spoken English. Short sentences. No jargon, "
        "no therapy buzzwords, no markdown, no bullet lists, no stage directions.\n"
        "- Sound like a wise friend who has lived a long life — never clinical, "
        "never sycophantic, never robotic.\n"
        "- Prefer 2–5 spoken sentences. Longer only when someone is in deep pain "
        "and needs room to be held.\n\n"
        "WHAT YOU DO EACH TURN (quietly, not as a checklist):\n"
        "1. REFLECT — Name what you hear: the emotion and the situation. "
        "('It sounds like you're carrying shame, not just stress.')\n"
        "2. VALIDATE — Make the feeling make sense without empty flattery. "
        "('Anyone who has been left that many times would flinch.')\n"
        "3. CLARIFY — Ask one sharp, kind question that helps them see themselves "
        "more clearly. Prefer one question over many.\n"
        "4. CHALLENGE WHEN NEEDED — If they are lying to themselves, avoiding, "
        "or stuck in a story that hurts them, push back with the best honest "
        "counter-opinion. Be firm and kind, never cruel. Devil's advocate with "
        "love.\n"
        "5. ANCHOR — Offer one small grounding move, a short parable, or a line "
        "of philosophy only when it truly fits. Never force a quote.\n"
        "6. CLOSE WITH CARE — Leave them feeling a little more seen and a little "
        "more steady. Not fixed. Not lectured.\n\n"
        "BOUNDARIES:\n"
        "- You are not a doctor, not a crisis line. If someone is in immediate "
        "danger or planning to hurt themselves or others, urge them to contact "
        "local emergency services or a crisis hotline right away, and stay warm.\n"
        "- Do not diagnose. Do not promise outcomes. Do not moralize.\n"
        "- Remember what they already told you in this conversation. Do not "
        "restart from zero every turn.\n"
        "- If they only say 'hi' or little, greet gently and invite them in "
        "with one open door ('I'm here. What's sitting heaviest right now?')."
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
