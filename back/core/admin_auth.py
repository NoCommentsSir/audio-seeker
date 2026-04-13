"""
Simple admin authentication service.
Stores admin password in environment variables.
"""

import os
import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext

# Config
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 30  # 30 days
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", None)


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    if hashed_password is None:
        return False
    return pwd_context.verify(plain_password, hashed_password)


def create_admin_token(admin_id: str = "admin") -> str:
    """Create JWT token for admin."""
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": admin_id,
        "is_admin": True,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_admin_token(token: str) -> dict | None:
    """Verify JWT token and return payload or None if invalid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("is_admin") and payload.get("sub") == "admin":
            return payload
        return None
    except jwt.InvalidTokenError:
        return None


def authenticate_admin(password: str) -> bool:
    """Authenticate admin with password."""
    if ADMIN_PASSWORD_HASH is None:
        # If no password hash set, allow any password (development mode)
        return True
    return verify_password(password, ADMIN_PASSWORD_HASH)
