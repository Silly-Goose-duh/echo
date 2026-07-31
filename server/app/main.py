"""Echo FastAPI app — Milestone 2 surface (models load on startup)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .orchestrator import Orchestrator
from .ws import converse_socket

_orch: Orchestrator | None = None
_STATIC = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _orch
    settings = get_settings()
    _orch = Orchestrator(settings)
    # Lazy-load on first request is OK for dev; eager load for lower first-turn latency
    try:
        _orch.load()
    except Exception as e:
        print(f"[startup] model load deferred/failed: {e}")
    yield
    _orch = None


app = FastAPI(title="Echo Voice Agent", version="0.1.0", lifespan=lifespan)

# CORS for browser frontends (dev: Vercel preview + localhost). Tighten in prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if _STATIC.is_dir():
    app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/health")
def health():
    return {"ok": True, "service": "echo"}


@app.get("/")
def index():
    page = _STATIC / "test.html"
    if page.is_file():
        return FileResponse(page)
    return {"message": "Echo server up. Add server/static/test.html"}


@app.websocket("/ws/converse")
async def ws_converse(ws: WebSocket):
    assert _orch is not None
    await converse_socket(ws, _orch)
