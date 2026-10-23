from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import permissions_for_user, write_audit
from app.db import get_booking_lock
from app.models import Appointment, Task
from app.patient_access import ensure_patient_access


class FollowUpTools:
    """Persist follow-up work as organization- and patient-scoped tasks."""

    _CREATE_PERMISSION = "followups.create"
    _READ_PERMISSION = "followups.view"
    _UPDATE_PERMISSION = "followups.update"
    _ACTIVE_STATUSES = ("pending", "in_progress")

    def __init__(self, session: AsyncSession, user) -> None:
        self.session = session
        self.user = user

    async def _require_permission(self, permission: str) -> None:
        permissions = await permissions_for_user(self.session, self.user)
        if permission not in permissions:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    async def _get_task(self, followup_id: UUID) -> Task:
        task = await self.session.scalar(
            select(Task).where(
                Task.id == followup_id,
                Task.organization_id == self.user.organization_id,
            )
        )
        if task is None:
            raise HTTPException(status_code=404, detail="Follow-up task not found")
        await ensure_patient_access(
            self.session, task.patient_id, self.user, "appointments"
        )
        return task

    @staticmethod
    def _public_task(task: Task) -> dict[str, object]:
        return {
            "id": str(task.id),
            "patient_id": str(task.patient_id),
            "title": task.title,
            "description": task.description,
            "assignee": task.assignee,
            "priority": task.priority,
            "status": task.status,
            "due_at": task.due_at.isoformat() if task.due_at else None,
        }

    async def create_followup(
        self,
        *,
        patient_id: UUID,
        followup_type: str | None,
        reason: str | None,
        due_at: datetime | None,
        appointment_id: UUID | None = None,
    ) -> dict[str, object]:
        await self._require_permission(self._CREATE_PERMISSION)
        if not isinstance(patient_id, UUID):
            raise HTTPException(status_code=422, detail="A valid patient is required")
        patient = await ensure_patient_access(
            self.session, patient_id, self.user, "appointments"
        )
        normalized_type = (followup_type or "").strip()
        normalized_reason = (reason or "").strip()
        if not normalized_type or len(normalized_type) > 120:
            raise HTTPException(status_code=422, detail="A valid follow-up type is required")
        if not normalized_reason:
            raise HTTPException(status_code=422, detail="A follow-up reason is required")
        if due_at is None:
            raise HTTPException(status_code=422, detail="A follow-up due date is required")
        normalized_due_at = (
            due_at.replace(tzinfo=timezone.utc) if due_at.tzinfo is None else due_at
        )

        if appointment_id is not None:
            appointment = await self.session.scalar(
                select(Appointment).where(
                    Appointment.id == appointment_id,
                    Appointment.organization_id == self.user.organization_id,
                    Appointment.patient_id == patient.id,
                )
            )
            if appointment is None:
                raise HTTPException(status_code=404, detail="Appointment not found")

        title = f"Follow-up: {normalized_type}"
        async with get_booking_lock(self.user.organization_id):
            duplicate = await self.session.scalar(
                select(Task.id).where(
                    Task.organization_id == self.user.organization_id,
                    Task.patient_id == patient.id,
                    Task.title == title,
                    Task.description == normalized_reason,
                    Task.due_at == normalized_due_at,
                    Task.status.in_(self._ACTIVE_STATUSES),
                )
            )
            if duplicate is not None:
                raise HTTPException(
                    status_code=409, detail="An active matching follow-up already exists"
                )

            task = Task(
                organization_id=self.user.organization_id,
                patient_id=patient.id,
                title=title,
                description=normalized_reason,
                assignee=self.user.full_name,
                priority="medium",
                status="pending",
                due_at=normalized_due_at,
            )
            try:
                self.session.add(task)
                await self.session.flush()
                await write_audit(
                    self.session, self.user, "followup.created", str(task.id)
                )
                await self.session.commit()
            except SQLAlchemyError as exc:
                await self.session.rollback()
                raise HTTPException(
                    status_code=503, detail="Follow-up could not be saved"
                ) from exc
        return self._public_task(task)

    async def get_followup(self, *, followup_id: UUID) -> dict[str, object]:
        await self._require_permission(self._READ_PERMISSION)
        task = await self._get_task(followup_id)
        return self._public_task(task)

    async def update_followup(
        self,
        *,
        followup_id: UUID,
        due_at: datetime | None = None,
        reason: str | None = None,
    ) -> dict[str, object]:
        await self._require_permission(self._UPDATE_PERMISSION)
        task = await self._get_task(followup_id)
        if task.status not in self._ACTIVE_STATUSES:
            raise HTTPException(
                status_code=409, detail="Terminal follow-up tasks cannot be modified"
            )
        if due_at is None and reason is None:
            raise HTTPException(
                status_code=422, detail="Provide a due date or reason to update"
            )
        if reason is not None:
            normalized_reason = reason.strip()
            if not normalized_reason:
                raise HTTPException(status_code=422, detail="Reason cannot be empty")
            task.description = normalized_reason
        if due_at is not None:
            task.due_at = (
                due_at.replace(tzinfo=timezone.utc)
                if due_at.tzinfo is None
                else due_at
            )
        try:
            await write_audit(self.session, self.user, "followup.updated", str(task.id))
            await self.session.commit()
        except SQLAlchemyError as exc:
            await self.session.rollback()
            raise HTTPException(
                status_code=503, detail="Follow-up could not be updated"
            ) from exc
        return self._public_task(task)

    async def update_followup_status(
        self, *, followup_id: UUID, status: str
    ) -> dict[str, object]:
        await self._require_permission(self._UPDATE_PERMISSION)
        task = await self._get_task(followup_id)
        transitions = {
            "pending": {"in_progress", "completed", "cancelled"},
            "in_progress": {"completed", "cancelled"},
        }
        if status not in transitions.get(task.status, set()):
            raise HTTPException(
                status_code=409,
                detail=f"Follow-up cannot transition from {task.status} to {status}",
            )
        task.status = status
        try:
            await write_audit(
                self.session, self.user, "followup.status_updated", str(task.id)
            )
            await self.session.commit()
        except SQLAlchemyError as exc:
            await self.session.rollback()
            raise HTTPException(
                status_code=503, detail="Follow-up status could not be updated"
            ) from exc
        return self._public_task(task)
