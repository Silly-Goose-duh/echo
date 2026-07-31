# Architecture Notes — Echo

Written after hardware validation on the build machine. Update when assumptions change.

## Hardware (validated 2026-07-30)

| Item | Value |
|---|---|
| GPU | NVIDIA GeForce RTX 5050 Laptop |
| VRAM | 8151 MiB |
| Driver | 591.86 |
| CUDA (driver) | 13.1 |
| Compute capability | **sm_120 (Blackwell)** |
| OS | Windows 10, WDDM |
| Python | 3.11.15 |
| Node | v24.5.0 |

Idle VRAM ~2GB used by desktop apps — leave headroom.

## PRD mismatches / decisions

1. **sm_120 requires PyTorch ≥2.7 built with CUDA 12.8+** (`cu128` wheels). Older `cu121`/`cu124` wheels will fail or silently fall back to CPU.
2. **NeMo + Parakeet on Windows is fragile.** NeMo ASR prefers Linux; install size is large; Blackwell support depends on the NeMo/PyTorch pin. **MVP default STT = Faster-Whisper (`large-v3-turbo`, int8/float16)`.** Parakeet is behind a feature flag `ECHO_STT=parakeet` once NeMo is proven.
3. **No `ANTHROPIC_API_KEY` on this machine.** `OPENROUTER_API_KEY` exists in Hermes env. LLM client uses OpenRouter with model `anthropic/claude-haiku-4.5` (configurable). Drop-in swap to direct Anthropic or local OpenAI-compatible later via `ECHO_LLM_BASE_URL` + `ECHO_LLM_MODEL`.
4. **Kokoro needs `espeak-ng`** for phonemization on Windows. Install path must be on PATH or set `PHONEMIZER_ESPEAK_LIBRARY`.
5. **Audio I/O on Windows:** `sounddevice` + PortAudio. Prefer 16 kHz mono PCM16 for STT path; Kokoro outputs 24 kHz — resample for playback as needed.
6. **VRAM budget (MVP):** Faster-Whisper turbo int8 (~1.6GB) + Kokoro (~2–3GB) + overhead ≈ safe on 8GB with desktop apps running. Full Parakeet + Kokoro also should fit if desktop VRAM is cleared.
7. **Concurrent sessions:** v1 single active conversation; queue later.
8. **Cloud deps for v1 product surface:** Vercel + OpenRouter + Cloudflare Tunnel are intentional (PRD). Local inference has no per-request audio cost.

## Process topology

```
echo/
  server/          # FastAPI inference (this machine, always-on while serving)
  web/             # Next.js frontend (Vercel)
  scripts/         # local loop, smoke tests, model download
  docs/            # living handoff docs
```

## Latency budget (target <800ms perceived)

| Stage | Target |
|---|---|
| Network (tunnel RTT) | 20–50ms |
| VAD end-pointing | 300–500ms silence (perceived as natural pause, not "lag") |
| STT final | 50–200ms (turbo GPU) |
| LLM first sentence | 150–400ms |
| TTS first audio chunk | 50–150ms |
| **Time-to-first-audio after EOU** | **~250–750ms** (exclude VAD silence) |

Biggest lever: stream LLM → sentence-chunk → TTS immediately (do not wait for full reply).

## Config surface (env)

```
ECHO_STT=faster_whisper|parakeet
ECHO_STT_MODEL=large-v3-turbo
ECHO_TTS_VOICE=af_heart
ECHO_LLM_BASE_URL=https://openrouter.ai/api/v1
ECHO_LLM_MODEL=anthropic/claude-haiku-4.5
ECHO_LLM_API_KEY=   # or OPENROUTER_API_KEY
ECHO_WS_HOST=0.0.0.0
ECHO_WS_PORT=8787
ECHO_SAMPLE_RATE_IN=16000
ECHO_DEVICE=cuda
```

## Risks

- PC off / sleep = service down (documented, accepted).
- Windows NeMo install may block Parakeet; Faster-Whisper is the shipping path until Linux box or NeMo green.
- espeak-ng Windows install is a common Kokoro footgun.
- Cloudflare Tunnel must stay running (use service install later).
