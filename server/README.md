# Echo server

FastAPI + WebSocket voice agent. Loads STT/TTS once, streams LLM tokens, returns sentence-chunked TTS audio.

## Run

From **repo root** (`echo/`), with venv active and `PYTHONPATH` = repo root:

```bash
# preferred
./scripts/run_server.sh          # git-bash
.\scripts\run_server.ps1         # PowerShell
scripts\run_server.bat           # cmd

# or manual
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

Default bind: `0.0.0.0:8787`. Env: see repo `.env.example` (`ECHO_WS_HOST`, `ECHO_WS_PORT`, LLM/STT/TTS keys).

### TTS backends (`ECHO_TTS`)

| Value | Behavior |
|-------|----------|
| `fish` (default) | Try local S2-Pro → `ECHO_FISH_URL` HTTP → `FISH_API_KEY` cloud; then Kokoro if `ECHO_TTS_FALLBACK_KOKORO=1` |
| `kokoro` | Local Kokoro-82M only (single voice `ECHO_TTS_VOICE`, default `af_heart`) |

Local S2-Pro: install [fish-speech](https://github.com/fishaudio/fish-speech) in a **separate** env (pins torch 2.8), download `fishaudio/s2-pro` into `checkpoints/s2-pro`. Official VRAM: **24GB** — not for RTX 5050 8GB + STT.

Health check: `GET http://127.0.0.1:8787/health` → `{"ok":true,"service":"echo"}`.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `GET` | `/` | Serves `static/test.html` if present |
| `GET` | `/static/*` | Static assets |
| `WS` | `/ws/converse` | Voice / text conversation |

### WebSocket `/ws/converse`

JSON text frames. Single concurrent session assumed in v1.

**Client → server**

| `type` | Fields | Meaning |
|--------|--------|---------|
| `start` / `reset` | — | Reset session + audio buffer |
| `audio` | `pcm16` (base64), optional `sr` | PTT chunk (default 16 kHz PCM16 mono) |
| `end_utt` | — | End of utterance → STT → LLM → TTS |
| `text` | `text` | Text-only turn (debug / no mic) |

**Server → client**

| `type` | Fields | Meaning |
|--------|--------|---------|
| `ready` | — | Connected / reset OK |
| `final_transcript` | `text`, `stt_ms`, `backend` | STT result |
| `assistant_text` | `text`, `final` | Streaming assistant text |
| `audio` | `pcm16`, `sr` (often 24 kHz), `text` | TTS sentence chunk |
| `turn_end` | `metrics` | Turn complete |
| `error` | `message` | Failure |
| `partial_transcript` | `text` | Reserved |

Public WSS URL shape (after tunnel):

```text
wss://<public-host>/ws/converse
```

See [docs/DEPLOY.md](../docs/DEPLOY.md) for Cloudflare Tunnel + Vercel `NEXT_PUBLIC_ECHO_WS_URL`.

## Package layout

```text
server/
  app/
    main.py           # FastAPI entry, lifespan model load
    ws.py             # /ws/converse protocol
    orchestrator.py   # turn machine
    stt.py / tts.py / vad.py / llm.py
    config.py         # settings from .env
  static/test.html
  requirements.txt
```

Import path for uvicorn must be `server.app.main:app` with repo root on `PYTHONPATH`.
