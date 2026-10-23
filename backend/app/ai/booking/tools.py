from datetime import datetime, date, time, timedelta, timezone
from typing import TypedDict
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.patient_access import ensure_patient_access
from app.db import get_booking_lock
from app.models import Appointment, ClinicianSchedule, Organization, ReminderJob, ScheduleOverride, User
from app.auth import permissions_for_user, write_audit


class AvailableSlot(TypedDict):
    starts_at: str
    duration_minutes: int


class BookingTools:
    """Adapter between Booking Agent and target backend's existing logic."""

    def __init__(self, session: AsyncSession, user) -> None:
        self.session = session
        self.user = user

    async def _require_permission(self, permission: str) -> None:
        if permission not in await permissions_for_user(self.session, self.user):
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    async def _organization_timezone(self) -> ZoneInfo:
        organization = await self.session.get(Organization, self.user.organization_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        try:
            return ZoneInfo(organization.timezone)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=500, detail="Organization timezone is invalid") from exc

    @staticmethod
    def _localize_start(starts_at: datetime, organization_timezone: ZoneInfo) -> datetime:
        if starts_at.tzinfo is not None:
            return starts_at.astimezone(timezone.utc)

        first = starts_at.replace(tzinfo=organization_timezone, fold=0)
        second = starts_at.replace(tzinfo=organization_timezone, fold=1)
        first_roundtrip = first.astimezone(timezone.utc).astimezone(
            organization_timezone
        ).replace(tzinfo=None)
        second_roundtrip = second.astimezone(timezone.utc).astimezone(
            organization_timezone
        ).replace(tzinfo=None)
        if first_roundtrip != starts_at or second_roundtrip != starts_at:
            raise HTTPException(
                status_code=422,
                detail="Appointment time does not exist in the organization timezone",
            )
        if first.utcoffset() != second.utcoffset():
            raise HTTPException(
                status_code=422,
                detail="Appointment time is ambiguous in the organization timezone",
            )
        return first.astimezone(timezone.utc)

    async def slot_identifier(self, starts_at: datetime) -> str:
        organization_timezone = await self._organization_timezone()
        normalized = self._localize_start(starts_at, organization_timezone)
        return normalized.astimezone(organization_timezone).strftime(
            "%Y-%m-%dT%H:%M:00"
        )

    async def _resolve_clinician(self, clinician_id: UUID | None = None, specialty: str | None = None) -> UUID | None:
        """Resolve doctor in the organization: either explicit clinician ID, or doctor with active schedules."""
        requested_specialty = (specialty or "").strip().casefold().replace("-", "").replace(" ", "")

        def specialty_matches(candidate: User | None) -> bool:
            if candidate is None:
                return False
            if not requested_specialty:
                return True
            department = (candidate.department or "").strip().casefold().replace("-", "").replace(" ", "")
            return department == requested_specialty

        # 1. If explicit clinician_id is given and belongs to this organization
        if clinician_id is not None:
            c = await self.session.get(User, clinician_id)
            if c is not None and c.organization_id == self.user.organization_id and c.role == "doctor" and c.deleted_at is None and specialty_matches(c):
                return c.id
            if c is not None and c.organization_id == self.user.organization_id and c.role == "doctor" and c.deleted_at is None:
                raise HTTPException(status_code=404, detail="No clinician matches the requested specialty")
            raise HTTPException(status_code=404, detail="Clinician not found")

        # 2. If current user is a doctor with schedules in this organization
        curr_id = getattr(self.user, 'id', None)
        if curr_id is not None:
            curr_user = await self.session.get(User, curr_id)
            if curr_user is not None and getattr(curr_user, 'role', '') == 'doctor' and curr_user.organization_id == self.user.organization_id and curr_user.deleted_at is None and specialty_matches(curr_user):
                has_sched = await self.session.scalar(
                    select(ClinicianSchedule.id).where(
                        ClinicianSchedule.clinician_id == curr_id,
                        ClinicianSchedule.organization_id == self.user.organization_id
                    ).limit(1)
                )
                if has_sched:
                    return curr_id

        # 3. Find any doctor in this organization who has configured schedules
        scheduled_clinicians = (
            await self.session.scalars(
                select(User)
                .join(ClinicianSchedule, ClinicianSchedule.clinician_id == User.id)
                .where(
                    ClinicianSchedule.organization_id == self.user.organization_id,
                    User.organization_id == self.user.organization_id,
                    User.role == "doctor",
                    User.deleted_at.is_(None),
                )
                .order_by(User.id)
            )
        ).all()
        for scheduled_clinician in scheduled_clinicians:
            if specialty_matches(scheduled_clinician):
                return scheduled_clinician.id

        if requested_specialty:
            raise HTTPException(status_code=404, detail="No clinician matches the requested specialty")

        # 4. Fallback to any doctor in this organization
        doc_id = await self.session.scalar(
            select(User.id).where(
                User.organization_id == self.user.organization_id,
                User.role == 'doctor',
                User.deleted_at.is_(None),
            ).limit(1)
        )
        return doc_id

    async def _get_available_slot_details(
        self,
        target_date: str,
        clinician_id: UUID | None = None,
        specialty: str | None = None,
        exclude_appointment_id: UUID | None = None,
    ) -> list[AvailableSlot]:
        from types import SimpleNamespace
        from app.api import _compute_slots

        await self._require_permission("appointments.view")
        try:
            parsed = date.fromisoformat(target_date)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid appointment date") from exc
        organization_timezone = await self._organization_timezone()
        resolved_clinician_id = await self._resolve_clinician(clinician_id, specialty)
        if resolved_clinician_id is None:
            raise HTTPException(status_code=404, detail="No clinician is available")

        schedules = (await self.session.scalars(
            select(ClinicianSchedule).where(
                ClinicianSchedule.clinician_id == resolved_clinician_id,
                ClinicianSchedule.organization_id == self.user.organization_id,
            )
        )).all() if resolved_clinician_id else []

        local_start = datetime.combine(parsed, time.min, tzinfo=organization_timezone)
        local_end = datetime.combine(parsed + timedelta(days=1), time.min, tzinfo=organization_timezone)
        start_bound = local_start.astimezone(timezone.utc)
        end_bound = local_end.astimezone(timezone.utc)
        overlap_query_start = start_bound - timedelta(minutes=480)
        booking_statement = select(Appointment).where(
            Appointment.clinician_id == resolved_clinician_id,
            Appointment.organization_id == self.user.organization_id,
            Appointment.status.not_in(["cancelled"]),
            Appointment.starts_at >= overlap_query_start,
            Appointment.starts_at < end_bound,
        )
        if exclude_appointment_id is not None:
            booking_statement = booking_statement.where(
                Appointment.id != exclude_appointment_id
            )
        booked = (await self.session.scalars(booking_statement)).all()
        local_bookings = [
            SimpleNamespace(
                starts_at=(
                    item.starts_at.replace(tzinfo=timezone.utc)
                    if item.starts_at.tzinfo is None
                    else item.starts_at
                ).astimezone(organization_timezone).replace(tzinfo=None),
                duration_minutes=item.duration_minutes,
            )
            for item in booked
        ]
        overrides = (await self.session.scalars(
            select(ScheduleOverride).where(
                ScheduleOverride.clinician_id == resolved_clinician_id,
                ScheduleOverride.organization_id == self.user.organization_id,
                ScheduleOverride.override_date == parsed,
            )
        )).all() if resolved_clinician_id else []
        slot_bookings = []
        for appointment in local_bookings:
            local_end = appointment.starts_at + timedelta(
                minutes=appointment.duration_minutes
            )
            if appointment.starts_at.date() < parsed < local_end.date():
                slot_bookings.append(
                    SimpleNamespace(
                        starts_at=datetime.combine(parsed, time.min),
                        duration_minutes=int(
                            (local_end - datetime.combine(parsed, time.min)).total_seconds()
                            // 60
                        ),
                    )
                )
            elif appointment.starts_at.date() == parsed:
                slot_bookings.append(appointment)
        current_local = datetime.now(organization_timezone).replace(tzinfo=None)
        durations = {
            schedule.slot_duration_minutes
            for schedule in schedules
            if schedule.day_of_week == parsed.weekday()
        }
        if overrides and any(item.start_time and item.end_time for item in overrides):
            durations = {30}
        available: dict[str, AvailableSlot] = {}
        ambiguous_slots: set[str] = set()
        for duration in durations:
            slots = _compute_slots(
                list(schedules), list(overrides), slot_bookings, parsed, duration
            )
            for slot in slots:
                starts_at = datetime.combine(
                    parsed, time.fromisoformat(str(slot["start_time"]))
                )
                if starts_at > current_local:
                    identifier = f"{parsed.isoformat()}T{slot['start_time']}:00"
                    existing = available.get(identifier)
                    if existing and existing["duration_minutes"] != duration:
                        available.pop(identifier)
                        ambiguous_slots.add(identifier)
                        continue
                    if identifier in ambiguous_slots:
                        continue
                    available[identifier] = {
                        "starts_at": identifier,
                        "duration_minutes": duration,
                    }
        return list(available.values())

    async def get_available_slots(
        self,
        target_date: str,
        clinician_id: UUID | None = None,
        specialty: str | None = None,
        exclude_appointment_id: UUID | None = None,
    ) -> list[str]:
        details = await self._get_available_slot_details(
            target_date,
            clinician_id=clinician_id,
            specialty=specialty,
            exclude_appointment_id=exclude_appointment_id,
        )
        return [slot["starts_at"] for slot in details]

    async def book_appointment(
        self,
        patient_id: UUID,
        starts_at: datetime,
        reason: str,
        clinician_id: UUID | None = None,
        specialty: str | None = None,
    ) -> dict[str, object]:
        from app.api import _validate_appointment_conflict, appointment_public

        await self._require_permission("appointments.create")
        await ensure_patient_access(self.session, patient_id, self.user, "appointments")
        normalized_reason = reason.strip()
        if not normalized_reason or len(normalized_reason) > 240:
            raise HTTPException(status_code=422, detail="A valid appointment reason is required")
        organization_timezone = await self._organization_timezone()
        comp_start = self._localize_start(starts_at, organization_timezone)
        if comp_start <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Appointment must be scheduled in the future")

        resolved_clinician_id = await self._resolve_clinician(clinician_id, specialty)
        if resolved_clinician_id is None:
            raise HTTPException(status_code=404, detail="No clinician is available")
        local_start = comp_start.astimezone(organization_timezone)
        available_slots = await self._get_available_slot_details(
            local_start.date().isoformat(),
            clinician_id=resolved_clinician_id,
            specialty=specialty,
        )
        requested_slot = local_start.strftime("%Y-%m-%dT%H:%M:00")
        slot = next((item for item in available_slots if item["starts_at"] == requested_slot), None)
        if slot is None:
            raise HTTPException(status_code=409, detail="Requested appointment slot is unavailable")
        duration_minutes = slot["duration_minutes"]

        async with get_booking_lock(self.user.organization_id):
            await _validate_appointment_conflict(
                self.session,
                organization_id=self.user.organization_id,
                starts_at=comp_start,
                duration_minutes=duration_minutes,
                clinician_id=resolved_clinician_id,
                patient_id=patient_id,
            )
            item = Appointment(
                organization_id=self.user.organization_id,
                patient_id=patient_id,
                clinician_id=resolved_clinician_id,
                starts_at=comp_start,
                duration_minutes=duration_minutes,
                reason=normalized_reason,
                status="confirmed",
            )
            try:
                self.session.add(item)
                await self.session.flush()
                self.session.add(ReminderJob(
                    organization_id=self.user.organization_id,
                    appointment_id=item.id,
                    scheduled_for=item.starts_at,
                    channel="sandbox",
                ))
                item.reminder_status = "queued"
                await write_audit(self.session, self.user, "appointment.created", str(item.id))
                await self.session.commit()
            except SQLAlchemyError as exc:
                await self.session.rollback()
                raise HTTPException(status_code=503, detail="Appointment could not be saved") from exc
        return appointment_public(item)

    async def modify_appointment(self, appointment_id: UUID, starts_at: datetime | None = None, reason: str | None = None) -> dict[str, object]:
        from app.api import _validate_appointment_conflict, appointment_public

        await self._require_permission("appointments.update")
        if starts_at is None and reason is None:
            raise HTTPException(status_code=422, detail="Provide an appointment time or reason to update")
        item = await self.session.get(Appointment, appointment_id)
        if item is None or item.organization_id != self.user.organization_id:
            raise HTTPException(status_code=404, detail="Appointment not found")
        await ensure_patient_access(self.session, item.patient_id, self.user, "appointments")
        if item.status == "cancelled":
            raise HTTPException(status_code=409, detail="Cancelled appointments cannot be rescheduled")
        async with get_booking_lock(self.user.organization_id):
            if starts_at is not None:
                organization_timezone = await self._organization_timezone()
                comp_start = self._localize_start(starts_at, organization_timezone)
                if comp_start <= datetime.now(timezone.utc):
                    raise HTTPException(status_code=422, detail="Appointment must be scheduled in the future")
                if item.clinician_id is None:
                    raise HTTPException(status_code=409, detail="Appointment has no assigned clinician")
                local_start = comp_start.astimezone(organization_timezone)
                available_slots = await self._get_available_slot_details(
                    local_start.date().isoformat(),
                    clinician_id=item.clinician_id,
                    exclude_appointment_id=item.id,
                )
                requested_slot = local_start.strftime("%Y-%m-%dT%H:%M:00")
                slot = next((candidate for candidate in available_slots if candidate["starts_at"] == requested_slot), None)
                if slot is None:
                    raise HTTPException(status_code=409, detail="Requested appointment slot is unavailable")
                duration_minutes = slot["duration_minutes"]
                await _validate_appointment_conflict(
                    self.session,
                    organization_id=self.user.organization_id,
                    starts_at=comp_start,
                    duration_minutes=duration_minutes,
                    clinician_id=item.clinician_id,
                    patient_id=item.patient_id,
                    exclude_id=item.id,
                )
                item.starts_at = comp_start
                item.duration_minutes = duration_minutes
                item.reminder_status = "queued"
            if reason is not None:
                normalized_reason = reason.strip()
                if not normalized_reason or len(normalized_reason) > 240:
                    raise HTTPException(status_code=422, detail="A valid appointment reason is required")
                item.reason = normalized_reason
            try:
                await write_audit(self.session, self.user, "appointment.rescheduled", str(item.id))
                await self.session.commit()
            except SQLAlchemyError as exc:
                await self.session.rollback()
                raise HTTPException(status_code=503, detail="Appointment could not be updated") from exc
        return appointment_public(item)

    async def cancel_appointment(self, appointment_id: UUID) -> dict[str, object]:
        from app.api import appointment_public

        await self._require_permission("appointments.update")
        item = await self.session.get(Appointment, appointment_id)
        if item is None or item.organization_id != self.user.organization_id:
            raise HTTPException(status_code=404, detail="Appointment not found")
        await ensure_patient_access(self.session, item.patient_id, self.user, "appointments")
        if item.status == "cancelled":
            raise HTTPException(status_code=409, detail="Appointment is already cancelled")
        item.status = "cancelled"
        try:
            await write_audit(self.session, self.user, "appointment.status_updated", str(item.id))
            await self.session.commit()
        except SQLAlchemyError as exc:
            await self.session.rollback()
            raise HTTPException(status_code=503, detail="Appointment could not be cancelled") from exc
        return appointment_public(item)
