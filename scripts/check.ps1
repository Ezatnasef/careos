<#
.SYNOPSIS
    CareOS Environment and Health Verification Script (scripts/check.ps1)
.DESCRIPTION
    Non-destructively verifies that a developer's Windows machine is ready to run CareOS:
    1. Checks Python, Node.js, npm, .venv, and node_modules.
    2. Verifies .env / backend/.env and upload storage directory.
    3. Runs an isolated Python verification of settings, Alembic migrations (0001..0018),
       init_db() schema creation, OCR parsers/engines, RAG embeddings, and /health + /readiness + /system/status.
    4. Runs frontend TypeScript typecheck (npm run typecheck).
#>
[CmdletBinding()]
param(
    [switch]$SkipFrontendCheck
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"

function Test-PythonExecutable([string]$PythonExe) {
    if (-not (Test-Path $PythonExe)) { return $false }
    $proc = Start-Process -FilePath $PythonExe -ArgumentList "--version" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\careos_py_out.txt" -RedirectStandardError "$env:TEMP\careos_py_err.txt"
    return ($proc.ExitCode -eq 0)
}

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

$VenvPython = $null
foreach ($candidate in @(
    (Join-Path $RepoRoot ".venv-1\Scripts\python.exe"),
    (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
    (Join-Path $RepoRoot ".venv-2\Scripts\python.exe")
)) {
    if (Test-PythonExecutable $candidate) {
        $VenvPython = $candidate
        break
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CareOS -- Environment and Readiness Check" -ForegroundColor Cyan
Write-Host " Repository Root: $RepoRoot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check runtime tools and virtual environment
Write-Host "`n[1/4] Checking runtimes and virtual environment..." -ForegroundColor Yellow
if (-not $VenvPython) {
    throw "No working Python virtual environment found. Run: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1"
}
$pyVer = (& $VenvPython --version 2>&1)
$nodeVer = (& node --version 2>&1)
$npmVer = (& npm.cmd --version 2>&1)
Write-Host "  Venv Python : $pyVer ($VenvPython)" -ForegroundColor Green
Write-Host "  Node.js     : $nodeVer" -ForegroundColor Green
Write-Host "  npm         : $npmVer" -ForegroundColor Green

if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
    throw "node_modules not found. Run: npm install (or scripts/setup.ps1)"
}

# 2. Check configuration files and directories
Write-Host "`n[2/4] Checking configuration and storage directories..." -ForegroundColor Yellow
$RootEnv = Join-Path $RepoRoot ".env"
$BackendEnv = Join-Path $BackendDir ".env"
if ((Test-Path $RootEnv) -or (Test-Path $BackendEnv)) {
    Write-Host "  Environment file present (.env / backend/.env)." -ForegroundColor Green
} else {
    Write-Host "  Note: No .env found yet (using default development settings from config.py). Copy .env.example to .env to customize." -ForegroundColor Yellow
}

$UploadsDir = Join-Path $BackendDir "storage\uploads"
if (-not (Test-Path $UploadsDir)) {
    New-Item -ItemType Directory -Path $UploadsDir -Force | Out-Null
}
Write-Host "  Uploads directory ready: $UploadsDir" -ForegroundColor Green

# 3. Verify backend imports, Alembic migrations, isolated DB init, OCR status, RAG embeddings, and health endpoints
Write-Host "`n[3/4] Running backend health, Alembic migrations, OCR, RAG, and isolated DB verification..." -ForegroundColor Yellow
$PyCheckScript = @'
import asyncio
import os
from pathlib import Path
import subprocess
import sys
import tempfile

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
os.environ["RAG_ALLOW_MODEL_DOWNLOAD"] = "True"
temp_db = Path(tempfile.gettempdir()) / "careos_check_isolated.db"
if temp_db.exists():
    temp_db.unlink()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_db.as_posix()}"

mig_res = subprocess.run(
    [sys.executable, "-m", "alembic", "upgrade", "head"],
    capture_output=True,
    text=True,
)
assert mig_res.returncode == 0, f"Alembic upgrade head failed:\n{mig_res.stderr}\n{mig_res.stdout}"
print("  Alembic Migrations    : 0001..0018 upgrade head verified")

from fastapi.testclient import TestClient
from app.config import get_settings
from app.db import init_db, engine
from app.main import app
from app.rag.embeddings import embed_query

async def verify_db():
    await init_db()
    await engine.dispose()

asyncio.run(verify_db())
settings = get_settings()
vec = embed_query("clinical hypertension check")
assert len(vec) == 384, f"Expected 384-dim embedding, got {len(vec)}"

with TestClient(app) as client:
    hz = client.get("/api/v1/health")
    rz = client.get("/api/v1/readiness")
    st = client.get("/api/v1/system/status")
    assert hz.status_code == 200 and hz.json()["status"] == "ok", f"health failed: {hz.text}"
    assert rz.status_code == 200 and rz.json()["status"] == "ready", f"readiness failed: {rz.text}"
    assert st.status_code == 200, f"system/status failed: {st.text}"
    status_data = st.json()
    ocr_prov = status_data["providers"]["ocr"]
    rag_prov = status_data["providers"]["rag"]
    print(f"  /api/v1/health        : {hz.json()['status']}")
    print(f"  /api/v1/readiness     : {rz.json()['status']}")
    print(f"  OCR Parsers           : PyMuPDF={ocr_prov['parsers']['pdf_pymupdf']}, pypdf={ocr_prov['parsers']['pdf_pypdf']}, docx={ocr_prov['parsers']['docx']}")
    print(f"  OCR Printed Engine    : available={ocr_prov['engines']['printed']['available']} ({ocr_prov['engines']['printed']['engine']})")
    print(f"  RAG Embedding Model   : {rag_prov['embedding_model']} (384-dim verified)")

if temp_db.exists():
    try:
        temp_db.unlink()
    except OSError:
        pass
'@

Push-Location $BackendDir
try {
    $PyCheckScript | & $VenvPython -
    if ($LASTEXITCODE -ne 0) {
        throw "Backend verification failed with exit code $LASTEXITCODE"
    }
    Write-Host "  Backend verification passed." -ForegroundColor Green
} finally {
    Pop-Location
}

# 4. Run frontend TypeScript check
Write-Host "`n[4/4] Running frontend TypeScript check (npm run typecheck)..." -ForegroundColor Yellow
if (-not $SkipFrontendCheck) {
    Push-Location $RepoRoot
    try {
        & npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend typecheck failed with exit code $LASTEXITCODE"
        }
        Write-Host "  Frontend typecheck passed (0 errors)." -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  Skipped frontend typecheck (-SkipFrontendCheck specified)." -ForegroundColor DarkGray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " ALL CHECKS PASSED -- CareOS is ready to run!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
