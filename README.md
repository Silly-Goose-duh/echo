# Echo — Local Voice Therapist

A real-time **voice therapist** that runs STT + TTS locally on your RTX 5050
(no per-request audio cost). The LLM runs via OpenRouter. Frontend is a calm
Next.js app on Vercel; the PC is reached over a Tailscale Funnel tunnel.

---

## Live links

| What | URL |
|---|---|
| **Use this** | **https://echotherapist.vercel.app** |
| Inference WebSocket | `wss://desktop-re0mlgm.tail7e61ea.ts.net/ws/converse` |
| Local repo | `C:\Users\admin\dev\echo` |

> **Not our domains:** `echo.vercel.app` and `echo-voice.vercel.app` belong to
> other projects / accounts. Do not use them.

Open **https://echotherapist.vercel.app** in Chrome → wait for a green “ready”
dot → **tap the orb** to talk → tap again to stop. Captions appear at the bottom
while Echo speaks; a blue sound-wave background animates during speech.

---

## Why it was broken (audit summary)

| Bug | Impact | Fix |
|---|---|---|
| Detached launcher used wrong Python (Hermes/uv, not `.venv`) | Server crashed: `No module named 'numpy'` | `scripts/echo_up.ps1` calls `.venv\Scripts\python.exe` explicitly |
| Production WS fell back to localhost / bad env | UI showed “Not connected” | Default WS = Funnel URL; `.env.production` bakes funnel; local override only in `.env.development.local` |
| Vercel SSO protection on all deploys | Site redirected to Vercel login | `vercel project protection disable --sso` |
| `echo.vercel.app` / `echo-voice.vercel.app` not ours | Wrong app or vanity generator | Renamed project → **echotherapist.vercel.app** |
| Weak therapist prompt + short memory | Shallow, forgetful replies | Stronger persona + 40-message history + 700 max tokens |

---

## Architecture

```
Chrome (Vercel)  --WSS-->  Tailscale Funnel  -->  FastAPI :8787 (RTX 5050)
  orb + blue waves + captions                    STT → LLM → TTS (streaming)
```

- **STT:** Faster-Whisper `large-v3-turbo` (CUDA); Parakeet optional via `ECHO_STT=parakeet`
- **TTS:** Kokoro-82M, 8 voices, streaming
- **LLM:** OpenRouter `anthropic/claude-haiku-4.5`, therapist system prompt
- **Barge-in:** new speech / tap interrupts mid-TTS
- **Persona:** philosopher + psychologist — reflect, validate, clarify, challenge, anchor, close with care

---

## Run the server (this machine)

```bash
cd C:/Users/admin/dev/echo

# Preferred: PowerShell launcher (venv + funnel, detached)
powershell -ExecutionPolicy Bypass -File scripts/echo_up.ps1

# Or manual:
source .venv/Scripts/activate
export PYTHONPATH=.
export PATH="/c/Program Files/eSpeak NG:$PATH"
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

Health checks:
```bash
curl http://127.0.0.1:8787/health
curl https://desktop-re0mlgm.tail7e61ea.ts.net/health
```

### 24/7 auto-start (one-time, needs admin)

Double-click `scripts/install_service.ps1` (UAC prompt). Registers Task Scheduler
task `EchoVoiceAgent` at logon.

---

## Frontend

```bash
cd web
npm install
npm run dev      # uses .env.development.local → ws://127.0.0.1:8787
npm run build    # uses .env.production → Funnel WSS
vercel deploy --prod --yes
```

---

## Therapist design (what makes it exceptional)

Each spoken turn aims to:

1. **Reflect** — name emotion + situation  
2. **Validate** — make the feeling make sense without empty praise  
3. **Clarify** — one sharp kind question  
4. **Challenge** — honest devil’s advocate when they lie to themselves  
5. **Anchor** — optional small grounding move or fitting philosophy line  
6. **Close with care** — leave them a little more seen and steady  

Crisis boundary: not a doctor; if someone is in immediate danger, urge local
emergency / crisis services and stay warm.

---

## Smoke tests

```bash
source .venv/Scripts/activate
python scripts/smoke_tts.py
python scripts/smoke_stt.py
python scripts/smoke_llm.py
python scripts/local_loop.py --text "I feel stuck"
```

---

## Known limits

- PC must be awake; sleep/hibernate stops the public link  
- Single shared agent instance  
- Funnel domain is machine-specific (`desktop-re0mlgm...`)  

## License

Code MIT. Models: Kokoro Apache-2.0, Whisper MIT, Parakeet CC-BY, Silero.
