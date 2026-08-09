# sheleftme

Warm **Vibe** therapist companion — voice + chat. Local STT/TTS on GPU, LLM via API.

**Live:** https://sheleftme.vercel.app  
**Repo:** https://github.com/Silly-Goose-duh/echo

## What it is

- **Vibe persona** — wise Gen Z bestie for breakups / existential freefall (not clinical)
- **RAG** — grounded in `server/data/vibe_therapist_rag.md` (TF-IDF retrieve each turn)
- **Hard crisis rails** before the LLM (India: Tele-MANAS **14416**, Kiran **1800-599-0019**, iCall, Vandrevala)
- **Voice** — tap orb once → VAD open-mic; captions = playing sentence
- **Chat** — bottom-right FAB; text-only turns (`speak: false`)
- **UI** — warm late-night design (ink + amber), glass, calm motion

## Architecture

```
Browser (Vercel)  ──WSS──►  Tailscale Funnel  ──►  FastAPI :8787 (your PC)
                              STT (Whisper) → guardrails → RAG → LLM API → TTS → audio out
```

- Frontend: `web/` (Next.js) → production WS defaults to Funnel URL
- Backend: `server/app/` must be running locally for the public site to work

## Run (backend)

```bash
cd echo
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
export PYTHONPATH=.
# optional: PATH includes eSpeak NG for Kokoro phonemes
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

Helpers: `scripts/echo_up.ps1`, `scripts/install_service.ps1` (24/7 Task Scheduler).

Public tunnel (example): Tailscale Funnel → `:8787`  
`wss://desktop-re0mlgm.tail7e61ea.ts.net/ws/converse`

## Run (frontend)

```bash
cd web && npm i && npm run dev
# prod
npm run build && vercel deploy --prod
```

## TTS

| Setting | Behavior |
|---------|----------|
| `ECHO_TTS=fish` (default) | Fish S2-Pro path: local → `ECHO_FISH_URL` → `FISH_API_KEY` |
| Auto fallback | Kokoro `af_heart` if Fish unavailable (current 8GB default) |
| `ECHO_TTS=kokoro` | Force light local voice |

See `docs/TTS_FISH.md`. Smoke: `python scripts/smoke_tts.py`

## Env

Copy `.env.example` → `.env` (never commit secrets).

- `OPENROUTER_API_KEY` or `ECHO_LLM_API_KEY`
- Optional: `ECHO_TTS`, `ECHO_FISH_URL`, `FISH_API_KEY`, `ECHO_STT`

## Key paths

| Path | Role |
|------|------|
| `server/app/persona.py` | Vibe system prompt |
| `server/app/guardrails.py` | Pre-LLM crisis / diagnosis / meds |
| `server/app/rag/` | Chunk + retrieve vibe doc |
| `server/app/tts.py` | Fish facade + Kokoro fallback |
| `server/app/orchestrator.py` | guard → RAG → LLM → TTS |
| `web/components/EchoApp.tsx` | Voice/chat shell |

## License

MIT (code). Model weights keep their own licenses. Fish S2-Pro: Fish Audio research license (non-commercial without separate grant).
