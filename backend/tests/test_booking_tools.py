from datetime import date, datetime, time, timedelta, timezone
from typing import TypedDict
from uuid import UUID, uuid4
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.ai.booking.tools import BookingTools
from app.auth import provision_role_assignments
from app.db import init_db, session_factory
from app.models import Appointment, ClinicianSchedule, Organization, Patient, User


class BookingSeed(TypedDict):
    organization_id: UUID
    doctor_id: UUID
    unauthorized_user_id: UUID
    patient_id: UUID
    restricted_patient_id: UUID
    cross_tenant_patient_id: UUID
    cross_tenant_doctor_id: UUID
    appointment_date: date


def _next_weekday() -> date:
    candidate = date.today() + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


async def _seed(
    *,
    with_schedule: bool = True,
    timezone_name: str = "UTC",
    slot_duration_minutes: int = 30,
) -> BookingSeed:
    await init_db()
    async with session_factory() as session:
        organization = Organization(
            name=f"Booking test {uuid4()}",
            timezone=timezone_name,
        )
        session.add(organization)
        await session.flush()
        doctor = User(
            organization_id=organization.id,
            email=f"booking-doctor-{uuid4()}@example.org",
            full_name="Booking Doctor",
            role="doctor",
            department="Cardiology",
            project="",
            password_hash="not-used-in-test",
        )
        unauthorized_user = User(
            organization_id=organization.id,
            email=f"booking-admin-{uuid4()}@example.org",
            full_name="Booking Admin",
            role="admin",
            department="",
            project="",
            password_hash="not-used-in-test",
        )
        patient = Patient(
            organization_id=organization.id,
            medical_record_number=f"MRN-{uuid4().hex[:10]}",
            given_name="Booking",
            family_name="Patient",
            date_of_birth=date(1980, 1, 1),
            department="Cardiology",
        )
        other_patient = Patient(
            organization_id=organization.id,
            medical_record_number=f"MRN-{uuid4().hex[:10]}",
            given_name="Restricted",
            family_name="Patient",
            date_of_birth=date(1980, 1, 1),
            department="Oncology",
        )
        other_organization = Organization(name=f"Other booking test {uuid4()}")
        session.add(other_organization)
        await session.flush()
        cross_tenant_doctor = User(
            organization_id=other_organization.id,
            email=f"booking-doctor-{uuid4()}@other.example.org",
            full_name="Other Tenant Doctor",
            role="doctor",
            department="Cardiology",
            project="",
            password_hash="not-used-in-test",
        )
        session.add_all([doctor, unauthorized_user, patient, other_patient])
        session.add(cross_tenant_doctor)
        await session.flush()
        await provision_role_assignments(session, doctor)
        await provision_role_assignments(session, unauthorized_user)
        cross_tenant_patient = Patient(
            organization_id=other_organization.id,
            medical_record_number=f"MRN-{uuid4().hex[:10]}",
            given_name="Other",
            family_name="Tenant",
            date_of_birth=date(1980, 1, 1),
        )
        session.add(cross_tenant_patient)
        await session.flush()
        appointment_date = _next_weekday()
        if with_schedule:
            session.add(
                ClinicianSchedule(
                    organization_id=organization.id,
                    clinician_id=doctor.id,
                    day_of_week=appointment_date.weekday(),
                    start_time=time(9, 0),
                    end_time=time(12, 0),
                    slot_duration_minutes=slot_duration_minutes,
                )
            )
        await session.commit()
        return {
            "organization_id": organization.id,
            "doctor_id": doctor.id,
            "unauthorized_user_id": unauthorized_user.id,
            "patient_id": patient.id,
            "restricted_patient_id": other_patient.id,
            "cross_tenant_patient_id": cross_tenant_patient.id,
            "cross_tenant_doctor_id": cross_tenant_doctor.id,
            "appointment_date": appointment_date,
        }


async def _load_user(user_id: UUID) -> User:
    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


@pytest.mark.asyncio
async def test_booking_tool_persists_only_available_slots() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)
    starts_at = datetime.combine(
        target_date, time(10, 0), tzinfo=timezone.utc
    )

    async with session_factory() as session:
        tools = BookingTools(session, user)
        slots = await tools.get_available_slots(target_date.isoformat())
        assert any("T10:00:00" in slot for slot in slots)
        result = await tools.book_appointment(
            patient_id=seeded["patient_id"],
            starts_at=starts_at,
            reason="Cardiology consultation",
        )
        appointment_id = UUID(str(result["id"]))
        stored = await session.scalar(
            select(Appointment).where(Appointment.id == appointment_id)
        )
        assert stored is not None
        assert stored.patient_id == seeded["patient_id"]
        assert stored.organization_id == seeded["organization_id"]
        assert stored.status == "confirmed"
        with pytest.raises(HTTPException) as duplicate_slot:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=starts_at,
                reason="Cardiology consultation",
            )
        assert duplicate_slot.value.status_code == 409


@pytest.mark.asyncio
async def test_booking_uses_configured_schedule_slot_duration() -> None:
    seeded = await _seed(slot_duration_minutes=45)
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)

    async with session_factory() as session:
        tools = BookingTools(session, user)
        slots = await tools.get_available_slots(target_date.isoformat())
        assert any(slot.endswith("T09:45:00") for slot in slots)
        assert not any(slot.endswith("T09:30:00") for slot in slots)
        result = await tools.book_appointment(
            patient_id=seeded["patient_id"],
            starts_at=datetime.combine(target_date, time(9, 45), tzinfo=timezone.utc),
            reason="Scheduled 45-minute consultation",
        )
        stored = await session.get(Appointment, UUID(str(result["id"])))
        assert stored is not None
        assert stored.duration_minutes == 45


@pytest.mark.asyncio
async def test_booking_does_not_invent_availability_without_schedule() -> None:
    seeded = await _seed(with_schedule=False)
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)
    starts_at = datetime.combine(target_date, time(10, 0), tzinfo=timezone.utc)

    async with session_factory() as session:
        tools = BookingTools(session, user)
        assert await tools.get_available_slots(target_date.isoformat()) == []
        with pytest.raises(HTTPException) as unavailable:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=starts_at,
                reason="Cardiology consultation",
            )
        assert unavailable.value.status_code == 409


@pytest.mark.asyncio
async def test_booking_tool_requires_create_permission() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["unauthorized_user_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)

    async with session_factory() as session:
        tools = BookingTools(session, user)
        with pytest.raises(HTTPException) as forbidden:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=datetime.combine(
                    target_date, time(10, 0), tzinfo=timezone.utc
                ),
                reason="Unauthorized booking",
            )
        assert forbidden.value.status_code == 403


@pytest.mark.asyncio
async def test_booking_rejects_cross_scope_patient_and_invalid_inputs() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)
    starts_at = datetime.combine(target_date, time(10, 0), tzinfo=timezone.utc)

    async with session_factory() as session:
        tools = BookingTools(session, user)
        for patient_id, expected_status in (
            (seeded["restricted_patient_id"], 403),
            (seeded["cross_tenant_patient_id"], 404),
        ):
            with pytest.raises(HTTPException) as denied:
                await tools.book_appointment(
                    patient_id=patient_id,
                    starts_at=starts_at,
                    reason="Cross-scope booking",
                )
            assert denied.value.status_code == expected_status
        with pytest.raises(HTTPException) as cross_tenant_clinician:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=starts_at,
                reason="Cross-tenant clinician",
                clinician_id=seeded["cross_tenant_doctor_id"],
            )
        assert cross_tenant_clinician.value.status_code == 404
        with pytest.raises(HTTPException) as specialty_mismatch:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=starts_at,
                reason="Mismatched specialty",
                specialty="Oncology",
            )
        assert specialty_mismatch.value.status_code == 404
        with pytest.raises(HTTPException) as invalid_reason:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=starts_at,
                reason=" ",
            )
        assert invalid_reason.value.status_code == 422


@pytest.mark.asyncio
async def test_booking_uses_organization_timezone_and_rejects_ambiguous_local_time() -> None:
    seeded = await _seed(timezone_name="Asia/Riyadh")
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)
    naive_local_start = datetime.combine(target_date, time(10, 0))

    async with session_factory() as session:
        tools = BookingTools(session, user)
        saved = await tools.book_appointment(
            patient_id=seeded["patient_id"],
            starts_at=naive_local_start,
            reason="Local clinic time",
        )
        row = await session.get(Appointment, UUID(str(saved["id"])))
        assert row is not None
        stored_start = (
            row.starts_at.replace(tzinfo=timezone.utc)
            if row.starts_at.tzinfo is None
            else row.starts_at.astimezone(timezone.utc)
        )
        assert stored_start == datetime.combine(
            target_date, time(7, 0), tzinfo=timezone.utc
        )

    # Both 01:30 wall-clock readings are valid during this fall-back hour,
    # but have distinct UTC offsets and must not be silently guessed.
    with pytest.raises(HTTPException) as ambiguous:
        BookingTools._localize_start(
            datetime(2026, 11, 1, 1, 30), ZoneInfo("America/New_York")
        )
    assert ambiguous.value.status_code == 422
    with pytest.raises(HTTPException) as nonexistent:
        BookingTools._localize_start(
            datetime(2026, 3, 8, 2, 30), ZoneInfo("America/New_York")
        )
    assert nonexistent.value.status_code == 422


@pytest.mark.asyncio
async def test_booking_database_failure_rolls_back_and_returns_unavailable() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["doctor_id"])
    target_date = seeded["appointment_date"]
    assert isinstance(target_date, date)
    async with session_factory() as session:
        tools = BookingTools(session, user)
        session.commit = AsyncMock(side_effect=SQLAlchemyError("simulated commit failure"))
        with pytest.raises(HTTPException) as unavailable:
            await tools.book_appointment(
                patient_id=seeded["patient_id"],
                starts_at=datetime.combine(
                    target_date, time(10, 0), tzinfo=timezone.utc
                ),
                reason="Commit failure regression",
            )
        assert unavailable.value.status_code == 503
        session.commit.assert_awaited_once()
