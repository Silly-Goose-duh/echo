# Echo — Next.js UI (Milestone 3)

ElevenLabs-inspired dark UI for the local Echo voice agent.
Talks to the FastAPI server over WebSocket (`/ws/converse`).

## Prerequisites

- Node.js 20+ (repo validated on v24.5.0)
- Echo server running for live voice (optional for `npm run build`)

## Setup

```bash
cd web
cp .env.example .env.local
# edit NEXT_PUBLIC_ECHO_WS_URL if the server is not on 127.0.0.1:8787
npm install
```

## Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default WS URL: `ws://127.0.0.1:8787/ws/converse`  
(override with `NEXT_PUBLIC_ECHO_WS_URL` in `.env.local`)

Start the Python server separately (from repo root), e.g.:

```bash
# from repo root, with venv active
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

## Build

```bash
npm run build
npm start   # production server on :3000
```

Build does **not** require the Python server to be running.

## UI

- Dark canvas `#0A0A0A`, single blue accent
- Center orb: idle pulse · hold-to-talk expand · speaking ripples
- Waveform placeholder under the orb
- Collapsible transcript log
- Reset button (clears log + sends `{type:"reset"}`)

## Protocol (client)

See `lib/protocol.ts` and `server/app/ws.py`.

| Direction | Types |
|---|---|
| Client → server | `start`, `reset`, `audio` (pcm16 base64 + sr), `end_utt`, `text` |
| Server → client | `ready`, `final_transcript`, `assistant_text`, `audio`, `turn_end`, `error` |
