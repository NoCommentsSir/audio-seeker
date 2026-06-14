"""
Simple admin authentication service.
Uses PBKDF2 for password hashing (built-in, no external bcrypt dependency).
"""

import os
import jwt
import hashlib
import base64
from datetime import datetime, timedelta

# Config
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 30  # 30 days
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", None)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against PBKDF2 hash.
    Format: salt$hash (hex salt, base64 hash)
    """
    
    print(plain_password, hashed_password)
    if hashed_password is None:
        return False
    
    try:
        salt_hex, stored_hash_b64 = hashed_password.split(':')
        # Compute hash with stored salt
        pwd_hash = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            bytes.fromhex(salt_hex),
            100000
        )
        computed_hash_b64 = base64.b64encode(pwd_hash).decode()
        print(computed_hash_b64, plain_password, hashed_password)
        return computed_hash_b64 == stored_hash_b64
    except:
        return False


def create_admin_token(admin_id: str = "admin") -> str:
    """Create JWT token for admin."""
    expire = datetime.now() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
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
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Authenticating password: '{password}'")
    logger.info(f"ADMIN_PASSWORD_HASH: '{ADMIN_PASSWORD_HASH}'")
    
    if ADMIN_PASSWORD_HASH is None:
        logger.warning("ADMIN_PASSWORD_HASH is None - allowing any password")
        return True
    
    result = verify_password(password, ADMIN_PASSWORD_HASH)
    logger.info(f"Password verification result: {result}")
    return result
