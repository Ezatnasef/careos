import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import BACKEND_ROOT, DEFAULT_DB_PATH, get_settings
from .models import Base

settings = get_settings()
E2E_DATABASE_DIRECTORY = BACKEND_ROOT / ".e2e-databases"
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_kwargs = {"pool_pre_ping": True, "future": True}
if settings.database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.database_url, **engine_kwargs)
session_factory = async_sessionmaker(engine, expire_on_commit=False)
_schema_ready = False
_schema_lock = asyncio.Lock()

# ── Booking concurrency lock ──────────────────────────────────────────────────
# One asyncio.Lock per organisation serialises the read-validate-insert sequence
# in create_appointment / update_appointment within a single process/event-loop.
# On PostgreSQL a SELECT … FOR UPDATE in _validate_appointment_conflict provides
# additional defence-in-depth for multi-worker deployments.
_booking_locks: dict[str, asyncio.Lock] = {}


def get_booking_lock(organization_id: object) -> asyncio.Lock:
    """Return (creating lazily) the booking lock for *organization_id*.

    The lock must be acquired before the conflict-check query and held until
    after session.commit() to eliminate the TOCTOU window.
    """
    key = str(organization_id)
    if key not in _booking_locks:
        _booking_locks[key] = asyncio.Lock()
    return _booking_locks[key]


async def init_db() -> None:
    global _schema_ready
    async with _schema_lock:
        if _schema_ready:
            return
        await _initialize_schema()
        _schema_ready = True


async def _initialize_schema() -> None:
    if settings.database_url.startswith("sqlite") and settings.app_env.lower() == "test":
        _validate_test_database_path()
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
        return
    if settings.database_url.startswith("sqlite") and settings.app_env.lower() == "development":
        await engine.dispose()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


def _validate_test_database_path() -> None:
    configured_path = engine.url.database
    if not configured_path:
        raise RuntimeError("Test database must use a file inside backend/.e2e-databases")

    database_path = Path(configured_path).expanduser().resolve(strict=False)
    development_database_path = DEFAULT_DB_PATH.resolve(strict=False)
    matches_development_database = database_path == development_database_path
    if not matches_development_database and database_path.exists() and development_database_path.exists():
        matches_development_database = database_path.samefile(development_database_path)
    if matches_development_database:
        raise RuntimeError("Refusing to reset the development database in test mode")

    backend_root = BACKEND_ROOT.resolve(strict=False)
    if E2E_DATABASE_DIRECTORY.is_symlink():
        raise RuntimeError("Refusing to use a symlink as the E2E database directory")
    allowed_directory = E2E_DATABASE_DIRECTORY.resolve(strict=False)
    if allowed_directory.parent != backend_root or not allowed_directory.is_dir():
        raise RuntimeError("E2E database directory must be a real directory under backend/")
    if database_path.parent != allowed_directory:
        raise RuntimeError("Test database must be directly inside backend/.e2e-databases")
    if database_path.exists():
        raise RuntimeError("Refusing to reset an existing test database; use a new E2E database path")


async def get_session() -> AsyncIterator[AsyncSession]:
    if not _schema_ready:
        await init_db()
    async with session_factory() as session:
        yield session
