<#
.SYNOPSIS
    CareOS Portable Windows Setup Script (scripts/setup.ps1)
.DESCRIPTION
    Idempotently prepares a local Windows development environment for CareOS:
    1. Verifies Python (3.11/3.12+), Node.js (20+), and npm are installed.
    2. Creates or repairs a local Python virtual environment (.venv) if copied from another machine.
    3. Installs backend Python dependencies from backend/requirements.txt.
    4. Installs frontend Node dependencies via npm install.
    5. Creates .env and backend/.env from .env.example templates if missing (never overwrites existing .env files).
    6. Creates backend/storage/uploads directory.
    7. Verifies or pre-caches the local SentenceTransformer embedding model.
#>
[CmdletBinding()]
param(
    [switch]$SkipModelWarmup,
    [switch]$SkipNpmInstall,
    [switch]$SkipPipInstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"
$VenvDir = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

function Test-PythonExecutable([string]$PythonExe) {
    if (-not (Test-Path $PythonExe)) { return $false }
    $proc = Start-Process -FilePath $PythonExe -ArgumentList "--version" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\careos_py_out.txt" -RedirectStandardError "$env:TEMP\careos_py_err.txt"
    return ($proc.ExitCode -eq 0)
}

function Resolve-SystemPython {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if (Get-Command py -ErrorAction SilentlyContinue) {
            foreach ($verFlag in @("-3.12", "-3.13", "-3.11")) {
                $outFile = Join-Path $env:TEMP "careos_py_probe.txt"
                $errFile = Join-Path $env:TEMP "careos_py_probe_err.txt"
                $proc = Start-Process -FilePath "py" -ArgumentList "$verFlag -c `"import sys; print(sys.executable)`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
                if ($proc.ExitCode -eq 0 -and (Test-Path $outFile)) {
                    $exePath = (Get-Content $outFile -Raw).Trim()
                    if ($exePath -and (Test-Path $exePath)) {
                        return $exePath
                    }
                }
            }
        }
        if (Get-Command python -ErrorAction SilentlyContinue) {
            $outFile = Join-Path $env:TEMP "careos_py_probe.txt"
            $errFile = Join-Path $env:TEMP "careos_py_probe_err.txt"
            $proc = Start-Process -FilePath "python" -ArgumentList "-c `"import sys; print(sys.executable)`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
            if ($proc.ExitCode -eq 0 -and (Test-Path $outFile)) {
                $exePath = (Get-Content $outFile -Raw).Trim()
                if ($exePath -and (Test-Path $exePath)) {
                    return $exePath
                }
            }
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    throw "Python 3.11+ is not installed or not on PATH. Install Python 3.11 or 3.12 (64-bit) from https://www.python.org/downloads/windows/"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CareOS -- Windows Developer Environment Setup" -ForegroundColor Cyan
Write-Host " Repository Root: $RepoRoot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verify required tools
Write-Host "`n[1/6] Checking required tools..." -ForegroundColor Yellow
$SysPython = Resolve-SystemPython
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or not on PATH. Install Node.js 20 LTS+ from https://nodejs.org/"
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm is not installed or not on PATH."
}

$pyVer = (& $SysPython --version 2>&1)
$nodeVer = (& node --version 2>&1)
$npmVer = (& npm.cmd --version 2>&1)
Write-Host "  Python : $pyVer ($SysPython)" -ForegroundColor Green
Write-Host "  Node.js: $nodeVer" -ForegroundColor Green
Write-Host "  npm    : $npmVer" -ForegroundColor Green

# 2. Create or repair virtual environment
Write-Host "`n[2/6] Checking Python virtual environment (.venv)..." -ForegroundColor Yellow
if (-not (Test-Path $VenvPython)) {
    Write-Host "  Creating virtual environment at $VenvDir ..."
    & $SysPython -m venv $VenvDir
    Write-Host "  Created .venv successfully." -ForegroundColor Green
} elseif (-not (Test-PythonExecutable $VenvPython)) {
    Write-Host "  Detected .venv copied from another machine (stale pyvenv.cfg). Repairing with --upgrade ..." -ForegroundColor Yellow
    & $SysPython -m venv --upgrade $VenvDir
    if (-not (Test-PythonExecutable $VenvPython)) {
        throw "Failed to repair .venv at $VenvDir. Delete the .venv folder and re-run scripts/setup.ps1."
    }
    Write-Host "  Repaired .venv for current machine." -ForegroundColor Green
} else {
    Write-Host "  Existing .venv is valid ($VenvPython)." -ForegroundColor Green
}

# 3. Install backend dependencies
Write-Host "`n[3/6] Installing backend Python dependencies..." -ForegroundColor Yellow
if (-not $SkipPipInstall) {
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
    Write-Host "  Backend Python packages installed." -ForegroundColor Green
} else {
    Write-Host "  Skipped pip install (-SkipPipInstall specified)." -ForegroundColor DarkGray
}

# 4. Install frontend dependencies
Write-Host "`n[4/6] Installing frontend Node dependencies..." -ForegroundColor Yellow
if (-not $SkipNpmInstall) {
    Push-Location $RepoRoot
    try {
        & npm.cmd install
        Write-Host "  Frontend Node packages installed." -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  Skipped npm install (-SkipNpmInstall specified)." -ForegroundColor DarkGray
}

# 5. Copy .env templates if missing (never overwrite existing .env files)
Write-Host "`n[5/6] Configuring environment files and upload storage..." -ForegroundColor Yellow
$RootEnv = Join-Path $RepoRoot ".env"
$RootEnvExample = Join-Path $RepoRoot ".env.example"
if (-not (Test-Path $RootEnv)) {
    Copy-Item -Path $RootEnvExample -Destination $RootEnv
    Write-Host "  Created .env from .env.example" -ForegroundColor Green
} else {
    Write-Host "  Existing .env found (preserved without overwriting)." -ForegroundColor Green
}

$BackendEnv = Join-Path $BackendDir ".env"
$BackendEnvExample = Join-Path $BackendDir ".env.example"
if (-not (Test-Path $BackendEnv)) {
    Copy-Item -Path $BackendEnvExample -Destination $BackendEnv
    Write-Host "  Created backend/.env from backend/.env.example" -ForegroundColor Green
} else {
    Write-Host "  Existing backend/.env found (preserved without overwriting)." -ForegroundColor Green
}

$UploadsDir = Join-Path $BackendDir "storage\uploads"
if (-not (Test-Path $UploadsDir)) {
    New-Item -ItemType Directory -Path $UploadsDir -Force | Out-Null
    Write-Host "  Created upload directory: $UploadsDir" -ForegroundColor Green
} else {
    Write-Host "  Upload directory ready: $UploadsDir" -ForegroundColor Green
}

# 6. Warm up / verify local SentenceTransformer embedding model
Write-Host "`n[6/6] Verifying Clinical RAG embedding model cache..." -ForegroundColor Yellow
if (-not $SkipModelWarmup) {
    Push-Location $BackendDir
    try {
        $env:RAG_ALLOW_MODEL_DOWNLOAD = "true"
        & $VenvPython -c "from app.rag.embeddings import embed_query; v = embed_query('hypertension'); print(f'  Embedding model ready (dim={len(v)})')"
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  Skipped embedding model warmup (-SkipModelWarmup specified)." -ForegroundColor DarkGray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Setup Complete! Next steps:" -ForegroundColor Green
Write-Host "   1. Verify setup : powershell -ExecutionPolicy Bypass -File scripts/check.ps1"
Write-Host "   2. Start CareOS : powershell -ExecutionPolicy Bypass -File scripts/start.ps1"
Write-Host "============================================================" -ForegroundColor Cyan
