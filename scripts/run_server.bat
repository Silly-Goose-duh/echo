@echo off
REM Start the Echo inference server using THIS project's .venv.
REM Called detached by scripts/echo_up.bat. Do not run torch/CUDA elsewhere.
setlocal
cd /d "%~dp0.."
call "%~dp0..\.venv\Scripts\activate.bat"
set "PYTHONPATH=%~dp0.."
set "PATH=C:\Program Files\eSpeak NG;%PATH%"
uvicorn server.app.main:app --host 0.0.0.0 --port 8787
endlocal
