# CareOS — Technical Handoff Summary

This document summarizes the portable architecture, key verification commands, and handoff checklist for the CareOS codebase. For complete step-by-step setup instructions, see [`README.md`](./README.md).

---

## 1. Quick Handoff Commands (Windows PowerShell)

From the `newcareos-main` folder on any Windows 10/11 machine with Python 3.11/3.12 and Node.js 20+:

```powershell
# 1. Initialize .venv, install backend/frontend dependencies, create .env from .env.example, and cache the RAG model
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

# 2. Run non-destructive health, DB, OCR, RAG, and TypeScript readiness checks
powershell -ExecutionPolicy Bypass -File scripts/check.ps1

# 3. Start Backend (http://127.0.0.1:8000) and Frontend (http://127.0.0.1:5173)
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

---

## 2. Core Subsystem Locations

- **Configuration & Path Portability**: `backend/app/config.py`
  - Automatically loads `.env` from either the repository root or `backend/.env`.
  - Normalizes relative SQLite `DATABASE_URL` paths (`sqlite+aiosqlite:///./careos-local.db`) against `backend/` so commands work from any working directory.
- **Upload Storage**: `backend/app/storage.py`
  - Resolves relative `STORAGE_LOCAL_ROOT` paths against `backend/` (defaulting to `backend/storage/uploads`).
- **OCR & Structured Clinical Extraction**:
  - `backend/app/rag/parsers/` (`pdf_parser.py`, `docx_parser.py`, `image_parser.py`, `unified_document.py`)
  - `backend/app/rag/ocr/` (`ocr_router.py`, `ocr_engine.py`, `handwriting_ocr.py`)
  - `backend/app/ocr.py` (`extract_document_bytes`, `extract_structured_clinical_candidates`)
- **Clinical RAG & Vector Store**:
  - `backend/app/rag/chunker.py` — Overlapping text chunker with page/source provenance.
  - `backend/app/rag/embeddings.py` — Local 384-dim `SentenceTransformer` (`sentence-transformers/all-MiniLM-L6-v2`).
  - `backend/app/rag/store.py` — Dual-backend vector store supporting both SQLite (exact cosine similarity) and PostgreSQL (`pgvector`).
  - `backend/app/rag/pipeline.py` & `backend/app/rag/llm.py` — 3-mode query classification (`guideline_only`, `patient_only`, `mixed`), negation/uncertainty classification, extractive fallback synthesis, and citation verification.
  - `backend/app/rag/guideline_importer.py` — Optional read-only importer for pre-embedded clinical guideline SQLite databases (`LEGACY_RAG_DB_PATH` or `backend/data/careos_rag.db`).
- **Frontend Modules**:
  - `src/components/DocumentWorkflow.tsx` — Document upload, bilingual OCR preview, structured clinical candidate cards, approve/reject review workflow, and soft-delete with confirmation.
  - `src/components/ClinicalKnowledgeSearch.tsx` — Grounded clinical RAG assistant with citation badges and expandable retrieved evidence chunks.

---

## 3. Automated Test Suites

Run from `newcareos-main/backend`:

```powershell
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
..\.venv\Scripts\python.exe -m pytest tests/test_health.py tests/test_ocr_and_parsers.py tests/test_clinical_rag.py -q
```

Run from `newcareos-main`:

```powershell
npm.cmd run typecheck
npm.cmd run build
```
