#!/usr/bin/env bash
# Start Echo FastAPI inference server (WebSocket on :8787).
# Usage (git-bash or WSL): from anywhere → bash scripts/run_server.sh
# Requires: .venv created, deps installed, .env present (see README).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.venv/Scripts/activate" ]]; then
  # Windows venv (git-bash)
  # shellcheck disable=SC1091
  source "$ROOT/.venv/Scripts/activate"
elif [[ -f "$ROOT/.venv/bin/activate" ]]; then
  # Unix venv
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
else
  echo "error: no .venv found at $ROOT/.venv — create with: uv venv .venv --python 3.11" >&2
  exit 1
fi

export PYTHONPATH="${ROOT}${PYTHONPATH:+:$PYTHONPATH}"

HOST="${ECHO_WS_HOST:-0.0.0.0}"
PORT="${ECHO_WS_PORT:-8787}"

echo "[echo] root=$ROOT"
echo "[echo] PYTHONPATH=$PYTHONPATH"
echo "[echo] starting uvicorn server.app.main:app --host $HOST --port $PORT"
exec uvicorn server.app.main:app --host "$HOST" --port "$PORT"
