# Echo — TODO (living)

Last updated: 2026-07-31

## Done

- [x] Hardware validation (RTX 5050 8GB, sm_120, driver 591.86, CUDA 13.1)
- [x] Architecture notes + PRD mismatches documented
- [x] Repo scaffold under `C:\Users\admin\dev\echo`
- [x] Decision: Faster-Whisper default STT; OpenRouter for LLM
- [x] smoke_llm.py **PASS** (OpenRouter Haiku, ~3.2s first token)
- [x] espeak-ng 1.52.0 present at `C:\Program Files\eSpeak NG`
- [x] Milestone 3 UI scaffold: `web/` Next.js 16 + Tailwind + Framer Motion — `npm run build` **PASS**
- [x] Milestone 4 docs/templates: `docs/DEPLOY.md`, run_server/run_tunnel scripts, cloudflared installed
- [x] Server code: FastAPI WS, orchestrator, STT/TTS/VAD modules, static test.html

## In progress

- [ ] Milestone 1 — local loop with real smoke output
  - [ ] **torch cu128 wheel download** (fresh single-curl after corrupted dual-download; target ~2.6GB → `.wheels/`)
  - [ ] Install local wheels into `.venv` (force replace any CPU torch)
  - [ ] smoke_tts / smoke_stt
  - [ ] scripts/local_loop.py --text end-to-end

## Pending

### Milestone 2 — FastAPI WebSocket
- [ ] server.app: load models once (code exists; needs green torch)
- [ ] `/ws/converse` live smoke with static HTML
- [ ] latency log mic→first-audio

### Milestone 3 — Next.js UI
- [x] App Router + Tailwind + Framer Motion orb (`web/`)
- [x] WebSocket client, push-to-talk
- [x] waveform / speaking states
- [x] transcript drawer
- [ ] LAN test against local server

### Milestone 4 — Tunnel + Vercel
- [x] Docs/templates
- [x] Server run scripts
- [x] cloudflared on host
- [ ] Live tunnel smoke
- [ ] Vercel deploy web/
- [ ] public smoke

### Milestone 5 — Polish
- [ ] barge-in, latency, voice picker, open-mic VAD, Parakeet optional

## Blockers

1. **torch cu128 install** — large wheel; previous install got CPU torch via dependency resolve; corrupted wheel from dual curl — redownloading clean.
2. After CUDA torch is in: uninstall stray `torch==2.13.0` (CPU) before installing local wheel.

## Handoff notes for next agent

- Read ARCHITECTURE.md before changing model choices.
- Wheels dir: `C:\Users\admin\dev\echo\.wheels\`
- Install once download ZIP-valid:
  ```bash
  source .venv/Scripts/activate
  uv pip uninstall torch torchaudio
  uv pip install --no-cache ".wheels/torch-2.11.0+cu128-cp311-cp311-win_amd64.whl" ".wheels/torchaudio-2.11.0+cu128-cp311-cp311-win_amd64.whl"
  python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
  ```
- Prefer MVP: Faster-Whisper + Kokoro + OpenRouter before NeMo.
- Smoke tests must print real timings.
- Do not commit `.env` or API keys or `.wheels/`.
