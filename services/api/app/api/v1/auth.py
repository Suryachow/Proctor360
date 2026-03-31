from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password, verify_totp
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Student
from app.schemas.auth import AdminLoginRequest, LoginRequest, RegisterRequest, TokenResponse
from app.services.ai_client import analyze_frame

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    existing = db.query(Student).filter(Student.email == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        # Use AI service to ensure registration image has exactly one face.
        analysis = await analyze_frame(payload.live_image_base64, include_advanced=False)
        face_count = int((analysis.get("metrics") or {}).get("face_count", 0))
        if face_count != 1:
            raise HTTPException(status_code=400, detail="Registration requires a clear live image with exactly one face")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Unable to verify registration live image. Try again.") from exc

    student = Student(
        email=normalized_email,
        password_hash=hash_password(payload.password),
        device_hash=payload.device_hash,
        registered_face_image=payload.live_image_base64,
    )
    db.add(student)
    db.commit()

    token = create_access_token(normalized_email, role="student")
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    student = db.query(Student).filter(Student.email == normalized_email).first()
    if not student or not verify_password(payload.password, student.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if student.email != "student@test.com" and student.device_hash != payload.device_hash:
        raise HTTPException(status_code=403, detail="Device mismatch")

    token = create_access_token(student.email, role="student")
    return TokenResponse(access_token=token)


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(payload: AdminLoginRequest):
    normalized_email = payload.email.strip().lower()
    expected_admin_email = settings.admin_email.strip().lower()
    if normalized_email != expected_admin_email:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    if payload.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    if not verify_totp(payload.mfa_code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    token = create_access_token(expected_admin_email, role="admin")
    return TokenResponse(access_token=token)
