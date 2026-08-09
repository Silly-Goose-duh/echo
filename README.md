# Echo

Warm therapist-style companion — short simple words. Voice or chat.

**Live:** https://sheleftme.vercel.app

## Modes
- **Voice** — talk (open mic / tap)
- **Chat** — type like a friend

## Design
- Short replies (1–3 sentences), plain language
- Captions match the sentence currently speaking
- Crisis safety before the model (Tele-MANAS 14416, iCall, Vandrevala)
- Not a licensed clinician; no diagnosis / meds

## Run
```bash
source .venv/Scripts/activate && export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
# frontend
cd web && npm i && npm run dev
```

## TTS
- **Default** `ECHO_TTS=fish` (Fish Audio S2-Pro) with auto-fallback to **Kokoro** on this 8GB box.
- Local S2-Pro needs **~24GB VRAM** + `fish_speech` + `checkpoints/s2-pro` (not feasible next to STT on RTX 5050).
- Alternatives: `ECHO_FISH_URL` → fish-speech API server, or `FISH_API_KEY` / `ECHO_FISH_API_KEY` cloud SDK.
- Force light local: `ECHO_TTS=kokoro`. Single fixed warm voice (no multi-voice picker).
- Smoke: `python scripts/smoke_tts.py`

## License
MIT (code). Models keep their licenses. Fish S2-Pro is Fish Audio Research License (non-commercial without separate grant).
