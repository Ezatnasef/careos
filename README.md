# CareOS

> Current status: functional MVP with organization-scoped clinical APIs, authenticated patient-portal downloads, S3/filesystem storage abstraction, and an OIDC-ready identity boundary. Do not connect production PHI until the release gate in `SECURITY.md` is complete.

CareOS هو منصة تشغيل ذكية للمنشأة الصحية تجمع بين Workflow السريري والذكاء الاصطناعي داخل النظام نفسه، وليس مجرد chatbot منفصل. النظام مصمم ليكون مساحة عمل متكاملة للمنشأة الطبية، تجمع بين المريض، الفريق، الملاحظات، المهام، المستندات، المواعيد، والتقارير في واجهة واحدة.

> المشروع الحالي هو MVP عملي ومتماسك، لا مجرد concept. تم بناء Frontend حقيقي، Backend حقيقي، auth/organization scoping، SSO-ready flow، storage abstraction، و patient portal. ما زال المشروع يحتاج hardening إضافي قبل التشغيل في بيئة إنتاج حقيقية مع PHI حقيقي.

## 1. لماذا هذا المشروع

المنشأة الصحية غالبًا تعمل عبر أدوات متفرقة:

- سجل المريض في مكان
- الملاحظات في مكان آخر
- المواعيد في جدول منفصل
- المهام في نظام مستقل
- المستندات في مجلدات أو منصة غير مترابطة
- الفريق لا يرى السياق نفسه

CareOS يهدف إلى توحيد هذا السياق في نظام واحد يركز على المريض، ويجعل الذكاء الاصطناعي جزءًا من سير العمل وليس كواجهة مستقلة فقط.

## 2. الفلسفة الأساسية

المنتج لا يحاول استبدال الطبيب، بل يهدف إلى:

- تسريع كتابة الملاحظات السريرية
- دعم القرار داخل السياق الطبي
- تقليل الأعمال الإدارية المتكررة
- تحسين متابعة المرضى
- توحيد رؤية الفريق حول نفس الحالة
- إبقاء الإنسان في حلقة المراجعة النهائية

## 3. ما تم تنفيذه فعليًا

### Frontend

- React + TypeScript + Vite
- Landing page
- Login / Register
- Organization-aware auth
- Dashboard الرئيسي
- قائمة المرضى
- تفاصيل المريض
- إدارة المواعيد
- Clinical notes
- AI assistant داخل سياق المريض
- Tasks و Care Plans
- Patient portal
- Team و Audit
- Analytics و Department Metrics
- دعم العربية والإنجليزية

### Backend

- FastAPI
- SQLAlchemy
- JWT auth
- Argon2 password hashing
- organization-scoped authorization
- patient-level access validation
- audit event logging
- OIDC-ready SSO flow
- storage abstraction for documents
- patient portal validation and uploads

### Domain model

- Organization
- User
- Patient
- Appointment
- ClinicalNote
- Task
- CarePlan
- PatientDocument
- PatientPortalAccount
- PatientPortalDocument
- Notification
- AuditEvent

## 4. هيكل المشروع

```text
.
├── src/
│   ├── App.tsx                 # Thin entry point
│   ├── app/                    # Shell, routing, and auth bootstrap
│   │   ├── AppShell.tsx
│   │   ├── authBootstrap.ts
│   │   └── routes.ts
│   ├── api/                    # Domain API boundaries
│   │   ├── auth.ts
│   │   ├── patients.ts
│   │   ├── appointments.ts
│   │   ├── documents.ts
│   │   ├── messages.ts
│   │   ├── analytics.ts
│   │   ├── portal.ts
│   │   ├── workspace.ts
│   │   └── client.ts
│   ├── features/               # Feature-owned screens and workflows
│   │   ├── auth/
│   │   ├── appointments/
│   │   ├── analytics/
│   │   ├── dashboard/
│   │   ├── documents/
│   │   ├── landing/
│   │   ├── messages/
│   │   ├── patients/
│   │   ├── settings/
│   │   └── workspace/
│   ├── components/             # Shared visual primitives
│   │   ├── PageHeading.tsx
│   │   ├── PanelHeading.tsx
│   │   ├── Modal.tsx
│   │   └── LoadingState.tsx
│   ├── api.ts                  # Existing API compatibility surface
│   ├── data.ts
│   ├── i18n.ts
│   ├── main.tsx
│   └── styles.css
├── backend/
│   ├── app/
│   │   ├── api.py
│   │   ├── auth.py
│   │   ├── config.py
│   │   ├── contracts.py
│   │   ├── db.py
│   │   ├── email_service.py
│   │   ├── integrations.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── rbac.py
│   │   ├── sso.py
│   │   ├── storage.py
│   │   └── workspace.py
│   ├── migrations/
│   ├── tests/
│   ├── Dockerfile
│   ├── README.md
│   ├── requirements.txt
│   └── pyproject.toml
├── docs/
│   ├── API_REFERENCE.md
│   └── IMPLEMENTATION_PLAN.md
├── tests/
│   └── e2e/
│       ├── language.spec.ts
│       └── feature-routes.spec.ts
├── docker-compose.yml
├── package.json
├── playwright.config.ts
├── README.md
├── SECURITY.md
├── ARCHITECTURE_ROADMAP.md
├── HANDOFF.md
├── index.html
└── LICENSE
```

## 5. النطاق الحالي للمشروع

### تم تنفيذه بشكل فعلي

- واجهة React/Vite تعمل كـ clinical workspace shell
- landing page + auth flow
- تسجيل الدخول داخل المؤسسة
- نظام users + organizations + role-aware access
- إدارة المرضى والمواعيد
- ملاحظات سريرية + AI draft summaries
- المهام وخطط الرعاية
- patient portal
- analytics + department metrics
- audit / notifications
- storage abstraction
- SSO start/callback routes

### ما لا يزال في مرحلة التكامل أو الـhardening

- real external IdP integration
- real LLM provider integration
- RAG/vector memory layer
- OCR real provider
- production secrets and deployment security
- full tenant isolation across every path
- real email/SMS delivery layer

## 6. API contract الفعلي

Base URL:

```text
http://localhost:8000/api/v1
```

Header:

```http
Authorization: Bearer <access_token>
```

### 6.1 System

```http
GET /health
GET /readiness
GET /metrics
GET /system/status
POST /system/audit/cleanup
```

### 6.2 Auth و onboarding

```http
POST /auth/register
POST /auth/login
POST /auth/logout
GET /me
POST /auth/verify-email
POST /auth/sso/start
POST /auth/sso/callback
POST /auth/sso
GET /organization
GET /workspace
POST /workspace
PATCH /organization
```

### 6.3 Team / Audit / Notifications

```http
GET /team
POST /team/invites
GET /audit-events
GET /notifications
PATCH /notifications/{notification_id}/read
```

### 6.4 Clinical core

```http
GET /dashboard
GET /patients
POST /patients
GET /patients/{patient_id}
PATCH /patients/{patient_id}
GET /appointments
POST /appointments
PATCH /appointments/{appointment_id}/status
POST /clinical-notes
POST /clinical-notes/{note_id}/summary
POST /clinical-notes/{note_id}/sign
POST /assistant/query
POST /patients/{patient_id}/documents
```

### 6.5 Messages / Tasks / Care Plans

```http
GET /messages
POST /messages
GET /tasks
POST /tasks
GET /care-plans
POST /care-plans
```

### 6.6 Patient portal

```http
GET /portal/patients/{patient_id}
POST /patient-portal/register
POST /patient-portal/login
GET /patient-portal/me
POST /patient-portal/documents
GET /patient-portal/documents/{document_id}/download
```

### 6.7 Analytics and reports

```http
GET /department-metrics
GET /analytics
GET /reports
```

## 7. أمثلة payloads

### Register

```json
{
  "email": "admin@clinic.example",
  "password": "StrongPass123!",
  "full_name": "Dr. Sarah Ali",
  "organization_name": "NorthCare Health",
  "department": "General Medicine",
  "project": "Outpatient",
  "role": "administrator"
}
```

### Login

```json
{
  "email": "admin@clinic.example",
  "password": "StrongPass123!"
}
```

### Create patient

```json
{
  "medical_record_number": "MRN-2001",
  "given_name": "Nadia",
  "family_name": "Youssef",
  "department": "Cardiology",
  "project": "Heart Clinic",
  "date_of_birth": "1992-09-13",
  "gender": "female",
  "condition": "Follow-up review",
  "care_status": "stable"
}
```

### Create appointment

```json
{
  "patient_id": "uuid",
  "starts_at": "2026-09-20T09:00:00Z",
  "reason": "Medication review",
  "status": "pending"
}
```

### Create note

```json
{
  "patient_id": "uuid",
  "body": "Patient reports improved sleep quality after medication adjustment.",
  "ai_draft": "Optional AI draft summary"
}
```

## 8. نموذج الأمان الحالي

النظام الحالي يطبق الأساسيات الحيوية للأمان في تطبيق طبي:

- JWT authentication
- Argon2 password hashing
- organization-scoped access
- patient-level validation
- portal token verification
- audit logging
- document upload isolation abstraction
- OIDC-ready SSO design

لكن لا يزال المشروع ضمن مرحلة production-hardening، وليس جاهزًا للاستخدام في بيئة الإنتاج الفعلية مع بيانات PHI دون مزيد من التحقق الأمني والتكامل الخارجي.

## 9. مسار العمل داخل التطبيق

### Landing Page

- يشرح قيمة المنتج
- يوضح الفرق بين CareOS و chatbot عادي
- يتيح الدخول إلى Login أو إنشاء workspace

### Login و Register

- Email/password
- organization-aware onboarding
- SSO flow
- onboarding state check

### Dashboard

- عدد المرضى
- المواعيد القادمة
- المهام
- متابعة الفريق
- مؤشرات الأقسام

### Patient Profile

- السجل الأساسي للمريض
- الملاحظات
- المواعيد
- المستندات
- المهام
- care plans
- الرسائل

### Clinical Visit flow

- كتابة ملاحظة
- توليد مسودة AI
- مراجعة الطبيب
- التوقيع النهائي

### Clinical Assistant

- يعمل داخل سياق المريض
- يجيب على أسئلة ذات صلة
- يتيح traceability للمصادر
- يراعي مراجعة بشرية قبل أي قرار حاسم

## 10. تشغيل المشروع محليًا

### Frontend

```powershell
npm install
npm run dev
```

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker

```powershell
Copy-Item .env.example .env
# Set POSTGRES_PASSWORD and SECRET_KEY in .env before starting.
docker compose up --build
```

Open the web app at `http://localhost:5173`. The API is available at `http://localhost:8000/api/v1`.
For a deployed environment, replace `APP_URL`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, and `SSO_ALLOWED_REDIRECT_HOSTS` with the real public hosts. Keep S3 private and provide credentials through workload identity or deployment secrets.

## 11. متغيرات البيئة

### Frontend

```env
VITE_API_URL=http://localhost:8000/api/v1
```

### Backend

المتغيرات الأساسية تشمل:

- APP_ENV
- DATABASE_URL
- SECRET_KEY
- JWT_ALGORITHM
- ACCESS_TOKEN_MINUTES
- CORS_ORIGINS
- OIDC_ISSUER_URL
- OIDC_CLIENT_ID
- OIDC_CLIENT_SECRET
- AUDIT_RETENTION_DAYS
- SMTP settings
- S3/object storage settings

## 12. ما الذي يميز المشروع

CareOS ليس مجرد واجهة AI، بل نظام يضع الذكاء داخل سير العمل الطبي نفسه:

- المريض في قلب العملية
- الفريق يعمل على نفس السياق
- الملاحظات، المواعيد، المهام، والمستندات مرتبطة
- audit trail موجود
- access control حسب المؤسسة
- AI يعمل كـassistant وليس كـdecision-maker مستقل

## 13. التوثيقات المرجعية

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- [HANDOFF.md](HANDOFF.md)
- [ARCHITECTURE_ROADMAP.md](ARCHITECTURE_ROADMAP.md)
- [SECURITY.md](SECURITY.md)

## 14. الخلاصة

CareOS الآن مشروع عملي ومتماسك نسبيًا مع Frontend و Backend حقيقيين، و API contract واضح، وسير عمل طبي متكامل.المشكلة الحقيقية ليست في فكرة المشروع أو بنية الواجهة، بل في التوسع إلى مستوى الإنتاج الحقيقي عبر:

- تكامل هوية حقيقي
- tenant/organization enforcement صارم
- LLM/RAG/OCR حقيقية
- مراقبة، أمان، والتزام قانوني

وهذا ما يجعل المشروع مناسبًا كـ MVP healthcare SaaS مع مسار واضح نحو المنتج الفعلي.


```text
PATCH /api/v1/organization
```

وفي التطوير فقط يمكن إكمال onboarding محليًا إذا كان الـ API غير متاح.

### 4. Dashboard

في نظام حقيقي، الـ Dashboard هو نقطة الدخول بعد أن ينجح المستخدم في `Email / Password` أو `Hospital SSO` ويفحص backend وجود `organization/workspace` و`onboarding_complete`. يجب أن يعرض:

- عدد المرضى في المؤسسة.
- زيارات اليوم ومواعيد اليوم.
- متابعات/تنبيهات الفريق وعلامات التحدي السريرية.
- KPI لكل منطقة سريرية: إشغال/جدول/مستوى التزام.
- قائمة مرضى اليوم مع حالة الرعاية ودرجة الأولوية.
- بطاقات للأطباء/الأقسام/الملاحظات ونسبة التزام المواعيد.
- رابط إلى Clinical Assistant ومؤشرات sources/decision-support.

الـ Dashboard لا يتم بنائه من بيانات ثابتة فقط؛ يجب أن يُغذى من `GET /dashboard` و`GET /patients` مع scope المؤسسة، ويجب أن تبقي الأرقام مرتبطة بـ `organization_id` و `user.role` و `RBAC` الصحيح.

في الواجهة الحالية، هذا الـ Dashboard هو UI/demo، والبيانات Synthetic فقط أو مصادر ثابتة داخل `src/data.ts`. نظام حقيقي يحتاج إلى:

- `GET /dashboard` يعيد اليوميات والـmetrics المصرح بها.
- `GET /patients` و`GET /appointments` من backend مع organization scoping.
- `GET /audit-events` و`GET /team` حسب صلاحيات المؤسسة.
- `RBAC` و `org` و `team` permissions لكل شاشة.

وهذا يثبت أن الصفحة لا تملك صلاحية حقيقية إن لم تكن `onboarding_complete = true` و`organization_id` منتجًا فعليًا في الـ backend.

### 5. Patients

يدعم حاليًا:

- البحث بالاسم أو رقم المريض.
- جدول المرضى.
- الحالة والتشخيص والزيارة الأخيرة.
- فتح Patient details.
- Tabs للسجل، العلامات الحيوية، التحاليل، والأدوية.

ما يحتاج تنفيذًا لاحقًا: pagination، API حقيقي، صلاحيات record-level، access history، وتخزين سريري فعلي.

### 6. Clinical Notes

التدفق المقصود:

1. كتابة ملاحظة الزيارة.
2. طلب Generate summary.
3. تعديل مسودة AI.
4. وضعها Reviewed.
5. اعتمادها Signed.
6. حفظها في سجل المريض.

حاليًا الـ summary تجريبي ولا يتم حفظه في قاعدة بيانات سريرية.

### 7. Clinical Assistant

يعرض:

- Patient context.
- سؤال سريري.
- حالة Loading.
- جوابًا تجريبيًا.
- المصادر ونسبة الثقة.
- Helpful/Not helpful.
- Copy.
- Clinical decision-support disclaimer.

المطلوب مستقبلًا: LLM server-side، RAG، citation IDs، protocol registry، tenant filters، prompt-injection defense، وhuman approval.

### 8. Appointments

يدعم حاليًا:

- عرض مواعيد اليوم.
- فلترة الحالات.
- New appointment modal.
- Confirm appointment demo action.

المطلوب لاحقًا: conflict detection، idempotent writes، reminder jobs، rescheduling، cancellation، وcalendar integration.

### 9. Messages وPatient Portal

هما operational demos لعرض شكل تجربة التواصل والوصول المستقبلي للمريض. لا يتم إرسال رسائل حقيقية حاليًا ولا توجد patient-facing authentication كاملة.

### 10. Analytics وDepartments وReports

هذه شاشات إدارية وتجريبية تعرض workload وdepartment distribution وتقارير Synthetic. لا تستخدم لاتخاذ قرارات تشغيلية حقيقية قبل ربطها ببيانات server-side مصرح بها.

### 11. Team & Audit

تدعم الواجهة:

- أعضاء الفريق.
- الأدوار.
- حالة Active/Invited.
- Audit log view.

الـ API يدعم دعوات الفريق، سجل التدقيق، والإدارة حسب المؤسسة.

## المعمارية التقنية

```text
Browser / React + Vite
        |
        | /api/v1
        v
FastAPI API
        |
        +-- SQLAlchemy AsyncSession
        +-- PostgreSQL
        +-- JWT + Argon2
        +-- Alembic migrations
        +-- SMTP invitations
        +-- Audit and notification APIs
```

### Frontend

- React.
- TypeScript.
- Vite.
- lucide-react للأيقونات.
- CSS design tokens وresponsive rules.
- `src/App.tsx`: shell والمكونات الحالية.
- `src/i18n.ts`: الترجمة.
- `src/api.ts`: client للـ API.
- `src/data.ts`: بيانات Demo الحالية.
- `src/styles.css`: التصميم والثيمات.

### Backend

- FastAPI.
- SQLAlchemy 2 async.
- PostgreSQL.
- Alembic.
- Pydantic Settings.
- python-jose JWT.
- Argon2.
- SMTP عبر `email_service.py`.

### قاعدة البيانات

Migration الهوية الحالية تنشئ:

- `organizations`
- `users`
- `team_invites`
- `audit_events`
- `notifications`
- `auth_sessions`

الـ clinical tables الموجودة foundation تشمل:

- `patients`
- `appointments`
- `clinical_notes`

لكن endpoints السريرية الكاملة لم تكتمل بعد.

## API الحالي

Base URL:

```text
/api/v1
```

### System

```text
GET  /health
GET  /readiness
```

### Authentication

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /me
```

### Organization

```text
PATCH /organization
```

### Team and audit

```text
GET  /team
POST /team/invites
GET  /audit-events
```

### Notifications

```text
GET   /notifications
PATCH /notifications/{notification_id}/read
```

### Clinical core (organization scoped)

```text
GET   /dashboard
GET   /patients?q={name-or-mrn}
POST  /patients
GET   /patients/{patient_id}
PATCH /patients/{patient_id}

GET   /appointments
POST  /appointments
PATCH /appointments/{appointment_id}/status?status={pending|confirmed|arrived|cancelled}

POST  /clinical-notes
POST  /clinical-notes/{note_id}/summary
POST  /clinical-notes/{note_id}/sign

POST  /assistant/query
POST  /patients/{patient_id}/documents
```

كل مسارات Clinical core تتطلب bearer token وتتحقق من أن السجل يخص مؤسسة المستخدم. الملخص والمساعد وOCR في الوضع الافتراضي يعيدون مخرجات `sandbox` واضحة وليست نتائج طبية أو تشغيلية حقيقية.

## طبقة التكاملات القابلة للاستبدال

لا تستدعي الواجهة أي مزود خارجي مباشرة. توجد العقود في [backend/app/integrations.py](backend/app/integrations.py):

- `ClinicalSummaryProvider`: استبداله بـLLM server-side بعد اعتماد مزود وسياسة تقييم.
- `RagProvider`: استبداله بـpgvector/Qdrant ومكتبة بروتوكولات تسمح بإرجاع citation title/page/score.
- `OcrProvider`: استبداله بـTesseract أو مزود OCR مع object storage وفحص ملفات.
- `NotificationProvider`: استبداله بـTwilio أو مزود SMS/WhatsApp/email مع consent وdelivery receipts.
- `EhrConnector`: نقطة تسليم للتكامل المؤسسي بعد الاتفاق على FHIR/HL7 والـfield mapping.

لا توضع مفاتيح أي مزود في `VITE_*` أو في ملفات المصدر. استخدم secrets في بيئة التشغيل فقط مثل `AI_API_KEY` و`AI_BASE_URL`.

## التشغيل المحلي

### تشغيل الواجهة فقط

```powershell
npm install
npm run dev
```

ثم افتح:

```text
http://127.0.0.1:5173
```

### تشغيل PostgreSQL والـ API عبر Docker

أنشئ `.env` من المثال، ثم ضع قيمًا محلية:

```powershell
Copy-Item .env.example .env
```

يجب توفير:

```env
POSTGRES_PASSWORD=local-only-change-me
SECRET_KEY=replace-with-a-long-random-secret
```

ثم:

```powershell
docker compose up --build
```

الخدمات:

- Web: `http://localhost:5173`
- API: `http://localhost:8000`
- API health: `http://localhost:8000/api/v1/health`
- PostgreSQL: `localhost:5432`

يشغّل Compose كذلك خدمة `web` على المنفذ 5173. تفاصيل التسليم، حدود الـSandbox، ونقاط استبدال LLM/RAG/OCR/notifications موجودة في [HANDOFF.md](HANDOFF.md).

الـ API container يشغل:

```text
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### تشغيل Backend يدويًا

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Environment variables

### Frontend

```env
VITE_API_URL=http://localhost:8000/api/v1
```

لا تضع مفاتيح LLM أو كلمات مرور أو PHI في `VITE_*` variables لأنها تصل إلى browser bundle.

### Backend

أهم الإعدادات في `backend/.env.example`:

- `APP_ENV`
- `DATABASE_URL`
- `SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_MINUTES`
- `CORS_ORIGINS`
- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `SAML_METADATA_URL`
- `AUDIT_RETENTION_DAYS`
- `BACKUP_BUCKET`
- `BACKUP_REGION`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_TLS`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM`

في production يجب استخدام secrets manager وعدم وضع القيم الحساسة في ملفات committed.

## الاختبارات والتحقق

### Frontend build

```powershell
npm run build
```

### Type checking

```powershell
npm run typecheck
```

### Playwright E2E

```powershell
npx playwright install chromium
npm run test:e2e
```

الاختبار الحالي يتحقق من:

- فتح workspace.
- تبديل العربية والإنجليزية.
- ظهور عناصر navigation الأساسية باللغتين.

### Backend

بعد تشغيل PostgreSQL وتثبيت requirements:

```powershell
cd backend
alembic upgrade head
pytest -q
```

## الأمان والخصوصية

CareOS يتعامل مع مجال طبي حساس. قبل استخدام أي PHI يجب تحقيق الآتي:

- OIDC أو SAML حقيقي مع MFA وrole claims موثوقة.
- RBAC وorganization/department scoping على كل request.
- منع تسريب PHI في browser bundles وlogs وtelemetry وerrors.
- TLS أثناء النقل وتشفير التخزين.
- Managed secrets وrotation.
- Audit events append-only لقراءة وتعديل وتصدير السجلات وعمليات AI.
- Retention وdeletion policy معتمدة.
- Encrypted backups وrestore drills.
- File validation وmalware scanning وOCR sandbox.
- Prompt-injection defenses وRAG allowlists.
- مراجعة الطبيب قبل حفظ AI draft كسجل طبي.
- Privacy impact assessment وthreat model وpenetration test.

تفاصيل إضافية في [SECURITY.md](SECURITY.md).

## ما لم يتم تنفيذه بعد

هذه العناصر خارج النسخة الحالية أو تحتاج مزودًا خارجيًا:

1. LLM provider حقيقي.
2. RAG وVector database.
3. OCR worker.
4. AI agents للـ reminders والمتابعة.
5. FHIR/HL7/HIS/EHR integrations.
6. OIDC/SAML activation مع مستشفى فعلي.
7. Password reset عبر email فعلي.
8. Notification delivery عبر SMS/email/push.
9. Clinical API كامل للمرضى والمواعيد والملاحظات.
10. Subscription وBilling، وهي خارج النطاق المطلوب حاليًا.
11. Monitoring مثل Sentry/Prometheus/Grafana.
12. Backup storage وrestore automation.
13. CI security scans وDAST/SAST/secret scanning الكاملة.

## Roadmap المقترح

### المرحلة الأولى: Secure Clinical API

- تحويل Patients/Appointments/Notes إلى APIs server-side.
- pagination وfiltering وtenant scoping.
- version history وsigned clinical notes.
- authorization tests لكل endpoint.

### المرحلة الثانية: AI Services

- provider-agnostic LLM service.
- server-side model keys.
- RAG protocol registry.
- citations وgrounded-answer checks.
- clinician feedback وAI telemetry بدون PHI.

### المرحلة الثالثة: Operations

- reminder worker.
- lab follow-up worker.
- idempotency وretries وdead-letter queues.
- email/SMS/push notification providers.
- calendar وHIS integration.

### المرحلة الرابعة: Enterprise Readiness

- OIDC/SAML + MFA.
- departments وصلاحيات دقيقة.
- monitoring وalerting.
- backup/restore drills.
- privacy and security review.
- staging/production environments.

## حدود المسؤولية الطبية

CareOS لا يجب تقديمه على أنه طبيب آلي. الصياغة الصحيحة للمنتج:

> CareOS منصة ذكاء اصطناعي مساندة للطبيب تعمل على أتمتة التوثيق وإدارة رحلة المريض، وتوفر دعمًا معلوماتيًا قائمًا على البيانات، مع إبقاء القرار الطبي النهائي للطبيب.

## هيكل المشروع

```text
.
├── src/
│   ├── App.tsx
│   ├── api.ts
│   ├── data.ts
│   ├── i18n.ts
│   ├── main.tsx
│   └── styles.css
├── backend/
│   ├── app/
│   │   ├── api.py
│   │   ├── auth.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── email_service.py
│   │   ├── integrations.py     # Sandbox/provider replacement contracts
│   │   ├── main.py
│   │   └── models.py
│   ├── migrations/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── tests/e2e/
├── .github/workflows/ci.yml
├── docker-compose.yml
├── playwright.config.ts
├── SECURITY.md
├── HANDOFF.md                   # Delivery and integration guide
└── docs/IMPLEMENTATION_PLAN.md
```

## الخلاصة

CareOS حاليًا هو **MVP مترابط للنواة الإدارية والسريرية ببيانات تجريبية**: الواجهة، الـAPI، PostgreSQL migrations، الهوية، المرضى، إنشاء المواعيد، Clinical Notes، وسجل التدقيق لها مسارات محددة وقابلة للتشغيل عبر Docker.

الجزء الموجود يثبت تجربة المنتج، بنية الحسابات، المؤسسات، الفريق، الجلسات، التدقيق، الترجمة، والـdeployment foundation. أما LLM وRAG وOCR وAgents والتكاملات الطبية فتوجد لها نقاط ربط وعقود Sandbox، لكنها تحتاج مزودين خارجيين، مراجعة أمنية وخصوصية، واختبارات سريرية قبل استخدامها مع بيانات حقيقية.
