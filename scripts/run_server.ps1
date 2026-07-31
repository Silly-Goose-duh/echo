# Start Echo FastAPI inference server (WebSocket on :8787).
# Usage: from repo root → .\scripts\run_server.ps1
# Requires: .venv created, deps installed, .env present (see README).

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$Activate = Join-Path $Root ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $Activate)) {
    Write-Error "No .venv at $Root\.venv — create with: uv venv .venv --python 3.11"
}

. $Activate

$env:PYTHONPATH = if ($env:PYTHONPATH) { "$Root;$env:PYTHONPATH" } else { "$Root" }

$HostBind = if ($env:ECHO_WS_HOST) { $env:ECHO_WS_HOST } else { "0.0.0.0" }
$Port = if ($env:ECHO_WS_PORT) { $env:ECHO_WS_PORT } else { "8787" }

Write-Host "[echo] root=$Root"
Write-Host "[echo] PYTHONPATH=$env:PYTHONPATH"
Write-Host "[echo] starting uvicorn server.app.main:app --host $HostBind --port $Port"
uvicorn server.app.main:app --host $HostBind --port $Port
