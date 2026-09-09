from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from .db import get_session
from .email_service import send_team_invite

from .auth import (
    AuditEventResponse,
    InviteRequest,
    LoginRequest,
    OrganizationUpdate,
    RegisterRequest,
    authenticate,
    current_user,
    public_user,
    register_user,
    revoke_token,
    require_roles,
    write_audit,
)
from .integrations import ocr_provider, rag_provider, summary_provider
from .models import Appointment, AuditEvent, ClinicalNote, Notification, Organization, Patient, PatientDocument, ReminderJob, TeamInvite, User

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


class PatientInput(BaseModel):
    medical_record_number: str = Field(min_length=2, max_length=64)
    given_name: str = Field(min_length=1, max_length=120)
    family_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    gender: str = "unspecified"
    condition: str = ""
    care_status: str = "stable"


class AppointmentInput(BaseModel):
    patient_id: UUID
    starts_at: datetime
    reason: str = Field(min_length=2, max_length=240)
    status: str = "pending"


class NoteInput(BaseModel):
    patient_id: UUID
    body: str = Field(min_length=1)
    ai_draft: str | None = None


class RagQuestion(BaseModel):
    patient_id: UUID
    question: str = Field(min_length=3, max_length=2000)


class DocumentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


def patient_public(patient: Patient) -> dict[str, object]:
    return {"id": patient.id, "medical_record_number": patient.medical_record_number, "given_name": patient.given_name, "family_name": patient.family_name, "date_of_birth": patient.date_of_birth, "gender": patient.gender, "condition": patient.condition, "care_status": patient.care_status, "created_at": patient.created_at}


async def owned_patient(session: AsyncSession, patient_id: UUID, organization_id: UUID) -> Patient:
    patient = await session.get(Patient, patient_id)
    if patient is None or patient.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readiness", tags=["system"])
async def readiness(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as error:
        raise HTTPException(status_code=503, detail="Database is not ready") from error
    return {"status": "ready"}


@router.post("/auth/register", status_code=201, tags=["auth"])
async def register(request: RegisterRequest, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    user, token = await register_user(session, request)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.post("/auth/login", tags=["auth"])
async def login(request: LoginRequest, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    user, token = await authenticate(session, request)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.get("/me", tags=["auth"])
async def me(user=Depends(current_user)) -> dict[str, object]:
    return public_user(user)


@router.post("/auth/logout", status_code=204, tags=["auth"])
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> None:
    if credentials is not None:
        await revoke_token(session, credentials, user)


@router.patch("/organization", tags=["onboarding"])
async def update_organization(
    request: OrganizationUpdate,
    user=Depends(require_roles("administrator")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str | object]:
    organization = await session.get(Organization, user.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    for field, value in request.model_dump().items():
        setattr(organization, field, value)
    user.onboarding_complete = True
    await write_audit(session, user, "organization.updated", organization.name)
    await session.commit()
    return {"id": organization.id, "name": organization.name, "department": organization.department, "timezone": organization.timezone}


@router.get("/team", tags=["team"])
async def team(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    members = (await session.scalars(select(User).where(User.organization_id == user.organization_id))).all()
    return [public_user(member) for member in members]


@router.post("/team/invites", status_code=201, tags=["team"])
async def invite_member(request: InviteRequest, user=Depends(require_roles("administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    invite = TeamInvite(organization_id=user.organization_id, email=str(request.email).lower(), role=request.role)
    session.add(invite)
    await write_audit(session, user, "team.invited", str(request.email))
    await session.commit()
    organization = await session.get(Organization, user.organization_id)
    await send_team_invite(str(request.email), organization.name if organization else "CareOS", request.role)
    return {"email": str(request.email), "role": request.role, "status": "pending"}


@router.get("/audit-events", response_model=list[AuditEventResponse], tags=["audit"])
async def audit_log(user=Depends(require_roles("administrator")), session: AsyncSession = Depends(get_session)) -> list[AuditEvent]:
    return list((await session.scalars(select(AuditEvent).where(AuditEvent.organization_id == user.organization_id).order_by(AuditEvent.created_at.desc()))).all())


@router.get("/notifications", tags=["notifications"])
async def notifications(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    records = (await session.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50))).all()
    return [{"id": item.id, "kind": item.kind, "title": item.title, "body": item.body, "read": item.read, "created_at": item.created_at} for item in records]


@router.patch("/notifications/{notification_id}/read", tags=["notifications"])
async def mark_notification_read(notification_id: UUID, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    notification = await session.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read = True
    await session.commit()
    return {"read": True}


@router.get("/dashboard", tags=["clinical"])
async def dashboard(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    patient_count = len((await session.scalars(select(Patient.id).where(Patient.organization_id == user.organization_id))).all())
    upcoming = list((await session.scalars(select(Appointment).where(Appointment.organization_id == user.organization_id, Appointment.starts_at >= datetime.now(timezone.utc)).order_by(Appointment.starts_at).limit(8))).all())
    followups = list((await session.scalars(select(Patient).where(Patient.organization_id == user.organization_id, Patient.care_status.in_(["follow_up_due", "needs_attention"])).limit(5))).all())
    return {"patient_count": patient_count, "upcoming_appointments": [appointment_public(item) for item in upcoming], "followups": [patient_public(item) for item in followups]}


@router.get("/patients", tags=["clinical"])
async def list_patients(q: str = "", user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    statement = select(Patient).where(Patient.organization_id == user.organization_id).order_by(Patient.family_name, Patient.given_name)
    if q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where((Patient.given_name.ilike(pattern)) | (Patient.family_name.ilike(pattern)) | (Patient.medical_record_number.ilike(pattern)))
    return [patient_public(item) for item in (await session.scalars(statement.limit(100))).all()]


@router.post("/patients", status_code=201, tags=["clinical"])
async def create_patient(request: PatientInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    existing = await session.scalar(select(Patient).where(Patient.organization_id == user.organization_id, Patient.medical_record_number == request.medical_record_number))
    if existing:
        raise HTTPException(status_code=409, detail="Medical record number already exists")
    patient = Patient(organization_id=user.organization_id, **request.model_dump())
    session.add(patient); await session.flush(); await write_audit(session, user, "patient.created", str(patient.id)); await session.commit()
    return patient_public(patient)


@router.get("/patients/{patient_id}", tags=["clinical"])
async def get_patient(patient_id: UUID, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    patient = await owned_patient(session, patient_id, user.organization_id)
    notes = list((await session.scalars(select(ClinicalNote).where(ClinicalNote.patient_id == patient.id, ClinicalNote.organization_id == user.organization_id).order_by(ClinicalNote.created_at.desc()))).all())
    documents = list((await session.scalars(select(PatientDocument).where(PatientDocument.patient_id == patient.id, PatientDocument.organization_id == user.organization_id).order_by(PatientDocument.created_at.desc()))).all())
    return {**patient_public(patient), "notes": [note_public(note) for note in notes], "documents": [{"id": doc.id, "filename": doc.filename, "ocr_status": doc.ocr_status, "extracted_text": doc.extracted_text} for doc in documents]}


@router.patch("/patients/{patient_id}", tags=["clinical"])
async def update_patient(patient_id: UUID, request: PatientInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    patient = await owned_patient(session, patient_id, user.organization_id)
    for key, value in request.model_dump().items(): setattr(patient, key, value)
    await write_audit(session, user, "patient.updated", str(patient.id)); await session.commit(); return patient_public(patient)


def appointment_public(item: Appointment) -> dict[str, object]:
    return {"id": item.id, "patient_id": item.patient_id, "starts_at": item.starts_at, "reason": item.reason, "status": item.status, "reminder_status": item.reminder_status}


@router.get("/appointments", tags=["clinical"])
async def list_appointments(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    records = (await session.scalars(select(Appointment).where(Appointment.organization_id == user.organization_id).order_by(Appointment.starts_at.desc()).limit(200))).all()
    return [appointment_public(item) for item in records]


@router.post("/appointments", status_code=201, tags=["clinical"])
async def create_appointment(request: AppointmentInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await owned_patient(session, request.patient_id, user.organization_id)
    conflict = await session.scalar(select(Appointment).where(Appointment.organization_id == user.organization_id, Appointment.starts_at == request.starts_at, Appointment.status.not_in(["cancelled"])))
    if conflict: raise HTTPException(status_code=409, detail="An appointment already exists at this time")
    item = Appointment(organization_id=user.organization_id, **request.model_dump()); session.add(item); await session.flush()
    session.add(ReminderJob(organization_id=user.organization_id, appointment_id=item.id, scheduled_for=item.starts_at, channel="sandbox")); item.reminder_status = "queued"
    await write_audit(session, user, "appointment.created", str(item.id)); await session.commit(); return appointment_public(item)


@router.patch("/appointments/{appointment_id}/status", tags=["clinical"])
async def update_appointment_status(appointment_id: UUID, status: str, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    item = await session.get(Appointment, appointment_id)
    if item is None or item.organization_id != user.organization_id: raise HTTPException(status_code=404, detail="Appointment not found")
    if status not in {"pending", "confirmed", "arrived", "cancelled"}: raise HTTPException(status_code=422, detail="Invalid appointment status")
    item.status = status; await write_audit(session, user, "appointment.status_updated", str(item.id)); await session.commit(); return appointment_public(item)


def note_public(note: ClinicalNote) -> dict[str, object]:
    return {"id": note.id, "patient_id": note.patient_id, "body": note.body, "ai_draft": note.ai_draft, "status": note.status, "version": note.version, "signed_at": note.signed_at, "created_at": note.created_at}


@router.post("/clinical-notes", status_code=201, tags=["clinical"])
async def create_note(request: NoteInput, user=Depends(require_roles("physician", "nurse", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await owned_patient(session, request.patient_id, user.organization_id)
    note = ClinicalNote(organization_id=user.organization_id, author_id=user.id, **request.model_dump()); session.add(note); await session.flush(); await write_audit(session, user, "clinical_note.created", str(note.id)); await session.commit(); return note_public(note)


@router.post("/clinical-notes/{note_id}/summary", tags=["clinical"])
async def generate_summary(note_id: UUID, user=Depends(require_roles("physician", "nurse", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    note = await session.get(ClinicalNote, note_id)
    if note is None or note.organization_id != user.organization_id: raise HTTPException(status_code=404, detail="Clinical note not found")
    result = await summary_provider.summarize(note.body); note.ai_draft = result.draft; await write_audit(session, user, "clinical_note.summary_generated", str(note.id)); await session.commit(); return {**note_public(note), "provider": result.provider}


@router.post("/clinical-notes/{note_id}/sign", tags=["clinical"])
async def sign_note(note_id: UUID, user=Depends(require_roles("physician", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    note = await session.get(ClinicalNote, note_id)
    if note is None or note.organization_id != user.organization_id: raise HTTPException(status_code=404, detail="Clinical note not found")
    note.status = "signed"; note.signed_at = datetime.now(timezone.utc); await write_audit(session, user, "clinical_note.signed", str(note.id)); await session.commit(); return note_public(note)


@router.post("/assistant/query", tags=["ai"])
async def assistant_query(request: RagQuestion, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await owned_patient(session, request.patient_id, user.organization_id)
    result = await rag_provider.answer(request.question); await write_audit(session, user, "assistant.queried", str(request.patient_id)); await session.commit(); return result


@router.post("/patients/{patient_id}/documents", status_code=201, tags=["documents"])
async def create_document(patient_id: UUID, request: DocumentInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await owned_patient(session, patient_id, user.organization_id)
    document = PatientDocument(organization_id=user.organization_id, patient_id=patient_id, filename=request.filename, ocr_status="processing"); session.add(document); await session.flush()
    document.extracted_text = await ocr_provider.extract(request.filename); document.ocr_status = "completed"; await write_audit(session, user, "document.ocr_completed", str(document.id)); await session.commit()
    return {"id": document.id, "filename": document.filename, "ocr_status": document.ocr_status, "extracted_text": document.extracted_text, "provider": "sandbox"}
