# Echo

Existential thinking companion — voice or text. Local STT/TTS on GPU, LLM via API.

**Live:** https://echotherapist.vercel.app

## Modes

- **Voice** — open-mic / tap-to-talk, captions, blue waveforms
- **Chat** — type like a friend (no TTS, faster)

## Persona

Existential psychotherapy (Frankl, Yalom, May, Kierkegaard, Camus…).  
Hard crisis guardrails (Tele-MANAS 14416, iCall, Vandrevala) run *before* the LLM.

> Not a therapist, doctor, or crisis service. No diagnosis.

## Stack

| Layer | Tech |
|--------|------|
| STT | Faster-Whisper |
| TTS | Kokoro-82M |
| LLM | OpenRouter |
| Server | FastAPI WebSocket |
| Tunnel | Tailscale Funnel |
| UI | Next.js |

## Run

```bash
# Server
source .venv/Scripts/activate
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787

# Or Windows detached + funnel
powershell -ExecutionPolicy Bypass -File scripts/echo_up.ps1

# Frontend
cd web && npm i && npm run dev
```

Copy `.env.example` → `.env` (`OPENROUTER_API_KEY`).

## License

MIT (code). Models keep their licenses.
