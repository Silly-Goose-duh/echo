# Echo 24/7 launcher — reliable venv + funnel spawn (Windows PowerShell 5.1+).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\echo_up.ps1
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$VenvPy = Join-Path $Root '.venv\Scripts\python.exe'
$Log = Join-Path $Root 'echo_runtime.log'
$Ts = 'C:\Program Files\Tailscale\tailscale.exe'
$Espeak = 'C:\Program Files\eSpeak NG'

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $Log -Value $line -ErrorAction SilentlyContinue
  Write-Host $line
}

Write-Log 'Echo launcher started'

if (-not (Test-Path $VenvPy)) {
  Write-Log "ERROR: venv python missing at $VenvPy"
  exit 1
}

# Kill anything listening on 8787
$lines = netstat -ano | Select-String ':8787\s+.*LISTENING'
foreach ($l in $lines) {
  $parts = ($l.ToString() -split '\s+') | Where-Object { $_ }
  $pidStr = $parts[-1]
  if ($pidStr -match '^\d+$') {
    taskkill /F /PID $pidStr 2>$null | Out-Null
    Write-Log ("killed pid {0} on :8787" -f $pidStr)
  }
}

# Start uvicorn via cmd so PATH/activate are simple and logs append cleanly
$cmd = @"
set PYTHONPATH=$Root&& set PATH=$Espeak;$Root\.venv\Scripts;%PATH%&& "$VenvPy" -m uvicorn server.app.main:app --host 0.0.0.0 --port 8787 >> "$Root\echo_server.log" 2>&1
"@
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WorkingDirectory $Root -WindowStyle Hidden -PassThru
Write-Log ("server started pid={0}" -f $p.Id)

if (Test-Path $Ts) {
  $fp = Start-Process -FilePath $Ts -ArgumentList 'funnel','8787' -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Root 'echo_funnel.log') `
    -RedirectStandardError (Join-Path $Root 'echo_funnel.err')
  Write-Log ("funnel started pid={0}" -f $fp.Id)
} else {
  Write-Log 'WARNING: tailscale.exe not found'
}

Write-Log 'Echo launcher done'
