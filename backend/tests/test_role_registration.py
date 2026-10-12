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
