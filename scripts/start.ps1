<#
.SYNOPSIS
    CareOS Local Development Startup Script (scripts/start.ps1)
.DESCRIPTION
    Starts the CareOS FastAPI backend (http://127.0.0.1:8000) and Vite React frontend
    (http://127.0.0.1:5173) using relative paths derived from the repository root.
#>
[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"

function Test-PythonExecutable([string]$PythonExe) {
    if (-not (Test-Path $PythonExe)) { return $false }
    $proc = Start-Process -FilePath $PythonExe -ArgumentList "--version" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\careos_py_out.txt" -RedirectStandardError "$env:TEMP\careos_py_err.txt"
    return ($proc.ExitCode -eq 0)
}

$VenvPython = $null
foreach ($candidate in @(
    (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
    (Join-Path $RepoRoot ".venv-1\Scripts\python.exe")
)) {
    if (Test-PythonExecutable $candidate) {
        $VenvPython = $candidate
        break
    }
}
if (-not $VenvPython) {
    throw "No working Python virtual environment found. Run: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Starting CareOS Local Development Stack" -ForegroundColor Cyan
Write-Host "   Backend API : http://127.0.0.1:$BackendPort" -ForegroundColor Cyan
Write-Host "   Swagger Docs: http://127.0.0.1:$BackendPort/docs" -ForegroundColor Cyan
Write-Host "   Frontend UI : http://127.0.0.1:$FrontendPort" -ForegroundColor Cyan
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

Write-Host "`nCareOS processes launched in separate PowerShell windows." -ForegroundColor Green
Write-Host "Open http://127.0.0.1:$FrontendPort in your browser." -ForegroundColor Cyan

