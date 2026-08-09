"""Chunk + retrieve Vibe RAG markdown without Supabase.

Uses sklearn TF-IDF cosine similarity (numpy/scipy already in the stack).
Falls back to plain keyword overlap if sklearn is unavailable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# server/app/rag/store.py -> parents[2] == server/
_SERVER_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAG_PATH = _SERVER_ROOT / "data" / "vibe_therapist_rag.md"

# Target ~400-800 chars per chunk; headers kept as metadata.
_MIN_CHUNK = 280
_TARGET_CHUNK = 600
_MAX_CHUNK = 900


@dataclass(frozen=True)
class Chunk:
    id: int
    header: str
    text: str

    @property
    def content(self) -> str:
        if self.header:
            return f"{self.header}\n{self.text}".strip()
        return self.text.strip()


def _split_by_headers(md: str) -> list[tuple[str, str]]:
    """Split markdown into (header_path, body) sections on ## / ###."""
    lines = md.splitlines()
    sections: list[tuple[str, str]] = []
    h2 = ""
    h3 = ""
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        buf = []
        if not body:
            return
        # Drop pure decorative lines / version footers still ok as context.
        header = " > ".join(p for p in (h2, h3) if p)
        sections.append((header, body))

    for line in lines:
        if line.startswith("## ") and not line.startswith("###"):
            flush()
            h2 = line.lstrip("#").strip()
            h3 = ""
            continue
        if line.startswith("### "):
            flush()
            h3 = line.lstrip("#").strip()
            continue
        if line.startswith("# ") and not line.startswith("##"):
            # Top title — keep as soft header, don't flush hard.
            if not h2:
                h2 = line.lstrip("#").strip()
            continue
        buf.append(line)
    flush()
    return sections


def _soft_split(text: str, max_len: int = _MAX_CHUNK) -> list[str]:
    """Split long section bodies on paragraph / sentence boundaries."""
    text = text.strip()
    if len(text) <= max_len:
        return [text] if text else []

    paras = re.split(r"\n\s*\n+", text)
    out: list[str] = []
    cur = ""

    def push(piece: str) -> None:
        nonlocal cur
        piece = piece.strip()
        if not piece:
            return
        if not cur:
            cur = piece
            return
        if len(cur) + 1 + len(piece) <= _TARGET_CHUNK:
            cur = f"{cur}\n\n{piece}"
            return
        if len(cur) >= _MIN_CHUNK:
            out.append(cur)
            cur = piece
            return
        # cur still short — keep packing even past target until max
        if len(cur) + 1 + len(piece) <= max_len:
            cur = f"{cur}\n\n{piece}"
        else:
            out.append(cur)
            cur = piece

    for p in paras:
        p = p.strip()
        if not p:
            continue
        if len(p) <= max_len:
            push(p)
            continue
        # Sentence-ish split for very long paragraphs / tables.
        parts = re.split(r"(?<=[.!?])\s+|\n+", p)
        for part in parts:
            if len(part) > max_len:
                # Hard wrap as last resort.
                for i in range(0, len(part), _TARGET_CHUNK):
                    push(part[i : i + _TARGET_CHUNK])
            else:
                push(part)

    if cur.strip():
        out.append(cur.strip())
    return out


def chunk_markdown(md: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    idx = 0
    for header, body in _split_by_headers(md):
        for piece in _soft_split(body):
            # Skip tiny nav crumbs
            if len(piece) < 40:
                continue
            chunks.append(Chunk(id=idx, header=header, text=piece))
            idx += 1
    return chunks


class RagStore:
    def __init__(self, chunks: list[Chunk]) -> None:
        self.chunks = chunks
        self._vectorizer = None
        self._matrix = None
        self._use_tfidf = False
        if not chunks:
            return
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer

            corpus = [c.content for c in chunks]
            self._vectorizer = TfidfVectorizer(
                lowercase=True,
                stop_words="english",
                ngram_range=(1, 2),
                max_features=8000,
                sublinear_tf=True,
            )
            self._matrix = self._vectorizer.fit_transform(corpus)
            self._use_tfidf = True
        except Exception:
            self._vectorizer = None
            self._matrix = None
            self._use_tfidf = False

    def retrieve(self, query: str, top_k: int = 4) -> list[Chunk]:
        q = (query or "").strip()
        if not q or not self.chunks:
            return []
        k = max(1, min(top_k, len(self.chunks)))

        if self._use_tfidf and self._vectorizer is not None and self._matrix is not None:
            import numpy as np
            from sklearn.metrics.pairwise import cosine_similarity

            q_vec = self._vectorizer.transform([q])
            scores = cosine_similarity(q_vec, self._matrix).ravel()
            # Prefer positive scores; if all zero, fall back to keyword.
            if float(np.max(scores)) <= 0.0:
                return self._keyword_retrieve(q, k)
            order = np.argsort(-scores)[:k]
            return [self.chunks[int(i)] for i in order if scores[int(i)] > 0]

        return self._keyword_retrieve(q, k)

    def _keyword_retrieve(self, query: str, k: int) -> list[Chunk]:
        tokens = {t for t in re.findall(r"[a-z0-9']+", query.lower()) if len(t) > 2}
        if not tokens:
            return self.chunks[:k]

        scored: list[tuple[float, Chunk]] = []
        for c in self.chunks:
            text = c.content.lower()
            words = set(re.findall(r"[a-z0-9']+", text))
            overlap = len(tokens & words)
            # Light boost if header hits.
            header_hits = sum(1 for t in tokens if t in c.header.lower())
            score = overlap + 1.5 * header_hits
            if score > 0:
                scored.append((score, c))
        scored.sort(key=lambda x: (-x[0], x[1].id))
        return [c for _, c in scored[:k]]


def load_chunks(path: Path | None = None) -> list[Chunk]:
    p = path or DEFAULT_RAG_PATH
    if not p.is_file():
        return []
    return chunk_markdown(p.read_text(encoding="utf-8"))


@lru_cache
def get_rag_store(path_str: str | None = None) -> RagStore:
    path = Path(path_str) if path_str else DEFAULT_RAG_PATH
    return RagStore(load_chunks(path))


def retrieve(query: str, top_k: int = 4, *, path: Path | None = None) -> list[Chunk]:
    store = get_rag_store(str(path) if path else None)
    return store.retrieve(query, top_k=top_k)


def format_rag_context(chunks: list[Chunk], *, max_chars: int = 1800) -> str:
    """Compact context block for system/user injection."""
    if not chunks:
        return ""
    parts: list[str] = []
    used = 0
    for c in chunks:
        block = c.content.strip()
        if c.header:
            block = f"[{c.header}]\n{c.text.strip()}"
        if used + len(block) + 2 > max_chars and parts:
            break
        parts.append(block)
        used += len(block) + 2
    body = "\n\n---\n\n".join(parts)
    return (
        "Internal grounding notes (do not recite verbatim or mention RAG/"
        "documents; weave naturally into a short spoken reply):\n\n" + body
    )
