# CareOS

CareOS منصة SaaS للرعاية الصحية تساعد الأطباء وفرق الرعاية على تنظيم رحلة المريض، توثيق الزيارات، الوصول إلى المعلومات الطبية، وإدارة العمليات اليومية.

> **تنبيه مهم:** CareOS حاليًا Prototype/MVP Foundation ببيانات تجريبية. لا تستخدمه مع بيانات مرضى حقيقية، ولا تعتبر مخرجاته تشخيصًا أو وصفًا علاجيًا.

## الفكرة

CareOS ليست AI Doctor ولا تستبدل الطبيب. الفكرة هي بناء مساحة عمل سريرية يكون فيها الذكاء الاصطناعي مساعدًا للطبيب في:

- تحويل الملاحظات الحرة إلى مسودة منظمة.
- إظهار معلومات وبروتوكولات ذات صلة مع مصادرها.
- تنظيم المواعيد والمتابعات.
- تقليل الأعمال الإدارية المتكررة.
- إبقاء الطبيب مسؤولًا عن المراجعة والاعتماد النهائي.

المنتج المستهدف هو B2B Healthcare SaaS للمستشفيات والعيادات ومراكز الرعاية، بينما النسخة الحالية تستخدم بيانات Synthetic وتعرض بعض الوظائف كـ Demo.

## المشكلة التي يعالجها المنتج

الفرق الطبية تفقد وقتًا كبيرًا في كتابة الملاحظات، البحث داخل السجلات، تنسيق المواعيد، متابعة النتائج، وإعادة شرح نفس المعلومات. ينتج عن ذلك:

- وقت أقل مع المريض.
- بيانات متفرقة وصعوبة في البحث.
- متابعات ومواعيد معرضة للنسيان.
- تنسيق ضعيف بين أعضاء الفريق.
- تكلفة تشغيلية أعلى.

CareOS يعالج هذه المشكلة من خلال مساحة عمل موحدة تجمع التوثيق، المريض، المواعيد، الرسائل، التحليلات، وإدارة الفريق.

## الحالة الحالية للمنتج

### منفذ فعليًا

- واجهة React/Vite كاملة للـ workspace.
- تصميم Light/Dark mode.
- دعم العربية والإنجليزية وRTL.
- Landing page وCTA لطلب Demo.
- Login وCreate account في الواجهة.
- Password recovery UI.
- Onboarding من ثلاث خطوات.
- Dashboard طبي.
- Patients وPatient details.
- Clinical Notes مع AI draft تجريبي ومراجعة بشرية.
- Clinical Assistant بواجهة مصادر وثقة وتنبيه decision support.
- Appointments وموعد جديد تجريبي.
- Messages تجريبية.
- Patient Portal تجريبي.
- Analytics وDepartments وReports تجريبية.
- Team & Audit UI.
- Loading, empty, unsaved, error، وtoast states الأساسية.
- Responsive layout وaccessibility labels الرئيسية.
- PostgreSQL models للهوية والمؤسسة والفريق والتدقيق والجلسات والإشعارات.
- JWT authentication foundation.
- Argon2 password hashing.
- RBAC أساسي للأدوار.
- Organization onboarding API.
- Team invite API مع SMTP configuration.
- Server-side session revocation/logout.
- Notifications API.
- Append-only audit trigger في PostgreSQL.
- Alembic migration.
- Docker Compose للـ PostgreSQL والـ API.
- CI workflow وPlaywright smoke test.
- Migration سريرية ثانية (`0002_clinical_core`) لجداول المرضى والمواعيد والملاحظات والمستندات وjobs التذكير.
- APIs سريرية authenticated مع عزل كل سجل حسب المؤسسة (organization scoping).
- إنشاء مريض من الواجهة، والبحث عن المرضى من الـAPI عند توفره.
- إنشاء موعد من الواجهة، فحص تعارض الموعد، وإضافة reminder job في وضع Sandbox.
- إنشاء Clinical Note، توليد مسودة Sandbox، ثم توقيعها من الواجهة.
- واجهة `Integrations` داخل التطبيق لتوضيح نقاط ربط LLM/RAG/OCR/notifications/EHR للشخص الذي سيكمل المشروع.
- خدمة `web` في Docker Compose لتشغيل الواجهة مع الـAPI وقاعدة البيانات.

### ما يزال Demo أو يحتاج Integration

- بعض الشاشات ما زالت تستخدم fallback من [src/data.ts](src/data.ts) عند عدم توفر الـAPI؛ لا تستخدمه مع بيانات حقيقية.
- رد Clinical Assistant ومسودة Clinical Notes يمران عبر API لكن مزوّدهما الافتراضي Sandbox وليس LLM حقيقيًا.
- لا يوجد RAG أو Vector Database حتى الآن.
- لا يوجد OCR حقيقي.
- لا يوجد AI Agent حقيقي لإدارة رحلة المريض.
- رسائل Patient Portal وAnalytics وReports ليست سجلات تشغيلية حقيقية.
- الواجهة لا تزال تحتاج استبدال كل مصادر البيانات التجريبية بـ APIs سريرية authenticated.
- OIDC/SAML موجودان كإعدادات foundation فقط، وليس integration مع IdP حقيقي.
- SMTP يعمل عند ضبط بيانات مزود البريد، لكنه غير مضبوط افتراضيًا.

### تحديث التسليم: ما هو مربوط وما هو مؤجل

| النطاق | الحالة الحالية | تفاصيل التشغيل |
| --- | --- | --- |
| الهوية والمؤسسة | مربوط | Register/Login/JWT/RBAC/Organization onboarding وaudit log. |
| المرضى | مربوط جزئيًا | `GET/POST /patients` والبحث يعملان من الواجهة؛ تفاصيل المريض وتعديلها تحتاج ربط UI إضافي. |
| المواعيد | مربوط جزئيًا | نافذة الإنشاء تستدعي الـAPI وتتحقق الخلفية من تعارض الوقت؛ القائمة تفضّل بيانات الـAPI عند توفره. |
| Clinical Notes | مربوط | إنشاء ملاحظة، توليد ملخص Sandbox، وتوقيع الطبيب تمر عبر الـAPI. |
| Clinical Assistant | Sandbox مربوط | السؤال يصل إلى backend؛ يلزم مزود RAG حقيقي ومصادر موثقة قبل الإنتاج. |
| OCR والمستندات | API Sandbox جاهز | يوجد endpoint وجداول، لكن واجهة رفع الملفات وobject storage ومزوّد OCR حقيقي مؤجلة. |
| التذكيرات | Queue Sandbox جاهز | يتم إنشاء `reminder_job` مع الموعد؛ لا يوجد worker أو إرسال خارجي حتى الآن. |
| Messages/Portal/Analytics/Reports/Departments | Demo | واجهات موجودة لكنها ليست سجلات تشغيلية أو APIs مكتملة. |
| Team/Audit/Notifications | API موجود، UI جزئي | endpoints متاحة؛ شاشة الفريق والتنبيهات ما زالت تحتاج استبدال بيانات العرض الثابتة. |

مرجع التسليم التفصيلي، حدود الـSandbox، وعقود الاستبدال موجود في [HANDOFF.md](HANDOFF.md).

## الشاشات والـ workflows

### 1. Landing page

تعرض:

- قيمة المنتج.
- مشكلة الأعمال الإدارية في الرعاية الصحية.
- خصائص التوثيق، RAG، الجدولة، ورقمنة المستندات.
- مبادئ human review وsource transparency.
- CTA لطلب Demo.
- رابط فتح الـ workspace التجريبي.

زر طلب Demo يعرض confirmation محليًا. إرسال الطلب إلى CRM أو بريد حقيقي يحتاج backend/email integration.

### 2. Login وCreate account

تدعم:

- Email/password.
- إنشاء مساحة عمل ومؤسسة.
- JWT access token.
- تشفير كلمة المرور بـ Argon2.
- Hospital SSO button.
- Password recovery UI.

في وضع التطوير، إذا لم يكن API شغالًا، يسمح التطبيق بفتح Synthetic Demo فقط. هذا fallback لا يجب استخدامه مع بيانات حقيقية ولا يعمل في production build.

### 3. Onboarding

يجمع اسم المؤسسة ويكمل إعداد مساحة العمل. عند توفر API يتم حفظ المؤسسة عبر:

```text
PATCH /api/v1/organization
```

وفي التطوير فقط يمكن إكمال onboarding محليًا إذا كان الـ API غير متاح.

### 4. Dashboard

يعرض:

- عدد المرضى.
- زيارات اليوم.
- المتابعات المعلقة.
- نسبة اكتمال الرعاية.
- مواعيد اليوم.
- المرضى الذين يحتاجون متابعة.
- رابط Clinical Assistant.

الأرقام الحالية Synthetic.

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
