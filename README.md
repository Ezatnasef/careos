# CareOS — Healthcare Operations, Clinical OCR & Grounded Clinical RAG Platform

[![GitHub Repository](https://img.shields.io/badge/GitHub-Ezatnasef%2Fcareos-blue?logo=github)](https://github.com/Ezatnasef/careos)
[![Bilingual](https://img.shields.io/badge/Bilingual-English%20%7C%20العربية-teal)]()
[![Voice](https://img.shields.io/badge/Egyptian%20Voice-Mohammed%20%26%20Mariam-purple)]()

CareOS is an enterprise-grade healthcare operations and clinical intelligence platform with full bilingual (**English & Arabic**) support. It combines multi-tenant hospital workflow management, role-based access control (RBAC), clinical document ingestion, bilingual OCR & structured candidate extraction, an authentic Egyptian clinical voice assistant (**محمد & مريم**), and a hallucination-resistant **Clinical RAG (Retrieval-Augmented Generation)** pipeline.

---

## 1. Project Overview

CareOS provides:
- **Multi-Tenant Clinical Operations**: Patient records, encounters, vitals, allergies, diagnoses, medications, lab results, appointments, tasks, care plans, billing/invoices, and audit logs.
- **Document Workflow & Bilingual OCR**: Upload PDF, DOCX, PNG/JPG, or plain-text clinical documents (`<= 25 MB`). Automatic routing across native PDF/DOCX parsers (`PyMuPDF` / `pypdf` / `python-docx`), printed OCR (`PaddleOCR` preferred, local Tesseract fallback for Arabic & English), and optional handwritten OCR (`TrOCR`).
- **Structured Clinical Extraction & Clinician Review**: Automatically extracts structured clinical candidates (medications with strength/dosage/frequency/duration, lab results with units/reference ranges, diagnoses, allergies, clinical findings, and follow-up instructions) while flagging uncertain/handwritten tokens for human verification before indexing.
- **Grounded Clinical RAG**: Indexes **only clinician-approved (`review_status="approved"`) and active (`deleted_at IS NULL`)** documents using a local 384-dimensional `SentenceTransformer` (`sentence-transformers/all-MiniLM-L6-v2`) embedding model, enforcing strict tenant/patient isolation, negation/uncertainty preservation, and sentence-level citation verification.

---

## 2. Complete System Architecture & Pipeline

CareOS is architected as an enterprise-grade, multi-tier distributed healthcare platform. It provides clean separation of concerns between client presentation, core clinical operations, real-time voice streaming microservices, bilingual OCR/RAG intelligence pipelines, and external clinical integration gateways.

### 2.1. High-Level Multi-Tier Architecture

```mermaid
flowchart TD
    subgraph ClientTier ["1. Client & Presentation Tier (Port 5173)"]
        UI_Web["React 19 + TypeScript + Vite SPA"]
        UI_RTL["Bilingual RTL/LTR Engine (Arabic / English)"]
        UI_Roles["Role Dashboards (Physician, Nurse, Admin, Billing)"]
        UI_Portal["Patient Portal & Live Clinical Voice Companion"]
        UI_Web --> UI_RTL
        UI_Web --> UI_Roles
        UI_Web --> UI_Portal
    end

    subgraph GatewayTier ["2. Gateway & Proxy Routing"]
        Proxy["Vite Dev Server / Nginx Reverse Proxy"]
        CORS["CORS & Origin Validation"]
        RateLimit["Token Bucket Rate Limiter"]
        Proxy --> CORS --> RateLimit
    end

    subgraph CoreBackend ["3. CareOS Core Backend (FastAPI - Port 8000)"]
        AuthModule["Auth & Identity Subsystem\n• JWT Token Lifecycle\n• Argon2id Hashing\n• TOTP 2-Factor Auth\n• RBAC Permission Matrix"]
        ClinicalOps["Clinical Operations Subsystem\n• Patients, Appointments & Vitals\n• Encounters & SOAP Notes\n• Invoices & Financial Auditing"]
        DocEngine["Document & Bilingual OCR Pipeline\n• Format Router (PDF/DOCX/Images)\n• PaddleOCR / Tesseract (Arabic + English)\n• TrOCR Handwriting Fallback\n• Clinical Entity Extraction"]
        RAGEngine["Grounded Clinical RAG Engine\n• 384-dim SentenceTransformer\n• Hybrid SQLite / pgvector Search\n• Citation & Negation Verifier\n• 3 Retrieval Modes"]
        AuditSubsystem["Immutable HIPAA Audit Logger\n• Actor, Action, Resource, IP"]
    end

    subgraph VoiceService ["4. Voice Agent Microservice (Port 8003)"]
        VoiceWS["WebSocket Bidirectional Voice Handler\n(/v1/voice/turns/stream)"]
        VoiceAgentEngine["Autonomous Booking & Follow-up Agent"]
        DialectNormalizer["to_egyptian_colloquial_speech\n(Natural Egyptian Cairo Phrasing)"]
        TTSDispatcher["Voice Engine Dispatcher\n(Mohammed: spk_06 | Mariam: spk_15)"]
        VoiceWS --> VoiceAgentEngine
        VoiceAgentEngine --> DialectNormalizer
        DialectNormalizer --> TTSDispatcher
    end

    subgraph ExternalIntegrations ["5. Integration & Model Gateways"]
        HF_VoiceTut["mohammedaly22/VoiceTut-TTS\n(Authentic Egyptian Neural Studio)"]
        Groq_STT["Groq Cloud Whisper Large-v3\n(Sub-second Speech-to-Text)"]
        Gemini_AI["Google Gemini / OpenAI LLM APIs\n(Reasoning & Clinical Extraction)"]
        Telegram_Bot["Telegram Patient Bot API\n(Follow-up Reminders & Deep Links)"]
        Meta_WA["Meta Cloud API\n(WhatsApp Notifications)"]
        Medplum_FHIR["Medplum SMART-on-FHIR R4\n(Clinical Interoperability)"]
    end

    subgraph DataStorageTier ["6. Persistence & Storage Tier"]
        DB_Relational[("Primary Database\nSQLite (Dev) / PostgreSQL 16 (Prod)")]
        DB_Vector[("Vector Index\nCosine Array (Dev) / pgvector (Prod)")]
        File_Storage[("Document Storage\nLocal Filesystem / AWS S3")]
        Redis_Cache[("Redis Cache / In-Memory Store\nSession State & Queue")]
    end

    %% Client to Gateway
    UI_Web -->|"/api/v1/*"| Proxy
    UI_Portal -->|"/api/v1/voice/*"| Proxy

    %% Gateway to Services
    Proxy -->|Core API Requests| CoreBackend
    Proxy -->|Voice & Speech Requests| VoiceService

    %% Core Backend to Data
    CoreBackend --> DB_Relational
    CoreBackend --> DB_Vector
    CoreBackend --> File_Storage
    CoreBackend --> Redis_Cache

    %% Integrations Connections
    DocEngine --> Gemini_AI
    VoiceService --> Groq_STT
    VoiceService --> HF_VoiceTut
    CoreBackend --> Telegram_Bot
    CoreBackend --> Meta_WA
    CoreBackend --> Medplum_FHIR
    VoiceAgentEngine -->|Internal Booking Contract| ClinicalOps
```

---

### 2.2. Clinical Document Ingestion, Bilingual OCR & Grounded RAG Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Clinician as Clinician / Staff
    participant UI as React UI (DocumentWorkflow)
    participant API as FastAPI Ingestion Router
    participant OCR as OCR & Parser Router
    participant Extractor as Structured Entity Extractor
    participant DB as Database (ClinicalNote / Chunk)
    participant RAG as Clinical RAG Engine (384-dim)

    Clinician->>UI: Upload Document (PDF, DOCX, PNG, JPG <= 25MB)
    UI->>API: POST /api/v1/documents/upload
    API->>API: Validate MIME, Magic Bytes & Quarantine Scan
    API->>OCR: Route to Parser
    alt Native PDF or DOCX
        OCR->>OCR: Extract Embedded Text (PyMuPDF / python-docx)
    else Scanned Document or Image
        OCR->>OCR: Run PaddleOCR or local Tesseract (Arabic & English text lines)
        opt Low confidence / Handwritten tokens
            OCR->>OCR: TrOCR Handwriting Extraction & Uncertainty Flagging
        end
    end
    OCR->>Extractor: Pass Clean Extracted Text
    Extractor->>Extractor: Extract Medications, Labs, Diagnoses, Allergies
    Extractor-->>API: Structured Candidates + Confidence Scores
    API->>DB: Store Document (review_status = "pending_review")
    API-->>UI: Display Extracted Preview & Uncertainty Badges
    
    Note over Clinician,UI: Human-in-the-Loop Clinical Verification
    Clinician->>UI: Review & Click "Approve Document"
    UI->>API: POST /api/v1/documents/{id}/review (action = "approve")
    API->>DB: Update review_status = "approved"
    API->>RAG: Trigger RAG Chunking & Vectorization
    RAG->>RAG: Generate Overlapping Chunks (500 tokens + 50 overlap)
    RAG->>RAG: Compute 384-dim Embeddings (all-MiniLM-L6-v2)
    RAG->>DB: Persist DocumentChunks with Vector Embeddings
    API-->>UI: Document Approved & Live for Clinical Search
```

---

### 2.3. Egyptian Colloquial Voice Companion & Booking Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient
    participant Companion as PatientVoiceAssistant (React)
    participant VServer as Voice Agent Service (8003)
    participant Groq as Groq Whisper STT
    participant Orchestrator as Autonomous Booking Agent
    participant CoreAPI as CareOS Core API (8000)
    participant TTS as Voice Engine (Mohammed / Mariam)

    Patient->>Companion: Speaks in Egyptian Dialect ("عايز أحجز ميعاد مع دكتور باطنة الأسبوع الجاي")
    Companion->>VServer: Stream Audio / Send Waveform
    VServer->>Groq: Transcribe Speech (Whisper Large-v3 Turbo)
    Groq-->>VServer: "عايز أحجز ميعاد مع دكتور باطنة الأسبوع الجاي"
    VServer->>Orchestrator: Process Turn with Clinical Booking Prompts
    Orchestrator->>CoreAPI: Query Physician Schedules & Available Slots
    CoreAPI-->>Orchestrator: Available Slots: Tuesday 4:00 PM, Thursday 6:00 PM
    Orchestrator->>Orchestrator: Resolve Booking State & Format Clinical Response
    Orchestrator->>VServer: Generate Egyptian Colloquial Text Response
    Note over VServer: to_egyptian_colloquial_speech:<br/>"عندنا ميعاد متاح يوم التلات الساعة 4 العصر ويوم الخميس 6 المغرب... تحب أحجز لحضرتك أنهي ميعاد؟"
    VServer->>TTS: Synthesize Speech (Voice: Mohammed or Mariam, Rate: +14%)
    TTS-->>VServer: Return Audio Stream / MP3 Data
    VServer-->>Companion: Base64 Audio Stream + Text Payload
    Companion->>Patient: Play Warm, Natural Egyptian Audio with Live Transcript
```

---

### 2.4. Core Architectural Subsystems & Responsibilities

| Subsystem | Components & Frameworks | Primary Responsibilities |
| :--- | :--- | :--- |
| **Frontend Web App** | React 19, TypeScript, Vite, Tailwind/Vanilla CSS tokens | Multi-tenant role dashboards, RTL bilingual localization, patient portal, responsive clinical tables, live audio recorder & playback. |
| **Identity & Security** | JWT, Argon2id, PyOTP (TOTP 2FA), RBAC engine | User provisioning, credential verification, per-endpoint permission matrix, instant session revocation (`deleted_at`), HIPAA audit events. |
| **Clinical Core API** | FastAPI, SQLAlchemy Async, Alembic | CRUD and business logic for patients, encounters, SOAP clinical notes, ICD-10 diagnoses, medications, labs, appointments, and billing. |
| **Bilingual OCR Subsystem** | PyMuPDF, python-docx, PaddleOCR, Tesseract, TrOCR | Multi-format document parser, printed Arabic/English OCR, handwriting recognition, candidate entity extraction with confidence scoring. |
| **Grounded Clinical RAG** | SentenceTransformers (`all-MiniLM-L6-v2`), pgvector/SQLite cosine | Semantic clinical retrieval strictly scoped to approved patient records, 3 search modes (`guideline_only`, `patient_only`, `mixed`), negation preservation, and sentence-level citation verification. |
| **Voice Agent Microservice** | WebSockets, Groq Whisper STT, LangChain, Pydantic | Autonomous appointment booking, intelligent conversational triage, multi-turn state preservation, streaming audio responses. |
| **Egyptian Voice Engine** | `mohammedaly22/VoiceTut-TTS` + Neural Egyptian Engine | Authentic Egyptian colloquial dialect transformation, distinct male (**محمد**) and female (**مريم**) voices, natural tempo calibration (+14%). |
| **Omnichannel Follow-up** | Telegram Bot API, Meta WhatsApp Cloud API | Automated post-visit follow-up delivery, interactive patient reminders, deep-link bot onboarding, encounter reply mapping. |
| **Interoperability Adapter** | Medplum FHIR R4 Client, JSON-LD | Standard SMART-on-FHIR resource mapping (Patient, Observation, Condition, Encounter, DocumentReference). |

---

## 3. Repository Structure

```text
newcareos-main/
├── .env.example                 # Root environment configuration template
├── .gitignore                   # Excludes .env, .venv, node_modules, local DBs, uploads
├── docker-compose.yml           # PostgreSQL (pgvector:pg16) + Redis + FastAPI stack
├── package.json                 # Frontend dependencies & npm scripts
├── playwright.config.ts         # End-to-end Playwright test configuration
├── vite.config.ts               # Vite dev server & /api/v1 proxy to 127.0.0.1:8000
├── scripts/
│   ├── setup.ps1                # One-command Windows environment setup script
│   ├── check.ps1                # Non-destructive health, DB, OCR, RAG & TS check script
│   └── start.ps1                # Launches Backend (8000) and Frontend (5173) on Windows
├── src/                         # React 19 + TypeScript frontend source
│   ├── api/                     # Typed API client & services (services.ts, client.ts)
│   ├── components/              # Clinical UI modules (DocumentWorkflow, ClinicalKnowledgeSearch, etc.)
│   ├── context/                 # Auth, Language (EN/AR RTL), and Theme providers
│   └── pages/                   # Application views and role dashboards
└── backend/                     # FastAPI Python backend
    ├── .env.example             # Backend environment configuration template
    ├── Dockerfile               # Production container image with OCR system libraries
    ├── alembic.ini              # Alembic migration configuration
    ├── pyproject.toml           # Python project metadata & pytest configuration
    ├── requirements.txt         # Pinned/bounded Python dependencies
    ├── migrations/              # Alembic schema migrations (0001 through 0018)
    ├── app/
    │   ├── main.py              # FastAPI application entrypoint & middleware
    │   ├── api.py               # Core REST endpoints (/auth, /patients, /documents, /rag, /system)
    │   ├── config.py            # Portable Pydantic settings & path normalization
    │   ├── db.py                # Async SQLAlchemy engine & session management
    │   ├── models.py            # SQLAlchemy ORM models (including DocumentChunk 384-dim vector)
    │   ├── ocr.py               # Bilingual structured clinical candidate extraction
    │   ├── storage.py           # Local filesystem (backend/storage/uploads) & S3 storage service
    │   └── rag/                 # Clinical RAG subsystem
    │       ├── parsers/         # PDF, DOCX, and Image parsers -> UnifiedDocument
    │       ├── ocr/             # Printed (PaddleOCR/Tesseract) & Handwriting (TrOCR) OCR engines + router
    │       ├── chunker.py       # Overlapping clinical page chunker
    │       ├── embeddings.py    # Local SentenceTransformer (all-MiniLM-L6-v2, 384-dim)
    │       ├── store.py         # Dual-backend vector store (SQLite cosine + pgvector)
    │       ├── llm.py           # Extractive synthesis + optional external LLM + citation verifier
    │       └── pipeline.py      # 3-mode RAG pipeline (guideline_only, patient_only, mixed)
    └── tests/                   # Backend automated test suites (pytest)
└── voice-agent/                 # Standalone Voice Agent & Audio Streaming Microservice
    ├── requirements.txt         # Voice agent specific dependencies
    └── voice_agent/             # Autonomous booking, multilingual LLM, and real-time audio pipeline
```

---

## 4. System Requirements

| Requirement | Minimum / Recommended Version | Notes |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 / Windows 11 (64-bit) | Linux and macOS also supported via standard venv / Docker |
| **Python** | **Python 3.11 or 3.12 (64-bit)** | Ensure `python` and `pip` are added to `PATH` |
| **Node.js & npm** | **Node.js 20 LTS+** (`npm 10+`) | Required for Vite React 19 frontend |
| **Git** | Git 2.40+ | For version control |
| **Disk Space** | ~4 GB free | For `.venv`, `node_modules`, PaddleOCR models, and HuggingFace embedding cache |
| **Docker Desktop** *(Optional)* | Docker Engine 24+ / Compose v2 | Only required if running the PostgreSQL (`pgvector`) + Redis container stack |

> **OCR & Native Libraries Note (Windows)**:
> PDF parsing (`PyMuPDF` / `pypdf`), DOCX parsing (`python-docx`), and image handling (`Pillow` / `opencv-python-headless`) work out of the box via prebuilt Windows wheels—no external Poppler or Tesseract installer is required.

---

## 5. Quick Start for Windows (PowerShell)

Open **PowerShell** inside the `newcareos-main` folder and run:

```powershell
# 1. Automated setup (creates .venv, installs Python & Node packages, copies .env.example -> .env, warms up RAG model)
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

# 2. Verify environment readiness (checks DB, OCR, 384-dim RAG embeddings, health endpoints, and TypeScript)
powershell -ExecutionPolicy Bypass -File scripts/check.ps1

# 3. Start Backend (http://127.0.0.1:8000) and Frontend (http://127.0.0.1:5173)
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

Once started:
- **Frontend UI**: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **Backend API Root**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check**: [http://127.0.0.1:8000/api/v1/healthz](http://127.0.0.1:8000/api/v1/healthz)
- **System & OCR/RAG Status**: [http://127.0.0.1:8000/api/v1/system/status](http://127.0.0.1:8000/api/v1/system/status)

---

## 6. Detailed Backend Setup (Manual Step-by-Step)

If you prefer to set up the backend manually in PowerShell from the repository root (`newcareos-main`):

```powershell
# 1. Create and activate the virtual environment at the repository root
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Upgrade pip and install backend dependencies
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

# 3. Create your local environment file from the template
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }

# 4. Run database migrations (creates/updates backend/careos-local.db by default)
Push-Location backend
alembic upgrade head

# 5. Start the FastAPI server on port 8000
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
Pop-Location
```

---

## 7. Detailed Frontend Setup (Manual Step-by-Step)

In a second PowerShell terminal at the repository root (`newcareos-main`):

```powershell
# 1. Copy root .env template if not present
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# 2. Install Node.js dependencies
npm.cmd install

# 3. Verify TypeScript compilation
npm.cmd run typecheck

# 4. Start the Vite development server on port 5173
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

> **Note on Vite API Proxy**: By default, `vite.config.ts` proxies all `/api/v1/*` requests from `http://127.0.0.1:5173` to `http://127.0.0.1:8000`. Leave `VITE_API_BASE_URL` empty in `.env` during local development so browser requests use the built-in proxy without CORS issues.

---

## 8. Environment Variables Reference

Both `.env` (in the repo root) and `backend/.env` are automatically loaded by `backend/app/config.py`.

| Variable | Default (Dev) | Required? | Description |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | `development` | Yes | `development`, `staging`, or `production` |
| `DEMO_LOGIN_ENABLED` | `false` | No | Enables the public demo accounts in production. Demo accounts are limited to the synthetic `CareOS Public Demo Sandbox` organization; leave disabled unless that sandbox is wanted. |
| `API_PREFIX` | `/api/v1` | Yes | REST API route prefix |
| `DATABASE_URL` | `sqlite+aiosqlite:///./careos-local.db` | Yes | Async SQLAlchemy URL (`sqlite+aiosqlite` in dev, `postgresql+asyncpg` in prod) |
| `SECRET_KEY` | `development-only-change-this-secret` | Prod: Yes | JWT & session signing key (must be `>= 32` chars in production) |
| `ACCESS_TOKEN_MINUTES` | `30` | No | JWT access token expiration window in minutes |
| `STORAGE_BACKEND` | `filesystem` | Yes | `filesystem` (stores under `backend/storage/uploads`) or `s3` |
| `STORAGE_LOCAL_ROOT` | `storage/uploads` | No | Local upload folder (relative paths resolve inside `backend/`) |
| `OCR_DEFAULT_ENGINE` | `printed` | No | `printed` (PaddleOCR preferred, Tesseract fallback), `handwriting`, or `auto` |
| `OCR_LANGUAGE` | `ar` | No | Default PaddleOCR language (`ar` or `en`) |
| `HANDWRITING_OCR_MODEL` | `sherif1313/Arabic-handwritten-OCR-4bit-Qwen2.5-VL-3B-v3` | No | Optional Vision-Language handwriting OCR model |
| `HANDWRITING_OCR_DEVICE` | `auto` | No | Device for handwriting OCR (`auto`, `cuda`, or `cpu`) |
| `RAG_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Yes | Local 384-dim embedding model |
| `RAG_ALLOW_MODEL_DOWNLOAD` | `true` (in `.env.example`) | Yes (1st run) | Allows caching `all-MiniLM-L6-v2` (~90 MB) on first run on a new machine |
| `VECTOR_TOP_K` / `RAG_TOP_K` | `8` | No | Maximum number of chunks retrieved per RAG query |
| `RAG_RELEVANCE_THRESHOLD` | `0.55` | No | Minimum cosine similarity (`0.0` to `1.0`) for clinical evidence retrieval |
| `LEGACY_RAG_DB_PATH` | *(empty)* | No | Optional path to a read-only `careos_rag.db` SQLite file for bulk guideline import |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `AI_API_KEY` | *(empty)* | No | Optional external LLM API key. When empty, CareOS uses deterministic extractive synthesis |
| `VITE_PORT` | `5173` | No | Vite dev server port |
| `VITE_API_BASE_URL` | *(empty)* | No | Frontend API base URL override (leave empty to use Vite proxy) |

---

## 9. Database Setup and Migrations

- **Local Development (Default)**: Uses SQLite (`sqlite+aiosqlite:///./careos-local.db`), resolved relative to `backend/`. When the FastAPI server starts in non-production mode, `init_db()` automatically ensures all tables exist (`Base.metadata.create_all`).
- **Alembic Migrations**: Located in `backend/migrations/versions/` (`0001_enterprise_schema.py` through `0018_clinical_rag_document_chunks.py`).
  To apply migrations manually against your configured `DATABASE_URL`:
  ```powershell
  Push-Location backend
  ..\.venv\Scripts\python.exe -m alembic upgrade head
  Pop-Location
  ```
- **Demo Accounts (Development Mode)**:
  On the login screen, you can register a new organization owner or use the built-in demo login endpoint (`/api/v1/auth/demo-login`) for roles such as `doctor` (`doctor.demo` / `Doctor@123`), `admin` (`admin.demo` / `Admin@123`), `nurse` (`nurse.demo` / `Nurse@123`), or `patient` (`patient.demo` / `Patient@123`).

---

## 10. OCR, RAG, and AI Configuration

### How OCR Works
1. **PDF & DOCX Native Extraction**: Digital PDFs are parsed with `PyMuPDF` (`fitz`) and `pypdf` fallback; `.docx` files use `python-docx`.
2. **Printed OCR (`PaddleOCR` / Tesseract)**: Scanned PDFs and images (`.png`, `.jpg`) use PaddleOCR when installed, with local Tesseract as the Arabic/English fallback.
3. **Handwriting OCR (`Qwen2.5-VL` / Transformers, Optional)**: Lazy-loaded only when `ocr_engine="handwriting"` is explicitly requested.
4. **Structured Candidate Organization**: Raw OCR text is normalized by `extract_structured_clinical_candidates` in `backend/app/ocr.py` into medications, labs, diagnoses, allergies, findings, and follow-up items, with explicit `[NEEDS_REVIEW]` flags for uncertain/handwritten lines.

### How Clinical RAG Works (Offline-Ready by Default)
- **Local Embeddings**: Uses `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions). On a new machine, keep `RAG_ALLOW_MODEL_DOWNLOAD=true` in `.env` for the first run (or run `scripts/setup.ps1`) so HuggingFace caches the ~90 MB model locally. Once cached, it runs 100% offline.
- **Approval Gate**: Uploaded documents start in `review_status="pending_review"`. Only when a clinician clicks **Approve & Index** (`POST /api/v1/documents/{id}/review`) are the document's chunks embedded and stored in `document_chunks`. Rejected or soft-deleted documents are immediately purged from the vector store.
- **No External LLM Key Required**: When no `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `AI_API_KEY` is configured, the RAG pipeline uses deterministic **Extractive Evidence Synthesis** with strict sentence-level citation verification (`[Source: <filename>, Page <n>]`). If an external key is configured, the pipeline uses the external LLM while still enforcing post-generation citation verification and refusal on insufficient evidence.

### Speech Output
- Generated speech uses VoiceTut-TTS first through `POST /api/v1/assistant/tts`, including the landing-page assistant, patient portal, and Voice Agent.
- The backend calls VoiceTut through the Gradio Python client using the server-side Hugging Face token. If VoiceTut fails or its ZeroGPU quota is exhausted, Edge TTS is tried next; Arabic replies also use Google Translate TTS as a final fallback.
- Edge TTS and Google TTS send reply text to their respective online speech services. Google TTS uses a generic Arabic voice rather than a distinct Egyptian male/female voice.
- If all applicable speech providers fail, the reply remains available as text.

---

## 11. Running the Full Stack Locally

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

### End-to-End Functional Verification Flow in the UI
1. Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and sign in (or register a new clinic account).
2. Navigate to **Patients** and select or create a patient.
3. Open **Documents** (`DocumentWorkflow`):
   - Upload a clinical PDF, DOCX, or prescription image.
   - Inspect the **Structured Clinical Summary** cards (Document Metadata, Medications, Lab Results, Diagnoses, Allergies, Clinical Findings) and the **Raw OCR Text** preview.
   - Click **Approve** to index the document into the Clinical RAG vector store.
4. Open **Clinical Knowledge Search** (`ClinicalKnowledgeSearch`):
   - Ask a clinical question about the approved document or patient.
   - Verify that the returned answer is grounded, displays `[Source: ..., Page ...]` citations, and lists the retrieved chunks with similarity scores.

---

## 12. Running with Docker

To run PostgreSQL 16 (`pgvector`), Redis 7, and the FastAPI backend in Docker containers:

```powershell
# Build and start PostgreSQL (pgvector), Redis, and the CareOS API
docker compose up --build -d

# Check container health and logs
docker compose ps
docker compose logs -f api
```

When running the backend in Docker on port `8000`, you can still run the Vite frontend locally on port `5173` via `npm.cmd run dev`.
The backend image includes Tesseract and its Arabic/English language data as a local printed-text OCR fallback when PaddleOCR is unavailable. For a non-Docker backend, install Tesseract with the `ara` and `eng` language data and ensure `tesseract` is on `PATH`. Handwriting OCR remains a separate model-based feature.

---

## 13. Running Tests and Verification

All automated tests use isolated temporary SQLite databases and **never modify or delete** your local `careos.db` or `careos-local.db`.

```powershell
# 1. Run the complete environment & readiness check script
powershell -ExecutionPolicy Bypass -File scripts/check.ps1

# 2. Run Backend Health, OCR, Parser, and Clinical RAG test suites
Push-Location backend
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
..\.venv\Scripts\python.exe -m pytest tests/test_health.py tests/test_ocr_and_parsers.py tests/test_clinical_rag.py -q
Pop-Location

# 3. Run Frontend TypeScript validation & Production build check
npm.cmd run typecheck
npm.cmd run build
```

---

## 14. Common Issues and Troubleshooting

| Symptom / Error | Cause | Fix |
| :--- | :--- | :--- |
| **`Local embedding model 'sentence-transformers/all-MiniLM-L6-v2' is not available in the local HuggingFace cache`** | Running on a fresh machine for the first time with `RAG_ALLOW_MODEL_DOWNLOAD=false`. | Set `RAG_ALLOW_MODEL_DOWNLOAD=true` in `.env` / `backend/.env` or run `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` once while connected to the internet. |
| **`PowerShell ExecutionPolicy blocks scripts/setup.ps1`** | Windows default execution policy restricts `.ps1` scripts. | Run with `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`. |
| **`Port 8000 or 5173 is already in use`** | An existing `uvicorn` or `node` process is already listening. | Stop the existing process or pass custom ports: `powershell -ExecutionPolicy Bypass -File scripts/start.ps1 -BackendPort 8001 -FrontendPort 5174`. |
| **Uploaded document does not appear in RAG search results** | Unapproved (`pending_review`), `rejected`, or soft-deleted documents are excluded from RAG by design for clinical safety. | Open **Documents**, select the document, and click **Approve** so it is indexed into `document_chunks`. |
| **Slow startup when importing PaddleOCR** | PaddleX checks remote model host connectivity on import. | Set `$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="True"` (automatically set by `scripts/start.ps1` and `scripts/check.ps1`). |
| **CORS error in browser** | Accessing the frontend via an origin not listed in `CORS_ORIGINS`. | Ensure you access `http://127.0.0.1:5173` or `http://localhost:5173`, and leave `VITE_API_BASE_URL` empty in `.env` so Vite proxies `/api/v1`. |

---

## 15. Team Handoff Checklist

Before zipping, copying, or pushing `newcareos-main` to share with another developer:

- [ ] **Do NOT include `.env` or `backend/.env`** — teammates should generate their own from `.env.example` via `scripts/setup.ps1`.
- [ ] **Do NOT include `.venv/`, `.venv-1/`, or `node_modules/`** — virtual environments contain machine-specific absolute paths in launcher shims and must be created on the target machine via `scripts/setup.ps1`.
- [ ] **Do NOT include local SQLite `.db` files (`backend/*.db`) or `backend/storage/uploads/`** — these contain local runtime state.
- [ ] On the receiving Windows machine, the developer only needs **Python 3.11/3.12**, **Node.js 20+**, and **PowerShell**, then runs:
  1. `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`
  2. `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`
  3. `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`

---

## 16. Recent Platform Capabilities & Enhancements

### 16.1. IT Administrator Direct User Provisioning & Revocation
- **Direct Account Creation with Immediate Password**: IT Administrators (`it_admin`, `admin`, `hospital_director`) can create team members directly via `POST /api/v1/team/users` with explicit credentials (`full_name`, `email`, `password`, `role`, `department`) without requiring email invitation tokens.
- **Immediate Login**: Newly provisioned staff can immediately authenticate via `/api/v1/auth/login`.
- **Soft Deletion & Instant Session Revocation**: Calling `DELETE /api/v1/team/users/{user_id}` marks the user as deleted (`deleted_at`), purges active sessions from `AuthSession`, and immediately revokes all bearer tokens (`401 Unauthorized`).
- **Interactive Management UI**: Direct action buttons and confirmation dialogs built into `StaffManagement.tsx` and `TeamAudit.tsx`.

### 16.2. Authentic Egyptian Clinical Voice Companion (محمد & مريم)
- **Cairo Colloquial Dialect (اللهجة المصرية الدارجة)**: All patient voice interactions are processed through `to_egyptian_colloquial_speech`, converting formal classical Arabic into authentic, natural Egyptian phrasing (`"أهلاً بحضرتك يا فندم في كير أو إس"`, `"أنا هنا علشان أساعد حضرتك وأطمنك على التحاليل والمواعيد"`).
- **Dual Authentic Egyptian Neural Speakers**:
  - **محمد (Mohammed)**: Confident, warm, and professional Egyptian male tone (`spk_06_male` / Neural Egyptian Male).
  - **مريم (Mariam)**: Gentle, clear, and reassuring Egyptian female tone (`spk_15_female` / Neural Egyptian Female).
- **Natural Conversational Speed Calibration**: Audio playback tempo is optimized (`rate="+14%"`) to deliver a natural, energetic conversational rhythm, completely eliminating slow, sluggish, or dragging machine pauses.
- **Complete Elimination of Robotic Mechanical Voices**: Legacy robotic voices and monotonic standard Arabic TTS are completely purged from all platform surfaces (Landing Page, Patient Portal Voice Assistant, Settings, and Voice Agent).

### 16.3. Telegram Automated Patient Follow-up
- **Automated Delivery**: Trigger clinical reminders, test results, and post-visit follow-up questions via `POST /api/v1/integrations/telegram/send-followup`.
- **Deep-Link Bot Activation**: Direct bot link (`https://t.me/CareOS_HealthBot?start={PATIENT_ID}`) embedded inside the Patient Portal Messages tab.
- **Webhook Handlers**: `POST /api/v1/integrations/telegram/webhook` to capture patient replies and map them back to clinical encounters.

### 16.4. Modernized UI/UX Suites
- **Department Details Modal (`DepartmentOverview.tsx`)**: 2x2 metric grid (Bed Capacity, On-duty Physicians, Nursing Staff, Daily Follow-ups), clinical supervisor details, and balanced action buttons.
- **Account & Security Dashboard (`AccountPage.tsx`)**: Modern profile hero banner, status badge, workplace affiliation card, and security controls with prominent sign-out.
- **Patient Portal Messages Tab (`PatientPortal.tsx`)**: Telegram follow-up card, bidirectional chat bubbles, and prescription viewing with QR codes.
