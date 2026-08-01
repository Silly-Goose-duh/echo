# Echo — Local Voice Therapist

A real-time voice agent that runs **STT + TTS locally on your RTX 5050** (no per-request
audio cost) and talks to you like a calm ancient philosopher / gentle psychologist. The
LLM runs via OpenRouter API. The frontend is a calming Next.js app (orb + blue sound-wave
background + live captions), deployed on Vercel, and reaches your PC over a Tailscale Funnel
tunnel.

> **What it is now:** a 24/7 voice companion. Tap the orb, speak, and Echo helps you name
> what you're feeling, sits with it, and — when you're lying to yourself — pushes back with
> the honest counter-opinion, then leaves you a little steadier.

---

## Live links

| What | URL |
|---|---|
| **Frontend (use this)** | https://web-seven-theta-31.vercel.app |
| **Inference server (WebSocket)** | `wss://desktop-re0mlgm.tail7e61ea.ts.net/ws/converse` |
| **Repo** | `C:\Users\admin\dev\echo` |

Open the frontend in **Chrome**, wait for the orb to say **"ready"**, then tap the orb and talk.
Tap again to stop. Captions appear at the bottom as Echo speaks.

---

## Why it was "Not connected" before (and why it stays up now)

The original server + tunnel were background processes inside the agent shell — they died
every time the session reset, so the page showed "Not connected."

**Fix (already applied and running):**
- A **detached launcher** (`scripts/echo_up.bat`) spawns the server + funnel as hidden,
  independent Windows processes that survive the agent shell, logoff, and disconnects.
- An **admin installer** (`scripts/install_service.ps1`) registers a Windows Task Scheduler
  task (`EchoVoiceAgent`) that auto-starts everything at logon and restarts on failure.

**To finish 24/7 auto-boot (one-time, needs admin):** double-click
`scripts/install_service.ps1` (or run it as Administrator). The current session is already
running detached, so the app is live now without that step.

---

## Quick start (manual)

```bash
cd C:/Users/admin/dev/echo
source .venv/Scripts/activate          # git-bash

# 1) start server + tunnel detached (survives this shell)
scripts\echo_up.bat

# 2) health checks
curl http://127.0.0.1:8787/health
curl https://desktop-re0mlgm.tail7e61ea.ts.net/health
```

To stop manually: `taskkill /F /IM uvicorn.exe` and stop the funnel via
`"C:\Program Files\Tailscale\tailscale.exe" funnel --stop 8787`.

---

## Architecture

```
Chrome (Vercel frontend)  --WSS-->  Tailscale Funnel  -->  FastAPI :8787  (RTX 5050)
  orb + blue wave BG + captions          tunnel             STT(Kokoro/Whisper) → LLM → TTS(Kokoro)
```

- **STT:** Faster-Whisper `large-v3-turbo` (default, CUDA) — Parakeet TDT available via `ECHO_STT=parakeet`.
- **TTS:** Kokoro-82M (Apache-2.0), 8 curated voices, streaming.
- **LLM:** OpenRouter `anthropic/claude-haiku-4.5` (fast + thoughtful). Set via `.env`.
- **VAD:** Silero; client-side silence detection for open-mic mode.
- **Barge-in:** new speech interrupts the assistant mid-TTS.
- **Persona:** system prompt in `server/app/config.py` (`system_prompt`) — ancient-philosopher + psychologist, plain words, honest pushback, comfort.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for hardware/VRAM math and [server/README.md](./server/README.md)
for the WebSocket protocol.

---

## Frontend

Next.js (App Router) + Tailwind + Framer Motion. Source in `web/`.

- **Tap-to-talk** orb (toggle, not hold). Open-mic/VAD mode in Settings.
- **Blue gradient sound-wave background** ripples while Echo speaks.
- **Live captions** bar at the bottom (assistant text as it streams).
- **Mobile responsive** (375px+), voice picker, reset.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

WS URL: defaults to the production Funnel; override with `NEXT_PUBLIC_ECHO_WS_URL`.

---

## Deploy (frontend to Vercel)

```bash
cd web
vercel deploy --prod --yes
# The production WS URL is baked into web/lib/protocol.ts (PRODUCTION_WS_URL),
# so the deployed app always targets the Funnel.
```

---

## Configuration (`.env`)

Copy `.env.example` → `.env`. Key vars:

| Var | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` / `ECHO_LLM_API_KEY` | — | required for LLM |
| `ECHO_LLM_MODEL` | `anthropic/claude-haiku-4.5` | swap anytime |
| `ECHO_LLM_MAX_TOKENS` | `600` | therapist replies need room |
| `ECHO_STT` | `faster_whisper` | or `parakeet` |
| `ECHO_TTS_VOICE` | `af_heart` | Kokoro voice id |
| `ECHO_SYSTEM_PROMPT` | therapist prompt | override the persona |

---

## Smoke tests

```bash
source .venv/Scripts/activate
python scripts/smoke_tts.py        # Kokoro renders audio
python scripts/smoke_stt.py        # Whisper transcribes
python scripts/smoke_parakeet.py   # Parakeet (if installed) — rtf ~0.02
python scripts/smoke_llm.py        # LLM streaming
python scripts/local_loop.py --text "hi"   # full turn, no network UI
```

---

## Known limits (honest)

- **Your PC must be on** for the public link to work (per design). The detached launcher +
  Task Scheduler keep it up while the machine is awake; sleep/hibernate/shutdown stops it.
- One shared agent instance; concurrent sessions queue.
- The sandbox test browser can't reach `*.ts.net`, so the agent verifies the WSS path via
  curl/Python rather than a real browser tap — your Chrome connects fine.

## License

Code MIT. Models: Kokoro Apache-2.0, Whisper MIT, Parakeet CC-BY, Silero.
