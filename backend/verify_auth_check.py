import asyncio
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

root = Path(__file__).resolve().parent
os.chdir(root)

temp_db = Path(tempfile.gettempdir()) / "careos_verify_auth_check.db"
for path in [temp_db, root / "verification_result.txt"]:
    try:
        Path(path).unlink()
    except FileNotFoundError:
        pass

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_db.as_posix()}"

from app.db import init_db, engine

async def main():
    await init_db()
    conn = sqlite3.connect(temp_db)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    conn.close()
    print("TABLES=" + repr(tables))
    await engine.dispose()

asyncio.run(main())

import pytest
rc = pytest.main(["-q", "tests/test_auth.py", "--disable-warnings"])
with open(root / "verification_result.txt", "w", encoding="utf-8") as f:
    f.write(f"PYTEST_EXIT={rc}\n")
print(f"PYTEST_EXIT={rc}")
sys.exit(rc)
