import asyncio
import inspect
import os
import tempfile
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
test_database = Path(tempfile.gettempdir()) / f"careos-pytest-{os.getpid()}.db"
test_storage = Path(tempfile.gettempdir()) / f"careos-pytest-storage-{os.getpid()}"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{test_database.as_posix()}"
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
