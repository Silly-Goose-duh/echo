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

## License
MIT (code). Models keep their licenses.
