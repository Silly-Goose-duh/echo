# Echo

Local voice therapist — STT + TTS on your GPU, LLM via API, calm web UI.

**Live:** https://echotherapist.vercel.app

## What it is

- Tap the orb → talk → Echo answers as a calm philosopher/psychologist
- Audio models run on your PC (RTX 5050); frontend on Vercel
- Blue sound-wave UI, live captions, barge-in, open-mic mode

## Stack

| Layer | Tech |
|--------|------|
| STT | Faster-Whisper (Parakeet optional) |
| TTS | Kokoro-82M |
| LLM | OpenRouter (Claude Haiku) |
| Server | FastAPI WebSocket `:8787` |
| Tunnel | Tailscale Funnel |
| UI | Next.js on Vercel |

## Quick start

```bash
# Server (from repo root, with .venv)
source .venv/Scripts/activate   # Windows git-bash
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787

# Detached + funnel (Windows)
powershell -ExecutionPolicy Bypass -File scripts/echo_up.ps1

# Frontend
cd web && npm i && npm run dev
```

Copy `.env.example` → `.env` and set `OPENROUTER_API_KEY`.

## Layout

```
server/app/   # FastAPI, STT, TTS, LLM, orchestrator
web/          # Next.js orb UI
scripts/      # launcher, smokes
```

## License

MIT (code). Models keep their own licenses.
