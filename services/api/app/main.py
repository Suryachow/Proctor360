import logging

from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.deps import decode_access_token
from app.core.config import settings
from app.api.v1 import admin, auth, compliance, enterprise, exam
from app.db.session import Base, SessionLocal, engine
from app.models.entities import AuditLog, Tenant, Student
from app.core.security import hash_password
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

app = FastAPI(title="Proctor360 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(exam.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(compliance.router, prefix="/api/v1")
app.include_router(enterprise.router, prefix="/api/v1")


@app.on_event("startup")
def ensure_default_tenant():
    try:
        Base.metadata.create_all(bind=engine)

        db = SessionLocal()
        try:
            # Seed tenant
            existing_tenant = db.query(Tenant).filter(Tenant.slug == "default").first()
            if not existing_tenant:
                db.add(Tenant(slug="default", name="Default Tenant", is_active=True))
                db.commit()

            # Seed demo student
            email = "student@test.com"
            existing_student = db.query(Student).filter(Student.email == email).first()
            if not existing_student:
                db.add(Student(
                    email=email,
                    password_hash=hash_password("Student123!"),
                    device_hash="DEMO_DEVICE",
                    registered_face_image="placeholder"
                ))
                db.commit()
        finally:
            db.close()

        # Ensure schema compatibility for environments with existing exam tables.
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE exams ADD COLUMN IF NOT EXISTS otp_plain VARCHAR(20)"))
            conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS registered_face_image TEXT"))
            conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255)"))
            conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS registered_face_image TEXT"))
            conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS face_similarity_history TEXT DEFAULT '[]'"))
    except Exception as exc:
        logger.warning("Database startup initialization skipped: %s", exc)


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    response = await call_next(request)

    actor_email = "anonymous"
    actor_role = "anonymous"
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_access_token(token)
            actor_email = payload.get("sub", "anonymous")
            actor_role = payload.get("role", "unknown")
        except Exception:
            actor_email = "invalid_token"
            actor_role = "unknown"

    db = SessionLocal()
    try:
        entry = AuditLog(
            actor_email=actor_email,
            actor_role=actor_role,
            action=request.method,
            resource=request.url.path,
            status_code=response.status_code,
            ip_address=(request.client.host if request.client else ""),
            user_agent=request.headers.get("user-agent", "")[:255],
        )
        db.add(entry)
        db.commit()
    finally:
        db.close()

    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/admin")
async def admin_ws(websocket: WebSocket, token: str | None = Query(default=None)):
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = decode_access_token(token)
    except Exception:
        await websocket.close(code=1008)
        return

    expected_admin_email = settings.admin_email.strip().lower()
    token_subject = str(payload.get("sub") or "").strip().lower()
    if payload.get("role") != "admin" or token_subject != expected_admin_email:
        await websocket.close(code=1008)
        return

    await ws_manager.connect("admin", websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect("admin", websocket)
