# Fish Audio S2-Pro TTS integration

Echo’s TTS facade is `server/app/tts.py`.

## Selection

```text
ECHO_TTS=fish|kokoro
ECHO_TTS_FALLBACK_KOKORO=1   # default on
```

When `ECHO_TTS=fish`, backends are tried in order:

1. **fish_local** — `import fish_speech` + weights under `ECHO_FISH_CHECKPOINT_DIR` (default `checkpoints/s2-pro`)
2. **fish_http** — `ECHO_FISH_URL` pointing at fish-speech `tools/api_server.py` (e.g. `http://127.0.0.1:8080`)
3. **fish_cloud** — `fish-audio-sdk` + `ECHO_FISH_API_KEY` / `FISH_API_KEY`, model `ECHO_FISH_CLOUD_MODEL=s2-pro`

On total failure with fallback enabled → **Kokoro** (`af_heart` by default).

## Why local S2-Pro is not the runtime default on this machine

| Constraint | Detail |
|------------|--------|
| VRAM | Official install docs: **24GB GPU** for inference. RTX 5050 has **8GB**, and STT already uses CUDA. |
| Torch pin | fish-speech `pyproject.toml` pins `torch==2.8.0`; Echo venv is `torch 2.11.0+cu128` for STT. Do not merge. |
| License | Fish Audio Research License — non-commercial without a separate grant. |

## Enabling real Fish audio

### A) Separate 24GB+ box / Docker

```bash
# other machine / container
git clone https://github.com/fishaudio/fish-speech
cd fish-speech && uv sync --python 3.12 --extra cu128
hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro
python tools/api_server.py --listen 0.0.0.0:8080
```

Echo:

```bash
ECHO_TTS=fish
ECHO_FISH_URL=http://<host>:8080
ECHO_TTS_FALLBACK_KOKORO=1
```

### B) Hosted API

```bash
uv pip install --python .venv/Scripts/python.exe "fish-audio-sdk>=1.0.0"
# set ECHO_FISH_API_KEY or FISH_API_KEY
ECHO_TTS=fish
ECHO_FISH_CLOUD_MODEL=s2-pro
```

### C) Force Kokoro only

```bash
ECHO_TTS=kokoro
ECHO_TTS_VOICE=af_heart
```

## Single voice

Server ignores multi-voice client picks. Optional fixed reference: `ECHO_FISH_REFERENCE_ID` (local ref folder name or cloud voice id). UI shows one “Echo” label.

## Smoke

```bash
source .venv/Scripts/activate && export PYTHONPATH=.
python scripts/smoke_tts.py
```

Writes WAV under `%TEMP%/echo_smoke_tts.wav` (and `scripts/_smoke_tts.wav`) and prints backend/shape/sr/duration.
