#!/usr/bin/env python3
"""
Utility script to generate admin password hash from ADMIN_PASSWORD in .env
Uses PBKDF2 (built-in, no external dependencies)
"""

import hashlib
import os
import sys
import base64
from pathlib import Path

def hash_password(password: str, salt: str = None) -> str:
    """Generate PBKDF2 hash with salt"""
    if salt is None:
        salt = os.urandom(32).hex()
    else:
        salt = salt.hex() if isinstance(salt, bytes) else salt
    
    # Use PBKDF2 with SHA256
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        bytes.fromhex(salt),
        100000  # iterations
    )
    
    # Return format: salt$hash
    return f"{salt}${base64.b64encode(pwd_hash).decode()}"

def read_env():
    """Read .env file and return as dict"""
    env_path = Path(__file__).parent.parent / '.env'
    env = {}
    if not env_path.exists():
        print(f"Error: {env_path} not found")
        return None
    
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip()
    return env

def write_env(env):
    """Write env dict back to .env file"""
    env_path = Path(__file__).parent.parent / '.env'
    with open(env_path, 'w') as f:
        for key, value in env.items():
            f.write(f"{key}={value}\n")

if __name__ == "__main__":
    env = read_env()
    if not env:
        sys.exit(1)
    
    password = env.get('ADMIN_PASSWORD', '').strip()
    
    if not password:
        print("Error: ADMIN_PASSWORD not set in .env")
        sys.exit(1)
    
    # Generate hash using PBKDF2
    password_hash = hash_password(password)
    
    # Update env
    env['ADMIN_PASSWORD_HASH'] = password_hash
    
    # Write back to .env
    write_env(env)
    
    print(f"✅ Password hash generated successfully!")
    print(f"Password: {password}")
    print(f"Hash: {password_hash}")
    print(f"Updated .env file")

