import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import asyncio
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .api import router
from .config import get_settings
from .db import init_db
from .worker import run_email_worker

settings = get_settings()
_auth_rate_limit_state: dict[str, list[float]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    worker_task = asyncio.create_task(run_email_worker(2.0))
    yield
    worker_task.cancel()
    try:
        await worker_task
    except (asyncio.CancelledError, Exception):
        pass


app = FastAPI(
    title="CareOS Clinical API",
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    started = time.perf_counter()
    if settings.is_production and request.method == "POST" and request.url.path.startswith(f"{settings.api_prefix}/auth/"):
        now = time.monotonic()
        client_key = request.client.host if request.client else "unknown"
        recent = [timestamp for timestamp in _auth_rate_limit_state.get(client_key, []) if now - timestamp < settings.auth_rate_limit_window_seconds]
        if len(recent) >= settings.auth_rate_limit_requests:
            return JSONResponse(status_code=429, content={"detail": "Too many authentication attempts"}, headers={"Retry-After": str(settings.auth_rate_limit_window_seconds)})
        recent.append(now)
        _auth_rate_limit_state[client_key] = recent
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith(settings.api_prefix) else response.headers.get("Cache-Control", "")
    response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - started) * 1000:.2f}"
    return response


@app.exception_handler(Exception)
async def unhandled_exception(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
async def root():
    return HTMLResponse(
        """<!DOCTYPE html>
        <html lang="ar" dir="rtl">
            <head>
                <meta charset="utf-8" />
                <title>CareOS Clinical API</title>
                <meta http-equiv="refresh" content="2;url=http://localhost:5173/" />
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: grid; place-items: center; min-height: 90vh; margin: 0; background: #f0f7f5;">
                <div style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(14, 165, 142, 0.12); max-width: 520px; text-align: center; border: 1px solid #d8e8e4;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: #e6f6f3; color: #0e8774; display: inline-grid; place-items: center; font-size: 24px; margin-bottom: 16px;">🏥</div>
                    <h2 style="color: #0b3432; margin: 0 0 10px;">CareOS Backend (الخلفية البرمجية)</h2>
                    <p style="color: #51635d; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                        هذا المنفذ (8003) مخصص لواجهة برمجة التطبيقات (API).<br>
                        <strong>واجهة النظام الرئيسية تعمل على المنفذ 5173.</strong><br>
                        <small style="color: #888;">جاري توجيهك تلقائياً خلال ثانيتين...</small>
                    </p>
                    <a href="http://localhost:5173/" style="display: inline-block; background: linear-gradient(135deg, #0e8774, #0ca68c); color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 15px; box-shadow: 0 4px 14px rgba(14, 165, 142, 0.3);">
                        الانتقال إلى واجهة CareOS فوراً ↗
                    </a>
                </div>
            </body>
        </html>"""
    )



@app.post("/v1/voice/tts")
async def root_voice_tts(request: Request):
    from .api import assistant_tts, AssistantTTSInput
    payload = await request.json()
    return await assistant_tts(AssistantTTSInput(**payload), request)
