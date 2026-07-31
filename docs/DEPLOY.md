# Echo — Deploy path (local GPU → Cloudflare Tunnel → Vercel)

Zero-context runbook: start inference on this PC, expose it with a tunnel, point the Next.js frontend at the public **WSS** URL.

**Accepted constraint:** when the PC is off or the tunnel process stops, the public API is down. Single instance only.

---

## Architecture (data path)

```text
Browser (Vercel)  --WSS-->  Cloudflare Edge  --tunnel-->  cloudflared (this PC)
                                                              |
                                                              v
                                                    uvicorn :8787
                                                    server.app.main:app
                                                    /ws/converse
```

- Frontend env: `NEXT_PUBLIC_ECHO_WS_URL=wss://<public-host>/ws/converse`
- Tunnel origin: `http://127.0.0.1:8787` (HTTP; Cloudflare terminates TLS and upgrades WebSockets)
- Do **not** put API keys or tunnel tokens in the Vercel project for the GPU backend; LLM keys stay in the PC `.env`

---

## 0. Prerequisites

| Piece | Notes |
|-------|--------|
| Repo | `C:\Users\admin\dev\echo` |
| Python venv | `.venv` + `server/requirements.txt` + torch cu128 (see root README) |
| `.env` | Copy from `.env.example`; set `ECHO_LLM_API_KEY` or `OPENROUTER_API_KEY` |
| **cloudflared** | Often missing — install below |
| Cloudflare account | Optional for **quick** tunnels; required for **named** stable DNS |
| Vercel project | Hosts `web/` only (Milestone 3+); set public WSS env |

### Install cloudflared (Windows)

```bash
# preferred
winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements

# verify (new shell so PATH refreshes)
where cloudflared
cloudflared --version
```

Manual: [Cloudflare Tunnel downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

If `winget` is blocked, download the Windows amd64 `.exe` and put it on `PATH`.

---

## 1. Start inference server

**Terminal A** — repo root:

```bash
cd /c/Users/admin/dev/echo
./scripts/run_server.sh
```

PowerShell:

```powershell
cd C:\Users\admin\dev\echo
.\scripts\run_server.ps1
```

Manual equivalent:

```bash
cd /c/Users/admin/dev/echo
source .venv/Scripts/activate
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

Verify:

```bash
curl -s http://127.0.0.1:8787/health
# {"ok":true,"service":"echo"}
```

Local WS test page: `http://127.0.0.1:8787/` (serves `server/static/test.html`).

---

## 2. Expose :8787 with Cloudflare Tunnel

**Terminal B** — keep server running.

### Option A — Quick tunnel (fastest smoke; URL changes every run)

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Or:

```bash
cp scripts/run_tunnel.sh.example scripts/run_tunnel.sh
chmod +x scripts/run_tunnel.sh
MODE=quick ./scripts/run_tunnel.sh
```

cloudflared logs a URL like:

```text
https://random-words-here.trycloudflare.com
```

**WSS URL for the frontend:**

```text
wss://random-words-here.trycloudflare.com/ws/converse
```

Health via public HTTPS:

```bash
curl -s https://random-words-here.trycloudflare.com/health
```

### Option B — Named tunnel with install token (stable hostname, no credentials file in repo)

1. Cloudflare Zero Trust → **Networks** → **Tunnels** → Create tunnel → Cloudflared.
2. Copy the **token** (starts with something like `eyJ...`). **Never commit it.**
3. In the dashboard, add a public hostname:
   - Subdomain/domain you control (e.g. `echo-api.yourdomain.com`)
   - Service: `http://127.0.0.1:8787`
4. Run on the PC:

```bash
export CLOUDFLARE_TUNNEL_TOKEN='…paste token…'   # session env only
MODE=token ./scripts/run_tunnel.sh
# or:
cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
```

**WSS:**

```text
wss://echo-api.yourdomain.com/ws/converse
```

### Option C — Named tunnel with local config YAML

```bash
# one-time
cloudflared tunnel login
cloudflared tunnel create echo
cloudflared tunnel route dns echo echo-api.yourdomain.com

cp deploy/cloudflared.config.named.yml.example deploy/cloudflared.config.yml
# edit: tunnel UUID, credentials-file path, hostname
# credentials live under %USERPROFILE%\.cloudflared\ — gitignored

MODE=config ./scripts/run_tunnel.sh
# or:
cloudflared tunnel --config deploy/cloudflared.config.yml run
```

Templates (committed, no secrets):

- `deploy/cloudflared.config.named.yml.example`
- `deploy/cloudflared.config.quick.yml.example`
- `scripts/run_tunnel.sh.example` / `scripts/run_tunnel.ps1.example`

**Gitignored (local only):** `deploy/cloudflared.config.yml`, `scripts/run_tunnel.sh`, `scripts/run_tunnel.ps1`, any `*.json` credentials, tokens in `.env`.

---

## 3. Point Vercel frontend at WSS

When `web/` exists (Next.js):

### Local frontend → tunneled backend

```bash
# web/.env.local  (do not commit secrets; WSS URL is public-ish but still env-driven)
NEXT_PUBLIC_ECHO_WS_URL=wss://random-words-here.trycloudflare.com/ws/converse
```

### Vercel project env

| Name | Value | Environment |
|------|--------|-------------|
| `NEXT_PUBLIC_ECHO_WS_URL` | `wss://echo-api.yourdomain.com/ws/converse` | Production / Preview as needed |

CLI sketch (only if logged in; prefer dashboard for first time):

```bash
# from web/ after vercel link
vercel env add NEXT_PUBLIC_ECHO_WS_URL production
# paste: wss://echo-api.yourdomain.com/ws/converse
```

**Rules:**

- Scheme must be **`wss://`** in the browser (not `ws://`) when the page is HTTPS (Vercel).
- Path must include **`/ws/converse`**.
- Changing a `NEXT_PUBLIC_*` var requires a **redeploy** of the frontend.
- Quick-tunnel hostnames change every `cloudflared` restart → update env + redeploy (or use named tunnel for stability).

### CORS

Browser WebSocket connections are not classic CORS preflight the same way as `fetch`, but:

- Serve the API only via the tunnel hostname you configure.
- If you add REST later, allow the Vercel origin explicitly.
- Cookies are not used for v1 WS auth (open tunnel = anyone with the URL can connect). Treat quick-tunnel URLs as **semi-public**; rotate by restarting; prefer Zero Trust access policies on named tunnels if you need lock-down.

---

## 4. End-to-end smoke checklist

1. PC awake, GPU drivers OK.
2. `./scripts/run_server.sh` → `/health` OK.
3. Tunnel up → `curl https://<public-host>/health` OK.
4. Browser or `websocat` to `wss://<public-host>/ws/converse` → receive `{"type":"ready"}`.
5. Send `{"type":"text","text":"Say hi in one sentence."}` → `assistant_text` + `audio` + `turn_end`.
6. Vercel (or local Next) with `NEXT_PUBLIC_ECHO_WS_URL` set → orb connects, PTT works.

---

## 5. Exact commands cheat-sheet (this machine)

```bash
# A — inference
cd /c/Users/admin/dev/echo
source .venv/Scripts/activate
export PYTHONPATH=.
uvicorn server.app.main:app --host 0.0.0.0 --port 8787

# B — quick public URL (separate terminal)
cloudflared tunnel --url http://127.0.0.1:8787
# → note https://….trycloudflare.com
# → WSS = wss://….trycloudflare.com/ws/converse

# C — frontend env (web/.env.local or Vercel)
# NEXT_PUBLIC_ECHO_WS_URL=wss://….trycloudflare.com/ws/converse
```

PowerShell:

```powershell
cd C:\Users\admin\dev\echo
.\scripts\run_server.ps1
# other window:
cloudflared tunnel --url http://127.0.0.1:8787
```

---

## 6. What not to commit

- `.env`, `web/.env.local`
- `CLOUDFLARE_TUNNEL_TOKEN`, OpenRouter / LLM keys
- `deploy/cloudflared.config.yml` (filled-in)
- `%USERPROFILE%\.cloudflared\*.json` credentials
- Copied `scripts/run_tunnel.sh` if you embedded a token (prefer env var)

---

## 7. Troubleshooting

| Symptom | Check |
|---------|--------|
| `cloudflared` not found | Install via winget; open **new** terminal; `where cloudflared` |
| Tunnel up but 502 | Server not on 8787; origin must be `http://127.0.0.1:8787` |
| WS connects then dies | Keep both processes running; laptop sleep kills tunnel |
| Browser mixed content | Page is HTTPS → must use `wss://`, not `ws://` |
| `ModuleNotFoundError: server` | Run from repo root with `PYTHONPATH=.` or `./scripts/run_server.sh` |
| First turn very slow | Model load on startup; watch server logs after `/health` |

---

## Related

- [server/README.md](../server/README.md) — API surface
- [README.md](../README.md) — local install / Milestone 1–2
- [TODO.md](../TODO.md) — Milestone 4 checklist
- Templates: `deploy/*.yml.example`, `scripts/run_tunnel.*.example`
