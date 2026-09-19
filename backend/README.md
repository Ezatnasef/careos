# CareOS API

## Local setup

```powershell
Copy-Item .env.example .env
$env:POSTGRES_PASSWORD = "local-only-change-me"
docker compose up -d postgres
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API health check is available at `http://localhost:8000/api/v1/health`. Interactive docs are enabled only outside production.

Apply the identity and audit schema before running the API:

```powershell
alembic upgrade head
```

The service exposes database-backed registration, login, organization onboarding, team invites, and administrator audit events. The local synthetic workspace remains separate from real patient data. Production still requires hospital OIDC/SAML, MFA, refresh-token rotation, email delivery for invites, and managed secrets.

## Storage and identity hardening

Portal documents are written through `StorageService` using either local private filesystem storage or private S3. Documents are addressed by tenant-scoped keys and served through `GET /api/v1/patient-portal/documents/{document_id}/download`, which rechecks the portal account, patient, and organization before reading the object.

For external identity, configure `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `SSO_ALLOWED_REDIRECT_HOSTS`. The current adapter is OIDC-ready and development-compatible; production must add provider-library signature, issuer, audience, nonce, state, expiry, and verified-claim validation before enabling real sign-in.
