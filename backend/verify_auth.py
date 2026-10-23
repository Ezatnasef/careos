import os
from pathlib import Path
import sys
import tempfile

root = Path(__file__).resolve().parent
os.chdir(root)
result_path = root / "verification_result.txt"

temp_db = Path(tempfile.gettempdir()) / "careos_verify_auth.db"
try:
    temp_db.unlink()
except FileNotFoundError:
    pass
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_db.as_posix()}"

print("START_VERIFY", flush=True)

import pytest
rc = pytest.main(["-q", "tests/test_auth.py", "--disable-warnings"])

with open(result_path, "w", encoding="utf-8") as f:
    f.write(f"PYTEST_EXIT={rc}\n")

print(f"PYTEST_EXIT={rc}", flush=True)
sys.exit(rc)
