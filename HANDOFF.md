# CareOS handoff guide

## What runs today

`docker compose up --build` starts the React web client, FastAPI API, and PostgreSQL.
The initial migration creates identity/audit tables; `0002_clinical_core` adds patients,
appointments, clinical notes, documents, and reminder jobs. All operational data is
organization-scoped. Use synthetic data only.

## Runtime flow

```text
React workspace -> /api/v1 -> FastAPI -> PostgreSQL
                             -> integrations.py sandbox adapters
                                -> LLM / RAG / OCR / notification provider (next phase)
```

The frontend has live API calls for patient search, appointment creation, note creation,
summary generation, signing, and assistant queries. If the API is unavailable in local
development, legacy synthetic display data remains available for visual demonstration.

## Provider replacement points

`backend/app/integrations.py` deliberately contains no secret or vendor SDK. Replace only
the implementation behind these interfaces:

- `ClinicalSummaryProvider.summarize`: approved server-side LLM.
- `RagProvider.answer`: pgvector/Qdrant retrieval plus citations (`title`, `page`, score).
- `OcrProvider.extract`: Tesseract or an approved OCR vendor.
- `NotificationProvider.queue`: Twilio, WhatsApp, email, or HIS notification gateway.

Do not call a provider from React and do not return provider credentials to the browser.

## API ownership

| Area | API |
| --- | --- |
| Dashboard | `GET /dashboard` |
| Patients | `GET/POST /patients`, `GET/PATCH /patients/{id}` |
| Appointments | `GET/POST /appointments`, `PATCH /appointments/{id}/status` |
| Notes | `POST /clinical-notes`, `POST /clinical-notes/{id}/summary`, `POST /clinical-notes/{id}/sign` |
| RAG assistant | `POST /assistant/query` |
| OCR document job | `POST /patients/{id}/documents` |

## Explicit sandbox limitations

- Summaries, RAG answers, OCR output, and reminders are marked `sandbox`; they are not
  clinical output and must never be used with real PHI.
- The reminder table is a durable queue only. Add a worker, retry policy, delivery receipts,
  opt-out management, and a real `NotificationProvider` before sending patients anything.
- Authentication is a foundation. Add refresh-token rotation/HttpOnly cookies, MFA, real
  OIDC/SAML, rate limits, and record-level authorization before production.

## Required next work

1. Complete React read/write usage for dashboard, team/audit, notifications, patient detail,
   and appointment status changes.
2. Add pagination, validation, structured clinical tables (medications, labs, vitals), and
   API integration tests against PostgreSQL.
3. Add a background worker and object storage before supporting real documents.
4. Implement OIDC/SAML and institutional EHR/FHIR connector after agreeing the hospital contract.
