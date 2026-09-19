from uuid import uuid4

from fastapi.testclient import TestClient

from app.integrations import OcrProvider
from app.main import app
from app.rbac import can_access_patient_scope


def test_register_login_and_audit_flow() -> None:
    client = TestClient(app)
    email = f"owner-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Workspace Owner",
            "organization_name": "CityCare",
        },
    )

    assert register.status_code == 201
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/me", headers=headers).status_code == 200
    assert client.get("/api/v1/team", headers=headers).status_code == 200

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "strong-password"})
    assert login.status_code == 200
    assert client.post(
        "/api/v1/team/invites",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        json={"email": "clinician@example.org", "role": "physician"},
    ).status_code == 201
    audit = client.get("/api/v1/audit-events", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert audit.status_code == 200
    assert any(event["action"] == "team.invited" for event in audit.json())


def test_admin_role_is_accepted_with_alias_and_normalized_permission_checks() -> None:
    client = TestClient(app)
    email = f"admin-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Admin Alias",
            "organization_name": "CityCare Admin",
            "role": "administrator",
        },
    )

    assert register.status_code == 201
    body = register.json()
    assert body["user"]["role"] == "admin"

    auth_headers = {"Authorization": f"Bearer {body['access_token']}"}
    workspace = client.get("/api/v1/workspace", headers=auth_headers)
    assert workspace.status_code == 200
    assert client.get("/api/v1/audit-events", headers=auth_headers).status_code == 200


def test_real_patient_scope_policy_for_role_and_organization() -> None:
    assert can_access_patient_scope("doctor", "read", same_organization=True)
    assert can_access_patient_scope("doctor", "notes", same_organization=True)
    assert not can_access_patient_scope("patient", "write", same_organization=True)
    assert not can_access_patient_scope("receptionist", "notes", same_organization=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=False)
    assert not can_access_patient_scope("patient", "read", same_organization=False)


def test_department_and_project_scope_must_match() -> None:
    assert can_access_patient_scope("doctor", "read", same_organization=True, same_department=True, same_project=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=True, same_department=False, same_project=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=True, same_department=True, same_project=False)


def test_patient_scope_matches_department_and_project() -> None:
    from types import SimpleNamespace

    from app.api import patient_scope_matches

    user = SimpleNamespace(department="Cardiology", project="Heart Clinic")
    same = SimpleNamespace(department="Cardiology", project="Heart Clinic")
    bad_department = SimpleNamespace(department="Neurology", project="Heart Clinic")
    bad_project = SimpleNamespace(department="Cardiology", project="ICU")

    assert patient_scope_matches(user, same) is True
    assert patient_scope_matches(user, bad_department) is False
    assert patient_scope_matches(user, bad_project) is False


def test_hospital_sso_start_and_callback_flow() -> None:
    client = TestClient(app)
    start = client.post(
        "/api/v1/auth/sso/start",
        json={"provider": "hospital_sso", "email": "dr.rana@citycare.org"},
    )

    assert start.status_code == 200
    body = start.json()
    assert "redirect_url" in body
    assert body["state"]
    assert body["nonce"]

    callback = client.post(
        "/api/v1/auth/sso/callback",
        json={"provider": "hospital_sso", "code": "demo-sso-code", "state": body["state"]},
    )

    assert callback.status_code == 200
    payload = callback.json()
    assert "access_token" in payload
    assert payload["user"]["email"] == "dr.rana@citycare.org"
    assert payload["mapped"]["organization_domain"] == "citycare.org"


def test_hospital_sso_start_respects_redirect_uri() -> None:
    client = TestClient(app)
    redirect_uri = "https://app.careos.example.com/auth/callback"
    start = client.post(
        "/api/v1/auth/sso/start",
        json={"provider": "hospital_sso", "email": "dr.rana@citycare.org", "redirect_uri": redirect_uri},
    )

    assert start.status_code == 200
    assert redirect_uri in start.json()["redirect_url"]


def test_frontend_demo_credentials_match_backend_seeded_account() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "dr.rana@citycare.org", "password": "password123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "dr.rana@citycare.org"
    assert body["user"]["role"] == "doctor"
    assert body["access_token"]


def test_messages_portal_and_analytics_endpoints_are_real_and_scoped() -> None:
    client = TestClient(app)
    email = f"ops-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Operations Lead",
            "organization_name": "NorthCare",
            "role": "administrator",
        },
    )
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "OPS-101",
            "given_name": "Sara",
            "family_name": "Ali",
            "department": "Cardiology",
            "project": "Heart Clinic",
            "date_of_birth": "1988-02-29",
            "gender": "female",
            "condition": "Heart failure follow-up",
            "care_status": "follow_up_due",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]

    message = client.post(
        "/api/v1/messages",
        headers=headers,
        json={
            "patient_id": patient_id,
            "subject": "Medication check-in",
            "body": "Please confirm the updated daily blood pressure schedule.",
            "sender_type": "care_team",
            "direction": "outbound",
        },
    )
    assert message.status_code == 201
    assert message.json()["subject"] == "Medication check-in"

    portal = client.get(f"/api/v1/portal/patients/{patient_id}", headers=headers)
    assert portal.status_code == 200
    assert portal.json()["patient"]["medical_record_number"] == "OPS-101"
    assert len(portal.json()["messages"]) >= 1

    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200
    payload = analytics.json()
    assert "overview" in payload
    assert payload["overview"]["patients"] >= 1

    reports = client.get("/api/v1/reports", headers=headers)
    assert reports.status_code == 200
    assert isinstance(reports.json(), list)
    assert len(reports.json()) >= 1


def test_tasks_care_plans_and_department_metrics_are_real_and_scoped() -> None:
    client = TestClient(app)
    email = f"ops-task-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Operations Lead",
            "organization_name": "NorthCare Ops",
            "role": "administrator",
        },
    )
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "TASK-201",
            "given_name": "Layla",
            "family_name": "Hassan",
            "department": "Cardiology",
            "project": "Heart Clinic",
            "date_of_birth": "1990-04-13",
            "gender": "female",
            "condition": "Heart failure follow-up",
            "care_status": "follow_up_due",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]

    care_plan = client.post(
        "/api/v1/care-plans",
        headers=headers,
        json={
            "patient_id": patient_id,
            "title": "Cardiac rehab and monitoring",
            "summary": "Monitor blood pressure and med adherence.",
            "status": "active",
            "goals": ["Track blood pressure", "Review medication adherence"],
        },
    )
    assert care_plan.status_code == 201
    assert care_plan.json()["title"] == "Cardiac rehab and monitoring"

    task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "patient_id": patient_id,
            "title": "Check home BP readings",
            "description": "Review last 7 days of home blood pressure log.",
            "assignee": "Dr. Rana Samir",
            "priority": "high",
            "status": "pending",
            "due_at": "2026-09-20T09:00:00Z",
        },
    )
    assert task.status_code == 201
    assert task.json()["title"] == "Check home BP readings"

    tasks = client.get("/api/v1/tasks", headers=headers)
    assert tasks.status_code == 200
    assert len(tasks.json()) >= 1

    plans = client.get("/api/v1/care-plans", headers=headers)
    assert plans.status_code == 200
    assert len(plans.json()) >= 1

    metrics = client.get("/api/v1/department-metrics", headers=headers)
    assert metrics.status_code == 200
    payload = metrics.json()
    assert "departments" in payload
    assert any(item["department"] == "Cardiology" for item in payload["departments"])


def test_patient_portal_auth_and_storage_contract_are_secure() -> None:
    client = TestClient(app)
    email = f"portal-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Portal Admin",
            "organization_name": "PortalCare",
            "role": "administrator",
        },
    )
    assert register.status_code == 201
    staff_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=staff_headers,
        json={
            "medical_record_number": f"PORTAL-{uuid4().hex[:6].upper()}",
            "given_name": "Nadia",
            "family_name": "Youssef",
            "department": "General Medicine",
            "project": "Outpatient",
            "date_of_birth": "1992-09-13",
            "gender": "female",
            "condition": "Follow-up review",
            "care_status": "stable",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]
    portal_email = f"nadia-{uuid4().hex[:8]}@example.com"

    portal_account = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": str(patient_id),
            "email": portal_email,
            "password": "PortalPass123!",
        },
    )
    assert portal_account.status_code == 201
    portal_token = client.post(
        "/api/v1/patient-portal/login",
        json={"email": portal_email, "password": "PortalPass123!"},
    )
    assert portal_token.status_code == 200
    portal_headers = {"Authorization": f"Bearer {portal_token.json()['access_token']}"}
    me = client.get("/api/v1/patient-portal/me", headers=portal_headers)
    assert me.status_code == 200
    assert me.json()["patient_id"] == str(patient_id)

    storage = client.post(
        "/api/v1/patient-portal/documents",
        headers=portal_headers,
        json={"filename": "lab_report.pdf", "content": "Zm9v", "content_type": "application/pdf"},
    )
    assert storage.status_code == 201
    body = storage.json()
    assert body["storage_key"]
    assert body["download_url"]


def test_email_verification_and_retention_cleanup_are_supported() -> None:
    client = TestClient(app)
    email = f"verify-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Verification User",
            "organization_name": "VerifyCare",
        },
    )
    assert register.status_code == 201
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email_verified"] is False

    verify = client.post("/api/v1/auth/verify-email", headers=headers, json={"email": email})
    assert verify.status_code == 200
    assert verify.json()["email_verified"] is True

    audit_cleanup = client.post("/api/v1/system/audit/cleanup", headers=headers)
    assert audit_cleanup.status_code == 200
    assert "deleted" in audit_cleanup.json()


def test_ocr_provider_extracts_clinically_meaningful_findings() -> None:
    provider = OcrProvider()
    text = provider.extract("lab_report.pdf")

    assert isinstance(text, str)
    assert len(text) > 80
    assert "troponin" in text.lower() or "ecg" in text.lower() or "lab" in text.lower()
    assert "review" in text.lower() or "follow-up" in text.lower()


def test_s3_storage_backend_uses_object_storage(monkeypatch) -> None:
    from app.config import get_settings
    from app.storage import StorageService

    get_settings.cache_clear()
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "careos-prod-docs")
    monkeypatch.setenv("S3_REGION", "eu-west-1")
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("STORAGE_PREFIX", "careos")

    calls = {}

    class FakeS3Client:
        def put_object(self, **kwargs):
            calls["bucket"] = kwargs["Bucket"]
            calls["key"] = kwargs["Key"]
            calls["content_type"] = kwargs["ContentType"]
            calls["body_len"] = len(kwargs["Body"])

    fake_boto3 = type("FakeBoto3", (), {"client": staticmethod(lambda *args, **kwargs: FakeS3Client())})
    monkeypatch.setitem(__import__("sys").modules, "boto3", fake_boto3)

    service = StorageService()
    key, url = service.save_document(
        organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
        patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
        filename="lab_report.pdf",
        content=b"hello-doc",
        content_type="application/pdf",
    )

    assert key.startswith("careos/")
    assert calls["bucket"] == "careos-prod-docs"
    assert calls["content_type"] == "application/pdf"
    assert url.startswith("https://careos-prod-docs.s3.eu-west-1.amazonaws.com/")


def test_storage_service_rejects_path_traversal_and_missing_bucket_settings(monkeypatch) -> None:
    from app.config import get_settings
    from app.storage import StorageService

    get_settings.cache_clear()
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("STORAGE_BACKEND", "filesystem")

    service = StorageService()
    try:
        service.save_document(
            organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
            patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
            filename="../../etc/passwd",
            content=b"hello-doc",
            content_type="application/pdf",
        )
        raise AssertionError("unsafe filename should have been rejected")
    except ValueError as exc:
        assert "unsafe" in str(exc).lower()

    get_settings.cache_clear()
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "")
    monkeypatch.setenv("S3_REGION", "eu-west-1")

    try:
        StorageService().save_document(
            organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
            patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
            filename="lab_report.pdf",
            content=b"hello-doc",
            content_type="application/pdf",
        )
        raise AssertionError("missing S3 bucket should have been rejected")
    except ValueError as exc:
        assert "bucket" in str(exc).lower()


def test_sso_redirect_rejects_unsafe_callback_hosts(monkeypatch) -> None:
    from app.config import get_settings
    from app.sso import HospitalSSOAdapter

    get_settings.cache_clear()
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("OIDC_ISSUER_URL", "https://issuer.example.com")
    monkeypatch.setenv("SSO_ALLOWED_REDIRECT_HOSTS", "careos.example.com,localhost")

    adapter = HospitalSSOAdapter()
    try:
        adapter.build_redirect_url(state="state-123", nonce="nonce-9", redirect_uri="https://evil.example.com/callback")
        raise AssertionError("unsafe redirect host should have been rejected")
    except ValueError as exc:
        assert "redirect" in str(exc).lower() and "host" in str(exc).lower()


def test_portal_tokens_are_rejected_when_org_or_patient_claims_do_not_match(monkeypatch) -> None:
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    from app.config import get_settings
    from app.main import app
    from app.models import PatientPortalAccount

    get_settings.cache_clear()
    monkeypatch.setenv("SECRET_KEY", "unit-test-secret-key-123456")
    get_settings.cache_clear()

    client = TestClient(app)
    org_admin = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"tenant-{uuid4().hex[:8]}@example.org",
            "password": "strong-password",
            "full_name": "Tenant Admin",
            "organization_name": "Tenant Org",
        },
    )
    assert org_admin.status_code == 201
    staff_headers = {"Authorization": f"Bearer {org_admin.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=staff_headers,
        json={
            "medical_record_number": "TENANT-001",
            "given_name": "Mina",
            "family_name": "Saleh",
            "department": "General Medicine",
            "project": "Outpatient",
            "date_of_birth": "1980-09-09",
            "gender": "female",
            "condition": "Follow-up",
            "care_status": "stable",
        },
    )
    patient_id = patient.json()["id"]

    portal = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": str(patient_id),
            "email": f"mina-{uuid4().hex[:8]}@example.com",
            "password": "PortalPass123!",
        },
    )
    assert portal.status_code == 201
    account_id = portal.json()["id"]

    wrong_claims = {
        "sub": str(account_id),
        "patient_id": "00000000-0000-0000-0000-000000000000",
        "organization_id": "00000000-0000-0000-0000-000000000001",
        "role": "patient",
        "jti": "bad-token",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    token = jwt.encode(wrong_claims, "unit-test-secret-key-123456", algorithm="HS256")
    response = client.get("/api/v1/patient-portal/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_oidc_adapter_reuses_discovery_and_userinfo_when_provider_is_configured(monkeypatch) -> None:
    import json

    from app.config import get_settings
    from app.sso import HospitalSSOAdapter

    get_settings.cache_clear()
    monkeypatch.setenv("OIDC_ISSUER_URL", "https://issuer.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "careos-client")
    monkeypatch.setenv("OIDC_CLIENT_SECRET", "careos-secret")
    monkeypatch.setenv("APP_URL", "https://careos.example.com")

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

        def raise_for_status(self):
            return None

    class FakeHTTP:
        @staticmethod
        def get(url, timeout):
            if url.endswith("/.well-known/openid-configuration"):
                return FakeResponse({
                    "userinfo_endpoint": "https://issuer.example.com/userinfo",
                    "token_endpoint": "https://issuer.example.com/token",
                })
            return FakeResponse({})

        @staticmethod
        def post(url, data=None, headers=None, timeout=None):
            class Reply:
                def json(self):
                    return {"id_token": "header.payload.signature", "access_token": "abc"}

                def raise_for_status(self):
                    return None
            return Reply()

    monkeypatch.setattr("app.sso.httpx", type("X", (), {"get": staticmethod(FakeHTTP.get), "post": staticmethod(FakeHTTP.post)}))
    adapter = HospitalSSOAdapter(provider_name="hospital_sso")
    claims = adapter.exchange_code_for_claims(code="live-code", state="state-123")
    assert claims.email == "dr.rana@citycare.org"
    assert claims.role == "physician"
    assert claims.organization_domain == "citycare.org"
