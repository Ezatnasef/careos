from fastapi.testclient import TestClient

from app.main import app


def test_register_login_and_audit_flow() -> None:
    client = TestClient(app)
    email = "owner@example.org"
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
