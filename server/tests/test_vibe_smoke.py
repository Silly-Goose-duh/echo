"""Smoke tests: guardrails crisis, RAG retrieve, persona import."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python server/tests/test_vibe_smoke.py` from repo root.
_SERVER = Path(__file__).resolve().parents[1]
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))


def test_import_persona() -> None:
    from app.persona import THERAPIST_SYSTEM_PROMPT

    assert "Vibe" in THERAPIST_SYSTEM_PROMPT
    assert "Gen Z" in THERAPIST_SYSTEM_PROMPT or "bestie" in THERAPIST_SYSTEM_PROMPT
    assert "NOT a licensed clinician" in THERAPIST_SYSTEM_PROMPT


def test_crisis_guard_kiran_and_telemanas() -> None:
    from app.guardrails import CRISIS_MESSAGE, check_message

    r = check_message("I want to kill myself")
    assert r.blocked is True
    assert r.kind == "crisis"
    assert "1800-599-0019" in r.message  # India Kiran
    assert "14416" in r.message  # Tele-MANAS
    assert "Kiran" in CRISIS_MESSAGE
    assert "Tele-MANAS" in CRISIS_MESSAGE

    ok = check_message("they left me and I feel empty")
    assert ok.blocked is False
    assert ok.kind == "ok"


def test_rag_retrieve_breakup() -> None:
    from app.rag import get_rag_store, retrieve
    from app.rag.store import DEFAULT_RAG_PATH

    assert DEFAULT_RAG_PATH.is_file(), f"missing RAG doc at {DEFAULT_RAG_PATH}"

    # Clear cache so path is fresh in case of re-runs
    get_rag_store.cache_clear()
    store = get_rag_store()
    assert len(store.chunks) >= 5, f"expected multiple chunks, got {len(store.chunks)}"

    hits = retrieve("they left me for someone else", top_k=4)
    assert hits, "expected at least one RAG hit"
    blob = " ".join(c.content.lower() for c in hits)
    # Should land near betrayal / breakup / scenarios content
    keywords = (
        "cheat",
        "betray",
        "left",
        "breakup",
        "ex",
        "relationship",
        "someone",
        "replaced",
        "rage",
        "love",
    )
    assert any(k in blob for k in keywords), f"irrelevant hits: {blob[:400]}"


def test_build_messages_injects_rag() -> None:
    from app.llm import build_messages
    from app.rag import format_rag_context, retrieve

    chunks = retrieve("I keep checking their socials after they cheated", top_k=3)
    ctx = format_rag_context(chunks)
    msgs = build_messages([], "I keep checking their socials", rag_context=ctx)
    assert msgs[0]["role"] == "system"
    assert "Internal grounding" in msgs[0]["content"] or ctx[:40] in msgs[0]["content"]
    assert msgs[-1]["content"] == "I keep checking their socials"


if __name__ == "__main__":
    test_import_persona()
    print("ok persona")
    test_crisis_guard_kiran_and_telemanas()
    print("ok crisis")
    test_rag_retrieve_breakup()
    print("ok rag")
    test_build_messages_injects_rag()
    print("ok build_messages")
    print("ALL SMOKE PASSED")
