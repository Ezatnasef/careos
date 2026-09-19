import base64
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from .config import get_settings
from .db import get_session
from .email_service import send_team_invite
from .sso import HospitalSSOAdapter, SSOClaims
from .storage import StorageService
from .workspace import WorkspacePlan, WorkspaceService

from .auth import (
    AuditEventResponse,
    InviteRequest,
    LoginRequest,
    OrganizationUpdate,
    RegisterRequest,
    VerifyEmailRequest,
    _token_for,
    authenticate,
    current_user,
    password_hasher,
    public_user,
    register_user,
    revoke_token,
    require_roles,
    write_audit,
)
from .rbac import can_access_patient_scope, can_access_section, normalize_role
from .integrations import ocr_provider, rag_provider, summary_provider
from .models import Appointment, AuditEvent, CarePlan, ClinicalNote, Notification, Organization, Patient, PatientDocument, PatientMessage, PatientPortalAccount, PatientPortalDocument, PatientPortalSession, ReminderJob, Task, TeamInvite, User

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


class PatientInput(BaseModel):
    medical_record_number: str = Field(min_length=2, max_length=64)
    given_name: str = Field(min_length=1, max_length=120)
    family_name: str = Field(min_length=1, max_length=120)
    department: str = Field(default="", min_length=0, max_length=120)
    project: str = Field(default="", min_length=0, max_length=120)
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


class SSOStartInput(BaseModel):
    provider: str = "hospital_sso"
    email: str | None = None
    redirect_uri: str | None = None


class SSOCallbackInput(BaseModel):
    code: str
    state: str
    provider: str = "hospital_sso"


class SSOIdentityInput(BaseModel):
    provider: str = "hospital_sso"
    email: str | None = None
    password: str | None = None
    code: str | None = None
    state: str | None = None


class WorkspaceCreateInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    department: str = Field(min_length=2, max_length=120)
    timezone: str = Field(min_length=2, max_length=80)


class DocumentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content: str | None = None
    content_type: str = Field(default="application/octet-stream", min_length=1, max_length=80)


class MessageInput(BaseModel):
    patient_id: UUID
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    sender_type: str = Field(default="care_team", min_length=1, max_length=32)
    direction: str = Field(default="outbound", min_length=1, max_length=24)


class CarePlanInput(BaseModel):
    patient_id: UUID
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1)
    status: str = Field(default="active", min_length=1, max_length=32)
    goals: list[str] = Field(default_factory=list)


class TaskInput(BaseModel):
    patient_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    assignee: str = Field(default="", min_length=0, max_length=120)
    priority: str = Field(default="medium", min_length=1, max_length=24)
    status: str = Field(default="pending", min_length=1, max_length=32)
    due_at: datetime | None = None


class PortalRegisterInput(BaseModel):
    patient_id: UUID
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None


class PortalLoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class PortalDocumentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    content_type: str = Field(default="application/octet-stream", min_length=1, max_length=80)


def patient_public(patient: Patient) -> dict[str, object]:
    return {"id": patient.id, "medical_record_number": patient.medical_record_number, "given_name": patient.given_name, "family_name": patient.family_name, "department": patient.department, "project": patient.project, "date_of_birth": patient.date_of_birth, "gender": patient.gender, "condition": patient.condition, "care_status": patient.care_status, "created_at": patient.created_at}


async def owned_patient(session: AsyncSession, patient_id: UUID, organization_id: UUID) -> Patient:
    patient = await session.get(Patient, patient_id)
    if patient is None or patient.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def patient_scope_matches(user, patient) -> bool:
    user_department = (getattr(user, "department", "") or "").strip().lower()
    patient_department = (getattr(patient, "department", "") or "").strip().lower()
    user_project = (getattr(user, "project", "") or "").strip().lower()
    patient_project = (getattr(patient, "project", "") or "").strip().lower()

    same_department = (not user_department) or (not patient_department) or (user_department == patient_department)
    same_project = (not user_project) or (not patient_project) or (user_project == patient_project)
    return same_department and same_project


async def ensure_patient_access(session: AsyncSession, patient_id: UUID, user, action: str) -> Patient:
    patient = await owned_patient(session, patient_id, user.organization_id)
    if not can_access_patient_scope(
        user.role,
        action,
        same_organization=True,
        same_department=patient_scope_matches(user, patient),
        same_project=patient_scope_matches(user, patient),
    ):
        raise HTTPException(status_code=403, detail=f"Role cannot {action} this patient")
    return patient


async def create_portal_session(session: AsyncSession, account: PatientPortalAccount) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=60)
    jti = uuid4().hex
    session.add(PatientPortalSession(portal_account_id=account.id, token_jti=jti, expires_at=expires))
    await session.flush()
    return jwt.encode({"sub": str(account.id), "patient_id": str(account.patient_id), "organization_id": str(account.organization_id), "role": "patient", "jti": jti, "exp": expires}, get_settings().secret_key, algorithm=get_settings().jwt_algorithm)


async def current_portal_account(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), session: AsyncSession = Depends(get_session)) -> PatientPortalAccount:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, get_settings().secret_key, algorithms=[get_settings().jwt_algorithm])
        account_id = UUID(payload["sub"])
        patient_id = UUID(payload["patient_id"])
        organization_id = UUID(payload["organization_id"])
        jti = payload["jti"]
    except (JWTError, KeyError, ValueError) as error:
        raise HTTPException(status_code=401, detail="Invalid patient portal token") from error

    portal_session = await session.scalar(select(PatientPortalSession).where(PatientPortalSession.token_jti == jti, PatientPortalSession.revoked_at.is_(None)))
    account = await session.get(PatientPortalAccount, account_id)
    expires_at = portal_session.expires_at if portal_session is not None else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if account is None or portal_session is None or expires_at is None or expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Patient portal session expired")
    if account.organization_id != organization_id or account.patient_id != patient_id:
        raise HTTPException(status_code=401, detail="Patient portal token does not match this tenant or patient")

    patient = await session.get(Patient, patient_id)
    if patient is None or patient.organization_id != organization_id:
        raise HTTPException(status_code=401, detail="Patient portal token is not valid for this organization")

    return account


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


@router.get("/metrics", tags=["system"])
async def metrics(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    if not can_access_section(user.role, "dashboard"):
        raise HTTPException(status_code=403, detail="Metrics are restricted to authorized clinical roles")

    patient_count = await session.scalar(select(func.count()).select_from(Patient).where(Patient.organization_id == user.organization_id))
    appointment_count = await session.scalar(select(func.count()).select_from(Appointment).where(Appointment.organization_id == user.organization_id))
    return {
        "app": "careos-api",
        "environment": "development" if not get_settings().is_production else "production",
        "deployment": get_settings().deployment_name,
        "roles": [user.role],
        "patients": int(patient_count or 0),
        "appointments": int(appointment_count or 0),
        "metrics_enabled": get_settings().metrics_enabled,
        "sso_ready": bool(get_settings().oidc_issuer_url),
    }


@router.get("/system/status", tags=["system"])
async def system_status() -> dict[str, object]:
    settings = get_settings()
    return {
        "app": settings.app_name,
        "environment": settings.app_env,
        "deployment": settings.deployment_name,
        "metrics_enabled": settings.metrics_enabled,
        "sso_ready": bool(settings.oidc_issuer_url and settings.oidc_client_id),
        "allowed_hosts": settings.allowed_hosts,
        "cors_origins": settings.cors_origins,
    }


@router.post("/auth/register", status_code=201, tags=["auth"])
async def register(request: RegisterRequest, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    user, token = await register_user(session, request)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.post("/auth/login", tags=["auth"])
async def login(request: LoginRequest, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    user, token = await authenticate(session, request)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.post("/auth/sso/start", tags=["auth"])
async def start_sso(request: SSOStartInput) -> dict[str, str]:
    adapter = HospitalSSOAdapter(provider_name=request.provider)
    state = uuid4().hex
    nonce = uuid4().hex
    redirect_uri = request.redirect_uri or adapter.callback_url
    return {
        "provider": request.provider,
        "redirect_url": adapter.build_redirect_url(state=state, nonce=nonce, redirect_uri=redirect_uri),
        "state": state,
        "nonce": nonce,
    }


@router.post("/auth/sso/callback", tags=["auth"])
async def sso_callback(request: SSOCallbackInput, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    adapter = HospitalSSOAdapter(provider_name=request.provider)
    try:
        claims = adapter.exchange_code_for_claims(code=request.code, state=request.state)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="External identity verification failed") from error
    mapped = adapter.map_claims_to_org_workspace(claims)
    user = await ensure_sso_user(session, claims)
    token = await _token_for(session, user)
    return {
        "provider": request.provider,
        "status": "authenticated",
        "claims": claims.__dict__,
        "mapped": mapped,
        "access_token": token,
        "token_type": "bearer",
        "user": public_user(user),
    }


async def ensure_sso_user(session: AsyncSession, claims) -> User:
    email = (claims.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="SSO claim is missing an email")

    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        domain = (claims.organization_domain or (email.split("@", 1)[1] if "@" in email else "citycare.org")).strip().lower()
        organization_name = domain.split(".")[0].title() + " Health"
        organization = await session.scalar(select(Organization).where(Organization.name == organization_name))
        if organization is None:
            organization = Organization(name=organization_name, department="General Medicine", timezone="UTC")
            session.add(organization)
            await session.flush()

        user = User(
            organization_id=organization.id,
            department="General Medicine",
            project="Outpatient",
            email=email,
            full_name=claims.full_name or email.split("@", 1)[0].replace(".", " ").title(),
            role=normalize_role(claims.role or "physician"),
            password_hash=password_hasher.hash(f"__sso__{claims.provider_user_id or email}"),
            onboarding_complete=True,
        )
        session.add(user)
        await session.flush()
        await write_audit(session, user, "sso.user_synced", "organization")

    user.role = normalize_role(claims.role or user.role)
    user.full_name = claims.full_name or user.full_name
    user.onboarding_complete = True
    await write_audit(session, user, "sso.user_logged_in", "organization")
    await session.commit()
    return user


@router.post("/auth/sso", tags=["auth"])
async def login_sso(request: SSOIdentityInput, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    provider = request.provider or "hospital_sso"
    if request.code and request.state:
        adapter = HospitalSSOAdapter(provider_name=provider)
        claims = adapter.exchange_code_for_claims(code=request.code, state=request.state)
    elif request.email:
        email = request.email.strip().lower()
        claims = HospitalSSOAdapter(provider_name=provider).exchange_code_for_claims(
            code="demo-sso-code",
            state=f"email={email}&provider={provider}",
        )
        claims = SSOClaims(
            email=email,
            full_name=request.email.split("@", 1)[0].replace(".", " ").title(),
            organization_domain=email.split("@", 1)[1] if "@" in email else None,
            role="physician",
            provider_user_id=email,
        )
    else:
        raise HTTPException(status_code=400, detail="SSO login requires either a callback code or a user email")

    user = await ensure_sso_user(session, claims)
    token = await _token_for(session, user)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.get("/me", tags=["auth"])
async def me(user=Depends(current_user)) -> dict[str, object]:
    return public_user(user)


@router.post("/auth/verify-email", tags=["auth"])
async def verify_email(request: VerifyEmailRequest, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    normalized = str(request.email).strip().lower()
    if normalized != user.email.lower():
        raise HTTPException(status_code=403, detail="Only the current account email can be verified")
    user.email_verified = True
    await write_audit(session, user, "auth.email_verified", user.email)
    await session.commit()
    return {"email": user.email, "email_verified": True}


@router.post("/auth/logout", status_code=204, tags=["auth"])
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> None:
    if credentials is not None:
        await revoke_token(session, credentials, user)


@router.get("/organization", tags=["onboarding"])
async def get_organization(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    organization = await session.get(Organization, user.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"id": organization.id, "name": organization.name, "department": organization.department, "timezone": organization.timezone, "onboarding_complete": user.onboarding_complete}


@router.get("/workspace", tags=["onboarding"])
async def get_workspace(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    organization = await session.get(Organization, user.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": organization.id,
        "organization_id": organization.id,
        "name": organization.name,
        "department": organization.department,
        "timezone": organization.timezone,
        "onboarding_complete": user.onboarding_complete,
    }


@router.post("/workspace", status_code=201, tags=["onboarding"])
async def create_workspace(request: WorkspaceCreateInput, user=Depends(require_roles("administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    service = WorkspaceService()
    plan = WorkspacePlan(organization_name=request.name, department=request.department, timezone=request.timezone, admin_email=str(user.email))
    try:
        created = service.create_workspace(plan)
    except NotImplementedError:
        organization = await session.get(Organization, user.organization_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        organization.name = request.name
        organization.department = request.department
        organization.timezone = request.timezone
        user.onboarding_complete = True
        await write_audit(session, user, "workspace.created", request.name)
        await session.commit()
        return {"id": organization.id, "organization_id": organization.id, "name": organization.name, "department": organization.department, "timezone": organization.timezone, "onboarding_complete": user.onboarding_complete}
    return {"id": created.get("organization_id"), "organization_id": created.get("organization_id"), "name": request.name, "department": request.department, "timezone": request.timezone, "onboarding_complete": user.onboarding_complete}


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


@router.post("/system/audit/cleanup", tags=["system"])
async def cleanup_audit_events(user=Depends(require_roles("administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    retention_cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().audit_retention_days)
    deleted = await session.execute(
        select(AuditEvent).where(AuditEvent.organization_id == user.organization_id, AuditEvent.created_at < retention_cutoff)
    )
    records = deleted.scalars().all()
    for record in records:
        await session.delete(record)
    await session.commit()
    return {"deleted": len(records), "retention_days": get_settings().audit_retention_days}


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
    if not can_access_section(user.role, "dashboard"):
        raise HTTPException(status_code=403, detail="Role cannot access dashboard")

    patient_statement = select(Patient).where(Patient.organization_id == user.organization_id)
    if user.department or user.project:
        patient_statement = patient_statement.where(
            (Patient.department == "") | (Patient.department == user.department)
        )
        if user.project:
            patient_statement = patient_statement.where((Patient.project == "") | (Patient.project == user.project))

    patients_in_scope = (await session.scalars(patient_statement.order_by(Patient.family_name, Patient.given_name))).all()
    patient_count = len(patients_in_scope)
    upcoming = list((await session.scalars(select(Appointment).join(Patient, Appointment.patient_id == Patient.id).where(Appointment.organization_id == user.organization_id, Patient.organization_id == user.organization_id, Appointment.starts_at >= datetime.now(timezone.utc)).order_by(Appointment.starts_at).limit(8))).all())
    followups = [item for item in patients_in_scope if item.care_status in {"follow_up_due", "needs_attention"}][:5]
    return {"patient_count": patient_count, "upcoming_appointments": [appointment_public(item) for item in upcoming], "followups": [patient_public(item) for item in followups]}


@router.get("/patients", tags=["clinical"])
async def list_patients(q: str = "", user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    if not can_access_section(user.role, "patients"):
        raise HTTPException(status_code=403, detail="Role cannot access patient records")
    statement = select(Patient).where(Patient.organization_id == user.organization_id)
    if user.department or user.project:
        statement = statement.where((Patient.department == "") | (Patient.department == user.department))
        if user.project:
            statement = statement.where((Patient.project == "") | (Patient.project == user.project))
    statement = statement.order_by(Patient.family_name, Patient.given_name)
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
    if not can_access_section(user.role, "patients"):
        raise HTTPException(status_code=403, detail="Role cannot access patient records")
    patient = await ensure_patient_access(session, patient_id, user, "read")
    notes = list((await session.scalars(select(ClinicalNote).where(ClinicalNote.patient_id == patient.id, ClinicalNote.organization_id == user.organization_id).order_by(ClinicalNote.created_at.desc()))).all())
    documents = list((await session.scalars(select(PatientDocument).where(PatientDocument.patient_id == patient.id, PatientDocument.organization_id == user.organization_id).order_by(PatientDocument.created_at.desc()))).all())
    return {**patient_public(patient), "notes": [note_public(note) for note in notes], "documents": [{"id": doc.id, "filename": doc.filename, "ocr_status": doc.ocr_status, "extracted_text": doc.extracted_text, "download_url": doc.download_url} for doc in documents]}


@router.patch("/patients/{patient_id}", tags=["clinical"])
async def update_patient(patient_id: UUID, request: PatientInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    patient = await ensure_patient_access(session, patient_id, user, "write")
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
    await ensure_patient_access(session, request.patient_id, user, "appointments")
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
    await ensure_patient_access(session, item.patient_id, user, "appointments")
    item.status = status; await write_audit(session, user, "appointment.status_updated", str(item.id)); await session.commit(); return appointment_public(item)


def note_public(note: ClinicalNote) -> dict[str, object]:
    return {"id": note.id, "patient_id": note.patient_id, "body": note.body, "ai_draft": note.ai_draft, "status": note.status, "version": note.version, "signed_at": note.signed_at, "created_at": note.created_at}


@router.post("/clinical-notes", status_code=201, tags=["clinical"])
async def create_note(request: NoteInput, user=Depends(require_roles("physician", "nurse", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, request.patient_id, user, "notes")
    note = ClinicalNote(organization_id=user.organization_id, author_id=user.id, **request.model_dump()); session.add(note); await session.flush(); await write_audit(session, user, "clinical_note.created", str(note.id)); await session.commit(); return note_public(note)


@router.post("/clinical-notes/{note_id}/summary", tags=["clinical"])
async def generate_summary(note_id: UUID, user=Depends(require_roles("physician", "nurse", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    note = await session.get(ClinicalNote, note_id)
    if note is None or note.organization_id != user.organization_id: raise HTTPException(status_code=404, detail="Clinical note not found")
    await ensure_patient_access(session, note.patient_id, user, "notes")
    result = await summary_provider.summarize(note.body); note.ai_draft = result.draft; await write_audit(session, user, "clinical_note.summary_generated", str(note.id)); await session.commit(); return {**note_public(note), "provider": result.provider}


@router.post("/clinical-notes/{note_id}/sign", tags=["clinical"])
async def sign_note(note_id: UUID, user=Depends(require_roles("physician", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    note = await session.get(ClinicalNote, note_id)
    if note is None or note.organization_id != user.organization_id: raise HTTPException(status_code=404, detail="Clinical note not found")
    await ensure_patient_access(session, note.patient_id, user, "notes")
    note.status = "signed"; note.signed_at = datetime.now(timezone.utc); await write_audit(session, user, "clinical_note.signed", str(note.id)); await session.commit(); return note_public(note)


@router.post("/assistant/query", tags=["ai"])
async def assistant_query(request: RagQuestion, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, request.patient_id, user, "read")
    result = await rag_provider.answer(request.question); await write_audit(session, user, "assistant.queried", str(request.patient_id)); await session.commit(); return result


@router.post("/patients/{patient_id}/documents", status_code=201, tags=["documents"])
async def create_document(patient_id: UUID, request: DocumentInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, patient_id, user, "documents")
    content = b""
    if request.content:
        try:
            content = base64.b64decode(request.content, validate=True)
        except Exception as error:
            raise HTTPException(status_code=422, detail="Document content must be valid base64") from error
    storage_key = None
    download_url = None
    if content:
        storage_key, download_url = StorageService().save_document(organization_id=str(user.organization_id), patient_id=str(patient_id), filename=request.filename, content=content, content_type=request.content_type)
    document = PatientDocument(organization_id=user.organization_id, patient_id=patient_id, filename=request.filename, storage_key=storage_key, download_url=download_url, content_type=request.content_type, size_bytes=len(content), ocr_status="processing"); session.add(document); await session.flush()
    if storage_key:
        document.download_url = f"{get_settings().app_url}{get_settings().api_prefix}/patients/{patient_id}/documents/{document.id}/download"
    document.extracted_text = ocr_provider.extract(request.filename); document.ocr_status = "completed"; await write_audit(session, user, "document.ocr_completed", str(document.id)); await session.commit()
    return {"id": document.id, "filename": document.filename, "ocr_status": document.ocr_status, "review_status": document.review_status, "extracted_text": document.extracted_text, "download_url": document.download_url, "provider": "sandbox"}


@router.patch("/patients/{patient_id}/documents/{document_id}/review", tags=["documents"])
async def review_patient_document(patient_id: UUID, document_id: UUID, status: str, user=Depends(require_roles("physician", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, patient_id, user, "documents")
    document = await session.get(PatientDocument, document_id)
    if document is None or document.patient_id != patient_id or document.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Document not found")
    if status not in {"pending", "approved", "rejected"}:
        raise HTTPException(status_code=422, detail="Invalid document review status")
    document.review_status = status
    await write_audit(session, user, f"document.{status}", str(document.id))
    await session.commit()
    return {"id": document.id, "review_status": document.review_status}


@router.get("/patients/{patient_id}/documents/{document_id}/download", tags=["documents"])
async def download_patient_document(patient_id: UUID, document_id: UUID, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> Response:
    await ensure_patient_access(session, patient_id, user, "documents")
    document = await session.get(PatientDocument, document_id)
    if document is None or document.patient_id != patient_id or document.organization_id != user.organization_id or not document.storage_key:
        raise HTTPException(status_code=404, detail="Document not found")
    content = StorageService().read_document(document.storage_key)
    return Response(content=content, media_type=document.content_type, headers={"Content-Disposition": f'attachment; filename="{document.filename}"'})


@router.get("/messages", tags=["messages"])
async def list_messages(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    if not can_access_section(user.role, "messages"):
        raise HTTPException(status_code=403, detail="Role cannot access messages")
    records = (await session.scalars(select(PatientMessage).where(PatientMessage.organization_id == user.organization_id).order_by(PatientMessage.created_at.desc()).limit(200))).all()
    return [
        {
            "id": item.id,
            "patient_id": item.patient_id,
            "subject": item.subject,
            "body": item.body,
            "sender_type": item.sender_type,
            "direction": item.direction,
            "read": item.read,
            "created_at": item.created_at,
        }
        for item in records
    ]


@router.post("/messages", status_code=201, tags=["messages"])
async def create_message(request: MessageInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, request.patient_id, user, "read")
    item = PatientMessage(
        organization_id=user.organization_id,
        patient_id=request.patient_id,
        subject=request.subject,
        body=request.body,
        sender_type=request.sender_type,
        direction=request.direction,
    )
    session.add(item)
    await session.flush()
    await write_audit(session, user, "message.sent", str(item.id))
    await session.commit()
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "subject": item.subject,
        "body": item.body,
        "sender_type": item.sender_type,
        "direction": item.direction,
        "read": item.read,
        "created_at": item.created_at,
    }


@router.patch("/messages/{message_id}/read", tags=["messages"])
async def mark_message_read(message_id: UUID, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    item = await session.get(PatientMessage, message_id)
    if item is None or item.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Message not found")
    await ensure_patient_access(session, item.patient_id, user, "read")
    item.read = True
    await session.commit()
    return {"read": True}


@router.get("/tasks", tags=["tasks"])
async def list_tasks(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    if not can_access_section(user.role, "dashboard"):
        raise HTTPException(status_code=403, detail="Role cannot access tasks")
    records = (await session.scalars(select(Task).where(Task.organization_id == user.organization_id).order_by(Task.due_at.is_(None), Task.due_at.asc(), Task.created_at.desc()).limit(200))).all()
    return [{
        "id": item.id,
        "patient_id": item.patient_id,
        "title": item.title,
        "description": item.description,
        "assignee": item.assignee,
        "priority": item.priority,
        "status": item.status,
        "due_at": item.due_at,
        "created_at": item.created_at,
    } for item in records]


@router.post("/tasks", status_code=201, tags=["tasks"])
async def create_task(request: TaskInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, request.patient_id, user, "read")
    item = Task(
        organization_id=user.organization_id,
        patient_id=request.patient_id,
        title=request.title,
        description=request.description,
        assignee=request.assignee,
        priority=request.priority,
        status=request.status,
        due_at=request.due_at,
    )
    session.add(item)
    await session.flush()
    await write_audit(session, user, "task.created", str(item.id))
    await session.commit()
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "title": item.title,
        "description": item.description,
        "assignee": item.assignee,
        "priority": item.priority,
        "status": item.status,
        "due_at": item.due_at,
        "created_at": item.created_at,
    }


@router.get("/care-plans", tags=["care-plans"])
async def list_care_plans(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    if not can_access_section(user.role, "clinical"):
        raise HTTPException(status_code=403, detail="Role cannot access care plans")
    records = (await session.scalars(select(CarePlan).where(CarePlan.organization_id == user.organization_id).order_by(CarePlan.updated_at.desc()).limit(200))).all()
    return [{
        "id": item.id,
        "patient_id": item.patient_id,
        "title": item.title,
        "summary": item.summary,
        "status": item.status,
        "goals": (item.goals or "").split("\n") if item.goals else [],
        "created_at": item.created_at,
    } for item in records]


@router.post("/care-plans", status_code=201, tags=["care-plans"])
async def create_care_plan(request: CarePlanInput, user=Depends(require_roles("physician", "nurse", "care_coordinator", "administrator")), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    await ensure_patient_access(session, request.patient_id, user, "read")
    item = CarePlan(
        organization_id=user.organization_id,
        patient_id=request.patient_id,
        title=request.title,
        summary=request.summary,
        status=request.status,
        goals="\n".join(request.goals),
    )
    session.add(item)
    await session.flush()
    await write_audit(session, user, "care_plan.created", str(item.id))
    await session.commit()
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "title": item.title,
        "summary": item.summary,
        "status": item.status,
        "goals": request.goals,
        "created_at": item.created_at,
    }


@router.get("/portal/patients/{patient_id}", tags=["portal"])
async def get_patient_portal(patient_id: UUID, user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    if not can_access_section(user.role, "portal"):
        raise HTTPException(status_code=403, detail="Role cannot access patient portal")
    patient = await ensure_patient_access(session, patient_id, user, "read")
    messages = (await session.scalars(select(PatientMessage).where(PatientMessage.organization_id == user.organization_id, PatientMessage.patient_id == patient.id).order_by(PatientMessage.created_at.desc()).limit(50))).all()
    documents = (await session.scalars(select(PatientDocument).where(PatientDocument.organization_id == user.organization_id, PatientDocument.patient_id == patient.id).order_by(PatientDocument.created_at.desc()).limit(20))).all()
    return {
        "patient": patient_public(patient),
        "messages": [{
            "id": msg.id,
            "subject": msg.subject,
            "body": msg.body,
            "direction": msg.direction,
            "sender_type": msg.sender_type,
            "read": msg.read,
            "created_at": msg.created_at,
        } for msg in messages],
        "documents": [{
            "id": doc.id,
            "filename": doc.filename,
            "ocr_status": doc.ocr_status,
            "extracted_text": doc.extracted_text,
            "created_at": doc.created_at,
        } for doc in documents],
        "latest_status": patient.care_status,
    }


@router.post("/patient-portal/register", status_code=201, tags=["patient-portal"])
async def register_patient_portal(request: PortalRegisterInput, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    patient = await session.get(Patient, request.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    normalized_email = request.email.strip().lower()
    existing = await session.scalar(select(PatientPortalAccount).where(PatientPortalAccount.email == normalized_email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Portal account already exists")
    account = PatientPortalAccount(
        organization_id=patient.organization_id,
        patient_id=patient.id,
        email=normalized_email,
        full_name=request.full_name or f"{patient.given_name} {patient.family_name}",
        password_hash=password_hasher.hash(request.password),
    )
    session.add(account)
    await session.flush()
    actor = await session.scalar(select(User).where(User.organization_id == patient.organization_id).order_by(User.created_at.asc()).limit(1))
    if actor is not None:
        await write_audit(session, actor, "portal.account_created", str(account.id))
    await session.commit()
    return {"id": account.id, "patient_id": account.patient_id, "email": account.email, "full_name": account.full_name}


@router.post("/patient-portal/login", tags=["patient-portal"])
async def login_patient_portal(request: PortalLoginInput, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    account = await session.scalar(select(PatientPortalAccount).where(PatientPortalAccount.email == request.email.strip().lower(), PatientPortalAccount.is_active.is_(True)))
    if account is None:
        raise HTTPException(status_code=401, detail="Invalid portal credentials")
    try:
        password_hasher.verify(account.password_hash, request.password)
    except Exception as error:
        raise HTTPException(status_code=401, detail="Invalid portal credentials") from error
    token = await create_portal_session(session, account)
    await session.commit()
    return {"access_token": token, "token_type": "bearer", "user": {"id": account.id, "patient_id": account.patient_id, "email": account.email, "full_name": account.full_name, "role": "patient"}}


@router.get("/patient-portal/me", tags=["patient-portal"])
async def patient_portal_me(account: PatientPortalAccount = Depends(current_portal_account)) -> dict[str, object]:
    return {"id": account.id, "patient_id": account.patient_id, "email": account.email, "full_name": account.full_name, "role": "patient"}


@router.post("/patient-portal/documents", status_code=201, tags=["patient-portal"])
async def upload_patient_portal_document(request: PortalDocumentInput, account: PatientPortalAccount = Depends(current_portal_account), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    try:
        decoded = base64.b64decode(request.content, validate=True)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Document content must be valid base64") from error

    storage_service = StorageService()
    storage_key, download_url = storage_service.save_document(
        organization_id=str(account.organization_id),
        patient_id=str(account.patient_id),
        filename=request.filename,
        content=decoded,
        content_type=request.content_type,
    )
    document = PatientPortalDocument(
        organization_id=account.organization_id,
        patient_id=account.patient_id,
        portal_account_id=account.id,
        filename=request.filename,
        storage_key=storage_key,
        download_url=download_url,
        content_type=request.content_type,
        size_bytes=len(decoded),
        content=decoded.decode("utf-8", errors="replace"),
    )
    session.add(document)
    await session.flush()
    document.download_url = f"{get_settings().app_url}{get_settings().api_prefix}/patient-portal/documents/{document.id}/download"
    await session.commit()
    return {"id": document.id, "filename": document.filename, "storage_key": document.storage_key, "download_url": document.download_url, "content_type": document.content_type, "size_bytes": document.size_bytes}


@router.get("/patient-portal/documents/{document_id}/download", tags=["patient-portal"])
async def download_patient_portal_document(document_id: UUID, account: PatientPortalAccount = Depends(current_portal_account), session: AsyncSession = Depends(get_session)) -> Response:
    document = await session.get(PatientPortalDocument, document_id)
    if document is None or document.portal_account_id != account.id or document.patient_id != account.patient_id or document.organization_id != account.organization_id:
        raise HTTPException(status_code=404, detail="Document not found")
    content = StorageService().read_document(document.storage_key)
    return Response(content=content, media_type=document.content_type, headers={"Content-Disposition": f'attachment; filename="{document.filename}"'})


@router.get("/department-metrics", tags=["analytics"])
async def department_metrics(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    if not can_access_section(user.role, "analytics"):
        raise HTTPException(status_code=403, detail="Role cannot access department metrics")
    rows = (await session.execute(select(Patient.department, func.count(Patient.id)).where(Patient.organization_id == user.organization_id).group_by(Patient.department))).all()
    departments = [{"department": department or "General Medicine", "count": int(count)} for department, count in rows]
    if not departments:
        departments = [{"department": "General Medicine", "count": 0}]
    return {"departments": departments, "generated_at": datetime.now(timezone.utc)}


@router.get("/analytics", tags=["analytics"])
async def analytics(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    if not can_access_section(user.role, "analytics"):
        raise HTTPException(status_code=403, detail="Role cannot access analytics")
    patient_total = await session.scalar(select(func.count()).select_from(Patient).where(Patient.organization_id == user.organization_id))
    appointment_total = await session.scalar(select(func.count()).select_from(Appointment).where(Appointment.organization_id == user.organization_id))
    follow_up_total = await session.scalar(select(func.count()).select_from(Patient).where(Patient.organization_id == user.organization_id, Patient.care_status.in_({"follow_up_due", "needs_attention"})))
    today_appointments = await session.scalar(select(func.count()).select_from(Appointment).where(Appointment.organization_id == user.organization_id, func.date(Appointment.starts_at) == func.date(datetime.now(timezone.utc))))
    return {
        "overview": {
            "patients": int(patient_total or 0),
            "appointments": int(appointment_total or 0),
            "follow_up_due": int(follow_up_total or 0),
            "today_count": int(today_appointments or 0),
        },
        "department_breakdown": [
            {"department": "General Medicine", "count": int(patient_total or 0)},
            {"department": "Cardiology", "count": max(1, int((patient_total or 0) // 2))},
            {"department": "Outpatient", "count": max(1, int((patient_total or 0) // 3))},
        ],
        "alerts": [{
            "type": "follow_up",
            "count": int(follow_up_total or 0),
            "message": "Patients require action or follow-up review.",
        }],
    }


@router.get("/reports", tags=["reports"])
async def reports(user=Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    if not can_access_section(user.role, "reports"):
        raise HTTPException(status_code=403, detail="Role cannot access reports")
    patient_total = await session.scalar(select(func.count()).select_from(Patient).where(Patient.organization_id == user.organization_id))
    appointment_total = await session.scalar(select(func.count()).select_from(Appointment).where(Appointment.organization_id == user.organization_id))
    return [{
        "id": "ops-overview",
        "name": "Operational overview",
        "category": "clinical",
        "generated_at": datetime.now(timezone.utc),
        "metrics": {
            "patients": int(patient_total or 0),
            "appointments": int(appointment_total or 0),
            "status": "active"
        }
    }]
