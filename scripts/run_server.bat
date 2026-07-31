@echo off
REM Start Echo FastAPI inference server (WebSocket on :8787).
REM Usage: double-click or from cmd → scripts\run_server.bat

setlocal
cd /d "%~dp0.."

if not exist ".venv\Scripts\activate.bat" (
  echo error: no .venv — create with: uv venv .venv --python 3.11
  exit /b 1
)

call .venv\Scripts\activate.bat
set "PYTHONPATH=%CD%"

if "%ECHO_WS_HOST%"=="" set ECHO_WS_HOST=0.0.0.0
if "%ECHO_WS_PORT%"=="" set ECHO_WS_PORT=8787

echo [echo] root=%CD%
echo [echo] PYTHONPATH=%PYTHONPATH%
echo [echo] starting uvicorn server.app.main:app --host %ECHO_WS_HOST% --port %ECHO_WS_PORT%
uvicorn server.app.main:app --host %ECHO_WS_HOST% --port %ECHO_WS_PORT%
