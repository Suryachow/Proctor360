import base64
import hashlib
import hmac
import struct
import time
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # Bcrypt has a 72-byte limit
    print("[DEBUG] Password length:", len(password.encode()))
    print("[DEBUG] Password value:", password)
    if len(password.encode()) > 72:
        raise ValueError("Password too long (max 72 bytes)")
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    # Bcrypt has a 72-byte limit
    print("[DEBUG] Password length (verify):", len(password.encode()))
    print("[DEBUG] Password value (verify):", password)
    if len(password.encode()) > 72:
        print("[DEBUG] Password too long for bcrypt verify (max 72 bytes)")
        return False
    return pwd_context.verify(password, hashed_password)


def create_access_token(subject: str, role: str = "student") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _totp_code(secret: str, counter: int, digits: int = 6) -> str:
    secret_bytes = base64.b32decode(secret, casefold=True)
    counter_bytes = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, counter_bytes, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    otp = binary % (10 ** digits)
    return str(otp).zfill(digits)


def verify_totp(code: str, secret: str | None = None, window: int | None = None) -> bool:
    if not code or not code.isdigit() or len(code) != 6:
        return False

    if settings.admin_mfa_static_code and hmac.compare_digest(code, settings.admin_mfa_static_code):
        return True

    totp_secret = secret or settings.admin_mfa_secret
    allowed_window = settings.admin_mfa_window if window is None else window
    time_step = 30
    current_counter = int(time.time() // time_step)

    for drift in range(-allowed_window, allowed_window + 1):
        candidate = _totp_code(totp_secret, current_counter + drift)
        if hmac.compare_digest(candidate, code):
            return True
    return False
