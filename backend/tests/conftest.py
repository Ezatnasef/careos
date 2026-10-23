import asyncio
import inspect
import os
import tempfile
from pathlib import Path
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
test_database_directory = Path(__file__).resolve().parents[1] / ".e2e-databases"
test_database_directory.mkdir(parents=True, exist_ok=True)
test_database_name = f"careos-pytest-{os.getpid()}-{uuid4().hex}.db"
test_storage = Path(tempfile.gettempdir()) / f"careos-pytest-storage-{os.getpid()}"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///./.e2e-databases/{test_database_name}"
os.environ.setdefault("STORAGE_LOCAL_ROOT", str(test_storage))
os.environ.setdefault("OIDC_ISSUER_URL", "https://issuer.example.com")
os.environ.setdefault("OIDC_CLIENT_ID", "careos-test-client")
os.environ.setdefault("OIDC_CLIENT_SECRET", "careos-test-secret")
os.environ.setdefault("APP_URL", "http://localhost:5173")


def pytest_pyfunc_call(pyfuncitem):
    if inspect.iscoroutinefunction(pyfuncitem.obj):
        funcargs = pyfuncitem.funcargs
        testargs = {arg: funcargs[arg] for arg in pyfuncitem._fixtureinfo.argnames}
        asyncio.run(pyfuncitem.obj(**testargs))
        return True
    return None
