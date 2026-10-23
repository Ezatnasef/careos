from uuid import uuid4
from fastapi.testclient import TestClient

from app.main import app


def _invite_user(client: TestClient, owner_headers: dict[str, str], role: str) -> dict:
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


def test_clinical_hardening_endpoints() -> None:
    client = TestClient(app)
    owner = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"owner-{uuid4().hex[:8]}@example.org",
            "password": "strong-password",
            "full_name": "Clinical Owner",
            "organization_name": "Hardened General Hospital",
        },
    )
    assert owner.status_code == 201
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    doctor = _invite_user(client, owner_headers, "physician")
    doctor_headers = {"Authorization": f"Bearer {doctor['access_token']}"}

    # 1. Create Patient with allergy in condition
    patient_res = client.post(
        "/api/v1/patients",
        headers=doctor_headers,
        json={
            "medical_record_number": f"CLIN-{uuid4().hex[:6]}",
            "given_name": "Kareem",
            "family_name": "Nabil",
            "date_of_birth": "1985-05-15",
            "condition": "Severe penicillin allergy (حساسية بنسلين)",
        },
    )
    assert patient_res.status_code == 201
    patient_id = patient_res.json()["id"]

    # 2. Break-Glass Access
    bg_res = client.post(
        f"/api/v1/patients/{patient_id}/break-glass",
        headers=doctor_headers,
        json={
            "reason": "Emergency Trauma Alert",
            "justification": "Patient arrived in shock, emergency ICU protocol invoked.",
        },
    )
    assert bg_res.status_code == 200
    assert bg_res.json()["status"] == "granted"

    # 3. Vital Signs & NEWS2 calculation
    # Extreme vitals: RR=28 (+3), SpO2=89 (+3), Systolic=85 (+3), HR=135 (+3), Unresponsive (+3), Temp=34.5 (+3) -> High Risk
    vital_res = client.post(
        f"/api/v1/patients/{patient_id}/vitals",
        headers=doctor_headers,
        json={
            "respiratory_rate": 28,
            "oxygen_saturation": 89.0,
            "on_supplemental_oxygen": True,
            "systolic_bp": 85,
            "diastolic_bp": 50,
            "heart_rate": 135,
            "consciousness_level": "unresponsive",
            "temperature_celsius": 34.5,
            "notes": "Patient unstable upon arrival.",
        },
    )
    assert vital_res.status_code == 201
    vdata = vital_res.json()
    assert vdata["news2_score"] >= 7
    assert vdata["clinical_risk"] == "high"

    # Read vitals back
    vitals_list = client.get(
        f"/api/v1/patients/{patient_id}/vitals",
        headers=doctor_headers,
    )
    assert vitals_list.status_code == 200
    assert len(vitals_list.json()) >= 1

    # 4. Prescription with Allergy Interaction Check
    # Attempting to prescribe Amoxicillin to patient with penicillin allergy -> Conflict 409
    rx_blocked = client.post(
        f"/api/v1/patients/{patient_id}/prescriptions",
        headers=doctor_headers,
        json={
            "medication_name": "Amoxicillin 500mg",
            "dosage": "500mg",
            "route": "oral",
            "frequency": "TID",
            "duration_days": 7,
            "override_allergy_warning": False,
        },
    )
    assert rx_blocked.status_code == 409
    assert "ALLERGY_INTERACTION_DETECTED" in rx_blocked.text

    # Override allergy with clinical justification
    rx_ok = client.post(
        f"/api/v1/patients/{patient_id}/prescriptions",
        headers=doctor_headers,
        json={
            "medication_name": "Amoxicillin 500mg",
            "dosage": "500mg",
            "route": "oral",
            "frequency": "TID",
            "duration_days": 7,
            "override_allergy_warning": True,
        },
    )
    assert rx_ok.status_code == 201
    assert rx_ok.json()["status"] == "active"

    # 5. Lab Results with Panic Flagging
    lab_res = client.post(
        f"/api/v1/patients/{patient_id}/labs",
        headers=doctor_headers,
        json={
            "test_name": "Serum Potassium (K+)",
            "result_value": "6.8",
            "unit": "mmol/L",
            "reference_range": "3.5 - 5.0",
            "is_panic_critical": True,
            "interpretation": "critical_high",
        },
    )
    assert lab_res.status_code == 201
    assert lab_res.json()["is_panic_critical"] is True

    # 6. Walk-in Reception Booking
    walkin_res = client.post(
        "/api/v1/appointments/walk-in",
        headers=owner_headers,
        json={
            "given_name": "Ahmed",
            "family_name": "Hassan",
            "phone": "+201009876543",
            "reason": "كشف باطنة عاجل",
        },
    )
    assert walkin_res.status_code == 201
    assert walkin_res.json()["appointment"]["status"] == "arrived"
    assert walkin_res.json()["queue_number"].startswith("Q-")

    # 7. Patient Portal Account Provisioning
    portal_res = client.post(
        f"/api/v1/patients/{patient_id}/portal-account",
        headers=owner_headers,
        json={
            "email": f"kareem-{uuid4().hex[:6]}@patient.careos.com",
            "full_name": "Kareem Nabil",
        },
    )
    assert portal_res.status_code == 200
    assert portal_res.json()["status"] == "created"
    assert portal_res.json()["temporary_password"] is not None
