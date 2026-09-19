import asyncio
from collections.abc import AsyncIterator
from datetime import date

from argon2 import PasswordHasher
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from .config import get_settings
from .models import Base, Organization, Patient, User

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_kwargs = {"pool_pre_ping": True, "future": True}
if settings.database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["poolclass"] = StaticPool

engine = create_async_engine(settings.database_url, **engine_kwargs)
session_factory = async_sessionmaker(engine, expire_on_commit=False)
_schema_ready = False
_schema_lock = asyncio.Lock()


async def _seed_development_account() -> None:
    if settings.is_production:
        return

    async with session_factory() as session:
        existing = await session.scalar(select(User).where(User.email == "dr.rana@citycare.org"))
        if existing is not None:
            return

        organization = await session.scalar(select(Organization).where(Organization.name == "CityCare"))
        if organization is None:
            organization = Organization(name="CityCare", department="General Medicine", timezone="UTC")
            session.add(organization)
            await session.flush()

        password_hash = PasswordHasher().hash("password123")
        doc = User(
            organization_id=organization.id,
            department="General Medicine",
            project="Outpatient",
            email="dr.rana@citycare.org",
            full_name="Dr. Rana Samir",
            role="doctor",
            password_hash=password_hash,
            onboarding_complete=True,
        )
        session.add(doc)
        await session.flush()

        session.add_all([
            Patient(
                organization_id=organization.id,
                department="General Medicine",
                project="Outpatient",
                medical_record_number="CITY-1001",
                given_name="Mariam",
                family_name="Hassan",
                date_of_birth=date(1982, 5, 12),
                gender="female",
                condition="Hypertension follow-up",
                care_status="follow_up_due",
            ),
            Patient(
                organization_id=organization.id,
                department="General Medicine",
                project="Outpatient",
                medical_record_number="CITY-1002",
                given_name="Omar",
                family_name="Khaled",
                date_of_birth=date(1995, 8, 3),
                gender="male",
                condition="Type 2 Diabetes",
                care_status="stable",
            ),
        ])
        await session.commit()


async def init_db() -> None:
    global _schema_ready
    async with _schema_lock:
        if _schema_ready:
            return
        await _initialize_schema()
        await _seed_development_account()
        _schema_ready = True


async def _initialize_schema() -> None:
    if settings.database_url.startswith("sqlite") and settings.app_env.lower() in {"development", "test"}:
        await engine.dispose()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    if not _schema_ready:
        await init_db()
    async with session_factory() as session:
        yield session
