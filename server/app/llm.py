"""OpenAI-compatible streaming LLM client (OpenRouter / Anthropic proxy / local)."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

from openai import AsyncOpenAI, OpenAI

from .config import Settings, get_settings


def _client(settings: Settings | None = None) -> OpenAI:
    s = settings or get_settings()
    key = s.resolve_api_key()
    if not key:
        raise RuntimeError(
            "No LLM API key. Set ECHO_LLM_API_KEY or OPENROUTER_API_KEY in .env"
        )
    return OpenAI(base_url=s.llm_base_url.rstrip("/"), api_key=key)


def _async_client(settings: Settings | None = None) -> AsyncOpenAI:
    s = settings or get_settings()
    key = s.resolve_api_key()
    if not key:
        raise RuntimeError(
            "No LLM API key. Set ECHO_LLM_API_KEY or OPENROUTER_API_KEY in .env"
        )
    return AsyncOpenAI(base_url=s.llm_base_url.rstrip("/"), api_key=key)


def stream_chat(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
) -> Iterator[str]:
    """Yield text deltas from the model."""
    s = settings or get_settings()
    client = _client(s)
    stream = client.chat.completions.create(
        model=s.llm_model,
        messages=messages,  # type: ignore[arg-type]
        stream=True,
        temperature=0.7,
        max_tokens=256,
    )
    for chunk in stream:
        choice = chunk.choices[0] if chunk.choices else None
        if not choice or not choice.delta:
            continue
        delta = choice.delta.content
        if delta:
            yield delta


async def astream_chat(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
) -> AsyncIterator[str]:
    s = settings or get_settings()
    client = _async_client(s)
    stream = await client.chat.completions.create(
        model=s.llm_model,
        messages=messages,  # type: ignore[arg-type]
        stream=True,
        temperature=0.7,
        max_tokens=256,
    )
    async for chunk in stream:
        choice = chunk.choices[0] if chunk.choices else None
        if not choice or not choice.delta:
            continue
        delta = choice.delta.content
        if delta:
            yield delta


def build_messages(
    history: list[dict[str, str]],
    user_text: str,
    *,
    settings: Settings | None = None,
) -> list[dict[str, str]]:
    s = settings or get_settings()
    msgs: list[dict[str, str]] = [{"role": "system", "content": s.system_prompt}]
    msgs.extend(history)
    msgs.append({"role": "user", "content": user_text})
    return msgs


def sentence_chunks(token_iter: Iterator[str]) -> Iterator[str]:
    """Buffer streamed tokens and yield on sentence boundaries."""
    buf: list[str] = []
    terminals = set(".!?…")
    for tok in token_iter:
        buf.append(tok)
        text = "".join(buf)
        # Yield when we hit terminal punct + space/end-ish
        if any(text.rstrip().endswith(t) for t in terminals) and (
            tok.endswith(" ") or tok.endswith("\n") or text[-1] in terminals
        ):
            piece = text.strip()
            if piece:
                yield piece
            buf.clear()
    tail = "".join(buf).strip()
    if tail:
        yield tail


async def asentence_chunks(token_iter: AsyncIterator[str]) -> AsyncIterator[str]:
    buf: list[str] = []
    terminals = set(".!?…")
    async for tok in token_iter:
        buf.append(tok)
        text = "".join(buf)
        stripped = text.rstrip()
        if stripped and stripped[-1] in terminals:
            # Prefer break after punctuation (optionally followed by space in next tok)
            if tok.endswith(" ") or tok.endswith("\n") or tok[-1:] in terminals:
                piece = text.strip()
                if piece:
                    yield piece
                buf.clear()
    tail = "".join(buf).strip()
    if tail:
        yield tail
