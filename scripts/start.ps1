<#
.SYNOPSIS
    CareOS Local Development Startup Script (scripts/start.ps1)
.DESCRIPTION
    Starts the CareOS FastAPI backend (http://127.0.0.1:8003) and Vite React frontend
    (http://127.0.0.1:5173) using relative paths derived from the repository root.
#>
[CmdletBinding()]
param(
    [int]$BackendPort = 8003,
    [int]$FrontendPort = 5173,
    [int]$VoicePort = 8765,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$WithVoice
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"

$NodeCandidates = @(
    (Join-Path $env:LOCALAPPDATA "hermes\tools\node-26.7.0-win32-x64"),
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs"
)
foreach ($nCandidate in $NodeCandidates) {
    if ((Test-Path (Join-Path $nCandidate "node.exe")) -and ($env:PATH -notlike "*$nCandidate*")) {
        $env:PATH = "$nCandidate;$env:PATH"
        break
    }
}

$VenvPython = Join-Path $RepoRoot ".venv-2\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
    throw "Required CareOS Python interpreter was not found at '$VenvPython'. Restore or repair .venv-2 before starting CareOS."
}
$PythonVersionOutput = & $VenvPython --version 2>&1
if ($LASTEXITCODE -ne 0) {
    $PythonError = ($PythonVersionOutput | Out-String).Trim()
    throw "Required CareOS Python interpreter at '$VenvPython' could not run (exit code $LASTEXITCODE). Repair .venv-2 before starting CareOS. $PythonError"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Starting CareOS Local Development Stack" -ForegroundColor Cyan
Write-Host "   Backend API : http://127.0.0.1:$BackendPort" -ForegroundColor Cyan
Write-Host "   Swagger Docs: http://127.0.0.1:$BackendPort/docs" -ForegroundColor Cyan
Write-Host "   Frontend UI : http://127.0.0.1:$FrontendPort" -ForegroundColor Cyan
if ($WithVoice) {
    Write-Host "   Voice Agent : http://127.0.0.1:$VoicePort" -ForegroundColor Cyan
    Write-Host "   Voice Docs  : http://127.0.0.1:$VoicePort/docs" -ForegroundColor Cyan
}
Write-Host "============================================================" -ForegroundColor Cyan

if (-not $FrontendOnly) {
    $backendListening = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
    if ($backendListening) {
        Write-Host "[!] Port $BackendPort is already in use. Skipping backend launch." -ForegroundColor Yellow
    } else {
        Write-Host "Starting CareOS Backend on http://127.0.0.1:$BackendPort ..." -ForegroundColor Green
        Start-Process powershell -WorkingDirectory $BackendDir -ArgumentList @(
            "-NoExit",
            "-Command",
            "`$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK='True'; & '$VenvPython' -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --reload"
        )
    }
}

if (-not $BackendOnly) {
    $frontendListening = Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue
    if ($frontendListening) {
        Write-Host "[!] Port $FrontendPort is already in use. Skipping frontend launch." -ForegroundColor Yellow
    } else {
        Write-Host "Starting CareOS Frontend on http://127.0.0.1:$FrontendPort ..." -ForegroundColor Green
        Start-Process powershell -WorkingDirectory $RepoRoot -ArgumentList @(
            "-NoExit",
            "-Command",
            "npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort"
        )
    }
}

if ($WithVoice) {
    $voiceListening = Get-NetTCPConnection -LocalPort $VoicePort -State Listen -ErrorAction SilentlyContinue
    if ($voiceListening) {
        Write-Host "[!] Port $VoicePort is already in use. Skipping voice agent launch." -ForegroundColor Yellow
    } else {
        Write-Host "Starting Voice Agent Daemon on http://127.0.0.1:$VoicePort ..." -ForegroundColor Green
        $VoiceDir = Join-Path $RepoRoot "voice-agent"
        Start-Process powershell -WorkingDirectory $VoiceDir -ArgumentList @(
            "-NoExit",
            "-Command",
            "`$env:DEMO_PATIENT_ID='demo-patient-001'; `$env:VOICE_AGENT_PORT='$VoicePort'; `$env:PYTHONPATH='$VoiceDir'; & '$VenvPython' -m voice_agent.app.server"
        )
    }
}

Write-Host "`nCareOS processes launched in separate PowerShell windows." -ForegroundColor Green
Write-Host "Open http://127.0.0.1:$FrontendPort in your browser." -ForegroundColor Cyan
