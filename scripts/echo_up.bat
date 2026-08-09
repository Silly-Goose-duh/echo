@echo off
REM Echo 24/7 launcher — starts the inference server + Tailscale Funnel
REM fully DETACHED (hidden) so they survive this window, the Hermes session,
REM logoff, and reboots (when registered via Task Scheduler).
REM Calls scripts/run_server.bat (which activates our .venv) — flat cmd /c,
REM no nested quoting, so the venv Python (with numpy/torch) is always used.

setlocal
cd /d "%~dp0.."
set "ROOT=%CD%"
set "LOG=%ROOT%\echo_runtime.log"
echo [%date% %time%] Echo launcher started >> "%LOG%"

REM Kill any stale server on :8787 so we don't stack instances
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>&1
)

REM 1) Inference server — hidden, detached
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c \"%ROOT%\scripts\run_server.bat\"' -WindowStyle Hidden -RedirectStandardOutput '%ROOT%\echo_server.log' -RedirectStandardError '%ROOT%\echo_server.err'"

REM 2) Tailscale Funnel — hidden, detached
if exist "C:\Program Files\Tailscale\tailscale.exe" (
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'C:\Program Files\Tailscale\tailscale.exe' -ArgumentList 'funnel','8787' -WindowStyle Hidden -RedirectStandardOutput '%ROOT%\echo_funnel.log' -RedirectStandardError '%ROOT%\echo_funnel.err'"
) else (
  echo [%date% %time%] WARNING: tailscale.exe not found >> "%LOG%"
)

echo [%date% %time%] Echo launcher done (detached server + funnel spawned) >> "%LOG%"
endlocal
