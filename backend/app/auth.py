from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

from argon2 import PasswordHasher
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session
from .models import AuthSession, AuditEvent, Organization, Patient, User

settings = get_settings()
password_hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=120)
    organization_name: str = Field(min_length=2, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OrganizationUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    department: str = Field(min_length=2, max_length=120)
    timezone: str = Field(min_length=2, max_length=80)


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(physician|nurse|care_coordinator|administrator)$")


class AuditEventResponse(BaseModel):
    id: UUID
    organization_id: UUID
    actor_id: UUID
    action: str
    resource: str
    created_at: datetime

    model_config = {"from_attributes": True}


def public_user(user: User) -> dict[str, object]:
    return {"id": user.id, "organization_id": user.organization_id, "email": user.email, "full_name": user.full_name, "role": user.role, "onboarding_complete": user.onboarding_complete}


async def _token_for(session: AsyncSession, user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    jti = uuid4().hex
    session.add(AuthSession(user_id=user.id, token_jti=jti, expires_at=expires))
    await session.flush()
    return jwt.encode({"sub": str(user.id), "organization_id": str(user.organization_id), "role": user.role, "jti": jti, "exp": expires}, settings.secret_key, algorithm=settings.jwt_algorithm)


async def write_audit(session: AsyncSession, user: User, action: str, resource: str) -> None:
    session.add(AuditEvent(organization_id=user.organization_id, actor_id=user.id, action=action, resource=resource))


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), session: AsyncSession = Depends(get_session)) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id = UUID(payload["sub"])
        jti = payload["jti"]
    except (JWTError, KeyError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from error
    auth_session = await session.scalar(select(AuthSession).where(AuthSession.token_jti == jti, AuthSession.revoked_at.is_(None)))
    user = await session.get(User, user_id)
    if user is None or auth_session is None or auth_session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_roles(*roles: str):
    async def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency


async def register_user(session: AsyncSession, request: RegisterRequest) -> tuple[User, str]:
    existing = await session.scalar(select(User).where(User.email == str(request.email).lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email is already registered")
    organization = Organization(name=request.organization_name, timezone="UTC")
    session.add(organization)
    await session.flush()
    user = User(id=uuid4(), organization_id=organization.id, email=str(request.email).lower(), full_name=request.full_name, role="administrator", password_hash=password_hasher.hash(request.password))
    session.add(user)
    await session.flush()
    # Synthetic records make a newly created development workspace demonstrable.
    # They are intentionally created only at registration, never from real patient data.
    session.add_all([
        Patient(organization_id=organization.id, medical_record_number="DEMO-1001", given_name="Mariam", family_name="Hassan", date_of_birth=date(1982, 5, 12), gender="Female", condition="Hypertension", care_status="follow_up_due"),
        Patient(organization_id=organization.id, medical_record_number="DEMO-1002", given_name="Omar", family_name="Khaled", date_of_birth=date(1995, 8, 3), gender="Male", condition="Type 2 Diabetes", care_status="stable"),
    ])
    await write_audit(session, user, "organization.created", request.organization_name)
    token = await _token_for(session, user)
    await session.commit()
    return user, token


async def authenticate(session: AsyncSession, request: LoginRequest) -> tuple[User, str]:
    user = await session.scalar(select(User).where(User.email == str(request.email).lower()))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    try:
        password_hasher.verify(user.password_hash, request.password)
    except Exception as error:
        raise HTTPException(status_code=401, detail="Invalid email or password") from error
    await write_audit(session, user, "auth.signed_in", "workspace")
    token = await _token_for(session, user)
    await session.commit()
    return user, token


async def revoke_token(session: AsyncSession, credentials: HTTPAuthorizationCredentials, user: User) -> None:
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm])
        auth_session = await session.scalar(select(AuthSession).where(AuthSession.token_jti == payload["jti"], AuthSession.user_id == user.id))
    except (JWTError, KeyError):
        auth_session = None
    if auth_session is not None:
        auth_session.revoked_at = datetime.now(timezone.utc)
        await write_audit(session, user, "auth.signed_out", "workspace")
        await session.commit()
