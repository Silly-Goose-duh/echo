# PRD — Local Voice Agent ("Echo")

Real-time, natural-feeling voice agent. STT + TTS run locally on an RTX 5050. LLM runs via API (swappable to local later). Frontend deployed on Vercel, talks to the local inference rig over a tunnel. ElevenLabs-inspired UI, tap-and-hold-to-talk.

See original PRD in conversation history / this file as source of truth for product intent.

## Goals

- Feels like talking to a person: low latency (<800ms perceived turnaround), natural voice, interruptible.
- STT + TTS local on RTX 5050 (8GB VRAM).
- LLM via API for now; swappable to local later.
- Clean minimal UI — big tap-to-talk orb, waveform, dark aesthetic.
- Anyone with a link can use it (Vercel frontend), backed by local machine as inference server.

## Non-goals (v1)

- No voice cloning
- No multi-user accounts
- No mobile app
- PC-off = app-down accepted for v1

## Stack (as built)

| Component | Choice | Notes |
|---|---|---|
| STT primary target | Parakeet TDT 0.6B v3 via NeMo | Heavy install; may fall back |
| STT MVP / fallback | Faster-Whisper large-v3-turbo | Default until Parakeet proven on sm_120 Windows |
| TTS | Kokoro-82M (`kokoro` pip) | Apache 2.0, ~2-3GB |
| VAD | Silero VAD | CPU |
| LLM | OpenRouter → Claude Haiku 4.5 (or equiv) | Anthropic key not present; OpenRouter is |
| Server | FastAPI + WebSocket | Local persistent process |
| Frontend | Next.js App Router + Tailwind + Framer Motion | Vercel |
| Tunnel | Cloudflare Tunnel | Later milestone |

## Architecture

```
Vercel Next.js UI  --WSS-->  Cloudflare Tunnel  -->  FastAPI on RTX 5050
Mic → VAD → STT → Orchestrator → LLM stream → sentence TTS → audio out
```

## Milestones

1. Local-only loop (mic → STT → LLM → TTS → speaker)
2. FastAPI WebSocket + HTML test page
3. Next.js UI on LAN
4. Tunnel + Vercel
5. Barge-in, latency, polish
