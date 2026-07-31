# Echo — Local Voice Agent

Real-time voice agent: local STT + TTS on RTX 5050, LLM via OpenRouter, Next.js UI on Vercel, Cloudflare Tunnel to your PC.

**Status:** MVP scaffolding + Milestone 1 in progress. See [TODO.md](./TODO.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Zero-context handoff

| Doc | Purpose |
|---|---|
| [PRD.md](./PRD.md) | Product intent |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Hardware decisions, env, risks |
| [TODO.md](./TODO.md) | Phase checklist + what's done |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Server → Cloudflare Tunnel → Vercel WSS |
| [server/README.md](./server/README.md) | FastAPI / WebSocket API surface |
| This README | Runbook |

## Repo layout

```
echo/
  server/                 # FastAPI + WebSocket inference
    app/
      main.py             # FastAPI entry
      ws.py               # /ws/converse
      orchestrator.py     # turn state machine
      stt.py              # Faster-Whisper / Parakeet
      tts.py              # Kokoro
      vad.py              # Silero
      llm.py              # OpenAI-compatible streaming client
      config.py
    requirements.txt
  scripts/
    local_loop.py         # Milestone 1: mic→STT→LLM→TTS→speaker (no network)
    smoke_tts.py / smoke_stt.py / smoke_llm.py
    run_server.sh|.ps1|.bat
    run_tunnel.*.example  # Cloudflare Tunnel helpers (copy, don't commit secrets)
  deploy/
    cloudflared.config.*.yml.example
  web/                    # Next.js (Milestone 3+)
  docs/DEPLOY.md          # tunnel + Vercel env
  .env.example
```

## Prerequisites (Windows, this machine)

1. **GPU:** RTX 5050, driver with CUDA 12.8+ kernels (validated: driver 591.86 / CUDA 13.1, sm_120).
2. **Python 3.11** + `uv` (or pip).
3. **espeak-ng** (Kokoro phonemizer) — install Windows build and put `espeak-ng.exe` on PATH.
4. **API key:** `OPENROUTER_API_KEY` or `ECHO_LLM_API_KEY`.
5. Node 20+ for frontend (later).

## Quick start — Milestone 1 (local loop)

```bash
cd C:/Users/admin/dev/echo
uv venv .venv --python 3.11
source .venv/Scripts/activate   # git-bash
# PyTorch FIRST — must be cu128 for sm_120
uv pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install -r server/requirements.txt

cp .env.example .env
# edit .env — set ECHO_LLM_API_KEY or rely on OPENROUTER_API_KEY

python scripts/smoke_llm.py
python scripts/smoke_tts.py
python scripts/smoke_stt.py   # needs a wav or uses mic briefly
python scripts/local_loop.py  # full mic loop
```

## Quick start — Milestone 2 (server)

```bash
# from repo root (PYTHONPATH must include repo root so `server` imports)
./scripts/run_server.sh          # git-bash
# .\scripts\run_server.ps1       # PowerShell
# scripts\run_server.bat         # cmd

# manual equivalent:
source .venv/Scripts/activate
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
# open http://127.0.0.1:8787/  (static test page)
curl -s http://127.0.0.1:8787/health
```

## Quick start — Milestone 4 (tunnel + public WSS)

Full path: [docs/DEPLOY.md](./docs/DEPLOY.md). Short version:

```bash
# Terminal A — inference
./scripts/run_server.sh

# Terminal B — install cloudflared once if needed:
#   winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
cloudflared tunnel --url http://127.0.0.1:8787
# copy https://….trycloudflare.com → WSS:
#   wss://….trycloudflare.com/ws/converse
# Frontend / Vercel:
#   NEXT_PUBLIC_ECHO_WS_URL=wss://….trycloudflare.com/ws/converse
```

Named tunnel templates: `deploy/cloudflared.config.named.yml.example`, `scripts/run_tunnel.sh.example`.

**PC off = API down** (accepted). Single instance.

## Env

See `.env.example` and ARCHITECTURE.md. Frontend public WS URL: `NEXT_PUBLIC_ECHO_WS_URL` (see `web/.env.example` when `web/` exists, and docs/DEPLOY.md).

## Assumptions (flagged)

- STT ships as **Faster-Whisper** until Parakeet/NeMo is green on Windows sm_120.
- LLM goes through **OpenRouter**, not direct Anthropic (no Anthropic key on host).
- Single concurrent session in v1.
- Public access requires PC on + tunnel up.

## License

Code: MIT (unless noted). Models: their respective licenses (Kokoro Apache-2.0, Whisper MIT, Parakeet CC-BY, Silero).
