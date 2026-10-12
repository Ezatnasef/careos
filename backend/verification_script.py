import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
os.chdir(root)

temp_db = Path(tempfile.gettempdir()) / "careos_verify_script.db"
try:
    temp_db.unlink()
except FileNotFoundError:
    pass

env = os.environ.copy()
env["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_db.as_posix()}"

cmd = [sys.executable, "-m", "pytest", "-q", "tests/test_auth.py", "--disable-warnings"]
res = subprocess.run(cmd, cwd=str(root), env=env, capture_output=True, text=True)

with open(root / "verification_output.txt", "w", encoding="utf-8") as f:
    f.write(f"RETURN_CODE: {res.returncode}\n")
    f.write("STDOUT:\n")
    f.write(res.stdout)
    f.write("\nSTDERR:\n")
    f.write(res.stderr)

print(f"DONE: {res.returncode}")
sys.exit(res.returncode)
