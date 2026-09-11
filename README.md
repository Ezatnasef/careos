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

## بنية النظام الحقيقية المطلوبة

لأن المشروع يريد أن يكون نظامًا حقيقيًا وليس Demo، يجب توزيع المسؤوليات إلى طبقات عملية واضحة:

### 1. Auth Layer

- `POST /auth/register`
- `POST /auth/login`
- `GET /me`
- `POST /auth/logout`
- `AuthUser` يجب أن يحوي `organization_id`, `workspace_id`, `role`, `onboarding_complete`.

### 2. Organization & Workspace Layer

- إنشاء مؤسسة (`Organization`)
- إنشاء مساحة عمل (`Workspace`)
- ربط المستخدم بالمؤسسة وسجل الفريق
- تمييز حالة `onboarding_complete`

### 3. SSO Layer

- نقطة دخول لـ Hospital SSO
- mapping claims → organization → workspace
- callback handling
- validation of ID token / access token

في هذا المشروع تم إنشاء نقطة ابتدائية منسقة داخل [`backend/app/sso.py`](backend/app/sso.py) لتكون مكانًا متخصصًا للمطور اللاحق.

### 4. RBAC Layer

- `role → permissions` mapping
- organization-scoped resources
- workspace-scoped access to patients/dashboard/team/audit

في هذا المشروع تم إنشاء نقطة ابتدائية داخل [`backend/app/rbac.py`](backend/app/rbac.py) لتكون مصدر صلاحيات موحد.

### 5. Workspace Service Layer

- create organization
- create workspace
- add first admin
- assign base policies
- mark onboarding complete

في هذا المشروع تم إنشاء نقطة ابتدائية داخل [`backend/app/workspace.py`](backend/app/workspace.py).

### 6. Contract Layer

لضمان أن frontend و backend يشاركان نفس البيانات، يحتاج المشروع إلى contract صريح يحدد:

- `AuthUserContract` بأسماء الحقول: `id`, `organization_id`, `workspace_id`, `email`, `full_name`, `role`, `onboarding_complete`.
- `OrganizationWorkspaceContract` بأسماء الحقول: `organization_id`, `workspace_id`, `organization_name`, `department`, `timezone`, `onboarding_complete`.
- `DashboardContract` بأسماء الحقول: `patient_count`, `upcoming_appointments`, `followups`, `kpi`.
- `SSOStartRequest` و `SSOCallback` للـ provider flow.

في هذا المشروع تم إضافة ملف بدء للتوثيق داخل [`backend/app/contracts.py`](backend/app/contracts.py)، مع توسيع `src/api.ts` ليغطي `workspace_id?`, `SSO` start/callback و `DashboardContract` و `getCurrentUser` و `getOrganization` و `getWorkspace` و `createWorkspace`.

### 7. Implemented API Contract Routes

الواجهة والـ backend الآن يملكوا نقطة بداية واضحة لتوحيد المسار:

- `POST /auth/sso/start`
- `POST /auth/sso/callback`
- `POST /auth/sso`
- `GET /organization`
- `GET /workspace`
- `POST /workspace`

ومع ذلك، هذه الـ routes ما زالت “contract placeholders” أو “architecture skeleton”، وليست SSO/Workspace/Organization flow كاملًا. تحتاج إلى provider adapter فعلي، RBAC mapping فعلي، و persistence في قاعدة البيانات.

## دور كل مسؤول ومسؤولية كاملة بعد التحول إلى نظام حقيقي

### Auth Specialist

- يبني `POST /auth/login` و `POST /auth/register` و `GET /me` و `POST /auth/logout` بشكل فعلي.
- يتحقق من `JWT`, `Argon2`, `refresh token`, `logout/revoke` و`session revocation`.
- يراجع `AuthUser` الكامل معه: `id`, `organization_id`, `workspace_id`, `role`, `onboarding_complete`.

### SSO / Identity Specialist

- يربط `Hospital SSO` مع `OIDC/SAML` أو `Identity Provider` حقيقي.
- ينشئ `sso_redirect_url`, `state`, `nonce`, `callback`. 
- يحول `claims` إلى `organization`, `domain`, `role`, `email` و `workspace`.
- يقرر إن كان المستخدم جديدًا ويحتاج `invite` أو `onboarding`.

### Organization / Workspace Specialist

- ينشئ المؤسسة (`Organization`) ومساحة العمل (`Workspace`).
- يربط `organization_id` و `workspace_id` بالـ user.
- يحدد `department`, `timezone`, `permissions default`, و `first admin`.
- يتحقق من حالة `onboarding_complete` قبل فتح `Dashboard`.

### RBAC / Security Specialist

- يعرّف خريطة `role → permissions` كاملة.
- يحدّد صلاحيات كل شاشة: `dashboard`, `patients`, `appointments`, `team`, `audit`, `notes`.
- يطبق scope حسب `organization_id`, `workspace_id`, و `user.role`.
- يضيف `audit` log لكل تغيير أو تسجيل دخول أو وصول مهم.

### Data / Clinical Data Specialist

- يعمل على `GET /dashboard` الحقيقي كله: KPI، المرضى، المواعيد، المتابعات، التوزيع بحسب المؤسسة.
- يضيف `GET /patients`, `GET /appointments`, `GET /team`, `GET /audit-events` فعليًا من DB.
- يضمن فصل البيانات حسب `organization_id` و `workspace_id` وليس على مستوى عالمي.
- يتحقق من `patient privacy`, `PHI` isolation، و `clinical note` traceability.

### Integration Specialist

- يربط `LLM`, `RAG`, `OCR`, `EHR`, و `Notifications` بسير العمل الطبي.
- يضيف `Clinical Assistant` الحقيقي مع `sources`, `confidence`, و `human review`.
- يربط `patient documents`, `OCR extract`, `AI draft`, و `clinical note signing` مع APIs حقيقية.
- يحدد نقطة `integration provider` لكل خدمة: `LLM`, `Vector DB`, `OCR`, `EHR`, `SMS/Email`.

### Frontend Specialist

- يربط الواجهة بكنترول كامل على contract:
  - `auth`, `sso`, `organization`, `workspace`, `dashboard`, `team`, `audit`.
- يضمن الانتقال بين `Dashboard` و `Onboarding` بناءً على `onboarding_complete` ووجود `workspace`.
- يفتح routing الحقيقي بدل `demo` fallback.

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
- access method selector داخل Login لعرض Email/Password وHospital SSO بشكل شبه tab-like.
- لوحة Hospital SSO توضح السياق: "This is the Hospital SSO route. It uses your organization identity provider..." و"Use your organization identity provider to continue securely.".
- زر Back داخل لوحة Hospital SSO لعودة إلى Email/Password flow.
- زر Continue with Hospital SSO لتأكيد المسار السيري/الـSSO ثم توجيه المستخدم إلى Login flow بناءً على `authMethod` ونتيجة الـbackend.
- قفل الوصول إلى لوحة Hospital SSO في Create account؛ فالواجهة لا تسمح بإظهار الـSSO panel في صفحة إنشاء الحساب.
- Eye/EyeOff toggle لتبديل إظهار/إخفاء كلمة المرور في Email/password flow.
- رابط "Create your workspace above" في نص auth note في حالة Sign-in لفتح Create account (الرسالة الارتباطية).

في وضع التطوير، إذا لم يكن API شغالًا، يسمح التطبيق بفتح Synthetic Demo فقط. هذا fallback لا يجب استخدامه مع بيانات حقيقية ولا يعمل في production build.

#### تدفق المواصفات الواقعية الآن

المخطط الصحيح داخل UI وApp handler هو:

```text
Landing → Login
→ authMethod = Email / Password OR Hospital SSO
→ backend/auth request resolves identity
→ backend/user payload includes onboarding_complete
→ if onboarding_complete = true: Dashboard
→ if onboarding_complete = false: Onboarding
```

وبالتالي:

- Email / Password source يمر عبر `apiLogin()` أو `apiRegister()` حسب الحالة.
- Hospital SSO source يمر عبر `apiLoginWithSso()`.
- `onboarding_complete` في payload الخاص بـ `AuthUser` يحدد التالي:
  - `Dashboard` في حال وجود workspace جاهز
  - `Onboarding` في حال عدم وجود workspace أو المؤسسة بعدية

ويتعامل UI مع هذا التقسيم عبر `setOnboardingComplete(Boolean(result.user.onboarding_complete))` في `App.tsx` والأثر المنطقي عليه داخل الرندر.

#### التهيئة والـfallback

- عند نجاح login/register/email-password flow أو SSO flow، يتم تمرير `authMethod: "email"` أو `authMethod: "sso"` إلى `App.tsx` handler.
- عند `authMethod === "sso"` يتم استدعاء `apiLoginWithSso()`.
- عند `authMethod === "email"` يتم استخدام `apiLogin()` أو `apiRegister()` حسب `mode`.
- في حالات عدم توفر Backend/Request failed داخل DEV، يتم فتح Synthetic demo من خلال الـ UI مع `localStorage` و`notify()`، وهذا لا يكون تكاملًا حقيقيًا، وإنما fallback تجريبي فقط.

### 3. Onboarding

يجمع اسم المؤسسة ويكمل إعداد مساحة العمل. عند توفر API يتم حفظ المؤسسة عبر:

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
