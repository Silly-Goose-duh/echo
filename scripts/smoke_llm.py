#!/usr/bin/env python3
"""Smoke: LLM streaming via OpenRouter."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

# Also pull key from Hermes env if present
import os

hermes_env = Path(os.environ.get("USERPROFILE", "")) / "AppData/Local/hermes/.env"
if hermes_env.is_file() and not os.environ.get("OPENROUTER_API_KEY"):
    for line in hermes_env.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            os.environ["OPENROUTER_API_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

from server.app.config import get_settings
from server.app.llm import build_messages, sentence_chunks, stream_chat


def main() -> int:
    s = get_settings()
    key = s.resolve_api_key()
    print(f"base_url={s.llm_base_url}")
    print(f"model={s.llm_model}")
    print(f"api_key_set={bool(key)} key_len={len(key) if key else 0}")
    if not key:
        print("FAIL: no API key")
        return 1

    msgs = build_messages([], "Say hello in one short sentence.")
    t0 = time.perf_counter()
    first = None
    tokens: list[str] = []
    for tok in stream_chat(msgs):
        if first is None:
            first = (time.perf_counter() - t0) * 1000
        tokens.append(tok)
        print(tok, end="", flush=True)
    print()
    text = "".join(tokens)
    total = (time.perf_counter() - t0) * 1000
    print(f"first_token_ms={first:.0f} total_ms={total:.0f} chars={len(text)}")
    sents = list(sentence_chunks(iter(tokens)))
    print(f"sentence_chunks={sents}")
    print("PASS" if text.strip() else "FAIL")
    return 0 if text.strip() else 1


if __name__ == "__main__":
    raise SystemExit(main())
