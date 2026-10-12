import asyncio
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

root = Path(__file__).resolve().parent
os.chdir(root)
print("CWD=", os.getcwd())

temp_db = Path(tempfile.gettempdir()) / "careos_verify_db.db"
try:
    temp_db.unlink()
except FileNotFoundError:
    pass
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_db.as_posix()}"

from app.db import init_db
asyncio.run(init_db())
conn = sqlite3.connect(temp_db)
print("TABLES=", conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall())
conn.close()

import pytest
rc = pytest.main(["-q", "tests/test_auth.py"])
print("PYTEST_EXIT", rc)
sys.exit(rc)
