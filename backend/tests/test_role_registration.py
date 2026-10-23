import base64
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _invite_user(
    client: TestClient,
    owner_headers: dict[str, str],
    role: str,
) -> dict:
    invitation = client.post(
        "/api/v1/team/invites",
        headers=owner_headers,
        json={"email": f"{role}-{uuid4().hex[:8]}@example.org", "role": role},
    )
    assert invitation.status_code == 201
    accepted = client.post(
        "/api/v1/auth/invitations/accept",
        json={
            "token": invitation.json()["development_token"],
            "full_name": f"Test {role}",
            "password": "strong-password",
        },
    )
    assert accepted.status_code == 200
    return accepted.json()


def test_role_scoped_patient_listing_and_aggregate_dashboard() -> None:
    client = TestClient(app)
    owner = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"owner-{uuid4().hex[:8]}@example.org",
            "password": "strong-password",
            "full_name": "Organization Owner",
            "organization_name": "Role Boundary Clinic",
        },
    )
    assert owner.status_code == 201
    owner_headers = {
        "Authorization": f"Bearer {owner.json()['access_token']}"
    }

    doctor = _invite_user(client, owner_headers, "physician")
    doctor_headers = {
        "Authorization": f"Bearer {doctor['access_token']}"
    }
    patient = client.post(
        "/api/v1/patients",
        headers=doctor_headers,
        json={
            "medical_record_number": f"RBAC-{uuid4().hex[:6]}",
            "given_name": "Mona",
            "family_name": "Omar",
            "date_of_birth": "1990-01-01",
            "condition": "Confidential clinical detail",
            "care_status": "needs_attention",
        },
    )
    assert patient.status_code == 201

    receptionist = _invite_user(client, owner_headers, "receptionist")
    receptionist_headers = {
        "Authorization": f"Bearer {receptionist['access_token']}"
    }
    listed = client.get("/api/v1/patients", headers=receptionist_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["given_name"] == "Mona"
    assert listed.json()[0]["condition"] == ""
    assert listed.json()[0]["care_status"] == ""
    details = client.get(
        f"/api/v1/patients/{patient.json()['id']}",
        headers=receptionist_headers,
    )
    assert details.status_code == 403

    owner_patient_list = client.get("/api/v1/patients", headers=owner_headers)
    assert owner_patient_list.status_code == 403
    dashboard = client.get("/api/v1/dashboard", headers=owner_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["patient_count"] == 1
    assert dashboard.json()["followups"] == []
    assert dashboard.json()["upcoming_appointments"] == []


def test_nurse_recording_transcription_and_clinical_pdf_workflow() -> None:
    client = TestClient(app)
    run_id = uuid4().hex[:8]
    owner = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"workflow-owner-{run_id}@example.org",
            "password": "strong-password",
            "full_name": "Workflow Owner",
            "organization_name": f"Workflow Clinic {run_id}",
        },
    )
    assert owner.status_code == 201, owner.text
    owner_headers = {
        "Authorization": "Bearer " + str(owner.json().get("access_token"))
    }
    nurse = _invite_user(client, owner_headers, "nurse")
    nurse_headers = {
        "Authorization": "Bearer " + str(nurse.get("access_token"))
    }

    patient = client.post(
        "/api/v1/patients",
        headers=nurse_headers,
        json={
            "medical_record_number": f"WORKFLOW-{run_id}",
            "given_name": "Synthetic",
            "family_name": "Patient",
            "date_of_birth": "1990-01-01",
        },
    )
    assert patient.status_code == 201, patient.text

    encounter = client.post(
        "/api/v1/encounters",
        headers=nurse_headers,
        json={"patient_id": patient.json()["id"], "encounter_type": "consultation"},
    )
    assert encounter.status_code == 201, encounter.text

    recording = client.post(
        f"/api/v1/encounters/{encounter.json()['id']}/recordings",
        headers=nurse_headers,
        json={
            "content": base64.b64encode(b"synthetic audio bytes").decode("ascii"),
            "filename": "synthetic.webm",
            "content_type": "audio/webm",
            "language": "ar-EG",
        },
    )
    assert recording.status_code == 201, recording.text

    queued = client.post(
        f"/api/v1/recordings/{recording.json()['id']}/transcribe",
        headers=nurse_headers,
    )
    assert queued.status_code == 202, queued.text
    assert queued.json()["job_status"] in {"QUEUED", "PROCESSING", "RETRY"}

    transcript = client.get(
        f"/api/v1/transcripts/{recording.json()['transcript_id']}",
        headers=nurse_headers,
    )
    assert transcript.status_code == 200, transcript.text
    assert transcript.json()["language"] == "ar-EG"

    note = client.post(
        "/api/v1/clinical-notes",
        headers=nurse_headers,
        json={
            "patient_id": patient.json()["id"],
            "encounter_id": encounter.json()["id"],
            "body": "ملاحظة سريرية تجريبية.",
        },
    )
    assert note.status_code == 201, note.text

    document = client.post(
        f"/api/v1/clinical-notes/{note.json()['id']}/document",
        headers=nurse_headers,
    )
    assert document.status_code == 201, document.text
    patient_detail = client.get(
        f"/api/v1/patients/{patient.json()['id']}",
        headers=nurse_headers,
    )
    assert patient_detail.status_code == 200, patient_detail.text
    attached_documents = patient_detail.json()["documents"]
    attached_pdf = next(
        (item for item in attached_documents if item["id"] == document.json()["id"]),
        None,
    )
    assert attached_pdf is not None
    assert attached_pdf["content_type"] == "application/pdf"
    assert attached_pdf["review_status"] == "pending"
    downloaded_pdf = client.get(
        f"/api/v1/patients/{patient.json()['id']}/documents/{document.json()['id']}/download",
        headers=nurse_headers,
    )
    assert downloaded_pdf.status_code == 200, downloaded_pdf.text
    assert downloaded_pdf.headers["content-type"] == "application/pdf"
    assert downloaded_pdf.content.startswith(b"%PDF-")


def test_it_admin_direct_user_creation_and_deletion() -> None:
    client = TestClient(app)
    # Register org owner
    owner_email = f"owner-{uuid4().hex[:8]}@hospital.org"
    owner_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": owner_email,
            "password": "owner-password-123",
            "full_name": "Chief Information Officer",
            "organization_name": "Metropolitan Medical Center",
        },
    )
    assert owner_resp.status_code == 201, owner_resp.text
    owner_token = owner_resp.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # Direct User Creation with Password & Role
    new_user_email = f"doc-{uuid4().hex[:8]}@hospital.org"
    new_user_pwd = "DoctorSecret123!"
    create_resp = client.post(
        "/api/v1/team/users",
        headers=owner_headers,
        json={
            "full_name": "Dr. Tarek Hegazi",
            "email": new_user_email,
            "password": new_user_pwd,
            "role": "doctor",
            "department": "Internal Medicine",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created_user = create_resp.json()
    assert created_user["email"] == new_user_email
    assert created_user["full_name"] == "Dr. Tarek Hegazi"
    assert created_user["role"] == "doctor"
    user_id = created_user["id"]

    # Verify new user can immediately log in with provided credentials
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": new_user_email, "password": new_user_pwd},
    )
    assert login_resp.status_code == 200, login_resp.text
    new_user_token = login_resp.json()["access_token"]
    new_user_headers = {"Authorization": f"Bearer {new_user_token}"}

    # Verify new user has access to /me
    me_resp = client.get("/api/v1/me", headers=new_user_headers)
    assert me_resp.status_code == 200, me_resp.text

    # Verify new user appears in team list
    team_resp = client.get("/api/v1/team", headers=owner_headers)
    assert team_resp.status_code == 200
    team_emails = [u["email"] for u in team_resp.json()]
    assert new_user_email in team_emails

    # IT Admin / Owner deletes the user
    del_resp = client.delete(f"/api/v1/team/users/{user_id}", headers=owner_headers)
    assert del_resp.status_code == 200, del_resp.text
    assert del_resp.json()["deleted"] is True

    # Deleted user should no longer be in active team list
    refreshed_team = client.get("/api/v1/team", headers=owner_headers)
    refreshed_emails = [u["email"] for u in refreshed_team.json()]
    assert new_user_email not in refreshed_emails

    # Token of deleted user is revoked / rejected
    me_after_del = client.get("/api/v1/me", headers=new_user_headers)
    assert me_after_del.status_code == 401, "Revoked session should be rejected with 401"

