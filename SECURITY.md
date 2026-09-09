# Security Notes

## Current MVP status

The repository now contains a FastAPI/PostgreSQL identity, organization, session, notification, invitation, and append-only audit foundation. The browser clinical modules still use synthetic demo records and must not receive real patient information until the server-side clinical API is complete.

The development-only browser fallback is enabled only when `import.meta.env.DEV` is true. Production builds require the API for authentication. Never use the fallback with real data.

## Release gate before real data

1. Replace synthetic clinical modules with authenticated, organization-scoped server APIs.
2. Configure hospital identity through `OIDC_*` or `SAML_METADATA_URL`, MFA, and verified role claims.
3. Enforce least-privilege RBAC on every clinical read, write, export, and AI action.
4. Use a managed secrets vault; set `SECRET_KEY` outside source control and rotate it.
5. Run the Alembic audit trigger migration; keep audit events append-only and include access/export/AI actions.
6. Configure `AUDIT_RETENTION_DAYS`, encrypted backups, `BACKUP_BUCKET`, restore drills, and deletion workflows.
7. Keep PHI out of browser bundles, request logs, exceptions, analytics, and error telemetry.
8. Isolate OCR/document parsing and add file validation, malware scanning, and sandboxing.
9. Add RAG source allowlists, prompt-injection defenses, grounded-answer checks, and clinician approval gates.
10. Run dependency, SAST, DAST, secret, container, backend, and Playwright scans in CI.
11. Complete privacy impact assessment, threat model, penetration test, incident response, and disaster recovery review.
