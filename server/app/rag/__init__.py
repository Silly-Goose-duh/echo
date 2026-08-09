"""Lightweight local RAG for Vibe therapist knowledge."""

from __future__ import annotations

from .store import Chunk, RagStore, format_rag_context, get_rag_store, retrieve

__all__ = [
    "Chunk",
    "RagStore",
    "format_rag_context",
    "get_rag_store",
    "retrieve",
]
