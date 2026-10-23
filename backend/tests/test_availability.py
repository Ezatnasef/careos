"""
Comprehensive tests for the CAREOS Availability Backend.

Coverage:
  - ClinicianSchedule CRUD (create, list, delete, duplicate, reversed times)
  - ScheduleOverride CRUD (create, list, delete, replacement windows, reversed times)
  - Dynamic availability slot computation (recurring, overrides, cancellations)
  - Clinic-wide and clinician-specific booking conflict rules
  - Cancellation and rescheduling conflict handling
  - Tenant / organization isolation (cross-org access returns 404)
  - Appointment backward compatibility (default 30 min duration, optional clinician_id)
  - Authorization & RBAC enforcement (403 for unauthorized roles)
"""

from datetime import date, datetime, timedelta, timezone
import threading
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _register(client: TestClient, *, role: str = "physician") -> tuple[dict, dict]:
    """Register an org owner (admin) and invite a member with the given role.
    
    Returns (owner_headers, member_headers).
    """
    owner_email = f"owner-avail-{uuid4().hex[:8]}@example.org"
    member_email = f"member-{role}-{uuid4().hex[:8]}@example.org"

    owner_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": owner_email,
            "password": "AvailPass@123",
            "full_name": "Avail Owner",
            "organization_name": f"Avail Clinic {uuid4().hex[:6]}",
        },
    )
    assert owner_resp.status_code == 201, owner_resp.text
    owner_token = owner_resp.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    invite = client.post(
        "/api/v1/team/invites",
        headers=owner_headers,
        json={"email": member_email, "role": role},
    )
    assert invite.status_code == 201, invite.text
    accept = client.post(
        "/api/v1/auth/invitations/accept",
        json={
            "token": invite.json()["development_token"],
            "full_name": f"Avail {role.title()}",
            "password": "AvailPass@123",
        },
    )
    assert accept.status_code == 200, accept.text
    member_headers = {"Authorization": f"Bearer {accept.json()['access_token']}"}
    return owner_headers, member_headers


def _register_doctor(client: TestClient) -> tuple[dict, str, dict]:
    """Register an org and return (doctor_headers, doctor_id, owner_headers)."""
    owner_h, doctor_h = _register(client, role="physician")
    me = client.get("/api/v1/me", headers=doctor_h)
    assert me.status_code == 200, me.text
    return doctor_h, me.json()["id"], owner_h


def _clinician_id(client: TestClient, headers: dict) -> str:
    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200, me.text
    return me.json()["id"]


def _create_patient(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": f"AVL-{uuid4().hex[:6]}",
            "given_name": "Avail",
            "family_name": "Patient",
            "date_of_birth": "1990-06-15",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _next_weekday(target_weekday: int) -> date:
    """Return the next calendar date with the given weekday (0=Mon … 6=Sun)."""
    today = date.today()
    days_ahead = (target_weekday - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


# ─────────────────────────────────────────────────────────────────────────────
# Schedule CRUD
# ─────────────────────────────────────────────────────────────────────────────

def test_create_and_list_clinician_schedule() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 0, "start_time": "09:00", "end_time": "12:00", "slot_duration_minutes": 30},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["day_of_week"] == 0
    assert data["start_time"] == "09:00"
    assert data["end_time"] == "12:00"
    assert data["slot_duration_minutes"] == 30

    list_resp = client.get(f"/api/v1/clinicians/{cid}/schedules", headers=doc_h)
    assert list_resp.status_code == 200
    schedules = list_resp.json()
    assert any(s["day_of_week"] == 0 and s["start_time"] == "09:00" for s in schedules)


def test_delete_clinician_schedule() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    create = client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 1, "start_time": "14:00", "end_time": "17:00"},
    )
    assert create.status_code == 201
    sched_id = create.json()["id"]

    delete = client.delete(f"/api/v1/clinicians/{cid}/schedules/{sched_id}", headers=doc_h)
    assert delete.status_code == 204

    list_resp = client.get(f"/api/v1/clinicians/{cid}/schedules", headers=doc_h)
    assert not any(s["id"] == sched_id for s in list_resp.json())


def test_create_schedule_rejects_reversed_times() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 2, "start_time": "17:00", "end_time": "09:00"},
    )
    assert resp.status_code == 422


def test_create_schedule_unknown_clinician_returns_404() -> None:
    client = TestClient(app)
    doc_h, _, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{uuid4()}/schedules",
        headers=doc_h,
        json={"day_of_week": 0, "start_time": "09:00", "end_time": "12:00"},
    )
    assert resp.status_code == 404


def test_delete_schedule_from_other_org_is_denied() -> None:
    """A clinician from org A cannot delete a schedule owned by org B."""
    client = TestClient(app)
    doc_a_h, cid_a, _ = _register_doctor(client)
    doc_b_h, _, _ = _register_doctor(client)

    sched = client.post(
        f"/api/v1/clinicians/{cid_a}/schedules",
        headers=doc_a_h,
        json={"day_of_week": 0, "start_time": "08:00", "end_time": "10:00"},
    )
    assert sched.status_code == 201
    sched_id = sched.json()["id"]

    delete = client.delete(f"/api/v1/clinicians/{cid_a}/schedules/{sched_id}", headers=doc_b_h)
    assert delete.status_code == 404


def test_create_schedule_duplicate_rejects_with_409() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    payload = {"day_of_week": 3, "start_time": "09:00", "end_time": "12:00"}
    resp1 = client.post(f"/api/v1/clinicians/{cid}/schedules", headers=doc_h, json=payload)
    assert resp1.status_code == 201
    resp2 = client.post(f"/api/v1/clinicians/{cid}/schedules", headers=doc_h, json=payload)
    assert resp2.status_code == 409


# ─────────────────────────────────────────────────────────────────────────────
# Override CRUD
# ─────────────────────────────────────────────────────────────────────────────

def test_create_and_list_schedule_override() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={"override_date": "2026-12-25", "is_unavailable": True, "reason": "Holiday"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["override_date"] == "2026-12-25"
    assert data["is_unavailable"] is True
    assert data["reason"] == "Holiday"

    list_resp = client.get(f"/api/v1/clinicians/{cid}/overrides", headers=doc_h)
    assert list_resp.status_code == 200
    assert any(o["override_date"] == "2026-12-25" for o in list_resp.json())


def test_delete_schedule_override() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    create = client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={"override_date": "2027-01-01", "is_unavailable": True, "reason": "New Year"},
    )
    assert create.status_code == 201
    override_id = create.json()["id"]

    delete = client.delete(f"/api/v1/clinicians/{cid}/overrides/{override_id}", headers=doc_h)
    assert delete.status_code == 204

    list_resp = client.get(f"/api/v1/clinicians/{cid}/overrides", headers=doc_h)
    assert not any(o["id"] == override_id for o in list_resp.json())


def test_create_override_with_replacement_window() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={
            "override_date": "2026-11-11",
            "is_unavailable": False,
            "start_time": "10:00",
            "end_time": "13:00",
            "reason": "Half day",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["start_time"] == "10:00"
    assert data["end_time"] == "13:00"


def test_create_override_rejects_reversed_times() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    resp = client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={
            "override_date": "2026-11-11",
            "is_unavailable": False,
            "start_time": "15:00",
            "end_time": "10:00",
            "reason": "Invalid",
        },
    )
    assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# Availability slot computation
# ─────────────────────────────────────────────────────────────────────────────

def test_availability_returns_slots_when_schedule_exists() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    monday = _next_weekday(0)  # day_of_week=0
    client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 0, "start_time": "09:00", "end_time": "11:00", "slot_duration_minutes": 30},
    )

    resp = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": monday.isoformat(), "to_date": monday.isoformat(), "slot_minutes": 30},
    )
    assert resp.status_code == 200, resp.text
    slots = resp.json()
    assert len(slots) == 4, f"Expected 4 slots in 09:00-11:00 with 30-min steps, got: {slots}"
    assert slots[0]["start_time"] == "09:00"
    assert slots[-1]["start_time"] == "10:30"


def test_availability_returns_empty_when_no_schedule() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    tuesday = _next_weekday(1)
    resp = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": tuesday.isoformat(), "to_date": tuesday.isoformat()},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_availability_booked_slot_excluded() -> None:
    """When an appointment occupies a slot, that slot must not appear in availability."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    wednesday = _next_weekday(2)  # day_of_week=2
    client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 2, "start_time": "09:00", "end_time": "10:30", "slot_duration_minutes": 30},
    )

    # Book the 09:30 slot
    appt_start = datetime.combine(wednesday, datetime.strptime("09:30", "%H:%M").time()).replace(tzinfo=timezone.utc)
    if appt_start <= datetime.now(timezone.utc):
        wednesday = wednesday + timedelta(weeks=1)
        appt_start = datetime.combine(wednesday, datetime.strptime("09:30", "%H:%M").time()).replace(tzinfo=timezone.utc)

    appt_resp = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={
            "patient_id": patient_id,
            "clinician_id": cid,
            "starts_at": appt_start.isoformat(),
            "duration_minutes": 30,
            "reason": "Follow-up",
        },
    )
    assert appt_resp.status_code == 201, appt_resp.text

    avail = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={
            "from_date": wednesday.isoformat(),
            "to_date": wednesday.isoformat(),
            "slot_minutes": 30,
        },
    )
    assert avail.status_code == 200
    slots = avail.json()
    start_times = [s["start_time"] for s in slots]
    assert "09:30" not in start_times, f"09:30 should be blocked, got: {start_times}"
    assert "09:00" in start_times  # adjacent slot still free


def test_availability_cancelled_appointment_slot_reappears() -> None:
    """When a booked appointment is cancelled, its slot returns to availability."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    thursday = _next_weekday(3)
    client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 3, "start_time": "10:00", "end_time": "11:00", "slot_duration_minutes": 30},
    )

    appt_start = datetime.combine(thursday, datetime.strptime("10:00", "%H:%M").time()).replace(tzinfo=timezone.utc)
    if appt_start <= datetime.now(timezone.utc):
        thursday = thursday + timedelta(weeks=1)
        appt_start = datetime.combine(thursday, datetime.strptime("10:00", "%H:%M").time()).replace(tzinfo=timezone.utc)

    appt_resp = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={
            "patient_id": patient_id,
            "clinician_id": cid,
            "starts_at": appt_start.isoformat(),
            "duration_minutes": 30,
            "reason": "Test Cancellation",
        },
    )
    assert appt_resp.status_code == 201
    appt_id = appt_resp.json()["id"]

    # Cancel the appointment
    cancel = client.patch(f"/api/v1/appointments/{appt_id}/status?status=cancelled", headers=doc_h)
    assert cancel.status_code == 200

    # Availability must now show 10:00 as free
    avail = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": thursday.isoformat(), "to_date": thursday.isoformat(), "slot_minutes": 30},
    )
    assert avail.status_code == 200
    start_times = [s["start_time"] for s in avail.json()]
    assert "10:00" in start_times


def test_availability_all_day_override_blocks_entire_day() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    thursday = _next_weekday(3)  # day_of_week=3
    client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 3, "start_time": "08:00", "end_time": "17:00", "slot_duration_minutes": 60},
    )
    client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={"override_date": thursday.isoformat(), "is_unavailable": True, "reason": "Training"},
    )

    avail = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": thursday.isoformat(), "to_date": thursday.isoformat(), "slot_minutes": 60},
    )
    assert avail.status_code == 200
    assert avail.json() == [], f"Expected no slots on override day, got: {avail.json()}"


def test_availability_override_window_replaces_recurring_schedule() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    friday = _next_weekday(4)  # day_of_week=4
    # Normally available 08:00-17:00
    client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=doc_h,
        json={"day_of_week": 4, "start_time": "08:00", "end_time": "17:00", "slot_duration_minutes": 60},
    )
    # Override: only available 10:00-12:00
    client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=doc_h,
        json={
            "override_date": friday.isoformat(),
            "is_unavailable": False,
            "start_time": "10:00",
            "end_time": "12:00",
        },
    )

    avail = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": friday.isoformat(), "to_date": friday.isoformat(), "slot_minutes": 60},
    )
    assert avail.status_code == 200
    slots = avail.json()
    start_times = {s["start_time"] for s in slots}
    assert "08:00" not in start_times
    assert "10:00" in start_times


def test_availability_range_exceeding_60_days_rejected() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    from_d = date.today()
    to_d = from_d + timedelta(days=61)
    resp = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": from_d.isoformat(), "to_date": to_d.isoformat()},
    )
    assert resp.status_code == 422


def test_availability_range_reversed_dates_rejected() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    from_d = date.today() + timedelta(days=5)
    to_d = date.today()
    resp = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": from_d.isoformat(), "to_date": to_d.isoformat()},
    )
    assert resp.status_code == 422


def test_availability_unknown_clinician_returns_404() -> None:
    client = TestClient(app)
    doc_h, _, _ = _register_doctor(client)

    resp = client.get(
        f"/api/v1/clinicians/{uuid4()}/availability",
        headers=doc_h,
        params={"from_date": date.today().isoformat(), "to_date": date.today().isoformat()},
    )
    assert resp.status_code == 404


def test_availability_cross_org_clinician_is_isolated() -> None:
    """User from org B cannot query clinician from org A."""
    client = TestClient(app)
    doc_a_h, cid_a, _ = _register_doctor(client)
    doc_b_h, _, _ = _register_doctor(client)

    resp = client.get(
        f"/api/v1/clinicians/{cid_a}/availability",
        headers=doc_b_h,
        params={"from_date": date.today().isoformat(), "to_date": date.today().isoformat()},
    )
    assert resp.status_code == 404


def test_multi_day_availability_spans_correct_dates() -> None:
    """Ensure the availability endpoint returns slots for each day in the range."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)

    # Create Monday + Tuesday schedules
    for dow in [0, 1]:
        client.post(
            f"/api/v1/clinicians/{cid}/schedules",
            headers=doc_h,
            json={"day_of_week": dow, "start_time": "09:00", "end_time": "10:00", "slot_duration_minutes": 60},
        )

    monday = _next_weekday(0)
    tuesday = monday + timedelta(days=1)

    resp = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=doc_h,
        params={"from_date": monday.isoformat(), "to_date": tuesday.isoformat(), "slot_minutes": 60},
    )
    assert resp.status_code == 200
    slots = resp.json()
    dates_in_slots = {s["date"] for s in slots}
    assert monday.isoformat() in dates_in_slots
    assert tuesday.isoformat() in dates_in_slots


# ─────────────────────────────────────────────────────────────────────────────
# Booking Conflict Rules & Rescheduling
# ─────────────────────────────────────────────────────────────────────────────

def test_booking_conflict_same_clinician_double_booking_rejected() -> None:
    """Same clinician cannot be booked twice for overlapping times."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    p1 = _create_patient(client, doc_h)
    p2 = _create_patient(client, doc_h)

    start = (datetime.now(timezone.utc) + timedelta(days=10)).replace(hour=9, minute=0, second=0, microsecond=0)
    # Book p1 with clinician
    resp1 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p1, "clinician_id": cid, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "Checkup"},
    )
    assert resp1.status_code == 201

    # Book p2 with same clinician at overlapping time -> 409
    resp2 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p2, "clinician_id": cid, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "Checkup 2"},
    )
    assert resp2.status_code == 409


def test_booking_conflict_overlapping_duration_rejected() -> None:
    """Overlap with an ongoing appointment duration is rejected."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    p1 = _create_patient(client, doc_h)
    p2 = _create_patient(client, doc_h)

    start1 = (datetime.now(timezone.utc) + timedelta(days=11)).replace(hour=10, minute=0, second=0, microsecond=0)
    # 45 minute duration: 10:00 - 10:45
    resp1 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p1, "clinician_id": cid, "starts_at": start1.isoformat(), "duration_minutes": 45, "reason": "Long check"},
    )
    assert resp1.status_code == 201

    # Attempt to book at 10:30 (during the 10:00-10:45 block) -> 409
    start2 = start1 + timedelta(minutes=30)
    resp2 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p2, "clinician_id": cid, "starts_at": start2.isoformat(), "duration_minutes": 30, "reason": "Overlap check"},
    )
    assert resp2.status_code == 409


def test_booking_allows_different_clinicians_at_same_time() -> None:
    """Two different clinicians in the same clinic CAN have appointments at the same time."""
    client = TestClient(app)
    owner_h, doc1_h = _register(client, role="physician")
    cid1 = _clinician_id(client, doc1_h)

    # Invite a second clinician into the same clinic
    email2 = f"doc2-{uuid4().hex[:6]}@example.org"
    invite2 = client.post("/api/v1/team/invites", headers=owner_h, json={"email": email2, "role": "physician"})
    accept2 = client.post("/api/v1/auth/invitations/accept", json={"token": invite2.json()["development_token"], "full_name": "Doctor Two", "password": "AvailPass@123"})
    doc2_h = {"Authorization": f"Bearer {accept2.json()['access_token']}"}
    cid2 = _clinician_id(client, doc2_h)

    p1 = _create_patient(client, doc1_h)
    p2 = _create_patient(client, doc1_h)

    same_time = (datetime.now(timezone.utc) + timedelta(days=12)).replace(hour=14, minute=0, second=0, microsecond=0)
    resp1 = client.post(
        "/api/v1/appointments",
        headers=doc1_h,
        json={"patient_id": p1, "clinician_id": cid1, "starts_at": same_time.isoformat(), "duration_minutes": 30, "reason": "Doc 1 Appt"},
    )
    assert resp1.status_code == 201

    resp2 = client.post(
        "/api/v1/appointments",
        headers=doc2_h,
        json={"patient_id": p2, "clinician_id": cid2, "starts_at": same_time.isoformat(), "duration_minutes": 30, "reason": "Doc 2 Appt"},
    )
    assert resp2.status_code == 201


def test_booking_conflict_same_patient_double_booking_rejected() -> None:
    """Same patient cannot be booked for overlapping appointments."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    start = (datetime.now(timezone.utc) + timedelta(days=13)).replace(hour=15, minute=0, second=0, microsecond=0)
    resp1 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": patient_id, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "First"},
    )
    assert resp1.status_code == 201

    resp2 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": patient_id, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "Second"},
    )
    assert resp2.status_code == 409


def test_cancelled_appointment_allows_rebooking_same_slot() -> None:
    """Once an appointment is cancelled, that slot can be booked again."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    start = (datetime.now(timezone.utc) + timedelta(days=14)).replace(hour=16, minute=0, second=0, microsecond=0)
    create = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": patient_id, "clinician_id": cid, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "Original"},
    )
    assert create.status_code == 201
    appt_id = create.json()["id"]

    cancel = client.patch(f"/api/v1/appointments/{appt_id}/status?status=cancelled", headers=doc_h)
    assert cancel.status_code == 200

    # Booking the same slot now succeeds
    p2 = _create_patient(client, doc_h)
    rebook = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p2, "clinician_id": cid, "starts_at": start.isoformat(), "duration_minutes": 30, "reason": "Rebook"},
    )
    assert rebook.status_code == 201


def test_rescheduling_appointment_handles_conflicts_and_self_update() -> None:
    """Rescheduling updates starts_at without self-conflicting, and rejects conflicts with others."""
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    p1 = _create_patient(client, doc_h)
    p2 = _create_patient(client, doc_h)

    time1 = (datetime.now(timezone.utc) + timedelta(days=15)).replace(hour=9, minute=0, second=0, microsecond=0)
    time2 = time1 + timedelta(hours=1)

    appt1 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p1, "clinician_id": cid, "starts_at": time1.isoformat(), "duration_minutes": 30, "reason": "Appt 1"},
    )
    appt2 = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": p2, "clinician_id": cid, "starts_at": time2.isoformat(), "duration_minutes": 30, "reason": "Appt 2"},
    )
    assert appt1.status_code == 201
    assert appt2.status_code == 201

    # Appt 1 cannot be rescheduled to time2 (occupied by appt 2) -> 409
    resched_conflict = client.patch(
        f"/api/v1/appointments/{appt1.json()['id']}",
        headers=doc_h,
        json={"starts_at": time2.isoformat()},
    )
    assert resched_conflict.status_code == 409

    # Appt 1 can be rescheduled to time3 (free)
    time3 = time1 + timedelta(hours=2)
    resched_ok = client.patch(
        f"/api/v1/appointments/{appt1.json()['id']}",
        headers=doc_h,
        json={"starts_at": time3.isoformat()},
    )
    assert resched_ok.status_code == 200


def test_cannot_reschedule_cancelled_appointment() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    start = (datetime.now(timezone.utc) + timedelta(days=16)).replace(hour=10, minute=0, second=0, microsecond=0)
    create = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={"patient_id": patient_id, "starts_at": start.isoformat(), "reason": "Cancelled resched test"},
    )
    appt_id = create.json()["id"]

    client.patch(f"/api/v1/appointments/{appt_id}/status?status=cancelled", headers=doc_h)
    new_start = start + timedelta(hours=1)
    resched = client.patch(f"/api/v1/appointments/{appt_id}", headers=doc_h, json={"starts_at": new_start.isoformat()})
    assert resched.status_code == 409


# ─────────────────────────────────────────────────────────────────────────────
# Appointment model extensions & Backward compatibility
# ─────────────────────────────────────────────────────────────────────────────

def test_appointment_stores_clinician_id_and_duration() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    starts_at = (datetime.now(timezone.utc) + timedelta(days=7)).replace(
        hour=14, minute=0, second=0, microsecond=0
    )
    resp = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={
            "patient_id": patient_id,
            "clinician_id": cid,
            "starts_at": starts_at.isoformat(),
            "duration_minutes": 45,
            "reason": "Annual check",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert str(data["clinician_id"]) == cid
    assert data["duration_minutes"] == 45


def test_appointment_duration_defaults_to_30_minutes() -> None:
    client = TestClient(app)
    doc_h, _, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    starts_at = (datetime.now(timezone.utc) + timedelta(days=3)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    resp = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={
            "patient_id": patient_id,
            "starts_at": starts_at.isoformat(),
            "reason": "Default duration check",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["duration_minutes"] == 30
    assert resp.json()["clinician_id"] is None


def test_update_appointment_can_change_duration_and_clinician() -> None:
    client = TestClient(app)
    doc_h, cid, _ = _register_doctor(client)
    patient_id = _create_patient(client, doc_h)

    starts_at = (datetime.now(timezone.utc) + timedelta(days=5)).replace(
        hour=11, minute=0, second=0, microsecond=0
    )
    create = client.post(
        "/api/v1/appointments",
        headers=doc_h,
        json={
            "patient_id": patient_id,
            "starts_at": starts_at.isoformat(),
            "reason": "Duration update test",
        },
    )
    assert create.status_code == 201
    appt_id = create.json()["id"]

    patch = client.patch(
        f"/api/v1/appointments/{appt_id}",
        headers=doc_h,
        json={"duration_minutes": 60, "clinician_id": cid},
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["duration_minutes"] == 60
    assert str(patch.json()["clinician_id"]) == cid


# ─────────────────────────────────────────────────────────────────────────────
# Authorization & RBAC
# ─────────────────────────────────────────────────────────────────────────────

def test_availability_endpoints_enforce_rbac_permissions() -> None:
    """Workspace administrator (lacking clinical appointments.* permissions) is denied 403."""
    client = TestClient(app)
    doc_h, cid, admin_h = _register_doctor(client)

    # Admin trying to create schedule -> 403
    sched = client.post(
        f"/api/v1/clinicians/{cid}/schedules",
        headers=admin_h,
        json={"day_of_week": 0, "start_time": "09:00", "end_time": "12:00"},
    )
    assert sched.status_code == 403

    # Admin trying to query availability -> 403
    avail = client.get(
        f"/api/v1/clinicians/{cid}/availability",
        headers=admin_h,
        params={"from_date": date.today().isoformat(), "to_date": date.today().isoformat()},
    )
    assert avail.status_code == 403

    # Admin trying to create override -> 403
    override = client.post(
        f"/api/v1/clinicians/{cid}/overrides",
        headers=admin_h,
        json={"override_date": "2026-12-25", "is_unavailable": True},
    )
    assert override.status_code == 403


# ───────────────────────────────────────────────────────────────────────────────
# Concurrency regression
# ───────────────────────────────────────────────────────────────────────────────

def test_concurrent_booking_same_slot_is_serialised():
    """Two simultaneous requests for the same clinician+slot must not both succeed.

    Strategy
    --------
    * One shared ``TestClient`` is created; its underlying anyio portal runs all
      async code in a *single* event loop.  Two OS threads both post to the same
      URL through that portal, giving true asyncio-level concurrency.
    * A ``threading.Barrier`` synchronises the moment each thread issues its
      request, maximising the chance of the TOCTOU window being hit.
    * The two payloads target the same clinician and the same 30-minute slot but
      different patients, so only the clinician-double-booking guard can reject
      the second request (the patient check alone would pass for both).

    Expected outcome
    ----------------
    Exactly one request returns **201 Created** and the other returns **409
    Conflict**.  A pre-fix implementation would return 201 for both.
    """
    with TestClient(app) as client:
        # ─ setup: register org, invite clinician, create two patients ────────
        owner_h, doc_h = _register(client, role="physician")
        doc_id = client.get("/api/v1/me", headers=doc_h).json()["id"]

        def _patient(n: int) -> str:
            resp = client.post(
                "/api/v1/patients",
                headers=doc_h,
                json={
                    "medical_record_number": f"CONC-{uuid4().hex[:6]}-{n}",
                    "given_name": f"Pat{n}",
                    "family_name": "Conc",
                    "date_of_birth": "1990-01-01",
                    "condition": "",
                },
            )
            assert resp.status_code == 201, resp.text
            return resp.json()["id"]

        p1_id = _patient(1)
        p2_id = _patient(2)

        # ─ same clinician, same 30-minute slot, different patients ──────────
        slot = (
            datetime.now(timezone.utc).replace(microsecond=0)
            + timedelta(days=4, hours=1)
        ).isoformat()

        results: list[int] = []
        barrier = threading.Barrier(2)

        def _book(patient_id: str) -> None:
            barrier.wait()  # both threads start at the same moment
            r = client.post(
                "/api/v1/appointments",
                headers=doc_h,
                json={
                    "patient_id": patient_id,
                    "clinician_id": doc_id,
                    "starts_at": slot,
                    "duration_minutes": 30,
                    "reason": "Concurrency regression test",
                    "status": "confirmed",
                },
            )
            results.append(r.status_code)

        t1 = threading.Thread(target=_book, args=(p1_id,))
        t2 = threading.Thread(target=_book, args=(p2_id,))
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        # ─ assertions ────────────────────────────────────────────────────────
        assert len(results) == 2, "Both threads must have completed"
        assert results.count(201) == 1, (
            f"Exactly one booking should succeed; got status codes {results}"
        )
        assert results.count(409) == 1, (
            f"Exactly one booking should be rejected; got status codes {results}"
        )
