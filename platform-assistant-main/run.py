import sys
import uvicorn
from backend.config import HOST, PORT

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

if __name__ == "__main__":
    print(f"Starting CareOS Platform Assistant Server on http://{HOST}:{PORT}")
    print(f"Open in browser: http://{HOST}:{PORT}/")
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
