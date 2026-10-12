# CareOS Backend (FastAPI + Clinical OCR + Grounded RAG)

This directory contains the FastAPI backend for CareOS, including multi-tenant clinical operations, RBAC, audit logging, bilingual (Arabic/English) OCR & structured clinical candidate extraction, and the grounded Clinical RAG pipeline.

For the complete full-stack Windows onboarding guide, see the root [`README.md`](../README.md).

## Quick Backend Commands (Windows PowerShell)

Run from the repository root (`newcareos-main`):

```powershell
# 1. Setup virtual environment, dependencies, and .env files
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

# 2. Verify backend health, isolated DB schema, OCR engines, and 384-dim RAG embeddings
powershell -ExecutionPolicy Bypass -File scripts/check.ps1

# 3. Start backend server on http://127.0.0.1:8000
Push-Location backend
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
Pop-Location
```

## Running Backend Tests

All tests use isolated temporary SQLite databases and never touch `careos.db` or `careos-local.db`:

```powershell
Push-Location backend
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
..\.venv\Scripts\python.exe -m pytest tests/test_health.py tests/test_ocr_and_parsers.py tests/test_clinical_rag.py -q
Pop-Location
```

## Key Endpoints

- `GET /api/v1/healthz` — Liveness probe (`{"status": "ok"}`)
- `GET /api/v1/readyz` — Database readiness probe (`{"status": "ready"}`)
- `GET /api/v1/system/status` — Detailed provider status (AI, Speech, Storage, OCR parsers/engines, RAG embedding model)
- `POST /api/v1/ocr/extract` — Standalone OCR & structured clinical candidate extraction
- `POST /api/v1/patients/{patient_id}/documents` — Upload & extract clinical document (`pending_review`)
- `POST /api/v1/documents/{document_id}/review` — Approve (`approved` -> indexes chunks into RAG) or reject (`rejected` -> purges chunks)
- `DELETE /api/v1/documents/{document_id}` — Soft-delete document & purge its RAG chunks
- `POST /api/v1/rag/search` — Semantic retrieval across global guidelines and authorized patient documents
- `POST /api/v1/rag/ask` — Grounded 3-mode clinical QA (`guideline_only`, `patient_only`, `mixed`) with sentence-level citation verification
