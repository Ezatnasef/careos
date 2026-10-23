from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Patient
from app.rbac import can_access_patient_scope


async def owned_patient(
    session: AsyncSession, patient_id: UUID, organization_id: UUID
) -> Patient:
    patient = await session.get(Patient, patient_id)
    if (
        patient is None
        or patient.deleted_at is not None
        or patient.organization_id != organization_id
    ):
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def patient_scope_matches(user, patient) -> bool:
    user_department = (getattr(user, "department", "") or "").strip().lower()
    patient_department = (getattr(patient, "department", "") or "").strip().lower()
    user_project = (getattr(user, "project", "") or "").strip().lower()
    patient_project = (getattr(patient, "project", "") or "").strip().lower()

    same_department = (
        not user_department or not patient_department or user_department == patient_department
    )
    same_project = not user_project or not patient_project or user_project == patient_project
    return same_department and same_project


async def ensure_patient_access(
    session: AsyncSession, patient_id: UUID, user, action: str
) -> Patient:
    patient = await owned_patient(session, patient_id, user.organization_id)
    scope_matches = patient_scope_matches(user, patient)
    if not can_access_patient_scope(
        user.role,
        action,
        same_organization=True,
        same_department=scope_matches,
        same_project=scope_matches,
    ):
        raise HTTPException(status_code=403, detail=f"Role cannot {action} this patient")
    return patient
